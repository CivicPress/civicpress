# Known test issues

**Started:** 2026-06-04 (with the dev-state baseline audit — see `2026-06-04-dev-state-baseline-audit.md`).
**Purpose:** central registry of failing or non-functional tests / test runners that are knowingly deferred. Each entry has a reproduction recipe, a root cause, and a deferral rationale. New entries land with a date and a SHA pointer.

This file is not a TODO. It is an honest map of what doesn't work so future sessions can address each item with full context. Items here are explicitly **out of scope** for whatever session encounters them unless that session is the dedicated one named in the "Deferred to" column.

---

## Per-workspace test runners that don't actually run

### W1 — `pnpm -C core test` (jest) is broken

**Status:** pre-existing; no jest config has ever shipped in `core/`.

**Reproduction:**
```bash
pnpm -C core test
```

**Result:** `Test Suites: 36 failed, 36 total / Tests: 0 total`. Every suite fails at the babel-parse step on `type: 'sqlite' as const` and similar TypeScript syntax.

**Root cause:** `core/package.json` declares `"test": "jest"` but there is no `jest.config.*` file and no `"jest"` key in `package.json`. Jest defaults to babel-jest, which (without `@babel/preset-typescript` or `ts-jest`) cannot parse TypeScript.

**Why it doesn't matter for current correctness:** the `tests/` at the repo root + the colocated `core/src/**/__tests__/**/*.test.ts` files are picked up by the root vitest run (`pnpm run test:run`), which has the right environment + transformer set up. So the actual test coverage exists; it just doesn't flow through `pnpm -C core test`.

**Implication for callers:** any plan that says `pnpm -r test:run` or `pnpm -C core test` will fail in a way unrelated to what it's testing. Use the root vitest invocation instead.

**Deferred to:** workspace-test-runner-setup session (see `D4` in the 2026-06-04 audit). One-day chore.

### W2 — `pnpm -C cli test` (jest) is broken

**Status:** pre-existing; same root cause as W1.

**Reproduction:**
```bash
pnpm -C cli test
```

**Result:** `Test Suites: 11 failed, 11 total / Tests: 0 total`. First failure: `cli/src/commands/__tests__/publish.test.ts:30` — `Missing semicolon (30:9)` at `let cli: any;`.

**Root cause + implication + deferral:** identical to W1. Tests run via root vitest.

### W3 — `pnpm -C modules/api test:run` finds no test files

**Status:** pre-existing; no per-workspace vitest config in `modules/api`.

**Reproduction:**
```bash
pnpm -C modules/api test:run
```

**Result:** `No test files found, exiting with code 1`. Vitest reports the include pattern inherited from the root config: `tests/**/*.test.ts, tests/**/*.spec.ts, core/src/**/__tests__/**/*.test.ts, ...` — none of which match `modules/api/src/**/__tests__/**`.

**Root cause:** there is no `modules/api/vitest.config.{ts,mjs,js}` file. Vitest searches upward, lands on the root `vitest.config.mjs`, and applies its include patterns. The root patterns DO cover `modules/api/src/**/__tests__/**/*.test.ts` (line 47 of `vitest.config.mjs`), but only when vitest is invoked from the **root** (so `process.cwd()` matches the workspace root). From `modules/api`'s cwd, the paths don't resolve.

**Why it doesn't matter for current correctness:** root vitest does cover modules/api tests. The Phase 2d closure report's "270/270 api" number came from there.

**Deferred to:** workspace-test-runner-setup session.

---

## Pre-existing test failures (root vitest, node env)

### W4 — `tests/core/oauth-provider.test.ts` (4/7 failing)

**Status:** pre-existing; the test was never independent of a live GitHub API.

**Reproduction:**
```bash
pnpm vitest run tests/core/oauth-provider.test.ts
```

**Failing cases:**
- `GitHubOAuthProvider > should validate GitHub token and return user info`
- `GitHubOAuthProvider > should handle missing email gracefully`
- `OAuthProviderManager > should validate tokens through registered providers`
- `OAuthProviderManager > should get user info through registered providers`

