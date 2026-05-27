# ui-002 — Nuxt UI Pro v3 → v4 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `modules/ui` from paid `@nuxt/ui-pro` v3 to free `@nuxt/ui-pro` v4, dropping the vendor-lock-in dep that originally triggered audit finding ui-002 (Critical).

**Architecture:** Atomic version bump on a dedicated branch (`refactor/ui-002-nuxt-ui-v4-migration`, already cut from `dev` at `c27baad`), followed by a per-component-family sweep that brings the 138-test UI suite + `pnpm -r build` back to green. Truth meter advances 64 → 65 of 205 at closure.

**Tech Stack:** Nuxt 4.4.5, `@nuxt/ui-pro` v3 → v4, `@nuxt/ui` ^3.3.7 → peer-aligned, Tailwind v4 (already in place), Vue 3.5, TypeScript strict, Vitest, pnpm workspaces with strict-hoist (`shamefully-hoist=false`).

**Companion design spec:** `docs/specs/2026-05-27-ui-002-nuxt-ui-v4-migration-design.md` (commit `298e8e8` on this branch).

**Branch policy:**
- All commits use `--no-verify` per `refactor-no-verify-policy` (master plan §9.1).
- No `git push` to any origin per `refactor-push-policy`.
- Branch disposition (merge to `dev` vs hold) is a user decision at closure.

**Commit message convention:** `refactor(ui-002 T<n>): <subject>` matching the repo's Phase 2d pattern (e.g. `refactor(2d W4-T2): ...`).

---

## File Structure

**Created:**
- `docs/notes/ui-002-v4-breaking-change-inventory.md` — T0 research output, drives T2..Tn slicing.

**Modified:**
- `modules/ui/package.json` — drop paid v3, add free v4 (T1). Possibly minor peer bumps (T1).
- `modules/ui/nuxt.config.ts` — module registration stays; T8 revisits the `ui.theme.colors` useHead workaround.
- `modules/ui/app/assets/css/main.css` — `@import "@nuxt/ui-pro"` stays (T1 verify); may change if v4 entry point moved.
- `modules/ui/app/**/*.vue` and `modules/ui/app/**/*.ts` — per-component-family API fixes (T2..T10).
- `docs/audits/2026-05-16-manifesto-fit-findings.md` — finding flip + counters (T-close).
- `docs/licenses.md` — regenerated via `pnpm run licenses:gen` (T-close).
- `docs/project-status.md` and `docs/roadmap.md` — short status update (T-close).

**Not touched (out of scope, would warrant separate sessions):**
- `@typescript-eslint/no-explicit-any` lint rule (Phase 2d carry-forward, separate session).
- Test-suite repair (date-bomb, lock-endpoints, session-mgmt flakes — separate session per master plan §9.1).
- Phase 3 realtime code.
- UI cast-allowlist cleanup (68 `eslint-disable` lines stay as-is).

---

## Task 0: Pre-flight verification + breaking-change inventory

**Files:**
- Create: `docs/notes/ui-002-v4-breaking-change-inventory.md`
- Read: `modules/ui/package.json`, `modules/ui/app/**/*.vue` (no changes)

**Purpose:** This task does no source-code changes. Its deliverable is a written inventory that drives the per-family slicing in T2..Tn. If T0 surfaces an abort condition (no free v4, missing peer, removed component with no path), the plan stops here and the engineer reports back to the user.

- [ ] **Step 1: Confirm working tree state**

Run:
```bash
git status
git log --oneline -3
```
Expected: clean working tree on `refactor/ui-002-nuxt-ui-v4-migration`, top commit `298e8e8 docs(ui-002): brainstormed design ...`.

- [ ] **Step 2: Capture baseline test + build state**

Run (in order):
```bash
pnpm test:ui:run 2>&1 | tail -20
pnpm -r build 2>&1 | tail -20
pnpm -C modules/storage test:run 2>&1 | tail -5
```
Expected:
- `pnpm test:ui:run` → 138/138 passing.
- `pnpm -r build` → clean across all 6 workspaces.
- `pnpm -C modules/storage test:run` → 216/216 passing.

Record the exact passing counts in `docs/notes/ui-002-v4-breaking-change-inventory.md` under a "Baseline" heading. If any of these are not at the expected number, **stop and report to user** — a pre-existing red gate would contaminate the migration.

