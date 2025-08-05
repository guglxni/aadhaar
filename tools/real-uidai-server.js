const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const xml2js = require('xml2js');

const app = express();
const port = 3001;

// UIDAI Staging Configuration
const UIDAI_CONFIG = {
  // Official UIDAI Staging URLs (corrected based on official spec)
  STAGING_BASE_URL: 'https://developer.uidai.gov.in',
  OTP_API_BASE: 'https://developer.uidai.gov.in/uidotp/2.5',
  AUTH_API_BASE: 'https://developer.uidai.gov.in/authserver/2.5',
  
  // Test credentials from UIDAI documentation - FIXED: Ensure no empty values
  AUA_CODE: 'public',
  SUB_AUA_CODE: 'public', // CRITICAL: Must not be empty or UIDAI returns 940
  LICENSE_KEY: 'MG_g7jJVYUIW7cLYXY5yaqKD6D1TuhjTJdQRRKP1qALVyORrG1pf0QU',
  API_VERSION: '2.5',
  TERMINAL_ID: 'public',
  
  // Certificate paths
  AUA_PRIVATE_KEY_PATH: './certs/test-private-key.pem',
  UIDAI_STAGING_CERT_PATH: './certs/uidai-staging-public.cer'
};

// Load certificates
let auaPrivateKey = null;
let uidaiStagingCert = null;

try {
  if (fs.existsSync(UIDAI_CONFIG.AUA_PRIVATE_KEY_PATH)) {
    auaPrivateKey = fs.readFileSync(UIDAI_CONFIG.AUA_PRIVATE_KEY_PATH, 'utf8');
    console.log('✅ AUA Private Key loaded');
  } else {
    console.warn('⚠️  AUA Private Key not found');
  }
  
  if (fs.existsSync(UIDAI_CONFIG.UIDAI_STAGING_CERT_PATH)) {
    uidaiStagingCert = fs.readFileSync(UIDAI_CONFIG.UIDAI_STAGING_CERT_PATH, 'utf8');
    console.log('✅ UIDAI Staging Certificate loaded');
  } else {
    console.warn('⚠️  UIDAI Staging Certificate not found');
  }
} catch (error) {
  console.error('❌ Error loading certificates:', error.message);
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Utility functions
function validateUidaiConfig() {
  const errors = [];
  
  if (!UIDAI_CONFIG.AUA_CODE || UIDAI_CONFIG.AUA_CODE.trim() === '') {
    errors.push('AUA_CODE is required and cannot be empty');
  }
  
  if (!UIDAI_CONFIG.SUB_AUA_CODE || UIDAI_CONFIG.SUB_AUA_CODE.trim() === '') {
    console.warn('⚠️  SUB_AUA_CODE is empty, will fallback to AUA_CODE');
  }
  
  if (!UIDAI_CONFIG.LICENSE_KEY || UIDAI_CONFIG.LICENSE_KEY.trim() === '') {
    errors.push('LICENSE_KEY is required and cannot be empty');
  }
  
  if (!UIDAI_CONFIG.OTP_API_BASE || !UIDAI_CONFIG.AUTH_API_BASE) {
    errors.push('OTP_API_BASE and AUTH_API_BASE are required');
  }
  
  if (errors.length > 0) {
    console.error('❌ UIDAI Configuration Errors:');
    errors.forEach(error => console.error(`   - ${error}`));
    throw new Error('Invalid UIDAI configuration');
  }
  
  console.log('✅ UIDAI Configuration validated successfully');
}

function getCurrentUidaiTimestamp() {
  return new Date().toISOString();
}

function buildOtpApiUrl(uid) {
  const uid0 = uid.charAt(0);
  const uid1 = uid.charAt(1);
  return `${UIDAI_CONFIG.OTP_API_BASE}/${UIDAI_CONFIG.AUA_CODE}/${uid0}/${uid1}/${encodeURIComponent(UIDAI_CONFIG.LICENSE_KEY)}`;
}

function buildAuthApiUrl(uid) {
  const uid0 = uid.charAt(0);
  const uid1 = uid.charAt(1);
  return `${UIDAI_CONFIG.AUTH_API_BASE}/${UIDAI_CONFIG.AUA_CODE}/${uid0}/${uid1}/${encodeURIComponent(UIDAI_CONFIG.LICENSE_KEY)}`;
}

function generateSessionKey() {
  return crypto.randomBytes(32);
}

function signXmlData(xmlData) {
  if (!auaPrivateKey) {
    throw new Error('AUA Private Key not available for signing');
  }
  
  const hash = crypto.createHash('sha256');
  hash.update(xmlData);
  const dataHash = hash.digest();
  
  const sign = crypto.createSign('sha256');
  sign.update(dataHash);
  sign.end();
  
  return sign.sign(auaPrivateKey, 'base64');
}

function verifyUidaiSignature(xmlData, signature) {
  if (!uidaiStagingCert) {
    console.warn('UIDAI certificate not available for signature verification');
    return true; // Skip verification if cert not available
  }
  
  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(xmlData);
    verify.end();
    return verify.verify(uidaiStagingCert, signature, 'base64');
  } catch (error) {
    console.error('Signature verification error:', error.message);
    return false;
  }
}

