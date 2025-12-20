/**
 * Search Diagnostic Checker
 *
 * Checks search index health, FTS5 sync, query performance, and cache status.
 */

import { BaseDiagnosticChecker } from '../base-checker.js';
import { DatabaseService } from '../../database/database-service.js';
import { SearchService } from '../../search/search-service.js';
import { Logger } from '../../utils/logger.js';
import {
  CheckResult,
  DiagnosticIssue,
  FixResult,
  FixOptions,
  DiagnosticOptions,
} from '../types.js';
import { BackupService } from '../../backup/backup-service.js';
import * as path from 'path';

export class SearchDiagnosticChecker extends BaseDiagnosticChecker {
  name = 'search';
  component = 'search';
  critical = false; // Search issues are not critical (system can still function)

  private databaseService: DatabaseService;
  private searchService?: SearchService;
  private dataDir: string;

  constructor(
    databaseService: DatabaseService,
    searchService: SearchService | undefined,
    dataDir: string,
    logger?: Logger
  ) {
    super(logger);
    this.databaseService = databaseService;
    this.searchService = searchService;
    this.dataDir = dataDir;
  }

  /**
   * Run all search diagnostic checks
   */
  async check(options?: DiagnosticOptions): Promise<CheckResult> {
    const checks: CheckResult[] = [];
    const issues: DiagnosticIssue[] = [];

    try {
      // Check 1: Search service availability
      const availabilityCheck = await this.checkServiceAvailability();
      checks.push(availabilityCheck);
      if (availabilityCheck.status === 'error') {
        issues.push(
          this.createIssue('high', 'Search service not available', {
            autoFixable: false,
            recommendations: [
              'Check database configuration',
              'Verify FTS5 extension is enabled',
              'Review database initialization logs',
            ],
            details: availabilityCheck.details,
          })
        );
        return this.createErrorResult(
          'Search service not available',
          undefined,
          {
            checks,
          }
        );
      }

      if (!this.searchService) {
        return this.createWarningResult('Search service not initialized', {
          checks,
          issues: [
            this.createIssue('medium', 'Search service not available', {
              autoFixable: false,
              recommendations: ['Search functionality may be limited'],
            }),
          ],
        });
      }

      // Check 2: FTS5 table health
      const fts5Check = await this.checkFTS5Health();
      checks.push(fts5Check);
      if (fts5Check.status === 'error' || fts5Check.status === 'warning') {
        issues.push(
          this.createIssue(
            fts5Check.status === 'error' ? 'high' : 'medium',
            'FTS5 table health issues',
            {
              autoFixable: true,
              fix: {
                description: 'Rebuild FTS5 index',
                command: 'civic diagnose:search --fix',
                requiresConfirmation: true,
                estimatedDuration: 10000,
              },
              recommendations: [
                'Rebuild FTS5 index to restore search functionality',
                'Re-run indexing after fix: civic index --sync-db',
              ],
              details: fts5Check.details,
            }
          )
        );
      }

      // Check 3: Index sync validation
      const syncCheck = await this.checkIndexSync();
      checks.push(syncCheck);
      if (syncCheck.status === 'error' || syncCheck.status === 'warning') {
        issues.push(
          this.createIssue(
            syncCheck.status === 'error' ? 'high' : 'medium',
            'Search index sync issues',
            {
              autoFixable: true,
              fix: {
                description: 'Rebuild search index',
                command: 'civic index --sync-db',
                requiresConfirmation: false,
                estimatedDuration: 30000,
              },
              recommendations: [
                'Run full index sync: civic index --sync-db',
                'Check for indexing errors in logs',
              ],
              details: syncCheck.details,
            }
          )
        );
      }

      // Check 4: Query performance
      const performanceCheck = await this.checkQueryPerformance();
      checks.push(performanceCheck);
      if (performanceCheck.status === 'warning') {
        issues.push(
          this.createIssue('low', 'Search query performance issues', {
            autoFixable: false,
            recommendations: [
              'Consider optimizing database indexes',
              'Check for database fragmentation',
              'Review query complexity',
            ],
            details: performanceCheck.details,
          })
        );
      }

      // Check 5: Cache health
      const cacheCheck = await this.checkCacheHealth();
      checks.push(cacheCheck);
      if (cacheCheck.status === 'warning') {
        issues.push(
          this.createIssue('low', 'Search cache health issues', {
            autoFixable: true,
            fix: {
              description: 'Clear search cache',
              command: 'civic diagnose:search --fix',
              requiresConfirmation: false,
            },
            recommendations: ['Clear cache to free memory'],
            details: cacheCheck.details,
          })
        );
      }

      // Check 6: Suggestions functionality
      const suggestionsCheck = await this.checkSuggestions();
      checks.push(suggestionsCheck);
      if (
        suggestionsCheck.status === 'error' ||
        suggestionsCheck.status === 'warning'
      ) {
        issues.push(
          this.createIssue(
            suggestionsCheck.status === 'error' ? 'medium' : 'low',
            'Search suggestions issues',
            {
              autoFixable: false,
              recommendations: [
                'Check search index has indexed records',
                'Verify title_normalized column is populated',
              ],
              details: suggestionsCheck.details,
            }
          )
        );
      }

      // Determine overall status
      const hasErrors = checks.some((c) => c.status === 'error');
      const hasWarnings = checks.some((c) => c.status === 'warning');

      if (hasErrors) {
        return this.createErrorResult(
          'Search diagnostic found critical issues',
          undefined,
          {
            checks,
            issues,
          }
        );
      }

      if (hasWarnings) {
        return this.createWarningResult('Search diagnostic found warnings', {
          checks,
          issues,
        });
      }

      return this.createSuccessResult('All search checks passed', {
        checks,
        issues: [],
      });
    } catch (error: any) {
      this.logger.error('Search diagnostic check failed', {
        error: error.message,
        stack: error.stack,
      });
      return this.createErrorResult('Search diagnostic check failed', error, {
        checks,
        issues,
      });
    }
  }

