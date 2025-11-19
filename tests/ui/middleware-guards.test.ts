import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
// Defer importing middleware until after globals are stubbed
import { useAuthStore } from '../../modules/ui/app/stores/auth';

// Minimal shims for Nuxt composables used in middleware
vi.stubGlobal('useToast', () => ({ add: vi.fn() }));
vi.stubGlobal('navigateTo', (path: string) => path);
// Ensure shim is present before dynamic imports use it
// @ts-ignore
globalThis.defineNuxtRouteMiddleware = (fn: any) => fn;
// Expose useAuthStore globally to satisfy middleware auto-import in tests
// @ts-ignore
globalThis.useAuthStore = useAuthStore;

describe('Route middleware guards', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('require-users-manage redirects when missing permission', async () => {
    const auth = useAuthStore();
    (auth as any).user = {
      id: 1,
      username: 'viewer',
      email: 'v@example.com',
      name: 'Viewer',
      role: 'public',
      permissions: ['records:view'],
    };
    const usersMod = await import(
      '../../modules/ui/app/middleware/requireUsersManage'
    );
    const requireUsersManage = usersMod.default as any;
    const res = requireUsersManage({} as any, {} as any);
    expect(res).toBe('/settings');
  });

  it('require-users-manage allows when permission present', async () => {
    const auth = useAuthStore();
    (auth as any).user = {
      id: 1,
      username: 'admin',
      email: 'a@example.com',
      name: 'Admin',
      role: 'admin',
      permissions: ['users:manage'],
    };
    const usersMod = await import(
      '../../modules/ui/app/middleware/requireUsersManage'
    );
    const requireUsersManage = usersMod.default as any;
    const res = requireUsersManage({} as any, {} as any);
    expect(res).toBeUndefined();
  });

  it('require-config-manage redirects when missing permission', async () => {
    const auth = useAuthStore();
    (auth as any).user = {
      id: 1,
      username: 'viewer',
      email: 'v@example.com',
      name: 'Viewer',
      role: 'public',
      permissions: ['records:view'],
    };
    const cfgMod = await import(
      '../../modules/ui/app/middleware/requireConfigManage'
    );
    const requireConfigManage = cfgMod.default as any;
    const res = requireConfigManage({} as any, {} as any);
    expect(res).toBe('/settings');
  });

  it('require-config-manage allows when permission present', async () => {
    const auth = useAuthStore();
    (auth as any).user = {
      id: 1,
      username: 'admin',
      email: 'a@example.com',
      name: 'Admin',
      role: 'admin',
      permissions: ['config:manage'],
    };
    const cfgMod = await import(
      '../../modules/ui/app/middleware/requireConfigManage'
    );
    const requireConfigManage = cfgMod.default as any;
    const res = requireConfigManage({} as any, {} as any);
    expect(res).toBeUndefined();
  });
});
