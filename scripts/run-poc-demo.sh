#!/bin/bash
# This script provides a reliable, one-command way to start the Aadhaar POC server.
# It ensures a clean environment, correct configuration, and a stable production-style build.

echo "--- 🚀 Starting UIDAI POC Demo Server ---"

# --- Step 1: Set Up Environment ---
echo "1. Configuring environment variables..."
export NODE_ENV='production'
export PORT=3000
source sandbox-env.sh
echo "   - PORT set to $PORT"
echo "   - NODE_ENV set to $NODE_ENV"
echo "   - Sandbox credentials loaded."

# --- Step 2: Clean and Build ---
echo "2. Cleaning up old builds and creating a fresh one..."
rm -rf dist
npm run build
if [ $? -ne 0 ]; then
    echo "   - 💥 Build failed! Please check TypeScript errors. Aborting."
    exit 1
fi
echo "   - ✅ Build successful."

# --- Step 3: Launch Server ---
echo "3. Launching the compiled server..."
node dist/main.js 