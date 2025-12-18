/**
 * Diagnostic Cache Adapter
 *
 * Adapter that wraps MemoryCache to maintain DiagnosticCache API compatibility
 */

import type { ICacheStrategy } from '../cache/types.js';
import { UnifiedCacheManager } from '../cache/unified-cache-manager.js';
import { MemoryCache } from '../cache/strategies/memory-cache.js';
import type { CacheConfig } from '../cache/types.js';
import type { ComponentResult, DiagnosticReport } from './types.js';
import { Logger } from '../utils/logger.js';

/**
 * Diagnostic cache adapter - maintains backward compatibility with DiagnosticCache API
 * while using unified MemoryCache internally
 */
export class DiagnosticCacheAdapter {
  private cache: ICacheStrategy<ComponentResult | DiagnosticReport>;
  private readonly defaultTTL: number;
  private readonly logger?: Logger;

  constructor(
    cacheManager: UnifiedCacheManager | undefined,
    options: { defaultTTL?: number; maxSize?: number; logger?: Logger } = {}
  ) {
    this.logger = options.logger;
    this.defaultTTL = options.defaultTTL || 300000; // 5 minutes

    if (cacheManager) {
      // Get cache from UnifiedCacheManager
      this.cache = cacheManager.getCache<ComponentResult | DiagnosticReport>(
        'diagnostics'
      );
    } else {
      // Fallback: create MemoryCache directly (for backward compatibility)
      const config: CacheConfig = {
        strategy: 'memory',
        enabled: true,
        defaultTTL: this.defaultTTL,
        maxSize: options.maxSize || 100,
      };
      this.cache = new MemoryCache<ComponentResult | DiagnosticReport>(
        config,
        this.logger
      );
    }
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
  async get(key: string): Promise<ComponentResult | DiagnosticReport | null> {
    return this.cache.get(key);
  }

  /**
   * Set cached result
   */
  async set(
    key: string,
    result: ComponentResult | DiagnosticReport,
    ttl?: number
  ): Promise<void> {
    await this.cache.set(key, result, { ttl: ttl || this.defaultTTL });
  }

  /**
   * Invalidate cache entries matching pattern
   */
  async invalidate(pattern: string | RegExp): Promise<number> {
    return this.cache.invalidate(pattern);
  }

  /**
   * Clear all cache entries
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
    keys: string[];
  }> {
    const stats = await this.cache.getStats();
    // Note: We can't get keys from MemoryCache easily, so we'll return empty array
    // This is a limitation we can address later if needed
    return {
      size: stats.size,
      maxSize: stats.maxSize,
      keys: [], // MemoryCache doesn't expose keys easily
    };
  }
}
