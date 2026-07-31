/**
 * FA-API-006 — helmet security headers + rate limiting are actually wired.
 *
 * The middleware was declared in package.json since the beginning but had
 * zero call sites. These tests pin the wiring so it can't silently regress.
 */

import request from 'supertest';
import {
  createAPITestContext,
  APITestContext,
  cleanupAPITestContext,
} from '../fixtures/test-setup';

describe('API hardening (FA-API-006)', () => {
  describe('security headers (helmet)', () => {
    let context: APITestContext;

    beforeAll(async () => {
      context = await createAPITestContext();
    });

    afterAll(async () => {
      await cleanupAPITestContext(context);
    });

    it('every response carries the helmet header set', async () => {
      const response = await request(context.api.getApp()).get(
        '/api/v1/health'
      );

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
      // CORP stays cross-origin so the UI (different origin) can embed
      // API-served media (<video src>) — see FA-BB-002 Commit D.
      expect(response.headers['cross-origin-resource-policy']).toBe(
        'cross-origin'
      );
    });
  });

  describe('rate limiting', () => {
    let context: APITestContext;

    beforeAll(async () => {
      // Opt-in under NODE_ENV=test with a tiny auth window we can trip.
      process.env.RATE_LIMIT_ENFORCE = 'true';
      process.env.RATE_LIMIT_AUTH_MAX = '3';
      context = await createAPITestContext();
    });

    afterAll(async () => {
      delete process.env.RATE_LIMIT_ENFORCE;
      delete process.env.RATE_LIMIT_AUTH_MAX;
      await cleanupAPITestContext(context);
    });

    it('throttles the credential surface after the auth window is spent', async () => {
      const attempt = () =>
        request(context.api.getApp())
          .post('/api/v1/auth/login')
          .send({ username: 'nobody', password: 'wrong-password' });

      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        statuses.push((await attempt()).status);
      }

      // The first 3 fail as bad credentials; the window then closes with 429.
      expect(statuses.slice(0, 3).every((s) => s !== 429)).toBe(true);
      expect(statuses[statuses.length - 1]).toBe(429);
      // Standard draft-7 header advertises the limit.
      const limited = await attempt();
      expect(limited.status).toBe(429);
      expect(limited.headers['ratelimit']).toBeDefined();
    });

    it('non-auth routes stay under the generous global ceiling', async () => {
      const response = await request(context.api.getApp()).get(
        '/api/v1/health'
      );
      expect(response.status).toBe(200);
    });
  });

  // Carry-forward hardening (2026-07-02 audit, core/src/search follow-up):
  // the two PUBLIC search endpoints validated `q` as non-empty but with no
  // upper bound, so a long query built an oversized FTS5 expression on the
  // event loop. A 512-char cap closes that lever.
  describe('search query length cap', () => {
    let context: APITestContext;

    beforeAll(async () => {
      context = await createAPITestContext();
    });

    afterAll(async () => {
      await cleanupAPITestContext(context);
    });

    const overLong = 'a'.repeat(513);

    it('rejects an over-long q on GET /api/v1/search with 400', async () => {
      const response = await request(context.api.getApp()).get(
        `/api/v1/search?q=${overLong}`
      );
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(response.body.error.details)).toContain(
        'at most 512'
      );
    });

    it('rejects an over-long q on GET /api/v1/search/suggestions with 400', async () => {
      const response = await request(context.api.getApp()).get(
        `/api/v1/search/suggestions?q=${overLong}`
      );
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts a q at the 512-char boundary (not rejected for length)', async () => {
      const response = await request(context.api.getApp()).get(
        `/api/v1/search?q=${'a'.repeat(512)}`
      );
      expect(response.status).not.toBe(400);
    });
  });
});
