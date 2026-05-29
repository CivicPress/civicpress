# Lint Baseline — 2026-05-28

**Branch:** `worktree-refactor-lint-rule-rollout` (worktree-harness name; plan refers to it as `refactor/lint-rule-rollout`); cut from `dev` @ `446763f`
**Captured by:** Task L0
**Spec:** `docs/specs/2026-05-28-lint-rule-rollout-design.md`
**Plan:** `docs/plans/2026-05-28-lint-rule-rollout.md`

## Per-workspace counts

| Workspace | Errors | Warnings | Notes |
|---|---:|---:|---|
| `core` | 817 | 10 | No `globals` block; no `.cjs`/`.mjs` parser handling |
| `cli` | 504 | 0 | Globals partial; vitest globals missing |
| `modules/api` | 167 | 2 | Globals partial |
| `modules/ui` | (config crash) | — | Requires `.nuxt/eslint.config.mjs` |
| `modules/storage` | (no config) | — | Missing flat config |
| **Total runnable** | **1488** | **12** | |

## Per-rule histogram (aggregate across runnable workspaces)

Top contributors:
- `no-unused-vars` — 648
- `no-undef` — 324
- `(parse)` — 317
- `no-empty` — 12
- `no-useless-escape` — 10
- `@typescript-eslint/no-unsafe-assignment` — 3
- `@typescript-eslint/no-explicit-any` — 3
- `@typescript-eslint/no-unsafe-member-access` — 2
- `@typescript-eslint/no-unsafe-call` — 2
- `@typescript-eslint/no-unused-vars` — 3

### Per-workspace rule breakdown

**core (827 total):**
- `no-unused-vars` — 433
- `(parse)` — 197
- `no-undef` — 174
- `no-useless-escape` — 10
- `@typescript-eslint/no-unsafe-assignment` — 3
- `@typescript-eslint/no-explicit-any` — 2
- `@typescript-eslint/no-unused-vars` — 2
- `@typescript-eslint/no-unsafe-member-access` — 2
- `@typescript-eslint/no-unsafe-call` — 2
- `@typescript-eslint/no-var-requires` — 1
- `no-redeclare` — 1

**cli (504 total):**
- `no-undef` — 280
- `no-unused-vars` — 167
- `(parse)` — 47
- `no-empty` — 10

**modules/api (169 total):**
- `(parse)` — 73
- `no-unused-vars` — 48
- `no-undef` — 44
- `no-empty` — 2
- `@typescript-eslint/no-unused-vars` — 1
- `@typescript-eslint/no-explicit-any` — 1

## Cast inventory (post-W3, from `docs/audits/phase-2d-type-cast-inventory.md`)

- 223 production `: any` / `as any` casts remain (annotated allowlist).
- Additional 114 test-mock casts (47 core + 67 storage) under `__tests__/**` and `*.test.ts` — handled by L5 test-file override, **not** per-line disables.
- Existing `eslint-disable-next-line @typescript-eslint/no-explicit-any` comments in repo: 13 (verified with `git grep` across source files only, excluding docs).

## Test-suite baseline

`pnpm run test:run` on this worktree exits with 32 test files failed / 78 tests failed / 906 passed / 40 skipped. This **matches the main repo's `dev` HEAD** exactly — it is the documented Phase 2d carry-forward (`date-bomb`, `lock-endpoints`, `session-mgmt` flakes per `docs/audits/phase-2d-closure-report.md`). Gate for downstream lint-rollout tasks: **no new test regressions vs. this 78-failure floor**, not "0 failures".
