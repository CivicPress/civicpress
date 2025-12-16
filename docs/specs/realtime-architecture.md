# CivicPress Spec: `realtime-architecture.md`

---

version: 1.0.0 status: draft created: '2025-12-04' updated: '2025-12-04'
deprecated: false sunset_date: null breaking_changes: [] additions:

- WebSocket-based realtime service architecture
- yjs document collaboration system
- Presence tracking and room management
- Snapshot persistence strategy fixes: [] migration_guide: null compatibility:
  min_civicpress: '1.0.0' max_civicpress: null dependencies:
- 'editor-spec-v3.md: >=1.0.0'
- 'api.md: >=1.0.0'
- 'auth.md: >=1.0.0'
- 'permissions.md: >=1.0.0' authors:
- 'Core Team <team@civicpress.io>' reviewers: []

---

## Name

`realtime-architecture` — CivicPress Realtime Service Architecture

## Purpose

Define the design and responsibilities of the `modules/realtime` service for
collaborative editing, presence, and future live civic features.

The `realtime` module provides a dedicated service for all **WebSocket-based,
event-driven features** in CivicPress, starting with collaborative editing of
records.

CivicPress keeps Git, Markdown, and SQLite (or another DB) as the **source of
truth** for records. The realtime layer sits on top of that, offering a
responsive experience for editors without replacing the core storage model.

## Scope & Responsibilities

Responsibilities:

- Managing WebSocket connections for:
  - Collaborative editing sessions (records)
  - Presence (who is currently online in a record)
  - Future live channels (consultations, dashboards, notifications)
- Maintaining **yjs documents** for collaborative editors
- Broadcasting changes between connected clients in a given room
- Handling presence metadata (user joined, left, cursor positions)
- Optionally persisting snapshots of the shared state for:
  - Service restarts
  - Better reconnection behavior

Out of Scope:

- Long-term storage of records (DB, Git)
- Authentication source of truth (it trusts tokens validated by `api`)
- Business rules: who may edit, publish, or change status
- UI rendering (handled by `modules/ui`)
- HTTP API endpoints (handled by `modules/api`)

## Inputs & Outputs

| Input                 | Description                                    |
| --------------------- | ---------------------------------------------- |
| WebSocket connections | Client connections with authentication tokens  |
| yjs document updates  | Incremental updates from collaborative editors |
| Presence data         | User cursors, selections, online status        |
| Snapshot requests     | Requests to save/load document snapshots       |

| Output              | Description                               |
| ------------------- | ----------------------------------------- |
| yjs document state  | Shared collaborative document state       |
| Broadcast updates   | yjs updates sent to all room participants |
| Presence broadcasts | User join/leave, cursor position updates  |
| Snapshots           | Periodic yjs state snapshots for recovery |

## File/Folder Location

```
modules/realtime/
├── src/
│ ├── server.ts # WebSocket server entrypoint
│ ├── auth.ts # WebSocket authentication
│ ├── rooms/
│ │ ├── index.ts # Room manager
│ │ └── yjs-room.ts # yjs document room implementation
│ ├── presence/
│ │ ├── index.ts # Presence manager
│ │ └── awareness.ts # yjs awareness tracking
│ ├── persistence/
│ │ ├── snapshots.ts # Snapshot save/load
│ │ └── storage.ts # Snapshot storage adapter
│ └── types/
│   └── messages.ts # WebSocket message types
├── package.json
└── tsconfig.json

tests/
└── realtime/
  ├── websocket-server.test.ts # WebSocket server tests
  ├── yjs-room.test.ts # Room management tests
  └── snapshot.test.ts # Snapshot tests
```

## Design Principles

1. **Separation of concerns**
   - HTTP and REST live in `modules/api`
   - Persistent WebSocket connections live in `modules/realtime`

2. **Git and Markdown stay canonical**
   - Realtime state is transient or cached
   - On publish, records are still serialized to frontmatter + Markdown and
     committed to Git

3. **Minimal coupling**
   - `realtime` relies on `api` for loading and saving document content
   - `realtime` does not own record lifecycle or permissions logic; it delegates
     to the API

4. **Local-first friendly**
   - The architecture should work for a single-node deployment
   - Later, it can be split into multiple services when needed

5. **Gradual adoption**
   - v1 and v2 editors do not require `realtime` to function
   - v3 can turn on collaborative editing for selected deployments without
     breaking existing usage

## High-Level Architecture

### Components

- `modules/ui`
  - Nuxt-based frontend
  - v3 editor uses a WYSIWYM editor connected to yjs
  - Initiates WebSocket connections to the realtime service

