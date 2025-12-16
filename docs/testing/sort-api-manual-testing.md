# Manual Testing Guide: Sort API Enhancement

This guide provides step-by-step instructions for manually testing the sort
functionality in the UI.

## Prerequisites

- CivicPress UI running (typically `http://localhost:3000`)
- Some records in the database (ideally with different:
  - Created dates
  - Updated dates
  - Titles (A-Z variety)
  - Kinds (record, chapter, root)

## Method 1: Browser Dev Tools (Easiest)

### Test Records Listing Endpoint

1. **Open the Records List page** in your browser:
   - Navigate to `http://localhost:3000/records`
   - Or a specific type: `http://localhost:3000/records/bylaw`

2. **Open Browser Dev Tools**:
   - Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows/Linux)
   - Go to the **Network** tab
   - Filter by "Fetch/XHR" to see API calls

3. **Intercept and Modify API Calls**:
   - Look for the API call to `/api/v1/records`
   - Right-click on the request → **Copy** → **Copy as cURL**
   - Or use the **Edit and Resend** feature (Firefox) / **Copy** → **Copy as
     fetch** (Chrome)

4. **Test Different Sort Options**:

   **Test `created_desc` (default)**:

   ```
   GET /api/v1/records?page=1&limit=50&sort=created_desc
   ```

   - Verify: Records sorted by creation date (newest first)
   - Verify: Kind priority applied (records before chapters before roots)

   **Test `updated_desc`**:

   ```
   GET /api/v1/records?page=1&limit=50&sort=updated_desc
   ```

   - Verify: Records sorted by updated date (newest first)
   - Verify: Kind priority still applied

   **Test `title_asc`**:

   ```
   GET /api/v1/records?page=1&limit=50&sort=title_asc
   ```

   - Verify: Records sorted alphabetically by title (A-Z)
   - Verify: Kind priority still applied

   **Test `title_desc`**:

   ```
   GET /api/v1/records?page=1&limit=50&sort=title_desc
   ```

   - Verify: Records sorted reverse alphabetically (Z-A)
   - Verify: Kind priority still applied

### Test Search Endpoint

1. **Perform a search** in the UI:
   - Type a search query (e.g., "meeting")
   - Press Enter or click Search

2. **In Dev Tools Network tab**, find the call to `/api/v1/search`

3. **Test Different Sort Options**:

   **Test `relevance` (default for search)**:

   ```
   GET /api/v1/search?q=meeting&page=1&limit=50&sort=relevance
   ```

   - Verify: Results sorted by relevance score (highest first)
   - Verify: Kind priority applied

   **Test `updated_desc` on search**:

   ```
   GET /api/v1/search?q=meeting&page=1&limit=50&sort=updated_desc
   ```

   - Verify: Results sorted by updated date
   - Verify: Kind priority applied

   **Test `title_asc` on search**:

   ```
   GET /api/v1/search?q=meeting&page=1&limit=50&sort=title_asc
   ```

   - Verify: Results sorted alphabetically
   - Verify: Kind priority applied

## Method 2: Direct URL Modification

### For Records Listing

1. Navigate to: `http://localhost:3000/records`
2. Open Dev Tools → Console
3. Run this JavaScript to reload with sort:

   ```javascript
   // Test with different sort options
   const sortOptions = ['created_desc', 'updated_desc', 'title_asc', 'title_desc'];
   sortOptions.forEach(sort => {
     console.log(`Testing sort: ${sort}`);
     // The store will need to be updated to support sort, but you can test the API directly
   });
   ```

### For Search

1. Perform a search in the UI
2. The URL will show the search query
3. You can modify the API call in the Network tab as described above

## Method 3: Using cURL Commands

### Test Records Endpoint

```bash
# Test created_desc (default)
curl "http://localhost:3000/api/v1/records?page=1&limit=10&sort=created_desc" \
  -H "Content-Type: application/json"

# Test updated_desc
curl "http://localhost:3000/api/v1/records?page=1&limit=10&sort=updated_desc" \
  -H "Content-Type: application/json"

# Test title_asc
curl "http://localhost:3000/api/v1/records?page=1&limit=10&sort=title_asc" \
  -H "Content-Type: application/json"

# Test title_desc
curl "http://localhost:3000/api/v1/records?page=1&limit=10&sort=title_desc" \
  -H "Content-Type: application/json"
```

### Test Search Endpoint

```bash
# Test relevance (default for search)
curl "http://localhost:3000/api/v1/search?q=meeting&page=1&limit=10&sort=relevance" \
  -H "Content-Type: application/json"

# Test updated_desc on search
curl "http://localhost:3000/api/v1/search?q=meeting&page=1&limit=10&sort=updated_desc" \
  -H "Content-Type: application/json"

# Test title_asc on search
curl "http://localhost:3000/api/v1/search?q=meeting&page=1&limit=10&sort=title_asc" \
  -H "Content-Type: application/json"
```

## Method 4: Quick Test Script

