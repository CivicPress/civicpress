/**
 * Search Cache Adapter
 *
 * Adapter that wraps MemoryCache to maintain SearchCache API compatibility
 */

import type { ICacheStrategy } from '../cache/types.js';
import { UnifiedCacheManager } from '../cache/unified-cache-manager.js';
import { MemoryCache } from '../cache/strategies/memory-cache.js';
import type { CacheConfig } from '../cache/types.js';

export interface CachedSearchResult<T> {
  results: T[];
  total: number;
  timestamp: number;
  queryHash: string;
}

/**
 * Search cache adapter - maintains backward compatibility with SearchCache API
 * while using unified cache from UnifiedCacheManager
 */
export class SearchCacheAdapter<T = any> {
  private cache: ICacheStrategy<CachedSearchResult<T>>;
  private readonly defaultTTL: number;

  constructor(
    cacheManager: UnifiedCacheManager | undefined,
    cacheName: string = 'search',
    options: { ttl?: number; maxSize?: number } = {}
  ) {
    this.defaultTTL = options.ttl || 5 * 60 * 1000; // 5 minutes default

    if (cacheManager) {
      // Get cache from UnifiedCacheManager
      this.cache = cacheManager.getCache<CachedSearchResult<T>>(cacheName);
    } else {
      // Fallback: create MemoryCache directly (for backward compatibility or when cacheManager not yet available)
      const config: CacheConfig = {
        strategy: 'memory',
        enabled: true,
        defaultTTL: this.defaultTTL,
        maxSize: options.maxSize || 1000,
      };
      this.cache = new MemoryCache<CachedSearchResult<T>>(config);
    }
  }

  /**
   * Generate cache key from query and options
   */
  generateKey(query: string, options: Record<string, any> = {}): string {
    const normalizedQuery = query.toLowerCase().trim();
    const optionsKey = JSON.stringify(
      Object.keys(options)
        .sort()
        .reduce(
          (acc, key) => {
            if (options[key] !== undefined && options[key] !== null) {
              acc[key] = options[key];
            }
            return acc;
          },
          {} as Record<string, any>
        )
    );
    return `${normalizedQuery}:${optionsKey}`;
  }

  /**
   * Get cached result
   */
  async get(key: string): Promise<CachedSearchResult<T> | null> {
    return this.cache.get(key);
  }

  /**
   * Set cached result
   */
  async set(key: string, results: T[], total: number): Promise<void> {
    const cachedResult: CachedSearchResult<T> = {
      results,
      total,
      timestamp: Date.now(),
      queryHash: key,
    };
    await this.cache.set(key, cachedResult);
  }

  /**
   * Clear all cached results
   */
  async clear(): Promise<void> {
    await this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    size: number;
    maxSize: number;
    hitRate?: number;
  }> {
    const stats = await this.cache.getStats();
    return {
      size: stats.size,
      maxSize: stats.maxSize,
      hitRate: stats.hitRate,
    };
  }
}
