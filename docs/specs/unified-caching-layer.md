# Unified Caching Layer - Specification

**Version:** 1.0.0  
**Status:** ✅ **IMPLEMENTED**  
**Target:** v0.2.0  
**Priority:** Medium  
**Completion Date:** 2025-01-XX

---

## Executive Summary

This specification defines a **Unified Caching Layer** for CivicPress that
addresses the current inconsistencies in caching strategies across the codebase.
The solution provides a unified interface, consistent TTL policies,
comprehensive metrics, and centralized management.

**Status:** ✅ **IMPLEMENTED** - See implementation status section below.

---

## Problem Statement

### Current Issues

1. **Inconsistent TTL Strategies**
   - `TemplateCache`: Infinite (no expiration)
   - `SearchCache`: Fixed 5 minutes
   - `DiagnosticCache`: Configurable per entry (default 5 minutes)
   - `SuggestionsCache`: Manual TTL checking (hardcoded)

2. **No Unified Interface**
   - Each cache has different API
   - Different method names and signatures
   - No common abstraction

3. **No Cache Metrics**
   - No hit/miss tracking
   - No performance metrics
   - No memory usage tracking
   - No cache effectiveness metrics

4. **No Cache Warming**
   - No proactive cache population
   - No pre-loading strategies
   - No cache warming on startup

5. **Memory Management Issues**
   - `TemplateCache`: No size limits (potential memory leak)
   - Other caches: Size limits but no memory-based limits
   - No global memory budget

6. **Different Cleanup Strategies**
   - File watching + manual (TemplateCache)
   - TTL expiration + LRU-like (SearchCache)
   - TTL expiration + oldest eviction (DiagnosticCache)
   - Manual cleanup (SuggestionsCache)

7. **No Centralized Management**
   - No unified cache manager
   - No global cache configuration
   - No cache lifecycle management
   - No cache health monitoring

---

## Solution Architecture

### Design Principles

1. **Unified Interface**: Single interface for all cache implementations
2. **Strategy Pattern**: Pluggable cache strategies (Memory, FileWatcher, etc.)
3. **Centralized Management**: Single manager for all caches
4. **Observability**: Comprehensive metrics and monitoring
5. **Backward Compatibility**: Gradual migration without breaking changes

### Core Components

#### 1. Cache Strategy Interface

```typescript
/**
 * Unified cache interface for all caching implementations
 */
export interface ICacheStrategy<T = any> {
  // Core operations
  get(key: string): Promise<T | null>;
  set(key: string, value: T, options?: CacheSetOptions): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;

  // Invalidation
  invalidate(pattern: string | RegExp): Promise<number>;

  // Metrics
  getStats(): Promise<CacheStats>;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

#### 2. Cache Strategies

**MemoryCache** - TTL-based in-memory cache with LRU eviction

- TTL expiration (per entry or default)
- LRU eviction when at max size
- Memory-based limits (approximate)
- Hit/miss tracking

**FileWatcherCache** - File watching + manual invalidation

- Uses MemoryCache internally
- File system watching for automatic invalidation
- Debounced invalidation
- Pattern-based key mapping

**HybridCache** - Combination of strategies (future)

- Multi-level caching
- Cache hierarchy

#### 3. Unified Cache Manager

```typescript
/**
 * Centralized cache manager for all caches
 */
export class UnifiedCacheManager {
  // Register caches
  register(name: string, strategy: ICacheStrategy, config: CacheConfig): void;

  // Get cache by name
  getCache<T>(name: string): ICacheStrategy<T>;

