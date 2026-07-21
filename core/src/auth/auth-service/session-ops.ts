import { DatabaseService } from '../../database/database-service.js';
import { Logger } from '../../utils/logger.js';
import { SecretsManager } from '../../security/secrets.js';
import type { HookSystem } from '../../hooks/hook-system.js';
import type { AuthUser, Session } from '../auth-service.js';
import type { AuthAuditEvent } from './user-ops.js';
import { generateSecureToken, hashToken } from './crypto.js';
import { AuthConfigManager } from '../auth-config.js';
import { parseDurationMs } from '../login-throttle.js';

/**
 * Hook emitted when a user's sessions are revoked.
 *
 * Must stay in step with `SESSION_REVOKED_HOOK` in `modules/realtime` — core
 * cannot import from a module that depends on core, so the contract is the
 * string itself.
 */
export const SESSION_REVOKED_HOOK = 'auth:sessions:revoked';

export interface SessionOpsDeps {
  db: DatabaseService;
  logger?: Logger;
  writeAudit: (event: AuthAuditEvent) => Promise<void>;
  /**
   * Getter (not a value) so the collaborator picks up the orchestrator's hook
   * bus after `initializeHooks` is called. Optional: an AuthService built
   * without one (CLI, tests) simply does not broadcast.
   */
  getHooks?: () => HookSystem | undefined;
  /**
   * Getter (not a value) so the collaborator picks up the orchestrator's
   * `secretsManager` after `initializeSecrets` is called.
   */
  getSecretsManager: () => SecretsManager | undefined;
}

/**
 * SessionOps — owns session lifecycle previously inlined on `AuthService`.
 *
 * Bodies are moved verbatim; `this.secretsManager` becomes
 * `this.deps.getSecretsManager()`, `this.hashToken` / `this.generateSecureToken`
 * become the module-level pure functions in `./crypto.js`.
 */
export class SessionOps {
  constructor(private readonly deps: SessionOpsDeps) {}

  /**
   * Read the enforced session-security settings.
   *
   * `security.sessionTimeout` and `security.maxConcurrentSessions` were
   * declared in AuthConfig and documented, but nothing ever read them: session
   * lifetime was a hardcoded 24h and a user could hold unlimited concurrent
   * sessions. Falls back to the compiled-in defaults when config is not loaded
   * (same posture as PasswordOps.getThrottle — an unloaded config must not
   * fail the operation, and must not fail open to "no limit" either).
   */
  private getSessionSecurity(): {
    timeoutHours: number;
    maxConcurrent: number;
  } {
    const defaults = { timeoutMs: 24 * 60 * 60 * 1000, maxConcurrent: 5 };
    let timeoutMs = defaults.timeoutMs;
    let maxConcurrent = defaults.maxConcurrent;
    try {
      const security = AuthConfigManager.getInstance().getConfig().security;
      if (security?.sessionTimeout) {
        timeoutMs = parseDurationMs(security.sessionTimeout, timeoutMs);
      }
      if (
        typeof security?.maxConcurrentSessions === 'number' &&
        Number.isFinite(security.maxConcurrentSessions)
      ) {
        maxConcurrent = security.maxConcurrentSessions;
      }
    } catch {
      // config not loaded → keep the compiled-in defaults
    }
    return { timeoutHours: timeoutMs / (60 * 60 * 1000), maxConcurrent };
  }

  async createSession(
    userId: number,
    expiresInHours?: number
  ): Promise<{ token: string; session: Session }> {
    const security = this.getSessionSecurity();
    const lifetimeHours = expiresInHours ?? security.timeoutHours;

    // Generate random token
    const token = generateSecureToken();

    // Sign token if secrets manager available
    let finalToken = token;
    const secretsManager = this.deps.getSecretsManager();
    if (secretsManager) {
      const signingKey = secretsManager.getSessionSigningKey();
      const signature = secretsManager.sign(token, signingKey);
      finalToken = `${token}.${signature}`;
    }

    // Hash for database storage (always use raw token for hashing)
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + lifetimeHours * 60 * 60 * 1000);

    await this.deps.db.createSession(userId, tokenHash, expiresAt);

    // Enforce security.maxConcurrentSessions. Pruning AFTER the insert, by
    // descending id, guarantees the session just minted is among the keepers —
    // the caller is about to be handed its token.
    if (security.maxConcurrent > 0) {
      await this.deps.db.pruneUserSessions(userId, security.maxConcurrent);
    }

    const sessionData = await this.deps.db.getSessionByToken(tokenHash);

