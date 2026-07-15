# Lint-rollout followup #2 — Vue-template `no-explicit-any` blind-spot closure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the 13 `as any` casts that currently live inside `<template>` regions in `modules/ui/app/**/*.vue` by moving the unsafe coercion into `<script setup>` (where `@typescript-eslint/no-explicit-any: error` actually fires) or removing it entirely by typing the source. The 13 inert HTML-comment disable directives disappear as a natural consequence.

**Architecture:** Four pattern-grouped tasks on a single feature branch off `dev`. Each task targets one pattern's sites (A: UBadge color, B: USelectMenu/UInput model-value, C: i18n plural via new `useTypedI18n` composable, D: template iteration cast). Per-pattern verification (eslint + targeted vue-tsc + test subset) before commit. Final merge `--no-ff` to `dev`.

**Tech Stack:** Vue 3 SFC `<script setup lang="ts">`, Nuxt 4, `@nuxt/ui` v4, vue-i18n, ESLint v9 flat config with `@typescript-eslint/no-explicit-any: error` (warn for tests).

**Spec:** `docs/specs/2026-06-02-lint-rollout-followup-2-vue-template-any-design.md` (commit `928df42`).

---

## File map

| Path | Change | Pattern |
|---|---|---|
| `modules/ui/app/composables/useTypedI18n.ts` | **CREATE** | C |
| `modules/ui/app/types/nuxt-ui-bridge.ts` | **CREATE (conditional)** | A |
| `modules/ui/app/components/GeographyLinkedRecords.vue` | Modify | A |
| `modules/ui/app/components/GeographySelector.vue` | Modify | A + C |
| `modules/ui/app/pages/settings/users/index.vue` | Modify | A |
| `modules/ui/app/components/records/LinkedRecordList.vue` | Modify | B |
| `modules/ui/app/components/records/RecordLinkSelector.vue` | Modify | C |
| `modules/ui/app/components/geography-form/GeographyMappingCard.vue` | Modify | B (×2) |
| `modules/ui/app/components/geography-form/GeographyBasicInfoCard.vue` | Modify | B (×2) |
| `modules/ui/app/components/storage/FileBrowserPopover.vue` | Modify | C |
| `modules/ui/app/components/storage/file-browser/FileBrowserList.vue` | Modify | C |
| `modules/ui/app/pages/records/[type]/[id]/_components/AdditionalInfoPanel.vue` | Modify | D |

11 existing files modified, 1 new composable, 1 new types-bridge file (only if needed per pre-flight Step 5).

---

## Pre-flight (do once, before Task 1)

- [ ] **Step 1: Confirm clean working tree on `dev`**

```bash
cd /Users/stakabo/Work/repos/civicpress/civicpress
git status -sb
```

Expected: `## dev`, no modified or untracked files. HEAD should be `928df42` (or later if other work landed).

- [ ] **Step 2: Confirm pnpm and corepack state**

```bash
pnpm --version
```

Expected: `9.15.9`. If not, run `corepack enable && corepack prepare pnpm@9.15.9 --activate`.

- [ ] **Step 3: Capture pre-change lint baseline**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tee /tmp/lint-baseline-followup-2.txt | tail -3
```

Expected final line: `✖ 115 problems (0 errors, 115 warnings)`. Record this exact number as `BASELINE` (used for diffing after each task).

Also count the inert template disables:

```bash
grep -rn "<!-- eslint-disable-next-line @typescript-eslint/no-explicit-any" modules/ui/app --include="*.vue" | wc -l
```

Expected: `13`.

- [ ] **Step 4: Capture pre-change vue-tsc baseline**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tee /tmp/vue-tsc-baseline-followup-2.txt | tail -10
echo "exit=${PIPESTATUS[0]}"
```

Record the exit code and the trailing summary lines. If exit is 0, the gate is "vue-tsc stays 0 after each task." If exit is non-zero, the gate is "vue-tsc error count never increases" — capture the exact count.

- [ ] **Step 5: Probe Nuxt UI color-union type (informs Pattern A)**

```bash
grep -rn "BadgeColor\|export type.*Color\|export.*Color" node_modules/@nuxt/ui/dist 2>/dev/null | grep -v ".map" | head -20
```

