/**
 * API Response Utility Functions
 *
 * Centralized handling for CivicPress API responses to ensure consistency
 * and reduce code duplication across stores and components.
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  /**
   * Server-side errors use the structured object form; a small number
   * of UI-side helpers historically expected a bare string (the `as any`
   * casts hid the mismatch). Accept both for backward compat.
   */
  error?:
    | string
    | {
        message: string;
        code?: string;
        details?: any[];
        correlationId?: string;
      };
  timestamp?: string;
  path?: string;
  method?: string;
  requestId?: string;
  /**
   * A handful of legacy endpoints return data at the top level instead
   * of wrapping it in `.data`. The index signature preserves that
   * access pattern (`response.organization`, `response.message`, etc.)
   * without re-introducing `as any`. Field types are `unknown`, so
   * call sites must narrow before use.
   */
  [key: string]: unknown;
}

/**
 * Validates and extracts data from API responses
 * @param response - The API response to validate
 * @param requiredFields - Optional array of required fields in the data object
 * @returns The validated data from the response
 * @throws Error if response is invalid or missing required fields
 */
export function validateApiResponse<T = any>(
  response: any,
  requiredFields?: string[]
): T {
  // Basic response structure validation
  if (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    response.success &&
    'data' in response &&
    response.data
  ) {
    const data = response.data as T;

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
export function safeExtractData<T = any>(response: any, defaultValue: T): T {
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
export function isValidApiResponse(response: any): response is ApiResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    typeof response.success === 'boolean'
  );
}

/**
 * Extracts error message from API response
 * @param response - The API response
 * @param defaultMessage - Default error message if none found
 * @returns The error message
 */
export function extractErrorMessage(
  response: any,
  defaultMessage: string = 'API request failed'
): string {
  if (response && typeof response === 'object') {
    // Try to get error from response.error
    if ('error' in response && response.error) {
      // Server's structured error
      if (typeof response.error === 'object' && response.error?.message) {
        return response.error.message;
      }
      // Legacy: some endpoints return a bare string for `error`
      if (typeof response.error === 'string') {
        return response.error;
      }
    }

    // Try to get error from response.data.error
    if ('data' in response && response.data?.error?.message) {
      return response.data.error.message;
    }

    // Try to get error from response.message
    if ('message' in response && response.message) {
      return response.message;
    }
  }

  return defaultMessage;
}

/**
 * Extracts correlation ID from API error response
 * @param response - The API response
 * @returns The correlation ID if present, undefined otherwise
 */
export function extractCorrelationId(response: any): string | undefined {
  if (response && typeof response === 'object') {
    // Try to get correlation ID from response.error
    if ('error' in response && response.error?.correlationId) {
      return response.error.correlationId;
    }

    // Try to get correlation ID from response.data.error
    if ('data' in response && response.data?.error?.correlationId) {
      return response.data.error.correlationId;
    }

    // Try to get correlation ID from response.correlationId
    if ('correlationId' in response) {
      return response.correlationId;
    }
  }

  return undefined;
}

/**
 * Extracts error code from API error response
 * @param response - The API response
 * @returns The error code if present, undefined otherwise
 */
export function extractErrorCode(response: any): string | undefined {
  if (response && typeof response === 'object') {
    // Try to get error code from response.error
    if ('error' in response && response.error?.code) {
      return response.error.code;
    }

    // Try to get error code from response.data.error
    if ('data' in response && response.data?.error?.code) {
      return response.data.error.code;
    }

    // Try to get error code from response.code
    if ('code' in response) {
      return response.code;
    }
  }

  return undefined;
}
