/**
 * Account lockout / login throttling (FA-API-007).
 *
 * The `maxLoginAttempts` / `lockoutDuration` in auth-config were dead config —
 * nothing enforced them, so `/auth/login` allowed unlimited credential
 * stuffing (and, with bcrypt(12), cheap CPU-amplification). This backs a
 * per-account lockout on the `login_attempts` table: after `maxAttempts`
 * consecutive failures the account is locked for `lockoutMs`; a success (or
 * the window elapsing) clears the counter.
 *
 * This is per-ACCOUNT and complements the per-IP rate limit wired in the API
 * (FA-API-006) — together they cover both a single IP hammering many accounts
 * and a botnet hammering one account.
 */

import type { DatabaseService } from '../database/database-service.js';

/** Error thrown when an account is locked; carries statusCode for the API. */
export class AccountLockedError extends Error {
  readonly statusCode = 429;
  readonly code = 'ACCOUNT_LOCKED';
  constructor(public readonly retryAfterMs: number) {
    super(
      'Account temporarily locked due to too many failed login attempts. ' +
        `Try again in ${Math.ceil(retryAfterMs / 1000)}s.`
    );
    this.name = 'AccountLockedError';
  }
}

interface LoginAttemptRow {
  username: string;
  failed_count: number;
  locked_until: string | null;
}

export interface LoginThrottleOptions {
  maxAttempts: number;
  lockoutMs: number;
}

/** Parse a duration like '15m' / '30s' / '1h' into milliseconds. */
export function parseDurationMs(value: string, fallbackMs: number): number {
  const m = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(String(value).trim());
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  switch (m[2]) {
    case 'ms':
      return n;
    case 's':
      return n * 1000;
    case 'h':
      return n * 60 * 60 * 1000;
    case 'd':
      return n * 24 * 60 * 60 * 1000;
    case 'm':
    default:
      return n * 60 * 1000;
  }
}

export class LoginThrottle {
  constructor(
    private readonly db: DatabaseService,
    private readonly opts: LoginThrottleOptions
  ) {}

  private key(username: string): string {
    return username.trim().toLowerCase();
  }

  /** Throw AccountLockedError if the account is currently locked. */
  async assertNotLocked(username: string, nowMs: number = Date.now()): Promise<void> {
    const row = await this.getRow(this.key(username));
    if (!row?.locked_until) return;
    const lockedUntilMs = Date.parse(row.locked_until);
    if (Number.isFinite(lockedUntilMs) && lockedUntilMs > nowMs) {
      throw new AccountLockedError(lockedUntilMs - nowMs);
    }
  }

  /**
   * Record a failed attempt. Locks the account when the running count reaches
   * `maxAttempts`. Returns whether the account is now locked. Fails OPEN on a
   * store error — a broken throttle table must not break login entirely.
   */
  async recordFailure(
    username: string,
    nowMs: number = Date.now()
  ): Promise<boolean> {
    const key = this.key(username);
    const nowIso = new Date(nowMs).toISOString();
    try {
      const row = await this.getRow(key);

      // A prior lock that has expired resets the counter.
      const priorExpired =
        row?.locked_until && Date.parse(row.locked_until) <= nowMs;
      const count = (priorExpired ? 0 : row?.failed_count ?? 0) + 1;
      const lock = count >= this.opts.maxAttempts;
      const lockedUntil = lock
        ? new Date(nowMs + this.opts.lockoutMs).toISOString()
        : null;
      // Once locked, the next failure starts a fresh window.
      const storedCount = lock ? 0 : count;

      // Explicit update-or-insert (portable across SQLite/Postgres — no UPSERT
      // dialect dependency).
      const updated = await this.db
        .getAdapter()
        .execute(
          `UPDATE login_attempts
             SET failed_count = ?, last_failed_at = ?, locked_until = ?
           WHERE username = ?`,
          [storedCount, nowIso, lockedUntil, key]
        );
      const changed =
        (updated as { changes?: number } | undefined)?.changes ?? 0;
      if (!changed) {
        await this.db.getAdapter().execute(
          `INSERT INTO login_attempts
             (username, failed_count, first_failed_at, last_failed_at, locked_until)
           VALUES (?, ?, ?, ?, ?)`,
          [key, storedCount, nowIso, nowIso, lockedUntil]
        );
      }
      return lock;
    } catch {
      return false;
    }
  }

  /** Clear the counter after a successful login. */
  async recordSuccess(username: string): Promise<void> {
    try {
      await this.db
        .getAdapter()
        .execute('DELETE FROM login_attempts WHERE username = ?', [
          this.key(username),
        ]);
    } catch {
      /* fail open */
    }
  }

  private async getRow(key: string): Promise<LoginAttemptRow | null> {
    try {
      const rows = await this.db
        .getAdapter()
        .query<LoginAttemptRow>(
          'SELECT username, failed_count, locked_until FROM login_attempts WHERE username = ?',
          [key]
        );
      return rows[0] ?? null;
    } catch {
      // Fail OPEN on a throttle-store error — never lock everyone out because
      // the table is briefly unavailable (availability > this defense layer).
      return null;
    }
  }
}
