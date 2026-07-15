# Lint-rollout followup #1.1 — `core/src` unused-vars cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive `@typescript-eslint/no-unused-vars` warnings in `core/src` from 170 to 0 via per-subdirectory cleanup passes, then promote the rule from `warn` to `error` in `core/eslint.config.cjs` for both production and test config blocks.

**Architecture:** Single feature branch off `dev`. Six per-subdirectory implementation tasks (each a self-contained commit), one rule-flip commit, one merge `--no-ff` to `dev` with closure summary. Subagent-driven-development pattern with spec + code-quality review between tasks.

**Tech Stack:** TypeScript 5.9, ESLint v9 flat config, `@typescript-eslint/eslint-plugin` 8.60, pnpm 9.15.9, vitest, `--no-verify` per master plan §9.1.

**Spec:** `docs/specs/2026-06-02-lint-rollout-followup-1.1-core-unused-vars-design.md` (commit `d8c8e7d`).

---

## File map

| Path | Change | Why |
|---|---|---|
| `core/src/diagnostics/**` | Modify | 58 unused-vars sites |
| `core/src/saga/**` | Modify | 33 sites |
| `core/src/records/**` | Modify | 25 sites |
| `core/src/di/**` + `core/src/database/**` | Modify | 21 sites combined |
| `core/src/geography/**` + `core/src/templates/**` + `core/src/utils/**` | Modify | 16 sites combined |
| Long tail (see Task 6) | Modify | 17 sites |
| `core/eslint.config.cjs` | Modify | Flip rule warn → error in 2 places (lines 61 + 81) |

170 total sites across `core/src/**`. No files outside `core/` touched.

---

## Pre-flight (do once, before Task 1)

- [ ] **Step 1: Confirm clean working tree on `dev` at the spec/plan tip**

```bash
cd /Users/stakabo/Work/repos/civicpress/civicpress
git status -sb
git log --oneline -3
```

Expected: `## dev`, no modified files. HEAD reaches `d8c8e7d` (spec commit) or later.

- [ ] **Step 2: Confirm pnpm version**

```bash
pnpm --version
```

Expected: `9.15.9` (via corepack shim). If not, `corepack enable && corepack prepare pnpm@9.15.9 --activate`.

- [ ] **Step 3: Capture pre-change lint baseline (full repo)**

```bash
pnpm run lint 2>&1 | tee /tmp/lint-baseline-followup-1.1.txt | tail -3
```

Expected final line: `✖ 459 problems (0 errors, 459 warnings)`. Of those 459, 170 are in `core/src`.

Capture the targeted core count:

```bash
pnpm --filter @civicpress/core exec eslint . 2>&1 | tee /tmp/lint-core-baseline.txt | tail -3
grep -c "@typescript-eslint/no-unused-vars" /tmp/lint-core-baseline.txt
```

Expected: `170`.

Record per-subdirectory counts (used to verify per-task progress):

```bash
grep "@typescript-eslint/no-unused-vars" /tmp/lint-core-baseline.txt | awk -F: '/^\//{print $1}' | awk -F/ '{print $1"/"$2"/"$3}' | sort | uniq -c | sort -rn
```

Expected:
```
  58 core/src/diagnostics
  33 core/src/saga
  25 core/src/records
  11 core/src/di
  10 core/src/database
   9 core/src/geography
   4 core/src/templates
   3 core/src/utils
   3 core/src/civic-core.ts
   3 core/src/civic-core-services.ts
   2 core/src/security
   2 core/src/hooks
   2 core/src/errors
   1 core/src/workflows
   1 core/src/notifications
   1 core/src/config
   1 core/src/cache
   1 core/src/auth
```

If counts differ, snapshot the actual numbers and re-plan task slicing accordingly.

- [ ] **Step 4: Capture pre-change typecheck baseline**

```bash
pnpm --filter @civicpress/core exec tsc --noEmit 2>&1 | tee /tmp/tsc-core-baseline.txt | tail -10
echo "exit=${PIPESTATUS[0]}"
```

Record the exit code as `TSC_BASELINE_EXIT` (likely 0 — clean). If non-zero, record the error count as `TSC_BASELINE_ERRORS` so each task can verify "no new errors introduced."

