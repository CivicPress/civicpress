export default defineNuxtRouteMiddleware((_to, _from) => {
  const authStore = useAuthStore();
  if (!authStore.hasPermission('broadcast-box:sessions:view')) {
    useToast().add({
      title: 'Access denied',
      description: 'You do not have permission to manage broadcast devices.',
      color: 'error',
    });
    return navigateTo('/settings');
  }
});