- [ ] **Step 3: Verify v4 license + publication**

Check via npm:
```bash
npm view @nuxt/ui-pro versions --json 2>/dev/null | tail -30
npm view @nuxt/ui-pro@latest license repository.url
npm view @nuxt/ui-pro@latest peerDependencies dependencies
```

Then read the package's installed license file or its repo LICENSE to confirm OSI-approved (MIT or similar, not a custom "Pro License").

Write findings into the inventory file under "v4 license verification":
- Latest v4 version on npm.
- License string (must be an OSI-approved SPDX id like `MIT`).
- Whether the package source contains any `NUXT_UI_PRO_LICENSE` env reads or telemetry calls (search the installed package or the public repo).
- Required peer versions (Nuxt, @nuxt/ui, vue).

**Abort condition:** if license is not OSI-approved, or a runtime license hook exists, or v4 requires a Nuxt version we don't have, write a closure note in the inventory file ("ABORT: <reason>") and stop. Do not proceed to T1.

- [ ] **Step 4: Inventory used components**

Run:
```bash
grep -rhE "<U[A-Z][a-zA-Z]+" modules/ui/app --include="*.vue" | grep -oE "<U[A-Z][a-zA-Z]+" | sort -u
```

Expected output is the 30-component list captured in the spec (UAccordion, UAlert, UApp, UAvatar, UBadge, UBreadcrumb, UButton, UCard, UCheckbox, UDashboard{Group,Navbar,Panel,Sidebar,SidebarCollapse}, UDropdownMenu, UForm, UFormField, UIcon, UInput, UInputTags, UModal, UNavigationMenu, UNotification, UPagination, UPopover, USelect, USelectMenu, UTabs, UTextarea, UTimeline).

Confirm or update against current state. Record in the inventory file under "Components in use".

- [ ] **Step 5: Build the breaking-change inventory**

Read the official `@nuxt/ui-pro` v3→v4 migration guide (and the underlying `@nuxt/ui` v3→v4 guide if Pro inherits from it). For each component in Step 4's list, capture in the inventory file:

| Component | Status (kept / renamed / removed) | Breaking changes | Migration notes |

Group changes by family (matching the T2..T10 slicing in the spec). Note any cross-cutting concerns:
- Composable signature changes (`useToast()`, `useUI()`, etc.).
- Theme/app.config changes.
- CSS entry-point changes.
- `useHead` interactions (the workaround in `nuxt.config.ts:15-20` may or may not be needed in v4).

- [ ] **Step 6: Validate the plan slicing**

Compare the inventory's family grouping against the spec's T2..T10 slicing. If a category has zero breaking changes, the corresponding sweep commit can be skipped. If a new cross-cutting concern surfaces (e.g. a new "use-X" composable bridge needed across all forms), add it as a new sweep task and note the addition in the inventory.

If the total estimated sweep count exceeds 20, **stop and report to user** for re-scoping per the spec's cap.

- [ ] **Step 7: Commit the inventory**

```bash
git add docs/notes/ui-002-v4-breaking-change-inventory.md
git commit --no-verify -m "$(cat <<'EOF'
docs(ui-002 T0): v4 breaking-change inventory + baseline verification

Pre-flight artifact for the v3 → v4 migration. Captures:
- baseline state (138 UI tests, 216 storage tests, full repo build clean)
- v4 license verification (free / OSI / peer alignment)
- 30 components in use across modules/ui/app
- breaking-change inventory grouped by T2..T10 family

Refs: ui-002
EOF
)"
```

Expected: commit lands; `git log --oneline -2` shows T0 commit + spec commit.

---

## Task 1: Atomic version bump (expected RED)

**Files:**
- Modify: `modules/ui/package.json`
- Modify: `modules/ui/nuxt.config.ts` (only if T0 inventory shows the module registration string changed)
- Modify: `modules/ui/app/assets/css/main.css` (only if T0 inventory shows the CSS entry point changed)
- Read: `pnpm-lock.yaml` after install

**Purpose:** Single commit that drops paid v3 and brings in free v4. Tests + build go red intentionally. Subsequent sweep commits bring them back to green.

