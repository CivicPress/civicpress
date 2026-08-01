# Post-audit hardening backlog — tracker

Source: 2026-07-14/15 "what's left" sweep after the 2026-07-02 FA-\* audit
closed (105 findings, none critical-security-tier). Full per-finding evidence
lives in the sweep journal; this file tracks execution state per batch. Worked
top-down in thematic batches on `refactor/phase-7-post-audit-hardening`
(monorepo) and `refactor/phase-5-post-audit-hardening` (BroadcastBox HW repo);
verified batches merge to `main`.

Status legend: `[ ]` open · `[~]` in progress · `[x]` landed+verified · `[-]`
dropped (reason inline)

## DO FIRST

- [x] **Tier A landed on `refactor/phase-7b-tier-a` (`9572520`)** — pragmas +
      git mutex + session revocation; see the commit body for the four latent
      bugs FK enforcement exposed. **Audit-trail correction to that commit
      message (skeptic-verified):** the FA-CORE-008 idempotency-key collision it
      describes affected _directly-executed_ saga contexts lacking
      `metadata.draftId` (core's saga-e2e tests + the documented direct-saga
      convention) — NOT the API/record-manager publish path, which supplies
      `metadata.draftId` and never collided. Optional follow-up (deliberate
      key-rotation, 5-min dedupe gap): include `targetStatus` in derived publish
      keys — same-draft publish-vs-archive currently share a key. **That
      follow-up is DONE (phase-7e) and superseded** — the publish key is now
      scoped to the draft's full content + target status; see the Improvements
      entry below.
