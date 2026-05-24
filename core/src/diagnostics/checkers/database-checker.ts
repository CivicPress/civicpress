/**
 * Database Diagnostic Checker
 *
 * Checks database integrity, schema, indexes, and FTS5 health. Phase 2d
 * W2-T2 decomposed the prior 985-LoC monolith into focused collaborators
 * under `database/`:
 *
 *   - schema-checks: required tables, columns, indexes, FTS5
 *   - health-checks: file accessibility, SQLite integrity, fragmentation
 *   - auto-fixes: rebuild FTS5, VACUUM, recreate indexes, add columns
 *   - result-builders: shared CheckResult constructors
 *
 * This file is the orchestrator: composes the helpers, runs the check
 * sequence + autoFix dispatch, and translates per-check outcomes into
 * DiagnosticIssue records.
 */

import { BaseDiagnosticChecker } from '../base-checker.js';
import { errorMessage, errorStack, errorCode, errorName, toError } from '../../utils/error-narrow.js';
import { DatabaseService } from '../../database/database-service.js';
import { Logger } from '../../utils/logger.js';
import {
  CheckResult,
  DiagnosticIssue,
  DiagnosticDetails,
  FixResult,
  FixOptions,
  DiagnosticOptions,
} from '../types.js';
import { BackupService } from '../../backup/backup-service.js';
import * as path from 'path';
import {
  checkDatabaseFile,
  checkIntegrity,
  checkFragmentation,
} from './database/health-checks.js';
import {
  checkSchema,
  checkIndexes,
  checkFTS5,
} from './database/schema-checks.js';
import {
  fixFTS5,
  fixFragmentation,
  fixIndexes,
  fixMissingColumns,
} from './database/auto-fixes.js';

