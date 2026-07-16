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
        await throttle.recordFailure(username);
        throw new Error('Invalid username or password');
      }

      // Verify password
      const bcrypt = await import('bcrypt');
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        await throttle.recordFailure(username);
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

  async changePassword(
    userId: number,
    newPassword: string,
    currentPassword?: string
  ): Promise<{ success: boolean; message: string }> {
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
        message: 'Password successfully changed',
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
}
