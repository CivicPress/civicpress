# Lint Tier C cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive `modules/ui` Tier C deferred lint warnings from 89 to 0 via auto-fix, config-level rule exemption, prop rename, and one rule relocation to Tier D.

**Architecture:** Single feature branch `refactor/lint-tier-c-cleanup` off `dev`. Five tasks each producing one focused commit, then `--no-ff` merge to `dev`. Tasks 1, 2, 4 are mechanical config/auto-fix edits run inline. Task 3 is a prop-rename cascade across 3 files (RecordForm → RecordSidebar → TechnicalPanel); the data layer (`useRecordDetail`) stays snake_case (matches the API). After this lands the `STYLE_RULES_TIER_C_DEFERRED` map is removed.

**Tech Stack:** ESLint v9 flat config, `@nuxt/eslint` Option A, Vue 3.5 `<script setup>`, TypeScript, pnpm 9.15.9, Nuxt 4.

**Spec reference:** `docs/specs/2026-06-03-lint-tier-c-cleanup-design.md` (commit `f1c5d10`).

**Spec correction baked into this plan:** The spec §3.3 stated the 4 `vue/prop-name-casing` violations were in `RelationsPanel.vue` + `TechnicalPanel.vue`. The actual lint output (verified before writing this plan) shows them in `RecordSidebar.vue:22-23` + `TechnicalPanel.vue:4-5`. The rename cascade is therefore RecordForm → RecordSidebar → TechnicalPanel. RelationsPanel.vue is not touched.

**Refactor policy reminders:**
- `git commit --no-verify` is approved per master plan §9.1
- No push to origin per `refactor-push-policy`
- All work stays on `refactor/lint-tier-c-cleanup` until Task 5 merge to `dev`

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `modules/ui/eslint.config.mjs` | Tier maps for lint policy | Modify — configure `multi-word-component-names` ignores; move `require-default-prop` to Tier D; drop Tier C map |
| `modules/ui/app/components/RecordForm.vue` | Top of prop chain — binds to RecordSidebar | Modify — template binding rename `:created_at` / `:updated_at` → `:created-at` / `:updated-at` |
| `modules/ui/app/components/editor/RecordSidebar.vue` | Middle of prop chain — receives from RecordForm, passes to TechnicalPanel | Modify — props rename + template binding rename |
| `modules/ui/app/components/editor/record-sidebar/TechnicalPanel.vue` | Leaf — receives + renders dates | Modify — props rename + 4 template usages |
| ~10 files in `modules/ui/app/**` | Various — `process.client`/`process.server`/`process.dev` callsites | Modify — bulk `eslint --fix` rewrites to `import.meta.client` etc. |

The data layer (`useRecordDetail.ts`) keeps the snake_case `created_at`/`updated_at` field names because they match the backend API response shape. The rename happens only at the Vue prop boundary.

---

## Pre-flight: branch + baselines

**Files:**
- No edits; this task only captures baselines.

- [ ] **Step 1: Verify clean working tree on `dev`**

Run: `git status` and `git rev-parse --abbrev-ref HEAD`
Expected: working tree clean, branch is `dev`. If not, stop and report.

- [ ] **Step 2: Create feature branch**

```bash
git checkout -b refactor/lint-tier-c-cleanup
```

Expected: `Switched to a new branch 'refactor/lint-tier-c-cleanup'`

- [ ] **Step 3: Capture baseline ESLint counts**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -5
pnpm --filter @civicpress/ui exec eslint . 2>&1 | grep -Eo "[a-z@/-]+/[a-z-]+$" | sort | uniq -c | sort -rn > /tmp/tier-c-baseline.txt
cat /tmp/tier-c-baseline.txt
```

Expected: total ~102 warnings, 0 errors. Per-rule counts include:
- `nuxt/prefer-import-meta` 33
- `vue/multi-word-component-names` 35
- `vue/prop-name-casing` 4
- `vue/require-default-prop` 17
- ~13 other (`@typescript-eslint/no-explicit-any` allowlist + misc)

Save the count to `/tmp/tier-c-baseline.txt` for later diff.

- [ ] **Step 4: Capture baseline vue-tsc**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -5
```

Expected: exit 0, no errors. If errors exist, note them as pre-existing.

- [ ] **Step 5: Capture baseline UI test result**

```bash
pnpm --filter @civicpress/ui test -- --run 2>&1 | tail -10
```