- [ ] **Step 5: Capture pre-change test baseline**

```bash
pnpm test:run 2>&1 | tee /tmp/test-baseline.txt | tail -10
```

Record:
- `TEST_BASELINE_PASS` — passed-test count
- `TEST_BASELINE_FAIL` — failed-test count (likely > 0; per memory: date-bomb, email-channel SMTP, simple-git, saga injection)
- `TEST_BASELINE_SKIP` — skipped count

Each task verifies "no NEW failures vs. these counts."

- [ ] **Step 6: Create the implementation branch**

```bash
git checkout -b refactor/lint-followup-1.1-core-unused-vars
git status -sb
```

Expected: `## refactor/lint-followup-1.1-core-unused-vars`.

---

## Per-task cleanup pattern (applies to Tasks 1–6)

Every cleanup task follows the same shape — only the target subdirectory changes. The pattern:

1. **Enumerate the task's sites** with a scoped lint run (so the implementer sees exactly what's in scope)
2. **Manual pass** for imports, declarations, params, catch-binds, destructured vars — apply the §3 policy from the spec:
   - Unused import: strip
   - Unused top-level declaration with **pure** RHS: strip
   - Unused top-level declaration with **side-effecting** RHS (function call etc.): drop the binding, keep the call (`foo()` not `const x = foo()`)
   - Unused function/method parameter for an interface-contract (override / callback / event handler / abstract method impl): **`_`-prefix**
   - Unused function/method parameter where the signature is local and changeable: **strip**
   - Unused catch parameter: prefer **bare-catch** (`catch { … }`) if TS target supports; otherwise rename to `_err`
   - Unused destructured field: **re-destructure** without it (or `_`-prefix if the destructure shape matters)
   - **Surfaced bug** (you suspect the symbol was meant to be used but the wiring is missing): **DO NOT FIX in this task.** Report DONE_WITH_CONCERNS naming the file:line and what you suspect; coordinator surfaces to the user.
3. **Verify lint** is 0 in the subdirectory
4. **Verify typecheck** is at baseline (no new errors)
5. **Verify tests** match baseline failure counts (no new failures)
6. **Commit** with `--no-verify` and the conventional message

Note: `@typescript-eslint/no-unused-vars` has no autofixer under the current rule config; `eslint --fix` is a no-op for this followup. All 170 sites need manual work.

The `--no-verify` is approved per refactor master plan §9.1 (memory `refactor-no-verify-policy`).

---

## Task 1: `core/src/diagnostics/**` cleanup (58 sites)

**Files:** Files inside `core/src/diagnostics/**`. Largest single task — split internally if needed but keep as one commit.

Top hot-spots:
- `core/src/diagnostics/checkers/search-checker.ts` (7)
- `core/src/diagnostics/checkers/system-checker.ts` (6)
- `core/src/diagnostics/checkers/filesystem-checker.ts` (6)
- `core/src/diagnostics/checkers/config-checker.ts` (6)

- [ ] **Step 1: Enumerate the in-scope sites**

```bash
pnpm --filter @civicpress/core exec eslint 'src/diagnostics/**/*.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tee /tmp/lint-task-1-pre.txt | tail -3
```

Expected: `✖ 58 problems (58 errors, 0 warnings)` (re-promoting the rule to error for the duration so exit code reflects done state).

Sites are listed in `/tmp/lint-task-1-pre.txt`. Review them before editing.

- [ ] **Step 2: First-pass `--fix` (covers any incidentally-fixable rules; no-op for unused-vars itself)**

```bash
pnpm --filter @civicpress/core exec eslint 'src/diagnostics/**/*.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' --fix
```

`@typescript-eslint/no-unused-vars` has no autofixer, so the unused-vars count is unchanged by this command. The pass is included only for hygiene — it will fix any other auto-fixable rule (formatting, etc.) that happens to be triggered by edits in scope. Confirm nothing meaningful changed:

```bash
pnpm --filter @civicpress/core exec eslint 'src/diagnostics/**/*.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

- [ ] **Step 3: Manual pass — apply the per-category policy**

Walk through the remaining sites one by one. For each, apply the rule from the "Per-task cleanup pattern" section above. Read each file in context — especially:

- Is the unused declaration **really** dead, or is there a wired-up-but-disabled comment near it? Read 5 lines before and 5 lines after to be sure.
- For parameters: is this function called via an interface or override? Search for callers (`grep -rn "functionName" core/src`) before deciding strip vs `_`-prefix.
- For catch params: does the catch body do anything? An empty catch may be intentional (silently swallowing a known recoverable error) — `_`-prefix it and DON'T add a `console.error`.

Surface any genuine-bug suspicions per Step 3 of the pattern.

- [ ] **Step 4: Verify lint is clean for diagnostics**

```bash
pnpm --filter @civicpress/core exec eslint 'src/diagnostics/**/*.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Expected: `0 problems`.

- [ ] **Step 5: Verify typecheck baseline**

```bash
pnpm --filter @civicpress/core exec tsc --noEmit 2>&1 | tail -5
echo "exit=${PIPESTATUS[0]}"
```

Expected: exit matches `TSC_BASELINE_EXIT`. If `TSC_BASELINE_EXIT=0`, must still be 0. If non-zero, error count must be ≤ baseline.

- [ ] **Step 6: Verify tests (no new failures)**

```bash
pnpm test:run 2>&1 | tail -10
```

Compare to `TEST_BASELINE_PASS/FAIL/SKIP`. Any **new** failure is a regression — investigate before committing. Failures matching the baseline are acceptable (pre-existing date-bomb / SMTP / simple-git / saga injection).

- [ ] **Step 7: Commit**

```bash
git add core/src/diagnostics
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.1): strip unused-vars in core/src/diagnostics (58 sites)

Stripped dead imports + declarations; `_`-prefixed parameters that
exist for interface contracts (Checker callback signatures); bare-catch
where TS allowed. No behavioral changes — pure dead-code removal.

Per spec docs/specs/2026-06-02-lint-rollout-followup-1.1-core-unused-vars-design.md
EOF
)"
```

If any sites were flagged as surfaced-bug concerns (DONE_WITH_CONCERNS), include them in the commit body or in the implementer's report.

---

## Task 2: `core/src/saga/**` cleanup (33 sites)

**Files:** `core/src/saga/**/*.ts`

Top hot-spots:
- `core/src/saga/saga-executor.ts` (7)
- `core/src/saga/__tests__/saga-failure-injection.test.ts` (6)

- [ ] **Step 1: Enumerate**

```bash
pnpm --filter @civicpress/core exec eslint 'src/saga/**/*.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tee /tmp/lint-task-2-pre.txt | tail -3
```

Expected: `✖ 33 problems`.

- [ ] **Step 2: First-pass `--fix` (covers any incidentally-fixable rules; no-op for unused-vars itself)**

```bash
pnpm --filter @civicpress/core exec eslint 'src/saga/**/*.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' --fix
```

- [ ] **Step 3: Manual pass**

Apply the per-category policy. Saga executor likely has interface-contract params (step callbacks) — favor `_`-prefix there. Test files have spy declarations — if a spy is declared but never used in assertions, the test may be broken or the spy may be redundant; flag as a concern rather than auto-strip.

- [ ] **Step 4: Verify lint**

```bash
pnpm --filter @civicpress/core exec eslint 'src/saga/**/*.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Expected: `0 problems`.

- [ ] **Step 5: Verify typecheck baseline**

```bash
pnpm --filter @civicpress/core exec tsc --noEmit 2>&1 | tail -5
echo "exit=${PIPESTATUS[0]}"
```

Expected: matches `TSC_BASELINE_EXIT`.

- [ ] **Step 6: Verify tests**

```bash
pnpm test:run 2>&1 | tail -10
```

Compare to `TEST_BASELINE`. No new failures.

- [ ] **Step 7: Commit**

```bash
git add core/src/saga
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.1): strip unused-vars in core/src/saga (33 sites)

Stripped dead imports + declarations; `_`-prefixed saga-step callback
parameters that exist for interface compliance. Test files cleaned of
unused spy declarations (flagged any genuine spy gaps as concerns).

