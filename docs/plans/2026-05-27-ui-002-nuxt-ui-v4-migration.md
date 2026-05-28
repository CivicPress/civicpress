# ui-002 — Nuxt UI Pro v3 → v4 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `modules/ui` from paid `@nuxt/ui-pro` v3 + free `@nuxt/ui` v3 to the single MIT-licensed `@nuxt/ui` v4 (which folds the former Pro components into the free package), dropping the vendor-lock-in dep that originally triggered audit finding ui-002 (Critical).

**Architecture:** Atomic version bump on a dedicated branch (`refactor/ui-002-nuxt-ui-v4-migration`, cut from `dev` at `c27baad`, rebased onto `7f08521` on 2026-05-28 after a W4-T2 follow-up landed), followed by a per-component-family sweep that brings the 138-test UI suite + `pnpm -r build` back to green. Truth meter advances 64 → 65 of 205 at closure.

**Tech Stack:** Nuxt 4.4.5; drop `@nuxt/ui-pro ^3.3.7` (paid v3) AND `@nuxt/ui ^3.3.7` (free v3); add `@nuxt/ui ^4.8.0` (single MIT package containing former Pro components — v4 dropped the separate `@nuxt/ui-pro` package per T0 finding). Tailwind v4 (already in place), Vue 3.5, TypeScript 5.9, Vitest, pnpm workspaces with strict-hoist (`shamefully-hoist=false`).

**Companion design spec:** `docs/specs/2026-05-27-ui-002-nuxt-ui-v4-migration-design.md` (latest revision on this branch).

**T0 outcome (2026-05-28):** Done, no abort. v4 license verified MIT, peers align, baseline gates all green. T0 commit `3ce9962`. Inventory at `docs/notes/ui-002-v4-breaking-change-inventory.md` drives the per-family changes in T2..T10.

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
- `modules/ui/package.json` — drop both v3 packages (paid `@nuxt/ui-pro` + free `@nuxt/ui`), add `@nuxt/ui ^4.8.0` (T1). Possibly minor peer bumps (T1).
- `modules/ui/nuxt.config.ts` — module registration `'@nuxt/ui-pro'` → `'@nuxt/ui'` (T1); T8 revisits the `ui.theme.colors` useHead workaround at lines 15-20.
- `modules/ui/app/assets/css/main.css` — `@import "@nuxt/ui-pro"` → `@import "@nuxt/ui"` (T1).
- `modules/ui/app/app.vue` — uncomment line 196 and replace `<UNotification />` placeholder with `<UToaster />` (T7).
- `modules/ui/app/**/*.vue` and `modules/ui/app/**/*.ts` — per-component-family API fixes (T2..T10). Form-stack changes (T5) carry the largest risk.
- `docs/audits/2026-05-16-manifesto-fit-findings.md` — finding flip + counters (T-close).
- `docs/licenses.md` — regenerated via `pnpm run licenses:gen` (T-close).
- `docs/project-status.md` and `docs/roadmap.md` — short status update (T-close).

**Not touched (out of scope, would warrant separate sessions):**
- `@typescript-eslint/no-explicit-any` lint rule (Phase 2d carry-forward, separate session).
- Test-suite repair (date-bomb, lock-endpoints, session-mgmt flakes — separate session per master plan §9.1).
- Phase 3 realtime code.
- UI cast-allowlist cleanup (68 `eslint-disable` lines stay as-is).

---

## Task 0: Pre-flight verification + breaking-change inventory ✅ DONE 2026-05-28

**Status:** Complete. Commit `3ce9962`. No abort triggered.

**Outcome:**
- v4 license: MIT (OSI-approved), zero `NUXT_UI_PRO_LICENSE` refs anywhere.
- v4 peer alignment: Nuxt 4 (we're on 4.4.5), Tailwind 4 (have), TS ≥5.6 (we're on 5.9.3), Vue Router 4.5+/5 (Nuxt ships). All PASS.
- Baseline gates: UI **138/138**, storage **216/216**, `pnpm -r build` clean across 5 build-capable workspaces (6th has no build script).
- **Material plan deviation**: v4 dropped the separate `@nuxt/ui-pro` package entirely; Pro components live in the single MIT `@nuxt/ui` v4. Plan + spec updated to match.
- Pre-existing W4-T2 audit-coverage gap surfaced during baseline (root workspace not scanned by `audit-package-imports.mjs`) → fixed on a sibling branch + merged to `dev` at `7f08521` before T0 could complete; ui-002 branch rebased onto that.
- Sweep count: 9 (or 8 if T9 collapsed) — well under the spec's cap of 20.
- Inventory: `docs/notes/ui-002-v4-breaking-change-inventory.md` (306 lines).

