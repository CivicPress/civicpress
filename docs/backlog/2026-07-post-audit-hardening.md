# Post-audit hardening backlog — tracker

Source: 2026-07-14/15 "what's left" sweep after the 2026-07-02 FA-\* audit
closed (105 findings, none critical-security-tier). Full per-finding evidence
lives in the sweep journal; this file tracks execution state per batch.
Worked top-down in thematic batches on `refactor/phase-7-post-audit-hardening`
(monorepo) and `refactor/phase-5-post-audit-hardening` (BroadcastBox HW repo);
verified batches merge to `main`.

Status legend: `[ ]` open · `[~]` in progress · `[x]` landed+verified · `[-]` dropped (reason inline)

## DO FIRST

- [~] **Tier A landed on `refactor/phase-7b-tier-a` (`9572520`)** — pragmas +
  git mutex + session revocation; see the commit body for the four latent
  bugs FK enforcement exposed. **Audit-trail correction to that commit
  message (skeptic-verified):** the FA-CORE-008 idempotency-key collision it
  describes affected *directly-executed* saga contexts lacking
  `metadata.draftId` (core's saga-e2e tests + the documented direct-saga
  convention) — NOT the API/record-manager publish path, which supplies
  `metadata.draftId` and never collided. Optional follow-up (deliberate
  key-rotation, 5-min dedupe gap): include `targetStatus` in derived publish
  keys — same-draft publish-vs-archive currently share a key.
