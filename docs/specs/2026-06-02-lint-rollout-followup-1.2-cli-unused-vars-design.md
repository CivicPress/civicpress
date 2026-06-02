# Lint-rollout followup #1.2 — `cli/src/commands` unused-vars cleanup

**Date:** 2026-06-02
**Status:** Approved (brainstorming gate)
**Predecessor:** `docs/specs/2026-05-28-lint-rule-rollout-design.md`
**Sibling followups (closed):**

- `docs/specs/2026-06-02-lint-rollout-followup-1.1-core-unused-vars-design.md` (merge `60d91e8`)
- `docs/specs/2026-06-02-lint-rollout-followup-2-vue-template-any-design.md` (merge `d7447b4`)
- `docs/specs/2026-06-02-lint-rollout-followup-3-modules-ui-cruft-deps-design.md` (merge `3103a74`)

**Followup inventory:** memory `lint-rollout-2026-06-02-followups.md` (item #1 of 4) — split into 5 per-workspace sub-followups (#1.1 core ✅, #1.2 cli [this spec], #1.3 ui, #1.4 storage, #1.5 api).

---

## 1. Goal

Drive `@typescript-eslint/no-unused-vars` warnings in `cli/src/commands` from 110 to 0 by:

- Stripping dead imports and top-level declarations
- `_`-prefixing function/method parameters that exist for interface compliance (commander callbacks, command-action signatures)
- Stripping unused destructured fields, or re-destructuring without them
- Using bare-`catch` syntax (TS 4.4+) for unused catch params, or `_err`

After cleanup, promote the rule from `warn` to `error` in `cli/eslint.config.cjs` for **both** the production and test config blocks (lines ~56 + ~76 per pre-flight inspection). Future regressions will block local lint (no CI per `no-cicd-policy`).

## 2. Scope

**In scope** — `cli/src/commands/**/*.ts` and `cli/eslint.config.cjs`. All 110 sites live in `cli/src/commands/`; no other cli paths have unused-vars warnings.

Site distribution (from pre-flight lint on `dev` post-#1.1 merge):

| File | Sites |
|---|---|
| `storage.ts` | 20 |
| `validate.ts` | 17 |
| `geography.ts` | 12 |
| `backup.ts` | 7 |
| `notify.ts` | 6 |
| `status.ts` | 4 |
| `login.ts` | 4 |
| `view.ts` | 3 |
| `index.ts` | 3 |
| `config.ts` | 3 |
| `users.ts` | 2 |
| `records.ts` | 2 |
| `init.ts` | 2 |
| `hook.ts` | 2 |
| `export.ts` | 2 |
| (long tail of smaller command files) | ~21 |

Total: 110.

**Out of scope:**

- Other workspaces (`core` ✅, `modules/ui`, `modules/storage`, `modules/api`)
- Other lint rules (`no-explicit-any`, etc.)
- The 2-file `useTypedI18n` mini-migration surfaced during #2 (it's an `as any` issue, not unused-vars)
- The 4 surfaced bugs from #1.1 (`sanitizeDiagnosticReport`, `getFailedSagas`, `getSuccessCount`, `calculateCpuUsage`) — separate triage
- Push to origin
- CI gates

## 3. Cleanup policy per category

Carried verbatim from `docs/specs/2026-06-02-lint-rollout-followup-1.1-core-unused-vars-design.md` §3. Summary:

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

**Stub-pattern note (from #1.1 review):** when a `private` method's param is unused but callers pass a meaningful value (e.g., the method's name implies it should use the value), prefer `_`-prefix to preserve the stub-pattern signal.

**CLI-specific hint:** CLI command files often declare commander option flags or fetched values that turn out to be unread — these are commonly genuine dead code (someone added an `--option` flag but forgot to wire it through). Be especially alert for the surfaced-bug pattern in `storage.ts` (20 sites, highest concentration in the workspace).

**Test files:** Same policy as #1.1 — no test-file carve-out. Tests must reach 0 unused-vars too. Test-only unused declarations (e.g., spies declared but never asserted on) should be flagged as concerns rather than silently stripped, since they often indicate broken tests.

## 4. Approach — single-session, 4 implementation tasks + rule flip + merge

Single feature branch off `dev`: `refactor/lint-followup-1.2-cli-unused-vars`. Per-file-group commits keep diffs reviewable; subagent-driven-development pattern with spec + code-quality review between tasks.

### Task slicing

| Task | Files | Sites |
|---|---|---|
| Pre-flight | — | Capture baselines (lint, tsc, tests), branch creation |
| Task 1 | `storage.ts` + `validate.ts` | 37 |
| Task 2 | `geography.ts` + `backup.ts` + `notify.ts` | 25 |
| Task 3 | `status.ts` + `login.ts` + `view.ts` + `index.ts` + `config.ts` | 17 |
| Task 4 | Long tail: `users.ts`, `records.ts`, `init.ts`, `hook.ts`, `export.ts`, plus any other smaller files surfaced in pre-flight | ~31 |
| Task 5 | Flip rule `warn → error` in `cli/eslint.config.cjs` lines ~56 + ~76 | — |
| Task 6 | Verification + merge `--no-ff` to `dev` + memory update | — |

Per-implementation-task pattern (Tasks 1–4):

1. Enumerate the task's sites with a scoped lint run
2. Manual pass applying §3 policy
3. Verify lint is 0 in the file(s) under task
4. Verify typecheck baseline (no new errors)
5. Verify tests match baseline failure counts (no new failures)
6. Commit with `--no-verify` and conventional message

Task 5 flips both occurrences of `'@typescript-eslint/no-unused-vars': ['warn', ...]` to `['error', ...]` in `cli/eslint.config.cjs`. After the flip, `pnpm --filter @civicpress/cli exec eslint .` must still exit 0.

Task 6 merges `--no-ff` to `dev`, runs final verification, updates memory.

### Tooling notes

- `pnpm --filter @civicpress/cli exec eslint <glob> --rule '{"@typescript-eslint/no-unused-vars": "error"}'` — re-promotes the rule for the duration so lint exit-0 reflects done state during work, while the persisted rule state is still `warn` until Task 5.
- `pnpm --filter @civicpress/cli exec tsc --noEmit` for typecheck (vue-tsc not used in cli).
- `pnpm test:run` from repo root for full test suite.

## 5. Risks

### 5.1 Stripping a declaration with side-effecting RHS
Same as #1.1. Mitigation: per-category rule in §3 preserves the call when the RHS isn't a pure value.

### 5.2 Stripping a wired-but-not-yet-imported-from-here symbol
Same as #1.1. CLI commands are leaf consumers (rarely re-exported), so this risk is lower than in core. Mitigation: DONE_WITH_CONCERNS escalation.

### 5.3 Promote to `error` breaks pre-commit hook on dead-code commits
Same as #1.1 — desired behavior.

### 5.4 Test-file `error` is tighter than `no-explicit-any` carve-out
Same as #1.1. No test-file carve-out; tests must reach 0.

### 5.5 110 sites in 25+ files is a moderate diff
Mitigation: 4-task split (~17–37 sites each) keeps each commit reviewable.

### 5.6 Pre-existing test failures
Baseline at session start: 78 fail / 906 pass / 40 skip. Implementer reports new failures only — never assumes "no failures = pass."

### 5.7 storage.ts as a hot-spot may surface multiple bugs
With 20 sites in one file (highest concentration in the workspace), `storage.ts` is the likeliest source of surfaced-bug findings. Implementer should be especially careful here — grep for callers of each declared-but-unused symbol before stripping.

## 6. Verification gate (Task 6)

- [ ] `pnpm --filter @civicpress/cli exec eslint .` exits 0; output contains **0 `@typescript-eslint/no-unused-vars` warnings** AND **0 errors**
- [ ] `pnpm --filter @civicpress/cli exec tsc --noEmit` matches pre-flight baseline (no new errors)
- [ ] `pnpm test:run` no new failures introduced
- [ ] `cli/eslint.config.cjs` has `'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]` in **both** the production and test config blocks
- [ ] `git diff --stat dev..HEAD` shows changes only in `cli/src/commands/**` and `cli/eslint.config.cjs`
- [ ] No files outside `cli/` modified
- [ ] All commits used `--no-verify` per master plan §9.1
- [ ] Branch deleted after merge; no push to origin

## 7. Non-goals (restated)

- No CI gate (`no-cicd-policy`)
- No PR / no push (`refactor-push-policy`)
- No work on other workspaces' unused-vars (separate sessions)
- No work on other lint rules
- No fix for the 4 surfaced bugs from #1.1 (separate triage)

## 8. Memory updates after merge

In `lint-rollout-2026-06-02-followups.md`:

- Update item #1's body: mark #1.2 as CLOSED with merge SHA + closed count (110 → 0); update remaining-workspace list (3 left: #1.3, #1.4, #1.5).
- Add the rule promotion outcome for cli.
- Append any new surfaced findings from this session.

In `MEMORY.md` index: update the followup hook line.

In `refactor-2026-05-master-plan.md`: append the #1.2 closure SHA to the description.

## 9. Execution shape

Estimated 1 implementation session, ~2–4 hours, split into:

- Pre-flight: ~10 min
- Tasks 1–4: ~30 min each = ~2 hours
- Task 5 (rule flip): ~5 min + verification
- Task 6 (merge + memory): ~15 min

Per the subagent-driven-development pattern: each of Tasks 1–4 dispatchable as one implementer subagent with spec-compliance + code-quality review after each. Tasks 5 and 6 are coordinator-driven.
