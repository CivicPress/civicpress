# Lint-rollout followup #1.4-5 — combined `modules/storage` + `modules/api` unused-vars cleanup

**Date:** 2026-06-03
**Status:** Approved (brainstorming gate)
**Predecessor:** `docs/specs/2026-05-28-lint-rule-rollout-design.md`
**Sibling sub-followups (closed):**

- `docs/specs/2026-06-02-lint-rollout-followup-1.3-ui-unused-vars-design.md` (merge `f850aab`)
- `docs/specs/2026-06-02-lint-rollout-followup-1.2-cli-unused-vars-design.md` (merge `961547d`)
- `docs/specs/2026-06-02-lint-rollout-followup-1.1-core-unused-vars-design.md` (merge `60d91e8`)

**Followup inventory:** memory `lint-rollout-2026-06-02-followups.md` (items #1.4 + #1.5 of 5 per-workspace sub-followups). User opted on 2026-06-03 to combine the final two into a single session.

This spec covers **both #1.4 (storage) and #1.5 (api)** in a single feature branch + merge. After this lands, the entire `#1 unused-vars` umbrella is closed across all 5 workspaces.

---

## 1. Goal

Drive `@typescript-eslint/no-unused-vars` warnings in `modules/storage/src/**` from 45 to 0 and in `modules/api/src/**` from 32 to 0 (77 total). Then promote the rule from `warn` to `error` in both workspaces' eslint configs (`modules/storage/eslint.config.cjs` + `modules/api/eslint.config.cjs`), each with two blocks to flip (production + test).

After this followup, the `#1 unused-vars` umbrella is fully closed:

| Workspace | Sites | Closed at |
|---|---|---|
| core (170) | 170 | merge `60d91e8` |
| cli (110) | 110 | merge `961547d` |
| modules/ui (102) | 102 | merge `f850aab` |
| **modules/storage (45)** | **45** | **this followup** |
| **modules/api (32)** | **32** | **this followup** |
| **Total: 459** | **459** | — |

## 2. Scope

**In scope** — `modules/storage/src/**` + `modules/storage/eslint.config.cjs`; `modules/api/src/**` + `modules/api/eslint.config.cjs`. Distribution (from pre-flight lint on `dev` post-#1.3 merge):

### Storage (45 sites)

| Subdir | Sites |
|---|---|
| `modules/storage/src/__tests__/` | 20 |
| `modules/storage/src/cloud-uuid-storage/` | 9 |
| `modules/storage/src/reporting/` | 4 |
| `modules/storage/src/credential-manager.ts` | 4 |
| `modules/storage/src/storage-services.ts` | 2 |
| `modules/storage/src/cleanup/` | 2 |
| `modules/storage/src/metrics/` | 1 |
| `modules/storage/src/lifecycle/` | 1 |
| `modules/storage/src/health/` | 1 |
| `modules/storage/src/errors/` | 1 |

Top storage hot-spots:

| File | Sites |
|---|---|
| `__tests__/circuit-breaker.test.ts` | 10 |
| `reporting/storage-usage-reporter.ts` | 4 |
| `credential-manager.ts` | 4 |
| `cloud-uuid-storage/download-ops.ts` | 3 |
| `__tests__/cache-integration.test.ts` | 3 |

### API (32 sites)

| Subdir | Sites |
|---|---|
| `modules/api/src/routes/` | 22 |
| `modules/api/src/middleware/` | 5 |
| `modules/api/src/utils/` | 4 |
| `modules/api/src/index.ts` | 1 |

Top api hot-spots:

| File | Sites |
|---|---|
| `routes/__tests__/diagnose.test.ts` | 5 |
| `utils/api-logger.ts` | 4 |
| `middleware/error-handler.ts` | 4 |
| `routes/geography.ts` | 3 |

**Out of scope:**

- Other workspaces (`core` ✅, `cli` ✅, `modules/ui` ✅) — closed in prior followups
- Other lint rules — including `no-explicit-any` allowlist sites and the `STYLE_RULES_DEFERRED` map in `modules/ui` (followup #4 covers ~30 vue/nuxt style rules)
- The 2-file `useTypedI18n` mini-migration surfaced during #2
- The 6 still-open surfaced findings + sub-finding #3.1 from prior followups — separate triage
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

**Stub-pattern note (carries from #1.1 review):** `private` method with unused param where callers pass meaningful values → `_`-prefix preserves stub-pattern signal.

Both workspaces are `.ts`-only — no Vue-specific safeguards needed (the §3 + §5 of #1.3 spec do not apply here).

### Storage-specific hints

- **20 sites in `__tests__/`** (10 in `circuit-breaker.test.ts` alone). High likelihood of the same "captured-effect-never-asserted" pattern surfaced in prior tests (#1.1's `saga-failure-injection.test.ts`, #1.2's 6 cli `__tests__/*.test.ts` files). Implementer should flag any spy/mock that's captured but never asserted on, per the surfaced-bug escalation policy — do NOT auto-fix; report as DONE_WITH_CONCERNS.
- `cloud-uuid-storage/` has 9 sites across multiple files. Likely a mix of unused error-narrowing imports (similar to the `errorMessage`/`errorStack` cleanups in #1.1/#1.2) and possibly stub-pattern parameters in operation classes.
- `credential-manager.ts` (4 sites in one file) — single-file concentration; check for the credential-rotation interface contract pattern before stripping any field-name destructures.

### API-specific hints

- **22 of 32 sites in `routes/`** — Express route handlers often have unused `req` / `res` / `next` parameters that exist for the Express middleware contract. `_`-prefix pattern from prior workspaces applies (`_req`, `_res`, `_next`).
- `middleware/error-handler.ts` (4 sites) — Express error-handling middleware has a specific 4-argument signature `(err, req, res, next)` where unused-but-required params are common.
- `utils/api-logger.ts` (4 sites) — possibly unused log-level args or logger-factory params.

## 4. Approach — single feature branch, 4 commits + merge

Single feature branch off `dev`: `refactor/lint-followup-1.4-5-storage-api-unused-vars`.

### Task slicing

| Task | Scope | Sites |
|---|---|---|
| Pre-flight | — | Capture baselines (both workspace lints, both `tsc`, full test baseline), branch creation |
| Task 1 | All of `modules/storage/src/**` (tests + src) | 45 |
| Task 2 | All of `modules/api/src/**` | 32 |
| Task 3 | Flip `modules/storage/eslint.config.cjs` lines 58 + 78 (`['warn', ...]` → `['error', ...]` in both blocks) | — |
| Task 4 | Flip `modules/api/eslint.config.cjs` lines 60 + 80 (`['warn', ...]` → `['error', ...]` in both blocks) | — |
| Task 5 | Verification + merge `--no-ff` to `dev` + memory update (closes `#1` umbrella) | — |

Tasks 1 + 2 each get one implementer subagent + spec/code-quality review. Tasks 3 + 4 are coordinator-driven mechanical config flips. Task 5 is coordinator-driven merge + memory.

### Tooling notes

- `pnpm --filter @civicpress/storage exec eslint . --rule '{"@typescript-eslint/no-unused-vars": "error"}'` for storage; same for `@civicpress/api`.
- `pnpm --filter @civicpress/storage exec tsc --noEmit` for storage typecheck; same for api.
- `pnpm test:run` for full repo (baseline 78 fail / 906-907 pass / 40 skip per memory).
- `pnpm -C modules/storage test:run` is the storage-specific test command (per memory: 216/216 passing under that command in prior phases). Confirm baseline in pre-flight before counting on this number.

## 5. Risks

### 5.1 Stripping a declaration with side-effecting RHS
Same as #1.1 / #1.2 / #1.3. Mitigation: per-category rule preserves the call when the RHS isn't a pure value. Implementer must read each removal in context.

### 5.2 Surfaced bug ("declared, never wired")
Both workspaces are mature production code; surfaced bugs less likely than in #1.1's diagnostics (which had 4) or #1.2's cli (which had 4). But the storage tests' concentration (20 sites) is a likely surfacer. Mitigation: DONE_WITH_CONCERNS escalation.

### 5.3 Promote to `error` breaks pre-commit hook on dead-code commits
Same as prior — desired behavior.

### 5.4 Test-file `error` is tighter than `no-explicit-any` carve-out
Same as #1.1. No test-file carve-out for unused-vars; tests must reach 0.

### 5.5 Storage tests contain 10/20 sites in one file
`__tests__/circuit-breaker.test.ts` has 10 sites — concentrated. Likely a mix of dead spies, stripped-then-forgotten setup, and unused captured state. Treat carefully; flag missing-assertion patterns per §5.2.

### 5.6 Express middleware contract parameters
API's `routes/` + `middleware/` heavily use Express signatures `(req, res, next)` and `(err, req, res, next)`. Most "unused" params here are required by the contract → `_`-prefix is the right move (interface contract), not strip.

### 5.7 77 combined sites in one merge
Net deletions likely large (similar to #1.2's 442-line strip). Mitigation: 2-task split (one per workspace) keeps each commit reviewable; subagent-driven-development with reviews between tasks catches drift.

### 5.8 Pre-existing test failures
Baseline at session start: 78 fail / 906-907 pass / 40 skip (per #1.3 closure). Storage-specific: `pnpm -C modules/storage test:run` 216/216 per memory (confirm in pre-flight).

## 6. Verification gate (Task 5)

- [ ] `pnpm --filter @civicpress/storage exec eslint .` exits 0; output contains **0 `@typescript-eslint/no-unused-vars` warnings** AND **0 errors**
- [ ] `pnpm --filter @civicpress/api exec eslint .` exits 0; output contains **0 `@typescript-eslint/no-unused-vars` warnings** AND **0 errors**
- [ ] Both workspaces' `tsc --noEmit` match pre-flight baselines (no new typecheck errors)
- [ ] `pnpm test:run` no new failures
- [ ] `pnpm -C modules/storage test:run` matches its baseline (likely 216/216)
- [ ] `modules/storage/eslint.config.cjs` has `'@typescript-eslint/no-unused-vars': ['error', ...]` in **both** blocks
- [ ] `modules/api/eslint.config.cjs` has `'@typescript-eslint/no-unused-vars': ['error', ...]` in **both** blocks
- [ ] `git diff --stat dev..HEAD` shows changes only in `modules/storage/**` and `modules/api/**`
- [ ] No files outside those two workspaces modified
- [ ] All commits used `--no-verify` per master plan §9.1
- [ ] Branch deleted after merge; no push to origin

## 7. Non-goals (restated)

- No CI gate (`no-cicd-policy`)
- No PR / no push (`refactor-push-policy`)
- No work on other workspaces (all closed)
- No work on other lint rules
- No fix for still-open surfaced findings from prior followups
- No re-investigation of the #3.1 saga sub-finding (the test is marked `.fails` and stays that way)

## 8. Memory updates after merge

In `lint-rollout-2026-06-02-followups.md`:

- Update item #1's body: mark #1.4 closed with merge SHA + 45 sites; mark #1.5 closed with merge SHA + 32 sites; **mark `#1` umbrella as fully CLOSED** with totals (459 sites across 5 workspaces).
- Update the "remaining" list (0 workspace sub-followups left; only #4 vue/nuxt style rules + 2-file `useTypedI18n` mini-migration remain in the lint-rollout backlog).
- Append any new surfaced findings.

In `MEMORY.md` index: update the followup hook line — `#1` is now fully closed.

In `refactor-2026-05-master-plan.md`: append #1.4 + #1.5 closure SHAs to the description; note `#1` umbrella complete.

In `lint-followups-surfaced-findings.md`: append any new findings surfaced in this session.

## 9. Execution shape

Estimated 1 implementation session, ~2-3 hours, split into:

- Pre-flight: ~10 min
- Task 1 (storage, 45 sites): ~50 min
- Task 2 (api, 32 sites): ~40 min
- Tasks 3 + 4 (rule flips): ~10 min combined
- Task 5 (merge + memory): ~15 min

Per the subagent-driven-development pattern: Tasks 1 + 2 each as one implementer subagent + spec/code-quality review. Tasks 3 + 4 + 5 are coordinator-driven.

This closes the `#1 unused-vars` umbrella across all 5 workspaces (459 sites total). Remaining lint-rollout work after this: #4 (~30 vue/nuxt style rules) + 2-file `useTypedI18n` mini-migration. Per [[lint-followups-before-phase-3]] policy, Phase 3 (realtime reintroduction) follows when those final lint items land.