- [x] **CI on both repos** — GH Actions `ci.yml` in monorepo (pnpm frozen
      install → core-first build (core↔storage workspace cycle defeats pnpm's
      topo ordering from clean) → `-r build` → lint → registry:check →
      root(serialized, 5-file quarantine)+UI+storage+broadcast-box+transcription
      vitest suites, ffmpeg installed) and in BroadcastBox (install-locked →
      deterministic deps-check → protocol-check vs sparse-checkout of the public
      monorepo → non-hardware pytest; second job: frontend install + typecheck +
      build). **BroadcastBox side GREEN on the real runner (PR #1)** after two
      CI-only fixes the dry-run surfaced: httpx2 missing from the hash-locked
      dev deps, and frontend/pnpm-lock.yaml gitignored as a "build artifact"
      (now tracked). SHA-pinned actions; push triggers on `main` + `renovate/**`
      so Renovate branch-automerge is gated (default `ignoreTests: false`; note
      Renovate has never actually run on the repo yet — no bot
      commits/branches). Pre-commit hook slimmed to lint-staged +
      registry:check. `.npmrc:29` jammed-key fixed + `use-node-version` synced
      to `.nvmrc` (22.22.3). **Remaining:** required-status-checks branch
      protection needs repo admin (current token lacks it) — see PR bodies for
      the exact `gh api` commands (status checks only; requiring PRs would
      disable Renovate branch automerge). **Tier A CLOSED 2026-07-20** — the
      three boxes below were landed by the Tier-A commit above and were simply
      never re-ticked; re-verified from source + green tests this session (see
      per-item notes).

- [x] SQLite pragmas (`foreign_keys=ON`, WAL, `busy_timeout=5000`) on every
      connection — `core/src/database/__tests__/sqlite-pragmas.test.ts` (4
      tests: pragma values, a real orphan-insert rejection, declared ON DELETE
      CASCADEs firing, and `record_locks` deliberately FK-free so draft ids stay
      lockable).
- [x] Serialize git mutations (git mutex / `git:repo` lock) + different-record
      saga concurrency test
- [x] Session revocation (`deleteUserSessions` on logout + password change) —
      `tests/core/session-revocation.test.ts` (7 tests).
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

- [x] Password-strength policy dead code → centralize in PasswordOps —
      `AuthConfigManager.validatePassword` is the single implementation;
      `PasswordOps.validatePasswordPolicy` is its only caller and `AuthService`
      delegates to that. A repo-wide sweep found **no** password validator
      outside this chokepoint. Covered by `tests/core/password-policy.test.ts`
      (4) + `tests/api/password-policy-routes.test.ts` (3).
- [x] OAuth links by username only → match `(auth_provider, provider_user_id)` —
      `oauth-ops.ts` matches on the stable provider identity via
      `getUserByProvider`, with legacy same-provider adoption allowed ONLY when
      the provider supplied a stable id. Covered by
      `tests/core/oauth-linking.test.ts` (6 tests, incl. "does NOT take over a
      local password account with the same username" and the no-stable-id
      refusal).
- [x] Generic-500 branch leaks raw `error.message`; route
      config.ts/notifications.ts through redacting helper — every 500 in
      `config.ts` returns a fixed generic string and `notifications.ts` keeps
      the SMTP error in the audit record only. **Gap closed 2026-07-20:** this
      had no regression test, so `tests/api/config-error-redaction.test.ts` (4
      tests) now pins the generic bodies and asserts no resolved path / `ENOENT`
      / stack marker reaches the wire. (The `InvalidConfigTypeError` 400
      reflects the caller's OWN input back, which is a controlled validation
      message, not disclosure — the test asserts that shape deliberately.)
- [x] Role-hierarchy cycle detection (visited set) — circular roles.yml
      currently denies all perms via swallowed stack overflow — implemented as
      an ancestor-**path** set (not a global visited set) plus a memo, so a
      legal diamond is not mistaken for a cycle. Covered by
      `tests/core/role-cycle.test.ts` (3 tests, incl. the diamond case).
- [x] `setMockUser()` backdoor stripped behind `import.meta.dev` — the UI helper
      was deleted outright and simulated auth is gated by
      `simulated-auth-policy.ts` (a runtime env policy, which is stronger than
      the `import.meta.dev` this line proposed). Covered by
      `core/src/auth/__tests__/simulated-auth-policy.test.ts` (6) +
      `modules/api/src/__tests__/bypass-auth-guard.test.ts` (5).
- [x] Executable uploads: warning → deny — `validation.ts` pushes executable
      extensions to `errors` (→ `valid:false`), so the upload is refused.
      Covered by the storage characterization test ("REJECTS executable
      extensions outright (post-audit hardening: was warn-only)"), incl. the
      wildcard-folder case.
- [x] Realtime: enforce `max_rooms`; set WS `maxPayload` — `maxPayload: 10 MiB`
      on the WebSocketServer (the ws default ~100 MiB was a one-message
      memory-DoS surface) and room creation refused at the cap while joining an
      EXISTING room still succeeds. Covered by
      `modules/realtime/src/__tests__/connection-limits.test.ts` (7).

## Tier C — correctness bugs (SCOUTED 2026-07-16, file:line below)

**Batch 4 landed on `refactor/phase-7d-tier-c` (stacked on #17):** all 9
findings below fixed across 4 thematic commits + a role-manager diamond
follow-up. (Storage, config+CLI, API-routes clusters + saga/BB/notifications.)

- [x] Storage streaming (`modules/storage/.../streaming-ops.ts`): GCS missing
      from the switch (L142-180, throws at L178); stream path bypasses
      failover/retry/metrics (calls uploadStreamTo\* directly, no
      StorageFailoverManager); S3/Azure streamed `size` persisted as 0
      (L164/L176 `request.size||0`, comment "provider will set size" is false →
      breaks quota)
- [x] `updateFile` (`file-mgmt-ops.ts:273-291`) never invalidates folder cache
      (dead `invalidateFile` at `storage-metadata-cache-adapter.ts:124`);
      failover-on-read returns `null` as "success" so it never fails over to the
      provider holding the object (`download-ops.ts` L159/L191/L306 return null;
      `storage-failover-manager.ts:100` treats resolved null as success)
- [x] `CIVIC_DATA_DIR` (`central-config.ts:144-156`): early-return hardcodes
      sqlite path AND skips the entire `.civicrc` load/merge (drops `auth` + all
      other config)
- [x] CLI login token (`login.ts:163-177` / `auth.ts:80-95`): never writes
      `~/.civicpress/token` that `resolveToken` reads (`auth-utils.ts:31-38`);
      human mode never prints the token either
- [x] geography `/linked-records` (`geography.ts:448-499`, cap L27) loses rows
      past 1000 + wrong total/totalPages; `/records/:id/raw`
      (`read-handlers.ts:374`) missing `optionalAuth` → editors always treated
      as public
- [x] record-history filter: no-op `.replace('/','/')` substring match
      (`history.ts:103,263`); CLI `civic history` ignores the record arg
      entirely (`history.ts:70`). Fix = pathspec-scoped `GitEngine.getHistory`
      (`git-engine.ts:139`)
- [x] publishDraft ordering (`publish-draft-saga.ts` steps L552-559):
      DeleteDraftStep (L402) runs after the irreversible CommitToGitStep (L362,
      isCompensatable=false) with a log-only no-op compensation (L423) → DB
      hiccup loses a committed record's draft unrecoverably
- [x] BB device health-monitor + stale-reaper implemented
      (`device-connection-tracker.ts:304`/`335`) but never started in
      production; wire at the tracker factory
      (`broadcast-box-services.ts:294-310`)
- [x] **UI cluster — DONE 2026-07-20.** All three, each with a regression test
      proven to fail against the pre-fix source:
  - **`useMarkdown` heading inline formatting:** `renderer.heading` built the
    heading body by concatenating each inline token's raw `.text`, so every
    inline construct inside a heading was silently dropped —
    `## Budget **2026**` lost its `<strong>`, links lost their `<a>`, code spans
    their `<code>` — and the raw source was emitted unescaped. Now rendered via
    `this.parser.parseInline(tokens)` (declared with `function` so `this` binds
    to the renderer). Also hoisted `marked.use({ renderer })` to module scope:
    it appends to the extension list on the shared `marked` singleton, so
    calling it inside the composable re-registered the renderer on **every**
    component setup and accumulated without bound. +5 tests.
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
    back when the character was deleted (flapping as the user typed). The
    guard's question is "may THIS record be opened collaboratively?", so it is
    now latched once per record against the content as loaded, re-taken only
    when `recordId` changes. SSR behaviour unchanged. +4 tests.
- [x] **HW multi-output ffmpeg filtergraph pad reuse (`[v_wm]` mapped twice) —
      DONE 2026-07-20** (in the separate BroadcastBox HW repo).
      `_build_ffmpeg_command` appended `-map <video_map_label>` for every
      additional output group; when video comes out of `-filter_complex`
      (watermark / PiP / VAAPI hwupload) that label is a filter output **pad**,
      which can only feed one consumer — so any watermarked recording+RTMP
      capture died at startup with "Output with label 'v_wm' does not exist in
      any defined filter graph, or was already used elsewhere". The audio side
      already knew this rule (it maps the raw input for extra groups) but video
      had no raw equivalent. Fixed by splitting the pad into one branch per
      output group (`[v_wm]split=2[vout0][vout1]`) and re-pointing the first
      group's map. Confirmed against real ffmpeg 6.1.1 (old: 0-byte mp4 + hard
      failure; new: both outputs written). Only affects the multi-output branch
      — a single output takes the `len(output_list) == 1` path and is untouched.
      `_build_pip_compositor_command` already split correctly and was left
      alone.
- [x] `.npmrc:29` jammed keys (folded into CI batch — trailing
      `strict-peer-dependencies=false` never parsed; dropped it, preserving
      effective config)
- [x] Notifications: empty recipient dispatched silently
      (`notification-service.ts:278-292` returns '', no guard in sendToChannel
      L262); SMS/Slack config declared (`notification-config.ts:51-66`) but only
      email channel implemented → "Channel not found" throw if enabled

## Tier D — small, batchable

- [x] **`acquireLock` TOCTOU — DONE 2026-07-17 (phase-7h).**
      `DatabaseService.acquireLock` did
      `DELETE expired → getLock check → INSERT OR REPLACE → return true`, so two
      concurrent callers both saw "no active lock" and both wrote → two holders
      of one record lock. Replaced with a single atomic
      `INSERT … ON CONFLICT(record_id) DO UPDATE … WHERE expires_at <= ?`;
      `changes` decides the winner. Also fixed a latent bug: expiry is stored as
      `toISOString()` but was compared to SQLite `CURRENT_TIMESTAMP`
      (incompatible ordering) — now ISO-to-ISO. Tests
      (`database-service.test.ts`): 12 concurrent acquirers → exactly 1 wins;
      held → refuses; expired → re-acquirable (proven to fail on the old code).
- [x] **Quota-check TOCTOU — DONE 2026-07-20.** `QuotaManager.checkQuota` was
      enforced (storage-001) but was a read-then-decide with no reservation, so
      N simultaneous uploads to a near-full folder each passed and jointly
      exceeded the quota by up to N×maxFileSize. Implemented the deferred
      **reservation counter**: `reserve()` reads usage (the only awaits) and
      then runs a **fully synchronous** admit — counting outstanding
      reservations as used and recording the new one in the SAME event-loop turn
      as the decision that granted it, so the next caller to resume already sees
      it. `release()` is called from a `finally` in both `upload-ops` and
      `streaming-ops`, on the success path _after_ `createStorageFile`, so there
      is no window where bytes are neither reserved nor measured. Leak-proof via
      a 15-min TTL: a caller that dies between reserve and release has its
      headroom reclaimed (and the reclaim is logged). `checkQuota` is retained
      for compatibility and is now reservation-aware, but is documented as the
      non-reserving path. +8 tests, including 3 concurrent 4KB reserves into a
      10KB folder admitting exactly 2, the global-limit equivalent, TTL
      reclamation, and a characterization test showing concurrent `checkQuota`
      still over-admits (which is _why_ the upload paths must reserve).
- [x] **BB in-flight commands rejected on disconnect — DONE 2026-07-17
      (phase-7h).** `DeviceCommandService` now tags each pending command with
      its `deviceUuid` and exposes `rejectPendingForDevice()`;
      `DeviceRoomHandler.onDisconnect` calls it, so a command awaiting an ack
      from a device that just dropped fails fast (→ `{success:false}`) instead
      of blocking for the full command timeout.
- [x] **BB unknown-ack raw payload redacted — DONE 2026-07-17 (phase-7h).** The
      `unknown-ack` `coreWarn` logged `JSON.stringify(ack)` raw; now
      `JSON.stringify(redactSecretFields(ack))` (an unmatched ack is exactly the
      malformed/spoofed-frame path, and an ack payload can carry a stream_key).
- [x] **HW QR f-string; `_untrack_pid` Process-vs-pid; subprocess type-hint —
      DONE 2026-07-20.**
  - **QR "f-string": the bug as written does NOT exist.** An exhaustive
    `tokenize` scan of every `.py` under `src/` found **zero** non-f-prefixed
    literals containing `{ident}`, and `git log -S` shows the one QR string has
    been an f-string since it was introduced. The real defect in that same line
    was that the QR payload was **hand-rolled JSON built by interpolation**,
    while the scanner (`QrScanner.vue`) does a bare `JSON.parse` — so an
    operator-supplied `civicpress_url` containing a `"` or `\` produced a
    malformed document and every scan failed as "invalid QR code". Replaced with
    `json.dumps(..., separators=(",", ":"))`; byte-identical for well-formed
    URLs, so the frontend contract is unchanged. +5 tests.
  - **`_untrack_pid`:** the preview→recording handoff passed the `Process`
    **object** where an int pid was expected. `set.discard()` raises nothing on
    a miss, so it silently did nothing and the dead preview PID stayed in
    `_child_pids` forever — and that set is `SIGKILL`ed just before
    `os._exit()`, so a PID the OS had since recycled onto an unrelated process
    was a standing kill target. The audio sibling two lines below was already
    correct.
  - **subprocess type-hint:** five sites annotated the handle from
    `asyncio.create_subprocess_exec` as `Optional[subprocess.Process]` — the
    stdlib `subprocess` module has **no** `Process` attribute (it has `Popen`);
    the correct type is `asyncio.subprocess.Process`. Verified empirically that
    the annotation is inert at runtime (attribute-target annotations in a
    function body aren't evaluated), so this was mypy/IDE-only and correctly
    ships without a test.
- [x] **HW Wi-Fi PSK off nmcli argv; reject plain-http enrollment — DONE
      2026-07-20.**
  - **Wi-Fi PSK off argv:** `POST /api/network/connect` built
    `nmcli device wifi connect <ssid> password <psk>`. `/proc/<pid>/cmdline` is
    world-readable, so any local account (or anything sampling `ps`) could lift
    the PSK for the duration of the connect. The codebase already refused to
    _persist_ the PSK (FA-HW-011); argv was the remaining leak. Now uses
    `nmcli --ask` with the secret fed on **stdin**, so it only ever exists in
    the process pipe. +3 tests asserting the PSK appears in no argv token. **⚠️
    NEEDS A BENCH CHECK BEFORE SHIPPING:** `nmcli` is not installed in the dev
    VM, so it could not be smoke-tested that `--ask` reads the secret from a
    non-TTY pipe rather than demanding a terminal. This is the standard
    documented pattern and nmcli uses readline (which accepts non-TTY stdin),
    but it is unverified on hardware — if `--ask` turns out to require a TTY
    this would break Wi-Fi onboarding, so verify on a real appliance.
  - **Reject plain-http enrollment:** enrollment POSTed the one-time pairing
    code and received the device's long-lived bearer token over whatever scheme
    was configured, with **no** scheme check — over `http://` both are readable
    and forgeable on-path. `main.py` already enforced this floor (FA-HW-009) on
    the **WebSocket** leg; the enrollment leg was simply never covered. Added
    the gate at the single network choke point (so it covers both the API route
    and `scripts/configure_device.py`), following the existing carve-out
    convention exactly: loopback always allowed, remote cleartext only via the
    explicit `ALLOW_INSECURE_TRANSPORT=true` opt-in (default `False`) — never a
    blanket bypass. +7 tests, incl. asserting the enrollment code never left the
    device on the rejected path.
- [x] **`GET /api/users` limit cap + no 403 perm dump — DONE 2026-07-17
      (phase-7h).** The 403 echoed the caller's full resolved permission set (a
      "DEBUG" info-disclosure) — now a plain "Insufficient permissions to list
      users". `limit` was uncapped (`Number(limit)` straight into the query) —
      now capped at 200 with NaN/negative coercion.
- [x] **Backup storage-files helpers DB-connection leak — DONE 2026-07-17
      (phase-7h).** `exportStorageFilesTable`/`restoreStorageFilesTable` each
      opened their OWN `DatabaseService` and never closed it (one leaked
      connection per backup/restore). Both now close in a `finally`.
- [x] BroadcastBox stray `-` file (botched `uv pip compile -o -` output) removed
      in CI batch

## Improvements

- [x] **Tier-A skeptic deferrals — ALL FOUR CLOSED 2026-07-20** (per-clause
      notes follow the original text below): realtime/WS connections established
      before a revocation stay live until they reconnect — publish a revocation
      event the realtime server subscribes to (defense-in-depth); session-token
      signatures are optional-if-present (unsigned tokens accepted even when a
      secretsManager exists — require them once minted-signed); backup fidelity
      under WAL — `fs.cp` copies the `-wal`/`-shm` sidecars but a mid-write copy
      is fuzzy; checkpoint or `VACUUM INTO` from a live connection; UX:
      self-service password change logs the requester out everywhere — mint a
      fresh session or show a deliberate re-login message; ~~idempotency:
      include `targetStatus` in derived publish keys~~ **DONE 2026-07-17
      (phase-7e), and superseded:** the publish key is now scoped to the draft's
      full content + target status (not just user/draftId), so an
      edit-then-republish within the 5-min dedupe TTL is no longer swallowed as
      a duplicate — see the QUARANTINE BURN-DOWN entry under Test & CI health.

  **Closure notes (2026-07-20):**
  - **Realtime revocation event — DONE, both halves.** The realtime server now
    subscribes to `auth:sessions:revoked` and tears down live sockets, and core
    now EMITS it: `SessionOps.deleteUserSessions` fires the hook after the
    delete, with an optional `HookSystem` threaded through `AuthService`
    (`initializeHooks`, mirroring the existing `getSecretsManager` "wired later"
    idiom rather than changing the constructor) and wired in
    `civic-core.getAuthService()`. Emission is best-effort: the rows are already
    gone by then, so a broken listener must not turn a successful revocation
    into a thrown error at the call site. Two supporting realtime fixes were
    needed to stop this being cosmetic — `ws.close()` only STARTS a handshake
    and the peer has ~30s to answer, during which a stalling client could keep
    pushing Yjs updates, so revocation runs the canonical teardown eagerly and a
    liveness gate drops frames from de-registered connections.
  - **Session-token signatures now REQUIRED — DONE, and the same flaw existed
    for API keys.** `unwrapToken` read
    `if (secretsManager && token.includes('.'))` and otherwise fell through to
    `return token`, so while signing was ACTIVE an unsigned token skipped
    verification entirely — defeating the point of the signature, which is that
    a raw token leaking by another route (log line, DB row, backup) is not
    enough on its own. `validateApiKey` had the identical fallthrough, and API
    keys are long-lived, so that side was worse. Both now require a valid
    signature when a secretsManager is configured, and still accept unsigned
    tokens when signing is not configured.
  - **Backup fidelity under WAL — DONE, with a scoping correction.** The premise
    needed narrowing: the backup does NOT copy the sqlite file at all in the
    default layout (the default path is `<projectRoot>/.system-data/civic.db`,
    outside the copied `dataDir`; records are durable as Markdown-in-Git and the
    DB is a rebuildable index). But under `CIVIC_DATA_DIR` the file resolves
    INSIDE `dataDir` and `fs.cp` does copy it live, so the hazard is real there.
    Added a containment check plus `PRAGMA wal_checkpoint(TRUNCATE)` before the
    copy, fail-open and never fatal. **Residual, documented not solved:** a
    checkpoint narrows the window but does not freeze it — writes landing during
    the copy can still tear. Closing that needs `VACUUM INTO`, which changes
    what restore consumes.
  - **Password-change re-login UX — DONE.** The result was a bare "Password
    successfully changed" and the caller then found itself silently logged out,
    which reads as a bug. It now says so explicitly and carries a
    `sessionsRevoked` flag so the API/UI can route to a re-login instead of
    string-matching the message.

- [x] **Enforce-or-delete dead session config — DONE 2026-07-20 (all three
      ENFORCED).** `sessionTimeout` now drives session lifetime (it was a
      hardcoded 24h); `maxConcurrentSessions` prunes a user's oldest sessions
      beyond the cap after each mint — ordered by `id`, NOT `created_at`,
      because that column is a DATETIME with one-second resolution and
      same-second logins would tie, letting the LIMIT evict the session just
      handed to the caller; `requireHttps` is enforced by a new middleware that
      defaults OFF (so a no-op for every existing deployment) and exempts health
      checks, so a plain-HTTP load-balancer probe cannot mark the instance
      unhealthy and pull it from rotation.
- [x] **Wire the 3 uncalled cleanup sweeps — DONE 2026-07-20.** Two existed with
      no caller; the third did not exist at all. `login_attempts` is consulted
      on EVERY login and was only ever cleared for users who eventually succeed,
      so failed/abandoned usernames — notably from account-enumeration scanning
      — stayed forever; added `LoginThrottle.cleanupStaleAttempts` (ISO-to-ISO
      comparison, the same trap that bit `acquireLock`). All three are now
      driven by a new `AuthMaintenanceScheduler`: each sweep individually
      try/caught so one failure cannot skip the others or reject into the
      interval callback, and the timer is `unref()`d so it can never hold a CLI
      or test process open. Wired into the API lifecycle following the existing
      enrollment-cleanup convention.
- [-] **Move runtime `ALTER TABLE workflow_state` off the GET path — NOT
  REPRODUCIBLE (2026-07-20).** `ensureWorkflowStateColumn` is called from the
  migration sequence inside `SQLiteAdapter.initialize()`, which runs once from
  `DatabaseService.initialize()` at startup — not from any request path. Nothing
  to move. Dropped rather than "done": there is no change to make.
- [x] **Thread audit channel into create/update/archive/publish — DONE
      2026-07-20.** The gap was BIGGER than the entry implied: **none of the
      four** wrote a domain audit row on its primary path.
      `RecordManager.createRecord`/`.updateRecord` audit only on their LEGACY
      branches, which are reached solely for drafts / `skipFileGeneration` — any
      non-draft record is routed to `createRecordSaga`/`updateRecordSaga`, and
      those sagas write with `db.createRecord(...)`/`db.updateRecord(...)`
      DIRECTLY (they must; the saga owns the file+git compensation). So creating
      or editing a _published_ record — the case that most needs a trail — was
      unaudited, archive wrote nothing at all, and publish wrote only
      `create_record` on the new-record branch and nothing at all when
      RE-publishing over an existing record. `RecordSagas` already received
      `writeAudit` in its deps from the Phase-2d decomposition and never once
      called it. Fixed by emitting `create_record` / `update_record` /
      `archive_record` in `record-manager/sagas.ts` and `publish_record` in
      `record-manager.publishDraft`, each after `executor.execute()` resolves
      (the executor THROWS on step failure/timeout, so reaching the call means
      the write committed). Covered by
      `core/src/records/__tests__/record-manager-audit-channel.test.ts` (6
      tests) — **all 6 proven to fail against the pre-fix tree.**
- [x] **SQL-side pagination — DONE 2026-07-20 (all three).**
  - `listUnpublishedRecords` (`records-service/drafts.ts`): was `SELECT *` of
    every matching row + JSON-parsing/transforming ALL of them into ApiDrafts
    before slicing a page out, with `total` = that array's length. Now
    `COUNT(*)` + a keyset predicate + `LIMIT limit+1` (the extra row IS
    `hasMore`); only the page is transformed. The sort gained an explicit
    `id ASC` tiebreak — `updated_at DESC` alone is not a total order, which is
    already broken for a CURSOR API and load-bearing for keyset. Semantics are
    unchanged: the 4 new tests in `tests/api/pagination-sql-side.test.ts` pass
    against BOTH the old JS-slicing implementation and the new one (verified).
  - geography `/linked-records`: the Tier-C batch scan was correct but hydrated
    the entire published corpus per request. Added a `linkedGeographyId` option
    that threads route → `RecordsListing` → `RecordManager` → `RecordStore`
    (`database-service.ts` needed no edit — it forwards via
    `Parameters<RecordStore['listRecords']>`) and becomes a `json_each` +
    `json_extract($.id)` EXISTS predicate, so the DB filters, COUNTs and
    LIMIT/OFFSETs in one query. Matching the ELEMENT id (not a `LIKE` over the
    raw JSON) is what makes it exact — `LIKE '%geo-1%'` also matches `geo-10`,
    and LIKE's `_` wildcard would match unrelated ids. `json_valid()` + the NULL
    check are load-bearing: `json_each()` raises "malformed JSON" and aborts the
    WHOLE query, so one bad row would 500 the endpoint for everyone. This also
    closes the Tier-C skeptic coverage gap below. `LINKED_RECORDS_SCAN_CAP` is
    gone — there is no scan left to bound.
  - git-history: a log is not a table, so there is nothing to SQL-paginate — but
    both handlers called `getHistory()` with NO limit and `.slice()`d a page out
    of the whole repository log, so per-request memory grew with the age of the
    repo. Added `getHistory(limit, pathspec, skip)` + `countCommits(pathspec)`
    (`git rev-list --count`) and split the handler into two regimes: with no
    author/date filter and no message fallback git returns exactly one page and
    the true total; otherwise the full log genuinely IS required, because
    `totalCommits` is defined over the FILTERED set (git's own `--author` was
    rejected deliberately — it is a case-sensitive regex over "Name <email>",
    not this endpoint's case-insensitive substring match on name OR email).
    **Landmine found and fixed by the test:** simple-git's OPTIONS form silently
    DROPS `--skip` when `file` is set, so a pathspec-scoped page returns the
    first page every time; the array form is required and is what ships.
    `core/src/git/__tests__/git-engine-history-pagination.test.ts` (7 tests).
- [x] **BB redaction verify: sample several points per hidden window — DONE
      2026-07-20 (this was a real hole, not polish).** `verifyOutput` computed
      ONE instant per hidden window — the midpoint — and made a single
      `frameMaxLuma` + `meanVolumeDb` call there, so a window blanked at its
      midpoint but leaking at its edges passed verification and the variant
      **was published**. Demonstrated on a real ffmpeg clip whose nominal hidden
      window `[5,15]` is blanked only over `[8,12]`: `maxluma@10.0 = 0` (old
      check passes) vs `maxluma@5.25 = 255` and `@14.75 = 255`; the pre-fix run
      published it (`published: 1`). Now probes start/middle/end, inset from
      both edges and de-duplicated so a sub-ms window yields one probe rather
      than three identical decodes. The `volumedetect` width is narrowed at edge
      probes (`min(1s, 2×distance-to-edge)`) because it centres its window on
      the probe instant — a fixed 1 s width would spill past the hidden range
      into legitimately audible public audio and fail a CORRECTLY blanked file.
- [x] **BB transcription gateway: stream instead of whole-file Buffer — DONE
      2026-07-20.** `prepareAudio` did `getFileContent(uuid)` into a single
      Buffer then wrote it out. The upload cap is 16 GiB and Node's max Buffer
      is ~2 GiB, so a long meeting **could not be transcribed at all**, and
      shorter ones pinned their full size in RSS per in-flight session. Now
      pipes provider → temp file via `stream/promises.pipeline`, which destroys
      both ends on error so a mid-transfer failure cannot leave a silently
      truncated file that the engine would happily transcribe as a short
      meeting. `getFileContent` remains the fallback for stores without a
      streaming path.
- [x] **BB polling workers: status-scoped query — DONE 2026-07-20, and it
      exposed a CORE bug worth its own attention.** `record-store.ts` applies
      `LIMIT` **unconditionally** with `const limit = options.limit || 10`,
      while `total` comes from a separate `COUNT(*)`. Any caller omitting
      `limit` therefore gets 10 rows next to a correct-looking total — silent
      truncation that reads as complete data. All three scans omitted it, so
      each poll cycle only ever saw the 10 most recently created sessions: past
      the 10th recording an older `pending` session was never rescanned (its
      verified variant never published), older sessions were never transcribed,
      and — worst — the backfill's keep-vs-re-home decision saw only 10
      sessions, so a verified variant on an older session would have been
      re-homed and **its public object deleted**. All three now page with a hard
      stop + truncation log, and scope on DB `metadata` evidence-gated: a row
      with absent/unparseable metadata still falls through to the authoritative
      read, so the filter degrades to a no-op and never to a skip. **Follow-up —
      DONE 2026-07-20, root-caused in `record-store.ts`.** Patching the three
      call sites left the trap armed for the next caller, and one caller was
      already in it: `cli/src/commands/auto-index.ts` called `listRecords()`
      bare, printing `total` alongside 10 rows. `limit` is now `number | 'all'`
      and **omitting it means `'all'`**, so the default is the complete, correct
      answer rather than a silent page. An oversized corpus throws against
      `ALL_ROWS_HARD_CAP` (100k, matching the ceiling the three hand-rolled
      loops already accepted) instead of truncating — checked against the
      `COUNT(*)` this method already runs, so the guard is free. `??` also stops
      an explicit `limit: 0` from being coerced to 10.

  Because a first-class "give me everything" now exists, the three duplicated
  scan loops collapse to one call each: three copies of one workaround was a
  missing primitive, not three bugs. That also retires their silent truncation
  at the page cap and the page-edge race they shared (offset paging over a
  non-unique sort can shift a row across an edge under a concurrent insert).
  `searchRecords` in the same file got the identical treatment, and it turned
  out to be the worse of the two. First the consistency fix: its FTS path
  defaulted to 20 while its LIKE fallback applied no limit at all and silently
  dropped `offset` unless a limit came with it, so the same query returned a
  different result set depending on whether the search service was up — and a
  fallback is exactly when nobody is looking. Then the same `number | 'all'`
  contract, omission meaning `'all'`, guarded by the shared `ALL_ROWS_HARD_CAP`;
  since there is no COUNT to check against on this path it asks the engine for
  cap+1 rows and throws if that extra row arrives.

  **The reason it needed more than consistency:** `searchRecords` returned a
  bare array with no `total`, so truncation here was not merely easy to miss but
  undetectable — a caller holding 20 rows had nothing to compare them against.
  The layer above filled that vacuum with a fabrication:
  `record-manager/search.ts` returned `total: resultRecords.length` under a
  `// Approximate total` comment. That is the page size relabelled as the corpus
  count, and the API divides it by the page size — so **whenever the FTS service
  was down, a search matching 500 records told the client there were 20 of them
  in exactly one page**, with no error anywhere. The store now returns a real
  COUNT over all matches and the manager forwards it. The two `|| 20` defaults
  in that passthrough are gone as well: a middle layer inventing its own page
  size hid the store's contract from everyone above it.

  Deliberately left alone: `getSearchSuggestions`' `|| 10` (a genuine top-N
  autocomplete default), `SqliteSearchService`'s internal `limit = 20` (the
  engine's own contract, and the store now always passes an explicit value), the
  API layer's numeric-only `limit` (an HTTP endpoint should always page —
  `'all'` stops at the service boundary by design), and `upload-processor.ts`
  (already scoped in SQL).

