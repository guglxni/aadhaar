import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuditLogger } from '../logging/audit-logger.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new AuditLogger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = request['correlationId'];

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            statusCode: status,
            message: (exception as any).message || 'Internal server error',
          };

    this.logger.errorWithContext(
      correlationId,
      `HTTP Exception: ${request.method} ${request.url}`,
      {
        path: request.url,
        method: request.method,
        statusCode: status,
        error: message,
      },
      (exception as any).stack,
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      correlationId,
      error: message,
    });
  }
} 