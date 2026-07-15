# Lint-Rule Rollout — Design

**Date:** 2026-05-28
**Status:** Spec (pending implementation plan)
**Branch (planned):** `refactor/lint-rule-rollout` (local-only per `refactor-push-policy`)
**Carry-forward from:** Phase 2d Structural Hardening, W3-T6 (deferred at 2d closure 2026-05-24)
**Source documents:**

- `docs/audits/phase-2d-closure-report.md` § "Deferred to dedicated lint-hygiene session"
- `docs/audits/phase-2d-type-cast-inventory.md` § "W3 closure status (2026-05-24)"
- `docs/plans/2026-05-19-base-refactor-phase-2d-structural-hardening.md` § W3-T6

---

## 1. Purpose

Close the Phase 2d W3-T6 carry-forward by:

1. Enforcing `@typescript-eslint/no-explicit-any: error` across all five production workspaces (`core`, `cli`, `modules/api`, `modules/ui`, `modules/storage`).
2. Bringing the lint baseline to zero errors / zero warnings under `pnpm -r exec eslint --max-warnings 0 .`.
3. Producing a local-runnable `pnpm lint` script at the repo root.

The work is a hygiene close-out, not a feature. It does not introduce CI/CD (per `no-cicd-policy`), does not modify the pre-commit hook, and does not attempt further reduction of the 223 surviving production `any` casts beyond trivial cases discovered during the manual review pass.

## 2. Current state (baseline)

Captured 2026-05-28 from a clean `dev` (1e30e35) with `pnpm exec eslint .` per workspace:

| Workspace | Errors | Warnings | Notes |
|---|---:|---:|---|
| `core` | 817 | 10 | Config has no `globals` block; no `*.cjs`/`*.mjs` parser handling |
| `cli` | 504 | 0 | Globals partial; likely vitest globals + a few node globals missing |
| `modules/api` | 167 | 2 | Globals partial |
| `modules/ui` | (crash) | — | Config requires `.nuxt/eslint.config.mjs` which is not generated |
| `modules/storage` | (no config) | — | `lint` script in `package.json` points at no valid flat config |
| `modules/schema-extensions/legal` | N/A | — | Schemas only; no source code to lint |
| **Total runnable** | **1,488** | 12 | |

Per-rule histogram (top contributors):

- `no-unused-vars` — 648 (false positives: JS rule running against TS code; TS already catches this)
- `no-undef` — 498 (missing `globals` declarations)
- `(parse)` — 317 (ESLint failing to parse `.cjs`/`.mjs` with the TS parser config)
- `no-useless-escape` — 10
- `no-empty` — 12
- `@typescript-eslint/no-unsafe-*` — 7 (incidental from `recommended`)
- `no-redeclare`, `no-var-requires` — 2

→ **~95% of the 1,488 errors collapse into 4 config bugs.** Real findings after config repair: ~30–50.

## 3. Cast situation (post-W3 inventory)

From `docs/audits/phase-2d-type-cast-inventory.md`:

- W3 cleared 1,398 of 1,621 casts (86%).
- **223 production casts remain** across `core/src`, `modules/api/src`, `modules/ui/app`, `modules/storage/src` (annotated allowlist).
- An additional 114 test-mock casts (47 core + 67 storage) live under `__tests__/**` and `*.test.ts` — these will be handled by a test-file override, **not** by per-line disable comments.
- **Zero existing `eslint-disable-next-line @typescript-eslint/no-explicit-any` comments** in the repo. Flipping the rule to `error` without annotation would re-add 223 errors on top of baseline; annotation is mandatory.

## 4. Approach

Single branch `refactor/lint-rule-rollout`, six sequential workstreams L0–L6:

### L0 — Baseline snapshot

Commit `docs/audits/lint-baseline-2026-05-28.md` with the table from §2 plus per-rule histogram per workspace. Pins the "before" number so DoD has a measurable delta.

### L1 — Config repair (high-leverage)

Fix the four config bugs that account for ~95% of the baseline:

- **`core/eslint.config.cjs`:** add a `globals` block matching the consolidated list in §5; add a `files: ['**/*.cjs', '**/*.mjs', '**/*.js']` block scoped to the JS parser (no TS project).
- **All four workspace configs (`core`, `cli`, `modules/api`, `modules/ui`):** turn `no-unused-vars: 'off'`, add `@typescript-eslint/no-unused-vars: ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]`.
- **`cli/eslint.config.cjs`:** consolidate to the §5 globals list (closes the 280 `no-undef` gap).
- **`modules/ui/eslint.config.mjs`:** preferred fix is to ensure `nuxi prepare` runs before lint (cheaper, lower risk); fallback is to author a Nuxt-independent config (`@nuxt/eslint` is convenience, not requirement). Decision made at execution time based on what works first.

Per workstream-end check: each workspace's error count down to <50.

