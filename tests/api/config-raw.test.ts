import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
} from '../fixtures/test-setup';

let context: Awaited<ReturnType<typeof createAPITestContext>>;

describe('Config RAW endpoints', () => {
  beforeAll(async () => {
    context = await createAPITestContext();
  }, 60000);

  afterAll(async () => {
    await cleanupAPITestContext(context);
  });

  it('should return 401 without authentication', async () => {
    const res = await request(context.api.getApp()).get(
      '/api/v1/config/raw/org-config'
    );
    expect(res.status).toBe(401);
  });

  it('should return 403 for non-admin (clerk) user', async () => {
    // Simulated clerk session
    const authRes = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'clerk-user', role: 'clerk' });
    const token = authRes.body?.data?.session?.token as string;

    const res = await request(context.api.getApp())
      .get('/api/v1/config/raw/org-config')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('should allow admin to read raw YAML', async () => {
    const authRes = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin-user', role: 'admin' });
    const token = authRes.body?.data?.session?.token as string;

    const res = await request(context.api.getApp())
      .get('/api/v1/config/raw/org-config')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('_metadata:');
    expect(res.text).toContain('name:');
  });

  it('should allow admin to write raw YAML and persist', async () => {
    const authRes = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin-user', role: 'admin' });
    const token = authRes.body?.data?.session?.token as string;

    const updated = `# test org-config\n_metadata:\n  name: Test Org\n  description: Test Desc\n  version: '1.0.0'\n  editable: true\nname:\n  value: Civic Records\n  type: string\n  required: true\n`;

    const putRes = await request(context.api.getApp())
      .put('/api/v1/config/raw/org-config')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'text/yaml')
      .send(updated);
    expect(putRes.status).toBe(200);

    const getRes = await request(context.api.getApp())
      .get('/api/v1/config/raw/org-config')
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.text).toContain('Test Org');
  });
});
