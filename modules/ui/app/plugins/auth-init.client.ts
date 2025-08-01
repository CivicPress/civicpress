export default defineNuxtPlugin(async () => {
  const authStore = useAuthStore();

  // Initialize auth state on app load
  await authStore.initializeAuth();
});