- [~] **CI on both repos** — GH Actions `ci.yml` in monorepo (pnpm frozen
  install → core-first build (core↔storage workspace cycle defeats pnpm's
  topo ordering from clean) → `-r build` → lint → registry:check →
  root(serialized, 5-file quarantine)+UI+storage+broadcast-box+transcription
  vitest suites, ffmpeg installed) and in BroadcastBox (install-locked →
  deterministic deps-check → protocol-check vs sparse-checkout of the public
  monorepo → non-hardware pytest; second job: frontend install + typecheck +
  build). **BroadcastBox side GREEN on the real runner (PR #1)** after two
  CI-only fixes the dry-run surfaced: httpx2 missing from the hash-locked dev
  deps, and frontend/pnpm-lock.yaml gitignored as a "build artifact" (now
  tracked). SHA-pinned actions; push triggers on `main` + `renovate/**` so
  Renovate branch-automerge is gated (default `ignoreTests: false`; note
  Renovate has never actually run on the repo yet — no bot commits/branches).
  Pre-commit hook slimmed to lint-staged + registry:check. `.npmrc:29`
  jammed-key fixed + `use-node-version` synced to `.nvmrc` (22.22.3).
  **Remaining:** required-status-checks branch protection needs repo admin
  (current token lacks it) — see PR bodies for the exact `gh api` commands
  (status checks only; requiring PRs would disable Renovate branch automerge).
- [ ] SQLite pragmas (`foreign_keys=ON`, WAL, `busy_timeout=5000`) on every connection
- [ ] Serialize git mutations (git mutex / `git:repo` lock) + different-record saga concurrency test
- [ ] Session revocation (`deleteUserSessions` on logout + password change)

## Tier B — security correctness

- [ ] Password-strength policy dead code → centralize in PasswordOps
- [ ] OAuth links by username only → match `(auth_provider, provider_user_id)`
- [ ] Generic-500 branch leaks raw `error.message`; route config.ts/notifications.ts through redacting helper
- [ ] Role-hierarchy cycle detection (visited set) — circular roles.yml currently denies all perms via swallowed stack overflow
- [ ] `setMockUser()` backdoor stripped behind `import.meta.dev`
- [ ] Executable uploads: warning → deny
- [ ] Realtime: enforce `max_rooms`; set WS `maxPayload`

## Tier C — correctness bugs (SCOUTED 2026-07-16, file:line below)

**Batch 4 landed on `refactor/phase-7d-tier-c` (stacked on #17):** all 9
findings below fixed across 4 thematic commits + a role-manager diamond
follow-up. (Storage, config+CLI, API-routes clusters + saga/BB/notifications.)

- [x] Storage streaming (`modules/storage/.../streaming-ops.ts`): GCS missing from the switch (L142-180, throws at L178); stream path bypasses failover/retry/metrics (calls uploadStreamTo* directly, no StorageFailoverManager); S3/Azure streamed `size` persisted as 0 (L164/L176 `request.size||0`, comment "provider will set size" is false → breaks quota)
- [x] `updateFile` (`file-mgmt-ops.ts:273-291`) never invalidates folder cache (dead `invalidateFile` at `storage-metadata-cache-adapter.ts:124`); failover-on-read returns `null` as "success" so it never fails over to the provider holding the object (`download-ops.ts` L159/L191/L306 return null; `storage-failover-manager.ts:100` treats resolved null as success)
- [x] `CIVIC_DATA_DIR` (`central-config.ts:144-156`): early-return hardcodes sqlite path AND skips the entire `.civicrc` load/merge (drops `auth` + all other config)
- [x] CLI login token (`login.ts:163-177` / `auth.ts:80-95`): never writes `~/.civicpress/token` that `resolveToken` reads (`auth-utils.ts:31-38`); human mode never prints the token either
- [x] geography `/linked-records` (`geography.ts:448-499`, cap L27) loses rows past 1000 + wrong total/totalPages; `/records/:id/raw` (`read-handlers.ts:374`) missing `optionalAuth` → editors always treated as public
- [x] record-history filter: no-op `.replace('/','/')` substring match (`history.ts:103,263`); CLI `civic history` ignores the record arg entirely (`history.ts:70`). Fix = pathspec-scoped `GitEngine.getHistory` (`git-engine.ts:139`)
- [x] publishDraft ordering (`publish-draft-saga.ts` steps L552-559): DeleteDraftStep (L402) runs after the irreversible CommitToGitStep (L362, isCompensatable=false) with a log-only no-op compensation (L423) → DB hiccup loses a committed record's draft unrecoverably
- [x] BB device health-monitor + stale-reaper implemented (`device-connection-tracker.ts:304`/`335`) but never started in production; wire at the tracker factory (`broadcast-box-services.ts:294-310`)
- [ ] UI: `useMarkdown` heading inline formatting; autosave timer unmount; editor host collab-vs-CM latch at mount (NOT in Batch 4 — UI cluster deferred)
- [ ] HW multi-output ffmpeg filtergraph pad reuse (`[v_wm]` mapped twice) — lives in the separate BroadcastBox HW repo, not this monorepo batch
- [x] `.npmrc:29` jammed keys (folded into CI batch — trailing `strict-peer-dependencies=false` never parsed; dropped it, preserving effective config)
- [x] Notifications: empty recipient dispatched silently (`notification-service.ts:278-292` returns '', no guard in sendToChannel L262); SMS/Slack config declared (`notification-config.ts:51-66`) but only email channel implemented → "Channel not found" throw if enabled

## Tier D — small, batchable

- [ ] Quota check + `acquireLock` TOCTOU
- [ ] BB in-flight commands rejected on disconnect
- [ ] BB unknown-ack raw payload → `redactSecretFields`
- [ ] HW QR f-string; `_untrack_pid` Process-vs-pid; subprocess type-hint
- [ ] HW Wi-Fi PSK off nmcli argv; reject plain-http enrollment
- [ ] `GET /api/users` limit cap; drop DEBUG perm dump in 403
- [ ] Backup storage-files helpers DB-connection leak
- [x] BroadcastBox stray `-` file (botched `uv pip compile -o -` output) removed in CI batch

## Improvements

- [ ] **Tier-A skeptic deferrals (2026-07-16):** realtime/WS connections
  established before a revocation stay live until they reconnect — publish a
  revocation event the realtime server subscribes to (defense-in-depth);
  session-token signatures are optional-if-present (unsigned tokens accepted
  even when a secretsManager exists — require them once minted-signed);
  backup fidelity under WAL — `fs.cp` copies the `-wal`/`-shm` sidecars but a
  mid-write copy is fuzzy; checkpoint or `VACUUM INTO` from a live
  connection; UX: self-service password change logs the requester out
  everywhere — mint a fresh session or show a deliberate re-login message;
  idempotency: include `targetStatus` in derived publish keys (deliberate
  key rotation, 5-min dedupe gap).
- [ ] Enforce-or-delete dead session config (`sessionTimeout`/`maxConcurrentSessions`/`requireHttps`)
- [ ] Wire the 3 uncalled cleanup sweeps (sessions / email tokens / login_attempts)
- [ ] Move runtime `ALTER TABLE workflow_state` off the GET path
- [ ] Thread audit channel into create/update/archive/publish
- [ ] SQL-side pagination (listUnpublishedRecords, git-history, geography linked-records)
- [ ] BB redaction verify: sample several points per hidden window
- [ ] BB transcription gateway: stream instead of whole-file Buffer
- [ ] BB polling workers: status-scoped query
- [ ] realtime-005 snapshots: cap + hash + tested Markdown recovery; prune versions
- [ ] Templates route file-watch service per request → singleton
- [ ] CLI parity (`--no-color`, `view --json` purity, `list` human mode); `users:delete` confirmation

## Refactors / tech-debt

- [ ] Migration ledger (`schema_version`, stop swallowing failures)
- [ ] `withCli()` wrapper for ~30 commands
- [ ] Standardize API response/error envelopes
- [ ] HW `ffmpeg_capture.py` decomposition; `command_handler.py` dispatch table; storage provider Strategy
- [ ] Config discovery unification; DDL vs column-migration drift

## Test & CI health

- [ ] **Tier-C skeptic coverage-gap follow-up:** the geography `/linked-records`
  batch-scan fix has no test — add one that seeds >`LINKED_RECORDS_SCAN_CAP`
  (1000) records with a subset linking the geography across multiple pages and
  asserts the total is correct + no rows past page 1 are dropped. (The fix
  itself was skeptic-verified correct; termination is safe by inspection. The
  history-pathspec sibling gap IS now covered by
  `core/src/git/__tests__/git-engine-history-pathspec.test.ts`.)

- [ ] **QUARANTINE BURN-DOWN (added with the CI batch — top of this tier):**
  5 files / 11 tests fail deterministically from a CLEAN checkout of main and
  are excluded in CI only via `CIVIC_TEST_QUARANTINE=1` (list in
  vitest.config.mjs): `tests/api/config-validation.test.ts` (public config
  validation gets 403), `tests/e2e/editor-workflows.test.ts` (5 tests: editor
  create/edit flows get 403, then 404 follow-ons), `tests/broadcast-box/
  device-ws-e2e.test.ts` (2 timeouts waiting for start_session at the device),
  `tests/broadcast-box/upload-e2e.test.ts` (capture null-vs-undefined),
  `tests/cli/me.test.ts` (2: auth-required message drift). Invisible pre-CI:
  the suite only ever ran on dirty dev checkouts through a bypassed hook. The
  403 cluster smells related to the 400-vs-403 skipped-tests item and the
  quick-start/by-meeting authz follow-up below. Related discovery: several
  OTHER files (users/records/security-features/auth) fail only on DIRTY
  checkouts (leftover users → 409s, ambient tokens) — test isolation doesn't
  clean in-repo state, worth fixing in the same pass.
- [ ] `CentralConfigManager.reset()` in setup/teardown (API flakiness root cause; also lets CI drop `--fileParallelism=false` and the quarantine's serialization)
- [ ] Un-skip 8 security-critical auth tests (hides 400-vs-403 bug)
- [ ] `isLosslesslyRoundTrippable` tests
- [ ] FA-BB-002 redaction e2e mandatory in CI (`CIVIC_REQUIRE_FFMPEG=1`)
- [ ] HW capture-builder tests; frontend tests
- [ ] Triage 36 skips incl. draft→publish flow; fake-timer adoption

## Roadmap-tier (scope with user before starting)

- [ ] `ui-003` SSR; `core-002` WorkflowEngine stubs; signed appliance image;
  HW config-apply/reboot/button; equity/i18n; uncleared-surface follow-up
  (quick-start/by-meeting authz, FTS injection, config reflection);
  supply-chain (dependency-review/CodeQL/osv-scanner, SECURITY.md, Node-pin
  reconcile — actions SHA-pinning landed with CI batch); doc-drift sweep
