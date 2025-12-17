# Records and Drafts Architecture

**Date**: 2025-01-27  
**Status**: ✅ **Implemented** - Architecture is live in production

## Core Principle: Clear Separation by Table Location

### The Rule

**Published Records** = `records` table + files in `/data/records/`

- Publicly accessible
- All records have markdown files
- Indexed for search

**Drafts & Internal Documents** = `record_drafts` table (NO files)

- Editors only
- No filesystem files created
- Includes: draft-only, draft versions, internal docs

### Key Insight

**Table location determines if record is published**, NOT field values (`status`
or `workflowState`).

### User Clarifications

1. **Publishing**: When a draft is published, it moves from `record_drafts` to
   `records` table and is removed from `record_drafts`.

2. **workflowState**: When published, `workflowState` is cleared (set to NULL).
   Published records don't need editorial state.

3. **internal_only**: Documents with `workflowState='internal_only'` should
   never be published. These are work notes or internal documents that should
   stay in `record_drafts` table only.

## Architecture Flow

### Publishing

```
record_drafts (draft)
  → publishDraft()
  → records (published) + file created
  → DELETE from record_drafts
  → workflowState cleared (set to NULL)
```

**Implementation Details**:

- Check if record exists in `records` table
- If exists: UPDATE the record (publishing changes to existing published record)
- If not exists: CREATE new record (publishing new record)
- File is created/updated in `/data/records/`
- `workflowState` is cleared to NULL

### Editing Published Record

```
records (published) + file
  → edit (PUT /api/v1/records/:id/draft)
  → CREATE draft in record_drafts
  → records (original) stays unchanged
  → Public sees original, admins see draft (via getDraftOrRecord)
```

**Implementation Details**:

- Original record in `records` table remains unchanged
- Draft created in `record_drafts` table with same ID
- Public users always see published version from `records` table
- Authenticated editors see draft version from `record_drafts` (via
  `?edit=true`)

## Table Separation

### `records` Table (Published Records Only)

- ✅ Contains ONLY published records (by definition - table location =
  published)
- ✅ All records have files in `/data/records/`
- ✅ Indexed in database for search
- ✅ `workflowState` is NULL (cleared on publish)
- ✅ Defensive: Filter out `workflowState='internal_only'` (shouldn't exist, but
  just in case)
- ✅ `status` can vary (published, archived, expired) - it's legal lifecycle

### `record_drafts` Table (Drafts & Internal Documents)

- ✅ Contains all draft records
- ✅ Draft-only records (never published)
- ✅ Draft versions of published records (unpublished changes)
- ✅ Internal documents (`workflowState='internal_only'`)
- ✅ NO files in filesystem
- ✅ Only accessible to editors

### Key Behaviors

1. **Table location determines if record is published**:
   - `records` table = Published (has file, publicly accessible)
   - `record_drafts` table = Draft/Internal (no file, editors only)

2. **A record can have `status='draft'` but be published**:
   - `status` is legal/public status (in YAML)
   - If record is in `records` table, it's published (has file), regardless of
     `status` value
   - `status` can vary: `'published'`, `'archived'`, `'expired'`, etc.

3. **`workflowState='internal_only'`**:
   - Internal documents that should never be published
   - Should ONLY exist in `record_drafts` table
   - Should never appear in public endpoints

## WorkflowState Values

### Draft/Unpublished States (should only be in `record_drafts`)

- `'draft'` - Initial working version
- `'under_review'` - Currently under review
- `'ready_for_publication'` - Ready to be published

### Internal Document State (should only be in `record_drafts`)

- `'internal_only'` - Internal document, never to be published (work notes,
  etc.)

### Published State (should only be in `records`)

- `NULL` (default) - Actually published record (no editorial state needed)

## API Endpoints

### 1. `GET /api/v1/records` (Public Listing)

**Behavior**:

