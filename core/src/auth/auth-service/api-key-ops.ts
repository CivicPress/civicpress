import { DatabaseService } from '../../database/database-service.js';
import { Logger } from '../../utils/logger.js';
import { SecretsManager } from '../../security/secrets.js';
import type { ApiKey, AuthUser } from '../auth-service.js';
import type { AuthAuditEvent } from './user-ops.js';
import { generateSecureToken, hashToken } from './crypto.js';

export interface ApiKeyOpsDeps {
  db: DatabaseService;
  logger?: Logger;
  writeAudit: (event: AuthAuditEvent) => Promise<void>;
  /**
   * Getter (not a value) so the collaborator picks up the orchestrator's
   * `secretsManager` after `initializeSecrets` is called — the
   * AuthService constructor runs before that.
   */
  getSecretsManager: () => SecretsManager | undefined;
}

/**
 * ApiKeyOps — owns API-key lifecycle previously inlined on `AuthService`.
 *
 * Bodies are moved verbatim; `this.secretsManager` becomes
 * `this.deps.getSecretsManager()`, `this.hashToken` / `this.generateSecureToken`
 * become the module-level pure functions in `./crypto.js`.
 */
export class ApiKeyOps {
  constructor(private readonly deps: ApiKeyOpsDeps) {}

  async createApiKey(
    userId: number,
    name: string,
    expiresAt?: Date
  ): Promise<{ key: string; apiKey: ApiKey }> {
    // Generate random key
    const key = generateSecureToken();

    // Sign key if secrets manager available
    let finalKey = key;
    const secretsManager = this.deps.getSecretsManager();
    if (secretsManager) {
      const signingKey = secretsManager.getApiKeySigningKey();
      const signature = secretsManager.sign(key, signingKey);
      finalKey = `${key}.${signature}`;
    }

    // Hash for database storage (always use raw key)
    const keyHash = hashToken(key);

    await this.deps.db.createApiKey(userId, keyHash, name, expiresAt);
    const apiKeyData = await this.deps.db.getApiKeyByHash(keyHash);

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
      const secretsManager = this.deps.getSecretsManager();
      if (secretsManager && key.includes('.')) {
        const parts = key.split('.');
        if (parts.length === 2) {
          const [rawKey, signature] = parts;
          const signingKey = secretsManager.getApiKeySigningKey();

          if (secretsManager.verify(rawKey, signature, signingKey)) {
            keyToHash = rawKey;
          } else {
            // Invalid signature
            return null;
          }
        }
      }

      // Hash and lookup in database
      const keyHash = hashToken(keyToHash);
      const apiKey = await this.deps.db.getApiKeyByHash(keyHash);

      if (!apiKey) {
        return null;
      }

      // Check if API key is expired
      if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
        await this.deps.db.deleteApiKey(apiKey.id);
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
      this.deps.logger?.error('API key validation failed:', error);
      return null;
    }
  }

  async deleteApiKey(keyId: number): Promise<void> {
    await this.deps.db.deleteApiKey(keyId);
  }
}