  // Global operations
  clearAll(): Promise<void>;
  getGlobalStats(): Promise<GlobalCacheStats>;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

---

## Detailed Specifications

### Cache Strategy Interface

#### Methods

**`get(key: string): Promise<T | null>`**

- Retrieves value from cache
- Returns `null` if key not found or expired
- Updates access time for LRU
- Tracks hit/miss

**`set(key: string, value: T, options?: CacheSetOptions): Promise<void>`**

- Stores value in cache
- Supports per-entry TTL
- Evicts LRU if at max size
- Tracks set operation

**`delete(key: string): Promise<boolean>`**

- Removes entry from cache
- Returns `true` if deleted, `false` if not found
- Tracks delete operation

**`clear(): Promise<void>`**

- Removes all entries from cache
- Resets metrics
- Tracks clear operation

**`has(key: string): Promise<boolean>`**

- Checks if key exists in cache
- Considers TTL expiration
- Does not update access time

**`invalidate(pattern: string | RegExp): Promise<number>`**

- Removes entries matching pattern
- Returns count of invalidated entries
- Supports string or regex patterns

**`getStats(): Promise<CacheStats>`**

- Returns cache statistics
- Includes hits, misses, hit rate, size, memory usage

**`initialize(): Promise<void>`**

- Initializes cache (e.g., start file watchers)
- Called on registration

**`shutdown(): Promise<void>`**

- Shuts down cache (e.g., stop file watchers)
- Called on manager shutdown

### CacheSetOptions

```typescript
interface CacheSetOptions {
  ttl?: number; // Time to live in milliseconds (overrides default)
  tags?: string[]; // Tags for invalidation (future)
}
```

### CacheStats

```typescript
interface CacheStats {
  // Size
  size: number; // Current number of entries
  maxSize: number; // Maximum number of entries
  memoryUsage?: number; // Approximate memory usage in bytes

  // Performance
  hits: number; // Number of cache hits
  misses: number; // Number of cache misses
  hitRate: number; // Hit rate (hits / (hits + misses))

  // Operations
  sets: number; // Number of set operations
  deletes: number; // Number of delete operations
  evictions: number; // Number of evictions

  // Errors
  errors: number; // Number of errors
}
```

### GlobalCacheStats

```typescript
interface GlobalCacheStats {
  caches: Record<string, CacheStats>;
  global: {
    totalHits: number;
    totalMisses: number;
    totalHitRate: number;
    totalMemoryUsage: number;
    totalSize: number;
  };
}
```

---

## Cache Strategies

### MemoryCache

**Purpose:** TTL-based in-memory cache with LRU eviction

**Features:**

- TTL expiration (per entry or default)
- LRU eviction when at max size
- Memory-based limits (approximate, using object size estimation)
- Hit/miss tracking
- Pattern-based invalidation

**Configuration:**

```typescript
interface MemoryCacheConfig {
  maxSize?: number; // Maximum number of entries (default: 1000)
  maxMemory?: number; // Maximum memory in bytes (default: unlimited)
  defaultTTL?: number; // Default TTL in milliseconds (default: 5 minutes)
  updateAgeOnGet?: boolean; // Update access time on get (default: true)
}
```

**Implementation:**

- Uses `lru-cache` library for LRU eviction
- Tracks approximate memory usage
- Expires entries based on TTL
- Evicts LRU entries when at max size or memory limit

### FileWatcherCache

**Purpose:** File watching + manual invalidation

**Features:**

- Uses MemoryCache internally for storage
- File system watching for automatic invalidation
- Debounced invalidation to handle rapid changes
- Pattern-based key mapping (file path → cache key)

**Configuration:**

```typescript
interface FileWatcherCacheConfig extends MemoryCacheConfig {
  watchDirectories: string[]; // Directories to watch
  debounceMs?: number; // Debounce delay in milliseconds (default: 100)
  enableWatching?: boolean; // Enable/disable watching (default: true)
  keyMapper?: (filePath: string) => string; // Map file path to cache key
}
```

**Implementation:**

- Watches specified directories for file changes
- Maps file paths to cache keys
- Debounces rapid file changes
- Invalidates cache entries on file changes

---

## Unified Cache Manager

### Purpose

Centralized management of all caches in the system.

### Features

1. **Cache Registration**
   - Register caches with name, strategy, and config
   - Validate uniqueness of cache names
   - Initialize cache on registration

2. **Cache Retrieval**
   - Get cache by name (type-safe)
   - Throw error if cache not found

3. **Global Operations**
   - Clear all caches
   - Get aggregated statistics
   - Shutdown all caches

4. **Configuration Management**
   - Load cache configuration from file
   - Apply configuration to caches
   - Support hot reload (optional)

### API

```typescript
class UnifiedCacheManager {
  // Registration
  register<T>(name: string, strategy: ICacheStrategy<T>, config: CacheConfig): void;
  unregister(name: string): void;

  // Retrieval
  getCache<T>(name: string): ICacheStrategy<T>;
  hasCache(name: string): boolean;
  listCaches(): string[];

  // Global operations
  clearAll(): Promise<void>;
  getGlobalStats(): Promise<GlobalCacheStats>;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

---

## Cache Warming

### Purpose

Proactively populate cache with frequently accessed data.

### Strategies

1. **Preload on Startup**
   - Load frequently accessed data when cache initializes
   - Configurable per cache

2. **Scheduled Warming**
   - Periodically warm cache with frequently accessed data
   - Configurable schedule

3. **On-Demand Warming**
   - Warm cache on first access
   - Background warming for related data

### Configuration

```typescript
interface WarmingConfig {
  enabled: boolean;
  preloadOnStartup?: boolean;
  scheduled?: {
    enabled: boolean;
    interval: number; // Interval in milliseconds
    strategy: () => Promise<void>; // Warming strategy
  };
}
```

---

## Metrics & Monitoring

### Metrics Collected

1. **Performance Metrics**
   - Hit/miss counts
   - Hit rate
   - Average access time
   - Eviction rate

2. **Resource Metrics**
   - Memory usage (approximate)
   - Cache size (entries)
   - Memory efficiency

3. **Operation Metrics**
   - Set/delete/clear counts
   - Error counts
   - Invalidation counts

### Monitoring

1. **Health Checks**
   - Low hit rate detection
   - High memory usage detection
   - High eviction rate detection
   - Error rate detection

2. **Alerts**
   - Hit rate below threshold
   - Memory usage above threshold
   - High error rate

3. **API Endpoints**
   - `GET /api/v1/cache/metrics` - Get all cache metrics
   - `GET /api/v1/cache/metrics/:name` - Get specific cache metrics
   - `GET /api/v1/cache/health` - Get cache health status

4. **CLI Commands**
   - `civic cache:metrics` - Show cache metrics
   - `civic cache:health` - Show cache health

---

## Migration Strategy

### Phase 1: Parallel Implementation

- Implement unified cache alongside existing caches
- No breaking changes
- Existing caches continue to work

### Phase 2: Gradual Migration

- Migrate one cache at a time
- Test thoroughly after each migration
- Maintain backward compatibility

### Phase 3: Cleanup

- Remove old cache implementations
- Update all references
- Final testing

### Migration Order

1. **SearchCache** (Lowest risk, simple TTL-based)
2. **DiagnosticCache** (Low risk, similar to SearchCache)
3. **TemplateCache** (Medium risk, file watching complexity)
4. **SuggestionsCache** (Low risk, simple Map-based)

---

## Configuration

### Configuration File

Location: `.system-data/cache.yml`

```yaml
_metadata:
  name: 'Unified Cache Configuration'
  description: 'Configure caching strategies and settings'
  version: '1.0.0'
  editable: true

# Global cache settings
global:
  enabled: true
  default_ttl: 300000 # 5 minutes
  max_memory_mb: 512 # Global memory budget
  enable_metrics: true
  enable_health_monitoring: true

# Per-cache configuration
caches:
  templates:
    strategy: file_watcher
    enabled: true
    ttl: 0 # Infinite (file watching handles invalidation)
    max_size: 1000
    watch_directories:
      - .civic/templates
      - .civic/partials
    debounce_ms: 100
    warming:
      enabled: true
      preload_on_startup: true

