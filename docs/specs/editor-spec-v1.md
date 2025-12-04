# CivicPress Spec: `editor-spec-v1.md`

---

version: 1.0.0 status: draft created: '2025-12-04' updated: '2025-12-04'
deprecated: false sunset_date: null breaking_changes: [] additions:

- Markdown editor with preview mode
- Autosave draft functionality
- Metadata sidebar management
- Publish/draft workflow fixes: [] migration_guide: null compatibility:
  min_civicpress: '1.0.0' max_civicpress: null dependencies:
- 'records.md: >=1.0.0'
- 'api.md: >=1.0.0'
- 'frontend.md: >=1.0.0' authors:
- 'Core Team <team@civicpress.io>' reviewers: []

---

## Name

`editor-spec-v1` — CivicPress Record Editor v1 (Markdown + Preview)

## Purpose

Define the first version of the CivicPress record editor, providing a robust
Markdown editing experience with autosave, preview mode, metadata sidebar, and
publish/draft workflows. Designed for clerks who need a simple, stable editing
experience while preserving Git-based versioning.

The same editor component is used for both **creating new records** and
**editing existing records**, with the workflow adapting based on whether a
record ID exists.

At v1, the editor is entirely HTTP-based. There is **no dependency on the
realtime module** yet. All interactions go through the core API.

## Scope & Responsibilities

Responsibilities:

- Provide a user-friendly Markdown editor with optional preview
- Hide YAML frontmatter; manage all metadata through the sidebar
- Autosave drafts to the database; publish final content to Git
- Allow linking files, records, and geographies through UI actions
- Provide a sidebar for metadata, attachments, relations, and activity
- Prepare the architecture so that v2 (WYSIWYM) and v3 (realtime) can plug in
  without breaking changes

Out of Scope:

- Real-time collaborative editing (see `editor-spec-v3.md`)
- WYSIWYM editing experience (see `editor-spec-v2.md`)
- Complex workflow automation (handled by `workflows.md`)
- File storage management (handled by `storage.md`)

## Inputs & Outputs

| Input               | Description                                    |
| ------------------- | ---------------------------------------------- |
| Record data         | Markdown content with YAML frontmatter         |
| User authentication | Role and permission data from auth system      |
| Metadata            | Template-specific fields and record properties |
| File attachments    | Linked files with categorization               |
| User edits          | Markdown content changes from editor           |

| Output             | Description                                   |
| ------------------ | --------------------------------------------- |
| Draft records      | Database-stored draft content and metadata    |
| Published records  | Git-committed Markdown files with frontmatter |
| Validation results | Schema and content validation feedback        |
| Autosave status    | UI indicators for save state                  |

## File/Folder Location

```
modules/ui/
├── app/
│ ├── pages/
│ │ └── records/
│ │   ├── new.vue # Create new record (any type)
│ │   ├── [type]/
│ │   │ ├── new.vue # Create new record (specific type)
│ │   │ └── [id]/
│ │   │   └── edit.vue # Edit existing record
│ │   └── [id].vue # Record view page
│ └── components/
│   ├── RecordForm.vue # Shared form component (used for both create and edit)
│   ├── editor/
│   │ ├── MarkdownEditor.vue # CodeMirror-based editor
│   │ ├── PreviewPanel.vue # Markdown preview
│   │ └── EditorToolbar.vue # Formatting toolbar
│   ├── record/
│   │ ├── RecordSidebar.vue # Metadata sidebar
│   │ ├── RecordAttachments.vue # File attachments
│   │ ├── RecordRelations.vue # Linked records/geographies
│   │ └── RecordActivity.vue # Activity history (edit mode only)
│   └── layout/
│     └── EditorLayout.vue # Editor page layout

modules/api/
└── src/
  └── routes/
    └── records.ts # Record CRUD endpoints

tests/
└── ui/
  └── editor/
    ├── markdown-editor.test.ts # Editor component tests
    ├── editor-integration.test.ts # E2E editor tests
    └── record-form.test.ts # RecordForm create/edit tests
```

## UI Layout

### 1. Header Bar

