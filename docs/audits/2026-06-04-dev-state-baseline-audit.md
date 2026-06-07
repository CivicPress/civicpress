# Dev-state baseline audit — 2026-06-04

**Date:** 2026-06-04 (work executed 2026-06-04 / 2026-06-05)
**Branch:** `dev` (HEAD `6863eb7` at audit start)
**Author:** drafted by Claude Opus 4.7, in collaboration with the user
**Trigger:** Phase 3 pre-flight (master plan §5 Phase 3) discovered that the "all suites green except date-bomb" claim in the Phase 2d closure report did not match reality.
**Scope:** dev-state baseline only. NOT a re-audit of the original 205 findings. NOT Phase 3 execution. NOT the Nuxt UI v3→v4 migration (`ui-002`).
**Policy reminders applied:** `[No CI/CD policy]`, `[Refactor --no-verify policy]`, `[Refactor push policy]` (nothing pushed to any origin).

---

## 1. Background

The Phase 2d closure report (`docs/audits/phase-2d-closure-report.md`, 2026-05-24) and the master plan memory both claimed:

> All suites green throughout phase. 357/357 core + 17/17 indexing integration + 216/216 storage + 270/270 api + 138/138 ui. Single failing test in `tests/core/database-integration.test.ts > Session Management` is the pre-existing date-bomb.

> Build status: `pnpm -r build` clean across all 6 workspaces under strict hoist.

On 2026-06-04, Phase 3 pre-flight surfaced material contradictions to those claims:

- `pnpm -C modules/ui build` failed with 8 TypeScript errors.
- `pnpm test` (root vitest) produced 32 failed test files / 78 failed tests out of 1,025.
- The Phase 3 plan's `pnpm -r test:run` invocation didn't even map to working scripts in several workspaces.

Phase 3 execution was paused. This audit is the focused investigation that surfaced what's actually broken, why, and what to do about it.

---

## 2. Method

### 2.1 Per-workspace test runs, with corrected scripts

| Workspace | Invocation | Result |
|---|---|---|
| `core` | `pnpm -C core test` (jest) | **36/36 suites FAIL TO PARSE** — no jest config; babel-jest can't parse TS syntax (`type: 'sqlite' as const`). 0 tests run. EXIT=1. |
| `cli` | `pnpm -C cli test` (jest) | **11/11 suites FAIL TO PARSE** — same root cause: no jest config. First parse error: `let cli: any;` in `cli/src/commands/__tests__/publish.test.ts:30`. EXIT=1. |
| `modules/api` | `pnpm -C modules/api test:run` (vitest) | **"No test files found"** — modules/api has no per-workspace `vitest.config.ts`; vitest inherits the root config's `include` patterns which don't match modules/api/src. EXIT=1. |
| `modules/storage` | `pnpm -C modules/storage test:run` (vitest) | **216/216 PASS** ✓ — only workspace where the per-workspace invocation actually works. EXIT=0. |
| root (node tests) | `pnpm run test:run` (vitest, default config) | **32 files failed / 87 passed / 1 skipped (120 files); 78 failed / 907 passed / 40 skipped (1025 tests).** EXIT=1. |
| root (UI tests) | `pnpm run test:ui:run` (vitest, UI config) | **7 files failed / 13 passed (20 files); 17 failed / 105 passed (122 tests).** EXIT=1. |
| `modules/ui` build | `pnpm -C modules/ui build` (nuxt build → vite TS) | **8 TS errors, EXIT=2.** Bundle transformation completed (1264 modules) but typecheck failed. |

### 2.2 Calibration insight

The Phase 2d closure's per-workspace counts (357/270/216/138) cannot have come from per-workspace invocations. They almost certainly came from the **root vitest run**, which includes `core/src/**/__tests__/**`, `cli/src/**/__tests__/**`, `modules/api/src/**/__tests__/**`, and `modules/ui/app/**/__tests__/**` plus the root `tests/**/*.test.ts` tree. The per-workspace jest / vitest setups in `core`, `cli`, and `modules/api` are misconfigured — they have a `"test"` (or `"test:run"`) script but no config that lets them actually discover or transform tests. This was a pre-existing condition, not a regression — but it makes `pnpm -r test:run` (the Phase 3 plan's pre-flight Step 5 invocation) wrong by construction.

