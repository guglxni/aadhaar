const { spawn } = require('child_process');

console.log('🚀 Quick POC Test - Starting Server...');

// Set environment variables
process.env.NODE_ENV = 'development';
process.env.LICENSE_KEY = 'MG_g7jJVYUIW7cLYXY5yaqKD6D1TuhjTJdQRRKP1qALVyORrG1pf0QU';
process.env.AUA_CODE = '0000440000';
process.env.UIDAI_STAGING_URL = 'https://developer.uidai.gov.in';
process.env.UIDAI_PUBLIC_CERT_PATH = './certs/uidai-staging-public.cer';
process.env.AUA_PRIVATE_KEY_PATH = './certs/test-private-key.pem';

console.log('✅ Environment configured');
console.log('🔑 LICENSE_KEY:', process.env.LICENSE_KEY.substring(0, 20) + '...');
console.log('🏢 AUA_CODE:', process.env.AUA_CODE);

// Start the NestJS application
const child = spawn('npm', ['run', 'start:dev'], {
  stdio: 'inherit',
  env: process.env
});

child.on('error', (err) => {
  console.error('❌ Failed to start server:', err);
});

child.on('close', (code) => {
  console.log(`🔄 Server process exited with code ${code}`);
});

console.log('⏳ Server starting... Check http://localhost:3000 in a few seconds');

// Wait 15 seconds then test
setTimeout(async () => {
  console.log('\n🧪 Testing server endpoints...');
  
  try {
    const response = await fetch('http://localhost:3000/health');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Health check:', data);
    } else {
      console.log('❌ Health check failed:', response.status);
    }
  } catch (error) {
    console.log('❌ Server not responding:', error.message);
  }
}, 15000); 