    if (!sessionData) {
      throw new Error('Failed to create session');
    }

    const session: Session = {
      id: sessionData.id,
      tokenHash: sessionData.token_hash,
      userId: sessionData.user_id,
      expiresAt: new Date(sessionData.expires_at),
      user: {
        id: sessionData.user_id,
        username: sessionData.username,
        role: sessionData.role,
        email: sessionData.email,
        name: sessionData.name,
        avatar_url: sessionData.avatar_url,
      },
    };

    return { token: finalToken, session };
  }

  /**
   * Verify + strip the signature from a presented token, returning the raw
   * token to hash — or null when the token is not acceptable.
   *
   * When a secretsManager is configured, EVERY token this service mints is
   * signed (see createSession), so a presented token without a valid signature
   * is never one of ours and must be refused.
   *
   * This previously read `if (secretsManager && token.includes('.'))` and
   * otherwise fell through to `return token`, which made the signature
   * optional-if-present: an UNSIGNED token skipped verification entirely even
   * while signing was active. That defeats the purpose of signing — the
   * signature exists so that a raw token which leaks by some other route (a
   * log line, a DB row, a backup) is not on its own enough to authenticate.
   * A token carrying anything other than exactly one `.` separator is likewise
   * not a shape we mint, so it is refused rather than hashed as-is.
   */
  private unwrapToken(token: string): string | null {
    const secretsManager = this.deps.getSecretsManager();
    if (!secretsManager) {
      // Signing is not configured, so tokens are minted unsigned — accept
      // the raw token. (Signing becoming available later invalidates any
      // still-live unsigned session, which is the fail-safe direction.)
      return token;
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return null;
    }
    const [rawToken, signature] = parts;
    const signingKey = secretsManager.getSessionSigningKey();
    if (!secretsManager.verify(rawToken, signature, signingKey)) {
      return null;
    }
    return rawToken;
  }

  async validateSession(token: string): Promise<AuthUser | null> {
    try {
      const tokenToHash = this.unwrapToken(token);
      if (tokenToHash === null) {
        return null;
      }

      // Hash and lookup in database (using raw token)
      const tokenHash = hashToken(tokenToHash);
      const session = await this.deps.db.getSessionByToken(tokenHash);

      if (!session) {
        return null;
      }

      // Get full user data including email_verified
      const user = await this.deps.db.getUserById(session.user_id);
      if (!user) {
        return null;
      }

      return {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        email_verified: !!user.email_verified,
      };
    } catch (error) {
      this.deps.logger?.error('Session validation failed:', error);
      return null;
    }
  }

  async deleteSession(sessionId: number): Promise<void> {
    await this.deps.db.deleteSession(sessionId);
  }

  /**
   * Revoke every session a user holds (logout-everywhere, password change).
   *
   * Deleting the rows only stops FUTURE authentications. A realtime WebSocket
   * validates its session once, during the upgrade, and never again — so a
   * connection established before the revocation kept a fully-live editing
   * socket until it happened to reconnect. Emitting on revocation lets the
   * realtime server (which subscribes to this hook) tear those sockets down
   * promptly.
   *
   * Best-effort by design: the sessions are already gone by the time we emit,
   * and a broken listener must not turn a successful revocation into a thrown
   * error at the call site (password change would then report failure after
   * having already revoked).
   */
  async deleteUserSessions(
    userId: number,
    reason: string = 'sessions-revoked'
  ): Promise<void> {
    await this.deps.db.deleteUserSessions(userId);

    try {
      await this.deps.getHooks?.()?.emit(SESSION_REVOKED_HOOK, {
        userId,
        reason,
      });
    } catch (error) {
      this.deps.logger?.warn(
        'Failed to broadcast session revocation; sessions ARE revoked in the database',
        error
      );
    }
  }

  /**
   * Revoke the single session a presented token identifies (logout). Unknown,
   * expired, or badly-signed tokens are a no-op so logout stays idempotent.
   * Returns whether a live session was actually revoked.
   */
  async revokeSessionByToken(token: string): Promise<boolean> {
    const tokenToHash = this.unwrapToken(token);
    if (tokenToHash === null) {
      return false;
    }
    const tokenHash = hashToken(tokenToHash);
    const session = await this.deps.db.getSessionByToken(tokenHash);
    if (!session) {
      return false;
    }
    await this.deps.db.deleteSession(session.id);
    return true;
  }

  async cleanupExpiredSessions(): Promise<void> {
    await this.deps.db.cleanupExpiredSessions();
  }
}
