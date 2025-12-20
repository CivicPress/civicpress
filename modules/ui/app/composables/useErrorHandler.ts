/**
 * Error Handling Composable
 *
 * Centralized error handling for CivicPress UI with consistent error display,
 * logging, and user feedback.
 */

import {
  extractErrorMessage,
  extractCorrelationId,
  extractErrorCode,
} from '~/utils/api-response';

export interface ErrorOptions {
  title?: string;
  showToast?: boolean;
  logToConsole?: boolean;
  fallbackMessage?: string;
  showCorrelationId?: boolean; // Show correlation ID in dev mode
}

export function useErrorHandler() {
  const nuxtApp = useNuxtApp();
  const $toast = (nuxtApp as any).$toast;

  /**
   * Handle API errors with consistent formatting and user feedback
   */
  const handleApiError = (error: any, options: ErrorOptions = {}) => {
    const {
      title = 'Error',
      showToast = true,
      logToConsole = true,
      fallbackMessage = 'An unexpected error occurred',
      showCorrelationId = process.env.NODE_ENV === 'development',
    } = options;

    // Extract error details
    const errorMessage = extractErrorMessage(error, fallbackMessage);
    const correlationId = extractCorrelationId(error);
    const errorCode = extractErrorCode(error);

    // Log to console if enabled
    if (logToConsole) {
      const logData: any = {
        message: errorMessage,
        error,
      };

      if (correlationId) {
        logData.correlationId = correlationId;
      }
      if (errorCode) {
        logData.errorCode = errorCode;
      }

      console.error(`[${title}]`, errorMessage, logData);
    }

    // Build toast description with optional correlation ID
    let toastDescription = errorMessage;
    if (showCorrelationId && correlationId) {
      toastDescription = `${errorMessage}\n\nCorrelation ID: ${correlationId}`;
    }

    // Show toast notification if enabled
    if (showToast && $toast && typeof $toast.add === 'function') {
      $toast.add({
        title,
        description: toastDescription,
        color: 'error',
        icon: 'i-lucide-alert-circle',
        timeout: 5000,
      });
    }

    return errorMessage;
  };

  /**
   * Handle network/connection errors
   */
  const handleNetworkError = (error: any, options: ErrorOptions = {}) => {
    const {
      title = 'Connection Error',
      showToast = true,
      logToConsole = true,
      showCorrelationId = process.env.NODE_ENV === 'development',
    } = options;

    const isNetworkError =
      error?.code === 'NETWORK_ERROR' ||
      error?.message?.includes('network') ||
      error?.message?.includes('fetch');

    const message = isNetworkError
      ? 'Unable to connect to the server. Please check your internet connection.'
      : extractErrorMessage(error, 'Connection failed');

    const correlationId = extractCorrelationId(error);
    const errorCode = extractErrorCode(error);

    if (logToConsole) {
      const logData: any = {
        message,
        error,
      };

      if (correlationId) {
        logData.correlationId = correlationId;
      }
      if (errorCode) {
        logData.errorCode = errorCode;
      }

      console.error(`[${title}]`, message, logData);
    }

    // Build toast description with optional correlation ID
    let toastDescription = message;
    if (showCorrelationId && correlationId) {
      toastDescription = `${message}\n\nCorrelation ID: ${correlationId}`;
    }

    if (showToast && $toast && typeof $toast.add === 'function') {
      $toast.add({
        title,
        description: toastDescription,
        color: 'error',
        icon: 'i-lucide-wifi-off',
        timeout: 8000,
      });
    }

    return message;
  };

  /**
   * Handle validation errors
   */
  const handleValidationError = (error: any, options: ErrorOptions = {}) => {
    const {
      title = 'Validation Error',
      showToast = true,
      logToConsole = true,
      showCorrelationId = process.env.NODE_ENV === 'development',
    } = options;

    let message = 'Please check your input and try again.';

    // Extract validation error details
    if (error?.details && Array.isArray(error.details)) {
      const fieldErrors = error.details
        .map((detail: any) => detail.msg || detail.message)
        .filter(Boolean)
        .join(', ');

      if (fieldErrors) {
        message = fieldErrors;
      }
    } else {
      message = extractErrorMessage(error, message);
    }

    const correlationId = extractCorrelationId(error);
    const errorCode = extractErrorCode(error);

    if (logToConsole) {
      const logData: any = {
        message,
        error,
      };

      if (correlationId) {
        logData.correlationId = correlationId;
      }
      if (errorCode) {
        logData.errorCode = errorCode;
      }

      console.warn(`[${title}]`, message, logData);
    }

    // Build toast description with optional correlation ID
    let toastDescription = message;
    if (showCorrelationId && correlationId) {
      toastDescription = `${message}\n\nCorrelation ID: ${correlationId}`;
    }

    if (showToast && $toast && typeof $toast.add === 'function') {
      $toast.add({
        title,
        description: toastDescription,
        color: 'primary',
        icon: 'i-lucide-alert-triangle',
        timeout: 6000,
      });
    }

    return message;
  };

  /**
   * Handle authentication errors
   */
  const handleAuthError = (error: any, options: ErrorOptions = {}) => {
    const {
      title = 'Authentication Error',
      showToast = true,
      logToConsole = true,
      showCorrelationId = process.env.NODE_ENV === 'development',
    } = options;

    const message = extractErrorMessage(error, 'Authentication failed');
    const correlationId = extractCorrelationId(error);
    const errorCode = extractErrorCode(error);

    if (logToConsole) {
      const logData: any = {
        message,
        error,
      };

      if (correlationId) {
        logData.correlationId = correlationId;
      }
      if (errorCode) {
        logData.errorCode = errorCode;
      }

      console.error(`[${title}]`, message, logData);
    }

    // Build toast description with optional correlation ID
    let toastDescription = message;
    if (showCorrelationId && correlationId) {
      toastDescription = `${message}\n\nCorrelation ID: ${correlationId}`;
    }

    if (showToast && $toast && typeof $toast.add === 'function') {
      $toast.add({
        title,
        description: toastDescription,
        color: 'error',
        icon: 'i-lucide-shield-alert',
        timeout: 5000,
      });
    }

    return message;
  };

  /**
   * Generic error handler that determines error type
   */
  const handleError = (error: any, options: ErrorOptions = {}) => {
    // Determine error type and route to appropriate handler
    if (
      error?.code === 'NETWORK_ERROR' ||
      error?.message?.includes('network')
    ) {
      return handleNetworkError(error, options);
    }

    if (error?.status === 422 || error?.details) {
      return handleValidationError(error, options);
    }

    if (error?.status === 401 || error?.status === 403) {
      return handleAuthError(error, options);
    }

    // Default to API error handler
    return handleApiError(error, options);
  };

  /**
   * Clear all error states (useful for form resets)
   */
  const clearErrors = () => {
    // This could be extended to clear store errors as well
    console.log('Clearing error states');
  };

  return {
    handleError,
    handleApiError,
    handleNetworkError,
    handleValidationError,
    handleAuthError,
    clearErrors,
  };
}
