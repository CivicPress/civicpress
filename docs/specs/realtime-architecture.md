# CivicPress Spec: `realtime-architecture.md`

---

version: 1.0.0 status: as-shipped (Phase 3, 2026-06) created: '2025-12-04' updated: '2026-06'
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

## As-shipped status (Phase 3, 2026-06)

> This document was originally a forward-looking design. The realtime module
> shipped in **Phase 3** of the 2026-05 base refactor; the bullets below state
> what is **actually shipped** and **supersede any conflicting detail later in
> this spec**. Where the original prose still describes a different design (e.g.
> a JSON sync protocol, or HTTP `collab-snapshot` endpoints), treat that prose as
> historical design intent, not current behavior.
>
> **As shipped:**
>
> - **Protocol is binary y-protocols** (Yjs CRDT over WebSocket). Application
>   data on the wire is the binary `SYNC` and `AWARENESS` (presence) frames. The
>   only JSON frame the server sends is a `control`/`error` notification on a
>   rejected/failed message. There is no JSON `sync`, `room_state`, `pong`, or
>   heartbeat message.
> - **Hosting is in-process with the API.** The same Node process that serves the
>   REST API hosts the realtime WebSocket server on its **own port** (default
>   `3001`), gated by `realtime.enabled`. There is no standalone realtime service
>   in the production topology and no `civic realtime …` CLI command. Because they
>   share a process, the API calls the realtime server in-memory (the
>   `POST /api/v1/records/:id/snapshot` endpoint).
> - **Writeback is server-side, to a review-gated DRAFT — not a Git commit.** A
>   server-side serializer (`@civicpress/editor-schema`) turns the room's Yjs doc
>   into Markdown, and `RecordRoomHandler` writes it to `record_drafts.markdown_body`
>   via the canonical `DatabaseService.getDraft/createDraft/updateDraft` pipeline,
>   authored `realtime-snapshot`. It does **not** auto-commit to Git; a human
>   *publish* is what turns a draft into a Git commit. (The earlier design's
>   `recordManager.saveDraft`-produces-a-Git-commit model was based on a fictional
>   method; see the Phase 3 design spec §6.2/§6.3 as-shipped correction.)
> - **Snapshots are an ephemeral merge-aid, not the archive.** Snapshot blobs are
>   integrity-hashed (sha256), format-versioned, size-aware, and TTL-cleaned after
>   **48h** of inactivity (a 6h sweep). On a hash mismatch or too-new format
>   version the server re-seeds the room from the record's Markdown. **The durable
>   civic archive is the Markdown in Git.**
> - **Room types use a handler registry** (`RoomTypeHandler` + handler registry).
>   Today only the `records` room type is registered (`RecordRoomHandler`); the
>   pattern is the extension seam for future types (consultations, dashboards,
>   notifications). Broadcast-box / device room routing was removed in Phase 3.
> - **Deferred (carry-forward):** rendering collaborative writebacks as auditable
>   Git civic events (a `realtime-snapshot`-authored commit, or an opt-in
>   auto-publish / draft-history branch) — to be designed once governance is
>   settled; a multi-node Redis fan-out adapter; browser E2E (integration tests
>   use simulated y-protocols clients).

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
  - WebSocket server dedicated to binary y-protocols (Yjs) traffic
  - Hosts collaborative document rooms (yjs)
  - **Runs in-process with `api`** on its own port (default `3001`); not a
    separate deployable service in the shipped topology
  - Serializes the room's Yjs doc to Markdown server-side and writes it back to
    the record's DB **draft** (no HTTP round-trip to `api` for the writeback —
    it shares the process and calls the DB pipeline directly)

- `packages/editor-schema` (`@civicpress/editor-schema`)
  - The single source of truth for the editor document schema (ProseMirror
    StarterKit subset + civic-ref nodes + GFM tables) and the
    prosemirror-markdown serializer/parser
  - Shared by the UI editor and the realtime server so client edits and the
    server-side writeback agree on the Yjs↔Markdown mapping

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
6. Periodic saves (server-side, as shipped):
   - The realtime server (`RecordRoomHandler`) serializes the room's yjs doc →
     Markdown using `@civicpress/editor-schema`
   - Writes it back to the record's **draft** (`record_drafts.markdown_body`,
     authored `realtime-snapshot`) via the core DB draft pipeline — in-process,
     not over HTTP. Triggered periodically (`snapshots.interval`), on the
     `POST /records/:id/snapshot` endpoint, and on the last-client grace finalize.
   - In collab mode the client does **not** PUT on every debounce; the
     server-side writeback owns the periodic save (an optional client PUT remains
     only as a defense-in-depth backstop).