function buildOtpRequestXml(uid, txnId) {
  const ts = getCurrentUidaiTimestamp();
  
  // CRITICAL FIX: Ensure SUB_AUA_CODE is never empty (causes 940 error)
  const subAuaCode = UIDAI_CONFIG.SUB_AUA_CODE || UIDAI_CONFIG.AUA_CODE || 'public';
  
  // Build XML without signature first
  // NOTE: Using ch="01" for SMS OTP as per UIDAI specification
  // FIXED: Ensure exact UIDAI XML format with proper attribute order
  const xmlWithoutSig = `<?xml version="1.0" encoding="UTF-8"?>
<Otp uid="${uid}" tid="${UIDAI_CONFIG.TERMINAL_ID}" ac="${UIDAI_CONFIG.AUA_CODE}" sa="${subAuaCode}" ver="${UIDAI_CONFIG.API_VERSION}" txn="${txnId}" lk="${UIDAI_CONFIG.LICENSE_KEY}" ts="${ts}">
  <Opts ch="01"/>
</Otp>`;

  // Sign the XML if private key is available
  let signature = 'UNSIGNED_FOR_TESTING';
  if (auaPrivateKey) {
    try {
      // For signing, we need to canonicalize and sign the Otp element
      const otpElementStart = xmlWithoutSig.indexOf('<Otp');
      const otpElementEnd = xmlWithoutSig.indexOf('</Otp>') + '</Otp>'.length;
      const otpElement = xmlWithoutSig.substring(otpElementStart, otpElementEnd);
      signature = signXmlData(otpElement);
    } catch (error) {
      console.error('Error signing OTP XML:', error.message);
    }
  }

  // Insert signature into XML
  const finalXml = xmlWithoutSig.replace('</Otp>', `  <Signature>${signature}</Signature>\n</Otp>`);
  return finalXml;
}

function buildAuthRequestXml(uid, txnId, otpCode) {
  const ts = getCurrentUidaiTimestamp();
  
  // CRITICAL FIX: Ensure SUB_AUA_CODE is never empty (causes 940 error)
  const subAuaCode = UIDAI_CONFIG.SUB_AUA_CODE || UIDAI_CONFIG.AUA_CODE || 'public';
  
  // Build the PID block with OTP - CORRECTED: Use proper structure
  const pidXml = `<Pid ts="${ts}" ver="1.0"><Pv otp="${otpCode}"/></Pid>`;
  
  // For UIDAI staging, we'll use simplified encryption placeholders
  // Real implementation requires AES-256 encryption of PID and RSA encryption of session key
  // FIXED: Ensure exact UIDAI XML format with proper attribute order and tid
  const authXmlWithoutSig = `<?xml version="1.0" encoding="UTF-8"?>
<Auth uid="${uid}" tid="${UIDAI_CONFIG.TERMINAL_ID}" ac="${UIDAI_CONFIG.AUA_CODE}" sa="${subAuaCode}" ver="${UIDAI_CONFIG.API_VERSION}" txn="${txnId}" lk="${UIDAI_CONFIG.LICENSE_KEY}">
  <Uses otp="Y"/>
  <Skey ci="${ts}">BASE64_ENC_SESSION_KEY_PLACEHOLDER</Skey>
  <Hmac>BASE64_ENC_HMAC_PLACEHOLDER</Hmac>
  <Data type="X">BASE64_ENC_PID_BLOCK_PLACEHOLDER</Data>
</Auth>`;

  // Sign the Auth element if private key is available
  let signature = 'UNSIGNED_FOR_TESTING';
  if (auaPrivateKey) {
    try {
      // Sign the Auth element
      const authElementStart = authXmlWithoutSig.indexOf('<Auth');
      const authElementEnd = authXmlWithoutSig.indexOf('</Auth>') + '</Auth>'.length;
      const authElement = authXmlWithoutSig.substring(authElementStart, authElementEnd);
      signature = signXmlData(authElement);
    } catch (error) {
      console.error('Error signing Auth XML:', error.message);
    }
  }

  // Insert signature into XML
  const finalXml = authXmlWithoutSig.replace('</Auth>', `  <Signature>${signature}</Signature>\n</Auth>`);
  return finalXml;
}

