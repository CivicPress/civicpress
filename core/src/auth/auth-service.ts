import * as crypto from 'crypto';
import { DatabaseService } from '../database/database-service.js';
import { Logger } from '../utils/logger.js';
import { OAuthProviderManager } from './oauth-provider.js';
import { RoleManager } from './role-manager.js';
import {
  EmailValidationService,
  EmailChangeRequest,
  EmailValidationResult,
} from './email-validation-service.js';
import { coreDebug } from '../utils/core-output.js';
import { SecretsManager } from '../security/secrets.js';

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

export class AuthService {
  private db: DatabaseService;
  private oauthManager: OAuthProviderManager;
  private roleManager: RoleManager;
  private emailValidationService: EmailValidationService;
  private secretsManager?: SecretsManager;

  constructor(db: DatabaseService, dataDir: string) {
    this.db = db;
    this.oauthManager = new OAuthProviderManager();
    this.roleManager = new RoleManager(dataDir);
    this.emailValidationService = new EmailValidationService(db);
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

  // API Key Authentication
  async createApiKey(
    userId: number,
    name: string,
    expiresAt?: Date
  ): Promise<{ key: string; apiKey: ApiKey }> {
    // Generate random key
    const key = this.generateSecureToken();

    // Sign key if secrets manager available
    let finalKey = key;
    if (this.secretsManager) {
      const signingKey = this.secretsManager.getApiKeySigningKey();
      const signature = this.secretsManager.sign(key, signingKey);
      finalKey = `${key}.${signature}`;
    }

    // Hash for database storage (always use raw key)
    const keyHash = this.hashToken(key);

    await this.db.createApiKey(userId, keyHash, name, expiresAt);
    const apiKeyData = await this.db.getApiKeyByHash(keyHash);

    if (!apiKeyData) {
      throw new Error('Failed to create API key');
    }

    const apiKey: ApiKey = {
      id: apiKeyData.id,
      keyHash: apiKeyData.key_hash,
      userId: apiKeyData.user_id,
      name: apiKeyData.name, // This is the API key's name from the api_keys table
      expiresAt: apiKeyData.expires_at
        ? new Date(apiKeyData.expires_at)
        : undefined,
      user: {
        id: apiKeyData.user_id,
        username: apiKeyData.username,
        role: apiKeyData.role,
        email: apiKeyData.email,
        name: apiKeyData.user_name, // This should be the user's name
        avatar_url: apiKeyData.avatar_url,
      },
    };

    return { key: finalKey, apiKey };
  }

  async validateApiKey(key: string): Promise<AuthUser | null> {
    try {
      let keyToHash = key;

      // If key is signed, verify and extract raw key
      if (this.secretsManager && key.includes('.')) {
        const parts = key.split('.');
        if (parts.length === 2) {
          const [rawKey, signature] = parts;
          const signingKey = this.secretsManager.getApiKeySigningKey();

          if (this.secretsManager.verify(rawKey, signature, signingKey)) {
            keyToHash = rawKey;
          } else {
            // Invalid signature
            return null;
          }
        }
      }

      // Hash and lookup in database
      const keyHash = this.hashToken(keyToHash);
      const apiKey = await this.db.getApiKeyByHash(keyHash);

      if (!apiKey) {
        return null;
      }

      // Check if API key is expired
      if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
        await this.db.deleteApiKey(apiKey.id);
        return null;
      }

      return {
        id: apiKey.user_id,
        username: apiKey.username,
        role: apiKey.role,
        email: apiKey.email,
        name: apiKey.name,
        avatar_url: apiKey.avatar_url,
      };
    } catch (error) {
      logger.error('API key validation failed:', error);
      return null;
    }
  }

  async deleteApiKey(keyId: number): Promise<void> {
    await this.db.deleteApiKey(keyId);
  }

