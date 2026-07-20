/**
 * SQL-side pagination — `listUnpublishedRecords` + geography `/linked-records`.
 *
 * Both used to pull a broad result set into JS and `.slice()` a page out of it.
 * These tests pin the OBSERVABLE contract (page contents, `total`, `hasMore`,
 * cursor walking) so the push-down cannot quietly change what callers see:
 * a wrong `total`, a dropped row at a page boundary, or a duplicate across
 * pages all fail here.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

await setupGlobalTestEnvironment();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let context: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let service: any;

const UNPUBLISHED_COUNT = 25;
const LINKED_COUNT = 12;
const GEO_ID = 'geo-target';
// A sibling id that is a strict PREFIX-extension of GEO_ID. A naive
// `LIKE '%geo-target%'` filter would wrongly match this row.
const GEO_ID_DECOY = 'geo-target-2';

// Seeded rows are additive to whatever the fixture already created, so every
// expected total is measured against a baseline taken before seeding rather
// than hard-coded.
let baselineUnpublished = 0;

async function insertRecord(row: {
  id: string;
  title: string;
  type: string;
  status: string;
  workflowState?: string | null;
  updatedAt: string;
  linkedGeography?: string | null;
}) {
  await db.execute(
    `INSERT INTO records
      (id, title, type, status, workflow_state, content, author,
       created_at, updated_at, linked_geography_files)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.title,
      row.type,
      row.status,
      row.workflowState ?? null,
      `# ${row.title}`,
      'tester',
      row.updatedAt,
      row.updatedAt,
      row.linkedGeography ?? null,
    ]
  );
}

beforeAll(async () => {
  context = await createAPITestContext();
  db = context.civic.getDatabaseService();

  const { RecordsService } = await import(
    '../../modules/api/src/services/records-service.js'
  );
  service = new RecordsService(context.civic);

  baselineUnpublished = (await service.listUnpublishedRecords({ limit: 1 }))
    .total;

  // Unpublished records. Timestamps deliberately COLLIDE in pairs so the
  // keyset predicate's tiebreak is exercised: under `ORDER BY updated_at DESC`
  // alone, tied rows have no defined order and a cursor cannot be positioned.
  for (let i = 0; i < UNPUBLISHED_COUNT; i++) {
    const bucket = Math.floor(i / 2);
    await insertRecord({
      id: `unpub-${String(i).padStart(3, '0')}`,
      title: `Unpublished ${i}`,
      type: 'bylaw',
      status: 'draft',
      workflowState: 'draft',
      updatedAt: `2025-03-${String(bucket + 1).padStart(2, '0')}T10:00:00Z`,
    });
  }

  // Must NEVER appear in the unpublished view: published records carry no
  // unpublished workflow_state.
  await insertRecord({
    id: 'published-not-a-draft',
    title: 'Published',
    type: 'bylaw',
    status: 'adopted',
    workflowState: null,
    updatedAt: '2025-04-01T10:00:00Z',
  });

  // Records linking the target geography, plus decoys.
  for (let i = 0; i < LINKED_COUNT; i++) {
    await insertRecord({
      id: `linked-${String(i).padStart(3, '0')}`,
      title: `Linked ${i}`,
      type: 'resolution',
      status: 'adopted',
      workflowState: null,
      updatedAt: `2025-05-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      linkedGeography: JSON.stringify([
        { id: 'geo-other', name: 'Other' },
        { id: GEO_ID, name: 'Target' },
      ]),
    });
  }

  // Decoy 1: an id that CONTAINS the target id as a prefix.
  await insertRecord({
    id: 'decoy-prefix',
    title: 'Decoy prefix',
    type: 'resolution',
    status: 'adopted',
    workflowState: null,
    updatedAt: '2025-06-01T10:00:00Z',
    linkedGeography: JSON.stringify([{ id: GEO_ID_DECOY, name: 'Decoy' }]),
  });

  // Decoy 2: the target id appears, but as a NAME rather than an id.
  await insertRecord({
    id: 'decoy-name-field',
    title: 'Decoy name field',
    type: 'resolution',
    status: 'adopted',
    workflowState: null,
    updatedAt: '2025-06-02T10:00:00Z',
    linkedGeography: JSON.stringify([{ id: 'geo-unrelated', name: GEO_ID }]),
  });

  // Decoy 3: a row whose column is NOT valid JSON. `json_each()` aborts the
  // whole query on malformed JSON, so without the `json_valid()` guard this
  // single row would turn the endpoint into a 500 for every caller.
  await insertRecord({
    id: 'decoy-malformed-json',
    title: 'Decoy malformed',
    type: 'resolution',
    status: 'adopted',
    workflowState: null,
    updatedAt: '2025-06-03T10:00:00Z',
    linkedGeography: 'this is not json',
  });
}, 180000);

afterAll(async () => {
  await cleanupAPITestContext(context);
});

describe('listUnpublishedRecords — SQL-side pagination', () => {
  const expectedTotal = () => baselineUnpublished + UNPUBLISHED_COUNT;

  it('reports the total over ALL matching rows, not the page', async () => {
    const result = await service.listUnpublishedRecords({ limit: 5 });

    expect(result.records).toHaveLength(5);
    expect(result.total).toBe(expectedTotal());
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe(result.records[4].id);
  });

  it('walks every row exactly once via the cursor — no gaps, no repeats', async () => {
    const seen: string[] = [];
    let cursor: string | null | undefined = undefined;
    let guard = 0;

    for (;;) {
      const page = await service.listUnpublishedRecords({
        limit: 4,
        cursor: cursor ?? undefined,
      });
      expect(page.total).toBe(expectedTotal());
      seen.push(...page.records.map((r: { id: string }) => r.id));
      cursor = page.nextCursor;
      if (!page.hasMore || ++guard > 50) break;
    }

    expect(seen).toHaveLength(expectedTotal());
    expect(new Set(seen).size).toBe(expectedTotal());

    // Every seeded row appears exactly once...
    for (let i = 0; i < UNPUBLISHED_COUNT; i++) {
      expect(seen).toContain(`unpub-${String(i).padStart(3, '0')}`);
    }
    // ...and the published record never leaks into the unpublished view.
    expect(seen).not.toContain('published-not-a-draft');
  });

  it('honours the type filter in the total as well as the page', async () => {
    const result = await service.listUnpublishedRecords({
      type: 'nonexistent-type',
      limit: 5,
    });
    expect(result.records).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('falls back to the first page when the cursor no longer resolves', async () => {
    const first = await service.listUnpublishedRecords({ limit: 3 });
    const ghost = await service.listUnpublishedRecords({
      limit: 3,
      cursor: 'this-record-id-does-not-exist',
    });
    // Same behaviour the JS `findIndex(...) === -1` branch had.
    expect(ghost.records.map((r: { id: string }) => r.id)).toEqual(
      first.records.map((r: { id: string }) => r.id)
    );
    expect(ghost.total).toBe(expectedTotal());
  });
});

describe('geography linked-records — SQL-side filter + pagination', () => {
  it('matches on the geography ELEMENT id — not a substring of the JSON', async () => {
    const result = await service.listRecords({
      page: 1,
      limit: 100,
      linkedGeographyId: GEO_ID,
    });

    expect(result.totalCount).toBe(LINKED_COUNT);
    const ids = result.records.map((r: { id: string }) => r.id);
    expect(ids).not.toContain('decoy-prefix');
    expect(ids).not.toContain('decoy-name-field');
    expect(ids).not.toContain('decoy-malformed-json');
  });

  it('pages without dropping or duplicating rows, and totals stay exact', async () => {
    const pageSize = 5;
    const seen: string[] = [];
    const pageCounts: number[] = [];

    for (let page = 1; page <= 4; page++) {
      const result = await service.listRecords({
        page,
        limit: pageSize,
        linkedGeographyId: GEO_ID,
      });
      expect(result.totalCount).toBe(LINKED_COUNT);
      pageCounts.push(Math.ceil(result.totalCount / pageSize));
      seen.push(...result.records.map((r: { id: string }) => r.id));
    }

    expect(seen).toHaveLength(LINKED_COUNT);
    expect(new Set(seen).size).toBe(LINKED_COUNT);
    // Every page agreed on the page count.
    expect(new Set(pageCounts).size).toBe(1);
    expect(pageCounts[0]).toBe(Math.ceil(LINKED_COUNT / pageSize));
  });

  it('survives a row whose linked_geography_files is malformed JSON', async () => {
    // Without `json_valid()`, json_each() raises "malformed JSON" and the whole
    // query — hence the endpoint — fails for everyone.
    const result = await service.listRecords({
      page: 1,
      limit: 100,
      linkedGeographyId: 'geo-other',
    });
    expect(result.totalCount).toBe(LINKED_COUNT);
  });

  it('returns nothing for a geography no record links', async () => {
    const result = await service.listRecords({
      page: 1,
      limit: 10,
      linkedGeographyId: 'geo-nobody-links-this',
    });
    expect(result.totalCount).toBe(0);
    expect(result.records).toHaveLength(0);
  });
});
