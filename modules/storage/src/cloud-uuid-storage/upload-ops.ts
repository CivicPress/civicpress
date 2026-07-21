/**
 * Upload operations collaborator for CloudUuidStorageService.
 *
 * Phase 2d W2-T18: moved verbatim from the prior monolith. Owns the
 * `uploadFile` public path plus the internal `_uploadFile` + provider-specific
 * `uploadToLocal/S3/Azure/GCS` helpers.
 *
 * Uses the host-ref strategy: the orchestrator instance is passed in via the
 * deps bag, so mutable state (databaseService, retryManager, cacheAdapter,
 * etc.) that gets set AFTER construction stays visible without re-wiring.
 */

import fs from 'fs-extra';
import path from 'path';
import mime from 'mime-types';
import { v4 as uuidv4 } from 'uuid';
import { loadAwsS3Sdk } from './sdk-loader.js';
import type {
  UploadFileRequest,
  UploadFileResponse,
  StorageFile,
  MulterFile,
  StorageProvider,
} from '../types/storage.types.js';
import {
  withTimeout,
  getTimeoutForOperation,
} from '../utils/timeout.js';
import {
  generateStoredFilename,
  getLocalStoragePath,
  logOperation,
  writeSidecarManifest,
} from './internals.js';
import type { CloudUuidStorageService } from '../cloud-uuid-storage-service.js';
import type { QuotaReservation } from '../quota/quota-manager.js';

export interface UploadOpsDeps {
  host: CloudUuidStorageService;
}

export class UploadOps {
  constructor(private readonly deps: UploadOpsDeps) {}

  /**
   * Upload a file with UUID tracking
   */
  async uploadFile(request: UploadFileRequest): Promise<UploadFileResponse> {
    const host = this.deps.host;
    // Apply concurrency limiting if configured
    if (host.concurrencyLimiter) {
      return host.concurrencyLimiter.limitUpload(() =>
        this._uploadFile(request)
      );
    }
    return this._uploadFile(request);
  }

  /**
   * Internal upload implementation (called with or without concurrency limiting)
   */
  private async _uploadFile(
    request: UploadFileRequest
  ): Promise<UploadFileResponse> {
    const host = this.deps.host;
    const startTime = Date.now();
    let provider: string | undefined;
    let error: string | undefined;
    let fileData: MulterFile | undefined;
    let quotaReservation: QuotaReservation | null = null;

    try {
      if (!host.databaseService) {
        throw new Error('Database service not initialized');
      }

      const folder = host.config.folders[request.folder];
      if (!folder) {
        return {
          success: false,
          error: `Storage folder '${request.folder}' not found`,
        };
      }

      // Extract file data
      if (Buffer.isBuffer(request.file)) {
        throw new Error('Buffer uploads not yet supported - use MulterFile');
      }
      fileData = request.file as MulterFile;

      // Validate file
      const validation = host.validation.validateFile(fileData, folder);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join(', '),
        };
      }

      // storage-001 (Critical) — enforce quota BEFORE accepting the
      // upload. Previously QuotaManager.checkQuota was wired up but
      // never called from any upload path, so configured quotas were
      // never enforced. It throws QuotaExceededError on rejection
      // (caught by the outer try/catch and returned as
      // { success: false, error: ... } to the caller).
      //
      // RESERVE rather than merely check: a plain check is a
      // read-then-decide, so concurrent uploads into a near-full folder
      // each saw the same pre-upload usage and were all admitted,
      // jointly overshooting the limit. The reservation is released in
      // the `finally` below.
      if (host.quotaManager && host.quotaManager.isEnabled()) {
        quotaReservation = await host.quotaManager.reserve(
          request.folder,
          fileData.size
        );
      }

      // Generate UUID and filename
      const fileId = uuidv4();
      const storedFilename = generateStoredFilename(fileData, fileId);
      const relativePath = `${request.folder}/${storedFilename}`;

