# Unpublished Changes Badge Feature

**Date**: 2025-12-09  
**Feature**: Visual indicator for records with unpublished draft changes

## Overview

The unpublished changes badge provides a visual indicator to editors when a
published record has a draft version with unpublished modifications. This helps
editors quickly identify which records have pending changes that need review or
publication.

## Features

### Badge Display

- **Location**:
  - Record list page (`/records`)
  - Single record view page (`/records/:type/:id`)
- **Visibility**: Only visible to authenticated users with `records:edit`
  permission

- **Appearance**:
  - Red error variant badge
  - Icon: `i-lucide-file-edit`
  - Text: "Unpublished changes" (translatable)
  - Size: Extra small (`xs`), matches other metadata badges

### API Behavior

#### List Records (`GET /api/v1/records`)

- For authenticated users with `records:edit` permission:
  - Includes `hasUnpublishedChanges: boolean` field in each record
  - `true` if a draft exists for that record ID
  - `false` if no draft exists
- For public users:
  - Field is not included in response (`undefined`)

- Efficient batch querying:
  - Single SQL query checks all record IDs at once (batched if > 999 IDs)
  - Minimal performance impact

#### Search Records (`GET /api/v1/search`)

- Same behavior as list records
- `hasUnpublishedChanges` field included in search results for authenticated
  editors
- Field not included for public users

#### Single Record (`GET /api/v1/records/:id`)

**View Mode (default or `?edit=false`):**

- Always returns published record
- Includes `hasUnpublishedChanges: boolean` flag for authenticated editors
- Public users receive published record without the flag

**Edit Mode (`?edit=true`):**

- For authenticated editors: Returns draft if it exists, otherwise published
  record
- For public users: Always returns published record (ignores `edit` parameter)

## Technical Implementation

### Backend

1. **Draft Detection** (`RecordsService.listRecords()` and `searchRecords()`):
   - Checks user permissions
   - Batch queries `record_drafts` table for matching record IDs
   - Sets `hasUnpublishedChanges` flag based on query results

2. **Edit Mode** (`GET /api/v1/records/:id`):
   - Checks `?edit=true` query parameter
   - Validates user permissions
   - Returns draft via `getDraftOrRecord()` or published via `getRecord()`

### Frontend

1. **Badge Component** (`RecordList.vue`, `index.vue`):
   - Conditionally renders badge based on `hasUnpublishedChanges` flag
   - Checks user permissions before displaying
   - Consistent styling with other metadata badges

2. **Edit Page** (`edit.vue`, `RecordForm.vue`):
   - Uses `?edit=true` parameter when fetching record data
   - Ensures draft content is loaded for editing

## User Experience

### Editor Workflow

1. Editor creates or edits a record → Draft is saved
2. Record is published → File is created/updated
3. Editor makes more changes → New draft is created
4. **Badge appears** on record list and single record view
5. Editor clicks record → Can see published version with badge
6. Editor clicks "Edit" → Draft version is loaded for editing

### Public User Experience

- No badge is shown (they don't have edit permissions)
- Always see published version
- No indication that drafts exist

## API Examples

### List Records with Draft Detection

```bash
curl 'http://localhost:3000/api/v1/records' \
  -H 'Authorization: Bearer <token>'
```

**Response (with unpublished changes):**

```json
{
  "success": true,
  "data": {
    "records": [
      {
        "id": "bylaw-286-art-380",
        "title": "Article 380",
        "type": "bylaw",
        "status": "published",
        "hasUnpublishedChanges": true,
        ...
      }
    ]
  }
}
```

### Get Record in Edit Mode

```bash
curl 'http://localhost:3000/api/v1/records/bylaw-286-art-380?edit=true' \
  -H 'Authorization: Bearer <token>'
```

**Response (draft version):**

```json
{
  "success": true,
  "data": {
    "id": "bylaw-286-art-380",
    "title": "Article 380 (Updated)",
    "isDraft": true,
    "markdownBody": "# Updated content...",
    ...
  }
}
```

## Testing

All functionality is covered by comprehensive tests:

- Draft detection in `listRecords()` (4 tests)
- Draft detection in `searchRecords()` (3 tests)
- Edit mode query parameter (6 tests)
- Permission handling for public vs authenticated users
- Edge cases and batch processing

See `tests/api/records.test.ts` for implementation details.

## Related Files

### Backend Implementation

- `modules/api/src/services/records-service.ts` - Draft detection logic
- `modules/api/src/routes/records.ts` - API route handlers
- `modules/api/src/routes/search.ts` - Search endpoint

### Frontend Implementation

- `modules/ui/app/components/RecordList.vue` - Badge display
- `modules/ui/app/pages/records/[type]/[id]/index.vue` - Single record badge
- `modules/ui/app/pages/records/[type]/[id]/edit.vue` - Edit page
- `modules/ui/app/components/RecordForm.vue` - Record form component
- `modules/ui/app/stores/records.ts` - Type definitions

### Tests

- `tests/api/records.test.ts` - API tests

### Documentation

- `docs/test-updates-unpublished-changes.md` - Test documentation
- `modules/api/README.md` - API documentation
