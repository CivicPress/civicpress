/**
 * Shared internals for the CloudUuidStorageService decomposition.
 *
 * Phase 2d W2-T18 moved these helpers out of the prior 2,711-LoC monolith
 * so the ops collaborators (upload/download/file-mgmt/batch/streaming) can
 * share them without going through the host. All bodies moved verbatim;
 * names preserved.
 *
 * Pure module-level helpers (no class state needed):
 *   - parseSizeString
 *   - formatBytes
 *   - generateStoredFilename
 *   - generateStoredFilenameFromName
 *   - extractErrorCode
 *   - generateErrorSummary
 *   - dbRecordToStorageFile
 *
 * Host-coupled helpers (need basePath / config / logger from the host):
 *   - getLocalStoragePath(host)
 *   - logOperation(host, operation)
 */

import path from 'path';
import { promises as fs } from 'fs';
import type { Logger } from '@civicpress/core';
import type {
  StorageConfig,
  StorageFile,
  StorageOperation,
  MulterFile,
} from '../types/storage.types.js';

// FA-STOR-004: a sidecar written next to each stored file so file→metadata is
// recoverable without the SQLite DB. Losing the DB previously made every stored
// file unreachable via the API (no manifest); the sidecar lets the DB be
// rebuilt from disk.
export const SIDECAR_SUFFIX = '.meta.json';

/**
 * Host accessor surface used by collaborators. The orchestrator class
 * implements this implicitly via its public fields/methods.
 *
 * Kept loose-typed (the orchestrator type itself is used at call sites) but
 * documents the subset of host state the helpers below need.
 */
export interface StorageHostLike {
  basePath: string;
  logger: Logger;
  config: StorageConfig;
}

/**
 * Parse size string (e.g., "10MB" -> bytes)
 */
export function parseSizeString(sizeStr: string): number {
  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
  if (!match) {
    return 1024 * 1024; // Default to 1MB
  }

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  return value * (units[unit] || 1);
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Generate stored filename with UUID.
 *
 * FA-CORE-017: the buffer-upload path used to emit an UNsanitized base name
 * (`${baseName}.${uuid}${ext}`), diverging from the stream path and letting a
 * hostile original name steer the on-disk/provider key. Both paths now share
 * the sanitizing generator so the stored key is always a safe identifier.
 */
export function generateStoredFilename(file: MulterFile, uuid: string): string {
  return generateStoredFilenameFromName(file.originalname, uuid);
}

/**
 * Generate a sanitized stored filename from an original name. Base name and
 * extension are both reduced to a safe character class; the file id keeps the
 * on-disk key unique and recoverable. (Used by every upload path.)
 */
export function generateStoredFilenameFromName(
  originalName: string,
  fileId: string
): string {
  const rawExt = path.extname(originalName);
  const baseName = path.basename(originalName, rawExt);
  const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
  // Keep only alnum + dot in the extension so a hostile ext can't smuggle
  // separators/path chars into the stored key.
  const sanitizedExt = rawExt.replace(/[^a-zA-Z0-9.]/g, '');
  return `${sanitizedBaseName}_${fileId}${sanitizedExt}`;
}

/**
 * Extract error code from error object
 */
export function extractErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as Error & { code?: string }).code);
  }
  if (error instanceof Error) {
    // Try to extract from error message patterns
    const message = error.message;
    if (message.includes('quota')) return 'STORAGE_QUOTA_EXCEEDED';
    if (message.includes('timeout')) return 'STORAGE_TIMEOUT';
    if (message.includes('not found')) return 'STORAGE_FILE_NOT_FOUND';
    if (message.includes('unauthorized') || message.includes('permission'))
      return 'STORAGE_UNAUTHORIZED';
  }
  if (typeof error === 'string') {
    if (error.includes('quota')) return 'STORAGE_QUOTA_EXCEEDED';
    if (error.includes('timeout')) return 'STORAGE_TIMEOUT';
    if (error.includes('not found')) return 'STORAGE_FILE_NOT_FOUND';
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Generate error summary from failed operations
 */
export function generateErrorSummary(
  failed: Array<{ error: string; errorCode?: string }>
): {
  byType: Record<string, number>;
  byError: Array<{ error: string; count: number }>;
  totalErrors: number;
} {
  const byType: Record<string, number> = {};
  const byError: Record<string, number> = {};

  for (const failure of failed) {
    // Count by error code
    const errorCode = failure.errorCode || 'UNKNOWN_ERROR';
    byType[errorCode] = (byType[errorCode] || 0) + 1;

    // Count by error message
    const errorMessage = failure.error;
    byError[errorMessage] = (byError[errorMessage] || 0) + 1;
  }

  // Convert to array and sort by count
  const byErrorArray = Object.entries(byError)
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count);

  return {
    byType,
    byError: byErrorArray,
    totalErrors: failed.length,
  };
}

