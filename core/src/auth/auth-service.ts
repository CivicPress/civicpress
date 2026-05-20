import { DatabaseService } from '../database/database-service.js';
import { Logger } from '../utils/logger.js';
import { OAuthProviderManager } from './oauth-provider.js';
import { RoleManager } from './role-manager.js';
import {
  EmailValidationService,
  EmailChangeRequest,
  EmailValidationResult,
} from './email-validation-service.js';
import { SecretsManager } from '../security/secrets.js';
import { AuditChannel } from '../audit/audit-channel.js';
import { UserOps } from './auth-service/user-ops.js';
import { ApiKeyOps } from './auth-service/api-key-ops.js';
import { SessionOps } from './auth-service/session-ops.js';
import { OAuthOps } from './auth-service/oauth-ops.js';
import { PasswordOps } from './auth-service/password-ops.js';

const logger = new Logger();

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  email?: string;
  name?: string;
  avatar_url?: string;
  auth_provider?: string; // Track authentication method
  email_verified?: boolean; // Email verification status
  pending_email?: string; // Email change in progress
  created_at?: Date;
  updated_at?: Date;
}

export interface ApiKey {
  id: number;
  keyHash: string;
  userId: number;
  name: string;
  expiresAt?: Date;
  user: AuthUser;
}

export interface Session {
  id: number;
  tokenHash: string;
  userId: number;
  expiresAt: Date;
  user: AuthUser;
}

/**
 * AuthService — orchestrator that delegates user/session/api-key/oauth/password
 * operations to focused collaborators under `./auth-service/`.
 *
 * Phase 2d W2-T7 (refactor 2026-05): the original 1,354 LoC class was broken
 * into 5 collaborators + a shared `crypto` helpers module. This file remains
 * the only surface other packages import; every public method preserves its
 * exact signature, so consumers do not need to change.
 */
export class AuthService {
  private db: DatabaseService;
  private oauthManager: OAuthProviderManager;
  private roleManager: RoleManager;
  private emailValidationService: EmailValidationService;
  private secretsManager?: SecretsManager;
  private auditChannel?: AuditChannel;

  // Collaborators (instantiated in constructor with bound deps).
  private userOps: UserOps;
  private apiKeyOps: ApiKeyOps;
  private sessionOps: SessionOps;
  private oauthOps: OAuthOps;
  private passwordOps: PasswordOps;

  constructor(
    db: DatabaseService,
    dataDir: string,
    auditChannel?: AuditChannel
  ) {
    this.db = db;
    this.oauthManager = new OAuthProviderManager();
    this.roleManager = new RoleManager(dataDir);
    this.emailValidationService = new EmailValidationService(db, auditChannel);
    this.auditChannel = auditChannel;

    // Shared deps used by every collaborator.
    const writeAudit = this.writeAudit.bind(this);
    const logAuthEvent = this.logAuthEvent.bind(this);
    const getSecretsManager = () => this.secretsManager;
    const getDefaultRole = () => this.getDefaultRole();
    const isValidRole = (role: string) => this.isValidRole(role);
    const canSetPassword = (user: AuthUser) => this.canSetPassword(user);
    const getUserAuthProvider = (user: AuthUser) =>
      this.getUserAuthProvider(user);

    this.userOps = new UserOps({
      db,
      logger,
      writeAudit,
      getDefaultRole,
      canSetPassword,
      getUserAuthProvider,
      logAuthEvent,
    });

    this.apiKeyOps = new ApiKeyOps({
      db,
      logger,
      writeAudit,
      getSecretsManager,
    });

    this.sessionOps = new SessionOps({
      db,
      logger,
      writeAudit,
      getSecretsManager,
    });

    // Bind the now-extracted user/session methods so collaborators that depend
    // on them (oauth, password) can keep their original cross-method calls.
    const createSession = (userId: number, expiresInHours?: number) =>
      this.sessionOps.createSession(userId, expiresInHours);
    const getUserByUsername = (username: string) =>
      this.userOps.getUserByUsername(username);
    const createUser = (userData: Parameters<UserOps['createUser']>[0]) =>
      this.userOps.createUser(userData);
    const updateUser = (
      userId: number,
      userData: Parameters<UserOps['updateUser']>[1]
    ) => this.userOps.updateUser(userId, userData);

    this.oauthOps = new OAuthOps({
      db,
      logger,
      oauthManager: this.oauthManager,
      writeAudit,
      logAuthEvent,
      getUserByUsername,
      createUser,
      updateUser,
      createSession,
      getDefaultRole,
      isValidRole,
    });

    this.passwordOps = new PasswordOps({
      db,
      logger,
      writeAudit,
      emailValidationService: this.emailValidationService,
      logAuthEvent,
      createSession,
      canSetPassword,
      getUserAuthProvider,
    });
  }