- [x] **realtime-005 snapshots — DONE 2026-07-20.** Cap (`MAX_SNAPSHOT_BYTES`)
      and the sha256 integrity hash with verify-on-load were ALREADY implemented
      and tested — confirmed and not redone. The two genuine gaps: **(a) prune
      versions** — `persist()` only ever INSERTs with a climbing `version`, and
      the TTL sweep cannot compensate because `cleanupExpired` deliberately
      skips rooms in `activeRoomIds`, so a continuously-edited document
      accumulated one row (up to 1 MB) per snapshot interval **forever** and the
      busiest documents were exactly the ones never reclaimed. Added
      `MAX_SNAPSHOT_VERSIONS_PER_ROOM` + `listVersions()` on both backends +
      `pruneVersions()` on the write path (never throws — losing a snapshot is
      worse than keeping a stale row). **(b) Markdown recovery** — the re-seed
      path existed but had ZERO coverage; nothing ever corrupted a snapshot and
      then connected. Added a test driving the real path (real SQLite rows
      corrupted in place, real WebSocket hydration), with a discriminator
      asserting an intact snapshot still wins.
- [x] **Templates route file-watch service per request → singleton — DONE
      2026-07-20, but the stated ROOT CAUSE WAS WRONG.** There was no
      fd/listener leak: `TemplateCacheAdapter` builds its own `FileWatcherCache`
      only in the branch taken when NO cacheManager is supplied, and the route
      always supplies one (`civicPress.getCacheManager()` resolves a container
      singleton, and `civic-core-services.ts` registers the
      `templates`/`templateLists` caches), so the adapter borrows the manager's
      already-watching caches and **no watcher was ever created per request**.
      The real per-request cost was a fresh TemplateEngine + TemplateValidator
      on every call plus a `setKeyMapper()` write into the SHARED cache object
      from inside a request handler on every call. Fixed with a
      `WeakMap<CivicPress, TemplateService>` (keyed on the instance, since the
      API test harness builds one CivicPress per test context). **No disposal
      hook was needed and `modules/api/src/index.ts` was NOT touched** — the
      watchers belong to the cacheManager, which `CivicPress.shutdown()` already
      shuts down.
      `modules/api/src/__tests__/templates-service-singleton.test.ts` (3 tests,
      proven to fail pre-fix: 5 constructions instead of 1).
