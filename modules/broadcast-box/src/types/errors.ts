/**
 * Standardized error codes and typed errors for Broadcast Box protocol.
 * All errors have a code and toDict() for structured API/ACK responses.
 */

export enum BroadcastBoxErrorCode {
  // General
  ERR_UNKNOWN = 'ERR_UNKNOWN',
  ERR_INVALID_COMMAND = 'ERR_INVALID_COMMAND',
  ERR_MISSING_PARAMETER = 'ERR_MISSING_PARAMETER',
  ERR_SERVICE_UNAVAILABLE = 'ERR_SERVICE_UNAVAILABLE',

  // Source
  ERR_SOURCE_NOT_FOUND = 'ERR_SOURCE_NOT_FOUND',
  ERR_SOURCE_NOT_CONFIGURED = 'ERR_SOURCE_NOT_CONFIGURED',
  ERR_DEVICE_NOT_FOUND = 'ERR_DEVICE_NOT_FOUND',
  // Legacy (kept for backward compatibility)
  SOURCE_NOT_FOUND = 'SOURCE_NOT_FOUND',
  SOURCE_NOT_AVAILABLE = 'SOURCE_NOT_AVAILABLE',

  // Session
  ERR_SESSION_NOT_ACTIVE = 'ERR_SESSION_NOT_ACTIVE',
  ERR_SESSION_ALREADY_ACTIVE = 'ERR_SESSION_ALREADY_ACTIVE',
  ERR_SESSION_INVALID_STATE = 'ERR_SESSION_INVALID_STATE',
  SESSION_ALREADY_ACTIVE = 'SESSION_ALREADY_ACTIVE',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',

  // Streaming
  ERR_STREAMING_NOT_CONFIGURED = 'ERR_STREAMING_NOT_CONFIGURED',
  ERR_STREAMING_ALREADY_ACTIVE = 'ERR_STREAMING_ALREADY_ACTIVE',
  ERR_STREAMING_NOT_ACTIVE = 'ERR_STREAMING_NOT_ACTIVE',
  ERR_STREAMING_CONNECTION_FAILED = 'ERR_STREAMING_CONNECTION_FAILED',

  // Preview
  ERR_PREVIEW_NOT_ACTIVE = 'ERR_PREVIEW_NOT_ACTIVE',
  ERR_WEBRTC_FAILED = 'ERR_WEBRTC_FAILED',

  // Storage
  ERR_STORAGE_FULL = 'ERR_STORAGE_FULL',
  ERR_FILE_NOT_FOUND = 'ERR_FILE_NOT_FOUND',

  // Configuration / device (legacy and generic)
  INVALID_CONFIG = 'INVALID_CONFIG',
  DEVICE_BUSY = 'DEVICE_BUSY',
  CAPTURE_ERROR = 'CAPTURE_ERROR',
  PIP_NOT_SUPPORTED = 'PIP_NOT_SUPPORTED',
  COMMAND_FAILED = 'COMMAND_FAILED',
  DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
  DEVICE_NOT_CONNECTED = 'DEVICE_NOT_CONNECTED',
  TIMEOUT = 'TIMEOUT',

  // Payload / capture / preview
  ERR_INVALID_PAYLOAD = 'ERR_INVALID_PAYLOAD',
  ERR_DEVICE_BUSY = 'ERR_DEVICE_BUSY',
  ERR_CAPTURE_NOT_ACTIVE = 'ERR_CAPTURE_NOT_ACTIVE',
  ERR_CAPTURE_ALREADY_ACTIVE = 'ERR_CAPTURE_ALREADY_ACTIVE',
  ERR_CAPTURE_FAILED = 'ERR_CAPTURE_FAILED',
  ERR_STREAMING_INVALID_URL = 'ERR_STREAMING_INVALID_URL',
  ERR_PREVIEW_ALREADY_ACTIVE = 'ERR_PREVIEW_ALREADY_ACTIVE',
  ERR_STORAGE_WRITE_FAILED = 'ERR_STORAGE_WRITE_FAILED',

  // Enrollment
  ERR_INVALID_ENROLLMENT_CODE = 'ERR_INVALID_ENROLLMENT_CODE',
  ERR_DEVICE_ALREADY_ENROLLED = 'ERR_DEVICE_ALREADY_ENROLLED',
  ERR_ENROLLMENT_DISABLED = 'ERR_ENROLLMENT_DISABLED',
  ERR_INVALID_REQUEST = 'ERR_INVALID_REQUEST',
}

