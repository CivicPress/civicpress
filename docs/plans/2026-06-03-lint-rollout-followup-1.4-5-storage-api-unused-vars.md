# Lint-rollout followup #1.4-5 — combined `modules/storage` + `modules/api` unused-vars cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive `@typescript-eslint/no-unused-vars` warnings in `modules/storage/src/**` (45) and `modules/api/src/**` (32) from 77 to 0 via two per-workspace passes, then promote the rule from `warn` to `error` in both workspaces' eslint configs (two blocks each). Closes the entire `#1 unused-vars` umbrella (459 sites across 5 workspaces).

**Architecture:** Single feature branch off `dev`. Two per-workspace implementation tasks (each a self-contained commit), two rule-flip commits (one per workspace), one merge `--no-ff` to `dev` with closure summary. Subagent-driven-development pattern with spec + code-quality review between tasks 1 and 2.

**Tech Stack:** TypeScript 5.9, ESLint v9 flat config, `@typescript-eslint/eslint-plugin` 8.60, pnpm 9.15.9 via corepack, vitest, Express (api workspace). `--no-verify` per master plan §9.1.

**Spec:** `docs/specs/2026-06-03-lint-rollout-followup-1.4-5-storage-api-unused-vars-design.md` (commit `a557352`).

---

## File map

| Task | Scope | Sites |
|---|---|---|
| Task 1 | `modules/storage/src/**` (tests + src) | 45 |
| Task 2 | `modules/api/src/**` | 32 |
| Task 3 | `modules/storage/eslint.config.cjs` lines 58 + 78 (`warn → error`) | — |
| Task 4 | `modules/api/eslint.config.cjs` lines 60 + 80 (`warn → error`) | — |

Total 77 sites across 2 workspaces. No files outside `modules/storage/**` or `modules/api/**` touched.

---

## Pre-flight (do once, before Task 1)

- [ ] **Step 1: Confirm clean working tree on `dev`**

```bash
cd /Users/stakabo/Work/repos/civicpress/civicpress
git status -sb
git log --oneline -3
```

Expected: `## dev`, no modified files. HEAD reaches `a557352` (spec commit) or later.

- [ ] **Step 2: Confirm pnpm version**

```bash
pnpm --version
```

Expected: `9.15.9` via corepack.

- [ ] **Step 3: Capture pre-change storage lint baseline**

```bash
pnpm --filter @civicpress/storage exec eslint . 2>&1 | tee /tmp/lint-storage-baseline.txt | tail -3
grep -c "@typescript-eslint/no-unused-vars" /tmp/lint-storage-baseline.txt
```

Expected: `✖ 128 problems (0 errors, 128 warnings)`. Unused-vars count: `45`.

Verify per-subdir distribution:

```bash
awk '/^\//{file=$0; next} /@typescript-eslint\/no-unused-vars/{print file}' /tmp/lint-storage-baseline.txt | sed 's|/Users/stakabo/Work/repos/civicpress/civicpress/||' | awk -F/ '{print $1"/"$2"/"$3"/"$4}' | sort | uniq -c | sort -rn
```

Expected:
```
  20 modules/storage/src/__tests__
   9 modules/storage/src/cloud-uuid-storage
   4 modules/storage/src/reporting
   4 modules/storage/src/credential-manager.ts
   2 modules/storage/src/storage-services.ts
   2 modules/storage/src/cleanup
   1 modules/storage/src/metrics
   1 modules/storage/src/lifecycle
   1 modules/storage/src/health
   1 modules/storage/src/errors
```

- [ ] **Step 4: Capture pre-change api lint baseline**

```bash
pnpm --filter @civicpress/api exec eslint . 2>&1 | tee /tmp/lint-api-baseline.txt | tail -3
grep -c "@typescript-eslint/no-unused-vars" /tmp/lint-api-baseline.txt
```

Expected: `✖ 55 problems (0 errors, 55 warnings)`. Unused-vars count: `32`.

Verify per-subdir distribution:

```bash
awk '/^\//{file=$0; next} /@typescript-eslint\/no-unused-vars/{print file}' /tmp/lint-api-baseline.txt | sed 's|/Users/stakabo/Work/repos/civicpress/civicpress/||' | awk -F/ '{print $1"/"$2"/"$3"/"$4}' | sort | uniq -c | sort -rn
```

