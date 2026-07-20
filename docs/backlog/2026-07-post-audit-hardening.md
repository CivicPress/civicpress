# Post-audit hardening backlog — tracker

Source: 2026-07-14/15 "what's left" sweep after the 2026-07-02 FA-\* audit
closed (105 findings, none critical-security-tier). Full per-finding evidence
lives in the sweep journal; this file tracks execution state per batch.
Worked top-down in thematic batches on `refactor/phase-7-post-audit-hardening`
(monorepo) and `refactor/phase-5-post-audit-hardening` (BroadcastBox HW repo);
verified batches merge to `main`.

Status legend: `[ ]` open · `[~]` in progress · `[x]` landed+verified · `[-]` dropped (reason inline)

## DO FIRST

- [x] **Tier A landed on `refactor/phase-7b-tier-a` (`9572520`)** — pragmas +
  git mutex + session revocation; see the commit body for the four latent
  bugs FK enforcement exposed. **Audit-trail correction to that commit
  message (skeptic-verified):** the FA-CORE-008 idempotency-key collision it
  describes affected *directly-executed* saga contexts lacking
  `metadata.draftId` (core's saga-e2e tests + the documented direct-saga
  convention) — NOT the API/record-manager publish path, which supplies
  `metadata.draftId` and never collided. Optional follow-up (deliberate
  key-rotation, 5-min dedupe gap): include `targetStatus` in derived publish
  keys — same-draft publish-vs-archive currently share a key. **That follow-up
  is DONE (phase-7e) and superseded** — the publish key is now scoped to the
  draft's full content + target status; see the Improvements entry below.
