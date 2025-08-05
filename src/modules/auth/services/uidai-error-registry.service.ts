import { Injectable } from '@nestjs/common';
import { 
  UidaiErrorCode, 
  UidaiActionCode, 
  UidaiErrorCategory, 
  UidaiErrorSeverity 
} from '../enums/uidai-error-codes.enum';
import { 
  UidaiErrorDefinition, 
  UidaiErrorAction 
} from '../interfaces/uidai-error.interface';

@Injectable()
export class UidaiErrorRegistryService {
  private readonly errorDefinitions: Map<string, UidaiErrorDefinition> = new Map();

  constructor() {
    this.initializeErrorDefinitions();
  }

  /**
   * Get error definition by code and optional action code
   */
  getErrorDefinition(errorCode: string, actionCode?: string): UidaiErrorDefinition | null {
    const key = actionCode ? `${errorCode}-${actionCode}` : errorCode;
    return this.errorDefinitions.get(key) || this.errorDefinitions.get(errorCode) || null;
  }

  /**
   * Get all error definitions for a specific category
   */
  getErrorsByCategory(category: UidaiErrorCategory): UidaiErrorDefinition[] {
    return Array.from(this.errorDefinitions.values())
      .filter(def => def.category === category);
  }

  /**
   * Get all error definitions for a specific severity
   */
  getErrorsBySeverity(severity: UidaiErrorSeverity): UidaiErrorDefinition[] {
    return Array.from(this.errorDefinitions.values())
      .filter(def => def.severity === severity);
  }

  /**
   * Check if an error is retryable
   */
  isRetryableError(errorCode: string, actionCode?: string): boolean {
    const definition = this.getErrorDefinition(errorCode, actionCode);
    return definition?.isRetryable || false;
  }

  /**
   * Check if an error is a client-side issue
   */
  isClientSideError(errorCode: string, actionCode?: string): boolean {
    const definition = this.getErrorDefinition(errorCode, actionCode);
    return definition?.isClientSideIssue || false;
  }

