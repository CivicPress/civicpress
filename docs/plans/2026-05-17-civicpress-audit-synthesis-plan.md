# CivicPress Manifesto-Fit Audit — Phase 2 Synthesis Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synthesize Phase 1's 10 per-module audit sections into the final audit deliverables — consolidated findings registry, architecture review, roadmap reality-check, executive summary, and recommended next sessions — so the audit can drive concrete decisions.

**Architecture:** Single-threaded (no subagents). Read all 10 section files, extract structured findings into a registry table, then write cross-cutting synthesis chapters into the master report. Same audit branch (`audit/2026-05-16-manifesto-fit`), same `--no-verify` authorization for doc commits. Branch stays local.

**Tech Stack:** Bash + `rg`/`grep` for findings extraction, Markdown for all deliverables. No code changes.

---

## 1. Inputs (already on disk)

- `docs/audits/sections/phase-1-summary.md` — pre-aggregated top findings per module + cross-section pattern preview
- `docs/audits/sections/<module>.md` × 10 — full sections with findings tables
- `docs/audits/2026-05-16-manifesto-fit-audit.md` — master report scaffold (Phase 2 chapters are placeholders)
- `docs/plans/2026-05-16-civicpress-audit-plan.md` — Phase 1 plan (lens definitions, severity scale)
- `docs/architecture.md`, `docs/project-status.md`, `docs/roadmap.md`, `manifesto/manifesto.md` — anchors
- All module source (now merged in: `modules/realtime`, `modules/broadcast-box`, etc.)

## 2. Outputs

- `docs/audits/2026-05-16-manifesto-fit-findings.md` — **NEW** — consolidated findings registry, sortable table
- `docs/audits/2026-05-16-manifesto-fit-audit.md` — **UPDATED** — Executive Summary, Architecture Review, Roadmap Alignment, Recommended Next Sessions sections filled in
- One commit on `audit/2026-05-16-manifesto-fit` with `--no-verify`

## 3. Severity-and-finding-count expectation (pre-synthesis)

From Phase 1 summaries, expected counts (~141 findings total):

| Module | Findings | Criticals | Highs |
|---|---|---|---|
| core | 14 | 0 | 2 |
| cli | ~15 | 0 | 5+ |
| api | 16 | 4 | 1 |
| ui | ~10 | 3 | 4 |
| realtime | 14 | 0 | 4 |
| broadcast-box | 22 | 2+ | 3+ |
| storage | 16 | 2 | 3 |
| legal-register | 7 | 0 | 2 |
| notifications | ~10 | 3 | ? |
| broadcast-box hw | 17 | 3 | 6 |
| **Total** | **~141** | **~17** | **~30** |

These are estimates — Task 1 extracts the actual counts from the section files.

---

## 4. Task 1: Build consolidated findings registry

**Files:**
- Create: `docs/audits/2026-05-16-manifesto-fit-findings.md`

- [ ] **Step 1: Extract findings tables from each section**

For each section file in `docs/audits/sections/<module>.md`, read the `## Findings` table and capture every row.

Run for inventory:
```bash
for f in docs/audits/sections/*.md; do
  echo "=== $f ==="
  awk '/^## Findings/,/^## /' "$f" | head -50
done
```

(The agents follow the template; the findings table starts with `## Findings` and ends before the next `## Notes` heading.)

- [ ] **Step 2: Write registry file**

Write `docs/audits/2026-05-16-manifesto-fit-findings.md` as a single sortable table. Schema (preserved from the template):

