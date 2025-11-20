import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// Setup global test environment
await setupGlobalTestEnvironment();

describe('Config API Endpoints', () => {
  let context: any;
  let adminToken: string;

  beforeEach(async () => {
    context = await createAPITestContext();

    // Get authentication token for admin
    const adminResponse = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({
        username: 'admin',
        role: 'admin',
      });
    adminToken = adminResponse.body.data.session.token;
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  describe('GET /api/v1/system/record-types', () => {
    it('should return record types with correct structure', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/system/record-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('record_types');
      expect(response.body.data).toHaveProperty('total');
      expect(Array.isArray(response.body.data.record_types)).toBe(true);
      expect(typeof response.body.data.total).toBe('number');
    });

    it('should return all expected record types', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/system/record-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const recordTypes = response.body.data.record_types;

      // Check that all expected record types are present (including new types)
      const expectedTypes = [
        'bylaw',
        'ordinance',
        'policy',
        'proclamation',
        'resolution',
        'geography',
        'session',
      ];
      const actualTypes = recordTypes.map((rt: any) => rt.key);

      expectedTypes.forEach((expectedType) => {
        expect(actualTypes).toContain(expectedType);
      });
    });

    it('should return record types with correct metadata', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/system/record-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const recordTypes = response.body.data.record_types;

      recordTypes.forEach((recordType: any) => {
        expect(recordType).toHaveProperty('key');
        expect(recordType).toHaveProperty('label');
        expect(recordType).toHaveProperty('description');
        expect(recordType).toHaveProperty('source');
        expect(recordType).toHaveProperty('priority');

        expect(typeof recordType.key).toBe('string');
        expect(typeof recordType.label).toBe('string');
        expect(typeof recordType.description).toBe('string');
        expect(['core', 'module', 'plugin']).toContain(recordType.source);
        expect(typeof recordType.priority).toBe('number');
      });
    });

    it('should be accessible without authentication (public endpoint)', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/system/record-types')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('record_types');
    });
  });
});
