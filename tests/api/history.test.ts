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

    // Get authentication token
    const authResponse = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({
        username: 'admin',
        role: 'admin',
      });
    authToken = authResponse.body.data.session.token;
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  describe('GET /api/v1/history', () => {
    it('should return history for all records', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.history).toBeDefined();
      expect(Array.isArray(response.body.data.history)).toBe(true);
    });

    it('should filter by record', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/history?record=policy/test-policy')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.history).toBeDefined();
    });

    it('should support pagination', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/history?limit=5&offset=0')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.summary.limit).toBe(5);
    });

    it('should validate limit parameter', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/history?limit=150')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Invalid request data');
    });

    it('should require authentication', async () => {
      const response = await request(context.api.getApp()).get(
        '/api/v1/history'
      );

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/history/:record', () => {
    it('should return history for specific record', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/history/test-record')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.history).toBeDefined();
      expect(Array.isArray(response.body.data.history)).toBe(true);
    });

    it('should filter by author', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/history/test-record?author=test')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.history).toBeDefined();
    });

    it('should filter by date range', async () => {
      const since = new Date();
      since.setDate(since.getDate() - 7); // 7 days ago

      const response = await request(context.api.getApp())
        .get(`/api/v1/history/test-record?since=${since.toISOString()}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.history).toBeDefined();
    });

    it('should return empty history for non-existent record', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/history/non-existent-record')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.history).toBeDefined();
      expect(Array.isArray(response.body.data.history)).toBe(true);
      // Should return empty history for non-existent record
      expect(response.body.data.history.length).toBe(0);
      expect(response.body.data.summary.totalCommits).toBe(0);
    });

    it('should require authentication', async () => {
      const response = await request(context.api.getApp()).get(
        '/api/v1/history/test-record'
      );

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('History Data Structure', () => {
    it('should return properly formatted history entries', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      if (response.body.data.history.length > 0) {
        const entry = response.body.data.history[0];
        expect(entry).toHaveProperty('hash');
        expect(entry).toHaveProperty('record');
        expect(entry).toHaveProperty('message');
        expect(entry).toHaveProperty('author');
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('timestamp');
      }
    });

    it('should return proper summary structure', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      const summary = response.body.data.summary;
      expect(summary).toHaveProperty('totalCommits');
      expect(summary).toHaveProperty('limit');
      expect(summary).toHaveProperty('offset');
      expect(typeof summary.totalCommits).toBe('number');
      expect(typeof summary.limit).toBe('number');
      expect(typeof summary.offset).toBe('number');
    });
  });
});
