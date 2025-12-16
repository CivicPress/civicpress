# Sort API Enhancement Specification

**Version**: 1.0.0  
**Status**: Draft  
**Created**: 2025-01-27  
**Related Specs**: [`api.md`](./api.md), [`search.md`](./search.md)

---

## Overview

This specification defines the sort parameter enhancement for the CivicPress
Records and Search APIs, enabling database-level sorting with proper kind
priority handling.

### Goals

1. **Database-Level Sorting**: Move sorting from in-memory to SQL queries for
   performance
2. **Kind Priority Preservation**: Ensure kind priority (record → chapter →
   root) remains primary sort
3. **User Sort Options**: Support multiple sort options as secondary sort within
   kind priority
4. **Backward Compatibility**: Default behavior unchanged when sort parameter
   not provided
5. **Performance**: Maintain sub-100ms query performance with sorting enabled

---

## API Specification

### Records Endpoint Enhancement

**GET** `/api/v1/records`

**New Query Parameter**:

- `sort` (optional): Sort order for results
  - **Allowed Values**: `updated_desc`, `created_desc`, `title_asc`,
    `title_desc`, `relevance`
  - **Default**: `created_desc` (maintains current behavior)
  - **Validation**: Must be one of the allowed values, case-insensitive

**Updated Query Parameters** (existing):

- `type` (optional): Filter by record type (comma-separated)
- `status` (optional): Filter by record status (deprecated - table location
  determines published state)
- `limit` (optional): Max results per page (default: 50, max: 300)
- `page` (optional): Page number (default: 1, min: 1)

**Response** (unchanged structure, adds sort metadata):

```json
{
  "success": true,
  "data": {
    "records": [...],
    "totalCount": 42,
    "currentPage": 1,
    "totalPages": 1,
    "pageSize": 50,
    "sort": "updated_desc"
  },
  "meta": {
    "operation": "list_records",
    "sort": "updated_desc",
    "kindPriority": true
  }
}
```

### Search Endpoint Enhancement

**GET** `/api/v1/search`

**New Query Parameter**:

- `sort` (optional): Sort order for search results
  - **Allowed Values**: `relevance`, `updated_desc`, `created_desc`,
    `title_asc`, `title_desc`
  - **Default**: `relevance` (maintains current relevance-first behavior)
  - **Validation**: Must be one of the allowed values, case-insensitive
  - **Special Behavior**: When `sort=relevance`, uses existing relevance scoring
    system

**Updated Query Parameters** (existing):

- `q` (required): Search query string
- `type` (optional): Filter by record type (comma-separated)
- `status` (optional): Filter by record status (deprecated - table location
  determines published state)
- `limit` (optional): Max results per page (default: 50, max: 300)
- `page` (optional): Page number (default: 1, min: 1)

**Response** (unchanged structure, adds sort metadata):

```json
{
  "success": true,
  "data": {
    "results": [...],
    "totalCount": 42,
    "currentPage": 1,
    "totalPages": 1,
    "pageSize": 50,
    "query": "budget 2024",
    "sort": "relevance"
  },
  "meta": {
    "operation": "search_records",
    "sort": "relevance",
    "kindPriority": true,
    "took": 45
  }
}
```

---

## Sort Options Specification

### Sort Option Definitions

#### 1. `updated_desc` (Most Recently Updated First)

**Use Case**: Show recently modified records first

**SQL Implementation**:

```sql
ORDER BY
  kind_priority ASC,
  updated_at DESC,
  created_at DESC
```

**Behavior**:

- Primary: Kind priority (record=1, chapter=2, root=3)
- Secondary: Most recently updated first
- Tertiary: Most recently created first (tie-breaker)

#### 2. `created_desc` (Most Recently Created First) - Default

**Use Case**: Show newest records first (default behavior)

**SQL Implementation**:

```sql
ORDER BY
  kind_priority ASC,
  created_at DESC
```

**Behavior**:

- Primary: Kind priority (record=1, chapter=2, root=3)
- Secondary: Most recently created first

#### 3. `title_asc` (Alphabetical by Title)

**Use Case**: Alphabetical browsing

**SQL Implementation**:

```sql
ORDER BY
  kind_priority ASC,
  title ASC COLLATE NOCASE,
  created_at DESC
```

**Behavior**:

- Primary: Kind priority (record=1, chapter=2, root=3)
- Secondary: Title A-Z (case-insensitive)
- Tertiary: Most recently created first (tie-breaker)

#### 4. `title_desc` (Reverse Alphabetical by Title)

**Use Case**: Reverse alphabetical browsing

**SQL Implementation**:

```sql
ORDER BY
  kind_priority ASC,
  title DESC COLLATE NOCASE,
  created_at DESC
```

**Behavior**:

- Primary: Kind priority (record=1, chapter=2, root=3)
- Secondary: Title Z-A (case-insensitive)
- Tertiary: Most recently created first (tie-breaker)

#### 5. `relevance` (Relevance Score - Search Only)

**Use Case**: Best matches first (search endpoint only)

**SQL Implementation** (for search):

