# Lint-Rule Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Phase 2d W3-T6 carry-forward — enforce `@typescript-eslint/no-explicit-any: error` across the 5 production workspaces, drive `pnpm -r exec eslint .` to clean (errors only; see 2026-06-01 amendment below), and add a root-level `pnpm lint` runner.

**Amendment 2026-06-01 (after L1-T1 execution):**
- `@typescript-eslint/no-unused-vars` demoted from `error` to `warn` after L1-T1 surfaced ~170 real unused vars in `core` alone (extrapolating to ~400–600 across all workspaces). The rule swap stays in as a signal channel; cleaning up the residue is a dedicated future session.
- DoD gate switches from `--max-warnings 0` to no warnings cap. Errors block; warnings are signal.
- A test-file parser carve-out (separate block, no `parserOptions.project`) is permitted in workspaces whose `tsconfig.json` excludes test files. This is a correctness fix discovered during L1-T1, not a rule change.

**Architecture:** Single branch `refactor/lint-rule-rollout` cut from `dev` (1e30e35). Six sequential workstreams L0–L6: baseline snapshot → config repair (kills ~95% of the 1,488-error baseline) → author missing `modules/storage` config → triage residual real findings → annotate 223 production `any` casts with disable comments (test-mock casts handled by warn-tier override, not per-line disables) → flip rule + add test override → root script + closure docs. Local-only per `refactor-push-policy`; merges to local `dev` only.

