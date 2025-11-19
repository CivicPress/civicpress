export default defineNuxtPlugin((nuxtApp) => {
  const civicApi = $fetch.create({
    baseURL: useRuntimeConfig().public.civicApiUrl,
    onRequest({ request, options }) {
      // Skip authorization for public endpoints only
      const url = typeof request === 'string' ? request : request.toString();
      const isPublicEndpoint =
        url.includes('/auth/login') ||
        url.includes('/auth/password') ||
        url.includes('/health') ||
        url.includes('/info') ||
        url.includes('/docs');

      if (!isPublicEndpoint) {
        // Get auth store to check if user is logged in
        const authStore = useAuthStore();

        if (authStore.isAuthenticated && authStore.token) {
          // Add authorization header - use any to avoid TypeScript issues
          const headers = options.headers as any;
          if (Array.isArray(headers)) {
            headers.push(['Authorization', `Bearer ${authStore.token}`]);
          } else if (headers instanceof Headers) {
            headers.set('Authorization', `Bearer ${authStore.token}`);
          } else {
            if (!headers) {
              options.headers = {} as any;
            }
            (options.headers as any)['Authorization'] =
              `Bearer ${authStore.token}`;
          }
        }
      }
    },
    async onResponseError({ request, options, response, error }) {
      // Enhanced error handling with automatic user feedback
      const { handleError } = useErrorHandler();

      // Create error object with status and response data
      const apiError = {
        status: response.status,
        statusText: response.statusText,
        data: response._data,
        url: response.url,
        message:
          response._data?.error?.message ||
          response.statusText ||
          'Request failed',
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
