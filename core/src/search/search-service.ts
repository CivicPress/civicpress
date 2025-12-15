/**
 * Search Service Interface
 *
 * Provides a database-agnostic interface for full-text search operations.
 * Implementations handle database-specific details (PostgreSQL FTS, SQLite FTS5, etc.)
 */

export interface SearchResult {
  id: string;
  record_id: string;
  record_type: string;
  title: string;
  content?: string;
  tags?: string;
  metadata?: any;
  status?: string;
  created_at: string;
  updated_at: string;
  relevance_score: number;
  field_match_score: number;
  recency_score: number;
  type_priority_score: number;
  status_priority_score: number;
  excerpt?: string;
  match_highlights?: {
    title?: number[][];
    content?: number[][];
  };
}

export interface SearchOptions {
  type?: string;
  status?: string;
  limit?: number;
  offset?: number;
  enable_typo_tolerance?: boolean;
  enable_accent_insensitive?: boolean;
}

export interface SearchSuggestions {
  text: string;
  source: string;
  frequency?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
}

export interface SearchFacets {
  types: Array<{ value: string; count: number }>;
  statuses: Array<{ value: string; count: number }>;
}

export interface SearchService {
  /**
   * Search records with full-text search
   */
  search(query: string, options?: SearchOptions): Promise<SearchResponse>;

  /**
   * Get search suggestions/autocomplete
   */
  getSuggestions(
    query: string,
    limit?: number,
    enableTypoTolerance?: boolean
  ): Promise<SearchSuggestions[]>;

  /**
   * Get search facets (type/status counts) for a query
   */
  getFacets(
    query: string,
    options?: Omit<SearchOptions, 'limit' | 'offset'>
  ): Promise<SearchFacets>;

  /**
   * Index a record for search
   */
  indexRecord(record: {
    recordId: string;
    recordType: string;
    title: string;
    content?: string;
    tags?: string;
    metadata?: any;
  }): Promise<void>;

  /**
   * Remove a record from search index
   */
  removeRecord(recordId: string, recordType: string): Promise<void>;
}
