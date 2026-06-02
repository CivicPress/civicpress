# Lint-rollout followup #1.1 — `core/src` unused-vars cleanup

**Date:** 2026-06-02
**Status:** Approved (brainstorming gate)
**Predecessor:** `docs/specs/2026-05-28-lint-rule-rollout-design.md`
**Sibling followups (closed):**

- `docs/specs/2026-06-02-lint-rollout-followup-2-vue-template-any-design.md` (merge `d7447b4`)
- `docs/specs/2026-06-02-lint-rollout-followup-3-modules-ui-cruft-deps-design.md` (merge `3103a74`)

**Followup inventory:** memory `lint-rollout-2026-06-02-followups.md` (item #1 of 4) — split into 5 per-workspace sub-followups (#1.1 core, #1.2 cli, #1.3 ui, #1.4 storage, #1.5 api).

This spec covers **#1.1 only** (core/src). Each remaining workspace gets its own brainstorm → spec → plan → merge cycle in a future session.

---

## 1. Goal

Drive `@typescript-eslint/no-unused-vars` warnings in `core/src` from 170 to 0 by:

- Stripping dead imports and top-level declarations
- `_`-prefixing function/method parameters that exist for interface compliance
- Stripping unused destructured variables (or re-destructuring without them)
- Using bare-`catch` syntax (TS 4.4+) for unused catch params, or `_err`

After cleanup, promote the rule from `warn` to `error` in `core/eslint.config.cjs` for **both** the production and test config blocks. Future regressions will block local lint (no CI per `no-cicd-policy`).

## 2. Scope

**In scope** — `core/src/**` source files and `core/eslint.config.cjs`. Approximately 170 sites across:

- `core/src/records/**` (~30)
- `core/src/saga/**` (~25)
- `core/src/diagnostics/**` (~30)
- `core/src/geography/**` (~15)
- `core/src/notifications/**`, `core/src/auth/**`, `core/src/audit/**` (~30)
- `core/src/**` long tail (~40)

Site counts are estimated from the full-repo lint run on `dev` (2026-06-02, 459 total `no-unused-vars` warnings; 170 in `core/src`). The implementation plan re-derives exact per-group counts in pre-flight.

**Out of scope:**

- Other workspaces (`cli`, `modules/ui`, `modules/storage`, `modules/api`) — each gets its own followup #1.N session.
- Other lint rules (`no-explicit-any`, vue/nuxt style rules in `STYLE_RULES_DEFERRED`, etc.) — separate followups.
- The 2-file `useTypedI18n` mini-migration surfaced during followup #2 (`EditorHeader.vue`, `EditorAttachments.vue`) — that's an `as any` cleanup, not an unused-vars cleanup.
- Push to origin (refactor push policy: nothing until phase 7).
- CI gates (no-cicd-policy).

## 3. Cleanup policy per category

The eslint output uses 4 message variants; the per-category action is:

| Category | Message variant | Action |
|---|---|---|
| Unused **import** | `'X' is defined but never used. Allowed unused vars must match /^_/u` (when at top-of-file) | **Strip** — dead code |
| Unused **top-level declaration** | `'X' is assigned a value but never used. …` or `'X' is defined but never used. …` (function/const/let) | **Strip** when RHS is pure. If RHS is a function call with side effects, drop only the binding: `expensiveCall()` instead of `const x = expensiveCall()` |
| Unused **function/method parameter** | `'X' is defined but never used. Allowed unused args must match /^_/u` | **`_`-prefix** when the param exists for an interface contract (override, callback signature, event handler). **Strip** when the function is local and the signature can change. |
| Unused **catch parameter** | `'X' is defined but never used` (no `Allowed unused …` suffix when inside catch) | **Bare-catch** (`catch { … }`, TS 4.4+) where the workspace's TS target supports it. Otherwise `_err`. |
| Unused **destructured variable** | Same as catch (no allowlist suffix) | **Re-destructure** without the unused field, or `_`-prefix if signature matters |
| **Surfaced bug** ("declared, never wired") | Any of the above, where the implementer realises the symbol *should* be used but the wiring is missing | **Flag — do not fix in this session.** Implementer reports DONE_WITH_CONCERNS; coordinator surfaces to user as a separate finding. |

**Test files (`core/src/**/__tests__/**` and `tests/core/**`):** same policy. The user explicitly chose to apply `error` to tests in this followup (option 1 of the rule-state question, not option 3). Tests must reach 0 unused-vars too.

## 4. Approach — single-session, 6 implementation tasks + 1 rule-flip + 1 merge

Single feature branch off `dev`: `refactor/lint-followup-1.1-core-unused-vars`. Per-group commits keep diffs reviewable; subagent-driven-development dispatches one implementer per group.

### Task slicing

| Task | Subdirectory | Approximate sites |
|---|---|---|
| Pre-flight | — | (capture baselines: lint count, tsc state, test count, branch creation) |
| Task 1 | `core/src/records/**` (incl. `__tests__`) | ~30 |
| Task 2 | `core/src/saga/**` | ~25 |
| Task 3 | `core/src/diagnostics/**` | ~30 |
| Task 4 | `core/src/geography/**` | ~15 |
| Task 5 | `core/src/notifications/**` + `auth/**` + `audit/**` | ~30 |
| Task 6 | `core/src/**` long tail (everything else) | ~40 |
| Task 7 | Flip rule `warn → error` in `core/eslint.config.cjs` | — |
| Task 8 | Verification + merge `--no-ff` to `dev` + memory update | — |

Per-implementation-task pattern (Tasks 1–6):

1. Targeted lint scoped to the subdirectory captures the exact site list at task start
2. For each site: apply the §3 category action; resolve surfaced concerns by flagging
3. Re-lint the subdirectory → confirm 0 unused-vars warnings in that subdirectory
4. Run `pnpm --filter @civicpress/core exec tsc --noEmit` → confirm no new typecheck errors
5. Run `pnpm test:run` → confirm no new test failures
6. Commit with `--no-verify` per master plan §9.1

Task 7 flips the rule on both production and test config blocks in `core/eslint.config.cjs`:

```diff
-      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
+      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
```

After the flip, `pnpm --filter @civicpress/core exec eslint .` must still exit 0 — i.e. we reach 0 errors AND 0 unused-vars warnings before the promote.

Task 8 merges `--no-ff` to `dev`, runs final verification, updates memory.

### Tooling notes

- `pnpm --filter @civicpress/core exec eslint . --rule '{"@typescript-eslint/no-unused-vars": "error"}'` is the per-task working-mode command. It re-promotes the rule to `error` for the duration of the run so the implementer can use lint exit-0 as the done signal even though the persisted rule state is still `warn` until Task 7.
- `pnpm --filter @civicpress/core exec eslint . --fix` is safe for the unused-import subset and is encouraged as a first pass per task. Stripping declarations and adjusting param names must be done manually — `--fix` is too narrow for those.
- `pnpm --filter @civicpress/core exec tsc --noEmit` captures the typecheck baseline at the start of pre-flight; each task confirms no regressions.
- `pnpm test:run` is the root-level test command. Per memory, pre-existing failures exist (date-bomb, email-channel SMTP, simple-git missing in fixtures, saga injection). The implementer captures the baseline failure count at pre-flight and reports any **new** failures — never assumes "no failures = pass."

## 5. Risks

### 5.1 Stripping a declaration with a side-effecting RHS

Removing `const result = someCall();` deletes the call. Mitigation: the per-category rule in §3 preserves the call (`someCall();`) when the RHS isn't a pure value. Implementer must read each removal carefully.

### 5.2 Stripping a "wired-but-not-yet-imported-from-here" symbol

A function declared and not currently used may be code the author forgot to wire to its caller. Removing it silently regresses functionality. Mitigation: DONE_WITH_CONCERNS escalation policy in §3 — the implementer flags the site, doesn't auto-strip.

### 5.3 Promoting to `error` while pre-commit hook runs lint-staged

The pre-commit hook runs lint-staged on changed files. After Task 7, any commit touching `core/src/**` that introduces a new unused var will fail lint. This is the desired behavior — the hardening is the point. Document the impact in the closure memory.

### 5.4 Test-file `error` is tighter than `no-explicit-any`'s test carve-out

The existing lint-rule rollout left `no-explicit-any` as `warn` in tests per spec §7. This followup explicitly does NOT carve out tests for `no-unused-vars` (user chose option 1 of the rule-state question). Tests that intentionally declare unused spy vars must be retyped with `_`-prefix, or rewritten to actually use the spy. Mitigation: per-test triage by the implementer; flag any tests that need genuine rewrites as concerns rather than silently disabling the rule per-file.

### 5.5 170-site diff is large

Mitigation: 6-task split (~25 sites each) keeps each commit reviewable; subagent-driven-development with spec + code-quality review between tasks catches drift early.

### 5.6 Pre-existing test failures may mask new regressions

The vitest baseline already has `78 fail / 906 pass`-ish counts (per followup #2's session). Mitigation: per-task verification compares the failure count to the pre-flight baseline; only NEW failures matter. The implementer's report must include exact counts.

## 6. Verification gate (Task 8)

- [ ] `pnpm --filter @civicpress/core exec eslint .` exits 0; output contains **0 `@typescript-eslint/no-unused-vars` warnings** AND **0 errors**
- [ ] `pnpm --filter @civicpress/core exec tsc --noEmit` matches the pre-flight baseline (no new typecheck errors)
- [ ] `pnpm test:run` no new failures introduced (baseline failure count preserved)
- [ ] `core/eslint.config.cjs` has `'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]` in **both** the production and test config blocks
- [ ] `git diff --stat dev..HEAD` shows changes only in `core/src/**` and `core/eslint.config.cjs`. No other workspaces touched, no docs touched (memory updates happen post-merge, outside the project repo)
- [ ] All commits used `--no-verify` per master plan §9.1
- [ ] Branch deleted after merge; no push to origin

## 7. Non-goals (restated)

- No CI gate (`no-cicd-policy`)
- No PR / no push (`refactor-push-policy`)
- No work on other workspaces' unused-vars (separate sessions)
- No work on other lint rules
- No restructure of test files beyond the unused-vars cleanup itself

## 8. Memory updates after merge

In `lint-rollout-2026-06-02-followups.md`:

- Mark item #1 as **PARTIAL — core complete (merge SHA)** with the recorded count (target: 170 → 0); list the 4 remaining workspace sessions (cli, ui, storage, api).
- Add the rule promotion outcome ("`core/eslint.config.cjs` `@typescript-eslint/no-unused-vars` now `error` in both prod and test blocks").
- Note any surfaced findings (genuine bugs caught during stripping) that need separate triage.

In `MEMORY.md` index: update the followup hook line with the new partial state.

In `refactor-2026-05-master-plan.md`: update description with the per-workspace progress.

Optional: create a small `lint-followup-1-tracker.md` memory file listing the 5 sub-followups with their per-workspace site counts (170 / 110 / 102 / 45 / 32) and closure SHAs as they land — gives future sessions a single inventory page.

## 9. Execution shape

Estimated 1 implementation session, ~3–5 hours, split into:

- Pre-flight: ~10 min
- Tasks 1–6 (per-subdirectory cleanup): ~30 min each = ~3 hours
- Task 7 (rule flip): ~5 min + verification
- Task 8 (merge + memory): ~15 min

Per the subagent-driven-development pattern: each of Tasks 1–6 dispatchable as one implementer subagent with spec-compliance + code-quality review after each. Task 7 and Task 8 are coordinator-driven (mechanical config flip and git operation, no value in a subagent dispatch).