- Editable title
- Status badge:
  - `draft`, `pending_review`, `under_review`, `approved`, `published`,
    `archived`, `rejected`, `expired`
- Primary actions:
  - Save Draft
  - Publish
- Secondary actions:
  - More menu (Duplicate, Delete, View history)
- Autosave indicator:
  - "Saved just now"
  - "Saving…"
  - "Last saved 2 minutes ago"

### 2. Editor Area (Markdown)

- Based on CodeMirror 6 (or equivalent) configured for Markdown
- Visible body only; YAML frontmatter is hidden by default
- Minimal "metadata placeholder" at top (non-editable for normal users)
  indicating that metadata lives in the sidebar
- Toolbar:
  - Undo / Redo
  - Bold / Italic / Underline / Code
  - H1 / H2 / H3
  - Bulleted and numbered lists
  - Blockquote, horizontal rule
  - Insert link
  - Insert image / file (from attachments)
  - Toggle fullscreen editor

### 3. Preview Panel (Optional)

- Split view: Editor + Preview (vertical or horizontal)
- Uses the same rendering pipeline as the public viewer
- Can be toggled on/off per user

### 4. Right Sidebar

Organized as tabs or accordions:

- **Details**
  - Title (mirrors header)
  - Record type
  - Status
  - Language
- **Metadata**
  - Template-specific fields (e.g. meeting date, bylaw number)
  - All written into frontmatter by API, not by the user directly
- **Attachments**
  - Upload button
  - Drag-and-drop zone
  - List of files with:
    - filename, type, size
    - actions: rename, replace, remove (if not referenced)
    - "Insert into editor" shortcut
- **Relations**
  - Linked records (search and add)
  - Linked geographies (dropdown/search and add)
- **Activity**
  - Created by / last updated by
  - Status changes history (optional for v1)
  - Last published at

## Behavior

### Create vs Edit Mode

The same editor component (`RecordForm`) is used for both creating new records
and editing existing ones:

- **Create Mode** (`isEditing: false`):
  - No record ID exists yet
  - Initial state: empty form with template (if selected)
  - Uses `POST /api/v1/records` to create
  - After creation, navigates to edit page with new record ID
  - Activity sidebar hidden (no history yet)
  - Template selection available

- **Edit Mode** (`isEditing: true`):
  - Record ID exists
  - Initial state: loads existing record via `GET /api/v1/records/:id`
  - Uses `PUT /api/v1/records/:id/draft` for saves
  - Activity sidebar visible (shows history)
  - Template selection disabled (record already created)

### Autosave

- **Edit Mode**:
  - Triggered:
    - After a short idle period (e.g. 2–3 seconds without typing)
    - Or every N seconds (e.g. 15–20) while there are unsaved changes
  - Writes to the database only:
    - Updates record content and metadata as "draft"
  - Does not change lifecycle status (Draft stays Draft, pending_review stays
    pending_review)

