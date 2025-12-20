/**
 * Memory Cache Strategy
 *
 * TTL-based in-memory cache with LRU eviction
 */

import { LRUCache } from 'lru-cache';
import type {
  ICacheStrategy,
  CacheSetOptions,
  CacheStats,
  CacheConfig,
} from '../types.js';
import { CacheKeyError, CacheSizeError } from '../errors.js';
import { Logger } from '../../utils/logger.js';

/**
 * Memory cache implementation using LRU eviction
 */
export class MemoryCache<T extends {} = any> implements ICacheStrategy<T> {
  private cache: LRUCache<string, T, unknown>;
  private readonly config: Required<
    Pick<CacheConfig, 'maxSize' | 'defaultTTL' | 'updateAgeOnGet'>
  > & {
    maxMemory?: number;
  };
  private readonly logger: Logger;

  // Metrics
  private hits = 0;
  private misses = 0;
  private sets = 0;
  private deletes = 0;
  private evictions = 0;
  private errors = 0;

  constructor(config: CacheConfig, logger?: Logger) {
    this.logger = logger || new Logger();
    this.config = {
      maxSize: config.maxSize || 1000,
      defaultTTL: config.defaultTTL || 5 * 60 * 1000, // 5 minutes
      updateAgeOnGet: config.updateAgeOnGet ?? true,
      maxMemory: config.maxMemory,
    };

    // Initialize LRU cache options
    const lruOptions: LRUCache.Options<string, T, unknown> = {
      max: this.config.maxSize,
      ttl: this.config.defaultTTL,
      updateAgeOnGet: this.config.updateAgeOnGet,
    };

    // Add memory limit if specified
    if (this.config.maxMemory) {
      // Approximate size calculation (rough estimate)
      lruOptions.maxSize = this.config.maxMemory;
      lruOptions.sizeCalculation = (value: T) => {
        // Rough estimate: JSON stringify size
        try {
          return JSON.stringify(value).length;
        } catch {
          // Fallback: estimate based on type
          if (typeof value === 'string') return value.length;
          if (typeof value === 'object') return 1024; // 1KB estimate
          return 64; // Small primitive
        }
      };
    }

    // Track evictions using dispose callback
    lruOptions.dispose = (
      value: T,
      key: string,
      reason: LRUCache.DisposeReason
    ) => {
      if (reason === 'evict') {
        this.evictions++;
      }
    };

    this.cache = new LRUCache<string, T, unknown>(lruOptions);
  }

  /**
   * Get value from cache
   */
  async get(key: string): Promise<T | null> {
    try {
      this.validateKey(key);
      const value = this.cache.get(key);

      if (value !== undefined) {
        this.hits++;
        return value;
      }

      this.misses++;
      return null;
    } catch (error) {
      this.errors++;
      this.logger.error('Cache get error', { key, error });
      throw error;
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    try {
      this.validateKey(key);

      const ttl = options?.ttl ?? this.config.defaultTTL;

      this.cache.set(key, value, {
        ttl: ttl > 0 ? ttl : undefined, // 0 or negative = no expiration
      });

      this.sets++;
    } catch (error) {
      this.errors++;
      if (error instanceof Error && error.message.includes('size')) {
        throw new CacheSizeError(`Cache size limit exceeded: ${key}`, {
          key,
          maxSize: this.config.maxSize,
        });
      }
      this.logger.error('Cache set error', { key, error });
      throw error;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      this.validateKey(key);
      const deleted = this.cache.delete(key);
      if (deleted) {
        this.deletes++;
      }
      return deleted;
    } catch (error) {
      this.errors++;
      this.logger.error('Cache delete error', { key, error });
      throw error;
    }
  }

  /**
   * Clear all entries from cache
   */
  async clear(): Promise<void> {
    try {
      this.cache.clear();
      // Reset metrics
      this.hits = 0;
      this.misses = 0;
      this.sets = 0;
      this.deletes = 0;
      this.evictions = 0;
      this.errors = 0;
    } catch (error) {
      this.errors++;
      this.logger.error('Cache clear error', { error });
      throw error;
    }
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    try {
      this.validateKey(key);
      return this.cache.has(key);
    } catch (error) {
      this.errors++;
      this.logger.error('Cache has error', { key, error });
      throw error;
    }
  }

  /**
   * Invalidate entries matching pattern
   */
  async invalidate(pattern: string | RegExp): Promise<number> {
    try {
      const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
      let invalidated = 0;

      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          if (this.cache.delete(key)) {
            invalidated++;
            this.deletes++;
          }
        }
      }

      return invalidated;
    } catch (error) {
      this.errors++;
      this.logger.error('Cache invalidate error', { pattern, error });
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    // Approximate memory usage
    let memoryUsage: number | undefined;
    if (this.config.maxMemory) {
      // Rough estimate: sum of approximate sizes
      memoryUsage = 0;
      for (const value of this.cache.values()) {
        try {
          memoryUsage += JSON.stringify(value).length;
        } catch {
          memoryUsage += 1024; // Fallback estimate
        }
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      memoryUsage,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      sets: this.sets,
      deletes: this.deletes,
      evictions: this.evictions,
      errors: this.errors,
    };
  }

  /**
   * Initialize cache (no-op for memory cache)
   */
  async initialize(): Promise<void> {
    // Memory cache doesn't need initialization
  }

  /**
   * Shutdown cache (clear and reset metrics)
   */
  async shutdown(): Promise<void> {
    await this.clear();
  }

  /**
   * Validate cache key
   */
  private validateKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new CacheKeyError('Cache key must be a non-empty string', { key });
    }
    if (key.length > 1000) {
      throw new CacheKeyError('Cache key too long (max 1000 characters)', {
        key: key.substring(0, 100),
        length: key.length,
      });
    }
  }
}
