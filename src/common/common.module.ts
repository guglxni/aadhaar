import { Module } from '@nestjs/common';
import { AuditLogger } from './logging/audit-logger.service';
import { CorrelationIdInterceptor } from './interceptors/correlation.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  providers: [
    AuditLogger,
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationIdInterceptor,
    },
  ],
  exports: [AuditLogger],
})
export class CommonModule {} 