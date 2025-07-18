import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GitHubOAuthProvider,
  OAuthProviderManager,
} from '../../core/src/auth/oauth-provider';

// Mock Octokit
vi.mock('octokit', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    rest: {
      users: {
        getAuthenticated: vi.fn().mockResolvedValue({
          data: {
            id: 123456,
            login: 'testuser',
            email: 'test@example.com',
            name: 'Test User',
            avatar_url: 'https://avatars.githubusercontent.com/u/123456?v=4',
          },
        }),
      },
    },
  })),
}));

describe('OAuth Provider', () => {
  let provider: GitHubOAuthProvider;
  let manager: OAuthProviderManager;

  beforeEach(() => {
    provider = new GitHubOAuthProvider();
    manager = new OAuthProviderManager();
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
      const { Octokit } = await import('octokit');
      const mockOctokit = Octokit as any;

      // Mock error response
      mockOctokit.mockImplementation(() => ({
        rest: {
          users: {
            getAuthenticated: vi
              .fn()
              .mockRejectedValue(new Error('Invalid token')),
          },
        },
      }));

      const token = 'invalid_token';

      await expect(provider.validateToken(token)).rejects.toThrow(
        'Invalid GitHub token'
      );
    });

    it('should handle missing email gracefully', async () => {
      const { Octokit } = await import('octokit');
      const mockOctokit = Octokit as any;

      // Mock response with null email
      mockOctokit.mockImplementation(() => ({
        rest: {
          users: {
            getAuthenticated: vi.fn().mockResolvedValue({
              data: {
                id: 123456,
                login: 'testuser',
                email: null,
                name: 'Test User',
                avatar_url:
                  'https://avatars.githubusercontent.com/u/123456?v=4',
              },
            }),
          },
        },
      }));

      const token = 'ghp_test123456789';
      const user = await provider.validateToken(token);

      expect(user.email).toBeUndefined();
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