export class DatabaseDiagnosticChecker extends BaseDiagnosticChecker {
  name = 'database';
  component = 'database';
  critical = true;

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
  async check(_options?: DiagnosticOptions): Promise<CheckResult> {
    const checks: CheckResult[] = [];
    const issues: DiagnosticIssue[] = [];

    try {
      // Check 1: Database file existence and accessibility
      const fileCheck = await checkDatabaseFile(this.databaseService);
      checks.push(fileCheck);
      if (fileCheck.status === 'error') {
        issues.push(
          this.createIssue(
            'critical',
            fileCheck.message || 'Database file check failed',
            { details: fileCheck.details }
          )
        );
        return this.createErrorResult('Database file check failed', undefined, {
          checks,
        });
      }

      // Check 2: SQLite integrity
      const integrityCheck = await checkIntegrity(this.databaseService);
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

      // Check 3: Schema validation (includes column check internally)
      const schemaCheck = await checkSchema(this.databaseService);
      checks.push(schemaCheck);
      if (schemaCheck.status === 'error' || schemaCheck.status === 'warning') {
        const details = schemaCheck.details as
          | {
              missing?: unknown;
              missingColumns?: unknown;
              missingIndexes?: unknown;
              extra?: unknown;
            }
          | undefined;
        const hasFixableIssues = Boolean(
          (Array.isArray(details?.missing) && details.missing.length > 0) ||
            (Array.isArray(details?.missingColumns) &&
              details.missingColumns.length > 0) ||
            (Array.isArray(details?.missingIndexes) &&
              details.missingIndexes.length > 0)
        );

        const isExtraTablesOnly =
          (details?.extra &&
            Array.isArray(details.extra) &&
            details.extra.length > 0) ||
          schemaCheck.message?.includes('Unexpected tables found') ||
          schemaCheck.message?.includes('Extra tables');

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

          if (!schemaCheck.details) schemaCheck.details = {};
          if (!Array.isArray(schemaCheck.details.issues)) {
            schemaCheck.details.issues = [];
          }
          schemaCheck.details.issues.push(schemaIssue);
        }
      }

      // Check 4: Index integrity
      const indexCheck = await checkIndexes(this.databaseService);
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
      const fts5Check = await checkFTS5(this.databaseService);
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
      const fragmentationCheck = await checkFragmentation(this.databaseService);
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
            recommendations: ['Run VACUUM periodically to maintain performance'],
            details: fragmentationCheck.details,
          })
        );
      }

      const hasErrors = checks.some((c) => c.status === 'error');
      const hasWarnings = checks.some((c) => c.status === 'warning');

      if (hasErrors) {
        return this.createErrorResult(
          'Database diagnostic found critical issues',
          undefined,
          { checks, issues }
        );
      }

      if (hasWarnings) {
        const firstWarning = checks.find((c) => c.status === 'warning');
        const warningMessage =
          firstWarning?.message || 'Database diagnostic found warnings';

        const resultDetails: DiagnosticDetails = { checks, issues };

        // Ensure each check that has issues stores them in its details so
        // downstream extractIssues() finds them.
        for (const check of checks) {
          if (
            (check.status === 'error' || check.status === 'warning') &&
            (!check.details ||
              !Array.isArray(check.details.issues) ||
              check.details.issues.length === 0)
          ) {
            const checkIssues = issues.filter((i) => i.check === check.name);
            if (checkIssues.length > 0) {
              if (!check.details) check.details = {};
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
    } catch (error: unknown) {
      this.logger.error('Database diagnostic check failed', {
        error: errorMessage(error),
        stack: errorStack(error),
      });
      return this.createErrorResult(
        'Database diagnostic check failed',
        error,
        { checks, issues }
      );
    }
  }

  /**
   * Auto-fix database issues. Dispatches by issue.message keyword to the
   * appropriate fix in `database/auto-fixes.ts`.
   */
  async autoFix(
    issues: DiagnosticIssue[],
    options?: FixOptions
  ): Promise<FixResult[]> {
    const results: FixResult[] = [];

    for (const issue of issues) {
      const startTime = Date.now();

      try {
        const backupId = await this.maybeCreateBackup(issue, options);

        // FTS5 dispatch
        if (issue.message.includes('FTS5')) {
          await fixFTS5(this.databaseService, this.logger);
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
          continue;
        }

        // Fragmentation dispatch
        if (issue.message.includes('fragmentation')) {
          await fixFragmentation(this.databaseService, this.logger);
          results.push(
            this.createFixResult(issue.id, true, 'Database vacuumed', {
              backupId,
              rollbackAvailable: !!backupId,
              duration: Date.now() - startTime,
            })
          );
          continue;
        }

        // Index dispatch
        if (
          issue.message.includes('index') ||
          issue.message.includes('Index')
        ) {
          await fixIndexes(this.databaseService, this.logger);
          results.push(
            this.createFixResult(issue.id, true, 'Indexes recreated', {
              backupId,
              rollbackAvailable: !!backupId,
              duration: Date.now() - startTime,
            })
          );
          continue;
        }

        // Schema dispatch
        if (
          issue.message.includes('Schema validation') ||
          issue.message.includes('schema')
        ) {
          const fixResult = await this.handleSchemaIssue(
            issue,
            backupId,
            startTime
          );
          results.push(fixResult);
          continue;
        }

        // Unknown
        results.push(
          this.createFixResult(
            issue.id,
            false,
            'Auto-fix not available for this issue',
            { duration: Date.now() - startTime }
          )
        );
      } catch (err: unknown) {
        results.push(
          this.createFixResult(
            issue.id,
            false,
            `Auto-fix failed: ${errorMessage(err)}`,
            { error: err, duration: Date.now() - startTime }
          )
        );
      }
    }

    return results;
  }

  // ----- internal -----

  private async maybeCreateBackup(
    issue: DiagnosticIssue,
    options?: FixOptions
  ): Promise<string | undefined> {
    if (options?.backup === false) return undefined;

    try {
      const adapter = this.databaseService.getAdapter();
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
        databaseConfig: adapter.getConfig(),
      });

      this.logger.info('Backup created before fix', {
        backupId: backup.timestamp,
        backupPath: backup.tarballPath,
      });
      return backup.timestamp;
    } catch (err: unknown) {
      this.logger.warn('Failed to create backup before fix', {
        error: errorMessage(err),
        stack: errorStack(err),
        backupDir: path.join(this.dataDir, 'exports', 'backups'),
      });
      return undefined;
    }
  }

  private async handleSchemaIssue(
    issue: DiagnosticIssue,
    backupId: string | undefined,
    startTime: number
  ): Promise<FixResult> {
    const details = issue.details as
      | {
          missing?: unknown;
          missingColumns?: unknown;
          missingIndexes?: unknown;
          table?: unknown;
        }
      | undefined;
    let fixed = false;
    let fixMessage = 'Schema issues addressed';

    this.logger.debug('Schema validation fix attempt', {
      issueId: issue.id,
      issueMessage: issue.message,
      autoFixable: issue.autoFixable,
      details: JSON.stringify(details, null, 2),
    });

    // Fix missing columns
    const missingColumns =
      details?.missing && Array.isArray(details.missing)
        ? details.missing
        : details?.missingColumns && Array.isArray(details.missingColumns)
          ? details.missingColumns
          : null;

    if (missingColumns && missingColumns.length > 0) {
      const tableName =
        typeof details?.table === 'string' ? details.table : 'search_index';
      this.logger.info(
        `Fixing missing columns in ${tableName}: ${missingColumns.join(', ')}`
      );
      await fixMissingColumns(
        this.databaseService,
        this.logger,
        missingColumns,
        tableName
      );
      fixed = true;
      fixMessage = `Missing columns added to ${tableName}: ${missingColumns.join(', ')}`;
    }

    // Fix missing indexes
    if (
      details?.missingIndexes &&
      Array.isArray(details.missingIndexes) &&
      details.missingIndexes.length > 0
    ) {
      this.logger.info(
        `Fixing missing indexes: ${details.missingIndexes.join(', ')}`
      );
      await fixIndexes(this.databaseService, this.logger);
      fixed = true;
      fixMessage += (fixed ? ', ' : '') + 'indexes recreated';
    }

    // Fallback: general schema fix
    if (!fixed && issue.autoFixable) {
      try {
        this.logger.info('Attempting general schema fix: recreating indexes');
        await fixIndexes(this.databaseService, this.logger);
        fixed = true;
        fixMessage = 'Indexes recreated (general schema fix)';
      } catch (err: unknown) {
        this.logger.warn('Failed to recreate indexes during schema fix', {
          error: errorMessage(err),
        });
      }
    }

    if (fixed) {
      return this.createFixResult(issue.id, true, fixMessage, {
        backupId,
        rollbackAvailable: !!backupId,
        duration: Date.now() - startTime,
      });
    }

    this.logger.warn('Schema validation issue could not be auto-fixed', {
      issueId: issue.id,
      details: JSON.stringify(details),
    });
    return this.createFixResult(
      issue.id,
      false,
      'Schema validation issues found but no auto-fix available. Check details for specific problems.',
      { duration: Date.now() - startTime }
    );
  }
}
