# CivicPress Spec: `editor-spec-v3.md`

---

version: 1.0.0 status: draft created: '2025-12-04' updated: '2025-12-04'
deprecated: false sunset_date: null breaking_changes: [] additions:

- Real-time collaborative editing using yjs
- WebSocket-based document synchronization
- Presence indicators and cursor tracking
- Snapshot persistence for reconnection fixes: [] migration_guide: null
  compatibility: min_civicpress: '1.0.0' max_civicpress: null dependencies:
- 'editor-spec-v2.md: >=1.0.0'
- 'realtime-architecture.md: >=1.0.0'
- 'records.md: >=1.0.0'
- 'api.md: >=1.0.0'
- 'frontend.md: >=1.0.0' authors:
- 'Core Team <team@civicpress.io>' reviewers: []

---

## Name

`editor-spec-v3` — CivicPress Record Editor v3 (Collaborative Editing / CRDT
with Realtime Module)

## Purpose

Define the third version of the CivicPress record editor, upgrading the editor
to real-time collaborative editing using yjs, integrated through a dedicated
**`modules/realtime`** service.

Multiple users can edit the same record at once, with conflict-free merging and
presence indicators. The underlying storage model (Markdown + Git + DB) remains
the same; only the editing "transport" and state handling changes.

The same editor component is used for both **creating new records** and
**editing existing records**. However, collaborative editing (WebSocket) is only
active in edit mode after a record has been created.

## Scope & Responsibilities

Responsibilities:

- Enable multiple clerks and staff to edit the same record in real time
- Avoid edit conflicts without manual locking
- Keep Git + Markdown as the source of truth on publish
- Isolate realtime concerns inside `modules/realtime` so it can scale
  independently in the future
- Provide presence indicators (who is editing, cursor positions)
- Handle reconnection and state recovery

Out of Scope:

- Complex workflow automation (handled by `workflows.md`)
- File storage management (handled by `storage.md`)
- Authentication and authorization (handled by `auth.md` and `permissions.md`)
- Long-term storage of records (handled by `records.md`)

## Inputs & Outputs

| Input                 | Description                                  |
| --------------------- | -------------------------------------------- |
| Record data           | Markdown content with YAML frontmatter       |
| User edits            | Real-time yjs document updates               |
| WebSocket messages    | yjs updates, presence data, control messages |
| Authentication tokens | JWT or session tokens for WebSocket auth     |

| Output             | Description                                   |
| ------------------ | --------------------------------------------- |
| yjs document state | Shared collaborative document state           |
| Markdown content   | Serialized Markdown from yjs document         |
| Draft records      | Database-stored draft content and metadata    |
| Published records  | Git-committed Markdown files with frontmatter |
| Presence data      | User online status, cursors, selections       |
| Snapshots          | Periodic yjs state snapshots for recovery     |

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
│ │   │   └── edit.vue # Edit existing record (v3 with WebSocket)
│ │   └── [id].vue # Record view page
│ └── components/
│   ├── RecordForm.vue # Shared form component (used for both create and edit)
│   ├── editor/
│   │ ├── CollaborativeEditor.vue # yjs-enabled editor
│   │ ├── PresenceIndicator.vue # User avatars/cursors
│   │ └── ReconnectionHandler.vue # WebSocket reconnection
│   └── record/
│     └── RecordSidebar.vue # Metadata sidebar (same as v1/v2)

modules/realtime/
├── src/
│ ├── server.ts # WebSocket server entrypoint
│ ├── auth.ts # WebSocket authentication
│ ├── rooms/
│ │ └── yjs-room.ts # yjs document room management
│ ├── presence/
│ │ └── index.ts # Presence tracking
│ └── persistence/
│   └── snapshots.ts # Snapshot save/load

modules/api/
└── src/
  └── routes/
    └── records.ts # Record CRUD endpoints (extended with snapshots)

tests/
└── ui/
  └── editor/
    ├── collaborative-editor.test.ts # Collaborative editing tests
    ├── websocket-integration.test.ts # WebSocket integration tests
    └── record-form.test.ts # RecordForm create/edit tests
```

## Architecture Overview

### Components

1. **UI (modules/ui)**
   - Uses the v2 WYSIWYM editor (Milkdown/ProseMirror)
   - Connects to the realtime service over WebSocket for collaborative documents
   - Renders presence, cursors, and selections

2. **Realtime Service (modules/realtime)**
   - Dedicated Node service handling WebSocket connections
   - Maintains yjs documents for each record being edited
   - Manages rooms, presence, and broadcast of updates
   - Optionally persists snapshots and provides reconnect support

3. **API (modules/api)**
   - Still responsible for:
     - Draft and publish lifecycle
     - Git writes
     - DB storage and metadata
   - Provides HTTP endpoints used when:
     - Loading initial content
     - Saving draft snapshots
     - Publishing a finalized version

## WebSocket Endpoint

The realtime service exposes a WebSocket endpoint:

- `wss://<host>/realtime/records/:id`