- [x] **CI on both repos** — GH Actions `ci.yml` in monorepo (pnpm frozen
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
**Tier A CLOSED 2026-07-20** — the three boxes below were landed by the Tier-A
commit above and were simply never re-ticked; re-verified from source + green
tests this session (see per-item notes).

- [x] SQLite pragmas (`foreign_keys=ON`, WAL, `busy_timeout=5000`) on every connection
  — `core/src/database/__tests__/sqlite-pragmas.test.ts` (4 tests: pragma values,
  a real orphan-insert rejection, declared ON DELETE CASCADEs firing, and
  `record_locks` deliberately FK-free so draft ids stay lockable).
- [x] Serialize git mutations (git mutex / `git:repo` lock) + different-record saga concurrency test
- [x] Session revocation (`deleteUserSessions` on logout + password change)
  — `tests/core/session-revocation.test.ts` (7 tests).
- [ ] **Still open (needs repo admin, not code):** required-status-checks branch
  protection on both repos — the current token lacks admin. Exact `gh api`
  commands are in the PR bodies (status checks only; requiring PRs would
  disable Renovate branch automerge).

## Tier B — security correctness

**TIER CLOSED 2026-07-20.** All seven were already implemented — they landed
inside the Tier-A / Tier-C / CI batches without their boxes being re-ticked, so
this tier read as "7 open" when nothing was. Each was re-verified from source
this session and its covering test run green; the one genuine gap found (B3 had
no regression test) was filled.

- [x] Password-strength policy dead code → centralize in PasswordOps
  — `AuthConfigManager.validatePassword` is the single implementation;
  `PasswordOps.validatePasswordPolicy` is its only caller and `AuthService`
  delegates to that. A repo-wide sweep found **no** password validator outside
  this chokepoint. Covered by `tests/core/password-policy.test.ts` (4) +
  `tests/api/password-policy-routes.test.ts` (3).
- [x] OAuth links by username only → match `(auth_provider, provider_user_id)`
  — `oauth-ops.ts` matches on the stable provider identity via
  `getUserByProvider`, with legacy same-provider adoption allowed ONLY when the
  provider supplied a stable id. Covered by `tests/core/oauth-linking.test.ts`
  (6 tests, incl. "does NOT take over a local password account with the same
  username" and the no-stable-id refusal).
- [x] Generic-500 branch leaks raw `error.message`; route config.ts/notifications.ts through redacting helper
  — every 500 in `config.ts` returns a fixed generic string and `notifications.ts`
  keeps the SMTP error in the audit record only. **Gap closed 2026-07-20:** this
  had no regression test, so `tests/api/config-error-redaction.test.ts` (4 tests)
  now pins the generic bodies and asserts no resolved path / `ENOENT` / stack
  marker reaches the wire. (The `InvalidConfigTypeError` 400 reflects the
  caller's OWN input back, which is a controlled validation message, not
  disclosure — the test asserts that shape deliberately.)
- [x] Role-hierarchy cycle detection (visited set) — circular roles.yml currently denies all perms via swallowed stack overflow
  — implemented as an ancestor-**path** set (not a global visited set) plus a
  memo, so a legal diamond is not mistaken for a cycle. Covered by
  `tests/core/role-cycle.test.ts` (3 tests, incl. the diamond case).
- [x] `setMockUser()` backdoor stripped behind `import.meta.dev`
  — the UI helper was deleted outright and simulated auth is gated by
  `simulated-auth-policy.ts` (a runtime env policy, which is stronger than the
  `import.meta.dev` this line proposed). Covered by
  `core/src/auth/__tests__/simulated-auth-policy.test.ts` (6) +
  `modules/api/src/__tests__/bypass-auth-guard.test.ts` (5).
- [x] Executable uploads: warning → deny
  — `validation.ts` pushes executable extensions to `errors` (→ `valid:false`),
  so the upload is refused. Covered by the storage characterization test
  ("REJECTS executable extensions outright (post-audit hardening: was
  warn-only)"), incl. the wildcard-folder case.
- [x] Realtime: enforce `max_rooms`; set WS `maxPayload`
  — `maxPayload: 10 MiB` on the WebSocketServer (the ws default ~100 MiB was a
  one-message memory-DoS surface) and room creation refused at the cap while
  joining an EXISTING room still succeeds. Covered by
  `modules/realtime/src/__tests__/connection-limits.test.ts` (7).

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
- [x] **UI cluster — DONE 2026-07-20.** All three, each with a regression test
  proven to fail against the pre-fix source:
  - **`useMarkdown` heading inline formatting:** `renderer.heading` built the
    heading body by concatenating each inline token's raw `.text`, so every
    inline construct inside a heading was silently dropped — `## Budget **2026**`
    lost its `<strong>`, links lost their `<a>`, code spans their `<code>` — and
    the raw source was emitted unescaped. Now rendered via
    `this.parser.parseInline(tokens)` (declared with `function` so `this` binds
    to the renderer). Also hoisted `marked.use({ renderer })` to module scope: it
    appends to the extension list on the shared `marked` singleton, so calling it
    inside the composable re-registered the renderer on **every** component setup
    and accumulated without bound. +5 tests.
  - **Autosave timer unmount:** `onUnmounted` called only `stop()`, which
    detaches the deep watcher and nothing else. The exponential-backoff retry
    chain (2s/4s/8s) and an already-armed debounced save both survived it, so a
    save could fire **after** the component unmounted and PUT stale form state
    over a record the user had navigated away from. Added a tracked timer set +
    a `disposed` latch checked by every save path, exposed as `dispose()` and
    wired to `onUnmounted`. +3 tests.
  - **Editor host collab-vs-CM latch:** this was the serious one. The decision
    was a live `computed` chained to the content-loss guard over
    `props.modelValue`, which changes on every keystroke — so typing a construct
    the schema can't preserve (a raw `<div>`, a footnote) flipped it false
    MID-SESSION and the `v-if` tore down the mounted collaborative editor,
    dropping the realtime room, remote cursors and undo history, then swapped
    back when the character was deleted (flapping as the user typed). The guard's
    question is "may THIS record be opened collaboratively?", so it is now
    latched once per record against the content as loaded, re-taken only when
    `recordId` changes. SSR behaviour unchanged. +4 tests.
- [x] **HW multi-output ffmpeg filtergraph pad reuse (`[v_wm]` mapped twice) — DONE
  2026-07-20** (in the separate BroadcastBox HW repo). `_build_ffmpeg_command`
  appended `-map <video_map_label>` for every additional output group; when video
  comes out of `-filter_complex` (watermark / PiP / VAAPI hwupload) that label is
  a filter output **pad**, which can only feed one consumer — so any watermarked
  recording+RTMP capture died at startup with "Output with label 'v_wm' does not
  exist in any defined filter graph, or was already used elsewhere". The audio
  side already knew this rule (it maps the raw input for extra groups) but video
  had no raw equivalent. Fixed by splitting the pad into one branch per output
  group (`[v_wm]split=2[vout0][vout1]`) and re-pointing the first group's map.
  Confirmed against real ffmpeg 6.1.1 (old: 0-byte mp4 + hard failure; new: both
  outputs written). Only affects the multi-output branch — a single output takes
  the `len(output_list) == 1` path and is untouched. `_build_pip_compositor_command`
  already split correctly and was left alone.
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
- [x] **Quota-check TOCTOU — DONE 2026-07-20.** `QuotaManager.checkQuota` was
  enforced (storage-001) but was a read-then-decide with no reservation, so N
  simultaneous uploads to a near-full folder each passed and jointly exceeded the
  quota by up to N×maxFileSize. Implemented the deferred **reservation counter**:
  `reserve()` reads usage (the only awaits) and then runs a **fully synchronous**
  admit — counting outstanding reservations as used and recording the new one in
  the SAME event-loop turn as the decision that granted it, so the next caller to
  resume already sees it. `release()` is called from a `finally` in both
  `upload-ops` and `streaming-ops`, on the success path *after*
  `createStorageFile`, so there is no window where bytes are neither reserved nor
  measured. Leak-proof via a 15-min TTL: a caller that dies between reserve and
  release has its headroom reclaimed (and the reclaim is logged). `checkQuota` is
  retained for compatibility and is now reservation-aware, but is documented as
  the non-reserving path. +8 tests, including 3 concurrent 4KB reserves into a
  10KB folder admitting exactly 2, the global-limit equivalent, TTL reclamation,
  and a characterization test showing concurrent `checkQuota` still over-admits
  (which is *why* the upload paths must reserve).
- [x] **BB in-flight commands rejected on disconnect — DONE 2026-07-17 (phase-7h).**
  `DeviceCommandService` now tags each pending command with its `deviceUuid` and
  exposes `rejectPendingForDevice()`; `DeviceRoomHandler.onDisconnect` calls it, so
  a command awaiting an ack from a device that just dropped fails fast (→
  `{success:false}`) instead of blocking for the full command timeout.
- [x] **BB unknown-ack raw payload redacted — DONE 2026-07-17 (phase-7h).** The
  `unknown-ack` `coreWarn` logged `JSON.stringify(ack)` raw; now
  `JSON.stringify(redactSecretFields(ack))` (an unmatched ack is exactly the
  malformed/spoofed-frame path, and an ack payload can carry a stream_key).
- [x] **HW QR f-string; `_untrack_pid` Process-vs-pid; subprocess type-hint — DONE 2026-07-20.**
  - **QR "f-string": the bug as written does NOT exist.** An exhaustive `tokenize`
    scan of every `.py` under `src/` found **zero** non-f-prefixed literals
    containing `{ident}`, and `git log -S` shows the one QR string has been an
    f-string since it was introduced. The real defect in that same line was that
    the QR payload was **hand-rolled JSON built by interpolation**, while the
    scanner (`QrScanner.vue`) does a bare `JSON.parse` — so an operator-supplied
    `civicpress_url` containing a `"` or `\` produced a malformed document and
    every scan failed as "invalid QR code". Replaced with `json.dumps(...,
    separators=(",", ":"))`; byte-identical for well-formed URLs, so the frontend
    contract is unchanged. +5 tests.
  - **`_untrack_pid`:** the preview→recording handoff passed the `Process`
    **object** where an int pid was expected. `set.discard()` raises nothing on a
    miss, so it silently did nothing and the dead preview PID stayed in
    `_child_pids` forever — and that set is `SIGKILL`ed just before `os._exit()`,
    so a PID the OS had since recycled onto an unrelated process was a standing
    kill target. The audio sibling two lines below was already correct.
  - **subprocess type-hint:** five sites annotated the handle from
    `asyncio.create_subprocess_exec` as `Optional[subprocess.Process]` — the
    stdlib `subprocess` module has **no** `Process` attribute (it has `Popen`);
    the correct type is `asyncio.subprocess.Process`. Verified empirically that
    the annotation is inert at runtime (attribute-target annotations in a
    function body aren't evaluated), so this was mypy/IDE-only and correctly
    ships without a test.
- [x] **HW Wi-Fi PSK off nmcli argv; reject plain-http enrollment — DONE 2026-07-20.**
  - **Wi-Fi PSK off argv:** `POST /api/network/connect` built
    `nmcli device wifi connect <ssid> password <psk>`. `/proc/<pid>/cmdline` is
    world-readable, so any local account (or anything sampling `ps`) could lift
    the PSK for the duration of the connect. The codebase already refused to
    *persist* the PSK (FA-HW-011); argv was the remaining leak. Now uses
    `nmcli --ask` with the secret fed on **stdin**, so it only ever exists in the
    process pipe. +3 tests asserting the PSK appears in no argv token.
    **⚠️ NEEDS A BENCH CHECK BEFORE SHIPPING:** `nmcli` is not installed in the
    dev VM, so it could not be smoke-tested that `--ask` reads the secret from a
    non-TTY pipe rather than demanding a terminal. This is the standard
    documented pattern and nmcli uses readline (which accepts non-TTY stdin), but
    it is unverified on hardware — if `--ask` turns out to require a TTY this
    would break Wi-Fi onboarding, so verify on a real appliance.
  - **Reject plain-http enrollment:** enrollment POSTed the one-time pairing code
    and received the device's long-lived bearer token over whatever scheme was
    configured, with **no** scheme check — over `http://` both are readable and
    forgeable on-path. `main.py` already enforced this floor (FA-HW-009) on the
    **WebSocket** leg; the enrollment leg was simply never covered. Added the gate
    at the single network choke point (so it covers both the API route and
    `scripts/configure_device.py`), following the existing carve-out convention
    exactly: loopback always allowed, remote cleartext only via the explicit
    `ALLOW_INSECURE_TRANSPORT=true` opt-in (default `False`) — never a blanket
    bypass. +7 tests, incl. asserting the enrollment code never left the device on
    the rejected path.
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