```sql
ORDER BY
  kind_priority ASC,
  relevance_score DESC,
  updated_at DESC
```

**Behavior**:

- **Search Endpoint**: Uses existing relevance scoring (BM25 + composite score)
- **Records Endpoint**: Falls back to `created_desc` (relevance not applicable
  without query)
- Primary: Kind priority (record=1, chapter=2, root=3)
- Secondary: Highest relevance score first
- Tertiary: Most recently updated first (tie-breaker)

---

## Kind Priority Specification

### Kind Priority Calculation

**Definition**: Kind priority determines the primary sort order, ensuring
records appear before chapters, which appear before root documents.

**Priority Values**:

- `record` (no kind or kind=null): Priority 1 (appears first)
- `chapter`: Priority 2 (appears second)
- `root`: Priority 3 (appears last)

**SQL Implementation**:

```sql
CASE
  WHEN json_extract(metadata, '$.kind') = 'root' THEN 3
  WHEN json_extract(metadata, '$.kind') = 'chapter' THEN 2
  ELSE 1
END as kind_priority
```

**PostgreSQL Implementation**:

```sql
CASE
  WHEN metadata->>'kind' = 'root' THEN 3
  WHEN metadata->>'kind' = 'chapter' THEN 2
  ELSE 1
END as kind_priority
```

**Edge Cases**:

- Missing metadata: Treated as record (priority 1)
- Invalid kind value: Treated as record (priority 1)
- Nested metadata paths: Check both `metadata.kind` and `metadata.metadata.kind`

---

## Validation & Error Handling

### Input Validation

**Sort Parameter Validation**:

```typescript
query('sort')
  .optional()
  .isIn(['updated_desc', 'created_desc', 'title_asc', 'title_desc', 'relevance'])
  .withMessage('Sort must be one of: updated_desc, created_desc, title_asc, title_desc, relevance')
  .customSanitizer((value) => value?.toLowerCase())
```

**Error Responses**:

**Invalid Sort Value** (400 Bad Request):

```json
{
  "success": false,
  "error": {
    "message": "Invalid sort parameter",
    "code": "INVALID_SORT",
    "details": "Sort must be one of: updated_desc, created_desc, title_asc, title_desc, relevance",
    "provided": "invalid_sort"
  }
}
```

**Relevance Sort on Records Endpoint** (400 Bad Request):

```json
{
  "success": false,
  "error": {
    "message": "Relevance sort not available for records listing",
    "code": "INVALID_SORT_CONTEXT",
    "details": "Relevance sort is only available for search endpoint",
    "suggestion": "Use updated_desc, created_desc, title_asc, or title_desc"
  }
}
```

### Backward Compatibility

**Default Behavior** (sort parameter not provided):

- **Records Endpoint**: `created_desc` (unchanged)
- **Search Endpoint**: `relevance` (unchanged)

**Migration Path**:

- Existing API clients continue to work without changes
- New clients can opt-in to new sort options
- No breaking changes to response structure

---

## Performance Considerations

### Database Index Requirements

**Required Indexes**:

```sql
-- For updated_desc sort
CREATE INDEX IF NOT EXISTS idx_records_updated_at ON records(updated_at DESC);

-- For created_desc sort (likely already exists)
CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at DESC);

-- For title sorts
CREATE INDEX IF NOT EXISTS idx_records_title ON records(title COLLATE NOCASE);

-- Composite index for kind_priority + sort combinations
CREATE INDEX IF NOT EXISTS idx_records_kind_updated ON records(
  (CASE WHEN json_extract(metadata, '$.kind') = 'root' THEN 3
        WHEN json_extract(metadata, '$.kind') = 'chapter' THEN 2
        ELSE 1 END),
  updated_at DESC
);
```

**Performance Targets**:

- **P50**: < 50ms (with indexes)
- **P95**: < 100ms (with indexes)
- **P99**: < 200ms (with indexes)

**Query Optimization**:

- Use EXPLAIN QUERY PLAN to verify index usage
- Ensure kind_priority calculation uses index when possible
- Consider materialized kind_priority column for very large datasets

---

## Security Considerations

### Input Sanitization

**SQL Injection Prevention**:

- Sort parameter values are whitelisted (not user-provided SQL)
- Use parameterized queries for all database operations
- Validate sort parameter against allowed values before SQL construction

**Authorization**:

- Sort parameter does not affect record visibility
- Same permission checks apply regardless of sort option
- Public users see same records, just in different order

### Rate Limiting

- Sort parameter does not change rate limit behavior
- Same rate limits apply to sorted and unsorted queries
- Consider slightly higher limits for sorted queries if performance allows

---

## Testing Requirements

### Unit Tests

**Sort Parameter Validation**:

- [ ] Valid sort values accepted (case-insensitive)
- [ ] Invalid sort values rejected with 400 error
- [ ] Missing sort parameter uses default
- [ ] Relevance sort rejected on records endpoint

**SQL Query Generation**:

- [ ] Each sort option generates correct ORDER BY clause
- [ ] Kind priority always first in ORDER BY
- [ ] Correct indexes used for each sort option
- [ ] Case-insensitive title sorting works correctly