Expected:
```
  22 modules/api/src/routes
   5 modules/api/src/middleware
   4 modules/api/src/utils
   1 modules/api/src/index.ts
```

- [ ] **Step 5: Capture both workspaces' typecheck baselines**

```bash
pnpm --filter @civicpress/storage exec tsc --noEmit 2>&1 | tail -5
echo "storage-exit=${PIPESTATUS[0]}"

pnpm --filter @civicpress/api exec tsc --noEmit 2>&1 | tail -5
echo "api-exit=${PIPESTATUS[0]}"
```

Record `STORAGE_TSC_BASELINE_EXIT` and `API_TSC_BASELINE_EXIT` (both expected 0).

- [ ] **Step 6: Capture pre-change test baseline (storage-specific + full repo)**

```bash
pnpm -C modules/storage test:run 2>&1 | tee /tmp/test-storage-baseline.txt | tail -10
```

Record `STORAGE_TEST_BASELINE_PASS` (expected 216 per memory; confirm).

```bash
pnpm test:run 2>&1 | tee /tmp/test-baseline.txt | tail -10
```

Record `TEST_BASELINE_PASS`, `TEST_BASELINE_FAIL`, `TEST_BASELINE_SKIP` (expected 78 fail / 906-907 pass / 40 skip per memory).

- [ ] **Step 7: Create the implementation branch**

```bash
git checkout -b refactor/lint-followup-1.4-5-storage-api-unused-vars
git status -sb
```

Expected: `## refactor/lint-followup-1.4-5-storage-api-unused-vars`.

---

## Per-task cleanup pattern (applies to Tasks 1 and 2)

Every cleanup task follows the same shape — only the target workspace changes. The pattern:

1. **Enumerate the task's sites** with a scoped lint run
2. **Manual pass** for imports, declarations, params, catch-binds, destructured vars — apply the spec §3 policy:
   - Unused import → strip
   - Unused top-level declaration (pure RHS) → strip; (side-effecting RHS) → keep call, drop binding
   - Unused function/method param for interface contract (Express `(req, res, next)`, storage service interfaces, etc.) → `_`-prefix
   - Unused function/method param, local signature → strip (update callers)
   - Unused catch param → bare-`catch` (TS 4.4+) or `_err`
   - Unused destructured field → re-destructure without it (or `_`-prefix if shape matters)
   - **Surfaced bug** (declared, never wired — e.g., a captured spy never asserted on, a fetched service handle never used) → **DO NOT FIX in this task.** Report DONE_WITH_CONCERNS naming the file:line and what you suspect.
3. **Verify lint** is 0 in the workspace
4. **Verify typecheck** is at baseline (no new errors)
5. **Verify tests** match baseline counts (no new failures)
6. **Commit** with `--no-verify` per master plan §9.1

`@typescript-eslint/no-unused-vars` has no autofixer; `eslint --fix` is a no-op for this followup. All 77 sites need manual work.

---

## Task 1: `modules/storage/src/**` cleanup (45 sites)

**Files:** `modules/storage/src/**/*.ts`. 20 in `__tests__/` + 25 in src.

Top hot-spots:
- `__tests__/circuit-breaker.test.ts` (10) — single concentrated cleanup
- `reporting/storage-usage-reporter.ts` (4)
- `credential-manager.ts` (4)
- `cloud-uuid-storage/download-ops.ts` (3)
- `__tests__/cache-integration.test.ts` (3)

### Per-task heuristics (storage)

