import * as crypto from 'crypto';
import { DatabaseService } from '../database/database-service.js';
import { Logger } from '../utils/logger.js';

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

  constructor(db: DatabaseService) {
    this.db = db;
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
    role: string;
    email?: string;
    name?: string;
    avatar_url?: string;
  }): Promise<AuthUser> {
    const userId = await this.db.createUser(userData);
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
  }

  async getUserById(id: number): Promise<AuthUser | null> {
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
  }

  // Utility methods
  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Audit logging
  async logAuthEvent(
    userId: number | undefined,
    action: string,
    details?: string,
    ipAddress?: string
  ): Promise<void> {
    await this.db.logAuditEvent({
      userId,
      action,
      resourceType: 'auth',
      details,
      ipAddress,
    });
  }

  // GitHub OAuth Authentication
  async authenticateWithGitHub(
    _token: string // TODO: Implement actual GitHub token validation
  ): Promise<{ token: string; user: AuthUser; expiresAt: Date }> {
    try {
      // For now, we'll create a mock user from the token
      // In a real implementation, this would validate the token with GitHub API
      const mockUser = await this.createUser({
        username: `github-${Date.now()}`,
        role: 'clerk',
        email: 'user@example.com',
        name: 'GitHub User',
      });

      const session = await this.createSession(mockUser.id, 24);

      return {
        token: session.token,
        user: session.session.user,
        expiresAt: session.session.expiresAt,
      };
    } catch (error) {
      logger.error('GitHub authentication failed:', error);
      throw new Error('GitHub authentication failed');
    }
  }

  // Logout functionality
  async logout(): Promise<void> {
    // In a real implementation, this would invalidate the current session
    // For now, we'll just log the event
    await this.logAuthEvent(undefined, 'logout', 'User logged out');
  }

  // Get current user (placeholder for session management)
  async getCurrentUser(): Promise<AuthUser | null> {
    // In a real implementation, this would check the current session
    // For now, return null to indicate no authenticated user
    return null;
  }
}
