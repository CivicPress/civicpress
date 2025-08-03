/**
 * Error Handling Composable
 *
 * Centralized error handling for CivicPress UI with consistent error display,
 * logging, and user feedback.
 */

import { extractErrorMessage } from '~/utils/api-response';

export interface ErrorOptions {
  title?: string;
  showToast?: boolean;
  logToConsole?: boolean;
  fallbackMessage?: string;
}

export function useErrorHandler() {
  const { $toast } = useNuxtApp();

  /**
   * Handle API errors with consistent formatting and user feedback
   */
  const handleApiError = (error: any, options: ErrorOptions = {}) => {
    const {
      title = 'Error',
      showToast = true,
      logToConsole = true,
      fallbackMessage = 'An unexpected error occurred',
    } = options;

    // Extract error message
    const errorMessage = extractErrorMessage(error, fallbackMessage);

    // Log to console if enabled
    if (logToConsole) {
      console.error(`[${title}]`, errorMessage, error);
    }

    // Show toast notification if enabled
    if (showToast && $toast) {
      $toast.add({
        title,
        description: errorMessage,
        color: 'red',
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
    } = options;

    const isNetworkError =
      error?.code === 'NETWORK_ERROR' ||
      error?.message?.includes('network') ||
      error?.message?.includes('fetch');

    const message = isNetworkError
      ? 'Unable to connect to the server. Please check your internet connection.'
      : extractErrorMessage(error, 'Connection failed');

    if (logToConsole) {
      console.error(`[${title}]`, message, error);
    }

    if (showToast && $toast) {
      $toast.add({
        title,
        description: message,
        color: 'red',
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

    if (logToConsole) {
      console.warn(`[${title}]`, message, error);
    }

    if (showToast && $toast) {
      $toast.add({
        title,
        description: message,
        color: 'orange',
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
    } = options;

    const message = extractErrorMessage(error, 'Authentication failed');

    if (logToConsole) {
      console.error(`[${title}]`, message, error);
    }

    if (showToast && $toast) {
      $toast.add({
        title,
        description: message,
        color: 'red',
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
