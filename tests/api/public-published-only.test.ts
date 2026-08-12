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
});
