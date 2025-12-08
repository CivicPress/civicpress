# Dual Status Model Analysis

**Date**: 2025-01-27  
**Goal**: Introduce a second status field (`workflow_state`) for
editorial/working status, separate from legal status (`status`)

## Executive Summary

The current `status` field represents the **legal lifecycle** of records (draft,
pending_review, approved, published, archived, etc.) and is stored in both the
database and YAML frontmatter. This analysis identifies where to add a new
DB-only `workflow_state` field for editorial/working status without disrupting
existing functionality.

## Current Status Implementation

### 1. Database Schema

**Location**: `core/src/database/database-adapter.ts` (lines 159-173, 217-233)

#### `records` Table

```sql
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'draft',  -- Legal status
  content TEXT,
  metadata TEXT,
  geography TEXT,
  attached_files TEXT,
  linked_records TEXT,
  linked_geography_files TEXT,
  path TEXT,
  author TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

#### `record_drafts` Table

```sql
CREATE TABLE IF NOT EXISTS record_drafts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'draft',  -- Legal status (same as records)
  markdown_body TEXT,
  metadata TEXT,
  geography TEXT,
  attached_files TEXT,
  linked_records TEXT,
  linked_geography_files TEXT,
  author TEXT,
  created_by TEXT,
  last_draft_saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Key Finding**: Both tables use `status` for legal lifecycle. No separate
working/editorial status exists.

### 2. TypeScript Interfaces

**Location**: `core/src/records/record-manager.ts` (lines 26-90)

```typescript
export interface RecordData {
  id: string;
  title: string;
  type: string;
  status: string;  // Legal status - required
  content?: string;
  metadata?: Record<string, any>;
  // ... other fields
}
```

**Location**: `modules/ui/app/stores/records.ts` (lines 4-89)

```typescript
export interface CivicRecord {
  id: string;
  title: string;
  type: 'bylaw' | 'ordinance' | 'policy' | ...;
  status: 'draft' | 'pending_review' | 'under_review' | 'approved' | 'published' | 'rejected' | 'archived' | 'expired';
  // ... other fields
}
```

**Key Finding**: `status` is typed as legal lifecycle values. No workflow_state
field exists.

### 3. YAML Frontmatter Serialization

**Location**: `core/src/records/record-parser.ts`

#### Parsing (YAML → RecordData)

- `parseFromMarkdown()` (line 120): Extracts `status` from frontmatter
- `FrontmatterData` interface (line 25-106): Includes `status: string` as
  required field

#### Serialization (RecordData → YAML)

- `serializeToMarkdown()` (line 273): Converts RecordData to markdown with
  frontmatter
- `buildFrontmatter()` (line 292): Builds frontmatter object, includes
  `status: record.status` (line 298)

**Key Finding**: `status` is **always** written to YAML frontmatter. This is the
legal status that should remain in the file.

### 4. API Layer

**Location**: `modules/api/src/routes/records.ts`

#### Status Usage in API

- **GET /api/v1/records**: Filters by `status` query parameter (line 58, 76)
- **GET /api/v1/records/summary**: Aggregates by `status` (line 109, 125)
- **POST /api/v1/records**: Accepts `status` in body (line 483)
- **PUT /api/v1/records/:id**: Accepts `status` in body (line 542, 957)
- **POST /api/v1/records/:id/status**: Dedicated endpoint for status changes
  with workflow validation (line 707-813)
- **POST /api/v1/records/:id/publish**: Accepts optional `status` (line
  1054, 1079)

**Location**: `modules/api/src/services/records-service.ts`

- `changeRecordStatus()` (line 452): Validates workflow transitions, updates
  `status` field
- `getFrontmatterYaml()` (line 1095): Includes `status` in YAML generation
  (line 1107)

**Key Finding**: API extensively uses `status` for filtering, validation, and
workflow transitions. All references are to legal lifecycle status.

### 5. UI Components

**Location**: `modules/ui/app/components/editor/RecordSidebar.vue`

- Status dropdown selector (lines 371-380)
- Uses `useRecordStatuses()` composable
- Emits `update:status` event
- Displays current `status` value

**Location**: `modules/ui/app/composables/useRecordStatuses.ts`

- Fetches statuses from `/api/v1/system/record-statuses`
- Returns legal lifecycle statuses (draft, pending_review, approved, etc.)

**Key Finding**: UI currently shows only legal status. No editorial/working
status UI exists.

### 6. Workflow Engine

**Location**: `core/src/config/workflow-config.ts`,
`core/src/workflows/workflow-engine.ts`

- `WorkflowConfigManager.validateTransition()`: Validates status transitions
- `WorkflowEngine`: Executes workflows based on status changes
- Workflow config (`data/.civic/workflows.yml`): Defines legal status
  transitions

**Key Finding**: Workflow engine operates on legal `status` field. No separate
workflow state management exists.

### 7. Database Service Methods

**Location**: `core/src/database/database-service.ts`

