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

## Tier C — correctness bugs

- [ ] Storage streaming: failover/retry/metrics parity, GCS support, streamed size≠0
- [ ] `updateFile` folder-cache invalidation; failover-on-read returns wrong null
- [ ] `CIVIC_DATA_DIR` DB-path divergence + dropped `.civicrc`
- [ ] CLI `login`/`auth:login` never persists token where `resolveToken()` reads
- [ ] geography `/linked-records` 1000-cap row loss + totals; `/records/:id/raw` missing `optionalAuth`
- [ ] record-history commit-message-substring filter → pathspec (API + CLI)
- [ ] publishDraft draft-deletion ordering vs git commit
- [ ] BB device health-monitor + stale-reaper wired in
- [ ] UI: `useMarkdown` heading inline formatting; autosave timer unmount; editor host collab-vs-CM latch at mount
- [ ] HW multi-output ffmpeg filtergraph pad reuse (`[v_wm]` mapped twice)
- [x] `.npmrc:29` jammed keys (folded into CI batch — trailing `strict-peer-dependencies=false` never parsed; dropped it, preserving effective config)
- [ ] Notifications: empty-recipient dispatch; SMS/Slack phantom config

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
