# Lint-rollout followup #1.2 — `cli/src/commands` unused-vars cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive `@typescript-eslint/no-unused-vars` warnings in `cli/src/commands` from 110 to 0 via 4 per-hot-spot cleanup passes, then promote the rule from `warn` to `error` in `cli/eslint.config.cjs` (both production and test config blocks).

**Architecture:** Single feature branch off `dev`. Four per-file-group implementation tasks (each a commit), one rule-flip commit, one merge `--no-ff` to `dev` with closure summary. Subagent-driven-development with spec + code-quality review between tasks.

**Tech Stack:** TypeScript 5.9, ESLint v9 flat config, `@typescript-eslint/eslint-plugin` 8.60, pnpm 9.15.9 via corepack, vitest, `--no-verify` per master plan §9.1.

**Spec:** `docs/specs/2026-06-02-lint-rollout-followup-1.2-cli-unused-vars-design.md` (commit `bbad6f9`).

---

## File map

| Task | Files | Sites |
|---|---|---|
| Task 1 | `cli/src/commands/storage.ts` (20) + `validate.ts` (17) | 37 |
| Task 2 | `cli/src/commands/geography.ts` (12) + `backup.ts` (7) + `notify.ts` (6) | 25 |
| Task 3 | `cli/src/commands/status.ts` (4) + `login.ts` (4) + `view.ts` (3) + `index.ts` (3) + `config.ts` (3) | 17 |
| Task 4 | Long tail (21 files, 1–2 sites each) | 31 |
| Task 5 | `cli/eslint.config.cjs` lines 56 + 76 (flip `warn` → `error`) | — |

Task 4 long-tail roster (1–2 sites per file): `users.ts`, `records.ts`, `init.ts`, `hook.ts`, `export.ts`, `diff.ts`, `diagnose.ts`, `create.ts`, `commit.ts` (2 each); `template.ts`, `search.ts`, `info.ts`, `import.ts`, `edit.ts`, `auto-index.ts`, `auth.ts` (1 each); `__tests__/users.test.ts`, `status.test.ts`, `search.test.ts`, `login.test.ts`, `history.test.ts`, `diagnose.test.ts` (1 each). Total 31.

Total 110 sites across 32 files. No files outside `cli/` touched.

---

## Pre-flight (do once, before Task 1)

- [ ] **Step 1: Confirm clean working tree on `dev`**

```bash
cd /Users/stakabo/Work/repos/civicpress/civicpress
git status -sb
git log --oneline -3
```

Expected: `## dev`, no modified files. HEAD reaches `bbad6f9` (spec commit) or later.

- [ ] **Step 2: Confirm pnpm version**

```bash
pnpm --version
```

Expected: `9.15.9` via corepack.

- [ ] **Step 3: Capture pre-change cli lint baseline**

```bash
pnpm --filter @civicpress/cli exec eslint . 2>&1 | tee /tmp/lint-cli-baseline.txt | tail -3
grep -c "@typescript-eslint/no-unused-vars" /tmp/lint-cli-baseline.txt
```

Expected: `✖ 251 problems (0 errors, 251 warnings)`. Unused-vars count: `110`.

Verify per-file distribution:

```bash
awk '/^\//{file=$0; next} /@typescript-eslint\/no-unused-vars/{print file}' /tmp/lint-cli-baseline.txt | sed 's|/Users/stakabo/Work/repos/civicpress/civicpress/||' | sort | uniq -c | sort -rn
```

