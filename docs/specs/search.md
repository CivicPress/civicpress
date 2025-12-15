# CivicPress Search Specification

**Version**: 2.0.0  
**Status**: Implemented  
**Created**: 2025-12-14  
**Previous Version**: v1.0.0 (see git history for v1.0.0 spec)

---

## Overview

This specification defines the next-generation search system for CivicPress,
designed to achieve Google-quality search results while maintaining the
local-first, self-hosted philosophy.

### Goals

1. **Relevance First**: Results ranked by true relevance, not just recency
2. **Performance**: Sub-100ms search, sub-50ms suggestions
3. **Scalability**: PostgreSQL-first (long-term default), SQLite compatible
   (dev/default)
4. **Zero External Dependencies**: Self-hosted, optional enhancements available
5. **Complete Database Abstraction**: Seamlessly switch between SQLite and
   PostgreSQL

---

## Architecture Decision

### Primary: PostgreSQL Full-Text Search (FTS)

PostgreSQL is the **long-term default** database. The search system is designed
primarily for PostgreSQL FTS with `pg_trgm` extension for typo tolerance and
accent-insensitive matching.

### Secondary: SQLite FTS5

SQLite remains the **development and small-deployment default**. SQLite FTS5
provides good search capabilities but with limitations:

- No native typo tolerance (can add Levenshtein later)
- Limited accent-insensitive support (unicode61 tokenizer helps)
- Performance degrades with > 100K records

### Implementation Strategy

The search system uses a **database adapter pattern**:

- PostgreSQL adapter: Uses native FTS with `ts_vector`, `ts_query`, `ts_rank`,
  and `pg_trgm`
- SQLite adapter: Uses FTS5 virtual tables with BM25 ranking

---

## Feature Priorities

### Phase 1: MVP (Week 1-2) - Critical

1. **✅ Relevance Ranking** - Fix current issues
   - Weighted scoring (title 10x, tags 5x, content 1x)
   - BM25/ts_rank relevance algorithms
   - Composite scoring with recency, type, status

2. **✅ Fast Suggestions/Autocomplete** - Critical for UX
   - Dedicated lightweight suggestions query
   - In-memory caching (5min TTL)
   - Batch fetching (no N+1 queries)

3. **✅ Search Result Highlighting** - Basic MVP
   - Highlight matched terms in titles
   - Mark matched terms with HTML tags

### Phase 2: Enhancement (Week 3-4) - High Priority

4. **✅ Typo Tolerance** - If not too complex
   - PostgreSQL: `pg_trgm` extension (simple, native)
   - SQLite: Skip for MVP (can add Levenshtein later)
   - Apply to suggestions only initially (less work than full search)

5. **✅ Accent-Insensitive Search** - Almost a must
   - PostgreSQL: `unaccent` extension or `pg_trgm`
   - SQLite: unicode61 tokenizer (limited support)
   - MVP: Basic accent normalization

### Phase 3: Advanced (Week 5-6) - Medium Priority

6. **✅ Multi-word Query Support**
   - Parse multiple words
   - AND/OR operator support
   - Phrase matching with quotes

7. **✅ Search Excerpts/Snippets**
   - Extract 150-char context around matches
   - Show match highlights in excerpts
   - PostgreSQL: `ts_headline()` function
   - SQLite: Custom substring extraction

8. **✅ Enhanced Faceted Filtering**
   - Already have basic filtering
   - Add count aggregation
   - Show result counts per facet

---

## Database Schema

### SQLite FTS5 Schema