`modules/storage`'s vitest works because the storage tests live at `modules/storage/src/__tests__/` and that workspace happens to have a working setup.

### 2.3 Failure categorization

For each failing test cluster and each TS error, I did:

1. Read the failing assertion + the file under test.
2. `git log --oneline -- <file>` to identify the most recent edits.
3. Where the most recent edit was in the Phase 2d-merge..HEAD window (2026-05-24..2026-06-04), `git show <sha> -- <file>` to confirm the change.
4. For the UI test failures, reproduced each at the test's introduction commit to distinguish "broke recently" from "never worked".

A delegated investigation agent confirmed the UI test failures (clusters in §3.3) reproduce identically at the test's introduction commit — they are pre-existing test-infra issues, not lint-rollout regressions.

---

## 3. Findings

### 3.1 The big one — `simple-git` undeclared at root (67 cli tests fail)

**Where:** `tests/fixtures/test-setup.ts` — three dynamic `import('simple-git')` calls (lines 1439, 1496, 1682).
**Affects:** 67 test failures across `tests/cli/geography.test.ts` (20), `tests/cli/storage.test.ts` (28), `tests/cli/users.test.ts` (19).
**Symptom:** `Cannot find package 'simple-git' imported from '/Users/stakabo/Work/repos/civicpress/civicpress/tests/fixtures/test-setup.ts'`.
**Root cause:** Phase 2d W4-T2 (`881f95d`) flipped `.npmrc` to `shamefully-hoist=false`. Workspaces (cli, core, modules/api) declare simple-git correctly, but `tests/fixtures/` is not in any workspace — it's at the repo root. The root `package.json` did not declare `simple-git`, so the root-level test file can no longer resolve it.
**Why the W4-T2 verification missed it:** the `scripts/audit-package-imports.mjs` script (added in W4-T2) walks each workspace's source tree. It does not scan the root-level `tests/` directory, which has no owning workspace.
**Disposition:** **fix-now**. Add `"simple-git": "^3.36.0"` to root `devDependencies` (matching the version declared by cli/core/modules/api).
**Category:** regression introduced by Phase 2d W4-T2 (`881f95d`), surfaced by Phase 3 pre-flight.

### 3.2 modules/ui build — 8 TypeScript errors

| Site | Error | Root cause | Disposition |
|---|---|---|---|
| `app/components/editor/record-sidebar/RelationsPanel.vue:70` | `'update:linkedRecords'` not assignable to `'geography-selection'` | NOT the embedded comment (that was the initial wrong hypothesis). Actual cause: `EditorRelations.vue` declares `linkedRecords?: Array<...>` (optional) so `Props['linkedRecords']` resolves to `Array<...> \| undefined`. Its `defineEmits<{ 'update:linkedRecords': [records: Props['linkedRecords']] }>` therefore emits a payload that may be `undefined`. The `$event` in RelationsPanel's listener inherits that union; `emit('update:linkedRecords', $event)` fails arg-2 type-match; TS surfaces the failure as "no overload matches" reporting the last overload's error. Pre-existing latent bug; not a lint-rollout regression. | **fix-now** — change `EditorRelations.vue` emit types to `NonNullable<Props[...]>`. Also clean up `geography-selection`'s `any[]` to the precise `LinkedGeographyFile[]` while in the area. |
| `app/components/geography-form/GeographyBasicInfoCard.vue:49` | `(val: GeographyCategory) => void` not assignable to `(value: string) => any` | `USelectMenu`'s `@update:model-value` emits `string`. Handler `onCategoryUpdate` was typed too narrowly. Introduced by `e5f036e refactor(lint-followup-4): convert geography-form cards to defineModel`. | **fix-now** — change handler signature to `(val: string)` and `as GeographyCategory` cast inside. |
| `app/components/UserForm.vue:332` | `$router` does not exist | Template uses `@click="$router.back()"` (Vue 2 Options-API style). Pre-existing pattern, surfaced by removal of `const router = useRouter()` in `1403422 refactor(lint-followup-1.3): strip unused-vars in modules/ui/app/components (50 sites)` — the `useRouter` import was treated as unused (template usage was via `$router`, not the script identifier). | **fix-now** — restore `const router = useRouter()` in the script; change template to `router.back()`. |
| `app/pages/auth/index.vue:6` | `navigateTo` does not exist | Empty `<script setup>` + `navigateTo(...)` in template. The Nuxt auto-import resolves at script-level but is not visible in template's TS instance context. Pre-existing since first commit `7f9a396`; not a regression. | **fix-now** — add `const router = useRouter()` in script; switch to `router.push('/auth/login')`. |
| `app/pages/index.vue:468, 500` | `navigateTo` does not exist (×2) | Same pattern as 3.2.4. Most recent edits in this file: `aa187c2 lint-followup-1.3`, `a81073b lint-rollout L4-T2`. | **fix-now** — `const router = useRouter()` + `router.push(...)`. |
| `app/pages/settings/profile.vue:246, 257` | `navigateTo` does not exist (×2) | Same pattern. Most recent edits: `694b7f9 lint-followup-4`. | **fix-now** — `const router = useRouter()` + `router.push(...)`. |

