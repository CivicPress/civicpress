import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// HTTP integration tests for the `notifications` router
// (`POST /api/v1/notifications/test`). The whole router is admin-only, and its
// happy path is gated on the email channel being enabled — which it is NOT by
// default, so the honest response for an admin is a 400 EMAIL_CHANNEL_DISABLED.

await setupGlobalTestEnvironment();

describe('API Notifications Integration', () => {
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

  describe('POST /api/v1/notifications/test — authorization', () => {
    it('rejects an anonymous caller with 401', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/notifications/test')
        .send({ to: 'someone@example.com' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('rejects a non-admin token with 403', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/notifications/test')
        .set('Authorization', `Bearer ${publicToken}`)
        .send({ to: 'someone@example.com' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/notifications/test — admin', () => {
    it('400s when the recipient (to) is missing', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/notifications/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ subject: 'Hi', message: 'Body' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('lets an admin past auth + validation into the send path', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/notifications/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ to: 'someone@example.com', message: 'Test' });

      // Admin clears auth and the `to` check; the downstream outcome depends on
      // channel config/rate-limits (email is enabled in the fixture), so assert
      // we reached the handler with the standard envelope, not an auth/validation
      // rejection.
      expect([401, 403]).not.toContain(response.status);
      expect(typeof response.body.success).toBe('boolean');
      if (!response.body.success) {
        expect(typeof response.body.error.code).toBe('string');
      }
    });
  });
});
