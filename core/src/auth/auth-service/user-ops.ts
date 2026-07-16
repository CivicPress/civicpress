import { DatabaseService } from '../../database/database-service.js';
import { Logger } from '../../utils/logger.js';
import { coreDebug } from '../../utils/core-output.js';
import type { AuthUser } from '../auth-service.js';

/**
 * Audit event shape used by the AuthService collaborators. Mirrors the
 * argument shape of `AuthService.writeAudit` so we can pass it straight
 * through.
 */
export interface AuthAuditEvent {
  userId: number | undefined;
  action: string;
  details?: string;
  ipAddress?: string;
}

export interface UserOpsDeps {
  db: DatabaseService;
  logger?: Logger;
  writeAudit: (event: AuthAuditEvent) => Promise<void>;
  /** Resolve default role from the role manager. */
  getDefaultRole: () => Promise<string>;
  /** Guard: only password-auth users may have a passwordHash set. */
  canSetPassword: (user: AuthUser) => boolean;
  /** Companion to canSetPassword — used to build the rejection message. */
  getUserAuthProvider: (user: AuthUser) => string;
  /** Audit-event helper that wraps writeAudit with try/catch. */
  logAuthEvent: (
    userId: number | undefined,
    action: string,
    details?: string,
    ipAddress?: string
  ) => Promise<void>;
}

/**
 * UserOps — owns user CRUD operations previously inlined on `AuthService`.
 *
 * Method bodies are moved verbatim from the original file; `this.db` becomes
 * `this.deps.db`, `this.logger` becomes `this.deps.logger`, and audit calls
 * route through `this.deps.writeAudit` / `this.deps.logAuthEvent` so the
 * AuthService orchestrator retains a single audit choke-point.
 */
export class UserOps {
  constructor(private readonly deps: UserOpsDeps) {}

  async createUser(userData: {
    username: string;
    role?: string;
    email?: string;
    name?: string;
    avatar_url?: string;
    auth_provider?: string;
    provider_user_id?: string;
    email_verified?: boolean;
  }): Promise<AuthUser> {
    // Set default role if not provided
    const role = userData.role || (await this.deps.getDefaultRole());

    const userId = await this.deps.db.createUser({
      ...userData,
      role,
      auth_provider: userData.auth_provider || 'password', // Ensure auth_provider is passed
    });
    const user = await this.deps.db.getUserById(userId);

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
      email_verified: !!user.email_verified,
    };
  }

  async getUserByUsername(username: string): Promise<AuthUser | null> {
    try {
      const user = await this.deps.db.getUserByUsername(username);
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
      this.deps.logger?.error('Failed to get user by username:', error);
      return null;
    }
  }

  async getUserById(id: number): Promise<AuthUser | null> {
    try {
      const user = await this.deps.db.getUserById(id);
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
        // auth_provider / email_verified / pending_email were previously
        // dropped here — AuthUser declares them, so a consumer reading the
        // provider off getUserById() saw undefined (e.g. an OAuth-takeover
        // guard would misjudge the account type).
        auth_provider: user.auth_provider,
        email_verified: !!user.email_verified,
        pending_email: user.pending_email,
        created_at: user.created_at ? new Date(user.created_at) : undefined,
        updated_at: user.updated_at ? new Date(user.updated_at) : undefined,
      };
    } catch (error) {
      this.deps.logger?.error('Failed to get user by ID:', error);
      return null;
    }
  }

  async listUsers(): Promise<AuthUser[]> {
    try {
      const result = await this.deps.db.listUsers();
      return result.users.map((user) => ({
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
      this.deps.logger?.error('Failed to list users:', error);
      return [];
    }
  }

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
    const role = userData.role || (await this.deps.getDefaultRole());
    coreDebug(
      'Using role',
      { role },
      { operation: 'auth:createUserWithPassword' }
    );

    coreDebug('Calling this.db.createUserWithPassword', undefined, {
      operation: 'auth:createUserWithPassword',
    });
    const userId = await this.deps.db.createUserWithPassword({
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
    const user = await this.deps.db.getUserById(userId);
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
      if (userData.passwordHash && !this.deps.canSetPassword(authUser)) {
        const provider = this.deps.getUserAuthProvider(authUser);
        throw new Error(
          `Users authenticated via ${provider} cannot set passwords. Password management is handled by the external authentication.`
        );
      }

      const updated = await this.deps.db.updateUser(userId, userData);
      if (!updated) {
        throw new Error('Failed to update user');
      }

      // Get updated user data
      const user = await this.deps.db.getUserById(userId);
      if (!user) {
        throw new Error('User not found after update');
      }

      // Log security-relevant changes
      if (userData.passwordHash) {
        await this.deps.logAuthEvent(
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
          email_verified: !!user.email_verified,
          pending_email: user.pending_email,
          created_at: user.created_at ? new Date(user.created_at) : undefined,
          updated_at: user.updated_at ? new Date(user.updated_at) : undefined,
        },
      };
    } catch (error) {
      this.deps.logger?.error('Failed to update user:', error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Failed to update user',
      };
    }
  }

  async deleteUser(userId: number): Promise<boolean> {
    try {
      const user = await this.deps.db.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      await this.deps.db.deleteUser(userId);
      return true;
    } catch (error) {
      this.deps.logger?.error('Failed to delete user:', error);
      throw error;
    }
  }
}
