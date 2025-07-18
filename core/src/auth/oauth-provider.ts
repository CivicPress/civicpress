import { Logger } from '../utils/logger.js';

const logger = new Logger();

export interface OAuthUser {
  id: string;
  username: string;
  email?: string;
  name?: string;
  avatar_url?: string;
  provider: string;
  providerUserId: string;
}

export interface OAuthProvider {
  name: string;
  validateToken(token: string): Promise<OAuthUser>;
  getUserInfo(token: string): Promise<OAuthUser>;
}

// Import Octokit dynamically to avoid the problematic @octokit/app subpackage
let Octokit: any = null;

async function getOctokit() {
  if (Octokit) return Octokit;

  try {
    // Import the main Octokit package directly
    const { Octokit: OctokitClass } = await import('octokit');
    Octokit = OctokitClass;
    return Octokit;
  } catch (error) {
    logger.warn(
      'Failed to load Octokit, GitHub OAuth will be disabled:',
      error
    );
    return null;
  }
}

export class GitHubOAuthProvider implements OAuthProvider {
  name = 'github';

  async validateToken(token: string): Promise<OAuthUser> {
    const OctokitClass = await getOctokit();
    if (!OctokitClass) {
      throw new Error(
        'GitHub OAuth is not available - Octokit dependency is missing'
      );
    }

    try {
      const octokit = new OctokitClass({ auth: token });

      // Test the token by making a request to the GitHub API
      const { data: user } = await octokit.rest.users.getAuthenticated();

      return {
        id: user.id.toString(),
        username: user.login,
        email: user.email || undefined,
        name: user.name || user.login,
        avatar_url: user.avatar_url,
        provider: this.name,
        providerUserId: user.id.toString(),
      };
    } catch (error) {
      logger.error('GitHub token validation failed:', error);
      throw new Error('Invalid GitHub token');
    }
  }

  async getUserInfo(token: string): Promise<OAuthUser> {
    // For GitHub, getUserInfo is the same as validateToken
    // since the GitHub API provides user info with token validation
    return this.validateToken(token);
  }
}

export class OAuthProviderManager {
  private providers: Map<string, OAuthProvider> = new Map();

  constructor() {
    // Register default providers
    this.registerProvider(new GitHubOAuthProvider());
  }

  registerProvider(provider: OAuthProvider): void {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: string): OAuthProvider | undefined {
    return this.providers.get(name);
  }

  async validateToken(providerName: string, token: string): Promise<OAuthUser> {
    const provider = this.getProvider(providerName);
    if (!provider) {
      throw new Error(`OAuth provider '${providerName}' not found`);
    }

    return provider.validateToken(token);
  }

  async getUserInfo(providerName: string, token: string): Promise<OAuthUser> {
    const provider = this.getProvider(providerName);
    if (!provider) {
      throw new Error(`OAuth provider '${providerName}' not found`);
    }

    return provider.getUserInfo(token);
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}
