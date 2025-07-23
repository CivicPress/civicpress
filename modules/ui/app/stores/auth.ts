import { defineStore } from 'pinia';

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  role: string;
  avatar?: string;
  permissions: string[];
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  sessionExpiresAt: string | null;
  loading: boolean;
  error: string | null;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    isAuthenticated: false,
    token: null,
    sessionExpiresAt: null,
    loading: false,
    error: null,
  }),

  getters: {
    currentUser: (state) => state.user,
    isLoggedIn: (state) => state.isAuthenticated && !!state.token,
    hasPermission: (state) => (permission: string) => {
      return state.user?.permissions.includes(permission) || false;
    },
    hasRole: (state) => (role: string) => {
      return state.user?.role === role;
    },
    isLoading: (state) => state.loading,
    authError: (state) => state.error,
  },

  actions: {
    // Private method to handle common login logic
    async handleLoginResponse(
      response: any,
      errorMessage: string = 'Login failed'
    ) {
      // Safely extract user and token from the response
      if (
        typeof response === 'object' &&
        response !== null &&
        'success' in response &&
        (response as any).success &&
        'data' in response &&
        (response as any).data?.session
      ) {
        const { session } = (response as any).data;

        // Update user info
        this.user = {
          id: session.user.id.toString(),
          username: session.user.username,
          email: session.user.email,
          name: session.user.name,
          role: session.user.role,
          avatar: session.user.avatar_url,
          permissions: [], // TODO: Add permissions if available
        };

        // Update token and auth state
        this.token = session.token;
        this.sessionExpiresAt = session.expiresAt;
        this.isAuthenticated = true;

        // Store token and expiration in localStorage with civic_ prefix
        if (process.client) {
          localStorage.setItem('civic_auth_token', session.token);
          localStorage.setItem('civic_auth_expires_at', session.expiresAt);
        }
      } else {
        throw new Error('Invalid response format');
      }

      return response;
    },

    async login(username: string, password: string) {
      this.loading = true;
      this.error = null;
      try {
        const response = await useNuxtApp().$civicApi('/auth/password', {
          method: 'POST',
          body: { username, password },
        });

        console.log('response', response);
        return await this.handleLoginResponse(response, 'Login failed');
      } catch (error: any) {
        this.error = error.message || 'Login failed';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async loginWithToken(token: string) {
      this.loading = true;
      this.error = null;
      try {
        const response = await useNuxtApp().$civicApi('/auth/login', {
          method: 'POST',
          body: { token, provider: 'github' },
        });

        console.log('response', response);
        return await this.handleLoginResponse(response, 'Token login failed');
      } catch (error: any) {
        this.error = error.message || 'Token login failed';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async logout() {
      this.loading = true;

      try {
        // Call logout API if we have a token
        if (this.token) {
          await useNuxtApp().$civicApi('/auth/logout', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.token}`,
            },
          });
        }
      } catch (error) {
        // Continue with logout even if API call fails
        console.warn('Logout API call failed:', error);
      } finally {
        this.clearAuth();
        this.loading = false;
      }
    },

    async checkAuth() {
      if (!this.token) {
        // Try to get token from localStorage
        if (process.client) {
          const storedToken = localStorage.getItem('civic_auth_token');
          if (storedToken) {
            this.token = storedToken;
          } else {
            return false;
          }
        } else {
          return false;
        }
      }

      try {
        const response = await $fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });

        this.user = response.user;
        this.isAuthenticated = true;
        return true;
      } catch (error) {
        this.clearAuth();
        return false;
      }
    },

    clearAuth() {
      this.user = null;
      this.token = null;
      this.isAuthenticated = false;
      this.error = null;

      if (process.client) {
        localStorage.removeItem('civic_auth_token');
        localStorage.removeItem('civic_auth_expires_at');
      }
    },

    setError(error: string) {
      this.error = error;
    },

    clearError() {
      this.error = null;
    },

    updateUser(userData: Partial<User>) {
      if (this.user) {
        this.user = { ...this.user, ...userData };
      }
    },
  },
});