Responsibilities:

- Authenticate and authorize the user
- Join them into a room keyed by record ID
- Sync yjs updates between all participants
- Track presence (online users, cursors, selections)

## Data Flow

### 1. Initial Load (Edit Mode)

1. UI calls API over HTTP:
   - `GET /api/v1/records/:id`
   - Retrieves current draft/published Markdown and metadata
2. UI converts Markdown → ProseMirror/Milkdown → yjs document (local)
3. UI opens a WebSocket connection to `modules/realtime` for that record
4. Realtime service:
   - Sends existing yjs state or snapshot if available
   - Merges local and remote state (standard yjs behavior)

### 1a. Initial Load (Create Mode)

1. UI shows empty editor (no record ID yet)
2. User can select template and start editing
3. **No WebSocket connection** until record is created
4. On save:
   - Creates record via `POST /api/v1/records`
   - Receives new record ID
   - Navigates to edit page
   - **Then** opens WebSocket connection for collaborative editing

### 2. Realtime Editing

- Each local change in the editor updates the yjs document
- yjs generates updates and sends them over WebSocket
- Realtime service:
  - Broadcasts updates to all other clients in the room
- Each client applies incoming updates to their yjs document, updating their
  editor in real time

### 3. Saving Draft

- **Edit Mode**:
  - At intervals or on request, the UI:
    - Serializes yjs → ProseMirror/Milkdown → Markdown
    - Calls `PUT /api/v1/records/:id/draft` with the Markdown and metadata
  - Alternatively, the realtime service:
    - Periodically serializes snapshots and sends them to the API (optional
      v3.1+)

- **Create Mode**:
  - No WebSocket connection active
  - User edits in local yjs document
  - On save:
    - Serializes yjs → ProseMirror/Milkdown → Markdown
    - Calls `POST /api/v1/records` to create record
    - After creation, WebSocket connection is established for collaborative
      editing

### 4. Publishing

- When a user hits Publish:
  - UI (or realtime service in a future version) serializes the current yjs
    state to Markdown
  - UI calls `POST /api/v1/records/:id/publish` (same as v1/v2)
  - API:
    - Builds frontmatter
    - Writes file into Git repo
    - Commits with message `Publish record {title} ({id})`
    - Updates DB with publishedGitSha and status

## Presence and UX

### Presence

- Each participant has:
  - A user ID
  - A display name
  - A color assigned for their cursor/selection
- UI shows:
  - Small avatars or initials in the header (e.g. "2 people editing")
  - Colored cursors and selection ranges within the editor

### Locking (optional)

- v3 can rely purely on CRDT (no locking)
- A simple lock mode can be added later for municipalities that prefer "one
  editor at a time"

## API Endpoints

| Method | Endpoint                              | Description                                                                      | Auth Required | Used In |
| ------ | ------------------------------------- | -------------------------------------------------------------------------------- | ------------- | ------- |
| POST   | `/api/v1/records`                     | Create new record. Body: markdownBody + metadata. Returns created record with ID | Yes           | Create  |
| GET    | `/api/v1/records/:id`                 | Returns draft state (same as v1/v2)                                              | Yes           | Edit    |
| PUT    | `/api/v1/records/:id/draft`           | Save draft (same as v1/v2)                                                       | Yes           | Edit    |
| POST   | `/api/v1/records/:id/publish`         | Publish record (same as v1/v2)                                                   | Yes           | Edit    |
| GET    | `/api/v1/records/:id/collab-snapshot` | Used by realtime service to restore state after restart                          | Yes           | Edit    |
| POST   | `/api/v1/records/:id/collab-snapshot` | Used by realtime service to persist important versions                           | Yes           | Edit    |

### API Request/Response Examples

#### GET /api/v1/records/:id/collab-snapshot

**Request:**

```http
GET /api/v1/records/abc123/collab-snapshot HTTP/1.1
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "recordId": "abc123",
    "snapshot": "<base64-encoded-yjs-state>",
    "timestamp": "2025-12-04T15:00:00Z",
    "version": 42
  }
}
```

**Not Found Response (404):**

```json
{
  "success": false,
  "error": {
    "message": "No snapshot found for this record",
    "code": "SNAPSHOT_NOT_FOUND"
  }
}
```

#### POST /api/v1/records/:id/collab-snapshot

**Request:**

