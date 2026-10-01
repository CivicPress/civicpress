import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { CentralConfigManager } from '@civicpress/core';
import {
  createAPITestContext,
  cleanupAPITestContext,
  type APITestContext,
} from '../fixtures/test-setup';

/**
 * An anonymous reader may only see records whose status is declared public.
 *
 * The read path used to apply no status filter at all, on the stated grounds
 * that location implies publication — `read-handlers.ts` said "No status
 * filter - table location (records table) determines published state", and
 * `RecordStore.listRecords` agreed: "all records in records table are published
 * by definition".
 *
 * Nothing enforced it. `RecordStore.createRecord` inserts
 * `recordData.status || 'draft'`, and `IndexingService.syncToDatabase` copies
 * every on-disk index entry in regardless of status — a sync the API runs at
 * startup. Measured before the fix, inserting one row per status and asking
 * anonymously returned ALL of them — draft, pending_review, archived,
 * published, and an unknown custom status — and `GET /records/<draft-id>`
 * answered 200 with the full body.
 *
 * These tests drive the READ path directly by writing rows in each status, so
 * they hold regardless of which write paths happen to exist: the gate is the
 * thing under test, not the current set of writers.
 */
describe('public reads are gated on status, not on table location', () => {
  let context: APITestContext;

  const STATUSES = [
    'draft',
    'pending_review',
    'under_review',
    'approved',
    'rejected',
    'published',
    'archived',
    'a_custom_status_nobody_declared',
  ];

  beforeEach(async () => {
    context = await createAPITestContext();
    const db = context.api.getCivicPress().getDatabaseService();
    for (const status of STATUSES) {
      await db.createRecord({
        id: `gate-${status}`,
        title: `Gate ${status}`,
        type: 'policy',
        status,
        content: 'body',
        metadata: '{}',
        path: `records/gate-${status}.md`,
        author: 'gate-test',
      });
    }
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  it('lists only statuses declared public', async () => {
    const res = await request(context.api.getApp()).get(
      '/api/v1/records?limit=200'
    );
    expect(res.status).toBe(200);

    const records = res.body?.data?.records ?? res.body?.data ?? [];
    const seen = records
      .filter((r: { id?: string }) => String(r.id).startsWith('gate-'))
      .map((r: { status?: string }) => r.status)
      .sort();

    const publicStatuses = CentralConfigManager.getPublicRecordStatuses();
    expect(publicStatuses).toContain('published');
    expect(publicStatuses).not.toContain('draft');

    expect(seen).toEqual(
      STATUSES.filter((s) => publicStatuses.includes(s)).sort()
    );
  });

  it('404s on a non-public record fetched by id', async () => {
    for (const status of ['draft', 'pending_review', 'rejected']) {
      const res = await request(context.api.getApp()).get(
        `/api/v1/records/gate-${status}`
      );
      expect(
        res.status,
        `anonymous GET of a ${status} record should not succeed`
      ).toBe(404);
    }
  });

  it('still serves a published record by id', async () => {
    const res = await request(context.api.getApp()).get(
      '/api/v1/records/gate-published'
    );
    expect(res.status).toBe(200);
    expect(res.body?.data?.title).toBe('Gate published');
  });

  it('does not let an explicit status filter widen what is public', async () => {
    // The records list handler does not read `status` from the query at all,
    // so this is silently ignored and the caller gets the public set. That is
    // pre-existing behavior and it is safe; what matters here is that asking
    // for drafts by name cannot produce one, and cannot fall through to an
    // unfiltered result either.
    const res = await request(context.api.getApp()).get(
      '/api/v1/records?status=draft&limit=200'
    );
    expect(res.status).toBe(200);

    const records = res.body?.data?.records ?? res.body?.data ?? [];
    const publicStatuses = CentralConfigManager.getPublicRecordStatuses();
    const leaked = records
      .filter((r: { status?: string }) => !publicStatuses.includes(r.status!))
      .map((r: { id?: string; status?: string }) => `${r.id}:${r.status}`);

    expect(leaked).toEqual([]);
  });

  it('404s on the frontmatter of a non-public record', async () => {
    // This endpoint serves frontmatter AND the full markdown body, so it is
    // the way around the by-id gate if it is not gated too.
    const draft = await request(context.api.getApp()).get(
      '/api/v1/records/gate-draft/frontmatter'
    );
    expect(draft.status).toBe(404);
    expect(JSON.stringify(draft.body)).not.toContain('Gate draft');

    const published = await request(context.api.getApp()).get(
      '/api/v1/records/gate-published/frontmatter'
    );
    expect(published.status).toBe(200);
  });

  it('search does not return unpublished records', async () => {
    // Search was the worst of the read paths: it returned unpublished records
    // in FULL to anonymous callers, not merely their existence.
    const res = await request(context.api.getApp()).get(
      '/api/v1/search?q=Gate&limit=200'
    );
    expect(res.status).toBe(200);

    const records = res.body?.data?.records ?? res.body?.data?.results ?? [];
    const publicStatuses = CentralConfigManager.getPublicRecordStatuses();
    const seen = records
      .filter((r: { id?: string }) => String(r.id).startsWith('gate-'))
      .map((r: { status?: string }) => r.status);

    expect(seen.length).toBeGreaterThan(0); // ...but public search still works
    expect(seen.filter((s: string) => !publicStatuses.includes(s))).toEqual([]);
  });

  it('the summary histogram does not count unpublished records', async () => {
    // Aggregates disclose too: this published a per-status histogram, so
    // "3 drafts, 1 pending_review" was readable straight off the public API.
    const res = await request(context.api.getApp()).get(
      '/api/v1/records/summary'
    );
    expect(res.status).toBe(200);

    const statuses = res.body?.data?.statuses ?? {};
    const publicStatuses = CentralConfigManager.getPublicRecordStatuses();
    expect(
      Object.keys(statuses).filter((s) => !publicStatuses.includes(s))
    ).toEqual([]);
    expect(Object.keys(statuses)).toContain('published');
  });

  it('an authenticated caller still sees the whole summary', async () => {
    const res = await request(context.api.getApp())
      .get('/api/v1/records/summary')
      .set('Authorization', `Bearer ${context.adminToken}`);
    expect(res.status).toBe(200);

    const statuses = res.body?.data?.statuses ?? {};
    expect(Object.keys(statuses)).toContain('draft');
  });

  it('an authenticated caller is unaffected', async () => {
    const res = await request(context.api.getApp())
      .get('/api/v1/records?limit=200')
      .set('Authorization', `Bearer ${context.adminToken}`);
    expect(res.status).toBe(200);

    const records = res.body?.data?.records ?? res.body?.data ?? [];
    const seen = records
      .filter((r: { id?: string }) => String(r.id).startsWith('gate-'))
      .map((r: { status?: string }) => r.status);

    expect(seen).toContain('draft');
    expect(seen).toContain('published');
  });

  // Until 2026-09-30 the gate asked "is there a user?". Registration is open,
  // unverified, and hands out the `public` role — so logging in was the whole
  // gate, and logging in was free. Sight of unpublished records is now the
  // `records:view_unpublished` permission, which `public` does not hold.
  describe('a self-registered account sees exactly what anonymous sees', () => {
    async function publicToken(): Promise<string> {
      const res = await request(context.api.getApp())
        .post('/api/v1/auth/simulated')
        .send({ username: 'passerby', role: 'public' });
      expect(res.status).toBe(200);
      return res.body.data.session.token as string;
    }

    it('lists only public statuses', async () => {
      const token = await publicToken();
      const res = await request(context.api.getApp())
        .get('/api/v1/records?limit=200')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const records = res.body?.data?.records ?? res.body?.data ?? [];
      const seen = records
        .filter((r: { id?: string }) => String(r.id).startsWith('gate-'))
        .map((r: { status?: string }) => r.status)
        .sort();
      const publicStatuses = CentralConfigManager.getPublicRecordStatuses();
      expect(seen).toEqual(
        STATUSES.filter((s) => publicStatuses.includes(s)).sort()
      );
    });

    it('cannot widen the list with an explicit non-public status', async () => {
      // As for anonymous callers: the list handler ignores `status`, so the
      // caller gets the public set — never a draft, never an unfiltered list.
      const token = await publicToken();
      const res = await request(context.api.getApp())
        .get('/api/v1/records?status=draft&limit=200')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const records = res.body?.data?.records ?? res.body?.data ?? [];
      const publicStatuses = CentralConfigManager.getPublicRecordStatuses();
      const leaked = records
        .filter((r: { status?: string }) => !publicStatuses.includes(r.status!))
        .map((r: { id?: string; status?: string }) => `${r.id}:${r.status}`);
      expect(leaked).toEqual([]);
    });

    it('404s on a draft fetched by id, and on its frontmatter', async () => {
      const token = await publicToken();
      const byId = await request(context.api.getApp())
        .get('/api/v1/records/gate-draft')
        .set('Authorization', `Bearer ${token}`);
      expect(byId.status).toBe(404);
      const fm = await request(context.api.getApp())
        .get('/api/v1/records/gate-draft/frontmatter')
        .set('Authorization', `Bearer ${token}`);
      expect(fm.status).toBe(404);
    });

    it('still reads a published record by id', async () => {
      const token = await publicToken();
      const res = await request(context.api.getApp())
        .get('/api/v1/records/gate-published')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it('search and the summary histogram stay public-only', async () => {
      const token = await publicToken();
      const search = await request(context.api.getApp())
        .get('/api/v1/search?q=Gate&limit=200')
        .set('Authorization', `Bearer ${token}`);
      expect(search.status).toBe(200);
      const hits =
        search.body?.data?.records ?? search.body?.data?.results ?? [];
      const publicStatuses = CentralConfigManager.getPublicRecordStatuses();
      const statuses = hits
        .filter((r: { id?: string }) => String(r.id).startsWith('gate-'))
        .map((r: { status?: string }) => r.status);
      expect(statuses.length).toBeGreaterThan(0);
      expect(
        statuses.filter((s: string) => !publicStatuses.includes(s))
      ).toEqual([]);

      const summary = await request(context.api.getApp())
        .get('/api/v1/records/summary')
        .set('Authorization', `Bearer ${token}`);
      expect(summary.status).toBe(200);
      expect(Object.keys(summary.body?.data?.statuses ?? {})).not.toContain(
        'draft'
      );
    });
  });

  it('a clerk (records:view_unpublished) sees the drafts', async () => {
    const login = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'clerk', role: 'clerk' });
    expect(login.status).toBe(200);
    const res = await request(context.api.getApp())
      .get('/api/v1/records?limit=200')
      .set('Authorization', `Bearer ${login.body.data.session.token}`);
    expect(res.status).toBe(200);
    const records = res.body?.data?.records ?? res.body?.data ?? [];
    const seen = records
      .filter((r: { id?: string }) => String(r.id).startsWith('gate-'))
      .map((r: { status?: string }) => r.status);
    expect(seen).toContain('draft');
  });
});
