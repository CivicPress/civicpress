# Phase 5 — Reintroduce the BroadcastBox Server Module (Kickoff Sub-Plan)

> Started 2026-06-22, ahead of the master-plan sequence (Phase 5 before Phase 4's
> W2/W3) — justified: W1d's reconnect consolidation and the BB-HW-013 enrollment
> work are **gated on the server half of the contract**, and the canonical
> protocol is a two-sided contract only the device currently binds.

**Goal (kickoff scope):** a real **device ↔ server round-trip + enrollment**,
both bound to the canonical `@civicpress/broadcast-protocol` schema — so the
appliance (W1b/c) has something to talk to and the coupled cluster unblocks.

> **Status (2026-06-22):** **P5a–P5e done.** Module reintroduced + builds green
> vs current core (`a1c776f`, `c13cb68`); protocol bound to the canonical schema
> + 14-test contract suite (`ec10e34`, P5b/c); one-time/revocable enrollment
> server-side (`3c02e2c`, P5d). **P5e:** the 6 stale failures are rewritten to
> one-time semantics — `registerDevice` now has positive consume / reject-expired
> / reject-used / re-pair-with-fresh-code tests; the integration enroll→register
> round-trip uses a stateful in-memory enrollment store (used codes stop
> resolving); `switch_source` asserts the canonical `ERR_SOURCE_NOT_FOUND`; and
> `refreshToken` is fixed at the source — device tokens now carry a `jti`, so a
> refresh always rotates the token instead of returning a byte-identical one
> (the `uuidv4` import was already present but unused). **Module suite 108
> passed / 0 failed; `tsc` build clean.** Device-side enrollment hardening landed
> in the HW repo (`17a1759`). **Remaining:** BB-HW-010 header-only auth
> (coordinated device + `@civicpress/realtime` header read); then uploads/sessions
> + AI-service trigger (deferred).

**Master plan:** `docs/plans/2026-05-17-base-refactor-master-plan.md` §5 Phase 5.
**Architecture:** `docs/specs/2026-06-20-broadcast-box-architecture-design.md`.
**Protocol:** `packages/broadcast-protocol/` (`@civicpress/broadcast-protocol`).
**Enrollment strategy:** memory `broadcast-box-enrollment-strategy` (BB-HW-013).

## 0. What exists (paused `broadcast-box` branch)
`modules/broadcast-box/` — `@civicpress/broadcast-box` (deps `@civicpress/core`,
`@civicpress/realtime`, uuid, bcrypt), **35 src files + 11 test files**:
- `api/{devices,sessions,uploads}`, `realtime/device-room-handler`,
  `rooms/device-room`, `websocket/{protocol,command-handlers,event-handlers}`.
- `services/{device-auth,device-websocket-auth,device-manager,
  device-connection-tracker,session-controller,upload-processor,enrollment-cleanup}`.
- `models/{device,broadcast-session,device-event,enrollment-code,upload-job}` +
  SQL migrations (incl. `002_enrollment_codes.sql`).
- Registration hooks: `registerBroadcastBoxServices`, `registerBroadcastBoxRoutes`
  (module-contract integration; plugs websocket into `@civicpress/realtime`).
**This is reintroduce-AND-adapt, not drop-in.**

## 1. Decisions (this kickoff)
1. **Scope = protocol round-trip + enrollment.** In: protocol/websocket layer +
   device-auth + connect→`connection.ack`→`command`/`ack`/`status` + the
   enrollment-code path. **Deferred:** uploads, sessions, upload-processor, the
   AI-service trigger.
2. **Civic data → core `session` records; module SQL for operations only.** The
   meeting/minutes live as core `session` records (Markdown/Git, source of
   truth). The module's SQL keeps only operational state: devices, connections,
   upload jobs, enrollment codes. The `broadcast-session` SQL model is **dropped
   / not reintroduced** (sessions become core records when uploads land, later).
3. **Bind to the canonical schema.** Replace the module's `websocket/protocol.ts`
   shapes with validation against `@civicpress/broadcast-protocol` (add it as a
   dep; generate TS types from the same schema the device uses).
4. **Enrollment = one-time, revocable codes** (BB-HW-013): the server consumes a
   code on first enrollment and can revoke; on `AUTH_FAILED` the device does NOT
   silently re-enroll (it needs a fresh code). The module already has an
   `enrollment-code` model + migration + cleanup service to build on.
5. **Drop the query-param token** (BB-HW-010): device auth via header only.

## 2. Steps
- **P5a — reintroduce + compile.** Branch off `dev`; `git checkout broadcast-box --
  modules/broadcast-box`; register in `pnpm-workspace.yaml`; add to deps; trim to
  the kickoff scope (defer upload/session machinery); get it building against
  *current* core/realtime (expect drift — the module predates recent core changes).
- **P5b — bind protocol.** Add `@civicpress/broadcast-protocol` dep; generate TS
  types; validate inbound frames against the schema in `websocket/protocol.ts`
  (mirror the device's jsonschema gate). Adapt `command-handlers`/`event-handlers`
  to the canonical envelope (top-level `action`, `ack.commandId`, …).
- **P5c — device↔server round-trip.** Device connects (header auth), server sends
  `connection.ack`, a `command` round-trips to an `ack`, `status` is accepted.
  **Integration test using the shared schema from both sides.**
- **P5d — one-time enrollment** (BB-HW-013): enrollment endpoint consumes a
  one-time code; revocation supported; no silent re-enroll. Drop query-param
  token (BB-HW-010).
- **P5e — green + closure.** Adapt the module's 11 test files to the kickoff
  scope; full monorepo suite green; closure notes.

## 3. Test strategy
Reuse/adapt the module's existing tests (`protocol`, `device-auth`,
`command-handlers`, `event-handlers`, `connection-tracker`, `device-manager`,
plus `integration`). Add a **device↔server contract test** that drives both ends
against `@civicpress/broadcast-protocol` (the payoff of the two-sided artifact).

## 4. Exit criteria (kickoff)
- [x] Module reintroduced, trimmed to scope, **builds** against current core/realtime.
- [x] `websocket/protocol.ts` validates against the canonical schema (both sides bound).
- [x] Device↔server round-trip: connect → `connection.ack` → `command`/`ack` → `status`.
- [x] One-time, revocable enrollment; no silent re-enroll — server + device done and
      locked by tests. **Header-only auth (BB-HW-010) still open** (coordinated change).
- [x] Module suite green (108/108) + `tsc` clean; module tests adapted to scope.
- [x] Unblocks W1d consolidation + finishes the BB-HW-013 device side.

## 5. Risks
- **Module drift from current core** (it predates Phase 2–4 core changes) — P5a
  will surface compile errors; trimming to scope reduces the surface.
- **Reintroducing broadcast-box to the base** — the sanctioned endgame, done
  cleanly via the module contract, on a branch; the `origin/main` freeze holds.
- **Scope creep** — uploads/sessions/AI trigger are explicitly deferred.
