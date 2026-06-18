# Phase 4 W1 — Canonical Broadcast Protocol Artifact (Implementation Sub-Plan)

> **For agentic workers:** steps use checkbox (`- [ ]`) syntax for tracking.
> Implement task-by-task; each task ends green (HW suite ≥ 283 passed + new
> tests) before the next begins. TDD where a task says "(TDD)".

**Goal:** Replace the three divergent, defensively-coerced on-the-wire message
shapes with **one canonical protocol artifact** (a JSON Schema) that is the
single source of truth for both repos; bind the hardware client to it; collapse
the command dispatch from a 23-branch `elif` chain to a table; and consolidate
the reconnect god-paths. Closes **BB-HW-001, BB-HW-004, BB-HW-005, BB-HW-006**
and contributes to **BB-HW-014** (the 1,626-line protocol doc).

**Parent plan:** `docs/plans/2026-06-18-base-refactor-phase-4-broadcast-box-hw.md` §3 W1.
**Master plan:** `docs/plans/2026-05-17-base-refactor-master-plan.md` §5 Phase 4.
**Audit section:** `docs/audits/sections/civicpress-broadcast-box-hardware.md`.

**Repos:**
- HW client (primary): `civicpress-broadcast-box` (Python, pydantic already in deps).
- Server (secondary, **paused until Phase 5**): monorepo `modules/broadcast-box/`
  exists only on the `broadcast-box` git branch; its `src/types/index.ts` +
  `src/websocket/protocol.ts` are already clean and typed.

**Policy reminders:**
- No push to `origin/main` until the audit completes (memory:
  `[No push to main until audit done]`). HW work stays on a branch in that repo.
- `--no-verify` is sanctioned for refactor commits (master plan §9.1).
- Branch (HW repo): `refactor/phase-4-w1-protocol`, off the W0 tip `23b87c9`.
- Branch (monorepo, for the shared package): `refactor/phase-4-w1-protocol`, off `dev`.

---

## 0. Decisions (reversible; stated up front)

1. **Artifact format = JSON Schema (draft 2020-12), not `.proto`.** The transport
   is JSON over WebSocket; JSON Schema validates the *existing* wire format with
   **zero transport change**, and codegen exists for both languages
   (`datamodel-code-generator` → pydantic for Python; `json-schema-to-typescript`
   → TS for the server). `.proto` would impose a binary wire format and a much
   larger change for no benefit here.
2. **Canonical home = a new monorepo workspace `packages/broadcast-protocol/`**,
   mirroring the Phase 3 `packages/editor-schema/` precedent. The HW repo vendors
   a **byte-identical copy** under `protocol/` and generates pydantic from it; a
   check asserts the two copies are identical so they cannot drift. Rationale:
   Phase 5 reintroduces the broadcast-box *module* into the monorepo, so the
   schema's long-term home is there; staging it now means Phase 5 just binds the
   server to an artifact that already exists.
3. **Canonical format = the clean typed shape the server already uses.** Every
   message is `{ "type", "id" (uuid), "timestamp" (ISO-8601), "payload"? }` plus:
   - `command`: top-level `action` (string) + `payload`
   - `event`: top-level `event` (string) + `payload`
   - `ack`: `commandId` (NOT `id`-as-correlator), `success`, optional
     `error`/`errorCode`/`errorType`/`errorDetails`, optional `payload`
   - `status`, `heartbeat`, `preview.offer|answer|ice_candidate|stopped`
   - control: `connection.ack`, `error`, `re_enrolled`, `auth_failed`
4. **Sunset both legacy inbound shapes**: `type=control` (the `event`→`action`
   normalization) and the no-`type` `{action, commandId, deviceId}` shape. Keep
   only `type=command` / `type=event`. Safety valve: for one release the client
   **logs a structured `protocol_legacy_message_dropped` warning and ignores**
   the message rather than silently coercing it (no pilots are deployed, and the
   current server already emits the typed format, so this is low-risk).

---

## 1. Current-state evidence (from 2026-06-18 scoping)

- **Three inbound shapes** coerced in `websocket_client.py:476–565`
  (`type=command` standard · `type=control` legacy `event` · no-`type`
  `{action, commandId}`). All converge to
  `handle_command(command_type, payload, command_id)`.
- **Outbound** (already typed): `ack` (`command_handler.py:2404`), `status`
  (`status_reporter.py:266` + wrapper `websocket_client.py:367`),
  `preview.offer|ice_candidate|stopped` (`websocket_client.py:1115/1145/1129`),
  `device.connected` event (`websocket_client.py:1222`).
- **Dispatch**: 23-branch `if/elif command_type` chain
  (`command_handler.py:190–234`), 15-dependency constructor.