All fail with `Invalid GitHub token`. The test constructs a `GitHubOAuthProvider` with a fake token and calls `validateToken(...)` against the real `https://api.github.com/user` endpoint.

**Root cause:** no mock of the HTTP layer. The test was written against a real (working) GitHub token during development and committed without the mock.

**Fix outline (for the future session):** mock `fetch` / `undici` at the test level, return a synthetic GitHub user response, assert the parsed shape. Same pattern can cover `notification-system > should register and use email channel` (W5).

**Deferred to:** vitest-mock-strategy session (combined with W5 + D1 below).

### W5 — `tests/core/notification-system.test.ts > should register and use email channel` (1/12 failing)

**Status:** pre-existing; the test attempts a real SMTP connection to `smtp.test.com`.

**Reproduction:**
```bash
pnpm vitest run tests/core/notification-system.test.ts -t "should register and use email channel"
```

**Failure:** `expected false to be true` — the `success` field of the notification result is `false` because nodemailer logs `Error: getaddrinfo ENOTFOUND smtp.test.com`.

**Root cause:** the test uses a real `EmailChannel` against a non-resolvable hostname. Whatever passed at Phase 2c either had different DNS behavior or relied on a local hosts override that no longer applies.

**Fix outline:** mock `nodemailer.createTransport` (via `vi.mock`), provide a fake transporter, assert the notification service's contract on its own terms.

**Deferred to:** vitest-mock-strategy session.

---

## Pre-existing test failures (root vitest, UI env)

### W6 — `tests/ui/editor/PreviewPanel.test.ts` (4/5 failing)

**Status:** pre-existing.

**Reproduction:**
```bash
pnpm run test:ui:run -- tests/ui/editor/PreviewPanel.test.ts
```

**Failing cases:** every test that mounts `PreviewPanel.vue` fails with `useMarkdown is not defined`.

**Root cause:** `useMarkdown` is a composable used by `PreviewPanel.vue`. In Nuxt's runtime it's an auto-import; in vitest's happy-dom env (`vitest.config.ui.mjs`), the auto-import is not set up. `tests/ui/setup.ts` does not stub or mock `useMarkdown`. Other composables ARE stubbed there (look at `tests/ui/setup.ts` for the pattern).

**Fix outline:** in `tests/ui/setup.ts`, add a global stub for `useMarkdown` that returns a minimal compatible API surface (e.g., `{ renderMarkdown: (s) => s }`). One-line fix.

**Deferred to:** UI test-infra triage session (the same session that addresses D2 below).

---

## Pre-existing UI test infrastructure issues (Nuxt UI v4 stub bypass + test bugs)

### D2 — UI component test failures (13 tests across 4 files)

**Status:** pre-existing; reproduced at each test's introduction commit. Not a recent regression.

**Affected files:**
- `tests/ui/components/StatusTransitionControls.test.ts` — 6/6 fail
- `tests/ui/components/RecordSearch.test.ts` — 5/5 fail
- `tests/ui/components/RecordList.test.ts` — 1/6 fail
- `tests/ui/components/UserForm.test.ts` — 1/8 fail

**Reproduction:**
```bash
pnpm run test:ui:run -- tests/ui/components/StatusTransitionControls.test.ts tests/ui/components/RecordSearch.test.ts tests/ui/components/RecordList.test.ts tests/ui/components/UserForm.test.ts
```

**Root causes (per cluster):**

- **StatusTransitionControls + RecordSearch (11/13):** the test's `global.stubs.UTimeline` / `global.stubs.UInput` no longer override the actual Nuxt UI component. With Nuxt UI v4, global components are registered via a plugin that isn't booted in happy-dom; the stub is silently bypassed. The real component renders, and either gives a `Cannot destructure property 'item' of 'undefined'` (when a scoped slot invokes the default slot fn with no scope) or fails the `find('input[type="search"]')` lookup because the v4 component doesn't render the same selector.

- **RecordList (1/13):** the test sets `mountOptions.global.stubs.UButton` to a real template — but the test passes `...mountOptions.global` to a deeper mount, which keeps `config.global.stubs.UButton: true` from `tests/ui/setup.ts:51` at higher priority. The per-mount override is silently shadowed.

