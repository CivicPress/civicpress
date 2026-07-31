import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// HTTP integration tests for the `validation` router (`/api/v1/validation/*`).
// Every endpoint requires `records:view` behind authMiddleware. The fixture
// seeds two bylaw records ('test-record', 'old-regulation'), so the record and
// bulk validators have real files to check; a missing record is reported as a
// RECORD_NOT_FOUND *issue* on a 200 (not a 404).

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

await setupGlobalTestEnvironment();

describe('API Validation Integration', () => {
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
      const response = await request(context.api.getApp())
        .post('/api/v1/validation/record')
        .send({ recordId: 'test-record' });
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/validation/record', () => {
    it('validates an existing record (admin)', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/validation/record')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ recordId: 'test-record' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(typeof response.body.data.isValid).toBe('boolean');
      expect(Array.isArray(response.body.data.issues)).toBe(true);
    });

    it('400s when recordId is missing', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/validation/record')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/validation/bulk', () => {
    it('validates several records and summarizes (admin)', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/validation/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ recordIds: ['test-record', 'old-regulation'] });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.results)).toBe(true);
      expect(response.body.data.summary).toBeDefined();
      expect(typeof response.body.data.summary.validCount).toBe('number');
      expect(typeof response.body.data.summary.invalidCount).toBe('number');
    });

    it('400s when recordIds is not an array', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/validation/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ recordIds: 'not-an-array' });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/validation/status', () => {
    it('returns a validation-status summary (admin)', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/validation/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.summary).toBeDefined();
      expect(typeof response.body.data.summary.totalIssues).toBe('number');
    });

    it('400s on an invalid severity filter', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/validation/status?severity=bogus')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/validation/record/:recordId', () => {
    it('validates a record by id (admin)', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/validation/record/test-record')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(typeof response.body.data.isValid).toBe('boolean');
    });

    it('reports a missing record as an invalid result, not a 404', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/validation/record/no-such-record')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isValid).toBe(false);
      const codes = response.body.data.issues.map((i: any) => i.code);
      expect(codes).toContain('RECORD_NOT_FOUND');
    });
  });
});