- `modules/api`
  - HTTP interface for records, users, auth, storage
  - Load and save record content (drafts, publish)
  - Manage Git commit lifecycle

- `modules/realtime`
  - Node service dedicated to WS traffic
  - Hosts collaborative document rooms (yjs)
  - Communicates with `api` to load and occasionally save snapshots

### Typical Flow (Collaborative Editing - Edit Mode)

1. UI requests a record via API:
   - `GET /api/v1/records/:id`
2. UI initializes the editor with the current Markdown content
3. UI opens a WebSocket connection to `realtime`:
   - `wss://<host>/realtime/records/:id`
4. `realtime`:
   - Authenticates the user (via token/session)
   - Joins them into the corresponding room
   - Sends the current yjs state or an initial snapshot
5. Users edit:
   - Local changes → yjs updates → sent via WebSocket
   - `realtime` forwards updates to other clients in the room
6. Periodic saves:
   - Editor or realtime service serializes yjs → Markdown
   - Sends to `api` for draft save (`PUT /api/v1/records/:id/draft`)
7. Publish:
   - Editor triggers `POST /api/v1/records/:id/publish`
   - API serializes the latest content and commits to Git

### Typical Flow (Record Creation - Create Mode)

1. UI shows empty editor (no record ID yet)
2. User edits content locally (yjs document, but no WebSocket connection)
3. User saves:
   - Serializes yjs → Markdown
   - Creates record via `POST /api/v1/records`
   - Receives new record ID
4. UI navigates to edit page with new record ID
5. **Then** WebSocket connection is established (see Edit Mode flow above)

## Module Boundaries

### UI ←→ Realtime

- Transport: WebSocket (WS/WSS)
- URL: `/realtime/records/:id` for record editors
- Protocol:
  - Binary or JSON messages encapsulating yjs updates
  - Presence messages (user join/leave, idle status)
  - Optional admin/system messages later

### Realtime ←→ API

- Transport: HTTP (internal or external)
- Example endpoints used by realtime:
  - `GET /api/v1/records/:id/collab-snapshot` (optional)
    - To fetch the last known yjs/document state
  - `POST /api/v1/records/:id/collab-snapshot` (optional)
    - To persist snapshots
  - `GET /api/v1/records/:id`
    - As a fallback to reconstruct state from Markdown
- Authentication:
  - Realtime uses an internal token or service account when calling API
  - UI user token is used only for authorization logic within realtime

## WebSocket Protocol Specification

### Connection Establishment

**URL Format:**

```
wss://<host>/realtime/records/:recordId?token=<jwt-token>
```

**Alternative (Header-based auth):**

```
wss://<host>/realtime/records/:recordId
Headers:
  Authorization: Bearer <jwt-token>
```

### Message Format

All messages are JSON objects with the following structure:

```typescript
interface BaseMessage {
  type: string;
  timestamp?: number;
  [key: string]: any;
}
```

### WebSocket Message Types

#### 1. Sync Messages (yjs Updates)

**Client → Server:**

```json
{
  "type": "sync",
  "update": "<base64-encoded-yjs-update>",
  "version": 42
}
```

**Server → Client:**

```json
{
  "type": "sync",
  "update": "<base64-encoded-yjs-update>",
  "version": 43,
  "from": "user-id-123"
}
```

#### 2. Presence Messages

**User Joined:**

```json
{
  "type": "presence",
  "event": "joined",
  "user": {
    "id": "user-id-123",
    "name": "John Doe",
    "color": "#3b82f6"
  }
}
```

**User Left:**

```json
{
  "type": "presence",
  "event": "left",
  "user": {
    "id": "user-id-123"
  }
}
```

**Cursor Update:**

```json
{
  "type": "presence",
  "event": "cursor",
  "user": {
    "id": "user-id-123"
  },
  "cursor": {
    "position": 42,
    "selection": {
      "start": 40,
      "end": 45
    }
  }
}
```

**Awareness Update (yjs awareness):**

```json
{
  "type": "presence",
  "event": "awareness",
  "user": {
    "id": "user-id-123"
  },
  "awareness": "<base64-encoded-yjs-awareness>"
}
```

#### 3. Control Messages

**Room State:**

```json
{
  "type": "control",
  "event": "room_state",
  "room": {
    "id": "record:abc123",
    "participants": [
      {
        "id": "user-id-123",
        "name": "John Doe",
        "color": "#3b82f6"
      }
    ],
    "yjsState": "<base64-encoded-yjs-state>",
    "version": 42
  }
}
```

