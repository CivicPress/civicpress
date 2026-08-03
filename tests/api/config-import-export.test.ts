import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
} from '../fixtures/test-setup';

let context: Awaited<ReturnType<typeof createAPITestContext>>;

const app = () => context.api.getApp();

async function adminToken(): Promise<string> {
  const res = await request(app())
    .post('/api/v1/auth/simulated')
    .send({ username: 'admin-user', role: 'admin' });
  return res.body?.data?.session?.token as string;
}

async function clerkToken(): Promise<string> {
  const res = await request(app())
    .post('/api/v1/auth/simulated')
    .send({ username: 'clerk-user', role: 'clerk' });
  return res.body?.data?.session?.token as string;
}

describe('Config import/export', () => {
  beforeAll(async () => {
    context = await createAPITestContext();
  }, 60000);

  afterAll(async () => {
    await cleanupAPITestContext(context);
  });

  describe('GET /config/export', () => {
    it('requires authentication', async () => {
      const res = await request(app()).get('/api/v1/config/export');
      expect(res.status).toBe(401);
    });

    it('rejects a non-admin (clerk)', async () => {
      const token = await clerkToken();
      const res = await request(app())
        .get('/api/v1/config/export')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('returns a bundle of non-secret config, excluding credentials', async () => {
      const token = await adminToken();
      const res = await request(app())
        .get('/api/v1/config/export')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.civicpress_config_export).toBe('1');
      expect(typeof res.body.data.exported_at).toBe('string');

      const { files } = res.body.data;
      expect(Object.keys(files)).toContain('org-config');
      expect(Object.keys(files)).toContain('roles');
      expect(files['org-config']).toContain('_metadata');
      // credential-bearing config must never be exported
      expect(Object.keys(files)).not.toContain('notifications');
      expect(Object.keys(files)).not.toContain('storage');
    });
  });

  describe('POST /config/import', () => {
    it('applies a config file and persists it (round-trip via raw)', async () => {
      const token = await adminToken();
      const yaml =
        '_metadata:\n  name: Imported Org\n  editable: true\nname:\n  value: Imported City\n  type: string\n';

      const res = await request(app())
        .post('/api/v1/config/import')
        .set('Authorization', `Bearer ${token}`)
        .send({ files: { 'org-config': yaml } });

      expect(res.status).toBe(200);
      expect(res.body.data.applied).toBe(1);
      expect(res.body.data.results).toEqual([
        { type: 'org-config', status: 'applied' },
      ]);

      const raw = await request(app())
        .get('/api/v1/config/raw/org-config')
        .set('Authorization', `Bearer ${token}`);
      expect(raw.status).toBe(200);
      expect(raw.text).toContain('Imported Org');
    });

    it('skips credential-bearing config instead of writing it', async () => {
      const token = await adminToken();
      const res = await request(app())
        .post('/api/v1/config/import')
        .set('Authorization', `Bearer ${token}`)
        .send({ files: { notifications: 'smtp:\n  password: hunter2\n' } });

      expect(res.status).toBe(200);
      expect(res.body.data.applied).toBe(0);
      expect(res.body.data.skipped).toBe(1);
      expect(res.body.data.results[0]).toMatchObject({
        type: 'notifications',
        status: 'skipped',
      });
    });

    it('rejects unparseable YAML without persisting', async () => {
      const token = await adminToken();
      const res = await request(app())
        .post('/api/v1/config/import')
        .set('Authorization', `Bearer ${token}`)
        .send({ files: { roles: 'a:\n  - [unclosed\n' } });

      expect(res.status).toBe(200);
      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.results[0]).toMatchObject({
        type: 'roles',
        status: 'failed',
      });
      expect(res.body.data.results[0].message).toContain('Invalid YAML');
    });

    it('rejects a non-bare (path-traversal) config type', async () => {
      const token = await adminToken();
      const res = await request(app())
        .post('/api/v1/config/import')
        .set('Authorization', `Bearer ${token}`)
        .send({ files: { '../evil': 'x: 1\n' } });

      expect(res.status).toBe(200);
      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.results[0].status).toBe('failed');
    });

    it('returns 400 when the body has no files map', async () => {
      const token = await adminToken();
      const res = await request(app())
        .post('/api/v1/config/import')
        .set('Authorization', `Bearer ${token}`)
        .send({ nope: true });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_IMPORT_BODY');
    });

    it('rejects a non-admin (clerk)', async () => {
      const token = await clerkToken();
      const res = await request(app())
        .post('/api/v1/config/import')
        .set('Authorization', `Bearer ${token}`)
        .send({ files: { 'org-config': 'name:\n  value: x\n' } });
      expect(res.status).toBe(403);
    });

    it('round-trips an exported bundle back in cleanly', async () => {
      const token = await adminToken();
      const exp = await request(app())
        .get('/api/v1/config/export')
        .set('Authorization', `Bearer ${token}`);
      const bundle = exp.body.data.files;

      const res = await request(app())
        .post('/api/v1/config/import')
        .set('Authorization', `Bearer ${token}`)
        .send({ files: bundle });

      expect(res.status).toBe(200);
      expect(res.body.data.failed).toBe(0);
      expect(res.body.data.applied).toBe(Object.keys(bundle).length);
    });
  });
});
