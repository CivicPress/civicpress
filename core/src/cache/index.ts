/**
 * Unified Cache Layer
 *
 * Exports for the unified caching system
 */

// Types
export type {
  ICacheStrategy,
  CacheSetOptions,
  CacheStats,
  GlobalCacheStats,
  CacheConfig,
} from './types.js';

// Errors
export {
  CacheError,
  CacheKeyError,
  CacheSizeError,
  CacheInitializationError,
} from './errors.js';

// Strategies
export { MemoryCache } from './strategies/memory-cache.js';
export { FileWatcherCache } from './strategies/file-watcher-cache.js';

// Manager
export { UnifiedCacheManager } from './unified-cache-manager.js';

// Warming
export { CacheWarmer } from './warming/cache-warmer.js';
export type { WarmingStrategy, WarmingConfig } from './warming/cache-warmer.js';
