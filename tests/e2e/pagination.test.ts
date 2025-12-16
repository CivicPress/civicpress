import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
} from '../fixtures/test-setup';

describe('Pagination E2E Tests', () => {
  let context: Awaited<ReturnType<typeof createAPITestContext>>;
  let adminToken: string;

  beforeAll(async () => {
    context = await createAPITestContext();

    const adminAuth = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin', role: 'admin' });
    adminToken = adminAuth.body?.data?.session?.token as string;
  });

  afterAll(async () => {
    if (context) {
      await cleanupAPITestContext(context);
    }
  });

  describe('Records List Pagination', () => {
    it('should return paginated results with correct structure', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/records?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('records');
      expect(response.body.data).toHaveProperty('currentPage', 1);
      expect(response.body.data).toHaveProperty('totalPages');
      expect(response.body.data).toHaveProperty('totalCount');
      expect(response.body.data).toHaveProperty('pageSize', 10);
    });
  });
});
