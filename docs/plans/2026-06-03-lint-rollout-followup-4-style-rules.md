# Lint-rollout followup #4 — `STYLE_RULES_DEFERRED` triage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triage the 27 rules silenced in `modules/ui/eslint.config.mjs` `STYLE_RULES_DEFERRED` into a 4-tier disposition matrix; fix 31 violations (18 safety + 13 cheap code-quality); enable 4 deferred-tier rules as `warn` with 89 live warnings carried as signal-only for a future session; keep 11 Prettier-overlap rules `off` with documented policy; remove 1 dead-config line. Closes the entire lint-rollout backlog.

**Architecture:** Single feature branch off `dev`. Five tasks: config restructure (mechanical), Tier A safety fixes (`vue/no-v-html` 2 + `vue/no-mutating-props` 16 — the latter likely surfaces a real architectural issue in geography-form), Tier B-cheap fixes (13 mostly mechanical), merge + memory. After this lands, Phase 3 unblocks per [[lint-followups-before-phase-3]].

**Tech Stack:** TypeScript 5.9, Vue 3.5 (`<script setup>`, `defineProps`, `defineEmits`, `defineModel` available), Nuxt 4, ESLint v9 flat config via `@nuxt/eslint` Option A, pnpm 9.15.9 via corepack, vitest. `--no-verify` per master plan §9.1.

**Spec:** `docs/specs/2026-06-03-lint-rollout-followup-4-style-rules-design.md` (commit `a96e7f3`).

---

## File map

| Task | Files | Notes |
|---|---|---|
| Task 1 | `modules/ui/eslint.config.mjs` | Restructure `STYLE_RULES_DEFERRED` (27 entries) into 4 tier maps; remove 1 dead-config entry. |
| Task 2 | `modules/ui/app/components/RecordPreview.vue` (line 36) + `modules/ui/app/pages/records/[type]/[id]/_components/RecordContentBody.vue` (line 31) | 2 `vue/no-v-html` sites. |
| Task 3 | `modules/ui/app/components/geography-form/{GeographyBasicInfoCard,GeographyDataCard,GeographyMappingCard}.vue` + likely 1 more file | 16 `vue/no-mutating-props` sites, all mutating a `form` prop. |
| Task 4 | `modules/ui/app/pages/records/[type]/index.vue:534`, `modules/ui/app/pages/records/index.vue:412`, `modules/ui/app/components/GeographyLinkDisplay.vue:43`, `modules/ui/app/pages/settings/profile.vue:343`, `modules/ui/app/composables/useLoading.ts:48`, `modules/ui/app/composables/useRecordSidebar.ts:33-34`, plus `import/first` sites in `modules/ui/app/components/GeographyMap.vue:27`, `modules/ui/app/composables/useRecordStatuses.ts:18`, + 3 more for `import/first` | 13 sites across 7+ files. |

---

## Pre-flight (do once, before Task 1)

- [ ] **Step 1: Confirm clean working tree on `dev`**

```bash
cd /Users/stakabo/Work/repos/civicpress/civicpress
git status -sb
git log --oneline -3
```

Expected: `## dev`, no modified files. HEAD reaches `a96e7f3` (spec commit) or later.

- [ ] **Step 2: Confirm pnpm version**

```bash
pnpm --version
```

Expected: `9.15.9` via corepack.

- [ ] **Step 3: Capture pre-change ui lint baseline**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tee /tmp/lint-ui-baseline-followup-4.txt | tail -3
```

Expected: `✖ 13 problems (0 errors, 13 warnings)` (post-#1.3 + useTypedI18n-migration state).

- [ ] **Step 4: Capture pre-change vue-tsc baseline**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tee /tmp/vue-tsc-ui-baseline-followup-4.txt | tail -5
echo "exit=${PIPESTATUS[0]}"
```

Expected: exit 0 (clean).

- [ ] **Step 5: Capture pre-change test baselines**

```bash
pnpm test:ui:run 2>&1 | tail -5
```

Record `UI_TEST_BASELINE`.

```bash
pnpm test:run 2>&1 | tail -5
```

Record `TEST_BASELINE_PASS`, `TEST_BASELINE_FAIL`, `TEST_BASELINE_SKIP`.

- [ ] **Step 6: Create the implementation branch**

```bash
git checkout -b refactor/lint-followup-4-style-rules
git status -sb
```

Expected: `## refactor/lint-followup-4-style-rules`.