  // Session Management
  async createSession(
    userId: number,
    expiresInHours: number = 24
  ): Promise<{ token: string; session: Session }> {
    // Generate random token
    const token = this.generateSecureToken();

    // Sign token if secrets manager available
    let finalToken = token;
    if (this.secretsManager) {
      const signingKey = this.secretsManager.getSessionSigningKey();
      const signature = this.secretsManager.sign(token, signingKey);
      finalToken = `${token}.${signature}`;
    }

    // Hash for database storage (always use raw token for hashing)
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    await this.db.createSession(userId, tokenHash, expiresAt);
    const sessionData = await this.db.getSessionByToken(tokenHash);

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

  async validateSession(token: string): Promise<AuthUser | null> {
    try {
      let tokenToHash = token;

      // If token is signed, verify and extract raw token
      if (this.secretsManager && token.includes('.')) {
        const parts = token.split('.');
        if (parts.length === 2) {
          const [rawToken, signature] = parts;
          const signingKey = this.secretsManager.getSessionSigningKey();

          if (this.secretsManager.verify(rawToken, signature, signingKey)) {
            tokenToHash = rawToken;
          } else {
            // Invalid signature
            return null;
          }
        }
      }

      // Hash and lookup in database (using raw token)
      const tokenHash = this.hashToken(tokenToHash);
      const session = await this.db.getSessionByToken(tokenHash);

      if (!session) {
        return null;
      }

      // Get full user data including email_verified
      const user = await this.db.getUserById(session.user_id);
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
        email_verified: user.email_verified,
      };
    } catch (error) {
      logger.error('Session validation failed:', error);
      return null;
    }
  }

  async deleteSession(sessionId: number): Promise<void> {
    await this.db.deleteSession(sessionId);
  }

  async cleanupExpiredSessions(): Promise<void> {
    await this.db.cleanupExpiredSessions();
  }

  // User Management
  async createUser(userData: {
    username: string;
    role?: string;
    email?: string;
    name?: string;
    avatar_url?: string;
    auth_provider?: string;
    email_verified?: boolean;
  }): Promise<AuthUser> {
    // Set default role if not provided
    const role = userData.role || (await this.getDefaultRole());

    const userId = await this.db.createUser({
      ...userData,
      role,
      auth_provider: userData.auth_provider || 'password', // Ensure auth_provider is passed
    });
    const user = await this.db.getUserById(userId);

    if (!user) {
      throw new Error('Failed to create user');
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      auth_provider: user.auth_provider,
      email_verified: user.email_verified,
    };
  }

