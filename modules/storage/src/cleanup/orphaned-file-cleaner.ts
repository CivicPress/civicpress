/**
 * Orphaned File Cleaner
 *
 * Identifies and cleans up orphaned files (in storage but not in DB, or vice versa)
 */

import { Logger } from '@civicpress/core';
import { OrphanedFileError } from '../errors/storage-errors.js';
import type { StorageFile } from '../types/storage.types.js';
import fs from 'fs-extra';
import path from 'path';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

export interface OrphanedFile {
  id?: string; // Database ID if exists
  path: string; // Storage path
  type: 'in_storage' | 'in_database' | 'mismatched';
  size?: number;
  provider: string;
}

export interface CleanupResult {
  scanned: number;
  orphaned: OrphanedFile[];
  cleaned: number;
  errors: Array<{ file: string; error: string }>;
}

/**
 * Orphaned file cleaner
 */
export class OrphanedFileCleaner {
  private logger: Logger;
  private databaseService: any;
  private s3Client: S3Client | null = null;
  private azureContainerClient: ContainerClient | null = null;
  private config: any;

  constructor(
    databaseService: any,
    config: any,
    s3Client?: S3Client | null,
    azureContainerClient?: ContainerClient | null,
    logger?: Logger
  ) {
    this.logger = logger || new Logger();
    this.databaseService = databaseService;
    this.config = config;
    this.s3Client = s3Client || null;
    this.azureContainerClient = azureContainerClient || null;
  }

  /**
   * Find orphaned files
   */
  async findOrphanedFiles(provider: string): Promise<OrphanedFile[]> {
    const orphaned: OrphanedFile[] = [];

    // Get all files from database
    const dbFiles = await this.databaseService.getAllStorageFiles();
    const dbFileMap = new Map<string, StorageFile>();
    for (const file of dbFiles) {
      dbFileMap.set(file.id, file);
    }

    // Get all files from storage provider
    const storageFiles = await this.listStorageFiles(provider);
    const storageFileMap = new Map<string, { path: string; size?: number }>();
    for (const file of storageFiles) {
      storageFileMap.set(file.path, { path: file.path, size: file.size });
    }

    // Find files in storage but not in database
    for (const [storagePath, fileInfo] of storageFileMap.entries()) {
      const dbFile = Array.from(dbFileMap.values()).find(
        (f) => f.provider_path === storagePath
      );

      if (!dbFile) {
        orphaned.push({
          path: storagePath,
          type: 'in_storage',
          size: fileInfo.size,
          provider,
        });
      } else {
        // Check for mismatched paths
        if (dbFile.provider_path !== storagePath) {
          orphaned.push({
            id: dbFile.id,
            path: storagePath,
            type: 'mismatched',
            size: fileInfo.size,
            provider,
          });
        }
      }
    }

    // Find files in database but not in storage
    for (const [fileId, dbFile] of dbFileMap.entries()) {
      const storageFile = storageFileMap.get(dbFile.provider_path);
      if (!storageFile) {
        orphaned.push({
          id: fileId,
          path: dbFile.provider_path,
          type: 'in_database',
          size: dbFile.size,
          provider,
        });
      }
    }

    return orphaned;
  }