      // Upload with failover support
      const uploadOperation = async (providerName: string): Promise<string> => {
        const provider = host.config.providers?.[providerName];
        if (!provider) {
          throw new Error(`Provider '${providerName}' not found`);
        }

        const executeUpload = async () => {
          switch (provider.type) {
            case 'local':
              return await this.uploadToLocal(fileData!, relativePath);
            case 's3':
              return await this.uploadToS3(fileData!, relativePath, provider);
            case 'azure':
              return await this.uploadToAzure(
                fileData!,
                relativePath,
                provider
              );
            case 'gcs':
              return await this.uploadToGCS(fileData!, relativePath, provider);
            default:
              throw new Error(`Unsupported provider type: ${provider.type}`);
          }
        };

        // Apply timeout
        const timeout = getTimeoutForOperation('upload', host.timeoutConfig);
        const executeWithTimeout = () =>
          withTimeout(executeUpload, timeout, 'upload');

        // Apply circuit breaker if configured
        if (host.circuitBreakerManager) {
          const breaker = host.circuitBreakerManager.getBreaker(providerName);
          return breaker.execute(executeWithTimeout);
        }

        return executeWithTimeout();
      };

      let providerPath: string;
      if (host.failoverManager) {
        providerPath = await host.failoverManager.executeWithFailover(
          uploadOperation,
          'upload'
        );
      } else {
        // No failover - use active provider
        const activeProvider = host.config.active_provider || 'local';
        providerPath = await uploadOperation(activeProvider);
      }

