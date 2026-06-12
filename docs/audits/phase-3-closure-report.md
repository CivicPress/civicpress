# Phase 3 Realtime Reintroduction — Closure Report

**Date:** 2026-06 (closure; pending the `--no-ff` merge to `dev`)
**Branch:** `refactor/phase-3-realtime` (local-only per `refactor-push-policy`)
**Branched off:** `dev` at `3008fa3`
**Plan:** `docs/plans/2026-06-04-base-refactor-phase-3-realtime.md`
**Anchor master plan:** `docs/plans/2026-05-17-base-refactor-master-plan.md` §4 (phase map) + §5 (Phase 3)
**Anchor design spec:** `docs/specs/2026-06-04-phase-3-realtime-design.md`
**Canonical architecture spec:** `docs/specs/realtime-architecture.md`

---

## Summary

Phase 3 is complete on its in-scope workstreams. Six workstreams (W1–W6) landed
on `refactor/phase-3-realtime`. The realtime module is back as a **generic,
Yjs-only** WebSocket server — all broadcast-box / device code excised — with the
manifesto-relevant **Yjs → Markdown round-trip wired end-to-end**, writing back
to a **review-gated record draft** (not an auto Git commit).

Master-plan exit criteria — both met:

- `modules/realtime/src/realtime-server.ts`: **3,581 → 1,495 LoC** (target
  `< 1,500`).
- All `realtime-*` findings closed: **realtime-001 … realtime-014** (14).
- Exit-criterion test `tests/realtime/exit-criterion-offline-edit-reconnect.test.ts` — green.
- Exit-criterion test `tests/realtime/exit-criterion-collab-writes-markdown.test.ts` — green (validated against a real DB).

### A key as-shipped decision (writeback model)

The plan and the design spec (§6.2/§6.3) described the Markdown writeback as
`recordManager.saveDraft(...)` producing a **Git commit** authored
`realtime-snapshot`. That method was fictional. **As shipped (a deliberate user
decision in W5-T11, "draft now, revisit Git later")** the writeback saves a **DB
draft** — `record_drafts.markdown_body` via
`DatabaseService.getDraft/createDraft/updateDraft`, authored `realtime-snapshot`
— and does **not** auto-commit to Git. Git history is produced when a **human
publishes** the draft. The "collaborative edits as auditable Git civic events"
vision is a **deferred follow-up** (W6 documented it; §6.2/§6.3 carry dated
as-shipped corrections; `record-room-handler.ts` carries the
`TODO(phase-3-followup)`).

