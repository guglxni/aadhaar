import { DOMParser, XMLSerializer } from 'xmldom';
import { Logger } from '@nestjs/common';
import { SignedXml } from 'xml-crypto';
import * as fs from 'fs';
import * as crypto from 'crypto';

// Types for UIDAI XML Response structures
export interface UidaiOtpXmlResponse {
  OtpRes?: {
    ret?: string;
    err?: string;
    info?: string;
    txn?: string;
    ts?: string;
    Signature?: string; 
  };
}

export interface UidaiAuthXmlResponse {
  AuthRes?: {
    ret?: string;
    err?: string;
    info?: string;
    txn?: string;
    ts?: string;
    Signature?: string;
  };
}

// Type guards for safe access to response objects
export function isOtpResponse(obj: unknown): obj is UidaiOtpXmlResponse {
  return obj !== null && 
         typeof obj === 'object' && 
         'OtpRes' in obj && 
         typeof (obj as { OtpRes: unknown }).OtpRes === 'object';
}

export function isAuthResponse(obj: unknown): obj is UidaiAuthXmlResponse {
  return obj !== null && 
         typeof obj === 'object' && 
         'AuthRes' in obj && 
         typeof (obj as { AuthRes: unknown }).AuthRes === 'object';
}

const logger = new Logger('AadhaarXmlUtils');

/**
 * Utility class for handling XML operations specific to UIDAI Aadhaar API
 */
export class AadhaarXmlUtils {
  /**
   * Parses XML string to DOM document
   * @param xmlString XML content as string
   * @returns DOM Document or null if parsing fails
   */
  static parseXml(xmlString: string): Document | null {
    try {
      return new DOMParser().parseFromString(xmlString, 'text/xml');
    } catch (error) {
      logger.error(`Error parsing XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * Converts DOM document back to string
   * @param xmlDoc DOM Document to serialize
   * @returns XML string
   */
  static serializeXml(xmlDoc: Document): string {
    try {
      return new XMLSerializer().serializeToString(xmlDoc);
    } catch (error) {
      logger.error(`Error serializing XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return '';
    }
  }

  /**
   * Removes signature from XML if present
   * @param xmlString XML string that may contain a signature
   * @returns XML string with signature removed
   */
  static removeSignature(xmlString: string): string {
    try {
      return xmlString.replace(/<Signature.*?<\/Signature>/s, '');
    } catch (error) {
      logger.error(`Error removing signature: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return xmlString;
    }
  }

  /**
   * Builds an OTP request XML
   * @param uid Aadhaar number
   * @param txn Transaction ID
   * @param auaCode AUA code
   * @param subAuaCode Sub-AUA code
   * @param licenseKey AUA license key
   * @param terminalId Terminal ID (usually 'public')
   * @param apiVersion API version (default '2.5')
   * @returns XML string for OTP request
   */
  static buildOtpRequestXml(
    uid: string,
    txn: string,
    auaCode: string,
    subAuaCode: string,
    licenseKey: string,
    terminalId = 'public',
    apiVersion = '2.5'
  ): string {
    const timestamp = new Date().toISOString().slice(0, 19);
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<Otp uid="${uid}" ac="${auaCode}" sa="${subAuaCode}" ver="${apiVersion}" txn="${txn}" lk="${licenseKey}" tid="${terminalId}" ts="${timestamp}">
  <Opts ch="01" />
</Otp>`;
  }

  /**
   * Adds a signature to an XML document
   * @param xmlString XML string to sign
   * @param signature Signature as string
   * @param rootElementName Root element name (e.g., 'Auth' or 'Otp')
   * @returns Signed XML string
   */
  static addSignature(xmlString: string, signature: string, rootElementName: string): string {
    try {
      if (!signature) {
        logger.warn('No signature provided to add to XML');
        return xmlString;
      }
      
      // Using regex to find the closing tag of the root element
      const closingTagRegex = new RegExp(`</${rootElementName}>$`);
      if (!closingTagRegex.test(xmlString)) {
        logger.warn(`Could not find closing tag for ${rootElementName} in XML`);
        return xmlString;
      }
      
      // Insert signature before closing tag
      return xmlString.replace(closingTagRegex, `<Signature>${signature}</Signature></${rootElementName}>`);
    } catch (error) {
      logger.error(`Error adding signature: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return xmlString;
    }
  }

  /**
   * Extracts specific attribute from XML element
   * @param xmlString XML string to parse
   * @param elementName Element name to search for
   * @param attributeName Attribute name to extract
   * @returns Attribute value or null if not found
   */
  static extractAttribute(xmlString: string, elementName: string, attributeName: string): string | null {
    try {
      const regex = new RegExp(`<${elementName}[^>]*${attributeName}="([^"]*)"`, 'i');
      const match = xmlString.match(regex);
      return match ? match[1] : null;
    } catch (error) {
      logger.error(`Error extracting attribute: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }
} 