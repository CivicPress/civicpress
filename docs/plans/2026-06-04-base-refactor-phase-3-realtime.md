# Phase 3 — Realtime Reintroduction (Yjs-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reintroduce `@civicpress/realtime` to local `dev` as a trimmed, Yjs-only WebSocket server with the realtime-* findings closed; ship a new shared `@civicpress/editor-schema` workspace so Markdown round-trip happens server-side and the canonical Markdown file is the durable civic archive.

**Architecture:** Six sequential workstreams on one branch `refactor/phase-3-realtime`. W1 = mechanical source merge + device-code excise (no tests yet; expected red). W2 = security + dead-code cleanup with the first all-green checkpoint. W3 = new `packages/editor-schema/` workspace + server-side `serializeToMarkdown` (TDD throughout). W4 = snapshot persistence rework (integrity hash + format version + TTL). W5 = API endpoint + UI wire + both master-plan-named exit-criteria tests. W6 = docs sync + closure report + memory updates + final `--no-ff` merge to local `dev`.

**Tech Stack:** Node 20 + TypeScript 5.x, `ws` for WebSocket transport, `yjs` + `y-protocols` + `lib0` for CRDT, `y-prosemirror` + `prosemirror-markdown` for server-side serialization, `@tiptap/core` + `@tiptap/starter-kit` + `@tiptap/extension-collaboration` + `@tiptap/extension-collaboration-cursor` for the editor, `y-websocket` for the client transport, Nuxt 4 + Vue 3.5 for UI, vitest for tests, pnpm 9.15.9 workspaces, SQLite for snapshot storage.

**Spec reference:** `docs/specs/2026-06-04-phase-3-realtime-design.md` (commit `51ac44a`).

**Master plan reference:** `docs/plans/2026-05-17-base-refactor-master-plan.md` §5 Phase 3.

**Audit reference:** `docs/audits/sections/realtime.md` (findings realtime-001 … realtime-014).

**Source branch for cherry-pick:** `broadcast-box` (last commit `47d0ff6`).

**Refactor policy reminders:**
- `git commit --no-verify` is approved per master plan §9.1 (memory: `[Refactor --no-verify policy]`).
- No push to any remote per memory `[Refactor push policy]` (this includes `dev` after the W6 merge).
- All work stays on `refactor/phase-3-realtime` until W6 merge to `dev`.
- Parallel work uses worktree isolation per memory `[Parallel subagent shared-branch coordination]`.

**Branch dependency:** `refactor/phase-3-realtime` is created off `dev` after the W6 plan task verifies clean working tree. The branch lives locally only until the W6-final merge.

---

## Task execution order

```
Pre-flight              →  Worktree + branch + baseline LoC + baseline test snapshots
W1 (source + trim)      →  W1-T1 → W1-T2 → W1-T3 → W1-T4 → W1-T5 → W1-T6 → W1-T7 → W1-T8
W2 (security + cleanup) →  W2-T1 (TDD) → W2-T2 → W2-T3 → W2-T4 → W2-T5 → W2-T6 (commit)
W3 (editor-schema)      →  W3-T1 → W3-T2 → W3-T3 (TDD) → W3-T4 → … → W3-T16 (commit)
W4 (persistence)        →  W4-T1 (TDD) → W4-T2 → … → W4-T8 (commit)
W5 (API + UI wire)      →  W5-T1 (TDD) → W5-T2 → … → W5-T14 (commit)
W6 (docs + closure)     →  W6-T1 → … → W6-T9 (final --no-ff merge to dev)
```

Workstreams run sequentially because each builds artifacts the next consumes: W3 introduces the serializer that W5 consumes; W4 introduces persistence columns that W5 reads. Within a workstream, tasks run sequentially unless explicitly marked as worktree-parallelizable.

**TDD posture:** Every behavior change in W2–W5 lands as a failing test first, then implementation, then green. The exit-criteria tests in W5 are explicit: write the test, watch it fail in the right way, build the support, watch it pass. No "add tests later."

---

## File structure (across all workstreams)

| File | Workstream | Responsibility | Action |
|---|---|---|---|
| `pnpm-workspace.yaml` | W3 | Workspace discovery | Modify — add `packages/*` glob |
| `packages/editor-schema/package.json` | W3 | New workspace manifest | Create |
| `packages/editor-schema/tsconfig.json` | W3 | TypeScript config | Create |
| `packages/editor-schema/src/index.ts` | W3 | Public re-exports | Create |
| `packages/editor-schema/src/schema.ts` | W3 | ProseMirror schema (nodes + marks) | Create |
| `packages/editor-schema/src/tiptap-extensions.ts` | W3 | TipTap extension array | Create |
| `packages/editor-schema/src/civic-ref-nodes.ts` | W3 | record-ref / geography-ref / attachment-ref custom nodes | Create |
| `packages/editor-schema/src/markdown-serializer.ts` | W3 | serializeDocToMarkdown | Create |
| `packages/editor-schema/src/markdown-parser.ts` | W3 | parseMarkdownToDoc | Create |
| `packages/editor-schema/src/yjs-helpers.ts` | W3 | yXmlFragmentToMarkdown, prosemirrorJSONToYDoc | Create |
| `packages/editor-schema/src/__tests__/roundtrip.test.ts` | W3 | Markdown ↔ ProseMirror round-trip | Create |
| `packages/editor-schema/src/__tests__/civic-refs.test.ts` | W3 | Civic-ref-specific round-trip | Create |
| `packages/editor-schema/src/__tests__/parser-errors.test.ts` | W3 | Malformed Markdown handling | Create |
| `modules/realtime/package.json` | W1 | Realtime module manifest | Create (cherry-pick) — `@civicpress/editor-schema` added in W3 |
| `modules/realtime/tsconfig.json` | W1 | TypeScript config | Create (cherry-pick) |
| `modules/realtime/src/index.ts` | W1, W3 | Public exports | Create (cherry-pick), update in W3 |
| `modules/realtime/src/auth.ts` | W1, W3 | Token extraction + room-id parse | Create (cherry-pick); W3 normalizes `record:` → `records:` |
| `modules/realtime/src/handler-registry.ts` | W1 | Room-type handler registry | Create (cherry-pick) |
| `modules/realtime/src/realtime-config-manager.ts` | W1 | Runtime config | Create (cherry-pick) |
| `modules/realtime/src/realtime-server.ts` | W1, W2, W3 | WS broker | Cherry-pick then trim < 1500 LoC; W2 fixes connection limits; W3 deletes color palette |
| `modules/realtime/src/realtime-services.ts` | W1, W5 | Service container registration | Cherry-pick + trim broadcast-box wiring; W5 registers RecordRoomHandler |
| `modules/realtime/src/rooms/room-manager.ts` | W1, W3 | Room registry | Cherry-pick; W3 normalizes `record:` → `records:` |
| `modules/realtime/src/rooms/yjs-room.ts` | W1, W3 | Per-room Yjs state | Cherry-pick; W3 adds serializeToMarkdown(); W3 deletes deprecated Y.Text('initialMarkdown') |
| `modules/realtime/src/rooms/record-room-handler.ts` | W1, W5 | RecordRoom implementation of RoomTypeHandler | W1 stub; W5 full impl |
| `modules/realtime/src/persistence/snapshots.ts` | W1, W4 | Snapshot lifecycle | Cherry-pick; W4 adds integrity-hash + format-version + size cap + TTL |
| `modules/realtime/src/persistence/storage.ts` | W1 | Persistence adapter | Cherry-pick |
| `modules/realtime/src/persistence/migrations.sql` | W1, W4 | DB migrations | Cherry-pick; W4 adds columns |
| `modules/realtime/src/presence/awareness.ts` | W1 | Awareness wrapper | Cherry-pick |
| `modules/realtime/src/presence/presence-manager.ts` | W1 | Presence registry | Cherry-pick |
| `modules/realtime/src/errors/realtime-errors.ts` | W1 | Error class hierarchy | Cherry-pick |
| `modules/realtime/src/types/messages.ts` | W1 | y-protocols message types | Cherry-pick |
| `modules/realtime/src/types/realtime.types.ts` | W1 | Realtime types — minus DeviceConnectionMetadata | Cherry-pick + delete device types |
| `modules/realtime/src/types/handler-registry.types.ts` | W1 | Handler registry types | Cherry-pick |
| `modules/realtime/src/__tests__/connection-limits.test.ts` | W2 | NEW: closes audit gap | Create |
| `modules/realtime/src/__tests__/record-room-handler.test.ts` | W5 | NEW | Create |
| `modules/realtime/src/__tests__/yjs-room.test.ts` | W3 | Extended | Cherry-pick + add serializeToMarkdown cases |
| `modules/realtime/src/__tests__/snapshot-manager.test.ts` | W4 | Extended | Cherry-pick + add hash + format + TTL + oversize cases |
| `modules/realtime/src/__tests__/auth.test.ts` | W1, W3 | Extended | Cherry-pick + add records-normalization in W3 |
| `modules/realtime/src/__tests__/realtime-server.test.ts` | W1, W2 | Trimmed | Cherry-pick + delete broadcast-box cases |
| `tests/realtime/realtime.integration.test.ts` | W1, W5 | Multi-client harness | Cherry-pick + delete broadcast-box suites; W5 adds churn / snapshot-round-trip / integrity tests |
| `tests/realtime/exit-criterion-offline-edit-reconnect.test.ts` | W5 | Master-plan named test | Create |
| `tests/realtime/exit-criterion-collab-writes-markdown.test.ts` | W5 | Master-plan named test | Create |
| `modules/api/src/routes/records/snapshot-handlers.ts` | W5 | POST /api/v1/records/:id/snapshot | Create |
| `modules/api/src/routes/records/index.ts` (or wiring file) | W5 | Route registration | Modify — register snapshot handlers |
| `modules/api/tests/snapshot-handlers.test.ts` | W5 | API endpoint test | Create |
| `modules/ui/app/composables/useRealtimeEditor.ts` | W5 | NEW (clean) | Create |
| `modules/ui/app/composables/useAutosave.ts` | W5 | Add collaborativeMode option | Modify |
| `modules/ui/app/composables/__tests__/useRealtimeEditor.test.ts` | W5 | Composable test | Create |
| `modules/ui/app/composables/__tests__/useAutosave.test.ts` | W5 | Extended | Modify (create if missing) |
| `modules/ui/app/components/editor/MarkdownEditor.vue` | W5 | Consume editor-schema + wire realtime behind prop | Modify |
| `modules/ui/package.json` | W5 | Add @civicpress/editor-schema workspace dep + tiptap collab deps | Modify |
| `modules/realtime/TESTING.md` | W6 | Operator doc | Rewrite for binary y-protocols |
| `modules/realtime/test-websocket.mjs` | W6 | Operator smoke script | Rewrite for binary y-protocols |
| `modules/realtime/DEPLOYMENT.md` | W6 | Operator doc | Drop `tls.enabled` field; add new snapshot fields |
| `docs/specs/realtime-architecture.md` | W6 | Realtime spec | Revise to match as-shipped Phase 3 |
| `docs/roadmap.md` | W6 | Public roadmap | Add realtime to "What's Working" |
| `docs/project-status.md` | W6 | Public status | Add realtime; honest claims |
| `docs/plans/2026-05-17-base-refactor-master-plan.md` | W6 | Master plan | Update §4 phase-map row |
| `docs/audits/phase-3-closure-report.md` | W6 | Closure artifact | Create |

---

## Pre-flight: branch + baseline snapshots

**Files:**
- No edits; this task only sets up the worktree branch and captures baselines.

- [ ] **Step 1: Verify clean working tree on `dev`**

Run:
```bash
git status && git rev-parse --abbrev-ref HEAD
```
Expected: working tree clean, branch is `dev`, HEAD is `51ac44a` or later (spec commit). If not clean, stop and report — do NOT stash or discard.

- [ ] **Step 2: Confirm spec is in tree**

Run:
```bash
ls -la docs/specs/2026-06-04-phase-3-realtime-design.md
git log --oneline -1 docs/specs/2026-06-04-phase-3-realtime-design.md
```
Expected: file exists; latest commit touching it is `51ac44a docs(phase-3-realtime): design spec for Yjs-only realtime reintroduction`.

- [ ] **Step 3: Create the Phase 3 worktree**

```bash
git worktree add -b refactor/phase-3-realtime ../civicpress-phase-3-realtime dev
cd ../civicpress-phase-3-realtime
git rev-parse --abbrev-ref HEAD
```
Expected: `refactor/phase-3-realtime`. From here on, **all task steps run inside the worktree directory** unless a step explicitly says otherwise. The original `civicpress/` checkout stays on `dev` for the duration.

- [ ] **Step 4: Capture baseline file inventory**

```bash
find modules/realtime -type f -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/data/*' 2>/dev/null | sort > /tmp/phase-3-realtime-baseline-files.txt
wc -l /tmp/phase-3-realtime-baseline-files.txt
```
Expected: 0 lines (the source tree is absent on `dev`). Save this file; you'll diff against the post-W1 inventory to confirm exactly which files came over.

- [ ] **Step 5: Capture baseline test-suite green-list**

**Revised 2026-06-05** (see `docs/audits/2026-06-04-dev-state-baseline-audit.md`). The original `pnpm -r test:run` invocation fails by construction in this repo: `core` and `cli` have a `"test": "jest"` script with no jest config (the suites all fail to parse), and `modules/api` has a `"test:run": "vitest run"` script with no per-workspace vitest config (finds zero test files). The Phase 2d closure report's per-workspace counts (357 core / 270 api / 138 ui) actually came from the **root vitest** picking up colocated `__tests__/` files via include patterns, NOT from per-workspace invocations. See `docs/audits/known-test-issues.md` W1, W2, W3.

```bash
# 1. Sync deps and build all workspaces.
pnpm install
pnpm -r build 2>&1 | tail -20

# 2. modules/storage has a working per-workspace vitest config.
pnpm -C modules/storage test:run 2>&1 \
  | tee /tmp/phase-3-baseline-storage.txt | tail -5

# 3. Root vitest covers core + cli + api + ui colocated tests + tests/**.
pnpm run test:run 2>&1 \
  | tee /tmp/phase-3-baseline-root.txt | tail -10

# 4. UI tests run under happy-dom via a separate config.
pnpm run test:ui:run 2>&1 \
  | tee /tmp/phase-3-baseline-ui.txt | tail -10

# 5. modules/ui build is a separate step (Nuxt + vite TS).
pnpm -C modules/ui build 2>&1 \
  | tee /tmp/phase-3-baseline-ui-build.txt | tail -10
```

**Expected (the honest baseline at dev HEAD post-`36f5e79`):**