```http
POST /api/v1/records/abc123/collab-snapshot HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "snapshot": "<base64-encoded-yjs-state>",
  "version": 42
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "recordId": "abc123",
    "timestamp": "2025-12-04T15:00:00Z",
    "version": 42
  },
  "message": "Snapshot saved successfully"
}
```

### Existing HTTP Endpoints (Unchanged)

- `PUT /api/v1/records/:id/draft`
- `POST /api/v1/records/:id/publish`
- `GET /api/v1/records/:id`

v3 does not change the way publish/draft operates; it only changes how the
editor holds "live" state between saves.

## Error Handling

### WebSocket Connection Errors

- **Connection failures**:
  - Automatic reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s)
  - Show connection status indicator: "Reconnecting..."
  - After 5 failed attempts, show error: "Unable to connect. Please refresh."
  - Queue local changes for sync when connection restored

### Reconnection Handling

- **On reconnect**:
  - Request latest yjs state from server
  - Merge local changes with server state (yjs handles this automatically)
  - Resolve any conflicts using CRDT semantics
  - Show notification: "Reconnected. Changes synced."

### Sync Errors

- **Update application failures**:
  - Log error for debugging
  - Show warning: "Some changes may not be synced. Please save manually."
  - Allow manual save via "Save Draft" button
  - Preserve local document state

### Snapshot Errors

- **Snapshot load failures**:
  - Fallback to loading record from API and converting Markdown → yjs
  - Show warning: "Using latest published version"
  - Continue with collaborative editing from that point
- **Snapshot save failures**:
  - Log error but don't block editing
  - Retry snapshot save in background
  - Show warning if multiple save attempts fail

### Permission Errors

- **Permission denied on connect**:
  - Close WebSocket connection immediately
  - Show error: "You don't have permission to edit this record"
  - Redirect to read-only view if available
- **Permission revoked during edit**:
  - Show warning: "Edit permissions revoked"
  - Disable editing, allow read-only viewing
  - Save any pending changes before disabling

### Conflict Resolution

- **yjs CRDT handles conflicts automatically**:
  - No manual conflict resolution needed
  - All changes merge conflict-free
  - Last-write-wins for identical positions (rare)
- **If CRDT merge fails** (edge case):
  - Log error with document state
  - Show warning: "Sync conflict detected. Reloading document."
  - Reload from server and reapply local changes

## Performance Considerations

### WebSocket Performance

- **Message batching**:
  - Batch multiple yjs updates into single WebSocket message when possible
  - Limit message size to 64KB (WebSocket frame limit)
  - Split large updates into multiple messages if needed
- **Update frequency**:
  - Throttle update broadcasts (max 10 updates/second per client)
  - Debounce rapid typing (send updates every 100ms)
  - Prioritize critical updates (cursor position, presence)

### yjs Document Performance

- **Document size limits**:
  - Recommend maximum 1MB per document
  - Monitor yjs document size and warn if approaching limit
  - Consider splitting very large documents
- **Update processing**:
  - Process yjs updates asynchronously to avoid blocking UI
  - Use efficient yjs update encoding (binary format)
  - Cache frequently accessed document sections

### Snapshot Performance

- **Snapshot frequency**:
  - Default: Every 5 minutes or after 100 updates
  - Configurable per deployment
  - Balance between performance and recovery capability
- **Snapshot size**:
  - Compress snapshots before storage
  - Limit snapshot size (warn if > 500KB)
  - Consider incremental snapshots for large documents

### Memory Management

- **Room cleanup**:
  - Remove yjs documents from memory when last client disconnects
  - Keep snapshots for 1 hour after last disconnect (configurable)
  - Monitor memory usage and warn if high
- **Client-side memory**:
  - Clean up yjs documents when navigating away
  - Limit number of open editor tabs
  - Use efficient data structures for presence tracking

## Migration & Upgrade Path

### Upgrading from v2 to v3

- **Prerequisites**:
  - `modules/realtime` service must be deployed and running
  - WebSocket support in infrastructure (WSS in production)
  - Configuration update required
- **Configuration**:

  ```yaml
  # .civic/editor.yml
  editor:
    version: 'v3'
    enabled: true
    realtime:
      enabled: true
      url: 'wss://api.example.com/realtime'
      reconnect_attempts: 5
      snapshot_interval: 300  # seconds
  ```

- **Data migration**: No data migration required; v3 uses same data model
- **Backward compatibility**: v1 and v2 remain available; v3 is opt-in
- **Rollback**: Can disable v3 and revert to v1/v2 without data loss

### Enabling v3

- v3 requires `modules/realtime` service
- Can be enabled globally or per-record-type:

  ```yaml
  # .civic/editor.yml
  editor:
    default_version: 'v2'
    available_versions: ['v1', 'v2', 'v3']
    v3:
      enabled: true
      record_types: ['bylaw', 'policy']  # Enable for specific types
  ```

