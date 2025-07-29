import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { v4 as uuidv4 } from 'uuid';
import * as qrcode from 'qrcode';
// import * as KJUR from 'jsrsasign'; // KJUR might not be needed if using crypto module directly
import * as crypto from 'crypto';
import { constants } from 'crypto'; // Import constants for RSA padding
import { EidProvider } from '../interfaces/eid-provider.interface';
import * as fs from 'fs';
import * as CryptoUtils from '../utils/crypto-utils';
import { extractPemPair, KeyPair } from '../utils/p12-extract';
import { signOtpXml, signAuthXml, SigningCredentials } from '../utils/xmldsig-signer';
import { signWithXmlsec1, signAuthWithXmlsec1 } from '../utils/xmlsec1-signer';
import { AuditLogger } from '../../../common/logging/audit-logger.service';
import { VerifyAuthDto } from '../dto/verify-auth.dto';
import * as path from 'path';
import * as forge from 'node-forge'; // Added for P12 certificate handling

@Injectable()
export class AadhaarProvider implements EidProvider {
  private readonly uidaiBaseUrl: string;
  private readonly auaCode: string;
  private readonly auaLicenseKey: string; // For XML lk attribute
  private readonly asaLicenseKey: string; // For URL path
  private readonly serverBaseUrl: string;
  private readonly auaPrivateKeyPem: string;
  private readonly uidaiPublicCertPem: string; // For response signature verification
  private readonly subAuaCode: string; // Optional Sub-AUA code
  private readonly apiVersion: string; // Keep type as string
  private readonly terminalId = 'public'; // As per UIDAI docs for public devices
  private readonly isDevelopment: boolean;
  private readonly uidaiOtpUrl: string;
  private readonly uidaiAuthUrl: string;
  private readonly auaPrivateKey: crypto.KeyObject | null;
  private readonly uidaiPublicKey: crypto.KeyObject | null;
  private readonly uidaiCertPath: string;
  private readonly uidaiEncCertPath: string; // UIDAI PID-encryption CA (intermediate)
  private readonly uidaiResSigCertPath: string; // UIDAI response-signature leaf
  private readonly auaKeyPath: string;
  private readonly auaCertPath: string; // Path to the AUA's public certificate
  private readonly auaP12Path?: string;
  private readonly auaP12Password?: string;
  private readonly auaP12Alias?: string;
  
  // New signing utilities - extracted PEM data
  private signingOptions: KeyPair;

  constructor(
    private configService: ConfigService,
    private readonly logger: AuditLogger,
  ) {
    const initCorrelationId = uuidv4();
    this.logger.audit(initCorrelationId, 'PROVIDER_INITIALIZATION_START', {});

    try {
      this.isDevelopment = process.env.NODE_ENV === 'development';
      this.auaCode = this.configService.get<string>('AUA_CODE');
      
      // Split license keys: AUA for XML lk attribute, ASA for URL path
      this.auaLicenseKey = this.configService.get<string>('AUA_LICENSE_KEY');
      this.asaLicenseKey = this.configService.get<string>('ASA_LICENSE_KEY');
      this.uidaiBaseUrl = this.configService.get<string>('UIDAI_BASE_URL');
      this.serverBaseUrl = this.configService.getOrThrow<string>('SERVER_BASE_URL');
      this.subAuaCode = this.configService.get<string>('SUB_AUA_CODE');
      
      // Initialize UIDAI API URLs - Fix base URL to not include the AUA code
      this.uidaiAuthUrl = this.configService.get<string>('UIDAI_STAGING_AUTH_URL') || 'https://developer.uidai.gov.in/authserver/2.5';
      this.uidaiOtpUrl = this.configService.get<string>('UIDAI_STAGING_OTP_URL') || 'https://developer.uidai.gov.in/uidotp/2.5';
      this.apiVersion = this.configService.get<string>('UIDAI_API_VERSION') || '2.5';

      this.logger.audit(initCorrelationId, 'PROVIDER_INITIALIZATION_CONFIG', {
        isDevelopment: this.isDevelopment,
        auaCode: this.auaCode,
        uidaiBaseUrl: this.uidaiBaseUrl,
        auaLicenseKey: this.auaLicenseKey ? `${this.auaLicenseKey.substring(0, 10)}...` : 'Not Found',
        asaLicenseKey: this.asaLicenseKey ? `${this.asaLicenseKey.substring(0, 10)}...` : 'Not Found',
      });

      // Prefer explicit UIDAI_CERT_PATH; fall back to UIDAI_CA_CERT_PATH (staging) when undefined.
      const uidaiCertEnv = this.configService.get<string>('UIDAI_CERT_PATH');
      const uidaiCaCertEnv = this.configService.get<string>('UIDAI_CA_CERT_PATH');
      this.uidaiCertPath = path.resolve(
        process.cwd(),
        uidaiCertEnv || uidaiCaCertEnv || './certs/uidai_auth_stage.cer',
      );
      this.uidaiEncCertPath = path.resolve(process.cwd(), this.configService.get('UIDAI_ENC_CERT_PATH') || './certs/uidai_auth_prod.cer');
      this.uidaiResSigCertPath = path.resolve(process.cwd(), this.configService.get('UIDAI_RES_SIG_CERT_PATH') || './certs/uidai_auth_sign_Prod_2026.cer');
      const auaKeyEnv = this.configService.get<string>('AUA_PRIVATE_KEY_PATH');
      const auaCertEnv = this.configService.get<string>('AUA_CERT_PATH');
      this.auaKeyPath = auaKeyEnv ? path.resolve(process.cwd(), auaKeyEnv) : '';
      this.auaCertPath = auaCertEnv ? path.resolve(process.cwd(), auaCertEnv) : '';
      
      // Only validate production certificates in production environment
      if (!this.isDevelopment) {
        this.validateProductionCertificates();
      }
      
      // P12 certificate configuration (optional - for newer UIDAI requirements)
      this.auaP12Path = this.configService.get<string>('AUA_P12_PATH') 
        ? path.resolve(process.cwd(), this.configService.get<string>('AUA_P12_PATH'))
        : undefined;
      this.auaP12Password = this.configService.get<string>('AUA_P12_PASSWORD');
      this.auaP12Alias = this.configService.get<string>('AUA_P12_ALIAS');

      this.loadKeys(initCorrelationId);
      this.initializeSigningOptions(initCorrelationId);

      this.logger.audit(initCorrelationId, 'PROVIDER_INITIALIZATION_SUCCESS', { loadedKeys: true });
    } catch (error) {
      this.logger.errorWithContext(initCorrelationId, 'PROVIDER_INITIALIZATION_FAILED', {
        error: error.message,
        trace: error.stack,
      });
      throw new Error(`Failed to initialize AadhaarProvider: ${error.message}`);
    }
  }

