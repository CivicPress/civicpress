/**
 * Download/read operations collaborator for CloudUuidStorageService.
 *
 * Phase 2d W2-T18: moved verbatim from the prior monolith. Owns
 * `getFileById`, `getFileContent`, `listFiles` plus the per-provider
 * `getFileContentFromLocal/S3/Azure/GCS` helpers.
 */

import fs from 'fs-extra';
import { loadAwsS3Sdk } from './sdk-loader.js';
import type { StorageFile, StorageProvider } from '../types/storage.types.js';
import { withTimeout, getTimeoutForOperation } from '../utils/timeout.js';
import { dbRecordToStorageFile } from './internals.js';
import { StorageFileNotFoundError } from '../errors/storage-errors.js';
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

    try {
      const file = await this.getFileById(id);
      if (!file) {
        return null;
      }

      // Per-provider download, wrapped in the provider's circuit breaker.
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

        // Apply circuit breaker if configured. A 404 (object absent on this
        // provider) is NOT a provider fault — exempt it so repeated
        // missing-object reads don't trip the breaker OPEN against a healthy
        // provider.
        const isNotFound = (err: unknown) =>
          err instanceof StorageFileNotFoundError ||
          (err as { statusCode?: number })?.statusCode === 404;
        if (host.circuitBreakerManager) {
          const breaker = host.circuitBreakerManager.getBreaker(providerName);
          return breaker.execute(executeWithTimeout, isNotFound);
        }

        return executeWithTimeout();
      };

      // Download via the configured active provider (each provider call is
      // wrapped in its circuit breaker inside downloadOperation).
      const result = await downloadOperation(
        host.config.active_provider || 'local'
      );

      return result;
    } catch (err) {
      host.logger.error('Failed to get file content:', err);

      return null;
    }
  }

  /**
   * Get file content from local storage
   */
  private async getFileContentFromLocal(
    file: StorageFile
  ): Promise<Buffer | null> {
    if (!(await fs.pathExists(file.provider_path))) {
      // Absent on this provider — throw (not return null) so a genuine
      // not-found stays distinguishable from a real read fault. The circuit
      // breaker exempts StorageFileNotFoundError (see isNotFound in
      // getFileContent), so repeated missing-object reads don't trip it OPEN.
      throw new StorageFileNotFoundError(file.id, {
        folder: file.folder,
        provider: 'local',
        path: file.provider_path,
      });
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
      const { GetObjectCommand } = await loadAwsS3Sdk();
      const command = new GetObjectCommand({
        Bucket: provider.bucket,
        Key: key,
      });

      const response = await host.s3Client!.send(command);

      if (!response.Body) {
        // Absent/empty on S3 — throw (not null) so a real not-found stays
        // distinguishable from a read fault (see local).
        throw new StorageFileNotFoundError(file.id, {
          folder: file.folder,
          provider: 's3',
          path: file.provider_path,
        });
      }

      // Convert stream to buffer (AWS SDK v3)
      const chunks: Uint8Array[] = [];

      if (response.Body) {
        // AWS SDK v3 `Body` is a `SdkStream` union of Readable / ReadableStream /
        // Blob with an SDK-added `transformToByteArray` helper. Narrow to the
        // subset we use so we don't drag in the full SDK union type.
        const stream = response.Body as AsyncIterable<Uint8Array> & {
          transformToByteArray?: () => Promise<Uint8Array>;
        };

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
        // Empty body ~ absent on Azure — throw (not null) so a real not-found
        // stays distinguishable, consistent with local/S3/GCS.
        throw new StorageFileNotFoundError(file.id, {
          folder: file.folder,
          provider: 'azure',
          path: file.provider_path,
        });
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

    // Let errors propagate to getFileContent's top-level catch — swallowing to
    // null here would hide a real read fault (the provider-absence bug).
    return await downloadOperation();
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
        // Absent on GCS — throw (not null) so a real not-found stays
        // distinguishable from a read fault (see local).
        throw new StorageFileNotFoundError(file.id, {
          folder: file.folder,
          provider: 'gcs',
          path: file.provider_path,
        });
      }

      // Download file content
      const [buffer] = await gcsFile.download();
      return Buffer.from(buffer);
    };

    // Let errors propagate (see Azure) — swallowing to null would hide a real
    // read fault.
    return await downloadOperation();
  }

  /**
   * List files in a folder
   */
  async listFiles(folderName: string): Promise<StorageFile[]> {
    const host = this.deps.host;

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
        const files = fileRecords.map((record) =>
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

      return result;
    } catch (err) {
      host.logger.error('Failed to list files:', err);

      return [];
    }
  }
}
