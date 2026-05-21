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
import type { Logger } from '@civicpress/core';
import type {
  StorageConfig,
  StorageFile,
  StorageOperation,
  MulterFile,
} from '../types/storage.types.js';

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
 * Generate stored filename with UUID
 */
export function generateStoredFilename(file: MulterFile, uuid: string): string {
  const extension = path.extname(file.originalname);
  const baseName = path.basename(file.originalname, extension);

  // Keep original filename readable: "document.550e8400-....pdf"
  return `${baseName}.${uuid}${extension}`;
}

/**
 * Generate stored filename from original name (for stream uploads)
 */
export function generateStoredFilenameFromName(
  originalName: string,
  fileId: string
): string {
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);
  const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${sanitizedBaseName}_${fileId}${ext}`;
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
export function dbRecordToStorageFile(record: any): StorageFile {
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
    created_at: new Date(record.created_at),
    updated_at: new Date(record.updated_at),
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
