import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// Setup global test environment
await setupGlobalTestEnvironment();

/**
 * The config router's failure branches must answer with a fixed, generic
 * string. The raw error belongs in the server log and the audit record only:
 * config errors carry absolute filesystem paths, YAML parser detail, and
 * (for the notifications config) SMTP host/credential hints. Echoing
 * `error.message` onto the wire hands an authenticated-but-curious caller a
 * map of the deployment.
 *
 * These drive naturally reachable failures — no mocking — and assert both the
 * generic shape AND the absence of internal detail.
 */

/** Substrings that would betray internals if they ever reached a client. */
const LEAK_MARKERS = [
  '/home/',
  '/var/',
  '.civic/',
  'ENOENT',
  'no such file',
  'at Object.',
  'at Module.',
  'node_modules',
  'YAMLException',
];

function expectNoLeak(body: unknown) {
  const serialized = JSON.stringify(body ?? {});
  for (const marker of LEAK_MARKERS) {
    expect(serialized).not.toContain(marker);
  }
}

describe('Config API — error responses are redacted', () => {
  let context: any;
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

  it('GET /config/:type for an unknown type returns a generic error, not the raw failure', async () => {
    const response = await request(context.api.getApp())
      .get('/api/v1/config/definitely-not-a-real-config')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toBe('Configuration not found');
    expectNoLeak(response.body);
  });

  it('GET /config/raw/:type for an unknown type returns a generic error', async () => {
    const response = await request(context.api.getApp())
      .get('/api/v1/config/raw/definitely-not-a-real-config')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toBe('Raw configuration not found');
    expectNoLeak(response.body);
  });

  it('rejects a non-bare config type without echoing a RESOLVED path (FA-API-012)', async () => {
    const response = await request(context.api.getApp())
      .get('/api/v1/config/raw/..%2F..%2Fetc%2Fpasswd')
      .set('Authorization', `Bearer ${adminToken}`);

    // Either the traversal is refused as an invalid type (400) or it simply
    // does not resolve (404).
    expect([400, 404]).toContain(response.status);
    expect(response.body.success).toBe(false);

    // The 400 reflects the caller's OWN input back ("Invalid config type:
    // ../../etc/passwd"), which is a controlled validation message rather than
    // a disclosure. What must never appear is where the server would have
    // looked — the resolved data dir / .civic path — which expectNoLeak pins.
    if (response.status === 400) {
      expect(response.body.error.message).toMatch(/^Invalid config type:/);
    }
    expectNoLeak(response.body);
  });

  it('PUT /config/raw/:type with an invalid type does not leak a path', async () => {
    const response = await request(context.api.getApp())
      .put('/api/v1/config/raw/not a bare name')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'text/plain')
      .send('key: value');

    expect(response.body.success).toBe(false);
    expectNoLeak(response.body);
  });
});
