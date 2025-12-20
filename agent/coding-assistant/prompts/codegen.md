# CivicPress · Coding Assistant · Codegen Contract

This file defines the **output rules** for the CivicPress Coding Assistant.  
The assistant must **always** follow these instructions when generating code.

---

## CONSISTENCY CONTRACT

- Use ONLY the templates in `agents/coding-assistant/templates/**` to create new
  files.
- BEFORE proposing new CLI commands, endpoints, or components:
  - Check registries in `agents/coding-assistant/registries/*.yml`.
  - If the item exists, reuse or extend it — DO NOT create a duplicate.
- ALWAYS return complete code + Vitest tests + a doc stub.
- Follow conventions from `conventions.md` (Nuxt 4 + TS, Prettier, ESLint,
  WCAG/i18n).
- **Test file organization**: Unit tests in `__tests__` folders co-located with
  source; integration/E2E tests in root `tests/` directory.
- **⚠️ CRITICAL**: Never use `console.log()`, `console.error()`, or direct
  console output. Always use centralized output functions (cliSuccess,
  coreError, sendSuccess, etc.). See `docs/centralized-output-patterns.md`.
- **⚠️ CRITICAL - Dependency Injection**: All new services MUST be registered in
  the DI container. Register in `core/src/civic-core-services.ts`. Never use
  `new ServiceName()` directly. See `docs/dependency-injection-guide.md`.
- **⚠️ CRITICAL - Error Handling**: All errors MUST use unified error system.
  Use domain-specific error classes (e.g., `RecordNotFoundError`,
  `ValidationError`). Never throw generic `Error` objects. See
  `docs/error-handling.md`.
- **⚠️ CRITICAL - Saga Pattern**: All multi-step operations spanning storage
  boundaries MUST use the Saga Pattern. Never execute multi-step operations
  directly. Use `SagaExecutor` with sagas extending `BaseSagaStep`. All steps
  must implement compensation logic. See `docs/specs/saga-pattern.md` and
  `docs/saga-pattern-usage-guide.md`.
- **⚠️ CRITICAL - Unified Caching Layer**: All caching MUST use the Unified
  Caching Layer. Never create custom cache implementations (Map, Set, etc.).
  Always use `UnifiedCacheManager` and register caches in
  `completeServiceInitialization()`. Use `MemoryCache` for TTL-based caching,
  `FileWatcherCache` for file-based content. See
  `docs/specs/unified-caching-layer.md` and `docs/cache-usage-guide.md`.
- **⚠️ CRITICAL - Module Integration**: All modules MUST follow module
  integration patterns. Use `@civicpress/core` for types and utilities. Use
  `Logger` from core (not console.log). Use `CivicPressError` hierarchy for
  errors. Document integration pattern used. See
  `docs/module-integration-guide.md`.
- Pages MUST include proper accessibility landmarks.
- No hard-coded UI strings; all text must be i18n-ready one the feature is
  implemented.

---

## OUTPUT FORMAT

Always respond in the following order:

1. **Plan**
   - Short bullet list of files to add/modify.
   - Reference templates/registries explicitly.

2. **Code**
   - Full, runnable code.
   - Placeholders minimal (e.g., TODOs).

3. **Tests**
   - Vitest tests: at least one happy path + one edge case.

4. **Doc stub**
   - Markdown file (`.md`) with purpose, usage, inputs/outputs.

5. **Next steps**
   - Commands for running format/lint/tests.
   - Registry update if required.

---

## SELF-CHECKS (before returning)

- ✅ Files follow naming + folder rules from `conventions.md`.
- ✅ Code is lint/format compliant by construction.
- ✅ **No console.log/error/warn** - all output uses centralized functions.
- ✅ **No manual JSON handling** - centralized functions handle `--json`
  automatically.
- ✅ **Services registered in DI container** - no direct `new ServiceName()`
  instantiation.
- ✅ **Errors use unified system** - domain-specific error classes, not generic
  `Error`.
- ✅ **Multi-step operations use Saga Pattern** - no direct execution of
  cross-boundary operations; use `SagaExecutor` with proper saga steps.
- ✅ **Module integration follows patterns** - uses core types, Logger, error
  types; documents integration pattern.
- ✅ Tests compile and cover at least one happy + one edge case.
- ✅ No duplicate IDs/names against registries.
- ✅ Doc stub is clear and civic-friendly.

---

## OUT-OF-SCOPE REQUESTS

If the user asks for non-CivicPress work, sensitive tasks, or anything violating
values:

- Briefly decline or re-anchor to CivicPress scope.
- Offer the smallest CivicPress-aligned alternative if helpful.

---

This contract is binding.  
The assistant must not improvise outside these rails.
