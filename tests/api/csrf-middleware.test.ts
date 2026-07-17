import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SecretsManager, CsrfProtection } from '@civicpress/core';
import { csrfMiddleware } from '../../modules/api/src/middleware/csrf.js';

// FA-API-018: the CSRF layer must not be skippable by a header any client can
// set. The only legitimate skips are Bearer-token auth (header auth is not
// cross-site forgeable) and a valid CSRF token.
describe('csrfMiddleware (FA-API-018)', () => {
  let app: express.Express;
  let csrf: CsrfProtection;

  beforeAll(async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civic-csrf-mw-'));
    process.env.CIVICPRESS_SECRET = 'a'.repeat(128);
    const secretsManager = SecretsManager.getInstance(tempDir);
    await secretsManager.initialize();
    csrf = new CsrfProtection(secretsManager);

    const fakeCivicPress = {
      getSecretsManager: () => secretsManager,
    } as unknown as Parameters<typeof csrfMiddleware>[0];

    app = express();
    app.use(express.json());
    app.post('/guarded', csrfMiddleware(fakeCivicPress), (_req, res) => {
      res.json({ ok: true });
    });
  });

  it('no longer honours X-CSRF-Bypass: true', async () => {
    const res = await request(app)
      .post('/guarded')
      .set('X-CSRF-Bypass', 'true')
      .send({});
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('CSRF_TOKEN_MISSING');
  });

  it('still skips for Bearer-token (header-auth) clients', async () => {
    const res = await request(app)
      .post('/guarded')
      .set('Authorization', 'Bearer some-api-token')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body?.ok).toBe(true);
  });

  it('accepts a valid CSRF token', async () => {
    const { token } = csrf.generateToken();
    const res = await request(app)
      .post('/guarded')
      .set('X-CSRF-Token', token)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body?.ok).toBe(true);
  });

  it('rejects a request with no token and no Bearer', async () => {
    const res = await request(app).post('/guarded').send({});
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('CSRF_TOKEN_MISSING');
  });
});

// Regression: the middleware runs mounted AT apiPath('config'), so Express
// strips that base from req.path. The FA-API-018 skip must reconstruct the
// full path (req.baseUrl + req.path) — matching on the bare, stripped req.path
// silently made the *public* config-validation endpoint demand a CSRF token
// (403), while a query-string spoof must still NOT skip CSRF on a write route.
describe('csrfMiddleware — config-validate skip under the real /api/v1/config mount', () => {
  let app: express.Express;

  beforeAll(async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civic-csrf-mount-'));
    process.env.CIVICPRESS_SECRET = 'a'.repeat(128);
    const secretsManager = SecretsManager.getInstance(tempDir);
    await secretsManager.initialize();
    const fakeCivicPress = {
      getSecretsManager: () => secretsManager,
    } as unknown as Parameters<typeof csrfMiddleware>[0];

    // Mirror index.ts: csrfMiddleware is mounted at apiPath('config') in front
    // of the config router, so req.baseUrl === '/api/v1/config' inside it.
    const configRouter = express.Router();
    configRouter.post('/:type/validate', (_req, res) => res.json({ ok: true }));
    configRouter.put('/raw/:key', (_req, res) => res.json({ wrote: true }));

    app = express();
    app.use(express.json());
    app.use('/api/v1/config', csrfMiddleware(fakeCivicPress), configRouter);
  });

  it('skips CSRF for the public /config/:type/validate route (no token → 200)', async () => {
    const res = await request(app)
      .post('/api/v1/config/analytics/validate')
      .send();
    expect(res.status).toBe(200);
    expect(res.body?.ok).toBe(true);
  });

  it('still enforces CSRF on a config write even with a /validate query spoof', async () => {
    // FA-API-018: `?x=/validate` must not make the write route look like validate.
    const res = await request(app)
      .put('/api/v1/config/raw/roles?x=/validate')
      .send({});
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('CSRF_TOKEN_MISSING');
  });
});