/**
 * Convert database record to StorageFile
 */
export function dbRecordToStorageFile(record: StorageFile): StorageFile {
  return {
    id: record.id,
    original_name: record.original_name,
    stored_filename: record.stored_filename,
    folder: record.folder,
    relative_path: record.relative_path,
    provider_path: record.provider_path,
    size: record.size,
    mime_type: record.mime_type,
    description: record.description,
    uploaded_by: record.uploaded_by,
    created_at: record.created_at ? new Date(record.created_at) : undefined,
    updated_at: record.updated_at ? new Date(record.updated_at) : undefined,
  };
}

/**
 * Get local storage base path. Needs the host's basePath + the configured
 * local provider so it stays in sync with whatever the orchestrator owns.
 */
export function getLocalStoragePath(host: StorageHostLike): string {
  const localProvider = host.config.providers?.local;
  if (localProvider) {
    const storagePath = localProvider.path || 'storage';
    // If path is absolute, use it directly; otherwise resolve relative to basePath
    return path.isAbsolute(storagePath)
      ? storagePath
      : path.resolve(host.basePath, storagePath);
  }
  return path.resolve(host.basePath, 'storage');
}

/**
 * FA-STOR-004: write a `<file>.meta.json` sidecar next to a locally-stored file.
 * Best-effort — a sidecar failure must never fail the upload (the DB row is
 * still authoritative), so callers log and continue. No-op for non-local
 * providers (cloud objects are recovered from the provider's own metadata).
 */
export async function writeSidecarManifest(
  host: StorageHostLike,
  storageFile: StorageFile
): Promise<void> {
  const activeProvider = host.config.active_provider || 'local';
  if (activeProvider !== 'local') return;
  const fullPath = path.join(
    getLocalStoragePath(host),
    storageFile.relative_path
  );
  const manifest = {
    id: storageFile.id,
    original_name: storageFile.original_name,
    stored_filename: storageFile.stored_filename,
    folder: storageFile.folder,
    relative_path: storageFile.relative_path,
    provider_path: storageFile.provider_path,
    size: storageFile.size,
    mime_type: storageFile.mime_type,
    description: storageFile.description ?? null,
    uploaded_by: storageFile.uploaded_by ?? null,
    created_at:
      storageFile.created_at instanceof Date
        ? storageFile.created_at.toISOString()
        : storageFile.created_at,
    updated_at:
      storageFile.updated_at instanceof Date
        ? storageFile.updated_at.toISOString()
        : storageFile.updated_at,
  };
  await fs.writeFile(
    fullPath + SIDECAR_SUFFIX,
    JSON.stringify(manifest, null, 2),
    'utf8'
  );
}

/**
 * FA-STOR-004: remove a file's sidecar (best-effort). No-op for non-local.
 */
export async function deleteSidecarManifest(
  host: StorageHostLike,
  relativePath: string
): Promise<void> {
  const activeProvider = host.config.active_provider || 'local';
  if (activeProvider !== 'local') return;
  const fullPath =
    path.join(getLocalStoragePath(host), relativePath) + SIDECAR_SUFFIX;
  await fs.rm(fullPath, { force: true });
}

/**
 * Log storage operation for audit
 */
export function logOperation(
  host: StorageHostLike,
  operation: StorageOperation
): void {
  host.logger.info('Storage operation:', {
    operation: operation.operation,
    path: operation.path,
    user_id: operation.user_id,
    success: operation.success,
    error: operation.error,
    metadata: operation.metadata,
  });
}
