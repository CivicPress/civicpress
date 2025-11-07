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
  archive?: boolean;
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
    .option('--archive', 'Create a .tar.gz archive alongside the backup')
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

  const result = await BackupService.createBackup({
    dataDir,
    outputDir,
    systemDataDir,
    includeStorage,
    includeGitBundle,
    version: civicpressVersion,
    extraMetadata: {
      createdBy: 'civic-cli',
    },
  });

  let archivePath: string | undefined;
  if (options.archive) {
    archivePath = await createArchive(result.backupDir);
  }

  outputCreateResult(result, archivePath, options.json ?? globalJson, logger);
}

async function handleRestore(
  source: string,
  options: BackupCommandOptions,
  globalJson: boolean | undefined,
  logger: ReturnType<typeof initializeLogger>
): Promise<void> {
  const tempExtraction = await maybeExtractArchive(source);
  const backupDir = tempExtraction?.dir ?? path.resolve(source);

  try {
    const dataDir = path.resolve(
      options.target ?? CentralConfigManager.getDataDir()
    );
    const systemDataDir = path.resolve(options.systemData ?? '.system-data');
    const restoreStorage = options.skipStorage
      ? false
      : options.includeStorage !== false;

    const result = await BackupService.restoreBackup({
      backupDir,
      dataDir,
      systemDataDir,
      restoreStorage,
      overwrite: options.overwrite === true,
    });

    outputRestoreResult(result, options.json ?? globalJson, logger);
  } finally {
    if (tempExtraction?.cleanup) {
      await tempExtraction.cleanup();
    }
  }
}

async function createArchive(backupDir: string): Promise<string> {
  const entries = await fs.readdir(backupDir);
  const archivePath = path.join(backupDir, 'archive.tar.gz');
  await tar.create(
    {
      cwd: backupDir,
      gzip: true,
      file: archivePath,
    },
    entries
  );
  return archivePath;
}

async function maybeExtractArchive(
  source: string
): Promise<{ dir: string; cleanup: () => Promise<void> } | null> {
  const resolved = path.resolve(source);
  const stats = await fs.stat(resolved);

  if (!stats.isFile()) {
    return null;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'civic-backup-'));
  await tar.extract({ cwd: tempDir, file: resolved });

  return {
    dir: tempDir,
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
}

function outputCreateResult(
  result: BackupCreateResult,
  archivePath: string | undefined,
  jsonOutput: boolean | undefined,
  logger: ReturnType<typeof initializeLogger>
): void {
  const payload = {
    success: true,
    backupDir: result.backupDir,
    metadata: result.metadataPath,
    gitBundle: result.gitBundlePath ?? null,
    storageIncluded: result.storageIncluded,
    archive: archivePath ?? null,
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
  if (archivePath) {
    logger.info(`🗜️  Archive: ${archivePath}`);
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
