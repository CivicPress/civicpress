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
 * Post-audit hardening batch 2: session revocation. Logout used to be a
 * no-op (a "logged out" token stayed valid for its full 24h lifetime) and
 * a password change kept every existing session alive — the stolen-token
 * scenario a password change exists to end.
 */
describe('Session revocation', () => {
  let civicPress: CivicPress;
  let authService: AuthService;
  let testConfig: ReturnType<typeof createTestDirectory>;

  beforeEach(async () => {
    testConfig = createTestDirectory('session-revocation-test');
    createRolesConfig(testConfig);

    civicPress = new CivicPress({
      dataDir: testConfig.dataDir,
      database: {
        type: 'sqlite',
        sqlite: {
          file: join(testConfig.testDir, 'test.db'),
        },
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

  it('logout revokes the presented session server-side', async () => {
    const user = await authService.createUser({
      username: 'logoutuser',
      email: 'logout@example.com',
      role: 'public',
    });
    const { token } = await authService.createSession(user.id);

    expect(await authService.validateSession(token)).not.toBeNull();

    await authService.logout(token);

    expect(await authService.validateSession(token)).toBeNull();
  });

  it('logout is idempotent and tolerates unknown tokens', async () => {
    await expect(authService.logout('not-a-real-token')).resolves.not.toThrow();
    await expect(authService.logout()).resolves.not.toThrow();
  });

  it('logout revokes only the presented session, not other devices', async () => {
    const user = await authService.createUser({
      username: 'twodevices',
      email: 'twodevices@example.com',
      role: 'public',
    });
    const { token: laptop } = await authService.createSession(user.id);
    const { token: phone } = await authService.createSession(user.id);

    await authService.logout(laptop);

    expect(await authService.validateSession(laptop)).toBeNull();
    expect(await authService.validateSession(phone)).not.toBeNull();
  });

  it('changePassword revokes every session the user holds', async () => {
    const user = await authService.createUserWithPassword({
      username: 'pwchange',
      passwordHash: await bcrypt.hash('old-password-123', 12),
      email: 'pwchange@example.com',
      role: 'public',
    });

    const { token: s1 } = await authService.createSession(user.id);
    const { token: s2 } = await authService.createSession(user.id);
    expect(await authService.validateSession(s1)).not.toBeNull();
    expect(await authService.validateSession(s2)).not.toBeNull();

    const result = await authService.changePassword(
      user.id,
      'new-password-456',
      'old-password-123'
    );
    expect(result.success).toBe(true);

    expect(await authService.validateSession(s1)).toBeNull();
    expect(await authService.validateSession(s2)).toBeNull();
  });

  it('a failed changePassword (wrong current password) revokes nothing', async () => {
    const user = await authService.createUserWithPassword({
      username: 'pwfail',
      passwordHash: await bcrypt.hash('old-password-123', 12),
      email: 'pwfail@example.com',
      role: 'public',
    });
    const { token } = await authService.createSession(user.id);

    const result = await authService.changePassword(
      user.id,
      'new-password-456',
      'WRONG-current'
    );
    expect(result.success).toBe(false);

    expect(await authService.validateSession(token)).not.toBeNull();
  });

  it('admin setUserPassword revokes the target user sessions (compromise response)', async () => {
    const admin = await authService.createUser({
      username: 'revokeadmin',
      email: 'revokeadmin@example.com',
      role: 'admin',
    });
    const user = await authService.createUserWithPassword({
      username: 'resetme',
      passwordHash: await bcrypt.hash('stolen-password-1', 12),
      email: 'resetme@example.com',
      role: 'public',
    });
    const { token } = await authService.createSession(user.id);
    expect(await authService.validateSession(token)).not.toBeNull();

    const result = await authService.setUserPassword(
      user.id,
      'fresh-password-2',
      admin.id
    );
    expect(result.success).toBe(true);

    expect(await authService.validateSession(token)).toBeNull();
  });

  it('deleteUser succeeds under enforced foreign keys and takes sessions with it', async () => {
    const user = await authService.createUser({
      username: 'todelete',
      email: 'todelete@example.com',
      role: 'public',
    });
    // Give the user FK children: a session and an audit row.
    const { token } = await authService.createSession(user.id);
    expect(await authService.validateSession(token)).not.toBeNull();

    await expect(authService.deleteUser(user.id)).resolves.not.toThrow();

    expect(await authService.validateSession(token)).toBeNull();
    expect(await authService.getUserById(user.id)).toBeNull();
  });
});