/**
 * Structured error shape for API and ACK responses.
 */
export interface StructuredErrorDict {
  code: string;
  message: string;
  type: string;
  details?: Record<string, unknown>;
}

/**
 * Get human-readable error message for error code.
 */
export function getErrorMessage(code: BroadcastBoxErrorCode): string {
  const messages: Record<string, string> = {
    [BroadcastBoxErrorCode.ERR_UNKNOWN]: 'Unknown error',
    [BroadcastBoxErrorCode.ERR_INVALID_COMMAND]: 'Invalid command',
    [BroadcastBoxErrorCode.ERR_MISSING_PARAMETER]: 'Required parameter missing',
    [BroadcastBoxErrorCode.ERR_SERVICE_UNAVAILABLE]: 'Service unavailable',

    [BroadcastBoxErrorCode.ERR_SOURCE_NOT_FOUND]: 'Requested source not found',
    [BroadcastBoxErrorCode.ERR_SOURCE_NOT_CONFIGURED]:
      'Source not configured - set sources first',
    [BroadcastBoxErrorCode.ERR_DEVICE_NOT_FOUND]: 'Device not found',
    [BroadcastBoxErrorCode.SOURCE_NOT_FOUND]:
      'Requested source device not found',
    [BroadcastBoxErrorCode.SOURCE_NOT_AVAILABLE]:
      'Requested source device not available',

    [BroadcastBoxErrorCode.ERR_SESSION_NOT_ACTIVE]: 'No active session',
    [BroadcastBoxErrorCode.ERR_SESSION_ALREADY_ACTIVE]:
      'Another session is already in progress',
    [BroadcastBoxErrorCode.ERR_SESSION_INVALID_STATE]:
      'Session is in an invalid state',
    [BroadcastBoxErrorCode.SESSION_ALREADY_ACTIVE]:
      'Another session is already in progress',
    [BroadcastBoxErrorCode.SESSION_NOT_FOUND]: 'Session ID not found',

    [BroadcastBoxErrorCode.ERR_STREAMING_NOT_CONFIGURED]:
      'RTMP not configured - use stream.configure first',
    [BroadcastBoxErrorCode.ERR_STREAMING_ALREADY_ACTIVE]:
      'Streaming is already active',
    [BroadcastBoxErrorCode.ERR_STREAMING_NOT_ACTIVE]: 'Streaming is not active',
    [BroadcastBoxErrorCode.ERR_STREAMING_CONNECTION_FAILED]:
      'RTMP connection failed',

    [BroadcastBoxErrorCode.ERR_PREVIEW_NOT_ACTIVE]: 'Preview is not active',
    [BroadcastBoxErrorCode.ERR_WEBRTC_FAILED]: 'WebRTC negotiation failed',

    [BroadcastBoxErrorCode.ERR_STORAGE_FULL]: 'Storage full',
    [BroadcastBoxErrorCode.ERR_FILE_NOT_FOUND]: 'File not found',

    [BroadcastBoxErrorCode.INVALID_CONFIG]: 'Configuration is invalid',
    [BroadcastBoxErrorCode.DEVICE_BUSY]:
      'Device is busy with another operation',
    [BroadcastBoxErrorCode.CAPTURE_ERROR]: 'Video/audio capture error',
    [BroadcastBoxErrorCode.PIP_NOT_SUPPORTED]:
      'Picture-in-Picture is not supported on this device',
    [BroadcastBoxErrorCode.COMMAND_FAILED]: 'Command execution failed',
    [BroadcastBoxErrorCode.DEVICE_NOT_FOUND]: 'Device not found',
    [BroadcastBoxErrorCode.DEVICE_NOT_CONNECTED]: 'Device is not connected',
    [BroadcastBoxErrorCode.TIMEOUT]: 'Command timeout',

    [BroadcastBoxErrorCode.ERR_INVALID_PAYLOAD]: 'Invalid payload',
    [BroadcastBoxErrorCode.ERR_DEVICE_BUSY]:
      'Device is busy with another operation',
    [BroadcastBoxErrorCode.ERR_CAPTURE_NOT_ACTIVE]: 'Capture is not active',
    [BroadcastBoxErrorCode.ERR_CAPTURE_ALREADY_ACTIVE]:
      'Capture is already active',
    [BroadcastBoxErrorCode.ERR_CAPTURE_FAILED]: 'Capture failed',
    [BroadcastBoxErrorCode.ERR_STREAMING_INVALID_URL]: 'Invalid streaming URL',
    [BroadcastBoxErrorCode.ERR_PREVIEW_ALREADY_ACTIVE]:
      'Preview is already active',
    [BroadcastBoxErrorCode.ERR_STORAGE_WRITE_FAILED]: 'Storage write failed',

    [BroadcastBoxErrorCode.ERR_INVALID_ENROLLMENT_CODE]:
      'Invalid or expired enrollment code',
    [BroadcastBoxErrorCode.ERR_DEVICE_ALREADY_ENROLLED]:
      'Device is already enrolled',
    [BroadcastBoxErrorCode.ERR_ENROLLMENT_DISABLED]: 'Enrollment is disabled',
    [BroadcastBoxErrorCode.ERR_INVALID_REQUEST]: 'Invalid request',
  };

  return messages[code] ?? 'Unknown error';
}

