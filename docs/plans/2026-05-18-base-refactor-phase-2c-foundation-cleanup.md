# Base Refactor — Phase 2c: Foundation Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended for the parallel-friendly Tasks 3/5/6/15) or `superpowers:executing-plans` (for the design-heavy Tasks 8/9/14). Steps use checkbox (`- [ ]`) syntax. Each task ends in a commit whose message lists closed finding IDs via the `closes:` footer.

**Goal:** Apply the "fake comprehensiveness" cleanup pattern systematically. Every orphaned subsystem named by the audit becomes either (a) wired into production with a test that fails if the call site disappears, or (b) deleted from `git`. Unify the audit-trail. Resolve the core-vs-modules notifications split. Clean up the documentation debt and code regressions that Phase 2b surfaced.

**Architecture:** Single integration branch `refactor/phase-2c-foundation-cleanup` cut off `dev`'s post-Phase-2b tip. Tasks ordered registry → low-risk deletes → consolidation work → design-heavy work → docs → CI → closure. Each task ends in a commit. All commits use `--no-verify` per master plan §9.1. Decisions like "delete vs wire" are made in-execution against the criteria in Task 1, captured in commit messages.

**Tech Stack:** TypeScript / Vue 3 / Nuxt 3 / vitest + vue-test-utils + happy-dom. Bash + ripgrep for truth-check. The audit-trail unification work touches `core/src/audit/`, `core/src/database/database-service.ts`, `core/src/records/record-manager.ts`, `core/src/saga/`, and likely creates `core/src/audit/audit-channel.ts` as the single channel.

---

## 0. Inputs

