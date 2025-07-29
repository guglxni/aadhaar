// utils/crypto/xmldsig-signer.ts
// Enhanced signing implementation for UIDAI compliance
// Uses proven xml-crypto 2.1.6 approach with improved architecture

import * as CryptoUtils from './crypto-utils';

export interface SigningCredentials {
  privatePem: string;
  certPem: string;
  issuerDn?: string;
  serialDec?: string;
}

/**
 * Signs XML document using proven xml-crypto 2.1.6 approach
 * This achieves Error 569 consistently and provides the foundation
 * for future xmldsigjs migration when the API is stabilized
 */
export async function signWholeDocument(
  xml: string, 
  credentials: SigningCredentials
): Promise<string> {
  try {
    // Use the proven CryptoUtils.signXmlWithPemData that achieves Error 569
    // This maintains the working xml-crypto 2.1.6 + empty Id pattern
    return CryptoUtils.signXmlWithPemData(xml, credentials.privatePem, credentials.certPem);
  } catch (error) {
    throw new Error(`Enhanced XML signing failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Convenience function for OTP XML signing
 */
export async function signOtpXml(
  xml: string, 
  credentials: SigningCredentials
): Promise<string> {
  return signWholeDocument(xml, credentials);
}

/**
 * Convenience function for Auth XML signing
 */
export async function signAuthXml(
  xml: string, 
  credentials: SigningCredentials
): Promise<string> {
  return signWholeDocument(xml, credentials);
} 