import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// Setup global test environment
await setupGlobalTestEnvironment();

// Enable bypass auth for tests
process.env.BYPASS_AUTH = 'true';

describe('Indexing API', () => {
  let context: any;
  let authToken: string;

  beforeEach(async () => {
    context = await createAPITestContext();

    // Get authentication token for tests
    const loginResponse = await request(context.api.getApp())
      .post('/auth/simulated')
      .send({
        username: 'testuser',
        role: 'admin',
      });

    authToken = loginResponse.body.data.session.token;
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  describe('GET /api/indexing/status', () => {
    it('should return indexing status', async () => {
      const response = await request(context.api.getApp())
        .get('/api/indexing/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBeDefined();
    });

    it('should return 200 when index exists', async () => {
      const response = await request(context.api.getApp())
        .get('/api/indexing/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBeDefined();
    });
  });

  describe('GET /api/indexing/search', () => {
    it('should search records by query', async () => {
      const response = await request(context.api.getApp())
        .get('/api/indexing/search?q=noise')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.results.query).toBe('noise');
    });

    it('should filter by type', async () => {
      const response = await request(context.api.getApp())
        .get('/api/indexing/search?q=noise&type=bylaw')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.results.records).toBeDefined();
      expect(
        response.body.data.results.records.every(
          (record: any) => record.type === 'bylaw'
        )
      ).toBe(true);
    });

    it('should filter by status', async () => {
      const response = await request(context.api.getApp())
        .get('/api/indexing/search?q=noise&status=adopted')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.results.records).toBeDefined();
      expect(
        response.body.data.results.records.every(
          (record: any) => record.status === 'adopted'
        )
      ).toBe(true);
    });

    it('should require query parameter', async () => {
      const response = await request(context.api.getApp())
        .get('/api/indexing/search')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain(
        'Query parameter "q" is required'
      );
    });

    it('should return empty results for non-matching query', async () => {
      const response = await request(context.api.getApp())
        .get('/api/indexing/search?q=nonexistent')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.results.total).toBe(0);
      expect(response.body.data.results.records).toHaveLength(0);
    });
  });

  describe('POST /api/indexing/generate', () => {
    it('should generate indexes', async () => {
      const response = await request(context.api.getApp())
        .post('/api/indexing/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.index).toBeDefined();
    });

    it('should filter by type', async () => {
      const response = await request(context.api.getApp())
        .post('/api/indexing/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          types: ['bylaw'],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.index.types).toContain('bylaw');
    });

    it('should filter by status', async () => {
      const response = await request(context.api.getApp())
        .post('/api/indexing/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          statuses: ['archived'],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.index.statuses).toContain('archived');
    });
  });

  describe('POST /api/indexing/sync', () => {
    it('should sync records to database', async () => {
      const response = await request(context.api.getApp())
        .post('/api/indexing/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Database sync completed');
    });

    it('should use default conflict resolution', async () => {
      const response = await request(context.api.getApp())
        .post('/api/indexing/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.results.conflictResolution).toBe('file-wins');
    });

    it('should validate conflict resolution strategy', async () => {
      const response = await request(context.api.getApp())
        .post('/api/indexing/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          conflictResolution: 'invalid-strategy',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Invalid request data');
    });
  });

  describe('Conflict Resolution Strategies', () => {
    it('should handle file-wins strategy', async () => {
      const response = await request(context.api.getApp())
        .post('/api/indexing/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          conflictResolution: 'file-wins',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.results.conflictResolution).toBe('file-wins');
    });

    it('should handle database-wins strategy', async () => {
      const response = await request(context.api.getApp())
        .post('/api/indexing/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          conflictResolution: 'database-wins',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.results.conflictResolution).toBe(
        'database-wins'
      );
    });

    it('should handle timestamp strategy', async () => {
      const response = await request(context.api.getApp())
        .post('/api/indexing/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          conflictResolution: 'timestamp',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.results.conflictResolution).toBe('timestamp');
    });

    it('should handle manual strategy', async () => {
      const response = await request(context.api.getApp())
        .post('/api/indexing/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          conflictResolution: 'manual',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.results.conflictResolution).toBe('manual');
    });
  });
});
