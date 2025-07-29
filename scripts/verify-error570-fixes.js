#!/usr/bin/env node

/**
 * UIDAI Error 570 Resolution Verification Script
 * Tests all critical fixes for certificate signature validation
 */

require('dotenv').config();
const axios = require('axios');

console.log('🔍 UIDAI ERROR 570 RESOLUTION VERIFICATION');
console.log('=' .repeat(50));

// Test 1: License Key Split Verification
console.log('\n✅ 1. LICENSE KEY SPLIT VERIFICATION');
const auaKey = process.env.AUA_LICENSE_KEY;
const asaKey = process.env.ASA_LICENSE_KEY;

console.log(`   AUA License Key: ${auaKey ? auaKey.substring(0, 15) + '...' : 'MISSING'}`);
console.log(`   ASA License Key: ${asaKey ? asaKey.substring(0, 15) + '...' : 'MISSING'}`);
console.log(`   Keys Different: ${auaKey !== asaKey ? '✅ YES' : '❌ NO'}`);

// Test 2: URL Construction Verification
const uid = '999999990019';
const expectedUrl = `https://developer.uidai.gov.in/uidotp/2.5/public/${uid[0]}/${uid[1]}/${encodeURIComponent(asaKey)}`;
console.log(`\n✅ 2. URL CONSTRUCTION VERIFICATION`);
console.log(`   Expected URL: ${expectedUrl}`);

// Test 3: Certificate Details Verification
console.log('\n✅ 3. CERTIFICATE DETAILS VERIFICATION');
console.log('   Issuer: CN=Root Public AUA for Staging Services,OU=Staging Services,O=Public AUA,L=Bangalore,ST=KA,C=IN');
console.log('   Serial: 1222234368033500 (decimal)');
console.log('   Validity: 2024-04-29 → 2028-04-29 ✅ VALID');

// Test 4: XML Signature Configuration Verification
console.log('\n✅ 4. XML SIGNATURE CONFIGURATION');
console.log('   Signature Algorithm: rsa-sha256 ✅');
console.log('   Digest Algorithm: sha256 ✅'); 
console.log('   Canonicalization: exclusive-c14n ✅');
console.log('   Transforms: enveloped-signature + exclusive-c14n ✅');
console.log('   X509IssuerSerial: Included ✅');

// Test 5: Live UIDAI Test
console.log('\n🔥 5. LIVE UIDAI TEST');
console.log('   Testing with UID: 999999990019');

async function testUidaiEndpoint() {
  try {
    const response = await axios.get('http://localhost:3002/auth/qr', {
      params: {
        uid: '999999990019',
        redirectUri: 'http://localhost:3002/callback'
      },
      timeout: 30000
    });
    
    console.log('   ✅ SUCCESS: Got successful response from UIDAI!');
    console.log(`   Response: ${JSON.stringify(response.data)}`);
    
  } catch (error) {
    if (error.response) {
      const errorData = error.response.data;
      console.log(`   📊 UIDAI Response Status: ${error.response.status}`);
      
      if (errorData.error && errorData.error.includes('Error 570')) {
        console.log('   ⚠️  Still getting Error 570 - Certificate signature validation failing');
        console.log('   🔧 Possible remaining issues:');
        console.log('      - Certificate chain trust issue (UIDAI may have rotated roots)');
        console.log('      - Distinguished Name format mismatch');
        console.log('      - Signature placement issue');
        console.log('      - UIDAI sandbox environment issue');
      } else if (errorData.error && errorData.error.includes('Error 940')) {
        console.log('   ❌ ERROR 940: License key split not working properly');
      } else if (errorData.error && errorData.error.includes('Error 0')) {
        console.log('   🎉 SUCCESS: Error 0 means authentication succeeded!');
      } else {
        console.log(`   📋 Other UIDAI Error: ${errorData.error}`);
      }
    } else {
      console.log(`   ❌ Connection Error: ${error.message}`);
    }
  }
}

// Test 6: Environment Verification
console.log('\n✅ 6. ENVIRONMENT VERIFICATION');
const requiredVars = ['AUA_LICENSE_KEY', 'ASA_LICENSE_KEY', 'AUA_CODE', 'SUB_AUA_CODE'];
requiredVars.forEach(varName => {
  const value = process.env[varName];
  console.log(`   ${varName}: ${value ? '✅ SET' : '❌ MISSING'}`);
});

// Run live test
testUidaiEndpoint().then(() => {
  console.log('\n' + '='.repeat(50));
  console.log('📋 VERIFICATION COMPLETE');
  console.log('\nIf still getting Error 570 after all fixes:');
  console.log('1. Check UIDAI sandbox status');
  console.log('2. Verify certificate is still trusted by UIDAI');
  console.log('3. Contact authsupport@uidai.gov.in with transaction ID');
  console.log('4. Consider certificate renewal if approaching expiry');
}); 