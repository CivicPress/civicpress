/**
 * Download/read operations collaborator for CloudUuidStorageService.
 *
 * Phase 2d W2-T18: moved verbatim from the prior monolith. Owns
 * `getFileById`, `getFileContent`, `listFiles` plus the per-provider
 * `getFileContentFromLocal/S3/Azure/GCS` helpers.
 */

import fs from 'fs-extra';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { StorageFile , StorageProvider, StorageDatabaseService } from '../types/storage.types.js';
import {
  withTimeout,
  getTimeoutForOperation,
} from '../utils/timeout.js';
import { dbRecordToStorageFile } from './internals.js';
import type { CloudUuidStorageService } from '../cloud-uuid-storage-service.js';

export interface DownloadOpsDeps {
  host: CloudUuidStorageService;
}

export class DownloadOps {
  constructor(private readonly deps: DownloadOpsDeps) {}

  /**
   * Get file by UUID
   */
  async getFileById(id: string): Promise<StorageFile | null> {
    const host = this.deps.host;
    try {
      if (!host.databaseService) {
        throw new Error('Database service not initialized');
      }

      const fileRecord = await host.databaseService.getStorageFileById(id);
      if (!fileRecord) {
        return null;
      }

      return dbRecordToStorageFile(fileRecord);
    } catch (error) {
      host.logger.error('Failed to get file by ID:', error);
      return null;
    }
  }

  /**
   * Get file content by UUID
   */
  async getFileContent(id: string): Promise<Buffer | null> {
    const host = this.deps.host;
    const startTime = Date.now();
    let error: string | undefined;
    let success = false;
    let provider: string = host.config.active_provider || 'local';

    try {
      const file = await this.getFileById(id);
      if (!file) {
        return null;
      }

      // Download with failover support
      const downloadOperation = async (
        providerName: string
      ): Promise<Buffer | null> => {
        const provider = host.config.providers?.[providerName];
        if (!provider) {
          throw new Error(`Provider '${providerName}' not found`);
        }

        const executeDownload = async () => {
          switch (provider.type) {
            case 'local':
              return await this.getFileContentFromLocal(file);
            case 's3':
              return await this.getFileContentFromS3(file, provider);
            case 'azure':
              return await this.getFileContentFromAzure(file, provider);
            case 'gcs':
              return await this.getFileContentFromGCS(file, provider);
            default:
              throw new Error(`Unsupported provider type: ${provider.type}`);
          }
        };

        // Apply timeout
        const timeout = getTimeoutForOperation('download', host.timeoutConfig);
        const executeWithTimeout = () =>
          withTimeout(executeDownload, timeout, 'download');

        // Apply circuit breaker if configured
        if (host.circuitBreakerManager) {
          const breaker = host.circuitBreakerManager.getBreaker(providerName);
          return breaker.execute(executeWithTimeout);
        }

        return executeWithTimeout();
      };

      let result: Buffer | null;
      if (host.failoverManager) {
        result = await host.failoverManager.executeWithFailover(
          downloadOperation,
          'download'
        );
      } else {
        // No failover - use active provider
        const activeProvider = host.config.active_provider || 'local';
        provider = activeProvider;
        result = await downloadOperation(activeProvider);
      }

      success = result !== null;
      const fileSize = result?.length || 0;

      // Record metrics
      if (host.metricsCollector) {
        const latency = Date.now() - startTime;
        host.metricsCollector.recordDownload(
          success,
          fileSize,
          latency,
          provider
        );
      }

      return result;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      host.logger.error('Failed to get file content:', err);

      // Record metrics
      if (host.metricsCollector) {
        const latency = Date.now() - startTime;
        const errorCode =
          err instanceof Error && (err as Error & { code?: string }).code
            ? (err as Error & { code?: string }).code
            : 'UNKNOWN_ERROR';
        host.metricsCollector.recordDownload(
          false,
          0,
          latency,
          provider,
          errorCode
        );
      }

      return null;
    }
  }

  /**
   * Get file content from local storage
   */
  private async getFileContentFromLocal(
    file: StorageFile
  ): Promise<Buffer | null> {
    const host = this.deps.host;
    if (!(await fs.pathExists(file.provider_path))) {
      host.logger.error(`File not found on disk: ${file.provider_path}`);
      return null;
    }

    return await fs.readFile(file.provider_path);
  }

  /**
   * Get file content from S3
   */
  private async getFileContentFromS3(
    file: StorageFile,
    provider: StorageProvider
  ): Promise<Buffer | null> {
    const host = this.deps.host;
    if (!host.s3Client) {
      throw new Error('S3 client not initialized');
    }

    // Extract key from provider_path (s3://bucket/key)
    const key = file.provider_path.replace(`s3://${provider.bucket}/`, '');

    const downloadOperation = async () => {
      const command = new GetObjectCommand({
        Bucket: provider.bucket,
        Key: key,
      });

      const response = await host.s3Client!.send(command);

      if (!response.Body) {
        return null;
      }

      // Convert stream to buffer (AWS SDK v3)
      const chunks: Uint8Array[] = [];

      if (response.Body) {
        // Use the streamToUint8Array helper or handle the readable stream
        const stream = response.Body as any;

        if (typeof stream.transformToByteArray === 'function') {
          // Use AWS SDK's built-in method if available
          const byteArray = await stream.transformToByteArray();
          return Buffer.from(byteArray);
        } else {
          // Handle as a readable stream
          for await (const chunk of stream) {
            chunks.push(chunk);
          }
          return Buffer.concat(chunks);
        }
      }

      return Buffer.alloc(0);
    };

    // Apply retry logic if retry manager is configured
    if (host.retryManager) {
      return host.retryManager.withRetry(downloadOperation);
    }

    return downloadOperation();
  }