**Error:**

```json
{
  "type": "control",
  "event": "error",
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "You don't have permission to edit this record"
  }
}
```

**System Notice:**

```json
{
  "type": "control",
  "event": "notice",
  "notice": {
    "level": "info",
    "message": "Record was published in another tab"
  }
}
```

#### 4. Heartbeat/Ping

**Client → Server:**

```json
{
  "type": "ping"
}
```

**Server → Client:**

```json
{
  "type": "pong",
  "timestamp": 1701705600000
}
```

### Connection Lifecycle

1. **Client connects** → Server sends `room_state` message
2. **Client sends `sync` updates** → Server broadcasts to other clients
3. **Client sends `presence` updates** → Server broadcasts to other clients
4. **Periodic `ping`/`pong`** → Keep connection alive (every 30 seconds)
5. **Client disconnects** → Server sends `presence:left` to other clients

### WebSocket Error Handling

**Connection Errors:**

- Invalid token → Close connection with error message
- Permission denied → Close connection with `PERMISSION_DENIED` error
- Room not found → Close connection with `ROOM_NOT_FOUND` error
- Rate limit exceeded → Close connection with `RATE_LIMIT_EXCEEDED` error

**Message Errors:**

- Invalid message format → Send error message, keep connection open
- Invalid yjs update → Log error, ignore message
- Version mismatch → Request full state sync

## Rooms and Document Model

### Room Identification

- A **room** corresponds to a single shared document context
- For record collaboration:
  - Room key: `record:<recordId>`
  - **Note**: Rooms only exist for records that have been created (have an ID)
  - Creating a new record does not create a room until the record is saved and
    has an ID

The system should allow future room types, for example:

- `consultation:<id>`
- `dashboard:<id>`

### Document State

For collaborative editing:

- Each room has a **yjs document**
- The document is the canonical in-memory collaboration state:
  - Insertions, deletions, formatting
  - Civic reference nodes (records, geographies, attachments)

The schema in the editor (ProseMirror/Milkdown) must be designed to map cleanly
into yjs structures.

### Lifecycle of a Room

1. First client connects:
   - Realtime checks if a yjs state exists in memory
   - If not:
     - Attempts to load a snapshot from API:
       - `GET /api/v1/records/:id/collab-snapshot`
     - If no snapshot exists:
       - Loads `GET /api/v1/records/:id` and converts Markdown to initial yjs
         state
2. Subsequent clients:
   - Join the existing room
   - Receive the current yjs state
3. When last client leaves:
   - Realtime may:
     - Keep yjs state in memory for a grace period
     - Or immediately persist a snapshot and clear from memory

Retention strategies can be tuned for memory vs performance.

## Authentication and Authorization

### Handshake

When a client connects to the realtime service:

1. Client includes a token (e.g. JWT or session token) in:
   - Query string: `?token=<jwt>`
   - Or headers via initial HTTP upgrade request:
     `Authorization: Bearer <token>`
2. Realtime validates:
   - Signature (if JWT)
   - Or calls an API endpoint to validate token/session:
     - e.g. `GET /api/v1/auth/me`
3. Realtime validates record exists:
   - Checks that record ID in URL exists
   - If record doesn't exist, connection is rejected
4. If valid:
   - Determine user id, roles, and permissions
   - Allow joining the room
5. If invalid:
   - Connection is immediately closed with error message

**Note**: WebSocket connections are only established for existing records (edit
mode). New record creation happens via HTTP API first, then WebSocket connection
is established after record ID is obtained.

### Permissions

Realtime checks with `modules/api` (or uses shared logic) to verify:

- Whether the user may:
  - View the record
  - Edit the record
  - Collaborate in real-time
- Unauthorized users:
  - Can be connected but read-only
  - Or rejected entirely, depending on policy

The realtime service should not duplicate complex business rules; it should
defer to `api` for those decisions.

## Message Types

At a high level, messages passing through WebSockets can be grouped as:

1. **Sync messages**
   - Encapsulate yjs updates (binary payloads)
   - Used by yjs to keep documents in sync

2. **Presence messages**
   - User joined, left
   - Cursor position, selection ranges
   - Optional "typing" or "idle" signals

3. **Control messages** (later)
   - Kick user from room (admin actions)
   - Lock/unlock document (if municipality wants strict locking)
   - System notices (e.g. "record was published in another tab")

The protocol should be documented as a small, explicit schema once implemented.

## Persistence and Snapshots

### Why Snapshots?