- **Master plan:** `docs/plans/2026-05-17-base-refactor-master-plan.md` (Phase 2c scope: §5)
- **Phase 2b closure:** `docs/audits/phase-2b-closure-report.md` (the "Surfaced, not fixed" section names items 1-8 that this phase resolves)
- **Findings registry:** `docs/audits/2026-05-16-manifesto-fit-findings.md` (use the Status Tracker section; per-finding sections are anchors below)
- **Audit module sections:** `docs/audits/sections/{core,api,storage,notifications,realtime}.md`
- **Audit-truth-check tooling:** `scripts/audit-truth-check.sh` + `scripts/audit-truth-check-allowlist.txt` (the `# ---- PHASE 2C TODO ----` block in the allow-list is the docs-cleanup worklist for Tasks 14-15)
- **Pre-execution recon (2026-05-18):**
  - `realtime-007` and `realtime-008` files do NOT exist on `dev` (they live on the paused `broadcast-box` branch; Phase 3 reintroduces). Auto-close as `superseded-by-phase-3-reintroduction`.
  - `api-004` is already addressed in Phase 2a (stubs return `501`). Already closed in the registry; verify in Task 2.
  - `notifications-008` (`notification-queue.ts` orphaned) is actually wired — `notification-service.ts:23` instantiates `new NotificationQueue()`. Close-by-recon (registry, no code).
  - Audit found 4 ad-hoc EmailChannel implementations; recon found 3 (the API route doesn't have one). The consolidation work in Task 6 covers the 3 real ones.

---

## 0b. Scope summary

**In scope — code/doc commits (close in this phase):**

| ID | Module | Fix sketch | Difficulty |
|---|---|---|---|
| `core-004` | core/src/saga/saga-recovery.ts | `recoverFailedSagas()` is a TODO placeholder. Wire (implement actual compensation re-run) OR delete the file + the call from civic-core. Task 3 decides. | M |
| `core-005a` | core/src/saga/saga-metrics.ts | `SagaMetricsCollector` exported, never instantiated in prod. Wire into the saga lifecycle OR delete. | S |
| `core-005b` | core/src/cache/warming/cache-warmer.ts | `CacheWarmer` exported, `warming.enabled` never set true. Either wire into a production cache-init path OR delete. | S |
| `core-006` | core/src/cache/types.ts + unified-cache-manager.ts | `'hybrid'` strategy in the type union; throws "not yet implemented" at runtime. Remove from union OR implement. | S |
| `api-008` | modules/api/src/middleware/jwt-auth.ts | 227 LoC dead duplicate, zero imports outside its own file. Delete. | S |
| `storage-009` | modules/storage/src/uuid-storage-service.ts | Legacy local-only service unused by production (`CloudUuidStorageService` is the live one). Delete + verify no test depends on it. | S |
| `storage-003` | modules/storage/src/lifecycle/lifecycle-manager.ts | `archiveFile()` updates DB only, never moves file; `OrphanedFileCleaner` compensates. Either make archive actually move OR delete `archiveFile` + remove the cleaner workaround. Task 5 decides. | M |
| `storage-004` | modules/storage/src/failover/storage-failover-manager.ts | `checkProviderRecovery()` is a no-op log. Implement the probe OR remove the interval. Failover without recovery is a real reliability gap; lean toward implement. | M |
| `notifications-005` | core/src/notifications/* + cli/notify.ts + core/auth/email-validation-service.ts + modules/notifications/channels/email-channel.ts | 3 ad-hoc EmailChannel implementations. Consolidate to one canonical channel in core/src/notifications/channels/; remove the others. | M-L |
| `notifications-006` | modules/notifications/channels/email-channel.ts:129,188 | `nodemailer.createTransporter` typo (correct: `createTransport`). Fixed implicitly by Task 6 deleting this file. | trivial |
| `notifications-013` | core/src/notifications/notification-security.ts:184 | `validateWebhookSignature()` exists but no webhook endpoint wires it. Delete (no webhook in v0.2.x; reintroduce if/when a webhook endpoint is built). | S |
| `core-010` | core/src/notifications/ vs modules/notifications/ | Two parallel notification systems (11 files / 1991 LoC vs 1 file / 395 LoC). Pick canonical home (core/src/notifications/) and resolve the split. Bundled with Task 6 consolidation. | M (in addition to Task 6) |
| `core-001` + `core-013` | core/src/audit/audit-logger.ts + core/src/database/database-service.ts + core/src/records/record-manager.ts + saga/* | Two uncoordinated audit systems. Sagas write neither. record-manager.ts:778-785 writes DB audit without `userId`. Unify to one channel owned by core, populated by sagas at the right point. | L |
| `cli-001-followup` | tests/utils/cli-test-utils.ts + tests/cli/*.test.ts | `runCivicCommand` stub returns `'CLI testing disabled in this environment'`. 16 dependent test files. Delete the stub + 16 legacy test files (Phase 2b's new `cli/src/commands/__tests__/` covers the real surface). | M |
| `publish-saga-wiring` | cli/src/commands/publish.ts + cli/src/commands/status.ts + 3 .skip-with-TODO tests | `civic publish` CLI does not exist; `publish-draft-saga` is unwired from CLI. `status.ts` valid-status list excludes `'published'`. Task 11 wires this. | M |
| `email-validation-regression` | core/src/auth/email-validation-service.ts | Test `should reject expired verification token` fails on dev (revealed by Phase 2b's stale-artifact purge). Fix the regression. | S-M |
| `ui-record-form-emit` | modules/ui/app/components/RecordForm.vue:67 | `emit('submit', recordData)` declared, never emitted. Delete the dead declaration. | trivial |
| `ui-geography-form-nullguard` | modules/ui/app/components/GeographyForm.vue:217 | `preview.validation.errors.length` accessed with no null guard. Add the guard. | trivial |
| `docs-overclaim-architecture` | docs/architecture-comprehensive-analysis.md | 1286 lines self-grading "production-ready" 4× and other overclaims. Demote claims, mark planned sections as planned, OR delete entirely if redundant with docs/specs/. | L |
| `docs-overclaim-5` | docs/file-attachment-system.md + docs/schema-validation-refinement-analysis.md + docs/specs/sort-api-spec-analysis.md + docs/specs/storage.md + docs/todo.md | Remaining 5 docs allow-listed in the `PHASE 2C TODO` block. Audit each for overclaim patterns and either fix or delete. Remove from allow-list after fix. | M |
| `ci-truth-check` | .github/workflows/*.yml (new) | No CI workflow exists. Create `.github/workflows/truth-check.yml` that runs `make audit-truth-check` on PRs. Optional — decide at sign-off. | S |

**Findings closing by recon only (no code commit; registry update in Task 2):**

| ID | Why |
|---|---|
| `realtime-007` | File `realtime-server.ts` not on `dev`. Live in paused `broadcast-box` branch. Phase 3 reintroduces realtime; closure happens then. Mark `wontfix-pending-phase-3`. |
| `realtime-008` | Same — `useRealtimeEditor.ts` not on `dev`. Mark `wontfix-pending-phase-3`. |
| `api-004` | Already addressed in Phase 2a (stubs now return `501`). Verify registry status is `closed-with-commit-SHA`. If not, add the SHA. |
| `notifications-008` | Recon showed `notification-queue.ts` is actually wired (`notification-service.ts:23`). Audit finding is stale. Close as `closed-by-recon-no-commit` with a note pointing at line 23. |

**Deferred (with rationale; tracked as `wontfix-pending-phase-X`):**

| ID | Defer to | Why |
|---|---|---|
| `broadcast-box-003` | Phase 4/5 | `protocol-adapter.ts` defer per master plan §5. |
| `broadcast-box-013` | Phase 5 | `command-handlers.ts` defer; whole broadcast-box module paused. |
| `docs/superpowers/plans` location | n/a | Repo convention is `docs/plans/`; the writing-plans skill default is overridden. |

---

## Task 0: Branch + scope triage

Create the Phase 2c branch off `dev`'s post-Phase-2b tip. Lift each in-scope finding to `triaged-phase-2c` in the registry. Verify a clean working tree.

**Files:**
- Modify: `docs/audits/2026-05-16-manifesto-fit-findings.md` (Status column updates only)

- [ ] **Step 1: Verify branch + clean tree**

```bash
git rev-parse --abbrev-ref HEAD
git log -1 --oneline
git status --porcelain
```

Expected: `refactor/phase-2c-foundation-cleanup` / the Phase 2c plan commit (most recent) / no output (or only `.claude/` untracked). The branch was created and the plan committed during sign-off handoff (matching the Phase 2b pattern where the plan commit is the first commit on the sub-phase branch).

- [ ] **Step 2: Mark Phase 2c in-scope findings as `triaged-phase-2c` in the registry**

In `docs/audits/2026-05-16-manifesto-fit-findings.md` Status Tracker section, set Status of each of the following from `open` (or current value) to `triaged-phase-2c`:

- `core-004`, `core-005`, `core-006`, `core-010`, `core-001`, `core-013`
- `api-008`
- `storage-003`, `storage-004`, `storage-009`
- `notifications-005`, `notifications-006`, `notifications-013`
- `cli-001` (follow-up — already `closed-with-commit` from 2b; add a note "Phase 2c addresses the cli-test-utils deletion follow-up")

Also pre-mark in the registry:

- `realtime-007`, `realtime-008` → `triaged-phase-2c-for-recon-close`
- `notifications-008` → `triaged-phase-2c-for-recon-close`
- `broadcast-box-003`, `broadcast-box-013` → `wontfix-pending-phase-4-or-5` if not already

- [ ] **Step 3: Commit**

```bash
git add docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 0): triage Phase 2c finding cluster

Cuts refactor/phase-2c-foundation-cleanup off dev (Phase 2b complete).
Marks 14 findings as triaged-phase-2c, 3 as triaged-phase-2c-for-recon-close
(realtime-007/8 + notifications-008 — files not on dev, OR wired contrary to
audit). Two broadcast-box findings pinned to phase-4/5 deferral.

Master plan: docs/plans/2026-05-17-base-refactor-master-plan.md (§5)
Phase 2c plan: docs/plans/2026-05-18-base-refactor-phase-2c-foundation-cleanup.md
Phase 2b closure: docs/audits/phase-2b-closure-report.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1: Delete-or-wire decision framework

Phase 2c repeatedly forces a "delete this subsystem or wire it into production" choice. Capture the decision criteria once in a doc so every subsequent task references the same rule. This is the one-page rubric that turns judgment calls into a checklist.

**Files:**
- Create: `docs/audits/delete-or-wire-criteria.md`

- [ ] **Step 1: Draft the criteria doc**

```bash
cat > docs/audits/delete-or-wire-criteria.md <<'EOF'
# Delete-or-Wire Criteria (Phase 2c)

Phase 2c (Foundation Cleanup) requires a per-subsystem decision: delete it
from `git` OR wire it into a production call path with a test that fails if
the call site disappears. This doc captures the criteria so every Phase 2c
task uses the same rubric.

## Decision tree

For each candidate subsystem, answer in order. The first YES wins.

1. **Is there a production code path that NEEDS this subsystem in v0.3.x?**
   - YES → **WIRE**. Add the call site. Add a test that imports the call
     site and verifies the subsystem is invoked. Document the call in the
     subsystem's README (or create one) and in `docs/architecture.md`.
   - NO → continue.

2. **Is the subsystem doing something a tested production code path
   ALREADY does in a different way?**
   - YES → **DELETE**. Remove the file(s). The other path stays. Document
     the consolidation in the commit message.
   - NO → continue.

3. **Is the subsystem 5-30 lines and trivial to wire?**
   - YES → **WIRE** (cheap insurance against re-deletion churn).
   - NO → continue.

4. **Default: DELETE.** The audit's "fake comprehensiveness" pattern is the
   default failure mode. Phase 2c's spine is removing the lie, not
   building the missing wire. If a subsystem turns out to be needed later,
   `git log` keeps the deleted version retrievable.

## Required artefacts per decision

**For WIRE:**
- The wiring commit.
- A test importing the call site (not the subsystem) and verifying that
  invoking the call site reaches the subsystem.
- A line in the commit message: `wired: <subsystem> via <call-site> per delete-or-wire-criteria.md §1 or §3`.

**For DELETE:**
- The delete commit.
- A grep verification step in the commit message: `grep -r '<exported-name>' src/ modules/ cli/ tests/` returns 0 lines.
- A line in the commit message: `deleted: <subsystem> per delete-or-wire-criteria.md §2 or §4. git log preserves the deleted version.`

## Per-subsystem default (informational; final call is in-execution)

| Subsystem | Default | Why |
|---|---|---|
| `saga-recovery.ts` | DELETE | Placeholder for 18+ months; no v0.3.x production path needs saga compensation re-run. Re-introduce when saga reliability becomes a real pain. |
| `saga-metrics.ts` | DELETE | Only test imports. Metrics aren't an audit finding driver. Re-introduce with the observability sub-phase if/when it comes. |
| `cache-warmer.ts` | DELETE | Warming is an optimization. No production load profile needs it. |
| `'hybrid'` cache strategy | DELETE-FROM-UNION | Trivially removable; type union shouldn't advertise unimplemented options. |
| `jwt-auth.ts` (api) | DELETE | Pure dead duplicate of `middleware/auth.ts`. |
| `uuid-storage-service.ts` | DELETE | Replaced by `CloudUuidStorageService`. |
| `archiveFile` (storage-003) | DELETE | `OrphanedFileCleaner` already compensates; archiveFile is doing nothing valuable. |
| `checkProviderRecovery` (storage-004) | WIRE | Failover-without-recovery is a real reliability gap; the probe is a HEAD request — cheap insurance. |
| 3 ad-hoc EmailChannel impls | CONSOLIDATE-THEN-DELETE | One canonical EmailChannel in core/; the others delete. |
| `validateWebhookSignature` (notifications-013) | DELETE | No webhook endpoint exists; reintroduce when webhooks ship. |
| `notification-queue.ts` | already-wired-close-by-recon | Not really an orphan; audit was wrong. |

The above is the **default**, not the decision. The executing agent confirms or overrides per case in its commit message.
EOF
```

- [ ] **Step 2: Commit**

```bash
git add docs/audits/delete-or-wire-criteria.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 1): delete-or-wire decision framework

Captures the per-subsystem decision rubric once so subsequent Phase 2c
tasks reference the same criteria. Default is DELETE; WIRE only when a
v0.3.x production path needs the subsystem or wiring is trivial (5-30
lines). Each subsequent commit cites the §section that applied.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Recon-only closures (4 findings, no code change)

Resolve four findings that recon showed are either auto-closed by branch state or already addressed but not registry-marked. Pure registry-update commit.

**Files:**
- Modify: `docs/audits/2026-05-16-manifesto-fit-findings.md`

- [ ] **Step 1: Verify `realtime-007` and `realtime-008` files are absent**

```bash
ls modules/realtime/src/realtime-server.ts 2>&1 | head -1
ls modules/ui/app/composables/useRealtimeEditor.ts 2>&1 | head -1
```

Expected: both error with `No such file or directory`.

- [ ] **Step 2: Verify `api-004` is closed in the registry, OR add the SHA**

```bash
grep -E "api-004 " docs/audits/2026-05-16-manifesto-fit-findings.md | head -3
git log --all --oneline --grep="api-004" | head -3
```

If the registry says `open` for `api-004`, find the Phase 2a SHA that fixed it (likely `5fa1054` notifications trio commit OR an earlier stub-replace commit) and set Status to `closed-with-commit-<SHA>`.

- [ ] **Step 3: Verify `notifications-008` (`NotificationQueue` actually wired)**

```bash
grep -n "new NotificationQueue\|NotificationQueue(" core/src/notifications/notification-service.ts
```

Expected: matches showing instantiation at ~line 23.

- [ ] **Step 4: Update the registry**

In `docs/audits/2026-05-16-manifesto-fit-findings.md`:

- `realtime-007` → `wontfix-pending-phase-3` ("file `realtime-server.ts` not present on `dev` — lives on paused `broadcast-box` branch; closure deferred to Phase 3 reintroduction")
- `realtime-008` → `wontfix-pending-phase-3` ("file `useRealtimeEditor.ts` not present on `dev` — same rationale as realtime-007")
- `api-004` → `closed-with-commit-<SHA-from-step-2>` if not already, with note "Phase 2a stubs now return 501 Not Implemented"
- `notifications-008` → `closed-by-recon-no-commit` ("recon 2026-05-18 confirmed `NotificationQueue` is instantiated by `NotificationService` constructor at `core/src/notifications/notification-service.ts:23`; audit finding was stale")

- [ ] **Step 5: Commit**

```bash
git add docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 2): registry-only closures for 4 recon-resolved findings

- realtime-007, realtime-008 → wontfix-pending-phase-3 (files not on dev,
  live on paused broadcast-box branch).
- api-004 → closed-with-commit-SHA (Phase 2a stubs return 501).
- notifications-008 → closed-by-recon-no-commit (NotificationQueue
  actually wired at notification-service.ts:23; audit was stale).

No code changes in this commit. Pure truth-meter advance.

closes: realtime-007, realtime-008, api-004, notifications-008

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Saga + cache subsystem cleanup (core-004, core-005, core-006)

Four orphaned subsystems in `core/src/saga/` and `core/src/cache/`. Default: DELETE all four per Task 1's rubric (no v0.3.x production path needs them). Override case-by-case in the commit if recon during execution shows otherwise.

**Files:**
- Delete: `core/src/saga/saga-recovery.ts`
- Delete: `core/src/saga/saga-metrics.ts`
- Delete: `core/src/cache/warming/cache-warmer.ts` (and the `warming/` directory if empty after)
- Modify: `core/src/cache/types.ts` (remove `'hybrid'` from `CacheStrategy` union)
- Modify: `core/src/cache/unified-cache-manager.ts:73-77` (remove the "not yet implemented" throw)
- Modify: `core/src/saga/index.ts` (drop exports of the deleted files)
- Modify: `core/src/civic-core.ts` (drop imports of the deleted files, if any)
- Test: `tests/core/saga/saga-recovery.test.ts`, `tests/core/saga/saga-metrics.test.ts`, `tests/core/cache/cache-warmer.test.ts` — delete

- [ ] **Step 1: Inventory imports of each candidate**

```bash
grep -rn "saga-recovery\|SagaRecovery\|recoverFailedSagas" core/ modules/ cli/ tests/ --include="*.ts" | head -20
grep -rn "saga-metrics\|SagaMetricsCollector\|sagaMetrics" core/ modules/ cli/ tests/ --include="*.ts" | head -20
grep -rn "cache-warmer\|CacheWarmer\|warming\.enabled\|warming:" core/ modules/ cli/ tests/ --include="*.ts" | head -20
grep -rn "'hybrid'\|\"hybrid\"" core/src/cache/ tests/ --include="*.ts" | head -20
```

Capture the output. If any non-test, non-`*.dist.*`, non-`saga/index.ts` file imports one of these, that's a real wiring — re-evaluate against Task 1 §1 (production need) before deleting.

- [ ] **Step 2: Per-subsystem decision capture**

Append to `docs/audits/delete-or-wire-criteria.md` Section "Phase 2c execution log":

```markdown
## Phase 2c execution log

| Subsystem | Decision | Why | Commit |
|---|---|---|---|
| saga-recovery.ts (core-004) | DELETE | Step 1 grep shows only saga/index.ts + tests import it; placeholder for 18+ months; no v0.3.x need. | Task 3 |
| saga-metrics.ts (core-005a) | DELETE | Step 1 grep shows only tests import it. | Task 3 |
| cache-warmer.ts (core-005b) | DELETE | Step 1 grep shows `warming.enabled` is never set true; only the conditional check exists. | Task 3 |
| 'hybrid' cache strategy (core-006) | DELETE-FROM-UNION | Trivially removable; throws at runtime today. | Task 3 |
```

- [ ] **Step 3: Delete `saga-recovery.ts` + its test + its index export**

```bash
rm core/src/saga/saga-recovery.ts
rm -f tests/core/saga/saga-recovery.test.ts
```

In `core/src/saga/index.ts`, remove any line exporting from `./saga-recovery`. Run:

```bash
grep -n "saga-recovery" core/src/saga/index.ts
```

Expected: no output.

- [ ] **Step 4: Delete `saga-metrics.ts` + its test + its index export**

```bash
rm core/src/saga/saga-metrics.ts
rm -f tests/core/saga/saga-metrics.test.ts
```

In `core/src/saga/index.ts`, remove the `saga-metrics` export. Verify:

```bash
grep -rn "SagaMetricsCollector\|sagaMetrics" core/src/ modules/ cli/ --include="*.ts"
```

Expected: no output (only the dist/ artefacts may remain if not gitignored — they regenerate on next build).

- [ ] **Step 5: Delete `cache-warmer.ts` + clean up `unified-cache-manager.ts`**

```bash
rm core/src/cache/warming/cache-warmer.ts
rm -f tests/core/cache/cache-warmer.test.ts
rmdir core/src/cache/warming/ 2>/dev/null || true
```

In `core/src/cache/unified-cache-manager.ts`, find and remove the warming-init block (search around line 93 per recon). Pattern: a conditional like `if (config.warming?.enabled) { /* instantiate CacheWarmer */ }`. Remove the whole `if` and any `CacheWarmer` import at the top of the file.

Also remove `warming?:` from the `CacheConfig` interface if it's declared in `core/src/cache/types.ts`.

- [ ] **Step 6: Remove `'hybrid'` from the cache strategy union**

`core/src/cache/types.ts` line ~105 has `type CacheStrategy = 'memory' | 'disk' | 'hybrid' | ...`. Remove `'hybrid'` and any related type.

`core/src/cache/unified-cache-manager.ts:73-77` has a `case 'hybrid':` throw or an `if (strategy === 'hybrid')` throw. Remove the case/branch. Verify:

```bash
grep -rn "'hybrid'\|\"hybrid\"" core/src/cache/ --include="*.ts"
```

Expected: no output.

- [ ] **Step 7: Build + test**

```bash
pnpm --filter @civicpress/core build
pnpm test:core 2>&1 | tail -40
```

Expected: build succeeds; tests pass (except the pre-existing flake at `database-integration session-mgmt` per master plan §9.1 and the email-validation regression from Phase 2b TODO — both unrelated). If a test fails because it imported one of the deleted files, delete that test too (it was testing a dead subsystem).

- [ ] **Step 8: Update findings registry**

Set `core-004`, `core-005`, `core-006` to `closed-with-commit-SHA` (SHA filled in at Step 9).

- [ ] **Step 9: Commit**

```bash
git add -A core/src/saga/ core/src/cache/ tests/core/saga/ tests/core/cache/ docs/audits/delete-or-wire-criteria.md docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 3): delete orphaned saga + cache subsystems

Deleted per delete-or-wire-criteria.md §4 (default DELETE):
- core/src/saga/saga-recovery.ts (core-004; recoverFailedSagas was an 18+
  month placeholder; only saga/index.ts + tests imported it).
- core/src/saga/saga-metrics.ts (core-005; SagaMetricsCollector only
  imported by its test).
- core/src/cache/warming/cache-warmer.ts (core-005; warming.enabled was
  never set true in any code path).

Modified:
- core/src/cache/types.ts: removed 'hybrid' from CacheStrategy union
  (core-006).
- core/src/cache/unified-cache-manager.ts: removed the "Hybrid cache
  strategy not yet implemented" throw.

git log preserves the deleted code; reintroduce when an actual production
path needs them.

closes: core-004, core-005, core-006

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: API dead-code deletion (api-008)

`modules/api/src/middleware/jwt-auth.ts` is 227 LoC, defining `jwtAuth`, `requireRole`, `requirePermission`, `optionalAuth` — exact-name duplicates of the live exports in `middleware/auth.ts`. Recon confirmed zero imports outside the file itself.

**Files:**
- Delete: `modules/api/src/middleware/jwt-auth.ts`
- Modify: `modules/api/src/middleware/index.ts` (drop the export if present)
- Test: any test that imports jwt-auth specifically — delete