### L2 — Author `modules/storage/eslint.config.cjs`

New flat config mirroring `core`'s post-L1 shape. Update `modules/storage/package.json` `lint` script to point at the new config. `cd modules/storage && pnpm exec eslint src/` should run without a config crash.

### L3 — Real-findings triage

Fix the ~30–50 residual errors that remain after L1+L2. Group commits by rule (one commit per rule for clean revert surface):

- `no-useless-escape` — 10 fixes
- `no-empty` — 12 fixes
- `no-redeclare` — 1
- `no-var-requires` — 1
- `@typescript-eslint/no-unsafe-*` — 7 (review each; some may become disable comments if structurally justified)

Goal at end of L3: all four runnable workspaces at 0 errors under `pnpm exec eslint --max-warnings=99 .`. Warning cap is generous; tightened in L5.

### L4 — Allowlist annotation (production casts only)

Two scripts plus a manual review pass:

1. **`scripts/lint-rollout-find-allowlist.mjs`** — runs `grep -rnE "\bas any\b|: any\b"` against `core/src`, `modules/api/src`, `modules/ui/app`, `modules/storage/src` (production paths only, excluding `__tests__/**` and `*.test.ts`). Emits `docs/audits/lint-allowlist-2026-05-28.json` as `[{ file, line, type, snippet }]`.
2. **`scripts/lint-rollout-annotate.mjs`** — walks the manifest and inserts `// eslint-disable-next-line @typescript-eslint/no-explicit-any` above each line. Idempotent: skips lines already covered by an existing `eslint-disable` comment. Defaults to dry-run (prints diff to stdout); applies only with `--apply` flag.
3. **Manual review pass** — before committing the annotation diff:
   - Hot-spot files (e.g., `realtime-server.ts` if encountered, large test mocks) — prefer a file-level `/* eslint-disable @typescript-eslint/no-explicit-any */` if the file has >20 disable comments. Trades per-site intent for reduced noise.
   - Any cast that looks trivially typeable (≤2 minutes) — type it instead of annotating. No rabbit holes; if uncertain, annotate.

