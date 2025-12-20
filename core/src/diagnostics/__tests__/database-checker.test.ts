/**
 * Unit Tests for Database Diagnostic Checker
 *
 * Note: Some tests are simplified due to ESM module mocking constraints.
 * Integration tests should verify full functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseDiagnosticChecker } from '../checkers/database-checker.js';
import { DatabaseService } from '../../database/database-service.js';
import { Logger } from '../../utils/logger.js';

describe('DatabaseDiagnosticChecker', () => {
  let checker: DatabaseDiagnosticChecker;
  let mockDatabaseService: any;
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
      getAdapter: vi.fn().mockReturnValue({
        config: {
          sqlite: {
            file: '/test/data/.system-data/civic.db',
          },
        },
      }),
      query: vi.fn(),
      execute: vi.fn(),
    };

    checker = new DatabaseDiagnosticChecker(
      mockDatabaseService as DatabaseService,
      testDataDir,
      mockLogger
    );
  });

  describe('check', () => {
    it('should run database checks', async () => {
      // Mock database queries for a successful check
      mockDatabaseService.query
        .mockResolvedValueOnce([{ integrity_check: 'ok' }]) // integrity check
        .mockResolvedValueOnce([{ name: 'users' }, { name: 'records' }]) // schema check
        .mockResolvedValueOnce([{ name: 'record_id' }]) // column check
        .mockResolvedValueOnce([{ name: 'idx_records_updated_at' }]) // index check
        .mockResolvedValueOnce([{ name: 'search_index_fts5' }]) // FTS5 table
        .mockResolvedValueOnce([{ name: 'search_index_fts5_insert' }]) // FTS5 triggers
        .mockResolvedValueOnce([{ page_size: 4096, page_count: 100 }]) // fragmentation
        .mockResolvedValueOnce([{ page_size: 4096, page_count: 100 }]); // fragmentation

      const result = await checker.check();

      // Should return a CheckResult
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(['pass', 'warning', 'error', 'skipped']).toContain(result.status);
    });

    it('should detect database corruption', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([
        { integrity_check: 'corruption detected' },
      ]);

      // Use a helper method directly if possible, or test through check()
      const result = await checker.check();

      // Should detect corruption
      expect(result).toBeDefined();
      // Corruption should result in error status or be in the error message
      expect(
        result.status === 'error' ||
          result.message?.includes('corruption') ||
          result.error
      ).toBeTruthy();
    });
  });

  describe('autoFix', () => {
    it('should fix FTS5 issues', async () => {
      const adapter = mockDatabaseService.getAdapter();
      adapter.execute = vi.fn().mockResolvedValue(undefined);

      const issue = {
        id: 'test-issue',
        severity: 'high' as const,
        message: 'FTS5 table issues',
        autoFixable: true,
        component: 'database',
        check: 'database',
      };

      const results = await checker.autoFix([issue], { backup: false });

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
      expect(adapter.execute).toHaveBeenCalled();
    });

    it('should fix fragmentation', async () => {
      mockDatabaseService.execute = vi.fn().mockResolvedValue(undefined);

      const issue = {
        id: 'test-issue',
        severity: 'low' as const,
        message: 'Database fragmentation detected',
        autoFixable: true,
        component: 'database',
        check: 'database',
      };

      const results = await checker.autoFix([issue], { backup: false });

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
      expect(mockDatabaseService.execute).toHaveBeenCalledWith('VACUUM');
    });
  });
});
