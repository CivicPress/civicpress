import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// HTTP integration tests for the `cache` router (`/api/v1/cache/*`). The whole
// router is mounted behind `authMiddleware` + `requirePermission('system:admin')`,
// so the first contract is that it is admin-only; the second is the shape of the
// four read endpoints (metrics, metrics/:name, health, list).

await setupGlobalTestEnvironment();

describe('API Cache Metrics Integration', () => {
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

  const ENDPOINTS = ['/metrics', '/metrics/search', '/health', '/list'];

  describe('authorization (admin-only router)', () => {
    it('rejects anonymous callers with 401 on every endpoint', async () => {
      for (const path of ENDPOINTS) {
        const response = await request(context.api.getApp()).get(
          `/api/v1/cache${path}`
        );
        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      }
    });

    it('rejects a non-admin token with 403 on every endpoint', async () => {
      for (const path of ENDPOINTS) {
        const response = await request(context.api.getApp())
          .get(`/api/v1/cache${path}`)
          .set('Authorization', `Bearer ${publicToken}`);
        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
      }
    });
  });

  describe('GET /api/v1/cache/list', () => {
    it('lists the registered caches with a matching count (admin)', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/cache/list')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.caches)).toBe(true);
      expect(response.body.data.count).toBe(response.body.data.caches.length);
      // Core registers named caches (search, templates, …) at startup.
      expect(response.body.data.count).toBeGreaterThan(0);
      for (const c of response.body.data.caches) {
        expect(c).toHaveProperty('name');
      }
    });
  });

  describe('GET /api/v1/cache/metrics', () => {
    it('returns global stats with per-cache + global sections (admin)', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/cache/metrics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('caches');
      expect(response.body.data).toHaveProperty('global');
    });
  });

  describe('GET /api/v1/cache/metrics/:name', () => {
    it('returns stats for a real cache (admin)', async () => {
      // Resolve a real cache name from /list rather than hardcoding one.
      const list = await request(context.api.getApp())
        .get('/api/v1/cache/list')
        .set('Authorization', `Bearer ${adminToken}`);
      const name = list.body.data.caches[0]?.name;
      expect(name).toBeTruthy();

      const response = await request(context.api.getApp())
        .get(`/api/v1/cache/metrics/${name}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(name);
    });

    it('404s for an unknown cache name (admin)', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/cache/metrics/does-not-exist-xyz')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CACHE_NOT_FOUND');
    });
  });

  describe('GET /api/v1/cache/health', () => {
    it('returns an overall + per-cache health snapshot (admin)', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/cache/health')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(typeof response.body.data.healthy).toBe('boolean');
      expect(response.body.data).toHaveProperty('caches');
      expect(response.body.data).toHaveProperty('global');
    });
  });
});
