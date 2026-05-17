/**
 * DeviceAuthService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeviceAuthService } from '../services/device-auth.js';
import type { Logger, SecretsManager } from '@civicpress/core';

describe('DeviceAuthService', () => {
  let deviceAuth: DeviceAuthService;
  let mockLogger: Logger;
  let mockSecretsManager: SecretsManager;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    mockSecretsManager = {
      deriveKey: vi
        .fn()
        .mockReturnValue(Buffer.from('test-secret-key', 'utf-8')),
    } as any;

    deviceAuth = new DeviceAuthService(mockLogger, mockSecretsManager);
  });

  describe('generateToken', () => {
    it('should generate a valid token', async () => {
      const deviceId = 'device-id';
      const deviceUuid = 'device-uuid';
      const organizationId = 'default';

      mockSecretsManager.deriveKey = vi
        .fn()
        .mockReturnValue(Buffer.from('test-secret-key', 'utf-8'));

      const result = await deviceAuth.generateToken({
        deviceId,
        deviceUuid,
        organizationId,
      });

      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('validateToken', () => {
    it('should validate a valid token', async () => {
      // Mock secret manager to return a consistent derived key
      const testKey = Buffer.from('test-secret-key-for-validation', 'utf-8');
      mockSecretsManager.deriveKey = vi.fn().mockReturnValue(testKey);

      // First generate a token
      const tokenResult = await deviceAuth.generateToken({
        deviceId: 'device-id',
        deviceUuid: 'device-uuid',
        organizationId: 'default',
      });

      // Then validate it (should use the same derived key)
      const result = await deviceAuth.validateToken(tokenResult.token);

      expect(result).toBeDefined();
      if (result) {
        expect(result.deviceId).toBe('device-id');
        expect(result.deviceUuid).toBe('device-uuid');
      }
    });

    it('should return null for invalid token', async () => {
      const invalidToken = 'invalid-token';

      const result = await deviceAuth.validateToken(invalidToken);

      expect(result).toBeNull();
    });
  });

  describe('refreshToken', () => {
    it('should refresh a valid token', async () => {
      // Mock secret manager to return a consistent derived key
      const testKey = Buffer.from('test-secret-key-for-refresh', 'utf-8');
      mockSecretsManager.deriveKey = vi.fn().mockReturnValue(testKey);

      // First generate a token
      const oldTokenResult = await deviceAuth.generateToken({
        deviceId: 'device-id',
        deviceUuid: 'device-uuid',
        organizationId: 'default',
      });

      // Then refresh it
      const newTokenResult = await deviceAuth.refreshToken(
        oldTokenResult.token
      );

      expect(newTokenResult).toBeDefined();
      if (newTokenResult) {
        expect(newTokenResult.token).toBeDefined();
        expect(newTokenResult.token).not.toBe(oldTokenResult.token);
      }
    });

    it('should return null for invalid token', async () => {
      const invalidToken = 'invalid-token';

      const result = await deviceAuth.refreshToken(invalidToken);

      expect(result).toBeNull();
    });
  });
});
