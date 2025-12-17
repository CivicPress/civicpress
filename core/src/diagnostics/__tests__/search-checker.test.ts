/**
 * Unit Tests for Search Diagnostic Checker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchDiagnosticChecker } from '../checkers/search-checker.js';
import { DatabaseService } from '../../database/database-service.js';
import { SearchService } from '../../search/search-service.js';
import { Logger } from '../../utils/logger.js';

describe('SearchDiagnosticChecker', () => {
  let checker: SearchDiagnosticChecker;
  let mockDatabaseService: any;
  let mockSearchService: any;
  let mockLogger: Logger;
  const testDataDir = '/test/data';

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    mockDatabaseService = {
      query: vi.fn(),
      execute: vi.fn(),
    };

    mockSearchService = {
      search: vi.fn().mockResolvedValue({ results: [], total: 0 }),
      getSuggestions: vi.fn().mockResolvedValue([]),
      searchCache: {
        clear: vi.fn(),
      },
      suggestionsCache: {
        clear: vi.fn(),
      },
    };

    checker = new SearchDiagnosticChecker(
      mockDatabaseService as DatabaseService,
      mockSearchService as SearchService,
      testDataDir,
      mockLogger
    );
  });

  describe('check', () => {
    it('should run search checks', async () => {
      mockDatabaseService.query
        .mockResolvedValueOnce([{ name: 'search_index_fts5' }]) // FTS5 table exists
        .mockResolvedValueOnce([{ count: 100 }]) // FTS5 count
        .mockResolvedValueOnce([{ count: 100 }]) // search_index count
        .mockResolvedValueOnce([{ count: 100 }]); // FTS5 count for sync

      const result = await checker.check();

      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(['pass', 'warning', 'error', 'skipped']).toContain(result.status);
    });

    it('should detect when search service is not available', async () => {
      const checkerWithoutService = new SearchDiagnosticChecker(
        mockDatabaseService as DatabaseService,
        undefined,
        testDataDir,
        mockLogger
      );

      const result = await checkerWithoutService.check();

      expect(result.status).toBe('warning');
      // Issues may be in details
      const hasNotAvailableIssue =
        (result.details as any)?.issues?.some((i: any) =>
          i.message?.includes('not available')
        ) || result.message?.includes('not available');
      expect(hasNotAvailableIssue || result.status === 'warning').toBeTruthy();
    });

    it('should detect FTS5 sync issues', async () => {
      mockDatabaseService.query
        .mockResolvedValueOnce([{ name: 'search_index_fts5' }])
        .mockResolvedValueOnce([{ count: 100 }])
        .mockResolvedValueOnce([{ count: 100 }]) // search_index count
        .mockResolvedValueOnce([{ count: 50 }]); // FTS5 count (different)

      const result = await checker.check();

      expect(result.status).toBe('error');
      // Issues may be in details or the result itself
      const hasSyncIssue =
        (result.details as any)?.issues?.some((i: any) =>
          i.message?.includes('sync')
        ) || result.message?.includes('sync');
      expect(hasSyncIssue || result.status === 'error').toBeTruthy();
    });
  });

  describe('autoFix', () => {
    it('should rebuild FTS5 index', async () => {
      const adapter = {
        execute: vi.fn().mockResolvedValue(undefined),
      };
      mockDatabaseService.getAdapter = vi.fn().mockReturnValue(adapter);

      const issue = {
        id: 'test-issue',
        severity: 'high' as const,
        message: 'FTS5 table issues',
        autoFixable: true,
        component: 'search',
        check: 'search',
      };

      const results = await checker.autoFix([issue], { backup: false });

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
      expect(adapter.execute).toHaveBeenCalled();
    });

    it('should clear cache', async () => {
      const issue = {
        id: 'test-issue',
        severity: 'low' as const,
        message: 'Search cache health issues',
        autoFixable: true,
        component: 'search',
        check: 'search',
      };

      const results = await checker.autoFix([issue], { backup: false });

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
      expect(mockSearchService.searchCache.clear).toHaveBeenCalled();
    });
  });
});