Two other shaping decisions: realtime is wired **in-process with the API** (own
port, default 3001); and `@civicpress/editor-schema` includes **GFM tables** (a
user decision so budget/schedule tables aren't lost), with a content-loss guard
that falls non-round-trippable records (raw HTML / footnotes) back to the
single-user CodeMirror editor.

---

## Workstream outcomes

### W1 — Source merge + device-code excise ✓

Cherry-picked the realtime tree onto the fixed base and excised the broadcast-box
device code, collapsing the dual-path server to the handler-registry path only.

- `8265ccd` — cherry-pick + excise broadcast-box device code.

Closes: **realtime-004** (3,581-LoC dual-path god-file — broadcast-box legacy
removed), **realtime-009** (device-specific concerns in a generic Yjs server),
**realtime-010** (legacy device-ACK normalizer), **realtime-013** (emoji-heavy
WebRTC-preview logs). Contributes to **realtime-001/002** (disconnect cleanup
paths consolidated).

### W2 — Security + dead-code cleanup ✓

Closed the connection-limit leaks, reordered auth to run **before** limit
accounting, and removed dead code + `: any`.

- `a28d310` — drop device-auth bcrypt dep from the integration test.
- `d77eee8` — close the connection-limit leak; **auth-first** ordering.
- `411dcb1` — delete the dead participant-color palette.
- `1bd9755` — eliminate `: any` across `realtime/src`; drop dead device auth.
- `c48717e` — close a connection-count leak on the close-during-setup race.

`connection-limits.test.ts` asserts per-IP / per-user enforcement and the
`4029` / `4001` close codes (plus the setup-race leak).

Closes: **realtime-001** (per-user limit unreachable / `userConnections` leak),
**realtime-002** (per-IP `connectionCounts` not decremented on all paths),
**realtime-007** (dead `generateParticipantColor`/`PARTICIPANT_COLORS`),
**realtime-012** (the 46 `: any` in `realtime-server.ts`).

### W3 — Shared editor-schema + server-side serializer ✓

Created the `packages/editor-schema/` workspace (`@civicpress/editor-schema`)
and wired the server-side serializer.

- `ca715ca` — add `packages/*` workspace + editor-schema skeleton.
- `3aa165b` — StarterKit-subset round-trip.
- `4abbd40` — civic-ref nodes + Markdown rules.
- `38cc750` — Yjs ↔ Markdown helpers.
- `8f43b63` — `YjsRoom.serializeToMarkdown` via `@civicpress/editor-schema`.
- `e47153d` — canonicalize the `records:` room-type key.
- `cc1d777` — GFM table support (round-trip).

Public surface: `editorSchema`, `civicRefNodeSpec`, the prosemirror-markdown
serializer + markdown-it parser, and the `yXmlFragmentToMarkdown` /
`prosemirrorJSONToYDoc` Yjs helpers. 575 LoC src + 359 LoC tests.

Closes: **realtime-014** (server-side `toMarkdown()` returned XML, not Markdown —
now a real Yjs→Markdown round-trip).

### W4 — Persistence rework ✓

Reworked snapshots from opaque BLOBs into integrity-checked, format-versioned,
size-aware, TTL-cleaned rows.

- `cf8d721` — snapshot schema: integrity hash, format version, TTL columns.
- `274cf0e` — integrity hash + format version on persist/load.
- `a564c27` — pin the snapshot-oversize warning + persist-anyway behavior.
- `85e9a05` — snapshot TTL cleanup + scheduling.

Added columns: `integrity_hash`, `format_version`, `byte_size`, `created_at`
(`realtime_snapshots`). Constants: `SNAPSHOT_TTL_MS = 48h`, a 6h cleanup sweep,
`MAX_SNAPSHOT_BYTES` (warn, not reject). On load, a hash mismatch or too-new
format version re-seeds from Markdown.

Closes: **realtime-005** (opaque/unsigned/unbounded Yjs snapshot BLOBs).

### W5 — API + UI wire + exit-criteria tests ✓

Landed `RecordRoomHandler`, the in-process API wiring, the snapshot endpoint, the
UI collaborative path, and both exit-criterion tests.

- `8d3aec8` — `RecordRoomHandler` with Markdown writeback (W5-T1+T2).
- `3a896c9` — in-process realtime wiring + `POST /records/:id/snapshot` (W5-T3+T4).
- `e7a81d1` — `useAutosave` collaborativeMode (W5-T5+T6).
- `364881a` — `useRealtimeEditor` composable, no dead scaffolding (W5-T7+T8).
- `5660e0c` — exit criterion #1: offline-edit-then-reconnect (W5-T10).
- `2af0582` — exit criterion #2: collab edit writes Markdown **draft** (W5-T11).
- `5aae074` — connection-limit churn + snapshot round-trip + integrity fallback (W5-T12).
- `0fbb660` — collaborative TipTap+Yjs editor path + content-loss guard (W5-T9).

`RecordRoomHandler` owns: server-side serializer invocation, the
Markdown-to-draft writeback, the Yjs-blob persist, and a per-room coalescing
mutex so overlapping snapshot triggers share a single in-flight write.

Closes: **realtime-003** (collab edits never reached Markdown — now written back
to the record draft on periodic / on-trigger / on-grace snapshots), **realtime-008**
(dead reconnect scaffolding in `useRealtimeEditor.ts`).

### W6 — Docs sync + closure ✓

- `c3e901d` — operator docs rewritten for the shipped binary protocol:
  `test-websocket.mjs` (real binary SYNC handshake), `TESTING.md` (real
  close-code table + auth + the non-existent CLI command removed), `DEPLOYMENT.md`
  (in-process model; real `RealtimeConfig` fields; dropped `tls.enabled` /
  `allowed_origins` / `redis.*`). Closes **realtime-006**.
- `4eaa8ad` — `realtime-architecture.md` reconciled to as-shipped; dated
  as-shipped corrections appended to design-spec §6.2/§6.3; realtime added to
  `roadmap.md` + `project-status.md` "What's Working". Closes **realtime-011**.
- This report (`docs/audits/phase-3-closure-report.md`).
- Master-plan §4 phase-map row for Phase 3 → DONE (pending `--no-ff` merge).

**Drift discovered between as-shipped and the docs, and how it was corrected:**

- The plan's TESTING.md/DEPLOYMENT.md **close codes** `4013` / `4500` / `4503`
  do **not** exist. The server actually sends `1000`, `1008` (rate limit),
  `4001` AUTH_FAILED, `4003` PERMISSION_DENIED (also covers record-not-found via
  `record_not_found` context), `4004` ROOM_TYPE_NOT_REGISTERED, `4029`
  CONNECTION_LIMIT_EXCEEDED. The table now lists the real codes.
- The plan's **config fields** were wrong: real `RealtimeConfig` is snake_case
  with `snapshots.interval` (seconds), `rooms.grace_period_ms`, `connection_cleanup.*`,
  `rate_limiting.connections_per_ip/_per_user`. There is **no**
  `snapshot.intervalMs` / `graceMs` / `maxBytes` / `ttlMs` / `cleanupIntervalMs`
  config; the 48h TTL, 6h sweep, and oversize cap are **code constants**. Docs
  fixed.
- The plan's **`civic realtime snapshots inspect`** CLI command does **not**
  exist (there are no `realtime` CLI commands at all). TESTING.md now documents a
  direct DB query and marks an inspect command "not implemented today".
- The design spec's **`recordManager.saveDraft` → Git commit** writeback was
  fictional; corrected to the as-shipped DB-draft model (see Summary).
- The architecture spec's **JSON *document* protocol** (JSON `sync` updates /
  `room_state`) and its **HTTP collab-snapshot endpoints** were never shipped;
  replaced with the binary SYNC/AWARENESS reality + the in-process model.
  (Control/lifecycle frames — `connection.ack`, `error`, and an optional
  `ping`/`pong` — are still JSON; the spec documents them accurately.)

