/**
 * Batch operations collaborator for CloudUuidStorageService.
 *
 * Phase 2d W2-T18: moved verbatim from the prior monolith. Owns
 * `batchUpload` and `batchDelete`. Cross-calls back into the host for the
 * single-file operations (`uploadFile`, `getFileById`, `deleteFile`) and for
 * the validator + cache adapter.
 */

import type {
  StorageFile,
  UploadFileRequest,
  UploadFileResponse,
  MulterFile,
  BatchUploadRequest,
  BatchUploadResponse,
  BatchUploadResult,
  BatchDeleteRequest,
  BatchDeleteResponse,
  BatchDeleteResult,
  BatchOperationProgress,
} from '../types/storage.types.js';
import { BatchOperationError } from '../errors/storage-errors.js';
import { extractErrorCode, generateErrorSummary } from './internals.js';
import type { CloudUuidStorageService } from '../cloud-uuid-storage-service.js';

export interface BatchOpsDeps {
  host: CloudUuidStorageService;
}

export class BatchOps {
  constructor(private readonly deps: BatchOpsDeps) {}

  /**
   * Batch upload files
   */
  async batchUpload(
    request: BatchUploadRequest,
    options?: {
      maxConcurrency?: number;
      onProgress?: (progress: BatchOperationProgress) => void;
    }
  ): Promise<BatchUploadResponse> {
    const host = this.deps.host;
    const maxConcurrency = options?.maxConcurrency || 5;
    const results: BatchUploadResult[] = [];
    const affectedFolders = new Set<string>();

    try {
      // Validate batch request
      const validation = host.validation.validateBatchUpload(request);
      if (!validation.valid) {
        // If validation fails completely, return all as failed
        return {
          successful: [],
          failed: request.files.map((_file) => ({
            file: {} as StorageFile,
            success: false,
            error: validation.errors.join(', '),
          })),
          total: request.files.length,
          successfulCount: 0,
          failedCount: request.files.length,
        };
      }

      // Process files with concurrency control
      let completed = 0;
      const processFile = async (
        file: MulterFile
      ): Promise<BatchUploadResult> => {
        try {
          // FA-API-016: when the file was buffered to disk (API disk-upload
          // path — path set, buffer empty) stream it into storage instead of
          // pulling it back into the heap. Fall back to the buffer path for
          // in-memory callers.
          let result: UploadFileResponse;
          if (file.path && (!file.buffer || file.buffer.length === 0)) {
            result = await host.uploadFileStream({
              filePath: file.path,
              filename: file.originalname,
              folder: request.folder,
              size: file.size,
              contentType: file.mimetype,
              uploaded_by: request.uploaded_by,
            });
          } else {
            const uploadRequest: UploadFileRequest = {
              file,
              folder: request.folder,
              uploaded_by: request.uploaded_by,
            };
            result = await host.uploadFile(uploadRequest);
          }

          // Report progress
          completed++;
          if (options?.onProgress) {
            options.onProgress({
              completed,
              total: request.files.length,
              current: file.originalname,
              percentage: Math.round((completed / request.files.length) * 100),
            });
          }

          if (result.success && result.file) {
            affectedFolders.add(request.folder);
            return {
              file: result.file,
              success: true,
            };
          } else {
            const errorCode = extractErrorCode(result.error || 'Upload failed');
            return {
              file: {} as StorageFile,
              success: false,
              error: result.error || 'Upload failed',
              errorCode,
            };
          }
        } catch (error) {
          completed++;
          if (options?.onProgress) {
            options.onProgress({
              completed,
              total: request.files.length,
              current: file.originalname,
              percentage: Math.round((completed / request.files.length) * 100),
            });
          }

          const errorCode = extractErrorCode(error);
          return {
            file: {} as StorageFile,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorCode,
          };
        }
      };

      // Process files in batches with concurrency limit
      for (let i = 0; i < request.files.length; i += maxConcurrency) {
        const batch = request.files.slice(i, i + maxConcurrency);
        const batchResults = await Promise.all(batch.map(processFile));
        results.push(...batchResults);
      }

      // Separate successful and failed
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      // Generate error summary
      const errorSummary =
        failed.length > 0
          ? generateErrorSummary(
              failed.map((f) => ({
                error: f.error || 'Unknown error',
                errorCode: f.errorCode,
              }))
            )
          : undefined;

      // Invalidate cache for affected folders
      if (host.cacheAdapter && affectedFolders.size > 0) {
        for (const folder of affectedFolders) {
          await host.cacheAdapter.invalidateFolder(folder);
        }
      }

      const response = {
        successful,
        failed,
        total: request.files.length,
        successfulCount: successful.length,
        failedCount: failed.length,
        errorSummary,
      };

      // If all failed, throw BatchOperationError
      if (successful.length === 0 && failed.length > 0) {
        throw new BatchOperationError(
          'All files failed to upload',
          {
            operation: 'upload',
            total: request.files.length,
            successful: 0,
            failed: failed.length,
            errors: failed.map((f) => ({
              item:
                f.file?.original_name || f.file?.stored_filename || 'unknown',
              error: f.error || 'Unknown error',
              errorCode: f.errorCode,
            })),
          },
          { folder: request.folder }
        );
      }

      return response;
    } catch (error) {
      // BatchOperationError is the explicit "all failed" signal we threw
      // above — let it bubble. The outer catch only exists for unexpected
      // errors during the upload loop itself.
      if (error instanceof BatchOperationError) {
        throw error;
      }
      host.logger.error('Batch upload failed:', error);
      // Return partial results if any were successful
      return {
        successful: results.filter((r) => r.success),
        failed: results.filter((r) => !r.success),
        total: request.files.length,
        successfulCount: results.filter((r) => r.success).length,
        failedCount: results.filter((r) => !r.success).length,
      };
    }
  }

