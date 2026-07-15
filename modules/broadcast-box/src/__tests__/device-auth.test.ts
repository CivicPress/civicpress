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

  describe('FA-BB-005: constant-time signature verification', () => {
    it('rejects a tampered same-length signature', async () => {
      const testKey = Buffer.from('test-secret-key-bb005', 'utf-8');
      mockSecretsManager.deriveKey = vi.fn().mockReturnValue(testKey);

      const { token } = await deviceAuth.generateToken({
        deviceId: 'device-id',
        deviceUuid: 'device-uuid',
        organizationId: 'default',
      });
      const [payload, signature] = token.split('.');
      // Flip one character, keep the length identical.
      const flipped =
        (signature[0] === 'A' ? 'B' : 'A') + signature.substring(1);

      expect(
        await deviceAuth.validateToken(`${payload}.${flipped}`)
      ).toBeNull();
    });

    it('rejects a signature of a different length', async () => {
      const testKey = Buffer.from('test-secret-key-bb005', 'utf-8');
      mockSecretsManager.deriveKey = vi.fn().mockReturnValue(testKey);

      const { token } = await deviceAuth.generateToken({
        deviceId: 'device-id',
        deviceUuid: 'device-uuid',
        organizationId: 'default',
      });
      const [payload, signature] = token.split('.');

      expect(
        await deviceAuth.validateToken(`${payload}.${signature}extra`)
      ).toBeNull();
      expect(await deviceAuth.validateToken(`${payload}.x`)).toBeNull();
    });
  });

  describe('FA-BB-006: token-level revocation', () => {
    const makeDenylist = () => {
      const revoked = new Map<string, string>();
      return {
        store: revoked,
        isRevoked: vi.fn(async (jti: string) => revoked.has(jti)),
        revoke: vi.fn(
          async (jti: string, _deviceId: string, _exp: Date, reason: string) => {
            revoked.set(jti, reason);
          }
        ),
        cleanupExpired: vi.fn(async () => 0),
      };
    };

    const newAuthWithDenylist = () => {
      const denylist = makeDenylist();
      const testKey = Buffer.from('test-secret-key-bb006', 'utf-8');
      mockSecretsManager.deriveKey = vi.fn().mockReturnValue(testKey);
      const auth = new DeviceAuthService(
        mockLogger,
        mockSecretsManager,
        denylist as any
      );
      return { auth, denylist };
    };

    const deviceInfo = {
      deviceId: 'device-id',
      deviceUuid: 'device-uuid',
      organizationId: 'default',
    };

    it('revokeToken kills a leaked token immediately', async () => {
      const { auth } = newAuthWithDenylist();
      const { token } = await auth.generateToken(deviceInfo);

      expect(await auth.validateToken(token)).not.toBeNull();
      expect(await auth.revokeToken(token, 'leaked')).toBe(true);
      expect(await auth.validateToken(token)).toBeNull();
    });

    it('refresh rotates: the old token stops validating', async () => {
      const { auth } = newAuthWithDenylist();
      const { token: oldToken } = await auth.generateToken(deviceInfo);

      const refreshed = await auth.refreshToken(oldToken);
      expect(refreshed).not.toBeNull();
      expect(await auth.validateToken(refreshed!.token)).not.toBeNull();
      // The pre-rotation token is dead, not valid-until-exp.
      expect(await auth.validateToken(oldToken)).toBeNull();
    });

    it('revokeToken refuses forged tokens (nothing lands on the denylist)', async () => {
      const { auth, denylist } = newAuthWithDenylist();
      const payload = Buffer.from(
        JSON.stringify({ deviceId: 'x', jti: 'forged', exp: 9999999999 })
      ).toString('base64url');

      expect(await auth.revokeToken(`${payload}.forged-signature`)).toBe(false);
      expect(denylist.revoke).not.toHaveBeenCalled();
    });
  });
});