- **Create Mode**:
  - Autosave is disabled (record doesn't exist yet)
  - User must explicitly save to create the record
  - Changes are stored in browser state until save

### Save Draft

- **Edit Mode**:
  - Explicit write to the database (same as autosave but user-driven)
  - Performs light validation:
    - Required fields present
    - No obvious structural issues in metadata
  - Shows confirmation in the UI

- **Create Mode**:
  - Creates new record via `POST /api/v1/records`
  - Performs validation:
    - Required fields present (title, type, status)
    - Record type is valid
    - No obvious structural issues in metadata
  - On success: navigates to edit page with new record ID
  - Shows confirmation: "Record created successfully"

### Publish

- **Edit Mode**:
  - Sequence:
    - Validate record more strictly (all required fields, references, etc.)
    - Construct final Markdown:
      - YAML frontmatter generated from structured metadata
      - Markdown body from the editor
    - Write file to the content store (Git working copy)
    - Trigger Git commit via API:
      - Commit message example: `Publish record {title} ({id})`
    - Update database:
      - status = published (or as per workflow)
      - publishedGitSha set
      - lastPublishedAt updated

- **Create Mode**:
  - Publish button disabled until record is created
  - User must save/create record first, then can publish from edit mode

### Template Loading (Create Mode Only)

- When creating a new record:
  - User can select a template from available templates for the record type
  - Template is loaded and populated with default content
  - Template variables can be substituted with form data
  - Template selection is available in the sidebar or header
  - After template is applied, user can edit content normally

### Linking Rules

- **Edit Mode**:
  - When an attachment is inserted into the editor:
    - It is added to the appropriate arrays (e.g. linkedFiles) in metadata
  - When a record or geography link is added via the Relations UI:
    - It is stored in the frontmatter arrays (linkedRecords, linkedGeographies)
  - Prevent deleting attachments that are still referenced in the body
  - Relations can still be shown in the sidebar even if not embedded in text

- **Create Mode**:
  - Attachments and relations can be added before saving
  - They are stored in form state and included in the create request
  - Validation ensures referenced records/geographies exist before creation

## API Endpoints

| Method | Endpoint                      | Description                                                                                      | Auth Required | Used In |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------ | ------------- | ------- |
| POST   | `/api/v1/records`             | Create new record. Body: markdownBody + metadata. Returns created record with ID                 | Yes           | Create  |
| GET    | `/api/v1/records/:id`         | Returns draft state (DB) plus last published info                                                | Yes           | Edit    |
| PUT    | `/api/v1/records/:id/draft`   | Body: markdownBody + metadata. Behavior: autosave / save draft                                   | Yes           | Edit    |
| POST   | `/api/v1/records/:id/publish` | Body: optional overrides (e.g. status). Behavior: validate, write to disk, Git commit, update DB | Yes           | Edit    |
| POST   | `/api/v1/records/:id/status`  | Body: new status + optional comment                                                              | Yes           | Edit    |
| GET    | `/api/v1/records/:id/history` | Returns Git and/or DB history (optional v1; can be v2+)                                          | Yes           | Edit    |

### API Request/Response Examples

#### POST /api/v1/records (Create New Record)

**Request:**

```http
POST /api/v1/records HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "New Bylaw",
  "type": "bylaw",
  "status": "draft",
  "markdownBody": "# New Bylaw\n\nContent here...",
  "metadata": {
    "description": "A new bylaw",
    "tags": []
  }
}
```

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "new-record-id-123",
    "title": "New Bylaw",
    "recordType": "bylaw",
    "status": "draft",
    "createdAt": "2025-12-04T15:00:00Z",
    "updatedAt": "2025-12-04T15:00:00Z"
  },
  "message": "Record created successfully"
}
```

**Error Response (400):**

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": {
      "field": "title",
      "message": "Title is required"
    }
  }
}
```

#### GET /api/v1/records/:id

**Request:**

```http
GET /api/v1/records/abc123 HTTP/1.1
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "title": "Example Bylaw",
    "recordType": "bylaw",
    "status": "draft",
    "markdownBody": "# Example Bylaw\n\nContent here...",
    "frontmatter": {
      "title": "Example Bylaw",
      "type": "bylaw",
      "status": "draft"
    },
    "linkedFiles": [],
    "linkedRecords": [],
    "linkedGeographies": [],
    "isDraft": true,
    "publishedGitSha": null,
    "createdAt": "2025-12-04T10:00:00Z",
    "updatedAt": "2025-12-04T14:30:00Z",
    "lastDraftSavedAt": "2025-12-04T14:30:00Z",
    "lastPublishedAt": null
  }
}
```

#### PUT /api/v1/records/:id/draft

**Request:**

```http
PUT /api/v1/records/abc123/draft HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "markdownBody": "# Updated Bylaw\n\nNew content...",
  "metadata": {
    "title": "Updated Bylaw",
    "status": "draft"
  }
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "lastDraftSavedAt": "2025-12-04T15:00:00Z"
  },
  "message": "Draft saved successfully"
}
```