**Net category for the 8 errors:** mix of lint-rollout-surfaced (2 of 8: GeographyBasicInfoCard via defineModel migration, UserForm via stripped `useRouter()`), and pre-existing latent bugs not caught by Phase 2d's verification (6 of 8: RelationsPanel + EditorRelations type contract, plus 5 `navigateTo` sites that would have failed strict typecheck at any point).

**Implication:** Phase 2d closure's "`pnpm -r build` clean" claim was inaccurate, or the build verification was done with a less-strict vue-tsc setting than the one applied now. Either way, the closure report needs a correction note.

### 3.3 UI tests — 17 failures (5 clusters)

| Cluster | File | Count | Symptom |
|---|---|---:|---|
| A | `tests/ui/components/StatusTransitionControls.test.ts` | 6/6 | `Cannot destructure property 'item' of 'undefined'` at `StatusTransitionControls.vue:211` (UTimeline slot scope undefined). |
| B | `tests/ui/components/RecordSearch.test.ts` | 5/5 | `Cannot call setValue/element on an empty DOMWrapper` — `input[type="search"]` selector finds nothing. |
| C | `tests/ui/components/RecordList.test.ts` | 1/6 | `expected false to be true` — `.ubutton-stub` not found inside empty-state. |
| D | `tests/ui/components/UserForm.test.ts` | 1/8 | `expected 'common.cancelsettings.users.createUser' to match /valid email/i` — i18n key rendered as literal. |
| E | `tests/ui/editor/PreviewPanel.test.ts` | 4/5 | `useMarkdown is not defined` — Nuxt auto-import not mocked in setup. |

