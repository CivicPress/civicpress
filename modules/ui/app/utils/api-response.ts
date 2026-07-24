/**
 * API Response Utility Functions
 *
 * Centralized handling for CivicPress API responses to ensure consistency
 * and reduce code duplication across stores and components.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  /**
   * The canonical error shape — ONE object everywhere (the envelope
   * standardization). `requestId`, when present, comes from the uncaught-error
   * fallback for support-ticket correlation. The bare-`string` arm and the
   * top-level index signature that used to sit here are gone: the server emits
   * neither a string error nor a top-level payload (every response wraps its
   * body in `.data`), and a full `nuxt typecheck` confirms no consumer relies
   * on them.
   */
  error?: {
    message: string;
    code?: string;
    details?: unknown[];
    correlationId?: string;
    requestId?: string;
  };
  // Canonical success envelope also carries these at the top level.
  message?: string;
  meta?: Record<string, unknown>;
}

/**
 * Validates and extracts data from API responses
 * @param response - The API response to validate
 * @param requiredFields - Optional array of required fields in the data object
 * @returns The validated data from the response
 * @throws Error if response is invalid or missing required fields
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateApiResponse<T = any>(
  response: unknown,
  requiredFields?: string[]
): T {
  // Basic response structure validation
  if (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    (response as { success: unknown }).success &&
    'data' in response &&
    (response as { data: unknown }).data
  ) {
    const data = (response as { data: unknown }).data as T;

    // Validate required fields if specified
    if (requiredFields && Array.isArray(requiredFields)) {
      for (const field of requiredFields) {
        if (!(field in (data as object))) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
    }

    return data;
  }

  // Handle error responses
  if (response && typeof response === 'object' && 'error' in response) {
    const errorMessage = extractErrorMessage(response) || 'API request failed';
    throw new Error(errorMessage);
  }

  // Generic invalid response error
  throw new Error('Invalid API response format');
}

/**
 * Safely extracts data from API responses with optional default value
 * @param response - The API response to extract data from
 * @param defaultValue - Default value to return if response is invalid
 * @returns The data or default value
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeExtractData<T = any>(
  response: unknown,
  defaultValue: T
): T {
  try {
    return validateApiResponse<T>(response);
  } catch (error) {
    console.warn('Failed to extract data from API response:', error);
    return defaultValue;
  }
}

/**
 * Type guard to check if a response is a valid API response
 * @param response - The response to check
 * @returns True if the response has the expected structure
 */
export function isValidApiResponse(response: unknown): response is ApiResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    typeof (response as { success: unknown }).success === 'boolean'
  );
}

/**
 * Narrow access for a structural-shaped api error/response without re-casting.
 * Returns `undefined` if the response isn't an object.
 */
function asRecord(response: unknown): Record<string, unknown> | undefined {
  return response && typeof response === 'object'
    ? (response as Record<string, unknown>)
    : undefined;
}

/**
 * Extracts error message from API response
 * @param response - The API response
 * @param defaultMessage - Default error message if none found
 * @returns The error message
 */
export function extractErrorMessage(
  response: unknown,
  defaultMessage: string = 'API request failed'
): string {
  const r = asRecord(response);
  if (!r) return defaultMessage;

  // Try to get error from response.error
  const err = r.error;
  if (err) {
    if (typeof err === 'object' && err !== null) {
      const m = (err as { message?: unknown }).message;
      if (typeof m === 'string') return m;
    }
    if (typeof err === 'string') return err;
  }

  // Try to get error from response.data.error
  const data = r.data;
  if (data && typeof data === 'object') {
    const dataErr = (data as { error?: unknown }).error;
    if (dataErr && typeof dataErr === 'object') {
      const m = (dataErr as { message?: unknown }).message;
      if (typeof m === 'string') return m;
    }
  }

  // Try to get error from response.message
  if (typeof r.message === 'string' && r.message) return r.message;

  return defaultMessage;
}

/**
 * Extracts correlation ID from API error response
 * @param response - The API response
 * @returns The correlation ID if present, undefined otherwise
 */
export function extractCorrelationId(response: unknown): string | undefined {
  const r = asRecord(response);
  if (!r) return undefined;

  const err = r.error;
  if (err && typeof err === 'object') {
    const cid = (err as { correlationId?: unknown }).correlationId;
    if (typeof cid === 'string') return cid;
  }

  const data = r.data;
  if (data && typeof data === 'object') {
    const dataErr = (data as { error?: unknown }).error;
    if (dataErr && typeof dataErr === 'object') {
      const cid = (dataErr as { correlationId?: unknown }).correlationId;
      if (typeof cid === 'string') return cid;
    }
  }

  if (typeof r.correlationId === 'string') return r.correlationId;
  return undefined;
}

/**
 * Extracts error code from API error response
 * @param response - The API response
 * @returns The error code if present, undefined otherwise
 */
export function extractErrorCode(response: unknown): string | undefined {
  const r = asRecord(response);
  if (!r) return undefined;

  const err = r.error;
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }

  const data = r.data;
  if (data && typeof data === 'object') {
    const dataErr = (data as { error?: unknown }).error;
    if (dataErr && typeof dataErr === 'object') {
      const code = (dataErr as { code?: unknown }).code;
      if (typeof code === 'string') return code;
    }
  }

  if (typeof r.code === 'string') return r.code;
  return undefined;
}
