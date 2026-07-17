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

- [x] **`acquireLock` TOCTOU — DONE 2026-07-17 (phase-7h).** `DatabaseService.acquireLock`
  did `DELETE expired → getLock check → INSERT OR REPLACE → return true`, so two
  concurrent callers both saw "no active lock" and both wrote → two holders of one
  record lock. Replaced with a single atomic `INSERT … ON CONFLICT(record_id) DO
  UPDATE … WHERE expires_at <= ?`; `changes` decides the winner. Also fixed a
  latent bug: expiry is stored as `toISOString()` but was compared to SQLite
  `CURRENT_TIMESTAMP` (incompatible ordering) — now ISO-to-ISO. Tests
  (`database-service.test.ts`): 12 concurrent acquirers → exactly 1 wins; held →
  refuses; expired → re-acquirable (proven to fail on the old code).
- [ ] **Quota-check TOCTOU (residual, reclassified out of Tier-D):** `QuotaManager.checkQuota`
  is enforced (storage-001) but is a read-then-decide with no reservation, so N
  simultaneous uploads to a near-full folder can each pass and jointly exceed the
  quota by up to N×maxFileSize. Not a security hole (each upload still checks; the
  overage is bounded and self-corrects once usage is measured). A correct fix needs
  an in-memory/DB **reservation counter** with leak-proof (TTL) release wired
  through `upload-ops`/`streaming-ops` — larger than a quick win; deferred.
- [x] **BB in-flight commands rejected on disconnect — DONE 2026-07-17 (phase-7h).**
  `DeviceCommandService` now tags each pending command with its `deviceUuid` and
  exposes `rejectPendingForDevice()`; `DeviceRoomHandler.onDisconnect` calls it, so
  a command awaiting an ack from a device that just dropped fails fast (→
  `{success:false}`) instead of blocking for the full command timeout.
- [x] **BB unknown-ack raw payload redacted — DONE 2026-07-17 (phase-7h).** The
  `unknown-ack` `coreWarn` logged `JSON.stringify(ack)` raw; now
  `JSON.stringify(redactSecretFields(ack))` (an unmatched ack is exactly the
  malformed/spoofed-frame path, and an ack payload can carry a stream_key).
- [ ] HW QR f-string; `_untrack_pid` Process-vs-pid; subprocess type-hint
- [ ] HW Wi-Fi PSK off nmcli argv; reject plain-http enrollment
- [x] **`GET /api/users` limit cap + no 403 perm dump — DONE 2026-07-17 (phase-7h).**
  The 403 echoed the caller's full resolved permission set (a "DEBUG"
  info-disclosure) — now a plain "Insufficient permissions to list users". `limit`
  was uncapped (`Number(limit)` straight into the query) — now capped at 200 with
  NaN/negative coercion.
- [x] **Backup storage-files helpers DB-connection leak — DONE 2026-07-17 (phase-7h).**
  `exportStorageFilesTable`/`restoreStorageFilesTable` each opened their OWN
  `DatabaseService` and never closed it (one leaked connection per backup/restore).
  Both now close in a `finally`.
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
  ~~idempotency: include `targetStatus` in derived publish keys~~ **DONE
  2026-07-17 (phase-7e), and superseded:** the publish key is now scoped to the
  draft's full content + target status (not just user/draftId), so an
  edit-then-republish within the 5-min dedupe TTL is no longer swallowed as a
  duplicate — see the QUARANTINE BURN-DOWN entry under Test & CI health.
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

