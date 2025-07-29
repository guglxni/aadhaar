#!/usr/bin/env node

/**
 * 2025 UIDAI Sandbox Configuration Verification Script
 * 
 * This script verifies that the system is properly configured for the 2025 UIDAI sandbox
 * with the correct endpoints and credentials as specified in the official UIDAI documentation.
 */

const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://localhost:3002';
const TEST_UID = '999999990019';

console.log('🔍 2025 UIDAI Sandbox Configuration Verification');
console.log('='.repeat(50));

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startServer() {
  console.log('🚀 Starting server...');
  
  const serverProcess = spawn('npm', ['run', 'start:dev'], {
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: '3002',
      SERVER_BASE_URL: 'http://localhost:3002'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Capture server output to check configuration
  let serverOutput = '';
  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    serverOutput += output;
    if (output.includes('PROVIDER_INITIALIZATION_CONFIG')) {
      console.log('📊 Server Configuration Detected:');
      console.log(output);
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.log('Server Error:', data.toString());
  });

  // Wait for server to start
  await delay(8000);
  
  return { serverProcess, serverOutput };
}

async function verifyHealth() {
  console.log('\n🏥 Testing Health Endpoint...');
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Server is running:', response.data);
    return true;
  } catch (error) {
    console.log('❌ Server health check failed:', error.message);
    return false;
  }
}

async function verifyConfiguration() {
  console.log('\n⚙️ Testing Configuration Validation...');
  try {
    const response = await axios.get(`${BASE_URL}/auth/config/validate`);
    console.log('✅ Configuration validation:', response.data);
    return response.data.valid;
  } catch (error) {
    console.log('❌ Configuration validation failed:', error.message);
    return false;
  }
}

async function testSessionCreation() {
  console.log('\n📱 Testing Cross-Device Session Creation...');
  try {
    const response = await axios.post(`${BASE_URL}/auth/cross-device/session/create`, {
      uid: TEST_UID
    });
    console.log('✅ Session created:', response.data);
    return response.data.sessionId;
  } catch (error) {
    console.log('❌ Session creation failed:', error.message);
    return null;
  }
}

async function testAuthentication(sessionId) {
  console.log('\n🔐 Testing Authentication with 2025 UIDAI Endpoints...');
  try {
    const response = await axios.post(`${BASE_URL}/auth/cross-device/authenticate`, {
      sessionId,
      otp: '123456',
      deviceId: 'test-device'
    });
    console.log('🔍 Authentication result:', response.data);
    
    // Check if we get specific error patterns that indicate URL issues
    if (!response.data.success) {
      console.log('⚠️  Authentication failed - checking for 2025 endpoint usage...');
    }
    
    return response.data;
  } catch (error) {
    console.log('❌ Authentication test failed:', error.message);
    if (error.response) {
      console.log('Response status:', error.response.status);
      console.log('Response data:', error.response.data);
    }
    return null;
  }
}

async function checkEnvironmentFile() {
  console.log('\n📄 Checking Environment Configuration...');
  try {
    const envContent = fs.readFileSync('.env', 'utf8');
    const lines = envContent.split('\n');
    
    const config = {};
    lines.forEach(line => {
      if (line.includes('=') && !line.startsWith('#')) {
        const [key, value] = line.split('=');
        config[key.trim()] = value.trim();
      }
    });
    
    console.log('🔧 Key Configuration Values:');
    console.log('  UIDAI_AUA_CODE:', config.UIDAI_AUA_CODE);
    console.log('  UIDAI_SUB_AUA_CODE:', config.UIDAI_SUB_AUA_CODE);
    console.log('  UIDAI_LICENSE_KEY:', config.UIDAI_LICENSE_KEY);
    console.log('  UIDAI_STAGING_AUTH_URL:', config.UIDAI_STAGING_AUTH_URL);
    console.log('  UIDAI_STAGING_OTP_URL:', config.UIDAI_STAGING_OTP_URL);
    
    // Verify 2025 configuration
    const is2025Config = 
      config.UIDAI_AUA_CODE === 'public' &&
      config.UIDAI_SUB_AUA_CODE === 'public' &&
      config.UIDAI_LICENSE_KEY === 'public' &&
      config.UIDAI_STAGING_AUTH_URL?.includes('authserver') &&
      config.UIDAI_STAGING_OTP_URL?.includes('uidotp');
    
    if (is2025Config) {
      console.log('✅ Environment file configured for 2025 UIDAI sandbox');
    } else {
      console.log('❌ Environment file NOT properly configured for 2025 UIDAI sandbox');
    }
    
    return is2025Config;
  } catch (error) {
    console.log('❌ Could not read environment file:', error.message);
    return false;
  }
}

async function generateReport() {
  console.log('\n📋 GENERATING 2025 UIDAI CONFIGURATION REPORT');
  console.log('='.repeat(50));
  
  // Check environment configuration
  const envConfigured = await checkEnvironmentFile();
  
  // Start server and run tests
  const { serverProcess, serverOutput } = await startServer();
  
  try {
    const healthOk = await verifyHealth();
    const configValid = await verifyConfiguration();
    const sessionId = await testSessionCreation();
    const authResult = sessionId ? await testAuthentication(sessionId) : null;
    
    console.log('\n📊 FINAL VERIFICATION RESULTS');
    console.log('='.repeat(30));
    console.log('Environment File (2025 Config):', envConfigured ? '✅ PASS' : '❌ FAIL');
    console.log('Server Health:', healthOk ? '✅ PASS' : '❌ FAIL');
    console.log('Configuration Validation:', configValid ? '✅ PASS' : '❌ FAIL');
    console.log('Session Creation:', sessionId ? '✅ PASS' : '❌ FAIL');
    console.log('UIDAI Authentication Test:', authResult ? '🔍 TESTED' : '❌ FAIL');
    
    if (envConfigured && healthOk && configValid) {
      console.log('\n🎉 SUCCESS: System is properly configured for 2025 UIDAI sandbox!');
      console.log('📝 Expected behavior: Authentication may fail due to sandbox limitations,');
      console.log('   but system should be using correct 2025 endpoints (authserver, uidotp)');
      console.log('   and credentials (public/public/public)');
    } else {
      console.log('\n⚠️  ISSUES DETECTED: System configuration needs attention');
    }
    
    // Check server logs for specific configuration evidence
    if (serverOutput.includes('authserver')) {
      console.log('✅ Server logs confirm 2025 authserver endpoint usage');
    } else if (serverOutput.includes('/auth/')) {
      console.log('❌ Server logs indicate old 2023 /auth/ endpoint usage');
    }
    
  } finally {
    console.log('\n🛑 Stopping server...');
    serverProcess.kill();
  }
}

// Run the verification
generateReport().catch(console.error); 