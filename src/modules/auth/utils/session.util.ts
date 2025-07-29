import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique session ID for cross-device authentication
 */
export function generateSessionId(): string {
  // Use a format that's easy to identify in logs: sess_[timestamp]_[random]
  const timestamp = Date.now().toString(36);
  const random = uuidv4().replace(/-/g, '').substring(0, 8);
  return `sess_${random}_${timestamp}`;
}

/**
 * Generate a device ID
 */
export function generateDeviceId(): string {
  return `device_${uuidv4()}`;
}

/**
 * Validate session ID format
 */
export function isValidSessionId(sessionId: string): boolean {
  return /^sess_[a-z0-9]{8}_[a-z0-9]+$/.test(sessionId);
}

/**
 * Extract timestamp from session ID
 */
export function getSessionTimestamp(sessionId: string): Date | null {
  try {
    const parts = sessionId.split('_');
    if (parts.length >= 3) {
      const timestamp = parseInt(parts[2], 36);
      return new Date(timestamp);
    }
    return null;
  } catch {
    return null;
  }
} 