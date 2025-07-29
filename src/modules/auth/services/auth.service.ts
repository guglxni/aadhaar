import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AadhaarProvider } from '../providers/aadhaar.provider';
import { AuditLogger } from '../../../common/logging/audit-logger.service';

export interface AuthInitiationRequest {
  uid: string;
  redirectUri: string;
  state?: string;
}

export interface AuthVerificationRequest {
  uid: string;
  otp: string;
  txn: string;
}

export interface AuthResult {
  success: boolean;
  sub?: string;
  name?: string;
  gender?: string;
  dob?: string;
  address?: string;
  email?: string;
  mobile?: string;
  photo?: string;
  txn?: string;
  errorMessage?: string;
  errorCode?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly aadhaarProvider: AadhaarProvider,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly auditLogger: AuditLogger,
  ) {}

  /**
   * Initiate Aadhaar authentication flow
   */
  async initiateAuth(request: AuthInitiationRequest, correlationId: string): Promise<any> {
    this.auditLogger.audit(correlationId, 'AUTH_INITIATION_STARTED', {
      uid: this.maskData(request.uid),
      redirectUri: request.redirectUri,
    });

    try {
      const result = await this.aadhaarProvider.initiateAuth(
        request.redirectUri,
        request.state || 'default-state',
        request.uid,
        correlationId
      );

      this.auditLogger.audit(correlationId, 'AUTH_INITIATION_SUCCESS', {
        uid: this.maskData(request.uid),
        txn: result.txn,
      });

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      this.auditLogger.errorWithContext(
        correlationId,
        'AUTH_INITIATION_FAILED',
        { 
          uid: this.maskData(request.uid), 
          error: error.message 
        },
        error.stack
      );

      return {
        success: false,
        errorMessage: error.message,
        errorCode: 'AUTH_INITIATION_ERROR',
      };
    }
  }

  /**
   * Verify Aadhaar authentication with OTP
   */
  async verifyAuth(request: AuthVerificationRequest, correlationId: string): Promise<AuthResult> {
    this.auditLogger.audit(correlationId, 'AUTH_VERIFICATION_STARTED', {
      uid: this.maskData(request.uid),
      txn: request.txn,
    });

    try {
      const result = await this.aadhaarProvider.verifyAuth(request, correlationId);

      this.auditLogger.audit(correlationId, 'AUTH_VERIFICATION_SUCCESS', {
        uid: this.maskData(request.uid),
        txn: request.txn,
        sub: result.sub,
      });

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      this.auditLogger.errorWithContext(
        correlationId,
        'AUTH_VERIFICATION_FAILED',
        { 
          uid: this.maskData(request.uid), 
          txn: request.txn,
          error: error.message 
        },
        error.stack
      );

      return {
        success: false,
        errorMessage: error.message,
        errorCode: 'AUTH_VERIFICATION_ERROR',
      };
    }
  }

  /**
   * Generate JWT token for authenticated user
   */
  async generateToken(authResult: AuthResult, correlationId: string): Promise<string> {
    try {
      const payload = {
        sub: authResult.sub,
        name: authResult.name,
        aud: this.configService.get('UIDAI_AUA_CODE'),
        iss: this.configService.get('SERVER_BASE_URL'),
        iat: Math.floor(Date.now() / 1000),
        correlationId,
      };

      const token = this.jwtService.sign(payload);

      this.auditLogger.audit(correlationId, 'TOKEN_GENERATED', {
        sub: authResult.sub,
        tokenLength: token.length,
      });

      return token;
    } catch (error) {
      this.auditLogger.errorWithContext(
        correlationId,
        'TOKEN_GENERATION_FAILED',
        { error: error.message },
        error.stack
      );
      throw error;
    }
  }

  /**
   * Health check for UIDAI connectivity
   */
  async healthCheck(correlationId: string): Promise<{ status: string; details: any }> {
    return { status: 'health check disabled', details: {} };
  }

  /**
   * Validate sandbox configuration
   */
  validateSandboxConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Updated required variables for 2025 UIDAI sandbox
    const requiredVars = [
      'AUA_LICENSE_KEY',
      'ASA_LICENSE_KEY',
      'AUA_CODE',
      'SUB_AUA_CODE',
      'UIDAI_STAGING_BASE_URL',
      'UIDAI_PUBLIC_CERT_PATH',
    ];

    for (const varName of requiredVars) {
      const value = this.configService.get(varName);
      if (!value) {
        errors.push(`Missing required environment variable: ${varName}`);
      }
    }

    // Updated validation for 2025 sandbox credentials
    const auaLicenseKey = this.configService.get('AUA_LICENSE_KEY');
    const auaCode = this.configService.get('AUA_CODE');
    
    // 2025 sandbox uses "public" for AUA code, license keys are specific
    const isSandbox2025 = auaCode === 'public';
    
    if (!isSandbox2025) {
      // Traditional validation for production credentials
    if (auaLicenseKey && auaLicenseKey.length < 10) {
        errors.push('AUA_LICENSE_KEY appears to be invalid (too short)');
    }

    if (auaCode && !/^\d{10}$/.test(auaCode)) {
        errors.push('UIDAI_AUA_CODE must be a 10-digit number');
      }
    }
    // For 2025 sandbox, "public" values are valid

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Mask sensitive data for logging
   */
  private maskData(data: string): string {
    if (!data || data.length <= 4) return '****';
    return data.substring(0, 4) + '*'.repeat(data.length - 4);
  }
} 