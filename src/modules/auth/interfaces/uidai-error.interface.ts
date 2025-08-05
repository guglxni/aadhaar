import { UidaiErrorCode, UidaiActionCode, UidaiErrorCategory, UidaiErrorSeverity } from '../enums/uidai-error-codes.enum';

/**
 * Comprehensive UIDAI Error Definition Interface
 */
export interface UidaiErrorDefinition {
  code: UidaiErrorCode;
  actionCode?: UidaiActionCode;
  category: UidaiErrorCategory;
  severity: UidaiErrorSeverity;
  description: string;
  userMessage: string;
  userInstructions: string;
  technicalMessage: string;
  probableReasons: string[];
  isRetryable: boolean;
  isClientSideIssue: boolean;
  requiredAction: UidaiErrorAction;
  maxRetries?: number;
  retryDelay?: number; // in seconds
}

/**
 * UIDAI Error Context for Runtime Processing
 */
export interface UidaiErrorContext {
  errorCode: string;
  actionCode?: string;
  transactionId?: string;
  timestamp: string;
  correlationId: string;
  originalResponse: any;
  attemptNumber?: number;
  maxAttempts?: number;
  userContext?: {
    uid?: string;
    sessionId?: string;
    deviceInfo?: string;
  };
}

/**
 * Processed UIDAI Error for Application Use
 */
export interface ProcessedUidaiError {
  definition: UidaiErrorDefinition;
  context: UidaiErrorContext;
  recommendation: UidaiErrorRecommendation;
  logging: UidaiErrorLogging;
}

/**
 * Error Action Types
 */
export enum UidaiErrorAction {
  RETRY_SAME_DATA = 'retry_same_data',
  RETRY_WITH_CORRECTION = 'retry_with_correction',
  CONTACT_SUPPORT = 'contact_support',
  SYSTEM_MAINTENANCE = 'system_maintenance',
  RE_ENROLL = 're_enroll',
  UPDATE_AADHAAR = 'update_aadhaar',
  WAIT_AND_RETRY = 'wait_and_retry',
  TECHNICAL_ESCALATION = 'technical_escalation'
}

/**
 * Error Recommendation for User Interface
 */
export interface UidaiErrorRecommendation {
  primaryAction: UidaiErrorAction;
  alternativeActions: UidaiErrorAction[];
  showRetryButton: boolean;
  showContactSupport: boolean;
  showTechnicalDetails: boolean;
  autoRetry: boolean;
  retryAfterSeconds?: number;
  redirectToUrl?: string;
  additionalHelp?: string;
}

/**
 * Error Logging Configuration
 */
export interface UidaiErrorLogging {
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  alertRequired: boolean;
  includeUserData: boolean;
  includeRequestData: boolean;
  includeResponseData: boolean;
  notifyOperations: boolean;
  escalateToUidai: boolean;
}

/**
 * Error Statistics for Monitoring
 */
export interface UidaiErrorStats {
  errorCode: string;
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  affectedUsers: number;
  successfulRetries: number;
  failedRetries: number;
  averageResolutionTime?: number;
}

/**
 * Bulk Error Analysis Interface
 */
export interface UidaiErrorAnalysis {
  timeRange: {
    start: Date;
    end: Date;
  };
  totalErrors: number;
  errorsByCategory: Record<UidaiErrorCategory, number>;
  errorsBySeverity: Record<UidaiErrorSeverity, number>;
  topErrors: UidaiErrorStats[];
  serviceAvailability: number; // percentage
  recommendations: string[];
} 