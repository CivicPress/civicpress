/**
 * FA-API-004 — /api/status* is admin-only.
 *
 * The status surface leaks git commit authors/messages, draft/pending record
 * ids + filenames, the .civic config listing, and process internals. It must
 * require authentication AND system:admin — liveness stays on /api/health.
 */

import request from 'supertest';
import {
  createAPITestContext,
  APITestContext,
  cleanupAPITestContext,
} from '../fixtures/test-setup';

describe('FA-API-004: /api/status authorization', () => {
  let context: APITestContext;
  let adminToken: string;
  let publicToken: string;

  beforeAll(async () => {
    context = await createAPITestContext();

    const admin = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin', role: 'admin' });
    adminToken = admin.body.data.session.token;

    const pub = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'resident', role: 'public' });
    publicToken = pub.body.data.session.token;
  });

  afterAll(async () => {
    await cleanupAPITestContext(context);
  });

  const paths = ['/api/v1/status', '/api/v1/status/git', '/api/v1/status/records'];

  it('rejects unauthenticated access to every status route (401)', async () => {
    for (const p of paths) {
      const res = await request(context.api.getApp()).get(p);
      expect(res.status).toBe(401);
    }
  });

  it('rejects a non-admin authenticated user (403)', async () => {
    for (const p of paths) {
      const res = await request(context.api.getApp())
        .get(p)
        .set('Authorization', `Bearer ${publicToken}`);
      expect(res.status).toBe(403);
    }
  });

  it('allows an admin and does not leak process internals to anyone else', async () => {
    const res = await request(context.api.getApp())
      .get('/api/v1/status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // The unauthenticated body must never have carried this — sanity that the
    // sensitive fields live behind the gate we just added.
    const anon = await request(context.api.getApp()).get('/api/v1/status');
    expect(anon.status).toBe(401);
    expect(JSON.stringify(anon.body)).not.toContain('memory');
  });

  it('liveness stays public on /api/health', async () => {
    const res = await request(context.api.getApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
  });
});
