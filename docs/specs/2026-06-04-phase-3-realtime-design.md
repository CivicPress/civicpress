# Phase 3 — Realtime reintroduction (Yjs-only)

**Date:** 2026-06-04
**Status:** Approved (brainstorming gate)
**Master plan:** `docs/plans/2026-05-17-base-refactor-master-plan.md` §5 Phase 3
**Predecessor:** Phase 2d closure report (`docs/audits/phase-2d-closure-report.md`); lint-rollout backlog complete at `3afd39a` 2026-06-03
**Audit anchor:** `docs/audits/sections/realtime.md` (findings realtime-001 … realtime-014)
**Existing spec touched:** `docs/specs/realtime-architecture.md` (will be revised in W6 to match the as-shipped reality of Phase 3)

This spec defines Phase 3 of the 2026-05 refactor: reintroduce `@civicpress/realtime` to `dev` with the realtime-* audit findings closed and all broadcast-box-specific code excised. The realtime module ships as a generic Yjs WebSocket server with one registered room-type handler (`RecordRoomHandler`), wired end-to-end so that collaborative edits write back to the canonical Markdown file in Git through the existing records-draft pipeline.

Per `[Refactor 2026-05 master plan]` memory, Phase 3 is the next master-plan phase after the lint-rollout backlog closed. Entry criterion (Phase 2d module contract in place) is satisfied: `core/src/modules/module-resolver.ts` + `docs/specs/module-contract.md` landed in 2d W1.

---

## 1. Goal

Bring `modules/realtime/` back into `dev` as a trimmed, Yjs-only WebSocket service that:

1. Hosts collaborative Yjs document rooms for records (`records:<id>`).
2. Closes seven master-plan-named realtime findings plus seven audit-noted extras.
3. Writes the canonical Markdown back to the record file (and Git) through a new server-side Yjs→Markdown serializer, so the manifesto's "Markdown is the civic format" and "Resilient archival" constraints hold even when no client explicitly clicks "Save".
4. Restores the UI editor's collaborative mode behind a clean composable wire (`useRealtimeEditor.ts`), without re-introducing the dead-scaffolding antipatterns the audit flagged.
5. Stays under the master-plan exit criteria: `modules/realtime/src/realtime-server.ts` < 1,500 LoC; named tests for offline-edit-reconnect and collab-edit-writes-markdown both green.

End state:

- `modules/realtime/` ships generic Yjs over WebSocket. No knowledge of devices, ACK shapes, source/capability merging, or WebRTC relay. One registered handler: `RecordRoomHandler`.
- A new `packages/editor-schema/` workspace exports the shared TipTap schema + prosemirror-markdown rules consumed by both `modules/ui` (the editor) and `modules/realtime` (the server-side serializer).
- `POST /api/v1/records/:id/snapshot` returns to `modules/api`; the writeback path reuses `recordManager.saveDraft`, so frontmatter, locking, Git commit, and audit-hook fire are identical to a normal draft save (just authored by `realtime-snapshot`).
- Yjs snapshot blobs are recovery aids with a 48h TTL, integrity-hashed, format-versioned, size-warned but not size-rejected. The Markdown in Git is the only durable archive.

---

## 2. Context — entry state on `dev`

Branch `dev` is the merged Phase 2d landing (`c27baad`) plus the lint-rollout closures up through the Tier-C cleanup (`3afd39a` 2026-06-03). Relative to broadcast-box's last realtime-bearing tree:

- `modules/realtime/src/` does not exist. Only `modules/realtime/data/` and the gitignored `modules/realtime/dist/` remain. The realtime module was deleted during the audit's preparatory work and has not been re-added.
- `modules/ui/app/composables/useRealtimeEditor.ts` does not exist. `useAutosave.ts` exists and is a clean debounced HTTP saver — there is no `collaborativeMode: true` skip-the-PUT logic to remove because it was deleted with the rest of the realtime UI surface.
- `modules/api/src/routes/records/` was decomposed in Phase 2d into `draft-handlers.ts`, `lock-handlers.ts`, `read-handlers.ts`, `status-handlers.ts`, `write-handlers.ts`, `handlers-common.ts`. No `snapshot-handlers.ts` exists.
- The module-contract layer landed in Phase 2d W1 (`docs/specs/module-contract.md`, `core/src/modules/{module-manifest, module-resolver, module.schema.json}`). `@civicpress/realtime` will adopt the same contract on re-introduction.

Source of truth for the realtime code we are bringing back is the `broadcast-box` branch (last commit `47d0ff6`). On that branch:

- `modules/realtime/src/realtime-server.ts` is 3,581 lines. Roughly 1,500 of those are broadcast-box device handling (legacy device-message handler at line 1533, status/source/ack processing at lines 1782–2330, device cleanup intervals at 2625–2849, deprecated setter-injection methods, `DeviceConnectionMetadata` types, `clientToDevice`/`deviceConnections` maps, three-shape ACK normalizer at 1571–1665).
- `modules/realtime/src/{auth.ts, handler-registry.ts, realtime-config-manager.ts, realtime-services.ts, index.ts}` are largely reusable as-is.
- `modules/realtime/src/persistence/{snapshots.ts, storage.ts, migrations.sql}` need extending (integrity hash, format version, size column, TTL cleanup) but the adapter pattern is intact.
- `modules/realtime/src/presence/{awareness.ts, presence-manager.ts}` carry over unchanged.
- `modules/realtime/src/rooms/{room-manager.ts, yjs-room.ts}` are mostly reusable; `yjs-room.ts` gains a real `serializeToMarkdown()`; `room-manager.ts` normalizes `record:` → `records:` at registration so only one room-type key is canonical.

Per `[Refactor push policy]` memory: nothing from Phase 3 (or any later phase) gets pushed to any origin until all seven phases land. Local `dev` only.

---

## 3. Scope

### 3.1 In scope

- A new workspace `packages/editor-schema/` (TipTap schema + prosemirror-markdown rules + Yjs convenience helpers).
- Re-introduce `modules/realtime/` to `dev` via cherry-pick from `broadcast-box`, trimmed in W1.
- Server-side Yjs→Markdown serializer driving the writeback path.
- Snapshot persistence rework (integrity hash, format version, size column, TTL cleanup).
- API surface: `POST /api/v1/records/:id/snapshot`.
- UI wire: new `useRealtimeEditor.ts`, `MarkdownEditor.vue` integration behind a `collaborativeMode` prop, `useAutosave.ts` collaborativeMode behavior change (PUT on blur + explicit save, not on every debounce).
- Connection-limits fix (post-auth invocation, single canonical disconnect path).
- Doc sync (`TESTING.md`, `test-websocket.mjs`, `DEPLOYMENT.md`, `docs/specs/realtime-architecture.md`, `docs/roadmap.md`, `docs/project-status.md`).
- Tests: new unit tests per workspace; two named exit-criteria integration tests; regression test for the connection-limit leak.

### 3.2 Out of scope (deferred or explicitly declined)