If `BadgeColor` (or a similarly-named export) appears in `@nuxt/ui`'s public `.d.ts`, Task 1 imports it directly. If nothing useful surfaces, Task 1 creates `modules/ui/app/types/nuxt-ui-bridge.ts` with a local union.

Record the decision: `NUXT_UI_COLOR_SOURCE` = `import` OR `bridge`.

- [ ] **Step 6: Capture pre-change UI test count baseline**

```bash
pnpm --filter @civicpress/ui exec vitest run 2>&1 | tail -5
```

Expected: per memory, `138/138` passing for UI tests. Record the exact count as `TEST_BASELINE`. (`pnpm test:ui:run` from repo root is the equivalent.)

- [ ] **Step 7: Create the implementation branch**

```bash
git checkout -b refactor/lint-followup-2-vue-template-any
git status -sb
```

Expected: `## refactor/lint-followup-2-vue-template-any`.

---

## Task 1: Pattern A — UBadge color helpers (3 sites)

**Files:**
- Modify: `modules/ui/app/components/GeographyLinkedRecords.vue` (helper at line ~132; template at line 58-60)
- Modify: `modules/ui/app/components/GeographySelector.vue` (helper for `getCategoryColor`; template at line 80-82)
- Modify: `modules/ui/app/pages/settings/users/index.vue` (helper for `getRoleColor`; template at line 160-162)
- Create (conditional): `modules/ui/app/types/nuxt-ui-bridge.ts` (only if `NUXT_UI_COLOR_SOURCE = bridge`)

- [ ] **Step 1: If `NUXT_UI_COLOR_SOURCE = bridge`, create the bridge file**

`modules/ui/app/types/nuxt-ui-bridge.ts`:

```ts
// Local mirror of @nuxt/ui v4 color tokens.
// Kept in sync with the public color docs; @nuxt/ui v4 does not export
// this union publicly. Update when @nuxt/ui's color palette changes.
export type NuxtUiColor =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'info'
  | 'warning'
  | 'error'
  | 'neutral';
```

If `NUXT_UI_COLOR_SOURCE = import`, skip this step.

- [ ] **Step 2: Update `GeographyLinkedRecords.vue` helper return type**

Locate the helper near line 132. Change:

```ts
// before
const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    draft: 'gray',
    published: 'green',
    archived: 'orange',
    pending: 'yellow',
    approved: 'green',
    rejected: 'red',
  };
  return colors[status] || 'gray';
};
```

to (assuming `bridge` path; if `import` path, change `NuxtUiColor` to the imported type name and adjust the import line):

```ts
import type { NuxtUiColor } from '~/types/nuxt-ui-bridge';

const getStatusColor = (status: string): NuxtUiColor => {
  const colors: Record<string, NuxtUiColor> = {
    draft: 'neutral',
    published: 'success',
    archived: 'warning',
    pending: 'warning',
    approved: 'success',
    rejected: 'error',
  };
  return colors[status] || 'neutral';
};
```

Note the value remap: original used `gray`/`green`/`orange`/`yellow`/`red`, which were string literals that Nuxt UI v4 doesn't accept directly. Verified-correct mapping uses the v4 semantic-color tokens (`neutral`/`success`/`warning`/`error`).

If `vue-tsc` later complains the existing color strings (`gray`/`green`/...) are wrong — confirm the v4 mapping with the design owner before merging. The mapping above is the conservative default. If the user wants to preserve the literal palette as-is, revert this commit's color values; this would surface as a UI design concern, not a type-safety regression.

- [ ] **Step 3: Remove the template disable + cast in `GeographyLinkedRecords.vue`**

At line 58-60:

```diff
-            <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
             <UBadge
-              :color="getStatusColor(record.status) as any"
+              :color="getStatusColor(record.status)"
```

- [ ] **Step 4: Repeat Steps 2 + 3 for `GeographySelector.vue`**

Find `getCategoryColor`. Apply the same return-type narrowing and the same template cleanup at line 80-82.

- [ ] **Step 5: Repeat Steps 2 + 3 for `pages/settings/users/index.vue`**

