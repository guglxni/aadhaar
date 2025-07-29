import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditLogger } from '../../../common/logging/audit-logger.service';

export interface CrossDeviceSession {
  sessionId: string;
  initiatorDeviceId?: string;
  authenticatorDeviceId?: string;
  uid: string;
  status: 'pending' | 'otp_sent' | 'authenticating' | 'completed' | 'failed' | 'expired';
  uidaiOtpTxn?: string; // Real UIDAI OTP transaction ID
  uidaiAuthTxn?: string; // Real UIDAI Auth transaction ID
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  redirectUri?: string;
  correlationId: string;
  
  // Cross-device coordination
  initiatorSocketId?: string;
  authenticatorSocketId?: string;
  
  // UIDAI Response data
  uidaiResponse?: any;
  authenticationResult?: {
    success: boolean;
    claims?: any;
    error?: string;
  };
}

@Injectable()
export class CrossDeviceSessionService {
  private sessions = new Map<string, CrossDeviceSession>();
  private deviceToSession = new Map<string, string>(); // deviceId -> sessionId mapping
  private sessionTimeout: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AuditLogger,
  ) {
    this.sessionTimeout = this.configService.get<number>('CROSS_DEVICE_SESSION_TIMEOUT', 300000);
    
    // Validate session timeout
    if (!this.sessionTimeout || isNaN(this.sessionTimeout) || this.sessionTimeout <= 0) {
      this.logger.warn('Invalid CROSS_DEVICE_SESSION_TIMEOUT, using default 300000ms (5 minutes)');
      this.sessionTimeout = 300000; // 5 minutes default
    }
    
    // Cleanup expired sessions every minute
    setInterval(() => this.cleanupExpiredSessions(), 60000);
  }

  /**
   * Create a new cross-device authentication session
   */
  createSession(
    sessionId: string,
    uid: string,
    correlationId: string,
    redirectUri?: string,
    initiatorDeviceId?: string
  ): CrossDeviceSession {
    try {
      const now = new Date();
      
      // Validate inputs
      if (!sessionId || !uid || !correlationId) {
        throw new Error('Missing required parameters for session creation');
      }
      
      // Ensure sessionTimeout is valid number
      let timeoutMs = 300000; // 5 minutes default
      if (this.sessionTimeout && typeof this.sessionTimeout === 'number' && !isNaN(this.sessionTimeout) && this.sessionTimeout > 0) {
        timeoutMs = this.sessionTimeout;
      }
      
      const expiresAtTime = now.getTime() + timeoutMs;
      const expiresAt = new Date(expiresAtTime);
      
      // Validate the calculated expiry date
      if (isNaN(expiresAt.getTime())) {
        throw new Error(`Failed to calculate valid expiration time: now=${now.getTime()}, timeout=${timeoutMs}, result=${expiresAtTime}`);
      }
      
      const session: CrossDeviceSession = {
        sessionId,
        uid,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        expiresAt,
        correlationId,
        redirectUri,
        initiatorDeviceId,
      };

      this.sessions.set(sessionId, session);
      
      if (initiatorDeviceId) {
        this.deviceToSession.set(initiatorDeviceId, sessionId);
      }

      this.logger.audit(correlationId, 'CROSS_DEVICE_SESSION_CREATED', {
        sessionId,
        uid: this.maskUid(uid),
        initiatorDeviceId,
        expiresAt: session.expiresAt.toISOString(),
        timeoutMs,
      });

      return session;
    } catch (error) {
      this.logger.errorWithContext(correlationId, 'CROSS_DEVICE_SESSION_CREATION_ERROR', {
        sessionId,
        uid: this.maskUid(uid),
        error: error.message,
        sessionTimeout: this.sessionTimeout,
        sessionTimeoutType: typeof this.sessionTimeout,
      });
      throw error;
    }
  }

  /**
   * Register a device as the authenticator for a session
   */
  registerAuthenticator(
    sessionId: string,
    authenticatorDeviceId: string,
    correlationId: string
  ): CrossDeviceSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warnWithContext(correlationId, 'CROSS_DEVICE_SESSION_NOT_FOUND', { sessionId });
      return null;
    }

    if (this.isSessionExpired(session)) {
      this.logger.warnWithContext(correlationId, 'CROSS_DEVICE_SESSION_EXPIRED', { sessionId });
      return null;
    }

    session.authenticatorDeviceId = authenticatorDeviceId;
    session.updatedAt = new Date();
    
    this.deviceToSession.set(authenticatorDeviceId, sessionId);

    this.logger.audit(correlationId, 'CROSS_DEVICE_AUTHENTICATOR_REGISTERED', {
      sessionId,
      authenticatorDeviceId,
      uid: this.maskUid(session.uid),
    });

    return session;
  }

  /**
   * Update session with UIDAI OTP transaction ID
   */
  updateWithUidaiOtp(
    sessionId: string,
    uidaiOtpTxn: string,
    correlationId: string
  ): CrossDeviceSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.uidaiOtpTxn = uidaiOtpTxn;
    session.status = 'otp_sent';
    session.updatedAt = new Date();

    this.logger.audit(correlationId, 'CROSS_DEVICE_UIDAI_OTP_UPDATED', {
      sessionId,
      uidaiOtpTxn,
      uid: this.maskUid(session.uid),
    });

    return session;
  }

  /**
   * Update session status to authenticating
   */
  setAuthenticating(
    sessionId: string,
    correlationId: string
  ): CrossDeviceSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.status = 'authenticating';
    session.updatedAt = new Date();

    this.logger.audit(correlationId, 'CROSS_DEVICE_AUTHENTICATION_STARTED', {
      sessionId,
      uid: this.maskUid(session.uid),
    });

    return session;
  }

  /**
   * Complete session with UIDAI authentication result
   */
  completeSession(
    sessionId: string,
    authenticationResult: CrossDeviceSession['authenticationResult'],
    uidaiAuthTxn?: string,
    uidaiResponse?: any,
    correlationId?: string
  ): CrossDeviceSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.authenticationResult = authenticationResult;
    session.uidaiAuthTxn = uidaiAuthTxn;
    session.uidaiResponse = uidaiResponse;
    session.status = authenticationResult.success ? 'completed' : 'failed';
    session.updatedAt = new Date();

    this.logger.audit(correlationId || session.correlationId, 'CROSS_DEVICE_SESSION_COMPLETED', {
      sessionId,
      success: authenticationResult.success,
      uid: this.maskUid(session.uid),
      uidaiAuthTxn,
    });

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): CrossDeviceSession | null {
    const session = this.sessions.get(sessionId);
    return session && !this.isSessionExpired(session) ? session : null;
  }

  /**
   * Get session by device ID
   */
  getSessionByDevice(deviceId: string): CrossDeviceSession | null {
    const sessionId = this.deviceToSession.get(deviceId);
    return sessionId ? this.getSession(sessionId) : null;
  }

  /**
   * Delete session
   */
  deleteSession(sessionId: string, correlationId?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Clean up device mappings
    if (session.initiatorDeviceId) {
      this.deviceToSession.delete(session.initiatorDeviceId);
    }
    if (session.authenticatorDeviceId) {
      this.deviceToSession.delete(session.authenticatorDeviceId);
    }

    this.sessions.delete(sessionId);

    this.logger.audit(correlationId || session.correlationId, 'CROSS_DEVICE_SESSION_DELETED', {
      sessionId,
      uid: this.maskUid(session.uid),
    });

    return true;
  }

  /**
   * Get all active sessions (for debugging)
   */
  getActiveSessions(): CrossDeviceSession[] {
    return Array.from(this.sessions.values()).filter(session => !this.isSessionExpired(session));
  }

  /**
   * Update WebSocket connection IDs for real-time communication
   */
  updateSocketConnections(
    sessionId: string,
    initiatorSocketId?: string,
    authenticatorSocketId?: string,
    correlationId?: string
  ): CrossDeviceSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    if (initiatorSocketId) {
      session.initiatorSocketId = initiatorSocketId;
    }
    if (authenticatorSocketId) {
      session.authenticatorSocketId = authenticatorSocketId;
    }
    session.updatedAt = new Date();

    this.logger.audit(correlationId || session.correlationId, 'CROSS_DEVICE_SOCKETS_UPDATED', {
      sessionId,
      hasInitiatorSocket: !!session.initiatorSocketId,
      hasAuthenticatorSocket: !!session.authenticatorSocketId,
    });

    return session;
  }

  private isSessionExpired(session: CrossDeviceSession): boolean {
    return new Date() > session.expiresAt;
  }

  private cleanupExpiredSessions(): void {
    const expiredSessions: string[] = [];
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (this.isSessionExpired(session)) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      this.deleteSession(sessionId, 'system-cleanup');
    }

    if (expiredSessions.length > 0) {
      this.logger.audit('system-cleanup', 'CROSS_DEVICE_EXPIRED_SESSIONS_CLEANED', {
        expiredCount: expiredSessions.length,
        activeCount: this.sessions.size,
      });
    }
  }

  private maskUid(uid: string): string {
    if (!uid || uid.length < 4) return '****';
    return '*'.repeat(uid.length - 4) + uid.slice(-4);
  }
} 