  /**
   * Write an auth audit entry through the unified AuditChannel if available,
   * otherwise fall back to the legacy direct db.logAuditEvent call.
   *
   * Phase 2c.5 (T4) — closes the 2 remaining direct callers flagged in
   * the Phase 2c closure report's §"Surfaced, not fixed".
   */
  private async writeAudit(event: {
    userId: number | undefined;
    action: string;
    details?: string;
    ipAddress?: string;
  }): Promise<void> {
    if (this.auditChannel) {
      await this.auditChannel.record({
        action: event.action,
        resourceType: 'auth',
        userId: event.userId,
        source: 'core',
        outcome: 'success',
        message: event.details,
        details: event.ipAddress ? { ipAddress: event.ipAddress } : undefined,
      });
      return;
    }
    await this.db.logAuditEvent({
      userId: event.userId,
      action: event.action,
      resourceType: 'auth',
      details: event.details,
      ipAddress: event.ipAddress,
    });
  }

  /**
   * Initialize secrets manager for token signing
   */
  initializeSecrets(secretsManager: SecretsManager): void {
    this.secretsManager = secretsManager;
  }

  /**
   * Initialize email validation service secrets
   */
  initializeEmailValidationSecrets(secretsManager: SecretsManager): void {
    this.emailValidationService.initializeSecrets(secretsManager);
  }

  /**
   * Check if a user can perform a specific action
   * @param user - The authenticated user
   * @param permission - The permission to check (e.g., 'records:create', 'system:admin')
   * @param context - Optional context for the permission check
   * @returns boolean indicating if the user has permission
   */
  async userCan(
    user: AuthUser,
    permission: string | string[],
    context?: {
      recordType?: string;
      action?: 'create' | 'edit' | 'delete' | 'view';
      fromStatus?: string;
      toStatus?: string;
    }
  ): Promise<boolean> {
    return this.roleManager.userCan(user, permission, context);
  }

  /**
   * Check if a user has a specific role
   * @param user - The authenticated user
   * @param role - The role to check (can be array for multiple roles)
   * @returns boolean indicating if the user has the role
   */
  async userHasRole(user: AuthUser, role: string | string[]): Promise<boolean> {
    return this.roleManager.userHasRole(user, role);
  }

  /**
   * Get all permissions for a user (including inherited permissions)
   * @param user - The authenticated user
   * @returns Array of permission strings
   */
  async getUserPermissions(user: AuthUser): Promise<string[]> {
    return this.roleManager.getUserPermissions(user);
  }

  /**
   * Get the default role for new users
   * @returns The default role name
   */
  async getDefaultRole(): Promise<string> {
    const role = await this.roleManager.getDefaultRole();
    return role;
  }

  /**
   * Get all available roles
   * @returns Array of role names
   */
  async getAvailableRoles(): Promise<string[]> {
    return this.roleManager.getAvailableRoles();
  }

  /**
   * Get the role manager instance
   * @returns RoleManager instance
   */
  getRoleManager(): RoleManager {
    return this.roleManager;
  }

  /**
   * Validate a role exists
   * @param role - The role to validate
   * @returns boolean indicating if the role exists
   */
  async isValidRole(role: string): Promise<boolean> {
    return this.roleManager.isValidRole(role);
  }

  /**
   * Force reload the role configuration (useful for testing)
   */
  async reloadRoleConfig(): Promise<void> {
    await this.roleManager.reloadConfig();
  }

  // ===============================
  // API KEY AUTHENTICATION (delegated to ApiKeyOps)
  // ===============================

  async createApiKey(
    ...args: Parameters<ApiKeyOps['createApiKey']>
  ): ReturnType<ApiKeyOps['createApiKey']> {
    return this.apiKeyOps.createApiKey(...args);
  }

  async validateApiKey(
    ...args: Parameters<ApiKeyOps['validateApiKey']>
  ): ReturnType<ApiKeyOps['validateApiKey']> {
    return this.apiKeyOps.validateApiKey(...args);
  }

  async deleteApiKey(
    ...args: Parameters<ApiKeyOps['deleteApiKey']>
  ): ReturnType<ApiKeyOps['deleteApiKey']> {
    return this.apiKeyOps.deleteApiKey(...args);
  }

  // ===============================
  // SESSION MANAGEMENT (delegated to SessionOps)
  // ===============================

