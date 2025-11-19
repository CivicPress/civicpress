import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Import the auth store from the UI module
import { useAuthStore } from '../../modules/ui/app/stores/auth';

describe('Auth Store - hasPermission', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('returns false when no user is set', () => {
    const auth = useAuthStore();
    expect(auth.hasPermission('users:manage')).toBe(false);
  });

  it('returns true when permission is present', () => {
    const auth = useAuthStore();
    // simulate a logged-in user
    (auth as any).user = {
      id: 1,
      username: 'clerk',
      email: 'clerk@example.com',
      name: 'Clerk',
      role: 'clerk',
      permissions: ['records:view', 'users:manage'],
    };
    expect(auth.hasPermission('users:manage')).toBe(true);
    expect(auth.hasPermission('config:manage')).toBe(false);
  });

  it('supports wildcard "*" permission', () => {
    const auth = useAuthStore();
    (auth as any).user = {
      id: 1,
      username: 'admin',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      permissions: ['*'],
    };
    expect(auth.hasPermission('users:manage')).toBe(true);
    expect(auth.hasPermission('config:manage')).toBe(true);
    expect(auth.hasPermission('anything:else')).toBe(true);
  });
});
