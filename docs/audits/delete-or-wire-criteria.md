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
| _(filled in by Tasks 3-9 as they execute)_ | | | |