Expected: 17 fail / 105 pass (matches the documented `lint-followups-2026-06-02` baseline). Record actual numbers; any deviation is the new baseline.

- [ ] **Step 6: No commit for pre-flight**

Pre-flight produces no code changes. Proceed to Task 1.

---

## Task 1: Auto-fix `nuxt/prefer-import-meta` (33 sites)

**Files (all modified by `eslint --fix`):**
- `modules/ui/app/components/Logo.vue`
- `modules/ui/app/components/RecordForm.vue`
- `modules/ui/app/components/UserForm.vue`
- `modules/ui/app/components/UserMenu.vue`
- `modules/ui/app/components/editor/EditorAttachments.vue`
- `modules/ui/app/composables/useCsrf.ts`
- `modules/ui/app/composables/useRecordDetail.ts`
- `modules/ui/app/error.vue`
- `modules/ui/app/layouts/default.vue`
- `modules/ui/app/pages/records/[type]/[id]/raw.vue`
- `modules/ui/app/pages/records/[type]/index.vue`
- `modules/ui/app/pages/records/drafts.vue`
- `modules/ui/app/pages/records/index.vue`
- `modules/ui/app/pages/settings/users/new.vue`
- `modules/ui/app/plugins/01-civicApi.ts`
- `modules/ui/app/stores/app.ts`
- `modules/ui/app/stores/auth.ts`

- [ ] **Step 1: Run scoped auto-fix**

```bash
pnpm --filter @civicpress/ui exec eslint app/ --fix --rule '{"nuxt/prefer-import-meta": "error"}' 2>&1 | tail -10
```

Note: `--rule` upgrades the rule to `error` so `--fix` is willing to apply it. The actual `eslint.config.mjs` policy is untouched.

Expected: exit code 0 or 1 (warnings remaining from other rules are fine). The 33 sites should be rewritten.

