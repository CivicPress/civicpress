import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { CivicPress } from '../../core/src/civic-core.js';
import { AuthService } from '../../core/src/auth/auth-service.js';
import {
  SessionOps,
  SESSION_REVOKED_HOOK,
} from '../../core/src/auth/auth-service/session-ops.js';
import { LoginThrottle } from '../../core/src/auth/login-throttle.js';
import { AuthMaintenanceScheduler } from '../../core/src/auth/auth-maintenance.js';
import type { SecretsManager } from '../../core/src/security/secrets.js';
import {
  createTestDirectory,
  createRolesConfig,
  cleanupTestDirectory,
} from '../fixtures/test-setup';

/**
 * Post-audit hardening "Improvements" batch.
 *
 * Covers: session/API-key signatures being required rather than
 * optional-if-present, the previously-dead `maxConcurrentSessions` setting,
 * the login-throttle sweep, the maintenance scheduler that finally calls the
 * sweeps, and the self-service password-change re-login contract.
 */

/** Deterministic stand-in for the real HMAC SecretsManager. */
function fakeSecrets(): SecretsManager {
  return {
    getSessionSigningKey: () => Buffer.from('session-key'),
    getApiKeySigningKey: () => Buffer.from('api-key-key'),
    sign: (data: string) => `sig-${data}`,
    verify: (data: string, signature: string) => signature === `sig-${data}`,
  } as unknown as SecretsManager;
}