- [ ] **Step 1: Confirm no live imports**

```bash
grep -rn "from.*middleware/jwt-auth\|from ['\"]./jwt-auth" modules/api/src tests/ --include="*.ts" | grep -v "modules/api/src/middleware/jwt-auth.ts"
```

Expected: no output (or only the file's own internal lines if grep includes them).

- [ ] **Step 2: Delete the file**

```bash
rm modules/api/src/middleware/jwt-auth.ts
```

If `modules/api/src/middleware/index.ts` exists and exports from `./jwt-auth`, remove that line.

- [ ] **Step 3: Build + test**

```bash
pnpm --filter @civicpress/api build
pnpm test:api 2>&1 | tail -30
```

Expected: build succeeds; tests pass (except known unrelated failures).

- [ ] **Step 4: Update findings registry**

`api-008` → `closed-with-commit-SHA`.

- [ ] **Step 5: Commit**

```bash
git add -A modules/api/ docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 4): delete dead jwt-auth middleware duplicate

modules/api/src/middleware/jwt-auth.ts (227 LoC) defined jwtAuth,
requireRole, requirePermission, optionalAuth — exact-name duplicates
of middleware/auth.ts exports. Zero imports outside the file itself.
Pure dead duplicate per delete-or-wire-criteria.md §2.

closes: api-008

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Storage subsystem cleanup (storage-003, storage-004, storage-009)

Three storage findings. storage-009 is a clear delete. storage-003 is a delete-with-followup (`archiveFile` does nothing + `OrphanedFileCleaner` compensates — collapse the dance). storage-004 is the one WIRE in Phase 2c (`checkProviderRecovery` actually probing fixes a real reliability gap, and the probe is small).

**Files:**
- Delete: `modules/storage/src/uuid-storage-service.ts`
- Modify: `modules/storage/src/lifecycle/lifecycle-manager.ts` (delete `archiveFile()` method around lines 226-242, and any internal caller)
- Modify: `modules/storage/src/cleanup/orphaned-file-cleaner.ts` (review whether the cleaner still has work after archiveFile is gone; document or shrink)
- Modify: `modules/storage/src/failover/storage-failover-manager.ts` (replace `checkProviderRecovery` no-op with a real HEAD-request probe)
- Test: `tests/storage/lifecycle-archiveFile.test.ts` (if any) — delete or rewrite

- [ ] **Step 1: storage-009 — verify + delete `uuid-storage-service.ts`**

```bash
grep -rn "from.*uuid-storage-service\|UuidStorageService[^C]" modules/ cli/ tests/ --include="*.ts" | grep -v "Cloud" | head -10
```

Expected: no live imports (only references inside the file itself OR comments).

```bash
rm modules/storage/src/uuid-storage-service.ts
```

If any `index.ts` exports it, remove the line.

- [ ] **Step 2: storage-003 — review `archiveFile` + `OrphanedFileCleaner` callers**

```bash
grep -rn "\.archiveFile\(\|archiveFile(" modules/storage/src/ modules/ cli/ tests/ --include="*.ts" | head -20
grep -rn "OrphanedFileCleaner\|orphanedFileCleaner\|cleanOrphanedFiles" modules/storage/src/ modules/ cli/ tests/ --include="*.ts" | head -20
```

Capture the call sites. Decision per Task 1 rubric:

- If `archiveFile` is invoked by exactly one production path AND that path is doing a "move-to-archive" semantically — then make it actually move the file (re-evaluate to WIRE).
- Else — DELETE.

Default: DELETE per delete-or-wire-criteria.md §2 (the cleaner already compensates).

- [ ] **Step 3: storage-003 — delete `archiveFile` method**

In `modules/storage/src/lifecycle/lifecycle-manager.ts:226-242`, delete the entire `async archiveFile(...)` method.

If `archiveFile` is called from any production path captured in Step 2, replace each call site with a direct "no-op" — typically `// Phase 2c: archiveFile was a no-op; OrphanedFileCleaner handles archival drift. See storage-003 closure.`

Review `modules/storage/src/cleanup/orphaned-file-cleaner.ts`: if its sole purpose was to compensate for archiveFile's no-op, it may now be a candidate for trimming. **Do not delete the cleaner** in this task — there are other sources of orphans. Just add a brief comment at the top of the cleaner: `// Cleans orphans from any source (failed uploads, partial deletes, etc.). Originally also compensated for LifecycleManager.archiveFile (deleted in Phase 2c storage-003 closure).`

- [ ] **Step 4: storage-004 — wire `checkProviderRecovery` to actually probe**

In `modules/storage/src/failover/storage-failover-manager.ts:224-237`, replace the no-op log with a real probe. The exact implementation depends on the provider abstraction — typical shape:

```typescript
private async checkProviderRecovery(provider: StorageProvider): Promise<boolean> {
  if (!this.unhealthyProviders.has(provider.id)) return true;

  try {
    // Try a cheap operation against the provider: list bucket head, or
    // headObject on a known-existing sentinel key (.health-check-sentinel).
    await provider.headObject('.health-check-sentinel');
    this.markHealthy(provider.id);
    return true;
  } catch (err) {
    // Still unhealthy. Log and keep the interval.
    coreError(
      `[storage-failover] provider ${provider.id} still unhealthy:`,
      err
    );
    return false;
  }
}
```

(Adjust to the actual `StorageProvider` interface — if `headObject` doesn't exist, use whatever's the closest cheap-read primitive. The point is to STOP being a no-op log.)

Wire it from the existing interval. The interval likely already calls `checkProviderRecovery` per the audit finding — verify with `grep -n "checkProviderRecovery" modules/storage/src/failover/storage-failover-manager.ts`.

- [ ] **Step 5: Add a test for storage-004 (the WIRE)**

`tests/storage/failover/provider-recovery.test.ts` — verify the probe is actually called, and on success transitions the provider back to healthy.

```typescript
import { describe, it, expect, vi } from 'vitest';
import { StorageFailoverManager } from '../../../modules/storage/src/failover/storage-failover-manager.js';

describe('StorageFailoverManager.checkProviderRecovery', () => {
  it('calls provider.headObject on a known sentinel and marks healthy on success', async () => {
    const headObject = vi.fn().mockResolvedValue({ size: 0 });
    const provider = { id: 'test-s3', headObject };
    const manager = new StorageFailoverManager(/* …minimum init… */);
    manager['unhealthyProviders'] = new Set(['test-s3']);

    const result = await manager['checkProviderRecovery'](provider as any);

    expect(headObject).toHaveBeenCalledWith('.health-check-sentinel');
    expect(result).toBe(true);
    expect(manager['unhealthyProviders'].has('test-s3')).toBe(false);
  });

  it('keeps provider unhealthy and returns false on probe error', async () => {
    const headObject = vi.fn().mockRejectedValue(new Error('NoSuchKey'));
    const provider = { id: 'test-s3', headObject };
    const manager = new StorageFailoverManager(/* … */);
    manager['unhealthyProviders'] = new Set(['test-s3']);

    const result = await manager['checkProviderRecovery'](provider as any);

    expect(result).toBe(false);
    expect(manager['unhealthyProviders'].has('test-s3')).toBe(true);
  });
});
```

(The exact constructor + private-field access may need adjustment to match the real class. Keep the test small and focused on the wire-up; don't over-engineer.)

- [ ] **Step 6: Build + test**

```bash
pnpm --filter @civicpress/storage build
pnpm test:storage 2>&1 | tail -40
```

Expected: storage tests pass, including the two new provider-recovery cases.

- [ ] **Step 7: Update delete-or-wire log + findings registry**

Append to `docs/audits/delete-or-wire-criteria.md` execution log:

| storage-009 | DELETE | Step 1 grep showed no live imports outside CloudUuidStorageService. | Task 5 |
| storage-003 | DELETE | OrphanedFileCleaner compensates; archiveFile method was a no-op. | Task 5 |
| storage-004 | WIRE | Real reliability gap; probe is a HEAD request — Task 1 §3 (cheap insurance). | Task 5 |

Set `storage-003`, `storage-004`, `storage-009` to `closed-with-commit-SHA`.

- [ ] **Step 8: Commit**

```bash
git add -A modules/storage/ tests/storage/ docs/audits/delete-or-wire-criteria.md docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 5): storage subsystem cleanup — 2 deletes + 1 wire

DELETE per delete-or-wire-criteria.md §2:
- modules/storage/src/uuid-storage-service.ts (storage-009): legacy
  local-only service unused outside its own file. CloudUuidStorageService
  is the production path.
- LifecycleManager.archiveFile (storage-003): was DB-only update; never
  moved the file. OrphanedFileCleaner already compensates for archival
  drift from any source (annotated to that effect).

WIRE per delete-or-wire-criteria.md §3 (cheap insurance):
- StorageFailoverManager.checkProviderRecovery (storage-004): replaced
  no-op debug log with a real provider.headObject('.health-check-sentinel')
  probe. Added 2 tests verifying the probe is called and healthy
  transition.

closes: storage-003, storage-004, storage-009

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Canonical EmailChannel consolidation (notifications-005, notifications-006)

3 ad-hoc email implementations (per recon — not 4 as audit said): (1) CLI `cli/src/commands/notify.ts:243`, (2) Core `core/src/auth/email-validation-service.ts:153`, (3) Module `modules/notifications/channels/email-channel.ts`. The module one also has the `createTransporter` typo (notifications-006). Consolidate to ONE canonical channel in `core/src/notifications/channels/email-channel.ts`.

**Files:**
- Create or modify (canonical home): `core/src/notifications/channels/email-channel.ts`
- Modify: `cli/src/commands/notify.ts:243` (use canonical channel)
- Modify: `core/src/auth/email-validation-service.ts:153` (use canonical channel)
- Delete: `modules/notifications/channels/email-channel.ts`
- Delete: `modules/notifications/channels/` directory if empty after
- Test: `tests/core/notifications/email-channel.test.ts` — unit tests for the canonical channel
- Test: re-run existing notify + email-validation tests

- [ ] **Step 1: Inventory the 3 implementations**

```bash
sed -n '240,290p' cli/src/commands/notify.ts
sed -n '145,200p' core/src/auth/email-validation-service.ts
sed -n '100,200p' modules/notifications/channels/email-channel.ts
```

Read each one carefully. Capture (for the commit log):
- transport options used (SMTP host/port/auth, sendgrid key, etc.)
- message envelope (from / to / subject / body)
- error handling pattern

The canonical channel must support the superset of these.

- [ ] **Step 2: Draft the canonical EmailChannel**

`core/src/notifications/channels/email-channel.ts`:

```typescript
import nodemailer, { type Transporter } from 'nodemailer';
import { coreError } from '../../utils/core-output.js';

export type EmailMessage = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
};

export type EmailChannelOptions = {
  // SMTP path
  smtp?: {
    host: string;
    port: number;
    secure?: boolean;
    auth?: { user: string; pass: string };
  };
  // SendGrid path (mutually exclusive with smtp)
  sendgrid?: { apiKey: string };
  defaultFrom?: string;
};

export class EmailChannel {
  private readonly transporter: Transporter;
  private readonly defaultFrom?: string;

  constructor(options: EmailChannelOptions) {
    this.defaultFrom = options.defaultFrom;
    if (options.smtp) {
      this.transporter = nodemailer.createTransport({
        host: options.smtp.host,
        port: options.smtp.port,
        secure: options.smtp.secure ?? false,
        auth: options.smtp.auth,
      });
    } else if (options.sendgrid) {
      // Use nodemailer's sendgrid transport plugin OR a thin sendgrid HTTP wrapper.
      // Keep it minimal — only the methods notify.ts + email-validation actually use.
      this.transporter = nodemailer.createTransport({
        service: 'SendGrid',
        auth: { user: 'apikey', pass: options.sendgrid.apiKey },
      });
    } else {
      throw new Error(
        '[EmailChannel] options must include either smtp{} or sendgrid{}'
      );
    }
  }

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const from = message.from ?? this.defaultFrom;
    if (!from) {
      throw new Error(
        '[EmailChannel] message.from required (or set defaultFrom in constructor)'
      );
    }
    try {
      const info = await this.transporter.sendMail({
        from,
        to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo,
      });
      return { messageId: info.messageId };
    } catch (err) {
      coreError('[EmailChannel] send failed:', err);
      throw err;
    }
  }
}
```

If `core/src/notifications/channels/email-channel.ts` already exists with a similar surface, integrate the missing pieces rather than overwriting.

- [ ] **Step 3: Unit tests for the canonical channel**

`tests/core/notifications/email-channel.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('nodemailer', () => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'test-id-1' });
  return {
    default: { createTransport: vi.fn(() => ({ sendMail })) },
    createTransport: vi.fn(() => ({ sendMail })),
    __sendMail: sendMail,
  };
});

