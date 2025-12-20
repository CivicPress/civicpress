/**
 * Diagnostic Cache
 *
 * Caches diagnostic results to avoid redundant checks.
 */

import { CachedResult, ComponentResult, DiagnosticReport } from './types.js';
import { Logger } from '../utils/logger.js';

export interface DiagnosticCacheOptions {
  defaultTTL?: number; // Time to live in milliseconds (default: 300000 = 5 minutes)
  maxSize?: number; // Maximum number of cached results (default: 100)
  logger?: Logger;
}

export class DiagnosticCache {
  private cache: Map<string, CachedResult> = new Map();
  private readonly defaultTTL: number;
  private readonly maxSize: number;
  private readonly logger?: Logger;

  constructor(options: DiagnosticCacheOptions = {}) {
    this.defaultTTL = options.defaultTTL || 300000; // 5 minutes
    this.maxSize = options.maxSize || 100;
    this.logger = options.logger;
  }

  /**
   * Generate cache key from component and options
   */
  generateKey(component: string, options?: any): string {
    const optionsStr = options ? JSON.stringify(options) : '';
    return `${component}:${optionsStr}`;
  }

  /**
   * Get cached result
   */
  get(key: string): ComponentResult | DiagnosticReport | null {
    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      this.logger?.debug(`Cache expired for key: ${key}`);
      return null;
    }

    this.logger?.debug(`Cache hit for key: ${key}`);
    return cached.result;
  }

  /**
   * Set cached result
   */
  set(
    key: string,
    result: ComponentResult | DiagnosticReport,
    ttl?: number
  ): void {
    // Evict oldest entries if at max size
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });

    this.logger?.debug(`Cached result for key: ${key}`, {
      ttl: ttl || this.defaultTTL,
      size: this.cache.size,
    });
  }

  /**
   * Invalidate cache entries matching a pattern
   */
  invalidate(pattern: string | RegExp): number {
    let invalidated = 0;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        invalidated++;
      }
    }

    if (invalidated > 0) {
      this.logger?.debug(
        `Invalidated ${invalidated} cache entries matching pattern: ${pattern}`
      );
    }

    return invalidated;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.logger?.debug(`Cleared ${size} cache entries`);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Evict oldest cache entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, value] of this.cache.entries()) {
      if (value.timestamp < oldestTimestamp) {
        oldestTimestamp = value.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.logger?.debug(`Evicted oldest cache entry: ${oldestKey}`);
    }
  }
}
