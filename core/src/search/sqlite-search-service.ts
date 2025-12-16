/**
 * SQLite Search Service
 *
 * Implements full-text search using SQLite FTS5.
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
import { coreDebug } from '../utils/core-output.js';
import {
  parseSearchQuery,
  buildFTS5Query,
  calculateSimilarity,
} from './query-parser.js';
// Import fast-levenshtein - it exports { get: function }
// Use createRequire for proper CommonJS interop in ES modules
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const levenshtein = require('fast-levenshtein') as {
  get: (str1: string, str2: string) => number;
};
import { SearchCache } from './search-cache.js';

export class SQLiteSearchService implements SearchService {
  private searchCache: SearchCache<SearchResult>;
  private suggestionsCache: SearchCache<SearchSuggestions>;

  constructor(private adapter: DatabaseAdapter) {
    // Initialize caches
    this.searchCache = new SearchCache<SearchResult>({
      ttl: 5 * 60 * 1000, // 5 minutes for search results
      maxSize: 500, // Cache up to 500 popular queries
    });

    this.suggestionsCache = new SearchCache<SearchSuggestions>({
      ttl: 5 * 60 * 1000, // 5 minutes for suggestions
      maxSize: 1000, // More suggestions cached (they're smaller)
    });
  }

  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    const {
      type,
      status,
      limit = 20,
      offset = 0,
      sort = 'relevance',
      enable_typo_tolerance = false,
      enable_accent_insensitive = true,
    } = options;

    // Generate cache key (only cache offset=0 for simplicity)
    // Different offsets are considered different queries
    const cacheKey = this.searchCache.generateKey(query, {
      type,
      status,
      limit,
      offset,
      sort,
    });

    // Check cache (only for first page)
    if (offset === 0) {
      const cached = this.searchCache.get(cacheKey);
      if (cached) {
        return {
          results: cached.results,
          total: cached.total,
        };
      }
    }

    // Parse query for multi-word and phrase support
    const parsedQuery = parseSearchQuery(query);
    const ftsQuery = buildFTS5Query(parsedQuery);

    if (!ftsQuery) {
      // Empty query - return empty results
      return {
        results: [],
        total: 0,
      };
    }

    // Extract first word for title boost (normalized)
    const firstWord =
      parsedQuery.words[0]?.toLowerCase().trim() || query.toLowerCase().trim();

    // Build search SQL with relevance scoring
    const sql = this.buildSearchSQL(ftsQuery, {
      type,
      status,
      limit,
      offset,
      sort,
      parsedQuery,
      titleBoostTerm: firstWord,
    });

    const results = await this.adapter.query(sql.query, sql.params);

    // Get total count
    const countResult = await this.adapter.query(
      sql.countQuery,
      sql.countParams
    );
    const total = parseInt(countResult[0]?.count || '0', 10);

    const searchResults = results.map(this.mapRowToSearchResult);

    // Cache results (only for first page)
    if (offset === 0) {
      this.searchCache.set(cacheKey, searchResults, total);
    }

    return {
      results: searchResults,
      total,
    };
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

    // Check cache
    const cacheKey = this.suggestionsCache.generateKey(normalized, {
      limit,
      enableTypoTolerance,
    });
    const cached = this.suggestionsCache.get(cacheKey);
    if (cached) {
      const cachedResults = cached.results as SearchSuggestions[];
      // Ensure cached results have type field (for backward compatibility)
      return cachedResults.map((s) => ({
        ...s,
        type: s.type || ('title' as const), // Default to 'title' if type is missing
      }));
    }

    // Extract words first (4-5 words), then titles (remaining slots)
    const wordLimit = Math.min(5, Math.floor(limit * 0.4)); // Up to 5 words, or 40% of limit
    const titleLimit = limit - wordLimit;

    // Get words from titles and tags
    const words = await this.getWordSuggestions(
      normalized,
      wordLimit,
      enableTypoTolerance
    );

    // Get titles (remaining slots)
    const fetchLimit = enableTypoTolerance ? titleLimit * 3 : titleLimit;

    const sql = `
      SELECT DISTINCT 
        si.title as suggestion,
        'title' as source,
        COUNT(*) as frequency,
        COALESCE(si.title_normalized, LOWER(si.title)) as title_normalized
      FROM search_index si
      INNER JOIN records r ON si.record_id = r.id
      WHERE (COALESCE(si.title_normalized, LOWER(si.title)) LIKE '%' || ? || '%')
        AND (r.workflow_state IS NULL OR r.workflow_state != 'internal_only')
      GROUP BY si.title, si.title_normalized
      ORDER BY frequency DESC, si.title
      LIMIT ?
    `;

    const results = await this.adapter.query(sql, [normalized, fetchLimit]);

    // Process titles
    let titleSuggestions: SearchSuggestions[];

    if (!enableTypoTolerance || results.length >= titleLimit) {
      // Return exact matches if we have enough, or typo tolerance disabled
      titleSuggestions = results.slice(0, titleLimit).map((row: any) => ({
        text: row.suggestion,
        source: row.source,
        type: 'title' as const,
        frequency: row.frequency || 1,
      }));
    } else {
      // Apply typo tolerance filtering
      const suggestionsWithSimilarity = results.map((row: any) => {
        const similarity = this.calculateTypoSimilarity(
          normalized,
          row.title_normalized
        );
        return {
          text: row.suggestion,
          source: row.source,
          frequency: row.frequency || 1,
          similarity,
        };
      });

      // Sort by similarity (higher is better), then frequency, then alphabetically
      suggestionsWithSimilarity.sort((a, b) => {
        // Exact prefix matches first (similarity >= 0.9)
        if (a.similarity >= 0.9 && b.similarity < 0.9) return -1;
        if (a.similarity < 0.9 && b.similarity >= 0.9) return 1;

        // Then by similarity (threshold 0.7)
        if (a.similarity >= 0.7 && b.similarity >= 0.7) {
          if (Math.abs(a.similarity - b.similarity) > 0.05) {
            return b.similarity - a.similarity;
          }
          // Similar similarity - sort by frequency
          if (a.frequency !== b.frequency) {
            return b.frequency - a.frequency;
          }
        } else if (a.similarity >= 0.7) {
          return -1;
        } else if (b.similarity >= 0.7) {
          return 1;
        } else {
          // Both below threshold - prefer exact prefix matches
          return 0;
        }

        // Finally alphabetically
        return a.text.localeCompare(b.text);
      });

      // Filter by similarity threshold and return top results
      titleSuggestions = suggestionsWithSimilarity
        .filter((item) => item.similarity >= 0.7 || item.similarity >= 0.5) // Allow lower threshold for suggestions
        .slice(0, titleLimit)
        .map((item) => ({
          text: item.text,
          source: item.source,
          type: 'title' as const,
          frequency: item.frequency,
        }));
    }

    // Combine words (first) and titles (after)
    const allSuggestions = [...words, ...titleSuggestions];

    // Cache suggestions
    this.suggestionsCache.set(cacheKey, allSuggestions, allSuggestions.length);

    return allSuggestions;
  }

  /**
   * Extract and rank word suggestions from titles and tags
   */
  private async getWordSuggestions(
    query: string,
    limit: number,
    enableTypoTolerance: boolean
  ): Promise<SearchSuggestions[]> {
    // Use fallback method (more reliable across SQLite versions)
    try {
      const words = await this.getWordSuggestionsFallback(query, limit);
      coreDebug('getWordSuggestions completed', {
        query,
        limit,
        wordsFound: words.length,
        words: words.map((w) => w.text),
      });
      return words;
    } catch (error) {
      coreDebug('getWordSuggestions error', {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Fallback method for word extraction (for older SQLite versions)
   */
  private async getWordSuggestionsFallback(
    query: string,
    limit: number
  ): Promise<SearchSuggestions[]> {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'as',
      'is',
      'was',
      'are',
      'were',
      'been',
      'be',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'should',
      'could',
      'may',
      'might',
      'must',
      'can',
      'this',
      'that',
      'these',
      'those',
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
      'me',
      'him',
      'her',
      'us',
      'them',
      'le',
      'la',
      'les',
      'un',
      'une',
      'des',
      'de',
      'du',
      'et',
      'ou',
      'mais',
      'dans',
      'sur',
      'avec',
      'pour',
      'par',
      'sans',
      'sous',
      'entre',
      'parmi',
    ]);

    // Get titles and tags that match the query
    const sql = `
      SELECT 
        si.title,
        si.tags
      FROM search_index si
      INNER JOIN records r ON si.record_id = r.id
      WHERE (COALESCE(si.title_normalized, LOWER(si.title)) LIKE '%' || ? || '%'
             OR (si.tags IS NOT NULL AND LOWER(si.tags) LIKE '%' || ? || '%'))
        AND (r.workflow_state IS NULL OR r.workflow_state != 'internal_only')
      LIMIT 100
    `;

    const queryLower = query.toLowerCase();
    const results = await this.adapter.query(sql, [queryLower, queryLower]);

    if (results.length === 0) {
      coreDebug('Word extraction: no results from SQL query', {
        query: queryLower,
      });
      return [];
    }

    coreDebug('Word extraction query results', {
      query: queryLower,
      resultsCount: results.length,
      sampleTitles: results.slice(0, 3).map((r: any) => r.title),
    });

    // Extract words in JavaScript
    const wordMap = new Map<string, number>();

    for (const row of results) {
      // Extract from title
      if (row.title) {
        const words = this.extractWords(row.title);
        for (const word of words) {
          // extractWords already returns lowercase, so word is already lowercase
          const isStopWord = stopWords.has(word);
          const hasQuery = word.includes(queryLower);
          const isLongEnough = word.length >= 3;

          if (!isStopWord && isLongEnough && hasQuery) {
            wordMap.set(word, (wordMap.get(word) || 0) + 1);
          }
        }
      }

      // Extract from tags
      if (row.tags) {
        const tagWords = row.tags
          .split(',')
          .map((t: string) => t.trim().toLowerCase())
          .filter((t: string) => t.length >= 3);
        for (const word of tagWords) {
          if (!stopWords.has(word) && word.includes(queryLower)) {
            wordMap.set(word, (wordMap.get(word) || 0) + 1);
          }
        }
      }
    }

    coreDebug('Word extraction results', {
      query: queryLower,
      wordMapSize: wordMap.size,
      words: Array.from(wordMap.keys()),
    });

    if (wordMap.size === 0) {
      coreDebug('Word extraction: no words found after filtering', {
        query: queryLower,
        resultsCount: results.length,
      });
      return [];
    }

    // Sort by frequency and match quality
    const wordSuggestions = Array.from(wordMap.entries())
      .map(([word, frequency]) => {
        let matchQuality = 0;
        if (word.startsWith(queryLower)) {
          matchQuality = 3; // Prefix match (best)
        } else if (word.includes(queryLower)) {
          matchQuality = 2; // Contains match (good)
        } else {
          matchQuality = 1; // Fuzzy match
        }
        return { word, frequency, matchQuality };
      })
      .sort((a, b) => {
        if (a.matchQuality !== b.matchQuality) {
          return b.matchQuality - a.matchQuality;
        }
        if (a.frequency !== b.frequency) {
          return b.frequency - a.frequency;
        }
        return a.word.localeCompare(b.word);
      })
      .slice(0, limit)
      .map((item) => ({
        text: item.word,
        source: 'word',
        type: 'word' as const,
        frequency: item.frequency,
      }));

    return wordSuggestions;
  }

  /**
   * Extract words from text (helper method)
   */
  private extractWords(text: string): string[] {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^\w\s-àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/g, ' ') // Replace punctuation, keep accented chars
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .split(' ')
      .filter((word) => word && word.length >= 3)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3);
  }

  async getFacets(
    query: string,
    options: Omit<SearchOptions, 'limit' | 'offset'> = {}
  ): Promise<SearchFacets> {
    // Parse query
    const parsedQuery = parseSearchQuery(query);
    const ftsQuery = buildFTS5Query(parsedQuery);

    if (!ftsQuery) {
      return {
        types: [],
        statuses: [],
      };
    }

    const { type, status } = options;
    let params: any[] = [ftsQuery, 'internal_only'];

    // Build base WHERE clause (same as search)
    let baseWhereClause = `
      search_index_fts5 MATCH ?
      AND (r.workflow_state IS NULL OR r.workflow_state != ?)
    `;

    // Apply existing filters
    if (type) {
      const typeFilters = type.split(',').map((t) => t.trim());
      if (typeFilters.length === 1) {
        baseWhereClause += ' AND si.record_type = ?';
        params.push(typeFilters[0]);
      } else {
        const placeholders = typeFilters.map(() => '?').join(',');
        baseWhereClause += ` AND si.record_type IN (${placeholders})`;
        params.push(...typeFilters);
      }
    }

    if (status) {
      baseWhereClause += ' AND r.status = ?';
      params.push(status);
    }

    // Get type counts
    const typeQuery = `
      SELECT 
        si.record_type as value,
        COUNT(*) as count
      FROM search_index_fts5
      INNER JOIN search_index si ON search_index_fts5.rowid = si.rowid
      INNER JOIN records r ON si.record_id = r.id
      WHERE ${baseWhereClause}
      GROUP BY si.record_type
      ORDER BY count DESC, si.record_type
    `;

    const typeResults = await this.adapter.query(typeQuery, params);

    // Get status counts
    const statusQuery = `
      SELECT 
        COALESCE(r.status, 'published') as value,
        COUNT(*) as count
      FROM search_index_fts5
      INNER JOIN search_index si ON search_index_fts5.rowid = si.rowid
      INNER JOIN records r ON si.record_id = r.id
      WHERE ${baseWhereClause}
      GROUP BY r.status
      ORDER BY count DESC, r.status
    `;

    const statusResults = await this.adapter.query(statusQuery, params);

    return {
      types: typeResults.map((row: any) => ({
        value: row.value,
        count: parseInt(row.count, 10),
      })),
      statuses: statusResults.map((row: any) => ({
        value: row.value,
        count: parseInt(row.count, 10),
      })),
    };
  }

  /**
   * Calculate typo similarity using Levenshtein distance
   */
  private calculateTypoSimilarity(query: string, candidate: string): number {
    const normalizedQuery = query.toLowerCase().trim();
    const normalizedCandidate = candidate.toLowerCase().trim();

    // If candidate starts with query, it's a high similarity prefix match
    if (normalizedCandidate.startsWith(normalizedQuery)) {
      return 0.95;
    }

    // Calculate Levenshtein distance
    const distance = levenshtein.get(normalizedQuery, normalizedCandidate);
    const maxLength = Math.max(
      normalizedQuery.length,
      normalizedCandidate.length
    );

    if (maxLength === 0) {
      return 1.0;
    }

    // Similarity score (0-1, where 1 is identical)
    const similarity = 1 - distance / maxLength;

    // Boost similarity for shorter strings (typos more significant in short queries)
    const boost = normalizedQuery.length <= 3 ? 0.1 : 0;

    return Math.min(1.0, similarity + boost);
  }

  async indexRecord(record: {
    recordId: string;
    recordType: string;
    title: string;
    content?: string;
    tags?: string;
    metadata?: any;
  }): Promise<void> {
    // Normalize title for accent-insensitive search
    const titleNormalized = this.normalizeText(record.title);
    const contentPreview = record.content?.substring(0, 500) || '';
    const wordCount = record.content?.split(/\s+/).length || 0;
    const metadataJson = record.metadata
      ? JSON.stringify(record.metadata)
      : null;

    // Delete existing
    await this.adapter.execute(
      'DELETE FROM search_index WHERE record_id = ? AND record_type = ?',
      [record.recordId, record.recordType]
    );

    // Insert into search_index (FTS5 triggers will handle virtual table)
    await this.adapter.execute(
      `INSERT INTO search_index (
        record_id, record_type, title, content, tags, metadata,
        title_normalized, content_preview, word_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.recordId,
        record.recordType,
        record.title,
        record.content || null,
        record.tags || null,
        metadataJson,
        titleNormalized,
        contentPreview,
        wordCount,
      ]
    );
  }

  async removeRecord(recordId: string, recordType: string): Promise<void> {
    // Delete from search_index table (FTS5 trigger will handle FTS5 table)
    await this.adapter.execute(
      'DELETE FROM search_index WHERE record_id = ? AND record_type = ?',
      [recordId, recordType]
    );

    // Clear search cache to ensure removed records don't appear in cached results
    // We clear the entire cache since we can't easily determine which queries
    // might have included this record
    this.searchCache.clear();
  }

  /**
   * Build ORDER BY clause for search queries with kind priority and user sort
   */
  private buildSearchOrderBy(sort: string = 'relevance'): string {
    // Kind priority for tiebreaking
    const kindPriority = `CASE 
      WHEN json_extract(si.metadata, '$.kind') = 'root' THEN 3
      WHEN json_extract(si.metadata, '$.kind') = 'chapter' THEN 2
      ELSE 1
    END`;

    // User sort clause
    if (sort === 'relevance') {
      // For relevance: prioritize relevance score first, then kind priority as tiebreaker
      return `ORDER BY composite_relevance_score DESC, ${kindPriority} ASC, si.updated_at DESC`;
    } else {
      // For other sorts: kind priority first (maintains document hierarchy)
      let userSort = '';
      switch (sort) {
        case 'updated_desc':
          userSort = 'si.updated_at DESC, r.created_at DESC';
          break;
        case 'created_desc':
          userSort = 'r.created_at DESC';
          break;
        case 'title_asc':
          userSort = 'LOWER(si.title) ASC, r.created_at DESC';
          break;
        case 'title_desc':
          userSort = 'LOWER(si.title) DESC, r.created_at DESC';
          break;
        default:
          // Default to relevance
          return `ORDER BY composite_relevance_score DESC, ${kindPriority} ASC, si.updated_at DESC`;
      }
      return `ORDER BY ${kindPriority} ASC, ${userSort}`;
    }
  }

  /**
   * Build search SQL with relevance scoring
   */
  private buildSearchSQL(
    ftsQuery: string,
    options: {
      type?: string;
      status?: string;
      limit: number;
      offset: number;
      sort?: string;
      parsedQuery?: ReturnType<typeof parseSearchQuery>;
      titleBoostTerm?: string;
    }
  ): {
    query: string;
    params: any[];
    countQuery: string;
    countParams: any[];
  } {
    const {
      type,
      status,
      limit,
      offset,
      sort = 'relevance',
      titleBoostTerm = '',
    } = options;

    let params: any[] = [ftsQuery];
    let countParams: any[] = [ftsQuery];

    // Build WHERE clause
    let whereClause = `
      search_index_fts5 MATCH ?
      AND (r.workflow_state IS NULL OR r.workflow_state != ?)
    `;
    params.push('internal_only');
    countParams.push('internal_only');

    if (type) {
      const typeFilters = type.split(',').map((t) => t.trim());
      if (typeFilters.length === 1) {
        whereClause += ' AND si.record_type = ?';
        params.push(typeFilters[0]);
        countParams.push(typeFilters[0]);
      } else {
        const placeholders = typeFilters.map(() => '?').join(',');
        whereClause += ` AND si.record_type IN (${placeholders})`;
        params.push(...typeFilters);
        countParams.push(...typeFilters);
      }
    }

    if (status) {
      whereClause += ' AND r.status = ?';
      params.push(status);
      countParams.push(status);
    }

    // Main query with relevance scoring
    const query = `
      SELECT 
        si.record_id as id,
        si.record_id,
        si.record_type,
        si.title,
        si.content,
        si.tags,
        si.metadata,
        r.status,
        r.created_at,
        r.updated_at,
        
        -- BM25 relevance score (built into FTS5)
        bm25(search_index_fts5) as relevance_score,
        
        -- Field match score (weighted: title 10x, tags 5x, content 1x)
        -- Note: FTS5 MATCH can't be used in CASE statements, so we approximate
        -- by using BM25 score as a proxy (title matches naturally score higher)
        0 as field_match_score,
        
        -- Recency score (0-1, newer = higher)
        CASE 
          WHEN julianday('now') - julianday(si.updated_at) < 365 THEN
            1.0 - (julianday('now') - julianday(si.updated_at)) / 365.0
          ELSE 0.0
        END as recency_score,
        
        -- Type priority (bylaw=10, article=8, chapter=6, etc.)
        CASE si.record_type
          WHEN 'bylaw' THEN 10
          WHEN 'article' THEN 8
          WHEN 'chapter' THEN 6
          ELSE 5
        END as type_priority_score,
        
        -- Status priority (published=10, approved=9, draft=5, archived=1)
        CASE COALESCE(r.status, 'published')
          WHEN 'published' THEN 10
          WHEN 'approved' THEN 9
          WHEN 'draft' THEN 5
          WHEN 'archived' THEN 1
          ELSE 5
        END as status_priority_score,
        
        -- Excerpt (snippet with highlights)
        snippet(
          search_index_fts5,
          2,  -- content column
          '<mark>',
          '</mark>',
          '...',
          32
        ) as excerpt,
        
        -- Kind priority for sorting (record=1, chapter=2, root=3)
        CASE 
          WHEN json_extract(si.metadata, '$.kind') = 'root' THEN 3
          WHEN json_extract(si.metadata, '$.kind') = 'chapter' THEN 2
          ELSE 1
        END as kind_priority,
        
        -- Composite relevance score (for relevance sort)
        -- Note: Title boost removed - BM25 already favors title matches naturally
        (
          bm25(search_index_fts5) * 0.80 +
          CASE 
            WHEN julianday('now') - julianday(si.updated_at) < 365 THEN
              (1.0 - (julianday('now') - julianday(si.updated_at)) / 365.0)
            ELSE 0.0
          END * 0.10 +
          CASE si.record_type
            WHEN 'bylaw' THEN 10
            WHEN 'article' THEN 8
            WHEN 'chapter' THEN 6
            ELSE 5
          END * 0.05 +
          CASE COALESCE(r.status, 'published')
            WHEN 'published' THEN 10
            WHEN 'approved' THEN 9
            WHEN 'draft' THEN 5
            WHEN 'archived' THEN 1
            ELSE 5
          END * 0.05
        ) as composite_relevance_score

      FROM search_index_fts5
      INNER JOIN search_index si ON search_index_fts5.rowid = si.rowid
      INNER JOIN records r ON si.record_id = r.id
      WHERE ${whereClause}
      ${this.buildSearchOrderBy(sort)}
      LIMIT ? OFFSET ?
    `;

    // Add limit and offset
    params.push(limit, offset);

    // Count query
    const countQuery = `
      SELECT COUNT(*) as count
      FROM search_index_fts5
      INNER JOIN search_index si ON search_index_fts5.rowid = si.rowid
      INNER JOIN records r ON si.record_id = r.id
      WHERE ${whereClause}
    `;

    return { query, params, countQuery, countParams };
  }

  /**
   * Map database row to SearchResult
   */
  private mapRowToSearchResult(row: any): SearchResult {
    let metadata: any = null;
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata);
      } catch {
        metadata = null;
      }
    }

    return {
      id: row.id || row.record_id,
      record_id: row.record_id,
      record_type: row.record_type,
      title: row.title,
      content: row.content,
      tags: row.tags,
      metadata,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      relevance_score: row.relevance_score || 0,
      field_match_score: row.field_match_score || 0,
      recency_score: row.recency_score || 0,
      type_priority_score: row.type_priority_score || 0,
      status_priority_score: row.status_priority_score || 0,
      excerpt: row.excerpt,
    };
  }

  /**
   * Normalize text for accent-insensitive search
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD') // Decompose accented characters
      .replace(/[\u0300-\u036f]/g, ''); // Remove diacritics
  }
}