/**
 * Infer error code from common error message text (e.g. from device or thrown Error).
 */
export function inferErrorCode(message: string): BroadcastBoxErrorCode {
  const m = message.toLowerCase();
  if (/not configured|configure first|stream\.configure/.test(m))
    return BroadcastBoxErrorCode.ERR_STREAMING_NOT_CONFIGURED;
  if (/already active|already in progress|already streaming/.test(m))
    return BroadcastBoxErrorCode.ERR_SESSION_ALREADY_ACTIVE;
  if (/streaming.*not active|not streaming/.test(m))
    return BroadcastBoxErrorCode.ERR_STREAMING_NOT_ACTIVE;
  if (/connection failed|connection refused|connection error/.test(m))
    return BroadcastBoxErrorCode.ERR_STREAMING_CONNECTION_FAILED;
  if (/device not found|device.*not found/.test(m))
    return BroadcastBoxErrorCode.ERR_DEVICE_NOT_FOUND;
  if (/source not found|source.*not found/.test(m))
    return BroadcastBoxErrorCode.ERR_SOURCE_NOT_FOUND;
  if (/not found/.test(m)) return BroadcastBoxErrorCode.ERR_SOURCE_NOT_FOUND;
  if (/timeout|timed out/.test(m)) return BroadcastBoxErrorCode.TIMEOUT;
  if (/not connected|disconnected/.test(m))
    return BroadcastBoxErrorCode.DEVICE_NOT_CONNECTED;
  if (/invalid command|unknown command/.test(m))
    return BroadcastBoxErrorCode.ERR_INVALID_COMMAND;
  if (/required|missing parameter/.test(m))
    return BroadcastBoxErrorCode.ERR_MISSING_PARAMETER;
  if (/webrtc|offer|answer|ice/.test(m))
    return BroadcastBoxErrorCode.ERR_WEBRTC_FAILED;
  if (/storage full|disk full/.test(m))
    return BroadcastBoxErrorCode.ERR_STORAGE_FULL;
  if (/file not found/.test(m)) return BroadcastBoxErrorCode.ERR_FILE_NOT_FOUND;
  if (/invalid payload|bad payload/.test(m))
    return BroadcastBoxErrorCode.ERR_INVALID_PAYLOAD;
  if (/device busy|device is busy/.test(m))
    return BroadcastBoxErrorCode.ERR_DEVICE_BUSY;
  if (/capture not active|not capturing/.test(m))
    return BroadcastBoxErrorCode.ERR_CAPTURE_NOT_ACTIVE;
  if (/capture already active|already capturing/.test(m))
    return BroadcastBoxErrorCode.ERR_CAPTURE_ALREADY_ACTIVE;
  if (/capture failed|capture error/.test(m))
    return BroadcastBoxErrorCode.ERR_CAPTURE_FAILED;
  if (/invalid.*url|invalid streaming url/.test(m))
    return BroadcastBoxErrorCode.ERR_STREAMING_INVALID_URL;
  if (/preview already active|preview.*already/.test(m))
    return BroadcastBoxErrorCode.ERR_PREVIEW_ALREADY_ACTIVE;
  if (/storage write|write failed/.test(m))
    return BroadcastBoxErrorCode.ERR_STORAGE_WRITE_FAILED;
  if (/invalid enrollment|enrollment code/.test(m))
    return BroadcastBoxErrorCode.ERR_INVALID_ENROLLMENT_CODE;
  if (/already enrolled|already registered/.test(m))
    return BroadcastBoxErrorCode.ERR_DEVICE_ALREADY_ENROLLED;
  if (/enrollment disabled/.test(m))
    return BroadcastBoxErrorCode.ERR_ENROLLMENT_DISABLED;
  return BroadcastBoxErrorCode.ERR_UNKNOWN;
}

