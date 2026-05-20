/**
 * Database health checks — extracted from database-checker.ts in
 * Phase 2d W2-T2. Covers file existence/accessibility, SQLite integrity,
 * and fragmentation.
 *
 * Stateless functions; take databaseService as their only dependency.
 */

import * as fs from 'fs';
import type { DatabaseService } from '../../../database/database-service.js';
import type { CheckResult } from '../../types.js';
import { pass, warning, error } from './result-builders.js';

/**
 * Verify database file exists, is accessible, and is non-empty.
 */
export async function checkDatabaseFile(
  databaseService: DatabaseService
): Promise<CheckResult> {
  try {
    const adapter = databaseService.getAdapter();
    const dbPath = (adapter as any).config?.sqlite?.file;

    if (!dbPath) {
      return error('Database path not configured');
    }

    if (!fs.existsSync(dbPath)) {
      return error('Database file does not exist', undefined, { path: dbPath });
    }

    try {
      fs.accessSync(dbPath, fs.constants.R_OK | fs.constants.W_OK);
    } catch (err) {
      return error('Database file is not accessible', err, { path: dbPath });
    }

    const stats = fs.statSync(dbPath);
    if (stats.size === 0) {
      return error('Database file is empty');
    }

    return pass('Database file is accessible', {
      path: dbPath,
      size: stats.size,
    });
  } catch (err: any) {
    return error('Failed to check database file', err);
  }
}

/**
 * Run SQLite integrity_check pragma.
 */
export async function checkIntegrity(
  databaseService: DatabaseService
): Promise<CheckResult> {
  try {
    const result = await databaseService.query('PRAGMA integrity_check');

    if (result.length === 0) {
      return error('Integrity check returned no results');
    }

    const integrityResult = result[0];
    const integrityValue =
      integrityResult.integrity_check || integrityResult['integrity_check'];

    if (integrityValue === 'ok') {
      return pass('Database integrity verified');
    }

    return error('Database integrity check failed', undefined, {
      integrityResult: integrityValue,
    });
  } catch (err: any) {
    if (
      err.message?.includes('corrupt') ||
      err.message?.includes('malformed')
    ) {
      return error('Database corruption detected', err, {
        errorCode: err.code,
      });
    }
    return error('Failed to run integrity check', err);
  }
}

/**
 * Estimate database fragmentation by comparing file size to page count.
 */
export async function checkFragmentation(
  databaseService: DatabaseService
): Promise<CheckResult> {
  try {
    const adapter = databaseService.getAdapter();
    const dbPath = (adapter as any).config?.sqlite?.file;

    if (!dbPath || !fs.existsSync(dbPath)) {
      return warning('Cannot check fragmentation: database file not found');
    }

    const fileSize = fs.statSync(dbPath).size;

    const pageSizeResult = await databaseService.query('PRAGMA page_size');
    const pageCountResult = await databaseService.query('PRAGMA page_count');

    const pageSize = pageSizeResult[0]?.page_size || 4096;
    const pageCount = pageCountResult[0]?.page_count || 0;
    const expectedSize = pageSize * pageCount;

    const fragmentation =
      expectedSize > 0 ? ((fileSize - expectedSize) / expectedSize) * 100 : 0;

    if (fragmentation > 20) {
      return warning('High database fragmentation detected', {
        fragmentation: `${fragmentation.toFixed(1)}%`,
        fileSize,
        expectedSize,
        recommendation: 'Run VACUUM to reduce fragmentation',
      });
    }

    if (fragmentation > 10) {
      return warning('Moderate database fragmentation', {
        fragmentation: `${fragmentation.toFixed(1)}%`,
        recommendation: 'Consider running VACUUM',
      });
    }

    return pass('Database fragmentation is acceptable', {
      fragmentation: `${fragmentation.toFixed(1)}%`,
    });
  } catch (err: any) {
    return warning('Failed to check fragmentation', { error: err.message });
  }
}