**Production annotation count target:** ~109 line-level disables + a small number of file-level disables for hot-spots. (114 of the 223 are test-file casts handled by L5's override and need no annotation.)

### L5 — Rule flip + test override

Add to all five workspace configs:

```js
rules: {
  '@typescript-eslint/no-explicit-any': 'error',
}
```

Plus a test-file override block per workspace config:

```js
{
  files: ['**/*.test.ts', '**/__tests__/**'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
  },
}
```

Single commit (all five configs in one diff) for clean revert.

**Verification:**

- `pnpm -r exec eslint --max-warnings 0 .` exits 0 across all workspaces.
- Spot-check: temporarily add `const x: any = 1` to a production file → confirm error; same in a `*.test.ts` → confirm warning, not error. Revert spot-check before commit.

### L6 — Local runner + closure

- Add root `package.json` `lint` script: `pnpm -r --filter @civicpress/core --filter @civicpress/cli --filter @civicpress/api --filter @civicpress/ui --filter @civicpress/storage exec eslint --max-warnings 0 .` (exact filter syntax confirmed at implementation time).
- Update `docs/audits/phase-2d-closure-report.md` § "Deferred to dedicated lint-hygiene session" → mark closed with link to the merge commit and the closing branch name.
- Update `docs/project-status.md` Phase 2d carry-forward bullet — remove the lint item.
- Update `docs/audits/2026-05-16-manifesto-fit-findings.md` — flip any findings whose closure was blocked on this rollout.

## 5. Per-workspace target config (consolidated reference)

After L1+L2, every workspace flat config has this backbone:

- **Plugin/parser:** `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `js.configs.recommended` as base.
- **Files block for `*.ts` / `*.vue`** (TS parser, TS project): production rules.
- **Files block for `*.cjs` / `*.mjs` / `*.js`** (JS parser, no TS project): kills the 317 parse errors.
- **Globals block (consolidated list):** `console`, `process`, `Buffer`, `__dirname`, `__filename`, `global`, `module`, `require`, `exports`, `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `URL`, `URLSearchParams`. Plus vitest globals (`describe`, `it`, `test`, `expect`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll`, `vi`) in workspaces that run vitest.
- **Production rules block (`*.ts`, `*.vue`):**
  - `'no-unused-vars': 'off'`
  - `'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]` *(amended 2026-06-01: was `error`; demoted to `warn` after L1-T1 surfaced ~170 real unused vars in `core` alone, extrapolating to ~400–600 across all workspaces. The swap stays in as a signal channel but does not block the rollout gate; a dedicated cleanup session is left for future work.)*
  - `'@typescript-eslint/no-explicit-any': 'error'`
- **Test override block (`**/*.test.ts`, `**/__tests__/**`):**
  - `'@typescript-eslint/no-explicit-any': 'warn'`
- **Optional test-file parser block** (added as an L1 implementation refinement, not in the original design): in workspaces whose `tsconfig.json` excludes test files, the TS-project parser block must also exclude them, with a sibling block parsing test files without `parserOptions.project`. This is a correctness fix, not a rule change.
- **No other new rules.** `js.configs.recommended` already covers `no-undef`, `no-empty`, etc. Scope is not expanded; we are making the existing recommended baseline actually work.

`modules/ui` retains Nuxt's eslint integration on top, with the prod/test overrides appended at the bottom.

## 6. Verification & Definition of Done

### Per-workstream verification

- **L0:** baseline doc committed; numbers grep-able from `docs/audits/lint-baseline-2026-05-28.md`.
- **L1:** each workspace's error count <50 after the workstream (warnings excluded — unused-vars residue is at `warn` per the 2026-06-01 amendment); each commit message shows before/after delta.
- **L2:** `cd modules/storage && pnpm exec eslint src/` runs without config crash and reports an error count comparable to the other workspaces.
- **L3:** all four runnable workspaces at 0 errors under `pnpm exec eslint .` (warnings allowed; unused-vars warnings are signal-not-block).
- **L4:** `git grep -c "eslint-disable-next-line @typescript-eslint/no-explicit-any"` totals ≈109 + however many hot-spot file-level disables. Manifest committed at `docs/audits/lint-allowlist-2026-05-28.json`.
- **L5:** `pnpm -r exec eslint .` exits 0 (errors only). Spot-check (described above) passes.

### Branch DoD (all required to merge to `dev`)

1. `pnpm -r exec eslint .` exits 0 *(amended 2026-06-01: was `--max-warnings 0`. Warnings are allowed because the unused-vars rule swap is at `warn` and would surface ~400–600 warnings. The DoD blocks on **errors only**.)*
2. `pnpm test --run` exits 0 (no test regressions from incidental code touches).
3. `pnpm -r build` exits 0 (no build regressions).
4. `pnpm run lint` (new root script) exits 0 — script is `eslint .` per workspace, no `--max-warnings 0` cap.
5. `docs/audits/phase-2d-closure-report.md` § "Deferred to dedicated lint-hygiene session" updated → marked closed with link to merge commit + branch name.
6. `docs/project-status.md` Phase 2d carry-forward bullet updated to remove the lint item.
7. `docs/audits/2026-05-16-manifesto-fit-findings.md` — any findings whose closure was blocked on the rule rollout flipped to closed.

## 7. Non-goals

- No CI/CD workflow added (per `no-cicd-policy`).
- No pre-commit hook change (lint stays manual; `lint-staged` keeps its current prettier-only scope).
- No further reduction of the 223 cast count beyond what L4's manual review catches as trivial (≤2 minutes per site).
- No new lint rules beyond `@typescript-eslint/no-explicit-any`. The `no-unused-vars` → `@typescript-eslint/no-unused-vars` swap is config repair, not a new rule.
- No substantive touching of `realtime-server.ts` (owned by Phase 3). If it surfaces in L4, it gets a file-level disable.
- No push to any remote. Branch is local-only per `refactor-push-policy`; merges to local `dev` only.

## 8. Branch, commits, rollback

- **Branch:** `refactor/lint-rule-rollout` cut from `dev` (1e30e35). Worktree isolation at execution time via `superpowers:using-git-worktrees`.
- **Merge target:** `dev`, `--no-ff`. Merge commit body summarizes L0–L6 outcomes and before/after baseline.
- **Commit shape:** 15–25 commits total, all `--no-verify` per `refactor-no-verify-policy`. Per workstream: L0 (1), L1 (4–6), L2 (1–2), L3 (3–8), L4 (1–3), L5 (1), L6 (1–2).
- **Rollback:** L5 is the only commit that materially changes enforcement. `git revert <L5 sha>` cleanly disables the rule while preserving L1–L4 hygiene. Document this explicitly in the L5 commit body.

## 9. Anti-scope-creep

If during execution a workstream is discovered to be materially bigger than this spec assumes (e.g., L3 real-findings triage turns up structural code issues, or L1 config repair requires touching production source extensively), **stop and re-spec** rather than expanding scope mid-branch. The spec is the contract; deviations come back here for approval first.

## 10. Open questions deferred to implementation

- Exact root `lint` script form (raw `pnpm -r exec eslint` vs. workspace `--filter` pattern). Decided at L6.
- `modules/ui` config resolution path — `nuxi prepare` pre-step vs. Nuxt-independent config. Decided at L1 based on which works first.
- Whether any hot-spot files warrant file-level disable comments. Decided per-file during L4 manual review (threshold: >20 per-line disables in a single file).

These are tactical execution choices, not design decisions. They do not block plan-writing.
