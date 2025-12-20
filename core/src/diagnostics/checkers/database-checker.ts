/**
 * Database Diagnostic Checker
 *
 * Checks database integrity, schema, indexes, and FTS5 health.
 */

import { BaseDiagnosticChecker } from '../base-checker.js';
import { DatabaseService } from '../../database/database-service.js';
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
import * as fs from 'fs';

export class DatabaseDiagnosticChecker extends BaseDiagnosticChecker {
  name = 'database';
  component = 'database';
  critical = true; // Database issues are critical

  private databaseService: DatabaseService;
  private dataDir: string;

  constructor(
    databaseService: DatabaseService,
    dataDir: string,
    logger?: Logger
  ) {
    super(logger);
    this.databaseService = databaseService;
    this.dataDir = dataDir;
  }

  /**
   * Run all database diagnostic checks
   */
  async check(options?: DiagnosticOptions): Promise<CheckResult> {
    const checks: CheckResult[] = [];
    const issues: DiagnosticIssue[] = [];

    try {
      // Check 1: Database file existence and accessibility
      const fileCheck = await this.checkDatabaseFile();
      checks.push(fileCheck);
      if (fileCheck.status === 'error') {
        issues.push(
          this.createIssue(
            'critical',
            fileCheck.message || 'Database file check failed',
            {
              details: fileCheck.details,
            }
          )
        );
        return this.createErrorResult('Database file check failed', undefined, {
          checks,
        });
      }

      // Check 2: SQLite integrity
      const integrityCheck = await this.checkIntegrity();
      checks.push(integrityCheck);
      if (integrityCheck.status === 'error') {
        issues.push(
          this.createIssue('critical', 'Database corruption detected', {
            autoFixable: false,
            recommendations: [
              'Restore from backup if available',
              'Run PRAGMA integrity_check for details',
              'Consider database repair tools',
            ],
            details: integrityCheck.details,
          })
        );
      }

      // Check 3: Schema validation
      const schemaCheck = await this.checkSchema();
      checks.push(schemaCheck);
      if (schemaCheck.status === 'error' || schemaCheck.status === 'warning') {
        // Only create an issue if it's fixable (not just extra tables)
        const details = schemaCheck.details as any;
        const hasFixableIssues =
          (details?.missing &&
            Array.isArray(details.missing) &&
            details.missing.length > 0) ||
          (details?.missingColumns &&
            Array.isArray(details.missingColumns) &&
            details.missingColumns.length > 0) ||
          (details?.missingIndexes &&
            Array.isArray(details.missingIndexes) &&
            details.missingIndexes.length > 0);

        // Don't create an issue for "extra tables" or "Unexpected tables found" - that's just informational
        const isExtraTablesOnly =
          (details?.extra &&
            Array.isArray(details.extra) &&
            details.extra.length > 0) ||
          schemaCheck.message?.includes('Unexpected tables found') ||
          schemaCheck.message?.includes('Extra tables');

        // Only create an issue if there are actual fixable problems, not just extra tables
        if (
          !isExtraTablesOnly &&
          (hasFixableIssues || schemaCheck.status === 'error')
        ) {
          const schemaIssue = this.createIssue(
            schemaCheck.status === 'error' ? 'high' : 'medium',
            schemaCheck.message || 'Schema validation issues found',
            {
              autoFixable: hasFixableIssues && schemaCheck.status === 'warning',
              fix:
                hasFixableIssues && schemaCheck.status === 'warning'
                  ? {
                      description: 'Recreate missing tables/indexes',
                      command: 'civic diagnose:database --fix',
                      requiresConfirmation: true,
                    }
                  : undefined,
              details: schemaCheck.details,
            }
          );
          issues.push(schemaIssue);

          // Also store the issue in the check's details so extractIssues can find it
          if (!schemaCheck.details) {
            schemaCheck.details = {};
          }
          if (!Array.isArray(schemaCheck.details.issues)) {
            schemaCheck.details.issues = [];
          }
          schemaCheck.details.issues.push(schemaIssue);
        }
      }

      // Check 4: Index integrity
      const indexCheck = await this.checkIndexes();
      checks.push(indexCheck);
      if (indexCheck.status === 'warning') {
        issues.push(
          this.createIssue('medium', 'Index issues detected', {
            autoFixable: true,
            fix: {
              description: 'Recreate missing indexes',
              command: 'civic diagnose:database --fix',
              requiresConfirmation: false,
            },
            details: indexCheck.details,
          })
        );
      }

      // Check 5: FTS5 table and triggers
      const fts5Check = await this.checkFTS5();
      checks.push(fts5Check);
      if (fts5Check.status === 'error' || fts5Check.status === 'warning') {
        issues.push(
          this.createIssue(
            fts5Check.status === 'error' ? 'high' : 'medium',
            'FTS5 table or trigger issues',
            {
              autoFixable: true,
              fix: {
                description: 'Rebuild FTS5 table and triggers',
                command: 'civic diagnose:database --fix',
                requiresConfirmation: true,
                estimatedDuration: 5000,
              },
              recommendations: [
                'Rebuild FTS5 table to restore search functionality',
                'Re-run indexing after fix: civic index --sync-db',
              ],
              details: fts5Check.details,
            }
          )
        );
      }

      // Check 6: Fragmentation analysis
      const fragmentationCheck = await this.checkFragmentation();
      checks.push(fragmentationCheck);
      if (fragmentationCheck.status === 'warning') {
        issues.push(
          this.createIssue('low', 'Database fragmentation detected', {
            autoFixable: true,
            fix: {
              description: 'Run VACUUM to reduce fragmentation',
              command: 'civic diagnose:database --fix',
              requiresConfirmation: false,
              estimatedDuration: 10000,
            },
            recommendations: [
              'Run VACUUM periodically to maintain performance',
            ],
            details: fragmentationCheck.details,
          })
        );
      }

      // Determine overall status
      const hasErrors = checks.some((c) => c.status === 'error');
      const hasWarnings = checks.some((c) => c.status === 'warning');

      if (hasErrors) {
        return this.createErrorResult(
          'Database diagnostic found critical issues',
          undefined,
          {
            checks,
            issues,
          }
        );
      }

      if (hasWarnings) {
        // Use the first warning's message if available, otherwise generic message
        const firstWarning = checks.find((c) => c.status === 'warning');
        const warningMessage =
          firstWarning?.message || 'Database diagnostic found warnings';

        // Store issues in each check's details so extractIssues can find them
        // Also store in the overall result's details
        const resultDetails: any = {
          checks,
          issues,
        };

        // Also ensure each check that has issues stores them in its details
        for (const check of checks) {
          if (
            (check.status === 'error' || check.status === 'warning') &&
            (!check.details ||
              !Array.isArray(check.details.issues) ||
              check.details.issues.length === 0)
          ) {
            // Find issues for this check
            const checkIssues = issues.filter((i) => i.check === check.name);
            if (checkIssues.length > 0) {
              if (!check.details) {
                check.details = {};
              }
              check.details.issues = checkIssues;
            }
          }
        }

        return this.createWarningResult(warningMessage, resultDetails);
      }

      return this.createSuccessResult('All database checks passed', {
        checks,
        issues: [],
      });
    } catch (error: any) {
      this.logger.error('Database diagnostic check failed', {
        error: error.message,
        stack: error.stack,
      });
      return this.createErrorResult('Database diagnostic check failed', error, {
        checks,
        issues,
      });
    }
  }

