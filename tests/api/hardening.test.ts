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
});