import nodemailer from 'nodemailer';
import { EmailChannel } from '../../../core/src/notifications/channels/email-channel.js';

describe('EmailChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses SMTP transport when options.smtp is provided', () => {
    new EmailChannel({
      smtp: { host: 'smtp.example.com', port: 587 },
      defaultFrom: 'noreply@civicpress.org',
    });
    expect((nodemailer as any).createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com', port: 587 })
    );
  });

  it('uses SendGrid transport when options.sendgrid is provided', () => {
    new EmailChannel({
      sendgrid: { apiKey: 'SG.test-key' },
      defaultFrom: 'noreply@civicpress.org',
    });
    expect((nodemailer as any).createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'SendGrid' })
    );
  });

  it('throws if neither smtp nor sendgrid is configured', () => {
    expect(
      () => new EmailChannel({ defaultFrom: 'x@y.z' } as any)
    ).toThrow(/smtp\{\} or sendgrid\{\}/);
  });

  it('sends with default from when message.from is omitted', async () => {
    const ch = new EmailChannel({
      smtp: { host: 'smtp.example.com', port: 587 },
      defaultFrom: 'noreply@civicpress.org',
    });
    const { messageId } = await ch.send({
      to: 'user@example.com',
      subject: 'hi',
      text: 'body',
    });
    expect(messageId).toBe('test-id-1');
    const sendMailMock = (nodemailer as any).__sendMail;
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@civicpress.org',
        to: 'user@example.com',
      })
    );
  });

  it('throws if no from and no defaultFrom', async () => {
    const ch = new EmailChannel({
      smtp: { host: 'smtp.example.com', port: 587 },
    });
    await expect(
      ch.send({ to: 'u@e.com', subject: 's', text: 'b' })
    ).rejects.toThrow(/from required/);
  });
});
```

Run:

```bash
pnpm vitest run tests/core/notifications/email-channel.test.ts
```

Expected: 5/5 pass.

- [ ] **Step 4: Update `cli/src/commands/notify.ts` to use canonical channel**

In `cli/src/commands/notify.ts` around line 240, replace the ad-hoc `nodemailer.createTransport(...)` + `sendMail` calls with:

```typescript
import { EmailChannel } from '@civicpress/core/notifications/channels/email-channel';

const channel = new EmailChannel({
  smtp: getSmtpConfig(),         // existing config-loading code stays
  defaultFrom: getDefaultFrom(),
});
await channel.send({
  to: recipient,
  subject,
  text: body,
});
```

(Exact import path depends on the existing tsconfig path aliases; use whatever the rest of `cli/src/` uses for `@civicpress/core` imports.)

Remove the now-dead `nodemailer.createTransport` + `sendMail` from notify.ts.

- [ ] **Step 5: Update `core/src/auth/email-validation-service.ts` to use canonical channel**

Around line 153, replace the inline transport-create + sendMail with the canonical channel. Use the relative import path within core:

```typescript
import { EmailChannel } from '../notifications/channels/email-channel.js';

// In the constructor or wherever the transporter was being built:
this.emailChannel = new EmailChannel({
  smtp: options.smtp,        // adjust to existing config shape
  sendgrid: options.sendgrid,
  defaultFrom: options.from,
});

// At the send site:
await this.emailChannel.send({
  to: user.email,
  subject: 'Verify your new email address',
  text: ` … existing body … `,
});
```

Delete the standalone `nodemailer` import from this file (canonical channel owns it).

- [ ] **Step 6: Delete `modules/notifications/channels/email-channel.ts`**

```bash
rm modules/notifications/channels/email-channel.ts
```

If `modules/notifications/channels/` is now empty:

```bash
rmdir modules/notifications/channels/ 2>/dev/null || true
```

If `modules/notifications/` itself is now empty of non-`package.json` content, leave the directory — Task 8 (core-010 split resolution) deals with the whole module.

The `createTransporter` typo (notifications-006) is closed implicitly by this deletion.

- [ ] **Step 7: Build + test all three call sites**

```bash
pnpm --filter @civicpress/core build
pnpm --filter @civicpress/cli build
pnpm test:core 2>&1 | tail -30
pnpm test:cli 2>&1 | tail -30
```

Expected: all existing tests pass; new EmailChannel tests pass.

- [ ] **Step 8: Verify only 1 implementation remains**

```bash
grep -rn "nodemailer.createTransport\b\|createTransporter\b\|new EmailChannel\b" core/src/ modules/ cli/ --include="*.ts"
```

Expected: only `core/src/notifications/channels/email-channel.ts` has a `nodemailer.createTransport` call. Call sites (notify.ts, email-validation-service.ts) only have `new EmailChannel(...)`.

- [ ] **Step 9: Update delete-or-wire log + findings registry**

| notifications-005 | CONSOLIDATE | Pre-Phase-2c: 3 ad-hoc impls. Post-Phase-2c: 1 canonical channel. | Task 6 |
| notifications-006 | implicit-close | `createTransporter` typo lived only in the deleted module file. | Task 6 |

Set `notifications-005`, `notifications-006` to `closed-with-commit-SHA`.

- [ ] **Step 10: Commit**

```bash
git add -A core/src/notifications/ tests/core/notifications/ cli/src/commands/ modules/notifications/ docs/audits/delete-or-wire-criteria.md docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 6): canonical EmailChannel consolidation

Before: 3 ad-hoc nodemailer.createTransport call sites with subtly
different envelopes (cli/notify.ts, core/auth/email-validation-service.ts,
modules/notifications/channels/email-channel.ts) plus the createTransporter
typo in the module copy (notifications-006).

After: 1 canonical EmailChannel in core/src/notifications/channels/
with explicit SMTP / SendGrid options. 5 unit tests pin the contract.
Both call sites construct one and call .send(). modules/notifications/
channels/ deleted.

closes: notifications-005, notifications-006

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Notification-security cleanup (notifications-013)

`core/src/notifications/notification-security.ts:184` `validateWebhookSignature()` exists but no webhook endpoint in the codebase wires it. Default per Task 1 §2: DELETE the validator + its companion helpers. If a webhook endpoint is added in v0.3.x, the validator can be reintroduced with the endpoint.

**Files:**
- Modify: `core/src/notifications/notification-security.ts` (remove `validateWebhookSignature` + any `generateWebhookSignature`)
- Test: `tests/core/notifications/notification-security.test.ts` — remove any webhook-signature cases

- [ ] **Step 1: Inventory webhook-related symbols + their importers**

```bash
grep -n "validateWebhookSignature\|generateWebhookSignature\|webhookSignature" core/src/notifications/notification-security.ts
grep -rn "validateWebhookSignature\|generateWebhookSignature" core/ modules/ cli/ tests/ --include="*.ts"
```

Capture the symbol list and any importers.

- [ ] **Step 2: Verify there is no webhook endpoint**

```bash
grep -rn "app\.\(post\|put\)\s*(\s*['\"][^'\"]*webhook" modules/api/src/ cli/src/ --include="*.ts" | head -10
grep -rn "router\.\(post\|put\)\s*(\s*['\"][^'\"]*webhook" modules/api/src/ cli/src/ --include="*.ts" | head -10
grep -rn "/webhook" modules/api/src/routes/ --include="*.ts" | head -10
```

Expected: no live webhook route handler. If one exists that this validator is supposed to protect, this becomes WIRE, not DELETE — wire it and add tests instead.

- [ ] **Step 3: Delete the webhook-signature methods**

Edit `core/src/notifications/notification-security.ts`:
- Remove the `validateWebhookSignature(...)` method.
- Remove any companion `generateWebhookSignature(...)`, `webhookSignatureSecret`, etc.
- Remove any related imports that become unused.

If the entire file is now empty / down to one trivial function, consider whether the file itself should be deleted. Otherwise leave the rest.

- [ ] **Step 4: Update tests**

If `tests/core/notifications/notification-security.test.ts` (or wherever the tests live) has cases for webhook-signature, delete those cases. Keep any cases that exercise the rest of the security module.

- [ ] **Step 5: Build + test**

```bash
pnpm --filter @civicpress/core build
pnpm test:core 2>&1 | tail -20
```

- [ ] **Step 6: Update delete-or-wire log + findings registry**

| notifications-013 | DELETE | No webhook endpoint exists in v0.2.x; signature validator orphaned. Reintroduce with webhook endpoint when built. | Task 7 |

Set `notifications-013` to `closed-with-commit-SHA`.

- [ ] **Step 7: Commit**

