export default defineNuxtPlugin((nuxtApp) => {
  const civicApi = $fetch.create({
    baseURL: useRuntimeConfig().public.civicApiUrl,
    onRequest({ request, options }) {
      // console.log('civicApi onRequest', request, options);

      // Skip authorization for login endpoints
      const url = typeof request === 'string' ? request : request.toString();
      const isLoginEndpoint =
        url.includes('/auth/password') || url.includes('/auth/login');

      if (!isLoginEndpoint) {
        // Get auth store to check if user is logged in
        const authStore = useAuthStore();

        if (authStore.isAuthenticated && authStore.token) {
          // Add authorization header - use any to avoid TypeScript issues
          const headers = (options.headers ||= {});
          if (Array.isArray(headers)) {
            headers.push(['Authorization', `Bearer ${authStore.token}`]);
          } else if (headers instanceof Headers) {
            headers.set('Authorization', `Bearer ${authStore.token}`);
          } else if (typeof headers === 'object' && headers !== null) {
            // Use index signature to avoid TS error
            (headers as Record<string, string>)['Authorization'] =
              `Bearer ${authStore.token}`;
          }
        }
      }
    },
    async onResponseError({ response }) {
      if (response.status === 401) {
        // Handle unauthorized - clear auth state and redirect to login
        console.log('Unauthorized request, clearing auth state');
        // const authStore = useAuthStore();
        // authStore.clearAuth();
        // await navigateTo('/auth/login');
      }
    },
  });

  return {
    provide: {
      civicApi,
    },
  };
});