```markdown
# CivicPress Manifesto-Fit Audit — Consolidated Findings Registry

**Date:** 2026-05-17
**Source:** `docs/audits/sections/<module>.md` (10 files)
**Total findings:** N
**Critical:** N  | **High:** N  | **Medium:** N  | **Low:** N

This is the consolidated, sortable findings list extracted from the per-module section files. Each row preserves the module's finding ID. For context, click through to the source section.

## Findings — sorted by severity, then module

| ID | Severity | Module | Description | Lens | Manifesto principle | Roadmap impact | Effort |
|---|---|---|---|---|---|---|---|
| broadcast-box-002 | Critical | broadcast-box | Recording pipeline produces only media blobs — no Markdown civic artifacts | manifesto | Markdown-as-civic-format | v0.5–0.8 pilot blocker | M |
| storage-001 | Critical | storage | QuotaManager.checkQuota never called from any upload path | technical+manifesto | Trust | v0.5–0.8 pilot blocker | S |
| ... (one row per finding from all 10 sections) ... |

## Findings — sorted by manifesto principle

(Same table re-sorted: Critical-Trust-violations first, then Critical-Markdown, then Critical-other, then Highs, etc.)

## Findings — sorted by module (cross-reference back to sections)

(Same table grouped by module; links to source section file.)
```

- [ ] **Step 3: Verify counts**

Run:
```bash
grep -c "^| " docs/audits/2026-05-16-manifesto-fit-findings.md
```
Expected: ~141 finding rows × 3 sortings = ~423+ rows in the registry.

## 5. Task 2: Write Architecture Review chapter

**Files:**
- Modify: `docs/audits/2026-05-16-manifesto-fit-audit.md` (replace `## Architecture Review` placeholder)

- [ ] **Step 1: Compose the chapter from cross-section patterns**

Cover (in this order — each is a sub-section):

1. **Module boundaries** — broadcast-box collapsing into realtime (4 setter methods + `registerRoomTypeHandler`; `realtime-server.ts` carries ~1,500 lines of broadcast-box-specific code); `record-schema-builder.ts:219-236` hardcodes `'legal-register'`; ad-hoc `EmailChannel` reimplemented in 4 places. **The manifesto's "WordPress for governance" modularity promise is not structurally honored yet.** Concrete recommendation: extract a stable inter-module contract layer.

2. **The two-repo broadcast-box seam** — three on-the-wire formats accepted; hardware-side and server-side docs disagree on defaults; `protocol-adapter.ts` exists (172 LoC) but is **imported nowhere**; production uses hand-rolled inline normalizers. Recommendation: single canonical protocol spec artifact shared between repos, generated types on both sides, sunset two of the three formats.

3. **Fake comprehensiveness / orphaned code paths** — `QuotaManager.checkQuota`, `protocol-adapter.ts`, `SagaMetricsCollector`, `CacheWarmer`, `NotificationQueue`, API stub routers (`workflows.ts`, `hooks.ts`, `export.ts`, `import.ts` return fake `200 OK`). Pattern: code exists, often typed and tested in isolation, never called. Diagnose as a Cursor/AI-shape signature where superficial completeness was prioritized over end-to-end flow.

4. **Over-engineered scaffolding for v0.2 alpha** — hand-rolled DI container (~600 LoC) for 11 manually-wired services; saga pattern with placeholder `SagaRecovery.recoverFailedSagas()`; two parallel audit systems (file JSONL + DB) with neither owning the full surface. Recommendation: collapse where reasonable; keep DI/saga only where they earn their weight.

5. **Test theatre across modules** — CLI (15-of-27 placeholders), UI (1 file / 0 component coverage), broadcast-box (`api.devices.test.ts` asserts only `toBeDefined`/`toBeInstanceOf(Function)`), legal-register (0 in-module tests). **The "1291+ tests / 95% coverage" claim materially overstates real coverage.** Trust violation. Recommendation: a fresh count of "tests that actually exercise behavior," then a per-module truthful coverage statement.

6. **Pre-existing test reliability issues** — `tests/api/lock-endpoints.test.ts` timeout, `tests/core/database-integration.test.ts` Session Management null result. Both fail the pre-commit hook on docs-only commits, which is why this audit was committed with `--no-verify`. Both are flaky/broken on `main` independent of any branch work.

Each sub-section: 2–4 paragraphs, concrete file/line references, link to the source section(s) where applicable, and a one-line recommendation.