Create a test file `test-sort.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:3000/api/v1"

echo "Testing Records Endpoint Sort Options..."
echo ""

echo "1. Testing created_desc:"
curl -s "${BASE_URL}/records?page=1&limit=5&sort=created_desc" | jq '.records[] | {title, created_at, metadata: .metadata.kind}' | head -20
echo ""

echo "2. Testing updated_desc:"
curl -s "${BASE_URL}/records?page=1&limit=5&sort=updated_desc" | jq '.records[] | {title, updated_at, metadata: .metadata.kind}' | head -20
echo ""

echo "3. Testing title_asc:"
curl -s "${BASE_URL}/records?page=1&limit=5&sort=title_asc" | jq '.records[] | {title, metadata: .metadata.kind}' | head -20
echo ""

echo "Testing Search Endpoint Sort Options..."
echo ""

echo "4. Testing relevance (search):"
curl -s "${BASE_URL}/search?q=meeting&page=1&limit=5&sort=relevance" | jq '.results[] | {title, metadata: .metadata.kind}' | head -20
echo ""

echo "5. Testing updated_desc (search):"
curl -s "${BASE_URL}/search?q=meeting&page=1&limit=5&sort=updated_desc" | jq '.results[] | {title, updated_at, metadata: .metadata.kind}' | head -20
```

Run with: `chmod +x test-sort.sh && ./test-sort.sh`

## What to Verify

### 1. Sort Order Correctness

For each sort option, verify:

- ✅ Records are sorted according to the specified field
- ✅ Within the same sort value, records maintain consistent order
- ✅ Pagination works correctly (sort order maintained across pages)

### 2. Kind Priority

**Critical**: Kind priority should ALWAYS be applied first, regardless of sort
option:

- ✅ Records with `kind: "record"` (or no kind) appear first
- ✅ Records with `kind: "chapter"` appear second
- ✅ Records with `kind: "root"` appear last

**Test this by**:

1. Creating test records with different kinds
2. Verifying that even if a "root" record has a newer date or comes first
   alphabetically, it still appears after "record" and "chapter" records

### 3. Response Metadata

Check the API response includes:

```json
{
  "records": [...],
  "totalCount": 100,
  "currentPage": 1,
  "totalPages": 2,
  "pageSize": 50,
  "sort": "created_desc"  // ← Should be present
}
```

### 4. Error Handling

Test invalid sort values:

```bash
# Should return 400 error
curl "http://localhost:3000/api/v1/records?sort=invalid_sort" \
  -H "Content-Type: application/json"

# Should return 400 error (relevance not allowed on records endpoint)
curl "http://localhost:3000/api/v1/records?sort=relevance" \
  -H "Content-Type: application/json"
```

Expected error response:

```json
{
  "error": "Invalid sort parameter",
  "code": "INVALID_SORT",
  "details": "Sort must be one of: updated_desc, created_desc, title_asc, title_desc"
}
```

### 5. Case Insensitivity

Test that sort parameter is case-insensitive:

```bash
# These should all work the same
curl "http://localhost:3000/api/v1/records?sort=CREATED_DESC"
curl "http://localhost:3000/api/v1/records?sort=created_desc"
curl "http://localhost:3000/api/v1/records?sort=Created_Desc"
```

### 6. Default Behavior

Test that defaults work:

```bash
# Records endpoint should default to created_desc
curl "http://localhost:3000/api/v1/records"  # No sort parameter

# Search endpoint should default to relevance
curl "http://localhost:3000/api/v1/search?q=test"  # No sort parameter
```

## Visual Verification Checklist

When testing in the UI (after adding sort UI):

- [ ] Records list shows correct sort order
- [ ] Kind priority is visually apparent (records before chapters before roots)
- [ ] Pagination maintains sort order
- [ ] Search results show correct sort order
- [ ] Sort dropdown shows current sort value
- [ ] Changing sort reloads records with new order
- [ ] Loading states work correctly during sort changes

## Performance Verification

For large datasets (1000+ records):

- [ ] Sort queries complete in < 100ms (check Network tab timing)
- [ ] Database indexes are being used (check EXPLAIN QUERY PLAN if possible)
- [ ] No performance degradation with different sort options

## Edge Cases to Test

1. **Empty Results**: Test sorting with no records
2. **NULL Values**: Test with records that have NULL titles or dates
3. **Unicode/Accents**: Test title sorting with special characters
4. **Very Long Titles**: Test title sorting with very long titles
5. **Same Values**: Test sorting when multiple records have identical sort
   values

## Quick Visual Test

The easiest way to see if sorting is working:

1. **For Date Sorts**: Look at the created_at/updated_at dates in the record
   cards
2. **For Title Sorts**: Look at the first letter of each record title
3. **For Kind Priority**: Check the metadata.kind field - records should always
   come before chapters, which come before roots

## Troubleshooting

If sorting doesn't work:

1. **Check Browser Console** for JavaScript errors
2. **Check Network Tab** to see the actual API request/response
3. **Check Server Logs** for any database errors
4. **Verify Database Indexes** are created:

   ```sql
   -- In SQLite
   .indexes records
   .indexes search_index
   ```

5. **Check API Response** includes sort metadata
6. **Verify Kind Priority** is working by checking record metadata

## Next Steps

After manual testing confirms everything works:

1. Add sort dropdown UI component
2. Integrate sort parameter into records store
3. Add automated tests
