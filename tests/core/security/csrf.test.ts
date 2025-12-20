import { describe, test, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SecretsManager, CsrfProtection } from '@civicpress/core';

describe('CsrfProtection', () => {
  let tempDir: string;
  let secretsManager: SecretsManager;
  let csrfProtection: CsrfProtection;
  const testSecret = 'a'.repeat(128);

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civicpress-csrf-test-'));
    process.env.CIVICPRESS_SECRET = testSecret;
    secretsManager = SecretsManager.getInstance(tempDir);
    await secretsManager.initialize();
    csrfProtection = new CsrfProtection(secretsManager);
  });

  test('should generate CSRF token', () => {
    const token = csrfProtection.generateToken();

    expect(token).toHaveProperty('token');
    expect(token).toHaveProperty('expiresAt');
    expect(typeof token.token).toBe('string');
    expect(token.expiresAt).toBeInstanceOf(Date);
  });

  test('should generate signed token', () => {
    const { token } = csrfProtection.generateToken();

    expect(token.includes('.')).toBe(true);
    const parts = token.split('.');
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBe(64);
    expect(parts[1].length).toBe(64);
  });

  test('should validate correct token', () => {
    const { token } = csrfProtection.generateToken();
    const isValid = csrfProtection.validateToken(token);

    expect(isValid).toBe(true);
  });

  test('should reject invalid token', () => {
    const isValid = csrfProtection.validateToken('invalidtoken');

    expect(isValid).toBe(false);
  });

  test('should return token string from getTokenForResponse', () => {
    const token = csrfProtection.getTokenForResponse();

    expect(typeof token).toBe('string');
    expect(token.includes('.')).toBe(true);
    expect(csrfProtection.validateToken(token)).toBe(true);
  });
});
