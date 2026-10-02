import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  createAPITestContext,
  cleanupAPITestContext,
} from '../fixtures/test-setup';
import request from 'supertest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// The surfaces that wrote no audit entry at all until 2026-10-02 — geography,
// templates, file storage, indexing, record locks — and the trail they now
// leave, read back through `GET /api/v1/audit`, which reads `audit_logs`.

describe('Audit coverage of the formerly silent surfaces', () => {
  let context: Awaited<ReturnType<typeof createAPITestContext>>;
  let adminToken: string;
  let tmp: string;

  const app = () => request(context.api.getApp());
  const entriesFor = async (action: string) => {
    const res = await app()
      .get(`/api/v1/audit?action=${encodeURIComponent(action)}&source=api`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    return res.body.data.entries as Array<{
      action: string;
      source: string;
      outcome: string;
      actor?: { id?: number | string; username?: string; role?: string };
      target?: { type: string; id?: string; name?: string };
      metadata?: Record<string, unknown>;
    }>;
  };

  beforeAll(async () => {
    context = await createAPITestContext();
    const adminAuth = await app()
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin-user', role: 'admin' });
    adminToken = adminAuth.body?.data?.session?.token as string;
    tmp = mkdtempSync(join(tmpdir(), 'civic-audit-cov-'));
  });

  afterAll(async () => {
    rmSync(tmp, { recursive: true, force: true });
    await cleanupAPITestContext(context);
  });

  it('templates:create / update / delete', async () => {
    const create = await app()
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'bylaw', name: 'audited-tmpl', content: '# {{title}}' });
    expect(create.status).toBe(201);
    const id = create.body.data.template.id as string;

    const update = await app()
      .put(`/api/v1/templates/${encodeURIComponent(id)}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content: '# {{title}}\n\nmore' });
    expect(update.status).toBe(200);

    const del = await app()
      .delete(`/api/v1/templates/${encodeURIComponent(id)}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    for (const action of [
      'templates:create',
      'templates:update',
      'templates:delete',
    ]) {
      const [entry] = await entriesFor(action);
      expect(entry, action).toBeDefined();
      expect(entry.outcome).toBe('success');
      expect(entry.actor?.username).toBe('admin-user');
      expect(entry.actor?.role).toBe('admin');
      expect(entry.target?.type).toBe('template');
      expect(entry.target?.id).toBe(id);
    }
  });

  it('records:lock / records:unlock', async () => {
    const created = await app()
      .post('/api/v1/records')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Lock me',
        type: 'bylaw',
        status: 'draft',
        content: '# x',
      });
    expect(created.status).toBe(201);
    const recordId = created.body.data.id as string;

    expect(
      (
        await app()
          .post(`/api/v1/records/${recordId}/lock`)
          .set('Authorization', `Bearer ${adminToken}`)
      ).status
    ).toBe(200);
    expect(
      (
        await app()
          .delete(`/api/v1/records/${recordId}/lock`)
          .set('Authorization', `Bearer ${adminToken}`)
      ).status
    ).toBe(200);

    const [lock] = await entriesFor('records:lock');
    expect(lock?.target).toMatchObject({ type: 'record', id: recordId });
    const [unlock] = await entriesFor('records:unlock');
    expect(unlock?.outcome).toBe('success');

    // A lock refused because someone else holds it leaves a failure entry.
    const clerkAuth = await app()
      .post('/api/v1/auth/simulated')
      .send({ username: 'clerk-user', role: 'clerk' });
    const clerkToken = clerkAuth.body?.data?.session?.token as string;
    expect(
      (
        await app()
          .post(`/api/v1/records/${recordId}/lock`)
          .set('Authorization', `Bearer ${adminToken}`)
      ).status
    ).toBe(200);
    expect(
      (
        await app()
          .post(`/api/v1/records/${recordId}/lock`)
          .set('Authorization', `Bearer ${clerkToken}`)
      ).status
    ).toBe(409);
    const refused = (await entriesFor('records:lock')).find(
      (e) => e.outcome === 'failure'
    );
    expect(refused?.actor?.username).toBe('clerk-user');
    expect(
      (
        await app()
          .delete(`/api/v1/records/${recordId}/lock`)
          .set('Authorization', `Bearer ${adminToken}`)
      ).status
    ).toBe(200);
  });

  it('indexing:generate', async () => {
    const res = await app()
      .post('/api/v1/indexing/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(200);
    const [entry] = await entriesFor('indexing:generate');
    expect(entry?.target).toMatchObject({ type: 'system', name: 'index' });
  });

  it('geography:create', async () => {
    const res = await app()
      .post('/api/v1/geography')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Audited Boundary',
        type: 'geojson',
        category: 'boundary',
        description: 'audited',
        content: JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [-73.5673, 45.5017] },
              properties: {},
            },
          ],
        }),
      });
    expect([200, 201]).toContain(res.status);
    const [entry] = await entriesFor('geography:create');
    expect(entry?.target?.type).toBe('geography');
    expect(entry?.target?.name).toBe('Audited Boundary');
  });

  it('storage:upload / storage:delete', async () => {
    const file = join(tmp, 'audited.txt');
    writeFileSync(file, 'audited upload');
    const up = await app()
      .post('/api/v1/storage/files')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', file)
      .field('folder', 'public');
    expect(up.status).toBe(200);
    const fileId = up.body.data.id as string;
    const [upload] = await entriesFor('storage:upload');
    expect(upload?.target).toMatchObject({
      type: 'file',
      id: fileId,
      name: 'audited.txt',
    });

    const del = await app()
      .delete(`/api/v1/storage/files/${fileId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);
    const [deleted] = await entriesFor('storage:delete');
    expect(deleted?.target).toMatchObject({ type: 'file', id: fileId });
  });

  it('the page can page and count what it filters', async () => {
    const res = await app()
      .get('/api/v1/audit?source=api&outcome=success&limit=2&offset=0')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.entries.length).toBe(2);
    expect(res.body.data.pagination.total).toBeGreaterThan(2);
    expect(res.body.data.pagination).toMatchObject({ limit: 2, offset: 0 });
  });
});
