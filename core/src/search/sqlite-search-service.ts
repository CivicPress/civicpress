/**
 * SQLite Search Service
 *
 * Implements full-text search using SQLite FTS5. Phase 2d W2-T3 decomposed
 * the prior 970-LoC monolith into focused collaborators under `sqlite/`:
 *
 *   - sql-builder: search SQL construction, ORDER BY, row mapping, text normalization
 *   - suggestions: word + title suggestion logic (Levenshtein typo tolerance)
 *   - facets: type/status aggregate counts
 *   - indexer: indexRecord + removeRecord
 *
 * This file is the orchestrator: holds the adapter + caches, composes
 * search() and getSuggestions(), and delegates to the helpers.
 */

import { DatabaseAdapter } from '../database/database-adapter.js';
import {
  SearchService,
  SearchResult,
  SearchOptions,
  SearchSuggestions,
  SearchResponse,
  SearchFacets,
} from './search-service.js';
import {
  parseSearchQuery,
  buildFTS5Query,
} from './query-parser.js';
import { SearchCacheAdapter } from './search-cache-adapter.js';
import { UnifiedCacheManager } from '../cache/unified-cache-manager.js';
import {
  buildSearchSQL,
  mapRowToSearchResult,
  type SearchRow,
} from './sqlite/sql-builder.js';
import {
  indexRecord as indexRecordFn,
  removeRecord as removeRecordFn,
  type IndexRecordInput,
} from './sqlite/indexer.js';
import { getFacets as getFacetsFn } from './sqlite/facets.js';
import {
  getWordSuggestions,
  getTitleSuggestions,
} from './sqlite/suggestions.js';

export class SQLiteSearchService implements SearchService {
  private searchCache?: SearchCacheAdapter<SearchResult>;
  private suggestionsCache?: SearchCacheAdapter<SearchSuggestions>;
  private cacheManager?: UnifiedCacheManager;

  constructor(
    private adapter: DatabaseAdapter,
    cacheManager?: UnifiedCacheManager
  ) {
    this.cacheManager = cacheManager;
  }

  /**
   * Get or create search cache (lazy initialization)
   */
  private getSearchCache(): SearchCacheAdapter<SearchResult> {
    if (!this.searchCache) {
      if (this.cacheManager) {
        this.searchCache = new SearchCacheAdapter<SearchResult>(
          this.cacheManager,
          'search'
        );
      } else {
        this.searchCache = new SearchCacheAdapter<SearchResult>(
          undefined,
          'search',
          { ttl: 5 * 60 * 1000, maxSize: 500 }
        );
      }
    }
    return this.searchCache;
  }

  /**
   * Get or create suggestions cache (lazy initialization)
   */
  private getSuggestionsCache(): SearchCacheAdapter<SearchSuggestions> {
    if (!this.suggestionsCache) {
      if (this.cacheManager) {
        this.suggestionsCache = new SearchCacheAdapter<SearchSuggestions>(
          this.cacheManager,
          'searchSuggestions'
        );
      } else {
        this.suggestionsCache = new SearchCacheAdapter<SearchSuggestions>(
          undefined,
          'searchSuggestions',
          { ttl: 5 * 60 * 1000, maxSize: 1000 }
        );
      }
    }
    return this.suggestionsCache;
  }

  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    const { type, status, limit = 20, offset = 0, sort = 'relevance' } = options;

    const cacheKey = this.getSearchCache().generateKey(query, {
      type,
      status,
      limit,
      offset,
      sort,
    });

    if (offset === 0) {
      const cached = await this.getSearchCache().get(cacheKey);
      if (cached) {
        return { results: cached.results, total: cached.total };
      }
    }

    const parsedQuery = parseSearchQuery(query);
    const ftsQuery = buildFTS5Query(parsedQuery);

    if (!ftsQuery) {
      return { results: [], total: 0 };
    }

    const firstWord =
      parsedQuery.words[0]?.toLowerCase().trim() || query.toLowerCase().trim();

    const sql = buildSearchSQL(ftsQuery, {
      type,
      status,
      limit,
      offset,
      sort,
      parsedQuery,
      titleBoostTerm: firstWord,
    });

    const results = await this.adapter.query<SearchRow>(
      sql.query,
      sql.params
    );

    const countResult = await this.adapter.query<{ count: number | string }>(
      sql.countQuery,
      sql.countParams
    );
    const total = parseInt(String(countResult[0]?.count ?? '0'), 10);

    const searchResults = results.map(mapRowToSearchResult);

    if (offset === 0) {
      await this.getSearchCache().set(cacheKey, searchResults, total);
    }

    return { results: searchResults, total };
  }

  async getSuggestions(
    query: string,
    limit: number = 10,
    enableTypoTolerance: boolean = true
  ): Promise<SearchSuggestions[]> {
    const normalized = query.toLowerCase().trim();

    if (normalized.length < 2) {
      return [];
    }

    const cacheKey = this.getSuggestionsCache().generateKey(normalized, {
      limit,
      enableTypoTolerance,
    });
    const cached = await this.getSuggestionsCache().get(cacheKey);
    if (cached) {
      const cachedResults = cached.results as SearchSuggestions[];
      return cachedResults.map((s) => ({
        ...s,
        type: s.type || ('title' as const),
      }));
    }

    // Words first (up to 40% of limit, capped at 5), titles after.
    const wordLimit = Math.min(5, Math.floor(limit * 0.4));
    const titleLimit = limit - wordLimit;

    const words = await getWordSuggestions(
      this.adapter,
      normalized,
      wordLimit,
      enableTypoTolerance
    );

    const titleSuggestions = await getTitleSuggestions(
      this.adapter,
      normalized,
      titleLimit,
      enableTypoTolerance
    );

    const allSuggestions = [...words, ...titleSuggestions];

    await this.getSuggestionsCache().set(
      cacheKey,
      allSuggestions,
      allSuggestions.length
    );

    return allSuggestions;
  }

  async getFacets(
    query: string,
    options: Omit<SearchOptions, 'limit' | 'offset'> = {}
  ): Promise<SearchFacets> {
    return getFacetsFn(this.adapter, query, options);
  }

  async indexRecord(record: IndexRecordInput): Promise<void> {
    return indexRecordFn(this.adapter, record);
  }

  async removeRecord(recordId: string, recordType: string): Promise<void> {
    await removeRecordFn(this.adapter, recordId, recordType);
    // Clear search cache to ensure removed records don't appear in cached results
    await this.getSearchCache().clear();
  }
}