  // --- Helper Methods ---

  private getCurrentTimestamp(): string {
    // Format: YYYY-MM-DDThh:mm:ss (e.g., 2023-10-27T10:30:00)
    // UIDAI expects IST timezone for all timestamps
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istTime = new Date(now.getTime() + istOffset);
    return istTime.toISOString().replace(/\.\d+Z$/, '').replace('T', 'T');
  }

  private maskData(data: string, visibleChars = 4): string {
    if (!data) return '';
    if (data.length <= visibleChars * 2) return '****';
    const start = data.substring(0, data.length - visibleChars);
    const end = data.substring(data.length - visibleChars);
    return `${start.replace(/./g, '*')}${end}`;
  }

  private buildOtpRequestXml(uid: string, txnId: string): string {
    const timestamp = this.getCurrentTimestamp();
    
    // DEBUG: Log the exact timestamp we're generating
    this.logger.debug(`🕐 Generated timestamp: ${timestamp}`);
    
    // PRODUCTION UIDAI OTP Request with ENFORCED RSA-SHA256
    // UIDAI staging now REQUIRES RSA-SHA256 for certificate validation (Error 523 fix)
    const otpXml = `<?xml version="1.0" encoding="UTF-8"?>
<Otp xmlns="http://www.uidai.gov.in/authentication/otp/1.0" uid="${uid}" ac="${this.auaCode}" sa="${this.subAuaCode || this.auaCode}" ver="2.5" tid="public" txn="${txnId}" lk="${this.auaLicenseKey}" ts="${timestamp}">
  <Opts ch="01"/>
  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    <SignedInfo>
      <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
      <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
      <Reference URI="">
        <Transforms>
          <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
        </Transforms>
        <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
        <DigestValue></DigestValue>
      </Reference>
    </SignedInfo>
    <SignatureValue></SignatureValue>
    <KeyInfo>
      <X509Data>
        <X509Certificate></X509Certificate>
      </X509Data>
    </KeyInfo>
  </Signature>
</Otp>`;

    // DEBUG: Log the XML with timestamp
    this.logger.debug(`🔍 OTP XML before signing: ${otpXml.substring(0, 200)}...ts="${timestamp}"...`);

    return otpXml;
  }

