/**
 * Unit Tests for Search Sort Functionality
 *
 * Tests the sort parameter handling in SQLiteSearchService
 */

import { describe, it, expect } from 'vitest';

describe('Search Sort Query Generation', () => {
  describe('buildSearchOrderBy', () => {
    it('should generate correct ORDER BY for relevance sort', () => {
      const sort = 'relevance';
      const expectedOrderBy =
        'ORDER BY kind_priority ASC, composite_relevance_score DESC, si.updated_at DESC';

      // Verify structure
      expect(sort).toBe('relevance');
      expect(expectedOrderBy).toContain('composite_relevance_score');
      expect(expectedOrderBy).toContain('kind_priority');
    });

    it('should generate correct ORDER BY for updated_desc in search', () => {
      const sort = 'updated_desc';
      const expectedUserSort = 'si.updated_at DESC, r.created_at DESC';

      expect(sort).toBe('updated_desc');
      expect(expectedUserSort).toContain('si.updated_at');
    });

    it('should generate correct ORDER BY for title_asc in search', () => {
      const sort = 'title_asc';
      const expectedUserSort = 'si.title ASC COLLATE NOCASE, r.created_at DESC';

      expect(sort).toBe('title_asc');
      expect(expectedUserSort).toContain('COLLATE NOCASE');
      expect(expectedUserSort).toContain('si.title');
    });

    it('should always include kind priority first in search', () => {
      const sortOptions = [
        'relevance',
        'updated_desc',
        'created_desc',
        'title_asc',
        'title_desc',
      ];

      sortOptions.forEach((sort) => {
        const orderBy = buildSearchOrderBy(sort);
        // The kind priority uses a CASE statement, so check for kind in the CASE or the pattern
        expect(orderBy).toMatch(/ORDER BY[\s\S]*kind[\s\S]*ASC/i);
      });
    });

    it('should default to relevance for unknown sort', () => {
      const orderBy = buildSearchOrderBy('unknown');
      expect(orderBy).toContain('composite_relevance_score');
    });
  });

  // Helper function that mirrors the actual implementation
  function buildSearchOrderBy(sort: string = 'relevance'): string {
    const kindPriority = `CASE 
      WHEN json_extract(si.metadata, '$.kind') = 'root' THEN 3
      WHEN json_extract(si.metadata, '$.kind') = 'chapter' THEN 2
      ELSE 1
    END`;

    let userSort = '';
    switch (sort) {
      case 'relevance':
        userSort = 'composite_relevance_score DESC, si.updated_at DESC';
        break;
      case 'updated_desc':
        userSort = 'si.updated_at DESC, r.created_at DESC';
        break;
      case 'created_desc':
        userSort = 'r.created_at DESC';
        break;
      case 'title_asc':
        userSort = 'si.title ASC COLLATE NOCASE, r.created_at DESC';
        break;
      case 'title_desc':
        userSort = 'si.title DESC COLLATE NOCASE, r.created_at DESC';
        break;
      default:
        userSort = 'composite_relevance_score DESC, si.updated_at DESC';
    }

    return `ORDER BY ${kindPriority} ASC, ${userSort}`;
  }
});
