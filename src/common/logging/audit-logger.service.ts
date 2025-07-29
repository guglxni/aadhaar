import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

// Helper function to mask sensitive data
const maskData = (data: any): any => {
  if (!data) return data;
  const masked = { ...data };
  
  if (masked.uid) {
    masked.uid = `****-****-${masked.uid.slice(-4)}`;
  }
  if (masked.otp) {
    masked.otp = '***';
  }
  
  return masked;
};

interface LogPayload {
  [key: string]: any;
}

@Injectable({ scope: Scope.TRANSIENT }) // TRANSIENT scope to get a new instance for each consumer
export class AuditLogger extends ConsoleLogger {
  private static LOG_LEVELS = ['log', 'error', 'warn', 'debug', 'verbose'];

  constructor(context?: string) {
    super('AuditLogger');
  }

  private logInJson(level: 'log' | 'error' | 'warn' | 'debug' | 'verbose', message: string, context?: string, correlationId?: string, payload?: object) {
    const logObject = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: context || this.context,
      correlationId,
      payload: payload ? maskData(payload) : undefined,
    };
    
    process.stdout.write(JSON.stringify(logObject) + '\n');
  }

  audit(correlationId: string, message: string, payload: object = {}) {
    this.createLog('log', correlationId, message, payload);
  }

  errorWithContext(correlationId: string, message: string, payload: object = {}, trace?: string) {
    this.createLog('error', correlationId, message, { ...payload, stack: trace });
  }

  warnWithContext(correlationId: string, message: string, payload: object = {}) {
    this.createLog('warn', correlationId, message, payload);
  }

  private createLog(level: string, correlationId: string, message: string, payload: object) {
    if (!AuditLogger.LOG_LEVELS.includes(level)) {
      return;
    }

    const logObject = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      correlationId: correlationId || uuidv4(),
      payload,
    };

    process.stdout.write(`${JSON.stringify(logObject)}\n`);
  }
} 