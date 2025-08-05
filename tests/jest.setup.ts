// Jest setup for UIDAI E2E testing
import { config } from 'dotenv';

// Load environment variables for testing
config({ path: '.env' });

// Extend Jest timeout for UIDAI API calls which may have retries
jest.setTimeout(120000); // 2 minutes for comprehensive tests

// Global test configuration
global.console = {
  ...console,
  // Preserve important test logs but suppress some noise
  log: jest.fn((...args) => {
    const message = args.join(' ');
    if (message.includes('[TEST-LOG]') || message.includes('UIDAI') || message.includes('ERROR')) {
      console.log(...args);
    }
  }),
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
};

// Setup test artifacts directory
import * as fs from 'fs';
import * as path from 'path';

const testArtifactsDir = path.join(process.cwd(), 'test-artifacts');
if (!fs.existsSync(testArtifactsDir)) {
  fs.mkdirSync(testArtifactsDir, { recursive: true });
}

console.log(`🧪 Jest setup complete - Test artifacts: ${testArtifactsDir}`); 