Expected:
```
  20 cli/src/commands/storage.ts
  17 cli/src/commands/validate.ts
  12 cli/src/commands/geography.ts
   7 cli/src/commands/backup.ts
   6 cli/src/commands/notify.ts
   4 cli/src/commands/status.ts
   4 cli/src/commands/login.ts
   3 cli/src/commands/view.ts
   3 cli/src/commands/index.ts
   3 cli/src/commands/config.ts
   2 cli/src/commands/users.ts
   2 cli/src/commands/records.ts
   2 cli/src/commands/init.ts
   2 cli/src/commands/hook.ts
   2 cli/src/commands/export.ts
   2 cli/src/commands/diff.ts
   2 cli/src/commands/diagnose.ts
   2 cli/src/commands/create.ts
   2 cli/src/commands/commit.ts
   1 cli/src/commands/template.ts
   1 cli/src/commands/search.ts
   1 cli/src/commands/info.ts
   1 cli/src/commands/import.ts
   1 cli/src/commands/edit.ts
   1 cli/src/commands/auto-index.ts
   1 cli/src/commands/auth.ts
   1 cli/src/commands/__tests__/users.test.ts
   1 cli/src/commands/__tests__/status.test.ts
   1 cli/src/commands/__tests__/search.test.ts
   1 cli/src/commands/__tests__/login.test.ts
   1 cli/src/commands/__tests__/history.test.ts
   1 cli/src/commands/__tests__/diagnose.test.ts
```

If counts differ, snapshot the actual numbers and re-plan task slicing accordingly.

- [ ] **Step 4: Capture pre-change typecheck baseline**

```bash
pnpm --filter @civicpress/cli exec tsc --noEmit 2>&1 | tee /tmp/tsc-cli-baseline.txt | tail -5
echo "exit=${PIPESTATUS[0]}"
```

Record exit code as `TSC_BASELINE_EXIT`. If non-zero, record error count for later "no new errors" comparison.

- [ ] **Step 5: Capture pre-change test baseline**

```bash
pnpm test:run 2>&1 | tee /tmp/test-baseline.txt | tail -10
```

Record `TEST_BASELINE_PASS`, `TEST_BASELINE_FAIL`, `TEST_BASELINE_SKIP`. Per #1.1 closure: baseline at session start should be `78 fail / 906 pass / 40 skip`.

- [ ] **Step 6: Create the implementation branch**

```bash
git checkout -b refactor/lint-followup-1.2-cli-unused-vars
git status -sb
```

Expected: `## refactor/lint-followup-1.2-cli-unused-vars`.

---

## Per-task cleanup pattern (applies to Tasks 1–4)

Every cleanup task follows the same shape — only the target files change. The pattern:

1. **Enumerate the task's sites** with a scoped lint run (so the implementer sees what's in scope)
2. **Manual pass** for imports, declarations, params, catch-binds, destructured vars — apply the spec §3 policy:
   - Unused import → strip
   - Unused top-level declaration (pure RHS) → strip; (side-effecting RHS) → keep call, drop binding
   - Unused function/method param for interface contract (commander action callbacks, command-builder signatures) → `_`-prefix
   - Unused function/method param, local signature → strip (update callers if needed)
   - Unused catch param → bare-`catch` (TS 5.9 supports) or `_err`
   - Unused destructured field → re-destructure without it, or `_`-prefix if shape matters
   - **Surfaced bug** (declared, never wired — e.g., an `--option` flag that was added to commander but never read in the action handler): **DO NOT FIX in this task.** Report DONE_WITH_CONCERNS naming the file:line and what you suspect; coordinator surfaces to user.
3. **Verify lint** is 0 in the task's files
4. **Verify typecheck** is at baseline (no new errors)
5. **Verify tests** match baseline failure counts (no new failures)
6. **Commit** with `--no-verify` per master plan §9.1

`@typescript-eslint/no-unused-vars` has no autofixer; `eslint --fix` is a no-op for this followup. All 110 sites need manual work.

**CLI-specific heuristic:** when you see a declared option, fetched config value, or service handle that's never read, check the surrounding command handler for an early-return or guard that might have silently disabled the dependency. Hot-spot files (`storage.ts`, `validate.ts`, `geography.ts`) are the most likely sources of surfaced bugs.

---

## Task 1: `storage.ts` + `validate.ts` cleanup (37 sites)

**Files:**
- `cli/src/commands/storage.ts` (20 sites)
- `cli/src/commands/validate.ts` (17 sites)

- [ ] **Step 1: Enumerate**

```bash
pnpm --filter @civicpress/cli exec eslint 'src/commands/storage.ts' 'src/commands/validate.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tee /tmp/lint-task-1-pre.txt | tail -3
```

