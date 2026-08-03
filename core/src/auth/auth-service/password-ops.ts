import { DatabaseService } from '../../database/database-service.js';
import { Logger } from '../../utils/logger.js';
import { EmailValidationService } from '../email-validation-service.js';
import type { AuthUser, Session } from '../auth-service.js';
import type { AuthAuditEvent } from './user-ops.js';
import {
  LoginThrottle,
  AccountLockedError,
  parseDurationMs,
} from '../login-throttle.js';
import { AuthConfigManager } from '../auth-config.js';
import { generateSecureToken, hashToken } from './crypto.js';

/**
 * How long a password-reset link stays valid. Short by design — a reset token
 * is an account-takeover credential; a narrow window limits exposure of a link
 * that lingers in an inbox, a console outbox, or shell history.
 */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface PasswordOpsDeps {
  db: DatabaseService;
  logger?: Logger;
  writeAudit: (event: AuthAuditEvent) => Promise<void>;
  emailValidationService: EmailValidationService;
  /** Audit-event helper (try/catch wrapper around writeAudit). */
  logAuthEvent: (
    userId: number | undefined,
    action: string,
    details?: string,
    ipAddress?: string
  ) => Promise<void>;
  /** SessionOps relay. */
  createSession: (
    userId: number,
    expiresInHours?: number
  ) => Promise<{ token: string; session: Session }>;
  /** SessionOps relay — revoke every session a user holds. */
  deleteUserSessions: (userId: number) => Promise<void>;
  /** Authentication-provider guards (live on the orchestrator). */
  canSetPassword: (user: AuthUser) => boolean;
  getUserAuthProvider: (user: AuthUser) => string;
  /**
   * Optional operator-notification sink. When present, a fresh account lockout
   * files a security alert in the operator center. Optional so unit tests and
   * lightweight constructions need not wire it.
   */
  operatorNotifier?: {
    securityAlert(input: {
      title: string;
      body?: string;
      data?: Record<string, unknown>;
      dedupeKey?: string;
      severity?: 'warning' | 'critical';
    }): Promise<number | null>;
  };
}

/**
 * PasswordOps — owns password lifecycle + email-verification entry points
 * previously inlined on `AuthService`.
 *
 * Bodies are moved verbatim; `this.db` becomes `this.deps.db`, audit calls
 * route through `this.deps.logAuthEvent`, and cross-collaborator calls
 * (`this.createSession`, `this.canSetPassword`, etc.) route through
 * `this.deps.*`.
 */
export class PasswordOps {
  constructor(private readonly deps: PasswordOpsDeps) {}

  /**
   * File a security alert when an account crosses into lockout. Best-effort:
   * the notifier swallows its own errors, and the dedupe key collapses repeated
   * locks of the same account within the window into one operator item.
   */
  private async notifyAccountLocked(username: string): Promise<void> {
    await this.deps.operatorNotifier?.securityAlert({
      title: `Account locked after repeated failed logins: ${username}`,
      body:
        `The account "${username}" was locked following too many failed ` +
        `login attempts. If this was not the account owner, someone may be ` +
        `attempting to guess the password.`,
      data: { username },
      dedupeKey: `account_locked:${username}`,
      severity: 'warning',
    });
  }

  /** Build the throttle from the loaded auth config (defaults if unloaded). */
  private getThrottle(): LoginThrottle {
    let maxAttempts = 5;
    let lockoutMs = 15 * 60 * 1000;
    try {
      const pw = AuthConfigManager.getInstance().getConfig().password;
      if (pw?.maxLoginAttempts && pw.maxLoginAttempts > 0) {
        maxAttempts = pw.maxLoginAttempts;
      }
      if (pw?.lockoutDuration) {
        lockoutMs = parseDurationMs(pw.lockoutDuration, lockoutMs);
      }
    } catch {
      // config not loaded → keep the safe defaults
    }
    return new LoginThrottle(this.deps.db, { maxAttempts, lockoutMs });
  }

  /**
   * Maintenance sweep over `login_attempts`. Built from the same config as the
   * live throttle so the retention window matches the configured lockout.
   */
  async cleanupStaleLoginAttempts(): Promise<number> {
    return this.getThrottle().cleanupStaleAttempts();
  }

