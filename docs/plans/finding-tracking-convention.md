# Finding Tracking Convention

> Established 2026-05-17 as part of the base refactor (master plan: `2026-05-17-base-refactor-master-plan.md` § 3). The goal is to make audit findings actionable from `main` without drifting into the Jan-2025 pattern of deleting audit reports without enacting them.

## Where status lives

- **Canonical findings:** `docs/audits/2026-05-16-manifesto-fit-findings.md`. The per-severity / per-principle / per-module tables are the immutable record of what was found and when.
- **Per-finding status:** `docs/audits/2026-05-16-manifesto-fit-findings.md` § "Status tracker" (appended at the bottom). Lists *every finding that is no longer `open`*. The implicit default for any finding not listed there is `open`.

This keeps the registry tables clean (no mass per-row edits) and concentrates the action-tracking in one easily-readable section.

## Status values

| Status | Meaning |
|---|---|
| `open` | Not yet started. (Default — not explicitly listed in the tracker.) |
| `triaged` | Has an owner, a sub-phase assignment, and an effort estimate. |
| `in-progress` | Work is underway on a feature branch. |
| `closed-with-commit-SHA` | Fixed in a specific commit on `main`. The commit's message contains `closes: <finding-id>` in its footer. |
| `closed-no-commit` | Fixed via a non-code action (e.g., filesystem move, doc update on another branch, configuration on a remote service). The status row documents what happened and where. |
| `wontfix-pending-phase-X` | Deferred to a later refactor phase. Status row names the target phase + the reason. |
| `wontfix-with-rationale` | Explicitly declined. Status row contains the rationale (e.g., "no longer applicable because X was replaced," "deferred to v2.0," "covered by replacement system Y"). |
| `superseded-by-Y` | Replaced by a different finding or decision. Status row links to the replacement. |

## Commit-message convention

Every commit that closes one or more findings includes a footer line:

```
closes: api-001, api-002, deps-001
```

The footer is `grep`-able. A small verification can confirm "every `closed-with-commit-SHA` row in the registry has a real commit somewhere on main."

```bash
# All commits on main that closed findings:
git log main --grep="^closes:" --pretty=format:"%h %s"
# All findings claimed closed in the registry but with no matching commit:
# (script TBD; for now manual audit suffices)
```

## Anti-deletion rule

**No finding may be removed from the registry without enacting it.** Closed findings stay in the registry with their `closed-*` status as audit-trail.

After a future audit confirms the finding is no longer present in the code, the entry can be **archived** (moved to `docs/audits/archive/2026-05-16-manifesto-fit-findings-archived.md`) — not deleted.

This rule exists because the Jan-2025 `docs/broadcast-box/CLEANUP-AND-TEST-AUDIT-REPORT.md` was deleted in commit `1181c17` without enacting most of its findings — the deletion was confused with closure. We name the pattern explicitly to break it.

## Workflow per finding

1. Pick a finding from the registry (currently 205 findings, see registry summary table).
2. Set its status to `triaged` in the tracker (add a row).
3. Branch off main: `refactor/phase-XY-<short-name>` (per master plan branch strategy).
4. Set status to `in-progress`.
5. Do the work.
6. Commit with `closes: <id>` footer.
7. Update the tracker row to `closed-with-commit-SHA` (paste the SHA).
8. Open PR.
9. After merge to main, that finding is closed and audit-trailed.

## When the registry has new findings (future audits)

A future audit can append a new findings file (e.g., `docs/audits/2026-09-XX-manifesto-fit-followup-findings.md`) without disturbing this one. The tracker grows to cover all open audit registries.

If the same finding recurs (a regression), open a fresh row in the new registry referencing the closed-prior one (`superseded-by-<new-id>` on the old, `regression-of-<old-id>` note on the new).

## Recurring truth-check

Run `make audit-truth-check` before closing any sub-phase. The gate scans the working tree for documented overclaim patterns ("production-ready", "100% Functional", "Top 0.1%", "stable v1.0", "All goals completed", etc.) and exits non-zero if any are found outside the allow-list.

- Pattern list: `scripts/audit-truth-check.sh` (`PATTERNS` array)
- Allow-list: `scripts/audit-truth-check-allowlist.txt`

The allow-list explicitly permits historical / audit-quoting files (audit reports, refactor plans, changelogs) and agent-internal context (`agent/`). It also carries a `# ---- PHASE 2C TODO ----` section listing files with overclaim language deferred to Phase 2c Foundation Cleanup; do NOT remove those entries without enacting the fix.

CI integration is deferred to Phase 2c or Phase 2d (whichever lands first); until then, the gate is invoked manually before each sub-phase closure commit.

This script was added in Phase 2b Task 6 (2026-05-17). See `docs/plans/2026-05-17-base-refactor-phase-2b-truth-restoration.md` Task 6.
