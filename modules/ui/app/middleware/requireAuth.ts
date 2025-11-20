export default defineNuxtRouteMiddleware((_to, _from) => {
  const authStore = useAuthStore();

  if (!authStore.isLoggedIn) {
    useToast().add({
      title: 'Authentication required',
      description: 'Please log in to access this page.',
      color: 'error',
    });
    return navigateTo('/auth/login');
  }
});
