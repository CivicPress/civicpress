import { DatabaseService } from '../../database/database-service.js';
import { Logger } from '../../utils/logger.js';
import { OAuthProviderManager, type OAuthUser } from '../oauth-provider.js';
import type { AuthUser, Session } from '../auth-service.js';
import type { AuthAuditEvent } from './user-ops.js';
import {
  isSimulatedAuthEnabled,
  SIMULATED_AUTH_DISABLED_MESSAGE,
} from '../simulated-auth-policy.js';

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
    provider_user_id?: string;
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

      // Match by STABLE PROVIDER IDENTITY, never by username alone:
      // provider usernames are attacker-choosable (register a victim's
      // username at the provider → the old code silently linked the local
      // account and overwrote its email), provider user ids are not.
      const providerUserId =
        oauthUser.providerUserId || oauthUser.id
          ? String(oauthUser.providerUserId || oauthUser.id)
          : undefined;

      let matchedId: number | undefined = providerUserId
        ? (await this.deps.db.getUserByProvider(provider, providerUserId))?.id
        : undefined;

      if (matchedId === undefined) {
        const byUsername = await this.deps.db.getUserByUsername(
          oauthUser.username
        );
        if (
          byUsername &&
          byUsername.auth_provider === provider &&
          !byUsername.provider_user_id
        ) {
          // Legacy adoption: an account this provider created BEFORE
          // provider_user_id existed — bind the identity below. Anything
          // else holding this username (a local/password account, another
          // provider's, or a same-provider account bound to a DIFFERENT
          // identity) must NOT be linked.
          matchedId = byUsername.id;
        } else {
          // Create a fresh account; de-conflict the username when a
          // non-linkable account already holds it.
          let username = oauthUser.username;
          if (byUsername) {
            username = `${oauthUser.username}-${provider}`;
            for (
              let i = 2;
              (await this.deps.db.getUserByUsername(username)) && i < 50;
              i++
            ) {
              username = `${oauthUser.username}-${provider}-${i}`;
            }
          }
          const defaultRole = await this.deps.getDefaultRole();
          const created = await this.deps.createUser({
            username,
            role: defaultRole,
            email: oauthUser.email,
            name: oauthUser.name,
            avatar_url: oauthUser.avatar_url,
            auth_provider: provider, // Set the authentication provider
            provider_user_id: providerUserId,
            email_verified: true, // OAuth emails are considered verified
          });
          matchedId = created.id;
        }
      }

      // Update the matched account on re-authentication and bind the
      // provider identity for fresh creates / legacy adoptees.
      const updateData: Parameters<DatabaseService['updateUser']>[1] = {
        auth_provider: provider,
        email_verified: true,
      };
      if (providerUserId) {
        updateData.provider_user_id = providerUserId;
      }
      const current = await this.deps.db.getUserById(matchedId);
      if (oauthUser.email && oauthUser.email !== current?.email) {
        updateData.email = oauthUser.email;
      }
      if (oauthUser.name && oauthUser.name !== current?.name) {
        updateData.name = oauthUser.name;
      }
      if (
        oauthUser.avatar_url &&
        oauthUser.avatar_url !== current?.avatar_url
      ) {
        updateData.avatar_url = oauthUser.avatar_url;
      }
      await this.deps.db.updateUser(matchedId, updateData);

      const updatedUser = await this.deps.db.getUserById(matchedId);
      const user: AuthUser | null = updatedUser
        ? {
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
          }
        : null;

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
    // FA-API-001 backstop: refuse passwordless auth outside dev/test even if a
    // caller forgets to gate its own entry point. Thrown before the try so it is
    // not swallowed into the generic "Simulated authentication failed" message.
    if (!isSimulatedAuthEnabled()) {
      throw new Error(SIMULATED_AUTH_DISABLED_MESSAGE);
    }
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