  async authenticateWithPassword(
    username: string,
    password: string
  ): Promise<{ token: string; user: AuthUser; expiresAt: Date }> {
    // FA-API-007: account lockout. The lockout check + AccountLockedError run
    // OUTSIDE the generic catch below so the 429 (and its retry hint) reach
    // the caller instead of being flattened into 'Invalid username or
    // password'. A wrong-password attempt records a failure toward the lock.
    const throttle = this.getThrottle();
    await throttle.assertNotLocked(username);

    try {
      // Get user with password hash
      const user = await this.deps.db.getUserWithPassword(username);
      if (!user || !user.password_hash) {
        const locked = await throttle.recordFailure(username);
        if (locked) await this.notifyAccountLocked(username);
        throw new Error('Invalid username or password');
      }

      // Verify password
      const bcrypt = await import('bcrypt');
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        const locked = await throttle.recordFailure(username);
        if (locked) await this.notifyAccountLocked(username);
        throw new Error('Invalid username or password');
      }

      // Success clears the failure counter.
      await throttle.recordSuccess(username);

      // Create session
      const { token: sessionToken, session } = await this.deps.createSession(
        user.id
      );

      // Log authentication event
      await this.deps.logAuthEvent(
        user.id,
        'password_login',
        `Password login for user ${user.username}`,
        'password'
      );

      return {
        token: sessionToken,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          email: user.email,
          name: user.name,
          avatar_url: user.avatar_url,
        },
        expiresAt: session.expiresAt,
      };
    } catch (error) {
      if (error instanceof AccountLockedError) throw error;
      this.deps.logger?.error('Password authentication failed:', error);
      throw new Error('Invalid username or password');
    }
  }

  /**
   * The single password-policy chokepoint. AuthConfigManager's validator
   * existed but was dead code — 1-character passwords were accepted at
   * every entry point. Every path that receives a PLAINTEXT password must
   * run it: change/set enforce it below; registration and the CLI (which
   * hash before core ever sees the password) call it via AuthService.
   */
  validatePasswordPolicy(password: string): {
    valid: boolean;
    errors: string[];
  } {
    return AuthConfigManager.getInstance().validatePassword(password);
  }

  /**
   * Self-service password change.
   *
   * Succeeds by revoking EVERY session the user holds, including the one that
   * made this request — that is deliberate (see the revoke-first comment
   * below), but it used to be invisible: the caller got a bare "Password
   * successfully changed" and then found itself silently logged out on the
   * next request, which reads as a bug. The result now says so explicitly and
   * carries a machine-readable `sessionsRevoked` flag so the API/UI can route
   * the user to a re-login instead of string-matching the message.
   */
  async changePassword(
    userId: number,
    newPassword: string,
    currentPassword?: string
  ): Promise<{
    success: boolean;
    message: string;
    sessionsRevoked?: boolean;
  }> {
    try {
      // Get current user to check authentication provider
      const currentUser = await this.deps.db.getUserById(userId);
      if (!currentUser) {
        throw new Error('User not found');
      }

      // Create AuthUser object for guard checks
      const authUser: AuthUser = {
        id: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
        email: currentUser.email,
        name: currentUser.name,
        avatar_url: currentUser.avatar_url,
        auth_provider: currentUser.auth_provider,
        email_verified: !!currentUser.email_verified,
        pending_email: currentUser.pending_email,
        created_at: currentUser.created_at
          ? new Date(currentUser.created_at)
          : undefined,
        updated_at: currentUser.updated_at
          ? new Date(currentUser.updated_at)
          : undefined,
      };

      // SECURITY GUARD: Prevent external auth users from setting passwords
      if (!this.deps.canSetPassword(authUser)) {
        const provider = this.deps.getUserAuthProvider(authUser);
        return {
          success: false,
          message: `Users authenticated via ${provider} cannot change passwords. Password management is handled by the external authentication.`,
        };
      }

      // Enforce the configured password policy before anything mutates.
      const policy = this.validatePasswordPolicy(newPassword);
      if (!policy.valid) {
        return {
          success: false,
          message: `Password does not meet requirements: ${policy.errors.join('; ')}`,
        };
      }

      // Verify current password if provided (for password changes by the user themselves)
      if (currentPassword) {
        const userWithPassword = await this.deps.db.getUserWithPassword(
          currentUser.username
        );
        if (userWithPassword && userWithPassword.password_hash) {
          const bcrypt = await import('bcrypt');
          const isCurrentPasswordValid = await bcrypt.compare(
            currentPassword,
            userWithPassword.password_hash
          );
          if (!isCurrentPasswordValid) {
            return {
              success: false,
              message: 'Current password is incorrect',
            };
          }
        }
      }

      // Hash new password
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(newPassword, 12);

      // Revoke every existing session BEFORE updating the credential: a
      // password change must cut off whoever holds tokens minted under the
      // old one (the stolen-token case is exactly why the user is changing
      // it). Revoke-first is the fail-safe ordering — if revocation throws,
      // the password stays unchanged; if the update below fails, the user
      // is merely logged out everywhere, never left with live sessions
      // spanning the credential change.
      await this.deps.deleteUserSessions(userId);

      // Update password
      const updated = await this.deps.db.updateUser(userId, { passwordHash });
      if (!updated) {
        return {
          success: false,
          message: 'Failed to update password',
        };
      }

      // Log security event
      await this.deps.logAuthEvent(
        userId,
        'password_changed',
        `Password changed for user ${currentUser.username}; all sessions revoked`
      );

      this.deps.logger?.info(
        `Password changed for user ${currentUser.username} (ID: ${userId})`
      );

      return {
        success: true,
        sessionsRevoked: true,
        message:
          'Password successfully changed. For your security you have been ' +
          'signed out on every device, including this one — please sign in ' +
          'again with your new password.',
      };
    } catch (error) {
      this.deps.logger?.error('Password change failed:', error);
      throw new Error('Failed to change password');
    }
  }

  async setUserPassword(
    userId: number,
    newPassword: string,
    adminUserId: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get target user to check authentication provider
      const targetUser = await this.deps.db.getUserById(userId);
      if (!targetUser) {
        throw new Error('User not found');
      }

      // Create AuthUser object for guard checks
      const authUser: AuthUser = {
        id: targetUser.id,
        username: targetUser.username,
        role: targetUser.role,
        email: targetUser.email,
        name: targetUser.name,
        avatar_url: targetUser.avatar_url,
        auth_provider: targetUser.auth_provider,
        email_verified: !!targetUser.email_verified,
        pending_email: targetUser.pending_email,
        created_at: targetUser.created_at
          ? new Date(targetUser.created_at)
          : undefined,
        updated_at: targetUser.updated_at
          ? new Date(targetUser.updated_at)
          : undefined,
      };

      // SECURITY GUARD: Prevent external auth users from having passwords set
      if (!this.deps.canSetPassword(authUser)) {
        const provider = this.deps.getUserAuthProvider(authUser);
        return {
          success: false,
          message: `Cannot set password for users authenticated via ${provider}. Password management is handled by the external authentication.`,
        };
      }

      // Enforce the configured password policy — admin resets included.
      const policy = this.validatePasswordPolicy(newPassword);
      if (!policy.valid) {
        return {
          success: false,
          message: `Password does not meet requirements: ${policy.errors.join('; ')}`,
        };
      }

      // Hash new password
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(newPassword, 12);

      // Revoke the target user's sessions BEFORE the update — an admin
      // reset is the standard compromise response, so live tokens must die
      // with the old password (revoke-first: same fail-safe ordering as
      // changePassword).
      await this.deps.deleteUserSessions(userId);

      // Update password
      const updated = await this.deps.db.updateUser(userId, { passwordHash });
      if (!updated) {
        return {
          success: false,
          message: 'Failed to set password',
        };
      }

      // Log security event
      await this.deps.logAuthEvent(
        adminUserId,
        'admin_password_set',
        `Password set for user ${targetUser.username} by admin; all sessions revoked`
      );

      this.deps.logger?.info(
        `Password set for user ${targetUser.username} (ID: ${userId}) by admin (ID: ${adminUserId})`
      );

      return {
        success: true,
        message: 'Password set successfully',
      };
    } catch (error) {
      this.deps.logger?.error('Password set failed:', error);
      throw new Error('Failed to set password');
    }
  }

  async sendEmailVerification(userId: number): Promise<{
    success: boolean;
    message: string;
    requiresVerification?: boolean;
  }> {
    try {
      return await this.deps.emailValidationService.sendEmailVerification(
        userId
      );
    } catch (error) {
      this.deps.logger?.error('Failed to send email verification:', error);
      throw new Error('Failed to send email verification');
    }
  }

  async verifyCurrentEmail(token: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      return await this.deps.emailValidationService.verifyCurrentEmail(token);
    } catch (error) {
      this.deps.logger?.error('Failed to verify current email:', error);
      throw new Error('Failed to verify current email');
    }
  }

  // Password reset (forgot-password) --------------------------------------------

  /** Build an AuthUser from a user row for the provider guards. */
  private toAuthUser(user: {
    id: number;
    username: string;
    role: string;
    email?: string;
    name?: string;
    avatar_url?: string;
    auth_provider?: string;
    email_verified?: number;
    pending_email?: string;
  }): AuthUser {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      auth_provider: user.auth_provider,
      email_verified: !!user.email_verified,
      pending_email: user.pending_email,
    };
  }

  /**
   * Resolve a reset-eligible account from an identifier (username OR email)
   * WITHOUT minting anything. Returns null when no such account exists or the
   * account is external-auth (OAuth — no password to reset).
   *
   * Split out from token minting so the delivery layer can decide whether any
   * user-facing channel can even reach this person BEFORE a token is created:
   * when no channel can (the default operator-mediated path), no token is
   * minted at all. Callers MUST respond identically whether this returns a
   * user or null (anti-enumeration).
   */
  async findResetEligibleUser(identifier: string): Promise<{
    userId: number;
    username: string;
    email?: string;
    name?: string;
  } | null> {
    const id = identifier?.trim();
    if (!id) return null;

    // Match by username first, then email. Deliberately no error either way.
    let user = await this.deps.db.getUserByUsername(id);
    if (!user) {
      user = await this.deps.db.getUserByEmail(id);
    }
    if (!user) return null;
    if (!this.deps.canSetPassword(this.toAuthUser(user))) return null;

    return {
      userId: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
    };
  }

  /**
   * Mint a single-use reset token for a KNOWN eligible user id and return the
   * plaintext (returned once, never stored — only the hash is persisted).
   * Used once the delivery layer has confirmed a channel can reach the user.
   */
  async mintResetTokenForUser(
    userId: number,
    ipAddress?: string
  ): Promise<string> {
    const token = generateSecureToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await this.deps.db.createPasswordResetToken(
      userId,
      tokenHash,
      expiresAt,
      ipAddress
    );
    await this.deps.logAuthEvent(
      userId,
      'password_reset_requested',
      'Password reset token issued',
      ipAddress
    );
    return token;
  }

  /**
   * Convenience: resolve + mint in one step. Returns the plaintext token plus
   * contact info, or null if no eligible account matches. Prefer the split
   * {@link findResetEligibleUser} / {@link mintResetTokenForUser} when the
   * caller must avoid minting an undeliverable token.
   */
  async createPasswordResetToken(
    identifier: string,
    ipAddress?: string
  ): Promise<{
    userId: number;
    username: string;
    email?: string;
    name?: string;
    token: string;
  } | null> {
    const user = await this.findResetEligibleUser(identifier);
    if (!user) return null;
    const token = await this.mintResetTokenForUser(user.userId, ipAddress);
    return { ...user, token };
  }

  /**
   * Consume a reset token and set the new password. Same fail-safe posture as
   * an admin set-password: enforce policy, then single-use-consume the token,
   * then revoke every session BEFORE writing the new credential.
   *
   * A weak-password rejection happens BEFORE consuming, so the same link can be
   * retried with a compliant password. Any other outstanding tokens for the
   * user are invalidated on success.
   */
  async resetPasswordWithToken(
    token: string,
    newPassword: string
  ): Promise<{
    success: boolean;
    message: string;
    sessionsRevoked?: boolean;
  }> {
    const t = token?.trim();
    // Uniform failure text: never distinguish unknown / expired / consumed.
    const invalid = {
      success: false as const,
      message: 'This password reset link is invalid or has expired.',
    };
    if (!t) return invalid;

    const row = await this.deps.db.getLivePasswordResetToken(hashToken(t));
    if (!row) return invalid;

    const user = await this.deps.db.getUserById(row.user_id);
    if (!user) return invalid;

    if (!this.deps.canSetPassword(this.toAuthUser(user))) {
      return {
        success: false,
        message: `Password management is handled by ${this.deps.getUserAuthProvider(
          this.toAuthUser(user)
        )} for this account.`,
      };
    }

    // Enforce policy BEFORE consuming so a rejected weak password leaves the
    // link usable for another try.
    const policy = this.validatePasswordPolicy(newPassword);
    if (!policy.valid) {
      return {
        success: false,
        message: `Password does not meet requirements: ${policy.errors.join('; ')}`,
      };
    }

    // Single-use: flip consumed_at atomically. If a concurrent redemption won
    // the race, this returns false and we stop — the other request is setting
    // the password.
    const consumed = await this.deps.db.consumePasswordResetToken(row.id);
    if (!consumed) return invalid;

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Revoke-first (see setUserPassword): a reset is the standard compromise
    // response, so live tokens must die with the old password.
    await this.deps.deleteUserSessions(user.id);

    const updated = await this.deps.db.updateUser(user.id, { passwordHash });
    if (!updated) {
      return { success: false, message: 'Failed to reset password.' };
    }

    // Drop any other outstanding reset tokens for this user.
    await this.deps.db.deleteUserPasswordResetTokens(user.id);

    await this.deps.logAuthEvent(
      user.id,
      'password_reset',
      `Password reset via token for user ${user.username}; all sessions revoked`
    );

    return {
      success: true,
      sessionsRevoked: true,
      message:
        'Your password has been reset. For your security, any existing ' +
        'sessions have been signed out — please sign in with your new password.',
    };
  }
}
