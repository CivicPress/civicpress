# Base Refactor — Phase 2b: Truth Restoration

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended for the test-writing tasks 7-11) or `superpowers:executing-plans` (for the doc tasks 1-5). Steps use checkbox (`- [ ]`) syntax. Each task ends in a commit whose message lists closed finding IDs via the `closes:` footer.

**Goal:** Stop the structural dishonesty named in the audit. Make every doc, spec, status claim, and site copy true to the code — or explicitly marked as future (v0.3.x+). Where the audit named test-theatre overclaims, fix the truth on BOTH sides: revise the claim AND add real tests that pin the now-honest numbers. Build a `make audit-truth-check` script as a recurring gate.

**Architecture:** Single integration branch `dev` (already created off `main` post-Phase-2a-merge). One task per finding cluster. Docs work first (tasks 1-5), tooling next (task 6), then tests (tasks 7-11), closure (task 12). Sibling repos commit directly to their own `main` per user decision: `civicpress-site` has a remote and gets pushed; `civicpress-broadcast-box` is local-only and stays local. All commits use `--no-verify` per master plan §9.1.

**Tech Stack:** TypeScript / Vue 3 / Nuxt 3 / vitest + vue-test-utils + happy-dom (UI tests). Existing patterns: `vitest.config.ui.mjs` already configured; `tests/ui/setup.ts` is the entry point. CLI uses commander; CLI tests need a child-process or in-process strategy (decide in Task 10). Truth-check script: bash + ripgrep.

---

## 0. Inputs

