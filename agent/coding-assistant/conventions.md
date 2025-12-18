# Coding Conventions · CivicPress Coding Assistant

This document defines the coding standards that **must** be followed by both
humans and the AI coding assistant.

---

## Framework & Language

- **Nuxt 4 + TypeScript** for all Web app code.
- **Nuxt UI Pro + Tailwind CSS** for UI
- **Vitest** for all tests.
- **ESLint + Prettier** enforce formatting and linting.
- **YAML + Markdown** are the default formats for civic records (no proprietary
  formats).

---

## File & Folder Structure

- All **Nuxt pages** must declare: `definePageMeta({ layout: 'default' })`.
- **Components**: `modules/<module>/components/<PascalCaseName>.vue`.
- **Composables**: `modules/<module>/composables/use<Name>.ts`.
- **CLI commands**: `tools/cli/commands/<kebab-case>.ts`.
- **Tests**: Use two patterns based on test type:
  - **Unit tests**: Co-locate with source using `__tests__` folders (e.g.,
    `core/src/diagnostics/__tests__/system-checker.test.ts`)
  - **Integration/E2E tests**: Place in root `tests/` directory (e.g.,
    `tests/api/records.test.ts`, `tests/cli/export.test.ts`)
- **Docs**: `modules/<module>/docs/<kebab-case>.md`.

---

## Naming Rules

- **kebab-case** for files and folders.
- **PascalCase** for Vue components.
- **camelCase** for variables and functions.
- Prefix composables with `use...` (e.g., `useMinutes`).
- Keep names short, clear, and civic-friendly.

---

## Commits

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation only
- `test:` for adding or refactoring tests
- `chore:` for tooling or misc

---

## Internationalization

- To be implemented in the future.
- No hard-coded strings in Vue files.
- All text must be wrapped in i18n functions or loaded from locale files.

---

## Accessibility

- Use `aria-` attributes where appropriate.
- Provide keyboard navigation and visible focus styles.
- Ensure WCAG AA color contrast.

---

## Output & Logging

- **⚠️ CRITICAL**: Never use `console.log()`, `console.error()`,
  `console.warn()`, or direct console output in CivicPress code.
- **Always use centralized output functions** from the appropriate module:
- **CLI Commands**: Use `cliSuccess()`, `cliError()`, `cliInfo()`, `cliWarn()`,
  `cliDebug()`, `cliTable()`, `cliStartOperation()` from
  `cli/src/utils/cli-output.ts`
- **Core Library**: Use `coreSuccess()`, `coreError()`, `coreInfo()`,
  `coreWarn()`, `coreDebug()`, `coreStartOperation()` from
  `core/src/utils/core-output.ts`
- **API Routes**: Use `sendSuccess()`, `handleApiError()`,
  `handleValidationError()`, `logApiRequest()` from
  `modules/api/src/utils/api-logger.ts`
- **Never manually handle JSON output**: The centralized functions automatically
  handle `--json` flag
- **Never manually handle silent mode**: The centralized functions automatically
  respect `--silent` flag
- **Always include operation context**: Pass operation name and metadata to
  output functions
- **Reference**: See `docs/centralized-output-patterns.md` for complete patterns
  and examples

**❌ Don't:**

```typescript
console.log('✅ Success!');
console.error('❌ Error:', error);
if (options.json) {
 console.log(JSON.stringify(data));
}
```

**✅ Do:**

```typescript
cliSuccess(data, 'Success!', { operation: 'my-command' });
cliError('Error occurred', 'ERROR_CODE', { error }, 'my-command');
// JSON mode is handled automatically
```

## Testing

### Test File Organization

- **Unit Tests**: Place in `__tests__` folders co-located with source code
  - Example: `core/src/diagnostics/__tests__/system-checker.test.ts`
  - Benefits: Easy to find, maintain, and keep tests close to code
  - Use for: Testing individual functions, classes, or modules in isolation
- **Integration/E2E Tests**: Place in root `tests/` directory
  - Example: `tests/api/records.test.ts`, `tests/cli/export.test.ts`
  - Benefits: Clear separation, tests multiple components together
  - Use for: Testing API endpoints, CLI commands, cross-module interactions,
    end-to-end workflows
- **Vitest Configuration**: Both patterns are configured in `vitest.config.mjs`
  and will be discovered automatically

### Test Writing Standards

- At least **1 happy-path** and **1 edge-case** per feature.
- Use Vitest's `describe`, `it`, and `expect` consistently; apply
  `TEST_CONFIG.DEFAULT_TIMEOUT` to async tests.
- Prefer unit tests; use integration tests only when necessary (CLI/API
  spin-up).
- Always bootstrap with shared fixtures from `tests/fixtures/test-setup.ts`:
- Call `beforeAll(setupGlobalTestEnvironment)` once per top-level `describe`.
- Use helpers instead of ad‑hoc setup:
- `createTestDirectory`/`cleanupTestDirectory` for isolated FS work.
- `createAPITestContext`/`cleanupAPITestContext` to launch API with a random
  port via `getRandomPort()` and to release it.