Expected: `✖ 37 problems (37 errors, 0 warnings)`.

- [ ] **Step 2: Manual pass**

Walk through all 37 sites. `storage.ts` is the workspace's hot-spot — be especially careful for surfaced-bug patterns (declared option flags that were never wired through to the action handler). Before stripping any imported helper or declared service, `grep -rn "name" cli/src core/src modules/api/src` to confirm no caller relies on it.

For `validate.ts`: validation commands often declare counter/accumulator vars that aren't read in the success path — verify they aren't read in the error-reporting code below before stripping.

- [ ] **Step 3: Verify lint**

```bash
pnpm --filter @civicpress/cli exec eslint 'src/commands/storage.ts' 'src/commands/validate.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Expected: `0 problems`.

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter @civicpress/cli exec tsc --noEmit 2>&1 | tail -5
echo "exit=${PIPESTATUS[0]}"
```

Expected: exit matches `TSC_BASELINE_EXIT`.

- [ ] **Step 5: Verify tests**

```bash
pnpm test:run 2>&1 | tail -10
```

Compare to `TEST_BASELINE_PASS/FAIL/SKIP`. No NEW failures.

- [ ] **Step 6: Commit**

```bash
git add cli/src/commands/storage.ts cli/src/commands/validate.ts
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.2): strip unused-vars in cli storage.ts + validate.ts (37 sites)

Stripped dead imports + declarations in the workspace's two biggest
hot-spots (storage 20, validate 17). `_`-prefixed commander action
callback parameters that exist for interface compliance. Bare-catch
where the catch body never used the error binding. Flagged surfaced
bugs as concerns rather than auto-strip.

Per spec docs/specs/2026-06-02-lint-rollout-followup-1.2-cli-unused-vars-design.md
EOF
)"
```

---

## Task 2: `geography.ts` + `backup.ts` + `notify.ts` cleanup (25 sites)

**Files:**
- `cli/src/commands/geography.ts` (12 sites)
- `cli/src/commands/backup.ts` (7 sites)
- `cli/src/commands/notify.ts` (6 sites)

- [ ] **Step 1: Enumerate**

```bash
pnpm --filter @civicpress/cli exec eslint 'src/commands/geography.ts' 'src/commands/backup.ts' 'src/commands/notify.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tee /tmp/lint-task-2-pre.txt | tail -3
```

Expected: `✖ 25 problems`.

- [ ] **Step 2: Manual pass**

Geography subcommands likely have GeoJSON-typed parameters in subcommand callbacks; favor `_`-prefix where the commander callback contract requires the param. Backup commands often have unused archive-builder helpers that may be wired in pending stub code — flag stub-shape patterns as concerns.

- [ ] **Step 3: Verify lint**

```bash
pnpm --filter @civicpress/cli exec eslint 'src/commands/geography.ts' 'src/commands/backup.ts' 'src/commands/notify.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Expected: `0 problems`.

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter @civicpress/cli exec tsc --noEmit 2>&1 | tail -5
echo "exit=${PIPESTATUS[0]}"
```

Expected: exit matches `TSC_BASELINE_EXIT`.

- [ ] **Step 5: Verify tests**

```bash
pnpm test:run 2>&1 | tail -10
```

Compare to `TEST_BASELINE`.

- [ ] **Step 6: Commit**

```bash
git add cli/src/commands/geography.ts cli/src/commands/backup.ts cli/src/commands/notify.ts
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.2): strip unused-vars in cli geography.ts + backup.ts + notify.ts (25 sites)

Stripped dead imports + declarations across 3 mid-sized command files.
`_`-prefixed commander subcommand-callback parameters that exist for
interface compliance.

Per spec docs/specs/2026-06-02-lint-rollout-followup-1.2-cli-unused-vars-design.md
EOF
)"
```

---

## Task 3: `status.ts` + `login.ts` + `view.ts` + `index.ts` + `config.ts` cleanup (17 sites)