- **Master plan:** `docs/plans/2026-05-17-base-refactor-master-plan.md` (Phase 2b scope: §5)
- **Phase 2a closure:** `docs/audits/phase-2a-closure-report.md` (follow-up #1: notification real tests are part of 2b)
- **Findings registry:** `docs/audits/2026-05-16-manifesto-fit-findings.md` (use the Status Tracker section; per-finding sections are anchors below)
- **Audit module sections:** `docs/audits/sections/{cli,ui,notifications,site,civicpress-broadcast-box-hardware,legal-register}.md`
- **User decisions resolved before plan was drafted (2026-05-17):**
  1. Test-theatre cleanup → **Full real-test pass** (truth-restore claims AND add real tests for civic-critical components/commands).
  2. `audit-truth-check` script → **Build now in 2b.**
  3. Order → **Docs/specs first, then tooling, then tests.**
  4. Sibling repos → **Commit directly to their `main`** (site pushable; hardware local-only).

---

## 0b. Scope summary

**In scope (close in this phase):**

| ID | Module | Fix sketch | Difficulty |
|---|---|---|---|
| spec-stability-sweep | docs/specs/ | 61 specs with `status: stable`; mechanically review each, demote to `planned` / `partial` / `v0.3.x-scope` where reality doesn't match. Touches roughly 10-20 specs. | M |
| legal-register-001, legal-register-006 | docs/specs/legal-register.md | Spec rewrite: `status: stable / v1.0.0` → `status: planned / v0.3.x-scope`. Add "Implementation status" note pointing at the 210-line schema-only reality. | S |
| notifications-007 | docs/specs/notifications.md | Spec rewrite: `status: stable / v1.0.0` → `status: partial / v0.2.x-stabilizing`. Note that the audit trio (notifications-001/2/3) closed in 2a is now the honest baseline. | S |
| project-status-truth | docs/project-status.md | Top-of-file rewrite. Remove "Stable & Production-Ready" contradiction. Drop the "1167+ tests" / "85+ security tests" unsubstantiated claims. Replace per-module test counts with honest counts. Add an "Audit findings" section pointing at the registry. **No broadcast-box flagship** (master plan §9.3). | M |
| roadmap-truth | docs/roadmap.md | Strip ✅ "Completed in v0.2.0" overclaims (only keep the verifiably-shipped ones). Reframe v0.2.x as "alpha / refactor in progress." Add post-Phase-2a + post-audit truth meter. **No broadcast-box as flagship** (master plan §9.3). | M |
| site-001 | civicpress-site repo | Update en.json + fr.json hero/FAQ/roadmap copy to match the new honest project-status. Push to origin. | S |
| site-002 | civicpress-site repo | Broadcast-box invisible on the site — **keep as-is** for now (intentional per §9.3). Close as `wontfix-by-phase-strategy`, re-open in Phase 5. | trivial |
| site-003 | civicpress-site repo | Site docs claim `@nuxt/ui-pro` while code uses free `@nuxt/ui`. Fix the docs. | S |
| BB-HW-008 | civicpress-broadcast-box repo | `engineering-analysis.md` (765 lines). Delete the "Top 0.1% Senior Engineer" + "95% production-ready" self-grades. Either replace with honest assessment (Phase 4 will rebuild this) or delete the file entirely. Decide in-execution. | M |
| audit-truth-check-tool | scripts/ + Makefile | `make audit-truth-check` walks the findings registry, greps for known overclaim patterns ("production-ready", "stable v1.0", "100% Functional", "Top 0.1%", "95% complete"), exits non-zero if any are found outside allow-listed contexts (e.g. historical changelog, audit reports themselves). | S |
| notifications-tests-2a-followup | tests/core/ | Real Vitest unit tests for the 3 Phase-2a notification fixes: truthful audit log, validate/rate-limit gate enforcement, PII sanitization correctness. ~10-15 cases. | M |
| ui-005-tier1 | modules/ui/ | Real component tests for civic-critical forms: RecordForm, GeographyForm, UserForm. ~6-10 cases per component. | L |
| ui-005-tier2 | modules/ui/ | Real component tests for record viewing: RecordList, RecordSearch, RecordPreview, StatusTransitionControls. ~4-8 cases per component. | L |
| cli-001-tier1 | cli/ | Real tests for civic-critical commands: init, create, list, publish, validate. ~3-5 cases per command. | L |
| cli-001-tier2 | cli/ | Real tests for: history, search, status, users, login. ~3-5 cases per command. | M |

**Deferred (with rationale; tracked as `wontfix-pending-phase-X` or `superseded-by-X`):**

| ID | Defer to | Why |
|---|---|---|
| broadcast-box-004 | superseded | Original audit said "fake `api.devices.test.ts`". The file no longer exists (verified by Explore on 2026-05-17). Close in registry as `superseded-by-deletion`. |
| ui-005 component-coverage-completeness | Phase 2d | Tier 1+2 (~7 components) close the audit's "0 component coverage" finding. Full 25+ component coverage rolls into Phase 2d structural hardening. |
| cli-001 command-coverage-completeness | Phase 2d | Tier 1+2 (~10 commands) close the cli-001 finding's "test theatre" angle. Full 28+ command coverage rolls into Phase 2d. |
| manifesto-3.5 (Ledger reference) | Phase 5 | Master plan §9.3 — manifesto stays untouched until Phase 5 reintroduces broadcast-box properly. |

---

## Task 0: Branch + scope acknowledgement

We are already on `dev` (created off `main` at the Phase 2a merge `0e40ea3`). This task does two things: lift any not-yet-triaged Phase 2b finding IDs to `triaged` status in the registry, and verify the working tree is clean.

**Files:**
- Modify: `docs/audits/2026-05-16-manifesto-fit-findings.md` (Status column updates only)

- [ ] **Step 1: Verify branch + clean tree**

```bash
git rev-parse --abbrev-ref HEAD
git status --porcelain
```

Expected: `dev` and no output (or only `.claude/` untracked, which is fine).

- [ ] **Step 2: Mark Phase 2b in-scope findings as `triaged`**

In `docs/audits/2026-05-16-manifesto-fit-findings.md` Status Tracker section, set Status of each of the following from `open` to `triaged-phase-2b`:

- `legal-register-001`, `legal-register-006`
- `notifications-007`
- `site-001`, `site-002`, `site-003`
- `BB-HW-008`
- `ui-005`
- `cli-001`

(`broadcast-box-004` already auto-closes as `superseded-by-deletion` in Task 12.)

- [ ] **Step 3: Commit**

```bash
git add docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2b Task 0): triage Phase 2b finding cluster

Marks 9 findings (legal-register-001/006, notifications-007, site-001/2/3,
BB-HW-008, ui-005, cli-001) as triaged-phase-2b. Phase 2b begins.

Master plan: docs/plans/2026-05-17-base-refactor-master-plan.md (§5)
Phase 2b plan: docs/plans/2026-05-17-base-refactor-phase-2b-truth-restoration.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1: Spec frontmatter truth pass

61 spec files in `docs/specs/` claim `status: stable`. The base is v0.2.0 Alpha. The mass-claim mismatch is its own audit finding (`spec-stability-sweep` per the master plan's truth-restoration theme). This task mechanically reviews every stable-claiming spec and demotes those whose code-side is incomplete.

**Files:**
- Modify: ~10-20 files under `docs/specs/` (exact list determined by Step 1)

- [ ] **Step 1: Generate the candidate list**

```bash
grep -l "status: stable" docs/specs/*.md | sort > /tmp/stable-specs.txt
wc -l /tmp/stable-specs.txt
```

Expected: 61 files.

- [ ] **Step 2: Per-spec triage**

For each file in the list, decide one of three outcomes:

- **STABLE-KEEP** — spec describes a feature that genuinely works in v0.2.0 (e.g. `git-engine.md`, `auth.md`, `cli.md` for the commands that actually exist).
- **DEMOTE-TO-PARTIAL** — code exists but the spec overpromises behavior (e.g. `notifications.md` after Phase 2a fixes — now partial).
- **DEMOTE-TO-PLANNED** — module is schema-only or absent (e.g. `legal-register.md` — closes `legal-register-001/006`).

Write the triage matrix to `docs/audits/spec-stability-triage.md` with a one-line rationale per file. (This is also useful for `audit-truth-check` in Task 6.)

- [ ] **Step 3: Apply DEMOTE-TO-PARTIAL changes**

For each `partial` spec, edit the frontmatter:

```yaml
---
version: 0.2.x
status: partial
implementation_notes: |
  See docs/audits/spec-stability-triage.md for the gap between this spec
  and the current code. Full implementation targeted for v0.3.x.
---
```

(Preserve other frontmatter keys; only touch `status` + `version` + add `implementation_notes`.)

- [ ] **Step 4: Apply DEMOTE-TO-PLANNED changes (closes legal-register-001/006)**

For each `planned` spec:

```yaml
---
version: 0.3.x-scope
status: planned
implementation_notes: |
  This module is documented but not yet implemented (or only schema-stubbed).
  Build is scheduled for a dedicated sub-phase post-2d per master plan §9.4.
---
```

Specifically for `docs/specs/legal-register.md`:
- Demote to planned.
- Add a "Current implementation" section noting the 210-line schema file at `core/src/records/record-schema-builder.ts:219-236` is the entirety of the implementation.

- [ ] **Step 5: Verification**

```bash
grep -c "status: stable" docs/specs/*.md | awk -F: '{n+=$2} END {print "Total stable claims:", n}'
grep -c "status: partial" docs/specs/*.md | awk -F: '{n+=$2} END {print "Total partial:", n}'
grep -c "status: planned" docs/specs/*.md | awk -F: '{n+=$2} END {print "Total planned:", n}'
```

Expected: `stable` count is now equal to the STABLE-KEEP set from Step 2 (likely 15-30). `partial` + `planned` together account for the rest.

- [ ] **Step 6: Update findings registry**

Mark `legal-register-001`, `legal-register-006` as `closed-with-commit-SHA` (SHA filled in at Step 7).

- [ ] **Step 7: Commit**

```bash
git add docs/specs/ docs/audits/spec-stability-triage.md docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2b Task 1): spec frontmatter truth pass

Reviewed 61 specs that claimed status: stable. Demoted overclaiming specs
to partial / planned per the spec-stability-triage matrix. legal-register
spec now correctly marked as planned (210-line schema is the entire
implementation; real module build is a post-2d sub-phase per §9.4).

Triage matrix: docs/audits/spec-stability-triage.md

closes: legal-register-001, legal-register-006

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `docs/project-status.md` honest revision

The headline file. 704 lines. Line 5 says "Stable & Production-Ready" right next to "v0.2.0 (Alpha)" — the contradiction in literal adjacent text. Line 6 claims 1167+ tests / 85+ security tests. Lines 387-393 claim per-module test counts (CLI 120+, UI 80+, etc.) that don't match the file count on disk.

**Files:**
- Modify: `docs/project-status.md`

- [ ] **Step 1: Pin the contradiction**

Edit line 5 region:

Before:
```markdown
**Overall Status:** Stable & Production-Ready
**Current Version:** v0.2.0 (Alpha)
```

After:
```markdown
**Overall Status:** Alpha — refactor in progress (Phase 2a complete; see docs/audits/phase-2a-closure-report.md)
**Current Version:** v0.2.0 (Alpha)
```

- [ ] **Step 2: Drop the unsubstantiated test totals**

Find every line that asserts a total test count (1167+, 1048+, "85+ security tests", etc.) and replace with the actual current honest number from the verified Phase 2a test run:

```markdown
**Test Suite:** 1213 passing / 1 known pre-existing flaky / 27 skipped (API+core) + 67/67 passing (UI). See docs/audits/phase-2a-closure-report.md for the verification trail.
```

- [ ] **Step 3: Replace the per-module testing table (lines 386-393)**

Before (paraphrased):
```markdown
| Module | Tests | Coverage |
|---|---|---|
| CLI | 120+ | 95% |
| API | 200+ | 90% |
| Core | 160+ | 90% |
| UI | 80+ | 85% |
| ... |
```

After:
```markdown
| Module | Test files | Cases | Component coverage |
|---|---|---|---|
| CLI | 1 (diagnose) | 13 | ~3% of commands have real tests |
| API | (run `pnpm test` for current; ~50 files) | 1213 passing | Integration coverage strong; unit coverage uneven |
| Core | (see vitest output) | included above | Integration coverage strong |
| UI | 2 + Phase-2a additions | 40 + 8 Phase-2a XSS pins | ~0% component coverage. Phase 2b adds Tier-1 component tests for civic-critical forms. |
| Notifications | 1 integration | (audited 2026-05) | No unit tests for the 3 Phase-2a fixes yet — added in Phase 2b Task 7. |
```

- [ ] **Step 4: Replace any "100% Functional" claims**

`grep -n "100% Functional" docs/project-status.md` — for each hit, replace with module-specific honest status per the spec-stability triage from Task 1.

- [ ] **Step 5: Remove or qualify "0 critical security vulnerabilities" claims**

`grep -n "0 critical" docs/project-status.md` — for each, rewrite to reference the audit:

```markdown
**Security:** 20 audit-identified Criticals (2026-05 audit). 15 closed in Phase 2a; 5 deferred to Phase 4/5 by design. 4 `pnpm audit` Criticals → 0 (Phase 2a Task 1 + 9). See docs/audits/phase-2a-closure-report.md.
```

- [ ] **Step 6: Remove broadcast-box flagship claims**

`grep -n -i "broadcast" docs/project-status.md` — for each match, rewrite to describe broadcast-box as a "planned module currently paused for the base refactor (Phase 5 reintroduction)." **Do NOT** call it the flagship (master plan §9.3).

- [ ] **Step 7: Add an "Audit findings" section near the top**

After the overview, add:

```markdown
## Audit findings (2026-05)

The 2026-05 manifesto-fit audit identified 205 findings (20 Critical). The
post-audit base refactor is in progress; tracker at:

- `docs/audits/2026-05-16-manifesto-fit-findings.md` — full registry with Status column
- `docs/audits/phase-2a-closure-report.md` — Phase 2a Bleed-Stop summary
- `docs/plans/2026-05-17-base-refactor-master-plan.md` — 7-phase roadmap

This file (`project-status.md`) is **the public answer to "is it ready?"**
The honest answer for v0.2.x is: **functional for early pilots; not
production-ready; expect breaking changes through v0.3.x as the refactor lands.**
```

- [ ] **Step 8: Verify with audit-truth-check (will fail because tool not yet built; OK for now)**

Note in the task that Step 6 of Task 6 will re-run truth-check against this file.

- [ ] **Step 9: Commit**

```bash
git add docs/project-status.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2b Task 2): honest project-status.md (base only, no BB flagship)

Removes "Stable & Production-Ready" contradiction (Alpha + Production
adjacent on line 5). Replaces unverified 1167+ tests claim with verified
1213 + 67 from Phase 2a test run. Per-module test table now reflects
file count on disk (CLI 1, UI 2, etc.). Adds Audit findings section
pointing at the registry. Broadcast-box demoted from flagship per master
plan §9.3 (paused for refactor; Phase 5 reintroduction).

closes: project-status-truth (informal id — also resolves the
"fake comprehensiveness" pattern this doc carried)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `docs/roadmap.md` honest revision

289 lines. Line 84 says `✅ All goals completed in v0.2.0`. Line 197 says i18n is `Fully Implemented and Production-Ready`. Line 133 has i18n still as in-progress for v0.3.x (internal contradiction). Master plan §9.3 says **do not promote broadcast-box as flagship**.

**Files:**
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Replace "All goals completed in v0.2.0" with verifiable list**

Find line 84. Replace `✅ All goals completed in v0.2.0 (2025-01-30)` with:

```markdown
**v0.2.0 shipped (2025-01-30):** see CHANGELOG.md for the verified delivered
features. Some items previously marked ✅ here were aspirational — see the
2026-05 audit findings (`docs/audits/2026-05-16-manifesto-fit-findings.md`)
for the gap. Phase 2a of the post-audit refactor closes 18 of them.
```

- [ ] **Step 2: Audit every ✅ checkmark**

`grep -n "✅" docs/roadmap.md` — for each:

- Verify the claim against current code (grep / file existence / test pass).
- If verified: keep the ✅.
- If aspirational only: replace ✅ with 🟡 (partial) or 📋 (planned).
- If contradicted by audit: replace ✅ with ⚠ + audit-finding-ID reference.

(Step 2 is one action per checkmark. Sub-steps below cover the common patterns.)

- [ ] **Step 3: Reconcile the i18n contradiction**

Line 197 says fully implemented. Line 133 says in-progress for v0.3.x. Pick one:

- Verify state: does i18n actually work in production?
- If yes: remove the v0.3.x line (do not double-count).
- If no: demote line 197 to 🟡 with note pointing at line 133's v0.3.x plan.

- [ ] **Step 4: Remove broadcast-box flagship framing**

`grep -n -i "broadcast" docs/roadmap.md` — for each match:

- If it describes broadcast-box as a flagship / upcoming-headline-feature: remove the framing. Move to a "Planned Phase 5 reintroduction" subsection.
- If it's a neutral mention (e.g. "see broadcast-box repo"): keep.

- [ ] **Step 5: Add a "v0.3.x: post-refactor" section**

After the v0.2.x content, add a section that describes v0.3.x as the post-refactor target. Reference the master plan's Phase 2b/2c/2d/3/4/5 structure. **Do not** name specific dates.

- [ ] **Step 6: Add the refactor truth meter**

At the bottom, before the changelog reference, add:

```markdown
## Refactor truth meter

Per the master plan's "make truth true again" spine, every refactor sub-phase
ships its truth meter:

| Phase | Findings closed | Findings deferred (with target phase) |
|---|---|---|
| 2a Bleed-Stop | 18 | 5 (broadcast-box-002/007 → Phase 5; BB-HW-001/3 → Phase 4; ui-002 → 2d) |
| 2b Truth Restoration | (filled at closure) | (filled at closure) |
| 2c, 2d, 3, 4, 5 | _pending_ | _pending_ |

See `docs/audits/2026-05-16-manifesto-fit-findings.md` for the per-finding tracker.
```

- [ ] **Step 7: Commit**

```bash
git add docs/roadmap.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2b Task 3): honest roadmap.md (no BB flagship; truth meter)

Replaces "All goals completed in v0.2.0" with a verifiable list pointing
at the audit registry. Audits every ✅ checkmark; demotes aspirational
ones to 🟡 / 📋 / ⚠. Reconciles the i18n contradiction (line 133 vs 197).
Removes broadcast-box flagship framing per master plan §9.3. Adds v0.3.x
post-refactor section + refactor truth meter table.

closes: roadmap-truth (informal id — addresses the "stale narrative" pattern)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Site repo i18n + page copy (civicpress-site)

Sibling repo at `/Users/stakabo/Work/repos/civicpress/site`. Has `origin: git@github.com:CivicPress/site.git`. Per user decision: commit directly to its `main`, then push.

**Files (in civicpress-site repo):**
- Modify: `i18n/locales/en.json`
- Modify: `i18n/locales/fr.json`
- Modify: any page that references `@nuxt/ui-pro` (site-003)

- [ ] **Step 1: Read current state**

```bash
cd /Users/stakabo/Work/repos/civicpress/site
git status
git log -5 --oneline
```

Working tree clean? On `main`? Up to date with origin? If yes, proceed.

- [ ] **Step 2: Identify offending strings in en.json**

```bash
grep -n -i "production-ready\|v0.2.0 stable\|100% functional\|stable & production" i18n/locales/en.json
```

Replace each with the project-status.md-aligned phrasing:

- `"production-ready"` → `"functional for early pilots; not yet production-ready"`
- Any "v0.2.0 stable" → `"v0.2.0 alpha"`
- Any "100% functional" → `"functional for the documented v0.2.0 feature set"`

- [ ] **Step 3: Mirror the changes in fr.json**

Same edits, French equivalents:
- `"prêt pour la production"` → `"fonctionnel pour des pilotes; pas encore prêt pour la production"`
- etc.

(If French strings don't exist, leave them as-is — the audit found en.json is the bigger overclaim surface.)

- [ ] **Step 4: Fix site-003 (`@nuxt/ui-pro` docs claim)**

```bash
grep -rn "@nuxt/ui-pro" .
```

For each documentation occurrence (NOT code occurrences), replace with `@nuxt/ui` (the free version actually in use).

- [ ] **Step 5: Verify build**

```bash
pnpm install
pnpm build
```

Site builds clean.

- [ ] **Step 6: Commit + push**

```bash
git add i18n/locales/en.json i18n/locales/fr.json
git commit -m "$(cat <<'EOF'
docs: honest copy per CivicPress 2026-05 audit truth restoration

Replaces production-ready overclaims with alpha-honest framing. Fixes
@nuxt/ui-pro doc references to @nuxt/ui (the free version actually used).
Aligned with monorepo docs/project-status.md (Phase 2b Task 2) and
docs/roadmap.md (Phase 2b Task 3).

Related: civicpress monorepo refactor Phase 2b (commit pending in dev branch)

closes: site-001, site-003

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

- [ ] **Step 7: Note site-002 closure in monorepo registry**

Back in monorepo:

```bash
cd /Users/stakabo/Work/repos/civicpress/civicpress
# Update findings registry: site-002 status → wontfix-by-phase-strategy
```

Set `site-002` to `wontfix-by-phase-strategy: broadcast-box site copy re-opens in Phase 5 when BB reintroduction lands` per master plan §9.3. This is a registry-only change; will be committed in Task 12.

---

## Task 5: BB-HW-008 hardware engineering-analysis (civicpress-broadcast-box)

Sibling repo at `/Users/stakabo/Work/repos/civicpress/civicpress-broadcast-box`. **Local only, no remote.** `docs/engineering-analysis.md` is 765 lines and self-grades "Top 0.1% Senior Engineer / 95% production-ready." Master plan suggests "delete or honestly rewrite." Per user decision: commit directly to its local `main`.

**Files (in civicpress-broadcast-box repo):**
- Modify or delete: `docs/engineering-analysis.md`

- [ ] **Step 1: Read current state of the file**

```bash
cd /Users/stakabo/Work/repos/civicpress/civicpress-broadcast-box
git status
head -30 docs/engineering-analysis.md
```

- [ ] **Step 2: Decide — rewrite or delete**

Decision criteria: does the file contain ANY useful technical content beyond the self-grading? If yes → rewrite (keep technical content, strip self-grades). If it's mostly aspirational self-grading → delete + add a note.

**Default (deferred decision):** delete the file. Phase 4 will produce an honest engineering assessment when the hardware repo gets its dedicated audit-fix phase.

- [ ] **Step 3a (if delete): rm + note**

```bash
git rm docs/engineering-analysis.md
```

Create `docs/engineering-analysis-pending.md`:

```markdown
# Engineering analysis — pending

The previous `engineering-analysis.md` (765 lines) was deleted in Phase 2b of
the CivicPress base refactor (2026-05). It self-graded "Top 0.1% Senior
Engineer / 95% production-ready" without verifiable evidence, and contained
internal contradictions (lines 23, 693, 707 disagreed on production-readiness).

An honest engineering analysis will be produced in Phase 4 of the refactor
master plan, when this repo gets its dedicated audit-fix pass.

Reference: docs/plans/2026-05-17-base-refactor-master-plan.md (§5 Phase 4)
in the civicpress monorepo.
```

- [ ] **Step 3b (if rewrite): strip self-grades, keep technicals**

`grep -n "0.1%\|95% production\|production-ready\|95%\|Top 0\|Senior Engineer" docs/engineering-analysis.md` — for each match, either delete the line or rewrite to be factual + verifiable.

Add a top-of-file note:

```markdown
> **Note (2026-05):** This file was revised during CivicPress base refactor
> Phase 2b to remove unverifiable self-grades. The technical content below
> remains as the author's analysis; the production-readiness claims have been
> removed pending Phase 4 audit.
```

- [ ] **Step 4: Commit (local only)**

```bash
git add docs/engineering-analysis.md docs/engineering-analysis-pending.md 2>/dev/null || true
git rm docs/engineering-analysis.md 2>/dev/null || true
git commit -m "$(cat <<'EOF'
docs: honest engineering analysis per CivicPress 2026-05 audit (BB-HW-008)

Removes unverifiable self-grading ("Top 0.1% Senior Engineer", "95%
production-ready") flagged by audit BB-HW-008. Honest assessment deferred
to Phase 4 of the refactor master plan when this repo gets its dedicated
audit-fix pass.

Related: CivicPress monorepo refactor Phase 2b Task 5

closes: BB-HW-008 (in civicpress-broadcast-box hardware repo)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(No push — repo is local-only per the workspace-cleanup audit finding.)

- [ ] **Step 5: Note BB-HW-008 closure in monorepo registry**

```bash
cd /Users/stakabo/Work/repos/civicpress/civicpress
```

In `docs/audits/2026-05-16-manifesto-fit-findings.md`, set BB-HW-008 to `closed-with-commit-SHA` (SHA from hardware repo Step 4). Note format: `closed-with-commit-<sha> (in civicpress-broadcast-box repo)`. Registry change committed in Task 12.

---

## Task 6: `make audit-truth-check` script

Build the truth-check gate the master plan §5 exit criteria call for. Greps for known overclaim patterns; exits non-zero if any pattern is found outside an allow-list. Run before each sub-phase closure.

**Files:**
- Create: `scripts/audit-truth-check.sh`
- Create or modify: `Makefile` (add `audit-truth-check` target)
- Create: `scripts/audit-truth-check-allowlist.txt`

- [ ] **Step 1: Write the allow-list**

`scripts/audit-truth-check-allowlist.txt`:

```text
# Files where overclaim patterns are EXPECTED (historical record, audit reports
# describing the overclaim, changelog of past releases, etc.). One path per line.
# Patterns match exactly (no globbing here — handled in the script).

docs/audits/
docs/CHANGELOG.md
CHANGELOG.md
docs/plans/2026-05-16-civicpress-audit-plan.md
docs/plans/2026-05-17-civicpress-audit-synthesis-plan.md
docs/plans/2026-05-17-base-refactor-phase-2a-bleed-stop.md
docs/plans/2026-05-17-base-refactor-phase-2b-truth-restoration.md
docs/plans/2026-05-17-base-refactor-master-plan.md
node_modules/
.git/
```

- [ ] **Step 2: Write the script**

`scripts/audit-truth-check.sh`:

```bash
#!/usr/bin/env bash
# audit-truth-check: scans the working tree for documented overclaim patterns
# and exits non-zero if any are found outside the allow-list.
#
# Usage: ./scripts/audit-truth-check.sh [--paths path1 path2 ...]
# If no paths given, scans the whole working tree (excluding allow-list).

set -uo pipefail

ALLOWLIST="$(dirname "$0")/audit-truth-check-allowlist.txt"
PATTERNS=(
  "production-ready"
  "Production-Ready"
  "100% Functional"
  "100% functional"
  "Stable & Production"
  "stable v1.0"
  "Stable v1.0"
  "Top 0\\.1%"
  "95% production"
  "All goals completed"
  "All targets met"
)

# Build the exclude args from the allow-list.
EXCLUDES=()
while IFS= read -r line; do
  # Skip blank / comment lines.
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  EXCLUDES+=("--glob=!$line*")
done < "$ALLOWLIST"

# Default scan path: whole repo. Override with --paths.
SCAN_PATHS=(".")
if [[ "${1:-}" == "--paths" ]]; then
  shift
  SCAN_PATHS=("$@")
fi

found_any=0

for pattern in "${PATTERNS[@]}"; do
  matches=$(rg --line-number --color=never "${EXCLUDES[@]}" -- "$pattern" "${SCAN_PATHS[@]}" 2>/dev/null || true)
  if [[ -n "$matches" ]]; then
    found_any=1
    echo "PATTERN: $pattern"
    echo "$matches"
    echo
  fi
done

if [[ "$found_any" -eq 1 ]]; then
  echo "audit-truth-check: FAILED — overclaim patterns found outside allow-list."
  echo "Fix the matches or extend scripts/audit-truth-check-allowlist.txt with rationale."
  exit 1
fi

echo "audit-truth-check: PASS — no overclaim patterns found outside allow-list."
exit 0
```

- [ ] **Step 3: chmod + Makefile target**

```bash
chmod +x scripts/audit-truth-check.sh
```

Add to `Makefile` (create if absent):

```makefile
.PHONY: audit-truth-check

audit-truth-check:
	@./scripts/audit-truth-check.sh
```

- [ ] **Step 4: Run it as a smoke test**

```bash
make audit-truth-check || true
```

Expected outcome depends on Tasks 2/3 progress:
- If Tasks 2/3 already shipped: PASS (no overclaim patterns in non-allowlisted files).
- If Tasks 2/3 not yet shipped: FAILED with hits in `docs/project-status.md` + `docs/roadmap.md`. This is correct behavior — the gate caught them.

Document the expected pre-/post-Phase-2b state in the script header comment.

- [ ] **Step 5: Add a CI-friendly invocation note**

In `docs/plans/finding-tracking-convention.md` (created in Phase 2a), add a paragraph:

```markdown
## Recurring truth-check

Run `make audit-truth-check` before closing any sub-phase. Wire into CI in
Phase 2c or 2d. Pattern list lives in `scripts/audit-truth-check.sh`;
allow-list at `scripts/audit-truth-check-allowlist.txt`.
```

- [ ] **Step 6: Commit**

```bash
git add scripts/audit-truth-check.sh scripts/audit-truth-check-allowlist.txt Makefile docs/plans/finding-tracking-convention.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2b Task 6): add make audit-truth-check gate

Scans the working tree for known overclaim patterns ("production-ready",
"100% Functional", "Top 0.1%", "stable v1.0", etc.) and exits non-zero
if any are found outside the allow-list. Allow-list explicitly permits
audit reports + historical changelog (where the overclaim language is
PART of the history being documented).

Wires recurring truth-check into the finding-tracking convention.
CI integration deferred to Phase 2c/2d.

closes: audit-truth-check-tool (informal id)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Notification module real unit tests (Phase 2a fix surfaces)

Phase 2a verified-by-inspection the 3 notification fixes (notifications-001/2/3). Closure report follow-up #1 said real tests come in 2b. This task adds them.

**Files:**
- Create: `tests/core/notifications/notification-service-truthful-audit.test.ts`
- Create: `tests/core/notifications/notification-service-gates.test.ts`
- Create: `tests/core/notifications/notification-service-pii.test.ts`

- [ ] **Step 1: Read the existing notification-service.ts to confirm interface**

```bash
sed -n '100,200p' core/src/notifications/notification-service.ts
```

Confirm method signatures + the public surface to test. Note the dependencies (`validateRequest`, `checkRateLimit`, audit log writer path).

- [ ] **Step 2: Write the truthful-audit test (closes notifications-001 verification gap)**

`tests/core/notifications/notification-service-truthful-audit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '../../../core/src/notifications/notification-service.js';

describe('NotificationService — truthful audit log (notifications-001)', () => {
  let service: NotificationService;
  let mockChannel: { send: ReturnType<typeof vi.fn> };
  let auditWrites: any[];

  beforeEach(() => {
    auditWrites = [];
    mockChannel = { send: vi.fn() };
    service = new NotificationService({
      channels: { email: mockChannel as any },
      auditLog: { write: async (entry) => { auditWrites.push(entry); } },
    } as any);
  });

  it('records success: true only when channel reports success', async () => {
    mockChannel.send.mockResolvedValue({ ok: true });
    await service.notify({ template: 'test', to: 'a@b.c', channels: ['email'] });
    expect(auditWrites).toHaveLength(1);
    expect(auditWrites[0].success).toBe(true);
    expect(auditWrites[0].sentChannels).toEqual(['email']);
    expect(auditWrites[0].failedChannels).toEqual([]);
  });

  it('records success: false when channel reports failure', async () => {
    mockChannel.send.mockResolvedValue({ ok: false, error: 'SMTP timeout' });
    await service.notify({ template: 'test', to: 'a@b.c', channels: ['email'] });
    expect(auditWrites[0].success).toBe(false);
    expect(auditWrites[0].failedChannels).toEqual(['email']);
    expect(auditWrites[0].errors?.email).toBe('SMTP timeout');
  });

  it('records partial: true when some channels succeed and some fail', async () => {
    const smsChannel = { send: vi.fn().mockResolvedValue({ ok: false, error: 'no provider' }) };
    service = new NotificationService({
      channels: { email: mockChannel as any, sms: smsChannel as any },
      auditLog: { write: async (e) => auditWrites.push(e) },
    } as any);
    mockChannel.send.mockResolvedValue({ ok: true });
    await service.notify({ template: 't', to: 'x', channels: ['email', 'sms'] });
    expect(auditWrites[0].partial).toBe(true);
    expect(auditWrites[0].sentChannels).toEqual(['email']);
    expect(auditWrites[0].failedChannels).toEqual(['sms']);
  });

  it('records template name in every entry', async () => {
    mockChannel.send.mockResolvedValue({ ok: true });
    await service.notify({ template: 'welcome', to: 'x', channels: ['email'] });
    expect(auditWrites[0].template).toBe('welcome');
  });

  it('never hardcodes success: true regardless of channel outcome', async () => {
    // Regression pin for the audit finding's original symptom: 5,156 entries
    // with success: true / failedChannels: []. After fix, this must be possible
    // to falsify.
    mockChannel.send.mockResolvedValue({ ok: false, error: 'boom' });
    await service.notify({ template: 't', to: 'x', channels: ['email'] });
    expect(auditWrites[0].success).not.toBe(true);
  });
});
```

- [ ] **Step 3: Run the test — expect failure if interface drifted**

```bash
pnpm vitest run tests/core/notifications/notification-service-truthful-audit.test.ts
```

If imports fail / methods mismatch: read the actual `notification-service.ts` and adjust test imports to match. The test logic stays the same; only the constructor + method shape may need realignment.

- [ ] **Step 4: Make tests pass**

If a real bug surfaces in the truthful-audit path that Phase 2a missed, fix it in `notification-service.ts`. Otherwise, only test-import alignment is needed.

Re-run: all 5 cases green.

- [ ] **Step 5: Write the gates test (closes notifications-002 verification gap)**

`tests/core/notifications/notification-service-gates.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '../../../core/src/notifications/notification-service.js';

describe('NotificationService — validate + rate-limit gates (notifications-002)', () => {
  let service: NotificationService;
  let mockChannel: { send: ReturnType<typeof vi.fn> };
  let auditWrites: any[];

  beforeEach(() => {
    auditWrites = [];
    mockChannel = { send: vi.fn() };
  });

  it('rejects a notification when validateRequest returns invalid', async () => {
    service = new NotificationService({
      channels: { email: mockChannel as any },
      validateRequest: () => ({ valid: false, reason: 'missing-template' }),
      auditLog: { write: async (e) => auditWrites.push(e) },
    } as any);

    await service.notify({ template: '', to: 'x', channels: ['email'] });
    expect(mockChannel.send).not.toHaveBeenCalled();
    expect(auditWrites[0].kind).toBe('notification_rejected');
    expect(auditWrites[0].reason).toBe('missing-template');
  });

  it('rejects when checkRateLimit returns over-limit', async () => {
    service = new NotificationService({
      channels: { email: mockChannel as any },
      checkRateLimit: () => ({ allowed: false, resetAt: 1234567890 }),
      auditLog: { write: async (e) => auditWrites.push(e) },
    } as any);

    await service.notify({ template: 't', to: 'x', channels: ['email'] });
    expect(mockChannel.send).not.toHaveBeenCalled();
    expect(auditWrites[0].kind).toBe('notification_rejected');
    expect(auditWrites[0].reason).toBe('rate-limited');
    expect(auditWrites[0].resetAt).toBe(1234567890);
  });

  it('passes through when both gates allow', async () => {
    service = new NotificationService({
      channels: { email: mockChannel as any },
      validateRequest: () => ({ valid: true }),
      checkRateLimit: () => ({ allowed: true }),
      auditLog: { write: async (e) => auditWrites.push(e) },
    } as any);
    mockChannel.send.mockResolvedValue({ ok: true });

    await service.notify({ template: 't', to: 'x', channels: ['email'] });
    expect(mockChannel.send).toHaveBeenCalledOnce();
    expect(auditWrites[0].kind).not.toBe('notification_rejected');
  });
});
```

- [ ] **Step 6: Write the PII test (closes notifications-003 verification gap)**

`tests/core/notifications/notification-service-pii.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { NotificationService } from '../../../core/src/notifications/notification-service.js';

describe('NotificationService — PII sanitization path (notifications-003)', () => {
  it('renders email-as-template-variable as the actual email in the message body', async () => {
    const sent: any[] = [];
    const channel = { send: vi.fn(async (msg) => { sent.push(msg); return { ok: true }; }) };
    const service = new NotificationService({
      channels: { email: channel as any },
      auditLog: { write: async () => {} },
    } as any);

    await service.notify({
      template: 'welcome',
      to: 'recipient@example.com',
      channels: ['email'],
      vars: { userEmail: 'subject@example.com' },
    });

    // Body should contain the ACTUAL email (not [REDACTED]) because the
    // template variable is the legitimate content of the notification.
    expect(sent[0].body).toContain('subject@example.com');
    expect(sent[0].body).not.toContain('[REDACTED]');
  });

  it('still redacts PII from the audit log entry', async () => {
    const audit: any[] = [];
    const channel = { send: vi.fn().mockResolvedValue({ ok: true }) };
    const service = new NotificationService({
      channels: { email: channel as any },
      auditLog: { write: async (e) => audit.push(e) },
    } as any);

    await service.notify({
      template: 'welcome',
      to: 'recipient@example.com',
      channels: ['email'],
      vars: { userEmail: 'subject@example.com' },
    });

    // Audit log entry should still scrub recipient PII per the original
    // redaction policy. (Variables in `vars` may flow through depending
    // on field — confirm with the actual policy when running this test.)
    const recipientField = JSON.stringify(audit[0]);
    expect(recipientField).not.toContain('recipient@example.com');
  });
});
```

- [ ] **Step 7: Run all 3 test files green**

```bash
pnpm vitest run tests/core/notifications/
```

All 10+ cases pass. If any fail, investigate — a real bug in Phase 2a's verified-by-inspection work, or test misalignment.

- [ ] **Step 8: Commit**

```bash
git add tests/core/notifications/ docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2b Task 7): real Vitest unit tests for Phase 2a notification fixes

Adds 3 test files pinning the truthful-audit, gate-enforcement, and
PII-correctness behavior from Phase 2a Tasks 6-8. Closes the closure-
report follow-up #1 (real tests for the verified-by-inspection fixes).

Files:
- tests/core/notifications/notification-service-truthful-audit.test.ts (5 cases)
- tests/core/notifications/notification-service-gates.test.ts (3 cases)
- tests/core/notifications/notification-service-pii.test.ts (2 cases)

closes: notifications-tests-2a-followup (informal id)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: UI component tests — Tier 1 (civic-critical forms)

The audit found 0 component coverage for ~25 UI components. Tier 1 covers the 3 civic-critical forms: `RecordForm`, `GeographyForm`, `UserForm`. These are where citizens write the truth into the system.

**Files:**
- Create: `tests/ui/components/RecordForm.test.ts`
- Create: `tests/ui/components/GeographyForm.test.ts`
- Create: `tests/ui/components/UserForm.test.ts`

(All under the existing `tests/ui/` tree that `vitest.config.ui.mjs` already picks up.)

- [ ] **Step 1: Read RecordForm.vue to understand props + events**

```bash
sed -n '1,80p' modules/ui/app/components/RecordForm.vue
```

Note: props names, event names, validation surface, submit behavior. Mocked stores or composables used.

- [ ] **Step 2: Write RecordForm.test.ts**

`tests/ui/components/RecordForm.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import RecordForm from '~/components/RecordForm.vue';

describe('RecordForm', () => {
  it('mounts with required props', () => {
    const wrapper = mount(RecordForm, {
      props: { record: { title: '', body: '', type: 'bylaw' } },
    });
    expect(wrapper.exists()).toBe(true);
    expect(wrapper.find('[data-test="record-title"]').exists()).toBe(true);
  });

  it('emits submit with sanitized values on form submission', async () => {
    const wrapper = mount(RecordForm, {
      props: { record: { title: 'Test bylaw', body: '# Body', type: 'bylaw' } },
    });
    await wrapper.find('form').trigger('submit.prevent');
    expect(wrapper.emitted('submit')).toBeTruthy();
    const payload = wrapper.emitted('submit')![0][0] as any;
    expect(payload.title).toBe('Test bylaw');
    expect(payload.body).toContain('# Body');
  });

  it('shows validation error when title is empty', async () => {
    const wrapper = mount(RecordForm, {
      props: { record: { title: '', body: 'x', type: 'bylaw' } },
    });
    await wrapper.find('form').trigger('submit.prevent');
    expect(wrapper.text()).toMatch(/title.*required/i);
  });

  it('disables submit button while saving prop is true', () => {
    const wrapper = mount(RecordForm, {
      props: { record: { title: 'x', body: 'y', type: 'bylaw' }, saving: true },
    });
    expect((wrapper.find('button[type="submit"]').attributes('disabled'))).toBeDefined();
  });

  it('emits cancel when cancel button is clicked', async () => {
    const wrapper = mount(RecordForm, {
      props: { record: { title: 'x', body: 'y', type: 'bylaw' } },
    });
    await wrapper.find('[data-test="cancel"]').trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run and adjust to match actual component**

```bash
pnpm vitest run tests/ui/components/RecordForm.test.ts --config vitest.config.ui.mjs
```

If selectors don't match: read the component, adjust `[data-test=...]` to whatever the component actually has. **If the component lacks `data-test` hooks: add them.** Per `tests/ui/setup.ts` patterns, prefer `data-test` attributes over class/role selectors for test stability.

- [ ] **Step 4: Repeat the pattern for GeographyForm**

`tests/ui/components/GeographyForm.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import GeographyForm from '~/components/GeographyForm.vue';

describe('GeographyForm', () => {
  it('mounts with optional initial value', () => {
    const wrapper = mount(GeographyForm, { props: { modelValue: null } });
    expect(wrapper.exists()).toBe(true);
  });

  it('emits update:modelValue when coordinates are entered', async () => {
    const wrapper = mount(GeographyForm, { props: { modelValue: null } });
    await wrapper.find('[data-test="lat-input"]').setValue('46.81');
    await wrapper.find('[data-test="lon-input"]').setValue('-71.22');
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
  });

  it('validates lat/lon ranges (rejects out-of-range)', async () => {
    const wrapper = mount(GeographyForm, { props: { modelValue: null } });
    await wrapper.find('[data-test="lat-input"]').setValue('999');
    await wrapper.find('form').trigger('submit.prevent');
    expect(wrapper.text()).toMatch(/lat.*invalid|range/i);
  });

  it('supports clear / reset', async () => {
    const wrapper = mount(GeographyForm, { props: { modelValue: { lat: 46, lon: -71 } } });
    await wrapper.find('[data-test="clear"]').trigger('click');
    const latest = wrapper.emitted('update:modelValue')!.at(-1)![0];
    expect(latest).toBeNull();
  });
});
```

- [ ] **Step 5: Run + adjust GeographyForm**

```bash
pnpm vitest run tests/ui/components/GeographyForm.test.ts --config vitest.config.ui.mjs
```

Same drill: align selectors, add `data-test` to component if missing.

- [ ] **Step 6: Repeat for UserForm**

`tests/ui/components/UserForm.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UserForm from '~/components/UserForm.vue';

describe('UserForm', () => {
  it('mounts with empty user prop (creation mode)', () => {
    const wrapper = mount(UserForm, { props: { user: null } });
    expect(wrapper.find('[data-test="user-email"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="user-role"]').exists()).toBe(true);
  });

  it('mounts with existing user (edit mode)', () => {
    const wrapper = mount(UserForm, {
      props: { user: { id: '1', email: 'a@b.c', role: 'clerk' } },
    });
    expect((wrapper.find('[data-test="user-email"]').element as HTMLInputElement).value).toBe('a@b.c');
  });

  it('emits submit with form values', async () => {
    const wrapper = mount(UserForm, { props: { user: null } });
    await wrapper.find('[data-test="user-email"]').setValue('new@example.com');
    await wrapper.find('[data-test="user-role"]').setValue('admin');
    await wrapper.find('form').trigger('submit.prevent');
    const emitted = wrapper.emitted('submit')![0][0] as any;
    expect(emitted.email).toBe('new@example.com');
    expect(emitted.role).toBe('admin');
  });

  it('shows validation error for invalid email', async () => {
    const wrapper = mount(UserForm, { props: { user: null } });
    await wrapper.find('[data-test="user-email"]').setValue('not-an-email');
    await wrapper.find('form').trigger('submit.prevent');
    expect(wrapper.text()).toMatch(/email.*invalid/i);
  });
});
```

- [ ] **Step 7: Run all 3 + verify 15+ cases green**

```bash
pnpm test:ui:run -- tests/ui/components/
```

- [ ] **Step 8: Update findings registry**

`ui-005-tier1` informal id: closed-with-commit. Mark progress on `ui-005` itself (still `triaged-phase-2b` since Tier 2 also lands in 2b).

- [ ] **Step 9: Commit**

```bash
git add tests/ui/components/ modules/ui/app/components/ docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2b Task 8): UI component tests Tier 1 — civic-critical forms

Adds first real component tests for RecordForm, GeographyForm, UserForm.
~15 cases pinning render, validation, emit, edit-vs-create paths.
Adds data-test hooks to components where missing (test-stability pattern).

These are the forms where citizens write truth into the system; coverage
here is the minimum civic-correctness bar.

closes: ui-005-tier1 (informal id; ui-005 itself remains triaged through Tier 2)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: UI component tests — Tier 2 (record viewing)

Tier 2 covers the components citizens use to *read* civic records: `RecordList`, `RecordSearch`, `RecordPreview`, `StatusTransitionControls`. Same pattern as Task 8; skipping the full code blocks here would violate the writing-plans skill, so the full skeletons are shown below.

**Files:**
- Create: `tests/ui/components/RecordList.test.ts`
- Create: `tests/ui/components/RecordSearch.test.ts`
- Create: `tests/ui/components/RecordPreview.test.ts`
- Create: `tests/ui/components/StatusTransitionControls.test.ts`

- [ ] **Step 1: RecordList.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RecordList from '~/components/RecordList.vue';

const stubRecord = (overrides = {}) => ({
  id: 'r1', title: 'Test record', type: 'bylaw', status: 'published', ...overrides,
});

describe('RecordList', () => {
  it('renders empty state with no records', () => {
    const wrapper = mount(RecordList, { props: { records: [] } });
    expect(wrapper.text()).toMatch(/no records|empty/i);
  });

  it('renders one row per record', () => {
    const wrapper = mount(RecordList, {
      props: { records: [stubRecord({ id: 'a' }), stubRecord({ id: 'b' })] },
    });
    expect(wrapper.findAll('[data-test="record-row"]')).toHaveLength(2);
  });

  it('emits select when a row is clicked', async () => {
    const wrapper = mount(RecordList, { props: { records: [stubRecord()] } });
    await wrapper.find('[data-test="record-row"]').trigger('click');
    expect(wrapper.emitted('select')).toBeTruthy();
  });

  it('shows hasUnpublishedChanges indicator when set', () => {
    const wrapper = mount(RecordList, {
      props: { records: [stubRecord({ hasUnpublishedChanges: true })] },
    });
    expect(wrapper.find('[data-test="unpublished-indicator"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: RecordSearch.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import RecordSearch from '~/components/RecordSearch.vue';

describe('RecordSearch', () => {
  it('emits search on debounced input', async () => {
    const wrapper = mount(RecordSearch);
    await wrapper.find('input[type="search"]').setValue('bylaw 2023');
    vi.useFakeTimers();
    vi.advanceTimersByTime(500);
    await flushPromises();
    vi.useRealTimers();
    expect(wrapper.emitted('search')?.[0]?.[0]).toBe('bylaw 2023');
  });

  it('clears search on clear button', async () => {
    const wrapper = mount(RecordSearch, { props: { modelValue: 'bylaw' } });
    await wrapper.find('[data-test="clear-search"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe('');
  });
});
```

- [ ] **Step 3: RecordPreview.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RecordPreview from '~/components/RecordPreview.vue';

describe('RecordPreview', () => {
  it('renders markdown body as sanitized HTML (Phase 2a XSS pin)', () => {
    const wrapper = mount(RecordPreview, {
      props: { record: { title: 't', body: '# Hi\n<script>alert(1)</script>' } },
    });
    expect(wrapper.html()).toContain('<h1>');
    // Phase 2a Task 4 DOMPurify pin: <script> must NOT survive to the DOM.
    expect(wrapper.html()).not.toContain('<script>');
  });

  it('shows title prominently', () => {
    const wrapper = mount(RecordPreview, { props: { record: { title: 'Important', body: '' } } });
    expect(wrapper.find('[data-test="record-title"]').text()).toBe('Important');
  });

  it('falls back gracefully when record is null', () => {
    const wrapper = mount(RecordPreview, { props: { record: null } });
    expect(wrapper.text()).toMatch(/no record|empty/i);
  });
});
```

- [ ] **Step 4: StatusTransitionControls.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StatusTransitionControls from '~/components/StatusTransitionControls.vue';

describe('StatusTransitionControls', () => {
  it('shows publish button when record is draft and user has permission', () => {
    const wrapper = mount(StatusTransitionControls, {
      props: { record: { status: 'draft' }, canPublish: true },
    });
    expect(wrapper.find('[data-test="publish"]').exists()).toBe(true);
  });

  it('hides publish button without permission', () => {
    const wrapper = mount(StatusTransitionControls, {
      props: { record: { status: 'draft' }, canPublish: false },
    });
    expect(wrapper.find('[data-test="publish"]').exists()).toBe(false);
  });

  it('emits transition with target status when publish clicked', async () => {
    const wrapper = mount(StatusTransitionControls, {
      props: { record: { status: 'draft' }, canPublish: true },
    });
    await wrapper.find('[data-test="publish"]').trigger('click');
    expect(wrapper.emitted('transition')?.[0]?.[0]).toBe('published');
  });
});
```

- [ ] **Step 5: Run + adjust selectors**

```bash
pnpm test:ui:run -- tests/ui/components/
```

Adjust `[data-test=...]` selectors to match each component's actual structure. Add hooks where missing.

- [ ] **Step 6: Commit**

```bash
git add tests/ui/components/ modules/ui/app/components/ docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2b Task 9): UI component tests Tier 2 — record viewing

Adds RecordList, RecordSearch, RecordPreview, StatusTransitionControls
tests (~13 cases). RecordPreview pins the Phase 2a Task 4 DOMPurify
XSS-safety behavior at the component level (complement to the
useMarkdown composable test).

ui-005 fully closed for Phase 2b scope (Tier 1+2). Full 25+ component
coverage rolls into Phase 2d structural hardening per master plan §5
(and per the Phase 2b plan's deferred section).

closes: ui-005

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: CLI tests — Tier 1 (civic-critical commands)

CLI Tier 1 = the commands that move records through their lifecycle: `init`, `create`, `list`, `publish`, `validate`. Each gets ~3-5 cases. First task in CLI test work, so it includes the test infrastructure decision.

**Files:**
- Create: `cli/src/commands/__tests__/init.test.ts`
- Create: `cli/src/commands/__tests__/create.test.ts`
- Create: `cli/src/commands/__tests__/list.test.ts`
- Create: `cli/src/commands/__tests__/publish.test.ts`
- Create: `cli/src/commands/__tests__/validate.test.ts`

- [ ] **Step 1: Decide test infrastructure — in-process or child-process?**

Read `cli/src/commands/__tests__/diagnose.test.ts` to see the existing pattern.

```bash
cat cli/src/commands/__tests__/diagnose.test.ts | head -40
```

If `diagnose.test.ts` imports + calls the command function directly (in-process): use the same pattern. If it spawns a child process: same.

**Default (in absence of strong existing pattern): in-process import + call.** Faster, easier to assert on side effects. Child-process tests get added in Phase 2d if the CLI grows a real interactive shell story.

- [ ] **Step 2: Write init.test.ts**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { mkdtemp, rm, readFile, access } from 'fs/promises';
import { join } from 'path';
import { initCommand } from '../init.js';

describe('CLI: init', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'civic-init-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates the civic data root in an empty directory', async () => {
    await initCommand({ cwd: dir, name: 'test-municipality' });
    await access(join(dir, '.civicrc'));
    await access(join(dir, 'records'));
  });

  it('refuses to init over an existing .civicrc without --force', async () => {
    await initCommand({ cwd: dir, name: 'a' });
    await expect(initCommand({ cwd: dir, name: 'b' })).rejects.toThrow(/already initialized/i);
  });

  it('honors --force to overwrite', async () => {
    await initCommand({ cwd: dir, name: 'a' });
    await initCommand({ cwd: dir, name: 'b', force: true });
    const cfg = await readFile(join(dir, '.civicrc'), 'utf8');
    expect(cfg).toContain('b');
  });
});
```

- [ ] **Step 3: Write create.test.ts**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { mkdtemp, rm, readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { initCommand } from '../init.js';
import { createCommand } from '../create.js';

describe('CLI: create', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'civic-create-'));
    await initCommand({ cwd: dir, name: 'test' });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates a record file under records/<type>/', async () => {
    await createCommand({ cwd: dir, type: 'bylaw', title: 'No noise after 10pm' });
    const files = await readdir(join(dir, 'records', 'bylaw'));
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/no-noise-after-10pm\.md$/);
  });

  it('writes the title into the markdown frontmatter', async () => {
    await createCommand({ cwd: dir, type: 'bylaw', title: 'Bylaw 2023-01' });
    const files = await readdir(join(dir, 'records', 'bylaw'));
    const content = await readFile(join(dir, 'records', 'bylaw', files[0]), 'utf8');
    expect(content).toContain('title: Bylaw 2023-01');
  });

  it('rejects unknown record types', async () => {
    await expect(createCommand({ cwd: dir, type: 'not-a-type', title: 'x' })).rejects.toThrow(/unknown.*type/i);
  });
});
```

- [ ] **Step 4: Write list.test.ts**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { initCommand } from '../init.js';
import { createCommand } from '../create.js';
import { listCommand } from '../list.js';

describe('CLI: list', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'civic-list-'));
    await initCommand({ cwd: dir, name: 'test' });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns empty when no records exist', async () => {
    const result = await listCommand({ cwd: dir });
    expect(result.records).toEqual([]);
  });

  it('returns created records', async () => {
    await createCommand({ cwd: dir, type: 'bylaw', title: 'A' });
    await createCommand({ cwd: dir, type: 'bylaw', title: 'B' });
    const result = await listCommand({ cwd: dir });
    expect(result.records.length).toBe(2);
  });

  it('filters by type', async () => {
    await createCommand({ cwd: dir, type: 'bylaw', title: 'A' });
    await createCommand({ cwd: dir, type: 'meeting', title: 'M' });
    const result = await listCommand({ cwd: dir, type: 'bylaw' });
    expect(result.records.length).toBe(1);
    expect(result.records[0].type).toBe('bylaw');
  });
});
```

- [ ] **Step 5: Write publish.test.ts**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { initCommand } from '../init.js';
import { createCommand } from '../create.js';
import { publishCommand } from '../publish.js';

describe('CLI: publish', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'civic-publish-'));
    await initCommand({ cwd: dir, name: 'test' });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('transitions a draft record to published status', async () => {
    const rec = await createCommand({ cwd: dir, type: 'bylaw', title: 'A' });
    await publishCommand({ cwd: dir, id: rec.id });
    const content = await readFile(rec.path, 'utf8');
    expect(content).toContain('status: published');
  });

  it('refuses to publish an unknown record', async () => {
    await expect(publishCommand({ cwd: dir, id: 'no-such-id' })).rejects.toThrow(/not found/i);
  });

  it('is idempotent on already-published records', async () => {
    const rec = await createCommand({ cwd: dir, type: 'bylaw', title: 'A' });
    await publishCommand({ cwd: dir, id: rec.id });
    await publishCommand({ cwd: dir, id: rec.id });
    const content = await readFile(rec.path, 'utf8');
    expect(content.match(/status: published/g)?.length).toBe(1);
  });
});
```

- [ ] **Step 6: Write validate.test.ts**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { initCommand } from '../init.js';
import { validateCommand } from '../validate.js';

describe('CLI: validate', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'civic-validate-'));
    await initCommand({ cwd: dir, name: 'test' });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reports no errors for an empty civic root', async () => {
    const result = await validateCommand({ cwd: dir });
    expect(result.errors).toEqual([]);
  });

  it('reports a record missing required frontmatter as an error', async () => {
    await mkdir(join(dir, 'records', 'bylaw'), { recursive: true });
    await writeFile(join(dir, 'records', 'bylaw', 'broken.md'), '# No frontmatter\n');
    const result = await validateCommand({ cwd: dir });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.errors)).toMatch(/frontmatter|missing/i);
  });
});
```

- [ ] **Step 7: Run + adjust to actual command exports**

```bash
pnpm vitest run cli/src/commands/__tests__/
```

The test imports assume named exports like `initCommand`, `createCommand`. If the actual exports differ (default export of a Commander program, factory function, etc.), adjust imports + invocation patterns. The behavioral assertions stay the same.

- [ ] **Step 8: Commit**

```bash
git add cli/src/commands/__tests__/ docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2b Task 10): CLI tests Tier 1 — civic-critical commands

Adds real Vitest tests for init, create, list, publish, validate.
~15 cases pinning the lifecycle path that moves records through the
system (init → create → list → publish → validate).

Replaces project-status.md's now-corrected "120+ CLI tests" claim
(reality post-2b Tier-1: 1 + 5 = 6 test files, ~28 cases).

closes: cli-001-tier1 (informal id; cli-001 itself remains triaged through Tier 2)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: CLI tests — Tier 2 (operational + auth commands)

CLI Tier 2 = operational commands: `history`, `search`, `status`, `users`, `login`. Same pattern. Less critical than Tier 1 (these are read-mostly) but close out `cli-001` for Phase 2b scope.

**Files:**
- Create: `cli/src/commands/__tests__/history.test.ts`
- Create: `cli/src/commands/__tests__/search.test.ts`
- Create: `cli/src/commands/__tests__/status.test.ts`
- Create: `cli/src/commands/__tests__/users.test.ts`
- Create: `cli/src/commands/__tests__/login.test.ts`

- [ ] **Step 1-5: write each test file**

Follow the Tier-1 pattern: in-process import, fixture init in `beforeEach`, 3-5 cases per command covering the happy path + 1-2 failure modes.

(Test code for each command is structurally similar to Task 10; verbatim listings omitted here to keep the plan readable. Use Task 10 step-2 as the exemplar pattern for write-path commands and step-4 as the exemplar for read-path commands.)

Notable per-command guidance:

- **history.test.ts** — uses git under the hood; mock `simple-git` or use a real temp git repo via `initCommand`.
- **search.test.ts** — exercises the indexer; smoke test that creates 3 records and searches for one of them.
- **status.test.ts** — reports record counts by status (draft/published/archived); test on a fixture with 1 of each.
- **users.test.ts** — user CRUD; uses the in-memory or sqlite backend depending on config.
- **login.test.ts** — auth flow; test wrong-password rejection + correct-password success. **No real password hashing** in test — mock the hasher.

- [ ] **Step 6: Run all CLI tests**

```bash
pnpm vitest run cli/src/commands/__tests__/
```

All 30+ cases green.

- [ ] **Step 7: Commit**

```bash
git add cli/src/commands/__tests__/ docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2b Task 11): CLI tests Tier 2 — operational + auth commands

Adds real tests for history, search, status, users, login (~15 cases).
Combined with Tier 1, CLI now has 6 test files / ~28 cases (was 1/13
before Phase 2b). Aligns with the corrected project-status.md CLI
testing claim.

cli-001 closed for Phase 2b scope. Full 28-command coverage rolls
into Phase 2d.

closes: cli-001

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Phase 2b closure

Final task. Verify, write closure report, run audit-truth-check, register-update, commit. Then we're ready for the user to merge `dev` → `main` and push (per their branch strategy decision).

**Files:**
- Modify: `docs/audits/2026-05-16-manifesto-fit-findings.md` (final status verification)
- Create: `docs/audits/phase-2b-closure-report.md`

- [ ] **Step 1: Verify all 2b-targeted findings are closed**

```bash
grep -E "(legal-register-001|legal-register-006|notifications-007|site-001|site-003|BB-HW-008|ui-005|cli-001|spec-stability-sweep|project-status-truth|roadmap-truth|audit-truth-check-tool|notifications-tests-2a-followup)" docs/audits/2026-05-16-manifesto-fit-findings.md | grep -v "closed-with-commit\|closed-no-commit\|wontfix\|superseded"
```

Expected: no lines.

- [ ] **Step 2: Verify deferred + superseded findings are marked**

```bash
grep -E "(broadcast-box-004|site-002|manifesto-3.5)" docs/audits/2026-05-16-manifesto-fit-findings.md
```

Expected: `broadcast-box-004` → `superseded-by-deletion`; `site-002` → `wontfix-by-phase-strategy`; `manifesto-3.5` → `wontfix-pending-phase-5`.

- [ ] **Step 3: Run audit-truth-check — must pass**

```bash
make audit-truth-check
```

Expected: `audit-truth-check: PASS`. If any overclaim pattern fires, fix the offending file (likely a missed line in Task 2 or 3) and re-run.

- [ ] **Step 4: Run full test suite**

```bash
pnpm test
pnpm test:ui:run
```

Expected: same baseline as Phase 2a + the new tests passing. (Pre-existing flake at `database-integration session-mgmt` may still fail; if so, confirm it's only that one and move on per master plan §9.1.)

- [ ] **Step 5: Write closure report**

`docs/audits/phase-2b-closure-report.md` — same structure as Phase 2a closure report:

- Summary
- Numbers (specs: stable count before/after; UI tests: 2 → ~9 files / 40 → ~70+ cases; CLI tests: 1 → 11 files / 13 → ~45 cases; truth-check pass; overclaim patterns: counted-before / 0-after)
- Commits on `dev` (list of refactor(2b Task N) commits)
- Findings closed
- Findings deferred / superseded
- What got measurably truer
- What's deferred and why
- Recommendations for Phase 2c

- [ ] **Step 6: Final commit**

```bash
git add docs/audits/phase-2b-closure-report.md docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2b): Phase 2b complete — Truth Restoration closure

Closed in this phase:
- legal-register-001, legal-register-006 (spec rewrite to planned)
- notifications-007 (spec rewrite to partial)
- site-001, site-003 (site repo copy fixes; site-002 wontfix-by-phase)
- BB-HW-008 (hardware repo engineering-analysis honest revision)
- ui-005 (Tier 1+2 real component tests; full coverage rolls to 2d)
- cli-001 (Tier 1+2 real command tests; full coverage rolls to 2d)
- spec-stability-sweep, project-status-truth, roadmap-truth (informal)
- audit-truth-check-tool (gate now passes; recurring per finding-tracking convention)
- notifications-tests-2a-followup (real Vitest tests for the 3 Phase-2a fixes)
- broadcast-box-004 (superseded-by-deletion; verified absent)

Manifesto stays untouched (master plan §9.3). Phase 5 reintroduces
broadcast-box; manifesto §3.5 revises then.

Phase 2b ends. Next phase: 2c Foundation Cleanup (delete-or-wire
orphaned subsystems).

Closure report: docs/audits/phase-2b-closure-report.md
Master plan: docs/plans/2026-05-17-base-refactor-master-plan.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Hand off to user**

Phase 2b is done on `dev`. User can:

- Push `dev` to origin: `git push -u origin dev`
- Open PR `dev` → `main` on GitHub
- Or merge locally: `git checkout main && git merge --no-ff dev`

Per master plan §3, each sub-phase ends in a PR. User branch strategy choice (made during Phase 2a closure) was: push `dev` to GitHub and PR via the website.

---

## Appendix A: Self-review

- [x] **Spec coverage.** Master plan §5 Phase 2b scope items: cli-001 (Tasks 10+11), ui-005 (Tasks 8+9), broadcast-box-004 (Task 12 supersedes), legal-register-001/006 (Task 1), notifications-007 (Task 1), site-001/2/3 (Task 4), BB-HW-008 (Task 5), roadmap.md (Task 3), project-status.md (Task 2), manifesto.md (intentionally untouched). Audit-truth-check tool (Task 6). Notification tests follow-up (Task 7). Spec frontmatter sweep (Task 1).
- [x] **Placeholder scan.** Every step shows actual code or actual command. Task 11 explicitly references Task 10 as exemplar for read-path / write-path patterns — acceptable because Task 10 contains the full code; the writing-plans skill warning about "Similar to Task N" applies to commands without exemplars, not to a referenced and shown pattern.
- [x] **Type / API consistency.** Test imports assume the actual function names (`initCommand`, `createCommand`, etc.) — flagged in Task 10 Step 7 + Task 11 Step 1 that adjustments may be needed when implementing. NotificationService constructor shape is the same across all 3 notification test files.
- [x] **Effort sizing.** Tasks roughly: 1 (M), 2 (M), 3 (M), 4 (S), 5 (S), 6 (S), 7 (M), 8 (L), 9 (L), 10 (L), 11 (M), 12 (S). Total ≈ 3-4 weeks at one person per master plan §5 estimate; can compress with parallel agent execution (Tasks 8/9 and 10/11 are highly parallelizable).
- [x] **Deferred findings enumerated.** § 0b "Deferred" subsection lists broadcast-box-004 (superseded), ui-005 completeness (→ 2d), cli-001 completeness (→ 2d), manifesto-3.5 (→ 5).
- [x] **Commit footers.** Every task's commit has a `closes:` footer with finding IDs per the finding-tracking convention.
- [x] **--no-verify** per master plan §9.1.

## Appendix B: Open decisions during execution

1. **Task 1 spec triage matrix** — STABLE-KEEP vs DEMOTE-TO-PARTIAL vs DEMOTE-TO-PLANNED is a judgment call per spec. Default: lean conservative (demote-to-partial when in doubt). User can override during execution; capture decisions in `docs/audits/spec-stability-triage.md`.
2. **Task 5 BB-HW-008** — delete the engineering-analysis.md or rewrite. Default: delete + add `engineering-analysis-pending.md` note. User can override during Task 5 Step 2.
3. **Task 10 Step 1 CLI test infrastructure** — in-process vs child-process. Default: in-process. Switch only if the existing `diagnose.test.ts` already uses child-process and we want consistency.
4. **Task 11 — full 5 commands or subset?** If schedule pressure shows up mid-execution, drop `users` / `login` from Tier 2 and defer to Phase 2d. Document in closure report.
5. **`audit-truth-check` pattern list** — additions during execution (e.g. finding a new "100% complete" variant in some unexpected file). Add to script's `PATTERNS` array and re-run.

## Appendix C: Execution choice

This plan is comprehensive. Two execution modes apply:

- **Subagent-Driven (recommended for Tasks 7-11)** — each test-writing task dispatches a fresh subagent with the relevant code paths preloaded. Review between tasks. Best for parallelizing UI Tier 1+2 and CLI Tier 1+2.
- **Inline Execution (recommended for Tasks 1-6, 12)** — doc/script work and the closure task are short and benefit from staying in this session's context.

Decision to be made at Task 6 → Task 7 handoff (after all doc work is done).
