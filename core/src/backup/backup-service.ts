import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import yaml from 'yaml';
import { Logger } from '../utils/logger.js';
import { DatabaseService } from '../database/database-service.js';
import { DatabaseConfig } from '../database/database-adapter.js';

const execFileAsync = promisify(execFile);

interface StorageFolderConfig {
  path: string;
  access?: string;
  allowed_types?: string[];
  max_size?: string;
  description?: string;
  backup_included?: boolean;
  [key: string]: any; // Allow additional properties
}

interface StorageProviderConfig {
  type: string;
  path?: string;
}

interface StorageConfig {
  backend?: {
    type: string;
    path?: string;
  };
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
    nested: boolean;
  };
  storage?: {
    included: boolean;
    provider?: string;
    relativePath?: string;
    source?: string;
    filesExported?: boolean;
    configExported?: boolean;
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
  version?: string;
  extraMetadata?: Record<string, unknown>;
  timestamp?: string;
  logger?: Logger;
  databaseConfig?: DatabaseConfig;
}

export interface BackupCreateResult {
  backupDir: string;
  metadataPath: string;
  timestamp: string;
  gitBundlePath?: string;
  storageIncluded: boolean;
  storageFilesExported: boolean;
  storageConfigExported: boolean;
  warnings: string[];
}

export interface BackupRestoreOptions {
  backupDir: string;
  dataDir: string;
  systemDataDir?: string;
  restoreStorage?: boolean;
  overwrite?: boolean;
  logger?: Logger;
  databaseConfig?: DatabaseConfig;
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
    let gitNested = false;

    if (includeGitBundle) {
      // Check for nested git repository in data directory
      const nestedGitRepo = path.join(dataDir, '.git');
      const hasNestedGit = await pathExists(nestedGitRepo);

      if (!hasNestedGit) {
        // ERROR: Data directory should have git repo
        const errorMsg =
          'Data directory does not contain a git repository. This may indicate a configuration problem.';
        warnings.push(errorMsg);
        gitWarning = errorMsg;
        gitNested = false;
      } else {
        // Use nested git repo (dataDir is the repo root)
        gitNested = true;

        try {
          gitHead = (
            await execFileAsync('git', ['rev-parse', 'HEAD'], {
              cwd: dataDir,
            })
          ).stdout
            .trim()
            .replace(/\s+/g, ' ');
        } catch (error) {
          gitWarning = `Unable to determine git HEAD from data directory: ${
            error instanceof Error ? error.message : String(error)
          }`;
          warnings.push(gitWarning);
        }

        try {
          const gitDir = path.join(backupDir, 'git');
          await fs.mkdir(gitDir, { recursive: true });
          gitBundlePath = path.join(gitDir, 'data.bundle');
          // Bundle entire repo (no path filter needed - dataDir is the repo root)
          await execFileAsync(
            'git',
            ['bundle', 'create', gitBundlePath, 'HEAD'],
            { cwd: dataDir }
          );
        } catch (error) {
          const warningMessage = `Unable to create git bundle from data directory: ${
            error instanceof Error ? error.message : String(error)
          }`;
          gitBundlePath = undefined;
          gitWarning = warningMessage;
          warnings.push(warningMessage);
        }
      }
    }

    let storageIncluded = false;
    let storageFilesExported = false;
    let storageConfigExported = false;
    let storageInfo: BackupMetadata['storage'] = {
      included: false,
    };

