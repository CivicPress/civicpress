# Phase 2a Closure Report — Bleed-Stop

**Phase:** 2a (Bleed-Stop) of the post-audit base refactor
**Branch:** `refactor/phase-2a-bleed-stop` (off `main`)
**Period:** 2026-05-17 (single evening session)
**Master plan:** `docs/plans/2026-05-17-base-refactor-master-plan.md`
**Phase 2a plan:** `docs/plans/2026-05-17-base-refactor-phase-2a-bleed-stop.md`
**Anchor audit:** `docs/audits/2026-05-16-manifesto-fit-audit.md` (205 findings, 20 Critical originally)
**Findings registry:** `docs/audits/2026-05-16-manifesto-fit-findings.md` (Status Tracker section)

---

## Summary

Phase 2a closed **15 of the 20 audit Criticals** in a single working session, deferred the remaining 5 by design to later refactor phases, reduced the `pnpm audit` advisory backlog from 143 → 21 (85% reduction), wiped the structurally dishonest notification audit log (5,156 → 0 entries), and made the manifesto's Trust + Transparency principles substantively truer across notifications, the API, the UI, storage, and the dependency tree.

The exit condition the master plan named for Phase 2a is met:

> **Exit criteria:** All 20 Critical findings status = `closed-with-commit-SHA` OR `wontfix-with-rationale` (e.g., broadcast-box ones deferred to later phases).

Status:
- 15 Criticals → `closed-with-commit-SHA` or `closed-no-commit`
- 5 Criticals → `wontfix-pending-phase-N` (rationales in the Status Tracker)

---

## Numbers

| Metric | Before Phase 2a | After Phase 2a |
|---|---|---|
| `pnpm audit` total | 140 advisories | **21 advisories** |
| `pnpm audit` Critical | **4** | **0** |
| `pnpm audit` High | 69 | 10 (all transitive in dev/test paths) |
| `.system-data/notification-audit.jsonl` dishonest entries | 5,156 | **0** (wiped 2026-05-17) |
| Hardware repo license | "TBD" | **AGPL-3.0-or-later** |
| Findings closed | 0 | **18** (17 `closed-with-commit-SHA` + 1 `closed-no-commit`) |
| Findings deferred | 0 | **5** (`wontfix-pending-phase-N` with rationales) |
| Findings still open | 205 | 182 |
| UI module unit tests | 1 file / 32 cases / 0 component coverage | +1 file / +8 cases (first real composable tests) |
| Renovate config | none | `renovate.json` with weekly schedule, auto-merge minor+patch, security-labelled |

---

## Commits on `refactor/phase-2a-bleed-stop`

In order, oldest first:

```
3133377  refactor(2a Task 0): lift audit deliverables to main + finding tracker
619aee1  refactor(2a Task 1): clear 3 Critical CVEs + add Renovate
64edff4  refactor(2a Task 2): API auth/injection trio (api-001, api-002, api-003)
a6eda5f  refactor(2a Task 3): stub API routers return 501 instead of fake 200
c8879ac  refactor(2a Task 4): sanitize markdown + add noscript fallback
49b9f38  refactor(2a Task 5): enforce storage quotas + public-folder listing
5fa1054  refactor(2a Tasks 6-8): notifications truth restoration trio
c7f5e54  refactor(2a Task 9): dependency backlog — 143 → 21 advisories
(this commit) Phase 2a closure report
```

Plus on `main` (plan + decisions):

```
c6e4574  refactor: master plan + Phase 2a Bleed-Stop plan (signed off 2026-05-17)
6bafc24  docs(plans): capture Phase 2a decisions resolved 2026-05-17
7429685  docs(plans): lock in AGPL-3.0 for BB-HW-002 (user-confirmed)
```

Plus on the hardware repo (`civicpress-broadcast-box`, local-only):

```
f63edaf  license: add AGPL-3.0-or-later (closes BB-HW-002)
```

---

## Findings closed in Phase 2a (18)

By the order they closed:

| ID | Severity | Task | Commit |
|---|---|---|---|
| workspace-001 | High (sensitive) | Task 0 | `3133377` (closed-no-commit; filesystem move 2026-05-17) |
| BB-HW-002 | Critical | Task 1 | `f63edaf` (hardware repo) |
| deps-001 | Critical | Task 1 | `619aee1` |
| deps-002 | Critical | Task 1 | `619aee1` |
| deps-003 | Critical | Task 1 | `619aee1` |
| deps-005 | High | Task 1 | `619aee1` |
| api-001 | Critical | Task 2 | `64edff4` |
| api-002 | Critical | Task 2 | `64edff4` |
| api-003 | Critical | Task 2 | `64edff4` |
| api-004 | Critical | Task 3 | `a6eda5f` |
| ui-001 | Critical | Task 4 | `c8879ac` |
| ui-003 | Critical (partial — full SSR deferred) | Task 4 | `c8879ac` |
| storage-001 | Critical | Task 5 | `49b9f38` |
| storage-002 | Critical | Task 5 | `49b9f38` |
| notifications-001 | Critical | Tasks 6-8 | `5fa1054` |
| notifications-002 | Critical | Tasks 6-8 | `5fa1054` |
| notifications-003 | Critical | Tasks 6-8 | `5fa1054` |
| deps-004 | High | Task 9 | `c7f5e54` |

---

## Findings deferred (5) — all to later refactor phases

