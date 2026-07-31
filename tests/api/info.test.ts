import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// HTTP integration tests for the `info` router (`GET /api/v1/info`). This
// endpoint is PUBLIC (mounted without auth), so its central contract is that
// the system/config block is disclosed ONLY to admins — everyone else sees the
// organization + analytics only.

await setupGlobalTestEnvironment();

describe('API Info Integration', () => {
  let context: any;
  let adminToken: string;
  let publicToken: string;

  beforeEach(async () => {
    context = await createAPITestContext();

    const adminResponse = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin', role: 'admin' });
    adminToken = adminResponse.body.data.session.token;

    const publicResponse = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'public', role: 'public' });
    publicToken = publicResponse.body.data.session.token;
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  describe('GET /api/v1/info', () => {
    it('is public and returns organization + analytics without a token', async () => {
      const response = await request(context.api.getApp()).get('/api/v1/info');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Canonical envelope: fields live under `data`.
      expect(response.body.data).toHaveProperty('organization');
      expect(response.body.data).toHaveProperty('analytics');
    });

    it('does NOT leak the system config block to anonymous callers', async () => {
      const response = await request(context.api.getApp()).get('/api/v1/info');

      expect(response.status).toBe(200);
      expect(response.body.data.system).toBeUndefined();
      expect(response.body.data.user).toBeUndefined();
      // No token → no admin-only note either.
      expect(response.body.data.note).toBeUndefined();
    });

    it('does NOT leak the system config block to a non-admin token', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/info')
        .set('Authorization', `Bearer ${publicToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.system).toBeUndefined();
      // A valid (non-admin) token gets the explanatory note + its own user.
      expect(response.body.data.note).toBe(
        'System config is only visible to admin users.'
      );
      expect(response.body.data.user).toBeDefined();
    });

    it('discloses the system config block (with database) to an admin', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/info')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.system).toBeDefined();
      expect(response.body.data.system).toHaveProperty('database');
      expect(response.body.data.user).toBeDefined();
      // Admins get the real block, not the redaction note.
      expect(response.body.data.note).toBeUndefined();
    });

    it('treats an invalid token as unauthenticated (no system block)', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/info')
        .set('Authorization', 'Bearer not-a-real-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.system).toBeUndefined();
      expect(response.body.data.user).toBeUndefined();
    });
  });
});