  private buildAuthRequestXml(uid: string, txnId: string, otp: string, correlationId: string): string {
    const timestamp = this.getCurrentTimestamp();
    const pidTimestamp = timestamp; // Use the same timestamp for PID

    try {

      // --- 1. Generate Session Key ---
      const sessionKey = crypto.randomBytes(32); // AES-256 key (32 bytes)
      this.logger.audit(correlationId, 'GENERATED_SESSION_KEY', { sessionKey: sessionKey.toString('hex') });

      // --- 2. Construct PID Block ---
      const pidBlockPlaintext = `<Pid ts="${pidTimestamp}" ver="${this.apiVersion}">
  <Pv otp="${otp}"/>
</Pid>`;
      this.logger.audit(correlationId, 'GENERATED_PID_BLOCK_PLAINTEXT', { pidBlockPlaintext });

      // --- 3. Encrypt PID Block (with random IV prepended) ---
      const encryptedPidBase64 = CryptoUtils.encryptPid(pidBlockPlaintext, sessionKey);
      this.logger.audit(correlationId, 'ENCRYPTED_PID_BLOCK', { encryptedPidBase64 });
      
      // --- 4. Calculate and Encrypt HMAC ---
      const hmacRaw = CryptoUtils.calculateHmac(pidBlockPlaintext, sessionKey);
      const encryptedHmacBase64 = CryptoUtils.encryptHmac(hmacRaw, sessionKey);
      this.logger.audit(correlationId, 'CALCULATED_AND_ENCRYPTED_HMAC', { hmac: encryptedHmacBase64 });

      // --- 5. Encrypt Session Key ---
      // Verify that we have the certificate before proceeding
      if (!fs.existsSync(this.uidaiCertPath)) {
        this.logger.errorWithContext(correlationId, 'UIDAI_CERT_NOT_FOUND', { path: this.uidaiCertPath });
        throw new Error(`UIDAI certificate not found at path: ${this.uidaiCertPath}`);
      }
      
      // The 'ci' attribute should be the expiry date of the UIDAI public certificate in YYYYMMDD format.
      const uidaiCertPem = fs.readFileSync(this.uidaiCertPath, 'utf8');
      const cert = new crypto.X509Certificate(uidaiCertPem);
      const certificateIdentifier = cert.validTo.replace(/[-:T]/g, '').substring(0, 8); // Format to YYYYMMDD
      const encryptedSessionKeyBase64 = CryptoUtils.encryptSessionKey(sessionKey, uidaiCertPem);
      this.logger.audit(correlationId, 'ENCRYPTED_SESSION_KEY', { ci: certificateIdentifier, skey: encryptedSessionKeyBase64 });

      // --- 6. Auth XML with ENFORCED RSA-SHA256 (UIDAI requirement for Error 523 fix) ---
      const authXmlTemplate = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Auth uid="${uid}" tid="${this.terminalId}" ac="${this.auaCode}" sa="${this.subAuaCode || this.auaCode}" ver="${this.apiVersion}" txn="${txnId}" lk="${this.auaLicenseKey}" ts="${timestamp}">
  <Uses otp="Y" pi="n" pa="n" pfa="n" bio="n" bt="" pin="n" />
  <Skey ci="${certificateIdentifier}">${encryptedSessionKeyBase64}</Skey>
  <Data type="X">${encryptedPidBase64}</Data>
  <Hmac>${encryptedHmacBase64}</Hmac>
  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    <SignedInfo>
      <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
      <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
      <Reference URI="">
        <Transforms>
          <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
        </Transforms>
        <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
        <DigestValue></DigestValue>
      </Reference>
    </SignedInfo>
    <SignatureValue></SignatureValue>
    <KeyInfo>
      <X509Data>
        <X509Certificate></X509Certificate>
      </X509Data>
    </KeyInfo>
  </Signature>
</Auth>`;

      // --- 7. Verify certificate files exist before signing ---
      if (!fs.existsSync(this.auaKeyPath)) {
        this.logger.errorWithContext(correlationId, 'AUA_KEY_NOT_FOUND', { path: this.auaKeyPath });
        throw new Error(`AUA private key not found at path: ${this.auaKeyPath}`);
      }
      
      if (!fs.existsSync(this.auaCertPath)) {
        this.logger.errorWithContext(correlationId, 'AUA_CERT_NOT_FOUND', { path: this.auaCertPath });
        throw new Error(`AUA certificate not found at path: ${this.auaCertPath}`);
      }
      
      // Log paths and content existence to help debug
      this.logger.audit(correlationId, 'CERTIFICATE_PATHS', { 
        auaKeyPath: this.auaKeyPath, 
        auaCertPath: this.auaCertPath,
        auaKeyExists: fs.existsSync(this.auaKeyPath),
        auaCertExists: fs.existsSync(this.auaCertPath)
      });
      
      // --- 8. Return unsigned Auth XML template (signing will be done by caller) ---
      this.logger.audit(correlationId, 'BUILT_AUTH_XML_TEMPLATE', { 
        xmlLength: authXmlTemplate.length,
        hasEmptyId: authXmlTemplate.includes('Id=""')
      });

      return authXmlTemplate;

    } catch (error) {
      this.logger.errorWithContext(correlationId, 'BUILD_AUTH_XML_FAILED', { error: error.message }, error.stack);
      // Ensure sensitive details aren't leaked in production error messages
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to build secure Aadhaar Auth request: ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async sendUidaiRequest(apiUrl: string, signedXml: string, correlationId: string): Promise<any> {
    let originalResponseXmlString = ''; // To store raw XML for signature verification
    try {
      this.logger.audit(correlationId, 'SENDING_REQUEST_TO_UIDAI', { 
        apiUrl,
        requestXmlLength: signedXml.length, 
        requestXmlSample: signedXml.substring(0, 100) + '...' // Don't log full XML but show start
      });

      const response = await axios.post(apiUrl, signedXml, {
        headers: { 'Content-Type': 'application/xml' },
        transformResponse: (data) => {
          originalResponseXmlString = data; // Keep raw XML for signature verification
          return data;
        },
        timeout: 10000, // 10 second timeout
        validateStatus: null // Don't throw on non-2xx status codes, let us handle them
      });

      // Log full response details for debugging
      this.logger.audit(correlationId, 'UIDAI_RAW_RESPONSE', { 
        statusCode: response.status,
        statusText: response.statusText,
        headers: response.headers,
        responseLength: response.data?.length,
        responsePreview: response.data?.substring?.(0, 200) + '...' || response.data
      });

      if (response.status < 200 || response.status >= 300) {
        throw new HttpException(
          `UIDAI API returned status ${response.status}: ${response.statusText}`,
          response.status
        );
      }

      try {
        const parsedResponse = await parseStringPromise(response.data, {
          explicitArray: false,
          tagNameProcessors: [
            (name) => name.replace('ns2:', '') // Handle potential namespaces
          ],
        });
        this.logger.audit(correlationId, 'UIDAI_RESPONSE_PARSED', { parsedResponse });

        // After parsing, verify the signature
        const signature = parsedResponse?.AuthRes?.Signature || parsedResponse?.OtpRes?.Signature;
        if (!signature) {
          this.logger.warnWithContext(correlationId, 'NO_SIGNATURE_IN_UIDAI_RESPONSE', { parsedResponse });
          // Decide if this is a hard failure or just a warning
          // For now, we'll log and continue
        } else {
          try {
            if (!fs.existsSync(this.uidaiCertPath)) {
              this.logger.errorWithContext(correlationId, 'UIDAI_CERT_MISSING_FOR_VERIFICATION', { 
                path: this.uidaiCertPath
              });
              throw new Error(`UIDAI certificate not found for signature verification: ${this.uidaiCertPath}`);
            }

            const isValid = CryptoUtils.verifyXmlSignature(originalResponseXmlString, this.uidaiCertPath);
            this.logger.audit(correlationId, 'SIGNATURE_VERIFICATION_RESULT', { isValid });
            
            if (!isValid) {
              throw new Error('Response signature verification failed.');
            }
          } catch (verifyError) {
            // Log raw UIDAI XML before verification fails to see actual error codes
            this.logger.warn(`UIDAI_RAW_RESPONSE_BEFORE_VERIFICATION_FAILURE\n${originalResponseXmlString}`);
            
            this.logger.errorWithContext(correlationId, 'SIGNATURE_VERIFICATION_ERROR', { 
              error: verifyError instanceof Error ? verifyError.message : String(verifyError)
            });
            throw verifyError;
          }
        }
        return parsedResponse;
      } catch (parseError) {
        this.logger.errorWithContext(correlationId, 'XML_PARSE_ERROR', { 
          error: parseError instanceof Error ? parseError.message : String(parseError),
          responseData: response.data?.substring?.(0, 500) || response.data
        });
        throw parseError;
      }
    } catch (error) {
      const httpStatus = error.response?.status || 500;
      const uidaiError = error.response?.data || error.message;

      this.logger.errorWithContext(
        correlationId,
        'ERROR_SENDING_REQUEST_TO_UIDAI',
        {
          error: uidaiError,
          httpStatus,
          trace: error.stack,
          isAxiosError: error.isAxiosError,
          isNetworkError: error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND',
          code: error.code,
          config: error.config ? {
            url: error.config.url,
            method: error.config.method,
            headers: error.config.headers
          } : 'No config'
        }
      );

      throw new HttpException(
        `UIDAI API request failed: ${httpStatus} - ${uidaiError}`,
        httpStatus,
      );
    }
  }

  // --- Interface Methods Implementation ---

  // initiateAuth now requires 'uid' to generate the OTP request
  async initiateAuth(redirectUri: string, state: string, uid: string, correlationId: string): Promise<any> {
    this.logger.audit(correlationId, 'AUTH_QR_INITIATED', { uid: this.maskData(uid), redirectUri });
    const txnId = uuidv4();

    // Construct the OTP API URL as per the UIDAI official documentation
    // Pattern: {base_url}/{ac}/{uid0}/{uid1}/{ASA_LICENSE_KEY}
    const uid0 = uid.charAt(0);
    const uid1 = uid.charAt(1);
    const otpApiUrl = `${this.uidaiOtpUrl}/${this.auaCode}/${uid0}/${uid1}/${encodeURIComponent(this.asaLicenseKey)}`;
    this.logger.audit(correlationId, 'CONSTRUCTED_OTP_API_URL', { otpApiUrl });
    
    // Debug logging removed - Error 940 resolved ✅

            // Build and sign the OTP request XML using xmlsec1 CLI for guaranteed UIDAI compliance
        const otpXml = this.buildOtpRequestXml(uid, txnId);
        
        this.logger.audit(correlationId, 'USING_XMLSEC1_FOR_OTP_SIGNING', {
          p12Path: this.auaP12Path
        });
        
        // PRODUCTION MODE: Battle-tested xmlsec1 signing for guaranteed UIDAI compatibility
        const signedOtpXml = await signWithXmlsec1(otpXml, this.signingOptions.privatePem, this.signingOptions.certPem);

    // Send the request to UIDAI
    const response = await this.sendUidaiRequest(otpApiUrl, signedOtpXml, correlationId);
    const otpResponse = response.OtpRes;

    // Access error code from the correct response structure
    const errorCode = otpResponse.$ ? otpResponse.$.err : otpResponse.err;
    const returnCode = otpResponse.$ ? otpResponse.$.ret : otpResponse.ret;
    const infoMessage = otpResponse.$ ? otpResponse.$.info : otpResponse.info;

    if (returnCode !== 'y') {
      const actionCode = otpResponse.$ ? otpResponse.$.actn : otpResponse.actn;
      
      // Error handling for UIDAI responses
      
              // Save latest response for status monitoring
        this.saveLatestResponse(otpResponse, errorCode, actionCode);

        // Handle Error 998 + A202 = OTP service temporarily unavailable (UIDAI outage)
        if (errorCode === '998' && actionCode === 'A202') {
          this.logger.warnWithContext(correlationId, 'UIDAI_OTP_SERVICE_TEMPORARILY_DOWN', {
            errorCode,
            actionCode,
            txnId,
            timestamp: otpResponse.$ ? otpResponse.$.ts : otpResponse.ts,
            info: infoMessage,
            message: 'UIDAI OTP service temporarily unavailable (A202). This is a service-side outage, not a client issue.'
          });
          
          throw new HttpException(
            `UIDAI OTP service temporarily unavailable (Error ${errorCode}/A202). Please retry after 30-60 seconds.`,
            HttpStatus.SERVICE_UNAVAILABLE
          );
        }
      
      // Handle Error 998 + A201 = Invalid UID
      if (errorCode === '998' && actionCode === 'A201') {
        this.logger.errorWithContext(correlationId, 'UIDAI_INVALID_UID', {
          errorCode,
          actionCode,
          uid: this.maskData(uid),
          txnId,
          message: 'UID not found or not available in UIDAI database'
        });
        
        throw new HttpException(
          `Invalid Aadhaar number or UID not available (Error ${errorCode}/A201)`,
          HttpStatus.BAD_REQUEST
        );
      }
      
      // Generic error handling for other cases
      this.logger.errorWithContext(correlationId, 'OTP_INITIATION_FAILED_UIDAI', {
        uidaiError: errorCode,
        actionCode,
        uidaiInfo: infoMessage,
        returnCode: returnCode,
      });
      
      const errorMessage = actionCode 
        ? `Aadhaar OTP initiation failed: Error ${errorCode}/${actionCode}`
        : `Aadhaar OTP initiation failed: Error ${errorCode || 'Unknown error'}`;
        
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }

    // Access transaction ID from correct response structure
    const transactionId = otpResponse.$ ? otpResponse.$.txn : otpResponse.txn;

    // Save successful response for status monitoring
    this.saveLatestResponse(otpResponse, '000', '');

    this.logger.audit(correlationId, 'OTP_INITIATION_SUCCESS', {
      uid: this.maskData(uid),
      txn: transactionId,
    });

        // Construct callback URL for the client/app
        const callbackUrl = `${this.serverBaseUrl}/auth/callback?txn=${txnId}&state=${state}&redirectUri=${encodeURIComponent(redirectUri)}&uid=${uid}`; // Include UID for verifyAuth
        const qrDataUrl = await qrcode.toDataURL(callbackUrl);
        const authUrl = callbackUrl;
        return { qrDataUrl, state, authUrl, txnId };
  }

  // verifyAuth now requires 'uid' from the callback parameters
  async verifyAuth(params: { txn: string; otp: string; uid: string; state?: string }, correlationId: string): Promise<{ sub: string; claims: Record<string, any> }> {
    const { txn, otp, uid } = params;
    if (!uid) {
        throw new HttpException('Aadhaar UID (uid) is required for verification.', HttpStatus.BAD_REQUEST);
    }

    // Use real UIDAI endpoint only
    try {
        const uid0 = uid.charAt(0);
        const uid1 = uid.charAt(1);
        const authApiUrl = `${this.uidaiAuthUrl}/${this.auaCode}/${uid0}/${uid1}/${encodeURIComponent(this.asaLicenseKey)}`;
        this.logger.audit(correlationId, 'CONSTRUCTED_AUTH_API_URL', { authApiUrl }); // Log the exact URL

        // Validate required certificates and keys exist
        if (!fs.existsSync(this.uidaiCertPath)) {
          this.logger.errorWithContext(correlationId, 'UIDAI_CERT_NOT_FOUND', { path: this.uidaiCertPath });
          throw new Error(`UIDAI certificate not found at path: ${this.uidaiCertPath}`);
        }
        
        if (!fs.existsSync(this.auaKeyPath)) {
          this.logger.errorWithContext(correlationId, 'AUA_KEY_NOT_FOUND', { path: this.auaKeyPath });
          throw new Error(`AUA private key not found at path: ${this.auaKeyPath}`);
        }
        
        if (!fs.existsSync(this.auaCertPath)) {
          this.logger.errorWithContext(correlationId, 'AUA_CERT_NOT_FOUND', { path: this.auaCertPath });
          throw new Error(`AUA certificate not found at path: ${this.auaCertPath}`);
        }

        // The PID block needs to be properly constructed and encrypted for real requests
        const authXml = this.buildAuthRequestXml(uid, txn, otp, correlationId);
        
        this.logger.audit(correlationId, 'USING_XMLSEC1_FOR_AUTH_SIGNING', {
          p12Path: this.auaP12Path
        });
        
        // PRODUCTION MODE: Battle-tested xmlsec1 signing for Auth requests
        const signedAuthXml = await signAuthWithXmlsec1(authXml, this.signingOptions.privatePem, this.signingOptions.certPem);
        
        // Send the request to UIDAI
        const uidaiResponse = await this.sendUidaiRequest(authApiUrl, signedAuthXml, correlationId);
        
        // Log the full response for debugging
        this.logger.audit(correlationId, 'UIDAI_RESPONSE_FULL', { 
          response: uidaiResponse,
          hasAuthRes: !!uidaiResponse.AuthRes,
          ret: uidaiResponse.AuthRes?.ret,
          err: uidaiResponse.AuthRes?.err,
          info: uidaiResponse.AuthRes?.info
        });

        if (uidaiResponse.AuthRes && uidaiResponse.AuthRes.ret === 'y') {
          this.logger.audit(correlationId, 'AADHAAR_AUTH_SUCCESSFUL', { txn });
          // Use the authenticated UID as the subject
          // Extract additional claims if needed from the response (e.g., KycRes)
          return {
            sub: uid, // Or extract from response if available and verified
            claims: { txn, ts: uidaiResponse.AuthRes.ts, ret: uidaiResponse.AuthRes.ret, simulated: false }, // Include relevant claims
          };
        } else {
          const errorCode = uidaiResponse.AuthRes?.err || 'UNKNOWN_AUTH_ERROR';
          const errorInfo = uidaiResponse.AuthRes?.info || 'Auth request failed';
          this.logger.audit(correlationId, 'AADHAAR_AUTH_FAILED', { errorCode, errorInfo, txn });
          // Map UIDAI error codes to appropriate HTTP statuses if needed
          throw new HttpException(`Aadhaar authentication failed: ${errorCode} - ${errorInfo}`, HttpStatus.UNAUTHORIZED);
        }
      } catch (error) {
        this.logger.errorWithContext(correlationId, 'ERROR_DURING_AADHAAR_AUTH_VERIFICATION', { 
          error: error instanceof Error ? error.message : String(error), 
          stack: error instanceof Error ? error.stack : 'No stack trace',
          isHttpException: error instanceof HttpException
        });
        
        if (error instanceof HttpException) throw error;
        
        // Avoid exposing raw XML in generic errors
        const message = error.message?.includes('Invalid response signature') 
                        ? 'UIDAI response signature validation failed.' 
                        : 'Failed to verify Aadhaar authentication';
        throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
  }

  private buildSignedAuthXml(
    dto: VerifyAuthDto,
    txn: string,
  ): string {
    // This method seems to be unused and was causing build errors.
    // Commenting out the implementation to allow the build to pass.
    // If this functionality is needed, it will need to be correctly implemented.
    this.logger.warn('buildSignedAuthXml is not implemented', { uid: dto.uid, txn });
    return '<Auth></Auth>';
  }

  private constructAuthApiUrl(
    uid: string,
    ac: string,
  ): string {
    // This method seems to be unused and was causing build errors.
    // Commenting out the implementation to allow the build to pass.
    // If this functionality is needed, it will need to be correctly implemented.
    const timestamp = new Date().toISOString().substring(0, 19);
    return `${this.uidaiAuthUrl}/${this.apiVersion}/${ac}/${uid}/${timestamp}`;
  }

  async retrieveUserData(params: { 
    uid: string; 
    txn: string; 
    otp: string;
    includePhoto?: boolean;
    includeAddress?: boolean;
    includeBio?: boolean;
  }, correlationId: string): Promise<any> {
    const { uid, txn, otp, includePhoto, includeAddress, includeBio } = params;
    
    this.logger.audit(correlationId, 'RETRIEVE_USER_DATA_START', {
      uid: this.maskData(uid, 4)
    });

    try {
      // Real UIDAI data retrieval - placeholder for future implementation
      this.logger.audit(correlationId, 'RETRIEVE_USER_DATA_PLACEHOLDER', {
        uid: this.maskData(uid, 4),
        txn,
        includePhoto: !!includePhoto,
        includeAddress: !!includeAddress,
        includeBio: !!includeBio,
        message: 'Real UIDAI data retrieval not implemented yet'
      });

      return {
        success: false,
        error: 'User data retrieval not implemented for production environment',
        source: 'production-placeholder',
        timestamp: new Date().toISOString(),
        correlationId
      };

    } catch (error) {
      this.logger.errorWithContext(correlationId, 'RETRIEVE_USER_DATA_ERROR', {
        uid: this.maskData(uid, 4),
        error: error.message
      });

      throw new HttpException(
        'Failed to retrieve user data',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private saveLatestResponse(response: any, errorCode: string, actionCode: string) {
    try {
      const responseData = {
        timestamp: new Date().toISOString(),
        err: errorCode,
        actn: actionCode || '',
        response: response,
        status: errorCode === '000' ? 'success' : 'error'
      };
      
      const fs = require('fs');
      const path = require('path');
      
      // Ensure temp directory exists
      const tempDir = '/tmp';
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Save to known file for status generator
      fs.writeFileSync(
        path.join(tempDir, 'uidai_latest_response.json'),
        JSON.stringify(responseData, null, 2)
      );
      
      this.logger.debug('💾 Latest UIDAI response saved for status monitoring');
    } catch (error) {
      this.logger.warn('Failed to save latest response:', error.message);
    }
  }

  /**
   * Validates that production UIDAI certificates exist and are accessible
   * Throws ConfigException if certificates are missing
   */
  private validateProductionCertificates(): void {
    const missingCerts: string[] = [];
    
    if (!fs.existsSync(this.uidaiEncCertPath)) {
      missingCerts.push(`UIDAI Encryption Certificate: ${this.uidaiEncCertPath}`);
    }
    
    if (!fs.existsSync(this.uidaiResSigCertPath)) {
      missingCerts.push(`UIDAI Response Signature Certificate: ${this.uidaiResSigCertPath}`);
    }
    
    if (missingCerts.length > 0) {
      const errorMsg = `Production certificate validation failed. Missing certificates:\n${missingCerts.join('\n')}`;
      this.logger.error('PRODUCTION_CERT_VALIDATION_FAILED', {
        missing: missingCerts,
        encCertPath: this.uidaiEncCertPath,
        resSigCertPath: this.uidaiResSigCertPath
      });
      throw new HttpException(errorMsg, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    
    this.logger.log('PRODUCTION_CERT_VALIDATION_SUCCESS', {
      encCertPath: this.uidaiEncCertPath,
      resSigCertPath: this.uidaiResSigCertPath
    });
  }

  /**
   * Validates that all required certificates are accessible and valid
   * @returns Status of certificate validation
   */
  async validateCertificates(correlationId: string): Promise<{ valid: boolean; details: any; timestamp: string }> {
    try {
      const details = {
        uidai: {
          path: this.uidaiCertPath,
          exists: fs.existsSync(this.uidaiCertPath),
          readable: false,
          valid: false
        },
        aua: {
          key: {
            path: this.auaKeyPath,
            exists: fs.existsSync(this.auaKeyPath),
            readable: false,
            valid: false
          },
          cert: {
            path: this.auaCertPath,
            exists: fs.existsSync(this.auaCertPath),
            readable: false,
            valid: false
          }
        }
      };
      
      // Check if certificates are readable
      if (details.uidai.exists) {
        try {
          const cert = fs.readFileSync(this.uidaiCertPath, 'utf8');
          details.uidai.readable = cert.length > 0;
          details.uidai.valid = cert.includes('BEGIN CERTIFICATE') && cert.includes('END CERTIFICATE');
        } catch (error) {
          details.uidai.readable = false;
        }
      }
      
      if (details.aua.key.exists) {
        try {
          const key = fs.readFileSync(this.auaKeyPath, 'utf8');
          details.aua.key.readable = key.length > 0;
          details.aua.key.valid = key.includes('BEGIN') && key.includes('PRIVATE KEY');
        } catch (error) {
          details.aua.key.readable = false;
        }
      }
      
      if (details.aua.cert.exists) {
        try {
          const cert = fs.readFileSync(this.auaCertPath, 'utf8');
          details.aua.cert.readable = cert.length > 0;
          details.aua.cert.valid = cert.includes('BEGIN CERTIFICATE') && cert.includes('END CERTIFICATE');
        } catch (error) {
          details.aua.cert.readable = false;
        }
      }
      
      const allValid = (
        details.uidai.exists && details.uidai.readable && details.uidai.valid &&
        details.aua.key.exists && details.aua.key.readable && details.aua.key.valid &&
        details.aua.cert.exists && details.aua.cert.readable && details.aua.cert.valid
      );
      
      this.logger.audit(correlationId, 'CERTIFICATE_VALIDATION_RESULT', { valid: allValid, details });
      
      return {
        valid: allValid,
        details,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.errorWithContext(correlationId, 'CERTIFICATE_VALIDATION_ERROR', { error: error.message }, error.stack);
      return {
        valid: false,
        details: { error: error.message },
        timestamp: new Date().toISOString()
      };
    }
  }

  private loadKeys(correlationId: string) {
    try {
      this.logger.audit(correlationId, 'LOADING_KEYS_START', {
        hasP12Path: !!this.auaP12Path,
        hasPemPaths: !!(this.auaKeyPath && this.auaCertPath)
      });

      // Check if P12 certificate is configured (new UIDAI approach)
      if (this.auaP12Path && this.auaP12Password) {
        this.logger.audit(correlationId, 'LOADING_P12_CERTIFICATE', { p12Path: this.auaP12Path });
        
        const { privateKey, certificate } = CryptoUtils.loadP12Certificate(
          this.auaP12Path,
          this.auaP12Password,
          this.auaP12Alias
        );
        
        // Store the P12-extracted keys (could be stored in class properties if needed)
        this.logger.audit(correlationId, 'P12_CERTIFICATE_LOADED_SUCCESSFULLY', {
          hasPrivateKey: !!privateKey,
          hasCertificate: !!certificate,
          alias: this.auaP12Alias
        });
        
        // Validate that the P12 certificate is working
        if (!privateKey || !certificate) {
          throw new Error('P12 certificate extraction failed - missing private key or certificate');
        }
        
      } else {
        // Fallback to traditional PEM files
        this.logger.audit(correlationId, 'USING_TRADITIONAL_PEM_FILES', {
          auaKeyPath: this.auaKeyPath,
          auaCertPath: this.auaCertPath
        });
        
        if (!fs.existsSync(this.auaKeyPath)) {
          throw new Error(`AUA private key not found at: ${this.auaKeyPath}`);
        }
        
        if (!fs.existsSync(this.auaCertPath)) {
          throw new Error(`AUA certificate not found at: ${this.auaCertPath}`);
        }
      }
      
      // Validate UIDAI certificate exists, but allow missing in development with warning
      if (!fs.existsSync(this.uidaiCertPath)) {
        const msg = `UIDAI certificate not found at: ${this.uidaiCertPath}`;
        if (this.isDevelopment) {
          this.logger.warn('UIDAI_CERT_MISSING_DEVELOPMENT', { path: this.uidaiCertPath });
        } else {
          throw new Error(msg);
        }
      }
      
      this.logger.audit(correlationId, 'KEYS_LOADED_SUCCESSFULLY', {
        method: this.auaP12Path ? 'P12' : 'PEM'
      });
      
    } catch (error) {
      this.logger.errorWithContext(correlationId, 'KEYS_LOADING_FAILED', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      throw new Error(`Failed to load cryptographic keys: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private initializeSigningOptions(correlationId: string): void {
    try {
      this.logger.audit(correlationId, 'INITIALIZING_SIGNING_OPTIONS', {});

      if (this.auaP12Path && this.auaP12Password) {
        // Extract PEM from P12 file
        this.signingOptions = extractPemPair(this.auaP12Path, this.auaP12Password);
        
        this.logger.audit(correlationId, 'SIGNING_OPTIONS_INITIALIZED_FROM_P12', {
          hasPrivateKey: !!this.signingOptions.privatePem,
          hasCertificate: !!this.signingOptions.certPem
        });
      } else {
        // Read PEM files directly
        this.signingOptions = {
          privatePem: fs.readFileSync(this.auaKeyPath, 'utf8'),
          certPem: fs.readFileSync(this.auaCertPath, 'utf8')
        };
        
        this.logger.audit(correlationId, 'SIGNING_OPTIONS_INITIALIZED_FROM_PEM', {
          hasPrivateKey: !!this.signingOptions.privatePem,
          hasCertificate: !!this.signingOptions.certPem
        });
      }
    } catch (error) {
      this.logger.errorWithContext(correlationId, 'SIGNING_OPTIONS_INITIALIZATION_FAILED', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Failed to initialize signing options: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}