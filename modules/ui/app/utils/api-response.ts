/**
 * API Response Utility Functions
 *
 * Centralized handling for CivicPress API responses to ensure consistency
 * and reduce code duplication across stores and components.
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  error?: {
    message: string;
    details?: any[];
  };
  timestamp?: string;
  path?: string;
  method?: string;
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
    const errorMessage = response.error?.message || 'API request failed';
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
    if ('error' in response && response.error?.message) {
      return response.error.message;
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
