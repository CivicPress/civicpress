import { defineStore } from 'pinia';
import { validateApiResponse } from '~/utils/api-response';

export interface User {
  id: number;
  username: string;
  email: string;
  name: string;
  role: string;
  avatar_url?: string;
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
  state: (): AuthState => {
    // Try to restore state from localStorage on initialization
    let initialState: AuthState = {
      user: null,
      isAuthenticated: false,
      token: null,
      sessionExpiresAt: null,
      loading: false,
      error: null,
    };

    if (process.client) {
      try {
        const storedToken = localStorage.getItem('civic_auth_token');
        const storedExpiresAt = localStorage.getItem('civic_auth_expires_at');
        const storedUser = localStorage.getItem('civic_auth_user');

        if (storedToken && storedExpiresAt && storedUser) {
          // Check if token is still valid
          const expiresAt = new Date(storedExpiresAt);
          const now = new Date();

          console.log('Auth store initialization:', {
            storedToken: !!storedToken,
            storedExpiresAt,
            storedUser: !!storedUser,
            expiresAt,
            now,
            isValid: expiresAt > now,
          });

          if (expiresAt > now) {
            initialState = {
              ...initialState,
              token: storedToken,
              sessionExpiresAt: storedExpiresAt,
              isAuthenticated: true,
              user: JSON.parse(storedUser),
            };
            console.log('Restored auth state:', initialState);
          } else {
            // Token expired, clear localStorage
            console.log('Token expired, clearing localStorage');
            localStorage.removeItem('civic_auth_token');
            localStorage.removeItem('civic_auth_expires_at');
            localStorage.removeItem('civic_auth_user');
          }
        }
      } catch (error) {
        console.warn('Failed to restore auth state from localStorage:', error);
        // Clear corrupted localStorage
        localStorage.removeItem('civic_auth_token');
        localStorage.removeItem('civic_auth_expires_at');
        localStorage.removeItem('civic_auth_user');
      }
    }

    return initialState;
  },

  getters: {
    currentUser: (state) => state.user,
    isLoggedIn: (state) => state.isAuthenticated && !!state.token,
    hasPermission: (state) => (permission: string) => {
      return state.user?.permissions?.includes(permission) || false;
    },
    hasRole: (state) => (role: string) => {
      return state.user?.role === role;
    },
    isLoading: (state) => state.loading,
    authError: (state) => state.error,
  },

  actions: {
    // Private method to save auth state to localStorage
    saveAuthState() {
      if (process.client) {
        try {
          localStorage.setItem('civic_auth_token', this.token || '');
          localStorage.setItem(
            'civic_auth_expires_at',
            this.sessionExpiresAt || ''
          );
          localStorage.setItem('civic_auth_user', JSON.stringify(this.user));
        } catch (error) {
          console.warn('Failed to save auth state to localStorage:', error);
        }
      }
    },

    // Private method to handle common login logic
    async handleLoginResponse(
      response: any,
      errorMessage: string = 'Login failed'
    ) {
      // Safely extract user and token from the response
      const data = validateApiResponse(response, ['session']);
      const { session } = data;

      // Update user info
      const user: User = {
        id: session.user.id,
        username: session.user.username,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
        avatar_url: session.user.avatar_url,
        permissions: Array.isArray(session.user.permissions)
          ? session.user.permissions
          : [],
      };

      // Update user, token and auth state
      this.user = user;
      this.token = session.token;
      this.sessionExpiresAt = session.expiresAt;
      this.isAuthenticated = true;

      // Save auth state to localStorage
      this.saveAuthState();

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
        const { handleError } = useErrorHandler();
        const errorMessage = handleError(error, {
          title: 'Login Failed',
          showToast: true,
        });
        this.error = errorMessage;
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
        const { handleError } = useErrorHandler();
        const errorMessage = handleError(error, {
          title: 'Token Login Failed',
          showToast: true,
        });
        this.error = errorMessage;
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

    clearAuth() {
      this.user = null;
      this.token = null;
      this.isAuthenticated = false;
      this.error = null;

      if (process.client) {
        localStorage.removeItem('civic_auth_token');
        localStorage.removeItem('civic_auth_expires_at');
        localStorage.removeItem('civic_auth_user');
      }

      // Also clear app state on logout
      const appStore = useAppStore();
      appStore.clearAppState();
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

    // Development method to set mock user
    setMockUser() {
      const mockUser: User = {
        id: 1,
        username: 'admin',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin',
        permissions: [
          'records:create',
          'records:edit',
          'records:delete',
          'records:view',
        ],
      };

      this.user = mockUser;
      this.isAuthenticated = true;
      this.token = 'mock-token';
      this.sessionExpiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString();
      this.saveAuthState();

      console.log('Mock user set:', mockUser);
    },

    // Validate token and refresh user data
    async validateToken() {
      if (!this.token) return false;

      try {
        const response = (await useNuxtApp().$civicApi('/auth/me', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        })) as any;

        if (response.success) {
          // Update user data from server
          this.user = response.data.user;
          this.isAuthenticated = true;
          this.saveAuthState();
          return true;
        } else {
          // Token is invalid, clear auth
          this.clearAuth();
          return false;
        }
      } catch (error) {
        console.warn('Token validation failed:', error);
        this.clearAuth();
        return false;
      }
    },

    // Initialize auth state on app load
    async initializeAuth() {
      console.log('Initializing auth state...');
      console.log('Current state:', {
        token: !!this.token,
        user: !!this.user,
        isAuthenticated: this.isAuthenticated,
      });

      // Always validate if we have a token to refresh permissions/user
      if (this.token) {
        console.log(
          'Token found, validating token to refresh user/permissions...'
        );
        await this.validateToken();
      }
    },
  },
});
