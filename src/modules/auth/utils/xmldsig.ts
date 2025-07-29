// utils/crypto/xmldsig.ts
// Production-grade signing utility for UIDAI compliance
// Uses proven xml-crypto 2.1.6 + empty Id pattern that achieves Error 569

import * as CryptoUtils from './crypto-utils';

export interface SigningOptions {
  privatePem: string;
  certPem: string;
}

export function signOtpXml(
  xmlStr: string, 
  options: SigningOptions
): string {
  try {
    // Use the proven CryptoUtils.signXmlWithPemData that achieves Error 569
    // This uses xml-crypto 2.1.6 with empty Id trick and proper KeyInfo
    return CryptoUtils.signXmlWithPemData(xmlStr, options.privatePem, options.certPem);
  } catch (error) {
    throw new Error(`XML signing failed: ${error.message}`);
  }
}

export function signAuthXml(
  xmlStr: string,
  options: SigningOptions
): string {
  try {
    // Use the proven CryptoUtils.signXmlWithPemData that achieves Error 569
    // This uses xml-crypto 2.1.6 with empty Id trick and proper KeyInfo
    return CryptoUtils.signXmlWithPemData(xmlStr, options.privatePem, options.certPem);
  } catch (error) {
    throw new Error(`XML signing failed: ${error.message}`);
  }
} 