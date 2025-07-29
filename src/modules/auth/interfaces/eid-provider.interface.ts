export interface EidProvider {
  /**
   * Initiates the authentication flow (e.g., generates QR data or auth link).
   * @param redirectUri The URI to redirect to after successful authentication.
   * @param state A unique identifier for the authentication request.
   * @param uid The Aadhaar UID (required for OTP/Auth requests).
   * @param correlationId Unique correlation ID for request tracking.
   * @returns Data needed to proceed with the flow (e.g., QR data URL, auth URL).
   */
  initiateAuth(redirectUri: string, state: string, uid: string, correlationId: string): Promise<any>;

  /**
   * Verifies the authentication response (e.g., validates OTP).
   * @param params Parameters received in the callback (e.g., txnId, otp, state, uid).
   * @param correlationId Unique correlation ID for request tracking.
   * @returns User information upon successful verification (e.g., { sub: <UID/VID>, claims: { ... } }).
   */
  // Use a more specific type for params if possible, matching AadhaarProvider's verifyAuth
  verifyAuth(params: { txn: string; otp: string; uid: string; state?: string }, correlationId: string): Promise<{ sub: string; claims: Record<string, any> }>;
}

// Token to be used for dependency injection
export const EID_PROVIDER = 'EID_PROVIDER';