**Files (historical):**
- Created: `docs/notes/ui-002-v4-breaking-change-inventory.md`
- Read: `modules/ui/package.json`, `modules/ui/app/**/*.vue`

**Steps (historical, complete):** Confirm working tree state → capture baselines → verify v4 license + peers → enumerate components → harvest changelog breaking changes → validate plan slicing → commit inventory.

---

## Task 1: Atomic package swap (expected RED)

**Files:**
- Modify: `modules/ui/package.json` (drop two v3 deps, add one v4 dep)
- Modify: `modules/ui/nuxt.config.ts:13` (module registration rename)
- Modify: `modules/ui/app/assets/css/main.css:2` (CSS @import rename)
- Read: `pnpm-lock.yaml` after install

**Purpose:** Single commit that swaps v3 → v4 wiring. Tests + build go red intentionally. Subsequent sweep commits bring them back to green.

**Key fact (from T0):** v4 dropped the separate `@nuxt/ui-pro` package. The migration replaces TWO v3 packages with ONE v4 package, and renames both the Nuxt module registration string and the CSS @import target.

- [ ] **Step 1: Edit package.json — swap deps**

Modify `modules/ui/package.json` `dependencies` block:
- Remove `"@nuxt/ui-pro": "^3.3.7"` line entirely.
- Replace `"@nuxt/ui": "^3.3.7"` with `"@nuxt/ui": "^4.8.0"`.
- Touch no other dependency lines in this commit.

After edit, the relevant section should look like (only the changed lines shown):
```json
"@nuxt/ui": "^4.8.0",
```
(No `@nuxt/ui-pro` line at all.)

- [ ] **Step 2: Edit nuxt.config.ts — rename module registration**

Edit `modules/ui/nuxt.config.ts:13`:
```diff
-  modules: ['@nuxt/ui-pro', '@pinia/nuxt', '@nuxtjs/i18n'],
+  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxtjs/i18n'],
```
Do NOT remove the `ui: { theme: { colors: ['primary', 'error'] } }` workaround block at lines 15-20 in this task. T8 revisits it.

- [ ] **Step 3: Edit main.css — rename CSS @import**

Edit `modules/ui/app/assets/css/main.css:2`:
```diff
 @import "tailwindcss";
-@import "@nuxt/ui-pro";
+@import "@nuxt/ui";
```

- [ ] **Step 4: Install + verify resolution**

From repo root:
```bash
pnpm install 2>&1 | tail -10
```
Expected: install completes; no `ERR_PNPM_OUTDATED_LOCKFILE` or peer-dep errors that block resolution. Peer-dep warnings (especially around `@typescript-eslint/*` and TS 5.9 vs 5.8) are pre-existing and acceptable.

If pnpm offers to "remove and reinstall from scratch" interactively, decline (answer N). Surgical adds via `pnpm add` are preferred over full reinstall. If install legitimately needs more than the one package change (e.g. v4 added a new peer like `@internationalized/date`), add the peer to `modules/ui/package.json` and re-run install. Do NOT use `--shamefully-hoist=true`.

- [ ] **Step 5: Verify dev server boots without runtime crash**

```bash
timeout 30 pnpm -C modules/ui dev 2>&1 | head -60 || true
```
Expected: server reaches "Nuxt ready" (or equivalent) without an unhandled-exception stack trace at boot. Compile-time errors and red TS diagnostics in component files are EXPECTED at this stage; a runtime crash on boot is NOT and means either Step 2 or Step 3 wasn't applied, or there's an unanticipated peer/runtime requirement to add.

If runtime crash on boot: read the stack, fix only the boot blocker (peer, module registration, CSS entry), do NOT touch any component-level code. Component fixes happen in T2..T10.

- [ ] **Step 6: Capture the expected-red state**

```bash
pnpm test:ui:run 2>&1 | tail -5
pnpm -r build 2>&1 | tail -10
```
Both are expected to be red. Record the passing test count (e.g. `X/138`) in the upcoming commit message — that's the starting point for the sweep's "passing trend" tracking.

- [ ] **Step 7: Commit the swap**