Find `getRoleColor`. Apply the same return-type narrowing and the template cleanup at line 160-162.

- [ ] **Step 6: Lint check**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -3
```

Expected: `✖ 112 problems (0 errors, 112 warnings)` — warning count dropped by 3 (three "Unused eslint-disable directive" warnings gone).

If error count is non-zero, STOP and investigate. The most likely cause is a Nuxt UI color string that doesn't match `NuxtUiColor` — see Step 2 note about the v4 palette mapping.

- [ ] **Step 7: vue-tsc check (scoped to the three files)**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -10
echo "exit=${PIPESTATUS[0]}"
```

Expected: matches the pre-change baseline from Pre-flight Step 4. No new errors.

If new errors mention these three files, fix the color values (per Step 2 note) and retry.

- [ ] **Step 8: Run UI tests**

```bash
pnpm --filter @civicpress/ui exec vitest run 2>&1 | tail -5
```

Expected: matches `TEST_BASELINE` (138/138 if memory's number is current).

- [ ] **Step 9: Commit**

```bash
git add modules/ui/app/components/GeographyLinkedRecords.vue \
        modules/ui/app/components/GeographySelector.vue \
        modules/ui/app/pages/settings/users/index.vue
# Only if Step 1 created the bridge file:
git add modules/ui/app/types/nuxt-ui-bridge.ts 2>/dev/null || true
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-2): pattern A — type UBadge color helpers (3 sites)

The three local helpers (getStatusColor / getCategoryColor /
getRoleColor) previously returned `string`, forcing `as any` at every
<UBadge :color> binding to bypass Nuxt UI v4's narrower color union.
Returning the typed union directly removes the cast in three templates
and lets vue-tsc catch mismatched palette values.

Sites closed: GeographyLinkedRecords.vue:60, GeographySelector.vue:82,
pages/settings/users/index.vue:162.

Spec: docs/specs/2026-06-02-lint-rollout-followup-2-vue-template-any-design.md
EOF
)"
```

`--no-verify` per refactor master plan §9.1 (pre-existing test failures on `dev` trip the pre-commit hook; memory `refactor-no-verify-policy`).

---

## Task 2: Pattern B — USelectMenu/UInput model-value (5 sites)

**Files:**
- Modify: `modules/ui/app/components/records/LinkedRecordList.vue` (template line 61-63; script around line 170)
- Modify: `modules/ui/app/components/geography-form/GeographyMappingCard.vue` (template lines 22-24 + 179-181; script determined in Task 2 Step 1 inspection)
- Modify: `modules/ui/app/components/geography-form/GeographyBasicInfoCard.vue` (template lines 47-49 + 64-66; script determined in Task 2 Step 1 inspection)

- [ ] **Step 1: Inspect each binding's true expected type**

Run for each site:

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | grep -E "LinkedRecordList|GeographyMappingCard|GeographyBasicInfoCard" | head -30
```

If `vue-tsc` emits errors at these sites *after* you remove the `as any` cast experimentally, the error message names the expected type. Use that as the target.

If `vue-tsc` is silent at a site, the cast is unnecessary — just remove it.

- [ ] **Step 2: `LinkedRecordList.vue` — typed binding for `linkedRecord.category`**

Read the existing `LinkedRecord` interface (likely imported near top of `<script setup>`). If `LinkedRecord.category` is already typed (e.g. `string | undefined`), then the `<USelectMenu :model-value>` expects a wider/different type — most likely the option-key string union or the option type from `getLinkCategoryOptions()`.

In `<script setup>`, near the existing `linkedRecords` computed, add:

```ts
import type { LinkCategoryOption } from '~/composables/useLinkCategories'; // adjust path if different

// Typed bridge: USelectMenu :model-value expects the option's key string,
// not the LinkedRecord.category nullable string. Coerce here, lint-covered.
function categoryFor(linkedRecord: LinkedRecord): LinkCategoryOption['key'] | undefined {
  return linkedRecord.category as LinkCategoryOption['key'] | undefined;
}
```

The exact type name (`LinkCategoryOption['key']`) is a best-guess from the inspection in Step 1. If `useLinkCategories` doesn't export it, adapt to whatever the option items in `getLinkCategoryOptions()` look like — read that composable's exports.

Template change at line 61-63:

```diff
-            <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
             <USelectMenu
-              :model-value="linkedRecord.category as any"
+              :model-value="categoryFor(linkedRecord)"
```

Also clean up the pre-existing script-side `// eslint-disable-next-line` at line ~172 if the typed `categoryFor` covers it. If the disable still applies to `updateLinkCategory(index: number, newCategory: any)`, retype `newCategory` to the same `LinkCategoryOption['key']` and remove the disable.

- [ ] **Step 3: `GeographyMappingCard.vue` — first site (line 22-24)**

Read the file to find what `selectedPreset` is and what `presetOptions` looks like (likely a `defineProps` entry and an `Item[]`-shaped array). Identify the option's key type.

In `<script setup>`, declare a typed binding helper. If the parent already passes a typed `selectedPreset` prop, the cast might be wholly unnecessary — verify with vue-tsc before adding any new code.

Template change:

```diff
-          <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
           <USelectMenu
             :model-value="selectedPreset"
             @update:model-value="(val: any) => $emit('update:selected-preset', val)"
+            @update:model-value="(val) => $emit('update:selected-preset', val)"
```

If the inline arrow's `val` parameter can't be inferred, hoist the handler into `<script setup>`:

```ts
function onPresetUpdate(val: PresetKey): void {
  emit('update:selected-preset', val);
}
```

Then template: `@update:model-value="onPresetUpdate"`. The `PresetKey` type comes from whatever the preset option items declare.

Remove both the `<!--` template disable AND the inline `: any` parameter cast.

- [ ] **Step 4: `GeographyMappingCard.vue` — second site (line 179-181)**

Same approach for `<USelectMenu v-model="form.icon_mapping.apply_to">`. Inspect `form.icon_mapping.apply_to`'s declared type and the items array passed to USelectMenu. If the v-model's underlying ref is typed, removing the template `as any` is enough. If not, add a typed `WritableComputedRef` in `<script setup>`:

```ts
import { computed } from 'vue';

const applyToValue = computed({
  get: () => form.icon_mapping.apply_to as ApplyToKey,
  set: (v: ApplyToKey) => { form.icon_mapping.apply_to = v; },
});
```

Bind `v-model="applyToValue"` in the template.

- [ ] **Step 5: `GeographyBasicInfoCard.vue` — both sites (line 47-49 + 64-66)**

Same approach. The line-47 site binds `form.category`; the line-64 site binds `form.srid` to a `<UInput>`. For `<UInput :model-value>`, the expected type is typically `string | number | undefined` — narrow the binding accordingly.

If `form.srid` is a number, bind without `as any`:

```diff
-            <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
             <UInput
-              :model-value="form.srid"
+              :model-value="form.srid"
```

(If `vue-tsc` is now silent for this site after just removing the cast, the cast was always inert. Verify with vue-tsc in Step 7.)

- [ ] **Step 6: Lint check**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -3
```

Expected: `✖ 107 problems (0 errors, 107 warnings)` — warning count dropped by 5 more (Task 1's −3 plus Task 2's −5 = 115 → 107).

If errors appear, the most likely cause is a script-side cast that wasn't properly typed. Check the new `<script setup>` additions for stray `: any` or `as any`.

- [ ] **Step 7: vue-tsc check**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -10
echo "exit=${PIPESTATUS[0]}"
```

Expected: matches baseline. If new errors mention these 4 files, return to the affected step and adjust the typing.

- [ ] **Step 8: Run UI tests**

```bash
pnpm --filter @civicpress/ui exec vitest run 2>&1 | tail -5
```

Expected: matches `TEST_BASELINE`. If a v-model bug surfaces (per spec §7.4), capture the test failure and decide whether to fix at this site or document and revert to a script-side cast.

- [ ] **Step 9: Commit**

```bash
git add modules/ui/app/components/records/LinkedRecordList.vue \
        modules/ui/app/components/geography-form/GeographyMappingCard.vue \
        modules/ui/app/components/geography-form/GeographyBasicInfoCard.vue
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-2): pattern B — typed bindings for USelectMenu/UInput (5 sites)

Each cast moved from <template> to <script setup> as a typed computed,
typed binding helper, or a deliberately-narrower prop type. Where the
removal of the `as any` revealed the cast was already unnecessary, the
cast is gone entirely (no replacement needed).

Sites closed: LinkedRecordList.vue:63, GeographyMappingCard.vue:23,
GeographyMappingCard.vue:180, GeographyBasicInfoCard.vue:48,
GeographyBasicInfoCard.vue:65.

Spec: docs/specs/2026-06-02-lint-rollout-followup-2-vue-template-any-design.md
EOF
)"
```

---

## Task 3: Pattern C — `useTypedI18n` composable + 4 plural call sites

**Files:**
- Create: `modules/ui/app/composables/useTypedI18n.ts`
- Modify: `modules/ui/app/components/GeographySelector.vue` (template line 138; script uses `useI18n`)
- Modify: `modules/ui/app/components/records/RecordLinkSelector.vue` (template line 89)
- Modify: `modules/ui/app/components/storage/FileBrowserPopover.vue` (template line 95; script line 151 has `useI18n` already)
- Modify: `modules/ui/app/components/storage/file-browser/FileBrowserList.vue` (template line 136)

- [ ] **Step 1: Create the composable**

`modules/ui/app/composables/useTypedI18n.ts`:

```ts
import { useI18n } from 'vue-i18n';

/**
 * Thin wrapper over vue-i18n that adds a typed plural helper.
 *
 * The base `t` from `useI18n()` does not expose an overload for
 * `(key, count, named-args)` plural form under this project's typed
 * config, so direct callers cast to `any`. Centralising the cast in
 * one composable lets the rule actually fire everywhere else.
 */
export function useTypedI18n() {
  const i18n = useI18n();

  function tPlural(
    key: string,
    count: number,
    named: Record<string, unknown> = { count },
  ): string {
    // The only `as any` newly introduced by followup #2.
    // Reason: vue-i18n typed-t lacks an overload for the
    // (key, count, named-args) plural form used by these messages.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (i18n.t as any)(key, count, named);
  }

  return { ...i18n, tPlural };
}
```

- [ ] **Step 2: Update `FileBrowserPopover.vue`**

In `<script setup>` near line 151, change:

```diff
-const { t } = useI18n();
+const { t, tPlural } = useTypedI18n();
```

Add the import:

```ts
import { useTypedI18n } from '~/composables/useTypedI18n';
```

(Remove the original `useI18n` import if it's no longer needed in this file.)

In `<template>` at line 94-96, change:

```diff
-          <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
-          {{ (t as any)('common.selected', selectedFiles.length, { count: selectedFiles.length }) }}
+          {{ tPlural('common.selected', selectedFiles.length) }}
```

(The `{ count }` default in `tPlural` already supplies `count` as the named arg.)

- [ ] **Step 3: Update `FileBrowserList.vue`**

Same shape as Step 2. Find the existing `useI18n()` call in `<script setup>` (likely `const { t } = useI18n();`) and switch to `useTypedI18n()`. Template line 135-137:

```diff
-              <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
-              {{ (t as any)('settings.storage.filesSelected', selectedFiles.length, { count: selectedFiles.length }) }}
+              {{ tPlural('settings.storage.filesSelected', selectedFiles.length) }}
```

- [ ] **Step 4: Update `GeographySelector.vue`**

Same shape. Switch `useI18n` → `useTypedI18n` in `<script setup>`. Template line 136-140:

```diff
-        <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
         <span class="text-sm text-gray-500">
           {{
-            (t as any)('common.selected', selectedFiles.length, {
-              count: selectedFiles.length,
-            })
+            tPlural('common.selected', selectedFiles.length)
           }}
         </span>
```

- [ ] **Step 5: Update `RecordLinkSelector.vue`**

Same shape. Template line 88-92:

```diff
-        <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
         <span class="text-sm text-gray-500">
           {{
-            (t as any)('common.selected', selectedRecords.length, {
-              count: selectedRecords.length,
-            })
+            tPlural('common.selected', selectedRecords.length)
           }}
         </span>
```

- [ ] **Step 6: Lint check**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -3
```

Expected: `✖ 103 problems (0 errors, 103 warnings)` — Task 1's −3 + Task 2's −5 + Task 3's −4 = 115 → 103.

If errors appear, the most likely cause is the composable's eslint-disable comment being misplaced — verify it's `eslint-disable-next-line` on the line immediately above the `return (i18n.t as any)(...)`.

- [ ] **Step 7: vue-tsc check**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -10
echo "exit=${PIPESTATUS[0]}"
```

Expected: matches baseline. If `vue-tsc` rejects the `(i18n.t as any)` cast assigned back to `string`, fall back to **C-restructure** for the failing call sites: rewrite each `tPlural` caller to use a single named-args object that vue-i18n's typed-t already accepts. The composable can be deleted in that case; revert Step 1 if all 4 callers go that way.

- [ ] **Step 8: Run UI tests**

```bash
pnpm --filter @civicpress/ui exec vitest run 2>&1 | tail -5
```

Expected: matches `TEST_BASELINE`. Plural strings render identically since `tPlural` just adapts the call shape — no behavioral change.

- [ ] **Step 9: Commit**

```bash
git add modules/ui/app/composables/useTypedI18n.ts \
        modules/ui/app/components/storage/FileBrowserPopover.vue \
        modules/ui/app/components/storage/file-browser/FileBrowserList.vue \
        modules/ui/app/components/GeographySelector.vue \
        modules/ui/app/components/records/RecordLinkSelector.vue
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-2): pattern C — useTypedI18n composable + 4 plural sites

vue-i18n's typed `t` lacks an overload for the (key, count, named-args)
plural form used at 4 template sites. Adding a small useTypedI18n
composable centralises the cast (covered by a script-side
eslint-disable, the one place the rule's missing-overload blind spot
genuinely applies) and gives 4 templates a clean tPlural(key, count)
binding.

Sites closed: FileBrowserPopover.vue:95, FileBrowserList.vue:136,
GeographySelector.vue:138, RecordLinkSelector.vue:89.

Spec: docs/specs/2026-06-02-lint-rollout-followup-2-vue-template-any-design.md
EOF
)"
```

---

## Task 4: Pattern D — `AdditionalInfoPanel.vue` template iteration

**Files:**
- Modify: `modules/ui/app/pages/records/[type]/[id]/_components/AdditionalInfoPanel.vue` (template line 39-41; script determined in Task 2 Step 1 inspection)

- [ ] **Step 1: Inspect the parent's `entry` typing**

Read `<script setup>` of `AdditionalInfoPanel.vue`. Find the `entry` ref/prop and its declared type. The iteration site uses `entry.value as any[]` on the attendees branch — meaning `entry.value` is currently untyped (or `unknown`) when `entry.key === 'attendees'`.

- [ ] **Step 2: Add a typed attendees computed**

In `<script setup>`, near the existing logic, declare:

```ts
interface Attendee {
  name?: string;
  role?: string;
  status?: string;
  // Add any other fields the template reads from `attendee.*`.
  // Inspect the template body (lines 41-58) for the exhaustive list.
}

const attendees = computed<Attendee[]>(() => {
  if (entry.key !== 'attendees' || !Array.isArray(entry.value)) {
    return [];
  }
  return entry.value as Attendee[];
});
```

The `as Attendee[]` here is script-side and **is covered by the rule** — but the rule fires `no-explicit-any` only on `any`, not on arbitrary `as` coercions. So this is rule-compliant (no `any` anywhere) and lint-clean.

Inspect lines 41-58 of the template *before* finalising the `Attendee` interface — every `attendee.x` access in the template must have a matching optional field.

- [ ] **Step 3: Update the template**

Template at line 39-41:

```diff
              <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
              <li
-                v-for="(attendee, attendeeIndex) in (entry.value as any[])"
+                v-for="(attendee, attendeeIndex) in attendees"
```

Remove the `<!-- ... -->` disable comment one line up.

- [ ] **Step 4: Lint check**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -3
```

Expected: `✖ 102 problems (0 errors, 102 warnings)` — Task 1's −3 + Task 2's −5 + Task 3's −4 + Task 4's −1 = 115 → 102.

- [ ] **Step 5: vue-tsc check**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -10
echo "exit=${PIPESTATUS[0]}"
```

Expected: matches baseline. If `vue-tsc` complains about missing fields on `Attendee`, return to Step 2 and add them.

- [ ] **Step 6: Run UI tests**

```bash
pnpm --filter @civicpress/ui exec vitest run 2>&1 | tail -5
```

Expected: matches `TEST_BASELINE`.

- [ ] **Step 7: Commit**

```bash
git add "modules/ui/app/pages/records/[type]/[id]/_components/AdditionalInfoPanel.vue"
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-2): pattern D — typed attendees iteration (1 site)

The v-for over `entry.value` cast its source to `any[]` to handle the
attendees branch's untyped data shape. Replaced with an `attendees`
computed in <script setup> returning Attendee[] (typed locally from
the template's accessed fields). Cast moves to script and uses a real
interface, not `any`.

Sites closed: AdditionalInfoPanel.vue:41.

Spec: docs/specs/2026-06-02-lint-rollout-followup-2-vue-template-any-design.md
EOF
)"
```

---

## Task 5: Final verification + merge to `dev`

**Files:**
- No files modified — pure git + verification.

- [ ] **Step 1: Run the spec §6 verification gate top-to-bottom**

```bash
echo "=== Template disable comments remaining ===" && \
  grep -rn "<!-- eslint-disable-next-line @typescript-eslint/no-explicit-any" modules/ui/app --include="*.vue" | wc -l

echo "=== Inline 'as any' inside template-side regions (heuristic) ===" && \
  grep -rn "as any" modules/ui/app --include="*.vue" | grep -v "^\s*//" | head -20

echo "=== Lint final ===" && \
  pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -3

echo "=== vue-tsc final ===" && \
  pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -10

echo "=== UI tests final ===" && \
  pnpm --filter @civicpress/ui exec vitest run 2>&1 | tail -5
```

Expected:
- Template disable comments remaining: **0**
- `as any` heuristic: any matches must be inside `<script ...>` blocks only (visually verify the line numbers belong to script regions)
- Lint final: **0 errors, 102 warnings** (or `BASELINE − 13`)
- vue-tsc final: matches baseline from Pre-flight Step 4
- UI tests final: matches `TEST_BASELINE`

If any check fails, STOP — return to the failing task before merging.

- [ ] **Step 2: Inspect cumulative diff scope**

```bash
git diff --stat dev..HEAD
```

Expected: only files listed in the File map at the top of this plan. Eyeball for unexpected touched files.

- [ ] **Step 3: Switch to `dev` and confirm clean state**

```bash
git checkout dev
git status -sb
```

Expected: `## dev`, clean tree.

- [ ] **Step 4: Merge with `--no-ff` and closure summary**

```bash
git merge --no-ff --no-verify refactor/lint-followup-2-vue-template-any -m "$(cat <<'EOF'
Merge branch 'refactor/lint-followup-2-vue-template-any' — 2d-followup #2 CLOSED

Closed the Vue-template @typescript-eslint/no-explicit-any blind spot
by refactoring the 13 `as any` casts that lived inside <template>
regions to <script setup> (where the rule fires) or removing them by
typing the source. The 13 inert HTML-comment disable directives are
gone as a consequence — eslint warnings drop 115 → 102 on modules/ui.

Four pattern groups (one commit each):
  - Pattern A: type the UBadge color helpers (3 sites)
  - Pattern B: typed bindings for USelectMenu/UInput model-value (5 sites)
  - Pattern C: new useTypedI18n composable centralises the vue-i18n
    plural typed-t gap; 4 sites now call tPlural(key, count)
  - Pattern D: typed attendees iteration in AdditionalInfoPanel.vue

The rule's actual blind spot (template expressions not TS-linted by
@nuxt/eslint's Option A config) remains a tooling limitation but no
longer matters here: we don't put `as any` in templates anymore. The
only new `as any` introduced is one script-side cast in
useTypedI18n.ts, covered by a single eslint-disable comment with
clear justification.

Spec: docs/specs/2026-06-02-lint-rollout-followup-2-vue-template-any-design.md
Plan: docs/plans/2026-06-02-lint-rollout-followup-2-vue-template-any.md
EOF
)"
```

`--no-verify` per refactor master plan §9.1.

Expected: merge commit created on `dev`.

- [ ] **Step 5: Post-merge verification on `dev`**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -3
```

Expected: `✖ 102 problems (0 errors, 102 warnings)`.

- [ ] **Step 6: Delete the implementation branch**

```bash
git branch -d refactor/lint-followup-2-vue-template-any
```

Expected: `Deleted branch refactor/lint-followup-2-vue-template-any`.

Per refactor push policy: do **not** push to origin.

---

## Task 6: Update followup memory

**Files:**
- Modify: `/Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/lint-rollout-2026-06-02-followups.md`
- Modify: `/Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/MEMORY.md`
- Modify: `/Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/refactor-2026-05-master-plan.md`

- [ ] **Step 1: Capture the merge SHA**

```bash
git log --oneline -1
```

Record as `MERGE_SHA_2`.

- [ ] **Step 2: Update `lint-rollout-2026-06-02-followups.md`**

Replace item #2's body with:

```markdown
2. **Vue-template `no-explicit-any` blind spot. CLOSED 2026-06-02 (merge `<MERGE_SHA_2>`).** All 13 `as any` casts inside `<template>` regions in `modules/ui/app/**/*.vue` were refactored to `<script setup>` or removed by typing the source. The 13 inert HTML-comment disable directives are gone. Lint warnings on `modules/ui` dropped 115 → 102. The underlying ESLint blind-spot (template expressions not TS-linted under `@nuxt/eslint`'s Option A) remains a tooling limitation — but now moot in this codebase. Only new `as any` introduced: one script-side cast inside `composables/useTypedI18n.ts` (the vue-i18n typed-t plural overload gap), covered by a single eslint-disable.
```

If the inventory count needs correcting (memory previously said "~30 inert" but actual was 13), note that in the body.

- [ ] **Step 3: Update `MEMORY.md` hook line**

Replace the `lint-rollout-2026-06-02-followups.md` index line with:

```markdown
- [Lint-rule rollout 2026-06-02 followups](lint-rollout-2026-06-02-followups.md) — Phase 2d W3-T6 CLOSED on local dev (`656adb5`). #2 Vue-template `any` blind spot CLOSED 2026-06-02 (merge `<MERGE_SHA_2>`). #3 cruft deps CLOSED 2026-06-02 (merge `3103a74`). Still deferred: unused-vars cleanup (~600), ~30 vue/nuxt style rules.
```

- [ ] **Step 4: Update `refactor-2026-05-master-plan.md`**

In the front-matter `description`, append the #2 closure SHA next to the #3 mention.

In the body's "Followups deferred" line (the one currently listing remaining followups after #3 closure), strike out `#2 Vue-template no-explicit-any blind spot` with the merge SHA.

- [ ] **Step 5: Verify memory files are well-formed**

```bash
head -10 /Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/lint-rollout-2026-06-02-followups.md
head -30 /Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/MEMORY.md
head -5  /Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/refactor-2026-05-master-plan.md
```

Expected: frontmatter blocks intact, no orphan list markers, links resolve.

Memory files are not in the project git repo, so no commit needed here.

---

## Final verification gate (re-stated for clarity)

Before declaring the followup done:

- [ ] Zero `<!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->` directives in `modules/ui/app/**/*.vue`
- [ ] Zero `as any` inside `<template>` regions of any `.vue` file in `modules/ui/app`
- [ ] `pnpm --filter @civicpress/ui exec eslint .` exits 0, with 102 warnings (BASELINE − 13)
- [ ] `pnpm --filter @civicpress/ui exec vue-tsc --noEmit` matches pre-change baseline (no new errors)
- [ ] `pnpm --filter @civicpress/ui exec vitest run` matches `TEST_BASELINE` (138/138 or whatever was captured)
- [ ] Only one new `as any` introduced in the entire diff: the line in `useTypedI18n.ts` (script-side, eslint-disable directive present, justification comment present)
- [ ] No files modified outside the File map
- [ ] No push to origin
- [ ] Memory files updated; main `MEMORY.md` hook line accurate
