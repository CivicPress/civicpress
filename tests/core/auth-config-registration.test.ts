import { describe, it, expect, afterEach } from 'vitest';
import { AuthConfigManager, CentralConfigManager } from '@civicpress/core';
import {
  createTestInstance,
  type TestInstance,
} from '../fixtures/test-instance.js';

/**
 * `auth.registration.enabled` is read from `.civicrc` through the central
 * config, defaults to ON, and survives a partial `auth:` section — an operator
 * who writes only `auth: { registration: { enabled: false } }` must not lose
 * the password policy or the provider defaults in the process.
 */
describe('AuthConfigManager registration switch', () => {
  let instance: TestInstance | null = null;

  afterEach(() => {
    AuthConfigManager.getInstance().reset();
    CentralConfigManager.reset();
    instance?.cleanup();
    instance = null;
  });

  async function load(civicrc?: Record<string, unknown>) {
    instance = createTestInstance({ prefix: 'auth-config', civicrc });
    const manager = AuthConfigManager.getInstance();
    manager.reset();
    await manager.loadConfig();
    return manager;
  }

  it('is enabled when .civicrc says nothing about auth', async () => {
    const manager = await load();
    expect(manager.isRegistrationEnabled()).toBe(true);
  });

  it('honours auth.registration.enabled: false', async () => {
    const manager = await load({
      auth: { registration: { enabled: false } },
    });
    expect(manager.isRegistrationEnabled()).toBe(false);
    // The rest of the auth configuration still comes from the defaults.
    expect(manager.getPasswordRequirements().minLength).toBe(8);
    expect(manager.getConfig().providers.github.enabled).toBe(false);
  });

  it('reset() forgets the loaded configuration', async () => {
    const manager = await load({
      auth: { registration: { enabled: false } },
    });
    expect(manager.isRegistrationEnabled()).toBe(false);
    manager.reset();
    expect(() => manager.getConfig()).toThrow(/not loaded/);
  });
});
