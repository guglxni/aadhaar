import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogger } from '../logging/audit-logger.service';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly logger = new AuditLogger(PerformanceInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();
    const request = context.switchToHttp().getRequest();
    const { method, url, correlationId } = request;

    return next.handle().pipe(
      tap(() => {
        const responseTime = Date.now() - now;
        this.logger.audit(correlationId, 'PERFORMANCE_METRIC', {
          method,
          url,
          responseTime: `${responseTime}ms`,
        });
      }),
    );
  }
} 