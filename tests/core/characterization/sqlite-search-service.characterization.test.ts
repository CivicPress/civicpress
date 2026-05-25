/**
 * Phase 2d W2-T3 — sqlite-search-service.ts characterization tests
 *
 * The existing core/src/search/__tests__/{search-sort,search-suggestions}
 * tests already cover the suggestions + sort seams (15 cases). This file
 * adds focused coverage for the SQL-builder + facets + indexer seams the
 * decomposition will touch, so the post-W2-T3 behavior matches.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SQLiteSearchService } from '../../../core/src/search/sqlite-search-service.js';
import type { DatabaseAdapter } from '../../../core/src/database/database-adapter.js';

function mockAdapter(): any {
  return {
    query: vi.fn(),
    execute: vi.fn().mockResolvedValue(undefined),
  };
}

describe('SQLiteSearchService — search SQL composition (W2-T3 characterization)', () => {
  let adapter: any;
  let service: SQLiteSearchService;

  beforeEach(() => {
    adapter = mockAdapter();
    service = new SQLiteSearchService(adapter as DatabaseAdapter);
  });

  it('issues SELECT with bm25/recency/type-priority/composite scoring + FTS5 join', async () => {
    adapter.query.mockResolvedValueOnce([]); // results
    adapter.query.mockResolvedValueOnce([{ count: '0' }]); // count

    await service.search('hello', { type: 'bylaw', status: 'published' });

    // First call is the main select; second is count.
    const sql = adapter.query.mock.calls[0][0];
    expect(sql).toMatch(/bm25\(search_index_fts5\)/);
    expect(sql).toMatch(/composite_relevance_score/);
    expect(sql).toMatch(/recency_score/);
    expect(sql).toMatch(/type_priority_score/);
    expect(sql).toMatch(/snippet\(\s*search_index_fts5/);
    // FTS5 + records join shape preserved
    expect(sql).toMatch(/FROM\s+search_index_fts5/i);
    expect(sql).toMatch(/INNER JOIN\s+search_index\s+si/i);
    expect(sql).toMatch(/INNER JOIN\s+records\s+r/i);
  });

  it('applies type filter via single-value equality (record_type = ?)', async () => {
    adapter.query.mockResolvedValueOnce([]);
    adapter.query.mockResolvedValueOnce([{ count: '0' }]);

    await service.search('hello', { type: 'bylaw' });

    const sql = adapter.query.mock.calls[0][0];
    expect(sql).toMatch(/si\.record_type\s*=\s*\?/);
    const params = adapter.query.mock.calls[0][1];
    // First param is the FTS query; 'internal_only' is the workflow filter; then type filter
    expect(params).toContain('bylaw');
  });

  it('applies multi-type filter via IN (?,?)', async () => {
    adapter.query.mockResolvedValueOnce([]);
    adapter.query.mockResolvedValueOnce([{ count: '0' }]);

    await service.search('hello', { type: 'bylaw,ordinance,policy' });

    const sql = adapter.query.mock.calls[0][0];
    expect(sql).toMatch(/si\.record_type\s+IN\s*\(\?,\?,\?\)/);
    const params = adapter.query.mock.calls[0][1];
    expect(params).toEqual(
      expect.arrayContaining(['bylaw', 'ordinance', 'policy'])
    );
  });

  it('returns empty results for empty query (no SQL issued past parse)', async () => {
    const result = await service.search('', {});
    expect(result.results).toEqual([]);
    expect(result.total).toBe(0);
    expect(adapter.query).not.toHaveBeenCalled();
  });
});

describe('SQLiteSearchService — getFacets (W2-T3 characterization)', () => {
  let adapter: any;
  let service: SQLiteSearchService;

  beforeEach(() => {
    adapter = mockAdapter();
    service = new SQLiteSearchService(adapter as DatabaseAdapter);
  });

  it('returns empty facets for empty query (no SQL issued)', async () => {
    const facets = await service.getFacets('', {});
    expect(facets.types).toEqual([]);
    expect(facets.statuses).toEqual([]);
    expect(adapter.query).not.toHaveBeenCalled();
  });

  it('returns parsed type+status counts from two grouping queries', async () => {
    adapter.query.mockResolvedValueOnce([
      { value: 'bylaw', count: '12' },
      { value: 'policy', count: '7' },
    ]);
    adapter.query.mockResolvedValueOnce([
      { value: 'published', count: '15' },
      { value: 'draft', count: '4' },
    ]);

    const facets = await service.getFacets('hello', {});

    expect(facets.types).toEqual([
      { value: 'bylaw', count: 12 },
      { value: 'policy', count: 7 },
    ]);
    expect(facets.statuses).toEqual([
      { value: 'published', count: 15 },
      { value: 'draft', count: 4 },
    ]);
    expect(adapter.query).toHaveBeenCalledTimes(2);
  });
});

describe('SQLiteSearchService — indexer (W2-T3 characterization)', () => {
  let adapter: any;
  let service: SQLiteSearchService;

  beforeEach(() => {
    adapter = mockAdapter();
    service = new SQLiteSearchService(adapter as DatabaseAdapter);
  });

  it('indexRecord: DELETEs old row then INSERTs with normalized title + preview + wordCount', async () => {
    await service.indexRecord({
      recordId: 'rec1',
      recordType: 'bylaw',
      title: 'Bruit Excéssif', // accented
      content: 'this is the body content with some words to count',
      tags: 'noise,bylaw',
      metadata: { foo: 'bar' },
    });

    // 1st execute: DELETE; 2nd: INSERT
    expect(adapter.execute).toHaveBeenCalledTimes(2);
    const [delSql, delParams] = adapter.execute.mock.calls[0];
    expect(delSql).toMatch(/^DELETE FROM search_index/);
    expect(delParams).toEqual(['rec1', 'bylaw']);

    const [insSql, insParams] = adapter.execute.mock.calls[1];
    expect(insSql).toMatch(/INSERT INTO search_index/);
    expect(insSql).toMatch(/title_normalized/);
    expect(insSql).toMatch(/content_preview/);
    expect(insSql).toMatch(/word_count/);
    expect(insParams[0]).toBe('rec1');
    expect(insParams[1]).toBe('bylaw');
    expect(insParams[2]).toBe('Bruit Excéssif');
    expect(insParams[3]).toBe(
      'this is the body content with some words to count'
    );
    expect(insParams[4]).toBe('noise,bylaw');
    expect(insParams[5]).toBe(JSON.stringify({ foo: 'bar' }));
    // title_normalized: lowercased + diacritics stripped
    expect(insParams[6]).toBe('bruit excessif');
    // content_preview: first 500 chars (here, full content)
    expect(insParams[7]).toBe(
      'this is the body content with some words to count'
    );
    // word_count: 10 words
    expect(insParams[8]).toBe(10);
  });

  it('removeRecord: DELETEs by recordId+recordType', async () => {
    await service.removeRecord('rec1', 'bylaw');
    const [sql, params] = adapter.execute.mock.calls[0];
    expect(sql).toMatch(/^DELETE FROM search_index/);
    expect(params).toEqual(['rec1', 'bylaw']);
  });
});
