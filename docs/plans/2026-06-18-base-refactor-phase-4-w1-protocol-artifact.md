# Phase 4 W1 — Canonical Broadcast Protocol Artifact (Implementation Sub-Plan)

> **For agentic workers:** steps use checkbox (`- [ ]`) syntax. Implement
> task-by-task; each ends green (HW suite ≥ 283 passed + new tests) before the
> next. TDD where a task says "(TDD)".
>
> **Reshaped 2026-06-20** to match `docs/specs/2026-06-20-broadcast-box-architecture-design.md`:
> the protocol is **greenfield** (nothing public depends on the old shapes — no
> sunset/migration), and the catalog now carries schedule-push / session-manifest
> / A-V-upload / stream-control.

**Goal:** Define **one canonical wire-protocol artifact** (a JSON Schema) as the
single source of truth for the appliance↔CivicPress contract; implement the
clean format on the hardware client (deleting the old defensive multi-shape
parsing outright); collapse command dispatch to a table; consolidate the
reconnect paths; and make the device headless (kill its control UI). Closes
**BB-HW-001, BB-HW-004, BB-HW-005, BB-HW-006, BB-HW-017** and advances
**BB-HW-014**.

**Design doc:** `docs/specs/2026-06-20-broadcast-box-architecture-design.md`.
**Parent plan:** `docs/plans/2026-06-18-base-refactor-phase-4-broadcast-box-hw.md` §3 W1.

**Repos / branches:**
- HW client (primary): `civicpress-broadcast-box`, branch `refactor/phase-4-w1-protocol` off W0 tip `23b87c9`.
- Monorepo (shared package): branch `refactor/phase-4-w1-protocol` off `dev`.
- Server binding is **Phase 5** (the broadcast-box module is paused); W1 defines
  the full catalog + binds the appliance side.

**Policy:** no push to `origin/main` until the audit completes; `--no-verify`
sanctioned for refactor commits (master plan §9.1). HW repo is backed up privately
to `CivicPress/BroadcastBox` (workspace-003).

---

## 0. Decisions (from the design doc)

1. **JSON Schema (draft 2020-12), not `.proto`** — transport stays JSON over
   WebSocket; codegen both languages (pydantic via `datamodel-code-generator`;
   TS via `json-schema-to-typescript`).
2. **Canonical home = `packages/broadcast-protocol/`** (editor-schema precedent);
   HW repo vendors a byte-identical copy + generates pydantic; identity gate
   prevents drift.
3. **Greenfield — no back-compat.** Implement the clean typed format
   (`{type, id, timestamp, action|event, payload}`, `ack.commandId`); **delete**
   the three legacy inbound shapes (`type=control`, no-`type`) with no migration.
4. **Schedule push + session manifest:** the protocol carries upcoming `session`
   records (schedule + agenda + visibility) to the device for offline autonomy,
   and the device's uploads reference the `session` they belong to.

---

## 1. Message catalog (the schema)

Base `{type, id(uuid), timestamp(ISO-8601), payload?}` + discriminated `oneOf` on `type`:

- **CP → device:** `command` (top-level `action`), `schedule.push` (upcoming
  sessions: id, scheduled_start/end, agenda, visibility, assigned_device),
  `stream.configure|start|stop` (external RTMP target — key handled as a secret),
  `preview.answer`, `preview.ice_candidate`, control (`connection.ack`, `error`,
  `re_enrolled`, `auth_failed`).
- **device → CP:** `ack` (`commandId`, success, error/errorCode/…), `status`,
  `event` (`device.connected`, …), `session.manifest` (which session an upload
  belongs to + `capture` block: device, segments, timing), `av.upload.*` (or a
  documented HTTP upload referenced by the manifest), `preview.offer`,
  `preview.ice_candidate`, `preview.stopped`.

(See the design doc §4/§9 for the `session`/`capture` field shapes.)

---

## 2. Task execution order

```
Pre-flight      →  branches off W0 tip (HW) + dev (monorepo); baseline test snapshot
W1a (schema)    →  T1 → T2 → T3 → T4 → T5     canonical artifact + codegen + fixtures
W1b (HW bind)   →  T1 → T2 → T3 → T4          implement clean protocol; delete old parsing
W1c (dispatch)  →  T1 → T2 → T3               elif chain → table       [parallel w/ W1b]
W1d (reconnect) →  T1 → T2 → T3 → T4          4 paths → 1              [largest; may spill]
W1e (doc)       →  T1 → T2                    regenerate protocol doc from schema
W1f (headless)  →  T1 → T2 → T3               remove device control UI (BB-HW-017)
Closeout        →  registry closures; memories; merges
```

---

## 3. Workstreams

### W1a — Canonical protocol artifact
- [ ] **T1.** Create `packages/broadcast-protocol/` (copy `packages/editor-schema/`
      structure). Add to `pnpm-workspace.yaml` (add `packages/*` if the glob is
      missing it).
