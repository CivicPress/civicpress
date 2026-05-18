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
| `saga-recovery.ts` (core-004) | DELETE | Placeholder for 18+ months; no v0.3.x production path needs saga compensation re-run. Re-introduce when saga reliability becomes a real pain. |
| `saga-metrics.ts` (core-005) | DELETE | Only test imports. Metrics aren't an audit finding driver. Re-introduce with the observability sub-phase if/when it comes. |
| `cache-warmer.ts` (core-005) | DELETE | Warming is an optimization. No production load profile needs it. |
| `'hybrid'` cache strategy (core-006) | DELETE-FROM-UNION | Trivially removable; type union shouldn't advertise unimplemented options. |
| `jwt-auth.ts` (api-008) | DELETE | Pure dead duplicate of `middleware/auth.ts`. |
| `uuid-storage-service.ts` (storage-009) | DELETE | Replaced by `CloudUuidStorageService`. |
| `archiveFile` (storage-003) | DELETE | `OrphanedFileCleaner` already compensates; archiveFile is doing nothing valuable. |
| `checkProviderRecovery` (storage-004) | WIRE | Failover-without-recovery is a real reliability gap; the probe is a HEAD request — cheap insurance per §3. |
| 3 ad-hoc EmailChannel impls (notifications-005) | CONSOLIDATE-THEN-DELETE | One canonical EmailChannel in core/; the others delete. |
| `validateWebhookSignature` (notifications-013) | DELETE | No webhook endpoint exists; reintroduce when webhooks ship. |
| `notification-queue.ts` (notifications-008) | already-wired-close-by-recon | Not really an orphan; audit was wrong. |
| `modules/notifications/` (core-010) | DELETE | Canonical home is `core/src/notifications/`; module is the smaller of the two. |

The above is the **default**, not the decision. The executing agent confirms or overrides per case in its commit message.

## Phase 2c execution log

Each subsequent Phase 2c task that touches a subsystem in the table above appends a row here capturing the actual decision + brief why + commit reference. Filled in during execution.

| Subsystem | Decision | Why | Commit |
|---|---|---|---|
| `saga-recovery.ts` (core-004) | DELETE (§4) | Placeholder 18+ months; only saga/index.ts + saga-e2e describe block consumed it. | T3 `42bf991` |
| `saga-metrics.ts` (core-005) | DELETE (§4) | Only test-side consumer; no production wire. | T3 `42bf991` |
| `cache-warmer.ts` (core-005) | DELETE (§4) | `warming.enabled` never set true; warming-init block + warmers Map + warming?: field on CacheConfig removed alongside. | T3 `42bf991` |
| `'hybrid'` cache strategy (core-006) | DELETE-FROM-UNION (§4) | Trivially removable; sole consumer was the "not yet implemented" throw. | T3 `42bf991` |
| `jwt-auth.ts` (api-008) | DELETE (§2) | 227 LoC pure dead duplicate of `middleware/auth.ts`; zero imports outside the file. | T4 `a32a06b` |
| `uuid-storage-service.ts` (storage-009) | DELETE (§2) | No live importers; `CloudUuidStorageService` is the production path. Re-export removed from `modules/storage/src/index.ts`. | T5 `5e990e3` |
| `LifecycleManager.archiveFile` (storage-003) | DELETE (§2) | Was a DB-only folder rename — never moved bytes (literal no-op). `OrphanedFileCleaner` already compensated for archival drift; its header doc now records that history. | T5 `5e990e3` |
| `StorageFailoverManager.checkProviderRecovery` (storage-004) | WIRE (§3) | Real reliability gap; probe is cheap insurance via the existing `CloudUuidStorageService.performHealthCheck` primitive. 4 unit tests pin the wire. Also surfaced: storage test suite wasn't running under root vitest config — Task 5 added `modules/storage/vitest.config.mjs`. | T5 `5e990e3` |
| 3 ad-hoc EmailChannel impls (notifications-005, 006) | CONSOLIDATE-THEN-DELETE (§2) | One canonical EmailChannel in `core/src/notifications/channels/`; SMTP + SendGrid; AWS SES (advertised + unimplemented) dropped per the "no fake comprehensiveness" rule. 8 unit tests. Module copy deleted. **4th ad-hoc impl surfaced** at `modules/api/src/routes/notifications.ts:83` — recon missed it; flagged as Phase 2c follow-up. | T6 `7b783af` |
| `validateWebhookSignature` (notifications-013) | DELETE (§2) | No webhook endpoint exists in v0.2.x (zero `(post\|put).*webhook` route handlers across `modules/api/` + `cli/`). 42 LoC removed including companion `generateWebhookSignature`. Vestigial `secretsManager?` plumbing in NotificationSecurity flagged for a later hygiene pass. | T7 `2700e8d` |
| `modules/notifications/` (core-010) | CLOSED-BY-SIDE-EFFECT (§2) | Recon at T8 found the dir doesn't exist post-Task-6. Was never a workspace package (`pnpm-workspace.yaml` never listed it), held only one tracked file (`channels/email-channel.ts`), and that file was deleted by Task 6. Git doesn't track empty dirs. Canonical home: `core/src/notifications/`. No separate code commit. | T8 (registry-only) |

### Parallel-dispatch notes (Phase 2c T3-T7)

T3-T7 were dispatched in parallel per Appendix C of the Phase 2c plan. Two commits (T5 SHA `730f302` and T6 SHA `705de25`) got orphaned by a working-tree race when one of the agents reset the branch to recover from a pollution incident. Both commits' file changes were preserved in the working tree and re-committed cleanly as T5 `5e990e3` and T6 `7b783af` by the coordinating session. Reflog retains the original SHAs (`git reflog | grep -E '730f302|705de25'`).

**Lesson for future parallel dispatches:** subagents working on a shared branch should (a) only `git add` specific paths (never `-A`), (b) NOT do `git reset` even to recover from a polluted commit — surface the problem to the coordinator and let them serialize the cleanup. The pollution that triggered the reset was the parallel-running agents' unstaged changes showing up in each other's `git status` view. Worktree isolation (the option declined at sign-off) would have prevented this.
