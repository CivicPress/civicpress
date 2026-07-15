# Lint Tier C cleanup — clear 89 deferred warnings

**Date:** 2026-06-03
**Status:** Approved (brainstorming gate)
**Predecessor:** `docs/specs/2026-06-03-lint-rollout-followup-4-style-rules-design.md` (merge `c30e62c`)

After lint-followup #4 closed the lint-rollout backlog (merge `c30e62c`), 89 violations remained as `warn`-only signal in the `STYLE_RULES_TIER_C_DEFERRED` map of `modules/ui/eslint.config.mjs`, deferred to a focused follow-on session. This spec is that session.

This is **not** a numbered lint-followup (#1–#4 are all closed). It's a polish session against the deferred-tier inventory. The lint-rollout backlog is already complete; Phase 3 has been unblocked since `c30e62c`. This session is opt-in code-quality polish before starting Phase 3.

---

## 1. Goal

Drive `modules/ui` Tier C deferred warnings from 89 to 0 via a mix of auto-fix, config-level rule exemption, code rename, and one rule relocation to Tier D (`off`). After this lands, `modules/ui` ESLint output drops from ~102 warnings to ~13 (just pre-existing `no-explicit-any` allowlist sites).

End state:
- 33 sites auto-fixed (`process.client` → `import.meta.client`)
- 35 violations cleared via config (rule's `ignores` array exempts Nuxt-convention names + `Logo`)
- 4 sites renamed (`created_at`/`updated_at` → `createdAt`/`updatedAt` at the sidebar-prop boundary)
- 17 violations cleared via rule relocation (`vue/require-default-prop` moves from Tier C to Tier D with documented Vue 3 + TS rationale)
- `STYLE_RULES_TIER_C_DEFERRED` map becomes empty (or is removed entirely)

## 2. Scope

**In scope:**
- `modules/ui/eslint.config.mjs` — config edits for `vue/multi-word-component-names` ignores + relocate `vue/require-default-prop` to Tier D
- ~10 files in `modules/ui/app/**` for the `process.client → import.meta.client` auto-fix
- `modules/ui/app/components/editor/record-sidebar/RelationsPanel.vue` + `TechnicalPanel.vue` for the prop rename
- Parent components passing `created_at`/`updated_at` to those sidebar panels (rename the binding site)
- Possibly the data source (composable / record-detail layer) if the rename benefits from a single transform point — investigate during Task 3

**Out of scope:**
- Renaming snake_case fields elsewhere in the codebase (e.g., on `Record` interface types from the backend — that's a separate "interface-truth" cleanup track tracked in `lint-followups-surfaced-findings`)
- Other workspaces (`STYLE_RULES_DEFERRED` is unique to `modules/ui`)
- Other lint rules
- Push to origin (`refactor-push-policy` unchanged)

## 3. Per-rule disposition

### 3.1 `nuxt/prefer-import-meta` (33 sites) — auto-fix

Probed: `eslint --fix` cleanly replaces `process.client` → `import.meta.client` (and `process.server`, `process.dev` similarly). No manual judgment needed.

Strategy: scope the fix to `modules/ui/app/**` (don't touch other workspaces).

### 3.2 `vue/multi-word-component-names` (35 sites) — config exemption

All 35 violations are in Nuxt-convention filenames or a legitimate single-word brand component:

| File category | Count | Files |
|---|---|---|
| Brand component | 1 | `Logo.vue` |
| Nuxt root pages | 2 | `error.vue` (required name), `pages/index.vue` |
| Nuxt layouts | 1 | `layouts/default.vue` (required name) |
| Nuxt page routes | 31 | `pages/**` — `index.vue`, `login.vue`, `register.vue`, `edit.vue`, `new.vue`, `raw.vue`, `create.vue`, `activity.vue`, `diagnostics.vue`, `notifications.vue`, `profile.vue`, `setup.vue`, `drafts.vue`, `logout.vue` etc. |

These cannot be renamed without breaking Nuxt's file-based routing. The rule should exempt them via its `ignores` config option.

Strategy: configure the rule with an `ignores` array listing the Nuxt-convention page/layout/error names + `Logo`:

```js
'vue/multi-word-component-names': ['warn', {
  ignores: [
    // Nuxt root special names (filename-driven)
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

The rule definition needs to move out of `STYLE_RULES_TIER_B` (where it's currently `'warn'`) and become a full per-rule definition with options. The cleanest place is to declare it explicitly in the prod + test config blocks, after the tier-map spreads.

Wait — let me re-read the lint config. `vue/multi-word-component-names` is currently in `STYLE_RULES_TIER_C_DEFERRED`. To configure with options, either:

(a) Move it out of the tier map and declare it in the per-block `rules:` object after the spreads (since explicit settings override spread values). This keeps Tier C as a flat-warn map.

(b) Update the tier map value from `'warn'` to `['warn', { ignores: [...] }]` directly. Slightly less symmetric but keeps everything in the map.

Recommendation: (b). The map values are already permitted to be array-typed (Tier A uses `'error'` as string, but `unusedVarsRule` uses an array). The map's purpose is "policy per rule"; rule options ARE policy.

### 3.3 `vue/prop-name-casing` (4 sites in 2 files) — rename at the boundary

Sites:
- `modules/ui/app/components/editor/record-sidebar/RelationsPanel.vue:22-23` — `created_at`, `updated_at`
- `modules/ui/app/components/editor/record-sidebar/TechnicalPanel.vue:4-5` — `created_at`, `updated_at`

These props receive raw record fields from the parent. The clean fix is to rename the prop names to camelCase (`createdAt`, `updatedAt`) and update the parents that bind them.

Strategy:
1. Inspect each child's `defineProps` to see the full prop set + the parent binding.
2. Rename the prop names in the children.
3. Update parent template bindings from `:created_at="record.created_at"` → `:created-at="record.createdAt"` (Vue template's kebab-case for camelCase props is the standard pattern). But wait — that depends on the source. If the parent has `record.created_at` (snake_case from backend), we need to either:
   - Transform at the parent: `:created-at="record.created_at"` (parent reads snake, child receives camel via Vue's auto-mapping — actually Vue requires kebab-case `:created-at` for `createdAt`)
   - Transform at the composable/data layer: the composable that returns the record could map `created_at` → `createdAt` as part of the API response shape

Decision criteria: if the snake_case `created_at` flows through more than just these 2 children, transforming at the composable is better (single mapping point). If it's only consumed by these 2 children, transforming at the prop binding is simpler.

The Task 3 implementer should make this call after inspection.

### 3.4 `vue/require-default-prop` (17 sites in 10 files) — relocate to Tier D

The rule is a Vue 2-era convention. Vue 3 with TypeScript-typed `defineProps<{ x?: T }>()` handles required-vs-optional via the type system; the rule asks for `withDefaults(defineProps<...>(), { x: <default> })` at every site, which is busywork in TS-first components.

Strategy: move the rule from `STYLE_RULES_TIER_C_DEFERRED` to `STYLE_RULES_TIER_D_OFF` (`'off'`). Update Tier D's policy comment to mention the Vue 3 + TS rationale.

## 4. Approach

Single feature branch off `dev`: `refactor/lint-tier-c-cleanup`. Five tasks + merge:

| Task | Scope |
|---|---|
| Pre-flight | Capture baselines (lint, vue-tsc, UI tests), create branch |
| Task 1 | `eslint --fix` scoped to `modules/ui/app/**` for `nuxt/prefer-import-meta` — 33 sites bulk-fixed |
| Task 2 | Configure `vue/multi-word-component-names` with `ignores` array in the Tier C map — 35 violations cleared via config |
| Task 3 | Rename `created_at`/`updated_at` → `createdAt`/`updatedAt` in `RelationsPanel.vue` + `TechnicalPanel.vue` + their parents — 4 violations cleaned |
| Task 4 | Move `vue/require-default-prop` from `STYLE_RULES_TIER_C_DEFERRED` to `STYLE_RULES_TIER_D_OFF` — 17 violations cleared via rule relocation |
| Task 5 | Verification + merge `--no-ff` to `dev` + memory update |

After all 5 tasks, the `STYLE_RULES_TIER_C_DEFERRED` map either becomes empty (just `vue/multi-word-component-names` with full options) or is removed entirely. The latter is cleaner — Tier C as a category was always meant to be a temporary holding pen.

Tasks 1, 2, and 4 are coordinator-driven (mechanical edits / auto-fix). Task 3 needs a subagent dispatch (judgment about where to put the rename transform).

## 5. Risks

### 5.1 Task 1 auto-fix scope leakage

`eslint --fix` invoked at the wrong scope might touch files outside `modules/ui/`. Mitigation: use `--filter @civicpress/ui` + explicit file glob `modules/ui/app/**`.

### 5.2 Task 2 ignores list maintenance

The hardcoded `ignores` array becomes outdated when new Nuxt page filenames are added (e.g., a future `pages/dashboard.vue`). Mitigation: add a comment in the eslint config explaining the rationale + pointing to a future improvement (use a file-pattern override to disable the rule for `pages/**` + `layouts/**` + `error.vue` automatically). For now, the static list is acceptable.

### 5.3 Task 3 rename cascade

If `created_at`/`updated_at` originates from a TypeScript interface (e.g., `Record.created_at` from a `@civicpress/core` type), the rename at the prop boundary needs a transform somewhere. Options:

- Transform at the composable layer (`useRecordDetail` or similar) — single mapping point, clean
- Transform at the parent template binding — simpler but ad-hoc
- Add a typed mapper in a small helper

The Task 3 subagent picks the simplest approach that doesn't expand scope beyond the 2 sidebar children + their immediate parent(s).

### 5.4 Task 4 disable risk

Moving `vue/require-default-prop` to `off` means future contributors won't be reminded to add defaults. This is intentional — the project uses TS-typed props throughout. Mitigation: the Tier D policy comment names the rationale, so a future reader understands the decision.

### 5.5 UI test failures

The Task 3 prop rename touches consumer components. If a test mocks the sidebar with `created_at` directly, the test breaks. Mitigation: search for tests that reference `RelationsPanel` or `TechnicalPanel` and update bindings if needed.

## 6. Verification gate

- [ ] `pnpm --filter @civicpress/ui exec eslint .` exits 0 errors, ~13 warnings (down from 102 — Tier C empty + ~13 pre-existing `no-explicit-any` allowlist)
- [ ] vue-tsc exit 0 (Task 3's prop rename must not break parent typing)
- [ ] UI tests no new failures vs baseline (17 fail / 105 pass)
- [ ] `modules/ui/eslint.config.mjs` Tier C map empty or removed; `vue/multi-word-component-names` configured with `ignores`; `vue/require-default-prop` in Tier D
- [ ] Per-rule lint counts after merge: `prefer-import-meta` = 0, `multi-word-component-names` = 0, `prop-name-casing` = 0, `require-default-prop` = 0
- [ ] Only `modules/ui/**` modified
- [ ] All commits used `--no-verify` per master plan §9.1
- [ ] Branch deleted after merge; no push to origin

## 7. Non-goals (restated)

- No work on the 9 + sub-finding #3.1 still-open surfaced findings (separate "interface-truth" track)
- No CI gate (`no-cicd-policy`)
- No PR / no push (`refactor-push-policy`)
- No re-litigation of Tier D rules (those stay off with documented policy)
- No file-pattern override mechanism for `multi-word-component-names` (static `ignores` list is acceptable; the dynamic-override improvement is a TODO comment, not in-scope)

## 8. Memory updates after merge

In `lint-rollout-2026-06-02-followups.md`: mark Tier C as CLOSED with merge SHA + per-rule outcomes. The Tier C inventory line currently reads "~89 live warnings expected" — update to "all 89 cleared 2026-06-03 (merge `<SHA>`)".

In `MEMORY.md` index: update the followup hook with the Tier C closure.

In `refactor-2026-05-master-plan.md`: append the Tier C closure SHA. Phase 3 remains UNBLOCKED.

In `lint-followups-surfaced-findings.md`: if Task 3 surfaces any data-layer findings (e.g., the parent component reads snake_case fields directly from the backend type rather than going through a composable), record them.

## 9. Execution shape

Estimated ~1–2 hours, split into:

- Pre-flight: ~5 min
- Task 1 (auto-fix bulk): ~5 min + verification
- Task 2 (config ignores): ~10 min
- Task 3 (prop rename): ~30–60 min (the only judgment task)
- Task 4 (relocate rule): ~5 min
- Task 5 (merge + memory): ~10 min

Task 3 dispatchable as subagent. Tasks 1, 2, 4 are coordinator-driven mechanical edits.