- [x] **QUARANTINE BURN-DOWN — DONE 2026-07-17 (`refactor/phase-7e-test-health`).**
  All 5 files now pass individually AND together from a clean checkout; removed
  from the `CIVIC_TEST_QUARANTINE` list (hook retained empty). The "flaky"
  cluster was NOT flaky — it surfaced **3 real product bugs** + 1 latent core
  bug, plus stale test expectations:
  - **config-validation 403 (REAL bug, FA-API-018 regression):** `csrfMiddleware`
    is mounted AT `apiPath('config')`, so Express strips the base and `req.path`
    is `/:type/validate` — the `config/…/validate$` skip-regex never matched, so
    the *public* validate endpoint always demanded a CSRF token. Fix: match
    `req.baseUrl + req.path` (query-free full path). Regression test added +
    proven to catch it; FA-API-018 query-spoof still blocked.
  - **editor 403×5 (STALE tests):** publish `draft→approved` is correctly blocked
    by the FA-API-008 review-chain guard; tests now publish to `published`. Fixing
    the 5th exposed a **REAL core bug:** the publish idempotency key (was
    `hash(user,recordId,draftId,request)`) omitted draft content + targetStatus,
    so an edit-then-republish within the ~5-min dedupe TTL returned the prior
    publish's cached result and silently dropped the edit. Fixed by scoping the
    key to the draft's content+target in `record-manager.publishDraft` (closes the
    "include targetStatus in derived publish keys" deferral below, and then some).
  - **BB 6 failures → 2 REAL bugs + 1 stale test:** (a) `002_enrollment_codes.sql`
    had a **backwards FK** (`device_uuid REFERENCES broadcast_devices`) — an
    enrollment code legitimately PRECEDES the device row; inert until Tier-A
    `foreign_keys=ON` turned it on, then it broke ALL device onboarding in
    production. Removed the FK (mirrors the 001 no-FK precedent). (b) The
    ack-gated `start_session` (`device-command-service.ts:258`) forwarded the DB
    id where the room is keyed by `deviceUuid`, so the command never reached the
    device yet the session still flipped to `recording` — the exact FA-BB-008
    phantom-recording mode. Fixed to route on `device.deviceUuid`. (c)
    upload-e2e `public_file` `toBeUndefined()`→`toBeNull()` (finalize writes null
    by design to clear stale pointers; still falsy → fail-closed holds).
  - **cli/me ×2 (STALE tests):** FA-CLI-003 hardened the token-guidance message;
    updated the two assertions to the current strings.
  - **STILL OPEN (deeper isolation issue, unchanged):** several files
    (users/records/security-features/auth) fail only on DIRTY checkouts (leftover
    users → 409s) because `createAPITestContext` shares a repo-level
    `.system-data` users DB across files. Not required for the burn-down (clean
    CI runs pass), but the proper fix is the `CentralConfigManager.reset()` /
    per-test system-data isolation item below.
  - **DONE 2026-07-17 (phase-7f), defense-in-depth (BB):** `SessionController.startSession`
    now inspects the `executeCommand` result's `.success` and fails closed —
    `executeCommand` RESOLVES with `{success:false}` (it does not throw) on
    disconnect/timeout/nack, so the session no longer flips to `recording` on an
    unacked send (the FA-BB-008 invariant). Unit test added for the failure path;
    the device-ws e2e tests now have the fake device actually ACK commands (they
    previously relied on the 5s timeout-then-proceed and never confirmed an ack).
- [x] **`CentralConfigManager.reset()` in setup/teardown — DONE 2026-07-17 (phase-7g).**
  Root cause of the cross-file dirty-state 409s: the repo-root `.civicrc` has no
  `dataDir`/`database`, so `CentralConfigManager` defaults the sqlite path to the
  shared `<repo>/.system-data/civic.db`; the cached static singleton was resolved
  once (cwd = repo root, before a test's temporary chdir) and never reset, so
  every API test — even across separate `forks` — wrote users into that one
  on-disk DB and 409'd on re-registration. Fix (`tests/fixtures/test-setup.ts`):
  import `CentralConfigManager` and `reset()` right after the chdir-into-testDir
  (so config re-resolves from the per-test `.civicrc` → isolated `testDir/test.db`)
  and on teardown; `createExtendedAPITestContext` also gained the missing
  chdir+reset (it never chdir'd, so it always hit the shared DB). Verified: the
  formerly dirty-sensitive cluster (users/records/security-features/auth/
  user-management) now passes **twice back-to-back with no cleaning** and the
  shared repo-root DB is never created; a 12-file parallel probe is likewise
  clean. **Parallelism restored — DONE:** the shared-DB contention the CI "flakes
  under load" comment blamed is gone (`forks` already isolates memory; the shared
  DB was the only cross-file coupling). The FULL root suite was validated green in
  parallel (165 files / 1530 tests at `fileParallelism:2`, shared DB never
  created), so CI dropped `--fileParallelism=false` (`ci.yml`) and the root suite
  runs in parallel again. The empty `CIVIC_TEST_QUARANTINE` hook is retained for
  parking a future regression with a tracker entry.
- [x] **Un-skip 8 security-critical auth tests — DONE 2026-07-17.** Un-skipped all
  8 in `security-features.test.ts`; now pass. The "400-vs-403" was real: **4 code
  bugs** (external-auth password rejection returned 400 not 403 across
  change-password/set-password/PUT-update; non-existent set-password target →
  500 not 404) fixed in the API handlers WITH the external-auth guards preserved
  and the admin(403) check kept ahead of the existence(404) check; **4 stale
  tests** (`password`→`newPassword` field, `body.data.message`/`body.error.message`
  paths, verify-email token read via raw DB query NOT `getUserById` — that column
  is a live verification secret).
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