**Files:**
- `cli/src/commands/status.ts` (4 sites)
- `cli/src/commands/login.ts` (4 sites)
- `cli/src/commands/view.ts` (3 sites)
- `cli/src/commands/index.ts` (3 sites)
- `cli/src/commands/config.ts` (3 sites)

- [ ] **Step 1: Enumerate**

```bash
pnpm --filter @civicpress/cli exec eslint 'src/commands/status.ts' 'src/commands/login.ts' 'src/commands/view.ts' 'src/commands/index.ts' 'src/commands/config.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tee /tmp/lint-task-3-pre.txt | tail -3
```

Expected: `✖ 17 problems`.

- [ ] **Step 2: Manual pass**

`index.ts` is the cli root — be especially careful about stripping anything that LOOKS like an exported entry point. Verify with `grep -rn "name" cli/src core/src` before stripping any function/const that could be imported elsewhere.

- [ ] **Step 3: Verify lint**

```bash
pnpm --filter @civicpress/cli exec eslint 'src/commands/status.ts' 'src/commands/login.ts' 'src/commands/view.ts' 'src/commands/index.ts' 'src/commands/config.ts' --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Expected: `0 problems`.

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter @civicpress/cli exec tsc --noEmit 2>&1 | tail -5
echo "exit=${PIPESTATUS[0]}"
```

Expected: exit matches `TSC_BASELINE_EXIT`.

- [ ] **Step 5: Verify tests**

```bash
pnpm test:run 2>&1 | tail -10
```

Compare to `TEST_BASELINE`.

- [ ] **Step 6: Commit**

```bash
git add cli/src/commands/status.ts cli/src/commands/login.ts cli/src/commands/view.ts cli/src/commands/index.ts cli/src/commands/config.ts
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.2): strip unused-vars in cli status/login/view/index/config (17 sites)

Stripped dead imports + declarations across 5 small-to-medium command
files. Verified each top-level export-shaped removal in index.ts via
cross-workspace grep before stripping.

Per spec docs/specs/2026-06-02-lint-rollout-followup-1.2-cli-unused-vars-design.md
EOF
)"
```

---

## Task 4: Long-tail cleanup (31 sites across 21 files)

**Files:** Everything remaining in `cli/src/commands/**` not yet touched. Per pre-flight numbers:

| File | Sites |
|---|---|
| `users.ts` | 2 |
| `records.ts` | 2 |
| `init.ts` | 2 |
| `hook.ts` | 2 |
| `export.ts` | 2 |
| `diff.ts` | 2 |
| `diagnose.ts` | 2 |
| `create.ts` | 2 |
| `commit.ts` | 2 |
| `template.ts` | 1 |
| `search.ts` | 1 |
| `info.ts` | 1 |
| `import.ts` | 1 |
| `edit.ts` | 1 |
| `auto-index.ts` | 1 |
| `auth.ts` | 1 |
| `__tests__/users.test.ts` | 1 |
| `__tests__/status.test.ts` | 1 |
| `__tests__/search.test.ts` | 1 |
| `__tests__/login.test.ts` | 1 |
| `__tests__/history.test.ts` | 1 |
| `__tests__/diagnose.test.ts` | 1 |

Total: 31 sites.

- [ ] **Step 1: Enumerate the long-tail**

Simplest is to lint everything remaining and confirm only these files surface:

```bash
pnpm --filter @civicpress/cli exec eslint . --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tee /tmp/lint-task-4-pre.txt | tail -3
```

Expected: `✖ 31 problems` (everything else was cleaned in Tasks 1–3). If higher, a prior task left sites behind — inspect output and investigate.

- [ ] **Step 2: Manual pass**

Each file has 1–2 sites; this is a straight strip-or-prefix pass. For test files, if a spy is declared but never asserted on, flag as a missing-assertion concern (per #1.1's pattern with `saga-failure-injection.test.ts`).

- [ ] **Step 3: Verify lint is clean across ALL of cli/src/commands**

```bash
pnpm --filter @civicpress/cli exec eslint . --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>&1 | tail -3
```

Expected: `0 problems`. This is the FINAL state — cli is now free of unused-vars warnings.

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter @civicpress/cli exec tsc --noEmit 2>&1 | tail -5
echo "exit=${PIPESTATUS[0]}"
```

Expected: exit matches `TSC_BASELINE_EXIT`.

- [ ] **Step 5: Verify tests**

```bash
pnpm test:run 2>&1 | tail -10
```

Compare to `TEST_BASELINE`.

- [ ] **Step 6: Commit**

```bash
git add cli/src/commands
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.2): strip unused-vars long tail in cli (31 sites)