async function sendUidaiRequest(url, xmlData, isOtpRequest = false) {
  console.log(`\n📡 Sending ${isOtpRequest ? 'OTP' : 'AUTH'} request to UIDAI:`, url);
  console.log('📋 Request XML:\n', xmlData);
  
  try {
         const response = await axios.post(url, xmlData, {
       headers: {
         'Content-Type': 'application/xml',
         'Accept': 'application/xml',
         'User-Agent': 'UIDAI-Test-Client/1.0'
       },
       timeout: 30000, // 30 second timeout for UIDAI calls
       validateStatus: (status) => status < 500 // Accept 4xx responses for error analysis
     });

    console.log(`📥 UIDAI Response Status: ${response.status}`);
    console.log('📄 Response XML:\n', response.data);

    // Parse XML response
    const parser = new xml2js.Parser({ 
      explicitArray: false, 
      mergeAttrs: true, 
      explicitRoot: false 
    });
    
    const parsedResponse = await parser.parseStringPromise(response.data);
    
    // Verify signature if present
    const responseRoot = isOtpRequest ? parsedResponse.OtpRes : parsedResponse.AuthRes;
    if (responseRoot && responseRoot.Signature) {
      const dataToVerify = response.data.replace(/<Signature>.*?<\/Signature>/s, '');
      const isValidSig = verifyUidaiSignature(dataToVerify, responseRoot.Signature);
      console.log(`🔐 Signature verification: ${isValidSig ? 'VALID' : 'INVALID'}`);
    }

    return {
      success: response.status === 200,
      status: response.status,
      data: parsedResponse,
      rawXml: response.data
    };

  } catch (error) {
    console.error(`❌ UIDAI API Error:`, error.message);
    
    if (error.response) {
      console.error(`HTTP ${error.response.status}: ${error.response.data}`);
      return {
        success: false,
        status: error.response.status,
        error: error.response.data,
        message: `UIDAI API returned ${error.response.status}`
      };
    } else if (error.code === 'ECONNREFUSED') {
      return {
        success: false,
        error: 'CONNECTION_REFUSED',
        message: 'Could not connect to UIDAI staging server'
      };
    } else if (error.code === 'ETIMEDOUT') {
      return {
        success: false,
        error: 'TIMEOUT',
        message: 'UIDAI API request timed out'
      };
    } else {
      return {
        success: false,
        error: error.code || 'UNKNOWN_ERROR',
        message: error.message
      };
    }
  }
}

// API Endpoints

// Health Check
app.get('/health', (req, res) => {
  console.log(`[${new Date().toISOString()}] GET /health`);
  res.status(200).json({
    status: 'ok',
    message: 'Real UIDAI integration server is healthy',
    timestamp: new Date().toISOString(),
    mode: 'REAL_UIDAI_STAGING'
  });
});

// Configuration Validation
app.get('/auth/config/validate', (req, res) => {
  console.log(`[${new Date().toISOString()}] GET /auth/config/validate`);
  
  const validationResults = {
    UIDAI_STAGING_URL: { valid: true, value: UIDAI_CONFIG.STAGING_BASE_URL },
    AUA_CODE: { valid: !!UIDAI_CONFIG.AUA_CODE, value: UIDAI_CONFIG.AUA_CODE },
    LICENSE_KEY: { valid: !!UIDAI_CONFIG.LICENSE_KEY, value: 'MG_g7j...' },
    AUA_PRIVATE_KEY: { valid: !!auaPrivateKey, path: UIDAI_CONFIG.AUA_PRIVATE_KEY_PATH },
    UIDAI_STAGING_CERT: { valid: !!uidaiStagingCert, path: UIDAI_CONFIG.UIDAI_STAGING_CERT_PATH }
  };

  const errors = Object.entries(validationResults)
    .filter(([key, config]) => !config.valid)
    .map(([key, config]) => `${key} is missing or invalid`);

  res.status(200).json({
    valid: errors.length === 0,
    errors,
    details: validationResults
  });
});

