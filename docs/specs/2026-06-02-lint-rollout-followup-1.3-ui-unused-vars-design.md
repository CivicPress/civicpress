# Lint-rollout followup #1.3 — `modules/ui/app` unused-vars cleanup

**Date:** 2026-06-02
**Status:** Approved (brainstorming gate)
**Predecessor:** `docs/specs/2026-05-28-lint-rule-rollout-design.md`
**Sibling followups (closed):**

- `docs/specs/2026-06-02-lint-rollout-followup-1.2-cli-unused-vars-design.md` (merge `961547d`)
- `docs/specs/2026-06-02-lint-rollout-followup-1.1-core-unused-vars-design.md` (merge `60d91e8`)
- `docs/specs/2026-06-02-lint-rollout-followup-2-vue-template-any-design.md` (merge `d7447b4`)
- `docs/specs/2026-06-02-lint-rollout-followup-3-modules-ui-cruft-deps-design.md` (merge `3103a74`)

**Followup inventory:** memory `lint-rollout-2026-06-02-followups.md` (item #1.3 of 5 per-workspace sub-followups; #1.1 core ✅, #1.2 cli ✅, **#1.3 ui [this spec]**, #1.4 storage, #1.5 api).

---

## 1. Goal

Drive `@typescript-eslint/no-unused-vars` warnings in `modules/ui/app/**` from 102 to 0 by:

- Stripping dead imports and top-level declarations (with Vue-specific safeguards documented in §3)
- `_`-prefixing function/method parameters that exist for interface compliance (event handlers, callback signatures)
- Stripping unused destructured fields, or re-destructuring without them
- Using bare-`catch` syntax for unused catch params

After cleanup, promote the rule from `warn` to `error` in `modules/ui/eslint.config.mjs`. The ui config uses a **single shared `unusedVarsRule` constant** (declared at line ~5) that's referenced by both the production block (line ~48) and the test block (line ~58) — flipping the constant atomically updates both blocks.

## 2. Scope

**In scope** — `modules/ui/app/**` and `modules/ui/eslint.config.mjs`. Distribution (from pre-flight lint on `dev` post-#1.2 merge):

| Subdir | Sites |
|---|---|
| `modules/ui/app/components/**` | 50 |
| `modules/ui/app/pages/**` | 31 |
| `modules/ui/app/composables/**` | 11 |
| `modules/ui/app/stores/**` | 4 |
| `modules/ui/app/plugins/**` | 3 |
| `modules/ui/app/layouts/**` | 2 |
| `modules/ui/app/error.vue` | 1 |

Total: 102.

Top hot-spots:

| File | Sites |
|---|---|
| `pages/records/[type]/[id]/edit.vue` | 7 |
| `components/RecordSearch.vue` | 6 |
| `components/RecordForm.vue` | 6 |
| `components/storage/MediaPlayer.vue` | 5 |
| `components/GeographyLinkForm.vue` | 5 |
| `components/GeographySelector.vue` | 4 |

**Out of scope:**

- Other workspaces (`core` ✅, `cli` ✅, `modules/storage`, `modules/api`) — separate sessions
- Other lint rules — including the `STYLE_RULES_DEFERRED` map in `modules/ui/eslint.config.mjs` (followup #4)
- The 2-file `useTypedI18n` mini-migration surfaced during #2 (`EditorHeader.vue`, `EditorAttachments.vue`) — `as any` issue, not unused-vars
- The 8 surfaced findings from #1.1 + #1.2 (4 closed, 4 + #3.1 still pending) — separate triage
- Push to origin; CI gates

## 3. Cleanup policy per category

Carried verbatim from `docs/specs/2026-06-02-lint-rollout-followup-1.1-core-unused-vars-design.md` §3:

| Category | Action |
|---|---|
| Unused import | Strip |
| Unused top-level declaration, pure RHS | Strip |
| Unused top-level declaration, side-effecting RHS | Keep call, drop binding |
| Unused function/method param for interface contract | `_`-prefix |
| Unused function/method param, local signature | Strip (update callers) |
| Unused catch param | Bare-`catch` (TS 4.4+) or `_err` |
| Unused destructured field | Re-destructure without it (or `_`-prefix if shape matters) |
| Surfaced bug ("declared, never wired") | Flag — DO NOT FIX |

**Stub-pattern note:** `private` method with unused param where callers pass meaningful values → `_`-prefix preserves stub-pattern signal.

### Vue-specific additions

`.vue` files have patterns that need extra care vs `.ts`-only workspaces:

| Vue pattern | Action |
|---|---|
| `const props = withDefaults(defineProps<Props>(), {...})` flagged unused | Drop binding, keep call: `withDefaults(defineProps<Props>(), {...})`. The call is side-effecting (registers props with the Vue compiler); only the script-side capture is dead. |
| `const emit = defineEmits<...>()` flagged unused | Drop binding, keep call. Events still emit from template `@click="$emit(...)"` or via implicit emit machinery. |
| Imported Vue component (capital-case, e.g. `import GeographySelector from './GeographySelector.vue'`) flagged unused | Nuxt auto-imports anything under `app/components/**`. Verify the component file is in that scope; if so, strip the explicit import (auto-import covers it). If the component lives outside auto-import scope (rare), leave alone and flag as concern. |
| Imported type (e.g. `import type { CivicRecord } from ...`) flagged unused | Strip — type imports erased at runtime, no false-positive risk |
| Unused script const with Vue-meaningful name (`formatDate`, `handleSubmit`, `viewFile`, etc.) | **Grep the template first** before stripping. Vue templates can reference script-level functions / refs / computeds via `{{ name }}`, `:prop="name"`, `@click="name"`, `v-for="x in name"`, etc. ESLint can't see template references. If used in template, the lint warning is a **false positive** — see §5.5 for the justified-suppression escape hatch. |
| Unused script const meant to be `defineExpose`d | Check for `defineExpose({...})` block in the file; if the variable is listed there, parent components consume it via template refs. Leave alone. |

### Template-grep workflow (critical)

For every script-side strip in a `.vue` file, the implementer must verify the symbol isn't template-referenced. The simplest check:

```bash
grep -nE "<symbolName|\\{\\{ *symbolName|symbolName\\(|=\"symbolName\"|in symbolName" path/to/file.vue
```

If any match exists, the symbol is template-used — do NOT strip; do NOT `_`-prefix (would break template). Two options:

1. If the symbol is genuinely script-unused but template-used, this is a false positive of `@typescript-eslint/no-unused-vars`. The lint plugin doesn't track Vue template references. Workaround: keep the symbol as-is and add a justified `eslint-disable-next-line @typescript-eslint/no-unused-vars` directive immediately above. This is the ONE place we permit a new suppression — and only for genuinely template-referenced symbols.
2. If the symbol is a `defineProps`/`defineEmits` capture and only the variable is unused (not the props/events themselves), use the side-effecting-RHS rule: drop the binding, keep the call.

## 4. Approach — single-session, 3 implementation tasks + rule flip + merge

Single feature branch off `dev`: `refactor/lint-followup-1.3-ui-unused-vars`. Per-subdirectory commits; subagent-driven-development with spec + code-quality review between tasks.

### Task slicing

| Task | Scope | Sites |
|---|---|---|
| Pre-flight | — | Capture baselines (lint, vue-tsc, tests), branch creation |
| Task 1 | `modules/ui/app/components/**` | 50 |
| Task 2 | `modules/ui/app/pages/**` | 31 |
| Task 3 | Long tail: `composables/`, `stores/`, `plugins/`, `layouts/`, `error.vue` | 21 |
| Task 4 | Flip `unusedVarsRule` from `'warn'` to `'error'` (one-line change in `modules/ui/eslint.config.mjs`) | — |
| Task 5 | Verification + merge `--no-ff` to `dev` + memory update | — |

### Tooling notes

- `pnpm --filter @civicpress/ui exec eslint <globs> --rule '{"@typescript-eslint/no-unused-vars": "error"}'` — re-promote the rule for the duration of work so lint exit-0 reflects done state.
- `pnpm --filter @civicpress/ui exec vue-tsc --noEmit` for typecheck. Per memory, baseline is clean (0 errors). vue-tsc partially type-checks templates but does NOT catch all template-referenced unused-vars false-positives — the template grep is still required.
- `pnpm test:ui:run` for the UI-specific test command (per memory: 138/138 baseline).
- `pnpm test:run` for the full repo (78 fail / 906 pass / 40 skip baseline).

## 5. Risks

### 5.1 Template false-positive false-strip (highest risk)

If the implementer strips a script-side const that's template-referenced, the rendered output silently breaks. vue-tsc may catch some cases but not all. **Mitigation: mandatory template-grep before every script-side strip in any `.vue` file**, per the workflow in §3.

### 5.2 Nuxt auto-import scope

Components outside `app/components/**` are NOT auto-imported. Stripping such an import breaks the template. Mitigation: confirm the component path before stripping; default to "leave alone and flag" if uncertain.

### 5.3 `defineExpose` consumers

A parent using template-ref-based access to child methods/refs (e.g. `childRef.value.openDialog()`) consumes those via `defineExpose`. ESLint can't follow the consumer. Mitigation: search for `defineExpose({...})` in each `.vue` file before stripping any local.

### 5.4 UI test baseline shifts

`pnpm test:ui:run` baseline is 138/138 per memory. Verify per-task. The repo-wide `pnpm test:run` baseline is 78 fail / 906 pass / 40 skip.

### 5.5 Permitted-suppression escape hatch (Vue template false-positives only)

For genuinely template-referenced symbols, the spec permits a justified `eslint-disable-next-line @typescript-eslint/no-unused-vars` directive — this is the **only** category where new suppressions are allowed in #1.3. Each such directive must be paired with a comment naming the template reference (e.g. `// Used in <template> via {{ formatDate(record.date) }}`).

Implementer should count and report these suppressions in their report so we can audit the count in code review.

### 5.6 102 sites in mostly `.vue` files

Mitigation: 3-task split keeps each commit reviewable (50 / 31 / 21).

## 6. Verification gate (Task 5)

- [ ] `pnpm --filter @civicpress/ui exec eslint .` exits 0 with **0 `@typescript-eslint/no-unused-vars` warnings**
- [ ] `pnpm --filter @civicpress/ui exec vue-tsc --noEmit` matches pre-flight baseline (no new typecheck errors)
- [ ] `pnpm test:ui:run` matches 138/138 baseline (no new failures)
- [ ] `pnpm test:run` matches 78 fail / 906 pass / 40 skip baseline (no new failures)
- [ ] `modules/ui/eslint.config.mjs` `unusedVarsRule` constant is `['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]`
- [ ] `git diff --stat dev..HEAD` shows changes only in `modules/ui/app/**` and `modules/ui/eslint.config.mjs`
- [ ] No files outside `modules/ui/` modified
- [ ] All commits used `--no-verify` per master plan §9.1
- [ ] Branch deleted after merge; no push to origin
- [ ] Any `eslint-disable-next-line @typescript-eslint/no-unused-vars` directives added are documented in commit messages with template-reference justification (per §5.5)

## 7. Non-goals (restated)

- No CI gate (`no-cicd-policy`)
- No PR / no push (`refactor-push-policy`)
- No work on other workspaces (`storage`, `api`) — separate sessions
- No work on other lint rules
- No fix for the still-open surfaced findings from #1.1 + #1.2

## 8. Memory updates after merge

In `lint-rollout-2026-06-02-followups.md`:

- Mark #1.3 closed with merge SHA + closed count
- Update remaining-workspace list (2 left: #1.4 storage 45, #1.5 api 32)
- Add the rule promotion outcome for `modules/ui`
- Append any new surfaced findings

In `MEMORY.md` index and `refactor-2026-05-master-plan.md` description: update with #1.3 closure SHA.

## 9. Execution shape

Estimated ~3–5 hours, split into:

- Pre-flight: ~10 min
- Task 1 (components, 50): ~90 min (biggest task; mostly Vue files)
- Task 2 (pages, 31): ~60 min
- Task 3 (long tail, 21): ~30 min
- Task 4 (rule flip): ~5 min
- Task 5 (merge + memory): ~15 min

Per the subagent-driven-development pattern: Tasks 1–3 dispatchable as one implementer each + spec/code-quality review between tasks. Tasks 4 and 5 are coordinator-driven.