Per spec docs/specs/2026-06-02-lint-rollout-followup-1.1-core-unused-vars-design.md
EOF
)"
```

---

## Task 3: `core/src/records/**` cleanup (25 sites)

**Files:** `core/src/records/**/*.ts`

Top hot-spot:
- `core/src/records/record-parser.ts` (14)

- [ ] **Step 1: Enumerate**

```bash
pnpm --filter @civicpress/core exec eslint 'src/records/**/*.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tee /tmp/lint-task-3-pre.txt | tail -3
```

Expected: `✖ 25 problems`.

- [ ] **Step 2: First-pass `--fix` (covers any incidentally-fixable rules; no-op for unused-vars itself)**

```bash
pnpm --filter @civicpress/core exec eslint 'src/records/**/*.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' --fix
```

- [ ] **Step 3: Manual pass**

`record-parser.ts` is the big one. It's a parser file with many helper functions; some declared-but-never-used helpers are likely dead code from earlier refactors. Be careful with anything that LOOKS like a public API entry — `grep -rn "functionName" core/src cli modules` before stripping a function declaration that could be imported elsewhere.

- [ ] **Step 4: Verify lint**

```bash
pnpm --filter @civicpress/core exec eslint 'src/records/**/*.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Expected: `0 problems`.

- [ ] **Step 5: Verify typecheck baseline**

```bash
pnpm --filter @civicpress/core exec tsc --noEmit 2>&1 | tail -5
echo "exit=${PIPESTATUS[0]}"
```

Expected: matches `TSC_BASELINE_EXIT`.

- [ ] **Step 6: Verify tests**

```bash
pnpm test:run 2>&1 | tail -10
```

Compare to `TEST_BASELINE`.

- [ ] **Step 7: Commit**

```bash
git add core/src/records
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.1): strip unused-vars in core/src/records (25 sites)

record-parser.ts cleaned of 14 dead helpers/imports. Verified each
function's reach via cross-workspace grep before stripping; flagged any
borderline cases as concerns.

Per spec docs/specs/2026-06-02-lint-rollout-followup-1.1-core-unused-vars-design.md
EOF
)"
```

---

## Task 4: `core/src/di/**` + `core/src/database/**` cleanup (21 sites)

**Files:** `core/src/di/**/*.ts` (11 sites) + `core/src/database/**/*.ts` (10 sites)

- [ ] **Step 1: Enumerate**

```bash
pnpm --filter @civicpress/core exec eslint 'src/di/**/*.ts' 'src/database/**/*.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tee /tmp/lint-task-4-pre.txt | tail -3
```

Expected: `✖ 21 problems`.

- [ ] **Step 2: First-pass `--fix` (covers any incidentally-fixable rules; no-op for unused-vars itself)**

```bash
pnpm --filter @civicpress/core exec eslint 'src/di/**/*.ts' 'src/database/**/*.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' --fix
```

- [ ] **Step 3: Manual pass**

DI containers + database adapters often have:
- Generic-type parameters declared but never used in the body — strip if they don't constrain anything; `_T` if they document intent
- Constructor/factory parameters that exist for DI registration but aren't used in this concrete implementation — `_`-prefix

- [ ] **Step 4: Verify lint**

```bash
pnpm --filter @civicpress/core exec eslint 'src/di/**/*.ts' 'src/database/**/*.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Expected: `0 problems`.

- [ ] **Step 5: Verify typecheck baseline**

```bash
pnpm --filter @civicpress/core exec tsc --noEmit 2>&1 | tail -5
echo "exit=${PIPESTATUS[0]}"
```

Expected: matches `TSC_BASELINE_EXIT`.

- [ ] **Step 6: Verify tests**

```bash
pnpm test:run 2>&1 | tail -10
```

Compare to `TEST_BASELINE`.

- [ ] **Step 7: Commit**

```bash
git add core/src/di core/src/database
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.1): strip unused-vars in core/src/{di,database} (21 sites)

Stripped dead imports + declarations across DI containers and database
adapters. `_`-prefixed registration-contract parameters that exist for
DI/adapter interface compliance but aren't used in the concrete impl.