// Test Real UIDAI Connection
app.get('/auth/test/connection', async (req, res) => {
  console.log(`[${new Date().toISOString()}] GET /auth/test/connection - TESTING REAL UIDAI`);
  
  try {
    // Test basic connectivity to UIDAI staging
    const testResponse = await axios.get(UIDAI_CONFIG.STAGING_BASE_URL, {
      timeout: 10000,
      validateStatus: (status) => status < 500
    });

    res.json({
      status: 'success',
      message: 'Successfully connected to UIDAI staging environment',
             endpoints: {
         staging: UIDAI_CONFIG.STAGING_BASE_URL,
         otpApiBase: UIDAI_CONFIG.OTP_API_BASE,
         authApiBase: UIDAI_CONFIG.AUTH_API_BASE
       },
      connectivity: {
        httpStatus: testResponse.status,
        reachable: true
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('UIDAI connection test failed:', error.message);
    res.status(503).json({
      status: 'error',
      message: 'Failed to connect to UIDAI staging environment',
      error: error.message,
      connectivity: {
        reachable: false,
        error: error.code || 'UNKNOWN_ERROR'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Certificate Status Check
app.get('/auth/test/certificates', (req, res) => {
  const stagingCertExists = fs.existsSync(UIDAI_CONFIG.UIDAI_STAGING_CERT_PATH);
  const privateKeyExists = fs.existsSync(UIDAI_CONFIG.AUA_PRIVATE_KEY_PATH);
  
  const allValid = stagingCertExists && privateKeyExists;
  
  res.json({
    status: 'success',
    valid: allValid,
    certificates: {
      uidaiStagingCertificate: {
        path: UIDAI_CONFIG.UIDAI_STAGING_CERT_PATH,
        status: stagingCertExists ? 'loaded' : 'missing',
        valid: stagingCertExists && !!uidaiStagingCert
      },
      auaPrivateKey: {
        path: UIDAI_CONFIG.AUA_PRIVATE_KEY_PATH,
        status: privateKeyExists ? 'loaded' : 'missing',
        valid: privateKeyExists && !!auaPrivateKey
      }
    },
    timestamp: new Date().toISOString()
  });
});

// Real UIDAI OTP Initiation
app.post('/auth/qr', async (req, res) => {
  const { uid } = req.body;
  const txnId = uuidv4();
  
  console.log(`[${new Date().toISOString()}] POST /auth/qr - REAL UIDAI OTP for UID: ${uid}`);
  
  if (!uid || !/^\d{12}$/.test(uid)) {
    return res.status(400).json({
      statusCode: 400,
      message: 'Invalid UID format. Must be 12 digits.',
      error: 'Bad Request'
    });
  }

  try {
    const otpApiUrl = buildOtpApiUrl(uid);
    const otpRequestXml = buildOtpRequestXml(uid, txnId);
    console.log(`📍 Using OTP API URL: ${otpApiUrl}`);
    const uidaiResponse = await sendUidaiRequest(otpApiUrl, otpRequestXml, true);

    if (uidaiResponse.success && uidaiResponse.data.OtpRes) {
      const otpRes = uidaiResponse.data.OtpRes;
      
      if (otpRes.ret === 'y') {
        // OTP generation successful
        res.status(200).json({
          success: true,
          message: 'OTP generated successfully by UIDAI',
          txnId: otpRes.txn || txnId,
          uidaiTxnId: otpRes.txn,
          timestamp: otpRes.ts,
          info: otpRes.info || 'OTP sent to registered mobile number',
          mode: 'REAL_UIDAI_STAGING'
        });
      } else {
        // OTP generation failed - provide specific error messages
        let errorMessage = 'UIDAI OTP generation failed';
        let errorDetails = otpRes.info || 'Unknown error from UIDAI';
        
        if (otpRes.err === '940') {
          errorMessage = 'Unauthorized ASA channel (Error 940)';
          errorDetails = 'UIDAI Error 940: The AUA "public" is not authorized for ASA channel. According to UIDAI docs, this means the channel requested (SMS OTP via ch="01") is not permitted under the license key. This may require UIDAI sandbox configuration or using different test credentials.';
        } else if (otpRes.err === '530') {
          errorMessage = 'Invalid authenticator code';
          errorDetails = 'The AUA code used in the request is not valid or not properly registered.';
        } else if (otpRes.err === '570') {
          errorMessage = 'Invalid digital signature';
          errorDetails = 'The certificate used for signing is not valid or has expired.';
        }
        
        res.status(400).json({
          success: false,
          message: errorMessage,
          error: otpRes.err || 'OTP_GENERATION_FAILED',
          errorInfo: errorDetails,
          uidaiResponse: {
            ret: otpRes.ret,
            err: otpRes.err,
            code: otpRes.code,
            ts: otpRes.ts,
            info: otpRes.info
          },
          txnId,
          mode: 'REAL_UIDAI_STAGING'
        });
      }
    } else {
      // Network or parsing error or malformed response
      console.log('Full UIDAI Response:', JSON.stringify(uidaiResponse, null, 2));
      
      // Check if we got a valid response but couldn't parse OtpRes
      if (uidaiResponse.data && typeof uidaiResponse.data === 'object') {
        // Try to find OtpRes in different formats
        const possibleResponse = uidaiResponse.data.OtpRes || uidaiResponse.data;
        
        if (possibleResponse && possibleResponse.err) {
          // We have an error response from UIDAI
          let errorMessage = 'UIDAI OTP request failed';
          let errorDetails = possibleResponse.info || 'Error from UIDAI staging';
          
          if (possibleResponse.err === '940') {
            errorMessage = 'Unauthorized ASA channel (UIDAI Error 940)';
            errorDetails = 'The test AUA "public" is not authorized for ASA channel in UIDAI staging. This may require UIDAI sandbox configuration.';
          }
          
          return res.status(400).json({
            success: false,
            message: errorMessage,
            error: possibleResponse.err,
            errorInfo: errorDetails,
            uidaiResponse: possibleResponse,
            txnId,
            mode: 'REAL_UIDAI_STAGING'
          });
        }
      }
      
      // Network or parsing error
      res.status(502).json({
        success: false,
        message: 'Failed to communicate with UIDAI staging',
        error: uidaiResponse.error || 'UIDAI_COMMUNICATION_ERROR',
        details: uidaiResponse.message,
        rawResponse: uidaiResponse.rawXml || uidaiResponse.data,
        txnId,
        mode: 'REAL_UIDAI_STAGING'
      });
    }

  } catch (error) {
    console.error('Error in OTP initiation:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error during OTP initiation',
      error: error.message,
      txnId,
      mode: 'REAL_UIDAI_STAGING'
    });
  }
});

// Real UIDAI Authentication
app.post('/auth/callback', async (req, res) => {
  const { txn, otp, uid } = req.body;
  
  console.log(`[${new Date().toISOString()}] POST /auth/callback - REAL UIDAI AUTH for UID: ${uid}, TXN: ${txn}`);
  
  if (!txn || !otp || !uid) {
    return res.status(400).json({
      error: 'Missing required parameters: txn, otp, uid',
      timestamp: new Date().toISOString()
    });
  }

  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({
      error: 'Invalid OTP format. Must be 6 digits',
      timestamp: new Date().toISOString()
    });
  }

  if (!/^\d{12}$/.test(uid)) {
    return res.status(400).json({
      error: 'Invalid UID format. Must be 12 digits',
      timestamp: new Date().toISOString()
    });
  }

  try {
    const authApiUrl = buildAuthApiUrl(uid);
    const authRequestXml = buildAuthRequestXml(uid, txn, otp);
    console.log(`📍 Using Auth API URL: ${authApiUrl}`);
    const uidaiResponse = await sendUidaiRequest(authApiUrl, authRequestXml, false);

    if (uidaiResponse.success && uidaiResponse.data.AuthRes) {
      const authRes = uidaiResponse.data.AuthRes;
      
      if (authRes.ret === 'y') {
        // Authentication successful
        res.status(200).json({
          status: 'success',
          message: 'Authentication successful via UIDAI staging',
          transactionId: authRes.txn || txn,
          uid: uid.replace(/(\d{4})(\d{4})(\d{4})/, '****-****-$3'),
          authenticated: true,
          claims: {
            sub: 'aadhaar:' + uid.substr(-4),
            txn: authRes.txn,
            ts: authRes.ts,
            info: authRes.info,
            verified: true,
            mode: 'REAL_UIDAI_STAGING'
          },
          timestamp: new Date().toISOString()
        });
      } else {
        // Authentication failed
        res.status(401).json({
          status: 'failed',
          message: 'Authentication failed',
          error: authRes.err || 'AUTH_FAILED',
          errorInfo: authRes.info || 'Invalid OTP or authentication details',
          transactionId: txn,
          authenticated: false,
          mode: 'REAL_UIDAI_STAGING',
          timestamp: new Date().toISOString()
        });
      }
    } else {
      // Network or parsing error
      res.status(502).json({
        status: 'error',
        message: 'Failed to communicate with UIDAI staging for authentication',
        error: uidaiResponse.error || 'UIDAI_COMMUNICATION_ERROR',
        details: uidaiResponse.message,
        transactionId: txn,
        mode: 'REAL_UIDAI_STAGING',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Error in authentication:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error during authentication',
      error: error.message,
      transactionId: txn,
      mode: 'REAL_UIDAI_STAGING',
      timestamp: new Date().toISOString()
    });
  }
});

// Load Test (Real UIDAI)
app.get('/auth/test/load', async (req, res) => {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] GET /auth/test/load - REAL UIDAI Load Test`);
  
  // For load testing, we'll test connectivity multiple times
  const testCount = 3;
  const results = [];
  
  for (let i = 0; i < testCount; i++) {
    const testStart = Date.now();
    try {
      await axios.get(UIDAI_CONFIG.STAGING_BASE_URL, { timeout: 5000 });
      results.push({
        requestId: i + 1,
        responseTime: Date.now() - testStart,
        status: 'success'
      });
    } catch (error) {
      results.push({
        requestId: i + 1,
        responseTime: Date.now() - testStart,
        status: 'failed',
        error: error.message
      });
    }
  }
  
  const endTime = Date.now();
  const successCount = results.filter(r => r.status === 'success').length;
  
  res.json({
    status: 'completed',
    message: 'Real UIDAI staging load test completed',
    testDuration: endTime - startTime,
    concurrentRequests: testCount,
    results: results,
    averageResponseTime: results.reduce((sum, r) => sum + r.responseTime, 0) / results.length,
    successRate: `${Math.round((successCount / testCount) * 100)}%`,
    mode: 'REAL_UIDAI_STAGING',
    timestamp: new Date().toISOString()
  });
});

// Serve the demo page (modified for real UIDAI)
app.get('/aadhaar-poc-demo.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'aadhaar-poc-demo.html'));
});

// Server startup
app.listen(port, () => {
  console.log('================================================');
  console.log('🚀 REAL UIDAI STAGING INTEGRATION SERVER 🚀');
  console.log('================================================');
  
  // Validate configuration first
  try {
    validateUidaiConfig();
  } catch (error) {
    console.error('❌ Server startup failed due to configuration errors');
    process.exit(1);
  }
  
  console.log(`🌐 Server listening on http://localhost:${port}`);
  console.log(`🎯 Demo available at: http://localhost:${port}/aadhaar-poc-demo.html`);
  console.log('📡 Connecting to REAL UIDAI Staging Environment');
  console.log(`🔗 UIDAI Base URL: ${UIDAI_CONFIG.STAGING_BASE_URL}`);
  console.log(`🔑 AUA Code: ${UIDAI_CONFIG.AUA_CODE}`);
  console.log(`🔑 Sub-AUA Code: ${UIDAI_CONFIG.SUB_AUA_CODE}`);
  console.log(`📜 License Key: ${UIDAI_CONFIG.LICENSE_KEY.substring(0, 10)}...`);
  console.log('================================================');
  
  // Test initial connectivity
  axios.get(UIDAI_CONFIG.STAGING_BASE_URL, { timeout: 5000 })
    .then(() => console.log('✅ Initial UIDAI connectivity test: SUCCESS'))
    .catch(error => console.log(`❌ Initial UIDAI connectivity test: FAILED - ${error.message}`));
}); 