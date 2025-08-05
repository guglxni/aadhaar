import { Test, TestingModule } from '@nestjs/testing';
import { UidaiErrorRegistryService } from '../src/modules/auth/services/uidai-error-registry.service';
import { UidaiErrorProcessorService } from '../src/modules/auth/services/uidai-error-processor.service';
import { AuditLogger } from '../src/common/logging/audit-logger.service';
import { 
  UidaiErrorCode, 
  UidaiActionCode, 
  UidaiErrorCategory, 
  UidaiErrorSeverity 
} from '../src/modules/auth/enums/uidai-error-codes.enum';
import { 
  UidaiErrorContext, 
  UidaiErrorAction 
} from '../src/modules/auth/interfaces/uidai-error.interface';

describe('UIDAI Error Handling System', () => {
  let errorRegistry: UidaiErrorRegistryService;
  let errorProcessor: UidaiErrorProcessorService;
  let auditLogger: AuditLogger;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UidaiErrorRegistryService,
        UidaiErrorProcessorService,
        {
          provide: AuditLogger,
          useValue: {
            audit: jest.fn(),
            errorWithContext: jest.fn(),
            warnWithContext: jest.fn(),
          },
        },
      ],
    }).compile();

    errorRegistry = module.get<UidaiErrorRegistryService>(UidaiErrorRegistryService);
    errorProcessor = module.get<UidaiErrorProcessorService>(UidaiErrorProcessorService);
    auditLogger = module.get<AuditLogger>(AuditLogger);
  });

  describe('UidaiErrorRegistryService', () => {
    it('should return error definition for valid error code', () => {
      const definition = errorRegistry.getErrorDefinition(UidaiErrorCode.OTP_VALIDATION_FAILED);
      
      expect(definition).toBeDefined();
      expect(definition!.code).toBe(UidaiErrorCode.OTP_VALIDATION_FAILED);
      expect(definition!.category).toBe(UidaiErrorCategory.OTP_TOKEN_ISSUE);
      expect(definition!.severity).toBe(UidaiErrorSeverity.MEDIUM);
      expect(definition!.isRetryable).toBe(true);
      expect(definition!.userMessage).toContain('correct OTP');
    });

    it('should return specific error definition for error code with action code', () => {
      const definition = errorRegistry.getErrorDefinition(
        UidaiErrorCode.INVALID_AADHAAR_OR_UNAVAILABLE, 
        UidaiActionCode.SERVICE_TEMPORARILY_UNAVAILABLE
      );
      
      expect(definition).toBeDefined();
      expect(definition!.code).toBe(UidaiErrorCode.INVALID_AADHAAR_OR_UNAVAILABLE);
      expect(definition!.actionCode).toBe(UidaiActionCode.SERVICE_TEMPORARILY_UNAVAILABLE);
      expect(definition!.category).toBe(UidaiErrorCategory.SERVICE_OUTAGE);
      expect(definition!.severity).toBe(UidaiErrorSeverity.CRITICAL);
      expect(definition!.requiredAction).toBe(UidaiErrorAction.WAIT_AND_RETRY);
    });

    it('should return null for unknown error code', () => {
      const definition = errorRegistry.getErrorDefinition('999999');
      expect(definition).toBeNull();
    });

    it('should correctly identify retryable errors', () => {
      expect(errorRegistry.isRetryableError(UidaiErrorCode.OTP_VALIDATION_FAILED)).toBe(true);
      expect(errorRegistry.isRetryableError(UidaiErrorCode.INVALID_LICENSE_KEY)).toBe(false);
    });

    it('should correctly identify client-side errors', () => {
      expect(errorRegistry.isClientSideError(UidaiErrorCode.INVALID_SKEY_ENCRYPTION)).toBe(true);
      expect(errorRegistry.isClientSideError(UidaiErrorCode.AADHAAR_SUSPENDED)).toBe(false);
    });

    it('should return errors by category', () => {
      const biometricErrors = errorRegistry.getErrorsByCategory(UidaiErrorCategory.BIOMETRIC_ISSUE);
      expect(biometricErrors.length).toBeGreaterThan(0);
      expect(biometricErrors.every(err => err.category === UidaiErrorCategory.BIOMETRIC_ISSUE)).toBe(true);
    });
  });

  describe('UidaiErrorProcessorService', () => {
    it('should process OTP validation error correctly', () => {
      const context: UidaiErrorContext = {
        errorCode: UidaiErrorCode.OTP_VALIDATION_FAILED,
        transactionId: 'txn-123',
        timestamp: new Date().toISOString(),
        correlationId: 'corr-123',
        originalResponse: { err: '400', txn: 'txn-123' },
        userContext: { uid: '999999990019', sessionId: 'sess-123' }
      };

      const processedError = errorProcessor.processError(context);

      expect(processedError.definition.code).toBe(UidaiErrorCode.OTP_VALIDATION_FAILED);
      expect(processedError.context).toBe(context);
      expect(processedError.recommendation.showRetryButton).toBe(true);
      expect(processedError.recommendation.primaryAction).toBe(UidaiErrorAction.RETRY_WITH_CORRECTION);
      expect(processedError.logging.logLevel).toBe('warn');
    });

    it('should process service outage error with auto-retry recommendation', () => {
      const context: UidaiErrorContext = {
        errorCode: UidaiErrorCode.INVALID_AADHAAR_OR_UNAVAILABLE,
        actionCode: UidaiActionCode.SERVICE_TEMPORARILY_UNAVAILABLE,
        transactionId: 'txn-456',
        timestamp: new Date().toISOString(),
        correlationId: 'corr-456',
        originalResponse: { err: '998', actn: 'A202', txn: 'txn-456' },
        attemptNumber: 1,
        maxAttempts: 5
      };

      const processedError = errorProcessor.processError(context);

      expect(processedError.definition.category).toBe(UidaiErrorCategory.SERVICE_OUTAGE);
      expect(processedError.recommendation.autoRetry).toBe(true);
      expect(processedError.recommendation.retryAfterSeconds).toBe(60);
      expect(processedError.logging.logLevel).toBe('critical');
      expect(processedError.logging.alertRequired).toBe(true);
    });

    it('should handle unknown error codes gracefully', () => {
      const context: UidaiErrorContext = {
        errorCode: '999999',
        timestamp: new Date().toISOString(),
        correlationId: 'corr-unknown',
        originalResponse: { err: '999999' }
      };

      const processedError = errorProcessor.processError(context);

      expect(processedError.definition.code).toBe(UidaiErrorCode.UNKNOWN_ERROR);
      expect(processedError.recommendation.showContactSupport).toBe(true);
      expect(processedError.recommendation.additionalHelp).toContain('Unknown error code: 999999');
    });

    it('should disable retry after max attempts reached', () => {
      const context: UidaiErrorContext = {
        errorCode: UidaiErrorCode.OTP_VALIDATION_FAILED,
        timestamp: new Date().toISOString(),
        correlationId: 'corr-max-attempts',
        originalResponse: { err: '400' },
        attemptNumber: 3,
        maxAttempts: 3
      };

      const processedError = errorProcessor.processError(context);

      expect(processedError.recommendation.showRetryButton).toBe(false);
      expect(processedError.recommendation.autoRetry).toBe(false);
      expect(processedError.recommendation.showContactSupport).toBe(true);
    });

    it('should log errors with appropriate level and content', () => {
      const context: UidaiErrorContext = {
        errorCode: UidaiErrorCode.UNAUTHORIZED_ASA_CHANNEL,
        timestamp: new Date().toISOString(),
        correlationId: 'corr-log-test',
        originalResponse: { err: '940' }
      };

      errorProcessor.processError(context);

      expect(auditLogger.errorWithContext).toHaveBeenCalledWith(
        'corr-log-test',
        expect.stringContaining('ASA channel'),
        expect.objectContaining({
          errorCode: '940',
          category: UidaiErrorCategory.AUTHORIZATION_ISSUE,
          severity: UidaiErrorSeverity.HIGH
        })
      );
    });
  });

  describe('Error Classification Matrix', () => {
    const testCases = [
      {
        name: 'Demographic Mismatch',
        errorCode: UidaiErrorCode.PI_MISMATCH,
        expectedCategory: UidaiErrorCategory.DEMOGRAPHIC_MISMATCH,
        expectedSeverity: UidaiErrorSeverity.MEDIUM,
        expectedRetryable: true,
        expectedClientSide: false
      },
      {
        name: 'Biometric Mismatch',
        errorCode: UidaiErrorCode.BIO_MISMATCH,
        expectedCategory: UidaiErrorCategory.BIOMETRIC_ISSUE,
        expectedSeverity: UidaiErrorSeverity.MEDIUM,
        expectedRetryable: true,
        expectedClientSide: false
      },
      {
        name: 'Invalid License Key',
        errorCode: UidaiErrorCode.INVALID_LICENSE_KEY,
        expectedCategory: UidaiErrorCategory.LICENSE_ISSUE,
        expectedSeverity: UidaiErrorSeverity.HIGH,
        expectedRetryable: false,
        expectedClientSide: true
      },
      {
        name: 'Aadhaar Suspended',
        errorCode: UidaiErrorCode.AADHAAR_SUSPENDED,
        expectedCategory: UidaiErrorCategory.AADHAAR_STATUS_ISSUE,
        expectedSeverity: UidaiErrorSeverity.HIGH,
        expectedRetryable: false,
        expectedClientSide: false
      },
      {
        name: 'Service Outage',
        errorCode: UidaiErrorCode.INVALID_AADHAAR_OR_UNAVAILABLE,
        actionCode: UidaiActionCode.SERVICE_TEMPORARILY_UNAVAILABLE,
        expectedCategory: UidaiErrorCategory.SERVICE_OUTAGE,
        expectedSeverity: UidaiErrorSeverity.CRITICAL,
        expectedRetryable: true,
        expectedClientSide: false
      }
    ];

    testCases.forEach(testCase => {
      it(`should correctly classify ${testCase.name}`, () => {
        const definition = errorRegistry.getErrorDefinition(testCase.errorCode, testCase.actionCode);
        
        expect(definition).toBeDefined();
        expect(definition.category).toBe(testCase.expectedCategory);
        expect(definition.severity).toBe(testCase.expectedSeverity);
        expect(definition.isRetryable).toBe(testCase.expectedRetryable);
        expect(definition.isClientSideIssue).toBe(testCase.expectedClientSide);
      });
    });
  });

  describe('User Message Quality', () => {
    it('should provide user-friendly messages for all error codes', () => {
      const errorCodes = Object.values(UidaiErrorCode);
      
      errorCodes.forEach(errorCode => {
        const definition = errorRegistry.getErrorDefinition(errorCode);
        if (definition) {
          expect(definition.userMessage).toBeDefined();
          expect(definition.userMessage.length).toBeGreaterThan(10);
          expect(definition.userInstructions).toBeDefined();
          expect(definition.userInstructions.length).toBeGreaterThan(10);
          
          // Should not contain technical jargon
          expect(definition.userMessage).not.toMatch(/XML|API|CIDR|AUA|ASA/i);
        }
      });
    });

    it('should provide technical details for support scenarios', () => {
      const definition = errorRegistry.getErrorDefinition(UidaiErrorCode.INVALID_SKEY_ENCRYPTION);
      
      expect(definition.technicalMessage).toBeDefined();
      expect(definition.technicalMessage).toMatch(/certificate|encryption/i);
      expect(definition.probableReasons).toBeDefined();
      expect(definition.probableReasons.length).toBeGreaterThan(0);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete error flow for OTP failure', () => {
      // Simulate an OTP validation failure scenario
      const context: UidaiErrorContext = {
        errorCode: '400',
        transactionId: 'otp-fail-123',
        timestamp: new Date().toISOString(),
        correlationId: 'integration-test-1',
        originalResponse: {
          $: {
            err: '400',
            txn: 'otp-fail-123',
            ts: '2025-08-05T10:30:00+05:30',
            ret: 'n'
          }
        },
        userContext: {
          uid: '999999990019',
          sessionId: 'sess-integration-1'
        },
        attemptNumber: 1,
        maxAttempts: 3
      };

      const processedError = errorProcessor.processError(context);

      // Verify complete error processing
      expect(processedError.definition.code).toBe('400');
      expect(processedError.recommendation.showRetryButton).toBe(true);
      expect(processedError.recommendation.primaryAction).toBe(UidaiErrorAction.RETRY_WITH_CORRECTION);
      expect(processedError.logging.includeUserData).toBe(false);
      expect(processedError.logging.alertRequired).toBe(false);
    });

    it('should handle critical service outage with proper escalation', () => {
      const context: UidaiErrorContext = {
        errorCode: '998',
        actionCode: 'A202',
        timestamp: new Date().toISOString(),
        correlationId: 'critical-outage-test',
        originalResponse: {
          $: {
            err: '998',
            actn: 'A202',
            txn: 'outage-txn-123',
            ts: '2025-08-05T10:30:00+05:30',
            ret: 'n'
          }
        }
      };

      const processedError = errorProcessor.processError(context);

      // Verify critical error handling
      expect(processedError.definition.severity).toBe(UidaiErrorSeverity.CRITICAL);
      expect(processedError.recommendation.autoRetry).toBe(true);
      expect(processedError.logging.alertRequired).toBe(true);
      expect(processedError.logging.notifyOperations).toBe(true);
      expect(processedError.recommendation.additionalHelp).toContain('temporary service outage');
    });
  });
}); 