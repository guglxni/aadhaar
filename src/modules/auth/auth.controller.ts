import { Controller, Get, Post, Query, Req, Res, Body, HttpException, HttpStatus, Inject, Param } from '@nestjs/common';
import { AadhaarProvider } from './providers/aadhaar.provider';
import { AuthService } from './services/auth.service';
import { Response, Request } from 'express';
import { AuditLogger } from '../../common/logging/audit-logger.service';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

// Augment Express Request to include our custom property
interface RequestWithCorrelationId extends Request {
  correlationId: string;
}

// In-memory session storage (in production, use Redis or database)
interface VerificationSession {
  sessionId: string;
  uid: string;
  correlationId: string;
  status: 'pending' | 'completed' | 'failed' | 'expired';
  createdAt: Date;
  completedAt?: Date;
  userData?: any;
  method?: string;
  reason?: string;
}

@Controller('auth')
export class AuthController {
  private sessions: Map<string, VerificationSession> = new Map();

  constructor(
    private readonly aadhaarProvider: AadhaarProvider,
    private readonly authService: AuthService,
    private readonly logger: AuditLogger,
    private readonly configService: ConfigService,
  ) {
    // Clean up expired sessions every 5 minutes
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
  }

  private cleanupExpiredSessions() {
    const now = new Date();
    const expiredSessions: string[] = [];
    
    for (const [sessionId, session] of this.sessions.entries()) {
      const sessionAge = now.getTime() - session.createdAt.getTime();
      if (sessionAge > 5 * 60 * 1000) { // 5 minutes
        expiredSessions.push(sessionId);
      }
    }
    
    expiredSessions.forEach(sessionId => {
      this.sessions.delete(sessionId);
    });
    
    if (expiredSessions.length > 0) {
      this.logger.audit('system', 'SESSION_CLEANUP', { expiredSessions: expiredSessions.length });
    }
  }