**Root cause for A, B, C, D:** confirmed by sub-investigation reproducing each failure **at the test's introduction commit** (`10997e3` for A/B/C, `b58cd27` for D). All four clusters are pre-existing test-infrastructure issues. The most likely catalyst for A and B is the Nuxt UI v3→v4 stub bypass — `global.stubs.UTimeline` / `global.stubs.UInput` in vitest no longer take precedence over Nuxt UI v4's plugin-registered global components (the v3→v4 swap is on this branch as part of the migration target captured in `ui-002`; v4 is partially in use). C is a test-authoring stub-merging bug (the per-mount stub override is shadowed by `tests/ui/setup.ts:51`'s global stub). D is a missing `await wrapper.vm.$nextTick()` between `flushPromises()` and the text assertion.

**Root cause for E:** `useMarkdown` is a composable that lives in `modules/ui/app/composables/`. Vitest's UI setup does not mock it; the auto-import resolves at runtime, not in the happy-dom isolated test environment.

**Disposition (A–E):** **defer-to-own-session** — UI test-infra triage. This sits naturally adjacent to (but is not the same as) the `ui-002` Nuxt UI v3→v4 migration. A dedicated session should:
1. Decide on per-component vs global stub strategy under Nuxt UI v4.
2. Mock or polyfill the affected auto-imports in `tests/ui/setup.ts`.
3. Add `await wrapper.vm.$nextTick()` to UserForm's email-validation test.

These changes are non-trivial and risky to bundle into the present audit. Each cluster's failure mode is well-understood and reproducible; sitting on them does not increase risk.

### 3.4 Other test failures

| File | Failures | Category | Disposition |
|---|---:|---|---|
| `tests/core/notifications/email-channel.test.ts` | 5/8 | **Pre-existing.** Added in Phase 2c (`7b783af`) along with the canonical `EmailChannel` source. The `vi.mock('nodemailer', ...)` factory is not being applied — the spy receives 0 calls; for some cases the test even falls through to a real DNS lookup (`getaddrinfo ENOTFOUND smtp.example.com`). Phase 2d closure's "tests green" was inaccurate here. | **defer-to-own-session** — needs vitest 3.x `vi.mock` + `vi.hoisted` interaction investigation. The EmailChannel source itself is correct (TLS option IS forwarded at `core/src/notifications/channels/email-channel.ts:69`). |
| `tests/core/oauth-provider.test.ts` | 4/7 | **Pre-existing.** Failing tests attempt to validate a real GitHub token (`'Invalid GitHub token'` error). Tests make actual HTTP calls; no mock. Pre-dates the audit. | **document-as-wontfix-with-rationale** in `docs/audits/known-test-issues.md`. Needs a GitHub API mock; will be picked up if/when OAuth provider receives focused work. |
| `tests/core/notification-system.test.ts` | 1/12 | **Pre-existing.** Test instantiates a real `EmailChannel` against `smtp.test.com`; fails on `getaddrinfo ENOTFOUND`. Pre-dates audit. | **document-as-wontfix-with-rationale**. Needs nodemailer mock at this test's setup. |
| `tests/core/database-integration.test.ts > Session Management` | 1 | **Pre-existing date-bomb.** Hardcoded `new Date('2025-12-31')` in the test; today is past. Documented in master plan §9.1. | **defer** — already deferred to dedicated test-suite-repair session per `[Refactor --no-verify policy]`. |

### 3.5 Per-workspace test runner brokenness

Three workspaces have a `"test"` (or `"test:run"`) script that doesn't work:

| Workspace | Script | Failure mode | Root cause |
|---|---|---|---|
| `core` | `"test": "jest"` | 36/36 suites fail to parse | No `jest.config.*` file; no `"jest"` key in `core/package.json`. Babel-jest has no `@babel/preset-typescript` config. |
| `cli` | `"test": "jest"` | 11/11 suites fail to parse | Same root cause as core. |
| `modules/api` | `"test:run": "vitest run"` | "No test files found" | No `modules/api/vitest.config.*` file. Vitest inherits the root config's `include` pattern (`tests/**/*.test.ts`, ...), which doesn't match `modules/api/src/**/__tests__/**`. |

The Phase 2d closure's per-workspace counts (357 core, 270 api, 138 ui) must have come from **root vitest** picking up these workspaces' colocated test files via the include patterns. They do NOT come from per-workspace invocations.

**Disposition:** **document-as-wontfix-with-rationale** in `docs/audits/known-test-issues.md` AND fix the Phase 3 plan's pre-flight to use only invocations that actually work (root vitest + `modules/storage test:run` + `modules/ui build`).

Fixing the workspace-level test runners properly is a one-day chore: adding a jest config to core + cli that uses `@swc/jest` or `ts-jest`, plus a `modules/api/vitest.config.ts` with the right include. Not in scope for this audit.

### 3.6 Stale `modules/broadcast-box/` build artifact

Side observation: `modules/broadcast-box/` exists with `dist/`, `tsconfig.tsbuildinfo`, and `node_modules/` — but no `src/`. It's not in `pnpm-workspace.yaml`. Per the audit, broadcast-box source was deleted; this is left-over compiled output. Not blocking. Disposition: cleanup belongs to Phase 5 (broadcast-box reintroduction) when the directory will be re-used.

---

## 4. Categorized table (full inventory)

| # | File | Failure | Category | First SHA | Disposition |
|---|---|---|---|---|---|
| 1 | `tests/cli/geography.test.ts` (20) + `storage.test.ts` (28) + `users.test.ts` (19) | `Cannot find package 'simple-git'` | regression | Phase 2d W4-T2 `881f95d` | **fix-now** (root devDeps) |
| 2 | `modules/ui/app/components/editor/record-sidebar/RelationsPanel.vue:70` + `EditorRelations.vue:28-31` | emit type mismatch (optional Prop union with undefined) | pre-existing latent | older | **fix-now** (`NonNullable<>` in EditorRelations emit + precise `LinkedGeographyFile[]` in RelationsPanel) |
| 3 | `modules/ui/app/components/geography-form/GeographyBasicInfoCard.vue:49` | handler arg type | regression | lint-followup-4 `e5f036e` | **fix-now** (widen handler arg) |
| 4 | `modules/ui/app/components/UserForm.vue:332` | `$router` doesn't exist | regression (template style was pre-existing; the script-level `useRouter()` covering it was stripped) | lint-followup-1.3 `1403422` | **fix-now** (`const router = useRouter()` + `router.back()`) |
| 5 | `modules/ui/app/pages/auth/index.vue:6` | `navigateTo` doesn't exist | pre-existing | first commit `7f9a396` | **fix-now** (router.push) |
| 6 | `modules/ui/app/pages/index.vue:468, 500` | `navigateTo` doesn't exist | pre-existing | older | **fix-now** (router.push) |
| 7 | `modules/ui/app/pages/settings/profile.vue:246, 257` | `navigateTo` doesn't exist | pre-existing | older | **fix-now** (router.push) |
| 8 | `tests/ui/components/StatusTransitionControls.test.ts` (6) | Slot scope undefined under Nuxt UI v4 stub bypass | pre-existing (reproduces at `10997e3`) | introduction `10997e3` | **defer-to-own-session** (UI test-infra triage, adjacent to `ui-002`) |
| 9 | `tests/ui/components/RecordSearch.test.ts` (5) | Empty DOMWrapper — same root cause as #8 | pre-existing (reproduces at `10997e3`) | introduction `10997e3` | **defer-to-own-session** |
| 10 | `tests/ui/components/RecordList.test.ts` (1) | Per-mount stub override shadowed by global stub | pre-existing (reproduces at `10997e3`) | introduction `10997e3` | **defer-to-own-session** |
| 11 | `tests/ui/components/UserForm.test.ts` (1) | Missing nextTick await between flush + text assertion | pre-existing (reproduces at `b58cd27`) | introduction `b58cd27` | **defer-to-own-session** |
| 12 | `tests/ui/editor/PreviewPanel.test.ts` (4) | `useMarkdown` auto-import not mocked | pre-existing | older | **document-as-wontfix-with-rationale** |
| 13 | `tests/core/notifications/email-channel.test.ts` (5) | `vi.mock` factory not intercepting nodemailer | pre-existing | introduction `7b783af` (Phase 2c) | **defer-to-own-session** (vitest mock investigation) |
| 14 | `tests/core/oauth-provider.test.ts` (4) | Real GitHub API call returns "Invalid token" | pre-existing | older | **document-as-wontfix-with-rationale** |
| 15 | `tests/core/notification-system.test.ts` (1) | Real DNS lookup `smtp.test.com` fails | pre-existing | older | **document-as-wontfix-with-rationale** |
| 16 | `tests/core/database-integration.test.ts > Session Management` (1) | Hardcoded date-bomb past | pre-existing | older | **defer** (master plan §9.1 — dedicated test-repair session) |
| 17 | `pnpm -C core test` | 36/36 suites fail to parse | pre-existing | older | **document-as-wontfix-with-rationale** (no jest config; tests run via root vitest) |
| 18 | `pnpm -C cli test` | 11/11 suites fail to parse | pre-existing | older | **document-as-wontfix-with-rationale** (no jest config; tests run via root vitest) |
| 19 | `pnpm -C modules/api test:run` | No test files match include | pre-existing | older | **document-as-wontfix-with-rationale** (no per-workspace vitest config; tests run via root vitest) |

---

## 5. Action list per disposition

### 5.1 Fix-now (commits land in this audit session)

| # | Action | File(s) | Closes |
|---|---|---|---:|
| F1 | Add `"simple-git": "^3.36.0"` to root `devDependencies` | `package.json` | 67 tests |
| F2 | Tighten `EditorRelations`'s emit types to `NonNullable<Props[...]>`; replace RelationsPanel's `any[]` geography-selection payload with `LinkedGeographyFile[]` | `modules/ui/app/components/editor/EditorRelations.vue`, `modules/ui/app/components/editor/record-sidebar/RelationsPanel.vue` | 1 TS error |
| F3 | Widen `onCategoryUpdate` arg to `string` with `as GeographyCategory` cast | `modules/ui/app/components/geography-form/GeographyBasicInfoCard.vue` | 1 TS error |
| F4 | Add `const router = useRouter()` in script; switch template `$router.back()` → `router.back()` | `modules/ui/app/components/UserForm.vue` | 1 TS error |
| F5 | Add `const router = useRouter()`; switch template `navigateTo(...)` → `router.push(...)` | `modules/ui/app/pages/auth/index.vue`, `pages/index.vue`, `pages/settings/profile.vue` | 5 TS errors |

Five commits planned. After: 78 → 11 node-vitest failures; 8 → 0 TS errors. UI test failures unchanged at 17 (deferred).

### 5.2 Document-as-wontfix-with-rationale (lands in `docs/audits/known-test-issues.md`)

| # | Item |
|---|---|
| W1 | `pnpm -C core test` (jest) broken — no jest config; tests run via root vitest |
| W2 | `pnpm -C cli test` (jest) broken — same root cause |
| W3 | `pnpm -C modules/api test:run` finds no files — no per-workspace vitest config; tests run via root vitest |
| W4 | `tests/core/oauth-provider.test.ts` 4 failures — real GitHub API; needs mock |
| W5 | `tests/core/notification-system.test.ts > should register and use email channel` — real SMTP; needs mock |
| W6 | `tests/ui/editor/PreviewPanel.test.ts` 4 failures — `useMarkdown` auto-import not mocked |

### 5.3 Defer-to-own-session

| # | Item | Suggested dedicated session |
|---|---|---|
| D1 | EmailChannel `vi.mock` not intercepting (5 tests) | Combined with W4 above into one vitest-mock-strategy session |
| D2 | UI test-infra triage — clusters A, B, C, D (13 tests) | Adjacent to `ui-002` Nuxt UI v3→v4 migration; can run in parallel as a "test stubs" sub-session |
| D3 | `database-integration > Session Management` date-bomb | Already deferred per master plan §9.1 (test-suite-repair session) |
| D4 | Workspace test-runner setup (W1, W2, W3) | One-day chore: add jest config to core + cli; add modules/api vitest config. Not blocking Phase 3 entry. |

---

## 6. After-state baseline (honest)

Once F1–F5 land, the dev branch test/build state is:

| Surface | Before | After fix-now | Comment |
|---|---:|---:|---|
| `pnpm -C modules/storage test:run` | 216/216 ✓ | 216/216 ✓ | Untouched. |
| `pnpm run test:run` (root vitest, node) | 78 failed | 11 failed (5 EmailChannel + 4 oauth + 1 notif + 1 date-bomb) | All 11 documented in known-test-issues.md. |
| `pnpm run test:ui:run` (root vitest, UI) | 17 failed | 17 failed | Deferred — UI test-infra session. |
| `pnpm -C modules/ui build` | 8 TS errors | 0 errors ✓ | Clean. |
| `pnpm -C core test` | broken | broken | Documented W1. |
| `pnpm -C cli test` | broken | broken | Documented W2. |
| `pnpm -C modules/api test:run` | broken | broken | Documented W3. |

That is the honest baseline Phase 3 starts from. Phase 3's exit criteria need to be evaluated against this baseline, not the inaccurate "all green" framing from the Phase 2d closure.

---

## 7. What changes outside this audit doc

1. `package.json` — `simple-git` added to root devDeps. (F1)
2. Seven modules/ui Vue files — minimal TS fixes. (F2–F5):
   - `app/components/editor/EditorRelations.vue` (F2)
   - `app/components/editor/record-sidebar/RelationsPanel.vue` (F2)
   - `app/components/geography-form/GeographyBasicInfoCard.vue` (F3)
   - `app/components/UserForm.vue` (F4)
   - `app/pages/auth/index.vue` (F5)
   - `app/pages/index.vue` (F5)
   - `app/pages/settings/profile.vue` (F5)
3. `docs/audits/known-test-issues.md` — new file (W1–W6).
4. `docs/plans/2026-06-04-base-refactor-phase-3-realtime.md` — Pre-flight Step 5 rewritten per-workspace; "all green except date-bomb" claim removed.
5. Memory: `[Refactor 2026-05 master plan]` corrected; new `dev-state-baseline-2026-06-04.md` memory; `[Phase 3 paused pending dev audit]` updated with closure pointer.

Nothing pushed to any origin per `[Refactor push policy]`. Phase 3 worktree branch `refactor/phase-3-realtime` remains preserved at `6863eb7` and will be re-created off the new dev HEAD before Phase 3 resumes.

---

## 8. History

- 2026-06-04 16:00 — Phase 3 pre-flight discovered the noisy baseline. Phase 3 execution paused.
- 2026-06-04 16:10 → 2026-06-05 — this audit: enumerate every failure, identify each as pre-existing or regression with commit SHA, decide disposition.
- F1–F5 land as separate commits cited in §5.1.

---

## 9. Correction (2026-06-06) — two baseline claims revised

A second Phase 3 pre-flight — this time exercising a **fresh `git worktree`**, not
the main checkout — surfaced two inaccuracies in the §6 "honest baseline" above.
Both are pre-existing at dev HEAD; neither is a Phase 3 regression. The worktree
was the first clean checkout to exercise the *committed* tree, which is why these
escaped the 2026-06-04 pass (run in the main checkout, whose working tree masked
both).

### 9.1 `pnpm -r build` did NOT build from a clean checkout (now fixed)

§1 and §6 record `pnpm -r build` as clean. That held only because
`modules/api/src/types/express-augment.d.ts` — the hand-written `Express.Request`
global augmentation (`req.user`, `req.requestId`, …) authored in `fe31a0b` — sat
in the main checkout's working tree. The file is matched by `.gitignore:28
*.d.ts` and was **never committed**. A fresh worktree therefore lacks it, and
`modules/api` fails to build with 16 `TS2339 Property 'user'/'requestId' does not
exist on type 'Request'` errors in `src/utils/api-logger.ts`.

Same class as F1 (`simple-git` missing from devDeps): the repo could not build
from a clean clone. Fixed 2026-06-06 by adding a `.gitignore` negation
(`!modules/api/src/types/express-augment.d.ts`) and tracking the file. See
known-test-issues.md `B1`.

### 9.2 UI-vitest baseline (§3.3 / §6 "17 failed") has drifted (still deferred)

§3.3 and §6 record `pnpm run test:ui:run` as **17 failed / 105 passed (122
tests); 7 files failed**. As of 2026-06-06, at the same dev HEAD, current reality
— reproduced identically in the main checkout AND a fresh worktree — is **2 files
failed / 18 passed; 122 tests passed, 0 test-failures**. The two failing files
are `tests/ui/components/RecordForm.test.ts` and
`tests/ui/editor/EditorHeader.test.ts`, both on `Failed to resolve import
"vue-i18n"` from `modules/ui/app/composables/useTypedI18n.ts` (a vite transform
error, not an assertion). The W6 + D2 failures documented above (PreviewPanel,
StatusTransitionControls, RecordSearch, RecordList, UserForm) are among the 18
passing files now — they do **not** currently reproduce.

The shift is environmental (same SHA; node_modules / `.nuxt` resolution), not a
source change, and is not root-caused here. It belongs to the already-deferred UI
test-infra triage session. The new failing pair is tracked in
known-test-issues.md `D3`.

### 9.3 Net Phase 3 regression baseline (2026-06-06)

Phase 3 is evaluated against this, not the §6 framing:

| Surface | Baseline | 
|---|---|
| `pnpm -r build` / `pnpm -C modules/ui build` | clean (with `express-augment.d.ts` now tracked) |
| `pnpm -C modules/storage test:run` | 216/216 |
| `pnpm run test:run` (root vitest, node) | 11 failed / 1025 (5 EmailChannel + 4 oauth + 1 DNS + 1 date-bomb) |
| `pnpm run test:ui:run` (root vitest, UI) | 2 files transform-fail (RecordForm, EditorHeader) / 122 pass, 0 test-fails |