- **Test files**: storage tests have shown the "captured-effect-never-asserted" pattern in prior sessions (e.g. saga-failure-injection.test.ts in #1.1). For each unused spy or captured value in `__tests__/`, ask: "should there have been an assertion on this?" If yes, flag as surfaced bug + `_`-prefix (don't auto-strip — losing the spy may hide regressions silently).
- **`cloud-uuid-storage/`**: 9 sites across multiple ops files. Most likely a mix of unused error-narrowing imports (`errorMessage`/`errorStack`) and possibly stub-pattern parameters in operation classes. Standard cleanup applies.
- **`credential-manager.ts`** (4 sites in one file): check for the credential-rotation interface contract pattern before stripping any field-name destructures.

- [ ] **Step 1: Enumerate the in-scope sites**

```bash
pnpm --filter @civicpress/storage exec eslint . --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tee /tmp/lint-task-1-pre.txt | tail -3
```

Expected: `✖ 45 problems (45 errors, 0 warnings)`.

Sites are listed in `/tmp/lint-task-1-pre.txt`. Review them before editing.

- [ ] **Step 2: Manual pass — apply the per-task policy**

Walk through all 45 sites. Start with the hot-spot files (top of the list above) — they have the highest concentration and likely the most pattern-revealing context. Save the test-file pass for after src is clean so any "missing-assertion" finds can be cleanly flagged.

When you finish a file, re-lint just that file to confirm 0:

```bash
pnpm --filter @civicpress/storage exec eslint 'src/THAT_FILE.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Track any "captured-effect-never-asserted" sites flagged as DONE_WITH_CONCERNS — report them in your status.

- [ ] **Step 3: Verify lint is clean for storage**

```bash
pnpm --filter @civicpress/storage exec eslint . --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Expected: `0 problems`.

- [ ] **Step 4: Verify storage typecheck baseline**

```bash
pnpm --filter @civicpress/storage exec tsc --noEmit 2>&1 | tail -5
echo "exit=${PIPESTATUS[0]}"
```

Expected: exit matches `STORAGE_TSC_BASELINE_EXIT`.

- [ ] **Step 5: Verify storage-specific tests**

```bash
pnpm -C modules/storage test:run 2>&1 | tail -10
```

Expected: matches `STORAGE_TEST_BASELINE_PASS` (likely 216/216). Any NEW failure is a regression.

- [ ] **Step 6: Verify full-repo tests (no new failures)**

```bash
pnpm test:run 2>&1 | tail -10
```

Compare to `TEST_BASELINE_PASS/FAIL/SKIP`.

- [ ] **Step 7: Commit**

```bash
git add modules/storage/src
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.4): strip unused-vars in modules/storage (45 sites)

Cleared all 45 @typescript-eslint/no-unused-vars warnings in
modules/storage/src/** via a single pass. 20 sites in __tests__/
(circuit-breaker.test.ts hot-spot: 10), 25 in src (cloud-uuid-storage
9, reporting 4, credential-manager 4, cleanup 2, storage-services 2,
+ 4 across small dirs).

Policy applied (per spec §3): default-strip dead imports +
declarations + pure-RHS assignments; `_`-prefix params that exist for
interface contracts; bare-catch (TS 4.4+) for unused catch params;
flag suspected captured-effect-never-asserted patterns as concerns
rather than auto-strip.

Per spec docs/specs/2026-06-03-lint-rollout-followup-1.4-5-storage-api-unused-vars-design.md
EOF
)"
```

`--no-verify` per refactor master plan §9.1 (pre-existing test failures on `dev` trip the pre-commit hook).

---

## Task 2: `modules/api/src/**` cleanup (32 sites)

**Files:** `modules/api/src/**/*.ts`. 22 in `routes/` + 5 in `middleware/` + 4 in `utils/` + 1 in `index.ts`.

Top hot-spots:
- `routes/__tests__/diagnose.test.ts` (5)
- `utils/api-logger.ts` (4)
- `middleware/error-handler.ts` (4)
- `routes/geography.ts` (3)
- `routes/users/crud-handlers.ts` (2)
- `routes/records/write-handlers.ts` (2)
- `routes/diff/diff-engine.ts` (2)
- `routes/audit.ts` (2)

### Per-task heuristics (api)

- **Express middleware signatures**: route handlers and middleware have specific Express signatures (`(req, res, next)` for normal middleware; `(err, req, res, next)` for error-handling middleware). Unused params in these positions exist for the Express interface contract — **`_`-prefix is the right move**, not strip.
- **`middleware/error-handler.ts`** (4 sites): probably 4 `_`-prefixes on standard Express error-handler signature parameters.
- **`utils/api-logger.ts`** (4 sites): possibly unused logger-factory params (interface contract) or dead imports.
- **Route handler tests** (`routes/__tests__/diagnose.test.ts`, 5 sites): same "captured-effect-never-asserted" risk as the storage tests + prior cli/saga test sessions. Flag any spy that's captured but never asserted on.

- [ ] **Step 1: Enumerate the in-scope sites**

```bash
pnpm --filter @civicpress/api exec eslint . --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tee /tmp/lint-task-2-pre.txt | tail -3
```

Expected: `✖ 32 problems (32 errors, 0 warnings)`.

- [ ] **Step 2: Manual pass**

Walk through all 32 sites. Express signatures dominate the routes/ + middleware/ sites — be ready to `_`-prefix rather than strip. Hot-spot files first.

For test sites in `routes/__tests__/`: flag missing-assertion patterns as concerns.

- [ ] **Step 3: Verify lint is clean for api**

```bash
pnpm --filter @civicpress/api exec eslint . --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Expected: `0 problems`.

- [ ] **Step 4: Verify api typecheck baseline**

```bash
pnpm --filter @civicpress/api exec tsc --noEmit 2>&1 | tail -5
echo "exit=${PIPESTATUS[0]}"
```

Expected: exit matches `API_TSC_BASELINE_EXIT`.

- [ ] **Step 5: Verify full-repo tests**

```bash
pnpm test:run 2>&1 | tail -10
```

Compare to `TEST_BASELINE_PASS/FAIL/SKIP` baseline. API tests run under the root test command (per memory: 270/270 — verify against current baseline).

- [ ] **Step 6: Commit**

```bash
git add modules/api/src
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.5): strip unused-vars in modules/api (32 sites)