      // Create storage file record
      const storageFile: StorageFile = {
        id: fileId,
        original_name: fileData.originalname,
        stored_filename: storedFilename,
        folder: request.folder,
        relative_path: relativePath,
        provider_path: providerPath,
        size: fileData.size,
        mime_type:
          fileData.mimetype ||
          mime.lookup(fileData.originalname) ||
          'application/octet-stream',
        description: request.description,
        uploaded_by: request.uploaded_by,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Save to database
      await host.databaseService.createStorageFile(storageFile);

      // FA-STOR-004: write a disk sidecar so the row is recoverable if the DB
      // is lost. Best-effort — never fail the upload on a sidecar error.
      try {
        await writeSidecarManifest(host, storageFile);
      } catch (sidecarError) {
        host.logger.warn('Failed to write storage sidecar manifest', {
          fileId: storageFile.id,
          error:
            sidecarError instanceof Error
              ? sidecarError.message
              : String(sidecarError),
        });
      }

      // Invalidate cache for folder
      if (host.cacheAdapter) {
        await host.cacheAdapter.invalidateFolder(request.folder);
      }

      // Extract provider name for metrics
      const activeProvider = host.config.active_provider || 'local';
      provider = activeProvider;

      // Log operation
      logOperation(host, {
        operation: 'upload',
        path: providerPath,
        user_id: request.uploaded_by,
        timestamp: new Date(),
        success: true,
        metadata: {
          folder: request.folder,
          size: fileData.size,
          file_id: fileId,
          provider: provider,
        },
      });

      const result = {
        success: true,
        file: storageFile,
      };

      // Record metrics
      if (host.metricsCollector) {
        const latency = Date.now() - startTime;
        host.metricsCollector.recordUpload(
          true,
          fileData.size,
          latency,
          provider
        );
      }

      return result;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      host.logger.error('File upload failed:', err);

      // Extract provider name for metrics
      const activeProvider = host.config.active_provider || 'local';
      provider = activeProvider;

      logOperation(host, {
        operation: 'upload',
        path: request.folder,
        user_id: request.uploaded_by,
        timestamp: new Date(),
        success: false,
        error,
      });

      const result = {
        success: false,
        error,
      };

      // Record metrics
      if (host.metricsCollector) {
        const latency = Date.now() - startTime;
        const errorCode =
          err instanceof Error && (err as Error & { code?: string }).code
            ? (err as Error & { code?: string }).code
            : 'UNKNOWN_ERROR';
        const fileSize = (fileData as MulterFile | undefined)?.size || 0;
        host.metricsCollector.recordUpload(
          false,
          fileSize,
          latency,
          provider || host.config.active_provider || 'local',
          errorCode
        );
      }

      return result;
    } finally {
      // Release the reserved headroom whether the upload landed or failed. On
      // the success path this runs after createStorageFile, so the bytes are
      // already counted by the usage reporter — there is no window in which
      // they are neither reserved nor measured.
      host.quotaManager?.release(quotaReservation);
    }
  }

  /**
   * Upload file to local storage
   */
  private async uploadToLocal(
    fileData: MulterFile,
    relativePath: string
  ): Promise<string> {
    const host = this.deps.host;
    const fullPath = path.join(getLocalStoragePath(host), relativePath);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(fullPath));

    // Write file
    await fs.writeFile(fullPath, fileData.buffer);

    return fullPath;
  }

  /**
   * Upload file to S3
   */
  private async uploadToS3(
    fileData: MulterFile,
    relativePath: string,
    provider: StorageProvider
  ): Promise<string> {
    const host = this.deps.host;
    // Ensure client is initialized (reuse existing or recreate on error)
    if (!host.s3Client) {
      await host.initializeS3Storage(provider);
    }

    const key = provider.prefix
      ? `${provider.prefix}/${relativePath}`
      : relativePath;

    const uploadOperation = async () => {
      const { PutObjectCommand } = await loadAwsS3Sdk();
      const command = new PutObjectCommand({
        Bucket: provider.bucket,
        Key: key,
        Body: fileData.buffer,
        ContentType: fileData.mimetype,
        Metadata: {
          originalName: fileData.originalname,
          uploadedAt: new Date().toISOString(),
        },
      });

      await host.s3Client!.send(command);
      return `s3://${provider.bucket}/${key}`;
    };

    // Apply retry logic if retry manager is configured
    if (host.retryManager) {
      return host.retryManager.withRetry(uploadOperation);
    }

    return uploadOperation();
  }

  /**
   * Upload file to Azure Blob Storage
   */
  private async uploadToAzure(
    fileData: MulterFile,
    relativePath: string,
    provider: StorageProvider
  ): Promise<string> {
    const host = this.deps.host;
    if (!host.azureContainerClient) {
      throw new Error('Azure container client not initialized');
    }

    const blobName = provider.prefix
      ? `${provider.prefix}/${relativePath}`
      : relativePath;

    const uploadOperation = async () => {
      // Get block blob client
      const blockBlobClient =
        host.azureContainerClient!.getBlockBlobClient(blobName);

      // Upload the file
      await blockBlobClient.uploadData(fileData.buffer, {
        blobHTTPHeaders: {
          blobContentType: fileData.mimetype,
        },
        metadata: {
          originalName: fileData.originalname,
          uploadedAt: new Date().toISOString(),
        },
        tier: provider.options?.access_tier || 'Hot',
      });

      return `azure://${provider.account_name}/${provider.container_name}/${blobName}`;
    };

    // Apply retry logic if retry manager is configured
    if (host.retryManager) {
      return host.retryManager.withRetry(uploadOperation);
    }

    return uploadOperation();
  }

  /**
   * Upload file to Google Cloud Storage
   */
  private async uploadToGCS(
    fileData: MulterFile,
    relativePath: string,
    provider: StorageProvider
  ): Promise<string> {
    const host = this.deps.host;
    if (!host.gcsBucket) {
      throw new Error('GCS bucket not initialized');
    }

    const fileName = provider.prefix
      ? `${provider.prefix}/${relativePath}`
      : relativePath;

    const uploadOperation = async () => {
      const file = host.gcsBucket!.file(fileName);

      // Upload the file
      await file.save(fileData.buffer, {
        metadata: {
          contentType: fileData.mimetype,
          metadata: {
            originalName: fileData.originalname,
            uploadedAt: new Date().toISOString(),
          },
        },
      });

      return `gs://${provider.bucket}/${fileName}`;
    };

    // Apply retry logic if retry manager is configured
    if (host.retryManager) {
      return host.retryManager.withRetry(uploadOperation);
    }

    return uploadOperation();
  }
}
