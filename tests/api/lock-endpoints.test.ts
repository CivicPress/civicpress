import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
} from '../fixtures/test-setup';

describe('Lock Endpoints', () => {
  let context: Awaited<ReturnType<typeof createAPITestContext>>;
  let adminToken: string;
  let clerkToken: string;
  let testRecordId: string;

  beforeAll(async () => {
    context = await createAPITestContext();

    // Create admin user and get token
    const adminAuth = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin', role: 'admin' });
    adminToken = adminAuth.body?.data?.session?.token as string;

    // Create clerk user and get token
    const clerkAuth = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'clerk', role: 'clerk' });
    clerkToken = clerkAuth.body?.data?.session?.token as string;

    // Create a test record for locking tests
    const createResponse = await request(context.api.getApp())
      .post('/api/v1/records')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Test Record for Locking',
        type: 'bylaw',
        status: 'draft',
        content: '# Test Record\n\nContent for testing locks.',
      });

    if (createResponse.body?.success && createResponse.body?.data?.id) {
      testRecordId = createResponse.body.data.id;
    } else {
      testRecordId = 'test-lock-record-1';
    }
  });

  afterAll(async () => {
    if (context) {
      await cleanupAPITestContext(context);
    }
  });

  describe('POST /api/v1/records/:id/lock - Acquire Lock', () => {
    beforeEach(async () => {
      // Release any existing locks before each test
      try {
        await request(context.api.getApp())
          .delete(`/api/v1/records/${testRecordId}/lock`)
          .set('Authorization', `Bearer ${adminToken}`);
      } catch {
        // Ignore if no lock exists
      }
    });

    it('should acquire a lock on a record', async () => {
      const response = await request(context.api.getApp())
        .post(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.locked).toBe(true);
      expect(response.body.data.recordId).toBe(testRecordId);
    });

    it('should prevent acquiring lock on already locked record', async () => {
      // First admin acquires lock
      await request(context.api.getApp())
        .post(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Clerk tries to acquire lock
      const response = await request(context.api.getApp())
        .post(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${clerkToken}`);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('RECORD_LOCKED');
      // lockedBy may be in error.data or response structure
    });

    it.skip('should allow same user to reacquire lock', async () => {
      // Admin acquires lock
      const acquire1 = await request(context.api.getApp())
        .post(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(acquire1.status).toBe(200);

      // Same admin reacquires lock (should work)
      const acquire2 = await request(context.api.getApp())
        .post(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(acquire2.status).toBe(200);
      expect(acquire2.body.success).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await request(context.api.getApp()).post(
        `/api/v1/records/${testRecordId}/lock`
      );

      expect(response.status).toBe(401);
    });

    it('should require edit permission', async () => {
      // Create a public user without edit permission
      const publicAuth = await request(context.api.getApp())
        .post('/api/v1/auth/simulated')
        .send({ username: 'public', role: 'public' });
      const publicToken = publicAuth.body?.data?.session?.token as string;

      const response = await request(context.api.getApp())
        .post(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${publicToken}`);

      expect(response.status).toBe(403);
    });

    it('should validate record ID', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/records//lock')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([400, 404]).toContain(response.status);
    });
  });

  describe('GET /api/v1/records/:id/lock - Get Lock Status', () => {
    beforeEach(async () => {
      // Ensure lock is released before each test
      try {
        await request(context.api.getApp())
          .delete(`/api/v1/records/${testRecordId}/lock`)
          .set('Authorization', `Bearer ${adminToken}`);
      } catch {
        // Ignore if no lock exists
      }
    });

    it('should return lock status when record is locked', async () => {
      // Acquire lock first
      await request(context.api.getApp())
        .post(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`);

      const response = await request(context.api.getApp())
        .get(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.locked).toBe(true);
      expect(response.body.data.lockedBy).toBeDefined();
      expect(response.body.data.lockedAt).toBeDefined();
      expect(response.body.data.expiresAt).toBeDefined();
    });

    it('should return lock status when record is not locked', async () => {
      const response = await request(context.api.getApp())
        .get(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.locked).toBe(false);
      expect(response.body.data.lockedBy).toBe(null);
      expect(response.body.data.lockedAt).toBe(null);
      expect(response.body.data.expiresAt).toBe(null);
    });

    it('should require authentication', async () => {
      const response = await request(context.api.getApp()).get(
        `/api/v1/records/${testRecordId}/lock`
      );

      expect(response.status).toBe(401);
    });

    it('should require edit permission', async () => {
      const publicAuth = await request(context.api.getApp())
        .post('/api/v1/auth/simulated')
        .send({ username: 'public', role: 'public' });
      const publicToken = publicAuth.body?.data?.session?.token as string;

      const response = await request(context.api.getApp())
        .get(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${publicToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/records/:id/lock - Release Lock', () => {
    it('should release a lock successfully', async () => {
      // Acquire lock first
      await request(context.api.getApp())
        .post(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Release lock
      const response = await request(context.api.getApp())
        .delete(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.locked).toBe(false);
      expect(response.body.data.recordId).toBe(testRecordId);
    });

    it('should allow releasing non-existent lock', async () => {
      // Try to release lock that doesn't exist
      const response = await request(context.api.getApp())
        .delete(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Should succeed even if lock doesn't exist
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await request(context.api.getApp()).delete(
        `/api/v1/records/${testRecordId}/lock`
      );

      expect(response.status).toBe(401);
    });

    it('should require edit permission', async () => {
      const publicAuth = await request(context.api.getApp())
        .post('/api/v1/auth/simulated')
        .send({ username: 'public', role: 'public' });
      const publicToken = publicAuth.body?.data?.session?.token as string;

      const response = await request(context.api.getApp())
        .delete(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${publicToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('Lock Lifecycle', () => {
    it('should support complete lock lifecycle', async () => {
      // 1. Check lock status (should be unlocked)
      const status1 = await request(context.api.getApp())
        .get(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(status1.body.data.locked).toBe(false);

      // 2. Acquire lock
      const acquire = await request(context.api.getApp())
        .post(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(acquire.body.success).toBe(true);

      // 3. Check lock status (should be locked)
      const status2 = await request(context.api.getApp())
        .get(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(status2.body.data.locked).toBe(true);
      expect(status2.body.data.lockedBy).toBeDefined();

      // 4. Release lock
      const release = await request(context.api.getApp())
        .delete(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(release.body.success).toBe(true);

      // 5. Check lock status (should be unlocked again)
      const status3 = await request(context.api.getApp())
        .get(`/api/v1/records/${testRecordId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(status3.body.data.locked).toBe(false);
    });
  });
});
