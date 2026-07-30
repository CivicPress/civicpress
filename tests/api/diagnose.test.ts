import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// HTTP integration tests for the `diagnose` router (`/api/v1/diagnose*`). Every
// endpoint is admin-only via `requireDiagnosticAuth` (401 unauthenticated / 403
// non-admin). The admin path runs the real diagnostic checkers against the test
// project and returns a sanitized report.

// Diagnostics run the DB/search/config/filesystem checkers — allow headroom.
import { vi } from 'vitest';
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

await setupGlobalTestEnvironment();

describe('API Diagnose Integration', () => {
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

  describe('authorization (admin-only via requireDiagnosticAuth)', () => {
    it('rejects an anonymous caller with 401', async () => {
      // The mount runs authMiddleware before requireDiagnosticAuth, so an
      // anonymous caller is stopped at the outer 401 (its code is
      // authMiddleware's, not requireDiagnosticAuth's).
      const response = await request(context.api.getApp()).get(
        '/api/v1/diagnose'
      );
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('rejects a non-admin token with 403', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/diagnose')
        .set('Authorization', `Bearer ${publicToken}`);
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('rejects an anonymous POST /fix with 401', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/diagnose/fix')
        .send({});
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('rejects a non-admin POST /fix with 403', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/diagnose/fix')
        .set('Authorization', `Bearer ${publicToken}`)
        .send({});
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/diagnose (admin)', () => {
    it('runs all checks and returns a sanitized report', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/diagnose')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('overallStatus');
      expect(response.body.data).toHaveProperty('summary');
      expect(Array.isArray(response.body.data.components)).toBe(true);
    });

    it('runs a single component when ?component= is supplied', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/diagnose?component=system')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('overallStatus');
    });

    it('400s on an invalid component name', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/diagnose?component=not-a-component')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