**Tech Stack:** ESLint v9 flat config (`.cjs` per workspace; `.mjs` for `modules/ui` with Nuxt's eslint integration); `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser`; pnpm workspaces (`core`, `cli`, `modules/api`, `modules/ui`, `modules/storage`).

**Companion design spec:** `docs/specs/2026-05-28-lint-rule-rollout-design.md` (commit `1132d79`).

**Branch policy:**
- All commits use `--no-verify` per `refactor-no-verify-policy` (master plan §9.1).
- No `git push` to any origin per `refactor-push-policy`. Merges to local `dev` only.
- Branch disposition (merge to `dev` vs hold) is a user decision at closure.

**Commit message convention:** `refactor(lint-rollout L<n>-T<m>): <subject>` matching the repo's Phase 2d pattern.

---

## File Structure

**Created:**
- `docs/audits/lint-baseline-2026-05-28.md` — L0 baseline snapshot (per-workspace error counts + per-rule histogram). Pins the "before" number.
- `docs/audits/lint-allowlist-2026-05-28.json` — L4 manifest of the 109 production `any` cast sites slated for per-line disable comments.
- `modules/storage/eslint.config.cjs` — L2 new flat config (storage currently has none; its `lint` script is broken).
- `scripts/lint-rollout-find-allowlist.mjs` — L4 helper that emits the allowlist manifest.
- `scripts/lint-rollout-annotate.mjs` — L4 helper that inserts disable comments above each allowlist site.

**Modified:**
- `core/eslint.config.cjs` — add `globals` block + `.cjs/.mjs/.js` files block + `no-unused-vars` swap (L1-T1); add rule flip + test override (L5).
- `cli/eslint.config.cjs` — consolidate globals (add vitest + node missing) + `no-unused-vars` swap (L1-T2); add rule flip + test override (L5).
- `modules/api/eslint.config.cjs` — consolidate globals + `no-unused-vars` swap (L1-T3); add rule flip + test override (L5).
- `modules/ui/eslint.config.mjs` — ensure `nuxi prepare` pre-step works OR rewrite without `.nuxt/` dependency (L1-T4); add rule flip + test override (L5).
- `modules/storage/package.json` — update `lint` script after L2 config exists.
- `package.json` (root) — add `lint` script (L6).
- Source files under `core/src`, `cli/src`, `modules/api/src`, `modules/ui/app`, `modules/storage/src` — line-level disable comments above 109 production casts (L4); a handful of file-level `/* eslint-disable @typescript-eslint/no-explicit-any */` for hot-spots (L4, only if >20 disables in one file).
- Source files surfaced by L3 residual triage — direct fixes (no-useless-escape, no-empty, no-redeclare, no-var-requires, no-unsafe-*).
- `docs/audits/phase-2d-closure-report.md` — § "Deferred to dedicated lint-hygiene session" marked closed (L6).
- `docs/project-status.md` — Phase 2d carry-forward bullet trimmed (L6).
- `docs/audits/2026-05-16-manifesto-fit-findings.md` — any findings whose closure was blocked on this rollout flipped (L6).

**Not touched (out of scope per spec §7):**
- No `.github/workflows/` added (`no-cicd-policy`).
- No pre-commit hook or `lint-staged` change.
- No further reduction of the 223 cast count beyond trivial cases caught during L4 manual review.
- No new lint rules beyond `@typescript-eslint/no-explicit-any` (the `no-unused-vars` swap is config repair, not a new rule).
- `realtime-server.ts` substantively (owned by Phase 3; gets a file-level disable if surfaced).

---

## Conventions used in this plan

Because this is a hygiene rollout, classical RED/GREEN TDD doesn't apply line-by-line. Instead each task uses the same shape:

1. **Capture the "before" lint state** for the workspace(s) being touched.
2. **Make the change.**
3. **Capture the "after" lint state.**
4. **Confirm the delta matches the task's prediction.** If it doesn't, stop and re-spec.
5. **Commit.**

The L3 residual-triage tasks are the closest to traditional fixes-with-tests — each rule fix should not break `pnpm test --run`. Run the full test suite at end of L3 and end of L5.

`--no-verify` is approved policy for this branch. All commits use it.

---

## Task L0: Branch + baseline snapshot

**Files:**
- Create: `docs/audits/lint-baseline-2026-05-28.md`

**Purpose:** Cut the branch and freeze the "before" numbers so DoD has a measurable delta.

- [ ] **Step 1: Confirm clean working tree on `dev`**

Run:
```bash
git status
git log -1 --oneline
```
Expected: `nothing to commit, working tree clean` and HEAD at `1e30e35` (or later if `dev` has moved — note the actual SHA).

- [ ] **Step 2: Create branch (worktree-isolated per `using-git-worktrees` if invoked from an agentic loop)**

Run:
```bash
git checkout -b refactor/lint-rule-rollout
```
Expected: `Switched to a new branch 'refactor/lint-rule-rollout'`.

- [ ] **Step 3: Capture per-workspace lint counts**

Create `/tmp/lint-summary.mjs` (helper used by Step 4 — small script that reads JSON formatter output from stdin and prints a per-rule histogram):

```javascript
let d = '';
process.stdin.on('data', (c) => (d += c));
process.stdin.on('end', () => {
  const r = JSON.parse(d);
  const m = {};
  for (const f of r) {
    for (const e of f.messages) {
      const k = e.ruleId || '(parse)';
      m[k] = (m[k] || 0) + 1;
    }
  }
  const s = Object.entries(m).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of s.slice(0, 20)) console.log(v.toString().padStart(5), k);
  console.log('---total:', Object.values(m).reduce((a, b) => a + b, 0));
});
```

- [ ] **Step 4: Run lint per workspace, record counts**

Run (separately per workspace):
```bash
for ws in core cli modules/api; do echo "=== $ws ==="; (cd "$ws" && pnpm exec eslint . -f json 2>/dev/null | node /tmp/lint-summary.mjs); done
```

For `modules/ui`:
```bash
cd modules/ui && pnpm exec eslint --max-warnings 0 . 2>&1 | tail -5
```
Expected: config crash (`Cannot find module '.nuxt/eslint.config.mjs'`). Record this as the L0 baseline for ui.

For `modules/storage`:
```bash
cd modules/storage && pnpm exec eslint src/**/*.ts 2>&1 | tail -5
```
Expected: error about missing flat config (`From ESLint v9.0.0, the default configuration file is now eslint.config.js`). Record this as the L0 baseline for storage.

- [ ] **Step 5: Write the baseline doc**

Create `docs/audits/lint-baseline-2026-05-28.md`:

```markdown
# Lint Baseline — 2026-05-28

**Branch:** `refactor/lint-rule-rollout` (cut from `dev` @ <SHA>)
**Captured by:** Task L0
**Spec:** `docs/specs/2026-05-28-lint-rule-rollout-design.md`

## Per-workspace counts

| Workspace | Errors | Warnings | Notes |
|---|---:|---:|---|
| `core` | 817 | 10 | No `globals` block; no `.cjs`/`.mjs` parser handling |
| `cli` | 504 | 0 | Globals partial; vitest globals missing |
| `modules/api` | 167 | 2 | Globals partial |
| `modules/ui` | (config crash) | — | Requires `.nuxt/eslint.config.mjs` |
| `modules/storage` | (no config) | — | Missing flat config |
| **Total runnable** | **1,488** | 12 | |

## Per-rule histogram (top contributors, aggregated across runnable workspaces)

- `no-unused-vars` — 648 (TS-false-positive; swap to `@typescript-eslint/no-unused-vars`)
- `no-undef` — 498 (missing `globals` declarations)
- `(parse)` — 317 (TS parser running against `.cjs`/`.mjs`)
- `no-useless-escape` — 10
- `no-empty` — 12
- `@typescript-eslint/no-unsafe-*` — 7
- `no-redeclare` — 1
- `no-var-requires` — 1

## Cast inventory (post-W3, from `docs/audits/phase-2d-type-cast-inventory.md`)

- 223 production `: any` / `as any` casts remain (annotated allowlist).
- Additional 114 test-mock casts (47 core + 67 storage) under `__tests__/**` and `*.test.ts` — handled by L5 test-file override, **not** per-line disables.
- Existing `eslint-disable-next-line @typescript-eslint/no-explicit-any` comments in repo: 0.
```

(Replace `<SHA>` with the actual commit from Step 1.)

- [ ] **Step 6: Commit**

Run:
```bash
git add docs/audits/lint-baseline-2026-05-28.md
git commit --no-verify -m "docs(lint-rollout L0): baseline snapshot (1,488 errors across 4 runnable workspaces)"
```
Expected: clean commit on `refactor/lint-rule-rollout`.

---

## Task L1-T1: Repair `core/eslint.config.cjs`

**Files:**
- Modify: `core/eslint.config.cjs`

**Purpose:** Add `globals` (closes ~174 `no-undef`), add `.cjs/.mjs/.js` parser block (closes ~197 parse errors), swap `no-unused-vars` to TS variant (closes ~433 false positives). Predicted result: 817 → ~10 errors.

- [ ] **Step 1: Capture before**

Run:
```bash
cd core && pnpm exec eslint . -f json 2>/dev/null | node /tmp/lint-summary.mjs
```
Expected: `---total: 827` (817 err + 10 warn).

- [ ] **Step 2: Rewrite `core/eslint.config.cjs`**

Replace file contents with:

```javascript
const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');

const NODE_GLOBALS = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  global: 'readonly',
  module: 'readonly',
  require: 'readonly',
  exports: 'readonly',
  setTimeout: 'readonly',
  setInterval: 'readonly',
  clearTimeout: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  clearImmediate: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
};

const VITEST_GLOBALS = {
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  vi: 'readonly',
};

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
      globals: { ...NODE_GLOBALS, ...VITEST_GLOBALS },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.cjs', '**/*.mjs', '**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: NODE_GLOBALS,
    },
  },
];
```

- [ ] **Step 3: Capture after**

Run:
```bash
cd core && pnpm exec eslint . -f json 2>/dev/null | node /tmp/lint-summary.mjs
```
Expected: total drops dramatically (target <50). If it doesn't, stop and re-spec.

- [ ] **Step 4: Verify build + tests still pass for the workspace**

Run:
```bash
cd core && pnpm run build
cd core && pnpm test --run
```
Expected: both PASS (config edits should not affect TS compilation or test behavior).

- [ ] **Step 5: Commit**

Run:
```bash
git add core/eslint.config.cjs
git commit --no-verify -m "refactor(lint-rollout L1-T1): repair core eslint config (827 → <after>)"
```
Replace `<after>` with the actual count from Step 3.

---

## Task L1-T2: Repair `cli/eslint.config.cjs`

**Files:**
- Modify: `cli/eslint.config.cjs`

**Purpose:** Consolidate globals to match core (add vitest + missing node globals), swap `no-unused-vars`. Predicted result: 504 → ~10 errors. The 280 `no-undef` is almost entirely vitest globals from `cli/src/commands/__tests__/*.test.ts`.

- [ ] **Step 1: Capture before**

Run:
```bash
cd cli && pnpm exec eslint . -f json 2>/dev/null | node /tmp/lint-summary.mjs
```
Expected: `---total: 504`.

- [ ] **Step 2: Rewrite `cli/eslint.config.cjs`**

Replace file contents with (intentionally identical to `core/eslint.config.cjs` at this stage):

```javascript
const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');

const NODE_GLOBALS = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  global: 'readonly',
  module: 'readonly',
  require: 'readonly',
  exports: 'readonly',
  setTimeout: 'readonly',
  setInterval: 'readonly',
  clearTimeout: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  clearImmediate: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
};

const VITEST_GLOBALS = {
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  vi: 'readonly',
};

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
      globals: { ...NODE_GLOBALS, ...VITEST_GLOBALS },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.cjs', '**/*.mjs', '**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: NODE_GLOBALS,
    },
  },
];
```

- [ ] **Step 3: Capture after**

Run:
```bash
cd cli && pnpm exec eslint . -f json 2>/dev/null | node /tmp/lint-summary.mjs
```
Expected: total drops to <50.

- [ ] **Step 4: Verify build + tests still pass**

Run:
```bash
cd cli && pnpm run build
cd cli && pnpm test --run
```
Expected: both PASS.

- [ ] **Step 5: Commit**

Run:
```bash
git add cli/eslint.config.cjs
git commit --no-verify -m "refactor(lint-rollout L1-T2): repair cli eslint config (504 → <after>)"
```

---

## Task L1-T3: Repair `modules/api/eslint.config.cjs`

**Files:**
- Modify: `modules/api/eslint.config.cjs`

**Purpose:** Consolidate globals to match core/cli, swap `no-unused-vars`. Predicted result: 169 → ~10 errors.

- [ ] **Step 1: Capture before**

Run:
```bash
cd modules/api && pnpm exec eslint . -f json 2>/dev/null | node /tmp/lint-summary.mjs
```
Expected: `---total: 169`.

- [ ] **Step 2: Rewrite `modules/api/eslint.config.cjs`**

Replace file contents with (intentionally identical to `core/eslint.config.cjs` at this stage):

```javascript
const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');