- **Reconnect**: 4 overlapping paths (`connect` / `_handle_disconnect` /
  `_reconnect_loop` / `_health_monitor_loop`) over the `ConnectionState` enum in
  `websocket_state.py`. Exponential backoff `reconnect_delay`→`max_reconnect_delay`.
- **Server** (`broadcast-box` branch): `protocol.ts` switches on `message.type`
  (`command|event|ack|heartbeat|status|preview.*`); `types/index.ts` defines
  `BaseMessage/CommandMessage/EventMessage/AckMessage`. **This is the de-facto
  canonical shape** — W1 codifies it.
- **Doc lie (BB-HW-001)**: `docs/civicpress-integration-protocol.md` (1,626 lines)
  is vague/wrong on command nesting; `action` is top-level in code, not under
  `payload`.

---

## 2. Task execution order

```
Pre-flight  →  branches off W0 tip (HW) and dev (monorepo); baseline test snapshot
W1a (schema)    →  T1 → T2 → T3 → T4 → T5        (the canonical artifact + codegen + fixtures)
W1b (HW bind)   →  T1 → T2 → T3 → T4 → T5        (one inbound format; legacy branches deleted)
W1c (dispatch)  →  T1 → T2 → T3                  (elif chain → table)   [independent of W1b]
W1d (reconnect) →  T1 → T2 → T3 → T4             (4 paths → 1)          [largest; may spill]
W1e (docs)      →  T1 → T2                        (regenerate the protocol doc from schema)
Closeout    →  closure notes in registry; memories; --no-ff merges
```

W1c is independent of W1b and can run in parallel (different files:
`command_handler.py` dispatch vs `websocket_client.py` parse). W1d is the
riskiest; if time-boxed it may spill to a `W1d-followup` without blocking the
schema/dispatch wins.

---

## 3. Workstreams

### W1a — The canonical protocol artifact

- [ ] **T1.** Create `packages/broadcast-protocol/` (copy structure from
      `packages/editor-schema/`): `package.json`, `tsconfig.json`,
      `vitest.config.ts`, `src/`, `schema/`. Add `packages/broadcast-protocol`
      to `pnpm-workspace.yaml` (note: `packages/editor-schema` may also be
      missing from the workspace glob — add `packages/*` if so).
- [ ] **T2.** Author `schema/broadcast-protocol.schema.json` (draft 2020-12):
      a `BaseMessage` `$defs` + a discriminated `oneOf` on `type` covering
      `command`, `event`, `ack`, `status`, `heartbeat`,
      `preview.offer|answer|ice_candidate|stopped`, and the control messages
      (`connection.ack`, `error`, `re_enrolled`, `auth_failed`). Field names per
      §0.3, sourced from the server `types/index.ts` (broadcast-box branch) +
      the HW outbound shapes (status payload from `status_reporter.py:280–541`,
      `device.connected` payload). Include a top-level `protocolVersion` const
      (`"1.0.0"`).
- [ ] **T3.** `package.json` `build`: `json-schema-to-typescript` →
      `dist/types.ts`; export an `ajv`-compiled `validateMessage(msg)` +
      `PROTOCOL_VERSION`. (TS types are for the Phase-5 server; the validator is
      usable now in tests.)
- [ ] **T4. (TDD)** Fixtures + tests: one valid sample per canonical message
      type (round-trips through `validateMessage`), AND negative cases asserting
      the two sunset shapes (`type=control`, no-`type`) **fail** validation.
- [ ] **T5.** Commit on the monorepo branch. Closure-worthy artifact for
      BB-HW-001/004 (server half binds in Phase 5).

### W1b — Hardware client: one inbound format (BB-HW-004)

- [ ] **T1.** Vendor the schema: `protocol/broadcast-protocol.schema.json` in the
      HW repo (byte-identical copy). Add `make protocol-sync` (copies from the
      monorepo package if present) + `make protocol-check` (fails if the vendored
      copy differs from canonical) so they cannot drift.
- [ ] **T2.** Add `datamodel-code-generator` to `pyproject` `[dev]`; add
      `make protocol-types` → generate pydantic models into
      `src/broadcast_box/services/connector/protocol_models.py` (committed,
      regenerable).
- [ ] **T3. (TDD)** Rewrite the inbound parse (`websocket_client.py:476–565`):
      validate/parse each frame into a pydantic model; accept **only** `type`-
      tagged messages; `command` reads top-level `action`, `event` reads
      top-level `event`. **Delete** the `type=control` branch and the no-`type`
      `{action, commandId}` branch. Legacy frame → `protocol_legacy_message_dropped`
      warning + ignore (§0.4). Tests: each canonical inbound parses; each legacy
      shape is dropped-with-warning.
- [ ] **T4.** Build outbound messages (`ack`, `status`, `preview.*`,
      `device.connected`) via the generated models so they are schema-valid by
      construction; keep the `send()` wrapper. Add a test asserting every
      outbound message validates against the vendored schema.
