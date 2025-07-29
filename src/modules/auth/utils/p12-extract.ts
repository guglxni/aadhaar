// utils/crypto/p12-extract.ts
// xmldsigjs-optimized P12 extraction using node-forge
import forge from 'node-forge';
import { readFileSync } from 'fs';

export interface KeyPair {
  privatePem: string;
  certPem: string;
  issuerDn?: string;
  serialDec?: string;
}

/**
 * Extracts PEM private key and certificate from P12 file using node-forge
 * Optimized for xmldsigjs with additional certificate metadata
 */
export function extractPemPair(p12Path: string, passphrase: string): KeyPair {
  try {
    const p12Der = readFileSync(p12Path, 'binary');
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, passphrase);

    // Access using friendlyName as specified in the implementation
    const keyBags = p12.getBags({bagType: forge.pki.oids.pkcs8ShroudedKeyBag});
    const certBags = p12.getBags({bagType: forge.pki.oids.certBag});

    // Get the first available key and certificate
    const keyBag = Object.values(keyBags)[0]?.[0]?.key || 
                   (keyBags.friendlyName && keyBags.friendlyName[0]?.key);
    const certBag = Object.values(certBags)[0]?.[0]?.cert || 
                    (certBags.friendlyName && certBags.friendlyName[0]?.cert);

    if (!keyBag || !certBag) {
      throw new Error('Could not extract private key or certificate from P12 file');
    }

    const privatePem = forge.pki.privateKeyToPem(keyBag);
    const certPem = forge.pki.certificateToPem(certBag);
    
    // Extract additional metadata for xmldsigjs X509IssuerSerial
    const issuerDn = certBag.issuer.attributes.map(a => `${a.shortName}=${a.value}`).join(',');
    const serialDec = new forge.jsbn.BigInteger(certBag.serialNumber, 16).toString(10);

    return {
      privatePem,
      certPem,
      issuerDn,
      serialDec
    };
    
  } catch (error) {
    throw new Error(`Failed to extract PEM pair from P12: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Backward compatibility alias
export function loadKeyPair(p12Path: string, password: string): KeyPair {
  return extractPemPair(p12Path, password);
} 