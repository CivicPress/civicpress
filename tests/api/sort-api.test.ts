/**
 * HTTP integration tests for the `?sort=` parameter on `GET /api/v1/records`.
 *
 * (Replaces an earlier placeholder that asserted inline logic — a locally
 * defined `getKindPriority`, `typeof sort === 'string'` — and exercised no real
 * code path.)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

await setupGlobalTestEnvironment();

describe('API Records — sort parameter (HTTP)', () => {
  let context: any;
  let adminToken: string;

  beforeEach(async () => {
    context = await createAPITestContext();
    const admin = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin', role: 'admin' });
    adminToken = admin.body.data.session.token;
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  const list = (sort?: string) => {
    const q = sort ? `?sort=${encodeURIComponent(sort)}&limit=100` : '';
    return request(context.api.getApp())
      .get(`/api/v1/records${q}`)
      .set('Authorization', `Bearer ${adminToken}`);
  };

  it('defaults to created_desc when no sort is supplied', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sort).toBe('created_desc');
  });

  it('echoes each accepted sort value back to the caller', async () => {
    for (const sort of [
      'created_desc',
      'updated_desc',
      'title_asc',
      'title_desc',
    ]) {
      const res = await list(sort);
      expect(res.status).toBe(200);
      expect(res.body.data.sort).toBe(sort);
    }
  });

  it('orders records ascending by title for title_asc', async () => {
    const res = await list('title_asc');
    expect(res.status).toBe(200);
    const titles: string[] = res.body.data.records.map((r: any) => r.title);
    expect(titles.length).toBeGreaterThanOrEqual(2); // fixture seeds ≥2 records
    const ascending = [...titles].sort((a, b) => a.localeCompare(b));
    expect(titles).toEqual(ascending);
  });

  it('orders records descending by title for title_desc', async () => {
    const res = await list('title_desc');
    expect(res.status).toBe(200);
    const titles: string[] = res.body.data.records.map((r: any) => r.title);
    expect(titles.length).toBeGreaterThanOrEqual(2);
    const descending = [...titles].sort((a, b) => b.localeCompare(a));
    expect(titles).toEqual(descending);
  });

  it('400s an invalid sort value', async () => {
    const res = await list('not-a-sort');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects relevance sort on the records endpoint (search-only)', async () => {
    // `relevance` is not in the records `sort` allowlist, so the validator
    // rejects it with a generic 400 (the handler's INVALID_SORT_CONTEXT branch
    // is unreachable for that reason — it never sees `relevance`).
    const res = await list('relevance');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