Per spec docs/specs/2026-06-02-lint-rollout-followup-1.1-core-unused-vars-design.md
EOF
)"
```

---

## Task 5: `core/src/geography/**` + `core/src/templates/**` + `core/src/utils/**` cleanup (16 sites)

**Files:** `core/src/geography/**/*.ts` (9) + `core/src/templates/**/*.ts` (4) + `core/src/utils/**/*.ts` (3)

Top hot-spot:
- `core/src/geography/geography-manager.ts` (7)

- [ ] **Step 1: Enumerate**

```bash
pnpm --filter @civicpress/core exec eslint 'src/geography/**/*.ts' 'src/templates/**/*.ts' 'src/utils/**/*.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tee /tmp/lint-task-5-pre.txt | tail -3
```

Expected: `✖ 16 problems`.

- [ ] **Step 2: First-pass `--fix` (covers any incidentally-fixable rules; no-op for unused-vars itself)**

```bash
pnpm --filter @civicpress/core exec eslint 'src/geography/**/*.ts' 'src/templates/**/*.ts' 'src/utils/**/*.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' --fix
```

- [ ] **Step 3: Manual pass**

Geography manager likely has GeoJSON-typed parameters and CRS helpers that may look unused but are part of an interface contract.

- [ ] **Step 4: Verify lint**

```bash
pnpm --filter @civicpress/core exec eslint 'src/geography/**/*.ts' 'src/templates/**/*.ts' 'src/utils/**/*.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Expected: `0 problems`.

- [ ] **Step 5: Verify typecheck baseline**

```bash
pnpm --filter @civicpress/core exec tsc --noEmit 2>&1 | tail -5
echo "exit=${PIPESTATUS[0]}"
```

Expected: matches `TSC_BASELINE_EXIT`.

- [ ] **Step 6: Verify tests**

```bash
pnpm test:run 2>&1 | tail -10
```

Compare to `TEST_BASELINE`.

- [ ] **Step 7: Commit**

```bash
git add core/src/geography core/src/templates core/src/utils
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.1): strip unused-vars in core/src/{geography,templates,utils} (16 sites)

Stripped dead imports + declarations. `_`-prefixed CRS/geometry
callback parameters where the signature is part of a public contract.

Per spec docs/specs/2026-06-02-lint-rollout-followup-1.1-core-unused-vars-design.md
EOF
)"
```

---

## Task 6: long-tail cleanup (17 sites across small dirs + top-level files)

**Files:** Everything under `core/src/**` not yet touched. Per pre-flight numbers, this is:

| Path | Sites |
|---|---|
| `core/src/civic-core.ts` | 3 |
| `core/src/civic-core-services.ts` | 3 |
| `core/src/security/**` | 2 |
| `core/src/hooks/**` | 2 |
| `core/src/errors/**` | 2 |
| `core/src/workflows/**` | 1 |
| `core/src/notifications/**` | 1 |
| `core/src/config/**` | 1 |
| `core/src/cache/**` | 1 |
| `core/src/auth/**` | 1 |

Total: ~17 sites.

- [ ] **Step 1: Enumerate the long-tail**

The simplest way is to lint everything remaining and confirm only these dirs surface:

```bash
pnpm --filter @civicpress/core exec eslint . --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tee /tmp/lint-task-6-pre.txt | tail -3
```

Expected: `✖ 17 problems` (everything else was cleaned in Tasks 1–5). If the count is higher, a prior task left sites behind — inspect the output and identify the dir.

- [ ] **Step 2: First-pass `--fix` (covers any incidentally-fixable rules; no-op for unused-vars itself)**

```bash
pnpm --filter @civicpress/core exec eslint . --rule '{"@typescript-eslint/no-unused-vars": "error"}' --fix
```

- [ ] **Step 3: Manual pass**

Per-category policy. The top-level files (`civic-core.ts`, `civic-core-services.ts`) are the system's main entry points — be especially careful about stripping anything that looks like an exported API symbol. Verify with `grep -rn "name" cli modules` before stripping.

- [ ] **Step 4: Verify lint is clean across all of `core/src`**

