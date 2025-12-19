/**
 * Quota Manager
 *
 * Manages storage quotas and enforces limits
 */

import { Logger } from '@civicpress/core';
import { QuotaExceededError } from '../errors/storage-errors.js';
import { StorageUsageReporter } from '../reporting/storage-usage-reporter.js';

export interface QuotaConfig {
  enabled: boolean;
  global?: {
    limit: number; // bytes, 0 = unlimited
    limitFormatted: string;
  };
  folders: Record<
    string,
    {
      limit: number; // bytes, 0 = unlimited
      limitFormatted: string;
    }
  >;
}

/**
 * Quota manager for storage operations
 */
export class QuotaManager {
  private logger: Logger;
  private usageReporter: StorageUsageReporter;
  private config: QuotaConfig;

  constructor(
    usageReporter: StorageUsageReporter,
    config: Partial<QuotaConfig> = {},
    logger?: Logger
  ) {
    this.logger = logger || new Logger();
    this.usageReporter = usageReporter;
    this.config = {
      enabled: config.enabled !== false, // Default to enabled
      global: config.global,
      folders: config.folders || {},
    };
  }

  /**
   * Check if quota is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check quota before upload
   */
  async checkQuota(
    folder: string,
    fileSize: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    // Check global quota first
    if (this.config.global && this.config.global.limit > 0) {
      const overallUsage = await this.usageReporter.getOverallUsage();
      const currentGlobalUsage = overallUsage.total.size;
      const newGlobalUsage = currentGlobalUsage + fileSize;

      if (newGlobalUsage > this.config.global.limit) {
        const available = this.config.global.limit - currentGlobalUsage;
        throw new QuotaExceededError(
          {
            used: currentGlobalUsage,
            limit: this.config.global.limit,
            available: Math.max(0, available),
            unit: 'bytes',
          },
          {
            folder,
            fileSize,
            provider: 'global',
          }
        );
      }
    }

    // Check folder quota
    const folderQuota = this.config.folders[folder];
    if (folderQuota && folderQuota.limit > 0) {
      const folderUsage = await this.usageReporter.getFolderUsage(folder);
      const currentFolderUsage = folderUsage?.size || 0;
      const newFolderUsage = currentFolderUsage + fileSize;

      if (newFolderUsage > folderQuota.limit) {
        const available = folderQuota.limit - currentFolderUsage;
        throw new QuotaExceededError(
          {
            used: currentFolderUsage,
            limit: folderQuota.limit,
            available: Math.max(0, available),
            unit: 'bytes',
          },
          {
            folder,
            fileSize,
            provider: folder,
          }
        );
      }
    }

    return { allowed: true };
  }

  /**
   * Get quota information for a folder
   */
  async getFolderQuota(folder: string): Promise<{
    limit: number;
    limitFormatted: string;
    used: number;
    usedFormatted: string;
    available: number;
    availableFormatted: string;
    percentage: number;
  } | null> {
    const folderQuota = this.config.folders[folder];
    if (!folderQuota || folderQuota.limit === 0) {
      return null; // No quota or unlimited
    }

    const folderUsage = await this.usageReporter.getFolderUsage(folder);
    const used = folderUsage?.size || 0;
    const available = Math.max(0, folderQuota.limit - used);
    const percentage =
      folderQuota.limit > 0 ? (used / folderQuota.limit) * 100 : 0;

    return {
      limit: folderQuota.limit,
      limitFormatted: folderQuota.limitFormatted,
      used,
      usedFormatted: this.formatBytes(used),
      available,
      availableFormatted: this.formatBytes(available),
      percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
    };
  }

  /**
   * Get global quota information
   */
  async getGlobalQuota(): Promise<{
    limit: number;
    limitFormatted: string;
    used: number;
    usedFormatted: string;
    available: number;
    availableFormatted: string;
    percentage: number;
  } | null> {
    if (!this.config.global || this.config.global.limit === 0) {
      return null; // No quota or unlimited
    }

    const overallUsage = await this.usageReporter.getOverallUsage();
    const used = overallUsage.total.size;
    const available = Math.max(0, this.config.global.limit - used);
    const percentage =
      this.config.global.limit > 0
        ? (used / this.config.global.limit) * 100
        : 0;

    return {
      limit: this.config.global.limit,
      limitFormatted: this.config.global.limitFormatted,
      used,
      usedFormatted: this.formatBytes(used),
      available,
      availableFormatted: this.formatBytes(available),
      percentage: Math.round(percentage * 100) / 100,
    };
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
   * Update quota configuration
   */
  updateConfig(config: Partial<QuotaConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      folders: config.folders || this.config.folders,
    };
    this.logger.debug('Quota configuration updated');
  }

  /**
   * Get quota configuration
   */
  getConfig(): QuotaConfig {
    return { ...this.config };
  }
}
