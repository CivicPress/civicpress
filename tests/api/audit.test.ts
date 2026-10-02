import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
} from '../fixtures/test-setup';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

let context: Awaited<ReturnType<typeof createAPITestContext>>;

describe('Audit API', () => {
  beforeAll(async () => {
    context = await createAPITestContext();
  }, 60000);

  afterAll(async () => {
    await cleanupAPITestContext(context);
  });

  it('should return 401 when unauthenticated', async () => {
    const res = await request(context.api.getApp()).get('/api/v1/audit');
    expect(res.status).toBe(401);
  });

  it('should return 403 for non-admin user', async () => {
    const authRes = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'clerk-user', role: 'clerk' });
    const token = authRes.body?.data?.session?.token as string;

    const res = await request(context.api.getApp())
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('should list audit entries for admin and include a config action', async () => {
    // Login as admin
    const adminAuth = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin-user', role: 'admin' });
    const adminToken = adminAuth.body?.data?.session?.token as string;

    // Generate an audit entry by PUT raw config
    const updatedYaml = `# test org-config\n_metadata:\n  name: Test Org\n  description: Test Desc\n  version: '1.0.0'\n  editable: true\nname:\n  value: Civic Records\n  type: string\n  required: true\n`;
    const putRes = await request(context.api.getApp())
      .put('/api/v1/config/raw/org-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'text/yaml')
      .send(updatedYaml);
    expect(putRes.status).toBe(200);

    // Fetch audit entries
    const res = await request(context.api.getApp())
      .get('/api/v1/audit?limit=50')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
    const data = res.body?.data;
    const entries = data?.entries || [];
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);

    const hasConfigPut = entries.some(
      (e: any) => e?.action === 'config:raw:put' || e?.action === 'config:save'
    );
    expect(hasConfigPut).toBe(true);

    // Since 2026-10-02 the page reads `audit_logs`, where the API's events
    // now land too. The entry carries who did it and from where, and the
    // table answers the page's filters.
    const configPut = entries.find((e: any) => e?.action === 'config:raw:put');
    expect(configPut).toMatchObject({
      source: 'api',
      outcome: 'success',
      actor: { username: 'admin-user', role: 'admin' },
      target: { type: 'config', id: 'org-config' },
    });
    expect(configPut.id).toMatch(/^db_\d+$/);

    const filtered = await request(context.api.getApp())
      .get('/api/v1/audit?action=config:raw:put&source=api&actor=admin-user')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.pagination.total).toBeGreaterThanOrEqual(1);
    expect(
      filtered.body.data.entries.every(
        (e: any) => e.action === 'config:raw:put'
      )
    ).toBe(true);

    const none = await request(context.api.getApp())
      .get('/api/v1/audit?source=cli&action=config:raw:put')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(none.body.data.pagination.total).toBe(0);

    // A limit that is not a number is the default, not a 500.
    const junk = await request(context.api.getApp())
      .get('/api/v1/audit?limit=abc&offset=xyz')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(junk.status).toBe(200);
    expect(junk.body.data.pagination).toMatchObject({ limit: 100, offset: 0 });
  });

  it('imports the activity file an upgraded instance already has, on the first read', async () => {
    const fresh = await createAPITestContext();
    try {
      // The instance's OWN system-data directory, derived from the running
      // instance — never from CentralConfigManager, which can resolve to the
      // repository's dev instance and overwrite its real files (it did once).
      const dir = join(dirname(fresh.civic.getDataDir()), '.system-data');
      expect(dir.startsWith(tmpdir())).toBe(true);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'activity.log'),
        JSON.stringify({
          id: 'act_old',
          timestamp: '2026-08-15T09:30:00.000Z',
          source: 'cli',
          actor: { username: 'ops' },
          action: 'config:import',
          target: { type: 'config', id: 'roles' },
          outcome: 'success',
          message: 'imported by hand',
        }) + '\n'
      );
      const auth = await request(fresh.api.getApp())
        .post('/api/v1/auth/simulated')
        .send({ username: 'admin-user', role: 'admin' });
      const token = auth.body?.data?.session?.token as string;
      const res = await request(fresh.api.getApp())
        .get('/api/v1/audit?action=config:import')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const [entry] = res.body.data.entries;
      expect(entry).toMatchObject({
        source: 'cli',
        action: 'config:import',
        actor: { username: 'ops' },
        message: 'imported by hand',
        timestamp: '2026-08-15T09:30:00.000Z',
      });
      expect(entry.id).toMatch(/^db_\d+$/);
    } finally {
      await cleanupAPITestContext(fresh);
    }
  });
});