const NODE_GLOBALS = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  global: 'readonly',
  module: 'readonly',
  require: 'readonly',
  exports: 'readonly',
  setTimeout: 'readonly',
  setInterval: 'readonly',
  clearTimeout: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  clearImmediate: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
};

const VITEST_GLOBALS = {
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  vi: 'readonly',
};

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
      globals: { ...NODE_GLOBALS, ...VITEST_GLOBALS },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.cjs', '**/*.mjs', '**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: NODE_GLOBALS,
    },
  },
];
```

- [ ] **Step 3: Capture after**

Run:
```bash
cd modules/api && pnpm exec eslint . -f json 2>/dev/null | node /tmp/lint-summary.mjs
```
Expected: total drops to <50.

- [ ] **Step 4: Verify build + tests still pass**

Run:
```bash
cd modules/api && pnpm run build
cd modules/api && pnpm test --run
```
Expected: both PASS.

- [ ] **Step 5: Commit**

Run:
```bash
git add modules/api/eslint.config.cjs
git commit --no-verify -m "refactor(lint-rollout L1-T3): repair modules/api eslint config (169 → <after>)"
```

---

## Task L1-T4: Repair `modules/ui/eslint.config.mjs`

**Files:**
- Modify: `modules/ui/eslint.config.mjs` (potentially)
- Read: `modules/ui/package.json` (check for `prepare` / `postinstall` scripts)

**Purpose:** Unblock the UI lint run. Current config crashes because it imports from `./.nuxt/eslint.config.mjs`, which is generated by `nuxi prepare`. Two options; try (A) first, fall back to (B).

- [ ] **Step 1: Capture before**

Run:
```bash
cd modules/ui && pnpm exec eslint --max-warnings 0 . 2>&1 | tail -5
```
Expected: `ERR_MODULE_NOT_FOUND ... .nuxt/eslint.config.mjs`.

- [ ] **Step 2: Try option A — generate `.nuxt/` then lint**

Run:
```bash
cd modules/ui && pnpm exec nuxi prepare
cd modules/ui && pnpm exec eslint . -f json 2>/dev/null | node /tmp/lint-summary.mjs
```
Expected: ESLint runs (some error/warning count, doesn't crash). If yes → proceed to Step 4 (no config edit needed; the fix is the `nuxi prepare` step before lint). If no (still crashes after prepare) → Step 3.

- [ ] **Step 3 (only if Step 2 failed): Option B — rewrite without `.nuxt/` dependency**

Replace `modules/ui/eslint.config.mjs` with:

```javascript
// @ts-check
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import vueparser from 'vue-eslint-parser';

const NODE_GLOBALS = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  global: 'readonly',
  setTimeout: 'readonly',
  setInterval: 'readonly',
  clearTimeout: 'readonly',
  clearInterval: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
};

const BROWSER_GLOBALS = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  fetch: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
};

const VITEST_GLOBALS = {
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  vi: 'readonly',
};

const NUXT_AUTO_IMPORTS = {
  defineNuxtConfig: 'readonly',
  defineNuxtPlugin: 'readonly',
  defineNuxtRouteMiddleware: 'readonly',
  defineEventHandler: 'readonly',
  useState: 'readonly',
  useRoute: 'readonly',
  useRouter: 'readonly',
  useRuntimeConfig: 'readonly',
  useFetch: 'readonly',
  useNuxtApp: 'readonly',
  navigateTo: 'readonly',
  createError: 'readonly',
  ref: 'readonly',
  reactive: 'readonly',
  computed: 'readonly',
  watch: 'readonly',
  watchEffect: 'readonly',
  onMounted: 'readonly',
  onUnmounted: 'readonly',
  nextTick: 'readonly',
  defineProps: 'readonly',
  defineEmits: 'readonly',
  defineExpose: 'readonly',
  withDefaults: 'readonly',
};

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: './tsconfig.json', sourceType: 'module' },
      globals: { ...NODE_GLOBALS, ...BROWSER_GLOBALS, ...VITEST_GLOBALS, ...NUXT_AUTO_IMPORTS },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueparser,
      parserOptions: { parser: tsparser, project: './tsconfig.json', sourceType: 'module', extraFileExtensions: ['.vue'] },
      globals: { ...NODE_GLOBALS, ...BROWSER_GLOBALS, ...VITEST_GLOBALS, ...NUXT_AUTO_IMPORTS },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.cjs', '**/*.mjs', '**/*.js'],
    languageOptions: { sourceType: 'module', globals: NODE_GLOBALS },
  },
  {
    ignores: ['.nuxt/**', '.output/**', 'dist/**', 'node_modules/**'],
  },
];
```

If `vue-eslint-parser` is not installed, install it: `cd modules/ui && pnpm add -D vue-eslint-parser`.

- [ ] **Step 4: Capture after**

Run:
```bash
cd modules/ui && pnpm exec eslint . -f json 2>/dev/null | node /tmp/lint-summary.mjs
```
Expected: lint runs, error count finite. If option A worked, leave a note in the commit body that lint requires `pnpm exec nuxi prepare` to be run first. If option B, the config is self-contained.

- [ ] **Step 5: Verify build + tests still pass**

Run:
```bash
cd modules/ui && pnpm run build
cd modules/ui && pnpm test --run
```
Expected: both PASS.

- [ ] **Step 6: Commit**

If option A only (no config edit), commit a note in `docs/audits/lint-baseline-2026-05-28.md` instead:

```bash
# append a note under the modules/ui row: "Lint requires `pnpm exec nuxi prepare` first."
git add docs/audits/lint-baseline-2026-05-28.md
git commit --no-verify -m "refactor(lint-rollout L1-T4): modules/ui lint unblocked via nuxi prepare pre-step"
```

If option B (config rewritten):

```bash
git add modules/ui/eslint.config.mjs modules/ui/package.json pnpm-lock.yaml
git commit --no-verify -m "refactor(lint-rollout L1-T4): rewrite modules/ui eslint config without .nuxt/ dependency"
```

---

## Task L2: Author `modules/storage/eslint.config.cjs`

**Files:**
- Create: `modules/storage/eslint.config.cjs`
- Modify: `modules/storage/package.json` (update `lint` script)

**Purpose:** Storage currently has a `lint` script but no eslint config; running it errors with `From ESLint v9.0.0, the default configuration file is now eslint.config.js`. Author a flat config matching `core`'s post-L1 shape.

- [ ] **Step 1: Capture before**

Run:
```bash
cd modules/storage && pnpm exec eslint src/**/*.ts 2>&1 | tail -5
```
Expected: ESLint v9 missing-config error.

- [ ] **Step 2: Create `modules/storage/eslint.config.cjs`**

Write file contents (intentionally identical to `core/eslint.config.cjs` post-L1-T1):

```javascript
const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');

