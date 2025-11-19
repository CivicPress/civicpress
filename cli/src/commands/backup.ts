import { CAC } from 'cac';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import tar from 'tar';
import { createRequire } from 'module';
import {
  BackupService,
  CentralConfigManager,
  type BackupCreateResult,
  type BackupRestoreResult,
} from '@civicpress/core';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';

const require = createRequire(import.meta.url);
const { version: civicpressVersion } = require('../../../package.json');

interface BackupCommandOptions {
  output?: string;
  includeStorage?: boolean;
  skipStorage?: boolean;
  includeGitBundle?: boolean;
  skipGitBundle?: boolean;
  compress?: boolean; // Default true, set to false by --no-compress
  target?: string;
  systemData?: string;
  overwrite?: boolean;
  json?: boolean;
  silent?: boolean;
}

export function registerBackupCommand(cli: CAC): void {
  cli
    .command('backup <action> [source]', 'Create or restore CivicPress backups')
    .option('--output <dir>', 'Output directory for backups', {
      default: 'exports/backups',
    })
    .option('--include-storage', 'Include local storage assets', {
      default: true,
    })
    .option('--skip-storage', 'Skip local storage assets')
    .option('--include-git-bundle', 'Create git bundle for data directory', {
      default: true,
    })
    .option('--skip-git-bundle', 'Skip git bundle creation')
    .option(
      '--no-compress',
      'Skip creating .tar.gz tarball (compression is enabled by default)'
    )
    .option('--target <dir>', 'Target data directory for restore')
    .option('--system-data <dir>', 'System data directory', {
      default: '.system-data',
    })
    .option('--overwrite', 'Overwrite existing data when restoring')
    .option('--json', 'Output in JSON format')
    .option('--silent', 'Suppress output')
    .action(async (action: string, source: string | undefined, opts: any) => {
      const options = opts as BackupCommandOptions;
      const globalOpts = getGlobalOptionsFromArgs();
      const logger = initializeLogger();

      try {
        switch (action) {
          case 'create':
            await handleCreate(options, globalOpts.json, logger);
            break;
          case 'restore':
            if (!source) {
              throw new Error(
                'Backup source is required for restore (directory or archive).'
              );
            }
            await handleRestore(source, options, globalOpts.json, logger);
            break;
          default:
            throw new Error(
              `Unknown backup action '${action}'. Use 'create' or 'restore'.`
            );
        }
      } catch (error) {
        if (globalOpts.json || options.json) {
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
          logger.error('❌ Backup command failed:', error);
        }
        process.exit(1);
      }
    });
}

async function handleCreate(
  options: BackupCommandOptions,
  globalJson: boolean | undefined,
  logger: ReturnType<typeof initializeLogger>
): Promise<void> {
  const dataDir = CentralConfigManager.getDataDir();
  const outputDir = path.resolve(options.output ?? 'exports/backups');
  const systemDataDir = path.resolve(options.systemData ?? '.system-data');

  const includeStorage = options.skipStorage
    ? false
    : options.includeStorage !== false;
  const includeGitBundle = options.skipGitBundle
    ? false
    : options.includeGitBundle !== false;
  // --no-compress sets compress to false, otherwise default to true
  const compress = options.compress !== false;

  const dbConfig = CentralConfigManager.getDatabaseConfig();
  const result = await BackupService.createBackup({
    dataDir,
    outputDir,
    systemDataDir,
    includeStorage,
    includeGitBundle,
    compress,
    version: civicpressVersion,
    databaseConfig: dbConfig,
    extraMetadata: {
      createdBy: 'civic-cli',
    },
  });

  outputCreateResult(
    result,
    result.tarballPath,
    options.json ?? globalJson,
    logger
  );
}

async function handleRestore(
  source: string,
  options: BackupCommandOptions,
  globalJson: boolean | undefined,
  logger: ReturnType<typeof initializeLogger>
): Promise<void> {
  // BackupService.restoreBackup now handles tarball extraction automatically
  const backupDir = path.resolve(source);

  const dataDir = path.resolve(
    options.target ?? CentralConfigManager.getDataDir()
  );
  const systemDataDir = path.resolve(options.systemData ?? '.system-data');
  const restoreStorage = options.skipStorage
    ? false
    : options.includeStorage !== false;

  const dbConfig = CentralConfigManager.getDatabaseConfig();
  const result = await BackupService.restoreBackup({
    backupDir,
    dataDir,
    systemDataDir,
    restoreStorage,
    overwrite: options.overwrite === true,
    databaseConfig: dbConfig,
  });

  outputRestoreResult(result, options.json ?? globalJson, logger);
}

// Archive functions removed - compression is now handled by BackupService

function outputCreateResult(
  result: BackupCreateResult,
  tarballPath: string | undefined,
  jsonOutput: boolean | undefined,
  logger: ReturnType<typeof initializeLogger>
): void {
  const payload = {
    success: true,
    backupDir: result.backupDir,
    metadata: result.metadataPath,
    tarball: tarballPath ?? null,
    gitBundle: result.gitBundlePath ?? null,
    storageIncluded: result.storageIncluded,
    storageFilesExported: result.storageFilesExported,
    storageConfigExported: result.storageConfigExported,
    warnings: result.warnings,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  logger.info('✅ Backup created successfully');
  logger.info(`📂 Directory: ${result.backupDir}`);
  if (result.gitBundlePath) {
    logger.info(`🔐 Git bundle: ${result.gitBundlePath}`);
  }
  if (result.storageFilesExported) {
    logger.info(`📋 Storage files table exported (storage-files.json)`);
  }
  if (result.storageConfigExported) {
    logger.info(`⚙️  Storage configuration exported (storage-config.json)`);
  }
  if (tarballPath) {
    logger.info(`🗜️  Tarball: ${tarballPath}`);
  }
  if (result.warnings.length > 0) {
    result.warnings.forEach((warning) => logger.warn(`⚠️  ${warning}`));
  }
}

function outputRestoreResult(
  result: BackupRestoreResult,
  jsonOutput: boolean | undefined,
  logger: ReturnType<typeof initializeLogger>
): void {
  const payload = {
    success: true,
    dataDir: result.dataDir,
    storageDir: result.storageDir ?? null,
    metadata: result.metadata ?? null,
    warnings: result.warnings,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  logger.info('✅ Backup restored successfully');
  logger.info(`📂 Data directory: ${result.dataDir}`);
  if (result.storageDir) {
    logger.info(`📦 Storage directory: ${result.storageDir}`);
  }
  if (result.warnings.length > 0) {
    result.warnings.forEach((warning) => logger.warn(`⚠️  ${warning}`));
  }
}
