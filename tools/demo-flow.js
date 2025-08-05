/**
 * Aadhaar Authentication Demo Flow Script
 * 
 * This script demonstrates the typical flow of Aadhaar authentication:
 * 1. Generate OTP for a given UID
 * 2. Verify OTP and complete authentication
 * 3. Extract demographic data from the authenticated response
 * 
 * This is a proof of concept only, not for production use.
 */

// Sample UID for demonstration
const DEMO_UID = '999941057058';

// Mock data structure for demographics
const mockDemographicData = {
  '999941057058': {
    name: 'John Doe',
    gender: 'M',
    dob: '1985-05-15',
    address: {
      street: '123 Main Street',
      locality: 'Andheri',
      district: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400053'
    },
    mobileHash: 'XXXX1234', // Last 4 digits of mobile number
    emailHash: 'j***e@example.com' // Partial email for demonstration
  }
};

// Step 1: Generate OTP (simulating UIDAI OTP API)
function generateOTP(uid) {
  console.log(`\n--- STEP 1: Generating OTP for UID ${uid} ---`);
  
  // Validate UID
  if (!uid || uid.length !== 12 || !/^\d+$/.test(uid)) {
    throw new Error('Invalid UID format. Must be 12 digits');
  }
  
  // In a real implementation, this would call the UIDAI OTP API
  console.log('Constructing OTP request XML...');
  const txnId = `mock-txn-${Date.now()}`;
  
  // Simulate XML for OTP request (simplified for demo)
  const otpRequestXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Otp uid="${uid}" tid="public" ac="public" sa="public" ver="2.5" txn="${txnId}" lk="MOCK_LICENSE_KEY" ts="${new Date().toISOString().split('.')[0]}">
  <Opts ch="01" />
  <Signature>MOCK_SIGNATURE</Signature>
</Otp>`;
  
  console.log('Sample OTP request XML:');
  console.log(otpRequestXml);
  console.log('\nSending request to UIDAI OTP endpoint (mocked)...');
  
  // Mock successful response from UIDAI OTP API
  const otpResponse = {
    OtpRes: {
      ret: 'y',
      code: '00',
      txn: txnId,
      ts: new Date().toISOString().split('.')[0],
      err: '',
      info: 'OTP generated successfully',
      Signature: 'MOCK_SIGNATURE'
    }
  };
  
  console.log('OTP generation response:');
  console.log(JSON.stringify(otpResponse, null, 2));
  console.log('\nOTP sent to registered mobile (simulated)');
  
  return { txnId, uid };
}

// Step 2: Verify OTP and complete authentication (simulating UIDAI Auth API)
function verifyOTP(uid, txnId, otp) {
  console.log(`\n--- STEP 2: Verifying OTP for UID ${uid}, Transaction ${txnId} ---`);
  
  // Validate OTP
  if (!otp || otp.length !== 6 || !/^\d+$/.test(otp)) {
    throw new Error('Invalid OTP format. Must be 6 digits');
  }
  
  console.log('Constructing Auth request XML with encrypted PID block...');
  
  // In a real implementation, this would:
  // 1. Encrypt the OTP using AES-256-GCM
  // 2. Compute HMAC of the PID block
  // 3. Encrypt the session key using RSA-OAEP
  // 4. Sign the XML
  
  // Simulate Auth XML (simplified for demo)
  const authRequestXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Auth uid="${uid}" tid="public" ac="public" sa="public" ver="2.5" txn="${txnId}" lk="MOCK_LICENSE_KEY" ts="${new Date().toISOString().split('.')[0]}">
  <Uses otp="Y" pi="n" pa="n" pfa="n" bio="n" bt="" pin="n" />
  <Skey ci="20250525">ENCRYPTED_SESSION_KEY_BASE64</Skey>
  <Data type="X">ENCRYPTED_PID_DATA_BASE64</Data>
  <Hmac>HMAC_VALUE_BASE64</Hmac>
  <Signature>MOCK_SIGNATURE</Signature>
</Auth>`;

  console.log('Sample Auth request XML:');
  console.log(authRequestXml);
  console.log('\nSending request to UIDAI Auth endpoint (mocked)...');
  
  // Mock successful response from UIDAI Auth API
  const authResponse = {
    AuthRes: {
      ret: 'y',
      code: '00',
      txn: txnId,
      ts: new Date().toISOString().split('.')[0],
      info: 'Authentication successful',
      // KYC data would be included if KYC was requested
      Signature: 'MOCK_SIGNATURE'
    }
  };
  
  console.log('Authentication response:');
  console.log(JSON.stringify(authResponse, null, 2));
  
  return { authenticated: true, uid, txnId };
}

// Step 3: Get demographic data from the authenticated response
function getDemographicData(uid) {
  console.log(`\n--- STEP 3: Retrieving demographic data for authenticated UID ${uid} ---`);
  
  // In a real implementation with KYC, this would be extracted from the Auth response
  // Here we're using our mock data
  if (!mockDemographicData[uid]) {
    throw new Error(`No demographic data found for UID ${uid}`);
  }
  
  console.log('Demographic data extracted from response:');
  console.log(JSON.stringify(mockDemographicData[uid], null, 2));
  
  return mockDemographicData[uid];
}

// Run the complete flow
async function runDemoFlow(uid = DEMO_UID) {
  console.log('===== AADHAAR AUTHENTICATION DEMO FLOW =====');
  console.log(`Starting authentication flow for UID: ${uid}`);
  
  try {
    // Step 1: Generate OTP
    const otpResult = generateOTP(uid);
    
    // In a real application, user would now receive OTP and enter it
    console.log('\nWaiting for user to enter OTP... (simulated)');
    const mockOTP = '123456'; // Simulated user input
    
    // Introduce a small delay to simulate user entering OTP
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 2: Verify OTP
    const authResult = verifyOTP(otpResult.uid, otpResult.txnId, mockOTP);
    
    if (authResult.authenticated) {
      // Step 3: Get demographic data
      const demoData = getDemographicData(authResult.uid);
      
      console.log('\n===== AUTHENTICATION FLOW COMPLETE =====');
      console.log(`User ${demoData.name} successfully authenticated`);
      console.log('This demonstrates how an application can authenticate a user via Aadhaar');
      console.log('and access their demographic data after successful authentication.');
    }
  } catch (error) {
    console.error('\nError during authentication flow:');
    console.error(error.message);
  }
}

// Run the demo flow
runDemoFlow(); 