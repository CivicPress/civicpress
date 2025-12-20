/**
 * File Watcher Cache Strategy
 *
 * File watching + manual invalidation cache
 * Uses MemoryCache internally for storage
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  ICacheStrategy,
  CacheSetOptions,
  CacheStats,
  CacheConfig,
} from '../types.js';
import { MemoryCache } from './memory-cache.js';
import { Logger } from '../../utils/logger.js';

/**
 * File watcher cache implementation
 */
export class FileWatcherCache<T extends {} = any> implements ICacheStrategy<T> {
  private memoryCache: MemoryCache<T>;
  private readonly config: Required<
    Pick<CacheConfig, 'watchDirectories' | 'debounceMs' | 'enableWatching'>
  >;
  private readonly logger: Logger;
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private keyMapper?: (filePath: string) => string;
  private initialized = false;

  constructor(config: CacheConfig, logger?: Logger) {
    this.logger = logger || new Logger();
    this.config = {
      watchDirectories: config.watchDirectories || [],
      debounceMs: config.debounceMs || 100,
      enableWatching: config.enableWatching ?? true,
    };

    // Create memory cache with same config (excluding file watching options)
    const memoryConfig: CacheConfig = {
      ...config,
      strategy: 'memory',
    };
    this.memoryCache = new MemoryCache<T>(memoryConfig, this.logger);
  }

  /**
   * Set key mapper for file path to cache key conversion
   */
  setKeyMapper(mapper: (filePath: string) => string): void {
    this.keyMapper = mapper;
  }

  /**
   * Get value from cache
   */
  async get(key: string): Promise<T | null> {
    return this.memoryCache.get(key);
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    return this.memoryCache.set(key, value, options);
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    return this.memoryCache.delete(key);
  }

  /**
   * Clear all entries from cache
   */
  async clear(): Promise<void> {
    return this.memoryCache.clear();
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    return this.memoryCache.has(key);
  }

  /**
   * Invalidate entries matching pattern
   */
  async invalidate(pattern: string | RegExp): Promise<number> {
    return this.memoryCache.invalidate(pattern);
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    return this.memoryCache.getStats();
  }

  /**
   * Initialize cache (start file watchers)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.config.enableWatching) {
      this.initialized = true;
      return;
    }

    // Skip file watching in test environments to avoid slow initialization
    if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
      this.logger.debug(
        'Skipping file watcher initialization in test/CI environment'
      );
      this.initialized = true;
      return;
    }

    try {
      // Watch directories asynchronously (non-blocking) with timeout
      // Don't await - let it happen in background to avoid blocking initialization
      const watchPromises = this.config.watchDirectories.map((dir) =>
        Promise.race([
          this.watchDirectory(dir),
          new Promise<void>((_, reject) =>
            setTimeout(
              () => reject(new Error(`watchDirectory timeout for ${dir}`)),
              1000 // 1 second timeout per directory
            )
          ),
        ]).catch((error) => {
          this.logger.debug('Failed to watch directory (timeout or error)', {
            directory: dir,
            error: error instanceof Error ? error.message : String(error),
          });
          // Don't throw - continue with other directories
        })
      );

      // Mark as initialized immediately, don't wait for watchers
      this.initialized = true;

      // Start watching in background (fire and forget)
      Promise.all(watchPromises).catch((error) => {
        this.logger.warn('Background file watcher initialization failed', {
          directories: this.config.watchDirectories,
          error,
        });
      });
    } catch (error) {
      this.logger.warn('Failed to initialize file watchers', {
        directories: this.config.watchDirectories,
        error,
      });
      // Don't throw - cache can still work without watching
      this.initialized = true; // Mark as initialized even if watching failed
    }
  }

  /**
   * Shutdown cache (stop file watchers)
   */
  async shutdown(): Promise<void> {
    // Stop all watchers
    for (const [dir, watcher] of this.watchers.entries()) {
      try {
        watcher.close();
      } catch (error) {
        this.logger.warn('Error closing file watcher', { dir, error });
      }
    }
    this.watchers.clear();

    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Shutdown memory cache
    await this.memoryCache.shutdown();

    this.initialized = false;
  }

  /**
   * Watch directory for file changes
   */
  private async watchDirectory(dirPath: string): Promise<void> {
    const resolvedPath = path.resolve(dirPath);

    if (!fs.existsSync(resolvedPath)) {
      this.logger.debug('Directory does not exist, skipping watch', {
        path: resolvedPath,
      });
      return;
    }

    try {
      const watcher = fs.watch(
        resolvedPath,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) return;

          const filePath = path.join(resolvedPath, filename);
          this.handleFileChange(filePath, eventType);
        }
      );

      this.watchers.set(resolvedPath, watcher);
      this.logger.debug('Started watching directory', { path: resolvedPath });
    } catch (error) {
      this.logger.warn('Failed to watch directory', {
        path: resolvedPath,
        error,
      });
    }
  }

  /**
   * Handle file change event
   */
  private handleFileChange(filePath: string, eventType: string): void {
    // Debounce rapid changes
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.invalidateFile(filePath);
    }, this.config.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Invalidate cache for a specific file
   */
  private async invalidateFile(filePath: string): Promise<void> {
    try {
      let key: string;

      if (this.keyMapper) {
        key = this.keyMapper(filePath);
      } else {
        // Default: use file path as key (normalized)
        key = path.normalize(filePath);
      }

      // Try exact match first
      const deleted = await this.memoryCache.delete(key);

      if (!deleted) {
        // Try pattern-based invalidation
        // Extract filename and directory for pattern matching
        const filename = path.basename(filePath);
        const dir = path.dirname(filePath);

        // Invalidate entries that might match this file
        const patterns = [
          filename,
          path.basename(filePath, path.extname(filePath)), // Without extension
          filePath,
          dir,
        ];

        for (const pattern of patterns) {
          await this.memoryCache.invalidate(
            new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          );
        }
      }

      this.logger.debug('Invalidated cache for file', {
        filePath,
        key,
        deleted,
      });
    } catch (error) {
      this.logger.error('Error invalidating cache for file', {
        filePath,
        error,
      });
    }
  }
}