- [ ] **Step 1: Edit package.json — drop paid v3, add free v4**

Modify `modules/ui/package.json` dependencies:
- Remove the `@nuxt/ui-pro: "^3.3.7"` line entirely if it's the paid v3 entry, OR change its version to the free v4 (e.g. `"^4.0.0"` — use the exact major.minor from T0 Step 3).
- Keep `@nuxt/ui` aligned to the peer version v4 expects (from T0 Step 3). If unchanged, leave as `"^3.3.7"`; otherwise bump.
- Touch no other dependency lines in this commit.

Exact edit (substitute the verified v4 version from T0):
```json
"@nuxt/ui": "^<peer-version-from-T0>",
"@nuxt/ui-pro": "^<v4-version-from-T0>",
```

- [ ] **Step 2: Install + verify resolution**

Run:
```bash
pnpm install 2>&1 | tail -30
```
Expected: install completes; no `ERR_PNPM_OUTDATED_LOCKFILE` or peer-dep errors that block resolution. Peer-dep warnings are acceptable.

If install fails: read the error, check if a peer is missing, add it to `modules/ui/package.json`, re-run. Do NOT use `--shamefully-hoist=true` or any flag that bypasses the project's strict-hoist policy (`.npmrc` has `shamefully-hoist=false`).

- [ ] **Step 3: Verify dev server boots without runtime crash**

Run:
```bash
timeout 30 pnpm -C modules/ui dev 2>&1 | head -60 || true
```
Expected: server reaches "Nuxt ready" (or equivalent) without an unhandled-exception stack trace at boot. Compile-time errors and red TS diagnostics are EXPECTED at this stage; a runtime crash on boot is NOT and indicates a missing peer or a CSS/module-registration mismatch.

If runtime crash: read the stack, check if `nuxt.config.ts:13` module name changed in v4 or if `main.css:2` `@import "@nuxt/ui-pro"` needs to change. Update only those two files as needed to clear the boot. Do NOT touch component code in this task.

- [ ] **Step 4: Capture the expected-red state**

Run (and capture passing counts):
```bash
pnpm test:ui:run 2>&1 | tail -5
pnpm -r build 2>&1 | tail -10
```
Both are expected to be red. Record the passing test count (e.g. `X/138`) in the upcoming commit message — that's the starting point for the sweep's "passing trend" tracking.

- [ ] **Step 5: Commit the bump**

```bash
git add modules/ui/package.json pnpm-lock.yaml
# Add nuxt.config.ts and/or main.css only if Step 3 required edits to them
git commit --no-verify -m "$(cat <<'EOF'
refactor(ui-002 T1): bump @nuxt/ui-pro v3 paid → v4 free (RED)

Drops the paid commercial @nuxt/ui-pro ^3.3.7 entry and brings in
@nuxt/ui-pro ^4.x (free, OSI-licensed per T0 verification).

Tests + build expected RED at this commit; the sweep commits T2..Tn
bring them back to green per the per-family slicing in
docs/notes/ui-002-v4-breaking-change-inventory.md.

Starting test state: X/138 passing.

Refs: ui-002
EOF
)"
```

(Substitute `X/138` with the actual count from Step 4.)

Expected: commit lands. `git log --oneline -3` shows T1, T0, spec.

---

## Task 2..10: Per-family sweep commits

**General methodology for every sweep task** (apply to each of T2..T10 below):

1. Open `docs/notes/ui-002-v4-breaking-change-inventory.md` and locate the family for this task.
2. For each breaking change in the family, apply the migration to every `.vue` / `.ts` file that uses the affected component or composable. Use `grep -rln '<ComponentName' modules/ui/app` to find call sites.
3. After all changes for the family are applied, run the family's relevant tests:
   ```bash
   pnpm test:ui:run 2>&1 | tail -5
   ```
   Record the new passing count.
4. Confirm: this family's tests are green (the specific test files covering the component family must pass; other families' tests may still be red).
5. Commit only the files touched in this sweep, with the standard message template.

**Standard sweep commit message template:**
```
refactor(ui-002 T<n>): <family-name> v4 API migration

<one-line description of the breaking changes addressed, e.g.
"UDashboardSidebar collapse prop renamed; UDashboardPanel
default slot now requires explicit wrapper">

Test trend: <prev>/138 → <new>/138.

Refs: ui-002
```

