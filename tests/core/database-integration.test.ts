import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../core/src/database/database-service';
import { DatabaseConfig } from '../../core/src/database/database-adapter';
import { CentralConfigManager } from '../../core/src/config/central-config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Database Integration', () => {
  let dbService: DatabaseService;
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    // Create temporary directory for test database
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civicpress-db-test-'));
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

  describe('User Management', () => {
    it('should create and retrieve users', async () => {
      // Create a test user
      const userId = await dbService.createUser({
        username: 'testuser',
        role: 'council',
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(userId).toBeGreaterThan(0);

      // Retrieve user by username
      const user = await dbService.getUserByUsername('testuser');
      expect(user).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.role).toBe('council');
      expect(user.email).toBe('test@example.com');

      // Retrieve user by ID
      const userById = await dbService.getUserById(userId);
      expect(userById).toBeDefined();
      expect(userById.username).toBe('testuser');
    });

    it('should handle duplicate usernames', async () => {
      // Create first user
      await dbService.createUser({
        username: 'duplicate',
        role: 'public',
      });

      // Try to create duplicate user
      await expect(
        dbService.createUser({
          username: 'duplicate',
          role: 'council',
        })
      ).rejects.toThrow();
    });
  });

  describe('API Key Management', () => {
    it('should create and retrieve API keys', async () => {
      // Create a user first
      const userId = await dbService.createUser({
        username: 'apiuser',
        role: 'admin',
      });

      // Create API key
      const keyId = await dbService.createApiKey(
        userId,
        'hashed_key_123',
        'Test API Key',
        new Date('2025-12-31')
      );

      expect(keyId).toBeGreaterThan(0);

      // Retrieve API key
      const apiKey = await dbService.getApiKeyByHash('hashed_key_123');
      expect(apiKey).toBeDefined();
      expect(apiKey.name).toBe('Test API Key');
      expect(apiKey.username).toBe('apiuser');
      expect(apiKey.role).toBe('admin');

      // Delete API key
      await dbService.deleteApiKey(keyId);
      const deletedKey = await dbService.getApiKeyByHash('hashed_key_123');
      expect(deletedKey).toBeNull();
    });
  });

  describe('Session Management', () => {
    it('should create and manage sessions', async () => {
      // Create a user first
      const userId = await dbService.createUser({
        username: 'sessionuser',
        role: 'council',
      });

      // Create session
      const sessionId = await dbService.createSession(
        userId,
        'hashed_token_123',
        new Date('2025-12-31')
      );

      expect(sessionId).toBeGreaterThan(0);

      // Retrieve session
      const session = await dbService.getSessionByToken('hashed_token_123');
      expect(session).toBeDefined();
      expect(session.username).toBe('sessionuser');
      expect(session.role).toBe('council');

      // Delete session
      await dbService.deleteSession(sessionId);
      const deletedSession =
        await dbService.getSessionByToken('hashed_token_123');
      expect(deletedSession).toBeNull();
    });

    it('should cleanup expired sessions', async () => {
      // Create a user first
      const userId = await dbService.createUser({
        username: 'expireduser',
        role: 'public',
      });

      // Create expired session
      await dbService.createSession(
        userId,
        'expired_token',
        new Date('2020-01-01') // Expired date
      );

      // Create valid session
      await dbService.createSession(
        userId,
        'valid_token',
        new Date('2025-12-31') // Valid date
      );

      // Cleanup expired sessions
      await dbService.cleanupExpiredSessions();

      // Check that expired session is gone
      const expiredSession = await dbService.getSessionByToken('expired_token');
      expect(expiredSession).toBeNull();

      // Check that valid session remains
      const validSession = await dbService.getSessionByToken('valid_token');
      expect(validSession).toBeDefined();
    });
  });

  describe('Search Index', () => {
    it('should index and search records', async () => {
      // Index a test record
      await dbService.indexRecord({
        recordId: 'bylaw-001',
        recordType: 'bylaw',
        title: 'Test Bylaw',
        content: 'This is a test bylaw about parking regulations.',
        tags: 'parking,regulations,traffic',
        metadata: JSON.stringify({ status: 'draft', author: 'council' }),
      });

      // Search for records
      const results = await dbService.searchRecords('parking');
      expect(results).toHaveLength(1);
      expect(results[0].record_id).toBe('bylaw-001');
      expect(results[0].title).toBe('Test Bylaw');

      // Search by type
      const bylawResults = await dbService.searchRecords('test', 'bylaw');
      expect(bylawResults).toHaveLength(1);
      expect(bylawResults[0].record_type).toBe('bylaw');

      // Remove from index
      await dbService.removeRecordFromIndex('bylaw-001', 'bylaw');
      const emptyResults = await dbService.searchRecords('parking');
      expect(emptyResults).toHaveLength(0);
    });
  });

  describe('Audit Logging', () => {
    it('should log audit events', async () => {
      // Create a user first
      const userId = await dbService.createUser({
        username: 'audituser',
        role: 'admin',
      });

      // Log audit event
      await dbService.logAuditEvent({
        userId,
        action: 'record.created',
        resourceType: 'bylaw',
        resourceId: 'bylaw-001',
        details: 'Created new parking bylaw',
        ipAddress: '192.168.1.1',
      });

      // Retrieve audit logs
      const logs = await dbService.getAuditLogs(10, 0);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('record.created');
      expect(logs[0].resource_type).toBe('bylaw');
      expect(logs[0].resource_id).toBe('bylaw-001');
      expect(logs[0].details).toBe('Created new parking bylaw');
    });
  });

  describe('Health Check', () => {
    it('should pass health check', async () => {
      const isHealthy = await dbService.healthCheck();
      expect(isHealthy).toBe(true);
    });
  });

  describe('Central Configuration Integration', () => {
    it('should work with central configuration', async () => {
      // Reset central config for testing
      CentralConfigManager.reset();

      // Test that we can get database config
      const dbConfig = CentralConfigManager.getDatabaseConfig();
      expect(dbConfig).toBeDefined();
      expect(dbConfig?.type).toBe('sqlite');
    });
  });
});
