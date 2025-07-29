import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Res,
  Req,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuditLogger } from '../../../common/logging/audit-logger.service';
import { CrossDeviceUidaiProvider } from '../providers/cross-device-uidai.provider';
import { CrossDeviceSessionService } from '../services/cross-device-session.service';
import { generateDeviceId } from '../utils/session.util';
import { v4 as uuidv4 } from 'uuid';

interface AuthenticateRequest {
  uid: string;
  otp: string;
  deviceId?: string;
}

interface CreateSessionRequest {
  uid: string;
}

@Controller('auth/cross-device')
export class CrossDeviceController {
  constructor(
    private readonly crossDeviceUidaiProvider: CrossDeviceUidaiProvider,
    private readonly crossDeviceSessionService: CrossDeviceSessionService,
    private readonly logger: AuditLogger,
  ) {}

  /**
   * Initiate cross-device authentication with QR code generation
   */
  @Get('initiate')
  async initiateAuth(
    @Query('uid') uid: string,
    @Query('redirectUri') redirectUri: string,
    @Req() req: Request,
  ) {
    const correlationId = uuidv4();
    
    if (!uid) {
      this.logger.warnWithContext(correlationId, 'CROSS_DEVICE_MISSING_UID', { 
        ip: req.ip,
        userAgent: req.get('User-Agent') 
      });
      return { error: 'UID is required', code: 'MISSING_UID' };
    }

    if (!redirectUri) {
      redirectUri = 'http://localhost:3002/callback';
    }

    try {
      this.logger.audit(correlationId, 'CROSS_DEVICE_INITIATE_REQUEST', {
        uid: this.maskUid(uid),
        redirectUri,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      const result = await this.crossDeviceUidaiProvider.initiateAuth(
        uid,
        redirectUri,
        correlationId
      );

      this.logger.audit(correlationId, 'CROSS_DEVICE_INITIATE_SUCCESS', {
        sessionId: result.sessionId,
        hasUidaiOtp: !!result.uidaiOtpTxn,
        qrAuthUrl: result.qrData.authUrl,
      });

      return {
        success: true,
        sessionId: result.sessionId,
        qrData: result.qrData,
        hasUidaiOtp: !!result.uidaiOtpTxn,
        websocketUrl: `ws://localhost:3002`,
        instructions: {
          step1: 'Scan the QR code with your mobile device',
          step2: 'Enter the OTP sent to your registered mobile number',
          step3: 'Wait for authentication completion on this device',
        },
        crossDeviceMiddleware: true,
      };

    } catch (error) {
      this.logger.errorWithContext(correlationId, 'CROSS_DEVICE_INITIATE_FAILED', {
        uid: this.maskUid(uid),
        error: error.message,
        stack: error.stack,
      });

      return {
        success: false,
        error: error.message,
        code: 'INITIATION_FAILED',
      };
    }
  }

  /**
   * Mobile device authentication endpoint (accessed via QR code scan)
   */
  @Get('authenticate/:sessionId')
  async showAuthenticationPage(@Param('sessionId') sessionId: string, @Res() res: Response) {
    const correlationId = uuidv4();
    
    try {
      const session = this.crossDeviceSessionService.getSession(sessionId);
      if (!session) {
        this.logger.warnWithContext(correlationId, 'CROSS_DEVICE_SESSION_NOT_FOUND_FOR_AUTH', { sessionId });
        return res.status(404).send(`
          <html>
            <head><title>Session Not Found</title></head>
            <body>
              <h1>Authentication Session Not Found</h1>
              <p>The session has expired or is invalid.</p>
              <p>Session ID: ${sessionId}</p>
            </body>
          </html>
        `);
      }

      this.logger.audit(correlationId, 'CROSS_DEVICE_AUTH_PAGE_VIEWED', {
        sessionId,
        uid: this.maskUid(session.uid),
        status: session.status,
      });

      // Serve authentication form
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Cross-Device Aadhaar Authentication</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 20px; }
            .form-group { margin-bottom: 15px; }
            label { display: block; margin-bottom: 5px; font-weight: bold; }
            input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px; }
            button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer; }
            button:hover { background: #0056b3; }
            .status { padding: 10px; border-radius: 4px; margin-bottom: 15px; }
            .status.pending { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; }
            .status.success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
            .status.error { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
            .loading { display: none; text-align: center; }
            .session-info { background: #e9ecef; padding: 10px; border-radius: 4px; margin-bottom: 15px; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>🔐 Aadhaar Authentication</h2>
              <p>Cross-Device Middleware</p>
            </div>
            
            <div class="session-info">
              <strong>Session:</strong> ${sessionId}<br>
              <strong>UID:</strong> ****${session.uid.slice(-4)}<br>
              <strong>Status:</strong> ${session.status}<br>
              <strong>Created:</strong> ${session.createdAt.toLocaleString()}
            </div>

            <div id="status" class="status pending">
              ${session.uidaiOtpTxn ? 
                '✓ OTP sent to your registered mobile number via UIDAI' : 
                '⚠ Using cross-device coordination mode'
              }
            </div>

            <form id="authForm">
              <div class="form-group">
                <label for="otp">Enter OTP:</label>
                <input type="text" id="otp" name="otp" placeholder="6-digit OTP" maxlength="6" required>
              </div>
              <button type="submit">Authenticate</button>
            </form>

            <div id="loading" class="loading">
              <p>🔄 Authenticating with UIDAI...</p>
            </div>

            <script>
              document.getElementById('authForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const otp = document.getElementById('otp').value;
                const statusDiv = document.getElementById('status');
                const loadingDiv = document.getElementById('loading');
                const form = document.getElementById('authForm');
                
                if (!otp || otp.length !== 6) {
                  statusDiv.className = 'status error';
                  statusDiv.textContent = 'Please enter a valid 6-digit OTP';
                  return;
                }

                // Show loading state
                form.style.display = 'none';
                loadingDiv.style.display = 'block';
                statusDiv.className = 'status pending';
                statusDiv.textContent = 'Authenticating with UIDAI sandbox...';

                try {
                  const response = await fetch('/auth/cross-device/authenticate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      sessionId: '${sessionId}',
                      otp: otp,
                      deviceId: 'mobile_' + Date.now()
                    })
                  });

                  const result = await response.json();
                  loadingDiv.style.display = 'none';

                  if (result.success) {
                    statusDiv.className = 'status success';
                    statusDiv.innerHTML = '✅ Authentication successful!<br>You can now close this page.';
                  } else {
                    statusDiv.className = 'status error';
                    statusDiv.textContent = 'Authentication failed: ' + (result.error || 'Unknown error');
                    form.style.display = 'block';
                  }
                } catch (error) {
                  loadingDiv.style.display = 'none';
                  form.style.display = 'block';
                  statusDiv.className = 'status error';
                  statusDiv.textContent = 'Network error: ' + error.message;
                }
              });
            </script>
          </div>
        </body>
        </html>
      `);

    } catch (error) {
      this.logger.errorWithContext(correlationId, 'CROSS_DEVICE_AUTH_PAGE_ERROR', {
        sessionId,
        error: error.message,
      });
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * Process authentication from mobile device
   */
  @Post('authenticate')
  @HttpCode(HttpStatus.OK)
  async authenticate(@Body() body: AuthenticateRequest) {
    const correlationId = uuidv4();
    const { sessionId, uid, otp, deviceId } = body as any;

    try {
      this.logger.audit(correlationId, 'CROSS_DEVICE_AUTHENTICATE_REQUEST', {
        sessionId,
        hasOtp: !!otp,
        deviceId,
      });

      const result = await this.crossDeviceUidaiProvider.completeAuth(
        sessionId,
        otp,
        deviceId,
        correlationId
      );

      return {
        success: result.success,
        sessionId: result.sessionId,
        uid: result.uid ? this.maskUid(result.uid) : undefined,
        claims: result.claims,
        crossDeviceMiddleware: true,
      };

    } catch (error) {
      this.logger.errorWithContext(correlationId, 'CROSS_DEVICE_AUTHENTICATE_FAILED', {
        sessionId,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
        sessionId,
      };
    }
  }

  /**
   * Create a mobile session for direct API usage
   */
  @Post('session/create')
  async createSession(@Body() body: CreateSessionRequest) {
    const correlationId = uuidv4();
    const { uid } = body;

    if (!uid) {
      return { error: 'UID is required', code: 'MISSING_UID' };
    }

    try {
      const result = await this.crossDeviceUidaiProvider.createMobileSession(uid, correlationId);
      
      this.logger.audit(correlationId, 'CROSS_DEVICE_MOBILE_SESSION_API_CREATED', {
        sessionId: result.sessionId,
        uid: this.maskUid(uid),
      });

      return {
        success: true,
        sessionId: result.sessionId,
        uid: this.maskUid(uid),
        crossDeviceMiddleware: true,
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get session status
   */
  @Get('session/:sessionId/status')
  async getSessionStatus(@Param('sessionId') sessionId: string) {
    const correlationId = uuidv4();
    
    try {
      const result = await this.crossDeviceUidaiProvider.getSessionStatus(sessionId);
      
      this.logger.audit(correlationId, 'CROSS_DEVICE_SESSION_STATUS_REQUEST', {
        sessionId,
        status: result.status,
      });

      return result;

    } catch (error) {
      return {
        sessionId,
        status: 'error',
        error: error.message,
      };
    }
  }

  /**
   * Get all active sessions (debug endpoint)
   */
  @Get('sessions/active')
  async getActiveSessions() {
    const correlationId = uuidv4();
    
    try {
      const sessions = this.crossDeviceSessionService.getActiveSessions();
      
      this.logger.audit(correlationId, 'CROSS_DEVICE_ACTIVE_SESSIONS_REQUEST', {
        count: sessions.length,
      });

      return {
        success: true,
        count: sessions.length,
        sessions: sessions.map(session => ({
          sessionId: session.sessionId,
          uid: this.maskUid(session.uid),
          status: session.status,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          hasOtpTxn: !!session.uidaiOtpTxn,
          hasAuthResult: !!session.authenticationResult,
        })),
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private maskUid(uid: string): string {
    if (!uid || uid.length < 4) return '****';
    return '*'.repeat(uid.length - 4) + uid.slice(-4);
  }
} 