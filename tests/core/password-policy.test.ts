import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import bcrypt from 'bcrypt';
import { CivicPress } from '../../core/src/civic-core.js';
import { AuthService } from '../../core/src/auth/auth-service.js';
import {
  createTestDirectory,
  createRolesConfig,
  cleanupTestDirectory,
} from '../fixtures/test-setup';

/**
 * Post-audit hardening batch 3: the password-strength policy existed in
 * AuthConfigManager but was dead code — 1-character passwords were accepted
 * at every entry point. PasswordOps.validatePasswordPolicy is now the
 * single chokepoint, enforced in changePassword and setUserPassword (the
 * API registration route and CLI call it before hashing).
 */
describe('Password policy enforcement', () => {
  let civicPress: CivicPress;
  let authService: AuthService;
  let testConfig: ReturnType<typeof createTestDirectory>;

  beforeEach(async () => {
    testConfig = createTestDirectory('password-policy-test');
    createRolesConfig(testConfig);
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

  it('validatePasswordPolicy rejects weak and accepts compliant passwords', () => {
    const weak = authService.validatePasswordPolicy('x');
    expect(weak.valid).toBe(false);
    expect(weak.errors.length).toBeGreaterThan(0);

    const strong = authService.validatePasswordPolicy('Str0ng!Passw0rd');
    expect(strong.valid).toBe(true);
    expect(strong.errors).toHaveLength(0);
  });

  it('changePassword refuses a policy-violating new password (and keeps sessions alive)', async () => {
    const user = await authService.createUserWithPassword({
      username: 'weakling',
      passwordHash: await bcrypt.hash('Old!Passw0rd', 12),
      email: 'weak@example.com',
      role: 'public',
    });
    const { token } = await authService.createSession(user.id);

    const result = await authService.changePassword(user.id, 'x', 'Old!Passw0rd');
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/requirements/i);

    // The failed change must not have revoked anything.
    expect(await authService.validateSession(token)).not.toBeNull();
  });

  it('admin setUserPassword refuses a policy-violating password', async () => {
    const admin = await authService.createUser({
      username: 'policyadmin',
      email: 'policyadmin@example.com',
      role: 'admin',
    });
    const user = await authService.createUserWithPassword({
      username: 'target',
      passwordHash: await bcrypt.hash('Old!Passw0rd', 12),
      email: 'target@example.com',
      role: 'public',
    });

    const result = await authService.setUserPassword(user.id, 'short', admin.id);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/requirements/i);
  });

  it('a compliant password still passes end-to-end', async () => {
    const user = await authService.createUserWithPassword({
      username: 'strongling',
      passwordHash: await bcrypt.hash('Old!Passw0rd', 12),
      email: 'strong@example.com',
      role: 'public',
    });
    const result = await authService.changePassword(
      user.id,
      'New!Passw0rd42',
      'Old!Passw0rd'
    );
    expect(result.success).toBe(true);
  });
});
