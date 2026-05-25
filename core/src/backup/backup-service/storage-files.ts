import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from '../../utils/logger.js';
import { DatabaseService } from '../../database/database-service.js';
import { DatabaseConfig } from '../../database/database-adapter.js';

/**
 * Subset of `StorageConfig` (declared in `../backup-service.ts`) consumed by
 * the restore helper below. Duplicated locally to keep this module free of
 * back-imports from its parent file.
 */
interface StorageConfigForRestore {
  backend?: { type: string; path?: string };
  active_provider?: string;
  providers?: Record<string, { type: string; path?: string }>;
}

/**
 * Result returned by {@link exportStorageFilesTable}.
 */
export interface StorageFilesExportResult {
  exported: boolean;
  warnings: string[];
}

/**
 * Result returned by {@link restoreStorageFilesTable}.
 */
export interface StorageFilesRestoreResult {
  warnings: string[];
}

/**
 * Export the `storage_files` table to a JSON file in the backup directory.
 *
 * Extracted from `BackupService.createBackup` to keep the main file under the
 * master plan §5 LoC ceiling. Behaviour is identical to the previous inline
 * implementation.
 */
export async function exportStorageFilesTable(args: {
  backupDir: string;
  databaseConfig: DatabaseConfig;
  version?: string;
  logger: Logger;
}): Promise<StorageFilesExportResult> {
  const { backupDir, databaseConfig, version, logger } = args;
  const warnings: string[] = [];

  try {
    const dbService = new DatabaseService(databaseConfig, logger);
    await dbService.initialize();
    const storageFiles = await dbService.getAllStorageFiles();

    const storageFilesExport = {
      schema: {
        version: '1.0.0',
        table: 'storage_files',
        exported_at: new Date().toISOString(),
        civicpress_version: version,
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
    return { exported: true, warnings };
  } catch (error) {
    const message = `Failed to export storage files table: ${
      error instanceof Error ? error.message : String(error)
    }`;
    warnings.push(message);
    return { exported: false, warnings };
  }
}

/**
 * Restore the `storage_files` table from `storage-files.json` in the backup
 * directory.
 *
 * Extracted from `BackupService.restoreBackup`. The caller supplies a
 * `loadStorageConfig` callback so this helper does not need to know how
 * storage configuration is read.
 */
export async function restoreStorageFilesTable(args: {
  backupDir: string;
  systemDataDir: string;
  databaseConfig: DatabaseConfig;
  loadStorageConfig: (
    systemDataDir: string
  ) => Promise<StorageConfigForRestore | null>;
  pathExists: (target: string) => Promise<boolean>;
  logger: Logger;
}): Promise<StorageFilesRestoreResult> {
  const {
    backupDir,
    systemDataDir,
    databaseConfig,
    loadStorageConfig,
    pathExists,
    logger,
  } = args;
  const warnings: string[] = [];

  const storageFilesPath = path.join(backupDir, 'storage-files.json');
  if (!(await pathExists(storageFilesPath))) {
    warnings.push(
      'storage-files.json not found in backup. File UUID relationships may not be restored.'
    );
    return { warnings };
  }

  try {
    const storageFilesContent = await fs.readFile(storageFilesPath, 'utf8');
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

    const dbService = new DatabaseService(databaseConfig, logger);
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
    const newStorageBasePath =
      isLocalProvider && provider
        ? path.isAbsolute(provider.path ?? '')
          ? provider.path
          : path.resolve(systemDataDir, provider.path ?? 'storage')
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

  return { warnings };
}