Cleared all 32 @typescript-eslint/no-unused-vars warnings in
modules/api/src/** via a single pass. 22 sites in routes/ (Express
handlers + tests), 5 in middleware/ (error-handler.ts hot-spot: 4),
4 in utils/ (api-logger.ts hot-spot: 4), 1 in index.ts.

Policy applied (per spec §3): default-strip dead imports +
declarations + pure-RHS assignments; `_`-prefix Express interface-
contract parameters (req/res/next/err) — heavy presence in routes/
and middleware/; bare-catch (TS 4.4+) for unused catch params; flag
suspected wired-but-not-imported symbols + captured-effect-never-
asserted test patterns as concerns rather than auto-strip.

Per spec docs/specs/2026-06-03-lint-rollout-followup-1.4-5-storage-api-unused-vars-design.md
EOF
)"
```

`--no-verify` per refactor master plan §9.1.

---

## Task 3: Promote storage rule from `warn` to `error`

**Files:** `modules/storage/eslint.config.cjs`

The rule appears in two places (lines 58 + 78 per pre-flight inspection): one for the `**/*.test.ts` block, one for the `**/*.ts` production block.

- [ ] **Step 1: Read the file**

```bash
sed -n '40,85p' modules/storage/eslint.config.cjs
```

Confirm both occurrences of `'@typescript-eslint/no-unused-vars': ['warn', ...]` are present at the expected lines.

- [ ] **Step 2: Apply the change**

In `modules/storage/eslint.config.cjs`, change:

```diff
       'no-unused-vars': 'off',
-      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
+      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
```

in **both** the `**/*.test.ts` config block (around line 58) and the `**/*.ts` production config block (around line 78). The scripts-files block (`**/*.cjs`, `**/*.mjs`, `**/*.js` around line 83) does NOT have this rule and should not be touched.

- [ ] **Step 3: Verify the rule fires as error**

```bash
pnpm --filter @civicpress/storage exec eslint . 2>&1 | tail -3
echo "exit=${PIPESTATUS[0]}"
```

Expected: `0 errors` (Task 1 already cleaned everything). The remaining warnings reflect other rules (128 baseline − 45 unused-vars = 83 remaining; or whatever the non-unused-vars count was at baseline — record this in pre-flight if differing).

If `M > 0 errors`, Task 1 missed sites — investigate.

- [ ] **Step 4: Commit**

```bash
git add modules/storage/eslint.config.cjs
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.4): promote @typescript-eslint/no-unused-vars to error in storage

