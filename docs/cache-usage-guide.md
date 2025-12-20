# Unified Caching Layer - Usage Guide

**Version:** 1.0.0  
**Status:** Production Ready  
**Last Updated:** 2025-01-XX

---

## Overview

The Unified Caching Layer provides a consistent, centralized caching system for
CivicPress. It standardizes cache management, provides comprehensive metrics,
and supports multiple caching strategies.

**Key Features:**

- Unified interface for all cache implementations
- Multiple cache strategies (Memory, FileWatcher)
- Centralized management through `UnifiedCacheManager`
- Comprehensive metrics and monitoring
- Cache warming support
- Health monitoring integration

---

## Architecture

### Core Components

1. **ICacheStrategy<T>** - Unified interface for all cache implementations
2. **MemoryCache** - TTL-based in-memory cache with LRU eviction
3. **FileWatcherCache** - File watching + manual invalidation
4. **UnifiedCacheManager** - Centralized cache registry and management
5. **Cache Adapters** - Backward-compatible wrappers for existing caches

### Cache Strategies

#### MemoryCache

- **Use Case:** General-purpose caching with TTL expiration
- **Features:**
  - TTL-based expiration (per entry or default)
  - LRU eviction when at max size
  - Memory-based limits (approximate)
  - Hit/miss tracking
- **Configuration:**

  ```typescript
  {
    strategy: 'memory',
    enabled: true,
    defaultTTL: 5 * 60 * 1000, // 5 minutes
    maxSize: 1000,
    maxMemory: 100 * 1024 * 1024, // 100MB (approximate)
    updateAgeOnGet: true // LRU behavior
  }
  ```

#### FileWatcherCache

- **Use Case:** File-based content that changes on disk
- **Features:**
  - File system watching for automatic invalidation
  - Debounced invalidation
  - Pattern-based key mapping
  - Uses MemoryCache internally
- **Configuration:**

  ```typescript
  {
    strategy: 'file_watcher',
    enabled: true,
    defaultTTL: 0, // Infinite (file watching handles invalidation)
    maxSize: 1000,
    watchDirectories: ['.civic/templates', '.civic/partials'],
    debounceMs: 100,
    enableWatching: true
  }
  ```

---

## Usage

### Getting a Cache Instance

All caches are registered with the `UnifiedCacheManager` and accessed through
it:

```typescript
import { CivicPress } from '@civicpress/core';

const civicPress = new CivicPress(config);
await civicPress.initialize();

// Get cache manager
const cacheManager = civicPress.getCacheManager();

// Get a specific cache
const searchCache = cacheManager.getCache<SearchResult>('search');
const templateCache = cacheManager.getCache<TemplateResponse>('templates');
```

### Basic Operations

```typescript
// Get value
const cached = await searchCache.get('query:test');
if (cached) {
  // Use cached value
  return cached;
}

// Set value
await searchCache.set('query:test', result, {
  ttl: 5 * 60 * 1000 // 5 minutes
});

// Check if key exists
const exists = await searchCache.has('query:test');

// Delete value
await searchCache.delete('query:test');

// Clear all entries
await searchCache.clear();

// Invalidate by pattern
await searchCache.invalidate(/^query:/); // Remove all keys starting with "query:"
```

### Cache Statistics

```typescript
// Get cache statistics
const stats = await searchCache.getStats();
console.log({
  size: stats.size,           // Current number of entries
  maxSize: stats.maxSize,     // Maximum entries allowed
  hits: stats.hits,           // Number of cache hits
  misses: stats.misses,       // Number of cache misses
  hitRate: stats.hitRate,     // Hit rate (0-1)
  memoryUsage: stats.memoryUsage, // Approximate memory usage (bytes)
  evictions: stats.evictions,    // Number of evicted entries
  errors: stats.errors            // Number of errors
});

// Get global statistics for all caches
const globalStats = await cacheManager.getGlobalStats();
console.log({
  caches: globalStats.caches,  // Per-cache statistics
  global: {
    totalHits: globalStats.global.totalHits,
    totalMisses: globalStats.global.totalMisses,
    totalHitRate: globalStats.global.totalHitRate,
    totalMemoryUsage: globalStats.global.totalMemoryUsage,
    totalSize: globalStats.global.totalSize
  }
});
```

---

## Registered Caches

The following caches are automatically registered during initialization:

1. **search** - Search results cache (MemoryCache)
   - TTL: 5 minutes
   - Max Size: 500 entries

2. **searchSuggestions** - Search suggestions cache (MemoryCache)
   - TTL: 5 minutes
   - Max Size: 1000 entries

3. **diagnostics** - Diagnostic results cache (MemoryCache)
   - TTL: 5 minutes
   - Max Size: 100 entries

4. **templates** - Template content cache (FileWatcherCache)
   - TTL: Infinite (file watching handles invalidation)
   - Max Size: 1000 entries
   - Watches: `.civic/templates`, `.civic/partials`

5. **templateLists** - Template list cache (MemoryCache)
   - TTL: 5 minutes
   - Max Size: 100 entries

6. **recordSuggestions** - Record search suggestions cache (MemoryCache)
   - TTL: 5 minutes
   - Max Size: 1000 entries

---

## API Endpoints

### GET /api/v1/cache/metrics

Get global cache statistics for all caches.

**Response:**

