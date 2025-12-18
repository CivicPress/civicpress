/**
 * Template Cache Adapter
 *
 * Adapter that wraps FileWatcherCache to maintain TemplateCache API compatibility
 */

import type { ICacheStrategy } from '../cache/types.js';
import { UnifiedCacheManager } from '../cache/unified-cache-manager.js';
import { FileWatcherCache } from '../cache/strategies/file-watcher-cache.js';
import { MemoryCache } from '../cache/strategies/memory-cache.js';
import type { CacheConfig } from '../cache/types.js';
import type { TemplateResponse, TemplateId } from './types.js';
import { Logger } from '../utils/logger.js';
import * as path from 'path';

/**
 * Template cache adapter - maintains backward compatibility with TemplateCache API
 * while using unified FileWatcherCache internally
 */
export class TemplateCacheAdapter {
  private templateCache: ICacheStrategy<TemplateResponse>;
  private listCache: ICacheStrategy<TemplateResponse[]>;
  private readonly logger: Logger;
  private readonly dataDir: string;
  private readonly enableWatching: boolean;

  constructor(
    cacheManager: UnifiedCacheManager | undefined,
    options: { dataDir: string; logger?: Logger; enableWatching?: boolean }
  ) {
    this.dataDir = options.dataDir;
    this.logger = options.logger || new Logger();
    this.enableWatching = options.enableWatching ?? true;

    if (cacheManager) {
      // Get caches from UnifiedCacheManager
      const templateCacheFromManager =
        cacheManager.getCache<TemplateResponse>('templates');
      this.templateCache = templateCacheFromManager;
      this.listCache =
        cacheManager.getCache<TemplateResponse[]>('templateLists');

      // Set up key mapper for file paths to template IDs (if FileWatcherCache)
      // Note: We need to check if it's actually a FileWatcherCache instance
      if (
        'setKeyMapper' in templateCacheFromManager &&
        typeof (templateCacheFromManager as any).setKeyMapper === 'function'
      ) {
        (templateCacheFromManager as any).setKeyMapper((filePath: string) => {
          // Convert file path to template ID
          // Example: /path/to/.civic/templates/bylaw/test.md -> bylaw/test
          const relativePath = path.relative(
            path.join(this.dataDir, '.civic', 'templates'),
            filePath
          );
          return relativePath.replace(/\.md$/, '').replace(/\\/g, '/');
        });
      }
    } else {
      // Fallback: create caches directly (for backward compatibility)
      const templateConfig: CacheConfig = {
        strategy: 'file_watcher',
        enabled: true,
        defaultTTL: 0, // Infinite (file watching handles invalidation)
        maxSize: 1000,
        watchDirectories: [
          path.join(this.dataDir, '.civic', 'templates'),
          path.join(this.dataDir, '.civic', 'partials'),
        ],
        debounceMs: 100,
        enableWatching: this.enableWatching,
      };

      const fileWatcherCache = new FileWatcherCache<TemplateResponse>(
        templateConfig,
        this.logger
      );
      this.templateCache = fileWatcherCache;

      // Set up key mapper for file paths to template IDs
      fileWatcherCache.setKeyMapper((filePath: string) => {
        const relativePath = path.relative(
          path.join(this.dataDir, '.civic', 'templates'),
          filePath
        );
        return relativePath.replace(/\.md$/, '').replace(/\\/g, '/');
      });

      // Initialize file watcher cache (async, but we can't await in constructor)
      // The cache will be initialized when first accessed or by UnifiedCacheManager
      fileWatcherCache.initialize().catch((error) => {
        this.logger.warn('Failed to initialize template file watchers', {
          error,
        });
      });

      // Create separate memory cache for list results
      const listConfig: CacheConfig = {
        strategy: 'memory',
        enabled: true,
        defaultTTL: 5 * 60 * 1000, // 5 minutes for lists
        maxSize: 100,
      };

      this.listCache = new MemoryCache<TemplateResponse[]>(
        listConfig,
        this.logger
      );
    }
  }

  /**
   * Get template from cache
   */
  async get(id: TemplateId): Promise<TemplateResponse | null> {
    return this.templateCache.get(id);
  }

  /**
   * Set template in cache
   */
  async set(id: TemplateId, template: TemplateResponse): Promise<void> {
    await this.templateCache.set(id, template);
    // Invalidate list cache
    await this.listCache.clear();
  }

  /**
   * Delete template from cache
   */
  async delete(id: TemplateId): Promise<void> {
    await this.templateCache.delete(id);
    // Invalidate list cache
    await this.listCache.clear();
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    await this.templateCache.clear();
    await this.listCache.clear();
  }

  /**
   * Get cached template list
   */
  async getList(key: string): Promise<TemplateResponse[] | null> {
    return this.listCache.get(key);
  }

  /**
   * Set cached template list
   */
  async setList(key: string, templates: TemplateResponse[]): Promise<void> {
    await this.listCache.set(key, templates);
  }

  /**
   * Check if template is cached
   */
  async has(id: TemplateId): Promise<boolean> {
    return this.templateCache.has(id);
  }

  /**
   * Get cache size
   */
  async size(): Promise<number> {
    const stats = await this.templateCache.getStats();
    return stats.size;
  }

  /**
   * Invalidate cache for a specific template
   */
  async invalidate(id?: TemplateId): Promise<void> {
    if (id) {
      await this.templateCache.delete(id);
      await this.listCache.clear();
    } else {
      await this.clear();
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    templateCount: number;
    listCacheCount: number;
  }> {
    const templateStats = await this.templateCache.getStats();
    const listStats = await this.listCache.getStats();
    return {
      templateCount: templateStats.size,
      listCacheCount: listStats.size,
    };
  }

  /**
   * Stop watching files
   */
  async stopWatching(): Promise<void> {
    await this.templateCache.shutdown();
    await this.listCache.shutdown();
  }
}
