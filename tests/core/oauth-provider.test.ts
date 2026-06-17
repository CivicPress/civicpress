import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GitHubOAuthProvider,
  OAuthProviderManager,
  type OctokitLoader,
  type OctokitUser,
} from '../../core/src/auth/oauth-provider';

// Canonical authenticated-user payload the fake GitHub API returns.
const githubUser: OctokitUser = {
  id: 123456,
  login: 'testuser',
  email: 'test@example.com',
  name: 'Test User',
  avatar_url: 'https://avatars.githubusercontent.com/u/123456?v=4',
};

// Build an OctokitLoader whose `rest.users.getAuthenticated` behaves as the
// supplied spy dictates. This is injected into the provider/manager so no real
// network call and no module-path-sensitive `vi.mock('octokit')` is needed.
function loaderFor(
  getAuthenticated: () => Promise<{ data: OctokitUser }>
): OctokitLoader {
  return async () =>
    class {
      rest = { users: { getAuthenticated } };
    } as unknown as Awaited<ReturnType<OctokitLoader>>;
}

const okLoader = () =>
  loaderFor(vi.fn().mockResolvedValue({ data: { ...githubUser } }));

describe('OAuth Provider', () => {
  let provider: GitHubOAuthProvider;
  let manager: OAuthProviderManager;

  beforeEach(() => {
    provider = new GitHubOAuthProvider(okLoader());
    manager = new OAuthProviderManager(okLoader());
  });

  describe('GitHubOAuthProvider', () => {
    it('should validate GitHub token and return user info', async () => {
      const token = 'ghp_test123456789';
      const user = await provider.validateToken(token);

      expect(user).toEqual({
        id: '123456',
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: 'https://avatars.githubusercontent.com/u/123456?v=4',
        provider: 'github',
        providerUserId: '123456',
      });
    });

    it('should throw error for invalid token', async () => {
      const failing = new GitHubOAuthProvider(
        loaderFor(vi.fn().mockRejectedValue(new Error('Bad credentials')))
      );

      await expect(failing.validateToken('invalid_token')).rejects.toThrow(
        'Invalid GitHub token'
      );
    });

    it('should handle missing email gracefully', async () => {
      const noEmail = new GitHubOAuthProvider(
        loaderFor(
          vi.fn().mockResolvedValue({ data: { ...githubUser, email: null } })
        )
      );

      const user = await noEmail.validateToken('ghp_test123456789');
      expect(user.email).toBeUndefined();
    });

    it('should throw when Octokit is unavailable', async () => {
      const unavailable = new GitHubOAuthProvider(async () => null);

      await expect(
        unavailable.validateToken('ghp_test123456789')
      ).rejects.toThrow('GitHub OAuth is not available');
    });
  });

  describe('OAuthProviderManager', () => {
    it('should register and retrieve providers', () => {
      const customProvider = {
        name: 'custom',
        validateToken: vi.fn(),
        getUserInfo: vi.fn(),
      };

      manager.registerProvider(customProvider);

      expect(manager.getProvider('custom')).toBe(customProvider);
      expect(manager.getAvailableProviders()).toContain('github');
      expect(manager.getAvailableProviders()).toContain('custom');
    });

    it('should validate tokens through registered providers', async () => {
      const token = 'ghp_test123456789';
      const user = await manager.validateToken('github', token);

      expect(user.provider).toBe('github');
      expect(user.username).toBe('testuser');
    });

    it('should throw error for unknown provider', async () => {
      const token = 'test_token';

      await expect(manager.validateToken('unknown', token)).rejects.toThrow(
        "OAuth provider 'unknown' not found"
      );
    });

    it('should get user info through registered providers', async () => {
      const token = 'ghp_test123456789';
      const user = await manager.getUserInfo('github', token);

      expect(user.provider).toBe('github');
      expect(user.username).toBe('testuser');
    });
  });
});