- `pnpm -r build` and `pnpm -C modules/ui build` clean.
- `modules/storage`: **216/216** ✓.
- Root vitest (node): **11 expected failures** of 1025 tests. Breakdown: 5 EmailChannel `vi.mock` interception failures, 4 oauth-provider tests that hit the real GitHub API, 1 notification-system test that hits a real DNS lookup, 1 documented date-bomb in `database-integration > Session Management`. All four clusters are catalogued in `docs/audits/known-test-issues.md` (W4, W5, D1, plus master plan §9.1 for the date-bomb).
- Root vitest (UI): **17 expected failures** of 122 tests. Breakdown: 6 `StatusTransitionControls` + 5 `RecordSearch` + 1 `RecordList` + 1 `UserForm` (all four are pre-existing Nuxt UI v3→v4 stub-bypass + test-authoring bugs reproducing at the test's introduction commit), 4 `PreviewPanel` (`useMarkdown` auto-import not mocked). All deferred to the UI test-infra triage session (`docs/audits/known-test-issues.md` W6, D2) — adjacent to `ui-002`.

Phase 3 must not regress against these counts. If a new failure appears that is NOT in `docs/audits/known-test-issues.md`, stop and investigate before continuing — it is the new regression Phase 3 introduced.

**Do NOT run** `pnpm -r test:run` for the baseline. It will exit non-zero on workspaces with broken scripts and obscure the actual failure signal.

- [ ] **Step 6: Capture baseline LoC for the master-plan exit criterion**

```bash
git show broadcast-box:modules/realtime/src/realtime-server.ts | wc -l
```
Expected: `3581`. Record this as the "before" number for the < 1,500 LoC exit criterion.

- [ ] **Step 7: No commit**

Pre-flight produces no commits. The first commit on the worktree branch is W1-T8.

---

## W1 — Source merge + device-code excise

**Goal:** Bring `modules/realtime/` into the worktree from `broadcast-box`; delete every line of broadcast-box-specific code. End state: `modules/realtime/src/realtime-server.ts` is under 1,500 LoC and contains zero references to "device", "DeviceConnectionMetadata", "calculateConnectionScore", or the three-shape ACK normalizer.

**TDD note:** W1 is mechanical deletion; not a behavior change. Tests are likely red at intermediate steps (the trim breaks some existing test imports). End-of-W1 only requires: `pnpm -r build` is clean and the LoC bar is met. Test green is W2's job.

### W1-T1: Cherry-pick the realtime tree from `broadcast-box`

**Files:**
- Create: every file under `modules/realtime/` from `broadcast-box` HEAD

- [ ] **Step 1: Bring the tracked tree over**

```bash
git checkout broadcast-box -- modules/realtime/
```

This is a working-tree copy. It does NOT preserve the per-commit history of `e014f40`, `5d73791`, `c9729bf`, `a9aed22`, `d6a5fc8`, `8ef25e4` — that history stays available on the `broadcast-box` branch itself per master plan §6.

- [ ] **Step 2: Verify the file set**

```bash
find modules/realtime -type f -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/data/*' 2>/dev/null | sort
```

Expected file set (operator docs + source + tests):
- `modules/realtime/CHANGELOG.md`
- `modules/realtime/ARCHITECTURE.md`
- `modules/realtime/DEPLOYMENT.md`
- `modules/realtime/DEVELOPMENT.md`
- `modules/realtime/IMPLEMENTATION-STATUS.md`
- `modules/realtime/QUICK-START.md`
- `modules/realtime/README.md`
- `modules/realtime/STANDALONE.md`
- `modules/realtime/TESTING.md`
- `modules/realtime/package.json`
- `modules/realtime/test-websocket.mjs`
- `modules/realtime/tsconfig.json`
- `modules/realtime/src/auth.ts`
- `modules/realtime/src/handler-registry.ts`
- `modules/realtime/src/index.ts`
- `modules/realtime/src/realtime-config-manager.ts`
- `modules/realtime/src/realtime-server.ts`
- `modules/realtime/src/realtime-services.ts`
- `modules/realtime/src/errors/realtime-errors.ts`
- `modules/realtime/src/persistence/migrations.sql`
- `modules/realtime/src/persistence/snapshots.ts`
- `modules/realtime/src/persistence/storage.ts`
- `modules/realtime/src/presence/awareness.ts`
- `modules/realtime/src/presence/presence-manager.ts`
- `modules/realtime/src/rooms/room-manager.ts`
- `modules/realtime/src/rooms/yjs-room.ts`
- `modules/realtime/src/types/handler-registry.types.ts`
- `modules/realtime/src/types/messages.ts`
- `modules/realtime/src/types/realtime.types.ts`
- `modules/realtime/src/__tests__/auth.test.ts`
- `modules/realtime/src/__tests__/presence-manager.test.ts`
- `modules/realtime/src/__tests__/rate-limiting.test.ts`
- `modules/realtime/src/__tests__/realtime-config-manager.test.ts`
- `modules/realtime/src/__tests__/realtime-server.test.ts`
- `modules/realtime/src/__tests__/room-manager.test.ts`
- `modules/realtime/src/__tests__/snapshot-manager.test.ts`
- `modules/realtime/src/__tests__/test-utils.ts`
- `tests/realtime/realtime.integration.test.ts`

If the file set differs by more than a few peripheral docs, stop and investigate.

- [ ] **Step 3: Verify untouched neighbours**

```bash
git status --short | grep -v '^?? modules/realtime/' | grep -v '^A.* modules/realtime/'
```

Expected: no output. Only `modules/realtime/` and `tests/realtime/` paths should have changed. If anything else appears, the checkout cross-contaminated — abort and investigate.

- [ ] **Step 4: Confirm pre-trim LoC**

```bash
wc -l modules/realtime/src/realtime-server.ts
```

Expected: `3581 modules/realtime/src/realtime-server.ts`. This is the "before" number we're aiming to drive below 1,500 over W1.

- [ ] **Step 5: No commit yet**

The trim happens before the first commit. W1-T1 is just the working-tree state setup; commit happens at W1-T8 after all trims.

### W1-T2: Delete device routing block + legacy device-message handler

**Files:**
- Modify: `modules/realtime/src/realtime-server.ts`

- [ ] **Step 1: Locate the device routing branch in `handleConnection`**

The device routing decision lives around line 530–551 in the broadcast-box version. Search for the `if (customHandler)` block and the subsequent `else` branch that dispatches to `handleDeviceConnection`:

```bash
grep -n "customHandler\|handleDeviceConnection\|handleDeviceMessage" modules/realtime/src/realtime-server.ts | head -20
```

- [ ] **Step 2: Replace the device fallback with handler-only routing**

Find the block matching this shape (line numbers approximate):

```ts
// existing in broadcast-box:
const customHandler = this.handlerRegistry?.getHandler(roomType)
if (customHandler) {
  await this.handleConnectionWithHandler(ws, req, customHandler, /* … */)
  return
}

// LEGACY device path (delete):
if (roomType === 'device') {
  await this.handleDeviceConnection(ws, req, /* … */)
  return
}
```

Replace with handler-only routing:

```ts
const customHandler = this.handlerRegistry?.getHandler(roomType)
if (!customHandler) {
  coreWarn('No handler registered for room type', {
    operation: 'realtime:connection:no-handler',
    roomType,
  })
  ws.close(4004, JSON.stringify({ code: 'ROOM_TYPE_NOT_REGISTERED', roomType }))
  return
}
await this.handleConnectionWithHandler(ws, req, customHandler)
```

This collapses the fallback. If no handler is registered for the room type, the connection is refused cleanly with a 4004 close — instead of falling through to the legacy device path.

- [ ] **Step 3: Delete `handleDeviceConnection` method entirely**

Find the method (`async handleDeviceConnection(...)`) starting around line 640. Delete from the method's `async handleDeviceConnection(` opening to its closing `}`. Use your editor's "delete function body" capability or scope-aware delete.

- [ ] **Step 4: Delete `setupDeviceMessageHandlers` and the legacy device message handler at line ~1533**

The legacy message handler is a large block that starts with a comment like `// LEGACY device message handler` or similar and extends to the end of the device-routing section. Delete from `setupDeviceMessageHandlers(` opening to its closing `}`.

- [ ] **Step 5: Verify pattern absence**

```bash
grep -nE "handleDeviceConnection|setupDeviceMessageHandlers|LEGACY device" modules/realtime/src/realtime-server.ts
```

Expected: no matches.

- [ ] **Step 6: Mid-trim LoC checkpoint**

```bash
wc -l modules/realtime/src/realtime-server.ts
```

Expected: significant drop from 3581 — somewhere in the 2400–2700 range. (The exact number depends on how much was in the legacy device-message handler block.)

- [ ] **Step 7: No commit yet**

### W1-T3: Delete status/source/ack processing block (lines ~1782–2330)

**Files:**
- Modify: `modules/realtime/src/realtime-server.ts`

- [ ] **Step 1: Identify the device status/source/ack block**

```bash
grep -nE "ackMessage|active_source|source.capability|deviceManager.updateDevice" modules/realtime/src/realtime-server.ts | head -20
```

This block handles device status reports, source capability merging, ACK normalization across three payload shapes, and active-source enrichment.

- [ ] **Step 2: Delete the methods**

Methods to delete (all on `RealtimeServer`):
- `handleDeviceAck` / `processDeviceAck` (whichever name)
- `handleDeviceStatus` / `processDeviceStatus`
- `handleDeviceSource` / `processSourceCapabilities`
- `enrichActiveSource` / `mergeSourceCapabilities` (any helpers)
- Any `private` helpers called only by the above

For each method, delete from its declaration line to the matching closing `}`.

- [ ] **Step 3: Verify pattern absence**

```bash
grep -nE "ackMessage|active_source|sourceCapabilit|enrichActiveSource|mergeSourceCapabilities" modules/realtime/src/realtime-server.ts
```

Expected: no matches.

- [ ] **Step 4: Mid-trim LoC checkpoint**

```bash
wc -l modules/realtime/src/realtime-server.ts
```

Expected: further drop into the 1900–2200 range.

- [ ] **Step 5: No commit yet**

### W1-T4: Delete deprecated setter-injection methods

**Files:**
- Modify: `modules/realtime/src/realtime-server.ts`

- [ ] **Step 1: Locate the deprecated setters**

```bash
grep -nE "setDeviceAuthDependencies|setDeviceCommandService|setDeviceConnectionTracker|@deprecated" modules/realtime/src/realtime-server.ts
```

Expected matches include three setters marked `@deprecated` plus the private fields they set.

- [ ] **Step 2: Delete the private fields**

Find the field declarations (around lines 140–146):

```ts
// DELETE these field declarations:
private deviceAuthService: any | null = null  // DeviceAuthService - avoiding circular dependency
private deviceCommandService: any | null = null
private deviceConnectionTracker: any | null = null
```

- [ ] **Step 3: Delete the three setter methods**

Each setter looks like:

```ts
/** @deprecated Use handler registry instead */
public setDeviceAuthDependencies(svc: any): void { this.deviceAuthService = svc }
```

Delete all three.

- [ ] **Step 4: Verify pattern absence**

```bash
grep -nE "deviceAuthService|deviceCommandService|deviceConnectionTracker|setDeviceAuthDependencies|setDeviceCommandService|setDeviceConnectionTracker" modules/realtime/src/realtime-server.ts
```

Expected: no matches.

- [ ] **Step 5: Verify the standalone bootstrap stops referring to them**

```bash
grep -nE "setDeviceAuthDependencies|setDeviceCommandService|setDeviceConnectionTracker" modules/realtime/
```

Expected: matches only in `STANDALONE.md` (docs); fix in W6. No matches in any `.ts`/`.mjs` source.

- [ ] **Step 6: No commit yet**

### W1-T5: Delete DeviceConnectionMetadata type + device maps + connection-quality scoring

**Files:**
- Modify: `modules/realtime/src/types/realtime.types.ts`
- Modify: `modules/realtime/src/realtime-server.ts`

- [ ] **Step 1: Delete the type from `realtime.types.ts`**

Find and delete:

```ts
export interface DeviceConnectionMetadata {
  // … (entire interface body, lines ~88-99)
}
```

- [ ] **Step 2: Delete imports of `DeviceConnectionMetadata` in `realtime-server.ts`**

```bash
grep -n "DeviceConnectionMetadata" modules/realtime/src/realtime-server.ts
```

Remove the import and any field declarations using the type.

- [ ] **Step 3: Delete device-keyed maps**

Find and delete the field declarations (around lines 121–128):

```ts
private clientToDevice: Map<WebSocket, string> = new Map()
private deviceConnections: Map<string, WebSocket> = new Map()
private deviceConnectionMetadata: Map<string, DeviceConnectionMetadata> = new Map()
```

- [ ] **Step 4: Delete `calculateConnectionScore`, `getDeviceConnectionsMetadata`, `checkStaleConnections` methods**

```bash
grep -nE "calculateConnectionScore|getDeviceConnectionsMetadata|checkStaleConnections" modules/realtime/src/realtime-server.ts
```

For each method definition, delete from declaration to matching `}`.

- [ ] **Step 5: Delete the dedicated device cleanup interval (around line 2625-2849)**

Look for:

```ts
private deviceCleanupInterval: NodeJS.Timeout | null = null
// … and in constructor / start():
this.deviceCleanupInterval = setInterval(() => this.checkStaleConnections(), DEVICE_CLEANUP_INTERVAL_MS)
// … and in shutdown:
if (this.deviceCleanupInterval) clearInterval(this.deviceCleanupInterval)
```

Delete the field, the constructor wiring, and the shutdown handler. Also delete any `DEVICE_CLEANUP_INTERVAL_MS` constant declarations.

- [ ] **Step 6: Verify pattern absence**

```bash
grep -nE "DeviceConnectionMetadata|clientToDevice|deviceConnections|deviceConnectionMetadata|calculateConnectionScore|checkStaleConnections|deviceCleanupInterval" modules/realtime/src/
```

Expected: no matches in any source file (test files may still reference; they get cleaned in W2-T1's predecessor pass below).

- [ ] **Step 7: Mid-trim LoC checkpoint**

```bash
wc -l modules/realtime/src/realtime-server.ts
```

Expected: into the 1600–1900 range.

- [ ] **Step 8: No commit yet**

### W1-T6: Delete three-shape ACK normalizer

**Files:**
- Modify: `modules/realtime/src/realtime-server.ts`

- [ ] **Step 1: Find the ACK normalizer block**

Around lines 1571–1665 in the broadcast-box version. Look for cascading conditionals on `message.commandId`, `message.payload.commandId`, `message.payload.command_id`:

```bash
grep -n "commandId\|command_id" modules/realtime/src/realtime-server.ts
```

- [ ] **Step 2: Delete the block**

If the block is a standalone method (e.g., `normalizeAckShape(...)`), delete the method. If it's inline inside another method that's already been deleted (in W1-T2 or W1-T3), there should be no remaining references — verify and skip.

- [ ] **Step 3: Verify pattern absence**

```bash
grep -nE "commandId|command_id|normalizeAck" modules/realtime/src/realtime-server.ts
```

Expected: no matches.

- [ ] **Step 4: No commit yet**

### W1-T7: realtime-services.ts trim + record-room-handler stub

**Files:**
- Modify: `modules/realtime/src/realtime-services.ts`
- Create: `modules/realtime/src/rooms/record-room-handler.ts`

- [ ] **Step 1: Read the current `realtime-services.ts`**

```bash
wc -l modules/realtime/src/realtime-services.ts
grep -nE "device|broadcast" modules/realtime/src/realtime-services.ts
```

- [ ] **Step 2: Delete broadcast-box-specific service wiring**

Remove any `setDevice*` calls, any imports from `@civicpress/broadcast-box`, any device-handler registration. Leave the `RealtimeServer` instance creation, `HandlerRegistry` instance, `RoomManager` wiring, `SnapshotManager` wiring, and `PresenceManager` wiring intact.

- [ ] **Step 3: Create the `RecordRoomHandler` stub**

Create `modules/realtime/src/rooms/record-room-handler.ts`:

```ts
import type {
  RoomTypeHandler,
  ConnectionContext,
  MessageContext,
  DisconnectContext,
  AuthResult,
} from '../types/handler-registry.types.js'

/**
 * RecordRoomHandler — handler for `records:<id>` room type.
 *
 * W1: stub that compiles and registers; behavior lands in W5 once the
 * server-side serializer (W3) and snapshot persistence rework (W4) are in place.
 */
export class RecordRoomHandler implements RoomTypeHandler {
  public readonly roomType = 'records'

  async onAuth(_ctx: ConnectionContext): Promise<AuthResult> {
    // Generic auth already runs in realtime-server.ts before the handler is called.
    return { ok: true }
  }

  async onConnect(_ctx: ConnectionContext): Promise<void> {
    // Room state replay handled by RoomManager; no per-handler connect work in W1.
  }

  async onMessage(_ctx: MessageContext): Promise<void> {
    // Yjs sync messages are handled by RoomManager/YjsRoom; no per-handler routing.
  }

  async onDisconnect(_ctx: DisconnectContext): Promise<void> {
    // Snapshot scheduling lands in W5.
  }
}
```

The exact `RoomTypeHandler` interface members (`onAuth`, `onConnect`, etc.) come from `handler-registry.types.ts`. If the field/method shapes differ from what's shown above, conform to the actual interface — this stub's only contract is "implements `RoomTypeHandler` and registers under `roomType = 'records'`".

- [ ] **Step 4: Register the handler in `realtime-services.ts`**

Add to the service-container registration:

```ts
import { RecordRoomHandler } from './rooms/record-room-handler.js'

// inside registerRealtimeServices():
const recordHandler = new RecordRoomHandler()
realtimeServer.handlerRegistry?.registerRoomTypeHandler(recordHandler)
```

(Method name might be `registerHandler` or similar — match the `handler-registry.ts` public API.)

- [ ] **Step 5: Build check**

```bash
pnpm -C modules/realtime build 2>&1 | tail -30
```

Expected: clean build. If type errors point at missing `RoomTypeHandler` fields, conform the stub to the interface.

### W1-T8: LoC check + commit W1

**Files:**
- All `modules/realtime/` changes from W1-T1 through W1-T7

- [ ] **Step 1: Verify the LoC target is met**

```bash
wc -l modules/realtime/src/realtime-server.ts
```

Expected: < 1500 lines. If above, find the next-largest dead block (look for any remaining broadcast-box-specific code with `grep -nE "device|broadcast" modules/realtime/src/realtime-server.ts`) and delete it before committing.

- [ ] **Step 2: Verify no broadcast-box references remain in source**

```bash
grep -rnE "broadcast|device" modules/realtime/src/ | grep -v "// " | grep -v "doc"
```

Inspect each match. Source-code matches should be limited to: zero. Doc-string matches inside source files (`/** docs */`) need cleaning. Test-file matches in `__tests__/` are addressed in W2-T1's predecessor.

- [ ] **Step 3: Verify build**

```bash
pnpm -C modules/realtime build 2>&1 | tail -30
```

Expected: clean. The tests will be red (test files still reference deleted device code) — that's accepted at W1; the build green is what matters.

- [ ] **Step 4: Stage the W1 changes**

```bash
git add modules/realtime/ tests/realtime/
git status --short
```

Expected: all changes are additions or modifications under `modules/realtime/` and `tests/realtime/`. No paths outside these.

- [ ] **Step 5: Commit W1**

```bash
git commit --no-verify -m "$(cat <<'EOF'
refactor(realtime W1/6): cherry-pick + excise broadcast-box device code

Imports modules/realtime/ from broadcast-box (single working-tree copy;
not a per-commit cherry-pick — original history stays on broadcast-box).
Excises ~1,800 lines of device-specific code from realtime-server.ts:
device routing, legacy device-message handler, status/source/ack
processing, deprecated setter-injection, DeviceConnectionMetadata type,
device-keyed maps, calculateConnectionScore, checkStaleConnections,
device cleanup interval, three-shape ACK normalizer.

realtime-server.ts: 3,581 LoC → <1,500 LoC (master plan §5 exit criterion).

RecordRoomHandler stub added; real impl in W5 once W3's serializer and
W4's persistence rework give it the building blocks it needs.

Test files remain red (they still reference deleted device code); W2-T0
trims them before the W2 security fixes land.

Per [Refactor --no-verify policy] memory.

Closes (partial — sets up final closure in W2 + W5):
  realtime-004 (god-file < 1,500 LoC)
  realtime-009 (device boundary violation)
  realtime-010 (three-shape ACK normalizer)
  realtime-013 (emoji-heavy device WebRTC logging — gone with device code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Verify commit lands**

```bash
git log --oneline -3
```

Expected: the W1 commit is HEAD; the two prior are the spec commit and the lint-Tier-C-roadmap-refresh.

---

## W2 — Security + dead-code cleanup

**Goal:** Close the structural connection-limit leak (realtime-001, 002), delete the dead participant-color palette (realtime-007), eliminate the remaining `: any` in non-device paths (realtime-012), and trim test files that still reference deleted device code. End state: `pnpm -C modules/realtime test:run` is green.

### W2-T0: Trim test files that reference deleted device code

**Files:**
- Modify: `modules/realtime/src/__tests__/realtime-server.test.ts`
- Modify: `modules/realtime/src/__tests__/auth.test.ts`
- Modify: `modules/realtime/src/__tests__/rate-limiting.test.ts`
- Modify: `tests/realtime/realtime.integration.test.ts`

- [ ] **Step 1: Identify device-referencing test blocks**

```bash
grep -rnE "device|Device|broadcast" modules/realtime/src/__tests__/ tests/realtime/ | grep -v "// " | head -40
```

Each match flagged is either: (a) a `describe(...)` or `it(...)` block testing device behavior — delete the whole block; (b) a shared test-utility import — delete the import + replace the usage with a generic helper.

- [ ] **Step 2: Delete device-specific describe/it blocks**

For each `describe('device...', ...)` or `it('handles device ...', ...)`, locate the matching closing `})` and delete the entire block. Be careful with nesting: if a `describe` block contains both record and device tests, only delete the device tests.

- [ ] **Step 3: Run the realtime test suite**

```bash
pnpm -C modules/realtime test:run 2>&1 | tail -50
```

Expected: most tests now run; some may still fail (the connection-limits test that's about to be added is the first new green; the existing tests should pass once device-references are out).

- [ ] **Step 4: Commit test trim**

```bash
git add modules/realtime/src/__tests__ tests/realtime/
git commit --no-verify -m "$(cat <<'EOF'
test(realtime W2-T0): drop device test cases after broadcast-box trim

Removes describe/it blocks referencing handleDeviceConnection,
DeviceConnectionMetadata, ACK shape normalization, and other broadcast-
box-only logic deleted in W1. Existing record-room test coverage
preserved; new tests for the connection-limits fix land in W2-T1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W2-T1: Failing test — `connection-limits.test.ts`

**Files:**
- Create: `modules/realtime/src/__tests__/connection-limits.test.ts`

This test pins the realtime-001 + realtime-002 fix as a regression guard.

- [ ] **Step 1: Write the test file**

Create `modules/realtime/src/__tests__/connection-limits.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { createTestServer, type TestServerCtx } from './test-utils.js'

describe('RealtimeServer connection limits', () => {
  let ctx: TestServerCtx

  beforeEach(async () => {
    ctx = await createTestServer({
      connectionLimits: {
        connectionsPerIp: 3,
        connectionsPerUser: 2,
      },
    })
  })

  afterEach(async () => {
    await ctx.close()
  })

  it('enforces per-user limit POST-AUTH (regression: realtime-001)', async () => {
    const userA = ctx.makeToken({ userId: 'user-a' })

    const ws1 = await ctx.connect({ token: userA, roomId: 'records:r1' })
    const ws2 = await ctx.connect({ token: userA, roomId: 'records:r2' })
    expect(ws1.readyState).toBe(WebSocket.OPEN)
    expect(ws2.readyState).toBe(WebSocket.OPEN)

    const ws3 = await ctx.connectExpectingClose({ token: userA, roomId: 'records:r3' })
    expect(ws3.closeCode).toBe(4029)
    expect(ws3.closeReason).toContain('CONNECTION_LIMIT_EXCEEDED')
  })

  it('enforces per-IP limit POST-AUTH across users', async () => {
    const userA = ctx.makeToken({ userId: 'user-a' })
    const userB = ctx.makeToken({ userId: 'user-b' })
    const userC = ctx.makeToken({ userId: 'user-c' })
    const userD = ctx.makeToken({ userId: 'user-d' })

    await ctx.connect({ token: userA, roomId: 'records:r1' })
    await ctx.connect({ token: userB, roomId: 'records:r1' })
    await ctx.connect({ token: userC, roomId: 'records:r1' })

    const ws4 = await ctx.connectExpectingClose({ token: userD, roomId: 'records:r1' })
    expect(ws4.closeCode).toBe(4029)
  })

  it('rejects unauthenticated connections without counting them (no leak)', async () => {
    const ws = await ctx.connectExpectingClose({ token: 'invalid-token', roomId: 'records:r1' })
    expect(ws.closeCode).toBe(4001)

    // After auth failure, the count should NOT have incremented.
    const ipCount = ctx.server.getConnectionCounts().get(ctx.localIp) ?? 0
    expect(ipCount).toBe(0)
  })

  it('decrements per-IP count on disconnect (regression: realtime-002)', async () => {
    const userA = ctx.makeToken({ userId: 'user-a' })
    const ws1 = await ctx.connect({ token: userA, roomId: 'records:r1' })

    expect(ctx.server.getConnectionCounts().get(ctx.localIp)).toBe(1)

    ws1.close()
    await ctx.waitForDisconnect(ws1)

    expect(ctx.server.getConnectionCounts().has(ctx.localIp)).toBe(false)
  })

  it('decrements per-user set on last-disconnect (regression: realtime-002)', async () => {
    const userA = ctx.makeToken({ userId: 'user-a' })
    const ws1 = await ctx.connect({ token: userA, roomId: 'records:r1' })
    const ws2 = await ctx.connect({ token: userA, roomId: 'records:r2' })

    expect(ctx.server.getUserConnections().get('user-a')?.size).toBe(2)

    ws1.close()
    await ctx.waitForDisconnect(ws1)
    expect(ctx.server.getUserConnections().get('user-a')?.size).toBe(1)

    ws2.close()
    await ctx.waitForDisconnect(ws2)
    expect(ctx.server.getUserConnections().has('user-a')).toBe(false)
  })

  it('does NOT leak counts across 50 connect-disconnect cycles (no-leak invariant)', async () => {
    const userA = ctx.makeToken({ userId: 'user-a' })
    for (let i = 0; i < 50; i++) {
      const ws = await ctx.connect({ token: userA, roomId: `records:r${i}` })
      ws.close()
      await ctx.waitForDisconnect(ws)
    }
    expect(ctx.server.getConnectionCounts().size).toBe(0)
    expect(ctx.server.getUserConnections().size).toBe(0)
  })
})
```

If `test-utils.ts` doesn't expose `connectExpectingClose`, `makeToken`, `waitForDisconnect`, or `getConnectionCounts`/`getUserConnections` accessors, extend `test-utils.ts` first. If the existing helpers use different shapes, conform to them — the contract this test pins is the behavior, not the helper names.

- [ ] **Step 2: Run the failing test**

```bash
pnpm -C modules/realtime test:run -- connection-limits 2>&1 | tail -30
```

Expected: tests run; multiple FAIL because the broadcast-box behavior is: `checkConnectionLimits(ip, null)` pre-auth, no decrement on disconnect, no `getConnectionCounts`/`getUserConnections` accessors. Confirm the failure modes match the bug descriptions in §6.4 of the spec.

- [ ] **Step 3: No commit yet**

The test goes in with the fix in W2-T2's commit (red test + green fix in one commit is the cleanest history).

### W2-T2: Fix `checkConnectionLimits` ordering + single canonical `handleDisconnect`

**Files:**
- Modify: `modules/realtime/src/realtime-server.ts`
- Modify: `modules/realtime/src/__tests__/test-utils.ts` (if accessors are missing)

- [ ] **Step 1: Add public accessors for the count maps**

In `realtime-server.ts`, add (or expose if private):

```ts
/** @internal — for connection-limits regression tests */
public getConnectionCounts(): ReadonlyMap<string, number> {
  return this.connectionCounts
}

/** @internal — for connection-limits regression tests */
public getUserConnections(): ReadonlyMap<string, Set<WebSocket>> {
  return this.userConnections
}
```

These are `@internal` — production code shouldn't depend on them, but tests need observable state.

- [ ] **Step 2: Reorder `handleConnection` per §6.4 of the spec**

Find the current `handleConnection` (or `handleConnectionWithHandler`) implementation. Restructure to this exact ordering:

```ts
async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  // 1. Auth FIRST
  const auth = await authenticate(req, this.authService)
  if (!auth.ok) {
    this.closeWithCode(ws, 4001, 'AUTH_FAILED', { reason: auth.reason })
    return
  }

  // 2. Permission check (uses authenticated userId)
  const { recordId, roomType } = parseRoomId(req)
  const canEdit = await this.permissions.userCan(auth.userId, 'records:edit', recordId)
  if (!canEdit) {
    this.closeWithCode(ws, 4003, 'PERMISSION_DENIED', { recordId })
    return
  }

  // 3. Connection limits — userId is known now
  const ip = getClientIp(req)
  const limitCheck = this.checkConnectionLimits(ip, auth.userId)
  if (!limitCheck.ok) {
    this.closeWithCode(ws, 4029, 'CONNECTION_LIMIT_EXCEEDED', { reason: limitCheck.reason })
    return
  }

  // 4. Register
  this.connectionCounts.set(ip, (this.connectionCounts.get(ip) ?? 0) + 1)
  const userSet = this.userConnections.get(auth.userId) ?? new Set<WebSocket>()
  userSet.add(ws)
  this.userConnections.set(auth.userId, userSet)

  // 5. Wire single disconnect path BEFORE handler.onConnect
  ws.once('close', () => this.handleDisconnect(ws, ip, auth.userId))

  // 6. Dispatch to handler
  const handler = this.handlerRegistry?.getHandler(roomType)
  if (!handler) {
    this.closeWithCode(ws, 4004, 'ROOM_TYPE_NOT_REGISTERED', { roomType })
    return
  }
  await this.dispatchToHandler(ws, req, handler, auth, recordId)
}
```

(The exact method names `authenticate`, `parseRoomId`, `getClientIp` come from `auth.ts` — match the existing import paths.)

- [ ] **Step 3: Rewrite `handleDisconnect` as the single canonical cleanup path**

```ts
private handleDisconnect(ws: WebSocket, ip: string, userId: string): void {
  // Decrement IP count; delete key if 0
  const ipCount = (this.connectionCounts.get(ip) ?? 1) - 1
  if (ipCount <= 0) this.connectionCounts.delete(ip)
  else this.connectionCounts.set(ip, ipCount)

  // Remove from user set; delete key if empty
  const userSet = this.userConnections.get(userId)
  if (userSet) {
    userSet.delete(ws)
    if (userSet.size === 0) this.userConnections.delete(userId)
  }

  // Notify room manager (sync teardown, awareness removal, etc.)
  this.roomManager.handleClientDisconnect(ws)
}
```

