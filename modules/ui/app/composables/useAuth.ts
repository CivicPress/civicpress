import { useAuthStore } from '~/stores/auth';

export const useAuth = () => {
  const authStore = useAuthStore();

  return {
    // State
    user: computed(() => authStore.currentUser),
    isAuthenticated: computed(() => authStore.isLoggedIn),
    isLoading: computed(() => authStore.isLoading),
    error: computed(() => authStore.authError),
    isInitialized: computed(() => authStore.isInitialized),

    // Getters
    hasPermission: authStore.hasPermission,
    hasRole: authStore.hasRole,

    // Actions
    login: authStore.login,
    loginWithToken: authStore.loginWithToken,
    logout: authStore.logout,
    refreshUser: authStore.refreshUser,
    updateUser: authStore.updateUser,
    setError: authStore.setError,
    clearError: authStore.clearError,
    validateToken: authStore.validateToken,
    initializeAuth: authStore.initializeAuth,
  };
};
