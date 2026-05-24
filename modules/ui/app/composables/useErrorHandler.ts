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

/** Minimal toast interface used by the handlers — matches `useToast()` shape. */
interface ToastApi {
  add: (toast: {
    title?: string;
    description?: string;
    color?: string;
    icon?: string;
    timeout?: number;
  }) => void;
}

interface ErrorLogData {
  message: string;
  error: unknown;
  correlationId?: string;
  errorCode?: string;
}

/** Narrowed access for an api-error-like thrown value. */
function asErrorRecord(error: unknown): Record<string, unknown> {
  return error && typeof error === 'object'
    ? (error as Record<string, unknown>)
    : {};
}

export function useErrorHandler() {
  const nuxtApp = useNuxtApp();
  const $toast = (nuxtApp as unknown as { $toast?: ToastApi }).$toast;

  /**
   * Handle API errors with consistent formatting and user feedback
   */
  const handleApiError = (error: unknown, options: ErrorOptions = {}) => {
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
      const logData: ErrorLogData = {
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
  const handleNetworkError = (error: unknown, options: ErrorOptions = {}) => {
    const {
      title = 'Connection Error',
      showToast = true,
      logToConsole = true,
      showCorrelationId = process.env.NODE_ENV === 'development',
    } = options;

    const eRec = asErrorRecord(error);
    const eMsg = typeof eRec.message === 'string' ? eRec.message : '';
    const isNetworkError =
      eRec.code === 'NETWORK_ERROR' ||
      eMsg.includes('network') ||
      eMsg.includes('fetch');

    const message = isNetworkError
      ? 'Unable to connect to the server. Please check your internet connection.'
      : extractErrorMessage(error, 'Connection failed');

    const correlationId = extractCorrelationId(error);
    const errorCode = extractErrorCode(error);

    if (logToConsole) {
      const logData: ErrorLogData = {
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
  const handleValidationError = (error: unknown, options: ErrorOptions = {}) => {
    const {
      title = 'Validation Error',
      showToast = true,
      logToConsole = true,
      showCorrelationId = process.env.NODE_ENV === 'development',
    } = options;

    let message = 'Please check your input and try again.';

    // Extract validation error details
    const eRec = asErrorRecord(error);
    if (Array.isArray(eRec.details)) {
      const fieldErrors = (eRec.details as Array<Record<string, unknown>>)
        .map((detail) => {
          const msg = detail.msg ?? detail.message;
          return typeof msg === 'string' ? msg : undefined;
        })
        .filter((m): m is string => !!m)
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
      const logData: ErrorLogData = {
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
  const handleAuthError = (error: unknown, options: ErrorOptions = {}) => {
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
      const logData: ErrorLogData = {
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
  const handleError = (error: unknown, options: ErrorOptions = {}) => {
    const eRec = asErrorRecord(error);
    const eMsg = typeof eRec.message === 'string' ? eRec.message : '';
    // Determine error type and route to appropriate handler
    if (eRec.code === 'NETWORK_ERROR' || eMsg.includes('network')) {
      return handleNetworkError(error, options);
    }

    if (eRec.status === 422 || eRec.details) {
      return handleValidationError(error, options);
    }

    if (eRec.status === 401 || eRec.status === 403) {
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
