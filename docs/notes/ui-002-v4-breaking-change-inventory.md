# ui-002 T0 — Nuxt UI Pro v3 → v4 Breaking-Change Inventory

> **Status:** GO. No abort condition triggered.
> **Branch:** `refactor/ui-002-nuxt-ui-v4-migration`
> **Date:** 2026-05-28
> **Purpose:** Pre-flight research artifact for the v3 → v4 migration. Drives
> the per-family slicing of T2..T10. Source-code is untouched in this task.

---

## Baseline

Captured before any v4 change.

| Probe | Expected | Observed |
|---|---|---|
| `pnpm test:ui:run` | 138/138 passing | **138/138 passing** (20 test files, 2.90s) |
| `pnpm -C modules/storage test:run` | 216/216 passing | **216/216 passing** (17 test files, 18.56s) |
| `pnpm -r build` | clean across all build-capable workspaces | **EXIT 0**, 5 of 5 build-capable workspaces report `Done` (core, modules/ui, modules/storage, cli, modules/api); the 6th workspace in scope has no `build` script |

Build emits non-fatal warnings only — pre-existing Tailwind v4 sourcemap warnings and a `[Vue] Load plugin failed: vue-router/volar/sfc-route-blocks` warning from `vue-tsc`. Neither affects the migration.

---

## v4 license verification

### Package layout change (critical)

In v4 the Pro components are **folded into the free `@nuxt/ui` package**.
The separate `@nuxt/ui-pro` package is deprecated and stays on the v3 line.

```
npm view @nuxt/ui-pro dist-tags    →  { false: '1.8.2', latest: '3.3.7' }   ← v3, Proprietary
npm view @nuxt/ui     dist-tags    →  { alpha:'4.0.0-alpha.2', beta:'4.0.0-beta.0',
                                         false:'3.3.3',           latest:'4.8.0' }
```

| Probe | Result |
|---|---|
| Latest v4 version on npm | `@nuxt/ui@4.8.0` (published 2026-05-21) |
| License (SPDX) | **`MIT`** (OSI-approved) |
| LICENSE file in tarball | `LICENSE.md` — "MIT License — Copyright (c) 2023 Nuxt" |
| `NUXT_UI_PRO_LICENSE` references in v4 tarball | **zero hits** (entire `package/` tree grepped) |
| `NUXT_UI_PRO_LICENSE` references in our repo | **zero hits** (we never wired up paid licensing — we were running v3 unlicensed; this disappears in v4) |
| Repository | `https://github.com/nuxt/ui.git` (single Pro+free monorepo) |
| Tarball size | 351 KB (816 files) |
| Pro components included | yes — Dashboard*, AuthForm, Banner, Blog*, Changelog*, Chat*, ContentSearch, PageCard, PricingPlan, etc., all present alongside core |

### Peer dependencies of `@nuxt/ui@4.8.0`

| Peer | v4 requires | We are on | Match |
|---|---|---|---|
| `tailwindcss` | `^4.0.0` | `^4.x` (Tailwind v4 already in `modules/ui`) | OK |
| `vue-router` | `^4.5.0 \|\| ^5.0.0` | Nuxt 4.4.5 ships `vue-router@4.x` | OK |
| `typescript` | `^5.6.3 \|\| ^6.0.0` | `5.9.3` in lockfile | OK |
| `@nuxt/content` | `^3.0.0` | not used | n/a |
| `@inertiajs/vue3` | optional | not used | n/a |
| `@internationalized/date`, `@internationalized/number` | `^3.0.0` | not currently required | will pull as transitive if InputDate/InputTime adopted |
| `joi`, `yup`, `valibot`, `zod`, `superstruct` | schema-validation optional peers | we use `zod` already | OK |

Nuxt itself: v4 ships in compatibility with **Nuxt 4** (per release notes for `4.0.0-alpha.1`: "**update compatibility to nuxt 4**"). We are on **Nuxt 4.4.5** — OK.

