import * as crypto from 'crypto';
import { DatabaseService } from '../database/database-service.js';
import type { SqlParam } from '../database/database-adapter.js';
import type { UserRow } from '../database/types/row-types.js';
import { Logger } from '../utils/logger.js';
import { NotificationService } from '../notifications/notification-service.js';
import { NotificationConfig } from '../notifications/notification-config.js';
import { coreError, coreDebug } from '../utils/core-output.js';
import { SecretsManager } from '../security/secrets.js';
import { AuditChannel } from '../audit/audit-channel.js';
import { registerEmailChannelOn } from './email-validation-service/email-channel-setup.js';

const logger = new Logger();

/**
 * Parse a datetime value returned by SQLite into a UTC-anchored Date.
 *
 * SQLite's `datetime()` and `CURRENT_TIMESTAMP` produce strings of the
 * form "YYYY-MM-DD HH:MM:SS" with no timezone marker; passing them to
 * `new Date(...)` makes JS interpret them as *local* time, which silently
 * shifts comparisons by the host's UTC offset and produces clock-skew
 * bugs (e.g. an "expired 1 hour ago" row appearing to expire in the
 * future on a host that runs in UTC-4). ISO 8601 strings (with the `T`
 * separator or a trailing `Z`) are already unambiguous and pass through
 * unchanged.
 */
function parseSqliteDatetime(value: Date | string): Date {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return new Date(value);
  // Already ISO or has explicit timezone — let Date parse as-is.
  if (value.includes('T') || /[Zz]|[+-]\d{2}:?\d{2}$/.test(value)) {
    return new Date(value);
  }
  // SQLite "YYYY-MM-DD HH:MM:SS" → anchor to UTC.
  return new Date(value.replace(' ', 'T') + 'Z');
}

export interface EmailVerificationToken {
  id: number;
  user_id: number;
  email: string;
  token: string;
  type: 'initial' | 'change';
  expires_at: Date;
  created_at: Date;
}

export interface EmailChangeRequest {
  currentEmail: string;
  newEmail: string;
  userId: number;
}

export interface EmailValidationResult {
  success: boolean;
  message: string;
  requiresVerification?: boolean;
  verificationToken?: string;
}

export class EmailValidationService {
  private db: DatabaseService;
  private tokenExpiryHours: number = 24; // 24 hours for email verification
  private notificationService: NotificationService;
  private secretsManager?: SecretsManager;
  private auditChannel?: AuditChannel;

  constructor(db: DatabaseService, auditChannel?: AuditChannel) {
    this.db = db;
    this.auditChannel = auditChannel;
    // Initialize notification service
    const notificationConfig = new NotificationConfig();
    this.notificationService = new NotificationService(notificationConfig);
    // Register email channel and templates
    this.registerEmailChannel();
    this.registerEmailTemplates();
  }

  /**
   * Write an email-validation audit entry through the unified AuditChannel
   * if available, otherwise fall back to the legacy direct db call.
   *
   * Phase 2c.5 (T4) — same pattern as AuthService.writeAudit.
   */
  private async writeAudit(event: {
    userId: number | undefined;
    action: string;
    resourceType: string;
    resourceId?: string;
    details?: string;
  }): Promise<void> {
    if (this.auditChannel) {
      await this.auditChannel.record({
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        userId: event.userId,
        source: 'core',
        outcome: 'success',
        message: event.details,
      });
      return;
    }
    await this.db.logAuditEvent({
      userId: event.userId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      details: event.details,
    });
  }

  /**
   * Initialize secrets manager for token signing
   */
  initializeSecrets(secretsManager: SecretsManager): void {
    this.secretsManager = secretsManager;
  }

