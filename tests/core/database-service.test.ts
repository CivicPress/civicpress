import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../core/src/database/database-service';
import { DatabaseConfig } from '../../core/src/database/database-adapter';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('DatabaseService', () => {
  let dbService: DatabaseService;
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    // Create temporary directory for test database
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civicpress-test-'));
    dbPath = path.join(tempDir, 'test.db');

    const config: DatabaseConfig = {
      type: 'sqlite',
      sqlite: {
        file: dbPath,
      },
    };

    dbService = new DatabaseService(config);
    await dbService.initialize();
  });

  afterEach(async () => {
    await dbService.close();
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    it('should create database file and initialize tables', async () => {
      expect(fs.existsSync(dbPath)).toBe(true);

      // Check that tables were created
      const tables = await dbService['adapter'].query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name IN ('users', 'api_keys', 'sessions', 'search_index', 'audit_logs')
      `);

      expect(tables).toHaveLength(5);
      expect(tables.map((t) => t.name)).toEqual([
        'users',
        'api_keys',
        'sessions',
        'search_index',
        'audit_logs',
      ]);
    });

    it('should pass health check', async () => {
      const isHealthy = await dbService.healthCheck();
      expect(isHealthy).toBe(true);
    });
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

      const userId = await dbService.createUser(userData);
      expect(userId).toBeGreaterThan(0);

      const user = await dbService.getUserById(userId);
      expect(user).toBeTruthy();
      expect(user?.username).toBe('testuser');
      expect(user?.role).toBe('citizen');
      expect(user?.email).toBe('test@example.com');
    });

    it('should retrieve user by username', async () => {
      const userData = {
        username: 'testuser',
        role: 'citizen',
        email: 'test@example.com',
      };

      await dbService.createUser(userData);
      const user = await dbService.getUserByUsername('testuser');

      expect(user).toBeTruthy();
      expect(user?.username).toBe('testuser');
    });

    it('should return null for non-existent user', async () => {
      const user = await dbService.getUserById(999);
      expect(user).toBeNull();
    });
  });

  describe('API Key Management', () => {
    it('should create and retrieve API keys', async () => {
      // Create a user first
      const userId = await dbService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      const keyHash = 'test-key-hash';
      const name = 'Test API Key';
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const apiKeyId = await dbService.createApiKey(
        userId,
        keyHash,
        name,
        expiresAt
      );
      expect(apiKeyId).toBeGreaterThan(0);

      const apiKey = await dbService.getApiKeyByHash(keyHash);
      expect(apiKey).toBeTruthy();
      expect(apiKey?.name).toBe(name);
      expect(apiKey?.user_id).toBe(userId);
      expect(apiKey?.username).toBe('testuser');
    });

    it('should delete API keys', async () => {
      const userId = await dbService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      const keyHash = 'test-key-hash';
      await dbService.createApiKey(userId, keyHash, 'Test Key');

      // Verify it exists
      let apiKey = await dbService.getApiKeyByHash(keyHash);
      expect(apiKey).toBeTruthy();

      // Delete it
      await dbService.deleteApiKey(apiKey!.id);

      // Verify it's gone
      apiKey = await dbService.getApiKeyByHash(keyHash);
      expect(apiKey).toBeNull();
    });
  });

  describe('Session Management', () => {
    it('should create and retrieve sessions', async () => {
      const userId = await dbService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      const tokenHash = 'test-token-hash';
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const sessionId = await dbService.createSession(
        userId,
        tokenHash,
        expiresAt
      );
      expect(sessionId).toBeGreaterThan(0);

      const session = await dbService.getSessionByToken(tokenHash);
      expect(session).toBeTruthy();
      expect(session?.user_id).toBe(userId);
      expect(session?.username).toBe('testuser');
    });

    it('should not return expired sessions', async () => {
      const userId = await dbService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      const tokenHash = 'test-token-hash';
      const expiresAt = new Date(Date.now() - 1000); // Expired 1 second ago

      await dbService.createSession(userId, tokenHash, expiresAt);
      const session = await dbService.getSessionByToken(tokenHash);

      expect(session).toBeNull();
    });

    it('should cleanup expired sessions', async () => {
      const userId = await dbService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      // Create expired session
      const expiredToken = 'expired-token';
      const expiredAt = new Date(Date.now() - 1000);
      await dbService.createSession(userId, expiredToken, expiredAt);

      // Create valid session
      const validToken = 'valid-token';
      const validAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await dbService.createSession(userId, validToken, validAt);

      // Check both exist
      expect(await dbService.getSessionByToken(expiredToken)).toBeNull();
      expect(await dbService.getSessionByToken(validToken)).toBeTruthy();

      // Cleanup expired sessions
      await dbService.cleanupExpiredSessions();

      // Valid session should still exist
      expect(await dbService.getSessionByToken(validToken)).toBeTruthy();
    });
  });

  describe('Search Index Management', () => {
    it('should index and search records', async () => {
      const recordData = {
        recordId: 'test-record-1',
        recordType: 'bylaw',
        title: 'Test Bylaw',
        content: 'This is a test bylaw content',
        tags: 'test, bylaw, example',
        metadata: JSON.stringify({ author: 'testuser', version: '1.0' }),
      };

      await dbService.indexRecord(recordData);

      // Search by title
      let results = await dbService.searchRecords('Test Bylaw');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Test Bylaw');

      // Search by content
      results = await dbService.searchRecords('bylaw content');
      expect(results).toHaveLength(1);

      // Search by tags
      results = await dbService.searchRecords('example');
      expect(results).toHaveLength(1);

      // Search with record type filter
      results = await dbService.searchRecords('test', 'bylaw');
      expect(results).toHaveLength(1);

      results = await dbService.searchRecords('test', 'policy');
      expect(results).toHaveLength(0);
    });

    it('should update existing index entries', async () => {
      const recordData = {
        recordId: 'test-record-1',
        recordType: 'bylaw',
        title: 'Original Title',
        content: 'Original content',
      };

      await dbService.indexRecord(recordData);

      // Update the record
      const updatedData = {
        ...recordData,
        title: 'Updated Title',
        content: 'Updated content',
      };

      await dbService.indexRecord(updatedData);

      // Should only have one entry (updated)
      const results = await dbService.searchRecords('Updated Title');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Updated Title');
    });

    it('should remove records from index', async () => {
      const recordData = {
        recordId: 'test-record-1',
        recordType: 'bylaw',
        title: 'Test Record',
        content: 'Test content',
      };

      await dbService.indexRecord(recordData);
      expect(await dbService.searchRecords('Test Record')).toHaveLength(1);

      await dbService.removeRecordFromIndex('test-record-1', 'bylaw');
      expect(await dbService.searchRecords('Test Record')).toHaveLength(0);
    });
  });

  describe('Audit Logging', () => {
    it('should log audit events', async () => {
      const userId = await dbService.createUser({
        username: 'testuser',
        role: 'citizen',
      });

      const auditData = {
        userId,
        action: 'record_created',
        resourceType: 'bylaw',
        resourceId: 'test-record-1',
        details: 'Created new bylaw',
        ipAddress: '127.0.0.1',
      };

      await dbService.logAuditEvent(auditData);

      const logs = await dbService.getAuditLogs(10, 0);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('record_created');
      expect(logs[0].resource_type).toBe('bylaw');
      expect(logs[0].username).toBe('testuser');
    });

    it('should retrieve audit logs with pagination', async () => {
      // Create multiple audit events
      for (let i = 0; i < 5; i++) {
        await dbService.logAuditEvent({
          action: `test_action_${i}`,
          details: `Test event ${i}`,
        });
      }

      // Get first 3 logs
      const logs = await dbService.getAuditLogs(3, 0);
      expect(logs).toHaveLength(3);

      // Get next 3 logs
      const nextLogs = await dbService.getAuditLogs(3, 3);
      expect(nextLogs).toHaveLength(2); // Only 2 more logs exist
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      const invalidConfig: DatabaseConfig = {
        type: 'sqlite',
        sqlite: {
          file: '/invalid/path/that/does/not/exist/test.db',
        },
      };

      const invalidService = new DatabaseService(invalidConfig);

      await expect(invalidService.initialize()).rejects.toThrow();
    });

    it('should handle invalid SQL gracefully', async () => {
      await expect(dbService['adapter'].query('INVALID SQL')).rejects.toThrow();
    });
  });
});