- [ ] **T5.** Full HW suite green (≥ 283 passed) + new protocol tests. Commit.

### W1c — Command dispatch table (BB-HW-005) *(parallelizable with W1b)*

- [ ] **T1. (TDD)** Replace the `if/elif command_type` chain
      (`command_handler.py:190–234`) with a dispatch dict
      `{action: bound_handler}`, built once in the constructor. Map aliases to
      one handler (`get_sources`/`list_sources`; `set_pip`/`pip.configure`).
- [ ] **T2.** Unknown action → structured **error ack** (not a silent no-op);
      preserve the existing protocol-level special-cases (`connection.ack`,
      `error`→re-enrollment).
- [ ] **T3.** Tests: table covers all ~21 actions; aliases resolve; unknown
      action returns an error ack. *(Grouping the 15 constructor deps into a
      context object is a nice-to-have follow-up, NOT W1-blocking.)* Commit.

### W1d — Reconnect consolidation (BB-HW-006) *(largest; may spill to followup)*

- [ ] **T1.** Extract the 4 overlapping paths (`connect` / `_handle_disconnect`
      / `_reconnect_loop` / `_health_monitor_loop`) into a single
      `ReconnectionManager` driven by the existing `ConnectionState` machine
      (`websocket_state.py`); one backoff implementation, one reconnect task.
- [ ] **T2. (TDD)** Tests for the state transitions
      (`connected→disconnected→reconnecting→connected`), backoff math, and the
      double-reconnect race the current lock/unlock dance guards against.
- [ ] **T3.** `websocket_client.py` shrinks toward transport + message-pump;
      record before/after LoC (target a meaningful cut from 1,431).
- [ ] **T4.** Full suite green. Commit. *(If time-boxed, T1–T2 can land and T3
      LoC-trim spill to a `W1d-followup` — note it in the closure.)*

### W1e — Regenerate the protocol doc (BB-HW-001 + BB-HW-014)

- [ ] **T1.** Replace the 1,626-line `docs/civicpress-integration-protocol.md`
      with a slim doc: a short human intro + a **message catalog generated from
      the schema** (single source of truth, so it cannot lie again). Fold
      `DEVICE-CAPABILITIES-MESSAGES.md` in or regenerate it.
- [ ] **T2.** Add a `make protocol-doc` generator (schema → markdown table) so
      the doc regenerates rather than drifts. Commit.

---

## 4. Exit criteria

- [ ] `packages/broadcast-protocol/` exists with an ajv-validated fixture for
      **every** canonical message; the two legacy shapes fail validation.
- [ ] HW client accepts **exactly one** inbound format; `type=control` and
      no-`type` branches are deleted; every outbound message validates against
      the vendored schema; vendored copy is verified identical to canonical.
- [ ] Command dispatch is a table; unknown actions return an error ack.
- [ ] Reconnect logic is one path (or a documented, tracked spill).
- [ ] `civicpress-integration-protocol.md` is generated from the schema; no
      hand-maintained wire-shape prose remains.
- [ ] HW suite green (≥ 283 passed) + new protocol/dispatch/reconnect tests.
- [ ] Findings closed: BB-HW-001, BB-HW-004, BB-HW-005, BB-HW-006 (server-side
      binding of the artifact tracked into Phase 5); BB-HW-014 advanced.

---

## 5. Risks & mitigations

- **Dropping legacy shapes breaks an old server.** Mitigation: no pilots are
  deployed; the current server (`broadcast-box` branch) already emits the typed
  format; one-release warning-log safety valve (§0.4).
- **No live server to integration-test against** (module paused until Phase 5).
  Mitigation: schema-conformance fixtures derived from the server's own TS types
  are the contract; add a Phase-5 task to bind the server to the artifact + a
  real end-to-end test. State this limitation in the closure (no silent gap).
- **Vendored-copy drift** between repos. Mitigation: `make protocol-check`
  identity gate (and a CI step when the repos reach CI).
- **W1d scope creep** (1,431-LoC file). Mitigation: time-box; T1–T2 (behavioural
  consolidation) are the value; LoC-trim may spill to a followup.

---

## 6. Open items (not blocking W1 start)

- Confirm `packages/editor-schema` is wired into `pnpm-workspace.yaml` on `dev`
  (it exists on disk but the workspace glob lists only cli/core/modules/*); W1a
  T1 fixes the glob if needed.
- BB-HW-010 (query-param token) is adjacent (same `websocket_client.py` connect
  path, lines 203–218) but is scheduled for **W4 security**; do not fold it into
  W1 unless the reconnect refactor (W1d) makes the one-line header-only change
  free — if so, take it and cross-reference BB-HW-010.