- [ ] **T2.** Author `schema/broadcast-protocol.schema.json` (draft 2020-12) for
      the full §1 catalog, incl. `schedule.push` + `session.manifest` + `capture`.
      `protocolVersion` const.
- [ ] **T3.** `build`: `json-schema-to-typescript` → `dist/types.ts`; export an
      ajv `validateMessage()` + `PROTOCOL_VERSION`.
- [ ] **T4. (TDD)** A valid fixture per message type; `validateMessage` round-trips.
- [ ] **T5.** Commit (monorepo branch).

### W1b — Hardware client: implement the clean protocol
- [ ] **T1.** Vendor `protocol/broadcast-protocol.schema.json` (byte-identical);
      `make protocol-sync` + `make protocol-check` (identity gate).
- [ ] **T2.** Add `datamodel-code-generator` (dev dep); `make protocol-types` →
      pydantic models in `connector/protocol_models.py`.
- [ ] **T3. (TDD)** Replace inbound parse (`websocket_client.py:476–565`) with a
      schema-driven parse into pydantic models — **only** typed messages; `command`
      reads top-level `action`. **Delete** the `type=control` and no-`type`
      branches entirely (greenfield — no warning/safety valve needed).
- [ ] **T4.** Build outbound (`ack`, `status`, `session.manifest`, `preview.*`,
      `device.connected`) via generated models; test every outbound validates.
      Full HW suite green. Commit.

### W1c — Command dispatch table (BB-HW-005) *(parallel w/ W1b)*
- [ ] **T1. (TDD)** Replace the `if/elif command_type` chain
      (`command_handler.py:190–234`) with a `{action: handler}` dict; map aliases
      (`get_sources`/`list_sources`; `set_pip`/`pip.configure`).
- [ ] **T2.** Unknown action → structured **error ack**; keep protocol-level
      special-cases (`connection.ack`, `error`→re-enroll).
- [ ] **T3.** Tests: all actions covered; aliases resolve; unknown → error ack. Commit.

### W1d — Reconnect consolidation (BB-HW-006) *(largest; may spill to followup)*
- [ ] **T1.** Extract the 4 paths (`connect`/`_handle_disconnect`/`_reconnect_loop`/
      `_health_monitor_loop`) into one `ReconnectionManager` over the existing
      `ConnectionState` machine; one backoff, one reconnect task.
- [ ] **T2. (TDD)** State-transition + backoff + no-double-reconnect tests.
- [ ] **T3.** `websocket_client.py` shrinks toward transport + message-pump;
      record before/after LoC. Commit. *(T1–T2 can land; LoC-trim may spill.)*

### W1e — Regenerate the protocol doc (BB-HW-001 + BB-HW-014)
- [ ] **T1.** Replace the 1,626-line `docs/civicpress-integration-protocol.md`
      with a slim doc generated from the schema (single source of truth). Fold in
      `DEVICE-CAPABILITIES-MESSAGES.md`.
- [ ] **T2.** `make protocol-doc` (schema → markdown catalog). Commit.

### W1f — Headless device: remove the control UI (BB-HW-017)
- [ ] **T1.** Remove the `frontend/` control app; keep only the enrollment/setup
      surface (AP mode). Confirm nothing in the capture/connector path imports it.
- [ ] **T2.** Update docs/Makefile (drop `frontend-*` control targets; keep
      enrollment). Update README to "headless; controlled via CivicPress."
- [ ] **T3.** Suite green; commit. *(Can sequence independently of W1a–W1e.)*

---

## 4. Exit criteria
- [ ] `packages/broadcast-protocol/` with ajv-validated fixtures for every message.
- [ ] HW client speaks only the clean protocol; old multi-shape parsing deleted;
      outbound validates; vendored copy verified identical to canonical.
- [ ] Command dispatch is a table; unknown actions → error ack.
- [ ] Reconnect logic is one path (or a documented, tracked spill).
- [ ] Protocol doc generated from schema.
- [ ] Device control UI removed; device is headless.
- [ ] HW suite green (≥ 283 passed) + new tests.
- [ ] Closes BB-HW-001/004/005/006/017; advances BB-HW-014. (Server binding of
      the artifact → Phase 5.)

## 5. Risks & mitigations
- **No live server to integration-test against** (module paused → Phase 5):
  schema-conformance fixtures are the contract; a Phase-5 task binds the server +
  adds a real E2E test. Stated, not silent.
- **Vendored-copy drift:** `make protocol-check` identity gate.
- **W1d scope** (1,431-LoC file): time-box; behavioural consolidation first,
  LoC-trim may spill.
- **W1f UI removal** may surface hidden coupling: grep imports first; the device
  must still enroll.

## 6. Open items (not blocking)
- Final `schedule`/`capture`/`session.manifest` field names — lock with the schema.
- BB-HW-010 (query-param token) is adjacent (`websocket_client.py:203–218`) →
  scheduled for W4 security; take it during W1d only if the refactor makes the
  header-only change free (cross-reference BB-HW-010).
