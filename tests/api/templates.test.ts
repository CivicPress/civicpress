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

  /**
   * Preview substitutes caller-supplied variables into a template. It needs
   * only `templates:view`, which the shipped `roles.yml` gives the clerk role.
   * (The fixture's does not, so these run as admin.)
   */
  describe('POST /api/v1/templates/:id/preview', () => {
    const TEMPLATE = [
      '# {{title}}',
      '',
      // A run of ordinary text: what a pattern with a nested quantifier gets
      // stuck on.
      'the quick brown fox jumps over the lazy dog and keeps on running',
      '',
      'By {{author}}.',
    ].join('\n');

    beforeEach(async () => {
      const created = await request(context.api.getApp())
        .post('/api/v1/templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'bylaw', name: 'preview-me', content: TEMPLATE });
      expect(created.status).toBe(201);
    });

    const preview = (variables: unknown) =>
      request(context.api.getApp())
        .post('/api/v1/templates/bylaw%2Fpreview-me/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ variables });

    it('substitutes the variables it is given', async () => {
      const response = await preview({ title: 'Noise', author: 'Ada' });

      expect(response.status).toBe(200);
      expect(response.body.data.rendered).toContain('# Noise');
      expect(response.body.data.rendered).toContain('By Ada.');
    });

    it('treats a variable NAME as a name, not as a pattern', async () => {
      // The name used to go into a regular expression as written. This one
      // is exponential against the line of text above; the request did not
      // come back.
      const started = Date.now();

      const response = await preview({
        title: 'Noise',
        author: 'Ada',
        'q|([a-z ]+)+!|q': 'x',
      });

      expect(response.status).toBe(200);
      expect(Date.now() - started).toBeLessThan(3000);
      expect(response.body.data.rendered).toContain(
        'the quick brown fox jumps over the lazy dog'
      );
    });

    it('does not let one name replace every placeholder', async () => {
      const response = await preview({ author: 'Ada', '.*': 'TAKEN' });

      expect(response.status).toBe(200);
      expect(response.body.data.rendered).toContain('By Ada.');
      expect(response.body.data.rendered).not.toContain('TAKEN');
    });

    it('answers 200, not 500, for a name that is not a valid pattern', async () => {
      const response = await preview({ title: 'Noise', 'a(': 'x' });

      expect(response.status).toBe(200);
    });

    it('keeps replacement patterns in a value literal', async () => {
      const response = await preview({ title: "[$`|$&|$']", author: 'Ada' });

      expect(response.body.data.rendered).toContain("# [$`|$&|$']");
    });

    it.each([
      [
        'more than 100 variables',
        Object.fromEntries(
          Array.from({ length: 101 }, (_, i) => [`v${i}`, 'x'])
        ),
      ],
      ['a value of 20 KB', { title: 'x'.repeat(20001) }],
      [
        'values that add up to 20 KB',
        { a: 'x'.repeat(10000), b: 'y'.repeat(10001) },
      ],
      ['a name of 101 characters', { ['n'.repeat(101)]: 'x' }],
      ['an empty name', { '': 'x' }],
      ['a list instead of an object', ['title']],
    ])('refuses %s', async (_label, variables) => {
      expect((await preview(variables)).status).toBe(400);
    });
  });

  describe('what a template may contain', () => {
    const create = (body: Record<string, unknown>) =>
      request(context.api.getApp())
        .post('/api/v1/templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'bylaw',
          name: 'bounded',
          content: '# {{title}}',
          ...body,
        });

    it('refuses a body over 200 KB', async () => {
      expect((await create({ content: 'x'.repeat(200001) })).status).toBe(400);
    });

    it.each(['../private', '../../x/y', 'bylaw', 'a/b/c', '/etc/passwd'])(
      'refuses extends: %j',
      async (parent) => {
        expect((await create({ extends: parent })).status).toBe(400);
      }
    );

    it('accepts extends: type/name', async () => {
      expect((await create({ extends: 'bylaw/default' })).status).toBe(201);
    });
  });
});
