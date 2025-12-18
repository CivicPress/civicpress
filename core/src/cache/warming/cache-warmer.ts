/**
 * Cache Warmer
 *
 * Provides strategies for proactively populating cache with frequently accessed data
 */

import type { ICacheStrategy } from '../types.js';
import { Logger } from '../../utils/logger.js';

/**
 * Warming strategy function
 */
export type WarmingStrategy<T = any> = () => Promise<
  Array<{ key: string; value: T }>
>;

/**
 * Cache warming configuration
 */
export interface WarmingConfig {
  /**
   * Whether warming is enabled
   */
  enabled: boolean;

  /**
   * Preload on startup
   */
  preloadOnStartup?: boolean;

  /**
   * Scheduled warming configuration
   */
  scheduled?: {
    enabled: boolean;
    interval: number; // Interval in milliseconds
    strategy?: WarmingStrategy;
  };
}

/**
 * Cache warmer implementation
 */
export class CacheWarmer<T extends {} = any> {
  private cache: ICacheStrategy<T>;
  private config: WarmingConfig;
  private logger: Logger;
  private scheduledTimer?: NodeJS.Timeout;
  private isWarming = false;

  constructor(
    cache: ICacheStrategy<T>,
    config: WarmingConfig,
    logger?: Logger
  ) {
    this.cache = cache;
    this.config = config;
    this.logger = logger || new Logger();
  }

  /**
   * Preload cache on startup
   */
  async preloadOnStartup(strategy: WarmingStrategy<T>): Promise<void> {
    if (!this.config.enabled || !this.config.preloadOnStartup) {
      return;
    }

    try {
      this.logger.debug('Starting cache preload on startup');
      const startTime = Date.now();
      const entries = await strategy();

      let loaded = 0;
      for (const entry of entries) {
        try {
          await this.cache.set(entry.key, entry.value);
          loaded++;
        } catch (error) {
          this.logger.warn('Failed to preload cache entry', {
            key: entry.key,
            error,
          });
        }
      }

      const duration = Date.now() - startTime;
      this.logger.info('Cache preload completed', {
        loaded,
        total: entries.length,
        duration,
      });
    } catch (error) {
      this.logger.error('Cache preload failed', { error });
      // Don't throw - preload failure shouldn't block startup
    }
  }

  /**
   * Start scheduled warming
   */
  startScheduledWarming(strategy: WarmingStrategy<T>): void {
    if (!this.config.enabled || !this.config.scheduled?.enabled) {
      return;
    }

    if (this.scheduledTimer) {
      this.logger.warn('Scheduled warming already started');
      return;
    }

    const interval = this.config.scheduled.interval;
    this.logger.info('Starting scheduled cache warming', { interval });

    // Initial warm (after first interval)
    this.scheduledTimer = setInterval(async () => {
      await this.warm(strategy);
    }, interval);

    // Also warm immediately
    this.warm(strategy).catch((error) => {
      this.logger.error('Initial scheduled warm failed', { error });
    });
  }

  /**
   * Stop scheduled warming
   */
  stopScheduledWarming(): void {
    if (this.scheduledTimer) {
      clearInterval(this.scheduledTimer);
      this.scheduledTimer = undefined;
      this.logger.info('Stopped scheduled cache warming');
    }
  }

  /**
   * Warm cache on demand
   */
  async warmOnDemand(strategy: WarmingStrategy<T>): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    await this.warm(strategy);
  }

  /**
   * Internal warm method
   */
  private async warm(strategy: WarmingStrategy<T>): Promise<void> {
    if (this.isWarming) {
      this.logger.debug('Cache warming already in progress, skipping');
      return;
    }

    try {
      this.isWarming = true;
      const startTime = Date.now();
      const entries = await strategy();

      let loaded = 0;
      let skipped = 0;
      for (const entry of entries) {
        try {
          // Check if already cached
          const existing = await this.cache.get(entry.key);
          if (existing) {
            skipped++;
            continue;
          }

          await this.cache.set(entry.key, entry.value);
          loaded++;
        } catch (error) {
          this.logger.warn('Failed to warm cache entry', {
            key: entry.key,
            error,
          });
        }
      }

      const duration = Date.now() - startTime;
      this.logger.debug('Cache warm completed', {
        loaded,
        skipped,
        total: entries.length,
        duration,
      });
    } catch (error) {
      this.logger.error('Cache warm failed', { error });
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Shutdown warmer
   */
  shutdown(): void {
    this.stopScheduledWarming();
  }
}