After task 1 cleared all 45 unused-vars warnings in
modules/storage/src/**, flip the rule from `warn` to `error` in both
the production and test config blocks of modules/storage/eslint.config.cjs.
Future unused-vars regressions in modules/storage now block local lint.

Per spec docs/specs/2026-06-03-lint-rollout-followup-1.4-5-storage-api-unused-vars-design.md
EOF
)"
```

---

## Task 4: Promote api rule from `warn` to `error`

**Files:** `modules/api/eslint.config.cjs`

The rule appears in two places (lines 60 + 80 per pre-flight inspection).

- [ ] **Step 1: Read the file**

```bash
sed -n '40,90p' modules/api/eslint.config.cjs
```

Confirm both occurrences of `'@typescript-eslint/no-unused-vars': ['warn', ...]` are present.

- [ ] **Step 2: Apply the change**

In `modules/api/eslint.config.cjs`, change:

```diff
       'no-unused-vars': 'off',
-      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
+      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
```

in **both** the `**/*.test.ts` config block (around line 60) and the `**/*.ts` production config block (around line 80). The scripts-files block (`**/*.cjs`, `**/*.mjs`, `**/*.js` around line 85) does NOT have this rule.

- [ ] **Step 3: Verify the rule fires as error**

```bash
pnpm --filter @civicpress/api exec eslint . 2>&1 | tail -3
echo "exit=${PIPESTATUS[0]}"
```

Expected: `0 errors` (Task 2 cleaned everything). Remaining warnings: 55 baseline − 32 unused-vars = 23 other-rule warnings.

If `M > 0 errors`, Task 2 missed sites — investigate.

- [ ] **Step 4: Commit**

```bash
git add modules/api/eslint.config.cjs
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.5): promote @typescript-eslint/no-unused-vars to error in api