- ✅ Query ONLY `records` table (never `record_drafts`)
- ✅ No status filtering needed (all records in table are published)
- ✅ Defensive: Filter out `workflowState='internal_only'` (if any exist)
- ✅ Return all records (they're all published by table location)

**SQL Query**:

```sql
SELECT * FROM records
WHERE (workflow_state IS NULL OR workflow_state != 'internal_only')
ORDER BY created_at DESC
```

### 2. `GET /api/v1/records/drafts` (Drafts - Editors Only)

**Behavior**:

- ✅ Query ONLY `record_drafts` table
- ✅ Show ALL drafts for users with `records:edit` permission
- ✅ No user filtering for editors
- ✅ Includes draft-only, draft versions, and internal documents

**SQL Query**:

```sql
SELECT * FROM record_drafts
ORDER BY updated_at DESC
```

### 3. `GET /api/v1/records/:id` (Get Single Record)

**Behavior**:

- **Public users**: Return from `records` table only
- **Authenticated editors**:
  - With `?edit=true`: Use `getDraftOrRecord()` which checks `record_drafts`
    first, falls back to `records`
  - Without `?edit=true`: Return from `records` table only
- **HasUnpublishedChanges flag**: Included for authenticated editors with
  `records:edit` permission

### 4. `GET /api/v1/search` (Search)

**Behavior**:

- ✅ Query ONLY `records` table (never `record_drafts`)
- ✅ Defensive: Filter out `workflowState='internal_only'`
- ✅ Same filtering as `/api/v1/records`

### 5. `GET /api/v1/records/summary` (Summary)

**Behavior**:

- ✅ Query ONLY `records` table
- ✅ Defensive: Filter out `workflowState='internal_only'`
- ✅ Count only published records

### 6. `GET /api/v1/records/unpublished`

- ✅ **Removed** - Redundant (all drafts are in `record_drafts` table)

## Frontend Implementation

### Drafts Page (`/records/drafts`)

- ✅ Fetches ONLY from `/api/v1/records/drafts`
- ✅ All drafts, unpublished changes, and internal docs are in `record_drafts`
  table
- ✅ No need to combine multiple sources

### Records Listing Page (`/records`)

- ✅ Uses `/api/v1/records` (published records only)
- ✅ Shows `hasUnpublishedChanges` badge for records with drafts (for editors)
- ✅ Badge only visible to users with `records:edit` permission

### Single Record View (`/records/:type/:id`)

- ✅ Shows published record (always)
- ✅ Shows `hasUnpublishedChanges` badge if draft exists (for editors)
- ✅ Badge only visible to users with `records:edit` permission

### Edit Record Page (`/records/:type/:id/edit`)

- ✅ Uses `?edit=true` parameter to fetch draft if available
- ✅ Shows draft content when editing (for editors)
- ✅ Falls back to published content if no draft exists

## API Endpoint Summary Table

| Endpoint                      | Table Queried                                           | Filtering                                           | Access      |
| ----------------------------- | ------------------------------------------------------- | --------------------------------------------------- | ----------- |
| `GET /api/v1/records`         | `records` only                                          | Exclude `workflowState='internal_only'` (defensive) | Public      |
| `GET /api/v1/records/drafts`  | `record_drafts` only                                    | None                                                | Editors     |
| `GET /api/v1/search`          | `records` only                                          | Exclude `workflowState='internal_only'` (defensive) | Public      |
| `GET /api/v1/records/summary` | `records` only                                          | Exclude `workflowState='internal_only'` (defensive) | Public      |
| `GET /api/v1/records/:id`     | `record_drafts` first (if `?edit=true`), then `records` | None (via getDraftOrRecord)                         | Conditional |

## Benefits

1. ✅ **Clear separation**: Table location = record type
2. ✅ **Simple queries**: No complex filtering logic needed
3. ✅ **Better performance**: Smaller, focused queries
4. ✅ **Data integrity**: Can't mix published and drafts
5. ✅ **Easier to understand**: Table name = record type
6. ✅ **Filesystem alignment**: `records` table matches filesystem (files exist
   for all records)
7. ✅ **Public stability**: Published records remain stable while editors work
   on drafts

## Unpublished Changes Badge

The system includes a visual indicator for records with unpublished draft
changes:

- **Badge displays** on record list page and single record view page
- **Only visible** to authenticated users with `records:edit` permission
- **API includes** `hasUnpublishedChanges` flag in responses for authenticated
  editors
- **Efficient detection** via batch querying of `record_drafts` table
