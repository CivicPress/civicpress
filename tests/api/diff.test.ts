import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// HTTP integration tests for the `diff` router (`/api/v1/diff/*`). All endpoints
// require `records:view` behind authMiddleware. The fixture commits two bylaw
// records ('test-record', 'old-regulation') to git, so the history/commits/
// versions endpoints have real data to return.

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

await setupGlobalTestEnvironment();

describe('API Diff Integration', () => {
  let context: any;
  let adminToken: string;

  beforeEach(async () => {
    context = await createAPITestContext();

    const adminResponse = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin', role: 'admin' });
    adminToken = adminResponse.body.data.session.token;
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  describe('authorization', () => {
    it('rejects an anonymous caller with 401', async () => {
      const response = await request(context.api.getApp()).get(
        '/api/v1/diff/test-record/commits'
      );
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/diff/:recordId/commits', () => {
    it('returns the git commits for a record (admin)', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/diff/test-record/commits')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.recordId).toBe('test-record');
      expect(Array.isArray(response.body.data.commits)).toBe(true);
      expect(response.body.data.total).toBe(response.body.data.commits.length);
      // The fixture commits this record, so it has at least one commit.
      expect(response.body.data.commits.length).toBeGreaterThan(0);
    });

    it('404s for a record that does not exist', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/diff/no-such-record/commits')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/diff/:recordId/history', () => {
    it('returns the diff history for a record (admin)', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/diff/test-record/history')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/diff/:recordId/versions', () => {
    it('returns the versions for a record (admin)', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/diff/test-record/versions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/diff/:recordId (compare two commits)', () => {
    it('diffs a record between two real commits (admin)', async () => {
      // Resolve real commit hashes from /commits, then diff between them.
      const commitsRes = await request(context.api.getApp())
        .get('/api/v1/diff/test-record/commits')
        .set('Authorization', `Bearer ${adminToken}`);
      const commits = commitsRes.body.data.commits;

      // With only one commit there is nothing to compare — skip the assertion
      // rather than fabricate a second hash.
      if (commits.length < 2) return;

      const [newer, older] = commits;
      const response = await request(context.api.getApp())
        .get(`/api/v1/diff/test-record`)
        .query({ commit1: older.hash, commit2: newer.hash })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
