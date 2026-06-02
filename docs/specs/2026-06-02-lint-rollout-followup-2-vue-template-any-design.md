# Lint-rollout followup #2 — Vue-template `no-explicit-any` blind-spot closure

**Date:** 2026-06-02
**Status:** Approved (brainstorming gate)
**Predecessor:** `docs/specs/2026-05-28-lint-rule-rollout-design.md`
**Closure of parent:** `docs/audits/phase-2d-closure-report.md` (Phase 2d W3-T6 closed at merge `656adb5`)
**Sibling followup (closed):** `docs/specs/2026-06-02-lint-rollout-followup-3-modules-ui-cruft-deps-design.md` (closed at merge `3103a74`)
**Followup inventory:** memory `lint-rollout-2026-06-02-followups.md` (item #2 of 4)

---

## 1. Goal

Eliminate the 13 `as any` casts that currently live inside `<template>` regions in `modules/ui/app/**/*.vue` by moving the unsafe coercion into `<script setup>` (where `@typescript-eslint/no-explicit-any: error` actually fires) or removing it entirely by typing the source. The 13 inert HTML-comment disable directives that accompany them disappear as a natural consequence.

After this work, the codebase contains zero `as any` inside Vue template regions. The ESLint blind-spot (templates not being TS-checked under the current `@nuxt/eslint` Option A integration) remains as a tooling limitation, but it no longer matters in this codebase because we don't put unsafe casts in templates anymore.

## 2. Scope

**In scope** — 13 sites in 11 files in `modules/ui/app/**/*.vue` (component templates) + 1 new tiny composable file. Per-site work is script-only; templates only change to remove the now-redundant disable comments.

**Out of scope:**

- The 63 slash-comment disables (`// eslint-disable-next-line @typescript-eslint/no-explicit-any`) inside `<script>` blocks — these are real and suppress real findings; they're a flavor of followup #1 (unused-vars and friends).
- The `STYLE_RULES_DEFERRED` map in `modules/ui/eslint.config.mjs` — followup #4.
- Enabling any new ESLint rule (`vue/no-explicit-any` does not exist in `eslint-plugin-vue@10.9.1`).
- Wiring `vue-eslint-parser` + `@typescript-eslint/parser` overrides to lint template expressions with TS awareness. Memory considered this; it would expand scope and reverse part of followup #3. Rejected during brainstorming.
- Other workspaces (`core`, `cli`, `modules/api`, `modules/storage`) — none host Vue files.
- Any push to origin (refactor push policy: nothing until phase 7).

## 3. Current-state inventory

`grep -rn "<!-- eslint-disable-next-line @typescript-eslint/no-explicit-any" modules/ui/app --include="*.vue"` returns 13 hits. The currently-running `pnpm --filter @civicpress/ui exec eslint .` reports 13 "Unused eslint-disable directive" warnings — same count, same files, confirming the directives are inert and ESLint already calls them out.

### The 13 sites grouped by pattern

**Pattern A — UBadge `:color="helper() as any"` (3 sites)**

The helpers (`getStatusColor`, `getCategoryColor`, `getRoleColor`) are defined in `<script setup>` of each host component. Their return type is `string`, but `<UBadge :color>` expects a narrower union (Nuxt UI's `BadgeColor`, or its v4 equivalent).

| File | Line | Helper | Source |
|---|---|---|---|
| `components/GeographyLinkedRecords.vue` | 60 | `getStatusColor(record.status)` | local |
| `components/GeographySelector.vue` | 82 | `getCategoryColor(file.category)` | local |
| `pages/settings/users/index.vue` | 162 | `getRoleColor(user.role)` | local |

**Pattern B — USelectMenu/UInput `:model-value="x as any"` (5 sites)**

| File | Line | Bound expression | Component |
|---|---|---|---|
| `components/records/LinkedRecordList.vue` | 63 | `linkedRecord.category` | `<USelectMenu>` |
| `components/geography-form/GeographyMappingCard.vue` | 23 | `selectedPreset` | `<USelectMenu>` |
| `components/geography-form/GeographyMappingCard.vue` | 180 | `form.icon_mapping.apply_to` (`v-model`) | `<USelectMenu>` |
| `components/geography-form/GeographyBasicInfoCard.vue` | 48 | `form.category` | `<USelectMenu>` |
| `components/geography-form/GeographyBasicInfoCard.vue` | 65 | `form.srid` | `<UInput>` |

Note: `GeographyMappingCard.vue:23` has a sibling concern — its `@update:model-value="(val: any) => $emit(...)"` is a *script-side* `as any` that the rule already catches. It's in scope-by-association (same line block); the fix should clean both.

**Pattern C — i18n plural `(t as any)(key, count, { count })` (4 sites)**

`t` from `useI18n()` doesn't expose an overload for `(key, count, named-args)` plural in the project's current typed-config; callers cast to bypass.

| File | Line | Call |
|---|---|---|
| `components/GeographySelector.vue` | 138 | `(t as any)('common.selected', selectedFiles.length, { count: selectedFiles.length })` |
| `components/records/RecordLinkSelector.vue` | 89 | `(t as any)('common.selected', selectedRecords.length, { count: selectedRecords.length })` |
| `components/storage/FileBrowserPopover.vue` | 95 | `(t as any)('common.selected', selectedFiles.length, { count: selectedFiles.length })` |
| `components/storage/file-browser/FileBrowserList.vue` | 136 | `(t as any)('settings.storage.filesSelected', selectedFiles.length, { count: selectedFiles.length })` |

**Pattern D — `(entry.value as any[])` template iteration (1 site)**

| File | Line | Cast |
|---|---|---|
| `pages/records/[type]/[id]/_components/AdditionalInfoPanel.vue` | 41 | `v-for="(attendee, attendeeIndex) in (entry.value as any[])"` |

13 sites total: 3 + 5 + 4 + 1.

## 4. Approach per pattern

### Pattern A — type the color helper

For each of the 3 helpers, type the return value to Nuxt UI's color union. The exact type name (`BadgeColor`, `Color`, or another) needs confirmation from `@nuxt/ui` v4's exported types — see Risk §7.1.

Mechanical shape:

```ts
// before
function getStatusColor(s: Status): string {
  switch (s) { ... }
}

// after
import type { BadgeColor } from '#imports' // or wherever Nuxt UI exposes it
function getStatusColor(s: Status): BadgeColor {
  switch (s) { ... }
}
```

If `@nuxt/ui` does not export the union, reconstruct it locally:

```ts
type BadgeColor =
  | 'primary' | 'secondary' | 'success'
  | 'info' | 'warning' | 'error' | 'neutral'
```

Place such a local type in `types/nuxt-ui-bridge.ts` (one file, shared by the 3 helpers and any future Nuxt UI color callers). Template binding becomes `:color="getStatusColor(record.status)"` — no cast.

### Pattern B — typed binding via script-side computed

For each of the 5 sites, add a typed `computed` (or in the v-model case, a typed `WritableComputedRef`) in `<script setup>` that returns the right Nuxt UI generic type, and bind that computed in the template.

Mechanical shape (model-value):

```ts
// in <script setup>
const categoryItem = computed(() => linkedRecord.category as CategoryItem)
```

```vue
<!-- in <template> -->
<USelectMenu :model-value="categoryItem" ... />
```

The cast is now in script (covered by the rule) and consumers see a typed handle. If `CategoryItem` matches `USelectMenu`'s expected generic exactly, the `as` may be unnecessary — first attempt to remove it entirely.

For `GeographyMappingCard.vue:23`, also fix the sibling `@update:model-value="(val: any) => ..."` cast at the same time by moving the handler into a `<script setup>`-declared function with a typed `val` parameter.

### Pattern C — `tPlural` composable

Create `composables/useTypedI18n.ts` with a typed wrapper:

```ts
import { useI18n } from 'vue-i18n'

export function useTypedI18n() {
  const i18n = useI18n()
  function tPlural(
    key: string,
    count: number,
    named: Record<string, unknown> = { count },
  ): string {
    // The cast happens HERE — script-side, covered by the rule.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (i18n.t as any)(key, count, named)
  }
  return { ...i18n, tPlural }
}
```

The single `eslint-disable-next-line` directive sits in script, is the rule's actual blind spot for `t`'s missing overload, and is **truthful** (it suppresses a real finding). All 4 callers switch to `const { tPlural } = useTypedI18n()` and call `tPlural('common.selected', n)`.

If `vue-tsc` complains about the cast in the wrapper (it likely won't, because the cast is the whole point and `t` is itself typed permissively in this position), fall back to the C-restructure path: rewrite each of the 4 calls to use the named-args object that vue-i18n's typed-t actually accepts. C-restructure is the contingency; the primary path is the composable.

### Pattern D — typed iteration computed

In `AdditionalInfoPanel.vue`, introduce a typed computed in `<script setup>` for the iteration source.

```ts
interface Attendee { /* shape known from the data */ }
const attendees = computed(() => (entry.value as Attendee[]) ?? [])
```

```vue
<li v-for="(attendee, attendeeIndex) in attendees" ... />
```

Use `unknown[]` initially if the exact `Attendee` shape isn't known yet; tighten later. The point is: the cast moves to script, the template is clean.

## 5. File-level plan

| File | Lines touched (approx) | Pattern | New imports / files |
|---|---|---|---|
| `composables/useTypedI18n.ts` (NEW) | ~15 | C | — |
| `types/nuxt-ui-bridge.ts` (NEW, conditional on §7.1) | ~10 | A | — |
| `components/GeographyLinkedRecords.vue` | ~3 | A | maybe bridge type |
| `components/GeographySelector.vue` | ~6 | A + C | bridge + `useTypedI18n` |
| `pages/settings/users/index.vue` | ~3 | A | maybe bridge type |
| `components/records/LinkedRecordList.vue` | ~5 | B | — |
| `components/records/RecordLinkSelector.vue` | ~4 | C | `useTypedI18n` |
| `components/geography-form/GeographyMappingCard.vue` | ~10 (×2 sites + sibling cast) | B | — |
| `components/geography-form/GeographyBasicInfoCard.vue` | ~8 (×2 sites) | B | — |
| `components/storage/FileBrowserPopover.vue` | ~4 | C | `useTypedI18n` |
| `components/storage/file-browser/FileBrowserList.vue` | ~4 | C | `useTypedI18n` |
| `pages/records/[type]/[id]/_components/AdditionalInfoPanel.vue` | ~6 | D | — |

11 existing files modified, 1 new composable file, possibly 1 new types-bridge file.

## 6. Verification gate

- [ ] `grep -c "<!-- eslint-disable-next-line @typescript-eslint/no-explicit-any" modules/ui/app -r --include="*.vue"` returns **0**
- [ ] `grep -E "as any" modules/ui/app -r --include="*.vue"` shows zero matches *inside `<template>` blocks* (script-side `as any` may exist; that's the rule's job)
- [ ] `pnpm --filter @civicpress/ui exec eslint .` exits 0. Warning count drops by exactly 13 (115 → 102) — the "Unused eslint-disable directive" warnings disappear.
- [ ] `pnpm --filter @civicpress/ui exec vue-tsc --noEmit` exits 0 (or matches current baseline if pre-existing errors; record baseline in pre-flight)
- [ ] `pnpm test:ui:run` — 138/138 pass; no new regressions
- [ ] `git diff --stat main..HEAD -- modules/ui/app/**/*.vue` reflects per-file changes only; no files outside `modules/ui` touched
- [ ] The `useTypedI18n` composable contains exactly one `eslint-disable-next-line @typescript-eslint/no-explicit-any` (with a clear comment explaining the missing vue-i18n overload) — and it is the *only* `as any` cast newly introduced by this work

## 7. Risks

### 7.1 — Nuxt UI color-union type may not be exported
Nuxt UI v4 may not re-export `BadgeColor`/`Color` from the public API. Mitigation: define a local bridge type in `types/nuxt-ui-bridge.ts` matching the documented color names (`primary | secondary | success | info | warning | error | neutral`). One file, one type, all helpers reuse it. Document the bridge as "kept in sync with @nuxt/ui v4 public docs".

### 7.2 — `vue-tsc` baseline may already have errors
If the current `pnpm vue-tsc` run is not clean on `dev`, the verification gate softens to "no new errors introduced." Pre-flight step in the plan: run `vue-tsc --noEmit` once on `dev` before any change to capture the baseline.

### 7.3 — `tPlural` typed wrapper may not satisfy `vue-tsc` cleanly
The `i18n.t as any` cast inside the wrapper is the whole point. If `vue-tsc` rejects the cast assignment back to `string` return, fall back to C-restructure: at each of the 4 callers, rewrite to use the `{ count, ...named }` object literal form that vue-i18n's typed-t already accepts. C-restructure adds noise at each call site but needs no new file.

### 7.4 — Pattern B may surface latent v-model bugs
Tightening the type of a `:model-value` or `v-model` binding can reveal that the current data shape didn't actually match what the component renders. If that happens at a specific site, treat it as a surfaced bug (note in plan, file finding) rather than masking with another cast. Worst case: revert that site to a documented script-side `as` (still rule-covered, still better than the template cast).

### 7.5 — Pre-commit hook still trips on pre-existing test failures
Same as followup #3: pre-commit hook runs the full vitest suite which has pre-existing failures unrelated to this work (email-channel SMTP, simple-git fixtures, saga injection). `--no-verify` is approved during the refactor per master plan §9.1 (memory `refactor-no-verify-policy`).

## 8. Non-goals (restated)

- No CI gate (per `no-cicd-policy`).
- No PR / no push (per `refactor-push-policy`).
- No work on the other three lint-rollout followups (#1, #3 already closed, #4).
- No restructure of i18n message catalogs.
- No `@nuxt/ui` version bumps or component changes.

## 9. Memory updates after merge

In `lint-rollout-2026-06-02-followups.md`:
- Mark item #2 closed with merge SHA.
- Note the surfaced count was 13 (memory had said ~30; record the corrected number).
- If any Pattern B site surfaced a latent bug per §7.4, list it.

## 10. Execution shape

Estimated 1 implementation session, ~4–6 hours, split into per-pattern task groups for plan tractability:
- Group 1 — Pattern A (3 sites + maybe bridge file)
- Group 2 — Pattern B (5 sites)
- Group 3 — Pattern C (composable + 4 sites)
- Group 4 — Pattern D (1 site)
- Group 5 — verification + merge

Per the subagent-driven-development pattern: each group dispatchable as one implementer subagent with spec-compliance and code-quality review after each.