- Browser E2E with two real Nuxt sessions. Integration tests use simulated y-protocols clients; real-browser E2E goes to post-refactor backlog.
- Multi-node Redis adapter rollout. Single-node is the Phase 3 ship; the spec keeps the architectural hook (existing `realtime.redis` config field documented as future-only).
- Performance / load tests (1000-conn targets etc.). Phase 3 asserts correctness; throughput is a separate ops session.
- Presence cursors, "published in another tab" notices, room-state polish. The minimal UI wire covers connection-state + edits; richer presence UX is a follow-up.
- Re-introducing broadcast-box. Phases 4 (hardware) and 5 (module reintroduction) own that path. The `RoomTypeHandler` interface stays generic so a future `DeviceRoomHandler` can register without modifying the realtime server.
- Pre-existing flaky `database-integration > Session Management` test (the date-bomb identified in Phase 2d). Reserved for a dedicated test-suite-repair session per master plan §9.1. `--no-verify` continues to be the approved override (`[Refactor --no-verify policy]` memory).
- `@typescript-eslint/no-explicit-any: error` lint enforcement on `modules/realtime/` source. Already enforced repo-wide as of the lint-rollout merge; the new realtime code lands under that rule by default. We are NOT adding annotated-allowlist entries for any new `: any` in realtime — every cast must be typed or justified inline.

### 3.3 Future-extensibility surface (in by design, not by ship)

The handler-registry pattern (already in the broadcast-box source we are cherry-picking) is preserved. `realtime-server.ts` stays strictly room-type-agnostic. Future room types named in `docs/specs/realtime-architecture.md` — consultations, dashboards, notification streams — register as new `RoomTypeHandler` implementations. Phase 3 ships exactly one (`RecordRoomHandler`); the architecture supports more. A non-Yjs room type (pure pub/sub) is not blocked but would require a small extension to the `RoomTypeHandler` interface; that is not Phase 3's job.

---

## 4. Architecture

### 4.1 Workspaces

| Workspace | Role | Depends on |
|---|---|---|
| `@civicpress/editor-schema` (NEW, `packages/editor-schema/`) | Shared ProseMirror schema + TipTap extensions + prosemirror-markdown rules for civic-ref nodes; serializer + parser helpers | External libs only (tiptap, prosemirror-model, prosemirror-markdown, y-prosemirror) |
| `@civicpress/realtime` (`modules/realtime/`) | Generic Yjs WebSocket server, room manager, snapshot persistence, handler-registry; no domain logic per room type | `@civicpress/core`, `@civicpress/editor-schema` |
| `@civicpress/api` (`modules/api/`) | HTTPS surface; gains `POST /api/v1/records/:id/snapshot` | `@civicpress/core`, `@civicpress/realtime` (via `ServiceContainer`) |
| `@civicpress/ui` (`modules/ui/`) | Editor wiring; re-introduces `useRealtimeEditor.ts`; `MarkdownEditor.vue` consumes shared schema | `@civicpress/editor-schema`, tiptap libs, y-websocket |

`packages/` is a new top-level convention for shared libraries. `modules/` stays reserved for runtime modules (`api`, `ui`, `realtime`, `storage`, `notifications`, `schema-extensions/legal`). The convention is added in W3 when the package is created; `pnpm-workspace.yaml` is updated accordingly.

### 4.2 Topology

```
                    ┌─────────────────────────────┐
                    │   modules/ui (Nuxt SPA)     │
                    │   MarkdownEditor.vue        │
                    │     + useRealtimeEditor.ts  │
                    │     + @civicpress/editor-   │
                    │       schema (TipTap exts)  │
                    └────────────┬────────────────┘
                                 │ HTTPS + WSS
                                 ▼
              ┌──────────────────────────────────────┐
              │  modules/api (Express)               │
              │   GET    /api/v1/records/:id         │
              │   POST   /api/v1/records/:id/draft   │
              │   POST   /api/v1/records/:id/snapshot│ ← NEW
              └─────┬─────────────────────┬──────────┘
                    │                     │
                    ▼                     ▼
          ┌─────────────────┐   ┌──────────────────────┐
          │ @civicpress/    │   │ @civicpress/realtime │
          │ core (records,  │   │  RealtimeServer      │
          │ drafts, Git)    │◄──┤   ↳ HandlerRegistry  │
          └─────────────────┘   │       ↳ RecordRoom-  │
                    ▲           │         Handler      │
                    │           │   ↳ RoomManager      │
                    │           │   ↳ YjsRoom          │
                    │           │   ↳ SnapshotManager  │
                    │           │   ↳ @civicpress/     │
                    │           │     editor-schema    │
                    │           │     (server-side     │
                    │           │     serializer)      │
                    └───────────┤                      │
              writeback through └──────────────────────┘
              recordManager                ▲
                                           │ WSS (y-protocols binary)
                                           │
                                           └──── (clients)
```

### 4.3 Boundary deletions compared to `broadcast-box`'s realtime tree

The following come out of `realtime-server.ts` across W1 (device code; the bulk) and W2 (smaller scoped cleanups: dead palette, remaining `: any`):

- Device routes at `:551`, `:640`, the legacy device message handler at `:1533`, status/source/ack processing at `:1782–2330`.
- Deprecated setter-injection methods: `setDeviceAuthDependencies`, `setDeviceCommandService`, `setDeviceConnectionTracker`.
- Device-specific types and state: `DeviceConnectionMetadata` (move-or-delete from `types/realtime.types.ts`), `clientToDevice`, `deviceConnections`, `deviceConnectionMetadata` maps.
- Device connection-quality scoring: `calculateConnectionScore`, `getDeviceConnectionsMetadata`, `checkStaleConnections`, and the dedicated device cleanup interval at `:2625–2849`.
- Three-shape ACK normalizer at `:1571–1665` (closes realtime-010 by removal — no devices, no ACK shapes to reconcile).
- Dead `generateParticipantColor` + 16-entry `PARTICIPANT_COLORS` palette at `:75–101` (realtime-007). Color generation lives in `useRealtimeEditor.ts` only.
- Deprecated `Y.Text('initialMarkdown')` shadow in `rooms/yjs-room.ts:145` and the `@deprecated` `toMarkdown()` stub returning `yjsFragment.toString()` (realtime-014). Replaced by the real serializer.
- The 46 `: any` occurrences in `realtime-server.ts` (realtime-012). Most are inside the device code being deleted; the remaining ~10 in non-device paths get explicit types in W2.

Trimmed `realtime-server.ts` target: well under 1,500 LoC. Current broadcast-box version is 3,581; the ~1,500 lines of device code plus the ~150 lines of dead code account for the bulk of the reduction. Anything else over the bar after W1 gets decomposed in W2.

---

## 5. Components

### 5.1 `@civicpress/editor-schema` (new, `packages/editor-schema/`)

```
packages/editor-schema/
├── src/
│   ├── index.ts                  # Public re-exports
│   ├── schema.ts                 # ProseMirror Schema (nodes + marks)
│   ├── tiptap-extensions.ts      # TipTap extension array (consumed by UI)
│   ├── civic-ref-nodes.ts        # Custom nodes: record-ref, geography-ref, attachment-ref
│   ├── markdown-serializer.ts    # serializeDocToMarkdown(doc) → string
│   ├── markdown-parser.ts        # parseMarkdownToDoc(md) → ProseMirrorDoc
│   ├── yjs-helpers.ts            # yXmlFragmentToMarkdown, prosemirrorJSONToYDoc convenience
│   └── __tests__/
│       ├── roundtrip.test.ts     # Markdown→PM→Markdown idempotence
│       ├── civic-refs.test.ts    # Per-node round-trip rules
│       └── parser-errors.test.ts # Malformed input handling
├── package.json
└── tsconfig.json
```

**Public API:**

```ts
export { editorSchema }                  // ProseMirror Schema
export { editorExtensions }              // TipTap extensions array (used by UI)
export { serializeDocToMarkdown }        // (doc: PMDoc) => string
export { parseMarkdownToDoc }            // (md: string) => PMDoc
export { yXmlFragmentToMarkdown }        // (frag: Y.XmlFragment) => string (realtime convenience)
export { prosemirrorJSONToYDoc }         // (doc: PMDoc, yDoc: Y.Doc) => void
export type { CivicRefAttrs, EditorSchemaParseError }
```