  @Get('qr')
  async getQrCode(
    @Req() req: RequestWithCorrelationId,
    @Query('redirectUri') redirectUri: string,
    @Query('uid') uid: string,
    @Res() res: Response,
  ) {
    const correlationId = req.correlationId;
    this.logger.audit(correlationId, 'AUTH_QR_INITIATED', { uid, redirectUri });

    try {
      if (!redirectUri || !uid) {
        throw new HttpException('redirectUri and uid query parameters are required', HttpStatus.BAD_REQUEST);
      }
      
      // Implement retry logic with exponential backoff for UIDAI service outages
      const maxRetries = 3;
      const baseDelay = 30000; // 30 seconds
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
      const qrData = await this.aadhaarProvider.initiateAuth(redirectUri, 'some-state', uid, correlationId);
          
                     this.logger.audit(correlationId, 'QR_CODE_GENERATED_SUCCESS', { 
             uid: uid.substring(0, 4) + '****' + uid.substring(uid.length - 4),
             txnId: qrData.txnId,
             attempt: attempt + 1,
             correlationId 
           });
          
      return res.json(qrData);
        } catch (error) {
                     // Check if it's a UIDAI service unavailable error (998/A202)
           if (error instanceof HttpException && 
               error.getStatus() === HttpStatus.SERVICE_UNAVAILABLE && 
               error.message.includes('998/A202') && 
               attempt < maxRetries) {
            
            const retryDelay = baseDelay * Math.pow(2, attempt); // Exponential backoff: 30s, 60s, 120s
            
            this.logger.warn(correlationId, 'RETRYING_AFTER_UIDAI_OUTAGE', {
              attempt: attempt + 1,
              maxRetries,
              retryDelay,
              nextRetryIn: `${retryDelay / 1000} seconds`,
              error: error.message,
              correlationId
            });
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
          
          // If it's not a retryable error or we've exhausted retries, throw it
          throw error;
        }
      }
      
      // This should never be reached due to the throw in the catch block
      throw new HttpException('Maximum retry attempts exceeded for UIDAI service', HttpStatus.SERVICE_UNAVAILABLE);
      
    } catch (error) {
             this.logger.errorWithContext(correlationId, 'AUTH_QR_FAILED', {
         error: error.message,
         uid: uid.substring(0, 4) + '****' + uid.substring(uid.length - 4),
         redirectUri,
         stack: error.stack,
         correlationId
       });
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(error.message || 'Failed to generate QR code', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('callback')
  async handleCallback(
    @Req() req: RequestWithCorrelationId,
    @Body() body: { uid: string; otp: string; txn: string; redirectUri: string; state: string },
    @Res() res: Response,
  ) {
    const { uid, otp, txn, redirectUri, state } = body;
    const correlationId = req.correlationId;
    this.logger.audit(correlationId, 'AUTH_CALLBACK_RECEIVED', { uid, txn });

    try {
      const result = await this.aadhaarProvider.verifyAuth({ uid, otp, txn }, correlationId);

      this.logger.audit(correlationId, 'AUTH_VERIFICATION_SUCCESS', { uid, txn, sub: result.sub });

      // On success, generate a token (this part would call a real token service)
      const idToken = `fake-jwt-for-${result.sub}`; 

      const url = new URL(redirectUri);
      url.searchParams.set('idToken', idToken);
      url.searchParams.set('state', state);

      return res.redirect(url.toString());
    } catch (error) {
       this.logger.errorWithContext(correlationId, 'AUTH_VERIFICATION_FAILED', { error: error.message, uid, txn }, error.stack);
       if (error instanceof HttpException) {
        throw error;
       }
       // Return a generic error to the client
       throw new HttpException('Authentication failed', HttpStatus.UNAUTHORIZED);
    }
  }

  // Cross-Device Verification Endpoints

  @Get('verify/:sessionId')
  async getVerificationPage(
    @Param('sessionId') sessionId: string,
    @Res() res: Response,
  ) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        // Serve a simple error page
        return res.status(404).send(`
          <html>
            <head><title>Session Not Found</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
              <h1>Verification Session Not Found</h1>
              <p>This verification link may have expired or is invalid.</p>
            </body>
          </html>
        `);
      }

      // Serve the verification page
      const verificationPagePath = path.join(process.cwd(), 'public', 'auth', 'verify', 'index.html');
      if (fs.existsSync(verificationPagePath)) {
        return res.sendFile(verificationPagePath);
      } else {
        throw new HttpException('Verification page not found', HttpStatus.INTERNAL_SERVER_ERROR);
      }
    } catch (error) {
      this.logger.errorWithContext('system', 'VERIFICATION_PAGE_ERROR', { error: error.message, sessionId }, error.stack);
      return res.status(500).send(`
        <html>
          <head><title>Error</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
            <h1>Verification Error</h1>
            <p>Unable to load verification page. Please try again.</p>
          </body>
        </html>
      `);
    }
  }

  @Get('session/:sessionId')
  async getSession(
    @Param('sessionId') sessionId: string,
    @Req() req: RequestWithCorrelationId,
  ) {
    const correlationId = req.correlationId;
    this.logger.audit(correlationId, 'SESSION_LOOKUP', { sessionId });

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    // Check if session has expired
    const sessionAge = new Date().getTime() - session.createdAt.getTime();
    if (sessionAge > 5 * 60 * 1000) { // 5 minutes
      session.status = 'expired';
      this.sessions.delete(sessionId);
      throw new HttpException('Session expired', HttpStatus.GONE);
    }

    return {
      sessionId: session.sessionId,
      uid: session.uid,
      status: session.status,
      createdAt: session.createdAt
    };
  }

  @Get('session/:sessionId/status')
  async getSessionStatus(
    @Param('sessionId') sessionId: string,
    @Req() req: RequestWithCorrelationId,
  ) {
    const correlationId = req.correlationId;
    this.logger.audit(correlationId, 'SESSION_STATUS_CHECK', { sessionId });

    const session = this.sessions.get(sessionId);
    if (!session) {
      return { status: 'expired' };
    }

    // Check if session has expired
    const sessionAge = new Date().getTime() - session.createdAt.getTime();
    if (sessionAge > 5 * 60 * 1000) { // 5 minutes
      this.sessions.delete(sessionId);
      return { status: 'expired' };
    }

    return {
      status: session.status,
      userData: session.userData,
      method: session.method,
      completedAt: session.completedAt,
      reason: session.reason
    };
  }

  @Post('session/:sessionId/complete')
  async completeVerification(
    @Param('sessionId') sessionId: string,
    @Body() body: { method: string; userData?: any },
    @Req() req: RequestWithCorrelationId,
  ) {
    const correlationId = req.correlationId;
    this.logger.audit(correlationId, 'SESSION_COMPLETION_ATTEMPT', { sessionId, method: body.method });

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    // Check if session has expired
    const sessionAge = new Date().getTime() - session.createdAt.getTime();
    if (sessionAge > 5 * 60 * 1000) { // 5 minutes
      this.sessions.delete(sessionId);
      throw new HttpException('Session expired', HttpStatus.GONE);
    }

    if (session.status !== 'pending') {
      throw new HttpException('Session already completed', HttpStatus.BAD_REQUEST);
    }

    try {
      // Call the AadhaarProvider to perform a real verification against the UIDAI sandbox
      const verificationResult = await this.aadhaarProvider.verifyAuth(
        {
          uid: session.uid,
          // The official UIDAI sandbox uses a static OTP for testing
          otp: '123456',
          // In a real flow, this txn would come from an OTP request, here we simulate it
          txn: `sandbox-txn-${session.sessionId}`
        },
        correlationId
      );
      
      session.status = 'completed';
      session.completedAt = new Date();
      session.method = body.method;
      // Store the real data returned from the sandbox
      session.userData = verificationResult;

      this.logger.audit(correlationId, 'CROSS_DEVICE_VERIFICATION_SUCCESS', {
        sessionId,
        uid: session.uid,
        method: body.method
      });

      return {
        status: 'success',
        message: 'Verification completed successfully',
        userData: verificationResult
      };
    } catch (error) {
      session.status = 'failed';
      session.reason = error.message;
      
      this.logger.errorWithContext(correlationId, 'CROSS_DEVICE_VERIFICATION_FAILED', {
        error: error.message,
        sessionId,
        uid: session.uid
      }, error.stack);

      // Provide more specific error message
      const errorMessage = error.message || 'Unknown verification error';
      throw new HttpException(`Verification failed: ${errorMessage}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Helper method to create session (called from frontend)
  @Post('session/create')
  async createSession(
    @Body() body: { uid: string; correlationId?: string },
    @Req() req: RequestWithCorrelationId,
  ) {
    // Add extra defensive check to prevent crashes - log the raw body to diagnose issues
    this.logger.audit(req.correlationId, 'SESSION_CREATE_RAW_BODY', { 
      body, 
      bodyType: typeof body, 
      hasBody: !!body,
      isObject: body && typeof body === 'object'
    });

    // Ensure body is an object to prevent TypeError on destructuring
    const safeBody = (body && typeof body === 'object' ? body : {}) as { uid?: string; correlationId?: string };
    const correlationId = req.correlationId || safeBody?.correlationId;

    this.logger.audit(correlationId, 'INSPECT_BODY_ON_CREATE', { body, type: typeof body });

    // Safely get UID - explicitly check type to avoid errors
    const uid = typeof safeBody?.uid === 'string' ? safeBody.uid : undefined;

    if (!uid) {
      this.logger.errorWithContext(correlationId, 'INVALID_SESSION_CREATE_REQUEST', { 
        error: 'UID is missing from request body.', 
        receivedBody: body,
        safeBody
      });
      throw new HttpException('UID is required in the request body.', HttpStatus.BAD_REQUEST);
    }
    
    this.logger.audit(correlationId, 'CROSS_DEVICE_SESSION_CREATE_REQUEST', { uid });

    const sessionId = this.generateSessionId();
    const txn = `sandbox-txn-${sessionId}`;

    const session: VerificationSession = {
      sessionId,
      uid,
      correlationId: correlationId || 'system',
      status: 'pending',
      createdAt: new Date()
    };

    this.sessions.set(sessionId, session);

    this.logger.audit(correlationId, 'CROSS_DEVICE_SESSION_CREATED', {
      sessionId,
      uid
    });
      
    const serverBaseUrl = this.configService.get('SERVER_BASE_URL') || 'http://localhost:3002';

    return {
      sessionId,
      txnId: txn,
      verificationUrl: `${serverBaseUrl}/auth/verify/${sessionId}`
    };
  }

  private generateSessionId(): string {
    return 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
  }

  @Get('config/validate')
  async validateConfig(@Query('correlationId') correlationId?: string): Promise<any> {
    const requestCorrelationId = correlationId || uuidv4();
    
    this.logger.audit(requestCorrelationId, 'CONFIG_VALIDATION_REQUESTED', {});

    try {
      // Simple configuration validation
      return {
        message: 'Configuration validation endpoint',
        timestamp: new Date().toISOString(),
        correlationId: requestCorrelationId
      };
    } catch (error) {
      this.logger.errorWithContext(requestCorrelationId, 'CONFIG_VALIDATION_FAILED', {
        error: error.message,
        stack: error.stack,
      });
      throw new HttpException(
        `Configuration validation failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('debug/config')
  async debugConfig(): Promise<any> {
    // Temporary debug endpoint to check environment variables
    return {
      auaCode: process.env.AUA_CODE,
      auaLicenseKey: process.env.AUA_LICENSE_KEY?.substring(0, 10) + '...',
      asaLicenseKey: process.env.ASA_LICENSE_KEY?.substring(0, 10) + '...',
      uidaiBaseUrl: process.env.UIDAI_BASE_URL,
      uidaiOtpUrl: process.env.UIDAI_STAGING_OTP_URL,
      uidaiAuthUrl: process.env.UIDAI_STAGING_AUTH_URL,
      apiVersion: process.env.UIDAI_API_VERSION,
      serverBaseUrl: process.env.SERVER_BASE_URL,
      nodeEnv: process.env.NODE_ENV,
    };
  }

  @Get('test/connection')
  async testConnection(@Req() req: RequestWithCorrelationId) {
    const correlationId = req.correlationId;
    this.logger.audit(correlationId, 'TEST_CONNECTION_REQUEST', {});
    
    try {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        message: 'Connection to auth server is working'
      };
    } catch (error) {
      this.logger.errorWithContext(correlationId, 'TEST_CONNECTION_FAILED', { error: error.message });
      throw new HttpException('Connection test failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('test/certificates')
  async testCertificates(@Req() req: RequestWithCorrelationId) {
    const correlationId = req.correlationId;
    this.logger.audit(correlationId, 'TEST_CERTIFICATES_REQUEST', {});
    
    try {
      // Check if we can access the certificates
      const certStatus = await this.aadhaarProvider.validateCertificates(correlationId);
      
      return {
        valid: certStatus.valid,
        details: certStatus.details,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.errorWithContext(correlationId, 'TEST_CERTIFICATES_FAILED', { error: error.message });
      throw new HttpException('Certificate validation failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('test/load')
  async testLoad(@Req() req: RequestWithCorrelationId) {
    const correlationId = req.correlationId;
    this.logger.audit(correlationId, 'TEST_LOAD_REQUEST', {});
    
    // Simulate some load by returning a large response
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: 'Load test endpoint is working',
      load: {
        cpu: Math.random() * 100,
        memory: Math.random() * 100,
        requestsPerSecond: Math.floor(Math.random() * 1000)
      }
    };
  }

  /**
   * Retrieve user data from UIDAI after authentication
   */
  @Post('data/retrieve')
  async retrieveUserData(
    @Body() body: { 
      uid: string; 
      txn: string; 
      otp: string;
      includePhoto?: boolean;
      includeAddress?: boolean;
      includeBio?: boolean;
    },
    @Req() req: Request,
  ) {
    const correlationId = uuidv4();
    const { uid, txn, otp, includePhoto, includeAddress, includeBio } = body;

    this.logger.audit(correlationId, 'DATA_RETRIEVAL_REQUEST', {
      uid: uid ? uid.replace(/\d/g, '*').substring(0, 8) + '****' : 'undefined',
      txn,
      includePhoto: !!includePhoto,
      includeAddress: !!includeAddress,
      includeBio: !!includeBio,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    try {
      if (!uid || !txn || !otp) {
        throw new HttpException('Missing required parameters: uid, txn, otp', HttpStatus.BAD_REQUEST);
      }

      const result = await this.aadhaarProvider.retrieveUserData({
        uid,
        txn,
        otp,
        includePhoto: includePhoto || false,
        includeAddress: includeAddress !== false, // default to true
        includeBio: includeBio || false
      }, correlationId);

      this.logger.audit(correlationId, 'DATA_RETRIEVAL_SUCCESS', {
        success: result.success,
        source: result.source,
        hasData: !!result.data
      });

      return {
        success: result.success,
        data: result.data,
        source: result.source,
        timestamp: new Date().toISOString(),
        correlationId
      };

    } catch (error) {
      this.logger.errorWithContext(correlationId, 'DATA_RETRIEVAL_FAILED', {
        error: error.message,
        stack: error.stack,
        uid: uid ? uid.replace(/\d/g, '*').substring(0, 8) + '****' : 'undefined'
      });

      throw new HttpException(
        `Data retrieval failed: ${error.message}`,
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      this.logger.audit(correlationId, 'PERFORMANCE_METRIC', {
        method: 'POST',
        url: '/auth/data/retrieve',
        responseTime: `${Date.now() - parseInt(correlationId.split('-')[0], 16)}ms`
      });
    }
  }

  @Get('health/uidai')
  async uidaiHealthCheck(): Promise<any> {
    // Production health check - shows exact URLs being hit for debugging
    const testUid = '999999990019';
    const uid0 = testUid.charAt(0);
    const uid1 = testUid.charAt(1);
    
    const baseOtpUrl = this.configService.get<string>('UIDAI_STAGING_OTP_URL') || 'https://developer.uidai.gov.in/uidotp/2.5';
    const baseAuthUrl = this.configService.get<string>('UIDAI_STAGING_AUTH_URL') || 'https://developer.uidai.gov.in/authserver/2.5';
    const auaCode = this.configService.get<string>('AUA_CODE') || 'public';
    const asaLicenseKey = this.configService.get<string>('ASA_LICENSE_KEY');
    
    const otpApiUrl = `${baseOtpUrl}/${auaCode}/${uid0}/${uid1}/${encodeURIComponent(asaLicenseKey)}`;
    const authApiUrl = `${baseAuthUrl}/${auaCode}/${uid0}/${uid1}/${encodeURIComponent(asaLicenseKey)}`;
    
    return {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      uidai: {
        otpEndpoint: otpApiUrl,
        authEndpoint: authApiUrl,
        testUid: testUid,
        asaLicenseKey: asaLicenseKey?.substring(0, 15) + '...' || 'NOT_SET',
        auaLicenseKey: this.configService.get<string>('AUA_LICENSE_KEY')?.substring(0, 15) + '...' || 'NOT_SET',
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        debugXml: process.env.DEBUG_XML || 'disabled',
        xmlsec1Path: process.env.XMLSEC1_PATH || 'xmlsec1',
      },
      certificates: {
        auaP12Path: this.configService.get<string>('AUA_P12_PATH'),
        uidaiCertPath: this.configService.get<string>('UIDAI_CERT_PATH'),
      },
      testing: {
        curlOtp: `curl -v '${otpApiUrl}' -H 'Content-Type: application/xml' --data '@sample-otp.xml'`,
        curlAuth: `curl -v '${authApiUrl}' -H 'Content-Type: application/xml' --data '@sample-auth.xml'`,
        expectedFlow: 'Error 569 → Error 0 (ret="y") after proper XML signing'
      }
    };
  }
} 