/**
 * Search Result Cache
 *
 * In-memory cache for search query results to improve performance
 * for popular queries.
 */

export interface CachedSearchResult<T> {
  results: T[];
  total: number;
  timestamp: number;
  queryHash: string;
}

export class SearchCache<T = any> {
  private cache = new Map<string, CachedSearchResult<T>>();
  private readonly defaultTTL: number;
  private maxSize: number;

  constructor(options: { ttl?: number; maxSize?: number } = {}) {
    this.defaultTTL = options.ttl || 5 * 60 * 1000; // 5 minutes default
    this.maxSize = options.maxSize || 1000; // Max 1000 cached queries
  }

  /**
   * Generate cache key from query and options
   */
  generateKey(query: string, options: Record<string, any> = {}): string {
    const normalizedQuery = query.toLowerCase().trim();
    const optionsKey = JSON.stringify(
      Object.keys(options)
        .sort()
        .reduce(
          (acc, key) => {
            if (options[key] !== undefined && options[key] !== null) {
              acc[key] = options[key];
            }
            return acc;
          },
          {} as Record<string, any>
        )
    );
    return `${normalizedQuery}:${optionsKey}`;
  }

  /**
   * Get cached result
   */
  get(key: string): CachedSearchResult<T> | null {
    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    // Check if expired
    const age = Date.now() - cached.timestamp;
    if (age > this.defaultTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached;
  }

  /**
   * Set cached result
   */
  set(key: string, results: T[], total: number): void {
    // Cleanup if cache is too large
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }

    this.cache.set(key, {
      results,
      total,
      timestamp: Date.now(),
      queryHash: key,
    });
  }

  /**
   * Clear expired entries and trim cache size
   */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.defaultTTL;

    // Remove expired entries
    for (const [key, value] of this.cache.entries()) {
      if (value.timestamp < cutoff) {
        this.cache.delete(key);
      }
    }

    // If still too large, remove oldest entries
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      );

      const toRemove = this.cache.size - Math.floor(this.maxSize * 0.8); // Keep 80%
      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(entries[i][0]);
      }
    }
  }

  /**
   * Clear all cached results
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate?: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}