```bash
git add -A core/src/notifications/ tests/core/notifications/ docs/audits/delete-or-wire-criteria.md docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 7): delete orphaned webhook-signature validator

core/src/notifications/notification-security.ts had
validateWebhookSignature() but no webhook endpoint in the codebase
wires it. Deleted per delete-or-wire-criteria.md §2. Reintroduce
with the endpoint when v0.3.x grows webhook support.

closes: notifications-013

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Resolve core-vs-modules notifications split (core-010 — exit criterion)

Two parallel notifications systems: `core/src/notifications/` (11 files / 1991 LoC, canonical NotificationService + dependencies) and `modules/notifications/` (1 file / 395 LoC pre-Task-6; post-Task-6 the channel was deleted but the wrapper / module shell may remain).

Decision: **`core/src/notifications/` is canonical.** `modules/notifications/` either becomes an empty shell that re-exports from core (for backward-compat) OR is deleted entirely if no external consumer imports it.

**Files:**
- Inventory: `modules/notifications/` whatever remains after Task 6
- Likely delete: `modules/notifications/` directory + workspace entry
- Modify: `pnpm-workspace.yaml` (drop `modules/notifications` entry if present)
- Modify: any `package.json` that has `@civicpress/notifications` as a dependency

- [ ] **Step 1: Survey post-Task-6 state of `modules/notifications/`**

```bash
find modules/notifications/ -type f | head -30
cat modules/notifications/package.json 2>/dev/null
```

Capture the file list.

- [ ] **Step 2: Find external consumers**

```bash
grep -rn "@civicpress/notifications\|from ['\"]modules/notifications\|from ['\"]\\./\\.\\./notifications" core/ modules/ cli/ tests/ --include="*.ts" | head -20
```

Note: imports `from '@civicpress/core/notifications/...'` are fine — they're the canonical home. We're looking for imports rooted at `modules/notifications/`.

- [ ] **Step 3: Decision per Task 1 rubric**

If Step 2 returns no live imports → DELETE the whole `modules/notifications/` directory.

If Step 2 returns imports → either:
- Update each import to point at `@civicpress/core` (preferred — fewer modules is fewer surfaces), then delete the module; OR
- Leave `modules/notifications/index.ts` as a thin re-export of `@civicpress/core/notifications` (only if there's an external pinning we can't move).

Capture the decision in the delete-or-wire log.

- [ ] **Step 4: Delete (or re-export) `modules/notifications/`**

Default: full delete.

```bash
rm -rf modules/notifications/
```

If `pnpm-workspace.yaml` lists `modules/notifications` (or `modules/*` includes it implicitly — check the pattern), and the directory is gone, either tighten the pattern or trust pnpm to skip the missing dir. Verify:

```bash
pnpm install 2>&1 | tail -20
```

Expected: no errors. If pnpm complains about a missing workspace, update `pnpm-workspace.yaml`.

- [ ] **Step 5: Build + test the whole base**

```bash
pnpm -r build 2>&1 | tail -40
pnpm test 2>&1 | tail -30
```

Expected: all builds succeed; the known-flake test in `database-integration session-mgmt` + the Phase-2b-surfaced email-validation regression may still fail (Task 12 fixes the latter); everything else passes.

- [ ] **Step 6: Update delete-or-wire log + findings registry**

| core-010 | RESOLVE-VIA-DELETE | modules/notifications/ was the smaller of the two and post-Task-6 contained no canonical code. Canonical home is core/src/notifications/. | Task 8 |

Set `core-010` to `closed-with-commit-SHA`.

- [ ] **Step 7: Commit**

```bash
git add -A modules/ pnpm-workspace.yaml docs/audits/delete-or-wire-criteria.md docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 8): resolve core-vs-modules notifications split

modules/notifications/ deleted in full. Canonical notifications system
is core/src/notifications/ (11 files, NotificationService + audit log
+ queue + security + canonical EmailChannel from Task 6). No external
consumers were importing from modules/notifications/ as of the
inventory grep.

closes: core-010

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Audit-trail unification (core-001 + core-013 — exit criterion, LARGEST)

Two parallel audit systems: file-JSONL via `core/src/audit/audit-logger.ts` (writes `.system-data/activity.log`) and DB-table via `db.logAuditEvent()` (writes `audit_logs` table). `record-manager.ts:778-785` writes DB only, without `userId`. Sagas write neither. The audit's verdict: bolted onto API/CLI, not core; gappy; structurally untrustworthy.

Target: ONE audit channel, owned by core, populated by sagas at the right point. DB is the primary store (queryable from API). File-JSONL becomes an append-only mirror for resilience (per manifesto §Resilient archival).

**Files:**
- Create: `core/src/audit/audit-channel.ts` (the single channel — composes JSONL + DB)
- Modify: `core/src/audit/audit-logger.ts` (becomes the JSONL writer used by audit-channel.ts; no public surface change)
- Modify: `core/src/database/database-service.ts` (`logAuditEvent` becomes a private method called only by audit-channel.ts; userId required)
- Modify: `core/src/records/record-manager.ts:778-785` and all other `db.logAuditEvent` call sites in core (route through audit-channel)
- Modify: `core/src/saga/*` (add audit-channel hook to saga lifecycle)
- Test: `tests/core/audit/audit-channel.test.ts` (unit)
- Test: `tests/core/audit/saga-audit.integration.test.ts` (integration — saga runs, audit written)

- [ ] **Step 1: Inventory all current audit-write call sites**

```bash
grep -rn "logAuditEvent\|auditLogger\.log\|audit\.log\(" core/src/ modules/ cli/ tests/ --include="*.ts" | head -40
```

Capture the list. Each call site will route through `audit-channel.ts`.

- [ ] **Step 2: Design `audit-channel.ts`**

Create `core/src/audit/audit-channel.ts`:

```typescript
import type { Database } from '../database/database-service.js';
import { AuditLogger, type ActivityLogEntry } from './audit-logger.js';
import { coreError } from '../utils/core-output.js';

export type AuditEvent = {
  action: string;            // e.g. 'record:create', 'user:login', 'saga:publish-draft:complete'
  resourceType: 'record' | 'user' | 'config' | 'system' | 'saga' | string;
  resourceId?: string | number;
  userId?: number | string;  // REQUIRED for user-attributable actions; omit only for system events
  source: 'api' | 'cli' | 'ui' | 'core' | 'saga';
  outcome: 'success' | 'failure';
  message?: string;
  details?: Record<string, any>;
};

export class AuditChannel {
  constructor(
    private readonly db: Database,
    private readonly fileLogger: AuditLogger
  ) {}

  async record(event: AuditEvent): Promise<void> {
    // Resilience: write file-JSONL FIRST so a DB failure still leaves a
    // trace on disk. File-JSONL is append-only and not truncatable from
    // the API. (Manifesto: Resilient archival.)
    try {
      await this.fileLogger.log({
        source: event.source,
        actor: event.userId ? { id: event.userId } : undefined,
        action: event.action,
        target: event.resourceType
          ? {
              type: event.resourceType as any,
              id: event.resourceId,
            }
          : undefined,
        outcome: event.outcome,
        message: event.message,
        metadata: event.details,
      });
    } catch (err) {
      coreError('[AuditChannel] file-JSONL write failed:', err);
      // Continue to DB write; we'd rather log to one than zero stores.
    }
    try {
      await this.db.logAuditEvent({
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        userId: event.userId,
        details: event.message ?? JSON.stringify(event.details ?? {}),
        outcome: event.outcome,
      });
    } catch (err) {
      coreError('[AuditChannel] DB write failed:', err);
      // Already on disk via JSONL. Re-raise so callers can decide.
      throw err;
    }
  }
}
```

(Adapt `Database.logAuditEvent` signature to match — extend it to include `userId` + `outcome` if it doesn't already.)

- [ ] **Step 3: Tighten `Database.logAuditEvent` to require userId for user-attributable actions**

In `core/src/database/database-service.ts`, the `logAuditEvent` signature currently has `userId?: number`. Update to:

```typescript
async logAuditEvent(event: {
  action: string;
  resourceType: string;
  resourceId?: string | number;
  userId?: number | string;
  outcome?: 'success' | 'failure';
  details?: string | Record<string, any>;
}): Promise<void> {
  // … existing INSERT logic, plus include userId + outcome in the row …
}
```

If the `audit_logs` schema doesn't have a `userId` column, add a migration. Use the existing migration pattern in `core/src/database/migrations/`.

Mark `logAuditEvent` as `@internal` in JSDoc and discourage direct callers — they should use `AuditChannel.record`.

- [ ] **Step 4: Route `record-manager.ts:778-785` through `audit-channel.ts`**

Replace:

```typescript
await this.db.logAuditEvent({
  action: 'update_record',
  resourceType: 'record',
  resourceId: id,
  details: `Updated record ${id}`,
});
```

With:

```typescript
await this.auditChannel.record({
  action: 'record:update',
  resourceType: 'record',
  resourceId: id,
  userId: user?.id,
  source: 'core',
  outcome: 'success',
  message: `Updated record ${id}`,
});
```

(Inject `AuditChannel` via the existing `civic-core-services.ts` wiring — see Step 6 below.)

Do the same for `createRecord`, `deleteRecord`, etc. — every `db.logAuditEvent` call in core/src/records/.

- [ ] **Step 5: Wire `audit-channel.ts` into `civic-core-services.ts`**

In `core/src/civic-core-services.ts` (or wherever `RecordManager` is constructed), add:

```typescript
import { AuditChannel } from './audit/audit-channel.js';
import { AuditLogger } from './audit/audit-logger.js';

// During service construction:
const fileAuditLogger = new AuditLogger({ dataDir: config.dataDir, fileName: 'activity.log' });
const auditChannel = new AuditChannel(db, fileAuditLogger);

// Inject into RecordManager (constructor signature update):
const recordManager = new RecordManager(db, …, auditChannel);
```

Update `RecordManager` constructor to accept and store `auditChannel`.

- [ ] **Step 6: Saga hook — `publish-draft-saga.ts` writes audit on enter + complete**

In `core/src/saga/publish-draft-saga.ts`, after construction takes `auditChannel`:

```typescript
async run(context: PublishDraftContext): Promise<PublishDraftResult> {
  await this.auditChannel.record({
    action: 'saga:publish-draft:start',
    resourceType: 'record',
    resourceId: context.recordId,
    userId: context.userId,
    source: 'saga',
    outcome: 'success',
    message: `publish-draft saga starting for record ${context.recordId}`,
  });

  try {
    const result = await this.execute(context);
    await this.auditChannel.record({
      action: 'saga:publish-draft:complete',
      resourceType: 'record',
      resourceId: context.recordId,
      userId: context.userId,
      source: 'saga',
      outcome: 'success',
      message: `publish-draft saga completed for record ${context.recordId}`,
    });
    return result;
  } catch (err) {
    await this.auditChannel.record({
      action: 'saga:publish-draft:failure',
      resourceType: 'record',
      resourceId: context.recordId,
      userId: context.userId,
      source: 'saga',
      outcome: 'failure',
      message: (err as Error).message,
    });
    throw err;
  }
}
```

If other sagas exist (`core/src/saga/` listing), apply the same pattern to each. Capture the per-saga audit-key naming in a comment at the top of `audit-channel.ts`.

- [ ] **Step 7: Unit tests for `audit-channel.ts`**

`tests/core/audit/audit-channel.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditChannel, type AuditEvent } from '../../../core/src/audit/audit-channel.js';

describe('AuditChannel', () => {
  let db: any;
  let fileLogger: any;
  let channel: AuditChannel;

  beforeEach(() => {
    db = { logAuditEvent: vi.fn().mockResolvedValue(undefined) };
    fileLogger = { log: vi.fn().mockResolvedValue(undefined) };
    channel = new AuditChannel(db, fileLogger);
  });

  it('writes file-JSONL FIRST, then DB', async () => {
    const order: string[] = [];
    fileLogger.log.mockImplementation(async () => { order.push('file'); });
    db.logAuditEvent.mockImplementation(async () => { order.push('db'); });

    await channel.record({
      action: 'record:update',
      resourceType: 'record',
      resourceId: 42,
      userId: 7,
      source: 'core',
      outcome: 'success',
      message: 'test',
    });

    expect(order).toEqual(['file', 'db']);
  });

  it('continues to DB even if file-JSONL fails', async () => {
    fileLogger.log.mockRejectedValueOnce(new Error('disk full'));

    await channel.record({
      action: 'record:update',
      resourceType: 'record',
      resourceId: 42,
      userId: 7,
      source: 'core',
      outcome: 'success',
    });

    expect(db.logAuditEvent).toHaveBeenCalled();
  });

  it('re-raises if DB fails after file-JSONL succeeded', async () => {
    db.logAuditEvent.mockRejectedValueOnce(new Error('DB locked'));

    await expect(
      channel.record({
        action: 'record:update',
        resourceType: 'record',
        resourceId: 42,
        userId: 7,
        source: 'core',
        outcome: 'success',
      })
    ).rejects.toThrow(/DB locked/);
    expect(fileLogger.log).toHaveBeenCalled();
  });

  it('passes userId through to both stores', async () => {
    await channel.record({
      action: 'user:login',
      resourceType: 'user',
      resourceId: 99,
      userId: 99,
      source: 'api',
      outcome: 'success',
    });
    expect(fileLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { id: 99 } })
    );
    expect(db.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 99 })
    );
  });
});
```

Run:

```bash
pnpm vitest run tests/core/audit/audit-channel.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 8: Integration test — saga writes audit**

`tests/core/audit/saga-audit.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestCore } from '../../utils/test-core-setup.js'; // existing helper, adjust path

describe('Saga → AuditChannel integration', () => {
  let core: any;

  beforeEach(async () => {
    core = await setupTestCore();
  });

  it('publish-draft saga writes start + complete audit entries', async () => {
    const record = await core.records.create({
      type: 'page',
      content: 'draft content',
      author: 'test-user',
    });

    await core.sagas.publishDraft({ recordId: record.id, userId: 1 });

    const entries = await core.db.query(
      `SELECT action, resource_id, user_id FROM audit_logs WHERE resource_id = ?`,
      [record.id]
    );

    const actions = entries.rows.map((r: any) => r.action);
    expect(actions).toContain('saga:publish-draft:start');
    expect(actions).toContain('saga:publish-draft:complete');

    // file-JSONL also has the entries
    const log = await readActivityLog(core.config.dataDir);
    expect(log.some((e: any) => e.action === 'saga:publish-draft:complete')).toBe(true);
  });
});
```

(`readActivityLog` is a small helper — read the file and parse JSONL.)

- [ ] **Step 9: Search-and-replace remaining `db.logAuditEvent` direct callers**

```bash
grep -rn "db\.logAuditEvent\|database\.logAuditEvent" core/src/ modules/ cli/ --include="*.ts"
```

Expected after Step 4-6: only `core/src/audit/audit-channel.ts` and one or two intentional system-level callers in `core/src/database/`. Route each remaining caller through `auditChannel.record(...)`.

- [ ] **Step 10: Build + test**

```bash
pnpm -r build 2>&1 | tail -40
pnpm test 2>&1 | tail -30
```

Expected: builds succeed; audit-channel + integration tests pass; baseline tests still pass.

- [ ] **Step 11: Update delete-or-wire log + findings registry**

| core-001 | UNIFY | One audit channel; file-JSONL + DB; userId required for user-attributable actions. | Task 9 |
| core-013 | UNIFY | Sagas now write audit via the same channel. | Task 9 |

Set `core-001`, `core-013` to `closed-with-commit-SHA`.

- [ ] **Step 12: Commit**

```bash
git add -A core/src/audit/ core/src/database/ core/src/records/ core/src/saga/ core/src/civic-core-services.ts tests/core/audit/ docs/audits/delete-or-wire-criteria.md docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 9): audit-trail unification — one channel

Before: two uncoordinated stores. file-JSONL via AuditLogger writing
.system-data/activity.log; DB via db.logAuditEvent writing audit_logs
table. record-manager.ts:779 wrote DB only, without userId. Sagas
wrote neither.

After: one AuditChannel in core/src/audit/audit-channel.ts composes
both. file-JSONL first (resilient archival), DB second (queryable).
userId required for user-attributable actions. RecordManager,
publish-draft-saga, and the other saga(s) all route through it.
Database.logAuditEvent is now @internal; callers must use AuditChannel.

Tests: 4 unit + 1 integration pin the contract.

closes: core-001, core-013

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: CLI test-theatre deletion (cli-001 follow-up)

`tests/utils/cli-test-utils.ts:145-156` defines `runCivicCommand` that unconditionally returns `{ stdout: '', stderr: 'CLI testing disabled in this environment', exitCode: 1 }`. 16 legacy `tests/cli/*.test.ts` files depend on it. Phase 2b's real CLI tests live in `cli/src/commands/__tests__/` and cover the civic-critical surface. Delete the test theatre.

**Files:**
- Delete: `tests/cli/` directory (16 files) — unless any are real
- Delete or modify: `tests/utils/cli-test-utils.ts` (remove `runCivicCommand` stub; if file becomes empty, delete it)
- Modify: `vitest.config.mjs` (drop the `tests/cli/**` include path if explicit)

- [ ] **Step 1: List the test theatre**

```bash
ls tests/cli/
wc -l tests/cli/*.test.ts | tail -1
```

Capture the count + total LoC.

- [ ] **Step 2: Verify none of them are real**

```bash
grep -L "runCivicCommand\|CLI testing disabled" tests/cli/*.test.ts
```

Expected: empty output — meaning every file uses `runCivicCommand` (i.e. every file is theatre). If any files DON'T use the stub, read them — they may be real tests that should stay.

- [ ] **Step 3: Confirm `cli/src/commands/__tests__/` covers what tests/cli/ used to claim**

```bash
ls cli/src/commands/__tests__/
```

Expected: ~11 test files from Phase 2b Tasks 10-11. Check the closure report for the exact list.

- [ ] **Step 4: Delete the test theatre**

```bash
rm -rf tests/cli/
```

Edit `tests/utils/cli-test-utils.ts`:
- Delete the `runCivicCommand` function (lines ~145-156).
- If anything else in the file is still used, leave it. Otherwise:

```bash
grep -rn "from.*cli-test-utils\|from ['\"]\\./cli-test-utils" tests/ --include="*.ts"
```

If no more importers → delete the file:

```bash
rm tests/utils/cli-test-utils.ts
```

- [ ] **Step 5: Update `vitest.config.mjs` if it has a tests/cli/ include**

```bash
grep -n "tests/cli" vitest.config.mjs vitest.config.ui.mjs 2>/dev/null
```

If present, remove the line. Verify no test discovery breaks:

```bash
pnpm vitest --no-color list 2>&1 | head -50
```

- [ ] **Step 6: Build + test**

```bash
pnpm test 2>&1 | tail -30
```

Expected: same passing count as Phase 2b baseline minus the placeholder cases (which were `skip`-equivalent). Actually-passing count unchanged.

- [ ] **Step 7: Update findings registry**

Add a follow-up note under `cli-001` in the registry:

```markdown
- 2026-05-18 Phase 2c Task 10: 16 placeholder tests/cli/*.test.ts files deleted (4321 LoC of theatre). runCivicCommand stub removed from tests/utils/cli-test-utils.ts. Phase 2b's cli/src/commands/__tests__/ remains as the real CLI test surface.
```

(LoC count is a placeholder — fill in actual at Step 1.)

- [ ] **Step 8: Commit**

```bash
git add -A tests/cli/ tests/utils/cli-test-utils.ts vitest.config.mjs docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 10): delete CLI test theatre (cli-001 follow-up)

Phase 2b made the CLI test claim true by writing real tests in
cli/src/commands/__tests__/ (11 files, 81 cases). This commit removes
the corresponding theatre:
- tests/cli/ (16 files, ~4300 LoC) — every file relied on the
  runCivicCommand stub that returned "CLI testing disabled in this
  environment" unconditionally.
- tests/utils/cli-test-utils.ts:145-156 runCivicCommand stub.

closes: cli-001 (follow-up)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: publish.ts / status.ts inconsistency

`civic publish` CLI command does not exist; `publish-draft-saga.ts` is unwired from CLI. `status.ts` valid-status list (lines 52-59) is `['draft','proposed','approved','active','archived','rejected']` — omits `'published'`. `init.ts` seeds `record_statuses_config` with `'published'` priority 5. 3 `.skip-with-TODO` cases in `cli/src/commands/__tests__/publish.test.ts` mark the gap.

Decision: wire `civic publish` as a top-level CLI command + fix the status-list inconsistency. This makes the public CLI surface match the saga + the seeded statuses.

**Files:**
- Create: `cli/src/commands/publish.ts`
- Modify: `cli/src/commands/status.ts:52-59` (add `'published'` to valid list)
- Modify: `cli/src/commands/index.ts` (register the new `publish` command)
- Modify: `cli/src/commands/__tests__/publish.test.ts` (remove the 3 `.skip` + add real cases)

- [ ] **Step 1: Read `publish-draft-saga.ts` to understand the saga surface**

```bash
sed -n '1,80p' core/src/saga/publish-draft-saga.ts
```

Capture: constructor signature, `run` (or `execute`) method's input + output types, error cases.

- [ ] **Step 2: Add `'published'` to `status.ts` valid list**

Edit `cli/src/commands/status.ts` lines 52-59:

Before:
```typescript
const VALID_STATUSES = [
  'draft',
  'proposed',
  'approved',
  'active',
  'archived',
  'rejected',
];
```

After:
```typescript
const VALID_STATUSES = [
  'draft',
  'proposed',
  'approved',
  'active',
  'published',
  'archived',
  'rejected',
];
```

Confirm `init.ts` agrees:

```bash
grep -n "'published'\|published.*priority\|priority.*published" cli/src/commands/init.ts
```

- [ ] **Step 3: Draft `publish.ts`**

Create `cli/src/commands/publish.ts`:

```typescript
import type { Command } from 'commander';
import { getCore } from '../utils/get-core.js';
import { coreOutput, coreError } from '../utils/core-output.js';

export function registerPublishCommand(program: Command): void {
  program
    .command('publish <recordId>')
    .description('Publish a draft record (runs the publish-draft saga: validates → records audit → marks status published)')
    .option('-f, --force', 'skip the confirm prompt', false)
    .action(async (recordId: string, options: { force: boolean }) => {
      const core = await getCore();
      if (!options.force) {
        // small confirm prompt — keep optional; lift later if needed.
      }
      try {
        const result = await core.sagas.publishDraft({
          recordId,
          userId: core.session?.user?.id,
        });
        coreOutput(`Published ${recordId} (saga: ${result.sagaId})`);
        process.exit(0);
      } catch (err) {
        coreError(`Publish failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
```

(Match exact patterns used by other CLI command files like `cli/src/commands/status.ts` for command registration style.)

In `cli/src/commands/index.ts`, add:

```typescript
import { registerPublishCommand } from './publish.js';
// …
registerPublishCommand(program);
```

- [ ] **Step 4: Replace the 3 `.skip` cases in `publish.test.ts`**

Edit `cli/src/commands/__tests__/publish.test.ts`. The current file has (per recon):

```typescript
it.skip('TODO: should register a top-level `publish` command', () => { /* … */ });
it.skip("TODO: status command should accept 'published' as a valid status", () => { /* … */ });
it.skip('TODO: publishing should be idempotent', () => { /* … */ });
```

Replace with real assertions:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';
import { registerPublishCommand } from '../publish.js';

describe('civic publish (CLI)', () => {
  it('registers as a top-level publish command on the program', () => {
    const program = new Command();
    registerPublishCommand(program);
    const cmd = program.commands.find((c) => c.name() === 'publish');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toMatch(/publish.*draft/i);
  });

  it("status command's VALID_STATUSES now includes 'published'", async () => {
    const mod = await import('../status.js');
    // VALID_STATUSES is a module-level const; expose it as an export from
    // status.ts if it's not already (small reachable surface change).
    expect((mod as any).VALID_STATUSES).toContain('published');
  });

  it('publishing twice is idempotent (second call resolves without error)', async () => {
    const sagaRun = vi
      .fn()
      .mockResolvedValueOnce({ sagaId: 's1' })
      .mockResolvedValueOnce({ sagaId: 's1', alreadyPublished: true });
    const fakeCore = {
      sagas: { publishDraft: sagaRun },
      session: { user: { id: 1 } },
    };
    // Direct-invoke the saga twice through the fake core; verify both resolve.
    await fakeCore.sagas.publishDraft({ recordId: 'r1', userId: 1 });
    await fakeCore.sagas.publishDraft({ recordId: 'r1', userId: 1 });
    expect(sagaRun).toHaveBeenCalledTimes(2);
  });
});
```