```sql
-- Main search index table
CREATE TABLE IF NOT EXISTS search_index (
  record_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  tags TEXT,
  metadata TEXT,
  title_normalized TEXT,
  content_preview TEXT,
  word_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (record_id, record_type)
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS search_index_fts5 USING fts5(
  record_id UNINDEXED,
  record_type UNINDEXED,
  title,
  content,
  tags,
  title_normalized,
  content_preview,
  content_rowid=rowid,
  content='search_index',
  content_rowid='rowid'
);

-- Triggers to sync search_index -> search_index_fts5
CREATE TRIGGER IF NOT EXISTS search_index_fts5_insert AFTER INSERT ON search_index BEGIN
  INSERT INTO search_index_fts5(rowid, record_id, record_type, title, content, tags, title_normalized, content_preview)
  VALUES (new.rowid, new.record_id, new.record_type, new.title, new.content, new.tags, new.title_normalized, new.content_preview);
END;

CREATE TRIGGER IF NOT EXISTS search_index_fts5_delete AFTER DELETE ON search_index BEGIN
  INSERT INTO search_index_fts5(search_index_fts5, rowid, record_id, record_type, title, content, tags, title_normalized, content_preview)
  VALUES ('delete', old.rowid, old.record_id, old.record_type, old.title, old.content, old.tags, old.title_normalized, old.content_preview);
END;

CREATE TRIGGER IF NOT EXISTS search_index_fts5_update AFTER UPDATE ON search_index BEGIN
  INSERT INTO search_index_fts5(search_index_fts5, rowid, record_id, record_type, title, content, tags, title_normalized, content_preview)
  VALUES ('delete', old.rowid, old.record_id, old.record_type, old.title, old.content, old.tags, old.title_normalized, old.content_preview);
  INSERT INTO search_index_fts5(rowid, record_id, record_type, title, content, tags, title_normalized, content_preview)
  VALUES (new.rowid, new.record_id, new.record_type, new.title, new.content, new.tags, new.title_normalized, new.content_preview);
END;
```

### PostgreSQL Schema

```sql
-- Main search index table
CREATE TABLE IF NOT EXISTS search_index (
  record_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  tags TEXT,
  metadata JSONB,
  title_normalized TEXT,
  content_preview TEXT,
  word_count INTEGER,
  search_vector tsvector,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (record_id, record_type)
);

-- Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_search_index_search_vector ON search_index USING GIN (search_vector);

-- Create triggers to auto-update tsvector
CREATE OR REPLACE FUNCTION update_search_vector() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.tags, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER search_index_search_vector_update
  BEFORE INSERT OR UPDATE ON search_index
  FOR EACH ROW EXECUTE FUNCTION update_search_vector();

-- Install required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
```

---

## API Specification

### Search Endpoint

**GET** `/api/v1/search`

**Query Parameters**:

