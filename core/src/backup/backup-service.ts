import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import yaml from 'yaml';
import { Logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

interface StorageFolderConfig {
  path: string;
  backup_included?: boolean;
}

interface StorageProviderConfig {
  type: string;
  path?: string;
}

interface StorageConfig {
  active_provider?: string;
  providers?: Record<string, StorageProviderConfig>;
  folders?: Record<string, StorageFolderConfig>;
  metadata?: Record<string, unknown>;
}

export interface BackupMetadata {
  id: string;
  createdAt: string;
  version?: string;
  data: {
    source: string;
    relativePath: string;
  };
  git?: {
    head?: string | null;
    bundle?: string | null;
    warning?: string | null;
  };
  storage?: {
    included: boolean;
    provider?: string;
    relativePath?: string;
    source?: string;
  };
  options?: {
    includeStorage: boolean;
    includeGitBundle: boolean;
  };
  extra?: Record<string, unknown>;
  warnings?: string[];
}

export interface BackupCreateOptions {
  dataDir: string;
  outputDir: string;
  systemDataDir?: string;
  includeStorage?: boolean;
  includeGitBundle?: boolean;
  gitRepoDir?: string;
  version?: string;
  extraMetadata?: Record<string, unknown>;
  timestamp?: string;
  logger?: Logger;
}

export interface BackupCreateResult {
  backupDir: string;
  metadataPath: string;
  timestamp: string;
  gitBundlePath?: string;
  storageIncluded: boolean;
  warnings: string[];
}

export interface BackupRestoreOptions {
  backupDir: string;
  dataDir: string;
  systemDataDir?: string;
  restoreStorage?: boolean;
  overwrite?: boolean;
  logger?: Logger;
}

export interface BackupRestoreResult {
  dataDir: string;
  storageDir?: string;
  metadata?: BackupMetadata;
  warnings: string[];
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function sanitizeTimestamp(value: string): string {
  return value.replace(/[:]/g, '-');
}

function createLogger(logger?: Logger): Logger {
  return logger ?? new Logger({ silent: false });
}

export class BackupService {
  /**
   * Create a CivicPress backup.
   */
  static async createBackup(
    options: BackupCreateOptions
  ): Promise<BackupCreateResult> {
    const logger = createLogger(options.logger);
    const warnings: string[] = [];

    const dataDir = path.resolve(options.dataDir);
    const outputDir = path.resolve(options.outputDir);
    const systemDataDir = path.resolve(options.systemDataDir ?? '.system-data');
    const includeStorage = options.includeStorage !== false;
    const includeGitBundle = options.includeGitBundle !== false;
    const gitRepoDir = path.resolve(options.gitRepoDir ?? process.cwd());

    const timestamp = sanitizeTimestamp(
      options.timestamp ?? new Date().toISOString()
    );
    const backupDir = path.join(outputDir, timestamp);

    await fs.mkdir(backupDir, { recursive: true });

    // Copy data directory (including nested git repo if present)
    const dataTarget = path.join(backupDir, 'data');
    await fs.cp(dataDir, dataTarget, {
      recursive: true,
      force: true,
    });

    let gitHead: string | null = null;
    let gitBundlePath: string | undefined;
    let gitWarning: string | null = null;

    if (includeGitBundle) {
      const dataRelativeToRepo = path.relative(gitRepoDir, dataDir);

      if (
        dataRelativeToRepo === '' ||
        dataRelativeToRepo.startsWith('..') ||
        path.isAbsolute(dataRelativeToRepo)
      ) {
        gitWarning =
          'Data directory is outside the current Git repository; skipping git bundle.';
        warnings.push(gitWarning);
      } else {
        try {
          gitHead = (
            await execFileAsync('git', ['rev-parse', 'HEAD'], {
              cwd: gitRepoDir,
            })
          ).stdout
            .trim()
            .replace(/\s+/g, ' ');
        } catch (error) {
          gitWarning = `Unable to determine git HEAD: ${
            error instanceof Error ? error.message : String(error)
          }`;
          warnings.push(gitWarning);
        }

        try {
          const gitDir = path.join(backupDir, 'git');
          await fs.mkdir(gitDir, { recursive: true });
          gitBundlePath = path.join(gitDir, 'data.bundle');
          await execFileAsync(
            'git',
            [
              'bundle',
              'create',
              gitBundlePath,
              'HEAD',
              '--',
              dataRelativeToRepo,
            ],
            { cwd: gitRepoDir }
          );
        } catch (error) {
          const warningMessage = `Unable to create git bundle: ${
            error instanceof Error ? error.message : String(error)
          }`;
          gitBundlePath = undefined;
          gitWarning = warningMessage;
          warnings.push(warningMessage);
        }
      }
    }

    let storageIncluded = false;
    let storageInfo: BackupMetadata['storage'] | undefined;

    if (includeStorage) {
      try {
        const storageConfig = await loadStorageConfig(systemDataDir);

        if (storageConfig) {
          const activeProvider = storageConfig.active_provider ?? 'local';
          const provider = storageConfig.providers?.[activeProvider];

          if (provider?.type === 'local') {
            const providerPath = path.resolve(
              systemDataDir,
              provider.path ?? 'storage'
            );

            if (await pathExists(providerPath)) {
              const storageTarget = path.join(backupDir, 'storage');
              await fs.mkdir(storageTarget, { recursive: true });
              await fs.cp(providerPath, storageTarget, {
                recursive: true,
                force: true,
              });

              storageIncluded = true;
              storageInfo = {
                included: true,
                provider: provider.type,
                relativePath: 'storage',
                source: providerPath,
              };
            } else {
              const message = `Local storage path not found: ${providerPath}`;
              warnings.push(message);
            }
          } else {
            storageInfo = {
              included: false,
              provider: provider?.type,
            };
          }
        }
      } catch (error) {
        const message = `Failed to include storage assets: ${
          error instanceof Error ? error.message : String(error)
        }`;
        warnings.push(message);
        storageInfo = {
          included: false,
        };
      }
    }

    const metadata: BackupMetadata = {
      id: timestamp,
      createdAt: new Date().toISOString(),
      version: options.version,
      data: {
        source: dataDir,
        relativePath: 'data',
      },
      git: includeGitBundle
        ? {
            head: gitHead,
            bundle: gitBundlePath
              ? path.relative(backupDir, gitBundlePath)
              : null,
            warning: gitWarning,
          }
        : undefined,
      storage: storageInfo,
      options: {
        includeStorage,
        includeGitBundle,
      },
      extra: options.extraMetadata,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    const metadataPath = path.join(backupDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

    logger.info(`Backup created at ${backupDir}`);

    return {
      backupDir,
      metadataPath,
      timestamp,
      gitBundlePath,
      storageIncluded,
      warnings,
    };
  }

  /**
   * Restore a CivicPress backup from a previously created backup directory.
   */
  static async restoreBackup(
    options: BackupRestoreOptions
  ): Promise<BackupRestoreResult> {
    const logger = createLogger(options.logger);
    const warnings: string[] = [];

    const backupDir = path.resolve(options.backupDir);
    const targetDataDir = path.resolve(options.dataDir);
    const systemDataDir = path.resolve(options.systemDataDir ?? '.system-data');
    const restoreStorage = options.restoreStorage !== false;
    const overwrite = options.overwrite === true;

    const sourceDataDir = path.join(backupDir, 'data');

    if (!(await pathExists(sourceDataDir))) {
      throw new Error(
        `Backup is missing data directory: ${sourceDataDir}. Ensure you provided the path to a backup directory.`
      );
    }

    if (await pathExists(targetDataDir)) {
      if (!overwrite) {
        throw new Error(
          `Data directory already exists at ${targetDataDir}. Use --overwrite to replace it.`
        );
      }
      await fs.rm(targetDataDir, { recursive: true, force: true });
    }

    await fs.mkdir(path.dirname(targetDataDir), { recursive: true });
    await fs.cp(sourceDataDir, targetDataDir, { recursive: true, force: true });

    let storageDir: string | undefined;

    if (restoreStorage) {
      const sourceStorageDir = path.join(backupDir, 'storage');
      if (await pathExists(sourceStorageDir)) {
        storageDir = path.join(systemDataDir, 'storage');

        if (await pathExists(storageDir)) {
          if (!overwrite) {
            warnings.push(
              `Storage directory already exists at ${storageDir}. Skipping restore (use --overwrite to replace).`
            );
            storageDir = undefined;
          } else {
            await fs.rm(storageDir, { recursive: true, force: true });
          }
        }

        if (storageDir) {
          await fs.mkdir(path.dirname(storageDir), { recursive: true });
          await fs.cp(sourceStorageDir, storageDir, {
            recursive: true,
            force: true,
          });
        }
      }
    }

    let metadata: BackupMetadata | undefined;
    const metadataPath = path.join(backupDir, 'metadata.json');

    if (await pathExists(metadataPath)) {
      try {
        const metadataContent = await fs.readFile(metadataPath, 'utf8');
        metadata = JSON.parse(metadataContent) as BackupMetadata;
      } catch (error) {
        const message = `Failed to parse backup metadata: ${
          error instanceof Error ? error.message : String(error)
        }`;
        warnings.push(message);
      }
    }

    logger.info('Backup restored successfully.');

    return {
      dataDir: targetDataDir,
      storageDir,
      metadata,
      warnings,
    };
  }
}

async function loadStorageConfig(
  systemDataDir: string
): Promise<StorageConfig | null> {
  const storageConfigPath = path.join(systemDataDir, 'storage.yml');

  if (!(await pathExists(storageConfigPath))) {
    return null;
  }

  const content = await fs.readFile(storageConfigPath, 'utf8');
  return yaml.parse(content) as StorageConfig;
}
