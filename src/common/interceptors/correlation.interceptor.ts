import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

export const CORRELATION_ID_HEADER = 'X-Correlation-ID';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const correlationId = request.headers[CORRELATION_ID_HEADER.toLowerCase()] || uuidv4();

    // Attach correlationId to the request object for easy access in services
    request.correlationId = correlationId;

    // You can also add it to the response headers
    const response = context.switchToHttp().getResponse();
    response.header(CORRELATION_ID_HEADER, correlationId);

    return next.handle();
  }
} 