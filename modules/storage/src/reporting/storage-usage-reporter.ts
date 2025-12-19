/**
 * Storage Usage Reporter
 *
 * Reports storage usage statistics
 */

import { Logger } from '@civicpress/core';
import type { UnifiedCacheManager } from '@civicpress/core';

export interface StorageUsageReport {
  total: {
    files: number;
    size: number; // bytes
    sizeFormatted: string; // Human-readable format
  };
  byFolder: Record<
    string,
    {
      files: number;
      size: number;
      sizeFormatted: string;
    }
  >;
  byProvider: Record<
    string,
    {
      files: number;
      size: number;
      sizeFormatted: string;
    }
  >;
  timestamp: Date;
}

/**
 * Storage usage reporter
 */
export class StorageUsageReporter {
  private logger: Logger;
  private databaseService: any; // Will be injected
  private cache?: any; // Cache for usage reports
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  constructor(
    databaseService: any,
    cacheManager?: UnifiedCacheManager,
    logger?: Logger
  ) {
    this.logger = logger || new Logger();
    this.databaseService = databaseService;

    // Initialize cache if cache manager provided
    if (cacheManager) {
      this.cache = cacheManager.hasCache('storageMetadata')
        ? cacheManager.getCache<StorageUsageReport>('storageMetadata')
        : null;
    }
  }

  /**
   * Get overall storage usage
   */
  async getOverallUsage(): Promise<StorageUsageReport> {
    const cacheKey = 'usage:overall';

    // Check cache first
    if (this.cache) {
      try {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          this.logger.debug('Returning cached storage usage report');
          return cached;
        }
      } catch (error) {
        this.logger.debug('Cache miss or error, fetching fresh usage data');
      }
    }

    // Fetch fresh data
    const report = await this.calculateUsage();

    // Cache the result
    if (this.cache) {
      try {
        await this.cache.set(cacheKey, report, this.cacheTTL);
      } catch (error) {
        this.logger.debug('Failed to cache usage report:', error);
      }
    }

    return report;
  }

  /**
   * Get usage for a specific folder
   */
  async getFolderUsage(
    folderName: string
  ): Promise<StorageUsageReport['byFolder'][string] | null> {
    const cacheKey = `usage:folder:${folderName}`;

    // Check cache first
    if (this.cache) {
      try {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          return cached;
        }
      } catch (error) {
        // Cache miss, continue
      }
    }

    // Fetch fresh data
    if (!this.databaseService) {
      throw new Error('Database service not initialized');
    }

    const files =
      await this.databaseService.getStorageFilesByFolder(folderName);

    if (files.length === 0) {
      return null;
    }

    const folderUsage = {
      files: files.length,
      size: files.reduce((sum: number, file: any) => sum + (file.size || 0), 0),
      sizeFormatted: '',
    };

    folderUsage.sizeFormatted = this.formatBytes(folderUsage.size);

    // Cache the result
    if (this.cache) {
      try {
        await this.cache.set(cacheKey, folderUsage, this.cacheTTL);
      } catch (error) {
        // Ignore cache errors
      }
    }

    return folderUsage;
  }

  /**
   * Calculate overall usage from database
   */
  private async calculateUsage(): Promise<StorageUsageReport> {
    if (!this.databaseService) {
      throw new Error('Database service not initialized');
    }

    // Get all files from database
    const allFiles = await this.databaseService.getAllStorageFiles();

    // Calculate totals
    const total = {
      files: allFiles.length,
      size: allFiles.reduce(
        (sum: number, file: any) => sum + (file.size || 0),
        0
      ),
      sizeFormatted: '',
    };
    total.sizeFormatted = this.formatBytes(total.size);

    // Group by folder
    const byFolder: Record<
      string,
      { files: number; size: number; sizeFormatted: string }
    > = {};
    for (const file of allFiles) {
      const folder = file.folder || 'unknown';
      if (!byFolder[folder]) {
        byFolder[folder] = { files: 0, size: 0, sizeFormatted: '' };
      }
      byFolder[folder].files++;
      byFolder[folder].size += file.size || 0;
    }

    // Format folder sizes
    for (const folder of Object.keys(byFolder)) {
      byFolder[folder].sizeFormatted = this.formatBytes(byFolder[folder].size);
    }

    // Group by provider (extract from provider_path)
    const byProvider: Record<
      string,
      { files: number; size: number; sizeFormatted: string }
    > = {};
    for (const file of allFiles) {
      const provider = this.extractProviderFromPath(file.provider_path || '');
      if (!byProvider[provider]) {
        byProvider[provider] = { files: 0, size: 0, sizeFormatted: '' };
      }
      byProvider[provider].files++;
      byProvider[provider].size += file.size || 0;
    }

    // Format provider sizes
    for (const provider of Object.keys(byProvider)) {
      byProvider[provider].sizeFormatted = this.formatBytes(
        byProvider[provider].size
      );
    }

    return {
      total,
      byFolder,
      byProvider,
      timestamp: new Date(),
    };
  }

  /**
   * Extract provider name from provider_path
   */
  private extractProviderFromPath(path: string): string {
    if (path.startsWith('s3://')) {
      return 's3';
    }
    if (path.startsWith('azure://')) {
      return 'azure';
    }
    if (path.startsWith('gs://')) {
      return 'gcs';
    }
    return 'local';
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Invalidate usage cache
   */
  async invalidateCache(): Promise<void> {
    if (this.cache) {
      try {
        // Invalidate all usage-related cache keys
        await this.cache.invalidate(/^usage:/);
        this.logger.debug('Invalidated storage usage cache');
      } catch (error) {
        this.logger.debug('Failed to invalidate usage cache:', error);
      }
    }
  }
}