  private initializeErrorDefinitions(): void {
    // Demographic Data Mismatch Errors
    this.addErrorDefinition({
      code: UidaiErrorCode.PI_MISMATCH,
      category: UidaiErrorCategory.DEMOGRAPHIC_MISMATCH,
      severity: UidaiErrorSeverity.MEDIUM,
      description: 'Personal information attributes did not match',
      userMessage: 'Please re-enter your personal information (name, gender, date of birth, phone, email).',
      userInstructions: 'Ensure correct Aadhaar information is entered as per your Aadhaar letter.',
      technicalMessage: 'One or more personal information attributes not matching with CIDR records',
      probableReasons: ['Incorrect name entry', 'Wrong date of birth', 'Mismatched gender', 'Invalid phone/email'],
      isRetryable: true,
      isClientSideIssue: false,
      requiredAction: UidaiErrorAction.RETRY_WITH_CORRECTION,
      maxRetries: 3
    });

    this.addErrorDefinition({
      code: UidaiErrorCode.PA_MISMATCH,
      category: UidaiErrorCategory.DEMOGRAPHIC_MISMATCH,
      severity: UidaiErrorSeverity.MEDIUM,
      description: 'Address attributes did not match',
      userMessage: 'Please re-enter your address information (house, street, locality, district, state, pincode).',
      userInstructions: 'Ensure correct address information is entered as per your Aadhaar letter.',
      technicalMessage: 'One or more address attributes not matching with CIDR records',
      probableReasons: ['Incorrect address entry', 'Outdated address information', 'Wrong pincode'],
      isRetryable: true,
      isClientSideIssue: false,
      requiredAction: UidaiErrorAction.RETRY_WITH_CORRECTION,
      maxRetries: 3
    });

    // Biometric Issues
    this.addErrorDefinition({
      code: UidaiErrorCode.BIO_MISMATCH,
      category: UidaiErrorCategory.BIOMETRIC_ISSUE,
      severity: UidaiErrorSeverity.MEDIUM,
      description: 'Biometric data did not match',
      userMessage: 'Please try your fingerprint again.',
      userInstructions: 'Ensure finger is clean, dry, and placed correctly on the scanner. Try using a different finger if needed.',
      technicalMessage: 'Biometric authentication failed - fingerprint does not match CIDR records',
      probableReasons: ['Dirty/wet finger', 'Poor finger placement', 'Scanner issues', 'Low quality scan'],
      isRetryable: true,
      isClientSideIssue: false,
      requiredAction: UidaiErrorAction.RETRY_SAME_DATA,
      maxRetries: 5
    });

    // OTP Issues
    this.addErrorDefinition({
      code: UidaiErrorCode.OTP_VALIDATION_FAILED,
      category: UidaiErrorCategory.OTP_TOKEN_ISSUE,
      severity: UidaiErrorSeverity.MEDIUM,
      description: 'OTP validation failed',
      userMessage: 'Please enter the correct OTP.',
      userInstructions: 'If you continue to have issues, generate a new OTP and try again.',
      technicalMessage: 'Provided OTP does not match the value sent to registered mobile number',
      probableReasons: ['Incorrect OTP entry', 'Expired OTP', 'Network delays'],
      isRetryable: true,
      isClientSideIssue: false,
      requiredAction: UidaiErrorAction.RETRY_WITH_CORRECTION,
      maxRetries: 3
    });

    // Encryption Issues
    this.addErrorDefinition({
      code: UidaiErrorCode.INVALID_SKEY_ENCRYPTION,
      category: UidaiErrorCategory.ENCRYPTION_ISSUE,
      severity: UidaiErrorSeverity.HIGH,
      description: 'Invalid session key encryption',
      userMessage: 'Technical error occurred. Please try again.',
      userInstructions: 'If the problem persists, please contact technical support.',
      technicalMessage: 'Wrong digital certificate used for encryption of AES-256 session key',
      probableReasons: ['Wrong certificate configuration', 'Certificate expired', 'Invalid encryption algorithm'],
      isRetryable: false,
      isClientSideIssue: true,
      requiredAction: UidaiErrorAction.TECHNICAL_ESCALATION
    });

    // Timestamp Issues
    this.addErrorDefinition({
      code: UidaiErrorCode.REQUEST_EXPIRED,
      category: UidaiErrorCategory.TIMESTAMP_ISSUE,
      severity: UidaiErrorSeverity.MEDIUM,
      description: 'Authentication request has expired',
      userMessage: 'Your request has expired. Please try again.',
      userInstructions: 'Ensure your device time is synchronized and try authenticating again.',
      technicalMessage: 'Request timestamp is older than acceptable threshold (typically 20 minutes)',
      probableReasons: ['Device time incorrect', 'Network delays', 'Old cached request'],
      isRetryable: true,
      isClientSideIssue: true,
      requiredAction: UidaiErrorAction.RETRY_SAME_DATA,
      maxRetries: 2
    });

    // License Issues
    this.addErrorDefinition({
      code: UidaiErrorCode.INVALID_LICENSE_KEY,
      category: UidaiErrorCategory.LICENSE_ISSUE,
      severity: UidaiErrorSeverity.HIGH,
      description: 'Invalid license key',
      userMessage: 'Service temporarily unavailable. Please try again later.',
      userInstructions: 'If the problem persists, please contact customer support.',
      technicalMessage: 'License key used in application is invalid or not authorized',
      probableReasons: ['Wrong license key configuration', 'License key expired', 'Unauthorized usage'],
      isRetryable: false,
      isClientSideIssue: true,
      requiredAction: UidaiErrorAction.TECHNICAL_ESCALATION
    });

    // Authorization Issues
    this.addErrorDefinition({
      code: UidaiErrorCode.UNAUTHORIZED_ASA_CHANNEL,
      category: UidaiErrorCategory.AUTHORIZATION_ISSUE,
      severity: UidaiErrorSeverity.HIGH,
      description: 'Unauthorized ASA channel',
      userMessage: 'Service temporarily unavailable. Please try again later.',
      userInstructions: 'If the problem persists, please contact customer support.',
      technicalMessage: 'ASA channel is not authorized or AUA-ASA linking is missing',
      probableReasons: ['Wrong ASA configuration', 'Missing AUA-ASA linkage', 'Invalid license keys'],
      isRetryable: false,
      isClientSideIssue: true,
      requiredAction: UidaiErrorAction.TECHNICAL_ESCALATION
    });

    // Aadhaar Status Issues
    this.addErrorDefinition({
      code: UidaiErrorCode.AADHAAR_SUSPENDED,
      category: UidaiErrorCategory.AADHAAR_STATUS_ISSUE,
      severity: UidaiErrorSeverity.HIGH,
      description: 'Aadhaar number is suspended',
      userMessage: 'Your Aadhaar number status is not active.',
      userInstructions: 'Please contact UIDAI helpline at 1947 for assistance.',
      technicalMessage: 'Aadhaar number is in suspended status and not available for authentication',
      probableReasons: ['Aadhaar suspended by UIDAI', 'Compliance issues', 'Security concerns'],
      isRetryable: false,
      isClientSideIssue: false,
      requiredAction: UidaiErrorAction.CONTACT_SUPPORT
    });

    this.addErrorDefinition({
      code: UidaiErrorCode.AADHAAR_CANCELLED,
      category: UidaiErrorCategory.AADHAAR_STATUS_ISSUE,
      severity: UidaiErrorSeverity.HIGH,
      description: 'Aadhaar number is cancelled',
      userMessage: 'Your Aadhaar number has been cancelled.',
      userInstructions: 'Please re-enroll for a new Aadhaar number at the nearest enrollment center.',
      technicalMessage: 'Aadhaar number is in cancelled status',
      probableReasons: ['Aadhaar cancelled by UIDAI', 'Duplicate detection', 'Invalid enrollment'],
      isRetryable: false,
      isClientSideIssue: false,
      requiredAction: UidaiErrorAction.RE_ENROLL
    });

    // Invalid Aadhaar with Action Codes
    this.addErrorDefinition({
      code: UidaiErrorCode.INVALID_AADHAAR_OR_UNAVAILABLE,
      actionCode: UidaiActionCode.INVALID_UID_NOT_IN_CIDR,
      category: UidaiErrorCategory.AADHAAR_STATUS_ISSUE,
      severity: UidaiErrorSeverity.MEDIUM,
      description: 'Invalid Aadhaar number or not found in CIDR',
      userMessage: 'Please ensure you have entered the correct Aadhaar number.',
      userInstructions: 'Verify your 12-digit Aadhaar number and try again.',
      technicalMessage: 'Aadhaar number does not exist in CIDR or is invalid',
      probableReasons: ['Incorrect Aadhaar number', 'Typo in entry', 'Non-existent Aadhaar'],
      isRetryable: true,
      isClientSideIssue: false,
      requiredAction: UidaiErrorAction.RETRY_WITH_CORRECTION,
      maxRetries: 3
    });

    this.addErrorDefinition({
      code: UidaiErrorCode.INVALID_AADHAAR_OR_UNAVAILABLE,
      actionCode: UidaiActionCode.SERVICE_TEMPORARILY_UNAVAILABLE,
      category: UidaiErrorCategory.SERVICE_OUTAGE,
      severity: UidaiErrorSeverity.CRITICAL,
      description: 'UIDAI authentication service temporarily unavailable',
      userMessage: 'Service is temporarily unavailable. Please try again after some time.',
      userInstructions: 'This is a temporary service outage. Please wait and try again in a few minutes.',
      technicalMessage: 'UIDAI authentication service is experiencing temporary outage',
      probableReasons: ['UIDAI server maintenance', 'Network connectivity issues', 'High load on UIDAI servers'],
      isRetryable: true,
      isClientSideIssue: false,
      requiredAction: UidaiErrorAction.WAIT_AND_RETRY,
      maxRetries: 5,
      retryDelay: 60
    });

    // Technical Errors
    this.addErrorDefinition({
      code: UidaiErrorCode.UNKNOWN_ERROR,
      category: UidaiErrorCategory.TECHNICAL_ISSUE,
      severity: UidaiErrorSeverity.HIGH,
      description: 'Unknown error occurred',
      userMessage: 'An unexpected error occurred. Please try again.',
      userInstructions: 'If the problem persists, please contact customer support.',
      technicalMessage: 'Unhandled error condition in UIDAI authentication service',
      probableReasons: ['Unexpected server error', 'Network issues', 'Invalid request format'],
      isRetryable: true,
      isClientSideIssue: false,
      requiredAction: UidaiErrorAction.CONTACT_SUPPORT,
      maxRetries: 2
    });

    // Add more error definitions as needed...
  }

  private addErrorDefinition(definition: UidaiErrorDefinition): void {
    const key = definition.actionCode 
      ? `${definition.code}-${definition.actionCode}` 
      : definition.code;
    this.errorDefinitions.set(key, definition);
  }
} 