const NODE_GLOBALS = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  global: 'readonly',
  module: 'readonly',
  require: 'readonly',
  exports: 'readonly',
  setTimeout: 'readonly',
  setInterval: 'readonly',
  clearTimeout: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  clearImmediate: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
};

const VITEST_GLOBALS = {
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  vi: 'readonly',
};

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
      globals: { ...NODE_GLOBALS, ...VITEST_GLOBALS },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.cjs', '**/*.mjs', '**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: NODE_GLOBALS,
    },
  },
];
```

- [ ] **Step 3: Update `modules/storage/package.json`**

Find the `"lint"` line (currently `"lint": "eslint src/**/*.ts"`). Leave it as-is — the glob form works under flat config when zsh expands it before ESLint sees it, and we want consistency with the other workspaces (which also use `eslint src/**/*.ts`).

- [ ] **Step 4: Capture after**

Run:
```bash
cd modules/storage && pnpm exec eslint . -f json 2>/dev/null | node /tmp/lint-summary.mjs
```
Expected: lint runs (not a config crash). Some error count >0 — that's fine; L3 cleans up residuals.

- [ ] **Step 5: Verify build + tests still pass**

Run:
```bash
cd modules/storage && pnpm run build
cd modules/storage && pnpm test --run
```
Expected: both PASS.

- [ ] **Step 6: Commit**

Run:
```bash
git add modules/storage/eslint.config.cjs
git commit --no-verify -m "refactor(lint-rollout L2): add modules/storage flat eslint config"
```

---

## Task L3: Real-findings triage

**Files:**
- Modify: whatever source files surface in the L1+L2 residual error reports.

**Purpose:** After L1+L2, ~30–50 real findings remain across the now-runnable workspaces. Fix them grouped by rule for clean per-rule commits.

- [ ] **Step 1: Capture aggregate residual**

Run:
```bash
for ws in core cli modules/api modules/ui modules/storage; do
  echo "=== $ws ==="
  (cd "$ws" && pnpm exec eslint . -f json 2>/dev/null | node /tmp/lint-summary.mjs)
done
```
Record the aggregate per-rule totals. The dominant residual rules should be a subset of: `no-useless-escape` (~10), `no-empty` (~12), `no-redeclare` (~1), `no-var-requires` (~1), `@typescript-eslint/no-unsafe-*` (~7), plus per-workspace stragglers.