- `createRecord()` (line 400): Accepts `status`, defaults to 'draft' (line 420)
- `createDraft()` (line 452): Accepts `status`, defaults to 'draft' (line 472)
- `updateDraft()` (line 540): Accepts `status` in updates (line 545, 565-568)
- `getRecord()` (line 443): Returns `status` from database
- `getDraft()` (line 485): Returns `status` from database

**Key Finding**: All database operations use `status` for legal lifecycle. No
workflow_state field exists.

## Status Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    YAML Frontmatter                         │
│  (Legal Status Only - Written by RecordParser)              │
│  status: "published"                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ RecordParser.parseFromMarkdown()
                     │ RecordParser.serializeToMarkdown()
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    RecordData Interface                      │
│  (Core Data Model)                                           │
│  status: string  // Legal lifecycle                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ RecordManager
                     │ DatabaseService
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Database (SQLite)                         │
│  records.status TEXT DEFAULT 'draft'                        │
│  record_drafts.status TEXT DEFAULT 'draft'                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ API Routes
                     │ RecordsService
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Responses                            │
│  { status: "published", ... }                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTP Requests
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    UI Components                            │
│  RecordSidebar, Status Dropdown                             │
│  Shows legal status only                                    │
└─────────────────────────────────────────────────────────────┘
```

## Related Concepts

### 1. Record Types

- **Location**: `core/src/config/record-types.ts`
- **Purpose**: Categorizes records (bylaw, ordinance, policy, etc.)
- **Relationship**: Different from status - type is classification, status is
  lifecycle

### 2. Workflow Configuration

- **Location**: `data/.civic/workflows.yml`,
  `core/src/config/workflow-config.ts`
- **Purpose**: Defines legal status transitions and role permissions
- **Relationship**: Operates on `status` field, not a separate workflow state

### 3. Draft System

- **Location**: `record_drafts` table
- **Purpose**: Temporary storage for unsaved edits
- **Relationship**: Uses same `status` field as published records, but stored
  separately

### 4. Record Locks

- **Location**: `record_locks` table
- **Purpose**: Prevents concurrent editing
- **Relationship**: Separate from status - operational concern, not lifecycle

### 5. Metadata Field

- **Location**: `records.metadata` (JSON TEXT column)
- **Purpose**: Flexible storage for additional fields
- **Relationship**: Could theoretically store workflow_state, but not type-safe
  or queryable

## Recommended Implementation Plan

### Phase 1: Database Schema Changes

**Files to Modify**:

1. `core/src/database/database-adapter.ts`
   - Add `workflow_state TEXT DEFAULT NULL` to `records` table
   - Add `workflow_state TEXT DEFAULT NULL` to `record_drafts` table
   - Use `ALTER TABLE` for migration (similar to geography column, line 262-268)

**Migration Strategy**:

- Add column with `ALTER TABLE` (handles existing records gracefully)
- Default to `NULL` (no breaking changes)
- Existing records will have `NULL` workflow_state (can be set on first edit)

### Phase 2: TypeScript Interfaces

**Files to Modify**:

1. `core/src/records/record-manager.ts`
   - Add `workflow_state?: string` to `RecordData` interface (optional, DB-only)
2. `modules/ui/app/stores/records.ts`
   - Add `workflow_state?: string` to `CivicRecord` interface (optional)
3. `core/src/civic-core.ts`
   - Add `workflow_state?: string` to `CreateRecordRequest` and
     `UpdateRecordRequest` (optional)

**Key Decision**: Make `workflow_state` optional everywhere to maintain backward
compatibility.

### Phase 3: Database Service Layer

**Files to Modify**:

1. `core/src/database/database-service.ts`
   - `createRecord()`: Accept `workflow_state?` parameter, include in INSERT
   - `createDraft()`: Accept `workflow_state?` parameter, include in INSERT
   - `updateDraft()`: Accept `workflow_state?` in updates object
   - `getRecord()`: Already returns all columns (will include workflow_state)
   - `getDraft()`: Already returns all columns (will include workflow_state)
   - Add `updateRecord()` method if missing (for published records)

**Key Decision**: Treat `workflow_state` as nullable - `NULL` means "no workflow
state set".

### Phase 4: Record Parser (YAML Serialization)

**Files to Modify**:

1. `core/src/records/record-parser.ts`
   - **DO NOT** add `workflow_state` to `FrontmatterData` interface
   - **DO NOT** include `workflow_state` in `buildFrontmatter()`
   - **DO NOT** read `workflow_state` from frontmatter in `parseFromMarkdown()`
   - **DO** map `workflow_state` from database to `RecordData` when loading from
     DB
   - **DO** ignore `workflow_state` when serializing to markdown

**Key Decision**: `workflow_state` is **strictly DB-only** - never written to or
read from YAML.

### Phase 5: API Layer

**Files to Modify**:

1. `modules/api/src/routes/records.ts`
   - Add `workflow_state` to request body validation (optional)
   - Include `workflow_state` in API responses
   - Add optional `workflow_state` filter to list endpoints (if needed)
2. `modules/api/src/services/records-service.ts`
   - Accept `workflow_state?` in create/update methods
   - Pass `workflow_state` to database service
   - Include `workflow_state` in response objects

**Key Decision**: API accepts and returns `workflow_state`, but it's optional
and separate from `status`.

### Phase 6: UI Components

**Files to Modify**:

1. `modules/ui/app/components/editor/RecordSidebar.vue`
   - Add workflow_state dropdown (separate from status dropdown)
   - Display both status and workflow_state
   - Emit `update:workflow_state` event
2. `modules/ui/app/components/records/RecordForm.vue`
   - Handle `workflow_state` updates
   - Send `workflow_state` in API requests
3. `modules/ui/app/composables/useRecordStatuses.ts` (or new composable)
   - Create `useWorkflowStates()` composable for workflow state options
   - Define workflow state values (draft, under_review, ready_for_publication,
     etc.)

**Key Decision**: Show both fields in UI, but make it clear which is legal
status (in YAML) vs. working status (DB-only).

## Migration Concerns

### 1. Existing Records

- **Impact**: All existing records will have `workflow_state = NULL`
- **Solution**: Default to `NULL`, set on first edit or via migration script
- **Risk**: Low - optional field, no breaking changes

### 2. Existing Drafts

- **Impact**: All existing drafts will have `workflow_state = NULL`
- **Solution**: Same as records - set on first edit
- **Risk**: Low - drafts are temporary

### 3. API Compatibility

- **Impact**: API will return new `workflow_state` field
- **Solution**: Optional field, clients can ignore it
- **Risk**: Low - additive change, backward compatible

### 4. YAML Compatibility

- **Impact**: No impact - `workflow_state` never written to YAML
- **Solution**: N/A
- **Risk**: None

### 5. Database Migration

- **Impact**: Need to add column to existing databases
- **Solution**: Use `ALTER TABLE` with error handling (if column exists, skip)
- **Risk**: Low - SQLite handles this gracefully

## Least Invasive Implementation Points

### Implementation Checklist - Database Schema

- **Location**: `core/src/database/database-adapter.ts` (lines 159-173, 217-233)
- **Change**: Add `workflow_state TEXT DEFAULT NULL` column
- **Impact**: Minimal - nullable column, no breaking changes

### 2. RecordData Interface

- **Location**: `core/src/records/record-manager.ts` (line 26-90)
- **Change**: Add optional `workflow_state?: string`
- **Impact**: Minimal - optional field, backward compatible

### 3. Database Service

- **Location**: `core/src/database/database-service.ts`
- **Change**: Accept and store `workflow_state` in CRUD operations
- **Impact**: Low - additive changes, existing code unaffected

### 4. Record Parser

- **Location**: `core/src/records/record-parser.ts`
- **Change**: **None** - explicitly exclude from YAML serialization
- **Impact**: None - ensures workflow_state stays DB-only

### 5. API Layer - workflowState Support

- **Location**: `modules/api/src/routes/records.ts`,
  `modules/api/src/services/records-service.ts`
- **Change**: Accept and return `workflow_state` (optional)
- **Impact**: Low - optional field, backward compatible

### 6. UI Components

- **Location**: `modules/ui/app/components/editor/RecordSidebar.vue`
- **Change**: Add workflow_state dropdown/display
- **Impact**: Medium - new UI element, but doesn't affect existing status
  functionality

## Recommended Field Name

**Proposed**: `workflow_state`

**Alternatives Considered**:

- `editorial_status`: Too similar to `status`, might cause confusion
- `working_status`: Good, but `workflow_state` is more descriptive
- `draft_state`: Too narrow - not just for drafts
- `internal_status`: Good, but `workflow_state` aligns with workflow engine
  terminology

**Rationale**:

- Clearly indicates it's separate from legal `status`
- Aligns with existing workflow engine terminology
- Descriptive of its purpose (editorial/working workflow)

## Summary

### Current State

- `status` = Legal lifecycle (draft, approved, published, archived, etc.)
- Stored in both DB and YAML frontmatter
- Used throughout API, UI, and workflow engine
- No separate working/editorial status exists

### Proposed State

- `status` = Legal lifecycle (unchanged)
  - Stored in DB and YAML (unchanged)
  - Used for workflow transitions (unchanged)
- `workflow_state` = Editorial/working status (new)
  - Stored in DB only (never in YAML)
  - Used for internal workflow management
  - Examples: draft, under_review, ready_for_publication, internal_only

### Implementation Risk

- **Low**: Additive changes, optional field, backward compatible
- **Migration**: Simple `ALTER TABLE` for existing databases
- **Breaking Changes**: None - all changes are optional/additive

### Next Steps

1. Review and approve this analysis
2. Implement Phase 1 (database schema)
3. Implement Phase 2-6 (interfaces, services, API, UI)
4. Test with existing records and drafts
5. Update documentation
