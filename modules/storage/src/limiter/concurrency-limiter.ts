/**
 * Concurrency Limiter
 *
 * Semaphore-based concurrency control for storage operations
 */

import pLimit from 'p-limit';
import { Logger } from '@civicpress/core';

export interface ConcurrencyLimits {
  uploads?: number;
  downloads?: number;
  deletes?: number;
}

/**
 * Manages concurrent operation limits using semaphores
 */
export class ConcurrencyLimiter {
  private uploadLimiter: ReturnType<typeof pLimit>;
  private downloadLimiter: ReturnType<typeof pLimit>;
  private deleteLimiter: ReturnType<typeof pLimit>;
  private logger: Logger;

  constructor(limits: ConcurrencyLimits = {}, logger?: Logger) {
    this.logger = logger || new Logger();

    const maxUploads = limits.uploads || 5;
    const maxDownloads = limits.downloads || 10;
    const maxDeletes = limits.deletes || 10;

    this.uploadLimiter = pLimit(maxUploads);
    this.downloadLimiter = pLimit(maxDownloads);
    this.deleteLimiter = pLimit(maxDeletes);

    this.logger.debug('Concurrency limiter initialized', {
      maxUploads,
      maxDownloads,
      maxDeletes,
    });
  }

  /**
   * Execute upload operation with concurrency limit
   */
  async limitUpload<T>(operation: () => Promise<T>): Promise<T> {
    return this.uploadLimiter(async () => {
      this.logger.debug('Upload operation queued/executed');
      return await operation();
    });
  }

  /**
   * Execute download operation with concurrency limit
   */
  async limitDownload<T>(operation: () => Promise<T>): Promise<T> {
    return this.downloadLimiter(async () => {
      this.logger.debug('Download operation queued/executed');
      return await operation();
    });
  }

  /**
   * Execute delete operation with concurrency limit
   */
  async limitDelete<T>(operation: () => Promise<T>): Promise<T> {
    return this.deleteLimiter(async () => {
      this.logger.debug('Delete operation queued/executed');
      return await operation();
    });
  }

  /**
   * Get current active counts
   */
  getActiveCounts(): { uploads: number; downloads: number; deletes: number } {
    return {
      uploads: this.uploadLimiter.activeCount,
      downloads: this.downloadLimiter.activeCount,
      deletes: this.deleteLimiter.activeCount,
    };
  }

  /**
   * Get pending counts
   */
  getPendingCounts(): { uploads: number; downloads: number; deletes: number } {
    return {
      uploads: this.uploadLimiter.pendingCount,
      downloads: this.downloadLimiter.pendingCount,
      deletes: this.deleteLimiter.pendingCount,
    };
  }

  /**
   * Clear all pending operations (use with caution)
   */
  clearPending(): void {
    // Note: p-limit doesn't have a built-in clear method
    // This would require replacing the limiters, which is not ideal
    // For now, we'll just log that this is called
    this.logger.warn(
      'clearPending() called - not implemented (would require recreating limiters)'
    );
  }
}
