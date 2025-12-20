/**
 * Error Utilities
 *
 * Helper functions for working with errors in the CivicPress system.
 */

import {
  CivicPressError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  InternalError,
} from './index.js';

/**
 * Type guard to check if an error is a CivicPressError
 */
export function isCivicPressError(error: unknown): error is CivicPressError {
  return error instanceof CivicPressError;
}

/**
 * Extract error code from an error, with fallback
 */
export function getErrorCode(error: unknown): string {
  if (isCivicPressError(error)) {
    return error.code;
  }
  if (error instanceof Error && 'code' in error) {
    return String((error as any).code);
  }
  return 'INTERNAL_ERROR';
}

/**
 * Extract status code from an error, with fallback
 */
export function getStatusCode(error: unknown): number {
  if (isCivicPressError(error)) {
    return error.statusCode;
  }
  if (error instanceof Error && 'statusCode' in error) {
    return Number((error as any).statusCode) || 500;
  }
  return 500;
}

/**
 * Extract correlation ID from an error, if available
 */
export function getCorrelationId(error: unknown): string | undefined {
  if (isCivicPressError(error)) {
    return error.correlationId;
  }
  return undefined;
}

/**
 * Normalize an unknown error to a CivicPressError
 *
 * Useful for catching errors from external libraries or unknown sources
 */
export function normalizeError(
  error: unknown,
  defaultMessage: string = 'An unexpected error occurred'
): CivicPressError {
  if (isCivicPressError(error)) {
    return error;
  }

  if (error instanceof Error) {
    // Try to extract status code and code from error
    const statusCode = getStatusCode(error);
    const code = getErrorCode(error);

    // Create appropriate error type based on status code
    if (statusCode === 400) {
      return new ValidationError(error.message || defaultMessage, {
        originalError: error.toString(),
      });
    }
    if (statusCode === 404) {
      return new NotFoundError(error.message || defaultMessage);
    }
    if (statusCode === 401) {
      return new UnauthorizedError(error.message || defaultMessage);
    }
    if (statusCode === 403) {
      return new ForbiddenError(error.message || defaultMessage);
    }
    if (statusCode === 409) {
      return new ConflictError(error.message || defaultMessage);
    }

    // Default to InternalError
    return new InternalError(error.message || defaultMessage, {
      originalError: error.toString(),
      stack: error.stack,
      code,
    });
  }

  // Unknown error type - wrap in InternalError
  return new InternalError(defaultMessage, {
    originalError: String(error),
  });
}

/**
 * Report error through centralized output system
 *
 * This function bridges CivicPressError instances with the centralized
 * output functions (coreError, cliError, handleApiError).
 *
 * @param error - The error to report
 * @param outputFn - The output function to use (coreError, cliError, etc.)
 * @param operation - Optional operation name for context
 */
export function reportError(
  error: unknown,
  outputFn: (
    message: string,
    code?: string,
    details?: any,
    context?: Record<string, any>
  ) => void,
  operation?: string
): void {
  if (isCivicPressError(error)) {
    const details = error.getOutputDetails();
    outputFn(details.message, details.code, details.details, {
      ...details.context,
      ...(operation && { operation }),
    });
  } else {
    const normalized = normalizeError(error);
    const details = normalized.getOutputDetails();
    outputFn(details.message, details.code, details.details, {
      ...details.context,
      ...(operation && { operation }),
    });
  }
}