- **UserForm (1/13):** the test sets `vm.form.email = 'not-an-email'` then asserts both `vm.formErrors.email` (passes) AND `wrapper.text()` contains "valid email" (fails). The rendered text is a stale render — needs `await wrapper.vm.$nextTick()` between `flushPromises()` and the text assertion.

**Why deferred:** the fix is straightforward per cluster (use `mount({ global: { components: ... } })` to override at the mount level; add the missing nextTick), but the underlying Nuxt-UI-v4-stub-strategy decision is intertwined with the `ui-002` v3→v4 migration. Doing it piecemeal without that decision risks rework.

**Deferred to:** UI test-infra triage session, adjacent to `ui-002`.

### D1 — EmailChannel canonical test `vi.mock` not intercepting (5 tests)

**Status:** pre-existing; never worked since the test was added in Phase 2c (`7b783af` 2026-05-18).

**Reproduction:**
```bash
pnpm vitest run tests/core/notifications/email-channel.test.ts
```

**Failing cases (5/8):**
- `uses SMTP transport when options.smtp is provided`
- `uses SendGrid transport when options.sendgrid is provided`
- `sends with default from when message.from is omitted`
- `passes tls option through to nodemailer.createTransport when provided`
- `joins array of recipients into comma-separated string`

For the create-transport-check cases (3 of 5), the spy reports `Number of calls: 0` — the mocked `createTransport` was never called, so the real nodemailer was used. For the send-mail-check cases (2 of 5), the real nodemailer attempts DNS lookup against `smtp.example.com` and fails with `getaddrinfo ENOTFOUND`.

**Why the mock isn't being applied:** the test uses `vi.hoisted` + `vi.mock('nodemailer', factory)` — the supported pattern for sharing refs between hoisted mock factories and assertions. The pattern is structurally correct. But the assertion failures prove the mock isn't intercepting nodemailer's import inside `core/src/notifications/channels/email-channel.ts`. Possibilities (un-verified):
- Vitest 3.2.4 + nodemailer's specific module shape (CJS interop) interaction.
- The test imports EmailChannel via a relative path to a `.ts` source while the workspace alias maps `@civicpress/core` to `core/dist`. The mock might be path-sensitive in some edge case.
- A Vitest bug specific to `vi.hoisted` + factories with closures (unverified).

The EmailChannel **source code** is correct: `core/src/notifications/channels/email-channel.ts:69` explicitly forwards `tls`. The test failure is about the test setup, not the implementation.

**Phase 2d closure inaccuracy:** the closure report claimed all tests green. This test was already broken at that time. The closure verification did not run this test or interpreted its result incorrectly.

**Fix outline (for the future session):**
1. Try replacing `vi.hoisted` + closure-based factory with `vi.fn()` directly inside `vi.mock`'s factory.
2. If that fails, import EmailChannel via the `@civicpress/core` workspace alias instead of the relative `.ts` path.
3. As a last resort, refactor `EmailChannel` to take a `createTransport` dep via constructor injection — eliminates the need to mock the module at all.

**Deferred to:** vitest-mock-strategy session (combined with W4 + W5).

---

## Already-deferred elsewhere

### Date-bomb — `tests/core/database-integration.test.ts > Session Management`

**Status:** pre-existing; documented in master plan §9.1 since the original signoff (2026-05-17). Hardcoded `new Date('2025-12-31')`; today is past.

**Deferred to:** dedicated test-suite-repair session per master plan §9.1. `--no-verify` continues to be the approved override.

---

## How to add a new entry

When a test starts failing OR a test runner is found broken that fits the "deferred" disposition:

1. Pick the next ID (W7, D3, ...).
2. Write a section with: status, reproduction (the exact command), failing cases, root cause, fix outline, deferred-to session name.
3. Link the SHA where the failure was introduced (if known) or where it was first noticed (if pre-existing).
4. If the entry is later resolved, replace the body with "Resolved in `<sha>`" and keep the heading for audit-trail.

Do NOT delete entries. Resolution leaves a marker.
