/**
 * Standardized error codes matching the Broadcast Box protocol specification
 */

export enum BroadcastBoxErrorCode {
  // Session errors
  SESSION_ALREADY_ACTIVE = 'SESSION_ALREADY_ACTIVE',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  
  // Configuration errors
  INVALID_CONFIG = 'INVALID_CONFIG',
  
  // Device errors
  DEVICE_BUSY = 'DEVICE_BUSY',
  CAPTURE_ERROR = 'CAPTURE_ERROR',
  
  // Source errors
  SOURCE_NOT_FOUND = 'SOURCE_NOT_FOUND',
  SOURCE_NOT_AVAILABLE = 'SOURCE_NOT_AVAILABLE',
  
  // Generic errors
  COMMAND_FAILED = 'COMMAND_FAILED',
  DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
  DEVICE_NOT_CONNECTED = 'DEVICE_NOT_CONNECTED',
  TIMEOUT = 'TIMEOUT',
}

/**
 * Get human-readable error message for error code
 */
export function getErrorMessage(code: BroadcastBoxErrorCode): string {
  const messages: Record<BroadcastBoxErrorCode, string> = {
    [BroadcastBoxErrorCode.SESSION_ALREADY_ACTIVE]: 'Another session is already in progress',
    [BroadcastBoxErrorCode.SESSION_NOT_FOUND]: 'Session ID not found',
    [BroadcastBoxErrorCode.INVALID_CONFIG]: 'Configuration is invalid',
    [BroadcastBoxErrorCode.DEVICE_BUSY]: 'Device is busy with another operation',
    [BroadcastBoxErrorCode.CAPTURE_ERROR]: 'Video/audio capture error',
    [BroadcastBoxErrorCode.SOURCE_NOT_FOUND]: 'Requested source device not found',
    [BroadcastBoxErrorCode.SOURCE_NOT_AVAILABLE]: 'Requested source device not available',
    [BroadcastBoxErrorCode.COMMAND_FAILED]: 'Command execution failed',
    [BroadcastBoxErrorCode.DEVICE_NOT_FOUND]: 'Device not found',
    [BroadcastBoxErrorCode.DEVICE_NOT_CONNECTED]: 'Device is not connected',
    [BroadcastBoxErrorCode.TIMEOUT]: 'Command timeout',
  };
  
  return messages[code] || 'Unknown error';
}

