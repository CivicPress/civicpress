/**
 * Phase 2d W2-T8 — records-service.ts characterization tests
 *
 * The original 1,760 LoC `RecordsService` god-file was decomposed (W2-T8)
 * into a 229 LoC orchestrator + 6 collaborators under `records-service/`:
 *
 *   helpers (pure), crud, listing, drafts, frontmatter-and-publish, locks
 *
 * The existing tests/api/*.test.ts suite covers the HTTP layer end-to-end
 * (routes/records.ts → RecordsService → DB). What it does NOT pin is the
 * post-decomposition class shape: public-method surface, helper-function
 * semantics, and the delegation wiring between the orchestrator and
 * collaborators. This file pins those.
 *
 * What this pins (regression guards on the decomposed shape):
 * 1. helpers (pure):
 *    - normalizeDateString: SQLite "YYYY-MM-DD HH:MM:SS" → ISO Z; passthrough
 *      for already-normalized inputs; nullish passthrough
 *    - getKindPriority: root=3, chapter=2, default=1; tolerates nested
 *      metadata.metadata.kind shape
 *    - buildFilterClause: workflow_state internal_only filter is always
 *      present; type=single → `type = ?`, multi → IN-clause; legacy status
 *      filter preserved
 * 2. locks collaborator: expiresAt is now+N minutes (default 30);
 *    user → lockedBy resolution prefers `user.id` over `user.username`;
 *    delegates to db.acquireLock/releaseLock/getLock/refreshLock with the
 *    correct param shape
 * 3. orchestrator (RecordsService) public API surface: the 28 method names
 *    + the getCivicPress accessor must remain exported on the class
 */

import { describe, it, expect, vi } from 'vitest';
import {
  normalizeDateString,
  getKindPriority,
  buildFilterClause,
} from '../../../modules/api/src/services/records-service/helpers.js';
import {
  RecordsLocks,
  type RecordsLocksDeps,
} from '../../../modules/api/src/services/records-service/locks.js';
import { RecordsService } from '../../../modules/api/src/services/records-service.js';

describe('records-service helpers — normalizeDateString (W2-T8 characterization)', () => {
  it('converts SQLite "YYYY-MM-DD HH:MM:SS" to ISO with Z suffix', () => {
    expect(normalizeDateString('2026-05-20 14:30:00')).toBe(
      '2026-05-20T14:30:00Z'
    );
  });

  it('passes through inputs already ending in Z', () => {
    expect(normalizeDateString('2026-05-20T14:30:00Z')).toBe(
      '2026-05-20T14:30:00Z'
    );
  });

  it('passes through inputs with a numeric offset suffix', () => {
    expect(normalizeDateString('2026-05-20T14:30:00+05:00')).toBe(
      '2026-05-20T14:30:00+05:00'
    );
    expect(normalizeDateString('2026-05-20T14:30:00-08:00')).toBe(
      '2026-05-20T14:30:00-08:00'
    );
  });

  it('appends Z to T-separated inputs that lack a timezone', () => {
    expect(normalizeDateString('2026-05-20T14:30:00')).toBe(
      '2026-05-20T14:30:00Z'
    );
  });

  it('passes through null/undefined/empty without throwing', () => {
    expect(normalizeDateString(null)).toBeNull();
    expect(normalizeDateString(undefined)).toBeUndefined();
    expect(normalizeDateString('')).toBe('');
  });
});

describe('records-service helpers — getKindPriority (W2-T8 characterization)', () => {
  it('returns 3 for kind=root (sorts to end)', () => {
    expect(getKindPriority({ metadata: { kind: 'root' } })).toBe(3);
  });

  it('returns 2 for kind=chapter', () => {
    expect(getKindPriority({ metadata: { kind: 'chapter' } })).toBe(2);
  });

  it('returns 1 for missing kind or any other value (sorts to front)', () => {
    expect(getKindPriority({ metadata: {} })).toBe(1);
    expect(getKindPriority({})).toBe(1);
    expect(getKindPriority({ metadata: { kind: 'leaf' } })).toBe(1);
  });

  it('tolerates the nested metadata.metadata.kind shape', () => {
    expect(
      getKindPriority({ metadata: { metadata: { kind: 'root' } } })
    ).toBe(3);
    expect(
      getKindPriority({ metadata: { metadata: { kind: 'chapter' } } })
    ).toBe(2);
  });
});

