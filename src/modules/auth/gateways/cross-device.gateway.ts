import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AuditLogger } from '../../../common/logging/audit-logger.service';
import { CrossDeviceSessionService } from '../services/cross-device-session.service';
import { v4 as uuidv4 } from 'uuid';

interface CrossDeviceMessage {
  type: 'join_session' | 'otp_sent' | 'auth_starting' | 'auth_completed' | 'auth_failed' | 'session_expired';
  sessionId: string;
  deviceType: 'initiator' | 'authenticator';
  data?: any;
}

@WebSocketGateway({
  cors: {
    origin: process.env.NODE_ENV === 'development' ? ['http://localhost:3002'] : false,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class CrossDeviceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CrossDeviceGateway.name);
  private socketToSession = new Map<string, string>(); // socketId -> sessionId
  private socketToDevice = new Map<string, string>(); // socketId -> deviceId

  constructor(
    private readonly auditLogger: AuditLogger,
    private readonly crossDeviceSessionService: CrossDeviceSessionService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('🔌 Cross-Device WebSocket Gateway initialized');
    this.auditLogger.audit('system', 'CROSS_DEVICE_WEBSOCKET_INITIALIZED', {
      timestamp: new Date().toISOString(),
    });
  }

  handleConnection(client: Socket) {
    const correlationId = uuidv4();
    const clientId = client.id;
    
    this.logger.debug(`🔗 Client connected: ${clientId}`);
    this.auditLogger.audit(correlationId, 'CROSS_DEVICE_CLIENT_CONNECTED', {
      clientId,
      remoteAddress: client.handshake.address,
      userAgent: client.handshake.headers['user-agent'],
    });

    // Send welcome message
    client.emit('connected', {
      message: 'Connected to Cross-Device Authentication Gateway',
      clientId,
      timestamp: new Date().toISOString(),
    });
  }

  handleDisconnect(client: Socket) {
    const correlationId = uuidv4();
    const clientId = client.id;
    const sessionId = this.socketToSession.get(clientId);
    const deviceId = this.socketToDevice.get(clientId);

    this.logger.debug(`🔌 Client disconnected: ${clientId}`);
    
    // Clean up mappings
    this.socketToSession.delete(clientId);
    this.socketToDevice.delete(clientId);

    // Notify other devices in the session about disconnection
    if (sessionId) {
      this.notifySessionParticipants(sessionId, {
        type: 'device_disconnected',
        deviceId,
        timestamp: new Date().toISOString(),
      }, clientId);
    }

    this.auditLogger.audit(correlationId, 'CROSS_DEVICE_CLIENT_DISCONNECTED', {
      clientId,
      sessionId,
      deviceId,
    });
  }

  @SubscribeMessage('join_session')
  handleJoinSession(
    @MessageBody() data: { sessionId: string; deviceType: 'initiator' | 'authenticator'; deviceId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const correlationId = uuidv4();
    const { sessionId, deviceType, deviceId } = data;
    const clientId = client.id;

    this.auditLogger.audit(correlationId, 'CROSS_DEVICE_JOIN_SESSION_REQUEST', {
      sessionId,
      deviceType,
      deviceId,
      clientId,
    });

    // Get session from service
    const session = this.crossDeviceSessionService.getSession(sessionId);
    if (!session) {
      client.emit('error', {
        type: 'session_not_found',
        message: 'Session not found or expired',
        sessionId,
      });
      return;
    }

    // Update mappings
    this.socketToSession.set(clientId, sessionId);
    if (deviceId) {
      this.socketToDevice.set(clientId, deviceId);
    }

    // Join socket room for this session
    client.join(`session_${sessionId}`);

    // Update session with socket information
    if (deviceType === 'initiator') {
      this.crossDeviceSessionService.updateSocketConnections(
        sessionId,
        clientId,
        undefined,
        correlationId
      );
    } else if (deviceType === 'authenticator') {
      this.crossDeviceSessionService.updateSocketConnections(
        sessionId,
        undefined,
        clientId,
        correlationId
      );
    }

    // Confirm join
    client.emit('session_joined', {
      sessionId,
      deviceType,
      status: session.status,
      timestamp: new Date().toISOString(),
    });

    // Notify other participants
    this.notifySessionParticipants(sessionId, {
      type: 'device_joined',
      deviceType,
      deviceId,
      status: session.status,
      timestamp: new Date().toISOString(),
    }, clientId);

    this.auditLogger.audit(correlationId, 'CROSS_DEVICE_SESSION_JOINED', {
      sessionId,
      deviceType,
      deviceId,
      clientId,
      status: session.status,
    });
  }

  @SubscribeMessage('get_session_status')
  handleGetSessionStatus(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId } = data;
    const session = this.crossDeviceSessionService.getSession(sessionId);

    if (!session) {
      client.emit('session_status', {
        sessionId,
        status: 'not_found',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    client.emit('session_status', {
      sessionId,
      status: session.status,
      uid: session.uid ? `****${session.uid.slice(-4)}` : undefined,
      hasOtpTxn: !!session.uidaiOtpTxn,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notify session that OTP has been sent via UIDAI
   */
  notifyOtpSent(sessionId: string, uidaiOtpTxn: string) {
    this.server.to(`session_${sessionId}`).emit('otp_sent', {
      sessionId,
      uidaiOtpTxn,
      message: 'OTP sent to registered mobile number',
      timestamp: new Date().toISOString(),
    });

    this.auditLogger.audit('system', 'CROSS_DEVICE_OTP_NOTIFICATION_SENT', {
      sessionId,
      uidaiOtpTxn,
    });
  }

  /**
   * Notify session that authentication is starting
   */
  notifyAuthenticationStarting(sessionId: string) {
    this.server.to(`session_${sessionId}`).emit('auth_starting', {
      sessionId,
      message: 'Authentication in progress...',
      timestamp: new Date().toISOString(),
    });

    this.auditLogger.audit('system', 'CROSS_DEVICE_AUTH_STARTING_NOTIFICATION', {
      sessionId,
    });
  }

  /**
   * Notify session of authentication completion
   */
  notifyAuthenticationCompleted(sessionId: string, success: boolean, claims?: any, error?: string) {
    const eventType = success ? 'auth_completed' : 'auth_failed';
    
    this.server.to(`session_${sessionId}`).emit(eventType, {
      sessionId,
      success,
      claims: success ? claims : undefined,
      error: success ? undefined : error,
      message: success ? 'Authentication successful!' : 'Authentication failed',
      timestamp: new Date().toISOString(),
    });

    this.auditLogger.audit('system', 'CROSS_DEVICE_AUTH_COMPLETION_NOTIFICATION', {
      sessionId,
      success,
      hasError: !!error,
    });
  }

  /**
   * Notify session participants (excluding specific socket)
   */
  private notifySessionParticipants(sessionId: string, message: any, excludeSocketId?: string) {
    if (excludeSocketId) {
      this.server.to(`session_${sessionId}`).except(excludeSocketId).emit('session_update', message);
    } else {
      this.server.to(`session_${sessionId}`).emit('session_update', message);
    }
  }

  /**
   * Get connected clients for a session
   */
  getSessionClients(sessionId: string): string[] {
    const room = this.server.sockets.adapter.rooms.get(`session_${sessionId}`);
    return room ? Array.from(room) : [];
  }

  /**
   * Check if session has active connections
   */
  hasActiveConnections(sessionId: string): boolean {
    return this.getSessionClients(sessionId).length > 0;
  }
} 