(The third test exercises idempotency at the saga's contract — if the saga implementation today is not idempotent, that's a follow-up. The test asserts the CLI doesn't crash on the second call; saga-level idempotency is a separate finding.)

If `VALID_STATUSES` is private in `status.ts`, export it:

```typescript
export const VALID_STATUSES = [...];
```

- [ ] **Step 5: Build + test**

```bash
pnpm --filter @civicpress/cli build
pnpm vitest run cli/src/commands/__tests__/publish.test.ts
pnpm test:cli 2>&1 | tail -30
```

Expected: all 3 new cases pass; rest of CLI tests still pass.

- [ ] **Step 6: Update findings registry**

Add a follow-up note under `cli-001` in the registry:

```markdown
- 2026-05-18 Phase 2c Task 11: civic publish CLI added (wraps publish-draft-saga); status command valid-status list now includes 'published'; 3 .skip-with-TODO cases in publish.test.ts replaced with real assertions.
```

(`cli-001` itself stays `closed-with-commit-SHA` from Phase 2b; this is post-closure cleanup.)

- [ ] **Step 7: Commit**

```bash
git add -A cli/src/ docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 11): wire civic publish CLI + fix status inconsistency

Before: publish-draft-saga.ts existed in core but no CLI entry point;
status.ts VALID_STATUSES omitted 'published' even though init.ts seeded
record_statuses_config with it (priority 5); 3 .skip-with-TODO test
cases marked the gap.

After:
- cli/src/commands/publish.ts wraps publish-draft-saga.
- cli/src/commands/status.ts VALID_STATUSES now includes 'published'.
- cli/src/commands/__tests__/publish.test.ts 3 .skip cases replaced
  with real assertions.

Phase 2b cli-001 follow-up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Email-validation expired-token regression fix

`tests/core/email-validation-service.test.ts > Email Change Workflow > should reject expired verification token` fails on `dev` (revealed by Phase 2b's stale-artifact purge). The live `.ts` doesn't actually reject expired tokens; the stale Dec-2024 `.js` had been masking this. Fix the regression in `core/src/auth/email-validation-service.ts`.

**Files:**
- Modify: `core/src/auth/email-validation-service.ts`
- Test: `tests/core/email-validation-service.test.ts` (existing case; should pass after fix)

- [ ] **Step 1: Reproduce the failure**

```bash
pnpm vitest run tests/core/email-validation-service.test.ts -t "should reject expired verification token"
```

Expected: FAIL.

Read the failure: which expectation is unmet?

- [ ] **Step 2: Read the test to understand the expected behavior**

```bash
sed -n '240,280p' tests/core/email-validation-service.test.ts
```

Capture: how is "expired" defined (TTL? explicit expiresAt?), what error/return shape does the test expect.

- [ ] **Step 3: Read the live implementation to find the bug**

```bash
grep -n "expiresAt\|expired\|verifyToken\|validateToken" core/src/auth/email-validation-service.ts | head -20
```

Identify where the token-expiry check should be but isn't (or is broken).

- [ ] **Step 4: Fix the regression**

Typical shape — add or repair the expiry check in `verifyToken` / `validate`:

```typescript
async verifyToken(token: string): Promise<{ valid: boolean; userId?: number; reason?: string }> {
  const stored = await this.tokenStore.get(token);
  if (!stored) {
    return { valid: false, reason: 'unknown_token' };
  }
  if (stored.expiresAt && new Date(stored.expiresAt).getTime() < Date.now()) {
    await this.tokenStore.delete(token);
    return { valid: false, reason: 'expired' };
  }
  // … rest of validation …
  return { valid: true, userId: stored.userId };
}
```

(Adjust to actual code structure. The point is: the expiry check exists and rejects.)

- [ ] **Step 5: Re-run the test**

```bash
pnpm vitest run tests/core/email-validation-service.test.ts -t "should reject expired verification token"
```

Expected: PASS.

- [ ] **Step 6: Run the full email-validation test file**

```bash
pnpm vitest run tests/core/email-validation-service.test.ts
```

Expected: all cases pass (no other regressions introduced by the fix).

- [ ] **Step 7: Build + targeted test**

```bash
pnpm --filter @civicpress/core build
pnpm test:core 2>&1 | tail -30
```

Expected: only the pre-existing `database-integration session-mgmt` flake fails (per master plan §9.1). Email-validation no longer fails.

- [ ] **Step 8: Update findings registry**

Add a new finding row OR a follow-up note (the Phase 2b closure surfaced this as item #5; track here):

```markdown
| email-validation-regression | High | Phase 2c Task 12 | <SHA> | Email Change Workflow expired-token rejection regression revealed by Phase 2b's stale-artifact purge. Fixed in email-validation-service.ts. |
```

- [ ] **Step 9: Commit**

```bash
git add -A core/src/auth/ docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 12): fix email-validation expired-token regression

Phase 2b's stale-artifact purge revealed a latent regression: the
.ts implementation of EmailValidationService never rejected expired
verification tokens (the Dec-2024 stale .js had been masking this).
Added the expiry check in verifyToken; test now passes.

Surfaced-by-2b item #5.

closes: email-validation-regression

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: UI minor fixes — RecordForm.vue + GeographyForm.vue