  /**
   * Check database file existence and accessibility
   */
  private async checkDatabaseFile(): Promise<CheckResult> {
    try {
      const adapter = this.databaseService.getAdapter();
      const dbPath = (adapter as any).config?.sqlite?.file;

      if (!dbPath) {
        return this.createErrorResult('Database path not configured');
      }

      // Check if file exists
      if (!fs.existsSync(dbPath)) {
        return this.createErrorResult(
          'Database file does not exist',
          undefined,
          {
            path: dbPath,
          }
        );
      }

      // Check if file is readable
      try {
        fs.accessSync(dbPath, fs.constants.R_OK | fs.constants.W_OK);
      } catch (error) {
        return this.createErrorResult(
          'Database file is not accessible',
          error,
          {
            path: dbPath,
          }
        );
      }

      // Check file size
      const stats = fs.statSync(dbPath);
      if (stats.size === 0) {
        return this.createErrorResult('Database file is empty');
      }

      return this.createSuccessResult('Database file is accessible', {
        path: dbPath,
        size: stats.size,
      });
    } catch (error: any) {
      return this.createErrorResult('Failed to check database file', error);
    }
  }

  /**
   * Check SQLite integrity
   */
  private async checkIntegrity(): Promise<CheckResult> {
    try {
      const result = await this.databaseService.query('PRAGMA integrity_check');

      if (result.length === 0) {
        return this.createErrorResult('Integrity check returned no results');
      }

      const integrityResult = result[0];
      const integrityValue =
        integrityResult.integrity_check || integrityResult['integrity_check'];

      if (integrityValue === 'ok') {
        return this.createSuccessResult('Database integrity verified');
      }

      return this.createErrorResult(
        'Database integrity check failed',
        undefined,
        {
          integrityResult: integrityValue,
        }
      );
    } catch (error: any) {
      // Check if it's a corruption error
      if (
        error.message?.includes('corrupt') ||
        error.message?.includes('malformed')
      ) {
        return this.createErrorResult('Database corruption detected', error, {
          errorCode: error.code,
        });
      }
      return this.createErrorResult('Failed to run integrity check', error);
    }
  }

