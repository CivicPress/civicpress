/**
 * Unified Cache Types
 *
 * Type definitions for the unified caching layer
 */

/**
 * Options for setting cache entries
 */
export interface CacheSetOptions {
  /**
   * Time to live in milliseconds (overrides default TTL)
   */
  ttl?: number;

  /**
   * Tags for group invalidation (future feature)
   */
  tags?: string[];
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /**
   * Current number of entries
   */
  size: number;

  /**
   * Maximum number of entries
   */
  maxSize: number;

  /**
   * Approximate memory usage in bytes
   */
  memoryUsage?: number;

  /**
   * Number of cache hits
   */
  hits: number;

  /**
   * Number of cache misses
   */
  misses: number;

  /**
   * Hit rate (hits / (hits + misses))
   */
  hitRate: number;

  /**
   * Number of set operations
   */
  sets: number;

  /**
   * Number of delete operations
   */
  deletes: number;

  /**
   * Number of evictions
   */
  evictions: number;

  /**
   * Number of errors
   */
  errors: number;
}

/**
 * Global cache statistics (aggregated across all caches)
 */
export interface GlobalCacheStats {
  /**
   * Statistics per cache
   */
  caches: Record<string, CacheStats>;

  /**
   * Aggregated global statistics
   */
  global: {
    totalHits: number;
    totalMisses: number;
    totalHitRate: number;
    totalMemoryUsage: number;
    totalSize: number;
  };
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /**
   * Cache strategy type
   */
  strategy: 'memory' | 'file_watcher' | 'hybrid';

  /**
   * Whether cache is enabled
   */
  enabled: boolean;

  /**
   * Default TTL in milliseconds
   */
  defaultTTL?: number;

  /**
   * Maximum number of entries
   */
  maxSize?: number;

  /**
   * Maximum memory in bytes
   */
  maxMemory?: number;

  /**
   * Update access time on get (for LRU)
   */
  updateAgeOnGet?: boolean;

  /**
   * File watching configuration (for file_watcher strategy)
   */
  watchDirectories?: string[];

  /**
   * Debounce delay in milliseconds (for file_watcher strategy)
   */
  debounceMs?: number;

  /**
   * Enable file watching (for file_watcher strategy)
   */
  enableWatching?: boolean;

  /**
   * Cache warming configuration
   */
  warming?: {
    enabled: boolean;
    preloadOnStartup?: boolean;
    scheduled?: {
      enabled: boolean;
      interval: number;
      strategy?: () => Promise<Array<{ key: string; value: any }>>;
    };
  };
}

/**
 * Unified cache interface for all caching implementations
 */
export interface ICacheStrategy<T extends {} = any> {
  /**
   * Get value from cache
   * @param key Cache key
   * @returns Cached value or null if not found/expired
   */
  get(key: string): Promise<T | null>;

  /**
   * Set value in cache
   * @param key Cache key
   * @param value Value to cache
   * @param options Cache options (TTL, tags, etc.)
   */
  set(key: string, value: T, options?: CacheSetOptions): Promise<void>;

  /**
   * Delete value from cache
   * @param key Cache key
   * @returns true if deleted, false if not found
   */
  delete(key: string): Promise<boolean>;

  /**
   * Clear all entries from cache
   */
  clear(): Promise<void>;

  /**
   * Check if key exists in cache
   * @param key Cache key
   * @returns true if key exists and not expired
   */
  has(key: string): Promise<boolean>;

  /**
   * Invalidate entries matching pattern
   * @param pattern String or RegExp pattern
   * @returns Number of invalidated entries
   */
  invalidate(pattern: string | RegExp): Promise<number>;

  /**
   * Get cache statistics
   * @returns Cache statistics
   */
  getStats(): Promise<CacheStats>;

  /**
   * Initialize cache (e.g., start file watchers)
   */
  initialize(): Promise<void>;

  /**
   * Shutdown cache (e.g., stop file watchers)
   */
  shutdown(): Promise<void>;
}
