export const middleware = defineNuxtRouteMiddleware((_to, _from) => {
  const authStore = useAuthStore();
  if (!authStore.hasPermission('users:manage')) {
    useToast().add({
      title: 'Access denied',
      description: 'You do not have permission to manage users.',
      color: 'error',
    });
    return navigateTo('/settings');
  }
});

export default middleware;
export default defineNuxtRouteMiddleware((_to, _from) => {
  const authStore = useAuthStore();
  if (!authStore.hasPermission('users:manage')) {
    useToast().add({
      title: 'Access denied',
      description: 'You do not have permission to manage users.',
      color: 'error',
    });
    return navigateTo('/settings');
  }
});
