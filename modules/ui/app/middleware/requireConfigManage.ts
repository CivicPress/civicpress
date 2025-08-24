export const middleware = defineNuxtRouteMiddleware((_to, _from) => {
  const authStore = useAuthStore();
  if (!authStore.hasPermission('config:manage')) {
    useToast().add({
      title: 'Access denied',
      description: 'You do not have permission to manage configuration.',
      color: 'error',
    });
    return navigateTo('/settings');
  }
});

export default middleware;
export default defineNuxtRouteMiddleware((_to, _from) => {
  const authStore = useAuthStore();
  if (!authStore.hasPermission('config:manage')) {
    useToast().add({
      title: 'Access denied',
      description: 'You do not have permission to manage configuration.',
      color: 'error',
    });
    return navigateTo('/settings');
  }
});
