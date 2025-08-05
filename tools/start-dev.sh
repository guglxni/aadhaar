#!/bin/bash
# This script configures the environment and starts the NestJS server in development mode.

# Set the node environment
export NODE_ENV='development'

# Set the port
export PORT=3000

# Source the sandbox environment variables
if [ -f "sandbox-env.sh" ]; then
  source sandbox-env.sh
  echo "✅ Sandbox environment loaded."
else
  echo "⚠️  Warning: sandbox-env.sh not found."
fi

# Start the NestJS application in watch mode
echo "🚀 Starting server in development mode on port $PORT..."
npm run start:dev

# Note: This script requires execute permissions
# chmod +x start-dev.sh 