  /**
   * Check schema (required tables exist)
   */
  private async checkSchema(): Promise<CheckResult> {
    try {
      const requiredTables = [
        'users',
        'api_keys',
        'sessions',
        'search_index',
        'records',
        'record_drafts',
      ];

      const existingTables = await this.databaseService.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      const tableNames = existingTables.map((t: any) => t.name);

      const missingTables = requiredTables.filter(
        (t) => !tableNames.includes(t)
      );
      const extraTables = tableNames.filter(
        (t: string) =>
          !requiredTables.includes(t) && !t.startsWith('search_index_fts5')
      );

      if (missingTables.length > 0) {
        return this.createErrorResult('Missing required tables', undefined, {
          missing: missingTables,
          existing: tableNames,
        });
      }

      if (extraTables.length > 0) {
        // Extra tables are informational only - return success with info in details
        // This prevents it from being treated as an issue
        return this.createSuccessResult('Schema validation passed', {
          extra: extraTables,
          note: 'Extra tables found (informational only)',
        });
      }

      // Check required columns in key tables
      const columnCheck = await this.checkTableColumns();
      if (columnCheck.status !== 'pass') {
        return columnCheck;
      }

      return this.createSuccessResult('Schema validation passed', {
        tables: tableNames.length,
      });
    } catch (error: any) {
      return this.createErrorResult('Failed to check schema', error);
    }
  }

  /**
   * Check table columns
   */
  private async checkTableColumns(): Promise<CheckResult> {
    try {
      // Check search_index table has required columns
      const searchIndexInfo = await this.databaseService.query(
        'PRAGMA table_info(search_index)'
      );
      const searchIndexColumns = searchIndexInfo.map((c: any) => c.name);

      const requiredColumns = [
        'record_id',
        'record_type',
        'title',
        'title_normalized',
      ];

      const missingColumns = requiredColumns.filter(
        (c) => !searchIndexColumns.includes(c)
      );

      if (missingColumns.length > 0) {
        return this.createWarningResult('Missing columns in search_index', {
          missing: missingColumns,
          table: 'search_index',
        });
      }

      return this.createSuccessResult('Table columns validated');
    } catch (error: any) {
      return this.createErrorResult('Failed to check table columns', error);
    }
  }

