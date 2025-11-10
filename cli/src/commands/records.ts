import { CAC } from 'cac';
import * as fs from 'fs';
import * as path from 'path';
import {
  CentralConfigManager,
  DatabaseService,
  Logger as CoreLogger,
  RecordParser,
  ensureDirectoryForRecordPath,
  getRecordYear,
  listRecordFilesSync,
  parseRecordRelativePath,
} from '@civicpress/core';
import {
  getGlobalOptionsFromArgs,
  initializeLogger,
} from '../utils/global-options.js';

interface MigrationResult {
  id: string;
  from: string;
  to: string;
  year: string;
  status: 'migrated' | 'skipped';
  reason?: string;
}

export function registerRecordsCommand(cli: CAC) {
  cli
    .command(
      'records migrate-folders',
      'Organize record files into year-based subdirectories'
    )
    .option('--dry-run', 'Preview changes without modifying files')
    .option(
      '--include-archive',
      'Also migrate archived records under data/archive/'
    )
    .option('--data-dir <path>', 'Override data directory (defaults to config)')
    .option('--json', 'Output results as JSON')
    .option('--silent', 'Suppress non-error output')
    .action(async (options: any) => {
      const globalOptions = getGlobalOptionsFromArgs();
      const logger = initializeLogger();
      const quietOutput = globalOptions.silent || globalOptions.json;

      try {
        const dataDir =
          options.dataDir ||
          CentralConfigManager.getDataDir() ||
          path.resolve('data');
        const dryRun = options.dryRun === true;
        const includeArchive = options.includeArchive === true;

        if (!fs.existsSync(dataDir)) {
          throw new Error(`Data directory not found: ${dataDir}`);
        }

        const recordsDir = path.join(dataDir, 'records');
        if (!fs.existsSync(recordsDir)) {
          throw new Error(
            `Records directory not found at ${recordsDir}. Run "civic init" first.`
          );
        }

        const recordPaths = listRecordFilesSync(dataDir, {
          includeArchive,
        });

        const migrations: MigrationResult[] = [];
        const loggerPrefix = dryRun ? '📋' : '📦';

        // Setup database connection if not dry-run
        let database: DatabaseService | null = null;
        if (!dryRun) {
          const dbConfig = CentralConfigManager.getDatabaseConfig() || {
            type: 'sqlite' as const,
            sqlite: {
              file: path.resolve('.system-data/civic.db'),
            },
          };

          database = new DatabaseService(
            dbConfig,
            new CoreLogger({ silent: true })
          );
          await database.initialize();
        }

        for (const relativePath of recordPaths) {
          const parsed = parseRecordRelativePath(relativePath);
          if (!parsed.type || !parsed.filename) {
            migrations.push({
              id: 'unknown',
              from: relativePath,
              to: relativePath,
              year: 'unknown',
              status: 'skipped',
              reason: 'Unable to determine record type or filename',
            });
            continue;
          }

          const isArchive = parsed.kind === 'archive';
          if (!includeArchive && isArchive) {
            continue;
          }

          if (parsed.year) {
            // Already organized
            continue;
          }

          const prefix = isArchive ? 'archive' : 'records';
          const sourceSegments = relativePath
            .replace(/^(records|archive)\//, '')
            .split('/');
          const sourceFullPath = path.join(dataDir, prefix, ...sourceSegments);

          if (!fs.existsSync(sourceFullPath)) {
            migrations.push({
              id: 'unknown',
              from: relativePath,
              to: relativePath,
              year: 'unknown',
              status: 'skipped',
              reason: 'Source file missing on disk',
            });
            continue;
          }

          let recordId = 'unknown';
          let year = new Date().getFullYear().toString();

          try {
            const content = fs.readFileSync(sourceFullPath, 'utf-8');
            const record = RecordParser.parseFromMarkdown(
              content,
              relativePath
            );
            recordId = record.id;
            if (record.created_at) {
              year = getRecordYear(record.created_at);
            } else if (record.metadata?.created) {
              year = getRecordYear(record.metadata.created);
            } else if (record.metadata?.date) {
              year = getRecordYear(record.metadata.date);
            }
          } catch (error) {
            migrations.push({
              id: recordId,
              from: relativePath,
              to: relativePath,
              year,
              status: 'skipped',
              reason: `Failed to parse record: ${
                error instanceof Error ? error.message : String(error)
              }`,
            });
            continue;
          }

          const targetRelativePath = path
            .join(prefix, parsed.type, year, parsed.filename)
            .replace(/\\/g, '/');

          if (targetRelativePath === relativePath) {
            continue;
          }

          const targetSegments = targetRelativePath
            .replace(/^(records|archive)\//, '')
            .split('/');
          const targetFullPath = path.join(dataDir, prefix, ...targetSegments);

          if (fs.existsSync(targetFullPath)) {
            migrations.push({
              id: recordId,
              from: relativePath,
              to: targetRelativePath,
              year,
              status: 'skipped',
              reason: 'Target file already exists',
            });
            continue;
          }

          migrations.push({
            id: recordId,
            from: relativePath,
            to: targetRelativePath,
            year,
            status: dryRun ? 'skipped' : 'migrated',
          });

          if (!dryRun) {
            ensureDirectoryForRecordPath(dataDir, targetRelativePath);
            fs.renameSync(sourceFullPath, targetFullPath);

            if (database && recordId !== 'unknown') {
              const updateResult = await database.execute(
                'UPDATE records SET path = ? WHERE id = ?',
                [targetRelativePath, recordId]
              );
              if (!updateResult?.changes) {
                await database.execute(
                  'UPDATE records SET path = ? WHERE path = ?',
                  [targetRelativePath, relativePath]
                );
              }
            }

            if (!quietOutput) {
              logger.info(
                `${loggerPrefix} Moved ${relativePath} → ${targetRelativePath}`
              );
            }
          } else if (!quietOutput) {
            logger.info(
              `${loggerPrefix} Would move ${relativePath} → ${targetRelativePath}`
            );
          }
        }

        if (database) {
          await database.close();
        }

        const migratedCount = migrations.filter(
          (m) => m.status === 'migrated'
        ).length;
        const skippedCount = migrations.length - migratedCount;

        if (globalOptions.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                dryRun,
                dataDir,
                includeArchive,
                migrated: migratedCount,
                skipped: skippedCount,
                migrations,
              },
              null,
              2
            )
          );
        } else if (!quietOutput) {
          const summaryPrefix = dryRun
            ? '✅ Dry-run complete:'
            : '✅ Migration complete:';
          logger.success(
            `${summaryPrefix} ${migratedCount} migrated, ${skippedCount} skipped`
          );
          if (includeArchive) {
            logger.info('Archive records were included in this run.');
          }
        }
      } catch (error) {
        if (globalOptions.json) {
          console.log(
            JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            )
          );
        } else {
          logger.error(
            `❌ Failed to migrate record folders: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        process.exit(1);
      }
    });
}
