import { Logger } from '../utils/logger.js';

/**
 * Periodic maintenance for the auth tables.
 *
 * Three sweeps already existed — `cleanupExpiredSessions`,
 * `cleanupExpiredEmailTokens` and (added alongside this) the login-throttle
 * sweep — but nothing ever called them. Every one of their tables therefore
 * grew without bound for the life of a deployment:
 *
 *   - `sessions`: rows are only deleted on an explicit logout or a
 *     revoke-everything. A session that simply expires is never removed, so
 *     the table accumulates one dead row per abandoned login forever, and each
 *     row is a (hashed) credential kept long past its usefulness.
 *   - `email_verifications`: expired/consumed verification tokens linger, and
 *     those rows hold live verification secrets.
 *   - `login_attempts`: consulted on EVERY login, and only cleared for users
 *     who eventually succeed — so failed/abandoned usernames (notably from
 *     account-enumeration scanning) stay forever.
 *
 * This is deliberately a plain interval rather than a general job framework:
 * the repo has no scheduler, and inventing one for three idempotent DELETEs
 * would be the larger change. It mirrors the existing convention for in-process
 * background work (the broadcast-box enrollment-cleanup timer): the owner calls
 * `start()` after boot and `stop()` during shutdown.
 */

/** Default cadence. Hourly is far more often than any of these need. */
export const DEFAULT_AUTH_MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

export interface AuthMaintenanceDeps {
  cleanupExpiredSessions: () => Promise<void>;
  cleanupExpiredEmailTokens: () => Promise<number>;
  cleanupStaleLoginAttempts: () => Promise<number>;
  logger?: Logger;
}

export class AuthMaintenanceScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Guards against a slow sweep overlapping the next tick. */
  private inFlight = false;

  constructor(private readonly deps: AuthMaintenanceDeps) {}

  /**
   * Run all three sweeps once.
   *
   * Each is isolated: one failing sweep must not skip the other two, and none
   * of them may ever throw into the timer (an unhandled rejection in an
   * interval callback would take the process down).
   */
  async runOnce(): Promise<void> {
    try {
      await this.deps.cleanupExpiredSessions();
    } catch (error) {
      this.deps.logger?.warn('Auth maintenance: session sweep failed', error);
    }

    try {
      await this.deps.cleanupExpiredEmailTokens();
    } catch (error) {
      this.deps.logger?.warn(
        'Auth maintenance: email-token sweep failed',
        error
      );
    }

    try {
      await this.deps.cleanupStaleLoginAttempts();
    } catch (error) {
      this.deps.logger?.warn(
        'Auth maintenance: login-attempt sweep failed',
        error
      );
    }
  }

  /** Idempotent: starting an already-started scheduler is a no-op. */
  start(
    intervalMs: number = DEFAULT_AUTH_MAINTENANCE_INTERVAL_MS
  ): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      if (this.inFlight) {
        return;
      }
      this.inFlight = true;
      void this.runOnce().finally(() => {
        this.inFlight = false;
      });
    }, intervalMs);

    // Never hold the process open for a maintenance timer — a CLI command or a
    // test that constructs the API must still be able to exit.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