| ID | Severity | Target phase | Why deferred |
|---|---|---|---|
| broadcast-box-002 | Critical | Phase 5 | Inside paused module; closes when AI-port-driven civic-artifact derivation lands. |
| broadcast-box-007 | Critical | Phase 5 | Inside paused module; rate-limiter env-gate fixed during reintroduction. |
| BB-HW-001 | Critical | Phase 4 | Hardware-repo protocol work; closes when shared protocol-spec artifact exists. |
| BB-HW-003 | Critical | Phase 4 | Hardware-repo civic-artifact pipeline; partner to broadcast-box-002. |
| ui-002 | Critical | Phase 2d (may promote earlier) | Nuxt UI Pro v4 is now free + OSS (user confirmed 2026-05-17). Scoping the v3 → v4 migration determines whether this lands in Phase 2a follow-up or Phase 2d as planned. See `nuxt-ui-pro-v4-free` memory. |

---

## What got measurably truer

This was the spine of the refactor — every commit either made code true to documented behavior, or made documentation/state true to actual behavior. Concretely:

1. **The notification audit log no longer lies.** 5,156 entries that hardcoded `success: true` regardless of delivery are gone. New entries record actual `sentChannels`, `failedChannels`, `partial`, `errors`, and `template`. Rejection paths (validation, rate-limit) emit `notification_rejected` rows with reason + reset time. The Trust principle holds on this surface for the first time.
2. **Security gates that pretended to enforce now actually do.** `validateRequest()` and `checkRateLimit()` return values are inspected. Spam-shaped requests get rejected with auditable reason.
3. **PII sanitization no longer corrupts the message body.** Email-as-template-variable now renders as the actual email, not `[REDACTED]`.
4. **Storage quotas are enforced.** `QuotaManager.checkQuota` is wired into both upload paths. Configured limits actually limit.
5. **Public storage folders are reachable without an account.** Citizens can enumerate `access: 'public'` folders, matching the documented "Public by Default" promise.
6. **API stub routers tell the truth.** `workflows`, `hooks`, `export`, `import` return `501 Not Implemented` with planned-milestone metadata, not fake `200 OK`.
7. **Citizens can no longer be session-jacked by a malicious record.** Markdown render path now sanitizes via DOMPurify before any `v-html` sink. 8 unit tests pin the XSS-safe behavior. First real UI tests in the project.
8. **JS-disabled visitors get a real message** instead of a blank shell. Full SSR/prerender deferred to Phase 2d as planned.
9. **The API doesn't allocate a CivicPress per request anymore.** The DoS amplifier on `/api/v1/info` is gone. Status + validation routes work in production (were previously 500 / 401 respectively).
10. **No Critical-severity CVEs in production deps.** `simple-git`, `fast-xml-parser` (x2), `handlebars` all bumped past their patched versions.
11. **The dep tree shrinks from 143 to 21 advisories** with no breaking changes. Renovate added to surface upstream patches weekly.
12. **The flagship hardware has a license.** AGPL-3.0-or-later locks in the manifesto's "no corporate extraction" stance.

---

## What's deferred and why (not failures — design)

Master plan §2.3 sequences broadcast-box reintroduction after the base is fixed. Phase 4 owns the hardware repo. Phase 2d owns structural hardening including the `@nuxt/ui-pro` decision. The 5 deferred Criticals all live in those scopes by design. Each has a target phase and a rationale in the Status Tracker.

The audit log discontinuity is documented but not reconciled — option (b) wipe was chosen because the prior entries were test/dev leftovers per the user. Going forward, every entry is honest.

---

## What's still open in Phase 2a's scope

Phase 2a's exit criteria are met. There is no remaining in-scope work for this phase.

Two follow-ups that don't block phase exit but should be tracked:

1. **Real notification tests.** The notification fixes were verified by inspection. Adding proper Vitest tests for the truthful-audit, inert-gates-fix, and PII-correctness behavior is part of the "test theatre" cleanup cluster (ui-005, cli-001, broadcast-box-004, plus notifications). That cluster gets focused attention in Phase 2b.
2. **The 10 remaining High advisories** in `docs/dependencies-known-issues.md` are documented but not closed. All are transitive in dev/test paths; Renovate will surface upstream patches. Re-audit at every sub-phase exit and per release.

---

## Recommendations for the next session (Phase 2b — Truth Restoration)

Master plan §5 Phase 2b scope is now ready to execute:

- Honest revision of `docs/project-status.md`, `docs/roadmap.md`, and site copy (about the base only — no broadcast-box flagship promotion per user decision §9.3).
- `legal-register` spec rewrite from "stable v1.0.0" to "planned" (per user decision §9.4).
- The "test theatre" cleanup pass (cli-001, ui-005, broadcast-box-004, plus notification tests).
- BB-HW-008 in passing (delete or honestly rewrite `engineering-analysis.md`'s self-grade).
- Manifesto stays untouched per user decision §9.3.

Estimated 1-2 weeks per the master plan.

---

## Anti-deletion check

Per the finding-tracking convention's anti-deletion rule: no findings were removed from the registry. Every closure shows up as a row in the Status Tracker section. The 5 deferred Criticals are tracked with target phases. Future audits will see this trail.

---

## Sign-off

Phase 2a (Bleed-Stop) is **complete and ready to merge to `main`** when the user signs off.

Truth meter at start of Phase 2a: 0 findings closed of 205.
Truth meter at end of Phase 2a: **18 closed + 5 explicitly deferred = 23 of 205 actionably addressed** (11% of the total audit, ~25% of the in-scope items).

The base is materially less overclaimed and materially less underwired than it was at sunset. The work continues.

🏛️ — _Make truth true again._