  async createSession(
    ...args: Parameters<SessionOps['createSession']>
  ): ReturnType<SessionOps['createSession']> {
    return this.sessionOps.createSession(...args);
  }

  async validateSession(
    ...args: Parameters<SessionOps['validateSession']>
  ): ReturnType<SessionOps['validateSession']> {
    return this.sessionOps.validateSession(...args);
  }

  async deleteSession(
    ...args: Parameters<SessionOps['deleteSession']>
  ): ReturnType<SessionOps['deleteSession']> {
    return this.sessionOps.deleteSession(...args);
  }

  async cleanupExpiredSessions(): Promise<void> {
    return this.sessionOps.cleanupExpiredSessions();
  }

  // ===============================
  // USER MANAGEMENT (delegated to UserOps)
  // ===============================

  async createUser(
    ...args: Parameters<UserOps['createUser']>
  ): ReturnType<UserOps['createUser']> {
    return this.userOps.createUser(...args);
  }

  async getUserByUsername(
    ...args: Parameters<UserOps['getUserByUsername']>
  ): ReturnType<UserOps['getUserByUsername']> {
    return this.userOps.getUserByUsername(...args);
  }

  async getUserById(
    ...args: Parameters<UserOps['getUserById']>
  ): ReturnType<UserOps['getUserById']> {
    return this.userOps.getUserById(...args);
  }

  /**
   * List all users
   */
  async listUsers(): Promise<AuthUser[]> {
    return this.userOps.listUsers();
  }

  /**
   * Create user with password hash
   */
  async createUserWithPassword(
    ...args: Parameters<UserOps['createUserWithPassword']>
  ): ReturnType<UserOps['createUserWithPassword']> {
    return this.userOps.createUserWithPassword(...args);
  }

  /**
   * Update user information
   */
  async updateUser(
    ...args: Parameters<UserOps['updateUser']>
  ): ReturnType<UserOps['updateUser']> {
    return this.userOps.updateUser(...args);
  }

  /**
   * Delete user
   */
  async deleteUser(
    ...args: Parameters<UserOps['deleteUser']>
  ): ReturnType<UserOps['deleteUser']> {
    return this.userOps.deleteUser(...args);
  }

  // ===============================
  // PASSWORD AUTHENTICATION (delegated to PasswordOps)
  // ===============================

  /**
   * Authenticate with username and password
   */
  async authenticateWithPassword(
    ...args: Parameters<PasswordOps['authenticateWithPassword']>
  ): ReturnType<PasswordOps['authenticateWithPassword']> {
    return this.passwordOps.authenticateWithPassword(...args);
  }

  async logAuthEvent(
    userId: number | undefined,
    action: string,
    details?: string,
    ipAddress?: string
  ): Promise<void> {
    try {
      await this.writeAudit({ userId, action, details, ipAddress });
    } catch (error) {
      logger.error('Failed to log auth event:', error);
    }
  }

  // ===============================
  // OAUTH AUTHENTICATION (delegated to OAuthOps)
  // ===============================

  async authenticateWithGitHub(
    ...args: Parameters<OAuthOps['authenticateWithGitHub']>
  ): ReturnType<OAuthOps['authenticateWithGitHub']> {
    return this.oauthOps.authenticateWithGitHub(...args);
  }

  async authenticateWithOAuth(
    ...args: Parameters<OAuthOps['authenticateWithOAuth']>
  ): ReturnType<OAuthOps['authenticateWithOAuth']> {
    return this.oauthOps.authenticateWithOAuth(...args);
  }

  /**
   * Get available OAuth providers
   */
  getAvailableOAuthProviders(): string[] {
    return this.oauthOps.getAvailableOAuthProviders();
  }

  /**
   * Create a simulated user account for testing/development
   */
  async createSimulatedUser(
    ...args: Parameters<OAuthOps['createSimulatedUser']>
  ): ReturnType<OAuthOps['createSimulatedUser']> {
    return this.oauthOps.createSimulatedUser(...args);
  }

  /**
   * Authenticate with simulated account (for development/testing)
   */
  async authenticateWithSimulatedAccount(
    ...args: Parameters<OAuthOps['authenticateWithSimulatedAccount']>
  ): ReturnType<OAuthOps['authenticateWithSimulatedAccount']> {
    return this.oauthOps.authenticateWithSimulatedAccount(...args);
  }

  async logout(): Promise<void> {
    // This would typically invalidate the current session
    // For now, we'll just log the event
    await this.logAuthEvent(undefined, 'logout', 'User logged out');
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    // This would typically get the current user from the session
    // For now, return null as this is context-dependent
    return null;
  }

