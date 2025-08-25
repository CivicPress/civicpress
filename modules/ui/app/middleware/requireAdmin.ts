export default defineNuxtRouteMiddleware((_to, _from) => {
  const authStore = useAuthStore();
  if (!authStore.hasPermission('system:admin')) {
    useToast().add({
      title: 'Access denied',
      description: 'Administrator permissions are required.',
      color: 'error',
    });
    return navigateTo('/settings');
  }
});