---

## Task 1: Restructure `STYLE_RULES_DEFERRED` into 4 tier maps + drop dead config

**Files:**
- Modify: `modules/ui/eslint.config.mjs` (lines 5–63)

- [ ] **Step 1: Read the current config**

```bash
cat modules/ui/eslint.config.mjs
```

Confirm the file structure (lines 1–63): import block, `unusedVarsRule`, `STYLE_RULES_DEFERRED` block, `withNuxt(...)` call with prod + test config blocks.

- [ ] **Step 2: Replace `STYLE_RULES_DEFERRED` with the 4 tier maps**

Replace lines 7–39 (the TODO comment + the `STYLE_RULES_DEFERRED` const) with the following:

```js
// Tier A: safety / correctness — `error`-enforced, all sites cleaned in followup #4.
const STYLE_RULES_TIER_A = {
  'vue/no-v-html': 'error',
  'vue/no-mutating-props': 'error',
};

// Tier B: code quality — `warn`, all sites cleaned (or zero sites) in followup #4.
// Includes 4 zero-violation rules enabled for future regression detection.
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
};

// Tier C: deferred — `warn`-signal, sites accumulate for a future focused session.
// ~89 live warnings expected after this commit (per followup #4 design spec §3).
// Future sessions can drive these to zero.
const STYLE_RULES_TIER_C_DEFERRED = {
  'nuxt/prefer-import-meta': 'warn',
  'vue/multi-word-component-names': 'warn',
  'vue/prop-name-casing': 'warn',
  'vue/require-default-prop': 'warn',
};

// Tier D: kept off — Prettier owns formatting; outdated for Vue 3; low value.
// Documented as intentional non-goals per the lint-rule-rollout spec §7.
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
};
```

Note: the dead `'@typescript-eslint/no-explicit-any': 'off'` entry from the old `STYLE_RULES_DEFERRED` is intentionally omitted (it was always overridden by the explicit setting after the spread).

- [ ] **Step 3: Update the `rules` block to spread the 4 tier maps**

In the prod config block (around line 46-51 in the original file), replace:

```js
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': unusedVarsRule,
      ...STYLE_RULES_DEFERRED,
      '@typescript-eslint/no-explicit-any': 'error',
    },
```

with:

```js
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': unusedVarsRule,
      ...STYLE_RULES_TIER_A,
      ...STYLE_RULES_TIER_B,
      ...STYLE_RULES_TIER_C_DEFERRED,
      ...STYLE_RULES_TIER_D_OFF,
      '@typescript-eslint/no-explicit-any': 'error',
    },
```

In the test config block (around line 56-61), apply the same change (the test block ends with `'@typescript-eslint/no-explicit-any': 'warn'` — keep that). The single change is replacing `...STYLE_RULES_DEFERRED` with the four spreads.

- [ ] **Step 4: Verify lint output**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -5
echo "exit=${PIPESTATUS[0]}"
```

Expected: `✖ N problems (18 errors, ~102 warnings)` where:
- **18 errors** = Tier A (`vue/no-v-html` 2 + `vue/no-mutating-props` 16); these are Tasks 2 + 3 work
- **~102 warnings** = 13 baseline + 89 Tier C + 0 Tier B (most are 0 sites today; the 13 to fix in Task 4 are warnings)

If the error count is not exactly 18, investigate before continuing — the Tier A enable should match the probed counts from the design spec.

- [ ] **Step 5: Verify vue-tsc still clean**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -3
echo "exit=${PIPESTATUS[0]}"
```

