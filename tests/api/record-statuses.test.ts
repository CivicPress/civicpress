import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// Setup global test environment
await setupGlobalTestEnvironment();

describe('Record Statuses API Endpoints', () => {
  let context: any;
  let adminToken: string;

  beforeEach(async () => {
    context = await createAPITestContext();

    // Get authentication token for admin
    const adminResponse = await request(context.api.getApp())
      .post('/auth/simulated')
      .send({
        username: 'admin',
        role: 'admin',
      });
    adminToken = adminResponse.body.data.session.token;
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  describe('GET /api/v1/system/record-statuses', () => {
    it('should return record statuses with correct structure', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/system/record-statuses')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('record_statuses');
      expect(response.body.data).toHaveProperty('total');
      expect(Array.isArray(response.body.data.record_statuses)).toBe(true);
      expect(typeof response.body.data.total).toBe('number');
    });

    it('should return all expected default statuses', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/system/record-statuses')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const statuses = response.body.data.record_statuses;

      // Check that all expected statuses are present
      const expectedStatuses = [
        'draft',
        'proposed',
        'review',
        'approved',
        'rejected',
        'adopted',
        'archived',
      ];
      const actualStatuses = statuses.map((s: any) => s.key);

      expectedStatuses.forEach((expectedStatus) => {
        expect(actualStatuses).toContain(expectedStatus);
      });
    });

    it('should return statuses with correct metadata structure', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/system/record-statuses')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const statuses = response.body.data.record_statuses;

      statuses.forEach((status: any) => {
        expect(status).toHaveProperty('key');
        expect(status).toHaveProperty('label');
        expect(status).toHaveProperty('description');
        expect(status).toHaveProperty('color');
        expect(status).toHaveProperty('priority');

        expect(typeof status.key).toBe('string');
        expect(typeof status.label).toBe('string');
        expect(typeof status.description).toBe('string');
        expect(typeof status.color).toBe('string');
        expect(typeof status.priority).toBe('number');
      });
    });

    it('should be accessible without authentication (public endpoint)', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/system/record-statuses')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('record_statuses');
    });
  });
});