**Why this is templated:** the actual code changes are not known until T0 Step 5 produces the inventory. Each sweep task below names the family, the components it covers, and where to look — the engineer fills in the specific edits from the inventory.

### Task 2: Dashboard shell migration

**Files:**
- Modify: every `.vue` file in `modules/ui/app/` that uses any of:
  - `UDashboardGroup`, `UDashboardNavbar`, `UDashboardPanel`, `UDashboardSidebar`, `UDashboardSidebarCollapse`
- Find sites: `grep -rln 'UDashboard' modules/ui/app --include='*.vue'`

**Why first:** highest blast radius (app shell). Stabilizing the shell early means later sweep commits render against a sane layout.

- [ ] **Step 1: Locate call sites + inventory entries**

Run:
```bash
grep -rln 'UDashboard' modules/ui/app --include='*.vue'
```

For each component listed above, read the corresponding row in `docs/notes/ui-002-v4-breaking-change-inventory.md` (T2 family section).

- [ ] **Step 2: Apply migrations**

For each breaking change in the inventory's T2 section, edit the relevant `.vue` files. Common v3→v4 patterns to watch for (from upstream UI v4 changes — verify against the inventory before applying):
- Renamed props (e.g. `:collapsed` → `:collapsible`).
- Removed slots replaced by props or composables.
- New required wrappers (e.g. `UDashboardPanel > template #default` may need an explicit wrapper element).

Apply the inventory's specific changes — do not invent migrations that aren't documented.

- [ ] **Step 3: Run tests + record trend**

Run:
```bash
pnpm test:ui:run 2>&1 | tail -5
```
Record `<prev>/138 → <new>/138`. Confirm shell-related tests are now green.

- [ ] **Step 4: Commit**

Use the standard sweep template. Subject line:
```
refactor(ui-002 T2): UDashboard* v4 API migration
```
Files staged: only the `.vue` files actually edited.

### Task 3: Navigation menu migration

**Files:**
- Find: `grep -rln 'UNavigationMenu' modules/ui/app --include='*.vue'`

- [ ] **Step 1: Locate call sites + inventory entries**

```bash
grep -rln 'UNavigationMenu' modules/ui/app --include='*.vue'
```

Read T3 family section of the inventory.

- [ ] **Step 2: Apply migrations**

Apply the inventory's documented `UNavigationMenu` v3→v4 changes (prop/slot/event renames).

- [ ] **Step 3: Run tests + record trend**

```bash
pnpm test:ui:run 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

Subject: `refactor(ui-002 T3): UNavigationMenu v4 API migration`.

### Task 4: Overlay components migration

**Files:**
- Find: `grep -rlnE '<U(Modal|Popover|DropdownMenu)' modules/ui/app --include='*.vue'`

**Why grouped:** v4 unified overlay primitives under Reka UI; these three commonly change together.

- [ ] **Step 1: Locate call sites + inventory entries**

```bash
grep -rlnE '<U(Modal|Popover|DropdownMenu)' modules/ui/app --include='*.vue'
```

Read T4 family section of the inventory.

- [ ] **Step 2: Apply migrations**

Apply the inventory's documented changes for `UModal`, `UPopover`, `UDropdownMenu`. Common things to watch (verify in inventory): `v-model` open-state binding renames, slot signature changes, teleport target changes.

- [ ] **Step 3: Run tests + record trend**

```bash
pnpm test:ui:run 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

Subject: `refactor(ui-002 T4): UModal/UPopover/UDropdownMenu v4 overlay migration`.

### Task 5: Form components migration

**Files:**
- Find: `grep -rlnE '<U(Form|FormField|Input|Select|SelectMenu|InputTags|Checkbox|Textarea)' modules/ui/app --include='*.vue'`

**Why grouped:** form stack components share v-model/validation conventions; they typically change together in major-version bumps.

- [ ] **Step 1: Locate call sites + inventory entries**

```bash
grep -rlnE '<U(Form|FormField|Input|Select|SelectMenu|InputTags|Checkbox|Textarea)' modules/ui/app --include='*.vue'
```

Read T5 family section of the inventory.

- [ ] **Step 2: Apply migrations**