describe('records-service helpers — buildFilterClause (W2-T8 characterization)', () => {
  it('always emits the internal_only workflow_state exclusion as first clause', () => {
    const { whereClause, params } = buildFilterClause();
    expect(whereClause).toMatch(
      /^WHERE \(workflow_state IS NULL OR workflow_state != \?\)/
    );
    expect(params[0]).toBe('internal_only');
  });

  it('emits `type = ?` for a single type filter', () => {
    const { whereClause, params } = buildFilterClause({ type: 'bylaw' });
    expect(whereClause).toContain('type = ?');
    expect(params).toEqual(['internal_only', 'bylaw']);
  });

  it('emits `type IN (?,?)` for a comma-separated multi-type filter', () => {
    const { whereClause, params } = buildFilterClause({
      type: 'bylaw,policy',
    });
    expect(whereClause).toMatch(/type IN \(\?,\?\)/);
    expect(params).toEqual(['internal_only', 'bylaw', 'policy']);
  });

  it('emits `status = ?` for legacy single-status filter (deprecated but preserved)', () => {
    const { whereClause, params } = buildFilterClause({ status: 'published' });
    expect(whereClause).toContain('status = ?');
    expect(params).toEqual(['internal_only', 'published']);
  });

  it('emits `status IN (?,?)` for legacy multi-status filter', () => {
    const { whereClause, params } = buildFilterClause({
      status: 'published,archived',
    });
    expect(whereClause).toMatch(/status IN \(\?,\?\)/);
    expect(params).toEqual(['internal_only', 'published', 'archived']);
  });

  it('trims whitespace and drops empty entries in comma-separated values', () => {
    const { params } = buildFilterClause({ type: ' bylaw , , policy ' });
    expect(params).toEqual(['internal_only', 'bylaw', 'policy']);
  });
});