- `createCLITestContext`/`cleanupCLITestContext` for CLI tests; prefer `--json`
  output and parse the final JSON object.
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
- Prefer importing source modules used by tests; keep imports consistent across
  files and avoid mixing `src`/`dist` in the same suite.
- Assertions:
- Avoid brittle snapshots; assert on explicit fields and invariants.
- Include negative assertions for permission/validation failures where relevant.
- Determinism:
- Do not depend on system state or network; keep tests hermetic and file‑system
  isolated.
- The AI assistant must:
- Propose and add tests for every new feature or fix.
- Use the shared fixtures/utilities above and follow these rules without being
  asked.
- Refuse to introduce tests that bypass cleanup or parse non‑JSON CLI output
  when `--json` is available.

---

## Documentation

- Every feature or command must include a **doc stub** (`.md`) in the correct
  folder.
- Doc stub must explain: **purpose, usage, inputs, outputs**.
- Docs must be clear, short, and civic-friendly.
- **No emojis in documentation**: All documentation files must be emoji-free for
  consistency and accessibility.
- **Example files pattern**: For systems requiring credentials or configuration
  examples, create separate `{system}-credentials.example` files in `docs/` that
  users can copy to `.env.local`. Documentation should reference these example
  files rather than embedding full examples inline.

---

## Filesystem & Paths (Project-Specific)

- `.system-data/` — Private, never committed. Holds sensitive/system runtime
  data: local database (e.g., `civic.db`), machine-local server config, caches.
  The database default path is under `.system-data/` and is configured via
  `.civicrc`. Tests must never use the real DB here; they must create their own
  isolated DB under a temp directory.
- `data/` — Working content checked out locally. User-owned files:
- `data/records/` — Markdown records with YAML frontmatter.
- `data/.civic/` — Editable project configuration (roles.yml, workflows.yml,
  hooks.yml, etc.). These files are managed via the configuration service.
- `.civicrc` — Central configuration file at the repo root that defines
  `dataDir` and database settings (driver and file path). Use this instead of
  hard‑coding paths in code/tests.

### Configuration Service (core)

- Located under `core/src/config/` (e.g., `central-config.ts`,
  `configuration-service.ts`). Responsibilities:
- Discover and load configuration from `data/.civic/`.
- Merge with defaults in `core/src/defaults/` when files are missing.
- Validate and persist configuration updates.
- Support the new metadata-rich YAML format and backward compatibility.

---

## Dependency Injection

- **⚠️ CRITICAL**: All new services MUST be registered in the DI container
- **Service Registration**: Use `registerCivicPressServices()` in
  `core/src/civic-core-services.ts` for core services
- **Service Resolution**: Access services via `civicPress.getService<T>()` or
  use getter methods
- **Never Direct Instantiation**: Do not use `new ServiceName()` directly in
  CivicPress constructor or other services
- **Testing**: Use `createTestContainer()` or `createMockContainer()` from
  `core/src/di/test-utils.ts` for tests
- **Reference**: See `docs/dependency-injection-guide.md` for complete patterns

**❌ Don't:**

```typescript
// In CivicPress constructor or service
this.myService = new MyService(config, logger);
```

**✅ Do:**

```typescript
// In civic-core-services.ts
container.singleton('myService', (c) => {
  const config = c.resolve<CivicPressConfig>('config');
  const logger = c.resolve<Logger>('logger');
  return new MyService(config, logger);
});

// Access via container
const myService = civicPress.getService<MyService>('myService');
```

## Error Handling

- **⚠️ CRITICAL**: All errors MUST use the unified error handling system
- **Error Types**: Use domain-specific error classes extending `CivicPressError`
- **Never Generic Errors**: Do not throw generic `Error` objects
- **Error Codes**: Always include error codes for programmatic handling
- **Correlation IDs**: Errors automatically include correlation IDs for tracing
- **Reference**: See `docs/error-handling.md` for complete patterns

**❌ Don't:**

```typescript
throw new Error('Record not found');
throw new Error('Validation failed');
```

**✅ Do:**

```typescript
import { RecordNotFoundError, ValidationError } from '@civicpress/core/errors';

throw new RecordNotFoundError(recordId, { recordId, type });
throw new ValidationError('Invalid record data', { field: 'title', value: data.title });
```

## Enforcement

These rules are enforced by:

- Prettier and ESLint configs.
- Pre-commit hooks (Husky).
- GitHub Actions CI.
- Registry checks (no duplicate commands or endpoints).
- AI assistant system prompts.

The assistant must **refuse** to generate code that violates these conventions.

---

## Project Constants (Quick Reference)

- API dev: `pnpm run dev:api` (Express)
- UI dev: `pnpm run dev:ui` (Nuxt, port 3030)
- Tests: `pnpm run test` (runs all: API/core/CLI + UI), or `pnpm run test:api`
  (API/core/CLI only)
- Preview server: `pnpm run preview:serve`
- Specs: `pnpm run spec:all`