---

## Numbers

**Original-205 findings closed in Phase 3:** **14** — realtime-001, -002, -003,
-004, -005, -006, -007, -008, -009, -010, -011, -012, -013, -014.

Mapping to workstreams:

- W1: realtime-004, -009, -010, -013 (and contributes to -001/-002).
- W2: realtime-001, -002, -007, -012.
- W3: realtime-014.
- W4: realtime-005.
- W5: realtime-003, -008.
- W6: realtime-006, -011.

**Cumulative original-205 closed:** 66 (pre-Phase-3 baseline, end of lint
followups) + 14 (Phase 3) = **80 of 205 (39%)**.

**New workspace:** `packages/editor-schema/` (`@civicpress/editor-schema`) — a
ProseMirror StarterKit-subset schema + civic-ref nodes + GFM tables +
prosemirror-markdown serializer/parser + y-prosemirror Yjs↔Markdown helpers.

**LoC delta:**

- `modules/realtime/src/realtime-server.ts`: **3,581 → 1,495** (−2,086).
- `@civicpress/editor-schema`: **+934** (575 src + 359 tests across `src/` +
  `src/__tests__/`).

**Tests:**

- realtime module (`pnpm -C modules/realtime test:run`): **148 passed / 1 skipped**.
- `@civicpress/editor-schema`: **32 passed** (4 files).
- repo-level `tests/realtime/`: the 2 exit-criterion tests + the integration
  test.
- UI vitest: **186 / 186**.
- Root node vitest: **11 failed / 1310** — all **pre-existing, documented**
  failures (EmailChannel ×5, oauth ×4, DNS-notification ×1, date-bomb ×1);
  **zero new** failures introduced by Phase 3. These belong to the test-suite
  repair session (master plan §9.1 + `known-test-issues.md`), not Phase 3.

**Build status:** `pnpm -r build` clean across all workspaces.

**Baseline fixes landed during Phase 3 (improving the dev baseline):**

- Pre-flight `express-augment.d.ts` gitignore bug fixed on dev (`5131a59`).
- `supertest` added to root devDeps — unblocked 274 api/e2e tests; root
  collection 1025 → 1310.
- D3 UI-vitest fix (vue-i18n / y-websocket / yjs vitest aliases) — UI 122 → 186
  passing.

---

## Carry-forward (deferred / out of scope)

| Item | Why deferred |
|---|---|
| Collaborative writebacks as **auditable Git civic events** (a `realtime-snapshot`-authored commit, or opt-in auto-publish / draft-history branch) | The W5-T11 user decision was "draft now, revisit Git later". Needs a governance model for collab-authored history before design. The as-shipped path writes a review-gated DB draft; a human publish produces the Git commit. |
| Richer collaborative-editor **toolbar** + interactive **civic-ref node-views** | Out of Phase 3 scope; the editor path ships functional but minimal. |
| **Browser E2E** | Integration tests use simulated y-protocols clients; real-browser E2E is a follow-up session. |
| **Multi-node** (Redis/shared-state adapter) | Not shipped; room Yjs state is per-process. Single-node is the supported topology. A Redis fan-out adapter is a documented future option. |
| The now-dead **legacy `SnapshotManager` API** (`createSnapshot` / `saveSnapshot` / `loadSnapshot` / `applySnapshot`) | Unused after the W4 schema rework + the handler-path swap; retained only as the manager's public API. Candidate for a cleanup pass. |
| The CREATE-path **record-not-found placeholder** (draft seeded with `title = recordId`, `type = 'unknown'`) | Pragmatic fallback so collaborative content isn't dropped when the source record can't be found at writeback time. |
| **Block-level civic-refs** round-trip only **inline** | Documented schema limitation. |
| **Pre-existing 11 test failures** (EmailChannel / oauth / DNS / date-bomb) | Not Phase 3's to fix — deferred to the test-suite repair session (master plan §9.1 + `known-test-issues.md`). |

---

## Sign-off

Phase 3 (Reintroduce realtime — Yjs-only, no broadcast-box code) is complete on
its in-scope workstreams. The branch `refactor/phase-3-realtime` is ready to
merge to `dev` via `--no-ff` when the user signs off. Per `refactor-push-policy`,
no remote pushes until all master-plan phases land.

**Next master-plan phase:** Phase 4 (broadcast-box hardware audit + fix).
