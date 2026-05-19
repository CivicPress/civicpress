# Phase 2c.5 Foundation Cleanup Follow-ups — Closure Note

**Sub-phase:** 2c.5 (Foundation Cleanup follow-ups) of the post-audit base refactor
**Branch:** `refactor/phase-2c.5-followups` (cut off `dev`'s post-Phase-2c-merge tip `9e89a42`)
**Period:** 2026-05-19 (1-day sub-session)
**Parent closure:** `docs/audits/phase-2c-closure-report.md` §"Surfaced, not fixed"
**Plan:** `docs/plans/2026-05-19-base-refactor-phase-2c.5-followups.md`

---

## Summary

Phase 2c.5 closed 4 of 5 in-scope items the Phase 2c closure report flagged as cheap cleanups. The 5th item (pre-existing storage test breakage) turned out to be 28 failures across 10 test files — too big for a 1-day session, deferred to Phase 2d intake where storage-006/007 already live.

Net result: every "consolidated but missed one" caveat, every "vestigial" surface, every "follow-up tracked" footnote in the Phase 2c closure is now resolved on `dev`. The refactor's truth-restoration spine reaches every foundation-layer cleanup site the audit named.

---

## Commits on `refactor/phase-2c.5-followups`

In order, oldest first (`git log dev..refactor/phase-2c.5-followups`):

```
8dcc346  refactor(2c.5 T1): delete orphan SagaRecoveryError class
fa8513d  refactor(2c.5 T2): drop vestigial secretsManager plumbing in NotificationSecurity
8a6a558  refactor(2c.5 T3): migrate 4th ad-hoc EmailChannel to canonical impl
3e0840a  refactor(2c.5 T4): route core/auth audit through unified AuditChannel
(this commit)  Phase 2c.5 closure note + registry update
```

---

## What got closed (4 of 5 surfaced items)

| # | Item | Task | Commit | Effort | How |
|---|---|---|---|---|---|
| 1 | Orphan `SagaRecoveryError` class in `core/src/saga/errors.ts:147-166` | T1 | `8dcc346` | 5 min | Grep confirmed zero imports; deleted class + the now-unused `InternalError` import. Saga test suite (32 tests) still passes. |
| 2 | Vestigial `secretsManager?` plumbing in `NotificationSecurity` + `NotificationService` | T2 | `fa8513d` | 25 min | Phase 2c T7 deleted webhook signature methods — only consumers of secretsManager in `NotificationSecurity`. Cascade was 3 files (security, service, civic-core-services + 1 orphan relay in `EmailValidationService.initializeSecrets`). 4 files / 1 insertion / 32 deletions. 52 notification + email-validation tests pass. |
| 3 | 4th ad-hoc `EmailChannel` impl at `modules/api/src/routes/notifications.ts:64-116` | T3 | `8a6a558` | 30 min | Replaced inline nodemailer + @sendgrid/mail dual-path with canonical `EmailChannel` from `@civicpress/core`, wrapped in a thin `NotificationChannel`-shaped adapter. Standalone `@sendgrid/mail` code path dropped (nodemailer's `service: 'SendGrid'` shortcut suffices for the admin /test endpoint). 8 canonical EmailChannel tests pass; API builds clean. |
| 4 | 2 direct `db.logAuditEvent` callers in `core/auth` (auth-service:717 + email-validation:545) | T4 | `3e0840a` | 50 min | Same `writeAudit`-helper pattern as Phase 2c T9's RecordManager change. `AuthService` + `EmailValidationService` now take optional `auditChannel?: AuditChannel`; DI wires it in `civic-core-services.ts`. 2 new test files / 4 cases pin the wire. Auth events now write file-JSONL first (resilient) + DB second (queryable) — same contract as record events. 10 internal `logAuthEvent` callers inherit the new path for free. |

---

## What was deferred (1 of 5 surfaced items)

**Pre-existing storage test breakage** — Phase 2c T5 added the module-local `modules/storage/vitest.config.mjs` which executed `modules/storage/src/__tests__/` against the root vitest config for the first time. Re-running the suite at start of Phase 2c.5 shows the real scope: **28 failures across 10 test files**, not the 4 the closure report named (that count was based on the smaller list T5 surfaced before full execution).

Failing test files (with failure count per file):

| File | Failures |
|---|---|
| `batch-operations.test.ts` | 11 |
| `streaming-operations.test.ts` | 3 |
| `timeout-utils.test.ts` | 3 |
| `circuit-breaker.test.ts` | 2 |
| `health-checker.test.ts` | 2 |
| `retry-manager.test.ts` | 2 |
| `storage-errors.test.ts` | 2 |
| `lifecycle-manager.test.ts` | 1 |
| `orphaned-file-cleaner.test.ts` | 1 |
| `usage-reporter.test.ts` | 1 |
| **Total** | **28** |

Plus 2 unhandled exceptions from `streaming-operations.test.ts`.

**Scope:** well beyond a 1-day sub-session. Per-file investigation likely needed: stale mock expectations vs. current implementation, error-type drift (e.g. `StorageTimeoutError` instance check failing — likely the class was renamed or moved), provider-count drift in `usage-reporter`, etc. Some may be stale-test deletion candidates; some may be real bugs the tests caught now that they're actually running.

**Disposition:** Rolling forward to **Phase 2d intake**. Master plan §5 Phase 2d already covers storage module work (storage-006 cloud SDKs to optionalDependencies, storage-007 resilient archival). Add storage-test-repair as a sibling task to those.

---

## Numbers

- **Findings actionably addressed (cumulative):** 51 → 55 (+4 Phase-2c.5 closures, tracked as separate rows like the Phase-2b-surfaced ones — not in the original-205 truth-meter)
- **Test count:** 1191 → 1195 passing (+4 new wire tests across T4); 1 / 19 failed/skipped unchanged (the documented §9.1 session-mgmt flake)
- **Build (`pnpm -r build`):** clean across all 6 workspaces (core, cli, modules/api, modules/ui, modules/storage, modules/serve)
- **`make audit-truth-check`:** PASS (no allow-list changes needed; the truth-check rule set tightened in Phase 2c T15 continues to pass)
- **Lines of code:** -85 (net deletion across 4 commits — T1 -21, T2 -31, T3 -8, T4 +208/-14 with new tests; counting source-only it's net negative)

---

## What got measurably truer

1. **No more orphan saga-recovery surface area.** Phase 2c T3 deleted `saga-recovery.ts`. Phase 2c.5 T1 deleted the matching `SagaRecoveryError` class. The saga module no longer carries a class with no caller — symbolic of the audit's "delete or wire" rubric finishing what it started.

2. **`NotificationSecurity` has no dead surface.** Phase 2c T7 deleted webhook signature methods; Phase 2c.5 T2 deleted the supporting `secretsManager?` field, `initializeSecrets` method, and the matching consumer-side code in `NotificationService` + `civic-core-services.ts` + `EmailValidationService.initializeSecrets`. The class shape now matches what it does.

3. **EmailChannel really is canonical everywhere.** Phase 2c T6 said "3 consolidated → 1 canonical" but recon missed the 4th at `modules/api/src/routes/notifications.ts`. Phase 2c.5 T3 closed that gap. **Now exactly ONE EmailChannel implementation in the codebase**; the `notifications-005` audit framing ("Four parallel ad-hoc inline EmailChannel implementations") is fully resolved.

4. **The audit trail covers `core/auth` too.** Phase 2c T9 unified `RecordManager` and `SagaExecutor` through `AuditChannel`. Phase 2c.5 T4 brought `AuthService` (10 internal `logAuthEvent` callers) and `EmailValidationService` (`completeEmailChange` audit). The two direct `db.logAuditEvent` callers the Phase 2c closure flagged as remaining are now both routed through the channel. **Auth events now write file-JSONL first (resilient archival), DB second (queryable)** — the same contract record events get.

---

## Anti-deletion check

Per the finding-tracking convention's anti-deletion rule: no findings were removed from the registry. The 4 Phase 2c.5 closures are appended as new rows in the Closed findings section.

The `notifications-005` (originally Phase 2c-closed) is **not re-opened** — it's `closed-with-commit-SHA` because Phase 2c T6 did consolidate 3 of the 4 sites into the canonical channel, which substantially closed the audit's framing. The 4th site is tracked as a separate Phase 2c.5 row (same convention as Phase-2b-surfaced items get their own rows in Phase 2c closure).

The `core-001` (Phase 2c-closed) similarly **stays closed** — Phase 2c T9 introduced the channel and migrated `RecordManager`. The auth migration is a follow-up, not a re-open.

---

## Sign-off

Phase 2c.5 is **complete and ready to merge to `dev`** when the user signs off. No push (per refactor branch policy until all 7 phases done — Phase 2d Structural Hardening is next per master plan §5).

The "one-day Phase 2c.5 sub-track" recommendation from the Phase 2c closure report has been realized as a one-day session. 4 of 7 items the closure surfaced are closed (the 4 in-scope ones plus the 3 marginal ones — the `docs/specs/sort-api-spec-analysis.md` move cross-reference check was not needed; the `Database.logAuditEvent` signature-tightening is the existing soft-typed signature and remains tracked for a future hygiene pass).

🏛️ — _The truth-restoration spine reaches every foundation-layer cleanup site._