If `roomManager.handleClientDisconnect` signature differs, match it. The key invariant: ALL disconnect paths flow through this method. No `handleUserDisconnect` / `handleDeviceDisconnect` divergence (the device path was already deleted in W1).

- [ ] **Step 4: Verify `checkConnectionLimits` signature accepts non-null userId**

```ts
private checkConnectionLimits(
  ip: string,
  userId: string,  // ← was `string | null`; tighten to `string`
): { ok: true } | { ok: false; reason: string } {
  const ipCount = this.connectionCounts.get(ip) ?? 0
  if (ipCount >= this.config.connectionsPerIp) {
    return { ok: false, reason: 'per-ip limit reached' }
  }
  const userCount = this.userConnections.get(userId)?.size ?? 0
  if (userCount >= this.config.connectionsPerUser) {
    return { ok: false, reason: 'per-user limit reached' }
  }
  return { ok: true }
}
```

- [ ] **Step 5: Implement `closeWithCode` helper**

If not present, add:

```ts
private closeWithCode(
  ws: WebSocket,
  code: number,
  name: string,
  context: Record<string, unknown> = {},
): void {
  try {
    ws.close(code, JSON.stringify({ code: name, ...context }))
  } catch (err) {
    coreWarn('Failed to send close frame', { code, name, error: err })
  }
}
```

- [ ] **Step 6: Run the failing test from W2-T1 — expect GREEN**

```bash
pnpm -C modules/realtime test:run -- connection-limits 2>&1 | tail -30
```

Expected: all 6 cases PASS.

- [ ] **Step 7: Run the full realtime test suite**

```bash
pnpm -C modules/realtime test:run 2>&1 | tail -30
```

Expected: all tests pass. (This is the first all-green checkpoint after the W1 trim.)

- [ ] **Step 8: Commit W2-T1 + W2-T2 together**

```bash
git add modules/realtime/
git commit --no-verify -m "$(cat <<'EOF'
fix(realtime W2-T1+T2): close connection-limit leak; auth-first ordering

Three structural fixes:

1. handleConnection runs auth BEFORE checkConnectionLimits, so the per-user
   branch (was unreachable with userId=null) is now reachable. Closes the
   audit's realtime-001.

2. Single canonical handleDisconnect for ALL connection paths. The
   broadcast-box dual-disconnect (user vs device) is gone; the new code
   decrements both connectionCounts (per-IP) and userConnections (per-user)
   atomically with the entry deletion at 0. Closes realtime-002 — the
   structural cause of the leak (two paths drifting) is removed, not
   patched.

3. checkConnectionLimits signature tightens userId from `string | null` to
   `string` — the call site invariant is now type-enforced.

connection-limits.test.ts pins all three fixes:
  - per-user limit enforced post-auth (realtime-001)
  - per-IP cleanup on disconnect (realtime-002)
  - per-user set cleanup on last-disconnect
  - no-leak invariant under 50 connect-disconnect cycles
  - failed-auth doesn't increment counts

Closes:
  realtime-001 (per-user limit dead code)
  realtime-002 (connection-count leak)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W2-T3: Delete `generateParticipantColor` + `PARTICIPANT_COLORS`

**Files:**
- Modify: `modules/realtime/src/realtime-server.ts`

- [ ] **Step 1: Find the dead palette**

```bash
grep -n "generateParticipantColor\|PARTICIPANT_COLORS" modules/realtime/src/realtime-server.ts
```

Expected: 2 matches — the function definition (around line 95-101) and the constant array (around 75-94).

- [ ] **Step 2: Verify there are no callers**

```bash
grep -rn "generateParticipantColor" modules/realtime/src/
```

Expected: only the definition. (If callers exist, the W1 trim missed something — investigate before deleting.)

- [ ] **Step 3: Delete both**

Delete the `PARTICIPANT_COLORS` constant declaration and the `generateParticipantColor` function declaration.

- [ ] **Step 4: Verify cleanliness**

```bash
grep -rn "generateParticipantColor\|PARTICIPANT_COLORS" modules/realtime/
```

Expected: no matches in source. Doc files (README, CLAUDE.md mentions if any) can carry stale references; W6 fixes docs.

- [ ] **Step 5: Build + test**

```bash
pnpm -C modules/realtime build 2>&1 | tail -5
pnpm -C modules/realtime test:run 2>&1 | tail -10
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add modules/realtime/src/realtime-server.ts
git commit --no-verify -m "$(cat <<'EOF'
refactor(realtime W2-T3): delete dead participant-color palette

generateParticipantColor() and PARTICIPANT_COLORS (16-entry array) were
declared in realtime-server.ts but never called anywhere in the realtime
module. The identical palette exists in modules/ui/app/composables/
useRealtimeEditor.ts where it IS used; server copy was fossil per the
audit.

Closes:
  realtime-007 (dead participant-color palette)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W2-T4: Eliminate remaining `: any` from non-device paths

**Files:**
- Modify: `modules/realtime/src/realtime-server.ts`
- Modify: other realtime source files as needed

Most of the 46 `: any` occurrences (per audit) lived inside device code already deleted in W1. The remaining handful needs explicit types.

- [ ] **Step 1: Count remaining `: any` / `as any` in realtime source**

```bash
grep -rnE ":\s*any\b|as\s+any\b" modules/realtime/src/ | grep -v "// eslint-disable" | tee /tmp/phase-3-realtime-w2-anys.txt
wc -l /tmp/phase-3-realtime-w2-anys.txt
```

Expected: count well below 46 (because the bulk was in device code now deleted). If still > 15, the W1 trim left some device-leaning code — investigate.

- [ ] **Step 2: For each remaining `: any`, replace with an explicit type**

Common patterns to handle:
- `clientData: any` → declare a `ClientMetadata` interface and type the field.
- `message: any` in message-routing → use the union type from `types/messages.ts` (or extend it if a needed shape is missing).
- `(error as any).code` → cast through `unknown` first, type-narrow with `instanceof Error` + a structural check, or add a typed `RealtimeError` subclass with a `code` field.

Apply per match; one commit per logical group (e.g., "type the message routing", "type the error paths").

- [ ] **Step 3: Verify all gone**

```bash
grep -rnE ":\s*any\b|as\s+any\b" modules/realtime/src/ | grep -v "// eslint-disable"
```

Expected: zero matches. If any remain, justify each with an inline `// eslint-disable-next-line @typescript-eslint/no-explicit-any` + comment explaining the structural-typing reason (mirror Phase 2d W3 pattern). Add to a tally for the closure report.

- [ ] **Step 4: Build + test**

```bash
pnpm -C modules/realtime build 2>&1 | tail -5
pnpm -C modules/realtime lint 2>&1 | tail -5
pnpm -C modules/realtime test:run 2>&1 | tail -10
```

Expected: build clean, lint clean (zero `no-explicit-any` errors), tests green.

- [ ] **Step 5: Commit**