  search:
    strategy: memory
    enabled: true
    ttl: 300000 # 5 minutes
    max_size: 1000
    max_memory_mb: 100
    warming:
      enabled: false

  diagnostics:
    strategy: memory
    enabled: true
    ttl: 300000 # 5 minutes
    max_size: 100
    max_memory_mb: 50
    warming:
      enabled: false

  suggestions:
    strategy: memory
    enabled: true
    ttl: 3600000 # 1 hour
    max_size: 1000
    max_memory_mb: 50
    warming:
      enabled: false
```

---

## Success Criteria

### Functionality

- All existing caches migrated to unified interface
- Backward compatibility maintained
- No performance regression
- All tests passing

### Metrics

- Cache hit rates tracked
- Memory usage monitored
- Metrics API working
- Health monitoring working

### Code Quality

- 100% test coverage for new code
- All tests passing
- No memory leaks
- Documentation complete

### Performance

- Cache hit rate > 80% for frequently accessed data
- Memory usage within configured limits
- No performance regression vs existing caches
- Cache operations < 1ms (in-memory)

---

## Future Enhancements

### Distributed Caching

- Redis support for multi-instance deployments
- Cache synchronization across instances

### Advanced Strategies

- Multi-level caching (L1: memory, L2: disk)
- Cache hierarchy
- Cache compression

### Advanced Features

- Cache tags for group invalidation
- Cache versioning
- Cache encryption for sensitive data

---

## Implementation Status

✅ **IMPLEMENTED** - The Unified Caching Layer is fully implemented and in
production use.

### Completed Components

1. **Core Infrastructure** ✅
   - `ICacheStrategy<T>` interface defined (`core/src/cache/types.ts`)
   - `MemoryCache` strategy implemented (TTL-based with LRU eviction)
   - `FileWatcherCache` strategy implemented (file watching + manual
     invalidation)
   - `UnifiedCacheManager` implemented (centralized registry and management)

2. **Migration & Integration** ✅
   - `SearchCache` → `SearchCacheAdapter` (using MemoryCache)
   - `DiagnosticCache` → `DiagnosticCacheAdapter` (using MemoryCache)
   - `TemplateCache` → `TemplateCacheAdapter` (using FileWatcherCache)
   - `RecordManager.suggestionsCache` → Direct MemoryCache usage

3. **Advanced Features** ✅
   - Cache warming support (`CacheWarmer` class)
   - Comprehensive metrics (hits, misses, hit rate, memory usage)
   - Health monitoring (`CacheHealthChecker` integrated with diagnostic system)
   - API endpoints (`/api/v1/cache/metrics`, `/api/v1/cache/health`,
     `/api/v1/cache/list`)
   - CLI commands (`civic cache:metrics`, `civic cache:health`,
     `civic cache:list`)

4. **Documentation** ✅
   - Usage guide: `docs/cache-usage-guide.md`
   - Architecture documentation updated
   - API and CLI documentation complete

### Registered Caches

All caches are automatically registered during initialization:

- `search` - Search results (MemoryCache, 5min TTL, 500 entries)
- `searchSuggestions` - Search suggestions (MemoryCache, 5min TTL, 1000 entries)
- `diagnostics` - Diagnostic results (MemoryCache, 5min TTL, 100 entries)
- `templates` - Template content (FileWatcherCache, infinite TTL, 1000 entries)
- `templateLists` - Template lists (MemoryCache, 5min TTL, 100 entries)
- `recordSuggestions` - Record suggestions (MemoryCache, 5min TTL, 1000 entries)

### Source Code

- Core cache module: `core/src/cache/`
- API routes: `modules/api/src/routes/cache.ts`
- CLI commands: `cli/src/commands/cache.ts`
- Diagnostic integration:
  `core/src/diagnostics/checkers/cache-health-checker.ts`

---

## Conclusion

This specification provides a comprehensive solution for unifying CivicPress's
caching layer. The design is flexible, extensible, and maintains backward
compatibility while providing significant improvements in consistency,
observability, and maintainability.

**Status:** ✅ **IMPLEMENTED** - Fully functional and in production use.