Final cleanup pass across 21 smaller command files (and 6 test files).
cli/src/commands is now at 0 unused-vars warnings.

Per spec docs/specs/2026-06-02-lint-rollout-followup-1.2-cli-unused-vars-design.md
EOF
)"
```

---

## Task 5: Promote rule from `warn` to `error`

**Files:** `cli/eslint.config.cjs`

The rule appears in two places (lines 56 + 76 per pre-flight inspection): one for the `**/*.test.ts` block, one for the `**/*.ts` production block.

- [ ] **Step 1: Read the file**

```bash
sed -n '40,85p' cli/eslint.config.cjs
```

Confirm both occurrences of `'@typescript-eslint/no-unused-vars': ['warn', ...]` are present at the expected lines.

- [ ] **Step 2: Apply the change**

In `cli/eslint.config.cjs`, change:

```diff
       'no-unused-vars': 'off',
-      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
+      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
```

in **both** the `**/*.test.ts` config block (around line 56) and the `**/*.ts` production config block (around line 76). The scripts-files block (`**/*.cjs`, `**/*.mjs`, `**/*.js` around line 81) does NOT have this rule and should not be touched.

- [ ] **Step 3: Verify the rule fires as error**

```bash
pnpm --filter @civicpress/cli exec eslint . 2>&1 | tail -3
echo "exit=${PIPESTATUS[0]}"
```

Expected: `0 errors` (Tasks 1–4 already cleaned everything). The remaining warnings (251 − 110 = 141, all `no-explicit-any` and other rules) stay as warnings; only `no-unused-vars` was promoted.

If `✖ N problems (M errors, ...)` with `M > 0`, a Task-N pass missed sites — investigate.

- [ ] **Step 4: Commit**

```bash
git add cli/eslint.config.cjs
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-followup-1.2): promote @typescript-eslint/no-unused-vars to error in cli

After tasks 1-4 cleared all 110 unused-vars warnings in cli/src/commands,
flip the rule from `warn` to `error` in both the production and test
config blocks of cli/eslint.config.cjs. Future regressions now block
local lint (no CI per no-cicd-policy).

Per spec docs/specs/2026-06-02-lint-rollout-followup-1.2-cli-unused-vars-design.md
EOF
)"
```

---

## Task 6: Final verification + merge to `dev`

- [ ] **Step 1: Branch state check**

```bash
git log --oneline dev..HEAD
```

Expected: 5 commits (Tasks 1–5).

- [ ] **Step 2: Full repo lint check**

```bash
pnpm run lint 2>&1 | tail -3
```

Expected: `0 errors`. Warning count = (459 − 170 from #1.1 − 110 from #1.2) = 179 warnings from cli's other rules + the remaining 3 workspaces' unused-vars (102 + 45 + 32 = 179) + ui's other rules. The exact total is informational; the gate is `0 errors`.

- [ ] **Step 3: Switch to `dev` and confirm clean state**

```bash
git checkout dev
git status -sb
```

Expected: `## dev`, clean tree.

- [ ] **Step 4: Merge with `--no-ff` and closure summary**

```bash
git merge --no-ff --no-verify refactor/lint-followup-1.2-cli-unused-vars -m "$(cat <<'EOF'
Merge branch 'refactor/lint-followup-1.2-cli-unused-vars' — 2d-followup #1.2 CLOSED

Cleared all 110 @typescript-eslint/no-unused-vars warnings in
cli/src/commands via four per-hot-spot passes:
  - Task 1: storage.ts + validate.ts (37 sites)
  - Task 2: geography.ts + backup.ts + notify.ts (25 sites)
  - Task 3: status/login/view/index/config (17 sites)
  - Task 4: long tail across 21 smaller command files + 6 test files (31 sites)

Then promoted the rule from `warn` to `error` in both production and
test config blocks of cli/eslint.config.cjs (Task 5). Future
unused-vars regressions in cli/src/commands now block local lint.

Policy applied (per spec §3): default-strip dead imports + declarations
+ pure-RHS assignments; `_`-prefix params that exist for interface
contracts (commander action callbacks, command-builder signatures);
bare-catch (TS 4.4+) for unused catch params; flag suspected
wired-but-not-imported symbols as concerns rather than silently strip.

Verification: pnpm --filter @civicpress/cli exec eslint . = 0
unused-vars errors. tsc --noEmit matches baseline. pnpm test:run =
no new failures vs. pre-existing baseline (78 fail / 906 pass / 40
skip).

Remaining lint-rollout followups: #1.3 modules/ui (102 sites),
#1.4 modules/storage (45 sites), #1.5 modules/api (32 sites). Plus
#4 vue/nuxt style rules and the 2-file useTypedI18n mini-migration.

Spec: docs/specs/2026-06-02-lint-rollout-followup-1.2-cli-unused-vars-design.md
Plan: docs/plans/2026-06-02-lint-rollout-followup-1.2-cli-unused-vars.md
EOF
)"
```

Expected: merge commit created.

- [ ] **Step 5: Post-merge verification on `dev`**

```bash
pnpm --filter @civicpress/cli exec eslint . 2>&1 | tail -3
```

Expected: `0 errors` (warnings remain from other rules).

- [ ] **Step 6: Delete the implementation branch**

```bash
git branch -d refactor/lint-followup-1.2-cli-unused-vars
```

Expected: `Deleted branch refactor/lint-followup-1.2-cli-unused-vars`.

Per refactor push policy: do **not** push to origin.

- [ ] **Step 7: Update followup memory**

In `/Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/lint-rollout-2026-06-02-followups.md`:

Update item #1's body to reflect #1.2 closure:

```markdown
- **#1.2 cli (110)** — ✅ CLOSED 2026-06-02 (merge `<MERGE_SHA>`). 4 per-hot-spot passes: storage+validate (37), geography+backup+notify (25), status+login+view+index+config (17), long tail (31). Rule now `error` in both prod and test blocks of `cli/eslint.config.cjs`.
```

Update the "remaining" list (now: #1.3, #1.4, #1.5).

In `MEMORY.md` index: update the followup hook line with the new partial state.

In `refactor-2026-05-master-plan.md`: append the #1.2 closure SHA to the description.

If any surfaced bugs were flagged during the session, append them to the existing surfaced-findings list in `lint-rollout-2026-06-02-followups.md`.

Memory files aren't in the project repo, so no commit needed.

- [ ] **Step 8: Verify memory files are well-formed**

```bash
head -10 /Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/lint-rollout-2026-06-02-followups.md
head -30 /Users/stakabo/.claude/projects/-Users-stakabo-Work-repos-civicpress-civicpress/memory/MEMORY.md
```

---

## Final verification gate (re-stated)

Before declaring the followup done:

- [ ] `pnpm --filter @civicpress/cli exec eslint .` exits 0 — 0 errors / 0 unused-vars warnings (other warnings acceptable)
- [ ] `pnpm --filter @civicpress/cli exec tsc --noEmit` matches `TSC_BASELINE_EXIT`
- [ ] `pnpm test:run` matches `TEST_BASELINE_PASS/FAIL/SKIP` (no new failures)
- [ ] `cli/eslint.config.cjs` has `'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]` in **both** the `**/*.test.ts` (line ~56) and `**/*.ts` (line ~76) config blocks
- [ ] `git diff --stat dev~1..dev -- cli/` touches only `cli/src/commands/**` and `cli/eslint.config.cjs`
- [ ] No files outside `cli/` modified
- [ ] All commits used `--no-verify` per master plan §9.1
- [ ] Feature branch deleted; no push to origin
- [ ] Followup memory updated with merge SHA + remaining 3 workspace sessions