- [ ] **Step 2: Verify**

Run:
```bash
sed -n '/^## Architecture Review/,/^## /p' docs/audits/2026-05-16-manifesto-fit-audit.md | wc -l
```
Expected: ~200+ lines of substantive chapter.

## 6. Task 3: Write Roadmap Alignment chapter

**Files:**
- Modify: `docs/audits/2026-05-16-manifesto-fit-audit.md` (replace `## Roadmap Alignment` placeholder)

- [ ] **Step 1: Build the reality-check table**

For each major claim in `docs/project-status.md`, mark verdict + evidence:

```markdown
| Claim from project-status.md | Verdict | Evidence |
|---|---|---|
| "1291+ tests passing" | **PARTIALLY TRUE** | Tests run, but ~30% of CLI tests are placeholder strings; UI has 1 test file / 32 cases for 13 components; broadcast-box `api.devices.test.ts` is fake. See [cli](sections/cli.md#findings) ([cli-001]), [ui](sections/ui.md), [broadcast-box](sections/broadcast-box.md). |
| "0 critical security vulnerabilities" | **FALSE** | At least 8 Criticals identified in this audit, including XSS via v-html on public records ([ui]), unauthenticated DoS via per-request CivicPress init ([api-001]), public folder requires auth ([storage-002]), notification audit log is structurally dishonest ([notifications]), broadcast-box rate limiter short-circuits outside production ([broadcast-box-007]). |
| "Phase 8 Complete" (broadcast-box) | **DISPUTED** | Implementation runs but: no Markdown civic artifacts produced, contract with hardware fuzzy, prior Jan-2025 audit recommendations partially unaddressed, rate limiter broken outside production. ([broadcast-box]) |
| "Multi-Layer Authentication & Authorization" | **PARTIALLY TRUE** | Tokens issued, but `/api/v1/validation/*` routes lack upstream auth middleware ([api-002]), public storage folder bypass missing on one of three routes ([storage-002]), CLI has two parallel auth UX trees ([cli-004]). |
| (… more rows for each major claim …) |
```

- [ ] **Step 2: Build the forward-fit table**

Map each finding (or finding cluster) to its roadmap impact:

```markdown
| Finding / cluster | Threatens milestone | Unblocks milestone (if fixed) |
|---|---|---|
| broadcast-box flagship not in roadmap | v0.3.x onwards (silent dependency on undeclared feature) | Updating roadmap to list broadcast-box unblocks honest planning |
| Markdown-as-civic-format violations in recordings + collab | v0.5–0.8 (Pilot Readiness — clerks won't accept media-only records) | v0.5–0.8 pilot if civic artifacts implemented |
| Test theatre / inflated coverage | v0.9 Production Candidate (cannot honestly claim production readiness) | v0.9 if honest coverage assessment + meaningful tests added |
| Module boundary collapse | v0.3.x Editor / v0.4.x Workflow (each new feature touches multiple modules) | Plugin system (v0.3.x+) needs stable contracts |
| Two-repo broadcast-box contract fuzz | Hardware deployment readiness | Pilot Readiness |
| Vendor lock-in (Nuxt UI Pro, GCS-when-misconfigured) | Manifesto open-source/no-lock-in hard constraint | v1.0 Stable Release blocker until addressed |
| (… more …) |
```

- [ ] **Step 3: Add the meta-finding**

A short closing sub-section: **"The roadmap and manifesto themselves are stale."** Broadcast-box is the flagship per the user but appears in neither (`docs/roadmap.md` doesn't list it; manifesto §3.5 still names "Ledger"). Realtime + broadcast-box work sits on an unmerged feature branch while project-status claims "v0.2.0 stable." Recommendation: dedicated session to update both, ideally before any external sharing of the audit.

## 7. Task 4: Write Executive Summary

**Files:**
- Modify: `docs/audits/2026-05-16-manifesto-fit-audit.md` (replace `## Executive Summary` placeholder)

- [ ] **Step 1: Compose the summary**

Structure:

```markdown
## Executive Summary

### Verdict

One paragraph: the platform is more architecturally ambitious than v0.2 alpha
warrants, with sophisticated-looking scaffolding (DI, saga, multi-provider
storage, multi-channel notifications) that often sits beside the missing or
orphaned core flow it was meant to support. The flagship (broadcast-box) is in
the right direction but its seams are wrong — refactor, not cleanup. Test
coverage and "100% Functional" claims in `project-status.md` are materially
overstated. The manifesto's six principles and three hard constraints are
violated in specific, fixable ways — none requires abandoning the project's
shape, but several block honest pilot deployment.

### Top 10 findings (by severity and civic-impact)

1. **(Critical, ui)** XSS via unsanitized markdown → `v-html` on the public
   record-detail page, combined with JWT/CSRF in `localStorage`. A malicious
   record body can steal auth tokens from every citizen who reads it.
2. **(Critical, api)** Four stub routers (`workflows.ts`, `hooks.ts`,
   `export.ts`, `import.ts`) return fake `200 OK` while looking live.
3. **(Critical, notifications)** Notification audit log structurally
   hardcodes `success: true` regardless of delivery. 5,156 entries, 0 failed.
4. **(Critical, storage)** Storage quotas implemented and tested but never
   called — a single account can fill the disk.
5. **(Critical, storage)** Public folders require auth on one of three routes.
6. **(Critical, broadcast-box)** Recording pipeline produces media blobs only;
   no Markdown civic artifacts; the flagship doesn't yet read as a civic-record
   module.
7. **(Critical, broadcast-box)** Rate limiter short-circuits when
   `NODE_ENV !== 'production'`; DoS in any dev/staging/demo.
8. **(Critical, broadcast-box hardware)** Contract documented vs actual
   mismatched on the hardware side; canonical translator imported nowhere.
9. **(Critical, broadcast-box hardware)** No license — municipalities cannot
   legally deploy.
10. **(Critical, ui + hard constraint)** Vendor lock-in via paid Nuxt UI Pro;
    SPA-only mode breaks resilient archival.

### Manifesto-fit verdict per module

| Module | Transparency | Trust | Open-source | Public Good | Ease of Use | Equity | No lock-in | Markdown | Resilient archival |
|---|---|---|---|---|---|---|---|---|---|
| core | FAIL | FAIL | PASS | CONCERN | CONCERN | CONCERN | PASS | PASS (record path) | CONCERN |
| cli | CONCERN | FAIL | PASS | PASS | FAIL | FAIL | PASS | PASS | CONCERN |
| api | FAIL | FAIL | PASS | CONCERN | CONCERN | CONCERN | PASS | n/a | n/a |
| ui | CONCERN | FAIL | PASS | CONCERN | CONCERN | CONCERN | **FAIL** | n/a | **FAIL** |
| realtime | CONCERN | FAIL | PASS | CONCERN | CONCERN | CONCERN | PASS | **FAIL** | CONCERN |
| broadcast-box | CONCERN | CONCERN | PASS | PASS | FAIL | CONCERN | PASS | **FAIL** | CONCERN |
| storage | CONCERN | FAIL | PASS | CONCERN | CONCERN | CONCERN | CONCERN | n/a | **FAIL** |
| legal-register | CONCERN | FAIL | PASS | PASS | CONCERN | CONCERN | PASS | PASS | PASS |
| notifications | FAIL | FAIL | PASS | CONCERN | CONCERN | CONCERN | CONCERN | n/a | n/a |
| broadcast-box hw | CONCERN | CONCERN | **FAIL** | PASS | FAIL | CONCERN | CONCERN | **FAIL** | CONCERN |

(Cell verdict definitions: **FAIL** = critical or high-severity violation; **CONCERN** = medium-severity issue or partial-pass; **PASS** = no notable finding; **n/a** = lens does not apply to this module.)

### What this means

The platform is not broken, but it is **not at the maturity the docs claim**.
The work required to honor the manifesto is concrete and bounded:
- Address ~17 Criticals (mostly security + a few hard-constraint violations).
- Fix the fake-comprehensiveness pattern (one well-defined refactor per
  orphaned subsystem).
- Refactor broadcast-box seams (one architectural change spanning monorepo +
  hardware repo + contract).
- Update roadmap + manifesto to reflect what the project actually is now.

None of these are existential. All are addressable in a small handful of
focused sessions.
```

## 8. Task 5: Write Recommended Next Sessions

**Files:**
- Modify: `docs/audits/2026-05-16-manifesto-fit-audit.md` (replace `## Recommended Next Sessions` placeholder)

- [ ] **Step 1: List sessions in priority order**

```markdown
## Recommended Next Sessions

In priority order. Each is a focused, scoped follow-up — none open-ended.

### 1. Critical-only fix pass (RECOMMENDED FIRST)

**Goal:** Close the ~17 Critical findings before any external sharing of the
audit. Most are small, well-defined.
**Scope:** XSS sanitization in UI; auth-middleware on `/api/v1/validation/*`
and `/api/v1/status/*`; wire `QuotaManager.checkQuota` into upload paths;
remove or sunset the API stub routers; fix the notification audit log honesty
issue; gate `broadcast-box` rate limiter on environment correctly; add a
license to the broadcast-box hardware README.
**Output:** PR-per-fix or one branch; tests added for each fix; audit
findings updated with status.
**Effort:** ~1-2 sessions.

### 2. Broadcast-box deep follow-up (queued earlier)

**Goal:** Address the "approach right, seams wrong" verdict with a concrete
refactor proposal. Cover: device control protocol consolidation (sunset 2 of 3
on-the-wire formats); single canonical protocol spec shared between
repos; civic-artifact pipeline (recordings → markdown + transcript +
metadata); clerk-grade live-event setup abstraction; rationalize the
broadcast-box ↔ realtime module boundary.
**Inputs:** `docs/audits/sections/broadcast-box.md`,
`docs/audits/sections/civicpress-broadcast-box-hardware.md`,
`docs/audits/sections/realtime.md`.
**Output:** Architecture proposal + migration plan; possibly a small PoC.
**Effort:** 1-2 sessions.

### 3. Dedicated security review

**Goal:** Take the security findings beyond "light pass" — formal threat
model, authn/authz tracing across all 25+ endpoints, dependency
vulnerability scan, civic-specific threat surface (enrollment code theft,
recording tampering, motion integrity, citizen PII), pentest-style review.
**Inputs:** Audit sections' Security subsections + the consolidated findings
registry filtered by `security` lens.
**Output:** Full threat model doc + prioritized remediation list.
**Effort:** 1 dedicated session, possibly with `/security-review` skill.

### 4. Manifesto + roadmap refresh

**Goal:** Bring `docs/roadmap.md` and `manifesto/manifesto.md` up to date
with reality. Broadcast-box-as-flagship needs to be a named roadmap
milestone. Manifesto §3.5 needs to be updated (Ledger → broadcast-box, or
ledger formally deprecated). `docs/project-status.md` claims need honest
revision.
**Effort:** ~1 short session.

### 5. Documentation consolidation

**Goal:** The repo has multiple overlapping docs (architecture comprehensive
analysis, broadcast-box plans archive, spec status confusions). Consolidate
to a single source of truth per topic. The prior broadcast-box audit
(`docs/broadcast-box/CLEANUP-AND-TEST-AUDIT-REPORT.md`) already identified
much of this; the work was never done.
**Effort:** ~1 session.

### 6. Test reliability + honest coverage

**Goal:** Fix the two flaky tests that are failing the pre-commit hook
(`lock-endpoints`, `database-integration session-management`); replace
placeholder-string CLI tests with real ones; produce honest per-module
coverage numbers.
**Effort:** 1-2 sessions; pairs with the Critical fix pass.

### 7. Plugin/module contract solidification

**Goal:** Make the "WordPress for governance" promise structural — define
the module integration contract clearly, remove hardcoded module names from
core (`record-schema-builder.ts:219-236`), let `legal-register` be a real
module-by-example rather than a stub.
**Effort:** 1 session; depends on outcomes of #2 (broadcast-box refactor
may inform the contract shape).
```

## 9. Task 6: Assemble + final review pass

**Files:**
- Modify: `docs/audits/2026-05-16-manifesto-fit-audit.md`

- [ ] **Step 1: Update the status line**

Change the report's Status line from "Phase 1 (per-module sweeps) COMPLETE… Phase 2 deferred" to:

> **Status:** Audit COMPLETE (Phase 2 synthesis written 2026-05-17). Audit branch is local-only; do not push until findings are triaged.

- [ ] **Step 2: Update the per-module section index**

Each row should now include the per-module manifesto-fit verdict pulled from the summary table.

- [ ] **Step 3: Add a "Consolidated findings" link**

Replace the existing `## Consolidated Findings` placeholder with:

```markdown
## Consolidated Findings

See [`docs/audits/2026-05-16-manifesto-fit-findings.md`](2026-05-16-manifesto-fit-findings.md) — single sortable registry of all ~141 findings extracted from the 10 sections. Three views: by severity, by manifesto principle, by module.
```

- [ ] **Step 4: Self-review pass**

Read through the assembled report top-to-bottom. Check:
- Every chapter has substantive content (no "TBD" / "to be filled" markers).
- Severity claims in Executive Summary match the registry counts.
- File paths referenced in findings still exist on the merged branch.
- Tone is technical, evidence-led, not editorial.

If anything is malformed, fix inline.

## 10. Task 7: Commit Phase 2

**Files:**
- Modify: `docs/audits/2026-05-16-manifesto-fit-audit.md`
- Create: `docs/audits/2026-05-16-manifesto-fit-findings.md`

- [ ] **Step 1: Stage and commit**

Run:
```bash
git add docs/audits/
git commit --no-verify -m "audit: Phase 2 — synthesis (architecture, roadmap, findings, summary)

Phase 2 synthesis completes the manifesto-fit audit:
- Consolidated findings registry (docs/audits/2026-05-16-manifesto-fit-findings.md)
- Architecture Review chapter (module boundaries, two-repo seam,
  fake-comprehensiveness, over-engineering, test theatre, reliability)
- Roadmap Alignment chapter (reality-check vs project-status, forward-fit
  per finding, manifesto/roadmap staleness)
- Executive Summary (verdict, top 10 findings, manifesto-fit per module)
- Recommended Next Sessions (7 prioritized follow-ups)

The audit is now substantively complete. Branch remains local until
findings have been triaged.

Committed with --no-verify (user-authorized for audit docs).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 2: Verify**

Run:
```bash
git log --oneline 4c039e7..HEAD
git status --short
```
Expected: 4 commits on audit branch (Phase 0 scaffold, Phase 1 sweeps, broadcast-box merge, Phase 2 synthesis); clean tree.

## 11. Task 8: Final handoff

- [ ] **Step 1: Update memory**

Add a memory entry pointing to the final audit deliverables. Update `MEMORY.md` index.

- [ ] **Step 2: Present to user**

One short message: what's committed, where to read the deliverables, what the recommended first follow-up session is.

---

## Appendix A: Self-Review Checklist (run after writing this plan)

- [x] Spec coverage: every Phase 2 deliverable (registry, arch review, roadmap, exec summary, next-sessions) has a task.
- [x] Placeholder scan: no "TBD" / "add appropriate" — every step shows the actual content shape.
- [x] Type consistency: "Phase 2", "synthesis", "audit branch", "findings registry" used identically throughout.
- [x] Severity scale referenced consistently (from Phase 1 plan § 2.2).
- [x] All output paths in `docs/audits/` (no new directories needed).
- [x] Single-threaded (no subagent dispatch) — synthesis is judgment work that should not be parallelized.