- [x] **CLI parity + `users:delete` confirmation — DONE 2026-07-20.**
  - `--no-color`: **already implemented**, no change made. `cli/src/index.ts`
    declares the flag and forwards it to
    `CentralConfigManager.setLoggerOptions`, `Logger` honours `noColor`, and
    chalk auto-detects `--no-color` in argv.
  - `view --json` purity: **REAL BUG, root cause was one line.**
    `initializeLogger()` was `new Logger()` — no options — so the logger's
    `json` stayed false no matter what the user passed. `Logger` already
    suppresses ALL its own output in JSON mode; it was simply never told. Under
    `--json`, `view` therefore printed banners, separators and the rendered
    markdown around the JSON blob and stdout did not parse. Two further leaks
    fixed: `CliOutput.startOperation`'s end-closure logs "CLI operation
    completed" UNCONDITIONALLY (outside the `if (json)` guards every other
    method has), and `view`'s catch used `logger.error` — silenced in JSON mode
    — so a `--json` failure exited 1 with NO output; it now uses `cliError`.
    **Deeper root cause, also fixed:** `CentralConfigManager.setLoggerOptions()`
    was **write-only dead state** — the CLI called it at startup and NOTHING
    ever read it back, so core-side loggers (`getLogger()` in role-manager,
    secrets.ts, …) kept printing under `--json`. It now publishes process-wide
    defaults via `setGlobalLoggerDefaults()` in `logger.ts`, resolved LAZILY per
    call because several of those Loggers are constructed at MODULE level,
    before any flag is parsed. Explicit constructor options still win.
  - `list` human mode: the non-JSON path printed ONLY "✅ Successfully listed N
    records" — the records themselves were never rendered. Now prints a table (+
    a by-status summary), guarded on `!json` because `cliTable`/`cliList` would
    each emit a SECOND `{success:true,…}` blob in JSON mode.
  - `users:delete` had NO confirmation at all. Now requires interactive
    confirmation, with `--yes`/`--force` as the scripting bypass (following
    `init`'s `--yes` and `diagnose`'s `--force`+readline convention), and fails
    closed under JSON/silent mode or a non-TTY stdin rather than deleting
    unattended or blocking on a read that will never be answered.
  - `tests/cli/cli-parity.test.ts` (9 tests) — **8 proven to fail pre-fix**; the
    9th is the guard test asserting human mode still renders, which correctly
    passes both before and after. Two stale tests updated: the two existing
    `users:delete` cases now pass `--yes`, and `security-commands`'s "should
    support JSON output" fallback asserted on PROSE ("email channel not
    enabled") that only reached the stream because of the contamination — it now
    asserts the structured error envelope.

## Refactors / tech-debt

- [x] **Migration ledger — DONE 2026-07-20.** Every migration in
      `core/src/database/schema/migrations.ts` established its idempotency by
      catching the error a re-run would raise:
      `catch { debug('column already exists or migration not needed') }`. That
      cannot tell a duplicate column apart from a locked database, a missing
      table, or a broken statement, so all of them were swallowed **at debug
      level** and `initialize()` returned success against a schema the code
      above it did not have — the failure surfacing much later, elsewhere, as a
      query against a column that was never added. `ensureWorkflowStateColumn`
      was worse than the pattern: it logged `coreError` and _returned_, and its
      post-ALTER verification logged `MIGRATION_VERIFICATION_FAILED` and carried
      on.

  Idempotency now comes from CHECKING the schema (`PRAGMA table_info` /
  `sqlite_master`), so nothing needs catching and any error propagates. The four
  hand-rolled loops collapse into one `ensureColumn` helper — of which only the
  workflow_state one had bothered to re-read the schema afterwards to confirm
  the ALTER took effect; everything gets that verification now. A
  `schema_migrations` ledger records each id with an outcome of `applied` (this
  DB executed the DDL) or `adopted` (it already had the shape), the split that
  stops an existing deployment from looking, on its first run after the ledger
  landed, exactly like a fresh one. Schema state gates the column migrations and
  the ledger records them; for the `auth_provider` data backfill, which leaves
  no schema trace, the ledger is the gate instead.

  One deliberate fail-closed change: the unique provider-identity index is
  already idempotent via `IF NOT EXISTS`, so its catch could only ever hide a
  real failure — and the realistic one is that the data ALREADY violates the
  constraint. That index is what stops one OAuth identity from being linked to
  two accounts, so it now refuses to start and names the duplicate identities
  rather than continuing without the guarantee the auth code assumes. 8
  regression tests; the no-swallow ones were confirmed to fail against the old
  behaviour (`promise resolved "undefined" instead of rejecting`).

