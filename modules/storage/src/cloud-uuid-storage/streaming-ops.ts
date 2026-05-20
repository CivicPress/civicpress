/**
 * Streaming operations collaborator for CloudUuidStorageService.
 *
 * Phase 2d W2-T18: moved verbatim from the prior monolith. Owns the
 * `uploadFileStream` + `downloadFileStream` public surface, the internal
 * `_downloadFileStream`, and the per-provider stream upload/download
 * helpers.
 */

import fs from 'fs-extra';
import path from 'path';
import mime from 'mime-types';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type {
  StorageFile,
  UploadFileResponse,
  StreamUploadRequest,
  StreamDownloadOptions,
} from '../types/storage.types.js';
import { StorageFileNotFoundError } from '../errors/storage-errors.js';
import {
  generateStoredFilenameFromName,
  getLocalStoragePath,
  logOperation,
} from './internals.js';
import type { CloudUuidStorageService } from '../cloud-uuid-storage-service.js';

export interface StreamingOpsDeps {
  host: CloudUuidStorageService;
}

export class StreamingOps {
  constructor(private readonly deps: StreamingOpsDeps) {}

  /**
   * Upload file from stream (for large files)
   */
  async uploadFileStream(
    request: StreamUploadRequest
  ): Promise<UploadFileResponse> {
    const host = this.deps.host;
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

      // storage-001 (Critical) — enforce quota BEFORE streaming. The
      // streaming path only knows the actual size after the stream
      // finishes, but if the caller declared `request.size` upfront
      // (which clients typically do via Content-Length), enforce the
      // quota against that declared size. If size is unknown, log a
      // warning and proceed (the alternative — buffering the stream
      // to count bytes — defeats the purpose of streaming and is
      // worse than the current state).
      if (host.quotaManager && host.quotaManager.isEnabled()) {
        if (typeof request.size === 'number' && request.size > 0) {
          await host.quotaManager.checkQuota(request.folder, request.size);
        } else {
          host.logger.warn(
            'Stream upload received with unknown size; quota cannot be enforced upfront. Folder: ' +
              request.folder
          );
        }
      }

      // Get stream threshold from config or default
      const streamThreshold = request.options?.threshold || 10 * 1024 * 1024; // 10MB default
      const useStream = request.size ? request.size > streamThreshold : true; // Default to streaming if size unknown

      // Generate UUID and filename
      const fileId = uuidv4();
      const storedFilename = generateStoredFilenameFromName(
        request.filename,
        fileId
      );
      const relativePath = `${request.folder}/${storedFilename}`;

      // Get active provider
      const activeProvider = host.config.active_provider || 'local';
      const provider = host.config.providers?.[activeProvider];

      if (!provider) {
        throw new Error(`Active provider '${activeProvider}' not found`);
      }

      let providerPath: string;
      let actualSize = request.size || 0;

      // Upload to provider using stream
      switch (provider.type) {
        case 'local':
          providerPath = await this.uploadStreamToLocal(
            request.stream,
            relativePath
          );
          // Get actual file size
          const fullPath = path.join(getLocalStoragePath(host), relativePath);
          const stats = await fs.stat(fullPath);
          actualSize = stats.size;
          break;
        case 's3':
          providerPath = await this.uploadStreamToS3(
            request.stream,
            relativePath,
            provider,
            request.contentType ||
              mime.lookup(request.filename) ||
              'application/octet-stream',
            request.options?.metadata
          );
          actualSize = request.size || 0; // S3 will set size
          break;
        case 'azure':
          providerPath = await this.uploadStreamToAzure(
            request.stream,
            relativePath,
            provider,
            request.contentType ||
              mime.lookup(request.filename) ||
              'application/octet-stream',
            request.options?.metadata
          );
          actualSize = request.size || 0; // Azure will set size
          break;
        default:
          throw new Error(`Unsupported provider type: ${provider.type}`);
      }

      // Create storage file record
      const storageFile: StorageFile = {
        id: fileId,
        original_name: request.filename,
        stored_filename: storedFilename,
        folder: request.folder,
        relative_path: relativePath,
        provider_path: providerPath,
        size: actualSize,
        mime_type:
          request.contentType ||
          mime.lookup(request.filename) ||
          'application/octet-stream',
        description: request.description,
        uploaded_by: request.uploaded_by,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Save to database
      await host.databaseService.createStorageFile(storageFile);

      // Invalidate cache for folder
      if (host.cacheAdapter) {
        await host.cacheAdapter.invalidateFolder(request.folder);
      }

      // Log operation
      logOperation(host, {
        operation: 'upload',
        path: providerPath,
        user_id: request.uploaded_by,
        timestamp: new Date(),
        success: true,
        metadata: {
          folder: request.folder,
          size: actualSize,
          file_id: fileId,
          provider: provider.type,
          streamed: useStream,
        },
      });

      return {
        success: true,
        file: storageFile,
      };
    } catch (error) {
      host.logger.error('Stream upload failed:', error);

      logOperation(host, {
        operation: 'upload',
        path: request.folder,
        user_id: request.uploaded_by,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Stream upload failed',
      };
    }
  }

  /**
   * Download file as stream (supports range requests)
   */
  async downloadFileStream(
    fileId: string,
    options?: StreamDownloadOptions
  ): Promise<Readable | null> {
    const host = this.deps.host;
    // Apply concurrency limiting if configured
    if (host.concurrencyLimiter) {
      return host.concurrencyLimiter.limitDownload(() =>
        this._downloadFileStream(fileId, options)
      );
    }
    return this._downloadFileStream(fileId, options);
  }

  /**
   * Internal download file stream implementation
   */
  private async _downloadFileStream(
    fileId: string,
    options?: StreamDownloadOptions
  ): Promise<Readable | null> {
    const host = this.deps.host;
    try {
      const file = await host.getFileById(fileId);
      if (!file) {
        // Throw to match the missing-file contract used elsewhere in the
        // storage API (batchDelete throws STORAGE_FILE_NOT_FOUND for the
        // same condition); the prior null-return was the storage-bug-8
        // inconsistency.
        throw new StorageFileNotFoundError(fileId);
      }

      const activeProvider = host.config.active_provider || 'local';
      const provider = host.config.providers?.[activeProvider];

      if (!provider) {
        throw new Error(`Active provider '${activeProvider}' not found`);
      }

      switch (provider.type) {
        case 'local':
          return this.downloadStreamFromLocal(file, options);
        case 's3':
          return this.downloadStreamFromS3(file, provider, options);
        case 'azure':
          return this.downloadStreamFromAzure(file, provider, options);
        default:
          throw new Error(`Unsupported provider type: ${provider.type}`);
      }
    } catch (error) {
      // StorageFileNotFoundError is the explicit "not found" signal; let it
      // bubble. Other unexpected errors keep the existing null-return
      // fallback so cosmetic stream failures don't crash callers.
      if (error instanceof StorageFileNotFoundError) {
        throw error;
      }
      host.logger.error('Stream download failed:', error);
      return null;
    }
  }

  /**
   * Upload stream to local storage
   *
   * Uses node:stream/promises.pipeline so source-stream errors (synchronous
   * emit('error') in read(), or process.nextTick emits) propagate through
   * the pipeline rejection — the prior implementation only attached 'error'
   * to the writeStream (the .pipe() return), leaving source errors as
   * unhandled exceptions that hung the upload promise.
   */
  private async uploadStreamToLocal(
    stream: Readable,
    relativePath: string
  ): Promise<string> {
    const host = this.deps.host;
    const fullPath = path.join(getLocalStoragePath(host), relativePath);

    // Ensure directory exists
    await fs.ensureDir(path.dirname(fullPath));

    const writeStream = fs.createWriteStream(fullPath);
    await streamPipeline(stream, writeStream);
    return fullPath;
  }

  /**
   * Upload stream to S3
   */
  private async uploadStreamToS3(
    stream: Readable,
    relativePath: string,
    provider: any,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    const host = this.deps.host;
    if (!host.s3Client) {
      throw new Error('S3 client not initialized');
    }

    const key = provider.prefix
      ? `${provider.prefix}/${relativePath}`
      : relativePath;

    const command = new PutObjectCommand({
      Bucket: provider.bucket,
      Key: key,
      Body: stream as any, // AWS SDK accepts streams
      ContentType: contentType,
      Metadata: {
        originalName: path.basename(relativePath),
        uploadedAt: new Date().toISOString(),
        ...metadata,
      },
    });

    await host.s3Client.send(command);

    return `s3://${provider.bucket}/${key}`;
  }

  /**
   * Upload stream to Azure Blob Storage
   */
  private async uploadStreamToAzure(
    stream: Readable,
    relativePath: string,
    provider: any,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    const host = this.deps.host;
    if (!host.azureContainerClient) {
      throw new Error('Azure container client not initialized');
    }

    const blobName = provider.prefix
      ? `${provider.prefix}/${relativePath}`
      : relativePath;
    const blockBlobClient =
      host.azureContainerClient.getBlockBlobClient(blobName);

    // Azure SDK supports uploadStream
    await blockBlobClient.uploadStream(stream as any, undefined, undefined, {
      blobHTTPHeaders: {
        blobContentType: contentType,
      },
      metadata: {
        originalName: path.basename(relativePath),
        uploadedAt: new Date().toISOString(),
        ...metadata,
      },
      tier: provider.options?.access_tier || 'Hot',
    });

    return `azure://${provider.account_name}/${provider.container_name}/${blobName}`;
  }

  /**
   * Download stream from local storage (with range support)
   */
  private async downloadStreamFromLocal(
    file: StorageFile,
    options?: StreamDownloadOptions
  ): Promise<Readable> {
    const readStream = fs.createReadStream(file.provider_path, {
      start: options?.start,
      end: options?.end,
    });

    return readStream;
  }

  /**
   * Download stream from S3 (with range support)
   */
  private async downloadStreamFromS3(
    file: StorageFile,
    provider: any,
    options?: StreamDownloadOptions
  ): Promise<Readable> {
    const host = this.deps.host;
    if (!host.s3Client) {
      throw new Error('S3 client not initialized');
    }

    // Extract key from provider_path (s3://bucket/key)
    const key = file.provider_path.replace(`s3://${provider.bucket}/`, '');

    const command = new GetObjectCommand({
      Bucket: provider.bucket,
      Key: key,
      Range:
        options?.start !== undefined || options?.end !== undefined
          ? `bytes=${options.start || 0}-${options.end || ''}`
          : undefined,
    });

    const response = await host.s3Client.send(command);

    if (!response.Body) {
      throw new Error('Empty response body from S3');
    }

    // Convert AWS SDK stream to Node.js Readable
    return response.Body as Readable;
  }

  /**
   * Download stream from Azure (with range support)
   */
  private async downloadStreamFromAzure(
    file: StorageFile,
    provider: any,
    options?: StreamDownloadOptions
  ): Promise<Readable> {
    const host = this.deps.host;
    if (!host.azureContainerClient) {
      throw new Error('Azure container client not initialized');
    }

    // Extract blob name from provider_path
    const blobName = file.provider_path.replace(
      `azure://${provider.account_name}/${provider.container_name}/`,
      ''
    );

    const blockBlobClient =
      host.azureContainerClient.getBlockBlobClient(blobName);

    const downloadResponse = await blockBlobClient.download(
      options?.start,
      options?.end !== undefined
        ? options.end - (options.start || 0) + 1
        : undefined
    );

    if (!downloadResponse.readableStreamBody) {
      throw new Error('Empty response body from Azure');
    }

    // Convert Azure stream to Node.js Readable
    return downloadResponse.readableStreamBody as Readable;
  }
}
