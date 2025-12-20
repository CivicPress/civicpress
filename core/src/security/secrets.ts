import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';

const logger = new Logger();

/**
 * Secrets Manager - Centralized secret management with HKDF key derivation
 *
 * Derives scoped keys from a single root secret using HKDF-SHA256.
 * Supports secret storage in environment variable or .system-data/secrets.yml
 */
export class SecretsManager {
  private static instance: SecretsManager;
  private rootSecret: string | null = null;
  private derivedKeys: Map<string, Buffer> = new Map();
  private secretsFilePath: string;

  private constructor(dataDir: string) {
    // .system-data is at project root, not inside dataDir
    // If dataDir is absolute like '/path/to/project/data', project root is its parent
    // If dataDir is relative like 'data', resolve from process.cwd()
    const projectRoot = path.isAbsolute(dataDir)
      ? path.dirname(dataDir)
      : path.resolve(process.cwd(), path.dirname(dataDir));
    this.secretsFilePath = path.join(
      projectRoot,
      '.system-data',
      'secrets.yml'
    );
  }

  static getInstance(dataDir: string): SecretsManager {
    if (!SecretsManager.instance) {
      SecretsManager.instance = new SecretsManager(dataDir);
    }
    return SecretsManager.instance;
  }

  /**
   * Initialize secrets manager
   * Loads secret from environment, file, or generates new one
   */
  async initialize(): Promise<void> {
    // Try environment variable first
    if (process.env.CIVICPRESS_SECRET) {
      this.rootSecret = process.env.CIVICPRESS_SECRET;
      if (!this.validateSecret(this.rootSecret)) {
        throw new Error(
          'CIVICPRESS_SECRET must be at least 64 hex characters (32 bytes)'
        );
      }
      logger.info('Loaded secret from CIVICPRESS_SECRET environment variable');
      return;
    }

    // Try loading from file
    try {
      const secretData = await this.loadSecretFromFile();
      if (secretData) {
        this.rootSecret = secretData.secret;
        logger.info('Loaded secret from file');
        return;
      }
    } catch (error) {
      // File doesn't exist or can't be read - will generate new one
    }

    // Generate new secret (development only)
    await this.generateAndSaveSecret();
  }

  /**
   * Derive a scoped key using HKDF-SHA256
   */
  deriveKey(scope: string, info?: string): Buffer {
    if (!this.rootSecret) {
      throw new Error('Secrets manager not initialized');
    }

    // Check cache
    const cacheKey = `${scope}:${info || 'default'}`;
    if (this.derivedKeys.has(cacheKey)) {
      return this.derivedKeys.get(cacheKey)!;
    }

    // Derive using HKDF
    const salt = Buffer.from('civicpress-secrets-v1', 'utf-8');
    const infoBuffer = Buffer.from(`${scope}:${info || 'default'}`, 'utf-8');

    const derivedKey = Buffer.from(
      crypto.hkdfSync(
        'sha256',
        Buffer.from(this.rootSecret, 'hex'),
        salt,
        infoBuffer,
        32 // 32 bytes = 256 bits
      )
    );

    this.derivedKeys.set(cacheKey, derivedKey);
    return derivedKey;
  }

  /**
   * Get session signing key
   */
  getSessionSigningKey(): Buffer {
    return this.deriveKey('session', 'signing');
  }

  /**
   * Get API key signing key
   */
  getApiKeySigningKey(): Buffer {
    return this.deriveKey('api_key', 'signing');
  }

  /**
   * Get token signing key (for email verification, password reset)
   */
  getTokenSigningKey(): Buffer {
    return this.deriveKey('token', 'signing');
  }

  /**
   * Get CSRF signing key
   */
  getCsrfSigningKey(): Buffer {
    return this.deriveKey('csrf', 'signing');
  }

  /**
   * Get webhook signing key
   */
  getWebhookSigningKey(): Buffer {
    return this.deriveKey('webhook', 'signing');
  }

  /**
   * Get JWT secret (as string for JWT libraries)
   */
  getJwtSecret(): string {
    return this.deriveKey('jwt', 'secret').toString('hex');
  }

  /**
   * Generate HMAC signature for data
   */
  sign(data: string, key: Buffer): string {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(data);
    return hmac.digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  verify(data: string, signature: string, key: Buffer): boolean {
    const expectedSignature = this.sign(data, key);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Load secret from file
   */
  private async loadSecretFromFile(): Promise<{
    secret: string;
    created: string;
  } | null> {
    try {
      const content = await fs.readFile(this.secretsFilePath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const yaml = await import('js-yaml');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const data = yaml.load(content) as any;

      if (data?.secret && this.validateSecret(data.secret)) {
        return {
          secret: data.secret,
          created: data.created || new Date().toISOString(),
        };
      }
    } catch (error) {
      // File doesn't exist or is invalid
    }
    return null;
  }

  /**
   * Generate and save new secret
   */
  private async generateAndSaveSecret(): Promise<void> {
    // Generate 64 bytes (512 bits) of random data
    const secretBytes = crypto.randomBytes(64);
    this.rootSecret = secretBytes.toString('hex');

    // Save to file
    try {
      const secretsDir = path.dirname(this.secretsFilePath);
      await fs.mkdir(secretsDir, { recursive: true });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const yaml = await import('js-yaml');
      const secretData = {
        secret: this.rootSecret,
        created: new Date().toISOString(),
        warning: 'DO NOT COMMIT THIS FILE - It contains sensitive secrets',
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      await fs.writeFile(
        this.secretsFilePath,
        yaml.dump(secretData),
        { mode: 0o600 } // Read/write for owner only
      );

      logger.warn(`Generated new secret and saved to ${this.secretsFilePath}`);
      logger.warn(
        '⚠️  WARNING: For production deployments, set CIVICPRESS_SECRET environment variable'
      );
      logger.warn(
        '⚠️  Rotating this secret will invalidate all sessions and tokens'
      );
    } catch (error) {
      logger.error('Failed to save secret to file:', error);
      throw new Error('Failed to initialize secrets manager');
    }
  }

  /**
   * Validate secret strength
   */
  private validateSecret(secret: string): boolean {
    // Must be hex-encoded, at least 64 characters (32 bytes)
    if (!/^[0-9a-fA-F]{64,}$/.test(secret)) {
      return false;
    }
    return true;
  }

  /**
   * Clear cached derived keys (useful for testing)
   */
  clearCache(): void {
    this.derivedKeys.clear();
  }
}