```bash
pnpm --filter @civicpress/core exec eslint . --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Expected: `0 problems`. This is the FINAL state — `core/src` is now free of unused-vars warnings.

- [ ] **Step 5: Verify typecheck baseline**

```bash
pnpm --filter @civicpress/core exec tsc --noEmit 2>&1 | tail -5
echo "exit=${PIPESTATUS[0]}"
```

Expected: matches `TSC_BASELINE_EXIT`.

- [ ] **Step 6: Verify tests**

```bash
pnpm test:run 2>&1 | tail -10
```

Compare to `TEST_BASELINE`.

- [ ] **Step 7: Commit**

```bash
git add core/src
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.1): strip unused-vars long tail in core/src (17 sites)

Final cleanup pass across civic-core.ts + civic-core-services.ts +
security/hooks/errors/workflows/notifications/config/cache/auth.
core/src is now at 0 unused-vars warnings.

Per spec docs/specs/2026-06-02-lint-rollout-followup-1.1-core-unused-vars-design.md
EOF
)"
```

---

## Task 7: Promote rule from `warn` to `error`

**Files:** `core/eslint.config.cjs`

The rule appears in two places (lines 61 + 81 per pre-flight inspection): one for the `**/*.test.ts` block, one for the `**/*.ts` production block.

- [ ] **Step 1: Read the file**

```bash
sed -n '40,90p' core/eslint.config.cjs
```

Confirm both occurrences of `'@typescript-eslint/no-unused-vars': ['warn', ...]` are present.

- [ ] **Step 2: Apply the change**

In `core/eslint.config.cjs`, change:

```diff
       'no-unused-vars': 'off',
