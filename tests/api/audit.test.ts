import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
} from '../fixtures/test-setup';

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

    // Some deployments may return a raw array; pagination is optional
  });
});
