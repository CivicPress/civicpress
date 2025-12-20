import * as crypto from 'crypto';
import { DatabaseService } from '../database/database-service.js';
import { Logger } from '../utils/logger.js';
import { NotificationService } from '../notifications/notification-service.js';
import { NotificationConfig } from '../notifications/notification-config.js';
import { coreError, coreDebug } from '../utils/core-output.js';
import { SecretsManager } from '../security/secrets.js';

const logger = new Logger();

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

  constructor(db: DatabaseService) {
    this.db = db;
    // Initialize notification service
    const notificationConfig = new NotificationConfig();
    this.notificationService = new NotificationService(notificationConfig);
    // Register email channel and templates
    this.registerEmailChannel();
    this.registerEmailTemplates();
  }

  /**
   * Initialize secrets manager for token signing
   */
  initializeSecrets(secretsManager: SecretsManager): void {
    this.secretsManager = secretsManager;
    // Also initialize secrets in notification service used by email validation
    this.notificationService.initializeSecrets(secretsManager);
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
   * Register email channel with notification service
   */
  private registerEmailChannel(): void {
    try {
      // Create notification config to get email configuration
      const notificationConfig = new NotificationConfig();
      const emailConfig = notificationConfig.getChannelConfig('email');

      if (!emailConfig || !emailConfig.enabled) {
        logger.warn('Email channel not enabled in configuration');
        return;
      }

      // Create a simple email channel implementation
      const emailChannel = {
        getName() {
          return 'email';
        },
        isEnabled() {
          return true;
        },
        async send(request: any) {
          const nodemailer = await import('nodemailer');

          // Normalize the configuration (handle metadata format)
          const normalizeValue = (obj: any) =>
            obj && typeof obj === 'object' && 'value' in obj ? obj.value : obj;

          const smtpConfig = normalizeValue(emailConfig.smtp || emailConfig);
          const host = normalizeValue(smtpConfig.host);
          const port = normalizeValue(smtpConfig.port);
          const secure = normalizeValue(smtpConfig.secure);
          const auth = {
            user: normalizeValue(smtpConfig.auth?.user),
            pass: normalizeValue(smtpConfig.auth?.pass),
          };
          const from = normalizeValue(smtpConfig.from);
          const tls = normalizeValue(smtpConfig.tls);

          // Extract rejectUnauthorized from TLS config
          const rejectUnauthorized =
            tls && tls.rejectUnauthorized
              ? normalizeValue(tls.rejectUnauthorized)
              : false;

          const tlsConfig = {
            rejectUnauthorized, // Use the extracted value
            // Don't spread the original tls config as it contains metadata format
          };

          const transporter = nodemailer.default.createTransport({
            host,
            port,
            secure,
            auth,
            tls: tlsConfig,
            debug: true,
            logger: true,
          });

          // Test connection

          await transporter.verify();

          const mailOptions = {
            from,
            to: request.to,
            subject:
              request.content?.subject || 'Verify your CivicPress account',
            text: request.content?.text || request.content?.body,
            html: request.content?.html,
          };

          const info = await transporter.sendMail(mailOptions);

          return {
            success: true,
            messageId: info.messageId || `smtp_${Date.now()}`,
          };
        },
      };

      // Register the channel
      this.notificationService.registerChannel('email', emailChannel as any);

      logger.info('Email channel registered successfully');
    } catch (error) {
      logger.error('Error registering email channel:', error);
    }
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
      const params: any[] = [email];

      if (excludeUserId) {
        query += ' AND id != ?';
        params.push(excludeUserId);
      }

      const result = await this.db.query(query, params);
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

      const result = await this.db.query(
        'SELECT * FROM email_verifications WHERE token = ? AND expires_at > datetime("now")',
        [tokenHash]
      );

      if (result.length === 0) {
        return null;
      }

      const verification = result[0] as EmailVerificationToken;
      verification.expires_at = new Date(verification.expires_at);
      verification.created_at = new Date(verification.created_at);

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

      // Log the successful email change
      await this.db.logAuditEvent({
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
      const tableCheck = await this.db.query(
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

      const deletedCount = (result as any).changes || 0;

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
      const result = await this.db.query(
        'SELECT pending_email, pending_email_expires FROM users WHERE id = ?',
        [userId]
      );

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

      // Clean up verification token
      await this.db.execute('DELETE FROM email_verifications WHERE token = ?', [
        token,
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
