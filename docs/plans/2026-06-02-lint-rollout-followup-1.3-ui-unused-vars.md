# Lint-rollout followup #1.3 — `modules/ui/app` unused-vars cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive `@typescript-eslint/no-unused-vars` warnings in `modules/ui/app/**` from 102 to 0 via three per-subdirectory passes, then promote the shared `unusedVarsRule` constant in `modules/ui/eslint.config.mjs` from `warn` to `error` (single-line change; covers both production and test config blocks atomically).

**Architecture:** Single feature branch off `dev`. Three per-subdirectory implementation tasks (each a self-contained commit), one rule-flip commit, one merge `--no-ff` to `dev` with closure summary. Subagent-driven-development pattern with spec + code-quality review between tasks. `.vue` files require **mandatory template grep before any script-side strip** to avoid template-reference false-positive false-strips.

**Tech Stack:** TypeScript 5.9, Vue 3.5 (`<script setup>`), Nuxt 4 (auto-imports `app/components/**`), ESLint v9 flat config via `@nuxt/eslint` Option A integration, `@typescript-eslint/eslint-plugin` 8.60, pnpm 9.15.9 via corepack, vitest, `--no-verify` per master plan §9.1.

**Spec:** `docs/specs/2026-06-02-lint-rollout-followup-1.3-ui-unused-vars-design.md` (commit `fe7fab3`).

---

## File map

| Task | Scope | Sites |
|---|---|---|
| Task 1 | `modules/ui/app/components/**` | 50 |
| Task 2 | `modules/ui/app/pages/**` | 31 |
| Task 3 | `modules/ui/app/composables/**` (11) + `stores/**` (4) + `plugins/**` (3) + `layouts/**` (2) + `error.vue` (1) | 21 |
| Task 4 | `modules/ui/eslint.config.mjs` line 5 (the `unusedVarsRule` const) | — |

Top hot-spot files (use as Task 1/2 sub-priority):

| File | Sites |
|---|---|
| `pages/records/[type]/[id]/edit.vue` | 7 |
| `components/RecordSearch.vue` | 6 |
| `components/RecordForm.vue` | 6 |
| `components/storage/MediaPlayer.vue` | 5 |
| `components/GeographyLinkForm.vue` | 5 |
| `components/GeographySelector.vue` | 4 |

Total: 102 sites across `modules/ui/app/`. No files outside `modules/ui/` touched.

---

## Pre-flight (do once, before Task 1)

- [ ] **Step 1: Confirm clean working tree on `dev`**

```bash
cd /Users/stakabo/Work/repos/civicpress/civicpress
git status -sb
git log --oneline -3
```

Expected: `## dev`, no modified files. HEAD reaches `fe7fab3` (spec commit) or later.

- [ ] **Step 2: Confirm pnpm version**

```bash
pnpm --version
```

Expected: `9.15.9` via corepack.

- [ ] **Step 3: Capture pre-change ui lint baseline**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tee /tmp/lint-ui-baseline.txt | tail -3
grep -c "@typescript-eslint/no-unused-vars" /tmp/lint-ui-baseline.txt
```

Expected: `✖ 115 problems (0 errors, 115 warnings)`. Unused-vars count: `102`.

Verify per-subdir distribution:

```bash
awk '/^\//{file=$0; next} /@typescript-eslint\/no-unused-vars/{print file}' /tmp/lint-ui-baseline.txt | sed 's|/Users/stakabo/Work/repos/civicpress/civicpress/||' | awk -F/ '{print $1"/"$2"/"$3"/"$4}' | sort | uniq -c | sort -rn
```

Expected:
```
  50 modules/ui/app/components
  31 modules/ui/app/pages
  11 modules/ui/app/composables
   4 modules/ui/app/stores
   3 modules/ui/app/plugins
   2 modules/ui/app/layouts
   1 modules/ui/app/error.vue
```

If counts differ, snapshot and re-plan accordingly.

- [ ] **Step 4: Capture pre-change vue-tsc baseline**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tee /tmp/vue-tsc-ui-baseline.txt | tail -10
echo "exit=${PIPESTATUS[0]}"
```