**Error Response (400):**

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": {
      "field": "title",
      "message": "Title is required"
    }
  }
}
```

#### POST /api/v1/records/:id/publish

**Request:**

```http
POST /api/v1/records/abc123/publish HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "published"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "publishedGitSha": "a1b2c3d4e5f6",
    "lastPublishedAt": "2025-12-04T15:30:00Z",
    "status": "published"
  },
  "message": "Record published successfully"
}
```

### Data Model (conceptual)

- id
- title
- recordType
- status
- markdownBody (draft content)
- frontmatter (JSON in DB, serialized to YAML on publish)
- linkedFiles: array of file IDs
- linkedRecords: array of record IDs
- linkedGeographies: array of geography IDs
- isDraft: boolean
- publishedGitSha: string | null
- createdAt
- updatedAt
- lastDraftSavedAt
- lastPublishedAt

## Error Handling

### Network Failures

- **Autosave failures**:
  - Retry automatically with exponential backoff (up to 3 attempts)
  - Show warning indicator: "Last save failed, retrying..."
  - After final failure, show error: "Unable to save. Please try saving
    manually."
  - Queue changes for retry when connection is restored

### Validation Errors

- **Field validation**:
  - Display inline errors next to problematic fields in sidebar
  - Highlight required fields that are missing
  - Show error summary at top of form if multiple errors exist
- **Content validation**:
  - Display validation errors in a dismissible banner
  - Allow user to continue editing while errors are shown
  - Prevent publish until all errors are resolved

### Permission Errors

- **Insufficient permissions**:
  - Show clear message: "You don't have permission to edit this record"
  - Disable edit controls appropriately
  - Suggest contacting an administrator if needed

### Conflict Resolution

- **Concurrent edits** (when multiple users edit via v1):
  - On save, check if record was modified since last load
  - If conflict detected, show dialog: "Record was modified. Reload changes or
    overwrite?"
  - Provide option to view diff before deciding
  - Note: v1 has no real-time conflict resolution; this is a fallback

### User-Friendly Error Messages

- Avoid technical jargon in user-facing messages
- Provide actionable guidance: "Please check your internet connection and try
  again"
- Include error codes for support: "Error code: SAVE_FAILED_001"
- Log detailed errors server-side for debugging

## Performance Considerations

### Autosave Performance

- **Debouncing**: Wait 2-3 seconds after last keystroke before triggering
  autosave
- **Throttling**: Limit autosave to once every 15-20 seconds maximum
- **Background processing**: Perform autosave in background without blocking UI
- **Optimistic updates**: Show "saving..." immediately, update status when
  complete

### Large Document Handling

- **Document size limits**: Recommend maximum 1MB per record (configurable)
- **Lazy loading**: Load record content progressively if very large
- **Virtual scrolling**: For very long documents, use virtual scrolling in
  editor
- **Chunked processing**: Process large documents in chunks to avoid blocking

### Editor Performance

- **CodeMirror configuration**: Use efficient settings for large documents
- **Preview rendering**: Debounce preview updates (500ms delay)
- **Memory management**: Clean up editor instances when navigating away
- **Asset optimization**: Lazy load editor assets, use code splitting

### API Performance

- **Request batching**: Batch multiple metadata updates into single request when
  possible
- **Caching**: Cache record data client-side to reduce API calls
- **Compression**: Use gzip compression for large payloads
- **Pagination**: For history/activity, use pagination to limit response size

## Migration & Upgrade Path

### Enabling v1 Editor

- v1 is the default editor for CivicPress v1.0.0+
- No configuration required; enabled by default
- Can be explicitly enabled via configuration:

  ```yaml
  # .civic/editor.yml
  editor:
    version: 'v1'
    enabled: true
  ```

### Upgrading to v2

- v2 can be enabled via configuration:

  ```yaml
  # .civic/editor.yml
  editor:
    version: 'v2'
    enabled: true
  ```

- **Data migration**: No data migration required; v2 uses same data model
- **Backward compatibility**: v1 and v2 can coexist; users can choose their
  preferred version
- **Rollback**: Can revert to v1 by changing configuration

### Upgrading to v3

- v3 requires `modules/realtime` service to be running
- Enable via configuration:

  ```yaml
  # .civic/editor.yml
  editor:
    version: 'v3'
    enabled: true
    realtime:
      enabled: true
      url: 'wss://api.example.com/realtime'
  ```

- **Data migration**: No data migration required
- **Backward compatibility**: v1 and v2 remain available; v3 is opt-in
- **Rollback**: Can disable v3 and revert to v1/v2 without data loss

### Feature Flags

- Editor versions can be controlled via feature flags:

  ```yaml
  # .civic/features.yml
  features:
    editor_v1: true
    editor_v2: true
    editor_v3: false  # Requires realtime module
  ```

## Testing & Validation

### Unit Tests

- **Editor components**:
  - Test MarkdownEditor component rendering and interactions
  - Test PreviewPanel markdown rendering
  - Test EditorToolbar button actions
  - Test autosave debouncing and throttling logic
- **Sidebar components**:
  - Test RecordSidebar metadata editing
  - Test RecordAttachments file upload/management
  - Test RecordRelations linking functionality

### Integration Tests

- **API integration**:
  - Test draft save/load cycle
  - Test publish workflow end-to-end
  - Test status transitions
  - Test validation error handling
- **Editor-API integration**:
  - Test autosave triggers API calls correctly
  - Test error recovery and retry logic
  - Test concurrent edit conflict detection

### E2E Tests

- **User workflows**:
  - Test complete record creation workflow (new record → save → edit)
  - Test editing existing record workflow
  - Test template loading and application for new records
  - Test attachment linking workflow (both create and edit)
  - Test record relation linking workflow (both create and edit)
- **Error scenarios**:
  - Test network failure recovery (both create and edit)
  - Test validation error display (both create and edit)
  - Test permission error handling
  - Test create mode → edit mode transition

### Validation Tests

- **Markdown serialization**:
  - Test Markdown → YAML frontmatter generation
  - Test special character handling
  - Test link reference extraction
- **Schema validation**:
  - Test required field validation
  - Test status transition validation
  - Test metadata schema compliance

## Relationship to Other Modules

### Relationship to `modules/realtime`

- v1 editor does **not use** the realtime module
- All communication is HTTP-based via the core API
- The data model and endpoints are designed so:
  - v2 can replace the editor surface with a WYSIWYM UI
  - v3 can plug yjs + WebSockets on top of the same publish/draft API without
    changing how Git and records behave

### Relationship to `modules/api`

- **Create operations**: Use `POST /api/v1/records` to create new records
- **Edit operations**: Use `PUT /api/v1/records/:id/draft` for draft saves
- **Publish operations**: Use `POST /api/v1/records/:id/publish` for publishing
- API handles validation, Git commits, and database updates
- Editor is a thin client that sends Markdown and metadata

### Relationship to `modules/ui`

- Editor is part of the UI module
- `RecordForm` component is shared between create and edit pages
- Create pages (`new.vue`, `[type]/new.vue`) use `RecordForm` with
  `isEditing: false`
- Edit pages (`[id]/edit.vue`) use `RecordForm` with `isEditing: true` and
  `record` prop
- Uses Nuxt 3 composables for state management
- Integrates with authentication and permission systems

## Security & Trust Considerations

- All editor endpoints require authentication
- Permission checks enforce role-based access (clerk, council, admin)
- Draft content is stored in database with proper access controls
- Published content is committed to Git with audit trail
- File attachments are validated and stored securely
- Markdown content is sanitized to prevent XSS attacks
- YAML frontmatter is validated against schema before saving

## Related Specs

- [`records.md`](./records.md) — Core record management system
- [`api.md`](./api.md) — API service specification
- [`frontend.md`](./frontend.md) — Frontend UI layer
- [`editor-spec-v2.md`](./editor-spec-v2.md) — WYSIWYM editor (next version)
- [`editor-spec-v3.md`](./editor-spec-v3.md) — Collaborative editor (future
  version)
- [`realtime-architecture.md`](./realtime-architecture.md) — Realtime service
  architecture
- [`workflows.md`](./workflows.md) — Status transition workflows
- [`storage.md`](./storage.md) — File storage system
- [`records-validation.md`](./records-validation.md) — Record validation rules
- [`templates.md`](./templates.md) — Template system

## History

- Created: 2025-12-04 — Initial specification for v1 Markdown editor
