/**
 * UIDAI API Error Codes Enumeration
 * Based on official UIDAI Authentication API v2.5 specification
 */

export enum UidaiErrorCode {
  // Demographic Data Mismatch (100-299)
  PI_MISMATCH = '100',
  PA_MISMATCH = '200',
  
  // Biometric Data Issues (300-399)
  BIO_MISMATCH = '300',
  DUPLICATE_FINGERS = '310',
  DUPLICATE_IRISES = '311',
  FMR_FIR_MIXED = '312',
  MULTIPLE_FINGERS_IN_FIR = '313',
  TOO_MANY_FMR_FIR = '314',
  TOO_MANY_IIR = '315',
  
  // OTP/Token Validation (400-499)
  OTP_VALIDATION_FAILED = '400',
  TOKEN_VALIDATION_FAILED = '401',
  
  // Encryption & Session Key Issues (500-509)
  INVALID_SKEY_ENCRYPTION = '500',
  INVALID_CI_ATTRIBUTE = '501',
  INVALID_PID_ENCRYPTION = '502',
  INVALID_HMAC_ENCRYPTION = '503',
  SESSION_KEY_EXPIRED = '504',
  SYNCHRONIZED_SKEY_NOT_ALLOWED = '505',
  
  // XML Format Issues (510-519)
  INVALID_AUTH_XML_FORMAT = '510',
  INVALID_PID_XML_FORMAT = '511',
  
  // Device Issues (520-529)
  INVALID_DEVICE = '520',
  INVALID_FINGER_DEVICE = '521',
  INVALID_IRIS_DEVICE = '522',
  
  // Authentication & Authorization (530-549)
  INVALID_AUTHENTICATOR_CODE = '530',
  INVALID_AUTH_XML_VERSION = '540',
  INVALID_PID_XML_VERSION = '541',
  AUA_NOT_AUTHORIZED_FOR_ASA = '542',
  SUB_AUA_NOT_ASSOCIATED = '543',
  
  // Uses Element Issues (550-559)
  INVALID_USES_ATTRIBUTES = '550',
  
  // Timestamp Issues (560-569)
  REQUEST_EXPIRED = '561',
  FUTURE_TIMESTAMP = '562',
  DUPLICATE_REQUEST = '563',
  HMAC_VALIDATION_FAILED = '564',
  
  // License Issues (565-583)
  LICENSE_KEY_EXPIRED = '565',
  INVALID_LICENSE_KEY = '566',
  INVALID_INPUT_CHARACTERS = '567',
  UNSUPPORTED_LANGUAGE = '568',
  DIGITAL_SIGNATURE_FAILED = '569',
  INVALID_KEY_INFO = '570',
  PIN_REQUIRES_RESET = '571',
  INVALID_BIOMETRIC_POSITION = '572',
  PI_USAGE_NOT_ALLOWED = '573',
  PA_USAGE_NOT_ALLOWED = '574',
  PFA_USAGE_NOT_ALLOWED = '575',
  FMR_USAGE_NOT_ALLOWED = '576',
  FIR_USAGE_NOT_ALLOWED = '577',
  IIR_USAGE_NOT_ALLOWED = '578',
  OTP_USAGE_NOT_ALLOWED = '579',
  PIN_USAGE_NOT_ALLOWED = '580',
  FUZZY_MATCHING_NOT_ALLOWED = '581',
  LOCAL_LANGUAGE_NOT_ALLOWED = '582',
  
  // Meta Element Issues (584-585)
  INVALID_PIN_CODE_META = '584',
  INVALID_GEO_CODE_META = '585',
  
  // Missing Data Issues (710-821)
  MISSING_PI_DATA = '710',
  MISSING_PA_DATA = '720',
  MISSING_PFA_DATA = '721',
  MISSING_PIN_DATA = '730',
  MISSING_OTP_DATA = '740',
  INVALID_BIOMETRIC_DATA = '800',
  MISSING_BIOMETRIC_DATA = '810',
  MISSING_BIOMETRIC_IN_CIDR = '811',
  BFD_NOT_DONE = '812',
  MISSING_BT_ATTRIBUTE = '820',
  INVALID_BT_ATTRIBUTE = '821',
  
  // Authentication Data Issues (901-913)
  NO_AUTH_DATA_FOUND = '901',
  INVALID_DOB_VALUE = '902',
  INVALID_MV_VALUE_PI = '910',
  INVALID_MV_VALUE_PFA = '911',
  INVALID_MS_VALUE = '912',
  PA_PFA_BOTH_PRESENT = '913',
  
  // Technical & Server Issues (930-999)
  TECHNICAL_ERROR_START = '930',
  TECHNICAL_ERROR_END = '939',
  UNAUTHORIZED_ASA_CHANNEL = '940',
  UNSPECIFIED_ASA_CHANNEL = '941',
  UNSUPPORTED_OPTION = '980',
  AADHAAR_CANCELLED = '996',
  AADHAAR_SUSPENDED = '997',
  INVALID_AADHAAR_OR_UNAVAILABLE = '998',
  UNKNOWN_ERROR = '999'
}

export enum UidaiActionCode {
  // For Error 998 - Invalid Aadhaar Number or Non-availability
  INVALID_UID_NOT_IN_CIDR = 'A201', // UID is wrong or not in CIDR
  SERVICE_TEMPORARILY_UNAVAILABLE = 'A202', // Authentication temporarily not available, retry after sometime
  
  // For Error 997 - Aadhaar Suspended
  AADHAAR_SUSPENDED_CONTACT_UIDAI = 'A301',
  
  // For Error 996 - Aadhaar Cancelled
  AADHAAR_CANCELLED_RE_ENROLL = 'A401'
}

export enum UidaiErrorCategory {
  DEMOGRAPHIC_MISMATCH = 'demographic_mismatch',
  BIOMETRIC_ISSUE = 'biometric_issue',
  OTP_TOKEN_ISSUE = 'otp_token_issue',
  ENCRYPTION_ISSUE = 'encryption_issue',
  XML_FORMAT_ISSUE = 'xml_format_issue',
  DEVICE_ISSUE = 'device_issue',
  AUTHORIZATION_ISSUE = 'authorization_issue',
  TIMESTAMP_ISSUE = 'timestamp_issue',
  LICENSE_ISSUE = 'license_issue',
  MISSING_DATA_ISSUE = 'missing_data_issue',
  TECHNICAL_ISSUE = 'technical_issue',
  AADHAAR_STATUS_ISSUE = 'aadhaar_status_issue',
  SERVICE_OUTAGE = 'service_outage'
}

export enum UidaiErrorSeverity {
  LOW = 'low',           // User can retry with same data
  MEDIUM = 'medium',     // User needs to correct data
  HIGH = 'high',         // Technical issue, contact support
  CRITICAL = 'critical'  // Service outage or system issue
} 