```json
{
  "success": true,
  "data": {
    "caches": {
      "search": {
        "size": 42,
        "maxSize": 500,
        "hits": 1234,
        "misses": 567,
        "hitRate": 0.685,
        "memoryUsage": 1048576,
        "evictions": 5,
        "errors": 0
      }
    },
    "global": {
      "totalHits": 5000,
      "totalMisses": 2000,
      "totalHitRate": 0.714,
      "totalMemoryUsage": 5242880,
      "totalSize": 250
    }
  }
}
```

### GET /api/v1/cache/metrics/:name

Get statistics for a specific cache.

**Response:**

```json
{
  "success": true,
  "data": {
    "name": "search",
    "size": 42,
    "maxSize": 500,
    "hits": 1234,
    "misses": 567,
    "hitRate": 0.685
  }
}
```

### GET /api/v1/cache/health

Get cache health status.

**Response:**

```json
{
  "success": true,
  "data": {
    "healthy": true,
    "caches": {
      "search": {
        "healthy": true,
        "hitRate": 0.685,
        "errors": 0,
        "size": 42,
        "maxSize": 500
      }
    },
    "global": {
      "totalHitRate": 0.714,
      "totalSize": 250,
      "totalMemoryUsage": 5242880
    }
  }
}
```

### GET /api/v1/cache/list

List all registered caches.

**Response:**

```json
{
  "success": true,
  "data": {
    "caches": [
      {
        "name": "search",
        "strategy": "memory",
        "enabled": true
      }
    ],
    "count": 6
  }
}
```

---

## CLI Commands

### civic cache:metrics

View cache metrics.

```bash
# View all cache metrics
civic cache:metrics

# View specific cache metrics
civic cache:metrics --name search

# JSON output
civic cache:metrics --json
```

### civic cache:health

Check cache health.

```bash
# Check cache health
civic cache:health

# JSON output
civic cache:health --json
```

### civic cache:list

List all registered caches.

```bash
# List caches
civic cache:list

# JSON output
civic cache:list --json
```

---

## Best Practices

### 1. Choose the Right Strategy

- **MemoryCache**: Use for frequently accessed data with predictable TTL
- **FileWatcherCache**: Use for file-based content that changes on disk

### 2. Set Appropriate TTLs

- Short TTL (1-5 minutes): Frequently changing data
- Medium TTL (5-30 minutes): Moderately changing data
- Long TTL (1+ hours): Rarely changing data
- Infinite TTL (0): Only for FileWatcherCache with file watching

### 3. Monitor Cache Performance

- Check hit rates regularly (target: > 80% for frequently accessed data)
- Monitor memory usage
- Watch for high eviction rates (may indicate undersized cache)

### 4. Use Cache Warming

For frequently accessed data, use cache warming to pre-populate caches:

```typescript
const warmer = new CacheWarmer(cache, {
  enabled: true,
  preloadOnStartup: true,
  scheduled: {
    enabled: true,
    interval: 5 * 60 * 1000, // 5 minutes
    strategy: async () => {
      // Return array of { key, value } pairs to warm
      return [
        { key: 'frequent:query1', value: await fetchData('query1') },
        { key: 'frequent:query2', value: await fetchData('query2') }
      ];
    }
  }
});
```

### 5. Handle Cache Failures Gracefully

Cache failures should not break application functionality:

```typescript
try {
  const cached = await cache.get(key);
  if (cached) return cached;
} catch (error) {
  logger.warn('Cache get failed, falling back to source', { error });
}

// Fallback to source
const data = await fetchFromSource();
try {
  await cache.set(key, data);
} catch (error) {
  logger.warn('Cache set failed, continuing without cache', { error });
}
return data;
```

---

## Migration from Old Caches

If you have code using the old cache implementations, they have been migrated to
use the Unified Caching Layer through adapters:

- **TemplateCache** → `TemplateCacheAdapter` (uses FileWatcherCache)
- **SearchCache** → `SearchCacheAdapter` (uses MemoryCache)
- **DiagnosticCache** → `DiagnosticCacheAdapter` (uses MemoryCache)

The adapters maintain backward compatibility, so existing code continues to work
without changes.

---

## Troubleshooting

### Low Hit Rates

- **Symptom:** Hit rate < 50%
- **Possible Causes:**
  - TTL too short
  - Cache size too small (frequent evictions)
  - Data changes too frequently
- **Solutions:**
  - Increase TTL for stable data
  - Increase cache size
  - Review cache warming strategy

### High Memory Usage

- **Symptom:** Memory usage approaching limits
- **Possible Causes:**
  - Cache size too large
  - Storing large objects
  - Too many caches
- **Solutions:**
  - Reduce cache sizes
  - Optimize stored data
  - Review cache strategies

### Cache Errors

- **Symptom:** `stats.errors > 0`
- **Possible Causes:**
  - Serialization issues
  - Memory limits exceeded
  - File system issues (for FileWatcherCache)
- **Solutions:**
  - Check logs for specific errors
  - Verify data can be serialized
  - Check file system permissions

---

## Reference

- **Specification:** `docs/specs/unified-caching-layer.md`
- **Source Code:** `core/src/cache/`
- **API Routes:** `modules/api/src/routes/cache.ts`
- **CLI Commands:** `cli/src/commands/cache.ts`