### Feature Flags

- Control v3 features via feature flags:

  ```yaml
  # .civic/features.yml
  features:
    editor_v3: true
    collaborative_editing: true
    presence_tracking: true
    snapshots: true
  ```

## Testing & Validation

### Unit Tests

- **Collaborative editor**:
  - Test yjs document initialization
  - Test yjs update generation and application
  - Test presence tracking
  - Test reconnection logic
- **WebSocket integration**:
  - Test connection establishment
  - Test message sending/receiving
  - Test error handling
  - Test reconnection scenarios

### Integration Tests

- **Realtime service integration**:
  - Test multiple clients editing same document
  - Test yjs update synchronization
  - Test presence broadcasting
  - Test snapshot save/load
- **API integration**:
  - Test snapshot endpoints
  - Test draft save with yjs state
  - Test publish workflow with collaborative state

### E2E Tests

- **Collaborative workflows**:
  - Test complete record creation workflow (new record → save → collaborative
    edit)
  - Test two users editing simultaneously (edit mode)
  - Test cursor/selection visibility
  - Test reconnection during active editing
  - Test publish with multiple editors
- **Error scenarios**:
  - Test network failure recovery (both create and edit)
  - Test permission revocation during edit
  - Test snapshot failure fallback
  - Test create mode → edit mode transition with WebSocket

### Validation Tests

- **yjs synchronization**:
  - Test CRDT conflict resolution
  - Test update ordering and consistency
  - Test document state consistency across clients
- **Snapshot validation**:
  - Test snapshot round-trip (save → load)
  - Test snapshot versioning
  - Test snapshot recovery after crash

## Realtime Service (`modules/realtime`) Design

### Suggested Structure

- `modules/realtime/`
  - `src/server.ts`
  - `src/auth.ts`
  - `src/rooms/yjs-room.ts`
  - `src/presence/index.ts`
  - `src/persistence/snapshots.ts`

### Core Responsibilities

- Handle WebSocket connections
- Verify authentication tokens and roles (clerk, admin, etc.)
- Maintain a yjs document per record ID
- Broadcast updates to room participants
- Optionally write/read snapshots from:
  - Database via modules/api
  - Or direct DB access

## Relationship to Other Modules

### Relationship with Future Realtime Features

- `modules/realtime` should be designed for more than editing:
  - Clerk notifications
  - Live dashboards
  - Realtime consultations or votes
- Collaborative editing is the first major consumer, but the module should be
  generic enough to host:
  - Multiple WS namespaces/rooms (e.g. `/realtime/records`,
    `/realtime/consultations`, `/realtime/dashboards`)

### Relationship to `modules/api`

- Uses same endpoints as v1/v2 for draft/publish
- Optional snapshot endpoints for state recovery
- API handles validation, Git commits, and database updates

### Relationship to `modules/ui`

- Editor is part of the UI module
- `RecordForm` component is shared between create and edit pages
- Create pages (`new.vue`, `[type]/new.vue`) use `RecordForm` with
  `isEditing: false` (no WebSocket)
- Edit pages (`[id]/edit.vue`) use `RecordForm` with `isEditing: true` and
  `record` prop (WebSocket active)
- Uses Nuxt 3 composables for state management
- Integrates with authentication and permission systems
- WebSocket connection managed by UI layer (only in edit mode)

## Security & Trust Considerations

- All WebSocket connections must use WSS in production
- Tokens must be validated and short-lived
- Rate limiting should be considered:
  - Per connection
  - Per IP, where applicable
- A configuration option should exist to:
  - Disable realtime entirely
  - Or restrict it to specific roles
- WebSocket authentication must validate user permissions for each record
- Presence data should not expose sensitive user information
- yjs updates should be validated to prevent malicious document manipulation
- Snapshot storage must be secured and access-controlled

## Related Specs

- [`editor-spec-v1.md`](./editor-spec-v1.md) — Markdown editor (first version)
- [`editor-spec-v2.md`](./editor-spec-v2.md) — WYSIWYM editor (previous version)
- [`realtime-architecture.md`](./realtime-architecture.md) — Realtime service
  architecture
- [`records.md`](./records.md) — Core record management system
- [`api.md`](./api.md) — API service specification
- [`frontend.md`](./frontend.md) — Frontend UI layer
- [`auth.md`](./auth.md) — Authentication system
- [`permissions.md`](./permissions.md) — Permission system
- [`workflows.md`](./workflows.md) — Status transition workflows

## History

- Created: 2025-12-04 — Initial specification for v3 collaborative editor
