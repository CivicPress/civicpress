/**
 * File-management operations (delete + update metadata) collaborator for
 * CloudUuidStorageService.
 *
 * Phase 2d W2-T18: moved verbatim from the prior monolith. Owns `deleteFile`
 * (+ internal `_deleteFile`), `updateFile`, and the per-provider
 * `deleteFromLocal/S3/Azure/GCS` helpers.
 */

import fs from 'fs-extra';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { StorageFile , StorageProvider, StorageDatabaseService } from '../types/storage.types.js';
import {
  withTimeout,
  getTimeoutForOperation,
} from '../utils/timeout.js';
import { logOperation } from './internals.js';
import type { CloudUuidStorageService } from '../cloud-uuid-storage-service.js';

export interface FileMgmtOpsDeps {
  host: CloudUuidStorageService;
}

export class FileMgmtOps {
  constructor(private readonly deps: FileMgmtOpsDeps) {}

  /**
   * Delete file by UUID
   */
  async deleteFile(id: string, userId?: string): Promise<boolean> {
    const host = this.deps.host;
    // Apply concurrency limiting if configured
    if (host.concurrencyLimiter) {
      return host.concurrencyLimiter.limitDelete(() =>
        this._deleteFile(id, userId)
      );
    }
    return this._deleteFile(id, userId);
  }

  /**
   * Internal delete file implementation
   */
  private async _deleteFile(id: string, userId?: string): Promise<boolean> {
    const host = this.deps.host;
    const startTime = Date.now();
    let provider: string | undefined;
    let success = false;
    let error: string | undefined;

    try {
      if (!host.databaseService) {
        throw new Error('Database service not initialized');
      }

      const file = await host.getFileById(id);
      if (!file) {
        return false;
      }

      // Delete with failover support
      const deleteOperation = async (providerName: string): Promise<void> => {
        const provider = host.config.providers?.[providerName];
        if (!provider) {
          throw new Error(`Provider '${providerName}' not found`);
        }

        const executeDelete = async () => {
          switch (provider.type) {
            case 'local':
              await this.deleteFromLocal(file);
              break;
            case 's3':
              await this.deleteFromS3(file, provider);
              break;
            case 'azure':
              await this.deleteFromAzure(file, provider);
              break;
            case 'gcs':
              await this.deleteFromGCS(file, provider);
              break;
            default:
              throw new Error(`Unsupported provider type: ${provider.type}`);
          }
        };

        // Apply timeout
        const timeout = getTimeoutForOperation('delete', host.timeoutConfig);
        const executeWithTimeout = () =>
          withTimeout(executeDelete, timeout, 'delete');

        // Apply circuit breaker if configured
        if (host.circuitBreakerManager) {
          const breaker = host.circuitBreakerManager.getBreaker(providerName);
          return breaker.execute(executeWithTimeout);
        }

        return executeWithTimeout();
      };

      if (host.failoverManager) {
        await host.failoverManager.executeWithFailover(
          deleteOperation,
          'delete'
        );
      } else {
        // No failover - use active provider
        const activeProvider = host.config.active_provider || 'local';
        await deleteOperation(activeProvider);
      }

      // Delete from database
      const deleted = await host.databaseService.deleteStorageFile(id);

      // Invalidate cache for folder
      if (host.cacheAdapter && deleted) {
        await host.cacheAdapter.invalidateFolder(file.folder);
      }

      // Extract provider name for metrics
      const activeProvider = host.config.active_provider || 'local';
      provider = activeProvider;
      success = deleted;

      logOperation(host, {
        operation: 'delete',
        path: file.provider_path,
        user_id: userId,
        timestamp: new Date(),
        success: deleted,
        metadata: { file_id: id, provider },
      });

      // Record metrics
      if (host.metricsCollector) {
        const latency = Date.now() - startTime;
        host.metricsCollector.recordDelete(success, latency, provider);
      }

      return deleted;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      host.logger.error('Failed to delete file:', err);

      // Extract provider name for metrics
      const activeProvider = host.config.active_provider || 'local';
      provider = activeProvider;

      logOperation(host, {
        operation: 'delete',
        path: `file:${id}`,
        user_id: userId,
        timestamp: new Date(),
        success: false,
        error,
      });

      // Record metrics
      if (host.metricsCollector) {
        const latency = Date.now() - startTime;
        const errorCode =
          err instanceof Error && (err as Error & { code?: string }).code
            ? (err as Error & { code?: string }).code
            : 'UNKNOWN_ERROR';
        host.metricsCollector.recordDelete(false, latency, provider, errorCode);
      }

      return false;
    }
  }

  /**
   * Delete file from local storage
   */
  private async deleteFromLocal(file: StorageFile): Promise<void> {
    if (await fs.pathExists(file.provider_path)) {
      await fs.remove(file.provider_path);
    }
  }

  /**
   * Delete file from S3
   */
  private async deleteFromS3(file: StorageFile, provider: StorageProvider): Promise<void> {
    const host = this.deps.host;
    if (!host.s3Client) {
      throw new Error('S3 client not initialized');
    }

    // Extract key from provider_path (s3://bucket/key)
    const key = file.provider_path.replace(`s3://${provider.bucket}/`, '');

    const deleteOperation = async () => {
      const command = new DeleteObjectCommand({
        Bucket: provider.bucket,
        Key: key,
      });

      await host.s3Client!.send(command);
    };

    // Apply retry logic if retry manager is configured
    if (host.retryManager) {
      return host.retryManager.withRetry(deleteOperation);
    }

    return deleteOperation();
  }

  /**
   * Delete file from Azure Blob Storage
   */
  private async deleteFromAzure(
    file: StorageFile,
    provider: StorageProvider
  ): Promise<void> {
    const host = this.deps.host;
    if (!host.azureContainerClient) {
      throw new Error('Azure container client not initialized');
    }

    // Extract blob name from provider_path (azure://account/container/blobname)
    const blobName = file.provider_path.replace(
      `azure://${provider.account_name}/${provider.container_name}/`,
      ''
    );

    const deleteOperation = async () => {
      const blockBlobClient =
        host.azureContainerClient!.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
    };

    // Apply retry logic if retry manager is configured
    if (host.retryManager) {
      return host.retryManager.withRetry(deleteOperation);
    }

    return deleteOperation();
  }

  /**
   * Delete file from Google Cloud Storage
   */
  private async deleteFromGCS(file: StorageFile, provider: StorageProvider): Promise<void> {
    const host = this.deps.host;
    if (!host.gcsBucket) {
      throw new Error('GCS bucket not initialized');
    }

    // Extract file name from provider_path (gs://bucket/filename)
    const fileName = file.provider_path.replace(`gs://${provider.bucket}/`, '');

    const deleteOperation = async () => {
      const gcsFile = host.gcsBucket!.file(fileName);
      await gcsFile.delete();
    };

    // Apply retry logic if retry manager is configured
    if (host.retryManager) {
      return host.retryManager.withRetry(deleteOperation);
    }

    return deleteOperation();
  }

  /**
   * Update file metadata
   */
  async updateFile(
    id: string,
    updates: {
      description?: string;
      updated_by?: string;
    }
  ): Promise<boolean> {
    const host = this.deps.host;
    try {
      if (!host.databaseService) {
        throw new Error('Database service not initialized');
      }

      return await host.databaseService.updateStorageFile(id, updates);
    } catch (error) {
      host.logger.error('Failed to update file:', error);
      return false;
    }
  }
}