  // ===============================
  // EMAIL VALIDATION METHODS
  // ===============================

  /**
   * Request email change for a user
   */
  async requestEmailChange(
    userId: number,
    newEmail: string
  ): Promise<EmailValidationResult> {
    try {
      // Get current user
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Prepare email change request
      const request: EmailChangeRequest = {
        currentEmail: user.email || '',
        newEmail: newEmail.toLowerCase().trim(),
        userId,
      };

      return await this.emailValidationService.requestEmailChange(request);
    } catch (error) {
      logger.error('Email change request failed:', error);
      throw new Error('Failed to process email change request');
    }
  }

  /**
   * Complete email change with verification token
   */
  async completeEmailChange(token: string): Promise<EmailValidationResult> {
    try {
      return await this.emailValidationService.completeEmailChange(token);
    } catch (error) {
      logger.error('Email change completion failed:', error);
      throw new Error('Failed to complete email change');
    }
  }

  /**
   * Cancel pending email change
   */
  async cancelEmailChange(userId: number): Promise<EmailValidationResult> {
    try {
      return await this.emailValidationService.cancelEmailChange(userId);
    } catch (error) {
      logger.error('Email change cancellation failed:', error);
      throw new Error('Failed to cancel email change');
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
      return await this.emailValidationService.getPendingEmailChange(userId);
    } catch (error) {
      logger.error('Failed to get pending email change:', error);
      throw new Error('Failed to get pending email change');
    }
  }

  /**
   * Validate email format
   */
  isValidEmailFormat(email: string): boolean {
    return this.emailValidationService.isValidEmailFormat(email);
  }

  /**
   * Check if email is already in use
   */
  async isEmailInUse(email: string, excludeUserId?: number): Promise<boolean> {
    try {
      return await this.emailValidationService.isEmailInUse(
        email,
        excludeUserId
      );
    } catch (error) {
      logger.error('Email uniqueness check failed:', error);
      throw new Error('Failed to check email availability');
    }
  }

  /**
   * Clean up expired email verification tokens (maintenance task)
   */
  async cleanupExpiredEmailTokens(): Promise<number> {
    try {
      return await this.emailValidationService.cleanupExpiredTokens();
    } catch (error) {
      logger.error('Email token cleanup failed:', error);
      throw new Error('Failed to cleanup expired email tokens');
    }
  }

  // ===============================
  // AUTHENTICATION PROVIDER GUARDS
  // ===============================

  /**
   * Check if user can set a password (only for password-auth users)
   */
  canSetPassword(user: AuthUser): boolean {
    if (!user) return false; // Handle null user gracefully
    // Only allow password setting for password auth users or legacy users (no auth_provider)
    return user.auth_provider === 'password' || !user.auth_provider;
  }

  /**
   * Get user's authentication provider
   */
  getUserAuthProvider(user: AuthUser): string {
    if (!user) return 'unknown'; // Handle null user gracefully
    return user.auth_provider || 'password'; // Default to password for legacy users
  }

  /**
   * Check if user authenticated via external provider
   */
  isExternalAuthUser(user: AuthUser): boolean {
    if (!user) return false; // Handle null user gracefully
    const provider = this.getUserAuthProvider(user);
    return provider !== 'password';
  }

  // ===============================
  // SECURE PASSWORD MANAGEMENT (delegated to PasswordOps)
  // ===============================

  /**
   * Change user password with security guards
   */
  async changePassword(
    ...args: Parameters<PasswordOps['changePassword']>
  ): ReturnType<PasswordOps['changePassword']> {
    return this.passwordOps.changePassword(...args);
  }

  /**
   * Set password for user (admin function) with security guards
   */
  async setUserPassword(
    ...args: Parameters<PasswordOps['setUserPassword']>
  ): ReturnType<PasswordOps['setUserPassword']> {
    return this.passwordOps.setUserPassword(...args);
  }

  /**
   * Send email verification for current email address
   */
  async sendEmailVerification(
    ...args: Parameters<PasswordOps['sendEmailVerification']>
  ): ReturnType<PasswordOps['sendEmailVerification']> {
    return this.passwordOps.sendEmailVerification(...args);
  }

  /**
   * Verify current email address with token
   */
  async verifyCurrentEmail(
    ...args: Parameters<PasswordOps['verifyCurrentEmail']>
  ): ReturnType<PasswordOps['verifyCurrentEmail']> {
    return this.passwordOps.verifyCurrentEmail(...args);
  }
}