  /**
   * Register email verification templates
   */
  private registerEmailTemplates(): void {
    try {
      // Import AuthTemplate dynamically to avoid circular dependencies
      const {
        AuthTemplate,
      } = require('../notifications/templates/auth-template.js');

      // Initial email verification template
      const emailVerificationTemplate = new AuthTemplate(
        'email_verification',
        'Please click the following link to verify your account: {{verification_url}}'
      );

      // Email change verification template
      const emailChangeTemplate = new AuthTemplate(
        'email_change_verification',
        'Please click the following link to verify your new email address: {{verification_url}}'
      );

      this.notificationService.registerTemplate(
        'email_verification',
        emailVerificationTemplate
      );
      this.notificationService.registerTemplate(
        'email_change_verification',
        emailChangeTemplate
      );
    } catch (error) {
      logger.error('Error registering email templates:', error);
    }
  }

  /**
   * Get base URL for verification links
   */
  private getBaseUrl(): string {
    // In production, this should come from environment variables or config
    return process.env.BASE_URL || 'http://localhost:3030';
  }

  /**
   * Register email channel with notification service.
   *
   * Delegates to the extracted `registerEmailChannelOn` helper which builds
   * a canonical {@link EmailChannel} and wraps it in a
   * `NotificationChannel`-shaped adapter that translates the notification
   * system's `ChannelRequest` envelope into the canonical channel's
   * `EmailMessage` envelope.
   */
  private registerEmailChannel(): void {
    registerEmailChannelOn(this.notificationService, logger);
  }

  /**
   * Validate email format using a robust regex
   */
  isValidEmailFormat(email: string): boolean {
    if (!email || typeof email !== 'string') {
      return false;
    }

    // Basic email validation with common patterns
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Additional checks
    if (email.length > 254) return false; // RFC 5321 limit
    if (email.includes('..')) return false; // No consecutive dots
    if (email.startsWith('.') || email.endsWith('.')) return false; // No leading/trailing dots
    if (email.includes(' ')) return false; // No spaces
    if (email.startsWith('@') || email.endsWith('@')) return false; // No leading/trailing @

    return emailRegex.test(email);
  }

  /**
   * Check if email is already in use by another user
   */
  async isEmailInUse(email: string, excludeUserId?: number): Promise<boolean> {
    try {
      let query = 'SELECT COUNT(*) as count FROM users WHERE email = ?';
      const params: SqlParam[] = [email];

      if (excludeUserId) {
        query += ' AND id != ?';
        params.push(excludeUserId);
      }

      const result = await this.db.query<{ count: number }>(query, params);
      return result[0].count > 0;
    } catch (error) {
      logger.error('Error checking email uniqueness:', error);
      throw new Error('Failed to validate email uniqueness');
    }
  }