  /**
   * Batch delete files
   */
  async batchDelete(
    request: BatchDeleteRequest,
    options?: {
      maxConcurrency?: number;
      onProgress?: (progress: BatchOperationProgress) => void;
    }
  ): Promise<BatchDeleteResponse> {
    const host = this.deps.host;
    const maxConcurrency = options?.maxConcurrency || 10;
    const results: BatchDeleteResult[] = [];
    const affectedFolders = new Set<string>();

    try {
      // Validate batch request
      if (!request.fileIds || request.fileIds.length === 0) {
        return {
          successful: [],
          failed: [],
          total: 0,
          successfulCount: 0,
          failedCount: 0,
        };
      }

      let completed = 0;
      const processDelete = async (
        fileId: string
      ): Promise<BatchDeleteResult> => {
        try {
          // Get file first to track affected folders
          const file = await host.getFileById(fileId);
          if (file) {
            affectedFolders.add(file.folder);
          }

          const success = await host.deleteFile(fileId, request.userId);

          completed++;
          if (options?.onProgress) {
            options.onProgress({
              completed,
              total: request.fileIds.length,
              current: file?.original_name,
              percentage: Math.round(
                (completed / request.fileIds.length) * 100
              ),
            });
          }

          if (success) {
            return {
              fileId,
              success: true,
            };
          } else {
            return {
              fileId,
              success: false,
              error: file ? 'Delete failed' : 'File not found',
              errorCode: file
                ? 'STORAGE_DELETE_FAILED'
                : 'STORAGE_FILE_NOT_FOUND',
            };
          }
        } catch (error) {
          completed++;
          if (options?.onProgress) {
            options.onProgress({
              completed,
              total: request.fileIds.length,
              percentage: Math.round(
                (completed / request.fileIds.length) * 100
              ),
            });
          }

          const errorCode = extractErrorCode(error);
          return {
            fileId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorCode,
          };
        }
      };

      // Process deletes in batches with concurrency limit
      for (let i = 0; i < request.fileIds.length; i += maxConcurrency) {
        const batch = request.fileIds.slice(i, i + maxConcurrency);
        const batchResults = await Promise.all(batch.map(processDelete));
        results.push(...batchResults);
      }

      // Separate successful and failed
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      // Generate error summary
      const errorSummary =
        failed.length > 0
          ? generateErrorSummary(
              failed.map((f) => ({
                error: f.error || 'Unknown error',
                errorCode: f.errorCode,
              }))
            )
          : undefined;

      // Invalidate cache for affected folders
      if (host.cacheAdapter && affectedFolders.size > 0) {
        for (const folder of affectedFolders) {
          await host.cacheAdapter.invalidateFolder(folder);
        }
      }

      const response = {
        successful,
        failed,
        total: request.fileIds.length,
        successfulCount: successful.length,
        failedCount: failed.length,
        errorSummary,
      };

      // If all failed, throw BatchOperationError
      if (successful.length === 0 && failed.length > 0) {
        throw new BatchOperationError('All files failed to delete', {
          operation: 'delete',
          total: request.fileIds.length,
          successful: 0,
          failed: failed.length,
          errors: failed.map((f) => ({
            item: f.fileId,
            error: f.error || 'Unknown error',
            errorCode: f.errorCode,
          })),
        });
      }

      return response;
    } catch (error) {
      // Same pattern as batchUpload — BatchOperationError is explicit; let
      // it bubble. The outer catch is for unexpected errors during the
      // delete loop itself.
      if (error instanceof BatchOperationError) {
        throw error;
      }
      host.logger.error('Batch delete failed:', error);
      // Return partial results if any were successful
      return {
        successful: results.filter((r) => r.success),
        failed: results.filter((r) => !r.success),
        total: request.fileIds.length,
        successfulCount: results.filter((r) => r.success).length,
        failedCount: results.filter((r) => !r.success).length,
      };
    }
  }
}