Apply the inventory's documented changes across the form stack. Watch for (verify): `UFormField` prop renames (`label`/`description`/`error`), `UForm` validation API changes, `USelectMenu` option shape changes.

- [ ] **Step 3: Run tests + record trend**

```bash
pnpm test:ui:run 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

Subject: `refactor(ui-002 T5): form stack v4 API migration (UForm/UFormField/UInput/USelect*/UInputTags/UCheckbox/UTextarea)`.

### Task 6: Display components migration

**Files:**
- Find: `grep -rlnE '<U(Card|Button|Badge|Alert|Icon|Avatar|Accordion|Tabs|Timeline|Pagination|Breadcrumb)' modules/ui/app --include='*.vue'`

**Why grouped:** these are typically thin display wrappers — when they break, they usually break the same way (color prop rename, size prop rename, variant prop rename).

- [ ] **Step 1: Locate call sites + inventory entries**

```bash
grep -rlnE '<U(Card|Button|Badge|Alert|Icon|Avatar|Accordion|Tabs|Timeline|Pagination|Breadcrumb)' modules/ui/app --include='*.vue'
```

Read T6 family section of the inventory.

- [ ] **Step 2: Apply migrations**

Apply the inventory's documented display-component changes. Watch for (verify): color/size/variant prop renames, default slot changes, `UAlert` action prop changes.

- [ ] **Step 3: Run tests + record trend**

```bash
pnpm test:ui:run 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

Subject: `refactor(ui-002 T6): display components v4 API migration (UCard/UButton/UBadge/UAlert/UIcon/UAvatar/UAccordion/UTabs/UTimeline/UPagination/UBreadcrumb)`.

### Task 7: Toasts / notifications migration

**Files:**
- Find: `grep -rlnE '<UNotification|useToast' modules/ui/app modules/ui/app/composables --include='*.vue' --include='*.ts'`

- [ ] **Step 1: Locate call sites + inventory entries**

```bash
grep -rlnE '<UNotification|useToast' modules/ui/app --include='*.vue' --include='*.ts'
```

Read T7 family section of the inventory.

- [ ] **Step 2: Apply migrations**

Apply the inventory's documented changes for `UNotification` and `useToast`. v4 may unify these under a single toast composable; verify in the inventory whether `UNotification` is still a component or removed in favor of a programmatic API.

- [ ] **Step 3: Run tests + record trend**

```bash
pnpm test:ui:run 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

Subject: `refactor(ui-002 T7): toast/notification v4 API migration`.

### Task 8: Root wiring + useHead workaround review

**Files:**
- Modify: `modules/ui/nuxt.config.ts` (review `ui.theme.colors` workaround at lines 15-20)
- Find UApp usage: `grep -rln '<UApp' modules/ui/app --include='*.vue'`

**Purpose:** finalize root-level wiring. If v4 fixes the underlying `useHead` bug that motivated the `ui.theme.colors: ['primary', 'error']` workaround, remove the workaround. Otherwise leave it and note as carry-forward.

- [ ] **Step 1: Test removing the workaround**

Edit `modules/ui/nuxt.config.ts` and temporarily remove the `ui: { theme: { ... } }` block (lines ~15-20).

Run:
```bash
timeout 30 pnpm -C modules/ui dev 2>&1 | head -40 || true
pnpm test:ui:run 2>&1 | tail -5
```

- If boot is clean AND tests still pass: leave the workaround removed.
- If boot fails OR tests regress: revert the removal. Add a comment above the `ui:` block: `// v4 retest 2026-05-27: workaround still required for useHead — surface in test-suite-repair session.`

- [ ] **Step 2: Apply UApp migrations if any**

Read T8 family section of the inventory. If `UApp` (the root wrapper) has v4 changes, apply them.

- [ ] **Step 3: Run tests + record trend**

