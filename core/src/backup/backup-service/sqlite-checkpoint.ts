import path from 'path';
import { Logger } from '../../utils/logger.js';
import { DatabaseService } from '../../database/database-service.js';
import { DatabaseConfig } from '../../database/database-adapter.js';

export interface SqliteCheckpointResult {
  checkpointed: boolean;
  warnings: string[];
}

/**
 * Flush the SQLite WAL into the main database file before the data directory
 * is copied.
 *
 * `createBackup` snapshots the data directory with `fs.cp`. Since the Tier-A
 * hardening every connection runs in WAL mode, so a live database is really
 * three files — `civic.db`, `civic.db-wal`, `civic.db-shm` — and `fs.cp` walks
 * them one at a time. Copying a database mid-write therefore captures the main
 * file at one instant and the WAL at another, which can restore as a torn or
 * stale database rather than a point-in-time one.
 *
 * `PRAGMA wal_checkpoint(TRUNCATE)` moves every committed page from the WAL
 * into the main file and truncates the WAL to zero length, so what `fs.cp`
 * then copies is a complete database and an empty sidecar.
 *
 * Scope — this only matters when the database actually sits INSIDE the copied
 * tree. The default path is `<projectRoot>/.system-data/civic.db`, which is
 * outside `dataDir` and is not copied at all (records are durable as
 * Markdown-in-Git; the DB is a rebuildable index). But when `CIVIC_DATA_DIR` is
 * set, the sqlite file resolves to `<dataDir>/civic.db` — inside the copied
 * tree — and the fuzzy-copy hazard is real. So we check containment first and
 * do nothing when the database lives elsewhere.
 *
 * Residual, deliberately not solved here: a checkpoint narrows the window but
 * does not freeze it. Writes landing between the checkpoint and the end of the
 * copy can still tear. Fully closing that needs `VACUUM INTO` (an atomic
 * consistent copy) written over the copied file, which changes what restore
 * consumes — a larger change than this hardening pass.
 *
 * Never throws: a backup must not fail because an optimisation could not run.
 */
export async function checkpointSqliteInDataDir(args: {
  dataDir: string;
  databaseConfig?: DatabaseConfig;
  logger: Logger;
}): Promise<SqliteCheckpointResult> {
  const { dataDir, databaseConfig, logger } = args;
  const warnings: string[] = [];

  const sqliteFile = databaseConfig?.sqlite?.file;
  if (!databaseConfig || databaseConfig.type !== 'sqlite' || !sqliteFile) {
    return { checkpointed: false, warnings };
  }

  // Only relevant when the database is inside the directory being copied.
  const resolvedDb = path.resolve(sqliteFile);
  const resolvedDataDir = path.resolve(dataDir);
  const relative = path.relative(resolvedDataDir, resolvedDb);
  const insideDataDir =
    relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  if (!insideDataDir) {
    return { checkpointed: false, warnings };
  }

  let dbService: DatabaseService | null = null;
  try {
    dbService = new DatabaseService(databaseConfig, logger);
    await dbService.initialize();
    await dbService.getAdapter().query('PRAGMA wal_checkpoint(TRUNCATE)');
    logger.debug?.(
      'Checkpointed SQLite WAL before copying the data directory'
    );
    return { checkpointed: true, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(
      `Could not checkpoint the SQLite WAL before backup (${message}); ` +
        'the copied database may be mid-write.'
    );
    return { checkpointed: false, warnings };
  } finally {
    if (dbService) {
      try {
        await dbService.close();
      } catch {
        // Closing a connection we only opened to checkpoint must not fail the
        // backup (and leaking it would repeat the bug fixed in phase-7h).
      }
    }
  }
}
