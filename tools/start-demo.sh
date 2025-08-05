#!/bin/bash

# UIDAI Aadhaar Sandbox Demo - Quick Start Script
# This script launches the complete demo environment for evaluators

echo "🚀 UIDAI Aadhaar Sandbox Demo - Quick Start"
echo "=========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm and try again."
    exit 1
fi

echo "✅ Node.js and npm are available"
echo ""

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
    echo "✅ Dependencies installed successfully"
    echo ""
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚙️  Creating environment configuration..."
    cat > .env << EOF
# UIDAI Sandbox Configuration
LICENSE_KEY=MG_g7jJVYUIW7cLYXY5yaqKD6D1TuhjTJdQRRKP1qALVyORrG1pf0QU
AUA_CODE=0000440000
SERVER_BASE_URL=http://localhost:3002
PORT=3002

# UIDAI Sandbox URLs
UIDAI_OTP_URL=https://auth.uidai.gov.in/otp
UIDAI_AUTH_URL=https://auth.uidai.gov.in/auth

# Certificate Paths
UIDAI_CERT_PATH=./certs/uidai_auth_prod_2023.cer
AUA_CERT_PATH=./certs/aua_cert.pem
AUA_KEY_PATH=./certs/aua_key.pem

# Demo Configuration
DEMO_MODE=true
LOG_LEVEL=debug
ENABLE_AUDIT_LOGGING=true
EOF
    echo "✅ Environment configuration created"
    echo ""
fi

# Build the application
echo "🔨 Building the application..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "✅ Application built successfully"
echo ""

# Start the application in the background
npm run start:dev &
BG_PID=$!

echo "✅ Server is starting in the background with PID: $BG_PID"
echo "   It may take 15-30 seconds for the server to be ready."
echo ""
echo "🔗 Access the demo at: http://localhost:3002/demo.html"
echo ""
echo "🔴 To STOP the server, run the following command:"
echo "   kill $BG_PID"
echo ""

# Wait for the server to be ready
echo "⏳ Waiting for server to become available..."
sleep 15 # Wait for 15 seconds

# Check if server is up
if curl -s --head http://localhost:3002/demo.html | head -n 1 | grep "200 OK" > /dev/null; then
  echo "✅ Server is up and running!"
  # Open the demo URL in the default browser
  open http://localhost:3002/demo.html
else
  echo "❌ Server failed to start. Please check the logs."
  echo "   To see logs, stop the server (kill $BG_PID) and run 'npm run start:dev' in the terminal."
fi

echo ""
echo "👋 Demo session ended. Thank you for evaluating!"
echo "📞 For questions or support, please refer to the documentation." 