- [x] **`withCli()` wrapper — DONE 2026-07-22.** All 69 command registrations
      across 31 files now run through `cli/src/utils/with-cli.ts`, which states
      once the two rules each handler used to restate (or miss):
      `initializeCliOutput` before any emit, and failures via `cliError` (not
      `logger.error`, which is silent under `--json`). The wrapper deliberately
      does NOT own the CivicPress lifecycle (that's a per-command behaviour
      change for another pass). Migration surfaced two real bugs — storage's
      `finally` shutdown never ran because `process.exit(1)` preceded it, and
      `cache:*` reported errors code-less with an Error serialized to `{}`
      (normalized). Interactive trio (init/login/cleanup) migrated by hand with
      a manual-test runbook at
      `docs/handoff/2026-07-22-withcli-interactive-manual-test.md`.
      `WithCliSpec` details/errorMessage take the command args so envelopes keep
      their subject.
- [x] **Standardize API response/error envelopes — DONE 2026-07-22.** One shape
      everywhere: success `{ success, data, message?, meta? }`, error
      `{ success:false, error:{ message, code, details? } }`. Stage 0 fixed the
      shared helpers (dropped redundant top-level `statusCode`, always-set
      `code`, unified the error-handler middleware's third shape). Stage 1
      converted the deviants (geography validation, config ×15 + notifications
      ×3 bare-string errors → objects, audit/info, `/info` top-level → `data` +
      its 3 UI readers, the 501 stubs, storage-handlers' `timestamp`). Stage 2
      tightened the UI `ApiResponse` type (dropped the `string`-error arm +
      index signature; a full `nuxt typecheck` proved nothing relied on them).
      Coordinated test updates — the ~7 assertions that deliberately pinned old
      shapes now read `error.message`.
- [ ] HW `ffmpeg_capture.py` decomposition; `command_handler.py` dispatch table;
      storage provider Strategy
- [x] **Config discovery — DONE 2026-07-21/22.** (a) Deleted dead
      `ConfigDiscovery` (`CIVIC_DIR='.system-data'` while config lives in
      `.civic/`, so it never found anything; zero callers/tests). (b) Fixed two
      `/config` endpoints that resolved the SAME file differently — one via
      CentralConfigManager, one via an import-time singleton with cwd-relative
      defaults — so they served different files under `CIVIC_DATA_DIR`. (c) The
      `dataDir` split-brain: `.system-data` (DB, secret, storage creds,
      realtime/BB data) was located two contradictory ways (`dirname(.civicrc)`
      vs seven copies of `dirname(dataDir)`) that only agreed when
      `dataDir == <root>/data`. Settled with maintainer: anchor to `.civicrc`.
      `CentralConfigManager` resolves `systemDataDir` once + exposes
      `getSystemDataDir()`; `resolveSystemDataDir()` / `resolveProjectRoot()`
      are the single readers; `CIVIC_DATA_DIR` now sets only the data dir. Happy
      path byte-identical. **DDL vs column-migration drift — DONE 2026-07-21**
      (separate commit): the migration ledger's applied/adopted split exposed
      `records.linked_geography_files` declared only via ALTER, never in CREATE
      TABLE; added to the DDL + a behavioural guard (a fresh DB must run NO
      column migration).

## Test & CI health

- [x] **`actions/checkout` Node-20 deprecation — DONE 2026-07-24.** `ci.yml` was
      already SHA-pinned to checkout v6 (Node 24) in the CI batch; the straggler
      was `truth-check.yml`, still on the bare `actions/checkout@v4` tag (Node
      20). Pinned it to the SAME proven v6.0.3 SHA `ci.yml` uses (`df4cb1c…`,
      verified via the actions/checkout tags API) so both workflows match.
      Committed straight to `develop` rather than a standalone PR — the "its own
      tiny PR" caveat was to protect PR #20's green CI, and #20 is now MERGED
      with no open PR on develop, so the concern is moot. (The `v6` tag has
      since moved to v6.1/`d23441a…`; left ci.yml on its proven pin — routine
      SHA freshening is Renovate's job.)

- [x] **CLI eslint gate (2026-07-23).** The withCli migration (see the
      `withCli()` item above) tripped the CLI package's error-level
      `no-explicit-any` / `no-unused-vars` — caught by CI's lint step, missed
      locally because the pre-commit gate was `tsc` + `prettier`, not `eslint`.
      Fixed (file-level any-disable for CAC-option handlers + genuine unused
      removals), and the test-mock `any` warning noise was retired by flipping
      the TEST-file `no-explicit-any` `warn`→`off` per module (source stays
      `error`). **Process note: run `eslint` locally before pushing — CI does.**

- [x] **Tier-C skeptic coverage-gap follow-up — DONE 2026-07-20.** Covered by
      `tests/api/pagination-sql-side.test.ts` ("geography linked-records" block,
      4 tests): rows linking the geography across multiple pages, exact `total`
      and a consistent `totalPages` on every page, no drops and no duplicates,
      plus three decoys the old JS scan never had to survive — an id that
      CONTAINS the target as a prefix (`geo-target-2`), the target string
      appearing in a `name` field instead of an `id`, and a row whose
      `linked_geography_files` is malformed JSON. The scan-cap seeding the entry
      asked for is moot: the endpoint no longer scans at all (see the SQL-side
      pagination entry above), so the cap is gone and correctness no longer
      depends on batch-loop termination.

- [x] **QUARANTINE BURN-DOWN — DONE 2026-07-17
      (`refactor/phase-7e-test-health`).** All 5 files now pass individually AND
      together from a clean checkout; removed from the `CIVIC_TEST_QUARANTINE`
      list (hook retained empty). The "flaky" cluster was NOT flaky — it
      surfaced **3 real product bugs** + 1 latent core bug, plus stale test
      expectations:
  - **config-validation 403 (REAL bug, FA-API-018 regression):**
    `csrfMiddleware` is mounted AT `apiPath('config')`, so Express strips the
    base and `req.path` is `/:type/validate` — the `config/…/validate$`
    skip-regex never matched, so the _public_ validate endpoint always demanded
    a CSRF token. Fix: match `req.baseUrl + req.path` (query-free full path).
    Regression test added + proven to catch it; FA-API-018 query-spoof still
    blocked.
  - **editor 403×5 (STALE tests):** publish `draft→approved` is correctly
    blocked by the FA-API-008 review-chain guard; tests now publish to
    `published`. Fixing the 5th exposed a **REAL core bug:** the publish
    idempotency key (was `hash(user,recordId,draftId,request)`) omitted draft
    content + targetStatus, so an edit-then-republish within the ~5-min dedupe
    TTL returned the prior publish's cached result and silently dropped the
    edit. Fixed by scoping the key to the draft's content+target in
    `record-manager.publishDraft` (closes the "include targetStatus in derived
    publish keys" deferral below, and then some).
  - **BB 6 failures → 2 REAL bugs + 1 stale test:** (a)
    `002_enrollment_codes.sql` had a **backwards FK**
    (`device_uuid REFERENCES broadcast_devices`) — an enrollment code
    legitimately PRECEDES the device row; inert until Tier-A `foreign_keys=ON`
    turned it on, then it broke ALL device onboarding in production. Removed the
    FK (mirrors the 001 no-FK precedent). (b) The ack-gated `start_session`
    (`device-command-service.ts:258`) forwarded the DB id where the room is
    keyed by `deviceUuid`, so the command never reached the device yet the
    session still flipped to `recording` — the exact FA-BB-008 phantom-recording
    mode. Fixed to route on `device.deviceUuid`. (c) upload-e2e `public_file`
    `toBeUndefined()`→`toBeNull()` (finalize writes null by design to clear
    stale pointers; still falsy → fail-closed holds).
  - **cli/me ×2 (STALE tests):** FA-CLI-003 hardened the token-guidance message;
    updated the two assertions to the current strings.
  - **STILL OPEN (deeper isolation issue, unchanged):** several files
    (users/records/security-features/auth) fail only on DIRTY checkouts
    (leftover users → 409s) because `createAPITestContext` shares a repo-level
    `.system-data` users DB across files. Not required for the burn-down (clean
    CI runs pass), but the proper fix is the `CentralConfigManager.reset()` /
    per-test system-data isolation item below.
  - **DONE 2026-07-17 (phase-7f), defense-in-depth (BB):**
    `SessionController.startSession` now inspects the `executeCommand` result's
    `.success` and fails closed — `executeCommand` RESOLVES with
    `{success:false}` (it does not throw) on disconnect/timeout/nack, so the
    session no longer flips to `recording` on an unacked send (the FA-BB-008
    invariant). Unit test added for the failure path; the device-ws e2e tests
    now have the fake device actually ACK commands (they previously relied on
    the 5s timeout-then-proceed and never confirmed an ack).
- [x] **`CentralConfigManager.reset()` in setup/teardown — DONE 2026-07-17
      (phase-7g).** Root cause of the cross-file dirty-state 409s: the repo-root
      `.civicrc` has no `dataDir`/`database`, so `CentralConfigManager` defaults
      the sqlite path to the shared `<repo>/.system-data/civic.db`; the cached
      static singleton was resolved once (cwd = repo root, before a test's
      temporary chdir) and never reset, so every API test — even across separate
      `forks` — wrote users into that one on-disk DB and 409'd on
      re-registration. Fix (`tests/fixtures/test-setup.ts`): import
      `CentralConfigManager` and `reset()` right after the chdir-into-testDir
      (so config re-resolves from the per-test `.civicrc` → isolated
      `testDir/test.db`) and on teardown; `createExtendedAPITestContext` also
      gained the missing chdir+reset (it never chdir'd, so it always hit the
      shared DB). Verified: the formerly dirty-sensitive cluster
      (users/records/security-features/auth/ user-management) now passes **twice
      back-to-back with no cleaning** and the shared repo-root DB is never
      created; a 12-file parallel probe is likewise clean. **Parallelism
      restored — DONE:** the shared-DB contention the CI "flakes under load"
      comment blamed is gone (`forks` already isolates memory; the shared DB was
      the only cross-file coupling). The FULL root suite was validated green in
      parallel (165 files / 1530 tests at `fileParallelism:2`, shared DB never
      created), so CI dropped `--fileParallelism=false` (`ci.yml`) and the root
      suite runs in parallel again. The empty `CIVIC_TEST_QUARANTINE` hook is
      retained for parking a future regression with a tracker entry.
- [x] **Un-skip 8 security-critical auth tests — DONE 2026-07-17.** Un-skipped
      all 8 in `security-features.test.ts`; now pass. The "400-vs-403" was real:
      **4 code bugs** (external-auth password rejection returned 400 not 403
      across change-password/set-password/PUT-update; non-existent set-password
      target → 500 not 404) fixed in the API handlers WITH the external-auth
      guards preserved and the admin(403) check kept ahead of the existence(404)
      check; **4 stale tests** (`password`→`newPassword` field,
      `body.data.message`/`body.error.message` paths, verify-email token read
      via raw DB query NOT `getUserById` — that column is a live verification
      secret).
- [x] **`isLosslesslyRoundTrippable` tests — already DONE (stale entry, verified
      2026-07-24).** `tests/ui/editor/content-loss-guard.test.ts` (16 cases,
      green under `vitest.config.ui.mjs`) landed with the feature in `0fbb660`
      (W5-T9): round-trippable path (paragraph/headings/GFM
      table/civic-ref/lists/code/blockquote/empty/literal-`<`),
      non-round-trippable fallback (raw HTML block, inline `<span>`/`<br>`,
      non-civic-ref comment, footnotes), and malformed input (never throws →
      false). No gap.
- [x] **FA-BB-002 redaction e2e mandatory in CI — DONE 2026-07-24.** The
      redaction e2e (`tests/broadcast-box/redaction-e2e.test.ts`) is the only
      proof that published A/V bytes are actually blanked/silenced, but it was
      `describe.skipIf(!HAVE_FFMPEG)` — a broken ffmpeg install in CI would drop
      it out of coverage with a green build. Added a `CIVIC_REQUIRE_FFMPEG`
      gate: when set (CI sets `=1` on the Root-test-suite step, right where
      ffmpeg is already apt-installed), a missing ffmpeg now FAILS a guard test
      loudly instead of skipping; unset (local dev) keeps the clean self-skip.
      Verified all three modes: required+present → real suite runs+passes (guard
      skips); required+missing → hard fail; unset+missing → clean skip.
- [ ] HW capture-builder tests; frontend tests
- [x] **Skip triage — DONE (skip portion; 2026-07-24, commit `7502987` on
      `origin/develop`).** The "36 skips" (2026-07-14/15 count) is burned down:
      phases 7e–7j cleared the quarantine cluster, and a 2026-07-24 sweep took
      the draft→publish/workflowState cluster + the fully-disabled Auto-Indexing
      suite. Un-skipping AGAIN surfaced **2 real prod bugs** — (a) workflowState
      never cleared on publish (first-publish stored `workflow_state='draft'`
      via `undefined→'draft'` defaults + a `null||'draft'` read coercion →
      published records leaked into `listUnpublishedRecords`); (b) record locks
      never renewed (`acquireLock`'s atomic ON CONFLICT rejected the SAME
      holder, and the UI's `refreshLock()` re-POSTs the acquire endpoint → every
      renewal 409'd → holder's own lock silently expired mid-edit). 10/12
      un-skipped + passing; stale tests fixed (draft-GET needed `?edit=true`;
      me.test.ts `--silent` asserted a non-existent string → real
      banner-suppression differential). **Remaining real skip = 1 justified
      deferral:** `realtime-server.test.ts:390` needs
      `RecordRoomHandler.onConnect` (W5). (Auto-indexing test 3 was the other
      deferral; it was **un-skipped once core-002 wired the hook→WorkflowEngine
      path** — see the core-002 entry below.) Every other skip is an env-gated
      `skipIf` (ffmpeg/whisper). Test-isolation landmine also fixed: the
      auto-indexing test's dataDir sat inside the repo, so the record saga
      git-committed test records into THIS repo → moved to `os.tmpdir()` via
      `createTestDirectory` + a `.gitignore` guard for repo-root scratch dirs.
- [x] **fake-timer adoption — DONE 2026-07-24** (the other half of the old
      "Triage 36 skips" line). Converted the 7 unit-test files whose sleeps were
      _incidental waits_ on a timeout / TTL / duration to `vi.useFakeTimers()` +
      `advanceTimersByTimeAsync`: both circuit-breakers (core diagnostics +
      storage), diagnostics cache (TTL), resource-monitor (duration), storage
      timeout-utils (`withTimeout` race), diagnostics check-executor
      (single-check timeout), storage health-checker (check timeout + latency).
      Each went from real 50–600ms sleeps to a few ms and is now deterministic
      (no more "sleep must out-race the timeout" flakiness). Verified per-file +
      full suites green (core diagnostics 94, storage 234). **Deliberately left
      on REAL timers** (documented inline): tests that assert genuine
      concurrency/periodicity via wall-time — concurrency-limiter,
      check-executor's max-concurrency, health-checker's periodic-checks — and
      the integration/e2e suites (realtime/device-ws/saga/upload), which wait on
      real async I/O, not fakeable clocks.
- [x] **core-002 — WorkflowEngine wired + made honest — DONE 2026-07-24.** The
      2026-05-16 manifesto-fit audit flagged
      `WorkflowEngine.approval/publication/archivalWorkflow` as "log-only stubs
      registered as if functional" and `HookSystem`'s workflow integration as a
      stub. Resolution did BOTH halves of the audit's "retire OR wire":
  - **Wired** the hook→engine path: `HookSystem.setWorkflowEngine` (setter
    injection in `civic-core-services.ts`, no cycle), and `executeWorkflow` now
    calls `WorkflowEngine.startWorkflow` — **fire-and-forget** (keeps the record
    op non-blocking) and **guarded by `hasWorkflow(name)`** so config-only names
    (`validate-record`, `notify-*`) skip quietly instead of throwing per op.
    `record:updated → update-index` now really re-indexes; the skipped
    auto-indexing test 3 is un-skipped and green.
  - **Retired** the three fake stubs (removed their `registerWorkflow` +
    methods) — nothing triggered them, and the spec's real design is sandboxed
    user `.js` (docs/specs/workflows.md), not hardcoded engine methods.
  - **Dedupe:** dropped `update-record-saga`'s `QueueReIndexingStep` (the hook
    now re-indexes published-record updates) so an update indexes once, not
    twice. Create/publish keep their saga indexing (their hooks aren't mapped to
    `update-index`).
  - **Capped** `activeWorkflows` (previously never pruned) now that it's driven
    at record-op volume. Verified: auto-indexing 3/3,
    hooks+workflows+saga+di+indexing 148 green, record/publish regression 104
    green, core builds + lints clean.

## Roadmap-tier (scope with user before starting)

- [x] **Supply-chain CI hardening (dependency scanning + disclosure policy) —
      DONE 2026-07-25.** Added `.github/SECURITY.md` (private-disclosure policy,
      supported versions, coordinated- disclosure targets) and a SHA-pinned
      GitHub Action:
  - **osv-scanner** (`google/osv-scanner-action` v2.3.8 reusable workflows) — PR
    diff-scan FAILS on a newly-introduced vuln; weekly `schedule` +
    `workflow_dispatch` full scan REPORTS to Security > Code scanning
    (`fail-on-vuln: false`, so a pre-existing advisory surfaces without breaking
    a build). No `push` trigger, so it can't red-CI `develop` on introduction.
  - ~~dependency-review~~ **removed** (`404a82c`-era):
    `actions/dependency-review-action` requires the repo's **Dependency Graph**,
    which is disabled here (org/repo setting we can't toggle) — it errored
    "Dependency review is not supported on this repository" on every PR.
    osv-scanner's PR diff-scan already provides the dependency-vuln gate, so
    this was dropped rather than left permanently red. Re-add
    `dependency-review.yml` if Dependency Graph gets enabled (it also brings
    license checks + an inline PR comment osv-scanner lacks). **Remaining
    supply-chain sub-items** (folded into the roadmap line below): CodeQL SAST
    (a code-security axis, distinct from these dependency-focused tools) and the
    Node-pin reconcile (actions are SHA-pinned; a `.nvmrc`/`engines` audit is
    still outstanding). **First-scan finding (osv-scanner v2.4.0 on
    `pnpm-lock.yaml`, 2026-07-25):** the current tree has **94 known
    vulnerabilities across 36 packages (3 Critical, 45 High, 33 Medium, 13 Low)
    — all with fixes available.** These pre-date the tooling and are why the
    full scan runs report-only. Remediation is tracked as its own item ↓.
- [x] **Dependency vulnerability remediation — DONE 2026-07-25 (94 → 2).**
      Remediated via a centralized `pnpm.overrides` block (forces non-vulnerable
      versions tree-wide; Renovate can retire entries as real ranges advance),
      each batch build+test verified:
  - **Same-major (semver-safe):** ajv, axios, body-parser,
    brace-expansion(1/2/5), diff, dompurify, esbuild, fast-uri, form-data(2/4),
    glob, happy-dom, js-yaml, morgan, nuxt (4.4.7, minimal), postcss,
    shell-quote, svgo, undici, valibot, vitest+@vitest/ui, yaml.
  - **Compatible-API majors (tested):** nodemailer 7→9, @tootallnate/once 1→2,
    uuid 8/9→11, markdown-it 13→14 + linkify-it 4→5, **multer 1→2** (upload
    paths retested), **tar 6→7** (needed a one-line `import * as tar` fix in
    `backup-service.ts` — tar 7 dropped its default export; backup
    create/restore retested).
  - Verified: all workspaces build; ~350 tests across
    core/api/integration/storage/bb-upload/ backup/editor-schema — all green.
  - **Residual (2, accepted):** `brace-expansion` GHSA-mh99-v99m-4gvg (CVSS 7.5
    DoS) is modelled as a flat range (fixed only in 5.0.8), and 5.x is ESM-only
    — forcing it under old CJS `minimatch@3`/glob would break foundational
    pattern-matching. brace-expansion is reached only via INTERNAL glob patterns
    (test/config/gitignore matching), never user request input, so the DoS is
    not exploitable in the request surface. Left at the highest safe same-major
    versions (1.1.16 / 2.1.2 / 5.0.8); revisit when the old CJS minimatch
    consumers age out. The scheduled osv-scanner (report-only) will keep it
    visible.
- [x] **CodeQL SAST + Node-pin reconcile — DONE 2026-07-30 (finishes the
      supply-chain bundle).**
  - **CodeQL** (`.github/workflows/codeql.yml`): SHA-pinned
    `github/codeql-action` v3, language `javascript-typescript`,
    `build-mode: none` (JS/TS needs no compile, no dep install; a fresh checkout
    has no node_modules/dist so only first-party source is scanned). REPORT-ONLY
    — the analyze step succeeds even with alerts, so it never gates CI (only
    build-test + audit-truth-check are required). Runs on PRs to main/develop,
    pushes to main, weekly, and `workflow_dispatch`. Findings land in Security >
    Code scanning (SARIF, same channel osv-scanner already proved works).
  - **Node-pin reconcile**: added `engines` to the root `package.json`
    (`node: ">=22"`, `pnpm: ">=9"`) — previously absent. Now all Node/pnpm pins
    agree: `.nvmrc` 22.22.3, `.npmrc` `use-node-version=22.22.3`, CI
    `node-version-file: .nvmrc`, `packageManager pnpm@9.15.9`, and the new
    `engines` floor. Metadata-only (no `engine-strict`), so it declares the
    requirement without breaking installs on patch drift.
- [ ] `ui-003` SSR; signed appliance image; HW config-apply/reboot/button;
      equity/i18n; doc-drift sweep
- [x] **Uncleared-surface follow-up — AUDITED + hardened 2026-07-30.** The
      2026-07-02 carry-forward surfaces (quick-start/by-meeting authz, FTS
      injection, config reflection, `core/src/indexing` rebuild, geography
      `generateFilename`) were audited via 4 parallel read-only passes +
      verification: **no live vulnerability on any** (prior FA-\* fixes +
      admin-only gating hold). Low / defense-in-depth hardening applied anyway
      (#2–#8) + dead-code cleanup (#9):
  - **#2** 512-char cap on the two PUBLIC search endpoints (`search.ts`) —
    unbounded `q` built an oversized FTS5 expression on the event loop.
  - **#3** `system:admin` gate on credential-bearing config (`notifications`) so
    it stays admin-only even if `config:manage` is ever delegated (chose a gate
    over redaction to avoid the save-back-`[REDACTED]` clobber footgun).
  - **#4** fail-closed auth on the config router (`!civicPress` was
    fail-open-shaped, saved only by the next `requirePermission`).
  - **#5** `quick-start` validates a supplied `meetingId` resolves to a real
    `meeting` record (was spread into `linked_records` unchecked).
  - **#6** YAML parse-validation on raw config writes (an invalid file used to
    500 the PUBLIC `GET /info`).
  - **#7** core-layer `type`/`category` path-segment guard in
    `createGeographyFile` (self-defends regardless of caller).
  - **#8** single-flight guard on `IndexingService.generateIndexes` —
    overlapping calls coalesce with a trailing re-run instead of concurrent full
    re-scans.
  - **#9** removed the dead `IndexingOptions.rebuild` flag (+ the `--rebuild`
    CLI option, a no-op) and dead `query-parser` funcs (`buildPostgreSQLQuery`,
    the unused JS Levenshtein).
  - **False positive:** `POST /diagnose/fix` is already admin-only via
    `requireDiagnosticAuth` (verified from source — no change). **By-design
    (recorded, not gaps):** quick-start `createRecord` bypasses the per-type
    `can_create` ACL; `by-meeting` `:view` is coarse-grained/global.
    **Consciously deferred:** a dedicated per-mount `/indexing` throttle
    (redundant with the single-flight guard + the global limiter for an
    admin-only Low item).
  - Verified: 4 modules `tsc`-clean; 120 targeted + regression tests (11 new)
    green; eslint + truth-check pass. Audit doc annotated
    (`docs/audits/2026-07-02-full-audit.md` carry-forward section).

## Discovered during the 2026-07-30 status-doc verification

> **RESOLVED 2026-07-30** — the four highlighted issues (plus the concrete
> honesty/UI items in the bundle) are FIXED and pushed to `develop`: `b77974a`
> notifications-truthfulness, `42ab1f0` storage.yml-applied, `9e81c9a` realtime
> per-record authz + realtime tests now run in CI, `0268ce7` advertised-but-stub
>
> - UI defects. The remaining `[ ]` items below are the test-coverage gaps and
>   dead-code cleanup, which were out of that scope.

The `project-status.md` rewrite ran three parallel read-only feature audits
across the whole platform. They confirmed the honest status now in that doc and
surfaced these **real** (non-doc) findings — captured here so they become
tracked work rather than getting lost. None are regressions from recent work;
they are pre-existing gaps the audit made visible.

**Correctness / truthfulness (worth fixing)**

- [x] **Notifications mis-report SMTP failures as success.**
      `NotificationService` ignores `ChannelResponse.success`
      (`notification-service.ts:286-297`) and the adapters catch SMTP errors and
      `return {success:false}` instead of throwing — so a real delivery failure
      is audited as `notification_sent / success:true`. Email is also
      `enabled:false` by default and the auth flow swallows the error and
      returns the token anyway, so "verification email sent" can succeed with no
      send. (Ironic given the truth-check culture — this is a real
      audit-truthfulness bug.)
- [x] **API ignores `storage.yml`.** `initializeStorageService`
      (`storage-services.ts:114-160`) loads the config then discards it
      (`:150`), so the API always runs the local provider; S3/GCS/Azure and
      `global.*` tuning are unreachable via the API (the CLI honors them).
- [x] **Realtime has no per-record authorization.**
      `RecordRoomHandler.onConnect` (`record-room-handler.ts:136-139`) is
      `return {success:true}` — authentication is enforced (`validateSession`),
      but any authenticated user can open/edit any record room (incl. a
      nonexistent id). The real `authenticateConnection` (`auth.ts:36`) is dead
      code, its test skipped (`realtime-server.test.ts:390`, the "W5" item).
      Client even has 4003/4004 close-code copy the server never emits.
- [x] **`hooks.yml` advertises unregistered workflows.** Default config
      references `validate-record` / `notify-council` / `notify-stakeholders` /
      `notify-author` (`hook-system.ts:191-217`) but only `update-index` is
      registered, so those 4 are silently skipped — 1 of 5 default hooks does
      real work.

**CI / test-coverage gaps**

- [x] **Realtime module unit suite (13 files, ~5,200 LoC) does not run in CI.**
      `modules/realtime/src/**/__tests__` is not in the root vitest `include`
      and there is no realtime CI step; only the 3 `tests/realtime/` integration
      tests gate CI. Add a realtime test step / include.
- [x] **Seven routers now have HTTP tests — DONE 2026-07-30.** Added supertest
      integration suites for `info` (5), `cache` (7), `notifications` (4),
      `diagnose` (7), `diff` (6), `templates` (6), and `validation` (9) — 44
      tests. Surfaced + fixed 4 real defects: `requirePermission`'s 403 dropped
      `success:false` (broken envelope); `GET /diff/:recordId/commits` 500'd on
      every default call (`git.log({author:undefined,since:undefined})` →
      malformed git args); the API fixture never seeded `.civic/org-config.yml`
      (500'd public `/info`); the fixture admin role lacked `templates:view`
      (production admin has it). Full `tests/api/` suite green (38 files).
  - **Mislabeled-tests follow-up — DONE 2026-07-30.** `sort-api.test.ts` was a
    placeholder that asserted inline logic (a locally-defined `getKindPriority`,
    `typeof sort === 'string'`) and hit no real code — **upgraded** to a real
    supertest suite over `GET /records?sort=` (default `created_desc`, each
    accepted value echoed back, actual ascending/descending title ordering,
    invalid → 400, `relevance` → 400). Noted in passing that the handler's
    `INVALID_SORT_CONTEXT` branch is unreachable dead code — the validator's
    `isIn` allowlist rejects `relevance` first (left as-is; behavior is
    correct). `pagination-sql-side.test.ts` is a legitimate service-layer test
    (drives `RecordsService` directly, real DB) — **relocated** to
    `tests/integration/` (alongside `draft-publish-workflow.test.ts`) so
    `tests/api/` honestly means HTTP; content unchanged.
- [ ] **UI page-component / e2e coverage — IN PROGRESS 2026-08-01.** Using the
      established `@vue/test-utils` `mount` + `#imports`-shim harness (not
      `@nuxt/test-utils` `mountSuspended`, which would need a divergent
      `environment: 'nuxt'` config fighting the root-based setup). - **Done:**
      auth-flow pages (`login`, `forgot-password`, `reset-password` — 12 tests);
      editor composables `useRecordEditorActions` (save/publish/ delete),
      `useRecordLock` (acquire/409/release/lost-lock/refresh), and `useAuth` (13
      tests). Also fixed the test config's `#app` alias (was a dir with no index
      → any `from '#app'` import failed to resolve; now points at the
      nuxt-imports shim like `#imports`). Also ported an `enforce:'pre'` Vite
      plugin (from the HW frontend harness) that rewrites
      `import.meta.client`→`true` (space-padded) so client-guarded composables
      run under test — `useCsrf` (7) and `useRecordDetail` (fetch, link
      navigation, status-history normalization — 6) are now covered. Then the
      **records-editor page SFCs were mounted end-to-end (2026-08-01, cont.):**
      `records/[type]/[id]/edit.vue` (11 tests — mount-time fetch, published-vs-
      draft breadcrumbs, loading skeleton, access-denied gating, fetch-failure
      toast, the `@saved`/`@delete` wiring driven through real child emits,
      delete→navigate, and the `realtimeEnabled`→`collaborativeMode`
      passthrough) and `records/[type]/new.vue` (6 tests — role-gated create,
      POST→navigate on success, and both create-failure paths). ⚠️ Harness
      gotcha worth remembering: `edit.vue` _imports_ RecordForm so it stubs via
      `vi.mock('~/components/RecordForm.vue')`, but `new.vue` _auto-imports_ it
      (no import statement in the SFC) — `vi.mock` can't intercept an
      auto-import, so there RecordForm must be a global stub component or the
      mount fails to resolve it. UI suite 239→256. - **Still open:** a
      browser-e2e layer (Playwright/Cypress) for a few journeys — independent of
      the `ui-003` SSR decision — plus the remaining page tail that belongs to
      the broader page/panel-coverage slice (record detail `index.vue`, the
      generic `records/new.vue`, `drafts.vue`, the `_components/*` panels, and
      the config / users / geography edit pages).
- [x] **Cloud storage providers now covered — DONE 2026-07-31 (PR #23).** The
      S3/Azure/GCS SDK code (reachable via the API since `42ab1f0` applied
      `storage.yml`) had zero coverage — every prior suite drove
      `active_provider:'local'`. Added two hermetic suites (38 tests) that mock
      the `sdk-loader` seam so they never import the real, often-absent cloud
      SDKs (Azure/GCS are `optionalDependencies` and were not installed on the
      VM):
  - `cloud-provider-ops.test.ts` (21) — upload/download/delete/stream across all
    three providers: provider_path formatting, prefix handling, not-found →
    null, S3 `transformToByteArray` vs async-iterable Body, Range headers,
    streamed byte-count sizing, and the GCS-stream-download-unsupported → null
    limitation (pinned explicitly rather than left silent).
  - `provider-init.test.ts` (17) — client bootstrap: S3
    creds/endpoint/sessionToken/forcePathStyle, Azure connection-string vs
    shared-key, GCS bucket exists/create/keyFilename, and every
    missing-credential error path.
  - Storage suite now 204 green (was 166); `tsc --noEmit` + eslint clean. The UI
    page-component/composable gap above remains open.

**UI rough edges (quick)**

- [x] `ConfigurationField.vue:19` ships a debug artifact —
      `<pre class="…bg-amber-200">{{ fieldType }} ??</pre>` on every structured
      config field.
- [x] `GeographySelector.vue:25` uses `:options` (should be `:items` for
      `@nuxt/ui` v4) → dead category dropdown; `canDeleteGeography` hardcoded
      `true`.
- [x] **Structured config editor wired 2026-07-31.** The config cards linked
      only to `/raw`; each now has a primary **Edit** button →
      `/settings/configuration/:file/edit` (the structured editor) plus the
      existing **Edit Raw**. The editor + its endpoints
      (`/config/metadata/:type`, `/config/:type`, `PUT`) already existed and the
      `[configFile]/index.vue` detail page already redirected to `/edit` — only
      the cards bypassed it. ⚠️ Found + fixed a real gap in the "nicer" editor:
      `ConfigurationField.vue` rendered array/select fields with
      `USelect :options`, but `@nuxt/ui` v4 wants `:items` — so those dropdowns
      (e.g. org-config `timezone`) were dead (same v4 bug as the fixed
      `GeographySelector`). Verified end-to-end with a live browser smoke test
      (Nuxt UI + API): the structured form renders and the `default_role`
      dropdown populates (Administrator / Clerk / Public). `nuxt typecheck` +
      eslint + prettier clean; endpoints covered by the config API suite. The
      smoke test also surfaced two more `@nuxt/ui` v4 `:options` selects + a
      dev-CORS papercut — **all fixed 2026-07-31 (`bcd24ee`)**:
      `RecordList.vue:339` pagination select (`:options`→`:items`),
      `GeographySelector` v-model type (added `value-key="value"` + typed the
      ref `GeographyCategory | null`), and the API dev-default CORS origin now
      includes the UI dev port `:3030` (was `:3000`-only, blocking `pnpm dev`).
- [x] **DONE 2026-07-31.** `forgot-password.vue` was a `mailto:` stub with no
      backend route. Now a real self-service reset flow (channel-by-audience:
      email/console deliver a token link, else an operator task) + a reset page,
      backing API (`/auth/forgot-password`, `/auth/reset-password`), the
      operator notification center, and CLI. On `origin/develop`
      (`7f7ef4d`→`8795802`).

**Advertised-but-stub (honesty — either implement or stop advertising)**

- [x] Geography **KML / GPX / Shapefile** appear in every API/UI/CLI type enum
      but `createGeographyFile` throws "not yet implemented" — GeoJSON is the
      only real type.
- [x] Search **"typo tolerance"** only re-ranks substring title suggestions, not
      the main FTS query; `enable_typo_tolerance` / `enable_accent_insensitive`
      are dead options.
- [x] User `.js` **programmable workflows** (`workflow-engine.ts:64` comment)
      have no loader and no JS sandbox — spec-only (`docs/specs/workflows.md` is
      unimplemented design).

**Dead-code cleanup (low)**

- [x] **Storage failover / retry / metrics — DELETED 2026-07-30.** Even deader
      than described: the wiring setters (`setRetryManager` /
      `setFailoverManager` / `setMetricsCollector`) had **zero** callers
      anywhere, so `retryManager` / `failoverManager` / `metricsCollector` were
      permanently `null` and every `if (host.X)` branch in the ops files was
      unreachable. Removed the 3 manager classes + their 4 test files (55
      tests) + the setters/fields + the dead ops-branches (keeping the live
      circuit-breaker + direct-provider path) + the barrel exports, and the
      advertised-but-dead retry config (`retry_attempts` + `retry_initial_delay`
      / `retry_max_delay` / `retry_backoff_multiplier` / `retryable_errors`)
      from `storage.types.ts` / `storage.yml` / `civic init` — `42ab1f0` had
      just made the API apply storage.yml, so those keys were
      loaded-then-ignored. The circuit breaker stays (live, 18 tests; fail-fast
      on a down provider has standalone value). Verified 276 tests green across
      the storage unit suite (183), the characterization + API
      upload/download/delete/range suite (65), and the CLI storage suite (28).
      See follow-up below re: the now-orphaned health checker.
- [x] **Follow-up — REMOVED 2026-07-30.** `StorageHealthChecker` +
      `providerProbes` + `ProviderInit.performHealthCheck` + the dead config
      (`failover_providers`, `health_checks`, `health_check_interval`,
      `health_check_timeout`) were the failover subsystem's last leftovers — the
      checker ran a background `setInterval` probing providers, but
      `getProviderHealth` / `getHealthChecker` had **zero callers** (its sole
      consumer was the deleted failover recovery loop). **Removed** rather than
      wired: health-probing a single local-FS provider on a timer is near-zero
      value, and wiring it would mean inventing a consumer to keep
      failover-shaped code. If provider-health diagnostics is ever wanted, the
      right vehicle is an on-demand `StorageDiagnosticChecker` in the diagnose
      router (like the DB/search/config checkers), not this background timer —
      so removing it doesn't foreclose that. Also swept the stale
      `### Health & Metrics` doc section in `uuid-storage-system.md` (documented
      `/storage/health`, `/storage/metrics`, `/storage/usage` — **none of which
      exist**; metrics was removed in the prior pass, health now, usage never
      built). Circuit breaker stays. Verified: storage unit 166 +
      characterization/API/CLI 93; full api+integration+storage suite green.
- [x] **Realtime `PresenceManager` + `awareness.ts` — DELETED 2026-07-30.** Both
      were unwired dead code, reachable only through the `index.ts` barrel and
      never constructed in any live path (live presence runs through
      `y-protocols/awareness` in `yjs-sync.ts`). Removed the two files + the
      barrel exports + the 26-test `presence-manager.test.ts` (`awareness.ts`
      had **0** tests — untested dead code, not "false confidence"). ⚠️ The
      second half of this item was **stale**: `revokeUserConnections` is real
      AND core DOES emit `auth:sessions:revoked` (added `b82825b`, 2026-07-20) —
      `SessionOps.deleteUserSessions` fires it on the HookSystem `AuthService`
      receives via `initializeHooks()`, so the teardown is live end-to-end.
      Corrected the two comments that still claimed "core never emits"
      (`realtime-server.ts` + `session-revocation.test.ts`). Realtime suite
      green (12 files / 131 tests).
- [x] **CLI `cleanup.ts` — routed through core 2026-07-30.** It's a live,
      legitimate command (factory-reset complementing `civic init`), so **fixed,
      not deleted.** It now resolves its delete targets through
      `CentralConfigManager` (new `getProjectRoot()` + `getDataDir()` /
      `getSystemDataDir()`) instead of paths hardcoded relative to the CLI's
      install location, so a relocated `dataDir` / `CIVIC_DATA_DIR` — or the
      command run from a real install rather than the monorepo — targets the
      actual project. Dropped the stale `modules/api/{data,.civic}` hardcodes
      (unreferenced in source) and now removes the WHOLE `.system-data` dir
      (secret + storage creds too — the old code deleted only `civic.db` and
      left crypto material behind, so a re-init silently reused the old secret).
      ⚠️ The smoke test uncovered a **pre-existing** bug: cac camelizes
      `--yes-i-know` to the key `yesI-know`, so `options.yesIKnow` was always
      undefined and the FA-CLI-002 `--force` guard **refused every
      non-interactive run** (the documented CI path never worked) — fixed with a
      defensive `isForceAcknowledged()` read. Extracted
      `resolveCleanupTargets()` + `isForceAcknowledged()` as testable helpers;
      added `cleanup.test.ts` (8 tests) — the command had zero behavioral
      coverage before. Verified: a real relocated-`dataDir` project wipes +
      recreates the right locations; CLI suite green (12 files / 89),
      characterization test green (17).
