# CivicPress Spec: `editor-spec-v2.md`

---

version: 1.0.0 status: draft created: '2025-12-04' updated: '2025-12-04'
deprecated: false sunset_date: null breaking_changes: [] additions:

- Typora-style WYSIWYM editing experience
- Inline civic components (records, geographies, attachments)
- ProseMirror/Milkdown editor framework
- Reference extraction from Markdown fixes: [] migration_guide: null
  compatibility: min_civicpress: '1.0.0' max_civicpress: null dependencies:
- 'editor-spec-v1.md: >=1.0.0'
- 'records.md: >=1.0.0'
- 'api.md: >=1.0.0'
- 'frontend.md: >=1.0.0' authors:
- 'Core Team <team@civicpress.io>' reviewers: []

---

## Name

`editor-spec-v2` — CivicPress Record Editor v2 (Typora-style WYSIWYM)

## Purpose

Define the second version of the CivicPress record editor, replacing the plain
Markdown editor with a Typora-style WYSIWYM (What You See Is What You Mean)
experience. Content is still stored as Markdown under the hood, but users see
formatted text (headings, lists, images) directly in the editor.

Civic-specific constructs (records, files, geographies) are represented as
inline "chips" or rich components and are backed by a clear Markdown syntax so
everything remains portable and Git-friendly.

The same editor component is used for both **creating new records** and
**editing existing records**, with the workflow adapting based on whether a
record ID exists.

The editor is still **HTTP-only** in v2; the realtime module is not yet a
requirement.

## Scope & Responsibilities

Responsibilities:

- Provide a more modern, Google Docs / Notion-like editing experience
- Keep Markdown as the archival format
- Make civic links (records, zones, attachments) first-class inline elements
- Reduce the need for a separate preview panel
- Prepare the editor surface for v3 realtime collaboration, without changing the
  underlying publish/draft model

Out of Scope:

- Real-time collaborative editing (see `editor-spec-v3.md`)
- Complex workflow automation (handled by `workflows.md`)
- File storage management (handled by `storage.md`)
- WebSocket infrastructure (handled by `realtime-architecture.md`)

## Inputs & Outputs

| Input               | Description                               |
| ------------------- | ----------------------------------------- |
| Record data         | Markdown content with YAML frontmatter    |
| User edits          | WYSIWYM document changes from editor      |
| Civic references    | Record, geography, and file links         |
| User authentication | Role and permission data from auth system |

| Output               | Description                                      |
| -------------------- | ------------------------------------------------ |
| Markdown content     | Serialized Markdown from WYSIWYM document        |
| Draft records        | Database-stored draft content and metadata       |
| Published records    | Git-committed Markdown files with frontmatter    |
| Extracted references | Arrays of linked records, geographies, and files |

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
│   │ ├── WysiwymEditor.vue # ProseMirror/Milkdown editor
│   │ ├── EditorToolbar.vue # Formatting toolbar
│   │ ├── CivicComponents.vue # Record/geography/file chips
│   │ └── ReferenceExtractor.ts # Markdown reference parser
│   └── record/
│     └── RecordSidebar.vue # Metadata sidebar (same as v1)

modules/api/
└── src/
  └── routes/
    └── records.ts # Record CRUD endpoints (extended)

tests/
└── ui/
  └── editor/
    ├── wysiwym-editor.test.ts # WYSIWYM editor tests
    ├── civic-components.test.ts # Civic component tests
    └── record-form.test.ts # RecordForm create/edit tests