7. Publish:
   - A human triggers publish through the normal records flow
   - **Publish** is what turns the draft into a Git commit — the realtime
     writeback never auto-commits to Git (see the as-shipped status note above)

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

- Transport: WebSocket (WS/WSS; WSS terminated at the reverse proxy)
- URL: `/realtime/records/:id` for record editors
- Protocol (as shipped):
  - **Binary y-protocols** `SYNC` frames encapsulating yjs updates
  - **Binary** `AWARENESS` frames for presence (cursors, join/leave)
  - A JSON `control`/`error` frame is the only non-binary message, sent by the
    server when it rejects/aborts a message

### Realtime ←→ API (as shipped)

Realtime and the API run **in the same process**, so the boundary is in-memory
method calls, not HTTP. There is no internal HTTP/service-account hop.

- The API → realtime direction: the records router calls the realtime server
  through a narrow `RealtimeServerLike` interface (`triggerRecordSnapshot`),
  resolved lazily, so the route layer never imports realtime types. This backs
  the `POST /api/v1/records/:id/snapshot` endpoint.
- The realtime → persistence direction: the realtime server uses the core
  services it was constructed with (`AuthService`, `RecordManager`,
  `DatabaseService`, `HookSystem`) directly — for auth, for reading the record's
  Markdown to seed a room, and for the draft writeback.
- Authentication: the **UI user's** token authenticates the WebSocket
  connection (validated via `AuthService.validateSession`); permissions are
  checked via `AuthService.userCan` (`records:view` / `records:edit`). There is
  no separate realtime service account.

> The HTTP `GET/POST /records/:id/collab-snapshot` endpoints described in the
> original design were never shipped; the in-process model above replaced them.

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

### WebSocket Message Types (as shipped)

> The JSON message examples that previously appeared in this section
> (`{"type":"sync"}`, `room_state`, `ping`/`pong`, JSON presence) described an
> earlier design and were **removed in Phase 3**. The shipped protocol is binary
> y-protocols. This section now documents what is actually on the wire.

Two binary message families, tagged by a leading var-uint:

1. **`SYNC` (tag `0`)** — the standard y-protocols sync. Client and server
   exchange state vectors and updates (SYNC step 1 / step 2 / update) to
   converge the Yjs document. This is how all document edits propagate.
2. **`AWARENESS` (tag `1`)** — the standard y-protocols awareness/presence
   encoding (cursors, selections, join/leave). Carried as a binary
   `lib0`-encoded payload, not JSON.

The **only** JSON frame is a server-sent control/error notification when a
message is rejected or a connection-level error occurs:

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

(`code` is the structured code of the underlying error — e.g. `AUTH_FAILED`,
`PERMISSION_DENIED`, `CONNECTION_LIMIT_EXCEEDED` — or `UNKNOWN_ERROR`.) See
`modules/realtime/src/yjs-sync.ts` for the binary framing and
`modules/realtime/src/realtime-server.ts` (`sendError`) for the JSON error frame.

### Connection Lifecycle (as shipped)

1. **Client connects** with a token (subprotocol `auth.<token>` or `Bearer`
   header). The server authenticates and authorizes against the record.
2. **Yjs sync** — client and server exchange binary `SYNC` messages; the server
   seeds the room from a snapshot (if a valid one exists) or from the record's
   Markdown, then both sides converge.
3. **Edits + presence** — binary `SYNC` updates and `AWARENESS` frames are
   relayed to the other clients in the room.
4. **Client disconnects** — the room enters a grace period
   (`rooms.grace_period_ms`); a reconnect within the window resumes the same
   in-memory state. When the grace elapses with no clients, the room is
   finalized (snapshot persisted + Markdown draft written) and evicted.

> There is no application-level `ping`/`pong` heartbeat message; liveness relies
> on the WebSocket transport plus the idle-connection cleanup sweep
> (`connection_cleanup`).

### WebSocket Error Handling (as shipped)

**Connection-level (the socket is closed):** see the close-code table in
`modules/realtime/TESTING.md`. Briefly: `4001 AUTH_FAILED`,
`4003 PERMISSION_DENIED` (also covers record-not-found, via `record_not_found`
context), `4004 ROOM_TYPE_NOT_REGISTERED`, `4029 CONNECTION_LIMIT_EXCEEDED`,
`1008` for rate-limit. There is no dedicated `ROOM_NOT_FOUND` or
`RATE_LIMIT_EXCEEDED` 4xxx code — those names from the original design were not
shipped.

**Message-level (connection stays open):**

