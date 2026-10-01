import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

/**
 * Parameters that are NAMES, and parameters sent more than once.
 *
 * Two defects, on routes across the API:
 *
 *  1. A `type` validated only as "a string" was joined into a filesystem
 *     path. `type=../../outside` made the server walk whatever directory that
 *     named and answer differently depending on what it found. The core
 *     functions confine the path now; these tests are for the routes, which
 *     should say `400` rather than go looking.
 *
 *  2. express-validator's `isIn`, `isLength`, `matches` and friends run PER
 *     ELEMENT when the value is an array. A parameter sent twice arrives as an
 *     array, passes them all, and then breaks whatever expected a string —
 *     a 500, several of them on routes that need no login.
 */

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

await setupGlobalTestEnvironment();

describe('API parameter validation', () => {
  let context: any;
  let app: any;
  let admin: string;
  let anyone: string;

  const login = async (username: string, role: string) =>
    (await request(app).post('/api/v1/auth/simulated').send({ username, role }))
      .body.data.session.token as string;

  beforeEach(async () => {
    context = await createAPITestContext();
    app = context.api.getApp();
    admin = await login('admin', 'admin');
    // The role a self-registered account gets.
    anyone = await login('anyone', 'public');
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  const ESCAPES = [
    '../../outside',
    '..',
    '/etc',
    'bylaw/../..',
    '..\\..\\outside',
    'bylaw\0',
  ];

  describe('a type is a name', () => {
    describe.each(ESCAPES)('type %j', (type) => {
      it('is refused by POST /validation/record', async () => {
        const response = await request(app)
          .post('/api/v1/validation/record')
          .set('Authorization', `Bearer ${anyone}`)
          .send({ recordId: 'test-record', type });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('is refused by GET /validation/record/:id', async () => {
        const response = await request(app)
          .get('/api/v1/validation/record/test-record')
          .query({ type })
          .set('Authorization', `Bearer ${anyone}`);

        expect(response.status).toBe(400);
      });

      it('is refused by POST /validation/bulk', async () => {
        const response = await request(app)
          .post('/api/v1/validation/bulk')
          .set('Authorization', `Bearer ${anyone}`)
          .send({ recordIds: ['test-record'], types: [type] });

        expect(response.status).toBe(400);
      });

      it('is refused by GET /status/records', async () => {
        const response = await request(app)
          .get('/api/v1/status/records')
          .query({ type })
          .set('Authorization', `Bearer ${admin}`);

        expect(response.status).toBe(400);
      });

      it('is refused by GET /templates', async () => {
        const response = await request(app)
          .get('/api/v1/templates')
          .query({ type })
          .set('Authorization', `Bearer ${admin}`);

        expect(response.status).toBe(400);
      });
    });

    it('is still accepted when it is one', async () => {
      const validated = await request(app)
        .post('/api/v1/validation/record')
        .set('Authorization', `Bearer ${anyone}`)
        .send({ recordId: 'test-record', type: 'bylaw' });
      expect(validated.status).toBe(200);
      expect(validated.body.data.recordId).toBe('test-record');

      const status = await request(app)
        .get('/api/v1/status/records')
        .query({ type: 'bylaw' })
        .set('Authorization', `Bearer ${admin}`);
      expect(status.status).toBe(200);

      const templates = await request(app)
        .get('/api/v1/templates')
        .query({ type: 'bylaw' })
        .set('Authorization', `Bearer ${admin}`);
      expect(templates.status).toBe(200);
    });
  });

  describe('POST /validation/bulk bounds its work', () => {
    const bulk = (body: unknown) =>
      request(app)
        .post('/api/v1/validation/bulk')
        .set('Authorization', `Bearer ${anyone}`)
        .send(body as object);

    it('refuses more than 100 records', async () => {
      // Each entry starts a synchronous search of the records tree.
      const response = await bulk({
        recordIds: Array.from({ length: 101 }, (_, i) => `r${i}`),
      });
      expect(response.status).toBe(400);
    });

    it('refuses an empty list', async () => {
      expect((await bulk({ recordIds: [] })).status).toBe(400);
    });

    it.each([
      ['a number', [7]],
      ['an object', [{ id: 'x' }]],
      ['a nested list', [['x']]],
      ['null', [null]],
    ])('refuses a record id that is %s', async (_label, recordIds) => {
      expect((await bulk({ recordIds })).status).toBe(400);
    });

    it('still validates a list of records', async () => {
      const response = await bulk({
        recordIds: ['test-record', 'old-regulation'],
        types: ['bylaw', 'bylaw'],
      });
      expect(response.status).toBe(200);
    });
  });

  describe('a parameter sent twice is refused, not mishandled', () => {
    it.each([
      [
        'GET /search, sort',
        '/api/v1/search?q=bylaw&sort=title_asc&sort=relevance',
      ],
      ['GET /search, q', '/api/v1/search?q=a&q=b'],
      ['GET /records, sort', '/api/v1/records?sort=title_asc&sort=title_desc'],
      ['GET /records, sort[]', '/api/v1/records?sort[]=title_asc'],
      ['GET /geography, type[]', '/api/v1/geography?type[]=geojson'],
      [
        'GET /geography, category',
        '/api/v1/geography?category=zone&category=route',
      ],
    ])('%s — with no login at all', async (_label, url) => {
      const response = await request(app).get(url);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it.each([
      ['q', '/api/v1/indexing/search?q=a&q=b'],
      ['tags', '/api/v1/indexing/search?q=a&tags=x&tags=y'],
      ['type', '/api/v1/indexing/search?q=a&type[]=bylaw'],
    ])('GET /indexing/search, %s', async (_label, url) => {
      const response = await request(app)
        .get(url)
        .set('Authorization', `Bearer ${admin}`);

      expect(response.status).toBe(400);
    });

    it('GET /indexing/search still requires q', async () => {
      const response = await request(app)
        .get('/api/v1/indexing/search')
        .set('Authorization', `Bearer ${admin}`);

      expect(response.status).toBe(400);
    });
  });

  describe('the same routes, asked properly', () => {
    it.each([
      '/api/v1/search?q=bylaw&sort=title_asc',
      '/api/v1/records?sort=title_desc',
      '/api/v1/geography?type=geojson&category=zone',
    ])('%s', async (url) => {
      expect((await request(app).get(url)).status).toBe(200);
    });
  });
});
