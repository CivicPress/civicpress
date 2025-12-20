/**
 * Unified Cache Manager
 *
 * Centralized management of all caches in the system
 */

import type {
  ICacheStrategy,
  CacheConfig,
  GlobalCacheStats,
  CacheStats,
} from './types.js';
import { MemoryCache } from './strategies/memory-cache.js';
import { FileWatcherCache } from './strategies/file-watcher-cache.js';
import { CacheInitializationError } from './errors.js';
import { Logger } from '../utils/logger.js';
import { CacheWarmer, type WarmingStrategy } from './warming/cache-warmer.js';

/**
 * Unified cache manager
 */
export class UnifiedCacheManager {
  private caches: Map<string, ICacheStrategy> = new Map();
  private configs: Map<string, CacheConfig> = new Map();
  private warmers: Map<string, CacheWarmer> = new Map();
  private readonly logger: Logger;
  private initialized = false;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger();
  }

  /**
   * Register a cache with the manager
   */
  register<T extends {}>(
    name: string,
    strategy: ICacheStrategy<T>,
    config: CacheConfig
  ): void {
    if (this.caches.has(name)) {
      throw new CacheInitializationError(
        `Cache with name '${name}' already registered`,
        { name }
      );
    }

    this.caches.set(name, strategy);
    this.configs.set(name, config);

    this.logger.debug('Registered cache', { name, strategy: config.strategy });
  }

  /**
   * Register a cache using configuration (creates strategy automatically)
   */
  async registerFromConfig(name: string, config: CacheConfig): Promise<void> {
    if (!config.enabled) {
      this.logger.debug('Cache disabled, skipping registration', { name });
      return;
    }

    let strategy: ICacheStrategy;

    switch (config.strategy) {
      case 'memory':
        strategy = new MemoryCache(config, this.logger);
        break;
      case 'file_watcher':
        strategy = new FileWatcherCache(config, this.logger);
        break;
      case 'hybrid':
        // Future: implement hybrid cache
        throw new CacheInitializationError(
          'Hybrid cache strategy not yet implemented',
          { name, strategy: config.strategy }
        );
      default:
        throw new CacheInitializationError(
          `Unknown cache strategy: ${config.strategy}`,
          { name, strategy: config.strategy }
        );
    }

    // Initialize cache
    await strategy.initialize();

    this.register(name, strategy, config);

    // Set up warming if configured
    if (config.warming?.enabled) {
      const warmerConfig = {
        enabled: config.warming.enabled,
        preloadOnStartup: config.warming.preloadOnStartup,
        scheduled: config.warming.scheduled,
      };
      const warmer = new CacheWarmer(strategy, warmerConfig, this.logger);
      this.warmers.set(name, warmer);

      // Start scheduled warming if configured
      if (
        config.warming.scheduled?.enabled &&
        config.warming.scheduled.strategy
      ) {
        warmer.startScheduledWarming(config.warming.scheduled.strategy);
      }
    }
  }

  /**
   * Unregister a cache
   */
  async unregister(name: string): Promise<void> {
    const cache = this.caches.get(name);
    if (cache) {
      await cache.shutdown();
      this.caches.delete(name);
      this.configs.delete(name);
      this.logger.debug('Unregistered cache', { name });
    }
  }

  /**
   * Get cache by name
   */
  getCache<T extends {}>(name: string): ICacheStrategy<T> {
    const cache = this.caches.get(name);
    if (!cache) {
      throw new CacheInitializationError(`Cache '${name}' not found`, { name });
    }
    return cache as ICacheStrategy<T>;
  }

  /**
   * Check if cache exists
   */
  hasCache(name: string): boolean {
    return this.caches.has(name);
  }

  /**
   * List all registered cache names
   */
  listCaches(): string[] {
    return Array.from(this.caches.keys());
  }

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    const promises = Array.from(this.caches.values()).map((cache) =>
      cache.clear()
    );
    await Promise.all(promises);
    this.logger.debug('Cleared all caches');
  }

  /**
   * Get global cache statistics
   */
  async getGlobalStats(): Promise<GlobalCacheStats> {
    const cacheStats: Record<string, CacheStats> = {};
    let totalHits = 0;
    let totalMisses = 0;
    let totalMemoryUsage = 0;
    let totalSize = 0;

    for (const [name, cache] of this.caches.entries()) {
      try {
        const stats = await cache.getStats();
        cacheStats[name] = stats;

        totalHits += stats.hits;
        totalMisses += stats.misses;
        totalMemoryUsage += stats.memoryUsage || 0;
        totalSize += stats.size;
      } catch (error) {
        this.logger.error('Error getting cache stats', { name, error });
      }
    }

    const totalRequests = totalHits + totalMisses;
    const totalHitRate = totalRequests > 0 ? totalHits / totalRequests : 0;

    return {
      caches: cacheStats,
      global: {
        totalHits,
        totalMisses,
        totalHitRate,
        totalMemoryUsage,
        totalSize,
      },
    };
  }

  /**
   * Initialize all registered caches
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const promises = Array.from(this.caches.entries()).map(
      async ([name, cache]) => {
        try {
          await cache.initialize();
        } catch (error) {
          this.logger.error('Error initializing cache', { name, error });
          // Don't throw - continue initializing other caches
        }
      }
    );

    await Promise.all(promises);
    this.initialized = true;
    this.logger.info('Unified cache manager initialized', {
      cacheCount: this.caches.size,
    });
  }

  /**
   * Shutdown all caches
   */
  async shutdown(): Promise<void> {
    // Stop all warmers
    for (const [name, warmer] of this.warmers.entries()) {
      try {
        warmer.shutdown();
      } catch (error) {
        this.logger.error('Error shutting down warmer', { name, error });
      }
    }

    const promises = Array.from(this.caches.entries()).map(
      async ([name, cache]) => {
        try {
          await cache.shutdown();
        } catch (error) {
          this.logger.error('Error shutting down cache', { name, error });
        }
      }
    );

    await Promise.all(promises);
    this.caches.clear();
    this.configs.clear();
    this.warmers.clear();
    this.initialized = false;
    this.logger.info('Unified cache manager shut down');
  }

  /**
   * Get cache configuration
   */
  getConfig(name: string): CacheConfig | undefined {
    return this.configs.get(name);
  }

  /**
   * Get all cache configurations
   */
  getAllConfigs(): Record<string, CacheConfig> {
    const configs: Record<string, CacheConfig> = {};
    for (const [name, config] of this.configs.entries()) {
      configs[name] = config;
    }
    return configs;
  }
}