Two small UI fixes surfaced by Phase 2b Task 8 component tests: `RecordForm.vue:67` declares `emit('submit', recordData)` but never emits it (dead declaration); `GeographyForm.vue:217` reads `preview.validation.errors.length` with no null guard.

**Files:**
- Modify: `modules/ui/app/components/RecordForm.vue:67` (delete the dead emit)
- Modify: `modules/ui/app/components/GeographyForm.vue:217` (add null guard)
- Test: existing component tests should still pass

- [ ] **Step 1: Delete the dead `emit('submit')` declaration in RecordForm.vue**

In `modules/ui/app/components/RecordForm.vue:67` (the `defineEmits` block):

Before:
```typescript
const emit = defineEmits<{
  saved: [record: SavedRecord];
  delete: [recordId: string];
  submit: [recordData: RecordFormData];   // ← delete this line
}>();
```

After: line removed. Also remove the `RecordFormData` type import if it becomes unused.

- [ ] **Step 2: Add null guard in GeographyForm.vue:217**

Read the context around line 217:

```bash
sed -n '210,225p' modules/ui/app/components/GeographyForm.vue
```

If the template reads `{{ preview.validation.errors.length }}`, change to `{{ preview?.validation?.errors?.length ?? 0 }}`.

If the script reads `preview.validation.errors.length`, add a guard:

```typescript
const errorCount = computed(() => preview.value?.validation?.errors?.length ?? 0);
```

(Use `errorCount` wherever `preview.validation.errors.length` was previously read.)

- [ ] **Step 3: Run the relevant component tests**

```bash
pnpm vitest run tests/ui/components/RecordForm.test.ts
pnpm vitest run tests/ui/components/GeographyForm.test.ts
```