describe('Auth improvements', () => {
  let civicPress: CivicPress;
  let authService: AuthService;
  let testConfig: ReturnType<typeof createTestDirectory>;

  beforeEach(async () => {
    testConfig = createTestDirectory('auth-improvements-test');
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

  async function makeUser(username: string) {
    return authService.createUser({ username, role: 'admin' });
  }

  describe('session token signatures are REQUIRED once signing is active', () => {
    /**
     * The signature exists so that a raw token which leaks by some other route
     * (a log line, a DB row, a backup) is not on its own enough to
     * authenticate. The old `if (secretsManager && token.includes('.'))` made
     * it optional-if-present: an unsigned token skipped verification entirely.
     */
    function signedOps() {
      const secrets = fakeSecrets();
      return new SessionOps({
        db: civicPress.getDatabaseService(),
        writeAudit: async () => {},
        getSecretsManager: () => secrets,
      });
    }

    it('accepts the signed token it minted', async () => {
      const user = await makeUser('signed-ok');
      const ops = signedOps();

      const { token } = await ops.createSession(user.id);
      expect(token).toContain('.');

      const validated = await ops.validateSession(token);
      expect(validated?.id).toBe(user.id);
    });

    it('REJECTS the bare unsigned token even though it exists in the DB', async () => {
      const user = await makeUser('unsigned-reject');
      const ops = signedOps();

      const { token } = await ops.createSession(user.id);
      const rawToken = token.split('.')[0];

      // The raw token hashes to a live session row — this is exactly the
      // leaked-token case the signature is supposed to stop.
      expect(await ops.validateSession(rawToken)).toBeNull();
    });

    it('rejects a token whose signature does not verify', async () => {
      const user = await makeUser('badsig-reject');
      const ops = signedOps();

      const { token } = await ops.createSession(user.id);
      const rawToken = token.split('.')[0];

      expect(await ops.validateSession(`${rawToken}.not-the-signature`)).toBeNull();
    });

    it('rejects a token carrying extra separators', async () => {
      const user = await makeUser('extra-dots');
      const ops = signedOps();

      const { token } = await ops.createSession(user.id);
      expect(await ops.validateSession(`${token}.extra`)).toBeNull();
    });

    it('still accepts unsigned tokens when signing is NOT configured', async () => {
      const user = await makeUser('unsigned-allowed');
      const ops = new SessionOps({
        db: civicPress.getDatabaseService(),
        writeAudit: async () => {},
        getSecretsManager: () => undefined,
      });

      const { token } = await ops.createSession(user.id);
      expect(token).not.toContain('.');
      expect((await ops.validateSession(token))?.id).toBe(user.id);
    });
  });

  describe('maxConcurrentSessions is enforced', () => {
    it('evicts the oldest sessions beyond the cap, keeping the newest', async () => {
      const user = await makeUser('concurrent-sessions');
      const ops = new SessionOps({
        db: civicPress.getDatabaseService(),
        writeAudit: async () => {},
        getSecretsManager: () => undefined,
      });

      // Default cap is 5; mint 6 and the first must be evicted.
      const tokens: string[] = [];
      for (let i = 0; i < 6; i++) {
        tokens.push((await ops.createSession(user.id)).token);
      }

      expect(await ops.validateSession(tokens[0])).toBeNull();
      // The most recent session must survive — the caller was just handed it.
      expect((await ops.validateSession(tokens[5]))?.id).toBe(user.id);
    });
  });

  describe('session revocation is broadcast on the hook bus', () => {
    /**
     * Deleting the rows only stops FUTURE authentications. A realtime socket
     * validates its session once, at upgrade, so a connection established
     * before the revocation stayed live until it reconnected. The realtime
     * server subscribes to this hook to close them.
     */
    it('emits auth:sessions:revoked after the rows are deleted', async () => {
      const emitted: Array<{ name: string; data: unknown }> = [];
      const ops = new SessionOps({
        db: civicPress.getDatabaseService(),
        writeAudit: async () => {},
        getSecretsManager: () => undefined,
        getHooks: () =>
          ({
            emit: async (name: string, data: unknown) => {
              emitted.push({ name, data });
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
      });

      const user = await makeUser('revoke-broadcast');
      const { token } = await ops.createSession(user.id);
      await ops.deleteUserSessions(user.id);

      expect(await ops.validateSession(token)).toBeNull();
      expect(emitted).toHaveLength(1);
      expect(emitted[0].name).toBe(SESSION_REVOKED_HOOK);
      expect((emitted[0].data as { userId: number }).userId).toBe(user.id);
    });

    it('still revokes when a hook listener throws', async () => {
      const ops = new SessionOps({
        db: civicPress.getDatabaseService(),
        writeAudit: async () => {},
        getSecretsManager: () => undefined,
        getHooks: () =>
          ({
            emit: async () => {
              throw new Error('listener exploded');
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
      });

      const user = await makeUser('revoke-listener-throws');
      const { token } = await ops.createSession(user.id);

      // The sessions are already gone by the time we emit — a broken listener
      // must not turn a successful revocation into a thrown error.
      await expect(ops.deleteUserSessions(user.id)).resolves.toBeUndefined();
      expect(await ops.validateSession(token)).toBeNull();
    });
  });

  describe('login_attempts sweep', () => {
    it('drops stale rows but keeps a currently-locked account locked', async () => {
      const db = civicPress.getDatabaseService();
      const throttle = new LoginThrottle(db, {
        maxAttempts: 3,
        lockoutMs: 60_000,
      });

      const longAgo = Date.now() - 24 * 60 * 60 * 1000;
      // An abandoned failed attempt from a day ago (the scanner/typo case).
      await throttle.recordFailure('stale-user', longAgo);
      // A live lockout right now.
      for (let i = 0; i < 3; i++) {
        await throttle.recordFailure('locked-user');
      }

      const removed = await throttle.cleanupStaleAttempts();
      expect(removed).toBeGreaterThanOrEqual(1);

      // The locked account is untouched and still locked.
      await expect(throttle.assertNotLocked('locked-user')).rejects.toThrow();

      // The stale row is gone.
      const rows = await db
        .getAdapter()
        .query<{ username: string }>(
          'SELECT username FROM login_attempts WHERE username = ?',
          ['stale-user']
        );
      expect(rows).toHaveLength(0);
    });
  });

  describe('AuthMaintenanceScheduler', () => {
    it('runs all three sweeps', async () => {
      const calls: string[] = [];
      const scheduler = new AuthMaintenanceScheduler({
        cleanupExpiredSessions: async () => {
          calls.push('sessions');
        },
        cleanupExpiredEmailTokens: async () => {
          calls.push('emails');
          return 0;
        },
        cleanupStaleLoginAttempts: async () => {
          calls.push('logins');
          return 0;
        },
      });

      await scheduler.runOnce();
      expect(calls).toEqual(['sessions', 'emails', 'logins']);
    });

    it('isolates a failing sweep so the others still run', async () => {
      const calls: string[] = [];
      const scheduler = new AuthMaintenanceScheduler({
        cleanupExpiredSessions: async () => {
          throw new Error('session sweep exploded');
        },
        cleanupExpiredEmailTokens: async () => {
          calls.push('emails');
          return 0;
        },
        cleanupStaleLoginAttempts: async () => {
          calls.push('logins');
          return 0;
        },
      });

      // Must not reject — an unhandled rejection inside the interval callback
      // would take the process down.
      await expect(scheduler.runOnce()).resolves.toBeUndefined();
      expect(calls).toEqual(['emails', 'logins']);
    });

    it('stop() is safe before start and start() is idempotent', () => {
      const scheduler = new AuthMaintenanceScheduler({
        cleanupExpiredSessions: async () => {},
        cleanupExpiredEmailTokens: async () => 0,
        cleanupStaleLoginAttempts: async () => 0,
      });

      expect(() => scheduler.stop()).not.toThrow();
      scheduler.start(60_000);
      expect(() => scheduler.start(60_000)).not.toThrow();
      scheduler.stop();
    });
  });

  describe('self-service password change tells the user they were signed out', () => {
    it('reports sessionsRevoked and says so in the message', async () => {
      const user = await makeUser('pw-change-msg');
      await authService.setUserPassword(user.id, 'OldPassw0rd!', user.id);

      const result = await authService.changePassword(
        user.id,
        'NewPassw0rd!',
        'OldPassw0rd!'
      );

      expect(result.success).toBe(true);
      expect(result.sessionsRevoked).toBe(true);
      expect(result.message).toMatch(/signed out/i);
    });
  });
});
