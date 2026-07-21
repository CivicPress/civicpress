import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  APITestContext,
} from '../fixtures/test-setup';

/**
 * Post-audit Tier-C: GET /api/v1/records/:id/raw was registered WITHOUT the
 * optionalAuth middleware its sibling GET routes all use, so req.user was
 * never populated — an authenticated editor was always treated as public
 * and could not fetch their own unpublished draft's raw content.
 */
describe('GET /api/v1/records/:id/raw — authz', () => {
  let context: APITestContext;
  let adminToken: string;

  beforeEach(async () => {
    context = await createAPITestContext();
    const adminResponse = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin', role: 'admin' });
    adminToken = adminResponse.body.data.session.token;
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  it('lets an authenticated editor read an unpublished draft; a public caller gets 404', async () => {
    // POST /records creates an unpublished DRAFT (not a published record).
    const created = await request(context.api.getApp())
      .post('/api/v1/records')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'policy',
        title: 'Draft Raw Authz',
        content: '# Draft Raw Authz\n\nSecret draft body.',
      });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    // Authenticated editor: optionalAuth populates req.user → draft is served.
    const authed = await request(context.api.getApp())
      .get(`/api/v1/records/${id}/raw`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(authed.status).toBe(200);

    // Public caller: the draft is not published → 404 (unchanged, correct).
    const anon = await request(context.api.getApp()).get(
      `/api/v1/records/${id}/raw`
    );
    expect(anon.status).toBe(404);
  });
});