- Invalid message → send the JSON `control`/`error` frame above; keep the
  connection open.
- Invalid/garbled yjs update → logged and ignored (y-protocols' CRDT semantics
  handle re-convergence on the next sync).

## Rooms and Document Model

### Room Identification

- A **room** corresponds to a single shared document context
- For record collaboration:
  - WS path: `/realtime/records/:recordId`; canonical internal room key:
    `records:<recordId>` (the server normalizes the legacy singular `record` →
    `records`)
  - **Note**: Rooms only exist for records that have been created (have an ID)
  - Creating a new record does not create a room until the record is saved and
    has an ID

Future room types register through the **handler registry** (see "Handler
registry" below), for example:

- `consultations:<id>`
- `dashboards:<id>`

As shipped, only the `records` room type is registered.

### Document State

For collaborative editing:

- Each room has a **yjs document**
- The document is the canonical in-memory collaboration state:
  - Insertions, deletions, formatting
  - Civic reference nodes (records, geographies, attachments)

As shipped, the editor document schema lives in `@civicpress/editor-schema`
(ProseMirror StarterKit subset + civic-ref nodes + GFM tables) and is shared by
the UI editor and the server-side serializer, so the Yjs↔Markdown mapping is
identical on both ends. See "Shared editor schema" below.

### Lifecycle of a Room

1. First client connects:
   - Realtime checks if a yjs state exists in memory
   - If not, it loads the latest **snapshot row** (integrity-verified; via the
     in-process `SnapshotManager`, not an HTTP call). On a hash mismatch or a
     too-new format version it discards the blob and instead reads the record's
     **Markdown** (through `RecordManager`/`DatabaseService`) and converts it to
     the initial yjs state.
2. Subsequent clients:
   - Join the existing room
   - Receive the current yjs state via binary `SYNC`
3. When the last client leaves:
   - The room is kept in memory for `rooms.grace_period_ms` (default 5 min) so a
     reconnect resumes losslessly
   - On grace elapse, the room is **finalized** (Yjs blob persisted + Markdown
     written back to the record draft) and evicted from memory

Retention is tuned via `rooms.grace_period_ms` and `rooms.cleanup_timeout`.

## Handler registry (as shipped)

Room behavior is pluggable through a **handler registry**. Each room type is
backed by a `RoomTypeHandler`; the registry maps a room type (the first path
segment after `/realtime/`) to its handler.

- On connect, after the generic auth/permission/limit checks in
  `realtime-server.ts`, the server looks up the handler for the room type. If
  none is registered, the connection is closed `4004 ROOM_TYPE_NOT_REGISTERED`.
- The `RoomTypeHandler` interface defines the lifecycle hooks
  (`onConnect`/`onMessage`/`onDisconnect`) a room type can implement.
- **As shipped, only `records` is registered**, via `RecordRoomHandler`, which
  owns: server-side serializer invocation, the Markdown-to-draft writeback, the
  Yjs-blob persist, and a per-room coalescing mutex so overlapping snapshot
  triggers (periodic timer vs. the `POST /snapshot` endpoint vs. grace finalize)
  share a single in-flight write.

New room types (consultations, dashboards, notifications, …) are added by
implementing `RoomTypeHandler` and registering it — without changing the core
server. This is the module's forward-extensibility seam (broadcast-box / device
room routing was removed in Phase 3; nothing else is registered today).

See `modules/realtime/src/handler-registry.ts`,
`modules/realtime/src/types/handler-registry.types.ts`, and
`modules/realtime/src/rooms/record-room-handler.ts`.

## Shared editor schema (as shipped)

`@civicpress/editor-schema` (`packages/editor-schema/`) is the single source of
truth for the editor document model and its Markdown mapping:

- a ProseMirror schema (StarterKit subset) plus **civic-ref nodes** (records,
  geographies, attachments) and **GFM tables**,
- a `prosemirror-markdown` serializer + a `markdown-it`-based parser,
- Yjs helpers (`yXmlFragmentToMarkdown`, `prosemirrorJSONToYDoc`) used by the
  server-side writeback.