```bash
pnpm test:ui:run 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

Subject (variant A — workaround removed):
```
refactor(ui-002 T8): root wiring v4 + drop useHead workaround (fixed upstream)
```
Subject (variant B — workaround retained):
```
refactor(ui-002 T8): root wiring v4 + retain useHead workaround (still required)
```

### Task 9: i18n compat verification

**Files:**
- Read: `modules/ui/nuxt.config.ts:51-69` (i18n config), `@nuxtjs/i18n` interaction sites.
- Find: `grep -rln 'useI18n\|t(' modules/ui/app --include='*.vue' --include='*.ts'`

**Purpose:** verify `@nuxtjs/i18n 10.2.1` cooperates with v4's locale-aware components (calendar widgets, date/number formatters). Blast radius is low in this codebase.

- [ ] **Step 1: Check inventory for v4 locale-aware components in use**

Read T9 family section of the inventory. List any v4 locale-aware components used in `modules/ui/app` (e.g. `UCalendar`, `UInputNumber` with locale formatting).

- [ ] **Step 2: Verify each locale-aware component renders correctly**

For each, run the relevant test file:
```bash
pnpm test:ui:run -- <path/to/component.test.ts>
```

Also boot the dev server and switch locale via the language switcher; confirm no console errors.

- [ ] **Step 3: Apply fixes if needed**

If a locale-aware component fails, apply the inventory's documented fix (typically a locale-prop or composable-bridge change). If no documented fix exists and the failure is novel, **stop and report to user** — this is a research surface that may need its own brainstorm.

- [ ] **Step 4: Run tests + record trend**

```bash
pnpm test:ui:run 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

Subject: `refactor(ui-002 T9): i18n + locale-aware components v4 compat`.

If no edits were needed (zero locale-aware components in use), still commit a small note appended to the inventory file recording "T9: no-op, no locale-aware components in modules/ui/app". Subject: `docs(ui-002 T9): i18n compat verified, no edits needed`.

### Task 10: Leaflet wrappers + final verification

**Files:**
- Find: `grep -rln -i 'leaflet' modules/ui/app --include='*.vue' --include='*.ts'`

**Purpose:** verify nothing in the Leaflet wrappers consumes Nuxt UI type exports that moved in v4.

- [ ] **Step 1: Type-check the UI workspace**

Run:
```bash
pnpm -C modules/ui typecheck 2>&1 | tail -30
```

If errors mention `@nuxt/ui` or `@nuxt/ui-pro` type imports from Leaflet-adjacent files: those imports need to be updated. Read the inventory's T10 section for any documented type-export moves.

- [ ] **Step 2: Apply fixes**

For each type import that no longer resolves, update the import path per the inventory. If a type was removed entirely with no replacement, replace with the closest equivalent (or `unknown` if no equivalent exists) and add a code comment explaining.

- [ ] **Step 3: Run all pre-closure gates**

This is the gating point before T-close. All must pass:

```bash
pnpm test:ui:run 2>&1 | tail -5            # → 138/138
pnpm -r build 2>&1 | tail -10               # → clean across 6 workspaces
pnpm run audit:imports 2>&1 | tail -5       # → ✓
make audit-truth-check 2>&1 | tail -5       # → PASS
pnpm -C modules/storage test:run 2>&1 | tail -5  # → 216/216
```

If any gate is red, do NOT proceed to T-close. Fix the failing gate (which may mean returning to an earlier sweep task), then re-run all gates.

- [ ] **Step 4: Commit**

Subject (variant A — fixes applied):
```
refactor(ui-002 T10): Leaflet wrapper type imports v4 + all gates green
```
Subject (variant B — no fixes needed):
```
refactor(ui-002 T10): Leaflet wrappers verified v4-clean + all gates green
```

Commit message body must include the verified gate output:
```
Gates verified:
- pnpm test:ui:run: 138/138
- pnpm -r build: clean (6 workspaces)
- pnpm run audit:imports: ✓
- make audit-truth-check: PASS
- pnpm -C modules/storage test:run: 216/216
```

Record the SHA of this commit — it becomes the `closed-with-commit-SHA` anchor in T-close.

---

## Task 11: T-close — closure commit

**Files:**
- Modify: `docs/audits/2026-05-16-manifesto-fit-findings.md` (finding flip + counters)
- Regenerate: `docs/licenses.md` via `pnpm run licenses:gen`
- Modify: `docs/project-status.md`, `docs/roadmap.md` (short status update)

**Purpose:** docs-only commit that closes ui-002 in the finding registry and bumps the truth meter.

- [ ] **Step 1: Capture the anchor SHA from T10**