- [ ] **Step 2: Verify rule is now zero**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | grep -c "nuxt/prefer-import-meta"
```

Expected: `0`

- [ ] **Step 3: Verify no scope leakage**

```bash
git status --short
git diff --stat
```

Expected: only files under `modules/ui/app/**` appear. If anything else shows up (e.g., a `core/` or `cli/` file), stop and investigate.

- [ ] **Step 4: Spot-check the rewrite**

```bash
grep -n "process\.client\|process\.server\|process\.dev\|import\.meta\." modules/ui/app/composables/useCsrf.ts
```

Expected: only `import.meta.client` (or `.server`/`.dev`) references; no remaining `process.client` etc.

- [ ] **Step 5: Vue-tsc smoke test**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -5
```

Expected: same result as the pre-flight baseline (typically exit 0). The rewrite is a string substitution; types do not change.

- [ ] **Step 6: Commit**

```bash
git add -- "modules/ui/app/**"
git commit --no-verify -m "$(cat <<'EOF'
refactor(ui lint Tier-C 1/5): auto-fix nuxt/prefer-import-meta (33 sites)

`eslint --fix` rewrites `process.client`/`server`/`dev` to
`import.meta.client`/`server`/`dev` across 17 files in modules/ui/app/.
No semantic change; nuxt/prefer-import-meta drops from 33 to 0.

Plan: docs/plans/2026-06-03-lint-tier-c-cleanup.md (Task 1)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds. If pre-commit hook blocks despite `--no-verify`, stop and report.

---

## Task 2: Configure `vue/multi-word-component-names` ignores (35 sites)

**Files:**
- Modify: `modules/ui/eslint.config.mjs` — replace the Tier C entry for `vue/multi-word-component-names` with an options-bearing definition that exempts Nuxt-convention filenames

- [ ] **Step 1: Enumerate the 35 violation sources**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | grep -B5 "vue/multi-word-component-names" | grep "^/" | sort -u | sed 's|.*modules/ui/app/||'
```

Expected: a list of filenames. Sanity check that every entry is a Nuxt page (`pages/**`), layout (`layouts/**`), the root `error.vue`, or `Logo.vue`. If anything else appears (e.g., a real reusable component with a single-word name), stop and re-evaluate the spec.

- [ ] **Step 2: Update the Tier C map entry**

Open `modules/ui/eslint.config.mjs` and replace the line:

```js
  'vue/multi-word-component-names': 'warn',
```

with:

```js
  // 'ignores' exempts Nuxt-convention filenames (file-based routing forces
  // single-word names like `index`, `login`, `error`, etc.) plus the
  // single-word brand component `Logo`. A future improvement is to use a
  // file-pattern override that disables the rule under `pages/`, `layouts/`,
  // and for `error.vue` automatically; for now, the static list is the
  // simplest correct fix.
  'vue/multi-word-component-names': ['warn', {
    ignores: [
      // Nuxt root special names
      'error', 'default', 'index',
      // Nuxt page filenames (single-word route segments)
      'login', 'logout', 'register', 'edit', 'new', 'raw', 'create',
      'activity', 'diagnostics', 'notifications', 'profile', 'setup',
      'drafts',
      // Single-word brand component (explicit allow)
      'Logo',
    ],
  }],
```

Both occurrences of `STYLE_RULES_TIER_C_DEFERRED` are imported via spread in the prod + test blocks, so editing the map once covers both blocks.

- [ ] **Step 3: Verify rule is now zero**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | grep -c "vue/multi-word-component-names"
```

Expected: `0`

- [ ] **Step 4: Verify total warning delta**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -5
```

Expected: 35 fewer warnings than after Task 1. Specifically, after Tasks 1+2 the total should be around `102 - 33 - 35 = 34` warnings (`vue/prop-name-casing` 4 + `vue/require-default-prop` 17 + ~13 pre-existing).

- [ ] **Step 5: If any ignored name is missing, add it**

If Step 3 still reports >0, the list in Step 2 is incomplete. Re-run Step 1 to identify the missing name and add it to the appropriate section of the `ignores` array.

- [ ] **Step 6: Commit**

```bash
git add modules/ui/eslint.config.mjs
git commit --no-verify -m "$(cat <<'EOF'
refactor(ui lint Tier-C 2/5): exempt Nuxt-convention names from multi-word-component-names

All 35 vue/multi-word-component-names violations are Nuxt page filenames,
layouts, or `error.vue`/`Logo.vue` — single-word names forced by file-based
routing or used intentionally as a brand component. Configure the rule
with an `ignores` array listing them; rule drops from 35 to 0.

A future improvement is a file-pattern override that disables the rule
under `pages/`, `layouts/` and for `error.vue` automatically. For now the
static list is acceptable.

Plan: docs/plans/2026-06-03-lint-tier-c-cleanup.md (Task 2)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 3: Rename `created_at`/`updated_at` props (4 sites, 3 files)

**Files:**
- Modify: `modules/ui/app/components/RecordForm.vue` (template binding to RecordSidebar around line 718-719)
- Modify: `modules/ui/app/components/editor/RecordSidebar.vue` (Props interface lines 22-23 + template binding to TechnicalPanel around line 242-243)
- Modify: `modules/ui/app/components/editor/record-sidebar/TechnicalPanel.vue` (Props interface lines 4-5 + 4 template usages)

The data layer (`useRecordDetail.ts`) keeps the snake_case fields — those match the backend API and are out of scope for this rename (spec §2 Out of scope).

**Note on dispatch:** Spec §4 nominates Task 3 for subagent dispatch. Skip the dispatch — the rename cascade is already enumerated below; no judgment call remains.

- [ ] **Step 1: Confirm exact violation locations**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | grep -B2 "vue/prop-name-casing"
```

Expected: 4 warnings — 2 in `RecordSidebar.vue:22:3` and `:23:3`, 2 in `TechnicalPanel.vue:4:3` and `:5:3`.

- [ ] **Step 2: Read TechnicalPanel.vue and plan the edits**

```bash
sed -n '1,60p' modules/ui/app/components/editor/record-sidebar/TechnicalPanel.vue
```

You should see the Props interface (lines 1-9) with `created_at?: string;` and `updated_at?: string;`, and 4 template usages: `v-if="created_at"`, `formatDateTime(created_at)`, `v-if="updated_at"`, `formatDateTime(updated_at)`. Also one `t('records.metadataFields.created_at')` and `t('records.metadataFields.updated_at')` — those are **i18n message keys** and stay snake_case.

- [ ] **Step 3: Update TechnicalPanel.vue Props**

Use the Edit tool. Old:

```ts
interface Props {
  recordId?: string;
  created_at?: string;
  updated_at?: string;
  formatDateTime: (value: string) => string;
}
```

New:

```ts
interface Props {
  recordId?: string;
  createdAt?: string;
  updatedAt?: string;
  formatDateTime: (value: string) => string;
}
```

- [ ] **Step 4: Update TechnicalPanel.vue template usages**

In the same file, replace the 4 template references (DO NOT touch the i18n keys `t('records.metadataFields.created_at')` / `t('records.metadataFields.updated_at')`):

- `<div v-if="created_at">` → `<div v-if="createdAt">`
- `{{ formatDateTime(created_at) }}` → `{{ formatDateTime(createdAt) }}`
- `<div v-if="updated_at">` → `<div v-if="updatedAt">`
- `{{ formatDateTime(updated_at) }}` → `{{ formatDateTime(updatedAt) }}`

Use four individual Edit calls (the `v-if` and `formatDateTime(...)` blocks are unique enough to match without `replace_all`).

- [ ] **Step 5: Verify TechnicalPanel.vue is clean**

```bash
pnpm --filter @civicpress/ui exec eslint modules/ui/app/components/editor/record-sidebar/TechnicalPanel.vue 2>&1
grep -n "created_at\|updated_at" modules/ui/app/components/editor/record-sidebar/TechnicalPanel.vue
```

Expected for the first command: 0 prop-name-casing warnings. Expected for the second: only `t('records.metadataFields.created_at')` and `t('records.metadataFields.updated_at')` matches (the i18n keys).

- [ ] **Step 6: Update RecordSidebar.vue Props interface (lines 22-23)**

Open `modules/ui/app/components/editor/RecordSidebar.vue` and confirm the Props interface contains:

```ts
  created_at?: string;
  updated_at?: string;
```

Replace with:

```ts
  createdAt?: string;
  updatedAt?: string;
```

- [ ] **Step 7: Update RecordSidebar.vue template binding to TechnicalPanel (~lines 239-244)**

Replace:

```vue
            <TechnicalPanel
              v-else-if="item.value === 'technical'"
              :record-id="recordId"
              :created_at="created_at"
              :updated_at="updated_at"
              :format-date-time="formatDateTime"
            />
```

with:

```vue
            <TechnicalPanel
              v-else-if="item.value === 'technical'"
              :record-id="recordId"
              :created-at="createdAt"
              :updated-at="updatedAt"
              :format-date-time="formatDateTime"
            />
```

(Vue's standard kebab-case-in-template / camelCase-in-script convention for prop names.)

- [ ] **Step 8: Check for any other `created_at`/`updated_at` references in RecordSidebar.vue**

```bash
grep -n "created_at\|updated_at" modules/ui/app/components/editor/RecordSidebar.vue
```

Expected: empty (no matches). If anything else turns up (e.g., a computed property destructure, a template expression), update it to `createdAt`/`updatedAt`.

- [ ] **Step 9: Update RecordForm.vue template binding to RecordSidebar (~lines 718-719)**

Open `modules/ui/app/components/RecordForm.vue` and locate the `<RecordSidebar` block. Replace:

```vue
          :created_at="recordCreatedAt"
          :updated_at="recordUpdatedAt"
```

with:

```vue
          :created-at="recordCreatedAt"
          :updated-at="recordUpdatedAt"
```

Note: The script-side variables (`recordCreatedAt`, `recordUpdatedAt` — already camelCase) and the `props.record.created_at` reads (snake_case from the API model) stay as-is. Only the prop binding to RecordSidebar is renamed.

- [ ] **Step 10: Re-verify zero prop-name-casing**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | grep -c "vue/prop-name-casing"
```

Expected: `0`

- [ ] **Step 11: Vue-tsc**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -10
```

Expected: exit 0 (same as baseline). If new errors mention `createdAt`/`updatedAt`, check that all three files agree on the new names.

- [ ] **Step 12: Search for tests that reference these props**

```bash
grep -rn "RecordSidebar\|TechnicalPanel" modules/ui --include="*.test.ts" --include="*.spec.ts" 2>/dev/null
grep -rn "created_at\|updated_at" modules/ui --include="*.test.ts" --include="*.spec.ts" 2>/dev/null | head -20
```

If a test passes `created_at` as a prop to either component, update the binding to `createdAt`. If no test references the rename, proceed.

- [ ] **Step 13: Re-run UI tests**

```bash
pnpm --filter @civicpress/ui test -- --run 2>&1 | tail -10
```

Expected: same pass/fail counts as baseline (Step 5 of Pre-flight). No new failures.

- [ ] **Step 14: Commit**

```bash
git add modules/ui/app/components/RecordForm.vue \
        modules/ui/app/components/editor/RecordSidebar.vue \
        modules/ui/app/components/editor/record-sidebar/TechnicalPanel.vue
git commit --no-verify -m "$(cat <<'EOF'
refactor(ui lint Tier-C 3/5): rename created_at/updated_at props to camelCase

The 4 vue/prop-name-casing violations sit at the Vue prop boundary between
RecordForm → RecordSidebar → TechnicalPanel. Rename the props to
camelCase (`createdAt`/`updatedAt`); the data layer keeps snake_case
because those match the backend API. i18n message keys
(`records.metadataFields.created_at`) are unchanged.

Rule drops from 4 to 0.

Plan: docs/plans/2026-06-03-lint-tier-c-cleanup.md (Task 3)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 4: Relocate `vue/require-default-prop` to Tier D (17 sites)

**Files:**
- Modify: `modules/ui/eslint.config.mjs` — move `vue/require-default-prop` from `STYLE_RULES_TIER_C_DEFERRED` to `STYLE_RULES_TIER_D_OFF`; remove the now-empty Tier C map and its spreads

After Task 3 the only remaining occupant of `STYLE_RULES_TIER_C_DEFERRED` is `vue/require-default-prop` (Tasks 1, 2, 3 cleared the other three rules). Since this task moves that last entry out, the Tier C map becomes empty. Drop the map and its two spreads — Tier C as a category was always a temporary holding pen per the spec §4.

- [ ] **Step 1: Remove `vue/require-default-prop` from Tier C**

Open `modules/ui/eslint.config.mjs`. The current `STYLE_RULES_TIER_C_DEFERRED` block (after Task 2) looks roughly like:

```js
const STYLE_RULES_TIER_C_DEFERRED = {
  'nuxt/prefer-import-meta': 'warn',
  'vue/multi-word-component-names': ['warn', { ignores: [...] }],
  'vue/prop-name-casing': 'warn',
  'vue/require-default-prop': 'warn',
};
```

Note: `nuxt/prefer-import-meta` and `vue/prop-name-casing` are still set to `warn` here even though Tasks 1 and 3 cleared their violation sites. That's intentional — the policies remain to catch regressions. Move only `vue/require-default-prop` out.

- [ ] **Step 2: Update Tier D to absorb the rule + add rationale comment**

Locate `STYLE_RULES_TIER_D_OFF`. Insert `vue/require-default-prop` with a comment block explaining the Vue 3 + TypeScript rationale:

```js
const STYLE_RULES_TIER_D_OFF = {
  'vue/html-indent': 'off',
  'vue/html-closing-bracket-newline': 'off',
  'vue/max-attributes-per-line': 'off',
  'vue/singleline-html-element-content-newline': 'off',
  'vue/multiline-html-element-content-newline': 'off',
  'vue/first-attribute-linebreak': 'off',
  'vue/html-quotes': 'off',
  'vue/html-self-closing': 'off',
  'vue/attributes-order': 'off',
  'vue/no-multiple-template-root': 'off',
  'nuxt/nuxt-config-keys-order': 'off',
  // Vue 2-era rule: with `defineProps<{ x?: T }>()` TypeScript already
  // distinguishes required vs optional props. The rule asks for
  // `withDefaults(...)` at every site, which is busywork for TS-first
  // components. Relocated from Tier C 2026-06-03 (lint Tier-C cleanup).
  'vue/require-default-prop': 'off',
};
```

- [ ] **Step 3: Decide on Tier C map fate**

Since `vue/require-default-prop` was the last entry to clear, the Tier C map should be **kept** with the two non-zero policies (`nuxt/prefer-import-meta`, `vue/multi-word-component-names`, `vue/prop-name-casing`) reframed as the new "Tier B-style enforced regression checks." Or it can be **dropped** and those three rules merged into Tier B.

**Decision: rename `STYLE_RULES_TIER_C_DEFERRED` to remove the "DEFERRED" suffix and update its policy comment**, since the rules it now contains have zero live sites and are kept on as `warn`-level regression detection — same role as Tier B's zero-violation entries. Specifically:

Replace:

```js
// Tier C: deferred — `warn`-signal, sites accumulate for a future focused
// session. ~89 live warnings expected (nuxt/prefer-import-meta 33,
// vue/multi-word-component-names 35, vue/prop-name-casing 4,
// vue/require-default-prop 17). Future sessions can drive these to zero.
const STYLE_RULES_TIER_C_DEFERRED = {
  'nuxt/prefer-import-meta': 'warn',
  'vue/multi-word-component-names': ['warn', { ignores: [...] }],
  'vue/prop-name-casing': 'warn',
  'vue/require-default-prop': 'warn',
};
```

with merging the three remaining entries into Tier B and dropping the Tier C map entirely. Open the file and:

1. Remove the `STYLE_RULES_TIER_C_DEFERRED` constant block (the comment + the `const` declaration + closing `};`).
2. Remove `vue/require-default-prop: 'warn'` from it before deletion (already done in Step 1).
3. Append the three remaining rules into `STYLE_RULES_TIER_B`:

```js
const STYLE_RULES_TIER_B = {
  'vue/require-explicit-emits': 'warn',
  'vue/no-template-shadow': 'warn',
  'vue/v-on-event-hyphenation': 'warn',
  'vue/no-deprecated-filter': 'warn',
  'vue/component-definition-name-casing': 'warn',
  'vue/component-name-in-template-casing': 'warn',
  '@typescript-eslint/no-dynamic-delete': 'warn',
  '@typescript-eslint/unified-signatures': 'warn',
  'import/first': 'warn',
  // Cleared in lint Tier-C cleanup 2026-06-03; kept as `warn`-level
  // regression detection.
  'nuxt/prefer-import-meta': 'warn',
  'vue/prop-name-casing': 'warn',
  // `ignores` exempts Nuxt-convention filenames (file-based routing
  // forces single-word names) plus the single-word brand `Logo`.
  'vue/multi-word-component-names': ['warn', {
    ignores: [
      // Nuxt root special names
      'error', 'default', 'index',
      // Nuxt page filenames (single-word route segments)
      'login', 'logout', 'register', 'edit', 'new', 'raw', 'create',
      'activity', 'diagnostics', 'notifications', 'profile', 'setup',
      'drafts',
      // Single-word brand component (explicit allow)
      'Logo',
    ],
  }],
};
```

4. Remove the two `...STYLE_RULES_TIER_C_DEFERRED,` spreads from the prod and test `rules:` blocks (lines ~68 and ~81 of the post-Task-2 file).

- [ ] **Step 4: Verify file syntax + lint config loads**

```bash
pnpm --filter @civicpress/ui exec eslint --print-config modules/ui/app/error.vue 2>&1 | tail -20
```

Expected: prints the resolved config without error. If ESLint errors with a parse or schema issue, re-read `modules/ui/eslint.config.mjs` and confirm braces/spreads balance.

- [ ] **Step 5: Verify all four target rules are now zero**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | grep -cE "nuxt/prefer-import-meta|vue/multi-word-component-names|vue/prop-name-casing|vue/require-default-prop"
```

Expected: `0`

- [ ] **Step 6: Verify total warning delta**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -5
```

Expected: ~13 warnings total (the pre-existing `@typescript-eslint/no-explicit-any` allowlist plus any other warn-level rules already present at baseline). 0 errors.

- [ ] **Step 7: Commit**

```bash
git add modules/ui/eslint.config.mjs
git commit --no-verify -m "$(cat <<'EOF'
refactor(ui lint Tier-C 4/5): relocate require-default-prop to Tier D + drop Tier C map

`vue/require-default-prop` is a Vue 2-era rule; with `defineProps<{ x?: T }>()`
TypeScript already distinguishes required vs optional props. The rule asks
for `withDefaults(...)` at every site, which is busywork for TS-first
components. Move to Tier D (`off`) with documented rationale.

With its last deferred entry gone, the Tier C map's three remaining rules
(nuxt/prefer-import-meta, vue/multi-word-component-names, vue/prop-name-casing)
are now zero-violation `warn`-level regression detection — same role as
Tier B's zero-violation entries. Merge them into Tier B and drop the
Tier C map entirely.

Plan: docs/plans/2026-06-03-lint-tier-c-cleanup.md (Task 4)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 5: Verification + merge + memory update

**Files:**
- Memory: `/Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/lint-rollout-2026-06-02-followups.md`
- Memory: `/Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/refactor-2026-05-master-plan.md`
- Memory: `/Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/MEMORY.md`
- Memory (conditional): `/Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/lint-followups-surfaced-findings.md` — only if Task 3 surfaced new findings (it shouldn't, but check)

- [ ] **Step 1: Final ESLint verification**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -5
pnpm --filter @civicpress/ui exec eslint . 2>&1 | grep -Eo "[a-z@/-]+/[a-z-]+$" | sort | uniq -c | sort -rn
```

Expected (gate from spec §6):
- 0 errors
- ~13 warnings total
- Per-rule counts for the four target rules all zero:
  - `nuxt/prefer-import-meta` 0
  - `vue/multi-word-component-names` 0
  - `vue/prop-name-casing` 0
  - `vue/require-default-prop` 0

- [ ] **Step 2: Final vue-tsc**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -5
```

Expected: exit 0.

- [ ] **Step 3: Final UI tests**

```bash
pnpm --filter @civicpress/ui test -- --run 2>&1 | tail -10
```

Expected: same pass/fail counts as Pre-flight Step 5 baseline.

- [ ] **Step 4: Scope check — only `modules/ui` modified**

```bash
git diff dev..HEAD --name-only | grep -v "^modules/ui/" || echo "OK: scope clean"
```

Expected: prints `OK: scope clean`. If any file outside `modules/ui/` appears, investigate before merging.

- [ ] **Step 5: Review the branch's commit history**

```bash
git log --oneline dev..HEAD
```

Expected: 4 commits — `refactor(ui lint Tier-C 1/5)` through `refactor(ui lint Tier-C 4/5)`.

- [ ] **Step 6: Switch to `dev` and merge `--no-ff`**

```bash
git checkout dev
git merge --no-ff refactor/lint-tier-c-cleanup -m "$(cat <<'EOF'
Merge branch 'refactor/lint-tier-c-cleanup' — Tier C deferred warnings cleared

Spec: docs/specs/2026-06-03-lint-tier-c-cleanup-design.md
Plan: docs/plans/2026-06-03-lint-tier-c-cleanup.md

Per-rule outcomes:
- nuxt/prefer-import-meta 33 → 0 (auto-fix; process.client → import.meta.client)
- vue/multi-word-component-names 35 → 0 (config ignores for Nuxt-convention names)
- vue/prop-name-casing 4 → 0 (rename at RecordForm → RecordSidebar → TechnicalPanel)
- vue/require-default-prop 17 → 0 (relocated to Tier D — Vue 3 + TS makes obsolete)

modules/ui ESLint warning count: ~102 → ~13.

Tier C map (`STYLE_RULES_TIER_C_DEFERRED`) dropped from eslint.config.mjs.
Three former Tier C rules now live in Tier B as `warn`-level regression
detection.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: merge commit created on `dev`.

- [ ] **Step 7: Capture merge SHA**

```bash
MERGE_SHA=$(git rev-parse HEAD)
echo "Merge SHA: $MERGE_SHA"
```

Note the SHA for memory updates.

- [ ] **Step 8: Delete the feature branch**

```bash
git branch -d refactor/lint-tier-c-cleanup
```

Expected: branch deleted (it's fully merged).

- [ ] **Step 9: Confirm no push to origin happens**

Per `refactor-push-policy`: do **not** run `git push`. Verify by checking that the merge SHA exists locally only:

```bash
git log -1 --format='%H %s'
```

Expected: shows the merge commit; we do not run any push command.

- [ ] **Step 10: Update memory — `lint-rollout-2026-06-02-followups.md`**

Open the memory file and append a new "## Tier C cleanup (2026-06-03)" section after the `#4 ... ✅ TRIAGED 2026-06-03` paragraph (around line 56). Content:

```markdown
**Tier C deferred (89 warnings) ✅ CLOSED 2026-06-03 (merge `<MERGE_SHA>` — replace with actual SHA).** All 89 Tier C-deferred warnings cleared via:
- `nuxt/prefer-import-meta` 33 → 0 — `eslint --fix` bulk-rewrote `process.client/server/dev` to `import.meta.*` across 17 files
- `vue/multi-word-component-names` 35 → 0 — configured rule with `ignores` array listing Nuxt-convention page/layout names + `Logo`
- `vue/prop-name-casing` 4 → 0 — renamed `created_at`/`updated_at` → `createdAt`/`updatedAt` at the Vue prop boundary across RecordForm → RecordSidebar → TechnicalPanel (data layer kept snake_case because it matches the API)
- `vue/require-default-prop` 17 → 0 — relocated to Tier D (`off`); Vue 3 + TS-typed `defineProps<{ x?: T }>()` makes the rule obsolete

`STYLE_RULES_TIER_C_DEFERRED` map removed from `modules/ui/eslint.config.mjs`; the three rules with zero live sites are now in Tier B as regression detection. `modules/ui` ESLint warning count: ~102 → ~13.

Note (spec correction): spec §3.3 said the 4 prop-name-casing sites were in `RelationsPanel.vue` + `TechnicalPanel.vue`; actually `RecordSidebar.vue` + `TechnicalPanel.vue`. Rename cascade was 3 files: `RecordForm.vue`, `RecordSidebar.vue`, `TechnicalPanel.vue`.
```

Replace `<MERGE_SHA>` with the value captured in Step 7.

- [ ] **Step 11: Update memory — `refactor-2026-05-master-plan.md`**

Open the memory file and append the Tier C closure SHA to the running ledger of merges in the appropriate phase section. Use this exact line (replace the SHA):

```markdown
- Lint Tier C cleanup CLOSED 2026-06-03 (merge `<MERGE_SHA>`): 89 deferred warnings cleared (auto-fix 33 + config 35 + rename 4 + Tier D relocation 17). modules/ui warning count ~102 → ~13. STYLE_RULES_TIER_C_DEFERRED map dropped. Phase 3 remains UNBLOCKED.
```

- [ ] **Step 12: Update memory — `MEMORY.md` index**

Open `MEMORY.md` and update the existing entry for `lint-rollout-2026-06-02-followups.md` to mention the Tier C closure. Find the line that reads:

```markdown
- [Lint-rule rollout 2026-06-02 followups](lint-rollout-2026-06-02-followups.md) — Phase 2d W3-T6 CLOSED on local dev (`656adb5`); deferred: unused-vars cleanup (~600), Vue-template no-explicit-any blind spot, modules/ui cruft deps, ~30 vue/nuxt style rules.
```

Replace with:

```markdown
- [Lint-rule rollout 2026-06-02 followups](lint-rollout-2026-06-02-followups.md) — Phase 2d W3-T6 + all 4 followups + Tier C cleanup CLOSED on local dev. modules/ui lint warning count ~615 → ~13.
```

(The exact "before" number is illustrative; if a different baseline is more accurate, update it.)

- [ ] **Step 13: Surfaced-findings check**

```bash
# Did Task 3 surface anything? Inspect the data layer for any newly-noticed issues.
grep -n "created_at\|updated_at" modules/ui/app/composables/useRecordDetail.ts | head
```

If a TODO or non-obvious data-shape issue was noticed during Task 3, add it to `lint-followups-surfaced-findings.md`. Otherwise skip this step.

- [ ] **Step 14: Confirm completion**

```bash
git log -1 --format='%H %s'
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -3
```

Expected: merge commit at HEAD; ESLint output shows 0 errors and ~13 warnings.

Done — Tier C closed; Phase 3 unblocked.

---

## Self-review

**1. Spec coverage:**
- Spec §1 (Goal — 89 → 0): covered by Tasks 1-4 with explicit per-rule counts in each task's verification step.
- Spec §3.1 (`nuxt/prefer-import-meta` auto-fix, 33 sites): Task 1.
- Spec §3.2 (`vue/multi-word-component-names` config ignores, 35 sites): Task 2 with the exact ignores list from spec §3.2.
- Spec §3.3 (`vue/prop-name-casing` rename, 4 sites): Task 3 — with the spec-correction that the violations are in `RecordSidebar.vue` not `RelationsPanel.vue`, called out prominently in plan header.
- Spec §3.4 (`vue/require-default-prop` relocation): Task 4.
- Spec §4 (single feature branch, 5 tasks): plan structure matches.
- Spec §5.1 (auto-fix scope leakage): Task 1 Step 3 verifies `git status --short` only shows `modules/ui/app/**`.
- Spec §5.2 (ignores list maintenance): comment in Task 2 Step 2 names the future improvement.
- Spec §5.3 (rename cascade): plan resolves the question — data layer stays snake_case, transform at prop boundary only.
- Spec §5.5 (UI test failures): Task 3 Step 12 searches for test references; Step 13 re-runs UI tests.
- Spec §6 (verification gate): Task 5 Steps 1-4 cover all checkboxes.
- Spec §8 (memory updates): Task 5 Steps 10-13.

**2. Placeholder scan:** No TBDs, no "implement later," no "similar to Task N," all code blocks have actual content. The one variable-by-design placeholder is `<MERGE_SHA>` in Step 7-11, with an explicit instruction to substitute it.

**3. Type consistency:** Prop names renamed consistently: `createdAt`/`updatedAt` (camelCase in script, kebab-case `created-at`/`updated-at` in templates). Tier C map → dropped; three rules → Tier B; one rule → Tier D. File paths consistent throughout.
