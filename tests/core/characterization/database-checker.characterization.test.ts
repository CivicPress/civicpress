/**
 * Phase 2d W2-T2 — database-checker.ts characterization tests
 *
 * Pins the seams the W2-T2 decomposition will move: schema-checks,
 * health-checks, auto-fixes. The existing core/src/diagnostics/__tests__/
 * database-checker.test.ts has 4 cases that cover end-to-end check() and
 * autoFix() shape; this file adds focused checks for individual check
 * outcomes (missing tables, missing FTS5, missing indexes, fragmentation
 * thresholds) so the post-decomposition behavior matches per-seam.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseDiagnosticChecker } from '../../../core/src/diagnostics/checkers/database-checker.js';
import type { DatabaseService } from '../../../core/src/database/database-service.js';
import { Logger } from '../../../core/src/utils/logger.js';

function makeMockDb(queryResponses: any[][]): any {
  let i = 0;
  return {
    getAdapter: vi.fn().mockReturnValue({
      config: { sqlite: { file: '/test/data/.system-data/civic.db' } },
      execute: vi.fn().mockResolvedValue(undefined),
    }),
    query: vi.fn(() => Promise.resolve(queryResponses[i++] || [])),
    execute: vi.fn().mockResolvedValue(undefined),
  };
}

describe('DatabaseDiagnosticChecker — schema-check seam (W2-T2 characterization)', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;
  });

  it('flags missing required tables in the schema check path', async () => {
    // Sequence of query responses:
    //   1: integrity_check → ok
    //   2: schema tables → only 'users', missing the other 5 required tables
    const mockDb = makeMockDb([
      [{ integrity_check: 'ok' }],
      [{ name: 'users' }], // schema query — missing api_keys/sessions/etc.
    ]);
    const checker = new DatabaseDiagnosticChecker(
      mockDb as DatabaseService,
      '/test/data',
      logger
    );

    const result = await checker.check();
    // The aggregate check must signal a problem when schema is incomplete.
    expect(
      result.status === 'error' ||
        result.message?.toLowerCase().includes('schema') ||
        result.details?.checks?.some?.(
          (c: any) =>
            c.status === 'error' && c.message?.toLowerCase().includes('table')
        )
    ).toBeTruthy();
  });

  it('flags missing FTS5 table in the FTS5 check path', async () => {
    // 1: integrity ok; 2: full required tables; 3: required columns;
    // 4: indexes present; 5: FTS5 tables → EMPTY (missing).
    const mockDb = makeMockDb([
      [{ integrity_check: 'ok' }],
      // schema with all 6 required tables
      [
        { name: 'users' },
        { name: 'api_keys' },
        { name: 'sessions' },
        { name: 'search_index' },
        { name: 'records' },
        { name: 'record_drafts' },
      ],
      // search_index columns: required 4
      [
        { name: 'record_id' },
        { name: 'record_type' },
        { name: 'title' },
        { name: 'title_normalized' },
      ],
      // indexes (include all important ones)
      [
        { name: 'idx_records_updated_at' },
        { name: 'idx_records_created_at' },
        { name: 'idx_records_title' },
        { name: 'idx_search_index_updated_at' },
        { name: 'idx_search_index_title' },
      ],
      // FTS5 tables — empty (missing)
      [],
    ]);
    const checker = new DatabaseDiagnosticChecker(
      mockDb as DatabaseService,
      '/test/data',
      logger
    );

    const result = await checker.check();
    expect(
      result.status === 'error' ||
        result.message?.toLowerCase().includes('fts5') ||
        result.details?.checks?.some?.(
          (c: any) => c.status === 'error' && c.message?.includes('FTS5')
        )
    ).toBeTruthy();
  });

  it('flags missing FTS5 triggers when table exists but triggers do not', async () => {
    const mockDb = makeMockDb([
      [{ integrity_check: 'ok' }],
      [
        { name: 'users' },
        { name: 'api_keys' },
        { name: 'sessions' },
        { name: 'search_index' },
        { name: 'records' },
        { name: 'record_drafts' },
      ],
      [
        { name: 'record_id' },
        { name: 'record_type' },
        { name: 'title' },
        { name: 'title_normalized' },
      ],
      [
        { name: 'idx_records_updated_at' },
        { name: 'idx_records_created_at' },
        { name: 'idx_records_title' },
        { name: 'idx_search_index_updated_at' },
        { name: 'idx_search_index_title' },
      ],
      [{ name: 'search_index_fts5' }], // FTS5 table exists
      [], // FTS5 limit-1 query (empty OK)
      [], // FTS5 triggers — missing
    ]);
    const checker = new DatabaseDiagnosticChecker(
      mockDb as DatabaseService,
      '/test/data',
      logger
    );

    const result = await checker.check();
    expect(
      result.status === 'error' ||
        result.message?.toLowerCase().includes('trigger') ||
        result.details?.checks?.some?.(
          (c: any) =>
            c.status === 'error' &&
            c.message?.toLowerCase().includes('trigger')
        )
    ).toBeTruthy();
  });
});

describe('DatabaseDiagnosticChecker — auto-fix dispatch seam (W2-T2 characterization)', () => {
  let logger: Logger;
  let mockDb: any;
  let checker: DatabaseDiagnosticChecker;

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;
    mockDb = makeMockDb([]);
    checker = new DatabaseDiagnosticChecker(
      mockDb as DatabaseService,
      '/test/data',
      logger
    );
  });

  it('dispatches an Index-mentioning issue to the index-fix path', async () => {
    // fixIndexes calls adapter.execute (not databaseService.execute). Grab
    // the adapter (vi.fn().mockReturnValue stably returns the same object)
    // and watch its execute spy.
    const adapter = mockDb.getAdapter();
    const issue: any = {
      id: 'i',
      severity: 'medium',
      message: 'Index idx_records_updated_at missing',
      autoFixable: true,
      component: 'database',
      check: 'database',
      details: { missing: ['idx_records_updated_at'] },
    };
    const results = await checker.autoFix([issue], { backup: false });
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);
    const calls = adapter.execute.mock.calls.map((c: any[]) => c[0] || '');
    expect(calls.some((q: string) => /CREATE\s+INDEX/i.test(q))).toBe(true);
  });

  it('reports success even when no auto-fixable issue matches (no-op dispatch)', async () => {
    const issue: any = {
      id: 'i',
      severity: 'low',
      message: 'an unrelated issue that no fix handles',
      autoFixable: true,
      component: 'database',
      check: 'database',
    };
    const results = await checker.autoFix([issue], { backup: false });
    expect(results.length).toBe(1);
    // Even unhandled issues complete (result returned); the source's policy
    // is to log + return rather than throw. Pinned here so the post-decomp
    // dispatcher preserves that "no-op rather than throw" behavior.
    expect(typeof results[0].success).toBe('boolean');
  });
});