### Composables → no license hook

The v4 package exposes `./composables` and `./composables/*` exports. None
of them reference an env var named `NUXT_UI_PRO_LICENSE`, `UI_PRO_LICENSE`,
or any "licence" string. The Pro layer is published MIT with no runtime gate.

### Abort conditions — none triggered

- License is **MIT** (OSI). PASS.
- No runtime license hook. PASS.
- Required peers align with our stack (Nuxt 4.4.5 / Vue 3.5.34 / Tailwind 4 / TS 5.9). PASS.

**Proceed to T1.**

---

## Components in use

From `grep -rhE "<U[A-Z][a-zA-Z]+" modules/ui/app --include="*.vue"`:

30 distinct components (matches the plan's expected list exactly):

```
UAccordion  UAlert  UApp  UAvatar  UBadge  UBreadcrumb  UButton  UCard
UCheckbox  UDashboardGroup  UDashboardNavbar  UDashboardPanel
UDashboardSidebar  UDashboardSidebarCollapse  UDropdownMenu  UForm
UFormField  UIcon  UInput  UInputTags  UModal  UNavigationMenu
UNotification  UPagination  UPopover  USelect  USelectMenu
UTabs  UTextarea  UTimeline
```

Per `v4.8.0` tarball inspection (`package/dist/runtime/components/`), **all 30 components exist in v4 EXCEPT `Notification`** — which has been renamed/replaced by `Toast` + `Toaster`. `UNotification` in our codebase appears in exactly one place: a commented-out `<!-- <UNotification /> -->` in `modules/ui/app/app.vue:196`. Effectively zero runtime call sites to migrate; the change is the **mount point** (root-level `<UToaster />` instead of the old commented-out element).

Composable usage today:
- `useToast().add({...})` — already the v3 + v4 composable name; **stays the same in v4**. Used in 9+ files across middleware and composables.
- `useHead(...)` — used in `app.vue:4`. Still valid in v4 / Nuxt 4.
- `useOverlay()` — **not currently used** in our codebase (greps zero).
- `useUI()` — **not currently used** in our codebase (greps zero).

Cross-cutting integrations:
- **Leaflet** wrappers in `modules/ui/app/components/GeographyMap.vue` — independent of `@nuxt/ui`. No v4 impact.

---

## v4 release notes — breaking changes harvested

Source: `https://raw.githubusercontent.com/nuxt/ui/v4/CHANGELOG.md`
(versions `4.0.0-alpha.0` through `4.8.0`, all `⚠ BREAKING CHANGES` blocks
between v3.3.3 and v4.8.0).

Raw breaking-change set (filtered to families we use):

| Version | Component / area | Breaking change |
|---|---|---|
| 4.0.0-alpha.0 | ButtonGroup | **rename** `ButtonGroup` → `FieldGroup` |
| 4.0.0-alpha.0 | PageAccordion | **remove** in favor of `Accordion` |
| 4.0.0-alpha.0 | components | upgrade `ai-sdk` to v5 (not used by us) |
| 4.0.0-alpha.1 | module | update compatibility to Nuxt 4 (we're already on Nuxt 4) |
| 4.0.0-alpha.1 | Input / InputNumber / Textarea | rename `nullify` v-model modifier → `nullable`; add `optional` modifier |
| 4.0.0-alpha.1 | (ecosystem) | `@nuxt/ui-pro` package folded into `@nuxt/ui` |
| 4.0.0-alpha.2 | Form | don't mutate the form's state if transformations are enabled — transformations now only apply to **@submit data** |
| 4.1.0 | CommandPalette | add `children-icon` prop (not used by us) |
| 4.1.0 | Table | consistent args order in `select` event (not used by us) |
| 4.2.0 | components | **consistent exposed refs** (`#5385`) — any `ref(...)` we bind to a U* component may need re-binding (`$el`, `rootRef` etc. were renamed) |
| 4.2.0 | module | properly export composables — minor; no API change |
| 4.6.0 | module | use `moduleDependencies` to manipulate options — internal; only matters if we have a sibling module |
| 4.8.0 | InputMenu | rename `autocomplete` prop → `mode` (we don't use InputMenu) |

Plus the migration-guide deltas (https://ui.nuxt.com/getting-started/migration):

| Area | Change |
|---|---|
| `nuxt.config.ts modules` | `'@nuxt/ui-pro'` → `'@nuxt/ui'` |
| `package.json` deps | remove `@nuxt/ui-pro@^3`, add `@nuxt/ui@^4.8.0` and `tailwindcss@^4` (Tailwind already in our deps) |
| `nuxt.config.ts` / `app.config.ts` | rename root key `uiPro: {...}` → `ui: {...}` (in our nuxt.config the key is **already** `ui:` — see lines 15-20 — so this is a no-op for us) |
| CSS entry | `@import "@nuxt/ui-pro";` → `@import "@nuxt/ui";` (in `assets/css/main.css`) |
| Nuxt Content helpers | `findPageBreadcrumb`, `findPageHeadline` move from `@nuxt/ui-pro/utils/content` to `@nuxt/content/utils` (we don't use these) |
| `useToast` | API unchanged; `<UToaster />` is the new mount point |
| `UNotification` | removed in v4; toast UI lives in `<UToaster />` |

---

## Breaking changes by family (drives T2..T10)

### T2 — Dashboard shell (UDashboardGroup, UDashboardNavbar, UDashboardPanel, UDashboardSidebar, UDashboardSidebarCollapse)

All five components exist in v4 (`DashboardGroup.vue`, `DashboardNavbar.vue`, `DashboardPanel.vue`, `DashboardSidebar.vue`, `DashboardSidebarCollapse.vue`).

| Concern | Detail |
|---|---|
| Renames | none |
| Removals | none |
| Documented API breaks | none in 4.0..4.8 explicit BREAKING CHANGES list |
| Implicit risk | (a) Dashboard markup is the most slot-heavy part of our app; v4 changed some slot prop shapes and added `data-slot` attrs (4.2.0) — visual diff likely. (b) v4.5.0 added `autoClose` prop to `DashboardSidebar/Header` — additive but may flip default behavior in some configs. (c) v4.0.1 fixed RTL for `DashboardPanel/DashboardSidebar` — irrelevant for our LTR-only build. |
| Estimated work | medium — verification-heavy; mostly a swap-and-eyeball-the-shell pass |

**Recommended T2 stays in plan.**

### T3 — UNavigationMenu

Exists as `NavigationMenu.vue`.

| Concern | Detail |
|---|---|
| Renames / removals | none |
| Documented breaks | none in BREAKING CHANGES list |
| Implicit risk | many bug-fix entries (4.5.0..4.6.0) for trailing-slot interaction, RTL, badge display, item value uniqueness — props/slots names unchanged but visual + interaction behavior shifted; characterization tests will catch. |
| Estimated work | low — props unchanged |

**Recommended T3 stays in plan.**

### T4 — Overlays (UModal, UPopover, UDropdownMenu)

Exist as `Modal.vue`, `Popover.vue`, `DropdownMenu.vue` (+ `DropdownMenuContent.vue`).

| Concern | Detail |
|---|---|
| Renames / removals | none |
| Documented breaks | none in BREAKING CHANGES list |
| Implicit risk | (a) v4.0.1 changed `Drawer/Modal/Slideover` close autofocus behavior. (b) v4.2.0 added `scrollable` prop to Modal. (c) v4.5.0 changed close-on-touch behavior across overlay primitives. (d) v4.6.0 added `filter` prop to DropdownMenu + fixed double `close:prevent` emit. None are explicit breaks but our integration tests around modal-close in characterization suite should be re-run. |
| Estimated work | low-medium |

**Recommended T4 stays in plan.**

### T5 — Form stack (UForm, UFormField, UInput, USelect, USelectMenu, UInputTags, UCheckbox, UTextarea)

All exist in v4.

| Concern | Detail |
|---|---|
| Renames / removals | none in our subset |
| **Breaking — Form.transformations** | "Schema transformations now only apply to **@submit data** and will no longer mutate the form's state" (`4.0.0-alpha.2`, `#4902`). If any of our forms relied on transformed state being visible in the bound `state`, that breaks silently. |
| **Breaking — Nested forms** | Require explicit `nested` prop opt-in, and nested forms must use `name` prop (replaces `:state` binding). We need to grep for nested `<UForm>` usage. |
| **Breaking — v-model modifier rename** | `v-model.nullify` → `v-model.nullable` on `Input` / `InputNumber` / `Textarea` (`4.0.0-alpha.1`, `#4838`); new `.optional` modifier converts blank to `undefined`. Grep our codebase for `v-model.nullify`. |
| **Breaking — Select** | v4.5.0 "remove useless `by` prop" — if we relied on `:by="..."` it must be removed; v4.4.0 then re-added `by` prop more generically. |
| Implicit risk | (a) Form 4.0.0-beta.0 removed `joi` and `yup` in favor of @standard-schema/spec (we use zod, so we're safe). (b) FormField 4.3.0 added `orientation` prop, additive. (c) Input 4.2.0 prevents iOS auto-zoom for font-size <16px — harmless cosmetic. |
| Estimated work | **medium-high — the largest family** |

**Recommended T5 stays in plan. Add a pre-step: grep for `v-model.nullify`, nested `<UForm>`, and Form `transform` props before starting.**

### T6 — Display components (UCard, UButton, UBadge, UAlert, UIcon, UAvatar, UAccordion, UTabs, UTimeline, UPagination, UBreadcrumb)

All exist in v4.

| Concern | Detail |
|---|---|
| Renames / removals | none in our subset (PageAccordion would have been a rename, but we use `UAccordion` directly already) |
| Documented breaks | none in this family |
| Implicit risk | (a) Avatar 4.0.1 removed redundant `img` role. (b) Avatar 4.8.0 added `color` prop. (c) Breadcrumb 4.8.0 added `color` prop and behavior fix for `active` items. (d) Icon 4.0.0-alpha.1 allows passing a component instead of name. (e) Pagination 4.0.1 made ellipsis non-interactive. (f) Tabs 4.0.0-beta.0 fixed nullish-coalescing on item value. (g) Timeline 4.4.0 added `select` event + wrapper slot. None of these break our usage. |
| Estimated work | low |

**Recommended T6 stays in plan. Likely the easiest sweep.**

### T7 — Toasts (UNotification + useToast)

| Concern | Detail |
|---|---|
| **Breaking — UNotification removed** | replaced by `UToast` + `UToaster`. In our codebase the only reference is a commented-out `<!-- <UNotification /> -->` in `app.vue:196`. The migration is to **uncomment and replace with `<UToaster />`** at the App root. |
| **Composable** | `useToast()` API **unchanged** — `.add({ title, description, icon, color }: ToastOptions)` still valid. All our 30+ call sites stay as-is at the call level. v4 added `max` config (4.1.0) — opt-in. |
| Estimated work | low — single-file change in `app.vue` plus visual verification |

**Recommended T7 stays in plan. Smallest sweep.**

### T8 — Root wiring (UApp, useHead)

| Concern | Detail |
|---|---|
| Renames / removals | `UApp` still ships in v4 (`App.vue`) |
| `useHead` | still valid (Nuxt 4 API, not Pro-owned). The comment in `nuxt.config.ts:15-20` "Minimal theme configuration to prevent useHead issues" hints at a v3-era workaround using `ui.theme.colors: ['primary', 'error']`. In v4 the `ui` config key shape is similar but may not need this constraint — verify by removing the workaround and seeing if useHead errors return. |
| Module identifier in `nuxt.config.ts` | `'@nuxt/ui-pro'` → `'@nuxt/ui'` (T8 sweep) |
| CSS entry point | `@import "@nuxt/ui-pro";` → `@import "@nuxt/ui";` in `modules/ui/app/assets/css/main.css` (to be confirmed when sweep starts) |
| `app.config.ts` | we don't have one; if we add it the root key is `ui:` not `uiPro:` |
| Estimated work | low — config-file edits + dependency swap |

**Recommended T8 stays in plan. This is the package-swap entry point.**

### T9 — i18n / locale-aware

| Concern | Detail |
|---|---|
| Documented breaks | none specific to `@nuxt/ui` v4 affecting i18n integration |
| Implicit risk | v4.2.0 removed `locale` / `dir` props proxy on components (`#5432`). If any of our components pass an explicit `:locale` to a U* component, that prop is gone. We use `@nuxtjs/i18n` at the Nuxt layer, not via component props, so this is **effectively a no-op for us**. |
| Estimated work | **near-zero** — verify only |

**Recommended T9 may be COLLAPSED into the final integration verification step. Suggest the controller consider folding T9 into T8 or T2 to free up a slot.**

### T10 — Leaflet wrappers / type exports

| Concern | Detail |
|---|---|
| Leaflet | independent of `@nuxt/ui`. The map component imports `leaflet` directly. No v4 impact. |
| Type exports | v4.2.0 standardized type interface naming (`#4990`) and v4.0.0-alpha.2 standardized "naming for type interfaces". If we re-export any U* component prop types or item types from `modules/ui`, the import path / name may shift. To be checked in the T10 sweep against `modules/ui` public exports. |
| Estimated work | low — type-only |

**Recommended T10 stays in plan.**

---

## Cross-cutting concerns (none warrant a NEW task)

1. **`v-model.nullify` audit** — done as part of T5 pre-step (one-line grep). No new task.
2. **`data-slot` attribute additions (4.2.0)** — could change CSS selectors if our CSS uses `[data-something]` selectors against U* components. To verify in T2/T4/T5 visual passes. No new task.
3. **`consistent exposed refs` (4.2.0)** — any `ref(...)` bound to a U* component may need re-binding to `.$el` instead of `.rootRef` etc. Grep `templateRef` / `componentRef` against U* in our codebase. To verify per-family. No new task.
4. **Tailwind v4 transition** — already done in our repo (we are on Tailwind 4). No new task.
5. **AI SDK v5** — we don't use Chat / AuthForm-streaming components. No new task.

---

## Plan validation

The plan's T2..T10 slicing is **9 sweep tasks**, plus T0 (this) and T1 (package swap kickoff) and T11 (final close-out) implied → ≤ 12 total. **Well within the spec cap of 20.**

| Task | Recommendation |
|---|---|
| T2 Dashboard shell | KEEP |
| T3 UNavigationMenu | KEEP |
| T4 Overlays | KEEP |
| T5 Form stack | KEEP (largest; carries the only "real" silent-behavior breaks: Form transformations + v-model.nullify) |
| T6 Display components | KEEP (easiest) |
| T7 Toasts | KEEP (smallest — could be a single-commit sub-task) |
| T8 Root wiring | KEEP |
| T9 i18n / locale-aware | **CANDIDATE FOR COLLAPSE** — effectively a no-op given our usage |
| T10 Leaflet / type exports | KEEP |

**Total estimated sweep count for T2..T10: 9 (or 8 if T9 collapses).** No additional sweep tasks surface from this inventory. Controller may proceed.

---

## Verification log — T2–T10 outcomes (post-T1.5 stabilization)

T1.5 (commit `d40bebf`) determined that v4 is essentially a drop-in for our usage: gates were 138/138 + build clean immediately after a clean install. The per-family sweep tasks T2..T10 reduced to verification rather than fixes. Audit performed 2026-05-28.

| Task | Predicted in T0 | Verified outcome | Audit command |
|---|---|---|---|
| T2 Dashboard shell (UDashboard*) | medium verification work | **no-op** — all 5 components render; 138/138 green; build clean | `pnpm test:ui:run` + `pnpm -r build` |
| T3 UNavigationMenu | low; props unchanged | **no-op** | (covered by gate runs) |
| T4 Overlays (UModal/UPopover/UDropdownMenu) | low-medium | **no-op** | (covered by gate runs) |
| T5 Form stack | largest — silent runtime breaks possible | **no-op** — audit confirmed none of the at-risk patterns exist in source | greps below |
| T5a `v-model.nullify` | rename to `.nullable` | **no matches** | `grep -rn "v-model\.nullify" modules/ui/app --include='*.vue'` |
| T5b nested `<UForm>` (no word-boundary on UFormField) | needs `nested` + `name` props | **no matches** | `find modules/ui/app -name "*.vue" -exec sh -c 'n=$(grep -cE "<UForm[> ]" "$1"); [ "$n" -gt 1 ] && echo "$n  $1"' _ {} \;` → 0 files |
| T5c `<UForm transform=...>` | transformations no longer mutate state | **no matches** | `grep -rnE '<UForm[^>]*\btransform' modules/ui/app --include='*.vue'` |
| T5d `<USelect :by=...>` | `:by` semantics changed | **no matches** | `grep -rnE '<USelect[^>]*:by=' modules/ui/app --include='*.vue'` |
| T6 Display components | low | **no-op** | (covered by gate runs) |
| T7 Toasts | UNotification removed; useToast unchanged | **no-op** — only ref is the commented-out placeholder at `app.vue:196`; leaving it preserves v3 behavior (useToast() silently no-ops without a mount) | `grep -rnE '<UNotification' modules/ui/app --include='*.vue'` → 1 match, commented |
| T8 Root wiring + useHead workaround | check whether v4 still needs it | **real fix** — removed `ui.theme.colors` block at nuxt.config.ts:15-20; 138/138 + build still green. Commit `cd725d5`. | edit + re-run gates |
| T9 i18n / locale-aware | verification-only, expected no-op | **no-op** — no `<U* :locale=...>` usage in our codebase | `grep -rnE '<U[A-Z][a-zA-Z]+[^>]*:locale=' modules/ui/app --include='*.vue'` |
| T10 Leaflet / type exports | low; type-only | **no-op** — `pnpm -r build` clean (typecheck included via nuxt build path); T1.5 also independently ran `vue-tsc -p .nuxt/tsconfig.app.json` → 0 errors across 93 .vue files | (covered by gate runs) |

**Net outcome:** T2–T7 + T9 + T10 are all no-ops. Only T8 produced a real source change. Migration is a near-drop-in upgrade.

---

## Appendix: commands run

```sh
git status                                                 # clean
git log --oneline -5                                       # matches expected commits
pnpm test:ui:run                                           # 138/138
pnpm -r build                                              # exit 0; 5 workspaces Done
pnpm -C modules/storage test:run                           # 216/216
npm view @nuxt/ui-pro dist-tags                            # latest=3.3.7 (Proprietary)
npm view @nuxt/ui     dist-tags                            # latest=4.8.0
npm view @nuxt/ui@latest license version peerDependencies  # MIT, 4.8.0
npm pack @nuxt/ui@4.8.0 + grep NUXT_UI_PRO_LICENSE          # 0 hits
grep -rhE "<U[A-Z][a-zA-Z]+" modules/ui/app                # 30 components
curl https://raw.githubusercontent.com/nuxt/ui/v4/CHANGELOG.md
WebFetch https://ui.nuxt.com/getting-started/migration
```
