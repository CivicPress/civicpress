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
   * Validate a role exists
   * @param role - The role to validate
   * @returns boolean indicating if the role exists
   */
  async isValidRole(role: string): Promise<boolean> {
    return this.roleManager.isValidRole(role);
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
      name: apiKeyData.name,
      expiresAt: apiKeyData.expires_at
        ? new Date(apiKeyData.expires_at)
        : undefined,
      user: {
        id: apiKeyData.user_id,
        username: apiKeyData.username,
        role: apiKeyData.role,
        email: apiKeyData.email,
        name: apiKeyData.name,
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
      };
    } catch (error) {
      logger.error('Failed to get user by ID:', error);
      return null;
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

  getAvailableOAuthProviders(): string[] {
    return this.oauthManager.getAvailableProviders();
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
