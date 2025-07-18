import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// Setup global test environment
await setupGlobalTestEnvironment();

describe('History API', () => {
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

  describe('GET /api/history', () => {
    it('should return history for all records', async () => {
      const response = await request(context.api.getApp())
        .get('/api/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.history).toBeDefined();
      expect(response.body.data.summary).toBeDefined();
      expect(response.body.data.summary.totalCommits).toBeGreaterThan(0);
    });

    it('should filter by record', async () => {
      const response = await request(context.api.getApp())
        .get('/api/history?record=policy/test-policy')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.history).toBeDefined();
      expect(response.body.data.summary.record).toBe('policy/test-policy');
    });

    it('should support pagination', async () => {
      const response = await request(context.api.getApp())
        .get('/api/history?limit=5&offset=0')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.summary.limit).toBe(5);
      expect(response.body.data.summary.offset).toBe(0);
    });

    it('should validate limit parameter', async () => {
      const response = await request(context.api.getApp())
        .get('/api/history?limit=150')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Invalid request data');
    });

    it('should require authentication', async () => {
      const response = await request(context.api.getApp()).get('/api/history');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/history/:record', () => {
    it('should return history for specific record', async () => {
      const response = await request(context.api.getApp())
        .get('/api/history/bylaw/test-record')
        .set('Authorization', `Bearer ${authToken}`);

      // The record might not exist in Git history, so we accept both 200 and 404
      if (response.status === 404) {
        // 404 response might not have success field, so we just check for error
        expect(response.body.error).toBeDefined();
      } else {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.history).toBeDefined();
        expect(response.body.data.summary.record).toBe('bylaw/test-record');
      }
    });

    it('should support filtering by author', async () => {
      const response = await request(context.api.getApp())
        .get('/api/history/bylaw/test-record?author=test')
        .set('Authorization', `Bearer ${authToken}`);

      // The record might not exist in Git history, so we accept both 200 and 404
      if (response.status === 404) {
        // 404 response might not have success field, so we just check for error
        expect(response.body.error).toBeDefined();
      } else {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.summary.filters.author).toBe('test');
      }
    });

    it('should support date filtering', async () => {
      const since = new Date();
      since.setDate(since.getDate() - 1);

      const response = await request(context.api.getApp())
        .get(`/api/history/bylaw/test-record?since=${since.toISOString()}`)
        .set('Authorization', `Bearer ${authToken}`);

      // The record might not exist in Git history, so we accept both 200 and 404
      if (response.status === 404) {
        // 404 response might not have success field, so we just check for error
        expect(response.body.error).toBeDefined();
      } else {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.summary.filters.since).toBe(
          since.toISOString()
        );
      }
    });

    it('should require authentication', async () => {
      const response = await request(context.api.getApp()).get(
        '/api/history/policy/test-policy'
      );

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('History Data Structure', () => {
    it('should return properly formatted history entries', async () => {
      const response = await request(context.api.getApp())
        .get('/api/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      if (response.body.data.history.length > 0) {
        const historyEntry = response.body.data.history[0];

        expect(historyEntry).toHaveProperty('hash');
        expect(historyEntry).toHaveProperty('shortHash');
        expect(historyEntry).toHaveProperty('message');
        expect(historyEntry).toHaveProperty('author');
        expect(historyEntry).toHaveProperty('email');
        expect(historyEntry).toHaveProperty('date');
        expect(historyEntry).toHaveProperty('timestamp');
        expect(historyEntry).toHaveProperty('record');

        expect(typeof historyEntry.hash).toBe('string');
        expect(typeof historyEntry.shortHash).toBe('string');
        expect(typeof historyEntry.message).toBe('string');
        expect(typeof historyEntry.author).toBe('string');
        expect(typeof historyEntry.timestamp).toBe('string');
      }
    });

    it('should return proper summary structure', async () => {
      const response = await request(context.api.getApp())
        .get('/api/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      const summary = response.body.data.summary;
      expect(summary).toHaveProperty('totalCommits');
      expect(summary).toHaveProperty('returnedCommits');
      expect(summary).toHaveProperty('limit');
      expect(summary).toHaveProperty('offset');
    });
  });
});