### Integration Tests

**Records Endpoint**:

- [ ] Default sort (created_desc) returns same results as before
- [ ] updated_desc returns most recently updated first
- [ ] title_asc returns alphabetical order
- [ ] title_desc returns reverse alphabetical order
- [ ] Kind priority preserved in all sort options
- [ ] Pagination works correctly with all sort options

**Search Endpoint**:

- [ ] Default sort (relevance) returns same results as before
- [ ] Relevance sort uses existing relevance scoring
- [ ] Non-relevance sorts work correctly for search
- [ ] Kind priority preserved in all sort options
- [ ] Pagination works correctly with all sort options

**Edge Cases**:

- [ ] Empty result sets return correct structure
- [ ] Records with missing metadata handled correctly
- [ ] Records with invalid kind values handled correctly
- [ ] Very large result sets (1000+ records) perform acceptably
- [ ] Concurrent requests with different sort options work correctly

### Performance Tests

- [ ] Query performance meets targets (P50 < 50ms, P95 < 100ms)
- [ ] Index usage verified with EXPLAIN QUERY PLAN
- [ ] No performance regression from in-memory sorting removal
- [ ] Large dataset (10K+ records) queries complete in < 200ms

---

## Implementation Details

### Database Query Modifications

**Records Listing Query** (simplified):

```sql
SELECT
  r.*,
  CASE
    WHEN json_extract(r.metadata, '$.kind') = 'root' THEN 3
    WHEN json_extract(r.metadata, '$.kind') = 'chapter' THEN 2
    ELSE 1
  END as kind_priority
FROM records r
WHERE [filters]
ORDER BY
  kind_priority ASC,
  [user_sort_clause],
  created_at DESC
LIMIT ? OFFSET ?
```

**Search Query** (simplified):

```sql
SELECT
  si.*,
  r.*,
  bm25(search_index_fts5) as relevance_score,
  CASE
    WHEN json_extract(r.metadata, '$.kind') = 'root' THEN 3
    WHEN json_extract(r.metadata, '$.kind') = 'chapter' THEN 2
    ELSE 1
  END as kind_priority
FROM search_index_fts5
INNER JOIN search_index si ON search_index_fts5.rowid = si.rowid
INNER JOIN records r ON si.record_id = r.id
WHERE [search_conditions]
ORDER BY
  kind_priority ASC,
  [user_sort_clause],
  updated_at DESC
LIMIT ? OFFSET ?
```

### Service Layer Changes

**RecordsService.listRecords()**:

- Remove in-memory sort by kind priority
- Pass sort parameter to database query
- Return sort metadata in response

**RecordsService.searchRecords()**:

- Remove in-memory sort by kind priority
- Pass sort parameter to search query
- Handle relevance sort specially (use existing relevance_score)
- Return sort metadata in response

---

## Migration Strategy

### Phase 1: Database Schema (No Downtime)

1. Add database indexes for new sort options
2. Verify index creation completes successfully
3. Test query performance with new indexes

### Phase 2: API Implementation (Backward Compatible)

1. Add sort parameter validation to API routes
2. Update service layer to pass sort to database queries
3. Update database queries to use sort parameter
4. Remove in-memory sorting logic
5. Add sort metadata to API responses

### Phase 3: Testing & Validation

1. Run full test suite
2. Performance testing with new sort options
3. Verify backward compatibility (default behavior unchanged)
4. Load testing with concurrent requests

### Phase 4: Documentation & Deployment

1. Update API documentation
2. Update OpenAPI/Swagger specs (if applicable)
3. Deploy to production
4. Monitor performance metrics

---

## Open Questions & Decisions Needed

### 1. Case Sensitivity

**Question**: Should title sorting be case-sensitive or case-insensitive?

**Recommendation**: Case-insensitive (use `COLLATE NOCASE` in SQLite, `LOWER()`
in PostgreSQL)

**Rationale**: More user-friendly, matches typical alphabetical sorting
expectations

### 2. Relevance Sort on Records Endpoint

**Question**: Should `relevance` sort be available on `/api/v1/records`
endpoint?

**Recommendation**: No - relevance requires a search query. Return 400 error if
attempted.

**Rationale**: Relevance scoring requires search query context. Records listing
has no query.

### 3. Sort Parameter Case Sensitivity

**Question**: Should sort parameter values be case-sensitive?

**Recommendation**: Case-insensitive (normalize to lowercase)

**Rationale**: More user-friendly, follows REST API best practices

### 4. Future Sort Options

**Question**: Should we plan for additional sort options (e.g., `author_asc`,
`status_asc`)?

**Recommendation**: Defer to future enhancement. Current set covers primary use
cases.

**Rationale**: Keep initial implementation focused. Can add more options later
based on user feedback.

---

## Related Specifications

- [`api.md`](./api.md) — REST API design and endpoints
- [`search.md`](./search.md) — Search system and relevance scoring
- [`records.md`](./records.md) — Record data structure and metadata

---

## History

- **Drafted**: 2025-01-27
- **Status**: Draft - Pending review and approval
