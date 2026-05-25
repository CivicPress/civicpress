/**
 * RecordSearch — extracted from `record-manager.ts` during Phase 2d W2-T6
 * decomposition. Owns the search-related methods (`searchRecords`,
 * `getSearchSuggestions`) plus the private `getSuggestionsCache` and the
 * `batchGetRecords` helper used by `searchRecords`.
 *
 * Bodies are moved verbatim from `RecordManager`; only `this.db` /
 * `this.cacheManager` were rewritten to `this.deps.*`.
 */

import { DatabaseService } from '../../database/database-service.js';
import { Logger } from '../../utils/logger.js';
import type { ICacheStrategy, CacheConfig } from '../../cache/types.js';
import { UnifiedCacheManager } from '../../cache/unified-cache-manager.js';
import { MemoryCache } from '../../cache/strategies/memory-cache.js';
import type { RecordRow } from '../../database/types/row-types.js';

const logger = new Logger();

export interface RecordSearchDeps {
  db: DatabaseService;
  cacheManager?: UnifiedCacheManager;
}

export class RecordSearch {
  private suggestionsCache?: ICacheStrategy<{
    suggestions: string[];
    timestamp: number;
  }>;

  constructor(private deps: RecordSearchDeps) {}

  /**
   * Get or create suggestions cache (lazy initialization)
   */
  private getSuggestionsCache(): ICacheStrategy<{
    suggestions: string[];
    timestamp: number;
  }> {
    if (!this.suggestionsCache) {
      if (this.deps.cacheManager) {
        this.suggestionsCache = this.deps.cacheManager.getCache<{
          suggestions: string[];
          timestamp: number;
        }>('recordSuggestions');
      } else {
        // Fallback: create MemoryCache directly (for backward compatibility)
        const cacheConfig: CacheConfig = {
          strategy: 'memory',
          enabled: true,
          defaultTTL: 5 * 60 * 1000, // 5 minutes
          maxSize: 1000,
        };
        this.suggestionsCache = new MemoryCache<{
          suggestions: string[];
          timestamp: number;
        }>(cacheConfig, logger);
      }
    }
    return this.suggestionsCache;
  }

  /**
   * Search records with pagination, filtering, and sorting
   */
  async searchRecords(
    query: string,
    options: {
      type?: string;
      status?: string;
      limit?: number;
      offset?: number;
      sort?: string;
    } = {}
  ): Promise<{ records: Array<RecordRow & Record<string, unknown>>; total: number }> {
    // Use search service if available (includes pagination and relevance ranking)
    const searchService = this.deps.db.getSearchService();
    if (searchService) {
      try {
        const searchResult = await searchService.search(query, {
          type: options.type,
          status: options.status,
          limit: options.limit || 20,
          offset: options.offset || 0,
          sort: options.sort,
        });

        if (searchResult.results.length === 0) {
          return { records: [], total: searchResult.total };
        }

        // Batch fetch records (no N+1 queries!)
        const recordIds = searchResult.results.map((r) => r.record_id);
        const records = await this.batchGetRecords(recordIds);

        // Map search results to records, preserving relevance scores
        const recordsMap = new Map(records.map((r) => [r.id, r]));
        const resultRecords = searchResult.results
          .map((searchResultItem) => {
            const record = recordsMap.get(searchResultItem.record_id);
            if (!record) return null;

            // Add search metadata (relevance score, excerpt, etc.)
            return {
              ...record,
              _search: {
                relevance_score: searchResultItem.relevance_score,
                excerpt: searchResultItem.excerpt,
                match_highlights: searchResultItem.match_highlights,
              },
            };
          })
          .filter((r) => r !== null);

        return {
          records: resultRecords,
          total: searchResult.total,
        };
      } catch (error) {
        // Fall back to old method if search service fails
        logger.warn('Search service failed, falling back to basic search', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback: Old method (with N+1 fix)
    const searchResults = await this.deps.db.searchRecords(query, {
      type: options.type,
      status: options.status,
      limit: options.limit || 20,
      offset: options.offset || 0,
      sort: options.sort,
    });

    if (searchResults.length === 0) {
      return { records: [], total: 0 };
    }

    // Batch fetch records (no N+1 queries!)
    const recordIds = searchResults.map((r) => r.record_id);
    const records = await this.batchGetRecords(recordIds);

    // Map search results to records
    const recordsMap = new Map(records.map((r) => [r.id, r]));
    const resultRecords = searchResults
      .map((searchResult) => {
        const record = recordsMap.get(searchResult.record_id);
        if (!record) return null;
        return record;
      })
      .filter((r) => r !== null);

    return {
      records: resultRecords,
      total: resultRecords.length, // Approximate total
    };
  }

  /**
   * Batch fetch records to avoid N+1 query problem
   */
  private async batchGetRecords(recordIds: string[]): Promise<RecordRow[]> {
    if (recordIds.length === 0) return [];

    // Handle SQLite IN clause limit (999)
    const BATCH_SIZE = 999;
    const records: RecordRow[] = [];

    for (let i = 0; i < recordIds.length; i += BATCH_SIZE) {
      const batch = recordIds.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(',');
      const sql = `SELECT * FROM records WHERE id IN (${placeholders})`;

      const batchRecords = await this.deps.db.query<RecordRow>(sql, batch);
      records.push(...batchRecords);
    }

    return records;
  }

  /**
   * Get search suggestions based on record titles and content
   * Optimized: Uses lightweight query + caching (no full record fetches)
   */
  async getSearchSuggestions(
    query: string,
    options: {
      limit?: number;
    } = {}
  ): Promise<string[]> {
    const limit = options.limit || 10;
    const normalized = query.toLowerCase().trim();

    if (normalized.length < 2) {
      return [];
    }

    // Check cache
    const cached = await this.getSuggestionsCache().get(normalized);
    if (cached) {
      return cached.suggestions.slice(0, limit);
    }

    // Use search service if available (lightweight query with typo tolerance)
    const searchService = this.deps.db.getSearchService();
    if (searchService) {
      try {
        // Enable typo tolerance for better UX
        const suggestions = await searchService.getSuggestions(
          normalized,
          limit,
          true // enableTypoTolerance
        );
        // Return full suggestions with type information
        // The API will handle formatting
        const suggestionTexts = suggestions.map((s) => s.text);

        // Update cache
        await this.getSuggestionsCache().set(normalized, {
          suggestions: suggestionTexts,
          timestamp: Date.now(),
        });

        return suggestionTexts;
      } catch (error) {
        // Fall back to old method if search service fails
        logger.warn(
          'Search service suggestions failed, falling back to basic method',
          {
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }

    // Fallback: Old method (lightweight query - no full record fetches)
    const sql = `
      SELECT DISTINCT si.title as suggestion
      FROM search_index si
      INNER JOIN records r ON si.record_id = r.id
      WHERE (COALESCE(si.title_normalized, LOWER(si.title)) LIKE '%' || ? || '%')
        AND (r.workflow_state IS NULL OR r.workflow_state != 'internal_only')
      ORDER BY si.updated_at DESC
      LIMIT ?
    `;

    const results = await this.deps.db.query<{ suggestion: string }>(sql, [
      normalized,
      limit,
    ]);
    const suggestions = results.map((r) => r.suggestion);

    // Update cache
    await this.getSuggestionsCache().set(normalized, {
      suggestions,
      timestamp: Date.now(),
    });

    return suggestions;
  }
}