**Dependencies:** `prosemirror-model`, `prosemirror-markdown`, `@tiptap/core`, `@tiptap/starter-kit`, `y-prosemirror`. `yjs` is a peer dependency.

**Civic-ref nodes covered (matches today's TipTap usage in `MarkdownEditor.vue`):** `record-ref` (id, label), `geography-ref` (id, type), `attachment-ref` (id, filename). Each has explicit prosemirror-markdown serialization rules (probable form: HTML-comment delimiters with JSON attrs, matching what the current editor emits — to be confirmed by reading `MarkdownEditor.vue` during W3 implementation).

### 5.2 `@civicpress/realtime` (cherry-pick + trim)

```
modules/realtime/src/
├── auth.ts                       # Token extraction + room-id parse (records: only)
├── errors/realtime-errors.ts     # (kept)
├── handler-registry.ts           # (kept)
├── index.ts                      # Public exports
├── persistence/
│   ├── migrations.sql            # ← snapshot_format_version, integrity_hash, byte_size, created_at columns added
│   ├── snapshots.ts              # ← size cap warning, TTL cleanup, format-version migration
│   └── storage.ts                # (kept; adapter pattern intact)
├── presence/                     # (kept)
│   ├── awareness.ts
│   └── presence-manager.ts
├── realtime-config-manager.ts    # (kept)
├── realtime-server.ts            # ← TRIMMED < 1,500 LoC; generic Yjs only
├── realtime-services.ts          # ← Registers RecordRoomHandler by default
├── rooms/
│   ├── room-manager.ts           # ← Normalizes record:/records: → records: at registration
│   ├── record-room-handler.ts    # ← NEW: implements RoomTypeHandler for records
│   └── yjs-room.ts               # ← gains serializeToMarkdown() via @civicpress/editor-schema
└── types/
    ├── handler-registry.types.ts # (kept)
    ├── messages.ts               # (kept; binary y-protocols)
    └── realtime.types.ts         # ← DeviceConnectionMetadata DELETED
```

**Responsibility split:**

- `RealtimeServer` becomes a thin broker: WS upgrade, auth, routing to handler-registry, snapshot timer, hook emission, connection-limit enforcement. No room-type-specific logic in this file. The post-trim audit target for boundary cleanliness: zero references to "record", "device", or any other concrete room type in `realtime-server.ts` source.
- `RecordRoomHandler` (new, target ~150 LoC) implements the `RoomTypeHandler` interface and owns: per-room snapshot scheduling, server-side serializer invocation, Markdown writeback via `recordManager.saveDraft`, per-room mutex around writeback to serialize concurrent triggers.
- `YjsRoom.serializeToMarkdown()` calls `@civicpress/editor-schema`'s `yXmlFragmentToMarkdown` against the room's Yjs fragment. The room itself stays domain-agnostic; the Markdown coupling is a convenience method that handlers opt into.

### 5.3 `@civicpress/api`

```
modules/api/src/routes/records/
├── snapshot-handlers.ts          # ← NEW
│   └── POST /api/v1/records/:id/snapshot
└── (existing handlers unchanged)
```

`snapshot-handlers.ts` resolves `RealtimeServer` from the `ServiceContainer`, calls `realtimeServer.triggerRecordSnapshot(id)`, returns `{ snapshotCreated: boolean, version: number | null, timestamp: number }`. `snapshotCreated: false` is honest when neither an in-memory room nor a recent snapshot exists.

The handler is registered in the existing decomposed records-routes setup added in Phase 2d W2.

### 5.4 `@civicpress/ui`

```
modules/ui/app/composables/
├── useRealtimeEditor.ts          # ← NEW (clean, ~200 LoC)
└── useAutosave.ts                # ← gains collaborativeMode prop; PUT on blur + explicit save only when on
                                  #    (no every-debounce PUT in collab mode; server-side handles periodic writeback)

modules/ui/app/components/editor/
└── MarkdownEditor.vue            # ← consumes @civicpress/editor-schema; wires useRealtimeEditor when collab prop is true
```

`useRealtimeEditor.ts` responsibilities:

- Open `wss://host/realtime/records/:id` using the `auth.<jwt-token>` subprotocol (deprecated query-string auth path is not re-introduced).
- Construct a Yjs document and bind it to TipTap's `Collaboration` and `CollaborationCursor` extensions, using the schema from `@civicpress/editor-schema`.
- Manage awareness state (user color from `useRealtimeEditor`'s own palette, not from the realtime module).
- Surface connection state (`connecting | connected | disconnected | failed`) as reactive refs so the editor UI can show a badge.
- No manual reconnection logic. y-websocket handles reconnects. `MAX_RECONNECT_ATTEMPTS = 5` and `RECONNECT_DELAYS = [...]` dead scaffolding from the broadcast-box version (realtime-008) is NOT re-introduced.

**`useAutosave.ts` change:** add a `collaborativeMode?: boolean` option. When `false` (default), behavior is unchanged from current. When `true`:

- The `watch` triggers do NOT fire `debouncedSave`. Continuous-edit debounce is suppressed.
- Save still fires on explicit `saveNow()` call (e.g., user clicks "Save draft") and on a new `saveOnBlur()` API the editor can call when the user moves focus away.
- Rationale: server-side snapshot owns the every-N-seconds writeback; the client-side PUT becomes a defense-in-depth backstop rather than the primary path. Avoids racing PUTs across collaborators.

The collab-mode-skips-PUT antipattern from broadcast-box's `useAutosave.ts:39-72` is NOT re-introduced. There is no "if collab, do nothing" branch; collab-mode autosave still saves, just on different triggers.

---

## 6. Data flow

### 6.1 Editing session lifecycle

```
[UI]                                  [API]                          [Realtime]                       [Records / Git]
  │                                     │                                │                                  │
  │  GET /api/v1/records/:id            │                                │                                  │
  ├────────────────────────────────────►│                                │                                  │
  │                                     │  recordManager.load(id)        │                                  │
  │                                     ├──────────────────────────────────────────────────────────────────►│
  │  ◄── 200 { markdown, frontmatter }  │                                │                                  │
  │ ◄───────────────────────────────────┤                                │                                  │
  │                                     │                                │                                  │
  │ parseMarkdownToDoc(md) → seed TipTap│                                │                                  │
  │                                     │                                │                                  │
  │  WSS /realtime/records/:id          │                                │                                  │
  │  (Sec-WebSocket-Protocol: auth.<jwt>)                                │                                  │
  ├─────────────────────────────────────────────────────────────────────►│                                  │
  │                                     │                                │ authenticate(token)              │
  │                                     │                                │ permissions.userCan(             │
  │                                     │                                │     'records:edit', id)          │
  │                                     │                                │ checkConnectionLimits(ip, userId)│
  │                                     │                                │                                  │
  │                                     │                                │ if no Yjs state in memory:       │
  │                                     │                                │   snap = snapshotMgr.loadLatest( │
  │                                     │                                │     'records:<id>')              │
  │                                     │                                │   if snap && hash + fmt OK:      │
  │                                     │                                │     Y.applyUpdate(yDoc, snap)    │
  │                                     │                                │   else:                          │
  │                                     │                                │     md = recordManager.load(id)  │
  │                                     │                                │     doc = parseMarkdownToDoc(md) │
  │                                     │                                │     prosemirrorJSONToYDoc(       │
  │                                     │                                │         doc, yDoc, schema)       │
  │                                     │                                │                                  │
  │  ◄── y-protocols: SYNC step 1 + 2  ─┼────────────────────────────────┤                                  │
  │  ◄── awareness: room participants  ─┼────────────────────────────────┤                                  │
  │                                     │                                │                                  │
  │  ─── y-protocols: doc updates ─────►│                                │                                  │
  │                                     │                                │  Y.applyUpdate(yDoc, update)     │
  │                                     │                                │  broadcast to room (minus sender)│
  │                                     │                                │                                  │
```

Two ordering rules:

1. **Snapshot wins over Markdown when fresh and verified.** Only when the snapshot row is absent, hash-failed, or format-version-newer-than-we-support do we re-seed from Markdown. This preserves recent in-flight edits across short server restarts.
2. **Markdown is the durable archive.** A re-seed from Markdown loses any non-snapshotted edits since the last writeback, but the writeback cadence (60s) keeps that window small, and the snapshot's job is exactly to close it.

### 6.2 Markdown writeback (realtime-003 fix)

Three triggers, one path:

```
                                              ┌─────────────────────────────────────────────────┐
  ┌─ Trigger 1: periodic snapshot timer ─────►│ RecordRoomHandler.snapshot(roomId)              │
  ├─ Trigger 2: POST /records/:id/snapshot ──►│   ↓ acquire per-room mutex                      │
  ├─ Trigger 3: last-client-leave grace ─────►│   yjsState = Y.encodeStateAsUpdate(yDoc)        │
  │  (e.g., after 5 min idle)                 │   md = yXmlFragmentToMarkdown(                  │
  │                                           │       yDoc.getXmlFragment('default'),           │
  │                                           │       editorSchema)                             │
  │                                           │   ↓                                             │
  │                                           │   recordManager.saveDraft(                      │
  │                                           │     id,                                         │
  │                                           │     md,                                         │
  │                                           │     { author: 'realtime-snapshot',              │
  │                                           │       message: 'collab: snapshot @ <ts>' })     │
  │                                           │   ↓                                             │
  │                                           │   snapshotMgr.persist(roomId, {                 │
  │                                           │     blob: yjsState,                             │
  │                                           │     hash: sha256(yjsState),                     │
  │                                           │     formatVersion: SNAPSHOT_FORMAT_V1,          │
  │                                           │     byteSize: yjsState.byteLength,              │
  │                                           │     createdAt: now() })                         │
  │                                           │   ↓ release mutex                               │
  │                                           └─────────────────────────────────────────────────┘
```

Cadence: default 60s while clients connected; configurable via `realtime.snapshot.intervalMs`. Skip the snapshot if no Yjs updates landed since the previous one (no-diff = no Git commit; avoids spamming the records history).

Why the writeback goes through `recordManager.saveDraft` and not a side path: it reuses existing draft-save logic (frontmatter preservation, file locking, Git commit, audit-hook emission, validation). The Git commit author becomes `realtime-snapshot`, so `git log --author=realtime-snapshot` lets a clerk audit exactly which writes came from collab vs. manual saves. One canonical Markdown writer for the system.

> **As-shipped correction (2026-06).** The design above was based on a
> `recordManager.saveDraft` method that **does not exist** — it is fictional.
> What actually shipped (a deliberate user decision in W5-T11, "draft now,
> revisit Git later"):
>
> - The writeback target is a **DB draft**, not a Git commit. `RecordRoomHandler`
>   writes the serialized Markdown to `record_drafts.markdown_body` via the
>   canonical `DatabaseService.getDraft / createDraft / updateDraft` pipeline
>   (find-or-create keyed by record id), authored `realtime-snapshot`. The UI's
>   `getDraftOrRecord` reads this draft body.
> - It does **not** auto-commit to Git. Git history is produced when a **human
>   publishes** the draft — the realtime writeback never authors a
>   `realtime-snapshot` Git commit. So `git log --author=realtime-snapshot` (and
>   the "frontmatter/locking/Git-commit/audit-hook are identical to a normal
>   save" claim) do not apply to the as-shipped path.
> - The periodic cadence is driven by `snapshots.interval` (seconds, default 300)
>   in the real `RealtimeConfig`, **not** `realtime.snapshot.intervalMs`. There is
>   no `snapshot.intervalMs` field.
>
> **Deferred follow-up (carry-forward).** The master-plan vision of collaborative
> edits landing as auditable **Git civic events** (a `realtime-snapshot`-authored
> commit, or an opt-in auto-publish / draft-history branch) is intentionally
> deferred, to be designed once the governance model for collab-authored history
> is settled. The original design text above is retained for the audit trail; this
> note records what shipped. See `modules/realtime/src/rooms/record-room-handler.ts`
> (and its `TODO(phase-3-followup)`).

### 6.3 Multi-client edit + crash recovery

```
t=0    : Client A connects → seeds from Markdown → edits "Hello world"
t=15s  : Yjs state in memory only; no snapshot yet
t=30s  : Client A disconnects abruptly (network drop)
t=30s  : Server: handleDisconnect(A) → grace timer starts (5min)
                 — Yjs state stays in memory
                 — snapshot NOT triggered yet (grace gives reconnect a window)
t=2min : Client B connects → joins existing room → receives current Yjs state
                 (sees "Hello world" — A's edits preserved)
t=2:05 : Client B edits to "Hello world!"
t=2:30 : Client B disconnects abruptly
t=2:30 : grace timer resets to 5min from now
t=7:30 : grace elapsed → RecordRoomHandler.snapshot('records:<id>'):
                 — md = "Hello world!"  ← B's final state
                 — recordManager.saveDraft writes Markdown + Git commit
                 — snapshotMgr.persist(blob, hash, ttl=48h)
                 — yDoc removed from memory
t=24h  : User opens record edit page → loads md = "Hello world!"
                 — opens WS → no in-memory Yjs → snapshot loaded (within 48h TTL)
                 — fast cold-start; new edits diverge from the snapshot baseline
t=48h+ : TTL cleanup job runs → blob deleted; Markdown stays in Git forever
```

Crash survival comes for free: A's edits land in Git as one `realtime-snapshot` commit (made before B disconnected), B's later edits land as another. `git log` shows both as discrete civic events.

> **As-shipped correction (2026-06).** Same correction as §6.2: the `t=7:30`
> grace-finalize step writes the final Markdown to the record's **DB draft**
> (`record_drafts.markdown_body`, authored `realtime-snapshot`) via
> `DatabaseService.createDraft/updateDraft` — it does **not** `recordManager.saveDraft`
> and does **not** produce a Git commit. Crash survival still holds at the draft
> level (the latest serialized state is in the draft, and the Yjs blob is the
> 48h-TTL merge-aid), but the edits do **not** appear as `realtime-snapshot` Git
> commits; they become Git history only when a human publishes the draft. The
> "collaborative edits as discrete auditable Git civic events" property is the
> deferred follow-up noted in §6.2.

### 6.4 Connection-limit lifecycle (realtime-001 + realtime-002 fix)

The audit's bug was twofold: `checkConnectionLimits` called with `userId=null` **before** auth (per-user branch unreachable), AND no IP/user decrement on disconnect (counts grow unbounded). Two competing disconnect paths (`handleDisconnect` and `handleDeviceDisconnect`) made the leak structural — neither fully tracked cleanup. The fix:

```ts
async function handleConnection(ws, req) {
  // 1. Auth FIRST — extract userId before any limit check
  const auth = await authenticate(req)
  if (!auth.ok) { ws.close(4001, 'AUTH_FAILED'); return }

  // 2. Permission check
  const canEdit = await permissions.userCan(auth.userId, 'records:edit', recordId)
  if (!canEdit) { ws.close(4003, 'PERMISSION_DENIED'); return }

  // 3. Connection limits — userId is known
  const limitCheck = checkConnectionLimits(req.ip, auth.userId)
  if (!limitCheck.ok) { ws.close(4029, limitCheck.reason); return }

  // 4. Register: increment BOTH counts
  connectionCounts.set(req.ip, (connectionCounts.get(req.ip) ?? 0) + 1)
  const userSet = userConnections.get(auth.userId) ?? new Set()
  userSet.add(ws)
  userConnections.set(auth.userId, userSet)

  // 5. Wire single disconnect path
  ws.once('close', () => handleDisconnect(ws, req.ip, auth.userId))
}

function handleDisconnect(ws, ip, userId) {
  // Decrement IP count; delete key if 0
  const ipCount = (connectionCounts.get(ip) ?? 1) - 1
  if (ipCount <= 0) connectionCounts.delete(ip)
  else connectionCounts.set(ip, ipCount)

  // Remove from user set; delete key if empty
  const userSet = userConnections.get(userId)
  if (userSet) {
    userSet.delete(ws)
    if (userSet.size === 0) userConnections.delete(userId)
  }

  // Notify room (sync teardown etc.)
  roomManager.handleClientDisconnect(ws)
}
```

There is one canonical `handleDisconnect`. With broadcast-box deleted, there is no separate "device" path to drift. The class of leak the audit found cannot recur as long as the architectural rule "all room types route through `handleConnection`/`handleDisconnect`, room-type-specific work lives in handlers" is maintained.

### 6.5 Snapshot persistence + TTL cleanup

DB schema (extends existing `realtime_snapshots` table from broadcast-box's `migrations.sql`):

```sql
CREATE TABLE realtime_snapshots (
  room_id           TEXT     NOT NULL,
  version           INTEGER  NOT NULL,
  snapshot_data     BLOB     NOT NULL,
  integrity_hash    TEXT     NOT NULL,     -- NEW: sha256 hex
  format_version    INTEGER  NOT NULL,     -- NEW: SNAPSHOT_FORMAT_V1 = 1
  byte_size         INTEGER  NOT NULL,     -- NEW: for size-cap enforcement
  created_at        INTEGER  NOT NULL,     -- NEW: unix ms; for TTL
  PRIMARY KEY (room_id, version)
);

CREATE INDEX realtime_snapshots_created_at_idx
  ON realtime_snapshots(created_at);       -- for TTL cleanup queries
```

Constants (`modules/realtime/src/persistence/snapshots.ts`):

```ts
export const SNAPSHOT_FORMAT_V1 = 1
export const MAX_SNAPSHOT_BYTES = 1 * 1024 * 1024  // 1 MB per row (matches spec default)
export const SNAPSHOT_TTL_MS    = 48 * 60 * 60 * 1000  // 48h after last activity
```

TTL cleanup runs at server start, then every 6h. Deletes rows where `created_at < now() - SNAPSHOT_TTL_MS` AND `room_id` has no active in-memory room. Fires `realtime:snapshot:expired` hook per deleted row.

Size-cap behavior: persist even when over the cap, but emit `realtime:snapshot:oversize` warning hook + log at `warn` level. Dropping the snapshot is worse than persisting an over-sized one. Hard caps are a future ops decision once field data exists.

Integrity-hash verification on load:

```ts
const row = snapshotMgr.loadLatest(roomId)
if (row && sha256(row.snapshot_data) === row.integrity_hash) {
  Y.applyUpdate(yDoc, row.snapshot_data)
} else {
  coreWarn('Snapshot integrity check failed; falling back to Markdown reload', {...})
  seedFromMarkdown()
}
```

Format-version mismatch (`row.format_version > SNAPSHOT_FORMAT_V1`) is treated identically to hash mismatch: discard + Markdown fallback. This is the forward-compat hatch — a downgraded server won't crash on a newer-format blob.

---

## 7. Error handling

### 7.1 WebSocket close codes

| Code | Name | Trigger | UI behavior |
|---:|---|---|---|
| 1000 | Normal Closure | Clean disconnect (user navigated away) | Silent |
| 4001 | `AUTH_FAILED` | Token missing, expired, or invalid signature | "Your session expired. Please reload." |
| 4003 | `PERMISSION_DENIED` | User authenticated but lacks `records:edit` | "You don't have permission to edit this record." |
| 4004 | `ROOM_NOT_FOUND` | Record ID in URL doesn't exist | "Record not found." |
| 4013 | `RATE_LIMIT_EXCEEDED` | Per-client message rate exceeded (>10 msg/s) | "Too many edits at once. Try again in a moment." |
| 4029 | `CONNECTION_LIMIT_EXCEEDED` | Per-IP or per-user cap hit | "Too many active sessions from this account." |
| 4500 | `INTERNAL_ERROR` | Unexpected server-side exception | "Connection lost. Reconnecting..." (y-websocket retries) |
| 4503 | `SERVER_SHUTDOWN` | Server received SIGTERM mid-session | "Server is restarting. Reconnecting..." (y-websocket retries) |

The UI's `useRealtimeEditor.ts` switch-cases on these codes; unrecognized codes fall through to a generic "Connection lost" + retry.

### 7.2 Per-message errors (within an open connection)

- **Malformed binary message** (not valid y-protocols framing): log `warn` with first 32 bytes hex; ignore.
- **`Y.applyUpdate` failure**: log `error` with room ID; drop the update; do NOT rebroadcast; fire `realtime:room:apply-failed`. Room continues; other clients' valid updates still flow. Severe corruption (room state unparseable) → close all connections with 4500; reload from latest valid snapshot or Markdown.
- **Awareness update with unknown user ID**: ignore. y-protocols' awareness timeout reaps stale entries.
- **Rate-limit hit** (>10 msg/s from one client): first violation → send `{ type: 'control', event: 'notice', notice: { level: 'warning', message: 'Rate limit approaching' } }` and throttle. Second violation within 30s → close with 4013.

### 7.3 Snapshot errors

| Scenario | Server behavior | UI surface |
|---|---|---|
| `snapshotMgr.persist()` throws (DB error) | Exponential backoff: 1s, 2s, 4s, 8s. After 4th failure, fire `realtime:snapshot:persist-failed`; degrade to "in-memory-only" mode for this room (no further persist attempts this session). **Markdown writeback still attempted** (the two failures are independent). | None directly. |
| `snapshotMgr.loadLatest()` returns row, hash mismatch | Discard blob; log `warn` with security event tag; fire `realtime:snapshot:integrity-failed`; fall back to Markdown reload. | None. |
| `snapshotMgr.loadLatest()` returns row, `format_version > SNAPSHOT_FORMAT_V1` | Same as hash mismatch: discard + Markdown fallback. | None. |
| `snapshotMgr.persist()` blob > `MAX_SNAPSHOT_BYTES` | **Persist anyway**; fire `realtime:snapshot:oversize` warning hook. | None. |
| TTL cleanup throws | Log `error`; skip this run; retry next 6h cycle. Does NOT block server startup. | None. |

### 7.4 Markdown writeback errors

- **`yXmlFragmentToMarkdown` throws** (unknown node, schema mismatch): log `error` with Yjs state byte size + offending `nodeType`; fire `realtime:writeback:serializer-failed`; **skip this snapshot's writeback only** (Yjs state still persists). Editing continues. Surfaces a "TipTap extension added without updating `@civicpress/editor-schema`" developer signal.
- **`recordManager.saveDraft` throws (file lock contention)**: retry once after 250ms. Second failure → log + skip writeback; will be retried at next snapshot interval (60s).
- **`recordManager.saveDraft` throws (validation failure)**: log `error`; fire `realtime:writeback:validation-failed`; skip writeback. Yjs state in memory is still authoritative; clients see no failure.
- **Racing triggers** (periodic timer fires while a manual `POST /snapshot` is mid-flight): `RecordRoomHandler` holds a per-room mutex around the writeback path. Concurrent triggers queue (drop dup if a queued one matches the in-progress one's Yjs state version). Avoids double-commits to Git with identical content.

### 7.5 Operational errors

- **Hook subscriber throws**: caught and logged at the hook bus; does NOT bubble back to the realtime server. Fire-and-forget contract.
- **`@civicpress/editor-schema` import fails at server startup**: server fails fast with a clear error pointing at `pnpm install`. Realtime can run without the schema ONLY if `RecordRoomHandler` is not registered (e.g., a deployment that uses a future non-Yjs handler exclusively); the default config has the record handler enabled.
- **Standalone bootstrap** (`standalone-realtime.mjs`): with only `RecordRoomHandler` registered by default, the bootstrap no longer needs to reach into `civicPress.container` (private) to wire broadcast-box dependencies. `RecordRoomHandler` resolves what it needs (`RecordManager`, `SnapshotManager`) from the public `ServiceContainer` API. Closes the audit's "the standalone bootstrap reaches into private members" smell.

### 7.6 Explicitly NOT handled

- **Reconnection backoff on the client side**: delegated to `y-websocket`'s built-in logic. The dead `MAX_RECONNECT_ATTEMPTS = 5` / `RECONNECT_DELAYS = [...]` scaffolding (realtime-008) is NOT re-introduced.
- **Server-side recovery from a corrupted snapshot blob mid-session**: out of scope. Severe Yjs corruption → restart the room (all clients dropped with 4500); Yjs CRDT semantics guarantee convergence on reconnect.
- **Conflict resolution for racing Markdown PUTs from multiple clients**: the design ensures no client does collab-mode every-debounce PUT. The server is the only periodic writer; clients PUT only on blur or explicit save. The race surface is eliminated, not papered over.

---

## 8. Testing

### 8.1 New unit tests

**`packages/editor-schema/`:**

- `roundtrip.test.ts` — Markdown → ProseMirror doc → Markdown idempotence for every node and mark in the schema (StarterKit + civic-ref nodes). Fixtures: nested lists, tables, code blocks, links with marks, all three civic-ref node types.
- `civic-refs.test.ts` — prosemirror-markdown rules for each civic-ref node specifically; attrs round-trip; rendered output matches what `MarkdownEditor.vue` produces today (golden snapshots taken from existing test fixtures in `modules/ui/`).
- `parser-errors.test.ts` — malformed Markdown does not throw; falls back to a text node OR throws a tagged `EditorSchemaParseError` the caller can catch (per §7.4).

**`modules/realtime/`:**

- `auth.test.ts` — kept from broadcast-box; extended with `parseRoomId` normalizing `record:` → `records:`.
- `realtime-server.test.ts` — kept structure; broadcast-box-specific cases deleted.
- `connection-limits.test.ts` (NEW) — closes the audit gap ("No test exercises `checkConnectionLimits`"):
  - Post-auth invocation: `userId` is non-null at the limit-check call site.
  - Per-IP cap enforced; cleanup decrements on disconnect.
  - Per-user cap enforced; user-set cleanup on last-WS-of-user disconnect.
  - Repeated connect/disconnect cycles do NOT leak counts (regression test for realtime-002).
- `yjs-room.test.ts` — extended with `serializeToMarkdown()` cases: empty doc, single paragraph, nested lists, civic-ref-bearing doc.
- `snapshot-manager.test.ts` — extended with: integrity-hash verification (match = applied; mismatch = discarded); format-version forward-compat; size-cap warning hook fires; TTL cleanup deletes rows past TTL with no active room.
- `record-room-handler.test.ts` (NEW) — handler-registry contract conformance; writeback mutex (concurrent triggers serialize, no double-commits).

**`modules/api/`:**

- `snapshot-handlers.test.ts` (NEW) — auth check; calls `realtimeServer.triggerRecordSnapshot`; returns `{ snapshotCreated, version, timestamp }`. Honest `snapshotCreated: false` when no in-memory room and no recent snapshot.

**`modules/ui/`:**

- `useRealtimeEditor.test.ts` (NEW) — composable mounts; opens WS via mock server; receives initial state; applies updates; surfaces connection-state refs; awareness round-trip.
- `useAutosave.test.ts` (extended) — `collaborativeMode: true` does NOT fire `debouncedSave` on watcher trigger; DOES fire on explicit `saveNow()` and on `saveOnBlur()` (regression test for the antipattern we are explicitly killing).

### 8.2 New integration tests

`tests/realtime/realtime.integration.test.ts` — kept from broadcast-box (~1k LoC multi-client harness); broadcast-box-specific suites deleted. Extended with:

- **Connection-limit churn test** (regression for realtime-001 + realtime-002): 100 connect/disconnect cycles from the same IP with different users. Assert: `connectionCounts.size === 0` after all cycles complete (no leak). Assert: per-IP limit kicks in at the configured threshold, releases after disconnect.
- **Snapshot-round-trip test:** Client connects, edits to known state, disconnects. Grace + snapshot fires. Assert: snapshot persisted with valid `integrity_hash` AND Markdown written via `recordManager`. Wipe in-memory state. New client connects → seeds from snapshot. Assert: client receives same Yjs state.
- **Snapshot-integrity test:** Persist a snapshot. Corrupt the blob (flip a byte). New client connects → server tries to load → hash fails → falls back to Markdown. Assert: client receives Markdown-derived state; security event logged.

### 8.3 Master-plan exit-criteria tests (named)

The master plan §5 Phase 3 names two tests. Both get dedicated files so the closure report cites them by name.

**`tests/realtime/exit-criterion-offline-edit-reconnect.test.ts`:**

- Client A connects, edits, network drops mid-edit (simulated via test transport).
- Client A reconnects within grace period.
- Assert: server has retained Yjs state; A's edits sync back cleanly (no loss, no duplication).
- Client B connects concurrently mid-reconnect.
- Assert: both clients converge to the same final state.

**`tests/realtime/exit-criterion-collab-writes-markdown.test.ts`:**

- Two clients connect to the same record room.
- Both edit interleaved updates over 30 simulated seconds.
- Trigger `POST /api/v1/records/:id/snapshot`.
- Assert: Markdown file on disk (via `recordManager.load(id)`) equals expected Markdown for the combined Yjs state.
- Assert: Git history shows a `realtime-snapshot`-authored commit with the expected diff.

Both files get a comment header pointing back at the master plan: `// closes master-plan §5 Phase 3 exit criterion #N`.

### 8.4 Test harness updates (realtime-006)

- `TESTING.md` — full rewrite for binary y-protocols. Documents: how to verify the server is reachable (handshake bytes via `wscat`); how to test multi-client convergence locally via the updated `test-websocket.mjs`; how to inspect a snapshot blob.
- `test-websocket.mjs` — rewritten to use the `ws` Node client + `y-protocols` for a real binary sync round-trip. The stale JSON `sync` message construction is removed.
- `DEPLOYMENT.md` — drops the `tls.enabled` config field that doesn't exist in `RealtimeConfig`. Adds the new snapshot-related config fields.

### 8.5 What we explicitly DON'T test in Phase 3

- Browser E2E with two real Nuxt sessions. Both exit-criteria tests run at integration layer with simulated y-protocols clients + a test `RecordManager`. Real-browser E2E is post-refactor backlog.
- Multi-node Redis adapter scenarios.
- The pre-existing `database-integration > Session Management` date-bomb. Reserved for the test-suite-repair session per master plan §9.1. `--no-verify` continues as the approved override.
- Performance / load tests. Phase 3 asserts correctness; throughput is a separate ops session.

### 8.6 Test-execution policy

- No CI/CD step added per `[No CI/CD policy]` memory. Tests run locally:
  - `pnpm -C packages/editor-schema test:run`
  - `pnpm -C modules/realtime test:run`
  - `pnpm -C modules/api test:run`
  - `pnpm -C modules/ui test:run`
  - `pnpm -r test:run` for the full pass.
- `git commit --no-verify` continues to be approved per master plan §9.1 (`[Refactor --no-verify policy]` memory).
- Closure report cites every new test file by path + exit-criterion ID, matching Phase 2d format.

---

## 9. Findings closed

Phase 3 closes the following findings from `docs/audits/sections/realtime.md` (and the master plan §5 enumeration):

| ID | Severity | Workstream | How |
|---|---|---|---|
| realtime-001 | High | W2 | Move `checkConnectionLimits(ip, userId)` post-auth; userId is non-null at call site. Add regression test in `connection-limits.test.ts`. |
| realtime-002 | High | W2 | Single canonical `handleDisconnect`; both IP and user counts decrement; entries deleted at 0. Add churn-cycle leak test in integration suite. |
| realtime-003 | High | W3 | Server-side `yXmlFragmentToMarkdown` via `@civicpress/editor-schema`; periodic + on-trigger + on-grace writeback through `recordManager.saveDraft`. Exit-criterion test covers it end-to-end. |
| realtime-004 | High | W1 + W2 | Excise ~1,500 lines of broadcast-box device code; trim `realtime-server.ts` to < 1,500 LoC. |
| realtime-005 | Medium | W4 | Snapshot blobs become ephemeral merge-aids with 48h TTL, integrity hash, format version, size warning. Markdown in Git is the only durable archive. |
| realtime-006 | Medium | W6 | Rewrite `TESTING.md`, `test-websocket.mjs`, `DEPLOYMENT.md` to match binary y-protocols and the actual `RealtimeConfig` surface. |
| realtime-007 | Medium | W2 | Delete server-side `generateParticipantColor` + `PARTICIPANT_COLORS`. Client keeps its own copy. |
| realtime-008 | Medium | W5 | New `useRealtimeEditor.ts` does NOT introduce `MAX_RECONNECT_ATTEMPTS` / `RECONNECT_DELAYS` dead scaffolding. y-websocket owns reconnection. |
| realtime-009 | Medium | W1 + W2 | Delete `DeviceConnectionMetadata` + device-specific maps + connection-quality scoring from `realtime-server.ts`. Server stays room-type-agnostic. |
| realtime-010 | Medium | W1 | Delete three-shape ACK normalizer (no devices, no ACK shapes). |
| realtime-011 | Medium | W6 | Add realtime to `docs/roadmap.md` and `docs/project-status.md` "What's Working" with honest claims. Revise `docs/specs/realtime-architecture.md` to match the as-shipped reality. |
| realtime-012 | Low | W2 | All ~46 `: any` in `realtime-server.ts` either deleted with device code or typed explicitly. New realtime code lands under the repo-wide `no-explicit-any: error` rule. |
| realtime-013 | Low | W2 | Emoji-heavy `coreInfo` calls in the device WebRTC routing are deleted with the device code. |
| realtime-014 | Low | W3 | Delete deprecated `Y.Text('initialMarkdown')` shadow and the broken `toMarkdown()` stub. Real serializer in `@civicpress/editor-schema` replaces it. |

The `record` / `records` room-type aliasing flagged in master plan §5 is resolved by normalizing `record:` → `records:` at `parseRoomId` time. Canonical room key is `records:<id>`. UI uses plural throughout. URL `/realtime/record/:id` continues to accept (backward-compat for any in-flight clients) but the server's internal key is always `records:`.

---

## 10. Delivery shape — six workstreams on `refactor/phase-3-realtime`

Single worktree-isolated branch per master plan §6 and `[Parallel subagent shared-branch coordination]` memory. Each workstream lands as one or more commits on the branch; closure report at the end; final `--no-ff` merge to local `dev`. Nothing pushed to any origin per `[Refactor push policy]` memory.

### W1 — Source merge + trim

Bring the full `modules/realtime/` tree (src, package.json, tsconfig.json, the operator docs `README.md`/`ARCHITECTURE.md`/`DEPLOYMENT.md`/`DEVELOPMENT.md`/`QUICK-START.md`/`STANDALONE.md`/`TESTING.md`/`CHANGELOG.md`/`IMPLEMENTATION-STATUS.md`, `test-websocket.mjs`) from `broadcast-box` via `git checkout broadcast-box -- modules/realtime/`. This is a working-tree copy: it does NOT preserve the original commit history of `e014f40`, `5d73791`, etc. — that history stays available on the `broadcast-box` branch itself (preserved per master plan §6), but the W1 commit on `refactor/phase-3-realtime` appears as a single "import" commit. Existing stale `modules/realtime/data/` directory stays as-is for now (review during W6). In the same commit (or a fast follow-up), trim:

- `realtime-server.ts`: delete device routes, legacy device message handler, status/source/ack processing, deprecated setter-injection methods, device cleanup interval, device maps and metadata types.
- `types/realtime.types.ts`: delete `DeviceConnectionMetadata`.
- `realtime-services.ts`: remove broadcast-box-specific service wiring. Add a `record-room-handler.ts` stub that compiles and registers; the actual handler logic lands in W5 (after the serializer in W3 and the persistence rework in W4 give it the building blocks it needs).

Target: `realtime-server.ts` is under 1,500 LoC by end of W1. Tests are likely red until W2/W3 land — that's fine, not committed until per-workstream green.

### W2 — Security + dead-code cleanup

- Fix `checkConnectionLimits` ordering and disconnect path (realtime-001, 002).
- Delete `generateParticipantColor` + `PARTICIPANT_COLORS` from server (realtime-007).
- Eliminate the remaining ~10 `: any` in non-device paths via explicit types (realtime-012).
- Delete emoji-heavy device WebRTC logging — already gone with device code (realtime-013 closed by W1 deletion).
- New `connection-limits.test.ts` lands.

### W3 — Shared editor schema + server-side serializer

- Create `packages/editor-schema/` workspace (package.json, tsconfig, source files per §5.1).
- Add `pnpm-workspace.yaml` entry for `packages/*`.
- Implement schema definition (matching current TipTap setup in `MarkdownEditor.vue`).
- Implement `serializeDocToMarkdown`, `parseMarkdownToDoc`, `yXmlFragmentToMarkdown`, `prosemirrorJSONToYDoc`.
- Add round-trip unit tests + civic-ref tests + parser-error tests.
- `modules/realtime` consumes `@civicpress/editor-schema`: `YjsRoom.serializeToMarkdown()` lands; deprecated `Y.Text('initialMarkdown')` + `toMarkdown()` stub deleted (realtime-014).

### W4 — Persistence rework

- Migration adds `integrity_hash`, `format_version`, `byte_size`, `created_at` columns + index to `realtime_snapshots`.
- `snapshots.ts` enforces hash + format version on load; warns on oversize; runs TTL cleanup at startup + every 6h.
- Constants: `SNAPSHOT_FORMAT_V1`, `MAX_SNAPSHOT_BYTES`, `SNAPSHOT_TTL_MS`.
- `snapshot-manager.test.ts` extended.

### W5 — API + UI wire

- `modules/api/src/routes/records/snapshot-handlers.ts` lands; registers `POST /api/v1/records/:id/snapshot`.
- `RecordRoomHandler` lands in `modules/realtime/src/rooms/record-room-handler.ts`. Owns: snapshot scheduling, serializer invocation, `recordManager.saveDraft` writeback, per-room mutex.
- `RealtimeServer.triggerRecordSnapshot(id)` delegates to the handler.
- `modules/ui/app/composables/useRealtimeEditor.ts` (new, clean) lands.
- `modules/ui/app/composables/useAutosave.ts` gains `collaborativeMode` option (behavior per §5.4).
- `modules/ui/app/components/editor/MarkdownEditor.vue` consumes `@civicpress/editor-schema` and wires `useRealtimeEditor` behind a `collaborativeMode` prop.
- Both exit-criteria tests land and pass: `tests/realtime/exit-criterion-offline-edit-reconnect.test.ts`, `tests/realtime/exit-criterion-collab-writes-markdown.test.ts`.

### W6 — Docs sync + closure

- `TESTING.md`, `test-websocket.mjs`, `DEPLOYMENT.md` rewritten for binary y-protocols + actual config (realtime-006).
- `docs/specs/realtime-architecture.md` revised to match as-shipped Phase 3 (handler-registry, server-side serializer, ephemeral snapshots, no broadcast-box references).
- `docs/roadmap.md`: realtime moved to "What's Working" with honest claim (records collab edit; ephemeral snapshots; Markdown writeback through Git).
- `docs/project-status.md`: same as roadmap.
- `docs/audits/phase-3-closure-report.md`: closure report citing every closed finding by SHA and every new test by path.
- Master-plan §4 phase-map row updated: Phase 3 → DONE with closure SHA.
- Per `[Refactor 2026-05 master plan]` memory and `[Refactor push policy]` memory: branch ready to merge to local `dev` via `--no-ff`; no remote push.

---

## 11. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Civic-ref node serializer rules don't match what `MarkdownEditor.vue` produces today (drift between client and shared schema) | Medium | Medium | W3 starts by reading the existing TipTap extension definitions in `MarkdownEditor.vue`, building the shared schema from that ground truth. Golden snapshot tests in `civic-refs.test.ts` use real fixtures from current UI tests. |
| `realtime-server.ts` trim leaves dangling references; tests stay red into W2 | High | Low | Expected. W1 doesn't promise green tests; W2 lands the security fixes + types, end of W2 is the first all-green checkpoint. |
| `y-prosemirror` server-side use turns up unexpected behavior (it's designed for browser use) | Low | Medium | W3 spike: smoke test against the real broadcast-box `yjs-room.ts` fixture before committing to the full serializer build. If `y-prosemirror` can't run headless cleanly, fall back to a hand-written XmlFragment→Markdown walker scoped to the editor schema. |
| Markdown writeback fires too aggressively, spams Git history | Medium | Low | Per §6.2: skip the snapshot if no Yjs updates landed since the previous one. Default 60s cadence; tunable. |
| Snapshot integrity-hash mismatch becomes common in practice (false positives) | Low | Low | If observed in tests/integration, downgrade the warning to debug and rely on Markdown reload as the safe fallback. Hash is defense-in-depth, not gate. |
| `packages/` new convention conflicts with something in tooling (pnpm, eslint, tsc) | Low | Medium | W3 first task: add `packages/*` to `pnpm-workspace.yaml`, verify lint + build pick it up cleanly with an empty package, THEN start moving code. |
| Re-introducing realtime breaks the existing CLI / scripts that might assume `modules/realtime` is absent | Low | Low | `pnpm -r build` runs after W1 + W2 + W3; failures get diagnosed before W5 lands. CLI does not depend on realtime per Phase 2d closure inventory. |
| Pre-existing date-bomb test failure (`database-integration > Session Management`) confuses Phase 3 test runs | High | Low | Already-known per `[Refactor --no-verify policy]`. Treat its failure as baseline; do NOT include it in the closure report's "tests passing" count. |

---

## 12. Non-goals (restated)

- Browser E2E with real Nuxt sessions.
- Multi-node Redis adapter.
- Performance / load testing.
- Presence cursors, "published in another tab" UI, room-state polish beyond connection-state badge.
- Reintroducing broadcast-box (Phases 4 + 5).
- Non-Yjs room types.
- The pre-existing `database-integration > Session Management` date-bomb fix.
- New ESLint rules on `modules/realtime/` beyond the repo-wide `no-explicit-any: error`.
- Manifesto edits. Per master plan §9.3, the manifesto stays as-is until Phase 5.

---

## 13. Memory updates after merge

- Add `phase-3-realtime-complete.md` user-memory with the merge SHA, the workstream summary, and the closed-findings list. Link from `MEMORY.md`.
- Update `[Refactor 2026-05 master plan]` memory: Phase 3 → MERGED to local dev; cumulative finding closures bumped; next master-plan phase = Phase 4 (broadcast-box hardware audit).
- Update `[Audit 2026-05 complete]` memory: 14 more findings (realtime-001 … 014) flip from open to closed-with-commit-SHA; cumulative `closed/205` count bumped.
- Add a one-line entry to `MEMORY.md` for the new `@civicpress/editor-schema` package (it's a structural shared library worth remembering).
- If `y-prosemirror` headless turns out to be wrong (per Risk row) and we hand-write the serializer, add a `realtime-serializer-rationale.md` memory documenting the decision so future-us doesn't try `y-prosemirror` again.

---

## 14. Open questions deferred to the implementation plan

These are not blocking the spec; the writing-plans skill resolves them in the next session.

1. **Exact existing TipTap version in `modules/ui` on `dev`.** Determines the version pin for `@civicpress/editor-schema`'s tiptap deps. Read `modules/ui/package.json` during plan drafting.
2. **Whether `tiptap-markdown` is already a dep.** If yes, the schema package's serializer rules may overlap; resolve to one source of truth in W3 implementation.
3. **The exact Markdown form of civic-ref nodes today.** Reading `MarkdownEditor.vue` + existing record fixtures during W3 plan drafting is the ground truth. Spec assumes "HTML-comment delimiters with JSON attrs" but defers to actual code.
4. **Grace-period default (currently 5 min in this spec).** Real production value is a tunable; 5 min is the working default. Tests use a shorter override (e.g., 200ms).
5. **Snapshot interval default (currently 60s).** Same situation as grace period — tests override.
6. **Whether `useAutosave.ts`'s `collaborativeMode` is a prop on the composable or a context-driven runtime check.** Implementation detail; spec is silent.
7. **API endpoint shape for `POST /api/v1/records/:id/snapshot`.** Body schema, response envelope, error codes — all match existing records-route conventions; spec doesn't fix them in advance.

---

## History

- 2026-06-04 — Initial spec, brainstorming gate approved. Author: Claude Opus 4.7 (1M context) in collaboration with the user.