  /**
   * Clean up orphaned files
   */
  async cleanupOrphanedFiles(
    orphaned: OrphanedFile[],
    dryRun: boolean = false
  ): Promise<CleanupResult> {
    const result: CleanupResult = {
      scanned: orphaned.length,
      orphaned,
      cleaned: 0,
      errors: [],
    };

    for (const file of orphaned) {
      try {
        if (dryRun) {
          this.logger.info(
            `[DRY RUN] Would clean up orphaned file: ${file.path}`,
            {
              type: file.type,
              id: file.id,
            }
          );
          result.cleaned++;
          continue;
        }

        // Delete from storage if file exists in storage
        if (file.type === 'in_storage' || file.type === 'mismatched') {
          await this.deleteFromStorage(file.path, file.provider);
        }

        // Delete from database if file exists in database
        if (file.type === 'in_database' || file.type === 'mismatched') {
          if (file.id) {
            await this.databaseService.deleteStorageFile(file.id);
          }
        }

        result.cleaned++;
        this.logger.info(`Cleaned up orphaned file: ${file.path}`, {
          type: file.type,
          id: file.id,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result.errors.push({
          file: file.path,
          error: errorMessage,
        });
        this.logger.error(
          `Failed to clean up orphaned file ${file.path}:`,
          error
        );
      }
    }

    return result;
  }

  /**
   * List all files in storage provider
   */
  private async listStorageFiles(
    provider: string
  ): Promise<Array<{ path: string; size?: number }>> {
    const providerConfig = this.config.providers?.[provider];
    if (!providerConfig) {
      throw new Error(`Provider '${provider}' not found`);
    }

    switch (providerConfig.type) {
      case 'local':
        return await this.listLocalFiles(providerConfig);
      case 's3':
        return await this.listS3Files(providerConfig);
      case 'azure':
        return await this.listAzureFiles(providerConfig);
      default:
        throw new Error(`Unsupported provider type: ${providerConfig.type}`);
    }
  }

  /**
   * List files in local storage
   */
  private async listLocalFiles(
    provider: any
  ): Promise<Array<{ path: string; size?: number }>> {
    const storagePath = provider.path || 'storage';
    const resolvedPath = path.isAbsolute(storagePath)
      ? storagePath
      : path.resolve('.system-data', storagePath);

    const files: Array<{ path: string; size?: number }> = [];

    const scanDirectory = async (dir: string, basePath: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(basePath, fullPath);

        if (entry.isDirectory()) {
          await scanDirectory(fullPath, basePath);
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          files.push({
            path: fullPath,
            size: stats.size,
          });
        }
      }
    };

    if (await fs.pathExists(resolvedPath)) {
      await scanDirectory(resolvedPath, resolvedPath);
    }

    return files;
  }

  /**
   * List files in S3
   */
  private async listS3Files(
    provider: any
  ): Promise<Array<{ path: string; size?: number }>> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    const files: Array<{ path: string; size?: number }> = [];
    const prefix = provider.prefix || '';
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: provider.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await this.s3Client.send(command);

      if (response.Contents) {
        for (const object of response.Contents) {
          if (object.Key) {
            files.push({
              path: `s3://${provider.bucket}/${object.Key}`,
              size: object.Size,
            });
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return files;
  }

  /**
   * List files in Azure Blob Storage
   */
  private async listAzureFiles(
    provider: any
  ): Promise<Array<{ path: string; size?: number }>> {
    if (!this.azureContainerClient) {
      throw new Error('Azure container client not initialized');
    }

    const files: Array<{ path: string; size?: number }> = [];
    const prefix = provider.prefix || '';

    let iterator = this.azureContainerClient.listBlobsFlat({ prefix });
    for await (const blob of iterator) {
      files.push({
        path: `azure://${provider.account_name}/${provider.container_name}/${blob.name}`,
        size: blob.properties.contentLength,
      });
    }

    return files;
  }

  /**
   * Delete file from storage
   */
  private async deleteFromStorage(
    filePath: string,
    provider: string
  ): Promise<void> {
    const providerConfig = this.config.providers?.[provider];
    if (!providerConfig) {
      throw new Error(`Provider '${provider}' not found`);
    }

    switch (providerConfig.type) {
      case 'local':
        await fs.remove(filePath);
        break;
      case 's3':
        await this.deleteFromS3(filePath, providerConfig);
        break;
      case 'azure':
        await this.deleteFromAzure(filePath, providerConfig);
        break;
      default:
        throw new Error(`Unsupported provider type: ${providerConfig.type}`);
    }
  }

  /**
   * Delete file from S3
   */
  private async deleteFromS3(filePath: string, provider: any): Promise<void> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    // Extract key from path (s3://bucket/key)
    const key = filePath.replace(`s3://${provider.bucket}/`, '');

    const command = new DeleteObjectCommand({
      Bucket: provider.bucket,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  /**
   * Delete file from Azure Blob Storage
   */
  private async deleteFromAzure(
    filePath: string,
    provider: any
  ): Promise<void> {
    if (!this.azureContainerClient) {
      throw new Error('Azure container client not initialized');
    }

    // Extract blob name from path (azure://account/container/blobname)
    const blobName = filePath.replace(
      `azure://${provider.account_name}/${provider.container_name}/`,
      ''
    );

    const blockBlobClient =
      this.azureContainerClient.getBlockBlobClient(blobName);
    await blockBlobClient.deleteIfExists();
  }
}