Record `TSC_BASELINE_EXIT` (expected 0 per memory; record error count if non-zero).

- [ ] **Step 5: Capture pre-change UI test baseline**

```bash
pnpm test:ui:run 2>&1 | tee /tmp/test-ui-baseline.txt | tail -10
```

Record `UI_TEST_BASELINE_PASS` (expected 138 per memory) and `UI_TEST_BASELINE_FAIL` (expected 0).

- [ ] **Step 6: Capture pre-change full-repo test baseline (for non-UI regressions)**

```bash
pnpm test:run 2>&1 | tee /tmp/test-baseline.txt | tail -10
```

Record `TEST_BASELINE_PASS`, `TEST_BASELINE_FAIL`, `TEST_BASELINE_SKIP` (per memory: 78 fail / 906 pass / 40 skip).

- [ ] **Step 7: Create the implementation branch**

```bash
git checkout -b refactor/lint-followup-1.3-ui-unused-vars
git status -sb
```

Expected: `## refactor/lint-followup-1.3-ui-unused-vars`.

---

## Per-task cleanup pattern (applies to Tasks 1–3)

Every cleanup task follows the same shape — only the target scope changes. The pattern:

1. **Enumerate the task's sites** with a scoped lint run
2. **For each `.vue` site:**
   - Identify the symbol the warning names
   - Determine the lint category (per spec §3)
   - **If the file is `.vue` and the symbol is a script-side const/function/import:**
     - **Grep the template region for the symbol** before stripping:
       ```bash
       grep -nE "\\b<symbolName\\b|\\{\\{ *symbolName\\b|\\bsymbolName\\(|=\"symbolName\"|in symbolName\\b" path/to/file.vue
       ```
       If any match exists, the symbol is template-used. **Do NOT strip; do NOT `_`-prefix.** Apply the §5.5 escape-hatch in the spec: add a justified `eslint-disable-next-line @typescript-eslint/no-unused-vars` directive immediately above the declaration, with a comment naming the template reference.
     - Check for `defineExpose({ symbolName, ... })` — if listed, parent components consume the symbol via template refs. Treat as template-used.
   - **For Nuxt-auto-import-eligible Vue component imports** (e.g. `import GeographySelector from './GeographySelector.vue'`): verify the source file exists under `modules/ui/app/components/**` — if so, strip the import (auto-import covers it). If outside auto-import scope, leave alone and flag.
   - **For `const props = withDefaults(defineProps<Props>(), {...})` flagged unused:** drop the binding, keep the call (`withDefaults(defineProps<Props>(), {...})` — side-effecting RHS).
   - **For `const emit = defineEmits<...>()` flagged unused:** drop binding, keep call.
   - **Otherwise:** apply the standard §3 policy (strip / `_`-prefix / bare-catch).
3. **Verify lint** is 0 in the task's scope
4. **Verify vue-tsc** is at baseline (no new errors)
5. **Verify UI tests** (`pnpm test:ui:run`) match `UI_TEST_BASELINE`
6. **Verify full tests** (`pnpm test:run`) match `TEST_BASELINE` (no new failures)
7. **Commit** with `--no-verify` per master plan §9.1; document any `eslint-disable-next-line` directives in the commit message

`@typescript-eslint/no-unused-vars` has no autofixer; `eslint --fix` is a no-op for this followup. All 102 sites need manual work.

---

## Task 1: `modules/ui/app/components/**` cleanup (50 sites)

**Files:** `modules/ui/app/components/**/*.{vue,ts}` (mostly `.vue`).

Top hot-spots in this task:
- `components/RecordSearch.vue` (6)
- `components/RecordForm.vue` (6)
- `components/storage/MediaPlayer.vue` (5)
- `components/GeographyLinkForm.vue` (5)
- `components/GeographySelector.vue` (4)
- `components/records/LinkedRecordList.vue` (3)
- `components/editor/EditorHeader.vue` (3)
- `components/RecordList.vue` (3)

- [ ] **Step 1: Enumerate the in-scope sites**

