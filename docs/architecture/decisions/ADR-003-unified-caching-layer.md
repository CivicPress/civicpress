# ADR-003: Unified Caching Layer

**Status**: Accepted  
**Date**: 2025-01-30  
**Deciders**: Architecture Team  
**Tags**: architecture, caching, performance, consistency

---

## Context

CivicPress had multiple caching implementations with different strategies:

1. **TemplateCache**: File watching + manual invalidation
2. **SearchCache**: TTL-based expiration
3. **DiagnosticCache**: TTL-based expiration
4. **RecordManager.suggestionsCache**: In-memory Map

### Problems

- **Inconsistent interfaces** - Each cache had different API
- **Different invalidation strategies** - Some TTL-based, some file watching
- **No unified metrics** - Can't see cache performance across system
- **Memory leaks risk** - Some caches could grow unbounded
- **Hard to swap implementations** - Tightly coupled to specific cache type
- **No cache warming** - Caches cold on startup

---

## Decision

We will implement a **Unified Caching Layer** with:

1. **Unified Interface** (`ICacheStrategy<T>`) - Consistent API for all caches
2. **Strategy Pattern** - Easy to swap implementations
3. **Centralized Manager** (`UnifiedCacheManager`) - Registry for all caches
4. **Multiple Strategies** - MemoryCache (TTL-based), FileWatcherCache (file
   watching)
5. **Metrics & Monitoring** - Centralized cache statistics
6. **Lifecycle Management** - Proper initialization and shutdown

### Implementation

```typescript
// Unified interface
interface ICacheStrategy<T> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T, options?: CacheOptions): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  getStats(): Promise<CacheStats | null>;
}

// Cache manager
const cacheManager = civic.getCacheManager();
const cache = cacheManager.getCache('search');
await cache.set('key', value, { ttl: 5000 });
```

---

## Consequences

### Positive

✅ **Consistent interface** - All caches use same API  
✅ **Easy to swap** - Strategy pattern allows implementation changes  
✅ **Centralized metrics** - All cache stats in one place  
✅ **Memory management** - Size and memory limits prevent leaks  
✅ **Cache warming** - Preload caches for better performance  
✅ **Health monitoring** - Cache health integrated with diagnostics

### Negative

⚠️ **Migration effort** - Had to migrate existing caches  
⚠️ **Additional abstraction** - One more layer to understand  
⚠️ **Initial complexity** - More complex than simple Map

### Neutral

- All existing caches migrated successfully
- Backward compatible via adapters
- Can add new strategies easily

---

## Implementation Details

### Cache Strategies

1. **MemoryCache**:
   - TTL-based expiration
   - LRU eviction when size limit reached
   - Memory usage tracking
   - Hit/miss statistics

2. **FileWatcherCache**:
   - File system watching for automatic invalidation
   - Debounced invalidation
   - Pattern-based key mapping
   - Lifecycle management (proper shutdown)

### Cache Manager

- **Centralized Registry**: All caches registered with manager
- **Global Operations**: `clearAll()`, `getGlobalStats()`
- **Lifecycle Management**: `initialize()`, `shutdown()`
- **Cache Warming**: Preload caches on startup
- **Metrics Collection**: Comprehensive cache statistics

### Migration

All existing caches migrated to unified interface:

- ✅ `SearchCache` → `SearchCacheAdapter` (using UnifiedCacheManager)
- ✅ `DiagnosticCache` → `DiagnosticCacheAdapter` (using UnifiedCacheManager)
- ✅ `TemplateCache` → `TemplateCacheAdapter` (using UnifiedCacheManager)
- ✅ `RecordManager.suggestionsCache` → Direct `MemoryCache` usage

---

## Alternatives Considered

### 1. Keep Multiple Cache Implementations

**Approach**: Leave caches as-is, just document differences

**Rejected because**:

- Inconsistent APIs make code harder to understand
- No way to see overall cache performance
- Risk of memory leaks
- Hard to optimize caching strategy

### 2. Use Third-Party Cache Library (node-cache, cache-manager)

**Approach**: Use existing cache library

**Rejected because**:

- Adds external dependency
- May not support file watching
- Less control over implementation
- Want to keep dependencies minimal

### 3. Single Cache Implementation

**Approach**: Use one cache type for everything

**Rejected because**:

- Different use cases need different strategies
- File watching needed for templates
- TTL needed for search results
- Strategy pattern provides flexibility

---

## References

- Specification: `docs/specs/unified-caching-layer.md`
- Usage Guide: `docs/cache-usage-guide.md`
- Implementation: `core/src/cache/`
- API Endpoints: `modules/api/src/routes/cache.ts`
- CLI Commands: `cli/src/commands/cache.ts`

---

## Notes

- All caches successfully migrated
- 10-100x faster list operations (metadata caching)
- Comprehensive metrics and monitoring
- Health monitoring integrated with diagnostic system
- Cache warming support for improved performance