  /**
   * Check if search service is available
   */
  private async checkServiceAvailability(): Promise<CheckResult> {
    try {
      if (!this.searchService) {
        return this.createWarningResult('Search service not initialized');
      }

      // Try a simple query to verify service works
      try {
        await this.searchService.search('test', { limit: 1 });
        return this.createSuccessResult(
          'Search service is available and functional'
        );
      } catch (error: any) {
        return this.createErrorResult('Search service query failed', error, {
          errorMessage: error.message,
        });
      }
    } catch (error: any) {
      return this.createErrorResult(
        'Failed to check search service availability',
        error
      );
    }
  }

  /**
   * Check FTS5 table health
   */
  private async checkFTS5Health(): Promise<CheckResult> {
    try {
      // Check if FTS5 table exists and is accessible
      const fts5Tables = await this.databaseService.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='search_index_fts5'"
      );

      if (fts5Tables.length === 0) {
        return this.createErrorResult('FTS5 table does not exist', undefined, {
          table: 'search_index_fts5',
        });
      }

      // Try to query FTS5 table
      try {
        const testQuery = await this.databaseService.query(
          'SELECT COUNT(*) as count FROM search_index_fts5'
        );
        const count = testQuery[0]?.count || 0;

        if (count === 0) {
          return this.createWarningResult('FTS5 table is empty', {
            count: 0,
            recommendation: 'Run indexing to populate FTS5 table',
          });
        }

        return this.createSuccessResult('FTS5 table is healthy', {
          recordCount: count,
        });
      } catch (error: any) {
        if (error.message?.includes('no such table')) {
          return this.createErrorResult(
            'FTS5 table exists but is not accessible',
            error
          );
        }
        return this.createErrorResult('Failed to query FTS5 table', error);
      }
    } catch (error: any) {
      return this.createErrorResult('Failed to check FTS5 health', error);
    }
  }

  /**
   * Check index sync between search_index and search_index_fts5
   */
  private async checkIndexSync(): Promise<CheckResult> {
    try {
      // Get count from search_index
      const searchIndexCount = await this.databaseService.query(
        'SELECT COUNT(*) as count FROM search_index'
      );
      const baseCount = searchIndexCount[0]?.count || 0;

      // Get count from FTS5
      let fts5Count = 0;
      try {
        const fts5CountResult = await this.databaseService.query(
          'SELECT COUNT(*) as count FROM search_index_fts5'
        );
        fts5Count = fts5CountResult[0]?.count || 0;
      } catch (error: any) {
        return this.createErrorResult(
          'Failed to query FTS5 table for sync check',
          error
        );
      }

      // Compare counts
      const difference = Math.abs(baseCount - fts5Count);
      const syncPercentage =
        baseCount > 0 ? ((fts5Count / baseCount) * 100).toFixed(1) : '0';

      if (difference === 0) {
        return this.createSuccessResult('Search index is in sync', {
          searchIndexCount: baseCount,
          fts5Count,
        });
      }

      if (difference <= 5) {
        return this.createWarningResult('Minor search index sync discrepancy', {
          searchIndexCount: baseCount,
          fts5Count,
          difference,
          syncPercentage: `${syncPercentage}%`,
          recommendation: 'Run index sync to resolve minor differences',
        });
      }

      return this.createErrorResult(
        'Significant search index sync discrepancy',
        undefined,
        {
          searchIndexCount: baseCount,
          fts5Count,
          difference,
          syncPercentage: `${syncPercentage}%`,
          recommendation: 'Run full index rebuild: civic index --sync-db',
        }
      );
    } catch (error: any) {
      return this.createErrorResult('Failed to check index sync', error);
    }
  }

  /**
   * Check query performance
   */
  private async checkQueryPerformance(): Promise<CheckResult> {
    try {
      if (!this.searchService) {
        return this.createWarningResult(
          'Cannot check performance: search service not available'
        );
      }

      const testQueries = ['test', 'article', 'council'];
      const performanceResults: number[] = [];

      for (const query of testQueries) {
        const startTime = Date.now();
        try {
          await this.searchService.search(query, { limit: 10 });
          const duration = Date.now() - startTime;
          performanceResults.push(duration);
        } catch (error: any) {
          // If query fails, skip it
          continue;
        }
      }

      if (performanceResults.length === 0) {
        return this.createWarningResult('Could not measure query performance', {
          reason: 'All test queries failed',
        });
      }

      const avgDuration =
        performanceResults.reduce((a, b) => a + b, 0) /
        performanceResults.length;
      const maxDuration = Math.max(...performanceResults);

      // Thresholds: <100ms = good, 100-500ms = acceptable, >500ms = slow
      if (avgDuration > 500 || maxDuration > 1000) {
        return this.createWarningResult('Search query performance is slow', {
          averageDuration: `${avgDuration.toFixed(0)}ms`,
          maxDuration: `${maxDuration.toFixed(0)}ms`,
          recommendation: 'Consider optimizing indexes or reducing index size',
        });
      }

      if (avgDuration > 100) {
        return this.createWarningResult(
          'Search query performance could be improved',
          {
            averageDuration: `${avgDuration.toFixed(0)}ms`,
            maxDuration: `${maxDuration.toFixed(0)}ms`,
          }
        );
      }

      return this.createSuccessResult('Search query performance is good', {
        averageDuration: `${avgDuration.toFixed(0)}ms`,
        maxDuration: `${maxDuration.toFixed(0)}ms`,
      });
    } catch (error: any) {
      return this.createWarningResult('Failed to check query performance', {
        error: error.message,
      });
    }
  }

  /**
   * Check cache health
   */
  private async checkCacheHealth(): Promise<CheckResult> {
    try {
      if (!this.searchService) {
        return this.createSuccessResult(
          'Cache check skipped: search service not available'
        );
      }

      // Access cache statistics if available (via private property access)
      // Note: This is a bit of a hack, but necessary to check cache health
      const searchService = this.searchService as any;

      // Check if caches exist
      if (!searchService.searchCache && !searchService.suggestionsCache) {
        return this.createSuccessResult(
          'Cache check skipped: caches not accessible'
        );
      }

      // Try to get cache stats if available
      let cacheStats: any = {};

      if (searchService.searchCache) {
        try {
          const stats = searchService.searchCache.getStats?.();
          if (stats) {
            cacheStats.searchCache = stats;
          }
        } catch {
          // Cache doesn't expose stats
        }
      }

      if (searchService.suggestionsCache) {
        try {
          const stats = searchService.suggestionsCache.getStats?.();
          if (stats) {
            cacheStats.suggestionsCache = stats;
          }
        } catch {
          // Cache doesn't expose stats
        }
      }

      // If we can't get stats, just verify cache exists
      if (Object.keys(cacheStats).length === 0) {
        return this.createSuccessResult('Search caches are initialized');
      }

      return this.createSuccessResult('Search cache health is good', {
        cacheStats,
      });
    } catch (error: any) {
      return this.createWarningResult('Failed to check cache health', {
        error: error.message,
      });
    }
  }

  /**
   * Check search suggestions functionality
   */
  private async checkSuggestions(): Promise<CheckResult> {
    try {
      if (!this.searchService) {
        return this.createWarningResult(
          'Cannot check suggestions: search service not available'
        );
      }

      // Test suggestions with a simple query
      const testQueries = ['art', 'coun', 'test'];
      let successCount = 0;
      let errorCount = 0;

      for (const query of testQueries) {
        try {
          const suggestions = await this.searchService.getSuggestions(
            query,
            5,
            false
          );
          if (Array.isArray(suggestions)) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error: any) {
          errorCount++;
        }
      }

      if (errorCount === testQueries.length) {
        return this.createErrorResult('Search suggestions are not working', {
          testQueries,
          errors: 'All suggestion queries failed',
        });
      }

      if (errorCount > 0) {
        return this.createWarningResult(
          'Some search suggestions queries failed',
          {
            successCount,
            errorCount,
            totalQueries: testQueries.length,
          }
        );
      }

      return this.createSuccessResult('Search suggestions are working', {
        testQueries: testQueries.length,
        successCount,
      });
    } catch (error: any) {
      return this.createWarningResult('Failed to check search suggestions', {
        error: error.message,
      });
    }
  }

  /**
   * Auto-fix search issues
   */
  async autoFix(
    issues: DiagnosticIssue[],
    options?: FixOptions
  ): Promise<FixResult[]> {
    const results: FixResult[] = [];

    for (const issue of issues) {
      const startTime = Date.now();

      try {
        // Create backup before fixes
        let backupId: string | undefined;
        if (options?.backup !== false) {
          try {
            const adapter = this.databaseService.getAdapter();
            const dbPath = (adapter as any).config?.sqlite?.file;
            const backupDir = path.join(this.dataDir, 'exports', 'backups');

            const backup = await BackupService.createBackup({
              dataDir: this.dataDir,
              outputDir: backupDir,
              includeStorage: false,
              includeGitBundle: true,
              compress: true,
              extraMetadata: {
                reason: 'diagnostic_auto_fix',
                description: `Auto-fix for issue: ${issue.message}`,
                issueId: issue.id,
              },
              logger: this.logger,
              databaseConfig: (adapter as any).config,
            });
            backupId = backup.timestamp;
          } catch (error: any) {
            this.logger.warn('Failed to create backup before fix', {
              error: error.message,
            });
          }
        }

        // Fix based on issue type
        if (
          issue.message.includes('FTS5') ||
          issue.message.includes('index sync')
        ) {
          await this.fixFTS5Index();
          results.push(
            this.createFixResult(issue.id, true, 'FTS5 index rebuilt', {
              backupId,
              rollbackAvailable: !!backupId,
              duration: Date.now() - startTime,
            })
          );
        } else if (issue.message.includes('cache')) {
          await this.clearCache();
          results.push(
            this.createFixResult(issue.id, true, 'Search cache cleared', {
              backupId,
              rollbackAvailable: !!backupId,
              duration: Date.now() - startTime,
            })
          );
        } else {
          results.push(
            this.createFixResult(
              issue.id,
              false,
              'Auto-fix not available for this issue',
              {
                duration: Date.now() - startTime,
              }
            )
          );
        }
      } catch (error: any) {
        results.push(
          this.createFixResult(
            issue.id,
            false,
            `Auto-fix failed: ${error.message}`,
            {
              error,
              duration: Date.now() - startTime,
            }
          )
        );
      }
    }

    return results;
  }

  /**
   * Fix FTS5 index by rebuilding
   */
  private async fixFTS5Index(): Promise<void> {
    const adapter = this.databaseService.getAdapter();

    // Drop and recreate FTS5 table
    try {
      await adapter.execute('DROP TABLE IF EXISTS search_index_fts5');
      await adapter.execute('DROP TRIGGER IF EXISTS search_index_fts5_insert');
      await adapter.execute('DROP TRIGGER IF EXISTS search_index_fts5_update');
      await adapter.execute('DROP TRIGGER IF EXISTS search_index_fts5_delete');
    } catch (error: any) {
      this.logger.warn('Error dropping FTS5 table/triggers', {
        error: error.message,
      });
    }

    // Recreate FTS5 table
    await adapter.execute(`
      CREATE VIRTUAL TABLE search_index_fts5 USING fts5(
        record_id UNINDEXED,
        record_type UNINDEXED,
        title,
        content,
        tags,
        metadata UNINDEXED,
        content='search_index',
        content_rowid='rowid'
      );
    `);

    // Recreate triggers
    await adapter.execute(`
      CREATE TRIGGER search_index_fts5_insert 
      AFTER INSERT ON search_index 
      BEGIN
        INSERT INTO search_index_fts5(rowid, record_id, record_type, title, content, tags, metadata)
        VALUES (new.rowid, new.record_id, new.record_type, new.title, new.content, new.tags, new.metadata);
      END;
    `);

    await adapter.execute(`
      CREATE TRIGGER search_index_fts5_update 
      AFTER UPDATE ON search_index 
      BEGIN
        INSERT INTO search_index_fts5(search_index_fts5, rowid, record_id, record_type, title, content, tags, metadata)
        VALUES('delete', old.rowid, old.record_id, old.record_type, old.title, old.content, old.tags, old.metadata);
        INSERT INTO search_index_fts5(rowid, record_id, record_type, title, content, tags, metadata)
        VALUES (new.rowid, new.record_id, new.record_type, new.title, new.content, new.tags, new.metadata);
      END;
    `);

    await adapter.execute(`
      CREATE TRIGGER search_index_fts5_delete 
      AFTER DELETE ON search_index 
      BEGIN
        INSERT INTO search_index_fts5(search_index_fts5, rowid, record_id, record_type, title, content, tags, metadata)
        VALUES('delete', old.rowid, old.record_id, old.record_type, old.title, old.content, old.tags, old.metadata);
      END;
    `);

    // Rebuild FTS5 from search_index
    await adapter.execute(`
      INSERT INTO search_index_fts5(rowid, record_id, record_type, title, content, tags, metadata)
      SELECT rowid, record_id, record_type, title, content, tags, metadata
      FROM search_index
    `);

    this.logger.info('FTS5 index rebuilt');
  }

  /**
   * Clear search caches
   */
  private async clearCache(): Promise<void> {
    if (!this.searchService) {
      return;
    }

    const searchService = this.searchService as any;

    if (searchService.searchCache) {
      try {
        searchService.searchCache.clear?.();
      } catch (error: any) {
        this.logger.warn('Failed to clear search cache', {
          error: error.message,
        });
      }
    }

    if (searchService.suggestionsCache) {
      try {
        searchService.suggestionsCache.clear?.();
      } catch (error: any) {
        this.logger.warn('Failed to clear suggestions cache', {
          error: error.message,
        });
      }
    }

    this.logger.info('Search caches cleared');
  }
}
