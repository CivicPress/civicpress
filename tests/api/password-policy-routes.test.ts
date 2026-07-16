import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  APITestContext,
} from '../fixtures/test-setup';

/**
 * Post-audit hardening batch 3 (skeptic follow-up): the password policy must
 * hold on EVERY route that sets a password, not just registration. The
 * adversarial pass proved the admin create (POST /api/v1/users) and update
 * (PUT /api/v1/users/:id) routes hashed inline and bypassed the policy — a
 * working admin with a 1-char password. These lock that shut.
 */
describe('Password policy on admin user routes', () => {
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

  it('POST /api/v1/users rejects a weak password', async () => {
    const res = await request(context.api.getApp())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'weakadmin',
        email: 'weakadmin@example.com',
        password: 'x',
        role: 'admin',
      });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('WEAK_PASSWORD');
  });

  it('POST /api/v1/users accepts a compliant password', async () => {
    const res = await request(context.api.getApp())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'strongadmin',
        email: 'strongadmin@example.com',
        password: 'Str0ng!Passw0rd',
        role: 'public',
      });
    expect([200, 201]).toContain(res.status);
  });

  it('PUT /api/v1/users/:id rejects a weak password', async () => {
    const created = await request(context.api.getApp())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'updatable',
        email: 'updatable@example.com',
        password: 'Str0ng!Passw0rd',
        role: 'public',
      });
    const id = created.body.data?.user?.id ?? created.body.data?.id;
    expect(id).toBeDefined();

    const res = await request(context.api.getApp())
      .put(`/api/v1/users/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'y' });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('WEAK_PASSWORD');
  });
});
