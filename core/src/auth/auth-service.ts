import * as crypto from 'crypto';
import { DatabaseService } from '../database/database-service.js';
import { Logger } from '../utils/logger.js';
import { OAuthProviderManager } from './oauth-provider.js';
import { RoleManager } from './role-manager.js';

const logger = new Logger();

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  email?: string;
  name?: string;
  avatar_url?: string;
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

  constructor(db: DatabaseService, dataDir: string) {
    this.db = db;
    this.oauthManager = new OAuthProviderManager();
    this.roleManager = new RoleManager(dataDir);
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
    return this.roleManager.getDefaultRole();
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
    // Generate a secure API key
    const key = this.generateSecureToken();
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

    return { key, apiKey };
  }

  async validateApiKey(key: string): Promise<AuthUser | null> {
    try {
      const keyHash = this.hashToken(key);
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
    const token = this.generateSecureToken();
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

    return { token, session };
  }

  async validateSession(token: string): Promise<AuthUser | null> {
    try {
      const tokenHash = this.hashToken(token);
      const session = await this.db.getSessionByToken(tokenHash);

      if (!session) {
        return null;
      }

      return {
        id: session.user_id,
        username: session.username,
        role: session.role,
        email: session.email,
        name: session.name,
        avatar_url: session.avatar_url,
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
  }): Promise<AuthUser> {
    // Set default role if not provided
    const role = userData.role || (await this.getDefaultRole());

    const userId = await this.db.createUser({
      ...userData,
      role,
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
  }): Promise<AuthUser> {
    // Set default role if not provided
    const role = userData.role || (await this.getDefaultRole());

    const userId = await this.db.createUserWithPassword({
      ...userData,
      role,
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
  ): Promise<AuthUser | null> {
    try {
      const updated = await this.db.updateUser(userId, userData);
      if (!updated) {
        throw new Error('User not found');
      }

      const user = await this.db.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      return {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
      };
    } catch (error) {
      logger.error('Failed to update user:', error);
      throw error;
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
    token: string
  ): Promise<{ token: string; user: AuthUser; expiresAt: Date }> {
    try {
      const oauthUser = await this.oauthManager.validateToken(provider, token);

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
        });
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
}
