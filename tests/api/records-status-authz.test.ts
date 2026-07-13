/**
 * FA-API-008 — status-transition rules are enforced on ALL write paths, not
 * just POST /:id/status.
 *
 * Test workflow (fixtures/test-setup.ts): global transitions
 * draft→proposed→reviewed→approved→archived; the `clerk` role may transition
 * draft→proposed and any→archived, but CANNOT reach 'approved'. So a clerk
 * must not be able to fabricate an 'approved' record via create, PUT, or
 * publish. 'published' is not a transition target — the publish flow still
 * sets it under records:edit.
 */

import request from 'supertest';
import {
  createAPITestContext,
  APITestContext,
  cleanupAPITestContext,
} from '../fixtures/test-setup';

describe('FA-API-008: status-transition authz on write paths', () => {
  let context: APITestContext;
  let adminToken: string;
  let clerkToken: string;

  beforeAll(async () => {
    context = await createAPITestContext();
    const admin = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin', role: 'admin' });
    adminToken = admin.body.data.session.token;
    const clerk = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'clerk', role: 'clerk' });
    clerkToken = clerk.body.data.session.token;
  });

  afterAll(async () => {
    await cleanupAPITestContext(context);
  });

  async function createDraft(token: string, title: string) {
    const res = await request(context.api.getApp())
      .post('/api/v1/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'policy', title, content: '# Body' });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  it('clerk cannot PUBLISH straight to approved (skips the review chain)', async () => {
    const id = await createDraft(clerkToken, 'Clerk Fabricated Approval');
    const res = await request(context.api.getApp())
      .post(`/api/v1/records/${id}/publish`)
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ status: 'approved' });
    expect(res.status).toBe(403);
  });

  it('clerk cannot PUT an existing record to approved', async () => {
    // Admin creates + publishes a record (draft → published) first.
    const id = await createDraft(adminToken, 'Real Policy');
    const pub = await request(context.api.getApp())
      .post(`/api/v1/records/${id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    expect([200, 201]).toContain(pub.status);

    const res = await request(context.api.getApp())
      .put(`/api/v1/records/${id}`)
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ status: 'approved' });
    expect(res.status).toBe(403);
  });

  it('a legitimate publish to published is NOT blocked (published is not a controlled target)', async () => {
    const id = await createDraft(adminToken, 'Normal Publish');
    const res = await request(context.api.getApp())
      .post(`/api/v1/records/${id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' });
    expect([200, 201]).toContain(res.status);
  });

  it('a plain publish with no target status is unaffected', async () => {
    const id = await createDraft(adminToken, 'Publish No Status');
    const res = await request(context.api.getApp())
      .post(`/api/v1/records/${id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect([200, 201]).toContain(res.status);
  });
});