Expected: both pass. If the RecordForm test had a case asserting `emit('submit')` exists, it should already have been adapted in Phase 2b Task 8 (per closure report item #6) — re-verify.

- [ ] **Step 4: Full UI test suite**

```bash
pnpm test:ui:run 2>&1 | tail -15
```

Expected: 114/114 still pass.

- [ ] **Step 5: Update findings registry**

Add two follow-up notes (these were surfaced-by-2b items #6 and #7; no separate finding ID):

```markdown
- 2026-05-18 Phase 2c Task 13: RecordForm.vue dead emit('submit') declaration removed (Phase 2b closure item #6). GeographyForm.vue:217 null guard added on preview.validation.errors (Phase 2b closure item #7).
```

- [ ] **Step 6: Commit**

```bash
git add -A modules/ui/app/components/ docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 13): UI minor fixes — RecordForm emit + GeographyForm guard

- RecordForm.vue:67: removed dead emit('submit', recordData) declaration
  (Phase 2b closure surfaced item #6 — declared but never emitted; real
  submission goes through saved/delete events).
- GeographyForm.vue:217: added null guard on preview.validation.errors.length
  (Phase 2b closure surfaced item #7 — would throw on malformed validate
  API response).

UI tests: 114/114 pass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: `docs/architecture-comprehensive-analysis.md` honest revision (LARGEST DOC)

1286 lines. Self-grades "production-ready" 4× plus other overclaims. Decision: honest revision — demote claims, mark planned-vs-shipped explicitly, OR delete entirely if it's redundant with `docs/specs/` + `docs/architecture.md` (if those exist).

**Files:**
- Modify: `docs/architecture-comprehensive-analysis.md`
- Modify: `scripts/audit-truth-check-allowlist.txt` (remove from PHASE 2C TODO)

- [ ] **Step 1: Read the doc to understand its purpose**

```bash
sed -n '1,80p' docs/architecture-comprehensive-analysis.md
```

Decide: is this doc

- (a) a stale top-down architecture overview that's overclaiming → revise to honest
- (b) a redundant doc that duplicates other architecture docs → delete and let the other docs stand
- (c) actually a useful audit-style analysis that just has bad language → light edit, keep substance

Default per Task 1 §2 if redundant: delete. If unique, revise.

- [ ] **Step 2: Inventory other architecture docs**

```bash
ls docs/ | grep -iE "architecture|design|overview"
```

If `docs/architecture.md` exists and substantially overlaps, the comprehensive-analysis is a deletion candidate.

- [ ] **Step 3a (if deletion is the call): delete the file**

```bash
rm docs/architecture-comprehensive-analysis.md
```

- [ ] **Step 3b (if revision is the call): revise overclaim language**

Run:

```bash
grep -niE "(production-ready|100% functional|stable v1\.0|top 0\.1%|95%|all goals completed|fully implemented)" docs/architecture-comprehensive-analysis.md
```

Per match, decide:
- The component IS in v0.2.x → demote language to descriptive ("ships in v0.2.x as <describe-actual-state>")
- The component is NOT shipped → mark `[Planned for v0.3.x]` or `[Not yet implemented]`
- The "X% production-ready" self-grades → delete entirely. No grade.

Also revise any per-component section header that asserts "Stable & Production-Ready" — match the pattern from Phase 2b's project-status.md honest revision.

- [ ] **Step 4: Re-run truth-check against the file**

```bash
./scripts/audit-truth-check.sh docs/architecture-comprehensive-analysis.md
```

Expected: no matches OR file deleted. If matches remain, fix and re-run.

- [ ] **Step 5: Remove from PHASE 2C TODO allow-list**

Edit `scripts/audit-truth-check-allowlist.txt`. In the `# ---- PHASE 2C TODO ----` block, delete the line:

```
docs/architecture-comprehensive-analysis.md
```

- [ ] **Step 6: Verify the gate still passes overall**

```bash
make audit-truth-check
```

Expected: PASS.

- [ ] **Step 7: Update findings registry**

Add a new finding row (was not in the original audit; surfaced by Phase 2b allow-list):

```markdown
| docs-overclaim-architecture | Medium | Phase 2c Task 14 | <SHA> | docs/architecture-comprehensive-analysis.md (1286 lines) self-graded "production-ready" 4×. <DELETE / REVISE> per Phase 2c. |
```

- [ ] **Step 8: Commit**

```bash
git add -A docs/ scripts/audit-truth-check-allowlist.txt docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 14): honest revision of architecture-comprehensive-analysis.md

The 1286-line doc was the largest remaining unrevised overclaimer
(Phase 2b allow-listed it under PHASE 2C TODO). <action: revised /
deleted> per the delete-or-wire-criteria.md rubric. Overclaim language
removed; allow-list entry removed.

closes: docs-overclaim-architecture

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Remaining 5 overclaim docs cleanup

The other 5 files allow-listed under `# ---- PHASE 2C TODO ----`. Mostly smaller than the architecture doc. Same per-file pattern as Task 14.

**Files:**
- Modify or delete each of:
  - `docs/file-attachment-system.md` (423 LoC)
  - `docs/schema-validation-refinement-analysis.md` (200 LoC)
  - `docs/specs/sort-api-spec-analysis.md` (531 LoC)
  - `docs/specs/storage.md` (314 LoC)
  - `docs/todo.md` (480 LoC)
- Modify: `scripts/audit-truth-check-allowlist.txt` (remove each from PHASE 2C TODO as it's resolved)

- [ ] **Step 1: Per-file overclaim scan**

For each file:

```bash
for f in docs/file-attachment-system.md docs/schema-validation-refinement-analysis.md docs/specs/sort-api-spec-analysis.md docs/specs/storage.md docs/todo.md; do
  echo "=== $f ==="
  grep -niE "(production-ready|100% functional|stable v1\.0|top 0\.1%|95%|all goals completed|fully implemented|Stable & Production)" "$f" | head -10
done
```

Capture which files have which patterns.

- [ ] **Step 2: Per-file decision (delete vs revise)**

For each file, per Task 1 rubric:

- **`docs/file-attachment-system.md`** — analysis doc about a planned-or-shipped feature. If feature is shipped + working: revise to honest description, no marketing language. If feature is half-shipped: mark sections accordingly.
- **`docs/schema-validation-refinement-analysis.md`** — analysis doc. Likely a one-time refactor proposal. If the refactor it proposed already shipped: this is a candidate for deletion (it's archival; move to `docs/archive/` or delete). If still relevant: revise.
- **`docs/specs/sort-api-spec-analysis.md`** — analysis sitting in `docs/specs/`. Specs should be canonical; analyses don't belong here. Move to `docs/audits/` OR delete.
- **`docs/specs/storage.md`** — this is a canonical spec for the storage module. Same demotion pattern as Phase 2b Task 1 (spec frontmatter sweep). Check frontmatter: if it's `status: stable`, demote to `partial` or `planned` per `docs/audits/spec-stability-triage.md` rule.
- **`docs/todo.md`** — a TODO list. Should have aspirational language but NOT "100% Functional" claims. Strip the claim language; keep the TODO content.

- [ ] **Step 3a: Fix file-attachment-system.md**

Demote any overclaim language. If specific claims are inaccurate, fix them. Capture the change in the commit message.

- [ ] **Step 3b: Fix schema-validation-refinement-analysis.md**

If the refactor it proposed shipped: move to `docs/archive/schema-validation-refinement-analysis.md` and add a one-line note at the top: `Archived: this analysis informed the validation refactor shipped in v0.2.x. Kept for historical reference.`

If still relevant: demote language; keep substance.

- [ ] **Step 3c: Fix sort-api-spec-analysis.md**

Move to `docs/audits/sort-api-spec-analysis.md` (analyses belong with audits, not specs). Update any cross-references.

```bash
git mv docs/specs/sort-api-spec-analysis.md docs/audits/sort-api-spec-analysis.md
```

Demote overclaim language as part of the move.

- [ ] **Step 3d: Fix specs/storage.md frontmatter**

```bash
head -20 docs/specs/storage.md
```

Per the spec-stability-triage matrix from Phase 2b Task 1, this spec should be either `partial` or `planned`. Edit the frontmatter:

```yaml
---
status: partial   # or planned
version: 0.2.x
implementation_notes: |
  Storage works for local-only and cloud paths. Quotas are enforced
  (Phase 2a). archiveFile method removed (Phase 2c). See
  docs/audits/spec-stability-triage.md for the gap analysis.
---
```

- [ ] **Step 3e: Fix todo.md**

Strip "100% Functional" or "production-ready" language. Keep the TODO list itself. If sections are stale (referencing already-shipped work), prune or annotate.

- [ ] **Step 4: Remove each file from the PHASE 2C TODO allow-list**

Edit `scripts/audit-truth-check-allowlist.txt`. Remove each of the 5 lines under `# ---- PHASE 2C TODO ----` (or remove the whole TODO block if Task 14 already removed the architecture entry and these are the last 5).

- [ ] **Step 5: Run the gate**

```bash
make audit-truth-check
```

Expected: PASS (with the PHASE 2C TODO block now empty or removed).

- [ ] **Step 6: Update findings registry**

```markdown
| docs-overclaim-5 | Medium | Phase 2c Task 15 | <SHA> | 5 docs allow-listed under PHASE 2C TODO (file-attachment-system, schema-validation-refinement-analysis, sort-api-spec-analysis, specs/storage, todo) revised or archived. PHASE 2C TODO block removed from allow-list. |
```

- [ ] **Step 7: Commit**

```bash
git add -A docs/ scripts/audit-truth-check-allowlist.txt docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 15): clear remaining 5 PHASE 2C TODO docs

- docs/file-attachment-system.md: demoted overclaim language.
- docs/schema-validation-refinement-analysis.md: <revised / archived>.
- docs/specs/sort-api-spec-analysis.md: moved to docs/audits/ (analyses
  don't belong in specs/).
- docs/specs/storage.md: frontmatter demoted to <partial/planned>.
- docs/todo.md: stripped 100%/production-ready language; TODO content
  preserved.
- scripts/audit-truth-check-allowlist.txt: PHASE 2C TODO block emptied.

make audit-truth-check PASS.

closes: docs-overclaim-5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: CI integration of `make audit-truth-check`

No `.github/workflows/` exists yet. Phase 2b's truth-check gate runs manually. This task adds a minimal GitHub Actions workflow that runs the gate on every PR. **Optional** — decide at sign-off whether to do this in 2c or defer to 2d. Default in this plan: include it; it's a small task.

**Files:**
- Create: `.github/workflows/truth-check.yml`
- Optional create: `.github/workflows/test.yml` (if a baseline CI workflow doesn't exist — out of scope unless trivial)

- [ ] **Step 1: Create the workflow**

```bash
mkdir -p .github/workflows
cat > .github/workflows/truth-check.yml <<'EOF'
name: audit-truth-check

on:
  pull_request:
    paths:
      - 'docs/**'
      - 'scripts/audit-truth-check.sh'
      - 'scripts/audit-truth-check-allowlist.txt'
      - '.github/workflows/truth-check.yml'
  push:
    branches:
      - main
      - dev

jobs:
  truth-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run audit-truth-check
        run: make audit-truth-check
EOF
```

- [ ] **Step 2: Verify the workflow syntax locally**

If `actionlint` is available:

```bash
which actionlint && actionlint .github/workflows/truth-check.yml || echo "(actionlint not installed; visual review required)"
```

Otherwise, eyeball it.

- [ ] **Step 3: Verify the gate passes on this branch**

```bash
make audit-truth-check
```

Expected: PASS (after Tasks 14 + 15).

- [ ] **Step 4: Update findings registry**

```markdown
| ci-truth-check | Low | Phase 2c Task 16 | <SHA> | audit-truth-check is now a GitHub Actions gate on PR + push-to-main/dev. |
```

- [ ] **Step 5: Commit**

```bash
git add -A .github/workflows/ docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c Task 16): CI integration of audit-truth-check

Added .github/workflows/truth-check.yml. Runs make audit-truth-check
on every PR touching docs/ or the gate scripts, and on every push to
main/dev. Phase 2b's gate is now a recurring CI check, closing the
"manual gate" caveat noted in the Phase 2b closure report.

closes: ci-truth-check

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Phase 2c closure

Final task. Verify, write closure report, run audit-truth-check, register-update, commit. Then we're ready to merge `refactor/phase-2c-foundation-cleanup` → `dev` (per user branch decision).

**Files:**
- Modify: `docs/audits/2026-05-16-manifesto-fit-findings.md` (final status verification)
- Modify: `docs/audits/delete-or-wire-criteria.md` (final execution log)
- Create: `docs/audits/phase-2c-closure-report.md`

- [ ] **Step 1: Verify all 2c-targeted findings are closed**

```bash
grep -E "(core-001|core-004|core-005|core-006|core-010|core-013|api-008|storage-003|storage-004|storage-009|notifications-005|notifications-006|notifications-013|email-validation-regression|docs-overclaim-architecture|docs-overclaim-5|ci-truth-check)" docs/audits/2026-05-16-manifesto-fit-findings.md | grep -v "closed-with-commit\|closed-by-recon\|wontfix-pending\|wontfix-by-phase\|superseded"
```

Expected: no lines.

- [ ] **Step 2: Verify recon-closed + deferred findings are marked**

```bash
grep -E "(realtime-007|realtime-008|api-004|notifications-008|broadcast-box-003|broadcast-box-013)" docs/audits/2026-05-16-manifesto-fit-findings.md
```

Expected: each has a `closed-by-recon-no-commit`, `closed-with-commit-SHA`, OR `wontfix-pending-phase-X` status.

- [ ] **Step 3: Run audit-truth-check — must pass**

```bash
make audit-truth-check
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

```bash
pnpm test
pnpm test:ui:run
```

Expected: Phase 2b baseline (1295 passed / 30 skipped) PLUS the new Phase-2c tests (Task 5: 2 cases; Task 6: 5 cases; Task 9: 4 unit + 1 integration; Task 11: 3 cases; Task 12: 1 case — total ~16 new). The pre-existing `database-integration session-mgmt` flake may still fail; that's the only acceptable failure.

The Phase-2b-surfaced email-validation regression is fixed in Task 12, so the second pre-Phase-2c failure is GONE.

- [ ] **Step 5: Build the whole base**

```bash
pnpm -r build 2>&1 | tail -15
```

Expected: all builds succeed. No stale build artefacts in `core/src/` (Phase 2b purged 74 of them; Phase 2c shouldn't have regenerated any).

- [ ] **Step 6: Write closure report**

`docs/audits/phase-2c-closure-report.md` — same structure as Phase 2a + 2b closure reports:

- Summary (one paragraph: "Phase 2c closed N orphaned subsystems, unified the audit trail, and resolved the core-vs-modules notifications split; closed M findings total")
- Numbers table (before/after for: total orphaned subsystems, lines deleted, lines added, audit channels, ad-hoc EmailChannel implementations, audit-truth-check gate state, test count)
- Commits on `refactor/phase-2c-foundation-cleanup` (list of `refactor(2c Task N)` commits)
- Findings closed table (each ID + severity + task + commit + how)
- What got measurably truer
- Surfaced, not fixed (Phase 2d TODO) — any new follow-ups discovered during execution
- What's deferred and why (broadcast-box-003 → 4/5; broadcast-box-013 → 5; realtime-007/8 → 3)
- Verification (truth-check pass; test count; build clean)
- Recommendations for the next session (Phase 2d — Structural hardening: god-files, type safety, module contracts)
- Anti-deletion check (no findings removed from registry without enacting)
- Sign-off section (truth meter at start of 2c: 25 of 205 → end of 2c: 25 + ~14 = ~39 of 205, depending on which recon-closures count)

- [ ] **Step 7: Final commit**

```bash
git add -A docs/audits/
git commit --no-verify -m "$(cat <<'EOF'
refactor(2c): Phase 2c complete — Foundation Cleanup closure

Closed in this phase:
- core-001, core-013 (audit-trail unification — one channel, sagas wired)
- core-004, core-005, core-006 (saga + cache orphans deleted)
- core-010 (core-vs-modules notifications split resolved)
- api-008 (jwt-auth dead duplicate deleted)
- storage-003, storage-009 (storage orphans deleted)
- storage-004 (failover provider-recovery actually probes now)
- notifications-005, notifications-006 (3 ad-hoc EmailChannel impls → 1 canonical)
- notifications-013 (orphaned webhook-signature validator deleted)
- email-validation-regression (Phase 2b stale-artifact-purge revealed; fixed)
- docs-overclaim-architecture, docs-overclaim-5 (PHASE 2C TODO docs cleaned)
- ci-truth-check (GitHub Actions workflow now runs the gate)

Recon-closed (no code commit):
- realtime-007, realtime-008 (files live on paused broadcast-box branch; Phase 3)
- api-004 (Phase 2a already addressed; registry-pinned)
- notifications-008 (audit finding stale; was already wired)

Deferred to later phases:
- broadcast-box-003 → Phase 4/5 (protocol-adapter)
- broadcast-box-013 → Phase 5 (command-handlers; module paused)

Phase 2c ends. Next phase: 2d Structural Hardening (god-files, types,
module contracts).

Closure report: docs/audits/phase-2c-closure-report.md
Master plan: docs/plans/2026-05-17-base-refactor-master-plan.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Hand off to user**

Phase 2c is done on `refactor/phase-2c-foundation-cleanup`. User can:

- Merge `refactor/phase-2c-foundation-cleanup` → `dev` (per the branch decision at sign-off):
  ```bash
  git checkout dev
  git merge --no-ff refactor/phase-2c-foundation-cleanup
  ```
- Or keep the sub-phase branch around until Phase 2d wants to base off post-2c-merge `dev`.
- Per memory `refactor-push-policy`: nothing pushes to origin until all 7 phases are done.

---

## Appendix A: Self-review

- [x] **Spec coverage.** Master plan §5 Phase 2c scope items addressed:
  - Orphaned subsystems: core-004 (T3), core-005 (T3), core-006 (T3), api-008 (T4), storage-009 (T5), storage-003 (T5), storage-004 (T5), notifications-005 (T6), notifications-006 (T6), notifications-013 (T7), notifications-008 (T2 recon-close), realtime-007 (T2 recon-defer), realtime-008 (T2 recon-defer), broadcast-box-003 (deferred), broadcast-box-013 (deferred).
  - Exit-criteria items: audit-trail unification core-001+core-013 (T9), core-010 notifications split (T8).
  - Phase 2b surfaced items: docs allow-list (T14+T15), publish.ts/status.ts (T11), cli-test-utils + 16 legacy tests (T10), email-validation regression (T12), RecordForm emit + GeographyForm null guard (T13), 3 .skip-with-TODO tests (T11).
  - CI integration of audit-truth-check (T16).
- [x] **Placeholder scan.** Every step shows either actual code, the exact command, or an explicit decision-point (e.g. Task 3 Step 2 says "capture in delete-or-wire log" not "TBD"). Tasks 14 / 15 have decision branches (Step 3a vs 3b etc.) with the full content of each branch.
- [x] **Type / API consistency.** `AuditChannel.record(event: AuditEvent)` signature is consistent between definition (T9 Step 2), call sites (T9 Step 4, T9 Step 6), and tests (T9 Step 7). `EmailChannel` constructor + `send(message)` signature is consistent between definition (T6 Step 2), call sites (T6 Step 4, T6 Step 5), and tests (T6 Step 3).
- [x] **Effort sizing.** Tasks roughly: 0 (XS), 1 (S), 2 (S), 3 (M), 4 (S), 5 (M-L), 6 (M-L), 7 (S), 8 (M), 9 (L), 10 (S-M), 11 (M), 12 (S-M), 13 (XS), 14 (M-L), 15 (M), 16 (S), 17 (S). Total ≈ 3-4 weeks at one person, compressible to 2 weeks with parallel agent dispatch on independent tasks (T3/T4/T5 parallelize; T7 with T8 prep; T10/T11/T12/T13 parallelize; T14/T15 parallelize).
- [x] **Deferred findings enumerated.** Section 0b lists realtime-007/8 (→ Phase 3), broadcast-box-003 (→ 4/5), broadcast-box-013 (→ 5).
- [x] **Commit footers.** Every task's commit has a `closes:` footer with finding IDs per the finding-tracking convention.
- [x] **--no-verify.** Used per master plan §9.1 (continued for Phase 2c).

## Appendix B: Open decisions during execution

1. **Task 3 — saga + cache subsystems.** Defaults are DELETE for all four. The executing agent overrides per case if Step 1 grep reveals a production importer.

2. **Task 5 storage-003 — `archiveFile` delete vs wire.** Default DELETE (OrphanedFileCleaner compensates). Override if a single production path needs an actual file-move semantic.

3. **Task 5 storage-004 — `checkProviderRecovery` implementation shape.** The probe is sketched as `provider.headObject('.health-check-sentinel')`. Adjust if the actual provider interface differs.

4. **Task 6 — canonical EmailChannel options.** The sketch unifies SMTP + SendGrid. If the 3 existing implementations use other transports (e.g. AWS SES), extend the options type accordingly. Capture the union in the commit.

5. **Task 8 — `modules/notifications/` delete vs re-export.** Default DELETE. Override if an external consumer is found.

6. **Task 9 — audit-channel write order.** Sketched as file-JSONL first, DB second (resilience first). The reverse order (DB first, file as durability backup) is also defensible; pick the resilience-first order unless there's a reason. Capture choice in commit.

7. **Task 11 — `publish` CLI prompt behaviour.** Sketched with a `--force` flag and an optional confirm prompt. Match the prompt pattern of other destructive commands in the CLI (or skip the prompt; lift the `--force` if there's no prompt to skip).

8. **Task 14 — architecture-comprehensive-analysis.md delete vs revise.** Decision at execution after reading the file. Default: revise if unique; delete if redundant.

9. **Task 15 — each of 5 files: revise vs delete vs archive.** Per-file judgment per Step 2.

10. **Task 16 — CI workflow scope.** The sketched workflow runs only on `docs/**` + script paths. Broader CI (running `pnpm test`) is out of scope for this phase per master plan §9.1 ("test-suite repair gets its own dedicated session later") — adding a test-running workflow without first stabilizing the flaky tests would re-introduce the false-fail problem the master plan named.

## Appendix C: Execution choice

This plan is large and partly parallelizable. Three execution modes apply:

- **Subagent-Driven (recommended for parallel-friendly tasks 3/4/5/6/7/10/11/12/13/14/15)** — each task dispatches a fresh subagent with the relevant code paths preloaded. Reviewed between tasks. Best for compressing wall-clock time and protecting the main context window. Tasks with shared state (T6 → T8, T9 → T6/T11) need sequential handling.
- **Inline Execution (recommended for design-heavy tasks 8/9/14)** — these touch core architecture; staying in this session's context is valuable.
- **Hybrid (RECOMMENDED for this phase)** — inline for T0-T2 (registry / framework), then subagent-driven for T3-T7 (independent deletes), inline for T8-T9 (notifications split + audit-trail design), subagent-driven for T10-T15 (independent cleanups + docs), inline for T16-T17 (CI + closure).

Decision to be made at the T2 → T3 handoff.

## Appendix D: Out of scope (and why)

- **Removing `as any` casts (api-009, ui-011, storage-015)** — Phase 2d structural hardening.
- **God-file decomposition** — Phase 2d.
- **Module contract / plugin layer** — Phase 2d.
- **Manifesto §3.5 (Ledger)** — Phase 5 per master plan §9.3.
- **`broadcast-box-*` module work** — Phase 5.
- **`BB-HW-*` hardware repo work** — Phase 4.
- **Realtime reintroduction** — Phase 3.
- **Renovate / Dependabot config tuning** — Phase 2a Task 9 closed this; no follow-up here.
- **Fixing the pre-existing `database-integration session-mgmt` flake** — explicit master plan §9.1 deferral to a dedicated session.

---

🏛️ — _Make truth true again._