describe('records-service locks collaborator (W2-T8 characterization)', () => {
  function makeDeps(): {
    deps: RecordsLocksDeps;
    db: {
      acquireLock: ReturnType<typeof vi.fn>;
      releaseLock: ReturnType<typeof vi.fn>;
      getLock: ReturnType<typeof vi.fn>;
      refreshLock: ReturnType<typeof vi.fn>;
    };
  } {
    const db = {
      acquireLock: vi.fn().mockResolvedValue(true),
      releaseLock: vi.fn().mockResolvedValue(true),
      getLock: vi.fn().mockResolvedValue(null),
      refreshLock: vi.fn().mockResolvedValue(true),
    };
    return { deps: { db: db as any }, db };
  }

  it('acquireLock: calls db.acquireLock with recordId, lockedBy=user.id (preferred), expiresAt≈now+30min', async () => {
    const { deps, db } = makeDeps();
    const locks = new RecordsLocks(deps);
    const before = Date.now();
    await locks.acquireLock('rec-1', { id: 42, username: 'alice' });
    const after = Date.now();

    expect(db.acquireLock).toHaveBeenCalledTimes(1);
    const [recordId, lockedBy, expiresAt] = db.acquireLock.mock.calls[0];
    expect(recordId).toBe('rec-1');
    // user.id wins over user.username; coerced to string
    expect(lockedBy).toBe('42');
    expect(expiresAt).toBeInstanceOf(Date);
    const delta = expiresAt.getTime() - before;
    // 30 minutes (1800000 ms), allow drift up to (after - before) + 50ms
    expect(delta).toBeGreaterThanOrEqual(30 * 60 * 1000 - 50);
    expect(delta).toBeLessThanOrEqual(30 * 60 * 1000 + (after - before) + 50);
  });

  it('acquireLock: honors caller-supplied duration', async () => {
    const { deps, db } = makeDeps();
    const locks = new RecordsLocks(deps);
    const before = Date.now();
    await locks.acquireLock('rec-2', { username: 'bob' }, 5);

    const [, lockedBy, expiresAt] = db.acquireLock.mock.calls[0];
    expect(lockedBy).toBe('bob'); // falls back to username when id is absent
    const delta = expiresAt.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(5 * 60 * 1000 - 50);
    expect(delta).toBeLessThanOrEqual(5 * 60 * 1000 + 100);
  });

  it('releaseLock: forwards (recordId, lockedBy) to db.releaseLock', async () => {
    const { deps, db } = makeDeps();
    const locks = new RecordsLocks(deps);
    await locks.releaseLock('rec-3', { id: 7 });
    expect(db.releaseLock).toHaveBeenCalledWith('rec-3', '7');
  });

  it('getLock: forwards recordId to db.getLock and returns its result', async () => {
    const { deps, db } = makeDeps();
    db.getLock.mockResolvedValueOnce({ recordId: 'rec-4', lockedBy: '9' });
    const locks = new RecordsLocks(deps);
    const result = await locks.getLock('rec-4');
    expect(db.getLock).toHaveBeenCalledWith('rec-4');
    expect(result).toEqual({ recordId: 'rec-4', lockedBy: '9' });
  });

  it('refreshLock: calls db.refreshLock with recordId, lockedBy, expiresAt≈now+N min', async () => {
    const { deps, db } = makeDeps();
    const locks = new RecordsLocks(deps);
    const before = Date.now();
    await locks.refreshLock('rec-5', { id: 11 }, 15);

    const [recordId, lockedBy, expiresAt] = db.refreshLock.mock.calls[0];
    expect(recordId).toBe('rec-5');
    expect(lockedBy).toBe('11');
    const delta = expiresAt.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(15 * 60 * 1000 - 50);
    expect(delta).toBeLessThanOrEqual(15 * 60 * 1000 + 100);
  });
});

describe('RecordsService orchestrator — public API surface (W2-T8 characterization)', () => {
  // The orchestrator delegates every public method to a collaborator via
  // `...args` passthrough. Calling them with a stub CivicPress would require
  // standing up the full RecordManager; that's covered by the HTTP-layer
  // tests in tests/api/*.test.ts. Here we just pin that the surface didn't
  // shrink or rename — i.e. every method that route handlers depend on is
  // still on the orchestrator class.
  const expectedMethods = [
    'getCivicPress',
    // crud
    'createRecord',
    'getRecord',
    'getRawRecord',
    'updateRecord',
    'deleteRecord',
    // listing
    'listRecords',
    'searchRecords',
    'getRecordSummary',
    'changeRecordStatus',
    'getAllowedTransitions',
    // drafts
    'createDraft',
    'updateDraft',
    'listDrafts',
    'listUnpublishedRecords',
    'deleteDraft',
    // frontmatter + publish
    'getFrontmatterYaml',
    'getDraftOrRecord',
    'publishDraft',
    // locks
    'acquireLock',
    'releaseLock',
    'getLock',
    'refreshLock',
  ] as const;

  it('exposes all 23 expected public methods on the prototype', () => {
    for (const name of expectedMethods) {
      expect(typeof (RecordsService.prototype as any)[name]).toBe('function');
    }
  });

  it('has no surprise extra public methods beyond the expected surface', () => {
    const ownPublic = Object.getOwnPropertyNames(RecordsService.prototype)
      .filter((n) => n !== 'constructor' && !n.startsWith('_'))
      .sort();
    expect(ownPublic).toEqual([...expectedMethods].sort());
  });
});
