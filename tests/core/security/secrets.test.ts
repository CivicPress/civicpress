import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  SecretsManager,
  isSecretAutoGenerationAllowed,
} from '@civicpress/core';

describe('SecretsManager', () => {
  let tempDir: string;
  let secretsManager: SecretsManager;
  const testSecret = 'a'.repeat(128);

  // `dataDir`, not the instance root. `resolveSystemDataDir` derives the root by
  // taking `dirname(dataDir)`, so passing a bare temp directory here made the
  // root `/tmp` and every auto-generated secret in this file landed in a SHARED
  // `/tmp/.system-data/secrets.yml` — outside the temp dir the test cleans up,
  // and shared with every other test run on the machine. Pointing at
  // `<tempDir>/data` puts it in `<tempDir>/.system-data`, inside what afterEach
  // removes.
  let dataDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'civicpress-secrets-test-')
    );
    dataDir = path.join(tempDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    SecretsManager.resetInstance();
    delete process.env.CIVICPRESS_SECRET;
  });

  // FA-CORE-002: auto-generating the root secret is a dev/test convenience.
  // In production (or an unset NODE_ENV) it must be an explicit opt-in, else a
  // silent disk-only secret is minted that is lost on restart.
  describe('isSecretAutoGenerationAllowed (FA-CORE-002)', () => {
    test('allows dev and test', () => {
      expect(isSecretAutoGenerationAllowed({ NODE_ENV: 'test' })).toBe(true);
      expect(isSecretAutoGenerationAllowed({ NODE_ENV: 'development' })).toBe(
        true
      );
    });

    test('denies production and unset without the explicit opt-in', () => {
      expect(isSecretAutoGenerationAllowed({ NODE_ENV: 'production' })).toBe(
        false
      );
      expect(isSecretAutoGenerationAllowed({})).toBe(false);
    });

    test('allows production only with CIVICPRESS_ALLOW_GENERATED_SECRET=true', () => {
      expect(
        isSecretAutoGenerationAllowed({
          NODE_ENV: 'production',
          CIVICPRESS_ALLOW_GENERATED_SECRET: 'true',
        })
      ).toBe(true);
    });
  });

  test('should initialize with environment variable', async () => {
    process.env.CIVICPRESS_SECRET = testSecret;
    secretsManager = SecretsManager.getInstance(dataDir);
    await secretsManager.initialize();

    const signingKey = secretsManager.getSessionSigningKey();
    expect(signingKey).toBeInstanceOf(Buffer);
    expect(signingKey.length).toBe(32);
  });

  test('should auto-generate secret if neither env nor file exists', async () => {
    secretsManager = SecretsManager.getInstance(dataDir);
    await secretsManager.initialize();

    // Should be able to use keys after initialization
    const signingKey = secretsManager.getSessionSigningKey();
    expect(signingKey).toBeInstanceOf(Buffer);
    expect(signingKey.length).toBe(32);
  });

  test('should derive consistent keys for same scope', async () => {
    process.env.CIVICPRESS_SECRET = testSecret;
    secretsManager = SecretsManager.getInstance(dataDir);
    await secretsManager.initialize();

    const key1 = secretsManager.deriveKey('session', 'signing');
    const key2 = secretsManager.deriveKey('session', 'signing');

    expect(key1).toEqual(key2);
    expect(key1.length).toBe(32);
  });

  test('should derive different keys for different scopes', async () => {
    process.env.CIVICPRESS_SECRET = testSecret;
    secretsManager = SecretsManager.getInstance(dataDir);
    await secretsManager.initialize();

    const sessionKey = secretsManager.deriveKey('session', 'signing');
    const apiKey = secretsManager.deriveKey('api_key', 'signing');
    const csrfKey = secretsManager.deriveKey('csrf', 'signing');

    expect(sessionKey).not.toEqual(apiKey);
    expect(sessionKey).not.toEqual(csrfKey);
    expect(apiKey).not.toEqual(csrfKey);
  });

  test('should sign and verify data', async () => {
    process.env.CIVICPRESS_SECRET = testSecret;
    secretsManager = SecretsManager.getInstance(dataDir);
    await secretsManager.initialize();

    const key = secretsManager.getSessionSigningKey();
    const data = 'test data';
    const signature = secretsManager.sign(data, key);

    expect(typeof signature).toBe('string');
    expect(signature.length).toBe(64);

    const isValid = secretsManager.verify(data, signature, key);
    expect(isValid).toBe(true);
  });

  test('should reject incorrect signature', async () => {
    process.env.CIVICPRESS_SECRET = testSecret;
    secretsManager = SecretsManager.getInstance(dataDir);
    await secretsManager.initialize();

    const key = secretsManager.getSessionSigningKey();
    const data = 'test data';
    const wrongSignature = 'a'.repeat(64);

    const isValid = secretsManager.verify(data, wrongSignature, key);
    expect(isValid).toBe(false);
  });

  test('should get all pre-configured keys', async () => {
    process.env.CIVICPRESS_SECRET = testSecret;
    secretsManager = SecretsManager.getInstance(dataDir);
    await secretsManager.initialize();

    const sessionKey = secretsManager.getSessionSigningKey();
    const apiKey = secretsManager.getApiKeySigningKey();
    const tokenKey = secretsManager.getTokenSigningKey();
    const csrfKey = secretsManager.getCsrfSigningKey();
    const webhookKey = secretsManager.getWebhookSigningKey();
    const jwtSecret = secretsManager.getJwtSecret();

    expect(sessionKey).toBeInstanceOf(Buffer);
    expect(apiKey).toBeInstanceOf(Buffer);
    expect(tokenKey).toBeInstanceOf(Buffer);
    expect(csrfKey).toBeInstanceOf(Buffer);
    expect(webhookKey).toBeInstanceOf(Buffer);
    expect(typeof jwtSecret).toBe('string');
    expect(jwtSecret.length).toBe(64);
  });

  test('should throw error when using keys before initialization', () => {
    secretsManager = SecretsManager.getInstance(dataDir);

    expect(() => {
      secretsManager.getSessionSigningKey();
    }).toThrow('Secrets manager not initialized');
  });
});