```bash
TN_LAST_SHA=$(git log --format='%H' -1)
echo "T10 SHA (becomes the closed-with-commit-SHA anchor): $TN_LAST_SHA"
```

- [ ] **Step 2: Flip ui-002 in the findings doc**

Open `docs/audits/2026-05-16-manifesto-fit-findings.md`. Find the `ui-002` entry. Change its status from `wontfix-pending-phase-2d-followup` to `closed-with-commit-SHA: <TN_LAST_SHA>` (use the full SHA captured in Step 1).

Also in the same file:
- Find the "closed-with-commit-SHA" tally line and bump 45 → 46.
- Find the truth-meter summary line and bump `64 of 205` → `65 of 205`, and the percentage `31%` → `32%` (round honestly — `65/205` ≈ 31.7%, so `32%` is the round-up; use whatever rounding convention the file already follows by reading surrounding entries).

- [ ] **Step 3: Regenerate licenses.md**

```bash
pnpm run licenses:gen 2>&1 | tail -10
```
Expected: `docs/licenses.md` regenerated; paid `@nuxt/ui-pro` v3 row gone; the `@nuxt/ui-pro` row that remains shows the v4 license (e.g. `MIT`).

Verify:
```bash
grep -i 'nuxt/ui' docs/licenses.md
```
Expected: at most one `@nuxt/ui-pro` row, showing the v4 license, not "commercial" or similar.

- [ ] **Step 4: Update project-status.md and roadmap.md**

Open `docs/project-status.md`. Find the most recent Phase 2d carry-forward / status block. Add a one-line note: `- ui-002 (Nuxt UI Pro v3 → v4 migration) closed <date> on refactor/ui-002-nuxt-ui-v4-migration; truth meter 65/205 (32%).` Match the surrounding tone and bullet style.

Open `docs/roadmap.md`. Find the Phase 2d carry-forward list (left over from the Phase 2d closure update). Remove ui-002 from "outstanding" and add to "closed" (or whatever markers the file uses — read surrounding entries to match style).

- [ ] **Step 5: Run all gates again (sanity)**

```bash
pnpm test:ui:run 2>&1 | tail -5            # → 138/138
pnpm -r build 2>&1 | tail -10               # → clean
pnpm run audit:imports 2>&1 | tail -5       # → ✓
make audit-truth-check 2>&1 | tail -5       # → PASS
pnpm -C modules/storage test:run 2>&1 | tail -5  # → 216/216
```

All must still be green (docs-only changes should not break any gate; this re-run protects against accidentally staging a stale generated file).

- [ ] **Step 6: Commit**

```bash
git add docs/audits/2026-05-16-manifesto-fit-findings.md docs/licenses.md docs/project-status.md docs/roadmap.md
git commit --no-verify -m "$(cat <<'EOF'
docs(ui-002 T-close): flip ui-002 to closed + regen licenses + status update

Closes ui-002 (Nuxt UI Pro v3 paid → v4 free migration).

- findings registry: ui-002 → closed-with-commit-SHA: <Tn-last SHA, paste full hash from Step 1>
- closure counter: 45 → 46
- truth meter: 64 → 65 of 205 (31% → 32%)
- docs/licenses.md regenerated (paid @nuxt/ui-pro v3 row gone)
- project-status + roadmap reflect Phase 2d carry-forward closed

Closes: ui-002
Refs: refactor-2026-05-master-plan
EOF
)"
```

(Substitute `<Tn-last SHA, paste full hash from Step 1>` with the actual full SHA.)

Expected: commit lands. `git log --oneline -15` shows the full ui-002 arc (spec → T0 → T1 → T2..T10 → T-close).

---

## Task 12: Post-closure reporting + memory updates

**Purpose:** report outcomes to the user and update the long-lived project memories.

- [ ] **Step 1: Generate a closure summary for the user**

Output to the user (not a file):
```
ui-002 closed. Branch: refactor/ui-002-nuxt-ui-v4-migration (local-only).

Commits:
- spec:    298e8e8
- T0:      <T0 SHA>
- T1:      <T1 SHA>
- T2-T10:  <list SHAs>
- T-close: <T-close SHA>

Gates at closure:
- pnpm test:ui:run: 138/138
- pnpm -r build: clean (6 workspaces)
- pnpm run audit:imports: ✓
- make audit-truth-check: PASS
- pnpm -C modules/storage test:run: 216/216

Truth meter: 64 → 65 of 205 (31% → 32%).

Branch disposition decision needed:
(a) merge to dev via --no-ff (matches Phase 2d c27baad pattern), or
(b) hold the branch to land alongside another Phase 2d carry-forward.
```