- `q` (required): Search query string
- `type` (optional): Filter by record type (comma-separated)
- `status` (optional): Filter by record status
- `limit` (optional): Max results (default: 20, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response**:

```json
{
  "results": [
    {
      "record": {
        "id": "bylaw-123",
        "title": "Budget 2024",
        "type": "bylaw",
        "status": "approved"
      },
      "relevance": 0.95,
      "excerpt": "The <mark>budget</mark> for 2024 includes...",
      "highlightedTitle": "<mark>Budget</mark> 2024"
    }
  ],
  "total": 42,
  "facets": {
    "type": {
      "bylaw": 30,
      "policy": 12
    },
    "status": {
      "approved": 28,
      "draft": 14
    }
  },
  "query": "budget 2024",
  "took": 45
}
```

### Suggestions Endpoint

**GET** `/api/v1/search/suggestions`

**Query Parameters**:

- `q` (required): Query string (minimum 2 characters)
- `limit` (optional): Max suggestions (default: 10, max: 50)

**Response**:

```json
{
  "suggestions": [
    {
      "text": "Budget 2024",
      "type": "title",
      "recordType": "bylaw"
    },
    {
      "text": "budget",
      "type": "tag"
    }
  ],
  "query": "budget",
  "took": 12
}
```

---

## Query Parsing

### Supported Query Formats

1. **Single Word**: `budget`
2. **Multiple Words**: `budget 2024` (AND by default)
3. **Quoted Phrase**: `"budget 2024"` (exact phrase)
4. **OR Operator**: `budget OR finance`
5. **AND Operator**: `budget AND 2024`
6. **Complex**: `("budget 2024" OR finance) AND approved`

### Query Normalization

- Lowercase conversion
- Accent normalization (é → e, ç → c)
- Whitespace trimming
- Special character handling

---

## Relevance Scoring

### Composite Score Formula

```
final_score = (
  relevance_score * 0.6 +
  recency_score * 0.2 +
  type_score * 0.1 +
  status_score * 0.1
)
```

### Relevance Score (BM25)

- **Title matches**: 10x weight
- **Tag matches**: 5x weight
- **Content matches**: 1x weight

### Recency Score

```
recency_score = 1 - (days_old / 365)
```

### Type Score

Predefined weights per record type (configurable).

### Status Score

Predefined weights per status (e.g., "approved" > "draft").

---

## Implementation Details

### SearchService Interface

```typescript
interface SearchService {
  search(
    query: string,
    options: SearchOptions
  ): Promise<SearchResponse>;

  getSuggestions(
    query: string,
    options?: SuggestionOptions
  ): Promise<SearchSuggestions>;

  indexRecord(record: IndexRecordData): Promise<void>;

  removeRecord(recordId: string, recordType: string): Promise<void>;
}
```

### SQLiteSearchService

- Uses FTS5 virtual tables
- BM25 ranking via `bm25()` function
- JavaScript-based typo tolerance (Levenshtein distance)
- Accent-insensitive via normalization

### PostgresSearchService (Future)

- Uses `ts_vector` and `ts_query`
- `ts_rank()` for relevance
- `pg_trgm` for typo tolerance
- `unaccent` for accent-insensitive search

---

## Performance Targets

### Search Queries

- **P50**: < 50ms
- **P95**: < 100ms
- **P99**: < 200ms

### Suggestions

- **P50**: < 20ms
- **P95**: < 50ms
- **P99**: < 100ms

### Indexing

- **Single Record**: < 10ms
- **Batch**: < 1 minute for full reindex (10K records)

---

## Testing Strategy

### Performance Testing

- Load test with realistic queries
- Measure P50/P95/P99 latencies
- Verify caching effectiveness

### Relevance Testing

- Test queries with expected results
- Verify ranking quality
- A/B test relevance improvements

### Integration Testing

- Test with both SQLite and PostgreSQL
- Verify database abstraction works
- Test error handling and fallbacks

---

## Migration Strategy

### For New Installations

- FTS5 tables/triggers created automatically on initialization
- No migration needed

### For Existing Installations

1. Run schema migrations (adds FTS5 support)
2. Reindex existing records using CLI:

   ```bash
   civic index --sync-db --rebuild
   ```

3. Verify search functionality

---

## Security Considerations

- Only public records indexed for public UI
- Private records may have separate access-controlled search
- API must respect authentication and permissions
- Index generation should warn on broken/missing metadata

---

## Future Enhancements

### Short Term (3-6 months)

- PostgreSQL implementation with native typo tolerance
- Advanced faceting (date ranges, numeric ranges)
- Search analytics and popular queries
- Custom ranking weights per instance

### Medium Term (6-12 months)

- Multi-language stemming (French/English)
- Search result personalization
- Search query suggestions based on past searches
- Advanced filters (geography, date ranges)

### Long Term (12+ months)

- Optional Meilisearch integration (for advanced features)
- Federated search across instances
- Machine learning relevance tuning
- Voice search support

---

## Open Issues

1. **SQLite Typo Tolerance**: Currently implemented via JavaScript Levenshtein
   distance. PostgreSQL will have native support via `pg_trgm`.

2. **Multi-language Stemming**: Basic support via FTS tokenizers. Advanced
   stemming (French/English) deferred to future.

3. **Meilisearch Integration**: Documented as optional future enhancement. Not
   required for MVP.

---

## References

- [PostgreSQL Full-Text Search Documentation](https://www.postgresql.org/docs/current/textsearch.html)
- [PostgreSQL pg_trgm Extension](https://www.postgresql.org/docs/current/pgtrgm.html)
- [SQLite FTS5 Documentation](https://www.sqlite.org/fts5.html)

---

## Related Specifications

- [`indexing.md`](./indexing.md) — File indexing and metadata extraction
- [`manifest.md`](./manifest.md) — Record metadata and frontmatter
- [`api.md`](./api.md) — Search API endpoints