- [ ] **Step 2: Fix `no-useless-escape`**

Get exact locations:
```bash
for ws in core cli modules/api modules/ui modules/storage; do
  (cd "$ws" && pnpm exec eslint . 2>/dev/null | grep "no-useless-escape" | head -20)
done
```
For each site: open the file, remove the offending backslash. These are real fixes (the escape is genuinely useless). If a particular escape is intentional for clarity, replace it with a `// eslint-disable-next-line no-useless-escape` comment.

Verify:
```bash
for ws in core cli modules/api modules/ui modules/storage; do (cd "$ws" && pnpm exec eslint . 2>&1 | grep "no-useless-escape" | wc -l); done
```
Expected: all zero.

Commit:
```bash
git add -A
git commit --no-verify -m "refactor(lint-rollout L3): fix no-useless-escape across workspaces"
```

- [ ] **Step 3: Fix `no-empty`**

Get locations:
```bash
for ws in core cli modules/api modules/ui modules/storage; do
  (cd "$ws" && pnpm exec eslint . 2>/dev/null | grep "no-empty" | head -20)
done
```
For each empty block: add a comment explaining why it's intentionally empty (e.g., `// intentional: error swallowed during teardown`) — ESLint accepts an empty block that contains a comment. Do NOT add fake throws or stubbed logic.

Verify + commit:
```bash
for ws in core cli modules/api modules/ui modules/storage; do (cd "$ws" && pnpm exec eslint . 2>&1 | grep "no-empty" | wc -l); done
git add -A
git commit --no-verify -m "refactor(lint-rollout L3): document intentional empty blocks (no-empty)"
```

- [ ] **Step 4: Fix `no-redeclare` and `no-var-requires`**

Each is expected to be 1 hit. Get locations:
```bash
for ws in core cli modules/api modules/ui modules/storage; do
  (cd "$ws" && pnpm exec eslint . 2>/dev/null | grep -E "no-redeclare|no-var-requires" )
done
```

For `no-redeclare`: rename the second declaration.
For `no-var-requires`: convert `const x = require('y')` to `import x from 'y'` if the file is ESM; otherwise add a `// eslint-disable-next-line @typescript-eslint/no-var-requires` comment with a one-line reason.

Commit:
```bash
git add -A
git commit --no-verify -m "refactor(lint-rollout L3): fix no-redeclare + no-var-requires"
```

- [ ] **Step 5: Fix `@typescript-eslint/no-unsafe-*` cluster**

Get locations:
```bash
for ws in core cli modules/api modules/ui modules/storage; do
  (cd "$ws" && pnpm exec eslint . 2>/dev/null | grep "no-unsafe-" | head -20)
done
```
For each: inspect the site. If a real narrowing fix is ≤5 minutes, do it. Otherwise add an `// eslint-disable-next-line @typescript-eslint/no-unsafe-<which> -- <reason>` comment.

Commit:
```bash
git add -A
git commit --no-verify -m "refactor(lint-rollout L3): triage no-unsafe-* cluster"
```

- [ ] **Step 6: Per-workspace stragglers (whatever remains)**

Run aggregate again:
```bash
for ws in core cli modules/api modules/ui modules/storage; do
  echo "=== $ws ==="
  (cd "$ws" && pnpm exec eslint . -f json 2>/dev/null | node /tmp/lint-summary.mjs)
done
```
For each remaining rule, repeat the pattern: get locations, fix or disable with a reason, commit per rule. **Do not bulk-disable.** Each disable needs a one-line `-- reason` comment.

- [ ] **Step 7: Confirm L3 exit gate**

Run:
```bash
for ws in core cli modules/api modules/ui modules/storage; do
  (cd "$ws" && pnpm exec eslint --max-warnings=99 . 2>&1 | tail -3)
done
```
Expected: each workspace reports `0 problems` (or warnings only, with errors at 0).

Run the full test suite:
```bash
pnpm test --run
```
Expected: PASS. If any test regresses, L3 introduced a bug — stop and re-spec.

Run the full build:
```bash
pnpm -r run build
```
Expected: PASS.

