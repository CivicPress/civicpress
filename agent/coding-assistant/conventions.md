# Coding Conventions · CivicPress Coding Assistant

This document defines the coding standards that **must** be followed by both
humans and the AI coding assistant.

---

## 🖥️ Framework & Language

- **Nuxt 4 + TypeScript** for all Web app code.
- **Nuxt UI Pro + Tailwind CSS** for UI
- **Vitest** for all tests.
- **ESLint + Prettier** enforce formatting and linting.
- **YAML + Markdown** are the default formats for civic records (no proprietary
  formats).

---

## 📂 File & Folder Structure

- All **Nuxt pages** must declare: `definePageMeta({ layout: 'default' })`.
- **Components**: `modules/<module>/components/<PascalCaseName>.vue`.
- **Composables**: `modules/<module>/composables/use<Name>.ts`.
- **CLI commands**: `tools/cli/commands/<kebab-case>.ts`.
- **Tests**: `modules/<module>/tests/<kebab-case>.spec.ts`.
- **Docs**: `modules/<module>/docs/<kebab-case>.md`.

---

## ✍️ Naming Rules

- **kebab-case** for files and folders.
- **PascalCase** for Vue components.
- **camelCase** for variables and functions.
- Prefix composables with `use...` (e.g., `useMinutes`).
- Keep names short, clear, and civic-friendly.

---

## 📜 Commits

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation only
- `test:` for adding or refactoring tests
- `chore:` for tooling or misc

---

## 🌍 Internationalization

- To be implemeted in the future.
- No hard-coded strings in Vue files.
- All text must be wrapped in i18n functions or loaded from locale files.

---

## ♿ Accessibility

- Use `aria-` attributes where appropriate.
- Provide keyboard navigation and visible focus styles.
- Ensure WCAG AA color contrast.

---

## 🧪 Testing

- At least **1 happy-path** and **1 edge-case** per feature.
- Use Vitest’s `describe`, `it`, and `expect` consistently; apply
  `TEST_CONFIG.DEFAULT_TIMEOUT` to async tests.
- Prefer unit tests; use integration tests only when necessary (CLI/API
  spin-up).
- Always bootstrap with shared fixtures from `tests/fixtures/test-setup.ts`:
  - Call `beforeAll(setupGlobalTestEnvironment)` once per top-level `describe`.
  - Use helpers instead of ad‑hoc setup:
    - `createTestDirectory`/`cleanupTestDirectory` for isolated FS work.
    - `createAPITestContext`/`cleanupAPITestContext` to launch API with a random
      port via `getRandomPort()` and to release it.
    - `createCLITestContext`/`cleanupCLITestContext` for CLI tests; prefer
      `--json` output and parse the final JSON object.
  - Use provided fixtures: `createCivicConfig`, `createWorkflowConfig`,
    `createRolesConfig` (new metadata format), and `createSampleRecords`.
- For CLI tests:
  - Always pass `--json` and `--silent` when possible; parse JSON robustly (last
    JSON object in output).
  - Avoid interactive flows; simulate auth via commands/helpers.
- For API tests:
  - Instantiate `CivicPressAPI` within the test using the dynamic port; never
    assume a dev server is running.
  - Always call `api.shutdown()` and `releasePort(port)` in cleanup.
- For Core tests:
  - Prefer importing source modules used by tests; keep imports consistent
    across files and avoid mixing `src`/`dist` in the same suite.
- Assertions:
  - Avoid brittle snapshots; assert on explicit fields and invariants.
  - Include negative assertions for permission/validation failures where
    relevant.
- Determinism:
  - Do not depend on system state or network; keep tests hermetic and
    file‑system isolated.
- The AI assistant must:
  - Propose and add tests for every new feature or fix.
  - Use the shared fixtures/utilities above and follow these rules without being
    asked.
  - Refuse to introduce tests that bypass cleanup or parse non‑JSON CLI output
    when `--json` is available.

---

## 📖 Documentation

- Every feature or command must include a **doc stub** (`.md`) in the correct
  folder.
- Doc stub must explain: **purpose, usage, inputs, outputs**.
- Docs must be clear, short, and civic-friendly.

---

## ✅ Enforcement

These rules are enforced by:

- Prettier and ESLint configs.
- Pre-commit hooks (Husky).
- GitHub Actions CI.
- Registry checks (no duplicate commands or endpoints).
- AI assistant system prompts.

The assistant must **refuse** to generate code that violates these conventions.
