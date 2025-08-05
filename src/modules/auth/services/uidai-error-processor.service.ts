import { Injectable } from '@nestjs/common';
import { 
  UidaiErrorContext, 
  ProcessedUidaiError, 
  UidaiErrorRecommendation, 
  UidaiErrorLogging,
  UidaiErrorAction 
} from '../interfaces/uidai-error.interface';
import { UidaiErrorRegistryService } from './uidai-error-registry.service';
import { AuditLogger } from '../../../common/logging/audit-logger.service';
import { UidaiErrorSeverity } from '../enums/uidai-error-codes.enum';

@Injectable()
export class UidaiErrorProcessorService {
  constructor(
    private readonly errorRegistry: UidaiErrorRegistryService,
    private readonly auditLogger: AuditLogger
  ) {}

  /**
   * Process UIDAI error and generate comprehensive error response
   */
  processError(context: UidaiErrorContext): ProcessedUidaiError {
    const definition = this.errorRegistry.getErrorDefinition(
      context.errorCode, 
      context.actionCode
    );

    if (!definition) {
      // Handle unknown error codes
      return this.handleUnknownError(context);
    }

    const recommendation = this.generateRecommendation(definition, context);
    const logging = this.generateLoggingConfig(definition, context);

    const processedError: ProcessedUidaiError = {
      definition,
      context,
      recommendation,
      logging
    };

    // Log the error based on configuration
    this.logError(processedError);

    return processedError;
  }

  /**
   * Generate user-facing error recommendation
   */
  private generateRecommendation(
    definition: any, 
    context: UidaiErrorContext
  ): UidaiErrorRecommendation {
    const recommendation: UidaiErrorRecommendation = {
      primaryAction: definition.requiredAction,
      alternativeActions: this.getAlternativeActions(definition),
      showRetryButton: definition.isRetryable,
      showContactSupport: this.shouldShowContactSupport(definition),
      showTechnicalDetails: this.shouldShowTechnicalDetails(definition),
      autoRetry: this.shouldAutoRetry(definition, context),
      retryAfterSeconds: definition.retryDelay,
      additionalHelp: this.getAdditionalHelp(definition)
    };

    // Customize based on attempt number
    if (context.attemptNumber && context.maxAttempts) {
      if (context.attemptNumber >= context.maxAttempts) {
        recommendation.showRetryButton = false;
        recommendation.autoRetry = false;
        recommendation.showContactSupport = true;
      }
    }

    return recommendation;
  }

  /**
   * Generate logging configuration for the error
   */
  private generateLoggingConfig(
    definition: any, 
    context: UidaiErrorContext
  ): UidaiErrorLogging {
    return {
      logLevel: this.getLogLevel(definition.severity),
      alertRequired: this.shouldAlert(definition),
      includeUserData: this.shouldIncludeUserData(definition),
      includeRequestData: definition.isClientSideIssue,
      includeResponseData: true,
      notifyOperations: this.shouldNotifyOperations(definition),
      escalateToUidai: this.shouldEscalateToUidai(definition)
    };
  }

  /**
   * Log the error based on configuration
   */
  private logError(processedError: ProcessedUidaiError): void {
    const { definition, context, logging } = processedError;
    const correlationId = context.correlationId;

    const logPayload = {
      errorCode: context.errorCode,
      actionCode: context.actionCode,
      category: definition.category,
      severity: definition.severity,
      isRetryable: definition.isRetryable,
      isClientSideIssue: definition.isClientSideIssue,
      attemptNumber: context.attemptNumber,
      transactionId: context.transactionId,
      ...(logging.includeUserData && context.userContext && {
        userContext: {
          uid: context.userContext.uid ? `****-****-${context.userContext.uid.slice(-4)}` : undefined,
          sessionId: context.userContext.sessionId,
          deviceInfo: context.userContext.deviceInfo
        }
      }),
      ...(logging.includeRequestData && { requestData: 'REDACTED_FOR_SECURITY' }),
      ...(logging.includeResponseData && { 
        responseData: this.sanitizeResponse(context.originalResponse) 
      })
    };

    switch (logging.logLevel) {
      case 'critical':
        this.auditLogger.errorWithContext(correlationId, definition.technicalMessage, logPayload);
        break;
      case 'error':
        this.auditLogger.errorWithContext(correlationId, definition.technicalMessage, logPayload);
        break;
      case 'warn':
        this.auditLogger.warnWithContext(correlationId, definition.technicalMessage, logPayload);
        break;
      case 'info':
        this.auditLogger.audit(correlationId, definition.technicalMessage, logPayload);
        break;
      case 'debug':
        this.auditLogger.audit(correlationId, definition.technicalMessage, logPayload);
        break;
    }

    // Handle alerts and notifications
    if (logging.alertRequired) {
      this.sendAlert(processedError);
    }

    if (logging.notifyOperations) {
      this.notifyOperations(processedError);
    }

    if (logging.escalateToUidai) {
      this.escalateToUidai(processedError);
    }
  }

  /**
   * Handle unknown error codes
   */
  private handleUnknownError(context: UidaiErrorContext): ProcessedUidaiError {
    const unknownDefinition = this.errorRegistry.getErrorDefinition('999');
    
    if (!unknownDefinition) {
      throw new Error('Critical: Unknown error definition not found in registry');
    }

    return {
      definition: unknownDefinition,
      context,
      recommendation: {
        primaryAction: UidaiErrorAction.CONTACT_SUPPORT,
        alternativeActions: [UidaiErrorAction.RETRY_SAME_DATA],
        showRetryButton: true,
        showContactSupport: true,
        showTechnicalDetails: true,
        autoRetry: false,
        additionalHelp: `Unknown error code: ${context.errorCode}`
      },
      logging: {
        logLevel: 'error',
        alertRequired: true,
        includeUserData: false,
        includeRequestData: true,
        includeResponseData: true,
        notifyOperations: true,
        escalateToUidai: false
      }
    };
  }