  /**
   * Get file content from Azure Blob Storage
   */
  private async getFileContentFromAzure(
    file: StorageFile,
    provider: StorageProvider
  ): Promise<Buffer | null> {
    const host = this.deps.host;
    if (!host.azureContainerClient) {
      throw new Error('Azure container client not initialized');
    }

    // Extract blob name from provider_path (azure://account/container/blobname)
    const blobName = file.provider_path.replace(
      `azure://${provider.account_name}/${provider.container_name}/`,
      ''
    );

    const downloadOperation = async () => {
      const blockBlobClient =
        host.azureContainerClient!.getBlockBlobClient(blobName);

      const downloadResponse = await blockBlobClient.download();

      if (!downloadResponse.readableStreamBody) {
        return null;
      }

      // Convert stream to buffer
      const chunks: Buffer[] = [];

      for await (const chunk of downloadResponse.readableStreamBody) {
        if (chunk instanceof Buffer) {
          chunks.push(chunk);
        } else if (typeof chunk === 'string') {
          chunks.push(Buffer.from(chunk));
        } else {
          chunks.push(Buffer.from(chunk as Uint8Array));
        }
      }

      return Buffer.concat(chunks);
    };

    // Apply retry logic if retry manager is configured
    if (host.retryManager) {
      return host.retryManager.withRetry(downloadOperation);
    }

    try {
      return await downloadOperation();
    } catch (error) {
      host.logger.error('Failed to download from Azure:', error);
      return null;
    }
  }

  /**
   * Get file content from Google Cloud Storage
   */
  private async getFileContentFromGCS(
    file: StorageFile,
    provider: StorageProvider
  ): Promise<Buffer | null> {
    const host = this.deps.host;
    if (!host.gcsBucket) {
      throw new Error('GCS bucket not initialized');
    }

    // Extract file name from provider_path (gs://bucket/filename)
    const fileName = file.provider_path.replace(`gs://${provider.bucket}/`, '');

    const downloadOperation = async () => {
      const gcsFile = host.gcsBucket!.file(fileName);

      // Check if file exists
      const [exists] = await gcsFile.exists();
      if (!exists) {
        return null;
      }

      // Download file content
      const [buffer] = await gcsFile.download();
      return Buffer.from(buffer);
    };

    // Apply retry logic if retry manager is configured
    if (host.retryManager) {
      return host.retryManager.withRetry(downloadOperation);
    }

    try {
      return await downloadOperation();
    } catch (error) {
      host.logger.error('Failed to download from GCS:', error);
      return null;
    }
  }

  /**
   * List files in a folder
   */
  async listFiles(folderName: string): Promise<StorageFile[]> {
    const host = this.deps.host;
    const startTime = Date.now();
    let provider: string | undefined;
    let success = false;
    let error: string | undefined;

    try {
      const listOperation = async () => {
        // Check cache first (if enabled)
        if (host.cacheAdapter) {
          const cached = await host.cacheAdapter.getCachedFiles(folderName);
          if (cached !== null) {
            return cached;
          }
        }

        // Cache miss or no cache - query database
        if (!host.databaseService) {
          throw new Error('Database service not initialized');
        }

        const fileRecords =
          await host.databaseService.getStorageFilesByFolder(folderName);
        const files = fileRecords.map((record: any) =>
          dbRecordToStorageFile(record)
        );

        // Cache the result (if cache enabled)
        if (host.cacheAdapter) {
          await host.cacheAdapter.setCachedFiles(folderName, files);
        }

        return files;
      };

      // Apply timeout
      const timeout = getTimeoutForOperation('list', host.timeoutConfig);
      const result = await withTimeout(listOperation, timeout, 'list');

      success = true;
      const activeProvider = host.config.active_provider || 'local';
      provider = activeProvider;

      // Record metrics
      if (host.metricsCollector) {
        const latency = Date.now() - startTime;
        host.metricsCollector.recordList(success, latency, provider);
      }

      return result;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      host.logger.error('Failed to list files:', err);

      // Record metrics
      if (host.metricsCollector) {
        const latency = Date.now() - startTime;
        const activeProvider = host.config.active_provider || 'local';
        provider = activeProvider;
        const errorCode =
          err instanceof Error && (err as Error & { code?: string }).code
            ? (err as Error & { code?: string }).code
            : 'UNKNOWN_ERROR';
        host.metricsCollector.recordList(false, latency, provider, errorCode);
      }

      return [];
    }
  }
}
