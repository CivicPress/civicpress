import { DatabaseService } from '../../database/database-service.js';
import { Logger } from '../../utils/logger.js';
import { OAuthProviderManager, type OAuthUser } from '../oauth-provider.js';
import type { AuthUser, Session } from '../auth-service.js';
import type { AuthAuditEvent } from './user-ops.js';

export interface OAuthOpsDeps {
  db: DatabaseService;
  oauthManager: OAuthProviderManager;
  logger?: Logger;
  writeAudit: (event: AuthAuditEvent) => Promise<void>;
  /** Audit-event helper (try/catch wrapper around writeAudit). */
  logAuthEvent: (
    userId: number | undefined,
    action: string,
    details?: string,
    ipAddress?: string
  ) => Promise<void>;
  /** UserOps relays — bound to orchestrator's collaborators. */
  getUserByUsername: (username: string) => Promise<AuthUser | null>;
  createUser: (userData: {
    username: string;
    role?: string;
    email?: string;
    name?: string;
    avatar_url?: string;
    auth_provider?: string;
    email_verified?: boolean;
  }) => Promise<AuthUser>;
  updateUser: (
    userId: number,
    userData: {
      email?: string;
      name?: string;
      role?: string;
      passwordHash?: string;
      avatar_url?: string;
    }
  ) => Promise<{ success: boolean; message?: string; user?: AuthUser }>;
  /** SessionOps relay. */
  createSession: (
    userId: number,
    expiresInHours?: number
  ) => Promise<{ token: string; session: Session }>;
  /** RoleManager relays. */
  getDefaultRole: () => Promise<string>;
  isValidRole: (role: string) => Promise<boolean>;
}

/**
 * OAuthOps — owns OAuth + simulated authentication previously inlined on
 * `AuthService`. Bodies moved verbatim; `this.db` becomes `this.deps.db`,
 * cross-collaborator calls (e.g. `this.createSession`, `this.getUserByUsername`)
 * route through `this.deps.*` so the orchestrator remains the single source of
 * truth for those operations.
 */
export class OAuthOps {
  constructor(private readonly deps: OAuthOpsDeps) {}

  async authenticateWithGitHub(
    token: string
  ): Promise<{ token: string; user: AuthUser; expiresAt: Date }> {
    try {
      const githubUser = await this.deps.oauthManager.validateToken(
        'github',
        token
      );

      // Check if user exists, create if not
      let user = await this.deps.getUserByUsername(githubUser.username);
      if (!user) {
        const defaultRole = await this.deps.getDefaultRole();
        user = await this.deps.createUser({
          username: githubUser.username,
          role: defaultRole,
          email: githubUser.email,
          name: githubUser.name,
          avatar_url: githubUser.avatar_url,
        });
      }

      // Create session
      const { token: sessionToken, session } = await this.deps.createSession(
        user.id
      );

      // Log authentication event
      await this.deps.logAuthEvent(
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
      this.deps.logger?.error('GitHub authentication failed:', error);
      throw new Error('GitHub authentication failed');
    }
  }

  async authenticateWithOAuth(
    provider: string,
    token: string,
    oauthUserData?: OAuthUser
  ): Promise<{
    success: boolean;
    token: string;
    user: AuthUser;
    expiresAt: Date;
  }> {
    try {
      let oauthUser: OAuthUser;

      // In test mode, use provided data instead of validating token
      if (process.env.NODE_ENV === 'test' && oauthUserData) {
        oauthUser = oauthUserData;
      } else {
        oauthUser = await this.deps.oauthManager.validateToken(provider, token);
      }

      // Check if user exists, create if not
      let user = await this.deps.getUserByUsername(oauthUser.username);
      if (!user) {
        const defaultRole = await this.deps.getDefaultRole();
        user = await this.deps.createUser({
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
        const updateData: Parameters<DatabaseService['updateUser']>[1] = {
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

        await this.deps.db.updateUser(user.id, updateData);

        // Refresh user data
        const updatedUser = await this.deps.db.getUserById(user.id);
        if (updatedUser) {
          user = {
            id: updatedUser.id,
            username: updatedUser.username,
            role: updatedUser.role,
            email: updatedUser.email,
            name: updatedUser.name,
            avatar_url: updatedUser.avatar_url,
            auth_provider: updatedUser.auth_provider,
            email_verified: !!updatedUser.email_verified,
            pending_email: updatedUser.pending_email,
            created_at: updatedUser.created_at
              ? new Date(updatedUser.created_at)
              : undefined,
            updated_at: updatedUser.updated_at
              ? new Date(updatedUser.updated_at)
              : undefined,
          };
        }
      }

      // Ensure user is not null
      if (!user) {
        throw new Error('Failed to create or retrieve user');
      }

      // Create session
      const { token: sessionToken, session } = await this.deps.createSession(
        user.id
      );

      // Log authentication event
      await this.deps.logAuthEvent(
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
      this.deps.logger?.error(`${provider} authentication failed:`, error);
      throw new Error(`${provider} authentication failed`);
    }
  }

  getAvailableOAuthProviders(): string[] {
    return this.deps.oauthManager.getAvailableProviders();
  }

  async createSimulatedUser(userData: {
    username: string;
    role: string;
    email?: string;
    name?: string;
    avatar_url?: string;
  }): Promise<AuthUser> {
    // Check if user already exists
    const existingUser = await this.deps.getUserByUsername(userData.username);
    if (existingUser) {
      // Update existing user's role if it's different
      if (existingUser.role !== userData.role) {
        this.deps.logger?.info(
          `Updating existing user ${userData.username} role from ${existingUser.role} to ${userData.role}`
        );
        const updateResult = await this.deps.updateUser(existingUser.id, {
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
    if (!(await this.deps.isValidRole(userData.role))) {
      throw new Error(`Invalid role: ${userData.role}`);
    }

    // Create user
    const user = await this.deps.createUser({
      username: userData.username,
      role: userData.role,
      email: userData.email,
      name: userData.name,
      avatar_url: userData.avatar_url,
    });

    // Log the creation
    await this.deps.logAuthEvent(
      user.id,
      'simulated_user_created',
      `Simulated user created: ${user.username} with role ${user.role}`,
      'simulated'
    );

    return user;
  }

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
      const { token: sessionToken, session } = await this.deps.createSession(
        user.id
      );

      // Log authentication event
      await this.deps.logAuthEvent(
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
      this.deps.logger?.error('Simulated authentication failed:', error);
      throw new Error('Simulated authentication failed');
    }
  }
}