  /**
   * Check indexes
   */
  private async checkIndexes(): Promise<CheckResult> {
    try {
      const indexes = await this.databaseService.query(
        "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
      );
      const indexNames = indexes.map((i: any) => i.name);

      // Check for important indexes
      const importantIndexes = [
        'idx_records_updated_at',
        'idx_records_created_at',
        'idx_records_title',
        'idx_search_index_updated_at',
        'idx_search_index_title',
      ];

      const missingIndexes = importantIndexes.filter(
        (idx) =>
          !indexNames.some((name: string) =>
            name.includes(idx.split('_').slice(1).join('_'))
          )
      );

      if (missingIndexes.length > 0) {
        return this.createWarningResult('Some indexes are missing', {
          missing: missingIndexes,
          existing: indexNames,
        });
      }

      return this.createSuccessResult('Index validation passed', {
        indexes: indexNames.length,
      });
    } catch (error: any) {
      return this.createErrorResult('Failed to check indexes', error);
    }
  }

  /**
   * Check FTS5 table and triggers
   */
  private async checkFTS5(): Promise<CheckResult> {
    try {
      // Check if FTS5 table exists
      const fts5Tables = await this.databaseService.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='search_index_fts5'"
      );

      if (fts5Tables.length === 0) {
        return this.createErrorResult('FTS5 table does not exist', undefined, {
          table: 'search_index_fts5',
        });
      }

      // Check FTS5 table structure
      try {
        const fts5Info = await this.databaseService.query(
          'SELECT * FROM search_index_fts5 LIMIT 1'
        );
        // If we can query it, it exists and is accessible
      } catch (error: any) {
        if (error.message?.includes('no such table')) {
          return this.createErrorResult(
            'FTS5 table exists but is not accessible',
            error
          );
        }
        // Other errors (like empty table) are OK
      }

      // Check triggers
      const triggers = await this.databaseService.query(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'search_index_fts5_%'"
      );
      const triggerNames = triggers.map((t: any) => t.name);

      const requiredTriggers = [
        'search_index_fts5_insert',
        'search_index_fts5_update',
        'search_index_fts5_delete',
      ];

      const missingTriggers = requiredTriggers.filter(
        (t) => !triggerNames.includes(t)
      );

      if (missingTriggers.length > 0) {
        return this.createErrorResult('FTS5 triggers are missing', undefined, {
          missing: missingTriggers,
          existing: triggerNames,
        });
      }

      return this.createSuccessResult('FTS5 table and triggers validated', {
        triggers: triggerNames.length,
      });
    } catch (error: any) {
      return this.createErrorResult('Failed to check FTS5', error);
    }
  }

  /**
   * Check database fragmentation
   */
  private async checkFragmentation(): Promise<CheckResult> {
    try {
      // Get database file size
      const adapter = this.databaseService.getAdapter();
      const dbPath = (adapter as any).config?.sqlite?.file;

      if (!dbPath || !fs.existsSync(dbPath)) {
        return this.createWarningResult(
          'Cannot check fragmentation: database file not found'
        );
      }

      const fileSize = fs.statSync(dbPath).size;

      // Get page count and size
      const pageSizeResult =
        await this.databaseService.query('PRAGMA page_size');
      const pageCountResult =
        await this.databaseService.query('PRAGMA page_count');

      const pageSize = pageSizeResult[0]?.page_size || 4096;
      const pageCount = pageCountResult[0]?.page_count || 0;
      const expectedSize = pageSize * pageCount;

      // Calculate fragmentation percentage
      const fragmentation =
        expectedSize > 0 ? ((fileSize - expectedSize) / expectedSize) * 100 : 0;

      if (fragmentation > 20) {
        return this.createWarningResult(
          'High database fragmentation detected',
          {
            fragmentation: `${fragmentation.toFixed(1)}%`,
            fileSize,
            expectedSize,
            recommendation: 'Run VACUUM to reduce fragmentation',
          }
        );
      }

      if (fragmentation > 10) {
        return this.createWarningResult('Moderate database fragmentation', {
          fragmentation: `${fragmentation.toFixed(1)}%`,
          recommendation: 'Consider running VACUUM',
        });
      }

      return this.createSuccessResult('Database fragmentation is acceptable', {
        fragmentation: `${fragmentation.toFixed(1)}%`,
      });
    } catch (error: any) {
      return this.createWarningResult('Failed to check fragmentation', {
        error: error.message,
      });
    }
  }

  /**
   * Auto-fix database issues
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
            this.logger.info('Backup created before fix', {
              backupId,
              backupPath: backup.tarballPath,
            });
          } catch (error: any) {
            this.logger.warn('Failed to create backup before fix', {
              error: error.message,
              stack: error.stack,
              backupDir: path.join(this.dataDir, 'exports', 'backups'),
            });
            // Continue with fix even if backup fails, but log the warning
          }
        }

        // Fix based on issue type
        if (issue.message.includes('FTS5')) {
          await this.fixFTS5();
          results.push(
            this.createFixResult(
              issue.id,
              true,
              'FTS5 table and triggers rebuilt',
              {
                backupId,
                rollbackAvailable: !!backupId,
                duration: Date.now() - startTime,
              }
            )
          );
        } else if (issue.message.includes('fragmentation')) {
          await this.fixFragmentation();
          results.push(
            this.createFixResult(issue.id, true, 'Database vacuumed', {
              backupId,
              rollbackAvailable: !!backupId,
              duration: Date.now() - startTime,
            })
          );
        } else if (
          issue.message.includes('index') ||
          issue.message.includes('Index')
        ) {
          await this.fixIndexes();
          results.push(
            this.createFixResult(issue.id, true, 'Indexes recreated', {
              backupId,
              rollbackAvailable: !!backupId,
              duration: Date.now() - startTime,
            })
          );
        } else if (
          issue.message.includes('Schema validation') ||
          issue.message.includes('schema')
        ) {
          // Check issue details to determine what needs fixing
          const details = issue.details as any;
          let fixed = false;
          let fixMessage = 'Schema issues addressed';

          // Log details for debugging
          this.logger.debug('Schema validation fix attempt', {
            issueId: issue.id,
            issueMessage: issue.message,
            autoFixable: issue.autoFixable,
            details: JSON.stringify(details, null, 2),
          });

          // Fix missing columns - check multiple possible detail structures
          // The column check returns: { missing: [...], table: 'search_index' }
          const missingColumns =
            details?.missing && Array.isArray(details.missing)
              ? details.missing
              : details?.missingColumns && Array.isArray(details.missingColumns)
                ? details.missingColumns
                : null;

          if (missingColumns && missingColumns.length > 0) {
            const tableName = details?.table || 'search_index';
            this.logger.info(
              `Fixing missing columns in ${tableName}: ${missingColumns.join(', ')}`
            );
            await this.fixMissingColumns(missingColumns, tableName);
            fixed = true;
            fixMessage = `Missing columns added to ${tableName}: ${missingColumns.join(', ')}`;
          }

          // Fix missing indexes (if not already handled by index check)
          if (
            details?.missingIndexes &&
            Array.isArray(details.missingIndexes) &&
            details.missingIndexes.length > 0
          ) {
            this.logger.info(
              `Fixing missing indexes: ${details.missingIndexes.join(', ')}`
            );
            await this.fixIndexes();
            fixed = true;
            fixMessage += (fixed ? ', ' : '') + 'indexes recreated';
          }

          // If no specific fixes found but issue is auto-fixable, try general fixes
          if (!fixed && issue.autoFixable) {
            // Try recreating indexes as a general schema fix (common issue)
            try {
              this.logger.info(
                'Attempting general schema fix: recreating indexes'
              );
              await this.fixIndexes();
              fixed = true;
              fixMessage = 'Indexes recreated (general schema fix)';
            } catch (error: any) {
              this.logger.warn('Failed to recreate indexes during schema fix', {
                error: error.message,
              });
            }
          }

          if (fixed) {
            results.push(
              this.createFixResult(issue.id, true, fixMessage, {
                backupId,
                rollbackAvailable: !!backupId,
                duration: Date.now() - startTime,
              })
            );
          } else {
            // Schema validation found issues but nothing specific to fix
            this.logger.warn(
              'Schema validation issue could not be auto-fixed',
              {
                issueId: issue.id,
                details: JSON.stringify(details),
              }
            );
            results.push(
              this.createFixResult(
                issue.id,
                false,
                'Schema validation issues found but no auto-fix available. Check details for specific problems.',
                {
                  duration: Date.now() - startTime,
                }
              )
            );
          }
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
   * Fix FTS5 table and triggers
   */
  private async fixFTS5(): Promise<void> {
    const adapter = this.databaseService.getAdapter();

    // Drop existing FTS5 table and triggers
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

    this.logger.info('FTS5 table and triggers rebuilt');
  }

  /**
   * Fix fragmentation by running VACUUM
   */
  private async fixFragmentation(): Promise<void> {
    await this.databaseService.execute('VACUUM');
    this.logger.info('Database vacuumed');
  }

  /**
   * Fix missing indexes
   */
  private async fixIndexes(): Promise<void> {
    const adapter = this.databaseService.getAdapter();

    // Recreate important indexes
    const indexes = [
      {
        name: 'idx_records_updated_at',
        sql: 'CREATE INDEX IF NOT EXISTS idx_records_updated_at ON records(updated_at)',
      },
      {
        name: 'idx_records_created_at',
        sql: 'CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at)',
      },
      {
        name: 'idx_records_title',
        sql: 'CREATE INDEX IF NOT EXISTS idx_records_title ON records(LOWER(title))',
      },
      {
        name: 'idx_search_index_updated_at',
        sql: 'CREATE INDEX IF NOT EXISTS idx_search_index_updated_at ON search_index(updated_at)',
      },
      {
        name: 'idx_search_index_title',
        sql: 'CREATE INDEX IF NOT EXISTS idx_search_index_title ON search_index(LOWER(title))',
      },
    ];

    for (const index of indexes) {
      try {
        await adapter.execute(index.sql);
      } catch (error: any) {
        this.logger.warn(`Failed to create index ${index.name}`, {
          error: error.message,
        });
      }
    }

    this.logger.info('Indexes recreated');
  }

  /**
   * Fix missing columns in tables
   */
  private async fixMissingColumns(
    missingColumns: string[],
    tableName?: string
  ): Promise<void> {
    const adapter = this.databaseService.getAdapter();

    // Default to search_index if no table specified
    const table = tableName || 'search_index';

    for (const column of missingColumns) {
      try {
        // Determine column type based on column name
        let columnType = 'TEXT';
        if (column === 'title_normalized') {
          columnType = 'TEXT';
        } else if (column.includes('count')) {
          columnType = 'INTEGER';
        } else if (
          column.includes('at') ||
          column.includes('date') ||
          column.includes('time')
        ) {
          columnType = 'DATETIME';
        }

        await adapter.execute(
          `ALTER TABLE ${table} ADD COLUMN ${column} ${columnType}`
        );
        this.logger.info(`Added missing column ${column} to ${table}`);
      } catch (error: any) {
        // Column might already exist or table might not exist
        this.logger.warn(`Failed to add column ${column} to ${table}`, {
          error: error.message,
        });
      }
    }
  }
}