```

## Enhancements Over v1

### WYSIWYM Editing

- Headings, lists, blockquotes, code blocks, images are rendered inline
- When the user types typical Markdown patterns (e.g. "# " at start of line),
  they are transformed into a heading block

### Inline Civic Components

- **Record links**:
  - Displayed as inline chips (e.g. "Bylaw 2024-03")
  - Backed by a markdown pattern such as: `[[record:UUID|Label]]`
- **Geography links**:
  - Displayed as inline chips with a small icon
  - Backed by: `[[zone:UUID|Label]]`
- **Attachments**:
  - Files embedded inline as links or icons
  - Backed by a URL using a special scheme, e.g.: `[Filename](asset://fileId)`
- **Images**:
  - Shown as inline images, with caption or alt text
  - Backed by: `![Alt text](asset://fileId)`

> Note: exact syntax can be finalized, but must be consistent and easily parsed.

## UI Changes

### Editor Core

- Switch from CodeMirror to a WYSIWYM stack:
  - Milkdown or ProseMirror as the main editor framework
  - y-prosemirror integration is deferred to v3 (collab), but the schema should
    be future-proof
- No separate preview needed in v2 (optional advanced toggle only)

### Formatting Interactions

- Text selection triggers an inline formatting bubble:
  - Bold, Italic, Underline
  - Lists
  - Links
  - Heading levels
- Slash command menu (stretch): type "/" to insert blocks (optional for v2)

### Sidebar

- Same structure as v1:
  - Details, Metadata, Attachments, Relations, Activity
- Behavior remains similar; only the editor surface changes

### File & Record Insertion

- Insert record:
  - From the sidebar Relations tab: "Link record"
  - From the editor toolbar/menu: "Insert record link"
  - Result: inline chip + frontmatter update
- Insert geography:
  - From Relations tab: choose a zone
  - Optionally insert inline chip
- Insert attachment:
  - From Attachments tab: "Insert into editor"
  - Or drag-and-drop into editor:
    - Auto-upload, create attachment, then embed

## Behavior

### Create vs Edit Mode

The same editor component (`RecordForm` with WYSIWYM editor) is used for both
creating new records and editing existing ones:

- **Create Mode** (`isEditing: false`):
  - No record ID exists yet
  - Initial state: empty WYSIWYM document with template (if selected)
  - Uses `POST /api/v1/records` to create
  - After creation, navigates to edit page with new record ID
  - Activity sidebar hidden (no history yet)
  - Template selection available
  - Civic components can be inserted before saving

- **Edit Mode** (`isEditing: true`):
  - Record ID exists
  - Initial state: loads existing record via `GET /api/v1/records/:id`, converts
    Markdown → WYSIWYM
  - Uses `PUT /api/v1/records/:id/draft` for saves
  - Activity sidebar visible (shows history)
  - Template selection disabled (record already created)

### Serialization

- Editor's internal state (ProseMirror/Milkdown tree) is always serializable
  back to Markdown
- On save or publish:
  - Generate Markdown body from the WYSIWYM document
  - Combine with frontmatter to produce the final file
- **Create Mode**: Serialization happens on first save (creates record)
- **Edit Mode**: Serialization happens on each save (updates draft)

### References & Metadata

- The editor (or backend) parses the Markdown on save/publish to update:
  - linkedRecords (based on `[[record:...]]` patterns)
  - linkedGeographies (based on `[[zone:...]]` patterns)
  - linkedFiles (based on `asset://` links)
- This ensures:
  - Inline content and metadata stay in sync
  - Future automation and search can rely on structured metadata
- **Create Mode**: References are extracted and validated before creation
- **Edit Mode**: References are extracted and updated on each save

### Reference Error Handling

- If an underlying record or zone is missing or invalid:
  - Display inline warning on the chip
  - Keep the markdown intact to avoid data loss
- **Create Mode**: Validate all references exist before allowing creation
- **Edit Mode**: Show warnings but allow saving (references may be fixed later)

## API Endpoints

| Method | Endpoint                               | Description                                                                                                         | Auth Required | Used In |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------- | ------- |
| POST   | `/api/v1/records`                      | Create new record. Body: markdownBody + metadata. Returns created record with ID                                    | Yes           | Create  |
| PUT    | `/api/v1/records/:id/draft`            | Save draft (same as v1)                                                                                             | Yes           | Edit    |
| POST   | `/api/v1/records/:id/publish`          | Publish record (same as v1)                                                                                         | Yes           | Edit    |
| POST   | `/api/v1/records/:id/parse-references` | Input: Markdown (body). Output: arrays of recordIds, geographyIds, fileIds. Used by the UI to keep metadata in sync | Yes           | Both    |

### API Request/Response Examples

#### POST /api/v1/records/:id/parse-references

**Request:**

```http
POST /api/v1/records/abc123/parse-references HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "markdownBody": "This references [[record:xyz789|Bylaw 2024-03]] and [[zone:geo456|Downtown Zone]]."
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "recordIds": ["xyz789"],
    "geographyIds": ["geo456"],
    "fileIds": []
  }
}
```

**Error Response (400):**

```json
{
  "success": false,
  "error": {
    "message": "Invalid Markdown format",
    "code": "PARSE_ERROR",
    "details": "Unable to parse reference syntax"
  }
}
```

### Minimal Changes

- The core publish/draft endpoints remain:
  - `PUT /api/v1/records/:id/draft`
  - `POST /api/v1/records/:id/publish`
- The main addition is an optional backend utility to extract references from
  Markdown:
  - Either:
    - Implemented client-side (Nuxt) and sent as arrays
    - Or:
    - Implemented server-side in API

## Error Handling

### Serialization Errors

- **Markdown generation failures**:
  - Log error with document state for debugging
  - Show user-friendly message: "Unable to save document. Please try again."
  - Preserve editor state to prevent data loss
  - Allow user to copy content manually if needed

### Reference Resolution Errors

- **Invalid record/geography references**:
  - Display inline warning badge on chip: "Reference not found"
  - Allow user to remove or update the reference
  - Keep markdown intact; don't auto-remove broken references
- **Missing file references**:
  - Show warning: "File not found: filename.pdf"
  - Provide option to re-upload or remove reference

### Component Rendering Errors

- **Civic component rendering failures**:
  - Fallback to plain markdown link if component fails to render
  - Log error for debugging
  - Don't block document editing

### Network Failures

- Same error handling as v1 (see `editor-spec-v1.md`)
- Additional consideration: Reference extraction may fail
  - Retry reference parsing on next save
  - Show warning if references can't be extracted

## Performance Considerations

### Editor Performance

- **ProseMirror/Milkdown optimization**:
  - Use efficient document size limits (recommend 1MB max)
  - Implement virtual scrolling for very long documents
  - Lazy load civic component data (records, geographies)
  - Debounce reference extraction (500ms delay)

### Serialization Performance

- **Markdown generation**:
  - Cache serialized markdown when document hasn't changed
  - Use incremental updates when possible
  - Process large documents in chunks
- **Reference extraction**:
  - Perform extraction asynchronously
  - Cache extraction results
  - Batch multiple reference lookups

### Component Rendering

- **Civic component loading**:
  - Lazy load component data on demand
  - Cache component metadata (titles, icons)
  - Use placeholders while loading
- **Image rendering**:
  - Lazy load images outside viewport
  - Use thumbnail previews for large images
  - Optimize image sizes before embedding

### API Performance

- **Reference parsing endpoint**:
  - Cache parsing results for unchanged content
  - Batch multiple reference validations
  - Use efficient regex/parsing algorithms

## Migration & Upgrade Path

### Upgrading from v1 to v2

- **Configuration**:

  ```yaml
  # .civic/editor.yml
  editor:
    version: 'v2'
    enabled: true
  ```

- **Data migration**: No data migration required; v2 reads same Markdown format
- **Backward compatibility**: v1 remains available; can switch back via config
- **User experience**: Users may need brief training on WYSIWYM interface
- **Rollback**: Change configuration to revert to v1

### Enabling v2

- v2 is opt-in; v1 remains default
- Can be enabled per-user or globally:

  ```yaml
  # .civic/editor.yml
  editor:
    default_version: 'v1'
    available_versions: ['v1', 'v2']
    user_preferences: true  # Allow users to choose
  ```

### Upgrading to v3

- v3 requires `modules/realtime` service
- v2 editor surface is reused in v3 (same WYSIWYM UI)
- No data migration needed
- See `editor-spec-v3.md` for v3 upgrade details

## Testing & Validation

### Unit Tests

- **WYSIWYM editor**:
  - Test ProseMirror/Milkdown document manipulation
  - Test Markdown serialization/deserialization
  - Test formatting toolbar interactions
  - Test slash command menu (if implemented)
- **Civic components**:
  - Test record link chip rendering
  - Test geography link chip rendering
  - Test file attachment chip rendering
  - Test component click/edit interactions

### Integration Tests

- **Reference extraction**:
  - Test parsing of `[[record:...]]` syntax
  - Test parsing of `[[zone:...]]` syntax
  - Test parsing of `asset://` links
  - Test reference extraction API endpoint
- **Serialization**:
  - Test WYSIWYM → Markdown conversion
  - Test Markdown → WYSIWYM conversion
  - Test round-trip conversion accuracy

### E2E Tests

- **User workflows**:
  - Test complete record creation workflow (new record → save → edit)
  - Test editing existing record workflow
  - Test template loading and application for new records
  - Test inserting record links via UI (both create and edit)
  - Test inserting geography links via UI (both create and edit)
  - Test drag-and-drop file insertion (both create and edit)
  - Test complete edit → save → publish workflow
- **Component interactions**:
  - Test clicking on civic component chips
  - Test editing component properties
  - Test removing components
  - Test create mode → edit mode transition

### Validation Tests

- **Reference validation**:
  - Test invalid reference detection
  - Test missing record/geography handling
  - Test broken file reference handling
- **Markdown compliance**:
  - Test generated Markdown is valid
  - Test special character handling
  - Test edge cases (empty documents, very long content)

## Relationship to Other Modules

### Relationship to `modules/realtime`

- v2 editor is still fundamentally **stateless per request** and communicates
  over HTTP
- The document structure (ProseMirror/Milkdown schema) should be designed with
  CRDT/future yjs integration in mind:
  - Block and inline types defined in a way compatible with y-prosemirror
- When v3 introduces the realtime module:
  - The same editor surface can be wired to a shared yjs document instead of a
    single local instance

### Relationship to `modules/api`

- Uses same endpoints as v1 for draft/publish
- Optional reference parsing endpoint for metadata sync
- API handles validation, Git commits, and database updates

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
- Civic reference links are validated to ensure they point to valid
  records/geographies
- Reference extraction is performed server-side when possible to prevent
  manipulation

## Related Specs

- [`editor-spec-v1.md`](./editor-spec-v1.md) — Markdown editor (previous
  version)
- [`editor-spec-v3.md`](./editor-spec-v3.md) — Collaborative editor (next
  version)
- [`records.md`](./records.md) — Core record management system
- [`api.md`](./api.md) — API service specification
- [`frontend.md`](./frontend.md) — Frontend UI layer
- [`realtime-architecture.md`](./realtime-architecture.md) — Realtime service
  architecture
- [`workflows.md`](./workflows.md) — Status transition workflows
- [`storage.md`](./storage.md) — File storage system
- [`records-validation.md`](./records-validation.md) — Record validation rules
- [`templates.md`](./templates.md) — Template system

## History

- Created: 2025-12-04 — Initial specification for v2 WYSIWYM editor