Expected: exit 0 (config restructure shouldn't affect tsc).

- [ ] **Step 6: Commit**

```bash
git add modules/ui/eslint.config.mjs
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-4): restructure STYLE_RULES_DEFERRED into 4 tier maps

Replace the flat STYLE_RULES_DEFERRED object with four named maps
documenting per-tier policy: Tier A (error, safety), Tier B (warn,
code quality), Tier C deferred (warn-signal, deferred fixes), Tier D
(off, Prettier-owned formatting).

Drops 1 dead-config entry: `@typescript-eslint/no-explicit-any: 'off'`
was overridden by the explicit setting after the spread and had no
effect. Removing makes the config honest.

Lint baseline shifts:
  - 18 NEW errors (Tier A: vue/no-v-html 2 + vue/no-mutating-props 16)
    — these are fixed in Tasks 2 + 3
  - 89 NEW warnings (Tier C deferred — visible signal, fixes deferred)
  - 4 rules enabled at warn with 0 current sites (future detection)

Per spec docs/specs/2026-06-03-lint-rollout-followup-4-style-rules-design.md
EOF
)"
```

`--no-verify` per refactor master plan §9.1 (pre-existing test failures unrelated to this change).

---

## Task 2: Fix `vue/no-v-html` (2 sites)

**Files:**
- Modify: `modules/ui/app/components/RecordPreview.vue:36`
- Modify: `modules/ui/app/pages/records/[type]/[id]/_components/RecordContentBody.vue:31`

Both sites likely render markdown content that has been sanitized via `isomorphic-dompurify` (already a project dep, see `modules/ui/package.json`). Per design §3 Tier A and §6.2, the policy for these sites is: keep `v-html` AND add a justified `eslint-disable-next-line vue/no-v-html` comment naming the sanitizer.

- [ ] **Step 1: Inspect each `v-html` usage**

```bash
sed -n '30,42p' modules/ui/app/components/RecordPreview.vue
sed -n '25,35p' modules/ui/app/pages/records/[type]/[id]/_components/RecordContentBody.vue
```

Look at the bound value. If it's directly the output of a sanitizer (e.g. `DOMPurify.sanitize(markdown)` or `sanitizeHtml(...)`), the disable-with-justification is correct. If it's raw user input passed directly to `v-html`, that's a real XSS bug — flag as DONE_WITH_CONCERNS.

- [ ] **Step 2: `RecordPreview.vue` — add justified disable**

In `modules/ui/app/components/RecordPreview.vue` line 36, add an `eslint-disable-next-line` directive immediately above the `v-html` usage. Example (adjust the comment based on the actual sanitization source you find):

```diff
+        <!-- eslint-disable-next-line vue/no-v-html -- content sanitized via isomorphic-dompurify before render -->
         <div v-html="sanitizedContent" />
```

(Adjust the actual line to match what's there — preserve indentation and surrounding markup.)

If you can't confirm a sanitizer is in the data flow, **STOP** and report DONE_WITH_CONCERNS with the file:line + the suspicion that this is an XSS gap.

- [ ] **Step 3: `RecordContentBody.vue` — add justified disable**

Same shape for `modules/ui/app/pages/records/[type]/[id]/_components/RecordContentBody.vue` line 31.

- [ ] **Step 4: Verify lint — 0 `vue/no-v-html` errors**

```bash
pnpm --filter @civicpress/ui exec eslint 'app/components/RecordPreview.vue' 'app/pages/records/[type]/[id]/_components/RecordContentBody.vue' 2>&1 | grep -c "vue/no-v-html"
```

Expected: `0`.

- [ ] **Step 5: Verify full ui lint**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -3
```

Expected: `16 errors` (down from 18 — only `vue/no-mutating-props` remaining for Task 3).

- [ ] **Step 6: Verify vue-tsc**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -3
echo "exit=${PIPESTATUS[0]}"
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add modules/ui/app/components/RecordPreview.vue modules/ui/app/pages/records/[type]/[id]/_components/RecordContentBody.vue
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-4): add justified vue/no-v-html disables (Tier A, 2 sites)

Both v-html usages render markdown content already sanitized via the
project's isomorphic-dompurify dep. Adding eslint-disable-next-line
directives with explicit XSS-safety rationale (the sanitizer call is
upstream in the data flow). The rule is now `error` repo-wide for
modules/ui, so any future raw v-html without sanitization fails lint.

Per spec docs/specs/2026-06-03-lint-rollout-followup-4-style-rules-design.md
EOF
)"
```

---

## Task 3: Fix `vue/no-mutating-props` (16 sites)

**Files:**
- Modify: `modules/ui/app/components/geography-form/GeographyBasicInfoCard.vue` (4 sites)
- Modify: `modules/ui/app/components/geography-form/GeographyDataCard.vue` (2 sites)
- Modify: `modules/ui/app/components/geography-form/GeographyMappingCard.vue` (9 sites)
- (likely 1 more site — confirm in Step 1 enumeration)

All 16 sites mutate a `form` prop passed down from `GeographyForm.vue` (or similar parent). This violates Vue's data-flow contract.

**Design choice for the fix:** Use Vue 3.4+ `defineModel` macro, which provides a two-way-bound writable ref. This is the modern idiomatic pattern for parent-child state sharing in Vue 3.

Mechanical shape (before):

```vue
const props = defineProps<{ form: GeographyFormData }>();
// later: props.form.category = newValue;  // ← mutation flagged
```

After:

```vue
const form = defineModel<GeographyFormData>('form', { required: true });
// later: form.value.category = newValue;  // ← legitimate write to local ref
```

The parent (`GeographyForm.vue`) changes from:

```vue
<GeographyBasicInfoCard :form="form" />
```

to:

```vue
<GeographyBasicInfoCard v-model:form="form" />
```

(The parent already passes a reactive ref / reactive object; v-model:form binds two-way.)

- [ ] **Step 1: Enumerate the exact 16 sites**

```bash
pnpm --filter @civicpress/ui exec eslint 'app/components/geography-form/**' --rule '{"vue/no-mutating-props": "error"}' 2>&1 | tee /tmp/lint-task-3-pre.txt | tail -20
```

Confirm the 16-site distribution (3+ files within `geography-form/`). Snapshot the exact per-file counts in case the design's distribution shifted.

- [ ] **Step 2: Read the parent component**

```bash
ls modules/ui/app/components/geography-form/
ls modules/ui/app/components/ | grep -i geography
```

Find the file that imports + renders the 3 card components. Likely `GeographyForm.vue` at one of:
- `modules/ui/app/components/GeographyForm.vue`
- `modules/ui/app/components/geography-form/GeographyForm.vue`

Read its template — find the `<GeographyBasicInfoCard>` / `<GeographyDataCard>` / `<GeographyMappingCard>` usage and how `form` flows in.

- [ ] **Step 3: Pilot the conversion on `GeographyBasicInfoCard.vue` (4 sites)**

Take the smallest of the 3 card files first. Convert `defineProps` to `defineModel` for the `form` prop. Update all 4 mutation sites to use `form.value.X = ...` (or just `form.X` if you destructure with `const form = defineModel(...)` and access the proxy).

The exact `defineModel` API in Vue 3.5:

```ts
// Required model:
const form = defineModel<FormType>('form', { required: true });

// Access:
form.value.field = newValue;  // OR if using reactive destructure pattern:
// (form.value as FormType).field = newValue;
```

If the existing code uses `props.form.X = Y`, change to `form.value.X = Y` (or `form.X = Y` if the type allows — Vue 3.5 supports object destructure of `defineModel` similarly to `defineProps`).

- [ ] **Step 4: Update the parent component**

In the parent file (found in Step 2), change:

```vue
<GeographyBasicInfoCard :form="form" />
```

to:

```vue
<GeographyBasicInfoCard v-model:form="form" />
```

The parent already has a `form` ref/reactive — `v-model:form` two-way-binds it.

- [ ] **Step 5: Verify lint for the pilot file**

```bash
pnpm --filter @civicpress/ui exec eslint 'app/components/geography-form/GeographyBasicInfoCard.vue' --rule '{"vue/no-mutating-props": "error"}' 2>&1 | tail -3
```

Expected: 0 `vue/no-mutating-props` errors.

- [ ] **Step 6: Verify vue-tsc**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -5
echo "exit=${PIPESTATUS[0]}"
```

Expected: exit 0. If new type errors appear in the pilot file's parent, you need to update the parent's binding form too.

- [ ] **Step 7: Verify UI tests**

```bash
pnpm test:ui:run 2>&1 | tail -5
```

Expected: matches pre-change `UI_TEST_BASELINE`. If a geography-form test fails, the v-model conversion may have broken something — investigate before continuing.

- [ ] **Step 8: Repeat for `GeographyDataCard.vue` (2 sites)**

Same conversion pattern. Update the parent's `<GeographyDataCard>` binding to `v-model:form`.

Verify lint + vue-tsc + tests as in Steps 5–7.

- [ ] **Step 9: Repeat for `GeographyMappingCard.vue` (9 sites)**

Same conversion. This is the biggest file (9 mutation sites). Each site should follow the same `props.form.X = ...` → `form.value.X = ...` (or equivalent) pattern.

Verify lint + vue-tsc + tests.

- [ ] **Step 10: If there's a 16th site outside geography-form, fix it**

If the design's 16-count differed from the actual enumeration in Step 1, address the leftover site here. Apply the appropriate pattern (`defineModel` if it's a mutated prop; emit-up if the data flow doesn't fit `defineModel`).

If any site can't be cleanly converted (e.g. mutation is part of a complex parent-managed sub-state), **flag as DONE_WITH_CONCERNS**:
- Keep the `eslint-disable-next-line vue/no-mutating-props` directive with a comment naming the architectural reason
- Surface as a finding in `lint-followups-surfaced-findings` memory

- [ ] **Step 11: Final lint check for all geography-form**

```bash
pnpm --filter @civicpress/ui exec eslint 'app/components/geography-form/**' --rule '{"vue/no-mutating-props": "error"}' 2>&1 | tail -3
```

Expected: 0 errors. Full ui lint should now show 0 `vue/no-mutating-props` errors:

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | grep -c "vue/no-mutating-props"
```

Expected: 0.

- [ ] **Step 12: Verify full ui lint, vue-tsc, tests**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -3
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -3 ; echo "exit=${PIPESTATUS[0]}"
pnpm test:ui:run 2>&1 | tail -5
```

Expected: 0 errors total (Tier A fully cleaned); vue-tsc exit 0; UI tests match baseline.

- [ ] **Step 13: Commit**

```bash
git add modules/ui/app/components/geography-form modules/ui/app/components/GeographyForm.vue
# Also any other parent file you needed to update
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-4): convert geography-form cards to defineModel (Tier A, 16 sites)

Three geography-form card components (BasicInfoCard, DataCard,
MappingCard) previously mutated a `form` prop directly — a Vue 3
data-flow violation flagged by vue/no-mutating-props. Converted each
card's `defineProps<{ form: ... }>()` to `defineModel('form', ...)`,
which Vue 3.5 provides as a two-way-bound writable ref. Parent
GeographyForm.vue (and any sibling parents) updated from
`:form="..."` to `v-model:form="..."` accordingly.

End state: the cards write to `form.value.X` (their local model
proxy) instead of `props.form.X`. The parent owns the state; the
v-model binding propagates updates both directions consistent with
Vue's data-flow contract.

If any site needed a justified eslint-disable-next-line (because the
conversion would expand scope beyond this followup), it's documented
with a comment naming the architectural reason. Concerns flagged in
the commit body or surfaced-findings memory.

Per spec docs/specs/2026-06-03-lint-rollout-followup-4-style-rules-design.md
EOF
)"
```

---

## Task 4: Fix Tier B-cheap (13 sites)

**Files:**
- Modify: `modules/ui/app/pages/records/[type]/index.vue:534` + `modules/ui/app/pages/records/index.vue:412` (`vue/v-on-event-hyphenation`, 2 sites)
- Modify: `modules/ui/app/components/GeographyLinkDisplay.vue:43` + `modules/ui/app/pages/settings/profile.vue:343` (`vue/no-deprecated-filter`, 2 sites)
- Modify: `modules/ui/app/composables/useLoading.ts:48` (`@typescript-eslint/no-dynamic-delete`, 1 site)
- Modify: `modules/ui/app/composables/useRecordSidebar.ts:33-34` (`@typescript-eslint/unified-signatures`, 3 sites)
- Modify: `modules/ui/app/components/GeographyMap.vue:27`, `modules/ui/app/composables/useRecordStatuses.ts:18` + 3 more sites (`import/first`, 5 sites)

Each rule's fix has a different shape.

- [ ] **Step 1: Fix `vue/v-on-event-hyphenation` (2 sites)**

In `modules/ui/app/pages/records/[type]/index.vue:534` and `modules/ui/app/pages/records/index.vue:412`, rename the event listener from camelCase to kebab-case:

```diff
-          @resetFilters="..."
+          @reset-filters="..."
```

This is a template-side change. The emitting side (likely `RecordSearch.vue` or similar) is already kebab-case — Vue templates require kebab-case for v-on events.

Verify after edit:

```bash
pnpm --filter @civicpress/ui exec eslint 'app/pages/records/[type]/index.vue' 'app/pages/records/index.vue' --rule '{"vue/v-on-event-hyphenation": "error"}' 2>&1 | tail -3
```

Expected: 0 errors.

- [ ] **Step 2: Fix `vue/no-deprecated-filter` (2 sites)**

In `modules/ui/app/components/GeographyLinkDisplay.vue:43` and `modules/ui/app/pages/settings/profile.vue:343`, replace Vue 2 `|` filter syntax with a method call.

Inspect the surrounding context:

```bash
sed -n '40,46p' modules/ui/app/components/GeographyLinkDisplay.vue
sed -n '340,346p' modules/ui/app/pages/settings/profile.vue
```

Typical conversion:

```diff
-          {{ someValue | someFilter }}
+          {{ someFilter(someValue) }}
```

Confirm `someFilter` is imported/defined in the script. If it's a global Vue 2 filter that no longer exists in Vue 3, replace with the equivalent inline expression (e.g., `Date` formatting, `.toLocaleString()`, etc.).

Verify:

```bash
pnpm --filter @civicpress/ui exec eslint 'app/components/GeographyLinkDisplay.vue' 'app/pages/settings/profile.vue' --rule '{"vue/no-deprecated-filter": "error"}' 2>&1 | tail -3
```

Expected: 0 errors.

- [ ] **Step 3: Fix `@typescript-eslint/no-dynamic-delete` (1 site)**

In `modules/ui/app/composables/useLoading.ts:48`, inspect:

```bash
sed -n '45,52p' modules/ui/app/composables/useLoading.ts
```

Replace `delete obj[dynamicKey]` with a non-deleting alternative. Most common patterns:

```diff
-      delete loadingStates[key];
+      const { [key]: _removed, ...rest } = loadingStates;
+      loadingStates = rest;
```

OR if `loadingStates` is a `Map`:

```diff
-      delete loadingStates[key];
+      loadingStates.delete(key);
```

OR if it must remain an object literal and the dynamic-delete-as-warn is genuinely the right tool:

```diff
+      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- intentional Record cleanup; key from controlled vocabulary
       delete loadingStates[key];