  async getUserByUsername(username: string): Promise<AuthUser | null> {
    try {
      const user = await this.db.getUserByUsername(username);
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
        created_at: user.created_at ? new Date(user.created_at) : undefined,
        updated_at: user.updated_at ? new Date(user.updated_at) : undefined,
      };
    } catch (error) {
      logger.error('Failed to get user by username:', error);
      return null;
    }
  }

  async getUserById(id: number): Promise<AuthUser | null> {
    try {
      const user = await this.db.getUserById(id);
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
        created_at: user.created_at ? new Date(user.created_at) : undefined,
        updated_at: user.updated_at ? new Date(user.updated_at) : undefined,
      };
    } catch (error) {
      logger.error('Failed to get user by ID:', error);
      return null;
    }
  }

  /**
   * List all users
   */
  async listUsers(): Promise<AuthUser[]> {
    try {
      const result = await this.db.listUsers();
      return result.users.map((user: any) => ({
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        created_at: user.created_at ? new Date(user.created_at) : undefined,
        updated_at: user.updated_at ? new Date(user.updated_at) : undefined,
      }));
    } catch (error) {
      logger.error('Failed to list users:', error);
      return [];
    }
  }

  /**
   * Create user with password hash
   */
  async createUserWithPassword(userData: {
    username: string;
    role?: string;
    email?: string;
    name?: string;
    avatar_url?: string;
    passwordHash?: string;
    auth_provider?: string;
    email_verified?: boolean;
  }): Promise<AuthUser> {
    coreDebug('AuthService.createUserWithPassword called', userData, {
      operation: 'auth:createUserWithPassword',
    });

    // Set default role if not provided
    const role = userData.role || (await this.getDefaultRole());
    coreDebug(
      'Using role',
      { role },
      { operation: 'auth:createUserWithPassword' }
    );

    coreDebug('Calling this.db.createUserWithPassword', undefined, {
      operation: 'auth:createUserWithPassword',
    });
    const userId = await this.db.createUserWithPassword({
      ...userData,
      role,
    });
    coreDebug(
      'Got userId',
      { userId },
      { operation: 'auth:createUserWithPassword' }
    );

    coreDebug(
      'Calling this.db.getUserById',
      { userId },
      {
        operation: 'auth:createUserWithPassword',
      }
    );
    const user = await this.db.getUserById(userId);
    coreDebug(
      'Got user',
      { userId, userExists: !!user, username: user ? user.username : null },
      { operation: 'auth:createUserWithPassword' }
    );

    if (!user) {
      coreDebug('User is null, throwing error', undefined, {
        operation: 'auth:createUserWithPassword',
      });
      throw new Error('Failed to create user');
    }

    coreDebug(
      'Returning user',
      { username: user.username },
      {
        operation: 'auth:createUserWithPassword',
      }
    );
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      created_at: user.created_at ? new Date(user.created_at) : undefined,
      updated_at: user.updated_at ? new Date(user.updated_at) : undefined,
    };
  }

  /**
   * Update user information
   */
  async updateUser(
    userId: number,
    userData: {
      email?: string;
      name?: string;
      role?: string;
      passwordHash?: string;
      avatar_url?: string;
    }
  ): Promise<{ success: boolean; message?: string; user?: AuthUser }> {
    try {
      // Get current user to check authentication provider
      const currentUser = await this.db.getUserById(userId);
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
        email_verified: currentUser.email_verified,
        pending_email: currentUser.pending_email,
        created_at: currentUser.created_at
          ? new Date(currentUser.created_at)
          : undefined,
        updated_at: currentUser.updated_at
          ? new Date(currentUser.updated_at)
          : undefined,
      };

      // SECURITY GUARD: Prevent external auth users from setting passwords
      if (userData.passwordHash && !this.canSetPassword(authUser)) {
        const provider = this.getUserAuthProvider(authUser);
        throw new Error(
          `Users authenticated via ${provider} cannot set passwords. Password management is handled by the external authentication.`
        );
      }

      const updated = await this.db.updateUser(userId, userData);
      if (!updated) {
        throw new Error('Failed to update user');
      }

      // Get updated user data
      const user = await this.db.getUserById(userId);
      if (!user) {
        throw new Error('User not found after update');
      }

      // Log security-relevant changes
      if (userData.passwordHash) {
        await this.logAuthEvent(
          userId,
          'password_changed',
          `Password updated for user ${user.username}`
        );
      }

      return {
        success: true,
        message: 'User updated successfully',
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          email: user.email,
          name: user.name,
          avatar_url: user.avatar_url,
          auth_provider: user.auth_provider,
          email_verified: user.email_verified,
          pending_email: user.pending_email,
          created_at: user.created_at ? new Date(user.created_at) : undefined,
          updated_at: user.updated_at ? new Date(user.updated_at) : undefined,
        },
      };
    } catch (error) {
      logger.error('Failed to update user:', error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Failed to update user',
      };
    }
  }

  /**
   * Delete user
   */
  async deleteUser(userId: number): Promise<boolean> {
    try {
      const user = await this.db.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      await this.db.deleteUser(userId);
      return true;
    } catch (error) {
      logger.error('Failed to delete user:', error);
      throw error;
    }
  }

  /**
   * Authenticate with username and password
   */
  async authenticateWithPassword(
    username: string,
    password: string
  ): Promise<{ token: string; user: AuthUser; expiresAt: Date }> {
    try {
      // Get user with password hash
      const user = await this.db.getUserWithPassword(username);
      if (!user) {
        throw new Error('Invalid username or password');
      }

      // Verify password
      const bcrypt = await import('bcrypt');
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        throw new Error('Invalid username or password');
      }

      // Create session
      const { token: sessionToken, session } = await this.createSession(
        user.id
      );

      // Log authentication event
      await this.logAuthEvent(
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
      logger.error('Password authentication failed:', error);
      throw new Error('Invalid username or password');
    }
  }

  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async logAuthEvent(
    userId: number | undefined,
    action: string,
    details?: string,
    ipAddress?: string
  ): Promise<void> {
    try {
      await this.db.logAuditEvent({
        userId,
        action,
        resourceType: 'auth',
        details,
        ipAddress,
      });
    } catch (error) {
      logger.error('Failed to log auth event:', error);
    }
  }

  async authenticateWithGitHub(
    token: string
  ): Promise<{ token: string; user: AuthUser; expiresAt: Date }> {
    try {
      const githubUser = await this.oauthManager.validateToken('github', token);

      // Check if user exists, create if not
      let user = await this.getUserByUsername(githubUser.username);
      if (!user) {
        const defaultRole = await this.getDefaultRole();
        user = await this.createUser({
          username: githubUser.username,
          role: defaultRole,
          email: githubUser.email,
          name: githubUser.name,
          avatar_url: githubUser.avatar_url,
        });
      }

      // Create session
      const { token: sessionToken, session } = await this.createSession(
        user.id
      );

      // Log authentication event
      await this.logAuthEvent(
        user.id,
        'github_login',
        `GitHub login for user ${user.username}`,
        'github'
      );

      return {
        token: sessionToken,
        user,
        expiresAt: session.expiresAt,
      };
    } catch (error) {
      logger.error('GitHub authentication failed:', error);
      throw new Error('GitHub authentication failed');
    }
  }

  async authenticateWithOAuth(
    provider: string,
    token: string,
    oauthUserData?: any
  ): Promise<{
    success: boolean;
    token: string;
    user: AuthUser;
    expiresAt: Date;
  }> {
    try {
      let oauthUser: any;

      // In test mode, use provided data instead of validating token
      if (process.env.NODE_ENV === 'test' && oauthUserData) {
        oauthUser = oauthUserData;
      } else {
        oauthUser = await this.oauthManager.validateToken(provider, token);
      }

      // Check if user exists, create if not
      let user = await this.getUserByUsername(oauthUser.username);
      if (!user) {
        const defaultRole = await this.getDefaultRole();
        user = await this.createUser({
          username: oauthUser.username,
          role: defaultRole,
          email: oauthUser.email,
          name: oauthUser.name,
          avatar_url: oauthUser.avatar_url,
          auth_provider: provider, // Set the authentication provider
          email_verified: true, // OAuth emails are considered verified
        });
      } else {
        // Update existing user's information on re-authentication
        const updateData: any = {
          auth_provider: provider,
          email_verified: true,
        };

        // Update fields that might have changed
        if (oauthUser.email && oauthUser.email !== user.email) {
          updateData.email = oauthUser.email;
        }
        if (oauthUser.name && oauthUser.name !== user.name) {
          updateData.name = oauthUser.name;
        }
        if (oauthUser.avatar_url && oauthUser.avatar_url !== user.avatar_url) {
          updateData.avatar_url = oauthUser.avatar_url;
        }

        await this.db.updateUser(user.id, updateData);

        // Refresh user data
        const updatedUser = await this.db.getUserById(user.id);
        if (updatedUser) {
          user = updatedUser;
        }
      }

      // Ensure user is not null
      if (!user) {
        throw new Error('Failed to create or retrieve user');
      }

      // Create session
      const { token: sessionToken, session } = await this.createSession(
        user.id
      );

      // Log authentication event
      await this.logAuthEvent(
        user.id,
        `${provider}_login`,
        `${provider} login for user ${user.username}`,
        provider
      );

      return {
        success: true,
        token: sessionToken,
        user,
        expiresAt: session.expiresAt,
      };
    } catch (error) {
      logger.error(`${provider} authentication failed:`, error);
      throw new Error(`${provider} authentication failed`);
    }
  }

  /**
   * Get available OAuth providers
   */
  getAvailableOAuthProviders(): string[] {
    return this.oauthManager.getAvailableProviders();
  }

  /**
   * Create a simulated user account for testing/development
   */
  async createSimulatedUser(userData: {
    username: string;
    role: string;
    email?: string;
    name?: string;
    avatar_url?: string;
  }): Promise<AuthUser> {
    // Check if user already exists
    const existingUser = await this.getUserByUsername(userData.username);
    if (existingUser) {
      // Update existing user's role if it's different
      if (existingUser.role !== userData.role) {
        logger.info(
          `Updating existing user ${userData.username} role from ${existingUser.role} to ${userData.role}`
        );
        const updateResult = await this.updateUser(existingUser.id, {
          role: userData.role,
        });
        if (!updateResult.success || !updateResult.user) {
          throw new Error(`Failed to update user ${userData.username} role`);
        }
        return updateResult.user;
      }
      return existingUser;
    }

    // Validate role
    if (!(await this.isValidRole(userData.role))) {
      throw new Error(`Invalid role: ${userData.role}`);
    }

    // Create user
    const user = await this.createUser({
      username: userData.username,
      role: userData.role,
      email: userData.email,
      name: userData.name,
      avatar_url: userData.avatar_url,
    });

    // Log the creation
    await this.logAuthEvent(
      user.id,
      'simulated_user_created',
      `Simulated user created: ${user.username} with role ${user.role}`,
      'simulated'
    );

    return user;
  }

  /**
   * Authenticate with simulated account (for development/testing)
   */
  async authenticateWithSimulatedAccount(
    username: string,
    role: string = 'public'
  ): Promise<{ token: string; user: AuthUser; expiresAt: Date }> {
    try {
      // Create or get simulated user
      const user = await this.createSimulatedUser({
        username,
        role,
        name: username,
        email: `${username}@simulated.local`,
        avatar_url: `https://avatars.githubusercontent.com/u/${Math.floor(Math.random() * 1000000)}?v=4`,
      });

      // Create session
      const { token: sessionToken, session } = await this.createSession(
        user.id
      );

      // Log authentication event
      await this.logAuthEvent(
        user.id,
        'simulated_login',
        `Simulated login for user ${user.username}`,
        'simulated'
      );

      return {
        token: sessionToken,
        user,
        expiresAt: session.expiresAt,
      };
    } catch (error) {
      logger.error('Simulated authentication failed:', error);
      throw new Error('Simulated authentication failed');
    }
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
  // SECURE PASSWORD MANAGEMENT
  // ===============================

  /**
   * Change user password with security guards
   */
  async changePassword(
    userId: number,
    newPassword: string,
    currentPassword?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get current user to check authentication provider
      const currentUser = await this.db.getUserById(userId);
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
        email_verified: currentUser.email_verified,
        pending_email: currentUser.pending_email,
        created_at: currentUser.created_at
          ? new Date(currentUser.created_at)
          : undefined,
        updated_at: currentUser.updated_at
          ? new Date(currentUser.updated_at)
          : undefined,
      };

      // SECURITY GUARD: Prevent external auth users from setting passwords
      if (!this.canSetPassword(authUser)) {
        const provider = this.getUserAuthProvider(authUser);
        return {
          success: false,
          message: `Users authenticated via ${provider} cannot change passwords. Password management is handled by the external authentication.`,
        };
      }

      // Verify current password if provided (for password changes by the user themselves)
      if (currentPassword) {
        const userWithPassword = await this.db.getUserWithPassword(
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

      // Update password
      const updated = await this.db.updateUser(userId, { passwordHash });
      if (!updated) {
        return {
          success: false,
          message: 'Failed to update password',
        };
      }

      // Log security event
      await this.logAuthEvent(
        userId,
        'password_changed',
        `Password changed for user ${currentUser.username}`
      );

      logger.info(
        `Password changed for user ${currentUser.username} (ID: ${userId})`
      );

      return {
        success: true,
        message: 'Password successfully changed',
      };
    } catch (error) {
      logger.error('Password change failed:', error);
      throw new Error('Failed to change password');
    }
  }

  /**
   * Set password for user (admin function) with security guards
   */
  async setUserPassword(
    userId: number,
    newPassword: string,
    adminUserId: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get target user to check authentication provider
      const targetUser = await this.db.getUserById(userId);
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
        email_verified: targetUser.email_verified,
        pending_email: targetUser.pending_email,
        created_at: targetUser.created_at
          ? new Date(targetUser.created_at)
          : undefined,
        updated_at: targetUser.updated_at
          ? new Date(targetUser.updated_at)
          : undefined,
      };

      // SECURITY GUARD: Prevent external auth users from having passwords set
      if (!this.canSetPassword(authUser)) {
        const provider = this.getUserAuthProvider(authUser);
        return {
          success: false,
          message: `Cannot set password for users authenticated via ${provider}. Password management is handled by the external authentication.`,
        };
      }

      // Hash new password
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(newPassword, 12);

      // Update password
      const updated = await this.db.updateUser(userId, { passwordHash });
      if (!updated) {
        return {
          success: false,
          message: 'Failed to set password',
        };
      }

      // Log security event
      await this.logAuthEvent(
        adminUserId,
        'admin_password_set',
        `Password set for user ${targetUser.username} by admin`
      );

      logger.info(
        `Password set for user ${targetUser.username} (ID: ${userId}) by admin (ID: ${adminUserId})`
      );

      return {
        success: true,
        message: 'Password set successfully',
      };
    } catch (error) {
      logger.error('Password set failed:', error);
      throw new Error('Failed to set password');
    }
  }

  /**
   * Send email verification for current email address
   */
  async sendEmailVerification(userId: number): Promise<{
    success: boolean;
    message: string;
    requiresVerification?: boolean;
  }> {
    try {
      return await this.emailValidationService.sendEmailVerification(userId);
    } catch (error) {
      logger.error('Failed to send email verification:', error);
      throw new Error('Failed to send email verification');
    }
  }

  /**
   * Verify current email address with token
   */
  async verifyCurrentEmail(token: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      return await this.emailValidationService.verifyCurrentEmail(token);
    } catch (error) {
      logger.error('Failed to verify current email:', error);
      throw new Error('Failed to verify current email');
    }
  }
}
