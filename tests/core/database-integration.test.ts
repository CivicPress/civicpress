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
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
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
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
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
        new Date(Date.now() - 24 * 60 * 60 * 1000) // Expired date
      );

      // Create valid session
      await dbService.createSession(
        userId,
        'valid_token',
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // Valid date
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
      // Create record in records table first (required for search with INNER JOIN)
      await dbService.createRecord({
        id: 'bylaw-001',
        title: 'Test Bylaw',
        type: 'bylaw',
        status: 'draft',
        content: 'This is a test bylaw about parking regulations.',
        author: 'council',
      });

      await dbService.indexRecord({
        recordId: 'bylaw-001',
        recordType: 'bylaw',
        title: 'Test Bylaw',
        content: 'This is a test bylaw about parking regulations.',
        tags: 'parking,regulations,traffic',
        metadata: JSON.stringify({ status: 'draft', author: 'council' }),
      });

      // Search for records
      const { results, total } = await dbService.searchRecords('parking', {});
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].record_id).toBe('bylaw-001');
      expect(results[0].title).toBe('Test Bylaw');
      // `total` counts all matches, so it is never smaller than the page.
      expect(total).toBeGreaterThanOrEqual(results.length);

      // Search by type
      const bylawResults = (
        await dbService.searchRecords('parking', {
          type: 'bylaw',
        })
      ).results;
      if (bylawResults.length > 0) {
        expect(bylawResults[0].record_type).toBe('bylaw');
      }

      // Remove from index
      await dbService.removeRecordFromIndex('bylaw-001', 'bylaw');
      const emptyResults = (await dbService.searchRecords('parking', {}))
        .results;
      expect(
        emptyResults.filter((r) => r.record_id === 'bylaw-001').length
      ).toBe(0);
    });
  });

  // searchRecords had the same silent-default bug as listRecords (20 rather
  // than 10) plus a worse twist: it returned a bare array with no total, so a
  // caller holding a clipped page had nothing to compare it against. The layer
  // above papered over that by reporting the page size AS the total.
  describe('searchRecords limit contract', () => {
    const seedIndexed = async (count: number) => {
      for (let i = 0; i < count; i++) {
        const id = `bylaw-${String(i).padStart(3, '0')}`;
        await dbService.createRecord({
          id,
          title: `Parking Bylaw ${i}`,
          type: 'bylaw',
          status: 'adopted',
          content: 'A bylaw about parking regulations.',
          author: 'council',
        });
        await dbService.indexRecord({
          recordId: id,
          recordType: 'bylaw',
          title: `Parking Bylaw ${i}`,
          content: 'A bylaw about parking regulations.',
          tags: 'parking',
          metadata: JSON.stringify({ status: 'adopted' }),
        });
      }
    };

    it('returns EVERY match when limit is omitted — never a silent 20', async () => {
      await seedIndexed(25);

      const { results, total } = await dbService.searchRecords('parking');

      expect(results).toHaveLength(25);
      expect(total).toBe(25);
    });

    it('reports the total of ALL matches, not the size of the page', async () => {
      await seedIndexed(25);

      const { results, total } = await dbService.searchRecords('parking', {
        limit: 5,
      });

      expect(results).toHaveLength(5);
      // The bug this pins: `total` used to come back as 5, so the API computed
      // totalPages = ceil(5/5) = 1 and told the client there was nothing more.
      expect(total).toBe(25);
    });

    it('applies offset as a real window into the match set', async () => {
      await seedIndexed(25);

      const all = await dbService.searchRecords('parking', { limit: 'all' });
      const page = await dbService.searchRecords('parking', {
        limit: 5,
        offset: 20,
      });

      expect(page.results).toHaveLength(5);
      expect(page.total).toBe(25);
      expect(page.results.map((r: any) => r.record_id)).toEqual(
        all.results.slice(20).map((r: any) => r.record_id)
      );
    });

    it('treats limit:0 as a real request, not as "unset"', async () => {
      await seedIndexed(12);

      const { results, total } = await dbService.searchRecords('parking', {
        limit: 0,
      });

      expect(results).toHaveLength(0);
      // Still an honest count of what matched, which is what makes a
      // zero-length page distinguishable from "nothing matched".
      expect(total).toBe(12);
    });
  });

  // listRecords used to append `LIMIT ?` with `options.limit || 10`, so a
  // caller that omitted `limit` got the 10 newest rows in a shape
  // indistinguishable from the complete set. Three consumers hand-rolled
  // offset paging to escape it, and the one that didn't — the recordings
  // backfill, which treats "no session references this file" as authority to
  // DELETE a published object — was one code path away from deleting verified
  // public recordings. `limit` is now a page size or 'all', and omission means
  // 'all'.
  describe('listRecords limit contract', () => {
    const seed = async (count: number) => {
      for (let i = 0; i < count; i++) {
        await dbService.createRecord({
          id: `bylaw-${String(i).padStart(3, '0')}`,
          title: `Bylaw ${i}`,
          type: 'bylaw',
          status: 'adopted',
          author: 'council',
        });
      }
    };

    it('returns EVERY row when limit is omitted — never a silent page', async () => {
      await seed(25);

      const result = await dbService.listRecords();

      expect(result.total).toBe(25);
      // The assertion that would have failed before: exactly 10 came back.
      expect(result.records).toHaveLength(25);
    });

    it("returns every row for an explicit limit:'all'", async () => {
      await seed(25);

      const result = await dbService.listRecords({ limit: 'all' });

      expect(result.records).toHaveLength(25);
      expect(result.total).toBe(25);
    });

    it('honours a numeric limit as a page, and reports the unpaged total', async () => {
      await seed(25);

      const result = await dbService.listRecords({ limit: 10 });

      expect(result.records).toHaveLength(10);
      // `total` is the whole corpus, not the page — that is what makes a
      // truncated read detectable by a caller who bothers to look.
      expect(result.total).toBe(25);
    });

    it("applies an offset alongside limit:'all' instead of dropping it", async () => {
      await seed(25);

      const all = await dbService.listRecords({ limit: 'all' });
      const offset = await dbService.listRecords({ limit: 'all', offset: 20 });

      // OFFSET is only valid after a LIMIT, so 'all' + offset has to synthesize
      // one. Getting that wrong silently returns the FIRST rows instead of the
      // ones asked for, so compare identities, not just the count.
      expect(offset.records).toHaveLength(5);
      expect(offset.records.map((r: any) => r.id)).toEqual(
        all.records.slice(20).map((r: any) => r.id)
      );
    });

    it('treats limit:0 as a real request, not as "unset"', async () => {
      await seed(12);

      const result = await dbService.listRecords({ limit: 0 });

      // The old `||` coerced 0 to 10. `??` keeps it meaning "count only".
      expect(result.records).toHaveLength(0);
      expect(result.total).toBe(12);
    });

    it('THROWS rather than truncating when the corpus outgrows the all-cap', async () => {
      await seed(3);

      // The cap is 100k, which is impractical to seed. Drive the same guard by
      // asking the store to certify a corpus larger than a cap of 2.
      const store: any = (dbService as any).records;
      const realQuery = store.adapter.query.bind(store.adapter);
      store.adapter.query = async (sql: string, params: any[]) =>
        sql.includes('COUNT(*)')
          ? [{ count: 100_001 }]
          : realQuery(sql, params);

      try {
        await expect(dbService.listRecords({ limit: 'all' })).rejects.toThrow(
          /refusing to materialize 100001 rows/
        );
      } finally {
        store.adapter.query = realQuery;
      }
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
