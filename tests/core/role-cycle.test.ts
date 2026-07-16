import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
import { CivicPress } from '../../core/src/civic-core.js';
import { AuthService } from '../../core/src/auth/auth-service.js';
import {
  createTestDirectory,
  createRolesConfig,
  cleanupTestDirectory,
} from '../fixtures/test-setup';

/**
 * Post-audit hardening batch 3: a circular role_hierarchy (admin → clerk →
 * admin) used to recurse to stack overflow inside getRolePermissions, which
 * userCan swallowed as `false` — silently denying EVERY permission with no
 * diagnosable error. The walker now carries a visited set: cycles resolve
 * to the union of the roles' direct permissions.
 */
describe('Role hierarchy cycle detection', () => {
  let civicPress: CivicPress;
  let authService: AuthService;
  let testConfig: ReturnType<typeof createTestDirectory>;

  beforeEach(async () => {
    testConfig = createTestDirectory('role-cycle-test');
    createRolesConfig(testConfig);

    // Introduce a cycle: admin → clerk → admin (fixture ships admin →
    // [clerk, public], clerk → [public]).
    const rolesPath = join(testConfig.dataDir, '.civic', 'roles.yml');
    const roles = yaml.load(readFileSync(rolesPath, 'utf8')) as {
      role_hierarchy: Record<string, { value: string[] }>;
    };
    roles.role_hierarchy.clerk.value = ['public', 'admin'];
    writeFileSync(rolesPath, yaml.dump(roles));

    civicPress = new CivicPress({
      dataDir: testConfig.dataDir,
      database: {
        type: 'sqlite',
        sqlite: { file: join(testConfig.testDir, 'test.db') },
      },
    });
    await civicPress.initialize();
    authService = civicPress.getAuthService();
  });

  afterEach(async () => {
    if (civicPress) {
      await civicPress.shutdown();
    }
    cleanupTestDirectory(testConfig);
  });

  it('userCan still resolves permissions under a circular hierarchy', async () => {
    const admin = await authService.createUser({
      username: 'cycleadmin',
      email: 'cycleadmin@example.com',
      role: 'admin',
    });

    // Pre-fix this stack-overflowed and surfaced as a blanket `false`.
    expect(await authService.userCan(admin, 'records:view')).toBe(true);
    expect(await authService.userCan(admin, 'system:admin')).toBe(true);
  });

  it('cyclic inheritance yields the union of the cycle members’ permissions', async () => {
    const clerk = await authService.createUser({
      username: 'cycleclerk',
      email: 'cycleclerk@example.com',
      role: 'clerk',
    });

    // clerk → admin (via the cycle) grants admin's direct permissions once,
    // without re-walking admin → clerk forever.
    expect(await authService.userCan(clerk, 'system:admin')).toBe(true);
  });

  it('a node reachable by two paths (public) is NOT flagged as a cycle', async () => {
    // `public` is reached from admin both directly (admin → public) and via
    // clerk (admin → clerk → public) — a diamond, not a cycle. A path-based
    // (not global) visited set must resolve it without a spurious "circular"
    // warning, even though a REAL cycle (clerk → admin) exists elsewhere in
    // this fixture. Only the true back-edge should warn.
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.join(' '));
    };
    try {
      const admin = await authService.createUser({
        username: 'diamondadmin',
        email: 'diamondadmin@example.com',
        role: 'admin',
      });
      expect(await authService.userCan(admin, 'records:view')).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
    // The diamond node 'public' must never be reported as circular.
    expect(
      warnings.some((w) => /Circular role inheritance.*'public'/.test(w))
    ).toBe(false);
  });
});