Because both the UI editor and the realtime server import this package, a client
edit and the server-side serialization agree on how the document round-trips to
Markdown. A content-loss guard in the UI falls non-round-trippable records (e.g.
raw HTML or footnotes the schema doesn't model) back to the single-user
CodeMirror editor rather than risk silent data loss in collab mode. Note that
block-level civic-refs currently round-trip only inline (a documented
carry-forward).

## Snapshot durability (as shipped)

Snapshots are an **ephemeral merge-aid**, not the system of record. The durable
civic archive is the Markdown in Git. Each snapshot row carries:

- `integrity_hash` — sha256 of the blob, **verified on load**; a mismatch makes
  the server discard the blob and re-seed the room from Markdown,
- `format_version` — `SNAPSHOT_FORMAT_V1` (1); a newer value than the server
  understands is discarded (forward-compat hatch),
- `byte_size` — recorded; over `MAX_SNAPSHOT_BYTES` the server **warns** (fires
  `realtime:snapshot:oversize`) but still persists,
- `created_at` — unix ms; drives TTL cleanup.

Lifecycle:

- **TTL:** rows older than `SNAPSHOT_TTL_MS` (**48h**) whose room is no longer
  active are deleted by a background sweep that runs every **6h** (and once at
  startup). `SNAPSHOT_TTL_MS`, the cleanup interval, and `MAX_SNAPSHOT_BYTES`
  are code constants, not YAML config.
- **Storage backends:** `database` (default, the `realtime_snapshots` table) or
  `filesystem` (blob + `.meta.json` sidecar).
- **Hooks:** `realtime:snapshot:oversize`, `realtime:snapshot:integrity-failed`,
  `realtime:snapshot:expired`, and the writeback failure hook
  `realtime:snapshot:writeback-failed`.

See `modules/realtime/src/persistence/snapshots.ts`,
`modules/realtime/src/persistence/storage.ts`, and
`modules/realtime/src/persistence/migrations.sql`.

## Authentication and Authorization

### Handshake

When a client connects to the realtime service:

1. Client includes a session token, read by `extractToken` in priority order:
   - `Authorization: Bearer <token>` header (Node.js clients)
   - `Sec-WebSocket-Protocol: auth.<token>` subprotocol (browser clients)
   - `?token=<token>` query string — **deprecated**, kept only for backward
     compatibility
2. Realtime validates the token in-process via `AuthService.validateSession`
   (no HTTP call to the API).
3. Realtime validates the record exists:
   - Looks up the published record, then a draft row, by the URL's record ID
   - If neither exists, the connection is rejected (surfaced as
     `PERMISSION_DENIED` with `record_not_found` context)
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

### Snapshot Strategy (as shipped)

- The realtime server takes a snapshot of the yjs doc:
  - periodically while clients are connected (`snapshots.interval`, default 5
    min; `0` disables the timer),
  - on demand via `POST /api/v1/records/:id/snapshot`,
  - and on the last-client grace finalize.
- A snapshot does two independent things (each can fail without aborting the
  other):
  - **Persist the Yjs blob** via the in-process `SnapshotManager` into the
    `realtime_snapshots` table (or filesystem), with an integrity hash, format
    version, byte size, and timestamp — the merge-aid for fast reconnect.
  - **Write the Markdown back to the record draft** (`record_drafts.markdown_body`,
    authored `realtime-snapshot`) — the path toward the durable archive.

On reconnect, the server loads the latest integrity-verified snapshot if one
exists, else re-seeds from the record's Markdown. See "Snapshot durability"
below for the integrity + TTL contract.

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

### Minimal Setup (Single Node) — as shipped

For small municipalities and demos:

- As shipped, `realtime` runs **in the same process as `api`** (own WS port,
  default `3001`), so deploying the API deploys realtime. `ui` can run on the
  same host.
- Reverse proxy (nginx/Caddy) terminates TLS and routes:
  - `/api/*` → CivicPress API (HTTP)
  - `/` → CivicPress UI
  - `/realtime/*` → the realtime WS port (upgrade-forwarded)

This is the supported topology today. See `modules/realtime/DEPLOYMENT.md`.

### Future Scaling (not shipped)

The items below are **design intent, not shipped behavior**:

- Splitting `realtime` into a separate process/host (today it is in-process with
  the API; a `standalone-realtime.mjs` dev runner exists but is not the
  production topology).
- A Redis (or other) adapter so multiple realtime instances can share the same
  rooms. **No multi-node adapter ships in Phase 3** — room state is per-process.

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
- Revised: 2026-06 — Reconciled with the **as-shipped Phase 3** implementation
  (binary y-protocols; in-process hosting on its own port; server-side
  Markdown writeback to a review-gated DB **draft**, not a Git commit; handler
  registry; `@civicpress/editor-schema`; snapshot integrity-hash + 48h TTL
  contract). Removed the obsolete JSON message protocol, the HTTP
  `collab-snapshot` endpoints, and broadcast-box/device room routing. An
  "As-shipped status" block near the top supersedes any remaining
  forward-looking prose. Closes realtime-006 (operator/architecture docs that
  described an unshipped protocol).
