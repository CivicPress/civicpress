import { describe, it, expect, vi } from 'vitest';

// useAuth imports useAuthStore directly from '~/stores/auth' (not the global
// shim), so mock that module. Hoisted so the vi.mock factory can see the store.
const { fakeStore } = vi.hoisted(() => ({
  fakeStore: {
    currentUser: { id: 1, username: 'jo' },
    isLoggedIn: true,
    isLoading: false,
    authError: null,
    isInitialized: true,
    hasPermission: vi.fn(),
    hasRole: vi.fn(),
    login: vi.fn(),
    loginWithToken: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    updateUser: vi.fn(),
    setError: vi.fn(),
    clearError: vi.fn(),
    validateToken: vi.fn(),
    initializeAuth: vi.fn(),
  },
}));
vi.mock('~/stores/auth', () => ({ useAuthStore: () => fakeStore }));

import { useAuth } from '~/composables/useAuth';

describe('useAuth', () => {
  it('exposes store state as computed refs', () => {
    const auth = useAuth();
    expect(auth.user.value).toEqual({ id: 1, username: 'jo' });
    expect(auth.isAuthenticated.value).toBe(true);
    expect(auth.isLoading.value).toBe(false);
    expect(auth.isInitialized.value).toBe(true);
    expect(auth.error.value).toBeNull();
  });

  it('passes store actions + getters straight through', () => {
    const auth = useAuth();
    expect(auth.login).toBe(fakeStore.login);
    expect(auth.loginWithToken).toBe(fakeStore.loginWithToken);
    expect(auth.logout).toBe(fakeStore.logout);
    expect(auth.hasPermission).toBe(fakeStore.hasPermission);
    expect(auth.hasRole).toBe(fakeStore.hasRole);
    expect(auth.validateToken).toBe(fakeStore.validateToken);
    expect(auth.initializeAuth).toBe(fakeStore.initializeAuth);
  });
});