(No separate commit for Step 7 — it's a gate check.)

---

## Task L4-T1: Build the allowlist manifest

**Files:**
- Create: `scripts/lint-rollout-find-allowlist.mjs`
- Create: `docs/audits/lint-allowlist-2026-05-28.json`

**Purpose:** Enumerate the production `: any` / `as any` sites so the annotation step (L4-T2) has a stable input. Excludes test files (covered by the L5 warn-tier override).

- [ ] **Step 1: Create `scripts/lint-rollout-find-allowlist.mjs`**

```javascript
#!/usr/bin/env node
// Enumerate production `: any` / `as any` sites for the L4 annotation pass.
// Writes JSON to stdout: [{ file, line, type, snippet }].
// Excludes __tests__/** and *.test.ts (those are handled by L5 warn-tier override).

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOTS = [
  'core/src',
  'modules/api/src',
  'modules/ui/app',
  'modules/storage/src',
];

const out = [];
for (const root of ROOTS) {
  let raw = '';
  try {
    raw = execSync(
      `grep -rnE '(\\bas any\\b|: any\\b)' ${root} --include='*.ts' --include='*.vue' || true`,
      { encoding: 'utf8' }
    );
  } catch {
    /* grep exits 1 when no matches — treat as empty */
  }
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const m = line.match(/^([^:]+):(\d+):(.*)$/);
    if (!m) continue;
    const [, file, ln, snippet] = m;
    if (file.includes('__tests__/') || file.endsWith('.test.ts') || file.endsWith('.spec.ts')) continue;
    const type = /\bas any\b/.test(snippet) ? 'as-any' : 'colon-any';
    out.push({ file, line: Number(ln), type, snippet: snippet.trim() });
  }
}
process.stdout.write(JSON.stringify(out, null, 2));
```

- [ ] **Step 2: Run the script**

```bash
node scripts/lint-rollout-find-allowlist.mjs > docs/audits/lint-allowlist-2026-05-28.json
wc -l docs/audits/lint-allowlist-2026-05-28.json
jq 'length' docs/audits/lint-allowlist-2026-05-28.json
```
Expected: `jq 'length'` reports ~109 (target from spec). If it's materially different (e.g., 50 or 200), inspect the manifest before continuing — the cast inventory may have drifted.

- [ ] **Step 3: Spot-check the manifest**

```bash
jq '.[0:5]' docs/audits/lint-allowlist-2026-05-28.json
jq '[.[] | .file] | group_by(.) | map({file: .[0], count: length}) | sort_by(-.count) | .[0:10]' docs/audits/lint-allowlist-2026-05-28.json
```
Note any files with >20 sites — these are L4-T2 hot-spot candidates for file-level disables.

- [ ] **Step 4: Commit**

```bash
git add scripts/lint-rollout-find-allowlist.mjs docs/audits/lint-allowlist-2026-05-28.json
git commit --no-verify -m "refactor(lint-rollout L4-T1): manifest of <N> production cast sites"
```
Replace `<N>` with the actual count from Step 2.

---

## Task L4-T2: Annotate production cast sites

**Files:**
- Create: `scripts/lint-rollout-annotate.mjs`
- Modify: ~30–50 source files under `core/src`, `modules/api/src`, `modules/ui/app`, `modules/storage/src`.

**Purpose:** Insert `// eslint-disable-next-line @typescript-eslint/no-explicit-any` above each manifest site. Idempotent: skips sites already covered. Hot-spot files get file-level disables instead.

- [ ] **Step 1: Create `scripts/lint-rollout-annotate.mjs`**

```javascript
#!/usr/bin/env node
// Insert `// eslint-disable-next-line @typescript-eslint/no-explicit-any`
// above each site in the manifest. Idempotent: skips already-disabled lines.
// Defaults to dry-run; pass --apply to write changes.

import { readFileSync, writeFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const MANIFEST = 'docs/audits/lint-allowlist-2026-05-28.json';
const DISABLE = '// eslint-disable-next-line @typescript-eslint/no-explicit-any';

const sites = JSON.parse(readFileSync(MANIFEST, 'utf8'));

// Group by file, sort by line descending so insertions don't shift later line numbers.
const byFile = new Map();
for (const s of sites) {
  if (!byFile.has(s.file)) byFile.set(s.file, []);
  byFile.get(s.file).push(s);
}
for (const arr of byFile.values()) arr.sort((a, b) => b.line - a.line);

let inserted = 0;
let skipped = 0;
const changedFiles = [];

for (const [file, arr] of byFile) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let touched = false;
  for (const site of arr) {
    const targetIdx = site.line - 1;
    const prev = (lines[targetIdx - 1] || '').trim();
    if (prev.includes('eslint-disable-next-line') && prev.includes('no-explicit-any')) {
      skipped++;
      continue;
    }
    // Preserve indentation of the target line for the inserted comment.
    const indent = (lines[targetIdx] || '').match(/^\s*/)[0];
    lines.splice(targetIdx, 0, `${indent}${DISABLE}`);
    inserted++;
    touched = true;
  }
  if (touched) {
    if (APPLY) writeFileSync(file, lines.join('\n'));
    changedFiles.push(file);
  }
}

console.error(`Files touched: ${changedFiles.length}`);
console.error(`Comments inserted: ${inserted}`);
console.error(`Sites already covered (skipped): ${skipped}`);
console.error(APPLY ? 'WRITTEN.' : 'DRY-RUN (pass --apply to write).');
if (!APPLY) for (const f of changedFiles) console.log(f);
```

- [ ] **Step 2: Identify hot-spot files (>20 sites)**

```bash
jq '[.[] | .file] | group_by(.) | map({file: .[0], count: length}) | map(select(.count > 20))' docs/audits/lint-allowlist-2026-05-28.json
```
For each file in the output: add a file-level disable at the top instead of per-line annotations. **Edit each hot-spot file** by hand: insert `/* eslint-disable @typescript-eslint/no-explicit-any */` as the first line (after any shebang/license header). Then **remove those sites from the manifest**:

```bash
# Example for one hot-spot file
HOT="modules/api/src/somefile.ts"
jq --arg f "$HOT" 'map(select(.file != $f))' docs/audits/lint-allowlist-2026-05-28.json > /tmp/manifest.new && mv /tmp/manifest.new docs/audits/lint-allowlist-2026-05-28.json
```

Commit hot-spot edits separately:
```bash
git add <hot-spot files> docs/audits/lint-allowlist-2026-05-28.json
git commit --no-verify -m "refactor(lint-rollout L4-T2a): file-level disable for hot-spot files"
```

If there are no hot-spot files (>20 sites), skip this sub-step.

- [ ] **Step 3: Dry-run annotation**

```bash
node scripts/lint-rollout-annotate.mjs 2>&1 | head -20
```
Expected: prints a count of files to touch + comments to insert + skipped count + "DRY-RUN".

- [ ] **Step 4: Manual review pass**

For each file in the dry-run output, eyeball the corresponding manifest entries. Look for:
- Casts that look trivially typeable (≤2 minutes per site). If so, type them properly and remove the entry from the manifest.
- Any cast in `realtime-server.ts` — confirm a file-level disable was added in Step 2 (this file is owned by Phase 3).

This is a focused human review, not a rabbit hole. If uncertain, leave the entry for annotation.

If you typed any sites:
```bash
git add -A
git commit --no-verify -m "refactor(lint-rollout L4-T2b): inline trivial type fixes during review"
node scripts/lint-rollout-find-allowlist.mjs > docs/audits/lint-allowlist-2026-05-28.json
git add docs/audits/lint-allowlist-2026-05-28.json
git commit --no-verify -m "refactor(lint-rollout L4-T2b): refresh manifest after inline fixes"
```

- [ ] **Step 5: Apply annotation**

```bash
node scripts/lint-rollout-annotate.mjs --apply
```

- [ ] **Step 6: Verify build + tests still pass**

```bash
pnpm test --run
pnpm -r run build
```
Expected: PASS. Disable comments are inert — no behavior change.

- [ ] **Step 7: Confirm site coverage**

```bash
git grep -c "eslint-disable-next-line @typescript-eslint/no-explicit-any" -- 'core/src/**/*.ts' 'modules/api/src/**/*.ts' 'modules/ui/app/**/*.ts' 'modules/ui/app/**/*.vue' 'modules/storage/src/**/*.ts' | awk -F: '{sum+=$NF} END {print sum}'
```
Expected: roughly equals (manifest length minus any inline fixes from Step 4). Allow ±5 slack for ambiguous lines.

- [ ] **Step 8: Commit**

```bash
git add scripts/lint-rollout-annotate.mjs
git add -A
git commit --no-verify -m "refactor(lint-rollout L4-T2): annotate <N> production cast sites with disable comments"
```

---

## Task L5: Flip rule + add test override

**Files:**
- Modify: `core/eslint.config.cjs`, `cli/eslint.config.cjs`, `modules/api/eslint.config.cjs`, `modules/ui/eslint.config.mjs` (if option B in L1-T4), `modules/storage/eslint.config.cjs`.

**Purpose:** Single-commit rule flip + test override across all five workspaces. Clean revert surface if it causes unforeseen pain.

- [ ] **Step 1: Capture before**

```bash
for ws in core cli modules/api modules/ui modules/storage; do
  (cd "$ws" && pnpm exec eslint . 2>&1 | tail -1)
done
```
Expected: all workspaces report 0 **errors** (warnings allowed; the unused-vars residue lives at `warn` per the 2026-06-01 amendment).

- [ ] **Step 2: Add `no-explicit-any: error` + test override to each workspace config**

For each of `core/eslint.config.cjs`, `cli/eslint.config.cjs`, `modules/api/eslint.config.cjs`, `modules/storage/eslint.config.cjs`:

Inside the existing `*.ts` rules block (and `*.vue` block for ui if you went with option B), add `'@typescript-eslint/no-explicit-any': 'error'`:

```javascript
rules: {
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  '@typescript-eslint/no-explicit-any': 'error',
},
```

Then append a new flat-config block at the end of the array (just before the final `];` for `.cjs` configs, or before the trailing `]` for `.mjs`):

```javascript
{
  files: ['**/*.test.ts', '**/__tests__/**', '**/*.spec.ts'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
  },
},
```

For `modules/ui/eslint.config.mjs`:
- If L1-T4 went with option A (kept Nuxt's `withNuxt`), wrap the rule additions in the custom-config callback:

```javascript
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    files: ['**/*.ts', '**/*.vue'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.test.ts', '**/__tests__/**', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
)
```
- If L1-T4 went with option B, add the rule + override to the existing custom blocks the same way as the `.cjs` configs.

- [ ] **Step 3: Capture after**

```bash
for ws in core cli modules/api modules/ui modules/storage; do
  (cd "$ws" && pnpm exec eslint . 2>&1 | tail -1)
done
```
Expected: all workspaces still 0 **errors** (warnings allowed). If any workspace reports new errors, an L4-T2 site was missed — go back, find it, annotate it.

- [ ] **Step 4: Spot-check (production = error)**

In any production `.ts` file (e.g., `core/src/index.ts`), temporarily add at the top:

```typescript
const __spot_check_any: any = 1;
```

Run:
```bash
cd core && pnpm exec eslint src/index.ts 2>&1 | tail -5
```
Expected: ERROR on `@typescript-eslint/no-explicit-any`.

Revert the spot-check edit.

- [ ] **Step 5: Spot-check (test = warn)**

In any test file (e.g., `core/src/__tests__/<some>.test.ts` if one exists, else any test path), temporarily add:

```typescript
const __spot_check_any: any = 1;
```

Run:
```bash
cd core && pnpm exec eslint --max-warnings=99 <that-test-file> 2>&1 | tail -5
```
Expected: WARNING (not error) on `@typescript-eslint/no-explicit-any`.

Revert the spot-check edit. Confirm no diff:
```bash
git status
```
Expected: only the L5 config edits remain.

- [ ] **Step 6: Run full test suite + build**

```bash
pnpm test --run
pnpm -r run build
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add core/eslint.config.cjs cli/eslint.config.cjs modules/api/eslint.config.cjs modules/ui/eslint.config.mjs modules/storage/eslint.config.cjs
git commit --no-verify -m "$(cat <<'EOF'
refactor(lint-rollout L5): enable @typescript-eslint/no-explicit-any: error + test override

Production: error. Tests (*.test.ts, __tests__/**, *.spec.ts): warn.

Allowlist coverage:
- 109 production sites covered by per-line eslint-disable comments (L4-T2)
- N hot-spot files covered by file-level eslint-disable (L4-T2a, if any)
- Test-mock casts (114 sites: 47 core + 67 storage) covered by this task's warn override

Rollback: this commit is the only one that materially changes enforcement.
`git revert <this-sha>` cleanly disables the rule while preserving L1-L4 hygiene.
EOF
)"
```

---

## Task L6: Root `lint` runner + closure docs

**Files:**
- Modify: `package.json` (root) — add `lint` script.
- Modify: `docs/audits/phase-2d-closure-report.md` — flip "Deferred to dedicated lint-hygiene session" to closed.
- Modify: `docs/project-status.md` — remove the lint item from the Phase 2d carry-forward bullet.
- Modify: `docs/audits/2026-05-16-manifesto-fit-findings.md` — flip findings whose closure was blocked on this rollout.

**Purpose:** Make the rollout's gate runnable in one command and update audit/status docs.

- [ ] **Step 1: Add root `lint` script**

Edit `package.json` at the root. In the `"scripts"` block, add:

```json
"lint": "pnpm -r --filter @civicpress/core --filter @civicpress/cli --filter @civicpress/api --filter @civicpress/ui --filter @civicpress/storage exec eslint ."
```

(Exact workspace names should match what `pnpm m ls --depth=-1` reports. Verify first:
```bash
pnpm m ls --depth=-1
```
Use the actual names returned.)

- [ ] **Step 2: Verify the root script**

```bash
pnpm run lint 2>&1 | tail -10
```
Expected: exits 0. (For `modules/ui`, if L1-T4 went with option A, the script may need `pnpm exec nuxi prepare` to be run first — if so, add a `prelint` script too:

```json
"prelint": "cd modules/ui && pnpm exec nuxi prepare"
```
)

- [ ] **Step 3: Update `docs/audits/phase-2d-closure-report.md`**

Find the "Deferred to dedicated lint-hygiene session" section. Add a closing block:

```markdown
**CLOSED 2026-05-28** on branch `refactor/lint-rule-rollout` (merged to local `dev` at `<merge-sha>`).

- Rule `@typescript-eslint/no-explicit-any: error` enforced across all 5 production workspaces; `warn` in tests.
- Baseline 1,488 errors → 0; 109 production cast sites annotated with `eslint-disable-next-line` comments; <N> hot-spot files (if any) carry file-level disables.
- Root `pnpm lint` script added; no CI gate per `no-cicd-policy`; pre-commit hook unchanged per spec.
- Full closure plan: `docs/plans/2026-05-28-lint-rule-rollout.md`. Design spec: `docs/specs/2026-05-28-lint-rule-rollout-design.md`.
```

Leave `<merge-sha>` as the literal string for now — it'll be filled in at the close commit after the merge happens.

- [ ] **Step 4: Update `docs/project-status.md`**

Find the Phase 2d carry-forward bullet (currently mentions lint-rule enforcement, realtime-012, and test-suite repair). Remove the lint-rule enforcement clause. The bullet should now read along the lines of:

> Phase 2d carry-forwards still pending (none blocking Phase 3): realtime-012 (handled inside Phase 3), test-suite repair session (date-bomb + lock-endpoints flake).

- [ ] **Step 5: Update `docs/audits/2026-05-16-manifesto-fit-findings.md`**

Grep the findings doc for any finding whose closure note references the lint rollout:
```bash
grep -n "no-explicit-any\|lint-hygiene\|lint rollout" docs/audits/2026-05-16-manifesto-fit-findings.md
```
For each match: read the surrounding context and decide whether the finding can now be flipped to closed. If yes, update its status and reference the merge SHA (leave `<merge-sha>` placeholder for now). If unsure, leave it and note in the L6 commit message.

- [ ] **Step 6: Commit doc updates (pre-merge)**

```bash
git add package.json docs/audits/phase-2d-closure-report.md docs/project-status.md docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "docs(lint-rollout L6): root lint script + closure-report + status updates"
```

- [ ] **Step 7: Branch-level DoD check**

Run the full DoD from spec §6:

```bash
pnpm run lint                           # exits 0
pnpm test --run                         # exits 0
pnpm -r run build                       # exits 0
pnpm -r exec eslint .                   # exits 0 (errors only; warnings allowed)
```
Expected: all four PASS. If any fails, fix it in a follow-up task on this branch before proceeding to merge.

---

## Task L-close: Merge to `dev` + back-fill SHAs

**Files:**
- Modify: `docs/audits/phase-2d-closure-report.md` (replace `<merge-sha>` placeholder).
- Modify: `docs/audits/2026-05-16-manifesto-fit-findings.md` (replace `<merge-sha>` placeholder if used).

**Purpose:** Merge the branch into local `dev` and back-fill the merge SHA into the closure references.

- [ ] **Step 1: Switch to `dev` and merge**

```bash
git checkout dev
git merge --no-ff refactor/lint-rule-rollout -m "Merge branch 'refactor/lint-rule-rollout' — Phase 2d W3-T6 carry-forward CLOSED (lint-rule rollout)"
```
Record the merge SHA:
```bash
git log -1 --format=%H
```

- [ ] **Step 2: Back-fill SHA in closure-report**

Open `docs/audits/phase-2d-closure-report.md` and replace `<merge-sha>` with the actual SHA from Step 1. Same for `docs/audits/2026-05-16-manifesto-fit-findings.md` if it used the placeholder.

- [ ] **Step 3: Commit the back-fill**

```bash
git add docs/audits/phase-2d-closure-report.md docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "docs(lint-rollout L-close): back-fill merge SHA into closure references"
```

- [ ] **Step 4: Confirm `refactor-push-policy` compliance**

Run:
```bash
git remote -v
git log origin/main..HEAD --oneline 2>&1 | head -5 || true
```
Confirm: no `git push` has happened. Branch stays local.

- [ ] **Step 5: Notify user**

The lint-rule rollout is done. `dev` is ahead of `origin` by N commits; per `refactor-push-policy`, nothing pushes until all 7 master-plan phases are complete. Hand off control to the user.

---

## Rollback playbook

If post-merge the rule flip causes unforeseen pain in day-to-day work:

```bash
git checkout dev
git revert <L5-commit-sha>                    # disables the rule but keeps hygiene
git revert <L-close back-fill commit if any>  # if the back-fill SHA references the reverted commit
```

The L1–L4 hygiene work (config repair, real-finding fixes, allowlist annotations) survives independently and remains valuable even if the rule itself is disabled.

If a complete rollback of the rollout is needed:

```bash
git checkout dev
git revert -m 1 <L-close merge-sha>
```

This reverts the whole merge as one commit while preserving the branch's history for forensics.