```bash
pnpm --filter @civicpress/ui exec eslint 'app/components/**' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tee /tmp/lint-task-1-pre.txt | tail -3
```

Expected: `✖ 50 problems (50 errors, 0 warnings)`.

- [ ] **Step 2: Manual pass — apply the per-task pattern**

Walk through all 50 sites. For each `.vue` site, follow the template-grep workflow before any strip. Especially careful with the hot-spot files (top of the file list above) — they tend to surface false positives where script-defined functions are template-referenced.

When you finish a file, re-lint just that file to confirm 0:

```bash
pnpm --filter @civicpress/ui exec eslint 'app/components/THAT_FILE.vue' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Track the count of `eslint-disable-next-line @typescript-eslint/no-unused-vars` directives added for template-referenced symbols — report in your status.

- [ ] **Step 3: Verify lint is clean for components/**

```bash
pnpm --filter @civicpress/ui exec eslint 'app/components/**' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Expected: `0 problems`.

- [ ] **Step 4: Verify vue-tsc baseline**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -10
echo "exit=${PIPESTATUS[0]}"
```

Expected: matches `TSC_BASELINE_EXIT`. New errors mean a template reference was inadvertently broken — return to Step 2 for the offending file.

- [ ] **Step 5: Verify UI tests**

```bash
pnpm test:ui:run 2>&1 | tail -10
```

Expected: matches `UI_TEST_BASELINE` (e.g. 138/138).

- [ ] **Step 6: Verify full-repo tests (no new failures)**

```bash
pnpm test:run 2>&1 | tail -10
```

Expected: matches `TEST_BASELINE` (78 fail / 906 pass / 40 skip baseline). Any **new** failure is a regression.

- [ ] **Step 7: Commit**

```bash
git add modules/ui/app/components
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.3): strip unused-vars in modules/ui/app/components (50 sites)

Stripped dead imports + declarations; `_`-prefixed event-handler /
callback parameters that exist for interface compliance. For `.vue`
files: dropped unused `const props = withDefaults(defineProps(...))`
and `const emit = defineEmits(...)` bindings while preserving the
side-effecting calls. Verified Nuxt auto-import scope before
stripping any Vue component import.

Template-grep workflow caught N false-positive sites (script-side
const referenced in template); these got justified
eslint-disable-next-line directives per spec §5.5 — see commit body.

Per spec docs/specs/2026-06-02-lint-rollout-followup-1.3-ui-unused-vars-design.md
EOF
)"
```

Replace `N` with the actual count of disable directives added. If `N=0`, drop that paragraph or write "no false-positive sites required suppression."

`--no-verify` per refactor master plan §9.1.

---

## Task 2: `modules/ui/app/pages/**` cleanup (31 sites)

**Files:** `modules/ui/app/pages/**/*.vue`.

Top hot-spots in this task:
- `pages/records/[type]/[id]/edit.vue` (7)
- `pages/records/drafts.vue` (3)
- `pages/records/[type]/[id]/raw.vue` (3)
- `pages/settings/storage/index.vue` (2)
- `pages/settings/diagnostics.vue` (2)
- `pages/records/index.vue` (2)
- `pages/records/[type]/new.vue` (2)
- `pages/index.vue` (2)
- `pages/geography/index.vue` (2)

- [ ] **Step 1: Enumerate**

```bash
pnpm --filter @civicpress/ui exec eslint 'app/pages/**' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tee /tmp/lint-task-2-pre.txt | tail -3
```

Expected: `✖ 31 problems`.

- [ ] **Step 2: Manual pass**

Same workflow as Task 1. Pages tend to have:
- Unused composable imports (e.g. `import { useRecordDetail } from '~/composables/...'`) where only a subset of returned helpers is actually used — strip the unused destructured names from the destructure pattern
- Unused router/meta types
- Unused page-level metadata helpers (`definePageMeta(...)` is side-effecting; if the result is captured but unused, drop the binding)

The biggest single file (`edit.vue`, 7 sites) needs especially careful template-grep — it's the records editor page with lots of script-side helpers.

- [ ] **Step 3: Verify lint clean for pages/**

```bash
pnpm --filter @civicpress/ui exec eslint 'app/pages/**' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Expected: `0 problems`.