// ---------------------------------------------------------------------------
// Typed errors (code + toDict for structured responses)
// ---------------------------------------------------------------------------

export class BroadcastBoxBaseError extends Error {
  readonly code: BroadcastBoxErrorCode;
  readonly details?: Record<string, unknown>;
  readonly errorType: string;

  constructor(
    code: BroadcastBoxErrorCode,
    message?: string,
    details?: Record<string, unknown>,
    errorType?: string
  ) {
    super(message ?? getErrorMessage(code));
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.errorType = errorType ?? this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toDict(): StructuredErrorDict {
    return {
      code: this.code,
      message: this.message,
      type: this.errorType,
      ...(this.details &&
        Object.keys(this.details).length > 0 && { details: this.details }),
    };
  }
}

export class StreamingError extends BroadcastBoxBaseError {
  constructor(
    code: BroadcastBoxErrorCode,
    message?: string,
    details?: Record<string, unknown>
  ) {
    super(code, message, details, 'StreamingError');
  }
}

export class SourceError extends BroadcastBoxBaseError {
  constructor(
    code: BroadcastBoxErrorCode,
    message?: string,
    details?: Record<string, unknown>
  ) {
    super(code, message, details, 'SourceError');
  }
}

export class PreviewError extends BroadcastBoxBaseError {
  constructor(
    code: BroadcastBoxErrorCode,
    message?: string,
    details?: Record<string, unknown>
  ) {
    super(code, message, details, 'PreviewError');
  }
}

export class SessionError extends BroadcastBoxBaseError {
  constructor(
    code: BroadcastBoxErrorCode,
    message?: string,
    details?: Record<string, unknown>
  ) {
    super(code, message, details, 'SessionError');
  }
}

export class StorageError extends BroadcastBoxBaseError {
  constructor(
    code: BroadcastBoxErrorCode,
    message?: string,
    details?: Record<string, unknown>
  ) {
    super(code, message, details, 'StorageError');
  }
}

export class EnrollmentError extends BroadcastBoxBaseError {
  constructor(
    code: BroadcastBoxErrorCode,
    message?: string,
    details?: Record<string, unknown>
  ) {
    super(code, message, details, 'EnrollmentError');
  }
}

/** Generic Broadcast Box error when no specific type applies. */
export class BroadcastBoxError extends BroadcastBoxBaseError {
  constructor(
    code: BroadcastBoxErrorCode,
    message?: string,
    details?: Record<string, unknown>
  ) {
    super(code, message, details, 'BroadcastBoxError');
  }
}

/**
 * Check if a value is a Broadcast Box typed error (has code and toDict).
 */
export function isBroadcastBoxError(
  err: unknown
): err is BroadcastBoxBaseError {
  return (
    err instanceof BroadcastBoxBaseError ||
    (typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      'toDict' in err &&
      typeof (err as BroadcastBoxBaseError).toDict === 'function')
  );
}

/**
 * Normalize unknown error to StructuredErrorDict (typed error, device ack, or inferred).
 */
export function toStructuredError(
  err: unknown,
  fallbackCode?: BroadcastBoxErrorCode
): StructuredErrorDict {
  if (isBroadcastBoxError(err)) return err.toDict();
  const originalMessage = err instanceof Error ? err.message : String(err);
  const code = fallbackCode ?? inferErrorCode(originalMessage);
  return {
    code,
    message: originalMessage || getErrorMessage(code),
    type: 'BroadcastBoxError',
    details:
      err instanceof Error ? { originalMessage: err.message } : undefined,
  };
}