    if (includeStorage) {
      try {
        const storageConfig = await loadStorageConfig(systemDataDir);

        if (storageConfig) {
          // Handle both legacy (backend) and new (providers) config structures
          const activeProvider = storageConfig.active_provider ?? 'local';
          let provider = storageConfig.providers?.[activeProvider];

          // Fallback to legacy backend structure if providers not found
          if (!provider && storageConfig.backend) {
            provider = {
              type: storageConfig.backend.type,
              path: storageConfig.backend.path,
            };
          }

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

          // Export minimal storage configuration (folder structure only, no credentials)
          try {
            const minimalConfig = {
              schema: {
                version: '1.0.0',
                exported_at: new Date().toISOString(),
                description:
                  'Minimal storage configuration (folder structure only, no credentials)',
              },
              folders: storageConfig.folders
                ? Object.fromEntries(
                    Object.entries(storageConfig.folders).map(
                      ([name, folder]) => [
                        name,
                        {
                          path: folder.path,
                          access: folder.access || undefined,
                          allowed_types: folder.allowed_types || undefined,
                          max_size: folder.max_size || undefined,
                          description: folder.description || undefined,
                          backup_included: folder.backup_included || undefined,
                        },
                      ]
                    )
                  )
                : {},
              active_provider: activeProvider,
              provider_type: provider?.type,
            };

            const storageConfigPath = path.join(
              backupDir,
              'storage-config.json'
            );
            await fs.writeFile(
              storageConfigPath,
              JSON.stringify(minimalConfig, null, 2),
              'utf8'
            );
            storageConfigExported = true;
            storageInfo = {
              ...storageInfo,
              configExported: true,
            };
          } catch (error) {
            const message = `Failed to export storage configuration: ${
              error instanceof Error ? error.message : String(error)
            }`;
            warnings.push(message);
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

    // Export storage_files table to JSON (if database config is provided)
    if (options.databaseConfig) {
      try {
        const dbService = new DatabaseService(options.databaseConfig, logger);
        await dbService.initialize();
        const storageFiles = await dbService.getAllStorageFiles();

        const storageFilesExport = {
          schema: {
            version: '1.0.0',
            table: 'storage_files',
            exported_at: new Date().toISOString(),
            civicpress_version: options.version,
            description:
              'UUID-based file tracking data for restoring file relationships',
          },
          data: storageFiles.map((file) => ({
            id: file.id,
            original_name: file.original_name,
            stored_filename: file.stored_filename,
            folder: file.folder,
            relative_path: file.relative_path,
            provider_path: file.provider_path,
            size: file.size,
            mime_type: file.mime_type,
            description: file.description || null,
            uploaded_by: file.uploaded_by || null,
            created_at: file.created_at,
            updated_at: file.updated_at,
          })),
        };

        const storageFilesPath = path.join(backupDir, 'storage-files.json');
        await fs.writeFile(
          storageFilesPath,
          JSON.stringify(storageFilesExport, null, 2),
          'utf8'
        );
        storageFilesExported = true;
        storageInfo = {
          ...(storageInfo || { included: false }),
          filesExported: true,
        };
      } catch (error) {
        const message = `Failed to export storage files table: ${
          error instanceof Error ? error.message : String(error)
        }`;
        warnings.push(message);
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
            nested: gitNested,
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
      storageFilesExported,
      storageConfigExported,
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

    // Restore git repository from bundle if available
    let gitBundlePath = path.join(backupDir, 'git', 'data.bundle');
    if (await pathExists(gitBundlePath)) {
      try {
        // Remove .git if it exists (we'll restore from bundle)
        const targetGitDir = path.join(targetDataDir, '.git');
        if (await pathExists(targetGitDir)) {
          await fs.rm(targetGitDir, { recursive: true, force: true });
        }

        // Clone bundle to temporary location, then move .git to target
        const tempClone = path.join(
          path.dirname(targetDataDir),
          '.temp-git-restore'
        );
        try {
          await execFileAsync('git', ['clone', gitBundlePath, tempClone], {
            cwd: path.dirname(targetDataDir),
          });

          // Move .git from temp clone to target data directory
          const tempGitDir = path.join(tempClone, '.git');
          if (await pathExists(tempGitDir)) {
            await fs.rename(tempGitDir, targetGitDir);
          }

          // Clean up temp directory
          await fs.rm(tempClone, { recursive: true, force: true });

          logger.info('Git repository restored from bundle');
        } catch (cloneError) {
          // Clean up temp directory if it exists
          if (await pathExists(tempClone)) {
            await fs.rm(tempClone, { recursive: true, force: true });
          }
          throw cloneError;
        }
      } catch (error) {
        const warningMessage = `Failed to restore git repository from bundle: ${
          error instanceof Error ? error.message : String(error)
        }`;
        warnings.push(warningMessage);
        logger.warn(warningMessage);
      }
    }

    let storageDir: string | undefined;

    if (restoreStorage) {
      const sourceStorageDir = path.join(backupDir, 'storage');
      if (await pathExists(sourceStorageDir)) {
        // Determine storage path from current storage config
        // (backup's storage-config.json doesn't include full paths, only folder structure)
        const storageConfig = await loadStorageConfig(systemDataDir);
        const activeProvider = storageConfig?.active_provider ?? 'local';
        let provider = storageConfig?.providers?.[activeProvider];

        // Fallback to legacy backend structure if providers not found
        if (!provider && storageConfig?.backend) {
          provider = {
            type: storageConfig.backend.type,
            path: storageConfig.backend.path,
          };
        }

        if (provider?.type === 'local') {
          // Use the configured storage path (could be absolute or relative to systemDataDir)
          const providerPath = provider.path ?? 'storage';
          storageDir = path.isAbsolute(providerPath)
            ? providerPath
            : path.resolve(systemDataDir, providerPath);
        } else {
          // Non-local provider or no config - fallback to systemDataDir/storage
          storageDir = path.join(systemDataDir, 'storage');
          warnings.push(
            `Storage provider is not local or config not found. Restoring to default location: ${storageDir}`
          );
        }

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
          logger.info(`Storage files restored to: ${storageDir}`);
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

    // Check for git bundle warning if bundle was not found
    if (!(await pathExists(gitBundlePath))) {
      if (metadata?.git?.warning) {
        warnings.push(
          `Git bundle not found in backup: ${metadata.git.warning}`
        );
      } else if (metadata?.git) {
        warnings.push(
          'Git bundle not found in backup, but data directory was restored.'
        );
      }
    }

    // Restore storage_files table from JSON (if database config is provided)
    if (options.databaseConfig) {
      const storageFilesPath = path.join(backupDir, 'storage-files.json');
      if (await pathExists(storageFilesPath)) {
        try {
          const storageFilesContent = await fs.readFile(
            storageFilesPath,
            'utf8'
          );
          const storageFilesExport = JSON.parse(storageFilesContent) as {
            schema: { version: string; table: string; exported_at: string };
            data: Array<{
              id: string;
              original_name: string;
              stored_filename: string;
              folder: string;
              relative_path: string;
              provider_path: string;
              size: number;
              mime_type: string;
              description: string | null;
              uploaded_by: string | null;
              created_at: string;
              updated_at: string;
            }>;
          };

          const dbService = new DatabaseService(options.databaseConfig, logger);
          await dbService.initialize();

          // Load storage config to determine correct provider path
          const storageConfig = await loadStorageConfig(systemDataDir);
          const activeProvider = storageConfig?.active_provider ?? 'local';
          let provider = storageConfig?.providers?.[activeProvider];

          // Fallback to legacy backend structure if providers not found
          if (!provider && storageConfig?.backend) {
            provider = {
              type: storageConfig.backend.type,
              path: storageConfig.backend.path,
            };
          }

          const isLocalProvider = provider?.type === 'local';
          const newStorageBasePath = isLocalProvider
            ? path.isAbsolute(provider?.path ?? '')
              ? provider.path
              : path.resolve(systemDataDir, provider?.path ?? 'storage')
            : null;

          let restoredCount = 0;
          let skippedCount = 0;

          // Import each storage file record
          for (const file of storageFilesExport.data) {
            try {
              // Update provider_path if restoring to a different location
              let providerPath = file.provider_path;
              if (isLocalProvider && newStorageBasePath) {
                // Extract the relative path from the old provider_path
                // The old path might be absolute or relative to old system-data
                // We'll reconstruct it based on the folder and stored_filename
                const folderPath = path.join(newStorageBasePath, file.folder);
                providerPath = path.join(folderPath, file.stored_filename);
              }

              await dbService.upsertStorageFile({
                id: file.id,
                original_name: file.original_name,
                stored_filename: file.stored_filename,
                folder: file.folder,
                relative_path: file.relative_path,
                provider_path: providerPath,
                size: file.size,
                mime_type: file.mime_type,
                description: file.description || undefined,
                uploaded_by: file.uploaded_by || undefined,
                created_at: file.created_at,
                updated_at: file.updated_at,
              });
              restoredCount++;
            } catch (error) {
              skippedCount++;
              warnings.push(
                `Failed to restore storage file ${file.id}: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
            }
          }

          logger.info(
            `Restored ${restoredCount} storage file records${
              skippedCount > 0 ? ` (${skippedCount} skipped)` : ''
            }`
          );
        } catch (error) {
          const message = `Failed to restore storage files table: ${
            error instanceof Error ? error.message : String(error)
          }`;
          warnings.push(message);
        }
      } else {
        warnings.push(
          'storage-files.json not found in backup. File UUID relationships may not be restored.'
        );
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