  /**
   * Get alternative actions based on error type
   */
  private getAlternativeActions(definition: any): UidaiErrorAction[] {
    const alternatives: UidaiErrorAction[] = [];

    if (definition.isRetryable) {
      alternatives.push(UidaiErrorAction.RETRY_SAME_DATA);
    }

    if (definition.category === 'demographic_mismatch' || definition.category === 'otp_token_issue') {
      alternatives.push(UidaiErrorAction.RETRY_WITH_CORRECTION);
    }

    if (definition.severity === UidaiErrorSeverity.HIGH || definition.severity === UidaiErrorSeverity.CRITICAL) {
      alternatives.push(UidaiErrorAction.CONTACT_SUPPORT);
    }

    return alternatives;
  }

  /**
   * Determine if contact support should be shown
   */
  private shouldShowContactSupport(definition: any): boolean {
    return definition.severity === UidaiErrorSeverity.HIGH || 
           definition.severity === UidaiErrorSeverity.CRITICAL ||
           !definition.isRetryable;
  }

  /**
   * Determine if technical details should be shown
   */
  private shouldShowTechnicalDetails(definition: any): boolean {
    return definition.isClientSideIssue || 
           definition.severity === UidaiErrorSeverity.HIGH ||
           definition.severity === UidaiErrorSeverity.CRITICAL;
  }

  /**
   * Determine if auto-retry should be enabled
   */
  private shouldAutoRetry(definition: any, context: UidaiErrorContext): boolean {
    return definition.requiredAction === UidaiErrorAction.WAIT_AND_RETRY &&
           (!context.attemptNumber || context.attemptNumber < (definition.maxRetries || 3));
  }

  /**
   * Get additional help text
   */
  private getAdditionalHelp(definition: any): string | undefined {
    if (definition.category === 'service_outage') {
      return 'This is a temporary service outage. Our team has been notified and is working to resolve the issue.';
    }

    if (definition.category === 'biometric_issue') {
      return 'For better fingerprint recognition, ensure your finger is clean and dry, and place it firmly on the scanner.';
    }

    if (definition.category === 'demographic_mismatch') {
      return 'Please refer to your Aadhaar card or enrollment receipt for the exact information format.';
    }

    return undefined;
  }

  /**
   * Get appropriate log level based on severity
   */
  private getLogLevel(severity: UidaiErrorSeverity): 'debug' | 'info' | 'warn' | 'error' | 'critical' {
    switch (severity) {
      case UidaiErrorSeverity.LOW:
        return 'info';
      case UidaiErrorSeverity.MEDIUM:
        return 'warn';
      case UidaiErrorSeverity.HIGH:
        return 'error';
      case UidaiErrorSeverity.CRITICAL:
        return 'critical';
      default:
        return 'warn';
    }
  }

  /**
   * Determine if alert should be sent
   */
  private shouldAlert(definition: any): boolean {
    return definition.severity === UidaiErrorSeverity.CRITICAL ||
           (definition.severity === UidaiErrorSeverity.HIGH && !definition.isRetryable);
  }

  /**
   * Determine if user data should be included in logs
   */
  private shouldIncludeUserData(definition: any): boolean {
    return definition.category === 'aadhaar_status_issue' ||
           definition.category === 'demographic_mismatch';
  }

  /**
   * Determine if operations team should be notified
   */
  private shouldNotifyOperations(definition: any): boolean {
    return definition.severity === UidaiErrorSeverity.CRITICAL ||
           definition.category === 'service_outage';
  }

  /**
   * Determine if error should be escalated to UIDAI
   */
  private shouldEscalateToUidai(definition: any): boolean {
    return definition.category === 'service_outage' ||
           (definition.category === 'technical_issue' && !definition.isClientSideIssue);
  }

  /**
   * Sanitize response data for logging
   */
  private sanitizeResponse(response: any): any {
    if (!response) return response;

    const sanitized = { ...response };
    
    // Remove or mask sensitive fields
    if (sanitized.uid) {
      sanitized.uid = `****-****-${sanitized.uid.slice(-4)}`;
    }

    return sanitized;
  }

  /**
   * Send alert for critical errors
   */
  private sendAlert(processedError: ProcessedUidaiError): void {
    // Implementation would integrate with alerting system (PagerDuty, Slack, etc.)
    this.auditLogger.errorWithContext(
      processedError.context.correlationId,
      'UIDAI_ERROR_ALERT_TRIGGERED',
      {
        errorCode: processedError.context.errorCode,
        severity: processedError.definition.severity,
        category: processedError.definition.category,
        alertType: 'CRITICAL_UIDAI_ERROR'
      }
    );
  }

  /**
   * Notify operations team
   */
  private notifyOperations(processedError: ProcessedUidaiError): void {
    // Implementation would integrate with operations notification system
    this.auditLogger.audit(
      processedError.context.correlationId,
      'UIDAI_OPERATIONS_NOTIFICATION_SENT',
      {
        errorCode: processedError.context.errorCode,
        category: processedError.definition.category,
        notificationType: 'OPERATIONS_ALERT'
      }
    );
  }

  /**
   * Escalate to UIDAI support
   */
  private escalateToUidai(processedError: ProcessedUidaiError): void {
    // Implementation would log for UIDAI escalation process
    this.auditLogger.audit(
      processedError.context.correlationId,
      'UIDAI_ESCALATION_LOGGED',
      {
        errorCode: processedError.context.errorCode,
        transactionId: processedError.context.transactionId,
        escalationType: 'UIDAI_SUPPORT_ESCALATION'
      }
    );
  }
} 