After task 2 cleared all 32 unused-vars warnings in
modules/api/src/**, flip the rule from `warn` to `error` in both
production and test config blocks of modules/api/eslint.config.cjs.
Future unused-vars regressions in modules/api now block local lint.

Per spec docs/specs/2026-06-03-lint-rollout-followup-1.4-5-storage-api-unused-vars-design.md
EOF
)"
```

---

## Task 5: Final verification + merge to `dev` (closes #1 umbrella)

- [ ] **Step 1: Branch state check**

```bash
git log --oneline dev..HEAD
```

Expected: 4 commits (Tasks 1–4).

- [ ] **Step 2: Full repo lint check**

```bash
pnpm run lint 2>&1 | tail -3
```

Expected: `0 errors` repo-wide. This is the moment the `#1 unused-vars` umbrella closes — all 5 workspaces should now have the rule at `error` and zero unused-vars violations.

Spot-check each workspace:

```bash
for ws in core cli api ui storage; do
  echo "--- $ws ---"
  pnpm --filter @civicpress/$ws exec eslint . 2>&1 | tail -2
done
```

Each should show `0 errors`. Warning counts will vary (from other rules + `STYLE_RULES_DEFERRED` in ui).

- [ ] **Step 3: Switch to `dev` and confirm clean state**

```bash
git checkout dev
git status -sb
```

Expected: `## dev`, clean tree.

- [ ] **Step 4: Merge with `--no-ff` and closure summary**

```bash
git merge --no-ff --no-verify refactor/lint-followup-1.4-5-storage-api-unused-vars -m "$(cat <<'EOF'
Merge branch 'refactor/lint-followup-1.4-5-storage-api-unused-vars' — #1.4 + #1.5 CLOSED, #1 umbrella COMPLETE

Cleared all 77 remaining @typescript-eslint/no-unused-vars warnings:
  - Task 1: modules/storage/src/** (45 sites)
  - Task 2: modules/api/src/** (32 sites)

Then promoted the rule from `warn` to `error` in both workspaces'
eslint configs (Tasks 3-4, two blocks each).

#1 unused-vars umbrella now FULLY CLOSED across all 5 workspaces:
  - core (170): merge 60d91e8
  - cli (110): merge 961547d
  - modules/ui (102): merge f850aab
  - modules/storage (45): this merge
  - modules/api (32): this merge
  - TOTAL: 459 sites across 5 workspaces, all closed

Rule is now `error` repo-wide for @typescript-eslint/no-unused-vars
in both production AND test config blocks of all 5 workspaces. Future
unused-vars regressions block local lint.

Policy applied (per spec §3): default-strip dead imports +
declarations + pure-RHS assignments; `_`-prefix params that exist for
interface contracts (Express req/res/next/err signatures, storage
service interfaces, stub-pattern); bare-catch (TS 4.4+) for unused
catch params; flag suspected captured-effect-never-asserted test
patterns as concerns rather than auto-strip.

Surfaced findings: [count] new findings flagged (see commit bodies +
lint-followups-surfaced-findings memory).

Remaining lint-rollout backlog (per [[lint-followups-before-phase-3]]):
  - #4 ~30 vue/nuxt style rules in modules/ui STYLE_RULES_DEFERRED
  - 2-file useTypedI18n mini-migration (EditorHeader.vue +
    EditorAttachments.vue) surfaced during #2
After those, Phase 3 (realtime, Yjs-only) is next per the master plan.

Spec: docs/specs/2026-06-03-lint-rollout-followup-1.4-5-storage-api-unused-vars-design.md
Plan: docs/plans/2026-06-03-lint-rollout-followup-1.4-5-storage-api-unused-vars.md
EOF
)"
```

Replace `[count]` with the actual surfaced-findings count from Tasks 1+2. If 0, drop that paragraph.

Expected: merge commit created.

- [ ] **Step 5: Post-merge verification on `dev`**

```bash
pnpm --filter @civicpress/storage exec eslint . 2>&1 | tail -3
pnpm --filter @civicpress/api exec eslint . 2>&1 | tail -3
```

Both expected: `0 errors`.

- [ ] **Step 6: Delete the implementation branch**

```bash
git branch -d refactor/lint-followup-1.4-5-storage-api-unused-vars
```

Expected: `Deleted branch refactor/lint-followup-1.4-5-storage-api-unused-vars`.

Per refactor push policy: do **not** push to origin.

- [ ] **Step 7: Update followup memory**

Capture merge SHA:

```bash
git log --oneline -1
```

Record as `MERGE_SHA`.

In `/Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/lint-rollout-2026-06-02-followups.md`:

Update item #1's body — mark #1.4 + #1.5 closed and the umbrella COMPLETE:

```markdown
   - **#1.4 modules/storage (45)** — ✅ CLOSED 2026-06-03 (merge `<MERGE_SHA>`). Single pass across tests (20) + src (25). Rule now `error` in both blocks of `modules/storage/eslint.config.cjs`.
   - **#1.5 modules/api (32)** — ✅ CLOSED 2026-06-03 (merge `<MERGE_SHA>`). Single pass across routes (22) + middleware (5) + utils (4) + index.ts (1). Express interface-contract params `_`-prefixed. Rule now `error` in both blocks of `modules/api/eslint.config.cjs`.

   **#1 unused-vars umbrella FULLY CLOSED 2026-06-03.** 459 sites cleared across 5 workspaces (core 170, cli 110, modules/ui 102, modules/storage 45, modules/api 32). Rule is `error` repo-wide for `@typescript-eslint/no-unused-vars` in both production and test blocks of all 5 eslint configs.
```

Append any new surfaced findings to `lint-followups-surfaced-findings.md`.

In `MEMORY.md` index: update the followup hook line to reflect `#1` umbrella complete.

In `refactor-2026-05-master-plan.md`: append #1.4 + #1.5 closure SHAs to the description; note `#1` umbrella complete.

Memory files are not in the project repo; no commit needed.

- [ ] **Step 8: Verify memory files are well-formed**

```bash
head -10 /Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/lint-rollout-2026-06-02-followups.md
head -30 /Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/MEMORY.md
```

---

## Final verification gate (re-stated)

Before declaring the followup done:

- [ ] `pnpm --filter @civicpress/storage exec eslint .` exits 0 — 0 errors / 0 unused-vars warnings
- [ ] `pnpm --filter @civicpress/api exec eslint .` exits 0 — 0 errors / 0 unused-vars warnings
- [ ] `pnpm --filter @civicpress/storage exec tsc --noEmit` matches `STORAGE_TSC_BASELINE_EXIT`
- [ ] `pnpm --filter @civicpress/api exec tsc --noEmit` matches `API_TSC_BASELINE_EXIT`
- [ ] `pnpm -C modules/storage test:run` matches `STORAGE_TEST_BASELINE_PASS`
- [ ] `pnpm test:run` matches `TEST_BASELINE_PASS/FAIL/SKIP` (no new failures)
- [ ] `modules/storage/eslint.config.cjs` has `['error', ...]` for the rule in both blocks
- [ ] `modules/api/eslint.config.cjs` has `['error', ...]` for the rule in both blocks
- [ ] `git diff --stat dev~1..dev -- modules/` touches only `modules/storage/**` and `modules/api/**`
- [ ] No files outside those two workspaces modified
- [ ] All commits used `--no-verify` per master plan §9.1
- [ ] Feature branch deleted; no push to origin
- [ ] Followup memory updated with merge SHA + `#1` umbrella marked COMPLETE
- [ ] Any new surfaced findings appended to `lint-followups-surfaced-findings.md`
