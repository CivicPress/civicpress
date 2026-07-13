/**
 * FA-API-007 — account lockout state machine.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LoginThrottle,
  AccountLockedError,
  parseDurationMs,
} from '../auth/login-throttle.js';

/** Minimal in-memory stand-in for the login_attempts table. */
function fakeDb() {
  const rows = new Map<string, any>();
  return {
    _rows: rows,
    getAdapter() {
      return {
        async query(sql: string, params: any[]) {
          const row = rows.get(params[0]);
          return row ? [row] : [];
        },
        async execute(sql: string, params: any[]) {
          const s = sql.trim().toUpperCase();
          if (s.startsWith('DELETE')) {
            rows.delete(params[0]);
            return { changes: 1 };
          }
          if (s.startsWith('UPDATE')) {
            // params: [failed_count, last, locked_until, username]
            const [failed_count, last, locked_until, username] = params;
            const existing = rows.get(username);
            if (!existing) return { changes: 0 };
            rows.set(username, {
              ...existing,
              failed_count,
              last_failed_at: last,
              locked_until,
            });
            return { changes: 1 };
          }
          // INSERT
          const [username, failed_count, first, last, locked_until] = params;
          rows.set(username, {
            username,
            failed_count,
            locked_until,
            first_failed_at: first,
            last_failed_at: last,
          });
          return { changes: 1 };
        },
      };
    },
  } as any;
}

describe('parseDurationMs', () => {
  it('parses common suffixes with a minute default', () => {
    expect(parseDurationMs('15m', 0)).toBe(15 * 60 * 1000);
    expect(parseDurationMs('30s', 0)).toBe(30 * 1000);
    expect(parseDurationMs('1h', 0)).toBe(60 * 60 * 1000);
    expect(parseDurationMs('500ms', 0)).toBe(500);
    expect(parseDurationMs('7', 0)).toBe(7 * 60 * 1000); // bare = minutes
    expect(parseDurationMs('garbage', 999)).toBe(999);
  });
});

describe('LoginThrottle', () => {
  let db: any;
  let throttle: LoginThrottle;
  const t0 = 1_000_000;

  beforeEach(() => {
    db = fakeDb();
    throttle = new LoginThrottle(db, { maxAttempts: 3, lockoutMs: 60_000 });
  });

  it('locks after maxAttempts consecutive failures', async () => {
    await throttle.recordFailure('alice', t0);
    await throttle.recordFailure('alice', t0);
    await expect(throttle.assertNotLocked('alice', t0)).resolves.toBeUndefined();

    const locked = await throttle.recordFailure('alice', t0); // 3rd
    expect(locked).toBe(true);
    await expect(throttle.assertNotLocked('alice', t0)).rejects.toBeInstanceOf(
      AccountLockedError
    );
  });

  it('reports a retry-after hint on the lock error', async () => {
    for (let i = 0; i < 3; i++) await throttle.recordFailure('bob', t0);
    try {
      await throttle.assertNotLocked('bob', t0 + 10_000);
      throw new Error('expected lock');
    } catch (e) {
      expect(e).toBeInstanceOf(AccountLockedError);
      expect((e as AccountLockedError).retryAfterMs).toBe(50_000);
    }
  });

  it('clears the lock after the window elapses', async () => {
    for (let i = 0; i < 3; i++) await throttle.recordFailure('carol', t0);
    await expect(
      throttle.assertNotLocked('carol', t0 + 61_000)
    ).resolves.toBeUndefined();
  });

  it('recordSuccess resets the counter', async () => {
    await throttle.recordFailure('dave', t0);
    await throttle.recordFailure('dave', t0);
    await throttle.recordSuccess('dave');
    // Two fresh failures should NOT lock (counter was reset).
    await throttle.recordFailure('dave', t0);
    const locked = await throttle.recordFailure('dave', t0);
    expect(locked).toBe(false);
  });

  it('is case- and whitespace-insensitive on the username', async () => {
    for (let i = 0; i < 3; i++) await throttle.recordFailure('Eve', t0);
    await expect(
      throttle.assertNotLocked('  eve ', t0)
    ).rejects.toBeInstanceOf(AccountLockedError);
  });
});