```bash
git add modules/ui/package.json modules/ui/nuxt.config.ts modules/ui/app/assets/css/main.css pnpm-lock.yaml
git commit --no-verify -m "$(cat <<'EOF'
refactor(ui-002 T1): swap @nuxt/ui-pro v3 + @nuxt/ui v3 → @nuxt/ui v4 (RED)

v4 dropped the separate @nuxt/ui-pro package; Pro components are now in
the single MIT-licensed @nuxt/ui v4. This task swaps the two v3 deps for
the one v4 dep and updates the Nuxt module registration + CSS @import
to match.

- modules/ui/package.json: drop @nuxt/ui-pro ^3.3.7 (paid v3) and
  @nuxt/ui ^3.3.7 (free v3); add @nuxt/ui ^4.8.0.
- modules/ui/nuxt.config.ts:13: 'nuxt/ui-pro' → '@nuxt/ui'.
- modules/ui/app/assets/css/main.css:2: @import "@nuxt/ui-pro" →
  @import "@nuxt/ui".

ui.theme.colors workaround at nuxt.config.ts:15-20 stays for now; T8
revisits whether v4 still needs it.

Tests + build expected RED at this commit; the sweep commits T2..T10
bring them back to green per the per-family changes documented in
docs/notes/ui-002-v4-breaking-change-inventory.md.

Starting test state: X/138 passing.

Refs: ui-002
EOF
)"
```

(Substitute `X/138` with the actual count from Step 6.)

Expected: commit lands. `git log --oneline -3` shows T1, T0, the W4-T2 follow-up merge.

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
- Modify: `modules/ui/app/app.vue:196` — single line change.

**T0 finding:** Per inventory T7 section, our only `UNotification` reference is a commented-out element at `app.vue:196`. `useToast()` API is unchanged in v4. The migration is a single-file uncomment-and-replace. All 30+ `useToast()` call sites stay as-is.

- [ ] **Step 1: Confirm the sole call site**

```bash
grep -rnE '<UNotification' modules/ui/app --include='*.vue'
```
Expected: one match, `modules/ui/app/app.vue:196`, commented out (`<!-- <UNotification /> -->`). If anywhere else, stop and reconcile with the inventory before editing.

- [ ] **Step 2: Replace with UToaster**

Edit `modules/ui/app/app.vue:196`:
```diff
-      <!-- <UNotification /> -->
+      <UToaster />
```
(Adjust indentation to match surrounding markup. If the commented element had attributes, drop them — `UToaster` takes its config from the runtime `useToast()` calls.)

- [ ] **Step 3: Run tests + record trend**

```bash
pnpm test:ui:run 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

Subject: `refactor(ui-002 T7): UNotification → UToaster + useToast unchanged`.

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
- If boot fails OR tests regress: revert the removal. Add a comment above the `ui:` block: `// v4 retest 2026-05-28: workaround still required for useHead — surface in test-suite-repair session.`

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

### Task 9: i18n compat verification (verification-only)

**Files:**
- No code changes expected.
- Read: `modules/ui/nuxt.config.ts:51-69` (i18n config).

**T0 finding:** Per inventory T9 section, v4.2.0 removed the `:locale` / `:dir` prop proxy on components, but we use `@nuxtjs/i18n` at the Nuxt layer — we do NOT pass `:locale` props directly to U* components. Effectively a no-op for our usage. This task is a smoke-verification checkpoint; absence of issues here is the success condition.

- [ ] **Step 1: Confirm no `:locale=` prop usage on U* components**

```bash
grep -rnE ':locale\s*=' modules/ui/app --include='*.vue' || echo "NO MATCHES (expected)"
```
Expected: `NO MATCHES`. If matches surface, treat as a real fix and apply per inventory; otherwise proceed.

- [ ] **Step 2: Smoke-verify locale switch in dev mode**

```bash
timeout 30 pnpm -C modules/ui dev 2>&1 | head -30 &
sleep 15
```
Open `http://localhost:3030/` in a browser, switch language via the language switcher, and visually confirm no console errors. Kill the dev server with `kill %1` when done.

(If no manual browser session is available in this environment, run the i18n-related tests as the proxy: `pnpm test:ui:run -- tests/ui/i18n` or similar — and accept that an interactive smoke is logged as deferred to the next user-driven verification pass.)

- [ ] **Step 3: Run tests + record trend**

```bash
pnpm test:ui:run 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

If no code changes were needed (the expected case), commit a small note appended to the inventory file recording "T9: no-op, no `:locale=` on U*, smoke ok". Subject: `docs(ui-002 T9): i18n compat verified, no edits needed`.

If a real `:locale=` usage was found and fixed, subject: `refactor(ui-002 T9): drop v4-removed :locale proxy from U* call sites`.

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
Expected: `docs/licenses.md` regenerated. The `@nuxt/ui-pro` row is entirely GONE (v4 dropped the package — Pro components live in `@nuxt/ui` now). The `@nuxt/ui` row remains and reflects `MIT` (v4.8.0).

Verify:
```bash
grep -i 'nuxt/ui' docs/licenses.md
```
Expected: a single `@nuxt/ui` row with `MIT`. No `@nuxt/ui-pro` row. No "commercial" or "Proprietary" license string anywhere in the file.

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