- [ ] **Step 4: Verify vue-tsc**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -10
echo "exit=${PIPESTATUS[0]}"
```

Expected: matches baseline.

- [ ] **Step 5: Verify UI tests**

```bash
pnpm test:ui:run 2>&1 | tail -10
```

Expected: matches `UI_TEST_BASELINE`.

- [ ] **Step 6: Verify full-repo tests**

```bash
pnpm test:run 2>&1 | tail -10
```

Expected: matches `TEST_BASELINE`.

- [ ] **Step 7: Commit**

```bash
git add modules/ui/app/pages
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.3): strip unused-vars in modules/ui/app/pages (31 sites)

Stripped dead imports + declarations across page components. Same
Vue-specific safeguards as Task 1: template-grep before any script-
side strip; drop-binding-keep-call for defineProps/defineEmits/
definePageMeta side-effects; verify Nuxt auto-import scope.

Template-grep workflow caught N false-positive sites (eslint-disable
directives added per spec §5.5).

Per spec docs/specs/2026-06-02-lint-rollout-followup-1.3-ui-unused-vars-design.md
EOF
)"
```

Replace `N` with the actual count.

---

## Task 3: Long-tail cleanup (21 sites)

**Files:** Everything else in `modules/ui/app/**` not yet touched:

| Subdir | Sites |
|---|---|
| `modules/ui/app/composables/**` | 11 |
| `modules/ui/app/stores/**` | 4 |
| `modules/ui/app/plugins/**` | 3 |
| `modules/ui/app/layouts/**` | 2 |
| `modules/ui/app/error.vue` | 1 |

Top hot-spot: `stores/records.ts` (3) and `plugins/01-civicApi.ts` (3).

- [ ] **Step 1: Enumerate the long-tail**

Simplest is to lint everything in `app/` and confirm only the expected dirs surface:

```bash
pnpm --filter @civicpress/ui exec eslint 'app/**' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tee /tmp/lint-task-3-pre.txt | tail -3
```

Expected: `✖ 21 problems` (everything else was cleaned in Tasks 1–2). If higher, a prior task left sites behind — investigate.

- [ ] **Step 2: Manual pass**

Composables and stores are `.ts` files — standard `.ts` cleanup, no template-grep needed. Plugins, layouts, and error.vue are `.vue` files — apply the template-grep workflow per the Per-task pattern section.

`plugins/01-civicApi.ts` likely has unused parameter sites from a fetch-interceptor signature (parameters required by the API contract but not used in the current implementation) — favor `_`-prefix.

- [ ] **Step 3: Verify lint is clean across ALL of modules/ui/app**

```bash
pnpm --filter @civicpress/ui exec eslint 'app/**' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Expected: `0 problems`. This is the FINAL state for modules/ui/app unused-vars.

- [ ] **Step 4: Verify vue-tsc**

```bash
pnpm --filter @civicpress/ui exec vue-tsc --noEmit 2>&1 | tail -10
echo "exit=${PIPESTATUS[0]}"
```

Expected: matches `TSC_BASELINE_EXIT`.

- [ ] **Step 5: Verify UI tests**

```bash
pnpm test:ui:run 2>&1 | tail -10
```

Expected: matches `UI_TEST_BASELINE`.

- [ ] **Step 6: Verify full-repo tests**

```bash
pnpm test:run 2>&1 | tail -10
```

Expected: matches `TEST_BASELINE`.

- [ ] **Step 7: Commit**

```bash
git add modules/ui/app/composables modules/ui/app/stores modules/ui/app/plugins modules/ui/app/layouts modules/ui/app/error.vue
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.3): strip unused-vars long tail in modules/ui/app (21 sites)

Final cleanup pass across composables (11), stores (4), plugins (3),
layouts (2), error.vue (1). modules/ui/app is now at 0 unused-vars
warnings.

Composables/stores are .ts (standard cleanup); plugins/layouts/error
are .vue with the template-grep safeguard. Plugin fetch-interceptor
parameters required by API contract `_`-prefixed (stub-pattern).

Per spec docs/specs/2026-06-02-lint-rollout-followup-1.3-ui-unused-vars-design.md
EOF
)"
```

---

## Task 4: Promote `unusedVarsRule` from `warn` to `error`

**Files:** `modules/ui/eslint.config.mjs`

The `unusedVarsRule` constant on line 5 is referenced by both the production block (line ~48) and the test block (line ~58). Flipping the constant changes both blocks atomically.

- [ ] **Step 1: Read the file**

```bash
sed -n '1,15p' modules/ui/eslint.config.mjs
```

Confirm line 5 reads:

```ts
const unusedVarsRule = ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }];
```

- [ ] **Step 2: Apply the change**

In `modules/ui/eslint.config.mjs`, change line 5:

```diff
-const unusedVarsRule = ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }];
+const unusedVarsRule = ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }];
```

This is a single-line change — no other edits to `eslint.config.mjs`.

- [ ] **Step 3: Verify the rule fires as error**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -3
echo "exit=${PIPESTATUS[0]}"
```

Expected: **0 errors**. Tasks 1–3 already cleaned all 102 unused-vars sites, so flipping `warn → error` produces no new errors. Remaining warnings (~13) are pre-existing from other rules — `no-explicit-any` allowlist sites + `@nuxt/eslint` style rules not silenced by `STYLE_RULES_DEFERRED`. These are out of scope for this followup.

If `M > 0 errors` after the flip, a prior task missed sites — investigate before continuing.

- [ ] **Step 4: Commit**

```bash
git add modules/ui/eslint.config.mjs
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.3): promote @typescript-eslint/no-unused-vars to error in modules/ui

After tasks 1-3 cleared all 102 unused-vars warnings in
modules/ui/app, flip the shared unusedVarsRule constant from `warn` to
`error` (line 5 of modules/ui/eslint.config.mjs). The constant is
referenced by both the production and test config blocks, so this
single-line change covers both. Future unused-vars regressions in
modules/ui/app now block local lint.

Per spec docs/specs/2026-06-02-lint-rollout-followup-1.3-ui-unused-vars-design.md
EOF
)"
```

---

## Task 5: Final verification + merge to `dev`

- [ ] **Step 1: Branch state check**

```bash
git log --oneline dev..HEAD
```

Expected: 4 commits (Tasks 1–4).

- [ ] **Step 2: Full repo lint check**

```bash
pnpm run lint 2>&1 | tail -3
```

Expected: `0 errors`. Warning totals will reflect what's left across all 5 workspaces; the gate is `0 errors`.

- [ ] **Step 3: Switch to `dev` and confirm clean state**

```bash
git checkout dev
git status -sb
```

Expected: `## dev`, clean tree.

- [ ] **Step 4: Merge with `--no-ff` and closure summary**

```bash
git merge --no-ff --no-verify refactor/lint-followup-1.3-ui-unused-vars -m "$(cat <<'EOF'
Merge branch 'refactor/lint-followup-1.3-ui-unused-vars' — 2d-followup #1.3 CLOSED

Cleared all 102 @typescript-eslint/no-unused-vars warnings in
modules/ui/app via three per-subdirectory passes:
  - Task 1: components/ (50 sites)
  - Task 2: pages/ (31 sites)
  - Task 3: composables/ + stores/ + plugins/ + layouts/ + error.vue
    (21 sites)

Then promoted the shared unusedVarsRule constant from `warn` to
`error` in modules/ui/eslint.config.mjs (Task 4). The constant is
referenced by both production and test config blocks; single-line
change covers both. Future unused-vars regressions in modules/ui/app
now block local lint.

Policy applied (per spec §3): default-strip dead imports +
declarations + pure-RHS assignments; `_`-prefix params that exist
for interface contracts; bare-catch (TS 4.4+) for unused catch params;
flag suspected wired-but-not-imported symbols as concerns.

Vue-specific safeguards (per spec §3 + §5.5):
  - defineProps/defineEmits captures flagged unused → drop binding,
    keep call (side-effecting RHS)
  - Vue component imports under app/components/** stripped where
    Nuxt auto-import covers them
  - Mandatory template-grep before any script-side strip in .vue
    files; template-referenced symbols got justified
    eslint-disable-next-line directives per spec §5.5 (N total such
    directives added)

Verification: pnpm --filter @civicpress/ui exec eslint . exits 0
with 0 errors. vue-tsc clean (matches baseline). pnpm test:ui:run
138/138. pnpm test:run = no new failures vs. pre-existing baseline
(78 fail / 906 pass / 40 skip).

Remaining lint-rollout followups: #1.4 modules/storage (45 sites),
#1.5 modules/api (32 sites). Plus #4 ~30 vue/nuxt style rules and the
2-file useTypedI18n mini-migration. Plus 4 still-open surfaced
findings + #3.1 from prior followups.

Spec: docs/specs/2026-06-02-lint-rollout-followup-1.3-ui-unused-vars-design.md
Plan: docs/plans/2026-06-02-lint-rollout-followup-1.3-ui-unused-vars.md
EOF
)"
```

Replace `N` in the message body with the actual count of disable directives added across Tasks 1–3.

Expected: merge commit created.

- [ ] **Step 5: Post-merge verification on `dev`**

```bash
pnpm --filter @civicpress/ui exec eslint . 2>&1 | tail -3
```

Expected: `0 errors`.

- [ ] **Step 6: Delete the implementation branch**

```bash
git branch -d refactor/lint-followup-1.3-ui-unused-vars
```

Expected: `Deleted branch refactor/lint-followup-1.3-ui-unused-vars`.

Per refactor push policy: do **not** push to origin.

- [ ] **Step 7: Update followup memory**

In `/Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/lint-rollout-2026-06-02-followups.md`:

Update item #1.3's entry from "deferred" to:

```markdown
- **#1.3 modules/ui (102)** — ✅ CLOSED 2026-06-03 (merge `<MERGE_SHA>`). 3 per-subdir passes: components (50), pages (31), long tail (21). Rule now `error` (single shared unusedVarsRule constant covers both prod + test blocks).
```

Update remaining-workspace list (2 left: #1.4 storage, #1.5 api).

In `MEMORY.md` index, update the followup hook line.

In `refactor-2026-05-master-plan.md`, append the #1.3 closure SHA to the description.

If any new surfaced findings emerged in this session, append them to the existing surfaced-findings list in `lint-followups-surfaced-findings.md`.

Memory files are not in the project repo; no commit needed.

- [ ] **Step 8: Verify memory files are well-formed**

```bash
head -10 /Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/lint-rollout-2026-06-02-followups.md
head -30 /Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/MEMORY.md
```

---

## Final verification gate (re-stated)

Before declaring the followup done:

- [ ] `pnpm --filter @civicpress/ui exec eslint .` exits 0 — 0 errors / 0 unused-vars warnings
- [ ] `pnpm --filter @civicpress/ui exec vue-tsc --noEmit` matches `TSC_BASELINE_EXIT`
- [ ] `pnpm test:ui:run` matches `UI_TEST_BASELINE` (138/138 or whatever was captured)
- [ ] `pnpm test:run` matches `TEST_BASELINE_PASS/FAIL/SKIP` (no new failures)
- [ ] `modules/ui/eslint.config.mjs` line 5 reads `const unusedVarsRule = ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }];`
- [ ] `git diff --stat dev~1..dev -- modules/ui/` touches only `modules/ui/app/**` and `modules/ui/eslint.config.mjs`
- [ ] No files outside `modules/ui/` modified
- [ ] All commits used `--no-verify` per master plan §9.1
- [ ] Feature branch deleted; no push to origin
- [ ] Any `eslint-disable-next-line @typescript-eslint/no-unused-vars` directives added are documented in commit messages with template-reference justification (per spec §5.5)
- [ ] Followup memory updated with merge SHA + remaining 2 workspace sessions