- yjs stores incremental updates; over time, the update log can grow large
- Snapshots allow:
  - Faster initial load
  - Limited memory usage after restarts
  - Better resilience on crashes

### Snapshot Strategy

- Realtime service may:
  - Periodically take a snapshot of the yjs doc:
    - e.g. every N minutes (default: 5 minutes)
    - or after M updates (default: 100 updates)
  - Send it to API via:
    - `POST /api/v1/records/:id/collab-snapshot`
- API:
  - Stores snapshot in DB or as a file
  - Associates it with record ID and timestamp
  - Maintains version number for snapshot tracking

On reconnect:

- Realtime loads:
  - Latest snapshot if available
  - Then applies any newer updates if such a mechanism is added later

For v3 initial implementation, snapshotting can be basic and tuned later.

## Error Handling

### Connection Errors

- **Authentication failures**:
  - Close connection immediately
  - Send error message:
    `{"type": "control", "event": "error", "error": {"code": "AUTH_FAILED"}}`
  - Log failure for security monitoring
- **Permission failures**:
  - Close connection with permission error
  - Provide clear error message to user
  - Allow read-only connection if policy permits

### Sync Errors

- **Invalid yjs updates**:
  - Log error with update details
  - Ignore invalid update (don't broadcast)
  - Request full state sync if corruption detected
- **Version conflicts**:
  - Request full document state from server
  - Merge using yjs CRDT semantics
  - Log conflict for monitoring

### Snapshot Errors

- **Snapshot load failures**:
  - Fallback to loading record from API
  - Convert Markdown → yjs as initial state
  - Log error for debugging
- **Snapshot save failures**:
  - Retry with exponential backoff
  - Don't block editing if save fails
  - Alert administrators if persistent failures

### Rate Limiting Errors

- **Too many messages**:
  - Throttle client messages (max 10/second)
  - Send warning:
    `{"type": "control", "event": "notice", "notice": {"level": "warning", "message": "Rate limit approaching"}}`
  - Close connection if rate limit exceeded

## Performance Considerations

### WebSocket Performance

- **Message batching**:
  - Batch multiple yjs updates into single message when possible
  - Limit message size to 64KB (WebSocket frame limit)
  - Split large updates across multiple messages
- **Update frequency**:
  - Throttle broadcasts (max 10 updates/second per client)
  - Debounce rapid updates (100ms window)
  - Prioritize critical updates (cursors, presence)

### Memory Management

- **Room cleanup**:
  - Remove yjs documents when last client disconnects
  - Keep snapshots for 1 hour after last disconnect (configurable)
  - Monitor memory usage and warn if high (>80% of available)
- **Document size limits**:
  - Recommend maximum 1MB per yjs document
  - Warn if document exceeds 500KB
  - Consider splitting very large documents

### Snapshot Performance

- **Snapshot frequency**:
  - Default: Every 5 minutes or after 100 updates
  - Configurable per deployment
  - Balance between performance and recovery
- **Snapshot compression**:
  - Compress snapshots before storage (gzip)
  - Limit snapshot size (warn if > 500KB)
  - Consider incremental snapshots for large documents

### Scaling Considerations

- **Single-node performance**:
  - Handle up to 1000 concurrent connections per instance
  - Support up to 100 active rooms per instance
  - Monitor CPU and memory usage
- **Multi-node scaling**:
  - Use Redis for shared yjs awareness state
  - Implement sticky sessions or state synchronization
  - Monitor cross-node message latency

## Deployment and Scaling

### Minimal Setup (Single Node)

For small municipalities and demos:

- `api`, `ui`, and `realtime` can all run on the same EC2 instance
- Nginx routes:
  - `/api/*` → CivicPress API
  - `/` → CivicPress UI
  - `/realtime/*` → realtime service (WS)

This may be enough for many use cases.

### Future Scaling

As usage grows:

- `realtime` can be deployed as a separate process or host
- Nginx (or another proxy) can route `/realtime` traffic externally
- Add Redis (or other) as a yjs awareness adapter if needed:
  - For multiple realtime instances sharing the same rooms
- Separate monitoring, logs, and resource allocation for:
  - API (CPU and DB bound)
  - Realtime (network and memory bound)

## Monitoring and Observability

Realtime service should expose basic metrics:

- Number of connected clients
- Number of rooms
- Average room size
- Message rates (per second or per minute)
- Errors and disconnect reasons
- Memory usage per room
- Snapshot save/load success rates

Logs should include:

- Room join/leave events
- Auth failures
- Snapshot save/load errors
- High-level exceptions
- Rate limit violations
- Performance warnings (slow operations)

This is especially important for municipal IT and hosting providers who may need
reassurance about stability.

## Testing & Validation

### Unit Tests

- **WebSocket server**:
  - Test connection establishment
  - Test authentication flow
  - Test message routing
  - Test error handling
- **Room management**:
  - Test room creation and cleanup
  - Test yjs document initialization
  - Test snapshot save/load
- **Presence tracking**:
  - Test user join/leave events
  - Test cursor updates
  - Test awareness synchronization

### Integration Tests

- **Multi-client scenarios**:
  - Test multiple clients editing same document
  - Test yjs update synchronization
  - Test presence broadcasting
  - Test reconnection scenarios
- **API integration**:
  - Test snapshot endpoint integration
  - Test authentication endpoint integration
  - Test permission checking

### E2E Tests

- **Collaborative workflows**:
  - Test complete collaborative editing session
  - Test reconnection during active editing
  - Test snapshot recovery after restart
- **Error scenarios**:
  - Test authentication failure handling
  - Test permission revocation during edit
  - Test network failure recovery

### Performance Tests

- **Load testing**:
  - Test with 100+ concurrent connections
  - Test with 50+ active rooms
  - Test message throughput
  - Test memory usage under load
- **Stress testing**:
  - Test with very large documents (>500KB)
  - Test with rapid update bursts
  - Test snapshot performance under load

## Migration & Upgrade Path

### Enabling Realtime Service

- Realtime service is optional; required only for v3 editor
- Can be enabled via configuration:

  ```yaml
  # .civic/realtime.yml
  realtime:
    enabled: true
    port: 3001
    host: '0.0.0.0'
    snapshot:
      enabled: true
      interval: 300  # seconds
      max_updates: 100
  ```

### Upgrading from Single-Node to Multi-Node

- **Initial setup**: All services on single node
- **Step 1**: Deploy realtime as separate process (same host)
- **Step 2**: Deploy realtime on separate host
- **Step 3**: Add Redis for shared state (if needed)
- **Configuration updates**:

  ```yaml
  # .civic/realtime.yml
  realtime:
    redis:
      enabled: true
      url: 'redis://redis-host:6379'
  ```

### Feature Flags

- Control realtime features via configuration:

  ```yaml
  # .civic/features.yml
  features:
    realtime: true
    collaborative_editing: true
    presence_tracking: true
    snapshots: true
  ```

## Security & Trust Considerations

- All realtime connections must use WSS in production
- Tokens must be validated and short-lived
- Rate limiting should be considered:
  - Per connection (max 10 messages/second)
  - Per IP (max 100 connections per IP)
  - Per user (max 10 concurrent connections per user)
- A configuration option should exist to:
  - Disable realtime entirely
  - Or restrict it to specific roles
- WebSocket authentication must validate user permissions for each record
- Presence data should not expose sensitive user information
- yjs updates should be validated to prevent malicious document manipulation
- Snapshot storage must be secured and access-controlled
- Connection limits per user/IP to prevent abuse
- Monitor for suspicious patterns (rapid connections, unusual message patterns)

## Roadmap Integration

- **v1 editor**: does not depend on `modules/realtime`
- **v2 editor**: still HTTP-only; WYSIWYM editor prepares the ground
- **v3 editor**:
  - Integrates with `modules/realtime` for yjs-based collaborative editing
  - Uses the room model and message flows described here

Future features likely to use the same module:

- Realtime consultations (live vote/feedback sessions)
- Live dashboards for council sessions
- Notifications stream for clerks and admins

The realtime module should remain generic enough to handle these future
extensions without major redesign.

## Related Specs

- [`editor-spec-v1.md`](./editor-spec-v1.md) — Markdown editor (no realtime)
- [`editor-spec-v2.md`](./editor-spec-v2.md) — WYSIWYM editor (no realtime)
- [`editor-spec-v3.md`](./editor-spec-v3.md) — Collaborative editor (uses
  realtime)
- [`api.md`](./api.md) — API service specification
- [`auth.md`](./auth.md) — Authentication system
- [`permissions.md`](./permissions.md) — Permission system
- [`records.md`](./records.md) — Core record management system
- [`frontend.md`](./frontend.md) — Frontend UI layer

## Open Questions

- How frequently should snapshots be saved?
- Do some municipalities prefer hard edit locks over CRDT-style collaboration?
- Should anonymous or public users ever be allowed to connect to realtime
  channels (for consultations)?

These questions can be refined in future revisions of this spec once early
pilots provide more operational feedback.

## History

- Created: 2025-12-04 — Initial specification for realtime service architecture