  /**
   * Generate a secure verification token
   */
  private generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create email verification token
   */
  async createVerificationToken(
    userId: number,
    email: string,
    type: 'initial' | 'change'
  ): Promise<string> {
    try {
      // Generate random token
      const token = this.generateVerificationToken();

      // Sign token if secrets manager available
      let finalToken = token;
      if (this.secretsManager) {
        const signingKey = this.secretsManager.getTokenSigningKey();
        const signature = this.secretsManager.sign(token, signingKey);
        finalToken = `${token}.${signature}`;
      }

      // Store raw token hash in database
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.tokenExpiryHours);

      // Clean up any existing tokens for this user and type
      await this.db.execute(
        'DELETE FROM email_verifications WHERE user_id = ? AND type = ?',
        [userId, type]
      );

      // Create new verification token (store hash, not raw token)
      await this.db.execute(
        'INSERT INTO email_verifications (user_id, email, token, type, expires_at) VALUES (?, ?, ?, ?, ?)',
        [userId, email, tokenHash, type, expiresAt.toISOString()]
      );

      // Send verification email (if email channel is enabled)
      const action =
        type === 'initial' ? 'verify-email' : 'confirm-email-change';
      // Use finalToken (signed if available) in the URL
      const verificationUrl = `${this.getBaseUrl()}/settings/profile?action=${action}&token=${finalToken}`;
      const templateName =
        type === 'initial' ? 'email_verification' : 'email_change_verification';

      try {
        await this.notificationService.sendNotification({
          email: email,
          channels: ['email'],
          template: templateName,
          data: {
            verification_url: verificationUrl,
            token: finalToken, // Use signed token in email data
            expires_at: expiresAt.toISOString(),
          },
        });

        logger.info(
          `Email verification token created for user ${userId}, type: ${type}`
        );
      } catch (emailError) {
        // Log the error but don't fail the token creation
        logger.warn(
          `Email verification token created for user ${userId}, type: ${type}, but email sending failed:`,
          emailError
        );
      }

      return finalToken; // Return signed token to caller
    } catch (error) {
      logger.error('Error creating email verification token:', error);
      throw new Error('Failed to create email verification token');
    }
  }

  /**
   * Verify email verification token
   */
  async verifyToken(token: string): Promise<EmailVerificationToken | null> {
    try {
      let tokenToHash = token;

      // If token is signed, verify and extract raw token
      if (this.secretsManager && token.includes('.')) {
        const parts = token.split('.');
        if (parts.length === 2) {
          const [rawToken, signature] = parts;
          const signingKey = this.secretsManager.getTokenSigningKey();

          if (this.secretsManager.verify(rawToken, signature, signingKey)) {
            tokenToHash = rawToken;
          } else {
            // Invalid signature
            return null;
          }
        }
      }

      // Hash and lookup in database
      const tokenHash = crypto
        .createHash('sha256')
        .update(tokenToHash)
        .digest('hex');

      // Fetch by token hash only — defensively re-check expiry in code so the
      // result is the same regardless of clock skew, SQLite datetime
      // semantics, or future schema changes that drop the expires_at filter.
      const result = await this.db.query(
        'SELECT * FROM email_verifications WHERE token = ?',
        [tokenHash]
      );

      if (result.length === 0) {
        return null;
      }

      const verification = result[0] as EmailVerificationToken;
      // SQLite datetime() functions return strings like "2026-05-19 12:27:42"
      // (no timezone marker); without normalization, new Date() interprets
      // them as local time, which silently shifts comparisons by the host's
      // UTC offset. Anchor un-marked strings to UTC before constructing the
      // Date so expiry checks are timezone-stable.
      verification.expires_at = parseSqliteDatetime(verification.expires_at);
      verification.created_at = parseSqliteDatetime(verification.created_at);

      // Reject expired tokens; opportunistically purge the stale row.
      if (verification.expires_at.getTime() <= Date.now()) {
        try {
          await this.db.execute(
            'DELETE FROM email_verifications WHERE id = ?',
            [verification.id]
          );
        } catch (cleanupError) {
          logger.warn(
            'Failed to purge expired verification token:',
            cleanupError
          );
        }
        return null;
      }

      return verification;
    } catch (error) {
      logger.error('Error verifying email token:', error);
      throw new Error('Failed to verify email token');
    }
  }

  /**
   * Request email change for existing user
   */
  async requestEmailChange(
    request: EmailChangeRequest
  ): Promise<EmailValidationResult> {
    try {
      // Validate new email format
      if (!this.isValidEmailFormat(request.newEmail)) {
        return {
          success: false,
          message: 'Invalid email format',
        };
      }

      // Check if new email is already in use
      const emailInUse = await this.isEmailInUse(
        request.newEmail,
        request.userId
      );
      if (emailInUse) {
        return {
          success: false,
          message: 'Email address is already in use by another account',
        };
      }

      // Check if user exists
      const user = await this.db.getUserById(request.userId);
      if (!user) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      // Generate verification token
      const verificationToken = await this.createVerificationToken(
        request.userId,
        request.newEmail,
        'change'
      );

      // Update user with pending email change
      await this.db.execute(
        'UPDATE users SET pending_email = ?, pending_email_token = ?, pending_email_expires = datetime("now", "+24 hours"), updated_at = datetime("now") WHERE id = ?',
        [request.newEmail, verificationToken, request.userId]
      );

      logger.info(
        `Email change requested for user ${request.userId}: ${request.currentEmail} → ${request.newEmail}`
      );

      return {
        success: true,
        message: 'Email verification sent to new address',
        requiresVerification: true,
        verificationToken,
      };
    } catch (error) {
      logger.error('Error requesting email change:', error);
      throw new Error('Failed to process email change request');
    }
  }

  /**
   * Complete email change after verification
   */
  async completeEmailChange(token: string): Promise<EmailValidationResult> {
    try {
      // Verify token
      const verification = await this.verifyToken(token);
      if (!verification) {
        return {
          success: false,
          message: 'Invalid or expired verification token',
        };
      }

      if (verification.type !== 'change') {
        return {
          success: false,
          message: 'Invalid token type for email change',
        };
      }

      // Get user with pending email change
      const user = await this.db.getUserById(verification.user_id);
      if (!user) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      // Verify the pending email matches the token
      if (user.pending_email !== verification.email) {
        return {
          success: false,
          message: 'Email change token mismatch',
        };
      }

      // Check if new email is still available (race condition protection)
      const emailInUse = await this.isEmailInUse(
        verification.email,
        verification.user_id
      );
      if (emailInUse) {
        return {
          success: false,
          message: 'Email address is no longer available',
        };
      }

      // Complete the email change
      await this.db.execute(
        'UPDATE users SET email = ?, email_verified = TRUE, pending_email = NULL, pending_email_token = NULL, pending_email_expires = NULL, updated_at = datetime("now") WHERE id = ?',
        [verification.email, verification.user_id]
      );

      // Clean up verification token
      await this.db.execute('DELETE FROM email_verifications WHERE id = ?', [
        verification.id,
      ]);

      // Log the successful email change (routed through unified AuditChannel)
      await this.writeAudit({
        userId: verification.user_id,
        action: 'email_changed',
        resourceType: 'user_management',
        resourceId: verification.user_id.toString(),
        details: `Email changed from ${user.email} to ${verification.email}`,
      });

      logger.info(
        `Email change completed for user ${verification.user_id}: ${user.email} → ${verification.email}`
      );

      return {
        success: true,
        message: 'Email address successfully updated',
      };
    } catch (error) {
      logger.error('Error completing email change:', error);
      throw new Error('Failed to complete email change');
    }
  }

  /**
   * Cancel pending email change
   */
  async cancelEmailChange(userId: number): Promise<EmailValidationResult> {
    try {
      // Clear pending email fields
      await this.db.execute(
        'UPDATE users SET pending_email = NULL, pending_email_token = NULL, pending_email_expires = NULL, updated_at = datetime("now") WHERE id = ?',
        [userId]
      );

      // Clean up verification tokens
      await this.db.execute(
        'DELETE FROM email_verifications WHERE user_id = ? AND type = "change"',
        [userId]
      );

      logger.info(`Email change cancelled for user ${userId}`);

      return {
        success: true,
        message: 'Email change request cancelled',
      };
    } catch (error) {
      logger.error('Error cancelling email change:', error);
      throw new Error('Failed to cancel email change');
    }
  }

  /**
   * Clean up expired verification tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      // Check if email_verifications table exists
      const tableCheck = await this.db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='email_verifications'"
      );

      if (tableCheck.length === 0) {
        logger.warn(
          'email_verifications table does not exist, skipping cleanup'
        );
        return 0;
      }

      const result = await this.db.execute(
        'DELETE FROM email_verifications WHERE datetime(expires_at) <= datetime("now")'
      );

      // Also clean up expired pending email changes in users table
      await this.db.execute(
        'UPDATE users SET pending_email = NULL, pending_email_token = NULL, pending_email_expires = NULL WHERE datetime(pending_email_expires) <= datetime("now")'
      );

      const deletedCount = result.changes || 0;

      if (deletedCount > 0) {
        logger.info(
          `Cleaned up ${deletedCount} expired email verification tokens`
        );
      }

      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up expired tokens:', error);
      coreError(
        'Detailed error in cleanupExpiredTokens',
        'CLEANUP_TOKENS_ERROR',
        {
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'auth:email-validation' }
      );
      // Don't throw error in tests, just return 0
      return 0;
    }
  }

  /**
   * Get pending email change for user
   */
  async getPendingEmailChange(userId: number): Promise<{
    pendingEmail: string | null;
    expiresAt: Date | null;
  }> {
    try {
      const result = await this.db.query<
        Pick<UserRow, 'pending_email' | 'pending_email_expires'>
      >('SELECT pending_email, pending_email_expires FROM users WHERE id = ?', [
        userId,
      ]);

      if (result.length === 0) {
        return { pendingEmail: null, expiresAt: null };
      }

      const user = result[0];
      return {
        pendingEmail: user.pending_email || null,
        expiresAt: user.pending_email_expires
          ? new Date(user.pending_email_expires)
          : null,
      };
    } catch (error) {
      logger.error('Error getting pending email change:', error);
      throw new Error('Failed to get pending email change');
    }
  }

  /**
   * Send email verification for current email address
   */
  async sendEmailVerification(userId: number): Promise<EmailValidationResult> {
    try {
      // Get user
      const user = await this.db.getUserById(userId);

      if (!user) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      if (!user.email) {
        coreDebug(
          `User ${user.username} has no email address`,
          {
            userId,
            username: user.username,
          },
          { operation: 'auth:email-validation' }
        );
        return {
          success: false,
          message: 'User has no email address to verify',
        };
      }

      if (user.email_verified) {
        coreDebug(
          `User ${user.username} email already verified`,
          {
            userId,
            username: user.username,
          },
          { operation: 'auth:email-validation' }
        );
        return {
          success: false,
          message: 'Email address is already verified',
        };
      }

      // Generate verification token for initial verification
      const verificationToken = await this.createVerificationToken(
        userId,
        user.email,
        'initial'
      );

      logger.info(`Email verification sent to user ${userId}: ${user.email}`);

      return {
        success: true,
        message: 'Verification email sent successfully',
        requiresVerification: true,
        verificationToken,
      };
    } catch (error) {
      coreError(
        'Error in sendEmailVerification',
        'EMAIL_VERIFICATION_ERROR',
        {
          userId,
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'auth:email-validation' }
      );
      logger.error('Error sending email verification:', error);
      throw new Error('Failed to send email verification');
    }
  }

  /**
   * Verify current email address with token
   */
  async verifyCurrentEmail(token: string): Promise<EmailValidationResult> {
    try {
      // Verify token
      const verification = await this.verifyToken(token);
      if (!verification) {
        return {
          success: false,
          message: 'Invalid or expired verification token',
        };
      }

      // Only allow initial verification tokens
      if (verification.type !== 'initial') {
        return {
          success: false,
          message: 'Invalid verification token type',
        };
      }

      // Mark email as verified
      await this.db.execute(
        'UPDATE users SET email_verified = TRUE, updated_at = datetime("now") WHERE id = ?',
        [verification.user_id]
      );

      // Consume the verification token. FA-CORE-012: the `token` column stores
      // a SHA-256 hash, not the raw/signed token, so a DELETE ... WHERE token =
      // <raw token> matched nothing and the single-use guarantee was broken.
      // Delete by primary key from the row verifyToken already resolved.
      await this.db.execute('DELETE FROM email_verifications WHERE id = ?', [
        verification.id,
      ]);

      logger.info(
        `Email verified successfully for user ${verification.user_id}: ${verification.email}`
      );

      return {
        success: true,
        message: 'Email address verified successfully',
      };
    } catch (error) {
      logger.error('Error verifying current email:', error);
      throw new Error('Failed to verify email address');
    }
  }
}
