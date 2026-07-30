import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// HTTP integration tests for the `templates` router (`/api/v1/templates/*`).
// `templates:view` gates reads, `templates:manage` gates writes, all behind
// authMiddleware. Template IDs are `type/name` (the slash is URL-encoded).

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

await setupGlobalTestEnvironment();

describe('API Templates Integration', () => {
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

  describe('authorization', () => {
    it('rejects an anonymous list with 401', async () => {
      const response = await request(context.api.getApp()).get(
        '/api/v1/templates'
      );
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('rejects a create without templates:manage with 403', async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/templates')
        .set('Authorization', `Bearer ${publicToken}`)
        .send({ type: 'bylaw', name: 'nope', content: '# x' });
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/templates', () => {
    it('lists templates for an admin', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/templates')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });
  });

  describe('GET /api/v1/templates/:id', () => {
    it('400s when the id is not in {type}/{name} form', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/templates/badformat')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('404s for a well-formed but non-existent template', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/templates/bylaw%2Fdoes-not-exist')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TEMPLATE_NOT_FOUND');
    });
  });

  describe('create → get → delete round-trip (admin)', () => {
    it('creates, reads back, and deletes a template', async () => {
      const create = await request(context.api.getApp())
        .post('/api/v1/templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'bylaw',
          name: 'api-test-tmpl',
          content: '# {{title}}\n\nBody',
          description: 'created by the templates HTTP test',
        });
      expect(create.status).toBe(201);
      expect(create.body.success).toBe(true);
      expect(create.body.data.template).toBeDefined();

      const get = await request(context.api.getApp())
        .get('/api/v1/templates/bylaw%2Fapi-test-tmpl')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(get.status).toBe(200);
      expect(get.body.success).toBe(true);

      const del = await request(context.api.getApp())
        .delete('/api/v1/templates/bylaw%2Fapi-test-tmpl')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(del.status).toBe(200);
      expect(del.body.success).toBe(true);
    });
  });
});
