import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../../modules/ui/app/stores/auth';

// Shims
vi.stubGlobal('useToast', () => ({ add: vi.fn() }));
vi.stubGlobal('navigateTo', (path: string) => path);
// @ts-ignore
globalThis.defineNuxtRouteMiddleware = (fn: any) => fn;
// @ts-ignore
globalThis.useAuthStore = useAuthStore;

describe('Route middleware - requireAdmin', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('redirects when missing system:admin', async () => {
    const auth = useAuthStore();
    (auth as any).user = {
      id: 1,
      username: 'viewer',
      role: 'public',
      permissions: ['records:view'],
    };
    const mod = await import('../../modules/ui/app/middleware/requireAdmin');
    const res = mod.default({} as any, {} as any);
    expect(res).toBe('/settings');
  });

  it('allows when system:admin present', async () => {
    const auth = useAuthStore();
    (auth as any).user = {
      id: 1,
      username: 'admin',
      role: 'admin',
      permissions: ['system:admin'],
    };
    const mod = await import('../../modules/ui/app/middleware/requireAdmin');
    const res = mod.default({} as any, {} as any);
    expect(res).toBeUndefined();
  });
});
