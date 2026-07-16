import { DatabaseService } from '../../database/database-service.js';
import { Logger } from '../../utils/logger.js';
import { SecretsManager } from '../../security/secrets.js';
import type { AuthUser, Session } from '../auth-service.js';
import type { AuthAuditEvent } from './user-ops.js';
import { generateSecureToken, hashToken } from './crypto.js';

export interface SessionOpsDeps {
  db: DatabaseService;
  logger?: Logger;
  writeAudit: (event: AuthAuditEvent) => Promise<void>;
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

  async createSession(
    userId: number,
    expiresInHours: number = 24
  ): Promise<{ token: string; session: Session }> {
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
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    await this.deps.db.createSession(userId, tokenHash, expiresAt);
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
   * token to hash — or null when the signature does not verify.
   */
  private unwrapToken(token: string): string | null {
    const secretsManager = this.deps.getSecretsManager();
    if (secretsManager && token.includes('.')) {
      const parts = token.split('.');
      if (parts.length === 2) {
        const [rawToken, signature] = parts;
        const signingKey = secretsManager.getSessionSigningKey();
        if (secretsManager.verify(rawToken, signature, signingKey)) {
          return rawToken;
        }
        return null; // invalid signature
      }
    }
    return token;
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

  /** Revoke every session a user holds (logout-everywhere, password change). */
  async deleteUserSessions(userId: number): Promise<void> {
    await this.deps.db.deleteUserSessions(userId);
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
