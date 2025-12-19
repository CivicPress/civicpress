/**
 * Storage Metadata Cache Adapter
 *
 * Adapter for storage metadata caching using the Unified Caching Layer.
 * Wraps UnifiedCacheManager cache with folder-specific operations.
 */

import type { ICacheStrategy, UnifiedCacheManager } from '@civicpress/core';
import type { StorageFile } from '../types/storage.types.js';
import { Logger } from '@civicpress/core';

/**
 * Adapter for storage metadata caching
 * Wraps UnifiedCacheManager cache with folder-specific operations
 */
export class StorageMetadataCacheAdapter {
  private cache: ICacheStrategy<StorageFile[]> | null;
  private cacheManager: UnifiedCacheManager;
  private logger: Logger;

  constructor(cacheManager: UnifiedCacheManager, logger?: Logger) {
    this.logger = logger || new Logger();
    this.cacheManager = cacheManager;
    // Cache may not be registered yet - will be lazy-loaded
    this.cache = cacheManager.hasCache('storageMetadata')
      ? cacheManager.getCache<StorageFile[]>('storageMetadata')
      : null;
  }

  /**
   * Get cache instance, ensuring it's available
   */
  private getCache(): ICacheStrategy<StorageFile[]> | null {
    if (!this.cache && this.cacheManager.hasCache('storageMetadata')) {
      this.cache = this.cacheManager.getCache<StorageFile[]>('storageMetadata');
    }
    return this.cache;
  }

  /**
   * Generate cache key for folder
   */
  private getCacheKey(folder: string): string {
    return `folder:${folder}`;
  }

  /**
   * Get cached files for folder
   */
  async getCachedFiles(folder: string): Promise<StorageFile[] | null> {
    const cache = this.getCache();
    if (!cache) {
      return null; // Cache not available yet
    }

    try {
      const key = this.getCacheKey(folder);
      const cached = await cache.get(key);

      if (cached !== null) {
        this.logger.debug(`Cache hit for folder: ${folder}`);
      } else {
        this.logger.debug(`Cache miss for folder: ${folder}`);
      }

      return cached;
    } catch (error) {
      this.logger.error(
        `Error getting cached files for folder ${folder}:`,
        error
      );
      return null; // Return null on error to allow fallback to database
    }
  }

  /**
   * Cache files for folder
   */
  async setCachedFiles(
    folder: string,
    files: StorageFile[],
    ttl?: number
  ): Promise<void> {
    const cache = this.getCache();
    if (!cache) {
      return; // Cache not available yet
    }

    try {
      const key = this.getCacheKey(folder);
      await cache.set(key, files, ttl ? { ttl } : undefined);
      this.logger.debug(`Cached ${files.length} files for folder: ${folder}`);
    } catch (error) {
      this.logger.error(`Error caching files for folder ${folder}:`, error);
      // Don't throw - caching is non-critical
    }
  }

  /**
   * Invalidate cache for folder
   */
  async invalidateFolder(folder: string): Promise<void> {
    const cache = this.getCache();
    if (!cache) {
      return; // Cache not available yet
    }

    try {
      const key = this.getCacheKey(folder);
      await cache.delete(key);
      this.logger.debug(`Invalidated cache for folder: ${folder}`);
    } catch (error) {
      this.logger.error(
        `Error invalidating cache for folder ${folder}:`,
        error
      );
      // Don't throw - cache invalidation is non-critical
    }
  }

  /**
   * Invalidate cache for specific file (invalidates parent folder)
   */
  async invalidateFile(fileId: string, folder: string): Promise<void> {
    // Invalidate the entire folder since we cache folder lists
    await this.invalidateFolder(folder);
  }

  /**
   * Invalidate all storage caches (for testing/debugging)
   */
  async invalidateAll(): Promise<void> {
    const cache = this.getCache();
    if (!cache) {
      return; // Cache not available yet
    }

    try {
      await cache.invalidate(/^folder:/);
      this.logger.debug('Invalidated all storage caches');
    } catch (error) {
      this.logger.error('Error invalidating all storage caches:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    const cache = this.getCache();
    if (!cache) {
      return null; // Cache not available yet
    }
    return await cache.getStats();
  }
}