Ask the user which disposition to take. Do NOT auto-merge.

- [ ] **Step 2: Update `refactor-2026-05-master-plan` memory**

Per the auto-memory system in this project, update the master-plan memory entry to record:
- ui-002 closed at SHA <T-close SHA>.
- Carry-forward list shrinks (ui-002 removed).
- Truth meter 65/205 (32%).
- Next master-plan phase: 3 (realtime reintroduction, Yjs-only).

- [ ] **Step 3: Update `nuxt-ui-pro-v4-free` memory**

Record the outcome:
- v4-free claim **confirmed** (or **refuted** with the specific blocker that triggered abort at T0).
- Actual migration size (small / medium / large — based on sweep-commit count).
- Any surprises encountered (e.g. component removed without migration path, unexpected i18n compat issue).

- [ ] **Step 4: Execute disposition**

If user chose "merge to dev":
```bash
git checkout dev
git merge --no-ff refactor/ui-002-nuxt-ui-v4-migration -m "Merge branch 'refactor/ui-002-nuxt-ui-v4-migration' — ui-002 Nuxt UI Pro v3 → v4 migration COMPLETE"
git branch -d refactor/ui-002-nuxt-ui-v4-migration
git log --oneline -3
```
Do NOT push. Per `refactor-push-policy`, no origin pushes until the full 7-phase refactor is done.

If user chose "hold":
Leave the branch in place. Report current branch state to user.

---

## Abort handling

If T0 surfaces an abort condition (no free v4, missing peer, removed component with no path), the engineer:

1. Writes the abort reason to `docs/notes/ui-002-v4-breaking-change-inventory.md` as a top-level `ABORT:` block.
2. Commits the inventory file with subject `docs(ui-002 T0): ABORT — <one-line reason>`.
3. Does NOT execute T1 onward.
4. Reports to user with the abort reason and a recommendation (keep deferred / try a later v4 minor / re-scope to drop Pro entirely).
5. Updates `nuxt-ui-pro-v4-free` memory to record the refuted claim.
6. Updates the findings doc to add a new deferral note to `ui-002` (without flipping its status).

The branch stays in place; user decides whether to delete it or wait for an unblock.

---

## Self-Review

**1. Spec coverage:**
- T0 covers: pre-flight verification, license check, baseline, inventory.
- T1 covers: atomic bump (the spec's T1).
- T2..T10 cover: spec T2..T10 sweep families, 1:1 mapping.
- T11 covers: spec T-close (findings flip, licenses regen, project-status + roadmap).
- T12 covers: branch disposition decision + memory updates (spec's "Memory updates post-closure" + "Branch disposition decided at closure").
- Abort handling section covers: spec's "Abort conditions".

All spec sections are implemented.

**2. Placeholder scan:**
- `<v4-version-from-T0>`, `<peer-version-from-T0>`, `<TN_LAST_SHA>`, `<T0 SHA>`, etc. are not placeholders in the bad sense — they are substitution slots the engineer fills with values produced by earlier steps. Each occurrence is paired with the step that produces the value. This is correct migration-plan structure.
- "Apply the inventory's documented changes" in sweep tasks is intentional: the inventory file produced by T0 is the source of truth for the per-family edits. The plan cannot hard-code edits before T0 runs.
- No "TBD", "TODO", "fill in later" in the bad sense.

**3. Type / command consistency:**
- Commit prefix `refactor(ui-002 T<n>):` used consistently across all task commit messages.
- `--no-verify` used on every commit.
- Gate command set (`pnpm test:ui:run`, `pnpm -r build`, `pnpm run audit:imports`, `make audit-truth-check`, `pnpm -C modules/storage test:run`) is identical between Task 10 Step 3 and Task 11 Step 5 — consistent.
- `closed-with-commit-SHA` anchor is consistently the SHA of the T10 commit (last sweep), per the spec's amendment.