-      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
+      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
```

in **both** the `**/*.test.ts` config block (around line 61) and the `**/*.ts` production config block (around line 81). The script-files block (`**/*.cjs`, `**/*.mjs`, `**/*.js` around line 86) does NOT have this rule and should not be touched.

- [ ] **Step 3: Verify the rule fires as error**

```bash
pnpm --filter @civicpress/core exec eslint . 2>&1 | tail -3
echo "exit=${PIPESTATUS[0]}"
```

Expected: `0 problems` (Tasks 1–6 already cleaned everything). Exit code 0. If `✖ N problems (N errors, 0 warnings)`, a Task-N pass missed sites — investigate and fix before continuing.

- [ ] **Step 4: Commit**

```bash
git add core/eslint.config.cjs
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.1): promote @typescript-eslint/no-unused-vars to error in core

After tasks 1-6 cleared all 170 unused-vars warnings in core/src,
flip the rule from `warn` to `error` in both the production and test
config blocks of core/eslint.config.cjs. Future regressions now block
local lint (no CI per no-cicd-policy; pre-commit hook lint-staged
will fail on new dead code in changed files).

Per spec docs/specs/2026-06-02-lint-rollout-followup-1.1-core-unused-vars-design.md
EOF
)"
```

---

## Task 8: Final verification + merge to `dev`

- [ ] **Step 1: Branch state check**

```bash
git log --oneline dev..HEAD
```

Expected: 7 commits (Tasks 1-7).

- [ ] **Step 2: Full repo lint check**

```bash
pnpm run lint 2>&1 | tail -3
```

Expected: `✖ N problems (0 errors, N warnings)` where `N = 459 - 170 = 289` — all the OTHER workspaces' unused-vars warnings still exist (followups #1.2–#1.5 will handle them).

- [ ] **Step 3: Switch to `dev` and confirm clean state**

```bash
git checkout dev
git status -sb
```

Expected: `## dev`, clean tree.

- [ ] **Step 4: Merge with `--no-ff` and closure summary**

```bash
git merge --no-ff --no-verify refactor/lint-followup-1.1-core-unused-vars -m "$(cat <<'EOF'
Merge branch 'refactor/lint-followup-1.1-core-unused-vars' — 2d-followup #1.1 CLOSED

Cleared all 170 @typescript-eslint/no-unused-vars warnings in core/src
via six per-subdirectory passes:
  - Task 1: core/src/diagnostics (58 sites)
  - Task 2: core/src/saga (33 sites)
  - Task 3: core/src/records (25 sites)
  - Task 4: core/src/{di,database} (21 sites)
  - Task 5: core/src/{geography,templates,utils} (16 sites)
  - Task 6: long tail across core/src top-level files + small dirs (17 sites)

Then promoted the rule from `warn` to `error` in both production and
test config blocks of core/eslint.config.cjs (Task 7). Future
unused-vars regressions in core/src now block local lint.

Policy applied (per spec §3): default-strip dead imports + declarations
+ pure-RHS assignments; `_`-prefix params that exist for interface
contracts; bare-catch (TS 4.4+) for unused catch params; flag
suspected wired-but-not-imported symbols as concerns rather than
silently strip.

Verification: pnpm --filter @civicpress/core exec eslint . = 0
problems. tsc --noEmit matches baseline. pnpm test:run = no new
failures vs. pre-existing baseline (date-bomb, email-channel SMTP,
simple-git, saga injection).

Remaining lint-rollout followups: #1.2 cli (110 sites), #1.3 ui
(102 sites), #1.4 storage (45 sites), #1.5 api (32 sites), plus
the still-deferred #4 vue/nuxt style rules and the 2-file
useTypedI18n mini-migration surfaced during #2.

Spec: docs/specs/2026-06-02-lint-rollout-followup-1.1-core-unused-vars-design.md
Plan: docs/plans/2026-06-02-lint-rollout-followup-1.1-core-unused-vars.md
EOF
)"
```

Expected: merge commit created.

- [ ] **Step 5: Post-merge verification on `dev`**

```bash
pnpm --filter @civicpress/core exec eslint . 2>&1 | tail -3
```

Expected: `0 problems`.

- [ ] **Step 6: Delete the implementation branch**

```bash
git branch -d refactor/lint-followup-1.1-core-unused-vars
```

Expected: `Deleted branch refactor/lint-followup-1.1-core-unused-vars`.

Per refactor push policy: do **not** push to origin.

- [ ] **Step 7: Update followup memory**

In `/Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/lint-rollout-2026-06-02-followups.md`:

Replace item #1's body with:

```markdown
1. **Unused-vars cleanup. PARTIAL — #1.1 core CLOSED 2026-06-02 (merge `<MERGE_SHA>`); 4 workspaces remaining.**

   Cleanup is split into 5 per-workspace sub-followups (user chose per-workspace separate-merges cadence on 2026-06-02). Memory's original "~600 findings" was an overestimate; real total is **459** across:

   - **#1.1 core** (170) — ✅ CLOSED 2026-06-02 (merge `<MERGE_SHA>`); rule promoted to `error` in both prod and test blocks of `core/eslint.config.cjs`.
   - **#1.2 cli** (110) — deferred
   - **#1.3 modules/ui** (102) — deferred
   - **#1.4 modules/storage** (45) — deferred
   - **#1.5 modules/api** (32) — deferred

   End-state goal: rule is `error` repo-wide once all 5 are done. After each workspace's cleanup lands, the corresponding eslint config flips warn → error.
```

In `MEMORY.md` index, update the followup hook line with the new partial state.

In `refactor-2026-05-master-plan.md`, append the #1.1 closure SHA to the description.

Memory files aren't in the project repo, so no commit needed.

- [ ] **Step 8: Verify memory files are well-formed**

```bash
head -10 /Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/lint-rollout-2026-06-02-followups.md
head -30 /Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/MEMORY.md
```

---

## Final verification gate (re-stated)

Before declaring the followup done:

- [ ] `pnpm --filter @civicpress/core exec eslint .` exits 0 — 0 errors / 0 unused-vars warnings
- [ ] `pnpm --filter @civicpress/core exec tsc --noEmit` matches `TSC_BASELINE_EXIT`
- [ ] `pnpm test:run` matches `TEST_BASELINE_PASS/FAIL/SKIP` (no new failures)
- [ ] `core/eslint.config.cjs` has `'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]` in **both** the `**/*.test.ts` (line ~61) and `**/*.ts` (line ~81) config blocks
- [ ] `git diff --stat dev~1..dev -- core/` touches only `core/src/**` and `core/eslint.config.cjs`
- [ ] No files outside `core/` modified
- [ ] All commits used `--no-verify` per master plan §9.1
- [ ] Feature branch deleted; no push to origin
- [ ] Followup memory updated with merge SHA + remaining 4 workspace sessions
