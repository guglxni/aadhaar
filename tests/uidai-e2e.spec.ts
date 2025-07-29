import axios from 'axios';
import * as xml2js from 'xml2js';
import { v4 as uuid } from 'uuid';

const serverBase = 'http://localhost:3002';

/** helper – hits the QR/OTP endpoint and returns parsed <OtpRes …> attrs */
async function requestOtp(uid = '999999990019') {
  const redirect = encodeURIComponent('http://localhost:3002/callback');
  const res = await axios.get(
    `${serverBase}/auth/qr?uid=${uid}&redirectUri=${redirect}`,
    { validateStatus: () => true, timeout: 10_000 },
  );

  // response is JSON wrapper -> { rawXml: '<OtpRes …/>' }
  const { rawXml, error } = res.data;

  if (error) throw new Error(`Gateway error: ${error}`);
  if (!rawXml?.startsWith('<')) throw new Error('No XML in response');

  const { OtpRes } = await xml2js.parseStringPromise(rawXml, {
    explicitArray: false,
    attrkey: 'a',
  });

  return OtpRes?.a || {};
}

describe('UIDAI sandbox – production flow', () => {
  beforeAll(async () => {
    // Wait for server to be ready
    let retries = 5;
    while (retries > 0) {
      try {
        await axios.get(`${serverBase}/health`, { timeout: 2000 });
        console.log('✅ Server is ready for E2E testing');
        break;
      } catch (error) {
        retries--;
        if (retries === 0) {
          throw new Error('Server not responding - ensure "npm run start:dev" is running');
        }
        console.log(`Waiting for server... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  });

  it('should return ret="y" with no error (OTP request)', async () => {
    console.log('🧪 Testing UIDAI OTP initiation...');
    
    const attrs = await requestOtp();

    console.log('↳ UIDAI response attrs:', attrs);

    // Production validation criteria
    expect(attrs.ret).toBe('y');          // ✅ success flag
    expect(attrs.err ?? '').toBe('');     // ✅ no error code
    
    // Additional validation for complete response
    expect(attrs.txn).toBeDefined();      // ✅ transaction ID present
    expect(attrs.ts).toBeDefined();       // ✅ timestamp present
    expect(attrs.code).toBeDefined();     // ✅ response code present
    
    console.log('🎉 SUCCESS: UIDAI production validation passed!');
  }, 15000); // 15 second timeout for network calls

  it('should handle test UID (999999990019) properly', async () => {
    console.log('🧪 Testing with standard test UID...');
    
    const attrs = await requestOtp('999999990019');
    
    console.log('↳ Test UID response attrs:', attrs);
    
    // Should still succeed with test UID
    expect(attrs.ret).toBe('y');
    expect(attrs.err ?? '').toBe('');
    
    console.log('✅ Test UID validation passed');
  }, 15000);

  it('should provide meaningful error context if validation fails', async () => {
    console.log('🧪 Capturing error context for debugging...');
    
    try {
      const attrs = await requestOtp();
      
      if (attrs.ret !== 'y' || (attrs.err && attrs.err !== '')) {
        console.log('❌ VALIDATION FAILED - Debugging information:');
        console.log('📋 Full response attributes:', JSON.stringify(attrs, null, 2));
        console.log('🔍 Error mapping:');
        console.log('   569 = Signature mismatch (chain OK → crypto KO)');
        console.log('   523 = Certificate chain still not trusted by UIDAI');
        console.log('   940 = Unauthorized ASA channel');
        console.log('   937 = Invalid request format');
        console.log('📝 Next steps:');
        
        if (attrs.err === '569') {
          console.log('   → Re-run "npm run build:p12" and restart server');
          console.log('   → Confirm RSA-SHA256 signature template is active');
        } else if (attrs.err === '523') {
          console.log('   → Wait full 30 minutes for UIDAI cache refresh');
          console.log('   → Re-check portal status (must be ACTIVE/VALID)');
        } else if (attrs.err === '940') {
          console.log('   → Verify ASA_LICENSE_KEY and AUA_LICENSE_KEY in env');
        } else if (attrs.err === '937') {
          console.log('   → Check XML signature template format');
        }
        
        // Still fail the test with clear context
        fail(`UIDAI validation failed: ret="${attrs.ret}", err="${attrs.err}". See console for debugging steps.`);
      }
    } catch (error) {
      console.log('💥 Request failed entirely:', error.message);
      throw error;
    }
  }, 15000);
}); 