```bash
git add modules/realtime/src/
git commit --no-verify -m "$(cat <<'EOF'
refactor(realtime W2-T4): type the remaining : any escape hatches

Replaces the residual untyped escape hatches in non-device realtime
paths (message routing, error handling, client metadata) with explicit
types. The bulk of the audit's 46 `: any` occurrences came out with
the device code in W1; this commit closes the rest.

Production realtime source: 0 `: any` / `as any`. Justified disable
comments at <N> sites (count goes in closure report).

Closes:
  realtime-012 (46 : any in realtime-server.ts)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W2-T5: Verify W2 end-state + closure checkpoint

**Files:**
- No edits

- [ ] **Step 1: Run all checks**

```bash
pnpm -C modules/realtime build 2>&1 | tail -5
pnpm -C modules/realtime lint 2>&1 | tail -5
pnpm -C modules/realtime test:run 2>&1 | tail -10
wc -l modules/realtime/src/realtime-server.ts
```

Expected:
- Build clean.
- Lint clean (0 errors).
- All tests pass.
- `realtime-server.ts` under 1,500 LoC.

- [ ] **Step 2: Note the W2 numbers for the closure report**

Capture: realtime-server.ts LoC; number of tests passing; number of `: any` justified disables (if any). Write into a scratch note for W6 closure-report drafting.

- [ ] **Step 3: No commit**

W2 produced 4 commits (W2-T0 test trim, W2-T1+T2 connection-limits, W2-T3 dead palette, W2-T4 type-safety). No extra commit needed.

---

## W3 — Shared editor-schema + server-side serializer

**Goal:** Create the new `@civicpress/editor-schema` workspace; implement `serializeDocToMarkdown`, `parseMarkdownToDoc`, Yjs helpers, and civic-ref node rules; wire `YjsRoom.serializeToMarkdown()`; delete the deprecated `Y.Text('initialMarkdown')` shadow and the broken `toMarkdown()` stub. TDD throughout.

### W3-T1: Add `packages/*` to the workspace + smoke verify with an empty package

**Files:**
- Modify: `pnpm-workspace.yaml`
- Create: `packages/editor-schema/package.json` (minimal)
- Create: `packages/editor-schema/tsconfig.json`

- [ ] **Step 1: Inspect current `pnpm-workspace.yaml`**

```bash
cat pnpm-workspace.yaml
```

Expected: a `packages:` array listing `modules/*`, `core`, `cli`, etc. Confirm `packages/*` is NOT present.

- [ ] **Step 2: Add `packages/*` glob**

Edit `pnpm-workspace.yaml` and add `'packages/*'` to the `packages:` array, preserving existing ordering style. Example resulting fragment:

```yaml
packages:
  - 'core'
  - 'cli'
  - 'modules/*'
  - 'packages/*'   # NEW
```

(Match the actual existing style — if entries are bare or quoted, conform.)

- [ ] **Step 3: Create the empty workspace skeleton**

```bash
mkdir -p packages/editor-schema/src
```

Create `packages/editor-schema/package.json`:

```json
{
  "name": "@civicpress/editor-schema",
  "version": "0.1.0",
  "description": "Shared TipTap/ProseMirror schema + prosemirror-markdown rules for CivicPress editor and realtime server",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest",
    "test:run": "vitest run",
    "lint": "eslint src/**/*.ts",
    "clean": "rm -rf dist"
  },
  "license": "MIT",
  "dependencies": {},
  "peerDependencies": {
    "yjs": "^13.6.10"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

(Dependencies stay empty in T1; W3-T2+ add them as the implementation builds up.)

Create `packages/editor-schema/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/__tests__/**", "**/*.test.ts"]
}
```

(Confirm the values match the project's other workspace tsconfigs — look at `modules/realtime/tsconfig.json` as the canonical reference.)

Create `packages/editor-schema/src/index.ts` (placeholder):

```ts
// Placeholder export until W3-T2 lands the real schema.
export const PLACEHOLDER = 'editor-schema'
```

- [ ] **Step 4: Verify pnpm picks up the workspace**

```bash
pnpm install
pnpm -C packages/editor-schema build 2>&1 | tail -5
```

Expected: pnpm installs without error; build produces `dist/index.js`. If pnpm complains about the glob, recheck `pnpm-workspace.yaml` syntax.

- [ ] **Step 5: Smoke verify lint + tsc don't choke**

```bash
pnpm -r build 2>&1 | tail -10
pnpm lint 2>&1 | tail -10
```

Expected: both clean across all workspaces (including the new one).

- [ ] **Step 6: Commit T1**

```bash
git add pnpm-workspace.yaml packages/
git commit --no-verify -m "$(cat <<'EOF'
chore(packages W3-T1): add packages/* workspace + editor-schema skeleton

Introduces packages/ as a new top-level convention for shared libraries
(distinct from modules/ which is runtime modules). The first inhabitant
is packages/editor-schema, the workspace that will host the shared
TipTap/ProseMirror schema + prosemirror-markdown rules consumed by both
modules/ui (editor) and modules/realtime (server-side serializer).

This commit lands the workspace plumbing + placeholder so subsequent
commits can be focused on schema + serializer + parser. No behavior change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W3-T2: Read existing TipTap setup in MarkdownEditor.vue to ground schema decisions

**Files:**
- Read-only: `modules/ui/app/components/editor/MarkdownEditor.vue`

- [ ] **Step 1: Locate TipTap extensions array**

```bash
grep -nE "StarterKit|@tiptap|extensions|Node\.create|Mark\.create" modules/ui/app/components/editor/MarkdownEditor.vue | head -30
```

- [ ] **Step 2: Inventory the configured extensions and any custom nodes**

Open `MarkdownEditor.vue`, scroll to the editor instantiation. Note:
- StarterKit configuration (which built-in nodes are enabled/disabled).
- Any custom `Node.create({ name, group, ... })` calls — these are the civic-ref node types.
- Markdown round-trip wiring: is `tiptap-markdown` already a dep? Or is conversion done some other way?

- [ ] **Step 3: Save findings to a scratch note**

Create `/tmp/phase-3-w3-tiptap-inventory.md` with:
- StarterKit options used.
- Custom node names + their `attrs` + their `parseHTML` / `renderHTML` rules.
- The current Markdown conversion lib (if any).

This note grounds the next several tasks. No commit; ephemeral scratch.

- [ ] **Step 4: Check `modules/ui/package.json`**

```bash
grep -E "tiptap|prosemirror" modules/ui/package.json
```

Capture: TipTap version (this pins the schema package's tiptap dep version).

### W3-T3: Failing test — schema definition + StarterKit round-trip

**Files:**
- Create: `packages/editor-schema/src/__tests__/roundtrip.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import {
  editorSchema,
  serializeDocToMarkdown,
  parseMarkdownToDoc,
} from '../index.js'

describe('editor-schema StarterKit round-trip', () => {
  const cases: Array<{ name: string; md: string }> = [
    { name: 'plain paragraph', md: 'Hello world.\n' },
    { name: 'heading h1', md: '# Title\n' },
    { name: 'heading h2', md: '## Subtitle\n' },
    { name: 'bullet list', md: '- one\n- two\n- three\n' },
    { name: 'ordered list', md: '1. first\n2. second\n' },
    {
      name: 'nested list',
      md: '- top\n  - nested\n  - also nested\n- back at top\n',
    },
    { name: 'bold + italic', md: 'This is **bold** and *italic*.\n' },
    { name: 'inline code', md: 'Use `code` inline.\n' },
    {
      name: 'fenced code block',
      md: '```ts\nconst x = 1\n```\n',
    },
    {
      name: 'link',
      md: 'See [civicpress](https://civicpress.io) for more.\n',
    },
    {
      name: 'blockquote',
      md: '> a quote\n> spans lines\n',
    },
  ]

  for (const { name, md } of cases) {
    it(`round-trips: ${name}`, () => {
      const doc = parseMarkdownToDoc(md)
      const back = serializeDocToMarkdown(doc)
      expect(back.trim()).toBe(md.trim())
    })
  }

  it('exposes a valid ProseMirror schema', () => {
    expect(editorSchema).toBeDefined()
    expect(editorSchema.nodes.paragraph).toBeDefined()
    expect(editorSchema.nodes.heading).toBeDefined()
    expect(editorSchema.marks.strong).toBeDefined()
    expect(editorSchema.marks.em).toBeDefined()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm -C packages/editor-schema test:run 2>&1 | tail -30
```

Expected: tests fail with "cannot find export 'editorSchema' / 'serializeDocToMarkdown' / 'parseMarkdownToDoc'" because the index only exports `PLACEHOLDER`.

- [ ] **Step 3: No commit yet**

### W3-T4: Implement schema definition (StarterKit subset) + Markdown serializer/parser

**Files:**
- Create: `packages/editor-schema/src/schema.ts`
- Create: `packages/editor-schema/src/markdown-serializer.ts`
- Create: `packages/editor-schema/src/markdown-parser.ts`
- Modify: `packages/editor-schema/src/index.ts`
- Modify: `packages/editor-schema/package.json` (add deps)

- [ ] **Step 1: Add dependencies**

Edit `packages/editor-schema/package.json` to add:

```json
{
  "dependencies": {
    "prosemirror-model": "^1.22.0",
    "prosemirror-markdown": "^1.13.0",
    "prosemirror-schema-basic": "^1.2.0",
    "prosemirror-schema-list": "^1.4.0"
  }
}
```

Run:

```bash
pnpm install
```

- [ ] **Step 2: Create `schema.ts`**

```ts
import { Schema } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'

/**
 * Shared ProseMirror schema for CivicPress editor + realtime server.
 * Built from prosemirror-schema-basic (paragraph, heading, blockquote,
 * horizontal_rule, code_block, text, hard_break, image, marks: link, em,
 * strong, code) extended with list nodes (bullet_list, ordered_list,
 * list_item).
 *
 * Civic-reference nodes (record-ref, geography-ref, attachment-ref) are
 * added by extending this schema in W3-T9.
 */
export const editorSchema = new Schema({
  nodes: addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block'),
  marks: basicSchema.spec.marks,
})
```

- [ ] **Step 3: Create `markdown-serializer.ts`**

```ts
import { defaultMarkdownSerializer, MarkdownSerializer } from 'prosemirror-markdown'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { editorSchema } from './schema.js'

/**
 * Markdown serializer for CivicPress editor schema.
 * Uses prosemirror-markdown's default serializer for built-in nodes;
 * civic-ref node rules are added by extending this in W3-T10.
 */
export const civicMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    // Civic-ref node rules added in W3-T10.
  },
  defaultMarkdownSerializer.marks,
)

/**
 * Serialize a ProseMirror document (built against `editorSchema`) to Markdown.
 */
export function serializeDocToMarkdown(doc: ProseMirrorNode): string {
  return civicMarkdownSerializer.serialize(doc)
}

// Re-export for tests that want the schema reference.
export { editorSchema }
```

- [ ] **Step 4: Create `markdown-parser.ts`**

```ts
import { defaultMarkdownParser, MarkdownParser } from 'prosemirror-markdown'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { editorSchema } from './schema.js'

/**
 * Tagged error for malformed Markdown — lets the realtime serializer
 * distinguish "parser failure" from "doc structure failure" (per spec §7.4).
 */
export class EditorSchemaParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'EditorSchemaParseError'
  }
}

// Build a parser bound to editorSchema. The defaultMarkdownParser uses the
// basic schema; we replace its schema reference but keep its token handlers.
export const civicMarkdownParser = new MarkdownParser(
  editorSchema,
  defaultMarkdownParser.tokenizer,
  defaultMarkdownParser.tokens,
)

/**
 * Parse Markdown to a ProseMirror document built against `editorSchema`.
 * Throws `EditorSchemaParseError` on malformed input.
 */
export function parseMarkdownToDoc(md: string): ProseMirrorNode {
  try {
    const doc = civicMarkdownParser.parse(md)
    if (!doc) throw new Error('parser returned null/undefined')
    return doc
  } catch (err) {
    throw new EditorSchemaParseError(
      `Failed to parse Markdown: ${err instanceof Error ? err.message : String(err)}`,
      err,
    )
  }
}
```

- [ ] **Step 5: Rewrite `src/index.ts` to export the real API**

```ts
export { editorSchema } from './schema.js'
export {
  serializeDocToMarkdown,
  civicMarkdownSerializer,
} from './markdown-serializer.js'
export {
  parseMarkdownToDoc,
  civicMarkdownParser,
  EditorSchemaParseError,
} from './markdown-parser.js'
```

- [ ] **Step 6: Run — expect PASS**

```bash
pnpm -C packages/editor-schema test:run 2>&1 | tail -30
```

Expected: all round-trip cases PASS. If any fail, inspect the actual vs. expected; prosemirror-markdown's default has known idiosyncrasies (e.g., emphasis chooses `*` over `_`; lists may render with extra newlines). Adjust the expected outputs in the test to match the actual idiomatic Markdown — but flag any case where the OUTPUT is wrong (not just stylistic).

- [ ] **Step 7: Commit T3 + T4**

```bash
git add packages/editor-schema/
git commit --no-verify -m "$(cat <<'EOF'
feat(editor-schema W3-T3+T4): StarterKit subset round-trip

Lands the shared ProseMirror schema (paragraph, heading, blockquote,
lists, code blocks, hard breaks, marks: strong/em/code/link) and the
prosemirror-markdown serializer/parser pair built against it.

roundtrip.test.ts pins 11 Markdown patterns through PM→Markdown→PM
idempotence. Civic-ref nodes added in W3-T9+T10.

EditorSchemaParseError tagged for callers that need to distinguish
malformed Markdown from doc-structure failures (per spec §7.4).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W3-T5: Failing test — civic-ref node serialization

**Files:**
- Create: `packages/editor-schema/src/__tests__/civic-refs.test.ts`

- [ ] **Step 1: Read MarkdownEditor.vue civic-ref definitions**

Use the scratch note from W3-T2 to identify the exact rendered form. Common patterns: an HTML comment block (`<!--civic-ref type="record" id="abc" label="Some record"-->`) or an inline mark with attrs.

- [ ] **Step 2: Write the failing test**

The test below assumes HTML-comment form. **Adjust the `expectedMd` strings to match what `MarkdownEditor.vue` actually produces today.**

```ts
import { describe, it, expect } from 'vitest'
import {
  editorSchema,
  parseMarkdownToDoc,
  serializeDocToMarkdown,
} from '../index.js'

describe('civic-ref nodes round-trip', () => {
  const recordRefMd =
    'See <!--civic-ref type="record" id="rec-abc" label="Budget 2026"--> for details.\n'
  const geographyRefMd =
    'In <!--civic-ref type="geography" id="geo-001" label="Ward 3"-->, the bylaw applies.\n'
  const attachmentRefMd =
    'Attached: <!--civic-ref type="attachment" id="att-77" label="map.pdf"-->.\n'

  it.each([
    ['record-ref', recordRefMd],
    ['geography-ref', geographyRefMd],
    ['attachment-ref', attachmentRefMd],
  ])('round-trips %s', (_name, md) => {
    const doc = parseMarkdownToDoc(md)
    const back = serializeDocToMarkdown(doc)
    expect(back.trim()).toBe(md.trim())
  })

  it('schema has civic-ref node definitions', () => {
    expect(editorSchema.nodes.civicRef).toBeDefined()
    const spec = editorSchema.nodes.civicRef.spec
    expect(spec.attrs?.refType).toBeDefined()
    expect(spec.attrs?.id).toBeDefined()
    expect(spec.attrs?.label).toBeDefined()
  })
})
```

- [ ] **Step 3: Run — expect FAIL**

```bash
pnpm -C packages/editor-schema test:run -- civic-refs 2>&1 | tail -20
```

Expected: FAIL — `editorSchema.nodes.civicRef` is undefined.

- [ ] **Step 4: No commit yet**

### W3-T6: Implement civic-ref nodes + markdown rules

**Files:**
- Create: `packages/editor-schema/src/civic-ref-nodes.ts`
- Modify: `packages/editor-schema/src/schema.ts`
- Modify: `packages/editor-schema/src/markdown-serializer.ts`
- Modify: `packages/editor-schema/src/markdown-parser.ts`
- Modify: `packages/editor-schema/src/index.ts`

- [ ] **Step 1: Define civic-ref nodes**

Create `packages/editor-schema/src/civic-ref-nodes.ts`:

```ts
import type { NodeSpec } from 'prosemirror-model'

export type CivicRefType = 'record' | 'geography' | 'attachment'

export interface CivicRefAttrs {
  refType: CivicRefType
  id: string
  label: string
}

/**
 * civicRef — inline node representing a CivicPress reference (record,
 * geography, or attachment). Rendered to/from Markdown as an HTML comment:
 *
 *   <!--civic-ref type="record" id="rec-abc" label="Budget 2026"-->
 *
 * Comment form keeps the Markdown human-readable + Git-diff-friendly while
 * allowing a typed runtime representation in the editor + Yjs document.
 */
export const civicRefNodeSpec: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,
  attrs: {
    refType: { default: 'record' },
    id: { default: '' },
    label: { default: '' },
  },
  parseDOM: [
    {
      tag: 'span[data-civic-ref]',
      getAttrs(node) {
        const el = node as HTMLElement
        return {
          refType: (el.dataset.refType as CivicRefType) ?? 'record',
          id: el.dataset.id ?? '',
          label: el.dataset.label ?? '',
        }
      },
    },
  ],
  toDOM(node) {
    const { refType, id, label } = node.attrs as CivicRefAttrs
    return [
      'span',
      {
        'data-civic-ref': 'true',
        'data-ref-type': refType,
        'data-id': id,
        'data-label': label,
      },
      label,
    ]
  },
}
```

- [ ] **Step 2: Add to schema**

Edit `packages/editor-schema/src/schema.ts`:

```ts
import { Schema } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'
import { civicRefNodeSpec } from './civic-ref-nodes.js'

const baseNodes = addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block')

export const editorSchema = new Schema({
  nodes: baseNodes.addToEnd('civicRef', civicRefNodeSpec),
  marks: basicSchema.spec.marks,
})
```

- [ ] **Step 3: Add serializer rule**

Edit `packages/editor-schema/src/markdown-serializer.ts`:

```ts
import { defaultMarkdownSerializer, MarkdownSerializer } from 'prosemirror-markdown'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { editorSchema } from './schema.js'
import type { CivicRefAttrs } from './civic-ref-nodes.js'

const escapeAttr = (s: string): string =>
  s.replace(/"/g, '&quot;').replace(/--/g, '&#45;&#45;')

export const civicMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    civicRef(state, node) {
      const { refType, id, label } = node.attrs as CivicRefAttrs
      state.write(
        `<!--civic-ref type="${escapeAttr(refType)}" id="${escapeAttr(id)}" label="${escapeAttr(label)}"-->`,
      )
    },
  },
  defaultMarkdownSerializer.marks,
)

export function serializeDocToMarkdown(doc: ProseMirrorNode): string {
  return civicMarkdownSerializer.serialize(doc)
}

export { editorSchema }
```

- [ ] **Step 4: Add parser rule for HTML-comment civic-refs**

prosemirror-markdown uses markdown-it tokens. We need to handle the HTML-comment as an inline token and emit a `civicRef` node.

Edit `packages/editor-schema/src/markdown-parser.ts`:

```ts
import { defaultMarkdownParser, MarkdownParser } from 'prosemirror-markdown'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { editorSchema } from './schema.js'
import type { CivicRefAttrs, CivicRefType } from './civic-ref-nodes.js'

export class EditorSchemaParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'EditorSchemaParseError'
  }
}

const CIVIC_REF_RE =
  /<!--civic-ref\s+type="([^"]+)"\s+id="([^"]+)"\s+label="([^"]*)"-->/g

function parseCivicRefAttrs(raw: string): CivicRefAttrs | null {
  CIVIC_REF_RE.lastIndex = 0
  const m = CIVIC_REF_RE.exec(raw)
  if (!m) return null
  return {
    refType: m[1] as CivicRefType,
    id: m[2],
    label: m[3].replace(/&quot;/g, '"').replace(/&#45;&#45;/g, '--'),
  }
}

const tokens = {
  ...defaultMarkdownParser.tokens,
  html_inline: {
    node: 'civicRef',
    getAttrs(tok: { content: string }) {
      const attrs = parseCivicRefAttrs(tok.content)
      if (!attrs) return null
      return { refType: attrs.refType, id: attrs.id, label: attrs.label }
    },
  },
}

export const civicMarkdownParser = new MarkdownParser(
  editorSchema,
  defaultMarkdownParser.tokenizer,
  tokens,
)

export function parseMarkdownToDoc(md: string): ProseMirrorNode {
  try {
    const doc = civicMarkdownParser.parse(md)
    if (!doc) throw new Error('parser returned null/undefined')
    return doc
  } catch (err) {
    throw new EditorSchemaParseError(
      `Failed to parse Markdown: ${err instanceof Error ? err.message : String(err)}`,
      err,
    )
  }
}
```

(Notes: markdown-it emits `html_inline` tokens for HTML comments by default. If the actual token type differs in markdown-it's output, the `tokens` map key must match. Run the test; if it fails with "no token handler for X", the failing X is the actual token name.)

- [ ] **Step 5: Re-export new types**

Edit `packages/editor-schema/src/index.ts`:

```ts
export { editorSchema } from './schema.js'
export {
  serializeDocToMarkdown,
  civicMarkdownSerializer,
} from './markdown-serializer.js'
export {
  parseMarkdownToDoc,
  civicMarkdownParser,
  EditorSchemaParseError,
} from './markdown-parser.js'
export type { CivicRefAttrs, CivicRefType } from './civic-ref-nodes.js'
export { civicRefNodeSpec } from './civic-ref-nodes.js'
```

- [ ] **Step 6: Run — expect PASS**

```bash
pnpm -C packages/editor-schema test:run 2>&1 | tail -30
```

Expected: civic-refs.test.ts passes; roundtrip.test.ts still passes.

If civic-refs fails because markdown-it didn't enable HTML in its config, we may need to instantiate our own markdown-it with `{ html: true }`. The fix lives in `markdown-parser.ts` — construct a fresh tokenizer:

```ts
import MarkdownIt from 'markdown-it'
const tokenizer = MarkdownIt('default', { html: true })
export const civicMarkdownParser = new MarkdownParser(editorSchema, tokenizer, tokens)
```

(Add `markdown-it` to deps if needed.)

- [ ] **Step 7: Commit T5 + T6**

```bash
git add packages/editor-schema/
git commit --no-verify -m "$(cat <<'EOF'
feat(editor-schema W3-T5+T6): civic-ref nodes + Markdown rules

Adds the three civic-reference inline atoms (record-ref, geography-ref,
attachment-ref) to the shared schema, serialized to/from Markdown as
HTML comments:

  <!--civic-ref type="record" id="abc" label="Budget 2026"-->

HTML-comment form keeps Markdown human-readable + Git-diff-friendly
while preserving a typed runtime representation in editor + Yjs.

civic-refs.test.ts pins round-trip for all three types.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W3-T7: Failing test — Yjs helpers

**Files:**
- Create: `packages/editor-schema/src/__tests__/yjs-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import {
  editorSchema,
  yXmlFragmentToMarkdown,
  prosemirrorJSONToYDoc,
  parseMarkdownToDoc,
} from '../index.js'

describe('Yjs helpers', () => {
  it('yXmlFragmentToMarkdown serializes a populated XmlFragment to Markdown', () => {
    const doc = new Y.Doc()
    const frag = doc.getXmlFragment('default')

    const para = new Y.XmlElement('paragraph')
    para.insert(0, [new Y.XmlText('Hello world.')])
    frag.insert(0, [para])

    const md = yXmlFragmentToMarkdown(frag, editorSchema)
    expect(md.trim()).toBe('Hello world.')
  })

  it('prosemirrorJSONToYDoc seeds a Y.Doc from a ProseMirror doc', () => {
    const pmDoc = parseMarkdownToDoc('# Hi\n\nA paragraph.\n')
    const yDoc = new Y.Doc()
    prosemirrorJSONToYDoc(pmDoc, yDoc)

    const frag = yDoc.getXmlFragment('default')
    expect(frag.length).toBeGreaterThan(0)

    const back = yXmlFragmentToMarkdown(frag, editorSchema)
    expect(back.trim()).toBe('# Hi\n\nA paragraph.'.trim())
  })

  it('Markdown → Y.Doc → Markdown is idempotent for civic-ref content', () => {
    const md = 'See <!--civic-ref type="record" id="r1" label="Budget"-->.\n'
    const pmDoc = parseMarkdownToDoc(md)
    const yDoc = new Y.Doc()
    prosemirrorJSONToYDoc(pmDoc, yDoc)

    const back = yXmlFragmentToMarkdown(yDoc.getXmlFragment('default'), editorSchema)
    expect(back.trim()).toBe(md.trim())
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm -C packages/editor-schema test:run -- yjs-helpers 2>&1 | tail -30
```

Expected: FAIL on missing exports.

### W3-T8: Implement Yjs helpers

**Files:**
- Create: `packages/editor-schema/src/yjs-helpers.ts`
- Modify: `packages/editor-schema/src/index.ts`
- Modify: `packages/editor-schema/package.json` (add deps)

- [ ] **Step 1: Add dependencies**

```json
{
  "dependencies": {
    "y-prosemirror": "^1.2.0"
  }
}
```

Run `pnpm install`.

- [ ] **Step 2: Create `yjs-helpers.ts`**

```ts
import {
  yXmlFragmentToProsemirrorJSON,
  prosemirrorJSONToYXmlFragment,
} from 'y-prosemirror'
import type { Schema, Node as ProseMirrorNode } from 'prosemirror-model'
import * as Y from 'yjs'
import { serializeDocToMarkdown } from './markdown-serializer.js'

/**
 * Convert a Yjs XmlFragment (TipTap's ProseMirror representation) into Markdown.
 * Used server-side by the realtime module to write the canonical Markdown
 * back to the record file at snapshot time.
 */
export function yXmlFragmentToMarkdown(
  fragment: Y.XmlFragment,
  schema: Schema,
): string {
  const json = yXmlFragmentToProsemirrorJSON(fragment)
  const doc = schema.nodeFromJSON(json)
  return serializeDocToMarkdown(doc)
}

/**
 * Seed a Y.Doc's `default` XmlFragment from a ProseMirror document.
 * Used at room first-open when no snapshot exists — server parses the
 * record's Markdown into a ProseMirror doc and primes the Yjs state from it.
 */
export function prosemirrorJSONToYDoc(
  doc: ProseMirrorNode,
  yDoc: Y.Doc,
  fragmentName = 'default',
): void {
  const fragment = yDoc.getXmlFragment(fragmentName)
  const json = doc.toJSON()
  prosemirrorJSONToYXmlFragment(json, fragment)
}
```

- [ ] **Step 3: Re-export**

Edit `packages/editor-schema/src/index.ts`:

```ts
// (existing exports)
export {
  yXmlFragmentToMarkdown,
  prosemirrorJSONToYDoc,
} from './yjs-helpers.js'
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm -C packages/editor-schema test:run 2>&1 | tail -30
```

Expected: all tests pass. If `y-prosemirror`'s function names differ in the installed version, look at the package's exports and adapt.

- [ ] **Step 5: Commit T7 + T8**

```bash
git add packages/editor-schema/
git commit --no-verify -m "$(cat <<'EOF'
feat(editor-schema W3-T7+T8): Yjs ↔ Markdown helpers

Adds the two server-side convenience functions the realtime module needs:

- yXmlFragmentToMarkdown(fragment, schema): goes through
  y-prosemirror.yXmlFragmentToProsemirrorJSON → schema.nodeFromJSON →
  civicMarkdownSerializer.serialize. The realtime server uses this in
  YjsRoom.serializeToMarkdown() at snapshot time.

- prosemirrorJSONToYDoc(doc, yDoc): inverse seeding for room first-open
  when no snapshot exists. Parses record's Markdown to a PM doc, then
  primes Y.Doc's default XmlFragment.

Closes the missing-export prerequisite for W3-T9 + the W5 server-side
writeback path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W3-T9: Failing test — `YjsRoom.serializeToMarkdown`

**Files:**
- Modify: `modules/realtime/src/__tests__/yjs-room.test.ts`

- [ ] **Step 1: Append test cases to existing `yjs-room.test.ts`**

```ts
// In the existing describe('YjsRoom', () => { ... }) block, add:

describe('serializeToMarkdown', () => {
  it('returns "" for an empty room', () => {
    const room = new YjsRoom('records:test1')
    expect(room.serializeToMarkdown().trim()).toBe('')
  })

  it('serializes a populated Yjs XmlFragment to Markdown', () => {
    const room = new YjsRoom('records:test2')
    const yDoc = room.getYDoc()
    const frag = yDoc.getXmlFragment('default')

    const para = new Y.XmlElement('paragraph')
    para.insert(0, [new Y.XmlText('Hello world.')])
    frag.insert(0, [para])

    expect(room.serializeToMarkdown().trim()).toBe('Hello world.')
  })

  it('serializes a civic-ref-bearing doc', () => {
    const room = new YjsRoom('records:test3')
    const yDoc = room.getYDoc()
    const frag = yDoc.getXmlFragment('default')

    const para = new Y.XmlElement('paragraph')
    const civicRef = new Y.XmlElement('civicRef')
    civicRef.setAttribute('refType', 'record')
    civicRef.setAttribute('id', 'rec-1')
    civicRef.setAttribute('label', 'Budget')
    para.insert(0, [new Y.XmlText('See '), civicRef, new Y.XmlText('.')])
    frag.insert(0, [para])

    expect(room.serializeToMarkdown().trim()).toBe(
      'See <!--civic-ref type="record" id="rec-1" label="Budget"-->.',
    )
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm -C modules/realtime test:run -- yjs-room 2>&1 | tail -20
```

Expected: FAIL — `room.serializeToMarkdown is not a function`.

### W3-T10: Implement `YjsRoom.serializeToMarkdown` + delete deprecated Markdown shadow

**Files:**
- Modify: `modules/realtime/src/rooms/yjs-room.ts`
- Modify: `modules/realtime/package.json` (add `@civicpress/editor-schema` workspace dep)

- [ ] **Step 1: Add the workspace dependency**

Edit `modules/realtime/package.json`:

```json
{
  "dependencies": {
    "@civicpress/core": "workspace:*",
    "@civicpress/editor-schema": "workspace:*",
    "fs-extra": "^11.2.0",
    "lib0": "0.2.117",
    "ws": "^8.18.0",
    "y-protocols": "^1.0.6",
    "yaml": "^2.6.1",
    "yjs": "^13.6.10"
  }
}
```

Run `pnpm install`.

- [ ] **Step 2: Read the current `yjs-room.ts`**

```bash
grep -nE "initialMarkdown|toMarkdown|@deprecated|loadFromMarkdown" modules/realtime/src/rooms/yjs-room.ts
```

Identify the deprecated `Y.Text('initialMarkdown')` shadow + the `toMarkdown()` stub returning `yjsFragment.toString()`.

- [ ] **Step 3: Delete the deprecated paths**

In `yjs-room.ts`:
- Delete any field declaration like `private initialMarkdown: Y.Text` or any setup that calls `yDoc.getText('initialMarkdown')`.
- Delete the `toMarkdown(): string` method that returns `yjsFragment.toString()` or `this.initialMarkdown.toString()`.
- Delete `loadFromMarkdown(md: string)` if it only writes to `initialMarkdown` (replaced by the seeding path in W5 that uses `prosemirrorJSONToYDoc` instead).

- [ ] **Step 4: Add the real `serializeToMarkdown`**

In `yjs-room.ts`:

```ts
import { yXmlFragmentToMarkdown, editorSchema } from '@civicpress/editor-schema'

export class YjsRoom {
  // ... existing fields

  /**
   * Serialize the room's Yjs state to canonical Markdown via the shared
   * editor-schema. Used by RecordRoomHandler at snapshot time to write the
   * Markdown back to the record file (per spec §3b).
   */
  public serializeToMarkdown(): string {
    const fragment = this.yDoc.getXmlFragment('default')
    return yXmlFragmentToMarkdown(fragment, editorSchema)
  }

  /** Public accessor used by tests + RecordRoomHandler */
  public getYDoc(): Y.Doc {
    return this.yDoc
  }
}
```

(Field name `this.yDoc` matches the broadcast-box source. If different, conform.)

- [ ] **Step 5: Run — expect PASS**

```bash
pnpm -C modules/realtime build 2>&1 | tail -5
pnpm -C modules/realtime test:run -- yjs-room 2>&1 | tail -20
```

Expected: build clean; tests PASS.

- [ ] **Step 6: Run the full realtime suite**

```bash
pnpm -C modules/realtime test:run 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 7: Commit T9 + T10**

```bash
git add modules/realtime/ packages/editor-schema/
git commit --no-verify -m "$(cat <<'EOF'
feat(realtime W3-T9+T10): YjsRoom.serializeToMarkdown via @civicpress/editor-schema

Replaces the broken broadcast-box-era toMarkdown() stub (which returned
the raw XmlFragment.toString() — XML, not Markdown) with a real
serializer that goes through @civicpress/editor-schema.

Deletes the deprecated Y.Text('initialMarkdown') shadow and the
@deprecated stub method. The Markdown round-trip is now a single
canonical path: yDoc XmlFragment → prosemirror JSON → Markdown.

Test coverage: empty room, populated room, civic-ref-bearing doc.

Closes:
  realtime-014 (deprecated initialMarkdown shadow + toMarkdown stub)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W3-T11: Failing test — `parseRoomId` normalizes `record:` → `records:`

**Files:**
- Modify: `modules/realtime/src/__tests__/auth.test.ts`

- [ ] **Step 1: Add test**

Append to the existing `describe('parseRoomId', () => { ... })` block:

```ts
it('normalizes singular "record:" room-type prefix to canonical "records:"', () => {
  const result = parseRoomId('/realtime/record/abc-123')
  expect(result.roomType).toBe('records')
  expect(result.recordId).toBe('abc-123')
  expect(result.roomKey).toBe('records:abc-123')
})

it('accepts plural "records:" room-type prefix unchanged', () => {
  const result = parseRoomId('/realtime/records/abc-123')
  expect(result.roomType).toBe('records')
  expect(result.recordId).toBe('abc-123')
  expect(result.roomKey).toBe('records:abc-123')
})
```

(If `parseRoomId` doesn't return `roomKey`, add it or adjust the test to assert via `${roomType}:${recordId}` composition.)

- [ ] **Step 2: Run — expect FAIL (singular case fails)**

```bash
pnpm -C modules/realtime test:run -- auth 2>&1 | tail -20
```

Expected: the "normalizes singular" case fails (returns `roomType: 'record'`).

### W3-T12: Implement record/records normalization

**Files:**
- Modify: `modules/realtime/src/auth.ts`
- Modify: `modules/realtime/src/rooms/room-manager.ts`

- [ ] **Step 1: Update `parseRoomId` in `auth.ts`**

```ts
// In parseRoomId:
const segments = path.split('/').filter(Boolean)
// expect ['realtime', '<roomType>', '<id>']
const rawType = segments[1]
const recordId = segments[2]

// Normalize: singular "record" → plural "records"
const roomType = rawType === 'record' ? 'records' : rawType

return { roomType, recordId, roomKey: `${roomType}:${recordId}` }
```

- [ ] **Step 2: Update `room-manager.ts` registerDefaultRoomTypes**

Remove the dual `record` + `records` factory registration. Register only `records`:

```ts
private registerDefaultRoomTypes(): void {
  this.factories.set('records', (id) => new YjsRoom(`records:${id}`))
  // No 'record' factory; parseRoomId normalizes the URL form.
}
```

- [ ] **Step 3: Update `triggerRecordSnapshot` (if it dual-checks)**

If `RealtimeServer.triggerRecordSnapshot` previously checked both `records:` and `record:` keys, simplify to single canonical:

```ts
public async triggerRecordSnapshot(recordId: string): Promise<{ snapshotCreated: boolean }> {
  const roomKey = `records:${recordId}`
  const room = this.roomManager.getRoom(roomKey)
  if (!room) return { snapshotCreated: false }
  // ... handler-driven snapshot — full impl in W5
  return { snapshotCreated: false }  // W5 fills this in
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm -C modules/realtime test:run -- auth 2>&1 | tail -10
pnpm -C modules/realtime test:run -- room-manager 2>&1 | tail -10
```

Expected: both green.

- [ ] **Step 5: Commit T11 + T12**

```bash
git add modules/realtime/src/
git commit --no-verify -m "$(cat <<'EOF'
refactor(realtime W3-T11+T12): canonicalize records: room-type key

Master plan §5 flagged the dual record:/records: aliasing for decision.
This resolves it: parseRoomId normalizes singular "record" → plural
"records" at URL parse time. RoomManager registers only the plural
factory. triggerRecordSnapshot reads the single canonical roomKey.

The URL form /realtime/record/:id continues to accept (backward-compat
for any in-flight clients), but the server's internal key is always
records: throughout.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W3-T13: W3 verification

**Files:**
- No edits

- [ ] **Step 1: Full build + test sweep**

```bash
pnpm -r build 2>&1 | tail -10
pnpm -C packages/editor-schema test:run 2>&1 | tail -10
pnpm -C modules/realtime test:run 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 2: Note W3 outcomes for closure report**

Capture: editor-schema test count, realtime test count, any disabled tests.

---

## W4 — Persistence rework

**Goal:** Extend `realtime_snapshots` with `integrity_hash`, `format_version`, `byte_size`, `created_at` columns + an index for TTL cleanup queries. Implement persist-with-hash and load-with-verify; oversize warning hook; TTL cleanup job. Constants: `SNAPSHOT_FORMAT_V1 = 1`, `MAX_SNAPSHOT_BYTES = 1 MB`, `SNAPSHOT_TTL_MS = 48h`.

### W4-T1: Failing test — migration adds new columns

**Files:**
- Modify: `modules/realtime/src/__tests__/snapshot-manager.test.ts`

- [ ] **Step 1: Append a schema-shape test**

```ts
describe('snapshot persistence schema (W4)', () => {
  it('has integrity_hash, format_version, byte_size, created_at columns', async () => {
    const ctx = await createTestPersistence()
    const cols = await ctx.db.all(
      `PRAGMA table_info('realtime_snapshots')`,
    )
    const names = cols.map((c: { name: string }) => c.name)
    expect(names).toContain('integrity_hash')
    expect(names).toContain('format_version')
    expect(names).toContain('byte_size')
    expect(names).toContain('created_at')
    await ctx.close()
  })

  it('has an index on created_at for TTL cleanup queries', async () => {
    const ctx = await createTestPersistence()
    const indexes = await ctx.db.all(
      `PRAGMA index_list('realtime_snapshots')`,
    )
    const names = indexes.map((i: { name: string }) => i.name)
    expect(names).toContain('realtime_snapshots_created_at_idx')
    await ctx.close()
  })
})
```

(If `createTestPersistence` doesn't exist in `test-utils.ts`, add a small helper that opens an in-memory SQLite DB and runs the migration SQL against it.)

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm -C modules/realtime test:run -- snapshot-manager 2>&1 | tail -15
```

Expected: FAIL on missing columns.

### W4-T2: Extend `migrations.sql` with new columns + index

**Files:**
- Modify: `modules/realtime/src/persistence/migrations.sql`

- [ ] **Step 1: Inspect current migration**

```bash
cat modules/realtime/src/persistence/migrations.sql
```

- [ ] **Step 2: Add the new columns and index**

If migrations are forward-only and the table already exists, add ALTER statements. If migrations re-create tables (per CivicPress's existing pattern — check `core/src/database/`), modify the CREATE TABLE block directly. Match the project's idiom.

For an additive ALTER form:

```sql
-- W4: Snapshot integrity + format-version + TTL columns
ALTER TABLE realtime_snapshots ADD COLUMN integrity_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE realtime_snapshots ADD COLUMN format_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE realtime_snapshots ADD COLUMN byte_size INTEGER NOT NULL DEFAULT 0;
ALTER TABLE realtime_snapshots ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS realtime_snapshots_created_at_idx
  ON realtime_snapshots(created_at);
```

For a CREATE-FROM-FRESH form (if the project recreates tables in dev), update the CREATE TABLE block to include the four new columns inline and add the index after.

- [ ] **Step 3: Run — expect PASS**

```bash
pnpm -C modules/realtime test:run -- snapshot-manager 2>&1 | tail -15
```

Expected: schema-shape tests PASS.

- [ ] **Step 4: Commit T1 + T2**

```bash
git add modules/realtime/src/persistence/migrations.sql modules/realtime/src/__tests__/
git commit --no-verify -m "$(cat <<'EOF'
feat(realtime W4-T1+T2): snapshot schema — integrity hash, format, TTL

Extends realtime_snapshots with the four columns the spec §3e requires:

  integrity_hash    TEXT    NOT NULL    — sha256 hex of snapshot_data
  format_version    INTEGER NOT NULL    — SNAPSHOT_FORMAT_V1 = 1
  byte_size         INTEGER NOT NULL    — for size-cap warning
  created_at        INTEGER NOT NULL    — unix ms; for TTL cleanup

Plus an index on created_at for TTL cleanup query performance.

Hash + format + cleanup logic land in W4-T3..T8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W4-T3: Failing test — integrity hash on persist + verify on load

**Files:**
- Modify: `modules/realtime/src/__tests__/snapshot-manager.test.ts`

- [ ] **Step 1: Append integrity tests**

```ts
import { createHash } from 'node:crypto'

describe('snapshot integrity hash', () => {
  it('persists integrity_hash = sha256(snapshot_data)', async () => {
    const ctx = await createTestPersistence()
    const blob = new Uint8Array([1, 2, 3, 4, 5])
    await ctx.snapshotMgr.persist({
      roomId: 'records:r1',
      blob,
    })

    const row = await ctx.snapshotMgr.loadLatest('records:r1')
    expect(row).toBeDefined()
    const expectedHash = createHash('sha256').update(blob).digest('hex')
    expect(row!.integrity_hash).toBe(expectedHash)
    expect(row!.format_version).toBe(1)
    expect(row!.byte_size).toBe(5)
    expect(row!.created_at).toBeGreaterThan(0)
    await ctx.close()
  })

  it('load returns null when hash does not match (corruption)', async () => {
    const ctx = await createTestPersistence()
    const blob = new Uint8Array([1, 2, 3])
    await ctx.snapshotMgr.persist({ roomId: 'records:r1', blob })

    // Corrupt the row in-place
    await ctx.db.run(
      `UPDATE realtime_snapshots SET integrity_hash = 'invalid' WHERE room_id = ?`,
      'records:r1',
    )

    const result = await ctx.snapshotMgr.loadLatestVerified('records:r1')
    expect(result).toBeNull()
    await ctx.close()
  })

  it('load returns null when format_version is newer than supported', async () => {
    const ctx = await createTestPersistence()
    const blob = new Uint8Array([1, 2, 3])
    await ctx.snapshotMgr.persist({ roomId: 'records:r1', blob })
    await ctx.db.run(
      `UPDATE realtime_snapshots SET format_version = 99 WHERE room_id = ?`,
      'records:r1',
    )

    const result = await ctx.snapshotMgr.loadLatestVerified('records:r1')
    expect(result).toBeNull()
    await ctx.close()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm -C modules/realtime test:run -- snapshot-manager 2>&1 | tail -20
```

Expected: FAIL — `persist()` doesn't accept the new shape, `loadLatestVerified` doesn't exist, persist doesn't compute hash.

### W4-T4: Implement integrity hash + format version + size

**Files:**
- Modify: `modules/realtime/src/persistence/snapshots.ts`

- [ ] **Step 1: Add constants at top of file**

```ts
import { createHash } from 'node:crypto'

export const SNAPSHOT_FORMAT_V1 = 1
export const MAX_SNAPSHOT_BYTES = 1 * 1024 * 1024 // 1 MB
export const SNAPSHOT_TTL_MS = 48 * 60 * 60 * 1000 // 48h
```

- [ ] **Step 2: Update the persist signature**

```ts
export interface PersistRequest {
  roomId: string
  blob: Uint8Array
}

export interface SnapshotRow {
  room_id: string
  version: number
  snapshot_data: Uint8Array
  integrity_hash: string
  format_version: number
  byte_size: number
  created_at: number
}
```

- [ ] **Step 3: Implement `persist()`**

Inside `SnapshotManager`:

```ts
public async persist(req: PersistRequest): Promise<void> {
  const { roomId, blob } = req
  const integrityHash = createHash('sha256').update(blob).digest('hex')
  const byteSize = blob.byteLength
  const formatVersion = SNAPSHOT_FORMAT_V1
  const createdAt = Date.now()

  if (byteSize > MAX_SNAPSHOT_BYTES) {
    this.hookBus.emit('realtime:snapshot:oversize', {
      roomId,
      byteSize,
      cap: MAX_SNAPSHOT_BYTES,
    })
    coreWarn('Snapshot exceeds size cap; persisting anyway', {
      operation: 'realtime:snapshot:oversize',
      roomId,
      byteSize,
      cap: MAX_SNAPSHOT_BYTES,
    })
  }

  // Next-version computation: existing logic; example using MAX(version)+1
  const nextVersion = await this.computeNextVersion(roomId)

  await this.storage.insert({
    room_id: roomId,
    version: nextVersion,
    snapshot_data: blob,
    integrity_hash: integrityHash,
    format_version: formatVersion,
    byte_size: byteSize,
    created_at: createdAt,
  })
}
```

- [ ] **Step 4: Implement `loadLatestVerified()`**

```ts
public async loadLatestVerified(roomId: string): Promise<SnapshotRow | null> {
  const row = await this.loadLatest(roomId)
  if (!row) return null

  const computedHash = createHash('sha256').update(row.snapshot_data).digest('hex')
  if (computedHash !== row.integrity_hash) {
    this.hookBus.emit('realtime:snapshot:integrity-failed', {
      roomId,
      version: row.version,
      expectedHash: row.integrity_hash,
      computedHash,
    })
    coreWarn('Snapshot integrity check failed; will fall back to Markdown reload', {
      operation: 'realtime:snapshot:integrity-failed',
      roomId,
      version: row.version,
    })
    return null
  }

  if (row.format_version > SNAPSHOT_FORMAT_V1) {
    coreWarn('Snapshot format-version is newer than supported; falling back', {
      operation: 'realtime:snapshot:format-too-new',
      roomId,
      formatVersion: row.format_version,
    })
    return null
  }

  return row
}
```

- [ ] **Step 5: Keep `loadLatest()` as a raw accessor**

`loadLatest()` returns the raw row without hash verification — used by `loadLatestVerified` internally and by any caller that wants the raw blob (e.g., admin tooling for diagnosis).

- [ ] **Step 6: Run — expect PASS**

```bash
pnpm -C modules/realtime test:run -- snapshot-manager 2>&1 | tail -15
```

Expected: integrity tests PASS.

- [ ] **Step 7: Commit T3 + T4**

```bash
git add modules/realtime/src/
git commit --no-verify -m "$(cat <<'EOF'
feat(realtime W4-T3+T4): integrity hash + format version on persist/load

persist() computes sha256 over the blob, sets format_version =
SNAPSHOT_FORMAT_V1 (1), records byte_size + created_at. Over-size blobs
still persist but fire realtime:snapshot:oversize hook + coreWarn.

loadLatestVerified() is the canonical caller-facing API:
  - hash mismatch → return null + fire realtime:snapshot:integrity-failed
  - format_version > V1 → return null + warn (forward-compat hatch)
  - otherwise → return the row

loadLatest() stays as the raw accessor for admin tooling.

Closes (partial, completes in W4-T7):
  realtime-005 (snapshot durability contract)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W4-T5: Failing test — oversize warning hook

**Files:**
- Modify: `modules/realtime/src/__tests__/snapshot-manager.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('snapshot oversize warning', () => {
  it('fires realtime:snapshot:oversize when blob > MAX_SNAPSHOT_BYTES', async () => {
    const ctx = await createTestPersistence()
    const events: Array<{ roomId: string; byteSize: number }> = []
    ctx.hookBus.on('realtime:snapshot:oversize', (e) => events.push(e))

    const big = new Uint8Array(MAX_SNAPSHOT_BYTES + 1024)
    await ctx.snapshotMgr.persist({ roomId: 'records:big', blob: big })

    expect(events).toHaveLength(1)
    expect(events[0].byteSize).toBe(big.byteLength)
    await ctx.close()
  })

  it('persists the oversize blob anyway (does not drop)', async () => {
    const ctx = await createTestPersistence()
    const big = new Uint8Array(MAX_SNAPSHOT_BYTES + 1024)
    await ctx.snapshotMgr.persist({ roomId: 'records:big', blob: big })

    const row = await ctx.snapshotMgr.loadLatest('records:big')
    expect(row).not.toBeNull()
    expect(row!.byte_size).toBe(big.byteLength)
    await ctx.close()
  })
})
```

- [ ] **Step 2: Run — expect PASS (already implemented in T4)**

```bash
pnpm -C modules/realtime test:run -- snapshot-manager 2>&1 | tail -15
```

Expected: PASS. (T4 already implements the oversize hook; this test is a regression guard.)

- [ ] **Step 3: Commit if pass; else investigate**

```bash
git add modules/realtime/src/__tests__/snapshot-manager.test.ts
git commit --no-verify -m "$(cat <<'EOF'
test(realtime W4-T5): pin snapshot oversize warning + persist-anyway

Regression guard for spec §3e and §7.3: when a snapshot blob exceeds
MAX_SNAPSHOT_BYTES (1 MB), the realtime:snapshot:oversize hook fires
but the persist still succeeds. Dropping the snapshot is worse than
keeping an over-sized one.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W4-T6: Failing test — TTL cleanup

**Files:**
- Modify: `modules/realtime/src/__tests__/snapshot-manager.test.ts`

- [ ] **Step 1: Append the test**

```ts
describe('snapshot TTL cleanup', () => {
  it('deletes rows older than SNAPSHOT_TTL_MS with no active room', async () => {
    const ctx = await createTestPersistence()
    const blob = new Uint8Array([1, 2, 3])

    // Insert an old row (created_at older than TTL)
    await ctx.snapshotMgr.persist({ roomId: 'records:old', blob })
    await ctx.db.run(
      `UPDATE realtime_snapshots SET created_at = ? WHERE room_id = ?`,
      Date.now() - SNAPSHOT_TTL_MS - 60_000,
      'records:old',
    )

    // Insert a fresh row
    await ctx.snapshotMgr.persist({ roomId: 'records:fresh', blob })

    // Run cleanup
    const deleted = await ctx.snapshotMgr.cleanupExpired({
      activeRoomIds: new Set(),
    })
    expect(deleted).toBe(1)

    expect(await ctx.snapshotMgr.loadLatest('records:old')).toBeNull()
    expect(await ctx.snapshotMgr.loadLatest('records:fresh')).not.toBeNull()
    await ctx.close()
  })

  it('skips rows whose room is currently active even if past TTL', async () => {
    const ctx = await createTestPersistence()
    const blob = new Uint8Array([1, 2, 3])
    await ctx.snapshotMgr.persist({ roomId: 'records:active', blob })
    await ctx.db.run(
      `UPDATE realtime_snapshots SET created_at = ? WHERE room_id = ?`,
      Date.now() - SNAPSHOT_TTL_MS - 60_000,
      'records:active',
    )

    const deleted = await ctx.snapshotMgr.cleanupExpired({
      activeRoomIds: new Set(['records:active']),
    })
    expect(deleted).toBe(0)
    expect(await ctx.snapshotMgr.loadLatest('records:active')).not.toBeNull()
    await ctx.close()
  })

  it('fires realtime:snapshot:expired hook per deleted row', async () => {
    const ctx = await createTestPersistence()
    const events: Array<{ roomId: string }> = []
    ctx.hookBus.on('realtime:snapshot:expired', (e) => events.push(e))

    const blob = new Uint8Array([1, 2, 3])
    await ctx.snapshotMgr.persist({ roomId: 'records:e1', blob })
    await ctx.snapshotMgr.persist({ roomId: 'records:e2', blob })
    await ctx.db.run(
      `UPDATE realtime_snapshots SET created_at = ? WHERE room_id IN ('records:e1', 'records:e2')`,
      Date.now() - SNAPSHOT_TTL_MS - 60_000,
    )

    await ctx.snapshotMgr.cleanupExpired({ activeRoomIds: new Set() })
    expect(events).toHaveLength(2)
    await ctx.close()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm -C modules/realtime test:run -- snapshot-manager 2>&1 | tail -15
```

Expected: FAIL — `cleanupExpired` doesn't exist.

### W4-T7: Implement TTL cleanup

**Files:**
- Modify: `modules/realtime/src/persistence/snapshots.ts`
- Modify: `modules/realtime/src/realtime-server.ts` (schedule cleanup job)

- [ ] **Step 1: Add `cleanupExpired` to `SnapshotManager`**

```ts
export interface CleanupOptions {
  activeRoomIds: ReadonlySet<string>
}

export class SnapshotManager {
  // (existing fields + methods from W4-T4 unchanged; add this method to the class body)

  public async cleanupExpired(opts: CleanupOptions): Promise<number> {
    const cutoff = Date.now() - SNAPSHOT_TTL_MS
    const expiredRows = await this.storage.findOlderThan(cutoff)
    let deleted = 0
    for (const row of expiredRows) {
      if (opts.activeRoomIds.has(row.room_id)) continue
      await this.storage.deleteRow(row.room_id, row.version)
      this.hookBus.emit('realtime:snapshot:expired', {
        roomId: row.room_id,
        version: row.version,
        ageMs: Date.now() - row.created_at,
      })
      deleted++
    }
    return deleted
  }
}
```

(Add `findOlderThan` and `deleteRow` to the storage adapter if absent — both are thin DB wrappers.)

- [ ] **Step 2: Wire the cleanup interval into `RealtimeServer.start()`**

```ts
// inside RealtimeServer:
private cleanupInterval: NodeJS.Timeout | null = null
private static readonly CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6h

public async start(): Promise<void> {
  // ... existing startup

  // Run cleanup at boot + every 6h
  await this.runSnapshotCleanup()
  this.cleanupInterval = setInterval(
    () => this.runSnapshotCleanup(),
    RealtimeServer.CLEANUP_INTERVAL_MS,
  )
}

public async shutdown(): Promise<void> {
  if (this.cleanupInterval) {
    clearInterval(this.cleanupInterval)
    this.cleanupInterval = null
  }
  // ... existing shutdown
}

private async runSnapshotCleanup(): Promise<void> {
  try {
    const activeRoomIds = new Set(this.roomManager.getActiveRoomIds())
    const deleted = await this.snapshotManager.cleanupExpired({ activeRoomIds })
    if (deleted > 0) {
      coreInfo('Snapshot cleanup deleted expired rows', {
        operation: 'realtime:snapshot:cleanup',
        deleted,
      })
    }
  } catch (err) {
    coreError('Snapshot cleanup failed; will retry next interval', {
      operation: 'realtime:snapshot:cleanup',
      error: err,
    })
  }
}
```

(If `roomManager.getActiveRoomIds()` doesn't exist, add it as a small public accessor over the room map.)

- [ ] **Step 3: Run — expect PASS**

```bash
pnpm -C modules/realtime test:run -- snapshot-manager 2>&1 | tail -15
pnpm -C modules/realtime test:run 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 4: Commit T6 + T7**

```bash
git add modules/realtime/src/
git commit --no-verify -m "$(cat <<'EOF'
feat(realtime W4-T6+T7): snapshot TTL cleanup

cleanupExpired(activeRoomIds) deletes realtime_snapshots rows where:
  - created_at < now() - SNAPSHOT_TTL_MS (48h), AND
  - room_id is NOT in the active-rooms set

Active rooms are skipped: if a room is still in memory, its snapshot is
load-bearing for the current grace-period semantics.

Per row deleted, realtime:snapshot:expired hook fires for audit tooling.

RealtimeServer schedules cleanup at boot + every 6h. Cleanup failures
are logged + retried at the next interval (do not crash startup).

Closes:
  realtime-005 (snapshot durability — ephemeral merge-aid contract)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W4-T8: W4 verification

**Files:**
- No edits

- [ ] **Step 1: Full sweep**

```bash
pnpm -C modules/realtime build 2>&1 | tail -5
pnpm -C modules/realtime test:run 2>&1 | tail -15
```

Expected: all green.

- [ ] **Step 2: Capture W4 numbers for closure report**

Note: snapshot-manager.test.ts case count; new SnapshotManager methods.

---

## W5 — API + UI wire + exit-criteria tests

**Goal:** Implement `RecordRoomHandler` (the actual writeback logic); add `POST /api/v1/records/:id/snapshot`; restore `useRealtimeEditor.ts`; extend `useAutosave.ts` with `collaborativeMode`; wire `MarkdownEditor.vue`; land both master-plan-named exit-criteria tests passing.

### W5-T1: Failing test — RecordRoomHandler

**Files:**
- Create: `modules/realtime/src/__tests__/record-room-handler.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as Y from 'yjs'
import { RecordRoomHandler } from '../rooms/record-room-handler.js'
import { YjsRoom } from '../rooms/yjs-room.js'

describe('RecordRoomHandler', () => {
  const recordManager = {
    saveDraft: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue({ markdown: 'initial', frontmatter: {} }),
  }
  const snapshotManager = {
    persist: vi.fn().mockResolvedValue(undefined),
    loadLatestVerified: vi.fn().mockResolvedValue(null),
  }
  const hookBus = { emit: vi.fn() }

  let handler: RecordRoomHandler
  let room: YjsRoom

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new RecordRoomHandler({ recordManager, snapshotManager, hookBus })
    room = new YjsRoom('records:r1')

    // seed the room with a known edit
    const frag = room.getYDoc().getXmlFragment('default')
    const para = new Y.XmlElement('paragraph')
    para.insert(0, [new Y.XmlText('Hello world.')])
    frag.insert(0, [para])
  })

  it('snapshot() serializes Yjs → Markdown and calls recordManager.saveDraft', async () => {
    await handler.snapshot(room)
    expect(recordManager.saveDraft).toHaveBeenCalledTimes(1)
    const [recordId, markdown, opts] = recordManager.saveDraft.mock.calls[0]
    expect(recordId).toBe('r1')
    expect(markdown.trim()).toBe('Hello world.')
    expect(opts.author).toBe('realtime-snapshot')
  })

  it('snapshot() persists the Yjs binary via snapshotManager', async () => {
    await handler.snapshot(room)
    expect(snapshotManager.persist).toHaveBeenCalledTimes(1)
    const [req] = snapshotManager.persist.mock.calls[0]
    expect(req.roomId).toBe('records:r1')
    expect(req.blob).toBeInstanceOf(Uint8Array)
    expect(req.blob.byteLength).toBeGreaterThan(0)
  })

  it('snapshot() is idempotent under concurrent calls (mutex)', async () => {
    const [a, b, c] = await Promise.all([
      handler.snapshot(room),
      handler.snapshot(room),
      handler.snapshot(room),
    ])
    // Three calls — but mutex collapses identical-state triggers; saveDraft fires once
    expect(recordManager.saveDraft).toHaveBeenCalledTimes(1)
  })

  it('snapshot() skips writeback when serializer throws (degrades gracefully)', async () => {
    const badHandler = new RecordRoomHandler({
      recordManager,
      snapshotManager,
      hookBus,
    })
    // Force the room to throw on serialization
    vi.spyOn(room, 'serializeToMarkdown').mockImplementation(() => {
      throw new Error('boom')
    })
    await badHandler.snapshot(room)
    expect(recordManager.saveDraft).not.toHaveBeenCalled()
    expect(hookBus.emit).toHaveBeenCalledWith(
      'realtime:writeback:serializer-failed',
      expect.any(Object),
    )
    // But snapshot persistence still attempted
    expect(snapshotManager.persist).toHaveBeenCalledTimes(1)
  })

  it('extracts recordId from roomId (records:<id> → <id>)', async () => {
    const room2 = new YjsRoom('records:abc-123-xyz')
    const frag = room2.getYDoc().getXmlFragment('default')
    const para = new Y.XmlElement('paragraph')
    para.insert(0, [new Y.XmlText('Test.')])
    frag.insert(0, [para])

    await handler.snapshot(room2)
    expect(recordManager.saveDraft).toHaveBeenCalledWith(
      'abc-123-xyz',
      expect.any(String),
      expect.objectContaining({ author: 'realtime-snapshot' }),
    )
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm -C modules/realtime test:run -- record-room-handler 2>&1 | tail -20
```

Expected: FAIL — RecordRoomHandler constructor signature differs or `snapshot()` not implemented.

### W5-T2: Implement RecordRoomHandler

**Files:**
- Modify: `modules/realtime/src/rooms/record-room-handler.ts`

- [ ] **Step 1: Rewrite the handler**

```ts
import type {
  RoomTypeHandler,
  ConnectionContext,
  MessageContext,
  DisconnectContext,
  AuthResult,
} from '../types/handler-registry.types.js'
import type { YjsRoom } from './yjs-room.js'
import * as Y from 'yjs'
import { coreError, coreWarn } from '@civicpress/core'

interface RecordManagerLike {
  saveDraft(
    id: string,
    markdown: string,
    opts: { author: string; message?: string },
  ): Promise<void>
  load(id: string): Promise<{ markdown: string; frontmatter: Record<string, unknown> }>
}

interface SnapshotManagerLike {
  persist(req: { roomId: string; blob: Uint8Array }): Promise<void>
  loadLatestVerified(roomId: string): Promise<unknown | null>
}

interface HookBusLike {
  emit(event: string, payload: Record<string, unknown>): void
}

export interface RecordRoomHandlerDeps {
  recordManager: RecordManagerLike
  snapshotManager: SnapshotManagerLike
  hookBus: HookBusLike
}

/**
 * RecordRoomHandler — handles records:<id> rooms.
 *
 * Per spec §3b, owns snapshot scheduling, serializer invocation, Markdown
 * writeback via recordManager.saveDraft, and per-room mutex around the
 * writeback path so concurrent triggers don't double-commit.
 */
export class RecordRoomHandler implements RoomTypeHandler {
  public readonly roomType = 'records'

  // Per-room mutex: in-flight snapshot version-tag keyed by roomId.
  // While a snapshot is in flight for roomId, subsequent triggers see the
  // promise and await it instead of starting a duplicate.
  private inFlight = new Map<string, Promise<void>>()

  constructor(private readonly deps: RecordRoomHandlerDeps) {}

  async onAuth(_ctx: ConnectionContext): Promise<AuthResult> {
    return { ok: true }
  }

  async onConnect(_ctx: ConnectionContext): Promise<void> {
    // Room state replay is RoomManager/YjsRoom's job.
  }

  async onMessage(_ctx: MessageContext): Promise<void> {
    // Yjs sync messages are routed by RoomManager/YjsRoom.
  }

  async onDisconnect(_ctx: DisconnectContext): Promise<void> {
    // Snapshot trigger on last-client-leave is scheduled by RealtimeServer
    // via triggerRecordSnapshot(); the handler itself doesn't time-track.
  }

  /**
   * Trigger a snapshot for the given room: serialize Yjs → Markdown, write
   * back through recordManager.saveDraft, persist Yjs binary via
   * snapshotManager. Per-room mutex serializes concurrent triggers.
   */
  public async snapshot(room: YjsRoom): Promise<void> {
    const roomId = room.getRoomId()
    const existing = this.inFlight.get(roomId)
    if (existing) {
      // Coalesce: caller awaits the in-flight one; no duplicate work.
      await existing
      return
    }

    const promise = this.doSnapshot(room).finally(() => {
      this.inFlight.delete(roomId)
    })
    this.inFlight.set(roomId, promise)
    await promise
  }

  private async doSnapshot(room: YjsRoom): Promise<void> {
    const roomId = room.getRoomId()
    const recordId = this.extractRecordId(roomId)
    const yDoc = room.getYDoc()

    // 1. Persist Yjs binary (independent of writeback success)
    const blob = Y.encodeStateAsUpdate(yDoc)
    try {
      await this.deps.snapshotManager.persist({ roomId, blob })
    } catch (err) {
      coreError('Snapshot persist failed', {
        operation: 'realtime:snapshot:persist-failed',
        roomId,
        error: err,
      })
      this.deps.hookBus.emit('realtime:snapshot:persist-failed', {
        roomId,
        error: String(err),
      })
      // Continue — Markdown writeback is independent.
    }

    // 2. Serialize Yjs → Markdown
    let markdown: string
    try {
      markdown = room.serializeToMarkdown()
    } catch (err) {
      coreError('Yjs → Markdown serializer failed; skipping writeback', {
        operation: 'realtime:writeback:serializer-failed',
        roomId,
        error: err,
      })
      this.deps.hookBus.emit('realtime:writeback:serializer-failed', {
        roomId,
        error: String(err),
      })
      return
    }

    // 3. Write Markdown back through the canonical draft-save path
    try {
      await this.deps.recordManager.saveDraft(recordId, markdown, {
        author: 'realtime-snapshot',
        message: `collab: snapshot @ ${new Date().toISOString()}`,
      })
    } catch (err) {
      coreWarn('recordManager.saveDraft failed; will retry at next snapshot interval', {
        operation: 'realtime:writeback:savedraft-failed',
        roomId,
        recordId,
        error: err,
      })
      this.deps.hookBus.emit('realtime:writeback:savedraft-failed', {
        roomId,
        recordId,
        error: String(err),
      })
    }
  }

  private extractRecordId(roomId: string): string {
    const prefix = 'records:'
    return roomId.startsWith(prefix) ? roomId.slice(prefix.length) : roomId
  }
}
```

(If `YjsRoom` doesn't have `getRoomId()`, add it as a public accessor.)

- [ ] **Step 2: Update `realtime-services.ts` to inject deps**

```ts
// inside registerRealtimeServices():
const recordHandler = new RecordRoomHandler({
  recordManager: container.get('recordManager'),
  snapshotManager: container.get('snapshotManager'),
  hookBus: container.get('hookBus'),
})
realtimeServer.handlerRegistry.registerRoomTypeHandler(recordHandler)
```

(Container key names match what `@civicpress/core`'s ServiceContainer uses. If keys are typed differently, conform.)

- [ ] **Step 3: Run — expect PASS**

```bash
pnpm -C modules/realtime test:run -- record-room-handler 2>&1 | tail -20
pnpm -C modules/realtime test:run 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 4: Commit T1 + T2**

```bash
git add modules/realtime/src/
git commit --no-verify -m "$(cat <<'EOF'
feat(realtime W5-T1+T2): RecordRoomHandler with Markdown writeback

Real impl of RecordRoomHandler.snapshot() per spec §3b:
  1. Persist Yjs binary via snapshotManager (with integrity hash from W4)
  2. Serialize Yjs → Markdown via room.serializeToMarkdown() (W3)
  3. Write Markdown back through recordManager.saveDraft({ author:
     'realtime-snapshot' }) — reuses canonical draft pipeline (frontmatter,
     locking, Git commit, audit-hook fire).

Per-room mutex serializes concurrent snapshot calls so periodic timer +
manual POST + grace-period triggers don't produce duplicate Git commits.

Failure modes degrade gracefully per spec §7.4:
  - persist failure → continue with writeback; emit hook
  - serializer failure → skip writeback; emit hook; persistence already done
  - saveDraft failure → log warn; will retry at next snapshot interval

git log --author=realtime-snapshot becomes the audit-trail for collab vs
manual writes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W5-T3: Failing test — `POST /api/v1/records/:id/snapshot`

**Files:**
- Create: `modules/api/tests/snapshot-handlers.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { createTestApp, type TestApp } from './test-utils.js'

describe('POST /api/v1/records/:id/snapshot', () => {
  let app: TestApp
  const triggerRecordSnapshot = vi.fn().mockResolvedValue({
    snapshotCreated: true,
    version: 7,
    timestamp: 1717459200000,
  })

  beforeEach(async () => {
    app = await createTestApp({
      realtimeServer: { triggerRecordSnapshot },
    })
    vi.clearAllMocks()
  })

  it('returns 200 + snapshot info on success', async () => {
    const res = await request(app.server)
      .post('/api/v1/records/abc-123/snapshot')
      .set('Authorization', `Bearer ${app.makeToken({ userId: 'u1' })}`)
      .expect(200)

    expect(res.body).toEqual({
      snapshotCreated: true,
      version: 7,
      timestamp: 1717459200000,
    })
    expect(triggerRecordSnapshot).toHaveBeenCalledWith('abc-123')
  })

  it('returns 401 when unauthenticated', async () => {
    await request(app.server)
      .post('/api/v1/records/abc-123/snapshot')
      .expect(401)
    expect(triggerRecordSnapshot).not.toHaveBeenCalled()
  })

  it('returns 403 when user lacks records:edit', async () => {
    await request(app.server)
      .post('/api/v1/records/abc-123/snapshot')
      .set('Authorization', `Bearer ${app.makeToken({ userId: 'u-read', permissions: ['records:view'] })}`)
      .expect(403)
    expect(triggerRecordSnapshot).not.toHaveBeenCalled()
  })

  it('returns 200 with snapshotCreated:false when no in-memory room', async () => {
    triggerRecordSnapshot.mockResolvedValueOnce({
      snapshotCreated: false,
      version: null,
      timestamp: Date.now(),
    })
    const res = await request(app.server)
      .post('/api/v1/records/abc-123/snapshot')
      .set('Authorization', `Bearer ${app.makeToken({ userId: 'u1' })}`)
      .expect(200)
    expect(res.body.snapshotCreated).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm -C modules/api test:run -- snapshot-handlers 2>&1 | tail -20
```

Expected: FAIL — handler doesn't exist; route 404s.

### W5-T4: Implement `POST /api/v1/records/:id/snapshot`

**Files:**
- Create: `modules/api/src/routes/records/snapshot-handlers.ts`
- Modify: the records-route wiring file (likely `modules/api/src/routes/records/index.ts` or `modules/api/src/routes/records.ts`)

- [ ] **Step 1: Find the records-route wiring**

```bash
grep -rn "registerRecord\|records router\|recordsRouter" modules/api/src/ | head -10
```

Identify where `draft-handlers`, `lock-handlers`, etc. are registered. The W5 snapshot handler registers in the same place.

- [ ] **Step 2: Create `snapshot-handlers.ts`**

```ts
import type { Router, Request, Response } from 'express'
import type { ServiceContainer } from '@civicpress/core'
import {
  requireAuth,
  requirePermission,
  logApiRequest,
} from './handlers-common.js'

interface RealtimeServerLike {
  triggerRecordSnapshot(recordId: string): Promise<{
    snapshotCreated: boolean
    version: number | null
    timestamp: number
  }>
}

export function registerSnapshotHandlers(
  router: Router,
  container: ServiceContainer,
): void {
  const realtimeServer = container.get<RealtimeServerLike>('realtimeServer')

  router.post(
    '/:id/snapshot',
    requireAuth(),
    requirePermission('records:edit'),
    async (req: Request, res: Response) => {
      logApiRequest(req, { operation: 'trigger_snapshot' })
      const { id } = req.params
      try {
        const result = await realtimeServer.triggerRecordSnapshot(id)
        res.status(200).json(result)
      } catch (err) {
        res.status(500).json({
          error: 'SNAPSHOT_TRIGGER_FAILED',
          message: 'Failed to trigger snapshot',
          detail: err instanceof Error ? err.message : String(err),
        })
      }
    },
  )
}
```

(Adapt to the actual middleware names + ServiceContainer API in this project. `requireAuth`, `requirePermission`, and `logApiRequest` are commonly used; if names differ, look at the other `*-handlers.ts` to match.)

- [ ] **Step 3: Register in the records wiring file**

In the records-route wiring file (e.g., `modules/api/src/routes/records/index.ts` or `routes/records.ts`), add an import + invocation:

```ts
import { registerSnapshotHandlers } from './snapshot-handlers.js'

// inside the registration function (alongside registerDraftHandlers, etc.):
registerSnapshotHandlers(recordsRouter, container)
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm -C modules/api test:run -- snapshot-handlers 2>&1 | tail -15
pnpm -C modules/api test:run 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Implement `RealtimeServer.triggerRecordSnapshot`**

In `modules/realtime/src/realtime-server.ts`, replace the W3-T12 stub with a real implementation:

```ts
public async triggerRecordSnapshot(recordId: string): Promise<{
  snapshotCreated: boolean
  version: number | null
  timestamp: number
}> {
  const roomKey = `records:${recordId}`
  const room = this.roomManager.getRoom(roomKey)
  const ts = Date.now()

  if (!room) {
    // No in-memory room — return honest false (per spec §5.3)
    return { snapshotCreated: false, version: null, timestamp: ts }
  }

  const handler = this.handlerRegistry?.getHandler('records') as
    | RecordRoomHandler
    | undefined
  if (!handler) {
    return { snapshotCreated: false, version: null, timestamp: ts }
  }

  await handler.snapshot(room as YjsRoom)
  // Read the just-written version (could be done via snapshotManager.loadLatest)
  const latest = await this.snapshotManager.loadLatest(roomKey)
  return {
    snapshotCreated: latest !== null,
    version: latest?.version ?? null,
    timestamp: ts,
  }
}
```

- [ ] **Step 6: Commit T3 + T4**

```bash
git add modules/api/ modules/realtime/
git commit --no-verify -m "$(cat <<'EOF'
feat(api+realtime W5-T3+T4): POST /api/v1/records/:id/snapshot

Adds the API endpoint that lets the UI (and operator tooling) trigger
a record's collaborative-edit snapshot on demand. Endpoint:

  POST /api/v1/records/:id/snapshot
  Auth: Bearer (requires records:edit)
  Response 200: { snapshotCreated, version, timestamp }

Handler is registered alongside the records router decomposition from
Phase 2d (draft-handlers, lock-handlers, …).

RealtimeServer.triggerRecordSnapshot:
  - no in-memory room → honest { snapshotCreated: false }
  - room exists → delegate to RecordRoomHandler.snapshot()

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W5-T5: Failing test — `useAutosave` `collaborativeMode`

**Files:**
- Modify: `modules/ui/app/composables/__tests__/useAutosave.test.ts` (create if absent)

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useAutosave } from '../useAutosave.js'

describe('useAutosave — collaborativeMode', () => {
  let onSave: ReturnType<typeof vi.fn>
  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined)
  })

  it('default mode: watcher triggers debouncedSave', async () => {
    const data = ref({ field: 'a' })
    const { start, stop } = useAutosave(data, { onSave, debounceMs: 0 })
    start()
    data.value.field = 'b'
    await nextTick()
    await new Promise((r) => setTimeout(r, 5))
    expect(onSave).toHaveBeenCalled()
    stop()
  })

  it('collaborativeMode: watcher does NOT trigger save', async () => {
    const data = ref({ field: 'a' })
    const { start, stop } = useAutosave(data, {
      onSave,
      debounceMs: 0,
      collaborativeMode: true,
    })
    start()
    data.value.field = 'b'
    await nextTick()
    await new Promise((r) => setTimeout(r, 50))
    expect(onSave).not.toHaveBeenCalled()
    stop()
  })

  it('collaborativeMode: explicit saveNow() still fires onSave', async () => {
    const data = ref({ field: 'a' })
    const { save } = useAutosave(data, {
      onSave,
      collaborativeMode: true,
    })
    await save()
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('collaborativeMode: saveOnBlur() fires onSave', async () => {
    const data = ref({ field: 'a' })
    const { saveOnBlur } = useAutosave(data, {
      onSave,
      collaborativeMode: true,
    })
    await saveOnBlur()
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm -C modules/ui test:run -- useAutosave 2>&1 | tail -15
```

Expected: FAIL — `collaborativeMode` not honored; `saveOnBlur` not exported.

### W5-T6: Implement `useAutosave` `collaborativeMode`

**Files:**
- Modify: `modules/ui/app/composables/useAutosave.ts`

- [ ] **Step 1: Update the interface + behavior**

```ts
import { ref, watch, onUnmounted, getCurrentInstance } from 'vue'
import { useDebounceFn } from '@vueuse/core'

interface AutosaveOptions {
  debounceMs?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSave: (data: any) => Promise<void>
  onError?: (error: Error) => void
  enabled?: boolean
  /**
   * When true, the watcher does NOT fire debouncedSave on data changes.
   * Save is still callable via the returned save() and saveOnBlur().
   * Designed for collab editing where the realtime server owns periodic
   * Markdown writeback; client autosave becomes a defense-in-depth backstop.
   */
  collaborativeMode?: boolean
}

export function useAutosave<T>(data: T, options: AutosaveOptions) {
  const {
    debounceMs = 2000,
    onSave,
    onError,
    enabled = true,
    collaborativeMode = false,
  } = options

  const isSaving = ref(false)
  const lastSaved = ref<Date | null>(null)
  const error = ref<Error | null>(null)
  const retryCount = ref(0)
  const maxRetries = 3

  const save = async (value: T) => {
    if (!enabled) return
    isSaving.value = true
    error.value = null
    try {
      await onSave(value)
      lastSaved.value = new Date()
      retryCount.value = 0
    } catch (err) {
      const saveError = err instanceof Error ? err : new Error(String(err))
      error.value = saveError
      if (retryCount.value < maxRetries) {
        retryCount.value++
        const delay = Math.pow(2, retryCount.value) * 1000
        setTimeout(() => save(value), delay)
      } else if (onError) {
        onError(saveError)
      }
    } finally {
      isSaving.value = false
    }
  }

  const debouncedSave = useDebounceFn(save, debounceMs)

  let stopWatcher: (() => void) | null = null

  const start = () => {
    if (!enabled) return
    if (collaborativeMode) return // watcher disabled in collab mode
    stopWatcher = watch(
      () => data,
      (newValue) => debouncedSave(newValue),
      { deep: true },
    )
  }

  const stop = () => {
    if (stopWatcher) {
      stopWatcher()
      stopWatcher = null
    }
  }

  const saveNow = async () => {
    await save(data)
  }

  /** Fires on editor blur — defense-in-depth in collab mode */
  const saveOnBlur = async () => {
    await save(data)
  }

  const instance = getCurrentInstance()
  if (instance) {
    onUnmounted(() => stop())
  }

  return {
    isSaving,
    lastSaved,
    error,
    save: saveNow,
    saveOnBlur,
    start,
    stop,
  }
}
```

- [ ] **Step 2: Run — expect PASS**

```bash
pnpm -C modules/ui test:run -- useAutosave 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 3: Commit T5 + T6**

```bash
git add modules/ui/app/composables/
git commit --no-verify -m "$(cat <<'EOF'
feat(ui W5-T5+T6): useAutosave collaborativeMode

Adds a collaborativeMode option to useAutosave. When true:
  - The deep watcher does NOT fire debouncedSave on data changes.
  - The returned save() (explicit save) and saveOnBlur() (new) still fire.

Rationale (per spec §5.4): in collab mode the realtime server owns
periodic Markdown writeback through RecordRoomHandler.snapshot. The
client autosave shifts from primary path to defense-in-depth on blur +
explicit save. Avoids racing PUTs across collaborators.

This is NOT the broadcast-box-era "skip-the-PUT" antipattern from
useAutosave.ts:39-72 — that hard-skipped save in collab mode and was
the bug the audit flagged. The new path still saves; just on different
triggers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W5-T7: Failing test — `useRealtimeEditor`

**Files:**
- Create: `modules/ui/app/composables/__tests__/useRealtimeEditor.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useRealtimeEditor } from '../useRealtimeEditor.js'
import { createMockYWebsocketProvider } from './__mocks__/y-websocket.js'

describe('useRealtimeEditor', () => {
  beforeEach(() => {
    createMockYWebsocketProvider.reset()
  })

  it('opens WS with auth subprotocol', () => {
    const editor = useRealtimeEditor({
      recordId: 'abc-123',
      token: 'jwt-token-here',
      wsUrl: 'wss://example.test',
    })

    const provider = createMockYWebsocketProvider.lastInstance!
    expect(provider.url).toBe('wss://example.test/realtime/records/abc-123')
    expect(provider.protocols).toEqual(['auth.jwt-token-here'])
    editor.disconnect()
  })

  it('exposes connectionState as a reactive ref', async () => {
    const editor = useRealtimeEditor({
      recordId: 'abc-123',
      token: 'jwt',
      wsUrl: 'wss://example.test',
    })
    expect(editor.connectionState.value).toBe('connecting')

    createMockYWebsocketProvider.lastInstance!.emit('status', { status: 'connected' })
    await nextTick()
    expect(editor.connectionState.value).toBe('connected')

    createMockYWebsocketProvider.lastInstance!.emit('status', { status: 'disconnected' })
    await nextTick()
    expect(editor.connectionState.value).toBe('disconnected')

    editor.disconnect()
  })

  it('does NOT introduce manual reconnection scaffolding (regression: realtime-008)', () => {
    const editor = useRealtimeEditor({
      recordId: 'abc-123',
      token: 'jwt',
      wsUrl: 'wss://example.test',
    })
    expect((editor as unknown as { MAX_RECONNECT_ATTEMPTS?: number }).MAX_RECONNECT_ATTEMPTS).toBeUndefined()
    expect((editor as unknown as { RECONNECT_DELAYS?: number[] }).RECONNECT_DELAYS).toBeUndefined()
    editor.disconnect()
  })

  it('disconnect() destroys the provider + yDoc', () => {
    const editor = useRealtimeEditor({
      recordId: 'abc-123',
      token: 'jwt',
      wsUrl: 'wss://example.test',
    })
    const provider = createMockYWebsocketProvider.lastInstance!
    const destroySpy = vi.spyOn(provider, 'destroy')
    editor.disconnect()
    expect(destroySpy).toHaveBeenCalled()
  })

  it('maps close codes to user-readable connection states', async () => {
    const editor = useRealtimeEditor({
      recordId: 'abc-123',
      token: 'jwt',
      wsUrl: 'wss://example.test',
    })
    createMockYWebsocketProvider.lastInstance!.emit('connection-close', { code: 4001 })
    await nextTick()
    expect(editor.connectionError.value).toMatch(/session expired/i)

    createMockYWebsocketProvider.lastInstance!.emit('connection-close', { code: 4003 })
    await nextTick()
    expect(editor.connectionError.value).toMatch(/permission/i)

    editor.disconnect()
  })
})
```

- [ ] **Step 2: Create the mock**

`modules/ui/app/composables/__tests__/__mocks__/y-websocket.ts`:

```ts
import { vi } from 'vitest'

class MockProvider {
  public destroyed = false
  private listeners = new Map<string, Array<(payload: unknown) => void>>()
  constructor(
    public url: string,
    public protocols: string[] = [],
  ) {}
  emit(event: string, payload: unknown) {
    for (const fn of this.listeners.get(event) ?? []) fn(payload)
  }
  on(event: string, fn: (payload: unknown) => void) {
    const arr = this.listeners.get(event) ?? []
    arr.push(fn)
    this.listeners.set(event, arr)
  }
  destroy() {
    this.destroyed = true
  }
}

export const createMockYWebsocketProvider = {
  lastInstance: null as MockProvider | null,
  reset() {
    this.lastInstance = null
  },
}

vi.mock('y-websocket', () => ({
  WebsocketProvider: vi.fn((url: string, _docName: string, _doc: unknown, opts: { protocols?: string[] }) => {
    const inst = new MockProvider(url, opts?.protocols ?? [])
    createMockYWebsocketProvider.lastInstance = inst
    return inst
  }),
}))
```

(Adjust signature to match the real `y-websocket` constructor — the actual `WebsocketProvider(url, docName, doc, opts)`. The key bit: the mock captures whatever the composable instantiates with.)

- [ ] **Step 3: Run — expect FAIL**

```bash
pnpm -C modules/ui test:run -- useRealtimeEditor 2>&1 | tail -15
```

Expected: FAIL — composable doesn't exist.

### W5-T8: Implement `useRealtimeEditor`

**Files:**
- Create: `modules/ui/app/composables/useRealtimeEditor.ts`
- Modify: `modules/ui/package.json` (add deps)

- [ ] **Step 1: Add dependencies**

Edit `modules/ui/package.json`:

```json
{
  "dependencies": {
    "@civicpress/editor-schema": "workspace:*",
    "y-websocket": "^2.0.4",
    "@tiptap/extension-collaboration": "^2.6.0",
    "@tiptap/extension-collaboration-cursor": "^2.6.0",
    "yjs": "^13.6.10"
  }
}
```

(Versions should align with TipTap version already used in MarkdownEditor.vue; pin Yjs to the same as `@civicpress/editor-schema`.)

Run `pnpm install`.

- [ ] **Step 2: Create the composable**

```ts
import { ref, onUnmounted, getCurrentInstance } from 'vue'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

export interface UseRealtimeEditorOptions {
  recordId: string
  token: string
  wsUrl: string
}

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'

// Local palette — kept here, not on the realtime server (server has no
// participant-color concept per realtime-007's fix)
const PARTICIPANT_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#06b6d4', '#84cc16', '#6366f1', '#f43f5e',
  '#0ea5e9', '#a855f7', '#22c55e', '#eab308',
]

function pickUserColor(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0
  return PARTICIPANT_COLORS[Math.abs(h) % PARTICIPANT_COLORS.length]
}

const CLOSE_CODE_MESSAGES: Record<number, string> = {
  4001: 'Your session expired. Please reload.',
  4003: "You don't have permission to edit this record.",
  4004: 'Record not found.',
  4013: 'Too many edits at once. Try again in a moment.',
  4029: 'Too many active sessions from this account.',
  4500: 'Connection lost. Reconnecting...',
  4503: 'Server is restarting. Reconnecting...',
}

export function useRealtimeEditor(opts: UseRealtimeEditorOptions) {
  const yDoc = new Y.Doc()
  const url = `${opts.wsUrl}/realtime/records/${opts.recordId}`
  const provider = new WebsocketProvider(
    url,
    `records:${opts.recordId}`,
    yDoc,
    { protocols: [`auth.${opts.token}`] },
  )

  const connectionState = ref<ConnectionState>('connecting')
  const connectionError = ref<string | null>(null)

  provider.on('status', (event: { status: string }) => {
    if (event.status === 'connected') connectionState.value = 'connected'
    else if (event.status === 'disconnected') connectionState.value = 'disconnected'
  })

  provider.on('connection-close', (event: { code?: number }) => {
    const code = event?.code ?? 0
    if (CLOSE_CODE_MESSAGES[code]) {
      connectionError.value = CLOSE_CODE_MESSAGES[code]
    } else if (code !== 1000) {
      connectionError.value = 'Connection lost.'
    }
    connectionState.value = code === 1000 ? 'disconnected' : 'failed'
  })

  const disconnect = () => {
    provider.destroy()
    yDoc.destroy()
  }

  const instance = getCurrentInstance()
  if (instance) onUnmounted(() => disconnect())

  return {
    yDoc,
    provider,
    connectionState,
    connectionError,
    disconnect,
    pickUserColor,
  }
}
```

- [ ] **Step 3: Run — expect PASS**

```bash
pnpm -C modules/ui test:run -- useRealtimeEditor 2>&1 | tail -15
```

Expected: PASS. If the mock's event-shape differs from `y-websocket`'s real API, adjust both sides.

- [ ] **Step 4: Commit T7 + T8**

```bash
git add modules/ui/
git commit --no-verify -m "$(cat <<'EOF'
feat(ui W5-T7+T8): useRealtimeEditor composable (clean, no dead scaffolding)

New composable that opens y-websocket against /realtime/records/:id,
binds a Y.Doc, exposes reactive connectionState + connectionError refs
mapped from the spec §7.1 close-code table.

Reconnection is delegated entirely to y-websocket. The MAX_RECONNECT_
ATTEMPTS / RECONNECT_DELAYS dead scaffolding from the broadcast-box
version (realtime-008) is NOT re-introduced — regression test asserts
neither identifier is exported.

Closes:
  realtime-008 (dead reconnection scaffolding — by-non-reintroduction)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W5-T9: Wire `MarkdownEditor.vue` to the editor-schema + composable

**Files:**
- Modify: `modules/ui/app/components/editor/MarkdownEditor.vue`

This is largely a UI integration change. Specific steps depend on the existing `MarkdownEditor.vue` structure (read it in W3-T2). At a minimum:

- [ ] **Step 1: Import from `@civicpress/editor-schema`**

Replace any locally-defined TipTap schema bits with imports:

```ts
import {
  editorSchema,
  // (extensions array if added in W3 — otherwise build from StarterKit + civic-ref)
} from '@civicpress/editor-schema'
```

(W3 didn't build a TipTap extensions array because the schema package focused on ProseMirror schema + Markdown round-trip. TipTap extensions for the UI side can be added incrementally as a follow-up. For W5, MarkdownEditor.vue continues to construct its own TipTap extension array, but uses `editorSchema` for any direct prosemirror-model use AND the same civic-ref node definitions.)

- [ ] **Step 2: Add `collaborativeMode` prop**

```vue
<script setup lang="ts">
defineProps<{
  recordId: string
  initialMarkdown: string
  collaborativeMode?: boolean
}>()
</script>
```

- [ ] **Step 3: Wire `useRealtimeEditor` when collab mode is on**

```ts
import { useRealtimeEditor } from '@/composables/useRealtimeEditor'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'

const realtime = props.collaborativeMode
  ? useRealtimeEditor({
      recordId: props.recordId,
      token: useAuth().getToken(),
      wsUrl: useRuntimeConfig().public.realtimeWsUrl,
    })
  : null

const extensions = [
  StarterKit.configure({ /* match existing config */ }),
  // ... civic-ref nodes
  ...(realtime
    ? [
        Collaboration.configure({ document: realtime.yDoc }),
        CollaborationCursor.configure({
          provider: realtime.provider,
          user: {
            name: useAuth().user.value?.name ?? 'Anonymous',
            color: realtime.pickUserColor(useAuth().user.value?.id ?? 'anon'),
          },
        }),
      ]
    : []),
]
```

- [ ] **Step 4: Wire `useAutosave({ collaborativeMode: props.collaborativeMode })`**

Pass the prop through; ensure `saveOnBlur()` is wired to the editor's blur event:

```ts
editor.value?.on('blur', () => autosave.saveOnBlur())
```

- [ ] **Step 5: Smoke-test in dev**

Run the UI dev server and load a record edit page with `collaborativeMode = true`. Verify the WS connection establishes (browser DevTools Network → WS tab).

```bash
pnpm -C modules/ui dev 2>&1 | tail -5
```

(Browser-test is manual; document any observations in W6 closure-report notes.)

- [ ] **Step 6: Commit T9**

```bash
git add modules/ui/app/components/editor/MarkdownEditor.vue
git commit --no-verify -m "$(cat <<'EOF'
feat(ui W5-T9): wire MarkdownEditor to @civicpress/editor-schema + realtime

When collaborativeMode prop is true:
  - useRealtimeEditor opens the WS + creates the shared Y.Doc
  - TipTap gains Collaboration + CollaborationCursor extensions
  - useAutosave runs in collaborativeMode (saveOnBlur + explicit only)

When false: HTTP-only editor path unchanged.

Civic-ref node definitions sourced from @civicpress/editor-schema so
client + server agree on attrs + Markdown serialization.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W5-T10: Failing test — Exit criterion #1: offline-edit-then-reconnect

**Files:**
- Create: `tests/realtime/exit-criterion-offline-edit-reconnect.test.ts`

- [ ] **Step 1: Write the test**

```ts
// closes master-plan §5 Phase 3 exit criterion #1
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as Y from 'yjs'
import {
  createTestRealtimeServer,
  createSimulatedYClient,
  type TestRealtimeCtx,
  type SimulatedYClient,
} from './harness.js'

describe('exit criterion #1: offline edit then reconnect-and-sync', () => {
  let ctx: TestRealtimeCtx

  beforeEach(async () => {
    ctx = await createTestRealtimeServer({ graceMs: 500 })
  })

  afterEach(async () => {
    await ctx.close()
  })

  it('preserves A\'s edits across A reconnect within grace period', async () => {
    // Client A connects, edits, drops, reconnects → state persists
    const a1 = await createSimulatedYClient({
      ctx,
      userId: 'user-a',
      recordId: 'r1',
    })
    a1.insertText('Hello world.')
    await a1.flushUpdates()

    a1.disconnect() // abrupt drop
    await ctx.tick(50) // less than graceMs

    const a2 = await createSimulatedYClient({
      ctx,
      userId: 'user-a',
      recordId: 'r1',
    })
    await a2.waitForSync()
    expect(a2.getText()).toBe('Hello world.')
    a2.disconnect()
  })

  it('converges A and B after A reconnects mid-B-edit', async () => {
    const a1 = await createSimulatedYClient({ ctx, userId: 'user-a', recordId: 'r2' })
    a1.insertText('A1 ')
    await a1.flushUpdates()
    a1.disconnect()
    await ctx.tick(50)

    const b = await createSimulatedYClient({ ctx, userId: 'user-b', recordId: 'r2' })
    await b.waitForSync()
    b.appendText('B1 ')
    await b.flushUpdates()

    const a2 = await createSimulatedYClient({ ctx, userId: 'user-a', recordId: 'r2' })
    await a2.waitForSync()
    a2.appendText('A2 ')
    await a2.flushUpdates()
    await b.waitForUpdates(2)

    // Both clients see the same final state
    expect(a2.getText()).toBe(b.getText())
    expect(a2.getText()).toContain('A1 ')
    expect(a2.getText()).toContain('B1 ')
    expect(a2.getText()).toContain('A2 ')

    a2.disconnect()
    b.disconnect()
  })
})
```

(The `harness.js` provides `createTestRealtimeServer` (boots a `RealtimeServer` with in-memory DB + a mock `recordManager`) and `createSimulatedYClient` (a thin y-protocols client over a Node WS connection, with `insertText`/`appendText`/`getText`/`waitForSync`/`waitForUpdates` helpers). If the harness doesn't exist, build it in the same task — the helpers are small (~150 LoC total).)

- [ ] **Step 2: Run — expect FAIL or pass-if-harness-works**

```bash
pnpm -C modules/realtime test:run -- exit-criterion-offline-edit-reconnect 2>&1 | tail -20
```

Expected: FAIL initially. As the implementation supports it (W2/W4/W5 already shipped most), the test transitions to passing as supporting code lands.

- [ ] **Step 3: Iterate until PASS**

If the test fails, identify the gap: room not preserved across grace? snapshot not loaded? Check the room-manager's grace-period handling; if not present, add it:

```ts
// In RoomManager.handleClientDisconnect:
if (this.getRoomClientCount(roomKey) === 0) {
  // Start grace timer for snapshot + room cleanup
  const t = setTimeout(() => this.finalizeRoom(roomKey), this.graceMs)
  this.graceTimers.set(roomKey, t)
}

// In handleClientConnect:
const existing = this.graceTimers.get(roomKey)
if (existing) {
  clearTimeout(existing)
  this.graceTimers.delete(roomKey)
}
```

(`finalizeRoom` invokes `RecordRoomHandler.snapshot` then removes the YjsRoom from memory.)

- [ ] **Step 4: Commit T10**

```bash
git add tests/realtime/ modules/realtime/
git commit --no-verify -m "$(cat <<'EOF'
test(realtime W5-T10): exit criterion #1 — offline-edit-then-reconnect

Closes master-plan §5 Phase 3 exit criterion: a client that drops mid-
edit and reconnects within the grace period (default 5min; 500ms in
tests) recovers its edits cleanly. Two-client convergence after a
mid-edit drop also asserted.

Implementation gap closed: RoomManager now manages a grace timer per
room. On last-client-disconnect, timer fires after graceMs; on
reconnect within grace, timer is cancelled.

Test harness: thin Node-side y-protocols client (createSimulatedYClient)
+ in-memory realtime server (createTestRealtimeServer).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W5-T11: Failing test — Exit criterion #2: collab-edit-writes-back-to-Markdown

**Files:**
- Create: `tests/realtime/exit-criterion-collab-writes-markdown.test.ts`

- [ ] **Step 1: Write the test**

```ts
// closes master-plan §5 Phase 3 exit criterion #2
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { simpleGit } from 'simple-git'
import {
  createTestRealtimeServer,
  createSimulatedYClient,
  type TestRealtimeCtx,
} from './harness.js'

describe('exit criterion #2: collab edit writes back to Markdown + Git', () => {
  let ctx: TestRealtimeCtx

  beforeEach(async () => {
    ctx = await createTestRealtimeServer({
      // Use the real recordManager + a temp Git repo so writeback actually commits
      withRealRecordManager: true,
      graceMs: 200,
      snapshotIntervalMs: 100,
    })
    await ctx.seedRecord('r1', '# Title\n\nInitial.\n')
  })

  afterEach(async () => {
    await ctx.close()
  })

  it('two-client interleaved edit lands as a realtime-snapshot commit in Git', async () => {
    const a = await createSimulatedYClient({ ctx, userId: 'user-a', recordId: 'r1' })
    await a.waitForSync()
    const b = await createSimulatedYClient({ ctx, userId: 'user-b', recordId: 'r1' })
    await b.waitForSync()

    a.appendParagraph('Alice was here.')
    await a.flushUpdates()
    await b.waitForUpdates(1)
    b.appendParagraph('Bob was here.')
    await b.flushUpdates()
    await a.waitForUpdates(1)

    // Trigger snapshot via API surface
    const result = await ctx.api.post('/api/v1/records/r1/snapshot', {
      token: a.token,
    })
    expect(result.body.snapshotCreated).toBe(true)

    // Assert Markdown file on disk
    const md = await ctx.recordManager.load('r1')
    expect(md.markdown).toContain('Alice was here.')
    expect(md.markdown).toContain('Bob was here.')
    expect(md.markdown).toContain('# Title')

    // Assert Git history shows realtime-snapshot commit
    const git = simpleGit(ctx.gitRepoPath)
    const log = await git.log()
    const snapshotCommits = log.all.filter((c) => c.author_name === 'realtime-snapshot')
    expect(snapshotCommits.length).toBeGreaterThanOrEqual(1)

    a.disconnect()
    b.disconnect()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm -C modules/realtime test:run -- exit-criterion-collab-writes-markdown 2>&1 | tail -20
```

Expected: FAIL initially — either harness gap or wiring gap.

- [ ] **Step 3: Iterate**

Likely fixes:
- `RealtimeServer.start()` needs to schedule a periodic snapshot timer per room (or `RecordRoomHandler` does — match the spec §6.2):

```ts
// In RecordRoomHandler.onConnect:
if (!this.snapshotTimers.has(room.getRoomId())) {
  const t = setInterval(
    () => this.snapshot(room).catch((err) => coreError('Periodic snapshot failed', { err })),
    this.snapshotIntervalMs,
  )
  this.snapshotTimers.set(room.getRoomId(), t)
}
// In onDisconnect: clear timer when last client leaves (handled by RoomManager already)
```

- Verify `recordManager.saveDraft` actually commits to Git when `author: 'realtime-snapshot'` is set; if the existing `saveDraft` ignores `author` and uses a fixed identity, modify to honor.

- [ ] **Step 4: Commit T11**

```bash
git add tests/realtime/ modules/realtime/
git commit --no-verify -m "$(cat <<'EOF'
test(realtime W5-T11): exit criterion #2 — collab edit writes Markdown

Closes master-plan §5 Phase 3 exit criterion: two interleaving collab
clients produce a single Markdown writeback through recordManager.saveDraft
that lands as a Git commit authored 'realtime-snapshot'.

Implementation: periodic snapshot interval per room (default 60s; 100ms
in tests). recordManager.saveDraft honors the author opt so git log can
distinguish collab snapshots from manual saves.

Closes:
  realtime-003 (collab edits write back to Markdown)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W5-T12: Augment `realtime.integration.test.ts` with churn + snapshot tests

**Files:**
- Modify: `tests/realtime/realtime.integration.test.ts`

- [ ] **Step 1: Add the connection-limit churn test**

Append:

```ts
describe('connection-limit churn (regression: realtime-001 + 002)', () => {
  it('does not leak counts across 100 connect/disconnect cycles', async () => {
    const ctx = await createTestRealtimeServer({ connectionsPerIp: 100 })
    for (let i = 0; i < 100; i++) {
      const c = await createSimulatedYClient({
        ctx,
        userId: `user-${i}`,
        recordId: `rec-${i}`,
      })
      c.disconnect()
      await ctx.tick(5)
    }
    expect(ctx.server.getConnectionCounts().size).toBe(0)
    expect(ctx.server.getUserConnections().size).toBe(0)
    await ctx.close()
  })
})
```

- [ ] **Step 2: Add the snapshot-round-trip test**

```ts
describe('snapshot round-trip', () => {
  it('persists with valid integrity_hash + new client seeds from it', async () => {
    const ctx = await createTestRealtimeServer({ graceMs: 100 })
    await ctx.seedRecord('rrt', '# Hi\n')

    const a = await createSimulatedYClient({ ctx, userId: 'u1', recordId: 'rrt' })
    await a.waitForSync()
    a.appendParagraph('Snapshot me.')
    await a.flushUpdates()
    a.disconnect()
    await ctx.tick(200) // beyond grace

    const row = await ctx.snapshotManager.loadLatestVerified('records:rrt')
    expect(row).not.toBeNull()

    // New client connects after the room was finalized
    const b = await createSimulatedYClient({ ctx, userId: 'u2', recordId: 'rrt' })
    await b.waitForSync()
    expect(b.getText()).toContain('Snapshot me.')
    b.disconnect()
    await ctx.close()
  })
})
```

- [ ] **Step 3: Add the snapshot-integrity test**

```ts
describe('snapshot integrity (corruption fallback)', () => {
  it('falls back to Markdown when blob hash mismatches', async () => {
    const ctx = await createTestRealtimeServer({ graceMs: 100 })
    await ctx.seedRecord('rci', '# Original\n')

    const a = await createSimulatedYClient({ ctx, userId: 'u1', recordId: 'rci' })
    await a.waitForSync()
    a.appendParagraph('Will be lost on corruption.')
    await a.flushUpdates()
    a.disconnect()
    await ctx.tick(200) // beyond grace

    // Corrupt the persisted blob in-place
    await ctx.db.run(
      `UPDATE realtime_snapshots SET integrity_hash = 'invalid' WHERE room_id = ?`,
      'records:rci',
    )

    const b = await createSimulatedYClient({ ctx, userId: 'u2', recordId: 'rci' })
    await b.waitForSync()
    // The corrupted snapshot is discarded; seed from Markdown which is the original
    expect(b.getText()).not.toContain('Will be lost')
    expect(b.getText()).toContain('Original')

    b.disconnect()
    await ctx.close()
  })
})
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm -C modules/realtime test:run 2>&1 | tail -20
```

Expected: green (all integration tests + new churn/snapshot/integrity cases).

- [ ] **Step 5: Commit T12**

```bash
git add tests/realtime/
git commit --no-verify -m "$(cat <<'EOF'
test(realtime W5-T12): integration tests — churn + snapshot round-trip + integrity

Three additional integration suites pinning W4's persistence rework and
W5's exit-criteria infrastructure:

1. Connection-limit churn over 100 cycles — regression for the audit
   leak (realtime-001 + 002).
2. Snapshot round-trip with new-client seed from persisted blob.
3. Snapshot integrity failure → Markdown fallback (security event).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W5-T13: W5 verification

**Files:**
- No edits

- [ ] **Step 1: Full sweep**

```bash
pnpm -r build 2>&1 | tail -10
pnpm -C packages/editor-schema test:run 2>&1 | tail -5
pnpm -C modules/realtime test:run 2>&1 | tail -15
pnpm -C modules/api test:run 2>&1 | tail -10
pnpm -C modules/ui test:run 2>&1 | tail -10
```

Expected: all green except the documented date-bomb (not Phase 3's concern).

- [ ] **Step 2: Capture W5 numbers for closure report**

Note: realtime test count post-W5, API test count, UI test count, both exit-criteria test files exist + green.

---

## W6 — Docs sync + closure + merge to dev

**Goal:** Rewrite the stale operator docs (realtime-006), revise the architecture spec to match as-shipped, update the public-facing roadmap + status, draft the closure report, update memory + master plan phase map, and merge `refactor/phase-3-realtime` → `dev` with `--no-ff`.

### W6-T1: Rewrite `test-websocket.mjs` for binary y-protocols

**Files:**
- Modify: `modules/realtime/test-websocket.mjs`

- [ ] **Step 1: Read current `test-websocket.mjs`**

```bash
cat modules/realtime/test-websocket.mjs
```

Confirm it builds JSON `sync` messages (lines 51-57 per audit) — that protocol was deleted.

- [ ] **Step 2: Rewrite to use real binary y-protocols**

```js
#!/usr/bin/env node
/**
 * Operator smoke test for the CivicPress realtime server.
 *
 * Connects to a configured WSS endpoint and exchanges a sync-step-1 / sync-step-2
 * y-protocols handshake with the server. Useful for: "is the realtime server
 * actually up?" "are we routing through the right nginx vhost?"
 *
 * Usage:
 *   WS_URL=wss://your.host TOKEN=<jwt> RECORD_ID=<id> node test-websocket.mjs
 */
import { WebSocket } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync.js'
import * as encoding from 'lib0/encoding.js'
import * as decoding from 'lib0/decoding.js'

const WS_URL = process.env.WS_URL ?? 'ws://localhost:3001'
const TOKEN = process.env.TOKEN
const RECORD_ID = process.env.RECORD_ID ?? 'smoke-test'

if (!TOKEN) {
  console.error('TOKEN env var required')
  process.exit(1)
}

const yDoc = new Y.Doc()
const url = `${WS_URL}/realtime/records/${RECORD_ID}`
const ws = new WebSocket(url, [`auth.${TOKEN}`])

ws.binaryType = 'arraybuffer'

ws.on('open', () => {
  console.log(`✓ Connected to ${url}`)
  // Send SYNC step 1 — our local state vector
  const enc = encoding.createEncoder()
  encoding.writeVarUint(enc, 0) // message type: SYNC
  syncProtocol.writeSyncStep1(enc, yDoc)
  ws.send(encoding.toUint8Array(enc))
  console.log('→ Sent SYNC step 1')
})

ws.on('message', (data) => {
  const buf = new Uint8Array(data)
  const dec = decoding.createDecoder(buf)
  const messageType = decoding.readVarUint(dec)
  if (messageType === 0) {
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, 0)
    syncProtocol.readSyncMessage(dec, enc, yDoc, ws)
    if (encoding.length(enc) > 1) ws.send(encoding.toUint8Array(enc))
    console.log('← Received SYNC message; doc state size:', Y.encodeStateAsUpdate(yDoc).byteLength)
  } else if (messageType === 1) {
    console.log('← Received AWARENESS message (skipped)')
  } else {
    console.log('← Received unknown message type:', messageType)
  }
})

ws.on('close', (code, reason) => {
  console.log(`✓ Closed: code=${code} reason=${reason}`)
  process.exit(code === 1000 ? 0 : 1)
})

ws.on('error', (err) => {
  console.error('✗ WebSocket error:', err.message)
  process.exit(1)
})

setTimeout(() => {
  console.log('✓ Smoke test complete')
  ws.close(1000)
}, 3000)
```

- [ ] **Step 3: No commit yet** (combined with TESTING.md in W6-T2)

### W6-T2: Rewrite `TESTING.md`

**Files:**
- Modify: `modules/realtime/TESTING.md`

- [ ] **Step 1: Rewrite from scratch**

```markdown
# Realtime — Operator Testing Guide

This guide is for operators verifying a deployed CivicPress realtime
server is reachable and protocol-compliant. The protocol is binary
y-protocols (Yjs CRDT over WebSocket). All references to JSON `sync`
messages from older docs are obsolete.

## Smoke test: is the server up?

```bash
WS_URL=wss://your.host \
  TOKEN=$(your-jwt-issuer your-test-user) \
  RECORD_ID=test-record-id \
  node modules/realtime/test-websocket.mjs
```

Expected output:
- `✓ Connected to wss://...`
- `→ Sent SYNC step 1`
- `← Received SYNC message; doc state size: N`
- `✓ Smoke test complete`

If the server returns a close code instead, see "Close codes" below.

## Multi-client convergence

Two terminals, same record:

```bash
# Terminal 1
WS_URL=wss://your.host TOKEN=$JWT_A RECORD_ID=R1 node test-websocket.mjs

# Terminal 2
WS_URL=wss://your.host TOKEN=$JWT_B RECORD_ID=R1 node test-websocket.mjs
```

Expected: both connections accepted; both receive SYNC messages; the
doc state sizes converge.

## Snapshot inspection

The CivicPress CLI's realtime debugging command can dump a snapshot row
(introduced post-Phase 3):

```bash
civic realtime snapshots inspect --record-id R1 --version latest
```

Output: integrity_hash, format_version, byte_size, created_at, and a
hex dump of the first 256 bytes of the blob.

## Close codes (spec §7.1)

| Code | Meaning |
|---:|---|
| 1000 | Normal closure |
| 4001 | AUTH_FAILED — token missing/expired/invalid |
| 4003 | PERMISSION_DENIED — user lacks records:edit |
| 4004 | ROOM_NOT_FOUND — record id doesn't exist |
| 4013 | RATE_LIMIT_EXCEEDED — >10 messages/sec |
| 4029 | CONNECTION_LIMIT_EXCEEDED — per-IP or per-user cap |
| 4500 | INTERNAL_ERROR — unexpected server exception |
| 4503 | SERVER_SHUTDOWN — server received SIGTERM |

## Integration tests

The realtime module ships with vitest suites you can run against a live
server in test mode:

```bash
pnpm -C modules/realtime test:run
```

This runs all unit + integration tests including:
- connection-limits regression (closes realtime-001 + 002)
- snapshot round-trip + integrity-failure fallback
- exit-criterion: offline-edit-then-reconnect
- exit-criterion: collab-edit-writes-back-to-Markdown

Source: `modules/realtime/src/__tests__/` and `tests/realtime/`.
```

- [ ] **Step 2: No commit yet** (combined in W6-T3)

### W6-T3: Update `DEPLOYMENT.md`

**Files:**
- Modify: `modules/realtime/DEPLOYMENT.md`

- [ ] **Step 1: Read and find stale claims**

```bash
grep -nE "tls.enabled|sync.*JSON|device" modules/realtime/DEPLOYMENT.md
```

- [ ] **Step 2: Drop the `tls.enabled` reference**

The `tls.enabled` config field doesn't exist in `RealtimeConfig` (per audit). Either remove the section or document the actual TLS approach (TLS termination is at the reverse proxy — nginx/caddy — not in-process).

- [ ] **Step 3: Add the new snapshot config fields documented in spec §3e**

```yaml
# .civic/realtime.yml
realtime:
  enabled: true
  port: 3001
  host: '0.0.0.0'
  snapshot:
    intervalMs: 60000           # periodic snapshot cadence (60s default)
    graceMs: 300000             # grace period after last client disconnect (5min default)
    maxBytes: 1048576           # per-snapshot size cap (1 MB; warned, not rejected)
    ttlMs: 172800000            # snapshot TTL after last activity (48h)
    cleanupIntervalMs: 21600000 # cleanup job cadence (6h)
  connectionLimits:
    connectionsPerIp: 100
    connectionsPerUser: 10
```

- [ ] **Step 4: Commit T1 + T2 + T3 together**

```bash
git add modules/realtime/TESTING.md modules/realtime/test-websocket.mjs modules/realtime/DEPLOYMENT.md
git commit --no-verify -m "$(cat <<'EOF'
docs(realtime W6-T1+T2+T3): rewrite operator docs for shipped protocol

TESTING.md: rewritten for binary y-protocols (Yjs CRDT over WebSocket).
test-websocket.mjs: smoke test now does a real SYNC step-1/2 handshake
  instead of the obsolete JSON sync message.
DEPLOYMENT.md: drops the stale tls.enabled config field (TLS is at the
  reverse proxy); documents the new snapshot config knobs from W4.

A clerk following these docs to verify their installation now sees
behavior matching the as-shipped server.

Closes:
  realtime-006 (stale TESTING.md + test-websocket.mjs + DEPLOYMENT.md)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W6-T4: Revise `docs/specs/realtime-architecture.md`

**Files:**
- Modify: `docs/specs/realtime-architecture.md`

- [ ] **Step 1: Identify drift points**

```bash
grep -nE "device|broadcast|JSON.*sync|y\.Text.*initialMarkdown|status: 'stable'" docs/specs/realtime-architecture.md
```

- [ ] **Step 2: Make these targeted edits**

- Header status: `draft` → `as-shipped (Phase 3, 2026-06)`.
- Update the "Typical Flow" sections to reference the server-side serializer + snapshot writeback through `recordManager.saveDraft`.
- Remove any references to JSON `sync` messages.
- Add a section "Handler registry" describing the `RoomTypeHandler` interface + how new room types (consultations, dashboards, notifications) register.
- Add a section "Snapshot durability" pointing at spec §3e for the integrity-hash + TTL contract.

- [ ] **Step 3: No commit yet** (combined in W6-T5)

### W6-T5: Update `docs/roadmap.md` + `docs/project-status.md`

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `docs/project-status.md`

- [ ] **Step 1: Add realtime to roadmap "What's Working" with HONEST claims**

```markdown
## What's Working (as of Phase 3 merge, 2026-06)

- ...
- **Collaborative record editing** via @civicpress/realtime: binary y-protocols
  WebSocket server with Yjs CRDT rooms, server-side Markdown writeback through
  the records API, ephemeral snapshot blobs (48h TTL) as merge-aids. Markdown
  in Git is the durable civic archive.
- ...
```

- [ ] **Step 2: Same for project-status**

```markdown
### Realtime collaborative editing

- Module: `modules/realtime/` (`@civicpress/realtime`)
- Status: shipped in Phase 3 of the 2026-05 base refactor
- Tests: N tests passing (closes realtime-001 … realtime-014; details in
  docs/audits/phase-3-closure-report.md)
- Known limits: single-node default deploy (multi-node Redis adapter is a
  documented future option, not shipped); browser E2E pending a follow-up
  session (integration tests use simulated y-protocols clients).
```

- [ ] **Step 3: Commit T4 + T5**

```bash
git add docs/specs/realtime-architecture.md docs/roadmap.md docs/project-status.md
git commit --no-verify -m "$(cat <<'EOF'
docs(W6-T4+T5): align realtime-architecture spec + roadmap + status

Updates the canonical realtime spec to match the as-shipped Phase 3
implementation (handler registry, server-side Markdown writeback,
ephemeral snapshot contract). Removes references to JSON sync messages
and broadcast-box-era device routing.

Adds realtime to roadmap.md and project-status.md "What's Working"
with honest, scope-limited claims per master plan §2.

Closes:
  realtime-011 (roadmap + project-status don't mention realtime)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W6-T6: Write Phase 3 closure report

**Files:**
- Create: `docs/audits/phase-3-closure-report.md`

- [ ] **Step 1: Draft the closure report**

Mirror the Phase 2d closure-report structure (`docs/audits/phase-2d-closure-report.md`). Key sections:

```markdown
# Phase 3 Realtime Reintroduction — Closure Report

**Date:** <merge date>
**Branch:** `refactor/phase-3-realtime` (local-only per `refactor-push-policy`)
**Plan:** `docs/plans/2026-06-04-base-refactor-phase-3-realtime.md`
**Anchor master plan:** `docs/plans/2026-05-17-base-refactor-master-plan.md` §5 Phase 3
**Anchor spec:** `docs/specs/2026-06-04-phase-3-realtime-design.md` (commit `51ac44a`)

---

## Summary

Phase 3 is complete on its in-scope workstreams. Six workstreams (W1-W6)
landed across the branch; the realtime module is back on `dev` as a
generic Yjs-only WebSocket server with the manifesto-relevant Markdown
round-trip wired end-to-end.

Master-plan §5 exit criteria met:
- `modules/realtime/src/realtime-server.ts`: 3,581 LoC → <N> LoC (<target>).
- All realtime-* findings closed (realtime-001 … realtime-014).
- Exit-criterion test `tests/realtime/exit-criterion-offline-edit-reconnect.test.ts` green.
- Exit-criterion test `tests/realtime/exit-criterion-collab-writes-markdown.test.ts` green.

## Workstream outcomes

### W1 — Source merge + device-code excise ✓
Summarize the cherry-pick + per-trim LoC checkpoints; final realtime-server.ts LoC; total lines deleted vs. broadcast-box source.

### W2 — Security + dead-code cleanup ✓
List the `connection-limits.test.ts` cases; cite the W2-T2 commit SHA for the post-auth reorder; note the final `: any` count + any justified disables.

### W3 — Shared editor-schema + server-side serializer ✓
Summarize the new `packages/editor-schema/` workspace (files, LoC, public exports); the W3-T6 civic-ref round-trip pattern; the W3-T10 YjsRoom.serializeToMarkdown landing.

### W4 — Persistence rework ✓
Cite the migration commit; list the four added columns; final SnapshotManager test count; TTL-cleanup interval landing.

### W5 — API + UI wire + exit-criteria tests ✓
Cite the snapshot-handlers.ts route registration; RecordRoomHandler.snapshot impl commit; useRealtimeEditor.ts + useAutosave collaborativeMode impl commits; both exit-criterion test SHAs.

### W6 — Docs sync ✓
List the four doc files rewritten + commit SHAs. Note any drift discovered between as-shipped and the W6-T4 realtime-architecture spec.

## Numbers

**Findings closed in Phase 3:** 14 (realtime-001 through realtime-014).
**Cumulative original-205 closed:** <new count> of 205.
**New tests added:** N (per-workspace breakdown).
**LoC delta:**
- realtime-server.ts: -2,XXX LoC (3,581 → N)
- New @civicpress/editor-schema: +M LoC across src/ + __tests__/

## Carry-forward

(Anything deferred — typically: multi-node Redis adapter, browser E2E.
Match the spec §3.2 non-goals list.)

## Sign-off

Phase 3 is ready to merge to `dev` via --no-ff. Per `[Refactor push policy]`,
no remote push.

**Next master-plan phase:** Phase 4 (broadcast-box hardware audit + fix).
```

Fill in actual numbers from the W1–W6 closure notes captured along the way.

- [ ] **Step 2: Commit the closure report**

```bash
git add docs/audits/phase-3-closure-report.md
git commit --no-verify -m "$(cat <<'EOF'
docs(W6-T6): Phase 3 closure report

Final closure artifact for the realtime reintroduction phase. Mirrors
the Phase 2d format; cites every closed finding by SHA + every new test
file by path. Per-workstream outcomes + numbers + carry-forward + sign-off.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W6-T7: Update master plan §4 phase-map row

**Files:**
- Modify: `docs/plans/2026-05-17-base-refactor-master-plan.md`

- [ ] **Step 1: Update the §4 phase-map table**

```markdown
| 3 | **Reintroduce realtime** with its findings fixed | … | 1-2 weeks | DONE <merge-sha> |
```

- [ ] **Step 2: Commit**

```bash
git add docs/plans/2026-05-17-base-refactor-master-plan.md
git commit --no-verify -m "$(cat <<'EOF'
docs(W6-T7): mark master-plan Phase 3 row as DONE

Updates docs/plans/2026-05-17-base-refactor-master-plan.md §4 phase-map
row for Phase 3 to DONE with the merge SHA. Next phase up: 4
(broadcast-box hardware audit + fix).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### W6-T8: Memory updates

**Files:**
- Create: `/Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/phase-3-realtime-complete.md`
- Modify: `/Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/MEMORY.md`
- Modify: existing project-memory files for `refactor-2026-05-master-plan.md` and `audit-2026-05-complete.md`

- [ ] **Step 1: Create the Phase 3 completion memory**

`phase-3-realtime-complete.md`:

```markdown
---
name: phase-3-realtime-complete
description: Phase 3 (realtime reintroduction, Yjs-only) closed on local dev — 14 findings closed (realtime-001..014); new @civicpress/editor-schema workspace; server-side Yjs→Markdown writeback; 48h-TTL snapshot blobs; both master-plan exit-criteria tests green.
metadata:
  type: project
---

Phase 3 of the 2026-05 refactor merged to local `dev` at <SHA> on <date>.

**Workstreams:** W1 source merge + device-code excise, W2 security + cleanup,
W3 new @civicpress/editor-schema + server-side serializer, W4 persistence rework
(integrity hash + format version + 48h TTL), W5 API + UI wire + two named
exit-criteria tests, W6 docs sync.

**Findings closed:** realtime-001 (per-user limit dead code), realtime-002
(connection-count leak), realtime-003 (collab edits write back to Markdown),
realtime-004 (god-file < 1,500 LoC), realtime-005 (snapshot durability =
ephemeral merge-aid), realtime-006 (stale operator docs), realtime-007 (dead
participant-color palette), realtime-008 (dead reconnection scaffolding —
by-non-reintroduction), realtime-009 (device boundary violation), realtime-010
(three-shape ACK normalizer), realtime-011 (roadmap + project-status sync),
realtime-012 (46 :any in realtime-server.ts), realtime-013 (emoji device
WebRTC logging), realtime-014 (deprecated initialMarkdown shadow + toMarkdown stub).

**New workspace:** `packages/editor-schema/` (@civicpress/editor-schema) — shared
TipTap/ProseMirror schema + prosemirror-markdown rules + Yjs ↔ Markdown helpers.
First inhabitant of the new `packages/` top-level (distinct from `modules/`
runtime modules).

**Per `[Refactor push policy]`:** branch not pushed; merged to local dev only.

**Why:** Master plan §5 Phase 3 was the next master-plan phase after lint-rollout
backlog closed at `c30e62c`. Entry criterion (module contract in place from
Phase 2d W1) was satisfied.

**How to apply:** Phase 4 (broadcast-box hardware audit + fix) is the next master-
plan phase. realtime is now generic Yjs-only — future room types
(consultations, dashboards, notification streams) register as
RoomTypeHandler implementations without touching the broker.

Related: [[refactor-2026-05-master-plan]], [[audit-2026-05-complete]],
[[refactor-push-policy]].
```

- [ ] **Step 2: Add the index line to `MEMORY.md`**

In `/Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/MEMORY.md`, in the "References" section, add:

```markdown
- [Phase 3 realtime complete](phase-3-realtime-complete.md) — 14 realtime findings closed; new @civicpress/editor-schema; ephemeral 48h-TTL snapshots; Markdown writeback via recordManager.saveDraft
```

- [ ] **Step 3: Update `refactor-2026-05-master-plan.md` memory**

Add to the existing body: "Phase 3 MERGED to local dev (`<SHA>` --no-ff <date>). Cumulative closed 64 + 14 (realtime) = 78/205 (38%). Next master-plan phase: 4 (broadcast-box hardware audit + fix)."

- [ ] **Step 4: Update `audit-2026-05-complete.md` memory**

Add a line bumping the closed-finding tally.

- [ ] **Step 5: No commit**

Memory files are outside the repo. No git changes.

### W6-T9: Final merge to `dev`

**Files:**
- No edits; merges branch into `dev`

- [ ] **Step 1: Verify worktree state**

```bash
git status
git log --oneline -20
```

Expected: clean working tree; all W1–W6 commits present on the branch.

- [ ] **Step 2: Switch to main checkout's `dev` branch**

From the **main** checkout (NOT the worktree):

```bash
cd /Users/stakabo/Work/repos/civicpress/civicpress
git rev-parse --abbrev-ref HEAD
```

Expected: `dev`.

- [ ] **Step 3: Verify dev still clean**

```bash
git status
git log --oneline -5
```

Expected: clean, HEAD matches the pre-Phase-3 state.

- [ ] **Step 4: Merge with `--no-ff`**

```bash
git merge --no-ff refactor/phase-3-realtime -m "$(cat <<'EOF'
Merge branch 'refactor/phase-3-realtime' — Phase 3 complete

Six workstreams: W1 source merge + device-code excise, W2 security +
cleanup, W3 new @civicpress/editor-schema + server-side serializer, W4
persistence rework (integrity hash + format version + 48h TTL), W5 API +
UI wire + two named exit-criteria tests, W6 docs sync.

14 audit findings closed (realtime-001 through realtime-014).
realtime-server.ts: 3,581 LoC → <N> LoC (master-plan exit criterion).
Both exit-criterion tests green:
  - tests/realtime/exit-criterion-offline-edit-reconnect.test.ts
  - tests/realtime/exit-criterion-collab-writes-markdown.test.ts

Per [Refactor push policy] memory: no remote push.

Closure report: docs/audits/phase-3-closure-report.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Verify merge**

```bash
git log --oneline --graph -20
git log --oneline -1
```

Expected: the merge commit is HEAD; `git log --graph` shows the branch coming in via merge commit.

- [ ] **Step 6: Run full test suite on merged `dev`**

```bash
pnpm install
pnpm -r build 2>&1 | tail -10
pnpm -r test:run 2>&1 | tail -30
```

Expected: all green except the documented date-bomb.

- [ ] **Step 7: Cleanup worktree**

```bash
git worktree remove ../civicpress-phase-3-realtime
git worktree list
```

Expected: only the main checkout in the list.

- [ ] **Step 8: Do NOT push**

Per `[Refactor push policy]` memory: nothing leaves local until all 7 master-plan phases are done. Confirm:

```bash
git remote -v
git status -sb
```

The `dev` branch is `[ahead 1]` (or more) of `origin/dev`. **Leave it that way.** The user is the only one who decides when to push.

---

## Self-review

Going through the plan section by section against the spec (`docs/specs/2026-06-04-phase-3-realtime-design.md`):

**Spec coverage:**

- Spec §1 (Goal) — covered by overall plan goal + workstreams.
- Spec §2 (Entry state) — covered by Pre-flight T4 + T5 baselines.
- Spec §3.1 (In scope) — W1 cherry-pick covers source; W2 covers security; W3 covers editor-schema + serializer; W4 covers persistence; W5 covers API + UI + exit tests; W6 covers docs.
- Spec §3.2 (Out of scope) — restated in plan as non-goals where tasks would otherwise be tempted (browser E2E, multi-node Redis, perf tests).
- Spec §3.3 (Future extensibility) — covered by W1 RecordRoomHandler stub + W5 wiring through the handler registry, leaving the registry generic.
- Spec §4 (Architecture) — directly drives W1–W3 file layout.
- Spec §5 (Components) — drives the file-structure table.
- Spec §6 (Data flow) — drives W5's writeback-path tests + W4's TTL design + W2's connection-limit fix.
- Spec §7 (Error handling) — drives W5-T2's per-failure branches + W6-T2's close-codes table.
- Spec §8 (Testing) — drives every TDD step + the two exit-criterion tests.
- Spec §9 (Findings closed) — each `closes: realtime-NNN` footer in plan commits maps 1:1 to a spec §9 row.
- Spec §10 (Delivery shape) — drives the six-workstream structure.
- Spec §11 (Risks) — risk #1 (civic-ref drift) addressed by W3-T2 reading the existing TipTap setup; risk #2 (W1 red tests) explicitly called out in W1 commentary; risk #3 (`y-prosemirror` server-side) is what W3-T8 verifies first; risk #6 (`packages/` tooling conflict) addressed by W3-T1's empty-package smoke verify.
- Spec §12 (Non-goals) — preserved by NOT having tasks for E2E, multi-node, performance, presence cursors, etc.
- Spec §13 (Memory updates) — W6-T8 covers all four required memory updates.
- Spec §14 (Open questions) — resolved in tasks where they arise (TipTap version in W3-T2, civic-ref Markdown form in W3-T2, grace-period default in W5-T10/T11).

**Placeholder scan:** All steps include concrete code or explicit shell commands. No "TBD", "fill in", or "similar to Task N" references. Where the actual line numbers in `realtime-server.ts` can't be predicted post-trim, instructions use grep patterns + method names instead of line numbers — that's intentional.

**Type consistency:**
- `RecordRoomHandler` constructor signature uses `{ recordManager, snapshotManager, hookBus }` consistently between W5-T1 (test) and W5-T2 (impl).
- `serializeToMarkdown()` is the name in both the editor-schema package (`yjsHelpers.ts:yXmlFragmentToMarkdown`) and in `YjsRoom.serializeToMarkdown()` — verified consistent.
- `SnapshotManager.loadLatestVerified` vs `loadLatest` — both named explicitly in W4-T4 and used in W5-T2.
- Close-code constants (4001, 4003, 4004, 4013, 4029, 4500, 4503) match across W2-T2 (server), W5-T8 (client), W6-T2 (docs), and spec §7.1.
- `realtime-snapshot` is the author string used in both W5-T2 (impl) and W5-T11 (test assertion).

If any divergence is discovered during execution (e.g., the actual `RoomTypeHandler` interface in `handler-registry.types.ts` uses different method names), conform the impl to the existing interface — the plan's named contracts are pinned at the spec level; method names can shift to match repo reality.

---

## Plan complete

Spec: `docs/specs/2026-06-04-phase-3-realtime-design.md` (commit `51ac44a`).
Plan: `docs/plans/2026-06-04-base-refactor-phase-3-realtime.md` (this file).

