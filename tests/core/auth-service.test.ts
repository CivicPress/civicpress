import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthService } from '../../core/src/auth/auth-service';
import { DatabaseService } from '../../core/src/database/database-service';
import { DatabaseConfig } from '../../core/src/database/database-adapter';
import {
  createTestDirectory,
  cleanupTestDirectory,
  createRolesConfig,
} from '../fixtures/test-setup';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('AuthService', () => {
  let authService: AuthService;
  let dbService: DatabaseService;
  let testConfig: any;

  beforeEach(async () => {
    // Create test directory with proper structure
    testConfig = createTestDirectory('auth-service-test');

    // Create roles configuration
    createRolesConfig(testConfig);

    const config: DatabaseConfig = {
      type: 'sqlite',
      sqlite: {
        file: path.join(testConfig.testDir, 'test.db'),
      },
    };

    dbService = new DatabaseService(config);
    await dbService.initialize();
    authService = new AuthService(dbService, testConfig.dataDir);
  });

  afterEach(async () => {
    await dbService.close();
    // Clean up test directory
    cleanupTestDirectory(testConfig);
  });

  describe('User Management', () => {
    it('should create and retrieve users', async () => {
      const userData = {
        username: 'testuser',
        role: 'citizen',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
      };

      const user = await authService.createUser(userData);
      expect(user.id).toBeGreaterThan(0);
      expect(user.username).toBe('testuser');
      expect(user.role).toBe('citizen');
      expect(user.email).toBe('test@example.com');
    });

    it('should retrieve user by username', async () => {
      const userData = {
        username: 'testuser',
        role: 'citizen',
        email: 'test@example.com',
      };

      await authService.createUser(userData);
      const user = await authService.getUserByUsername('testuser');

      expect(user).toBeTruthy();
      expect(user?.username).toBe('testuser');
    });

    it('should retrieve user by ID', async () => {
      const userData = {
        username: 'testuser',
        role: 'citizen',
      };

      const createdUser = await authService.createUser(userData);
      const user = await authService.getUserById(createdUser.id);

      expect(user).toBeTruthy();
      expect(user?.id).toBe(createdUser.id);
      expect(user?.username).toBe('testuser');
    });

    it('should return null for non-existent user', async () => {
      const user = await authService.getUserByUsername('nonexistent');
      expect(user).toBeNull();
    });
  });

  describe('API Key Authentication', () => {
    it('should create and validate API keys', async () => {
      const user = await authService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      const { key, apiKey } = await authService.createApiKey(
        user.id,
        'Test API Key'
      );

      expect(key).toBeTruthy();
      expect(key.length).toBeGreaterThan(0);
      expect(apiKey.userId).toBe(user.id);
      expect(apiKey.name).toBe('Test API Key');

      // Validate the API key
      const validatedUser = await authService.validateApiKey(key);
      expect(validatedUser).toBeTruthy();
      expect(validatedUser?.id).toBe(user.id);
      expect(validatedUser?.username).toBe('testuser');
    });

    it('should reject invalid API keys', async () => {
      const user = await authService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      const { key } = await authService.createApiKey(user.id, 'Test Key');

      // Try with invalid key
      const invalidUser = await authService.validateApiKey('invalid-key');
      expect(invalidUser).toBeNull();

      // Try with modified key
      const modifiedKey = key + 'modified';
      const modifiedUser = await authService.validateApiKey(modifiedKey);
      expect(modifiedUser).toBeNull();
    });

    it('should handle expired API keys', async () => {
      const user = await authService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      const expiresAt = new Date(Date.now() + 1000); // Expires in 1 second
      const { key } = await authService.createApiKey(
        user.id,
        'Expiring Key',
        expiresAt
      );

      // Should work immediately
      let validatedUser = await authService.validateApiKey(key);
      expect(validatedUser).toBeTruthy();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should not work after expiration
      validatedUser = await authService.validateApiKey(key);
      expect(validatedUser).toBeNull();
    });

    it('should delete API keys', async () => {
      const user = await authService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      const { key, apiKey } = await authService.createApiKey(
        user.id,
        'Test Key'
      );

      // Verify it works
      let validatedUser = await authService.validateApiKey(key);
      expect(validatedUser).toBeTruthy();

      // Delete the API key
      await authService.deleteApiKey(apiKey.id);

      // Should not work after deletion
      validatedUser = await authService.validateApiKey(key);
      expect(validatedUser).toBeNull();
    });
  });

  describe('Session Management', () => {
    it('should create and validate sessions', async () => {
      const user = await authService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      const { token, session } = await authService.createSession(user.id);

      expect(token).toBeTruthy();
      expect(token.length).toBeGreaterThan(0);
      expect(session.userId).toBe(user.id);
      expect(session.user.username).toBe('testuser');

      // Validate the session
      const validatedUser = await authService.validateSession(token);
      expect(validatedUser).toBeTruthy();
      expect(validatedUser?.id).toBe(user.id);
      expect(validatedUser?.username).toBe('testuser');
    });

    it('should reject invalid session tokens', async () => {
      const user = await authService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      const { token } = await authService.createSession(user.id);

      // Try with invalid token
      const invalidUser = await authService.validateSession('invalid-token');
      expect(invalidUser).toBeNull();

      // Try with modified token
      const modifiedToken = token + 'modified';
      const modifiedUser = await authService.validateSession(modifiedToken);
      expect(modifiedUser).toBeNull();
    });

    it('should handle expired sessions', async () => {
      const user = await authService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      // Create session with short expiration
      const { token } = await authService.createSession(user.id, 0.001); // 3.6 seconds

      // Should work immediately
      let validatedUser = await authService.validateSession(token);
      expect(validatedUser).toBeTruthy();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Should not work after expiration
      validatedUser = await authService.validateSession(token);
      expect(validatedUser).toBeNull();
    });

    it('should cleanup expired sessions', async () => {
      const user = await authService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      // Create a session
      const { token } = await authService.createSession(user.id);

      // Verify it works
      let validatedUser = await authService.validateSession(token);
      expect(validatedUser).toBeTruthy();

      // Cleanup expired sessions (should not affect valid session)
      await authService.cleanupExpiredSessions();

      // Should still work
      validatedUser = await authService.validateSession(token);
      expect(validatedUser).toBeTruthy();
    });

    it('should delete sessions', async () => {
      const user = await authService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      const { token, session } = await authService.createSession(user.id);

      // Verify it works
      let validatedUser = await authService.validateSession(token);
      expect(validatedUser).toBeTruthy();

      // Delete the session
      await authService.deleteSession(session.id);

      // Should not work after deletion
      validatedUser = await authService.validateSession(token);
      expect(validatedUser).toBeNull();
    });
  });

  describe('Audit Logging', () => {
    it('should log authentication events', async () => {
      const user = await authService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      await authService.logAuthEvent(
        user.id,
        'login',
        'User logged in via API key',
        '127.0.0.1'
      );

      // Verify the audit log was created
      const logs = await dbService.getAuditLogs(10, 0);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('login');
      expect(logs[0].username).toBe('testuser');
      expect(logs[0].ip_address).toBe('127.0.0.1');
    });

    it('should log events without user ID', async () => {
      await authService.logAuthEvent(
        undefined,
        'failed_login',
        'Failed login attempt',
        '127.0.0.1'
      );

      const logs = await dbService.getAuditLogs(10, 0);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('failed_login');
      expect(logs[0].username).toBeNull();
    });
  });

  describe('Security', () => {
    it('should generate unique tokens', async () => {
      const user = await authService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      const { key: apiKey1 } = await authService.createApiKey(user.id, 'Key 1');
      const { key: apiKey2 } = await authService.createApiKey(user.id, 'Key 2');
      const { token: session1 } = await authService.createSession(user.id);
      const { token: session2 } = await authService.createSession(user.id);

      // All tokens should be unique
      const tokens = [apiKey1, apiKey2, session1, session2];
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(tokens.length);
    });

    it('should hash tokens securely', async () => {
      const user = await authService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      const { key } = await authService.createApiKey(user.id, 'Test Key');

      // The original key should not be stored in the database
      const apiKey = await dbService.getApiKeyByHash(
        authService['hashToken'](key)
      );
      expect(apiKey).toBeTruthy();
      expect(apiKey?.key_hash).not.toBe(key); // Should be hashed
    });
  });
});
