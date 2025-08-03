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
            if (!headers) options.headers = {};
            (options.headers as any)['Authorization'] =
              `Bearer ${authStore.token}`;
          }
        }
      }
    },
    async onResponseError({ response, error }) {
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

      // Handle specific HTTP status codes
      switch (response.status) {
        case 401:
          // Unauthorized - clear auth state and redirect to login
          console.log('Unauthorized request, clearing auth state');
          const authStore = useAuthStore();
          authStore.clearAuth();
          await navigateTo('/auth/login');

          // Show authentication error toast
          handleError(apiError, {
            title: 'Session Expired',
            showToast: true,
            logToConsole: false, // Don't log auth errors to console
          });
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
