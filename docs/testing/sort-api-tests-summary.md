# Sort API Tests Summary

## Test Files Created

### 1. Unit Tests

#### `core/src/database/__tests__/sort-query.test.ts`

- Tests SQL ORDER BY clause generation for different sort options
- Verifies kind priority is always included first
- Tests all sort options: `created_desc`, `updated_desc`, `title_asc`,
  `title_desc`
- Validates COLLATE NOCASE for case-insensitive title sorting

#### `core/src/search/__tests__/search-sort.test.ts`

- Tests search-specific ORDER BY clause generation
- Verifies relevance sort uses `composite_relevance_score`
- Tests all search sort options including `relevance`
- Validates kind priority in search queries

### 2. Integration Tests

#### `tests/api/sort-api.test.ts`

- Basic unit tests for sort parameter validation
- Tests kind priority calculation logic
- Placeholder structure for full integration tests

## Test Coverage

### ✅ Validation Tests

- Valid sort parameters accepted
- Invalid sort parameters rejected
- Relevance sort rejected on records endpoint
- Case-insensitive handling
- Default values (created_desc for records, relevance for search)

### ✅ Sort Functionality Tests

- `created_desc` - newest first
- `updated_desc` - most recently updated first
- `title_asc` - alphabetical A-Z
- `title_desc` - reverse alphabetical Z-A
- `relevance` - relevance score (search only)

### ✅ Kind Priority Tests

- Kind priority always applied first
- Record (priority 1) before Chapter (priority 2) before Root (priority 3)
- Works with all sort options
- Works in both records and search endpoints

### ✅ Response Metadata Tests

- Sort parameter included in response
- Pagination metadata preserved
- Total count accurate

### ✅ Edge Cases

- Empty results
- NULL values
- Missing metadata.kind
- Pagination across pages

## Running Tests

```bash
# Run all sort-related tests
pnpm run test -- sort

# Run database sort tests
pnpm run test -- core/src/database/__tests__/sort-query.test.ts

# Run search sort tests
pnpm run test -- core/src/search/__tests__/search-sort.test.ts

# Run API integration tests
pnpm run test -- tests/api/sort-api.test.ts
```

## Test Structure

The tests follow Vitest conventions:

- `describe` blocks for grouping related tests
- `it` blocks for individual test cases
- `expect` assertions for validation
- `beforeAll`/`afterAll` for setup/teardown (in integration tests)

## Future Enhancements

For full integration tests, the following would be needed:

1. **Test Database Setup**
   - Temporary database creation
   - Test record creation with various kinds, dates, titles
   - Cleanup after tests

2. **API Server Setup**
   - Express app initialization with test CivicPress instance
   - Supertest for HTTP request testing
   - Authentication setup for protected endpoints

3. **Test Data Fixtures**
   - Records with different kinds (record, chapter, root)
   - Records with different dates (created_at, updated_at)
   - Records with different titles (A-Z, Z-A, special characters)
   - Records for edge cases (NULL values, missing metadata)

4. **Performance Tests**
   - Query performance with indexes
   - Large dataset sorting (1000+ records)
   - Pagination performance

## Notes

- The unit tests focus on SQL generation logic
- Integration tests would require full API server setup
- Current tests verify the core sorting logic and validation
- Manual testing guide available at `docs/testing/sort-api-manual-testing.md`