```

(The third option requires the comment to name a justification — typically that the key comes from a controlled vocabulary, not user input.)

Verify:

```bash
pnpm --filter @civicpress/ui exec eslint 'app/composables/useLoading.ts' --rule '{"@typescript-eslint/no-dynamic-delete": "error"}' 2>&1 | tail -3
```

Expected: 0 errors.

- [ ] **Step 4: Fix `@typescript-eslint/unified-signatures` (3 sites in useRecordSidebar.ts:33-34)**

Inspect:

```bash
sed -n '28,40p' modules/ui/app/composables/useRecordSidebar.ts
```

The 3 lint messages indicate overloaded function signatures that share a body and can be unified into a single signature with a union-typed parameter. Pattern:

```diff
-function onUpdate(field: 'update:recordType', value: string): void;
-function onUpdate(field: 'update:status', value: string): void;
-function onUpdate(field: 'update:workflowState', value: string): void;
-function onUpdate(field: string, value: string): void {
+function onUpdate(field: 'update:recordType' | 'update:status' | 'update:workflowState', value: string): void {
   // body
}
```

(Adjust based on actual signatures in the file.)

Verify:

```bash
pnpm --filter @civicpress/ui exec eslint 'app/composables/useRecordSidebar.ts' --rule '{"@typescript-eslint/unified-signatures": "error"}' 2>&1 | tail -3
```

Expected: 0 errors.

- [ ] **Step 5: Fix `import/first` (5 sites)**

Enumerate all 5 sites:

```bash
pnpm --filter @civicpress/ui exec eslint . --rule '{"import/first": "error"}' 2>&1 | grep -B1 "import/first" | head -15
```

For each site, move the offending import statement to the top of the file (alongside the other imports). The rule is mechanical: imports must come before any non-import statement.

If a script-only declaration must precede an import for some side-effect reason, that's an unusual case — flag as DONE_WITH_CONCERNS and add an `eslint-disable-next-line import/first` with the reason.

Verify:

```bash
pnpm --filter @civicpress/ui exec eslint . --rule '{"import/first": "error"}' 2>&1 | tail -3
```

Expected: 0 errors.

- [ ] **Step 6: Verify all Tier B-cheap rules clean**

```bash
for rule in "vue/v-on-event-hyphenation" "vue/no-deprecated-filter" "@typescript-eslint/no-dynamic-delete" "@typescript-eslint/unified-signatures" "import/first"; do
  count=$(pnpm --filter @civicpress/ui exec eslint . --rule "{\"$rule\": \"error\"}" 2>&1 | grep -c "$rule")
  echo "$count violations for $rule"
done
```

Expected: all 5 rules at 0.

- [ ] **Step 7: Verify full ui lint, vue-tsc, tests**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -3
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -3 ; echo "exit=${PIPESTATUS[0]}"
pnpm test:ui:run 2>&1 | tail -5
```

Expected: 0 errors. Warning count ~ 89 (the deferred Tier C — 33 + 35 + 4 + 17). vue-tsc exit 0. UI tests match baseline.

- [ ] **Step 8: Commit**

```bash
git add modules/ui/app/pages/records modules/ui/app/components/GeographyLinkDisplay.vue modules/ui/app/pages/settings/profile.vue modules/ui/app/composables/useLoading.ts modules/ui/app/composables/useRecordSidebar.ts modules/ui/app/components/GeographyMap.vue modules/ui/app/composables/useRecordStatuses.ts
# Also add any other files touched by the import/first fixes
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-4): clean Tier B-cheap code-quality rules (13 sites)

Fixed 13 violations across 5 rules per spec §3:
  - vue/v-on-event-hyphenation (2): @resetFilters → @reset-filters
    in records page template handlers
  - vue/no-deprecated-filter (2): Vue 2 `|` filter syntax → method
    call in GeographyLinkDisplay and profile pages
  - @typescript-eslint/no-dynamic-delete (1): destructure-and-spread
    replacement for `delete obj[key]` in useLoading composable
  - @typescript-eslint/unified-signatures (3): merge overloaded
    onUpdate signatures in useRecordSidebar into a union-typed param
  - import/first (5): move scripted imports to top-of-file across
    GeographyMap, useRecordStatuses, + 3 more files

Per spec docs/specs/2026-06-03-lint-rollout-followup-4-style-rules-design.md
EOF
)"
```

---

## Task 5: Final verification + merge to `dev` (closes lint-rollout backlog)

- [ ] **Step 1: Branch state check**

```bash
git log --oneline dev..HEAD
```

Expected: 4 commits (Tasks 1–4).

- [ ] **Step 2: Full repo lint check**

```bash
pnpm run lint 2>&1 | tail -3
```

Expected: `0 errors` repo-wide. Warning counts:
- core, cli, api, storage: unchanged from prior followups
- ui: ~89 warnings (89 Tier C deferred + 0 cleaned violations remaining; baseline 13 was non-unused-vars warnings now mostly absorbed/recategorized)

Spot-check each workspace:

```bash
for ws in core cli api ui storage; do
  printf "%-10s: " "$ws"
  pnpm --filter @civicpress/$ws exec eslint . 2>&1 | tail -2 | head -1
done
```

Each should show `0 errors`.

- [ ] **Step 3: Switch to `dev` and confirm clean state**

```bash
git checkout dev
git status -sb
```

Expected: `## dev`, clean tree.

- [ ] **Step 4: Merge with `--no-ff` and closure summary**

```bash
git merge --no-ff --no-verify refactor/lint-followup-4-style-rules -m "$(cat <<'EOF'
Merge branch 'refactor/lint-followup-4-style-rules' — #4 CLOSED, lint backlog COMPLETE

Triaged the 27 rules in modules/ui/eslint.config.mjs
STYLE_RULES_DEFERRED into a 4-tier disposition matrix:
  - Tier A (2 rules, 18 sites): enabled `error`, all fixed this session
  - Tier B (9 rules, 13 sites): enabled `warn`, all fixed this session
    (4 of the 9 rules have 0 sites today — enabled for future
    regression detection)
  - Tier C deferred (4 rules, 89 sites): enabled `warn`, fixes
    deferred to a focused session (nuxt/prefer-import-meta 33,
    vue/multi-word-component-names 35, vue/prop-name-casing 4,
    vue/require-default-prop 17)
  - Tier D (11 rules): kept `off` with documented policy (Prettier
    owns formatting, outdated for Vue 3, etc.)
  - Dead config: dropped 1 entry (@typescript-eslint/no-explicit-any:
    'off' was overridden after the spread)

Task 2 (vue/no-v-html, 2 sites): added eslint-disable-next-line
directives with explicit XSS-safety rationale to RecordPreview.vue
and RecordContentBody.vue — both render markdown sanitized via
isomorphic-dompurify upstream.

Task 3 (vue/no-mutating-props, 16 sites): converted the 3 geography-
form card components from `defineProps<{ form: ... }>()` to
`defineModel('form', ...)`, restoring Vue's data-flow contract.
Parent GeographyForm.vue switched from `:form="..."` to
`v-model:form="..."`. End state: cards write to their local model
proxy; parent owns state; updates propagate two-way.

Task 4 (Tier B-cheap, 13 sites): 5 mechanical/easy rules cleaned
across 7+ files.

LINT-ROLLOUT BACKLOG COMPLETE. All four numbered followups closed:
  - #1 unused-vars umbrella (459 sites, 5 workspaces) at 82e3c1b
  - #2 Vue-template no-explicit-any (13 sites) at d7447b4
  - #3 modules/ui cruft deps at 3103a74
  - #4 STYLE_RULES_DEFERRED triage (31 fixed + 89 deferred-signal)
    at THIS merge
Plus the 2-file useTypedI18n mini-migration at 7d81b51.

Per [[lint-followups-before-phase-3]] policy, Phase 3 (realtime
reintroduction, Yjs-only) is now UNBLOCKED. The 89 deferred-tier
warnings + the 8 + sub-finding #3.1 still-open surfaced findings
remain as a separate "interface-truth" / "code-quality polish"
follow-on track, not gating Phase 3.

Spec: docs/specs/2026-06-03-lint-rollout-followup-4-style-rules-design.md
Plan: docs/plans/2026-06-03-lint-rollout-followup-4-style-rules.md
EOF
)"
```

Expected: merge commit created.

- [ ] **Step 5: Post-merge verification on `dev`**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -3
```

Expected: `0 errors`. ~89 warnings (Tier C deferred — known).

- [ ] **Step 6: Delete the implementation branch**

```bash
git branch -d refactor/lint-followup-4-style-rules
```

Expected: `Deleted branch refactor/lint-followup-4-style-rules`.

Per refactor push policy: do **not** push to origin.

- [ ] **Step 7: Update followup memory**

Capture merge SHA:

```bash
git log --oneline -1
```

Record as `MERGE_SHA`.

In `/Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/lint-rollout-2026-06-02-followups.md`:

Mark #4 closed with merge SHA + per-tier outcome. **Mark the entire lint-rollout backlog as COMPLETE.** Add a "Deferred Tier C work" entry capturing the 89 violations + the 4 rules for a future session.

In `MEMORY.md` index: update the followup hook line — lint backlog COMPLETE; Phase 3 unblocked.

In `refactor-2026-05-master-plan.md` description: append #4 closure SHA; note Phase 3 is now unblocked per [[lint-followups-before-phase-3]]; remove the "Next: lint backlog #4" pointer and replace with "Next: Phase 3 (realtime reintroduction, Yjs-only)".

In `lint-followups-surfaced-findings.md`: append any new surfaced findings from this session (especially from Task 3 — any geography-form sites that needed eslint-disable-next-line with architectural rationale).

Optional new memory file: `lint-style-rules-deferred-tier-c.md` capturing the 89 deferred violations + the 4 rules + per-rule fix sketches, so a future session has a single-page pickup inventory.

Memory files are not in the project repo; no commit needed.

- [ ] **Step 8: Verify memory files are well-formed**

```bash
head -10 /Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/lint-rollout-2026-06-02-followups.md
head -30 /Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/MEMORY.md
```

---

## Final verification gate (re-stated)

Before declaring the followup done:

- [ ] `pnpm --filter @civicpress/ui exec eslint .` exits 0 — 0 errors / ~89 warnings (Tier C deferred — known)
- [ ] `pnpm run lint` (repo-wide) shows 0 errors across all 5 workspaces
- [ ] `pnpm --filter @civicpress/ui exec vue-tsc --noEmit` exit 0
- [ ] `pnpm test:ui:run` matches pre-change `UI_TEST_BASELINE`
- [ ] `pnpm test:run` matches pre-change `TEST_BASELINE_PASS/FAIL/SKIP` (no new failures)
- [ ] `modules/ui/eslint.config.mjs` has 4 tier maps (Tier A, B, C-deferred, D-off) with documented policy comments; the dead `@typescript-eslint/no-explicit-any: 'off'` is gone
- [ ] `git diff --stat dev~1..dev -- modules/ui/` touches only `modules/ui/app/**` and `modules/ui/eslint.config.mjs`
- [ ] No files outside `modules/ui/` modified
- [ ] All commits used `--no-verify` per master plan §9.1
- [ ] Feature branch deleted; no push to origin
- [ ] Followup memory updated with merge SHA + lint backlog marked COMPLETE
- [ ] Any new surfaced findings (esp. from Task 3 geography-form work) appended to `lint-followups-surfaced-findings.md`
- [ ] Master plan memory + MEMORY.md hook reflect Phase 3 as next
