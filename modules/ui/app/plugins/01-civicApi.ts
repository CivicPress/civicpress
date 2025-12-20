export default defineNuxtPlugin(async (nuxtApp) => {
  // Initialize CSRF token on plugin load (client-side only)
  if (process.client) {
    const { ensureCsrfToken } = useCsrf();
    // Fetch CSRF token asynchronously (don't block plugin initialization)
    ensureCsrfToken().catch((error) => {
      console.warn('Failed to initialize CSRF token:', error);
    });
  }

  const civicApi = $fetch.create({
    baseURL: useRuntimeConfig().public.civicApiUrl,
    async onRequest({ request, options }) {
      // Skip authorization for public endpoints only
      const url = typeof request === 'string' ? request : request.toString();
      const isPublicEndpoint =
        url.includes('/api/v1/auth/login') ||
        url.includes('/api/v1/auth/password') ||
        url.includes('/api/v1/health') ||
        url.includes('/api/v1/info') ||
        url.includes('/api/v1/docs') ||
        url.includes('/api/v1/auth/csrf-token'); // CSRF endpoint is public

      // Get headers object and normalize to plain object
      const headers = options.headers as any;
      const headersObj: Record<string, string> = {};

      // Convert headers to object format
      if (Array.isArray(headers)) {
        Object.assign(headersObj, Object.fromEntries(headers));
      } else if (headers instanceof Headers) {
        headers.forEach((value, key) => {
          headersObj[key] = value;
        });
      } else if (headers && typeof headers === 'object') {
        Object.assign(headersObj, headers);
      }

      // Add CSRF token for state-changing methods (even if Bearer token bypasses it)
      // This ensures consistency and future-proofing for cookie-based sessions
      if (!isPublicEndpoint && process.client) {
        const method = (options.method as string) || 'GET';
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
          const { getCsrfToken, ensureCsrfToken } = useCsrf();
          let csrfToken = getCsrfToken();

          // If no token, try to fetch one (non-blocking)
          if (!csrfToken) {
            csrfToken = await ensureCsrfToken();
          }

          if (csrfToken) {
            headersObj['X-CSRF-Token'] = csrfToken;
          }
        }
      }

      // Add authorization header for authenticated requests
      if (!isPublicEndpoint) {
        const authStore = useAuthStore();

        if (authStore.isAuthenticated && authStore.token) {
          headersObj['Authorization'] = `Bearer ${authStore.token}`;
        }
      }

      // Update headers (use 'as any' to handle type compatibility)
      options.headers = headersObj as any;
    },
    async onResponseError({ request, options, response, error }) {
      // Enhanced error handling with automatic user feedback
      const { handleError } = useErrorHandler();

      // Create error object with status and response data
      // Include correlation ID and error code if present
      const apiError = {
        status: response.status,
        statusText: response.statusText,
        data: response._data,
        url: response.url,
        message:
          response._data?.error?.message ||
          response.statusText ||
          'Request failed',
        // Include correlation ID and error code for tracing
        correlationId: response._data?.error?.correlationId,
        errorCode: response._data?.error?.code,
        requestId: response._data?.requestId,
      };

      // Determine if the request attempted authenticated access
      const headers = options?.headers as any;
      const hasAuthHeader = (() => {
        if (!headers) return false;
        if (headers instanceof Headers) return headers.has('Authorization');
        if (Array.isArray(headers))
          return headers.some(
            (h) =>
              Array.isArray(h) && String(h[0]).toLowerCase() === 'authorization'
          );
        if (typeof headers === 'object')
          return Object.keys(headers).some(
            (k) => k.toLowerCase() === 'authorization'
          );
        return false;
      })();

      // Handle specific HTTP status codes
      switch (response.status) {
        case 401:
          // Only clear auth if this was an authenticated request (had Authorization header)
          if (hasAuthHeader) {
            console.log(
              'Unauthorized authenticated request, clearing auth state'
            );
            const authStore = useAuthStore();
            authStore.clearAuth();
            await navigateTo('/auth/login');
            handleError(apiError, {
              title: 'Session Expired',
              showToast: true,
              logToConsole: false,
            });
          } else {
            // For unauthenticated requests, do not clear persisted auth
            handleError(apiError, {
              title: 'Authentication Required',
              showToast: true,
            });
          }
          break;

        case 403:
          // Forbidden - show permission error
          handleError(apiError, {
            title: 'Access Denied',
            showToast: true,
          });
          break;

        case 422:
          // Validation error - show validation details
          handleError(apiError, {
            title: 'Validation Error',
            showToast: true,
          });
          break;

        case 500:
          // Server error - show generic error
          handleError(apiError, {
            title: 'Server Error',
            showToast: true,
          });
          break;

        default:
          // Generic error handling
          handleError(apiError, {
            title: 'Request Failed',
            showToast: true,
          });
      }

      // Re-throw the error so calling code can handle it if needed
      throw apiError;
    },
  });

  return {
    provide: {
      civicApi,
    },
  };
});
