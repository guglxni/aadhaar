#!/usr/bin/env node

/**
 * Enhanced XML Signature Debugging Tool for UIDAI Error 570 Deep-Dive
 * 
 * This captures and analyzes the XML signature generation with detailed diagnostics
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3002';

console.log('🔍 XML Signature Debug - Deep-Dive Analysis');
console.log('='.repeat(50));

async function captureRequest() {
  console.log('\n📝 Capturing current XML generation...');
  
  try {
    const response = await axios.get(`${BASE_URL}/auth/qr`, {
      params: {
        uid: '999999990019',
        redirectUri: 'http://localhost:3002/callback'
      },
      timeout: 10000,
      validateStatus: () => true
    });
    
    console.log(`   Response Status: ${response.status}`);
    
    if (response.status >= 400) {
      console.log('   Error Response:', JSON.stringify(response.data, null, 2));
      
      if (response.data.error && response.data.error.includes('XPath parse error')) {
        console.log('\n🎯 DIAGNOSIS: XPath parse error detected');
        console.log('   This indicates the uri: "" approach needs refinement');
        console.log('   xml-crypto may still be trying to use xpath internally');
      }
    } else {
      console.log('   ✅ Request successful');
      console.log('   Response:', response.data);
    }
    
  } catch (error) {
    console.log(`   ❌ Request failed: ${error.message}`);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('   💡 Server not running - start it first');
    }
  }
}

async function testHealthEndpoint() {
  console.log('\n🏥 Testing server health...');
  
  try {
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    console.log(`   Status: ${response.status}`);
    console.log('   ✅ Server is responding');
    return true;
  } catch (error) {
    console.log('   ❌ Server not accessible');
    return false;
  }
}

async function runDebugTests() {
  const serverHealthy = await testHealthEndpoint();
  
  if (!serverHealthy) {
    console.log('\n🚀 Server needs to be started. Run: node dist/main.js');
    return;
  }
  
  await captureRequest();
  
  console.log('\n📋 Next Steps for UIDAI Error 570 Resolution:');
  console.log('   1. Fix the XPath parse error in signature generation');
  console.log('   2. Ensure empty URI is properly handled by xml-crypto');
  console.log('   3. Verify both transforms are applied in correct order');
  console.log('   4. Test against UIDAI signature validation endpoint');
}

runDebugTests().catch(console.error); 