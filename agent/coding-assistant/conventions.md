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

## Saga Pattern for Multi-Step Operations

- **⚠️ CRITICAL**: All multi-step operations that span multiple storage
  boundaries MUST use the Saga Pattern
- **When to Use**: Operations that involve:
  - Database + Git commits (e.g., publishDraft, createRecord, updateRecord,
    archiveRecord)
  - Database + File system + Git (e.g., record operations with file creation)
  - Any operation crossing storage boundaries (DB, Git, filesystem, external
    services)
- **Never Direct Execution**: Do not execute multi-step operations directly;
  always use a saga
- **Saga Infrastructure**: Use `SagaExecutor`, `BaseSagaStep`, and existing saga
  patterns
- **Compensation**: All saga steps must implement compensation logic for
  rollback
- **Idempotency**: All sagas support idempotency via `IdempotencyManager`
- **State Persistence**: Saga state is automatically persisted for recovery
- **Reference**: See `docs/specs/saga-pattern.md` and
  `docs/saga-pattern-usage-guide.md`

**❌ Don't:**

```typescript
// Direct multi-step operation without saga
async publishDraft(draftId: string) {
  await this.db.moveRecordToPublished(draftId); // Step 1
  await this.createFile(record); // Step 2
  await this.git.commit(...); // Step 3 - What if this fails? DB already committed!
}
```

**✅ Do:**

```typescript
// Use existing saga or create new one
import { PublishDraftSaga } from '@civicpress/core/saga';

async publishDraft(draftId: string, user: AuthUser) {
  const saga = new PublishDraftSaga(
    this.container.resolve('database'),
    this.container.resolve('gitEngine'),
    // ... other dependencies
  );

  const context: PublishDraftContext = {
    draftId,
    user,
    correlationId: generateCorrelationId(),
  };

  const executor = this.container.resolve<SagaExecutor>('sagaExecutor');
  return await executor.execute(saga, context);
}
```

**Creating New Sagas:**

1. Extend `BaseSagaStep<TContext, TResult>` for each step
2. Implement `execute()` and `compensate()` methods
3. Define saga class with array of steps
4. Register saga-related services in DI container
5. Add integration tests covering success, failure, and compensation scenarios
6. See `core/src/saga/publish-draft-saga.ts` for reference implementation

## Unified Caching Layer

- **⚠️ CRITICAL**: All caching MUST use the Unified Caching Layer
- **When to Use**: Any code that needs to cache data (search results, templates,
  diagnostics, suggestions, etc.)
- **Never Direct Cache Creation**: Do not create custom cache implementations
  (Map, Set, etc.); always use `UnifiedCacheManager`
- **Cache Registration**: All caches must be registered with
  `UnifiedCacheManager` in `completeServiceInitialization()`
- **Cache Access**: Get caches via
  `civicPress.getCacheManager().getCache<T>(name)`
- **Cache Strategies**: Use `MemoryCache` for TTL-based caching,
  `FileWatcherCache` for file-based content
- **Metrics**: All caches automatically track metrics (hits, misses, hit rate,
  memory usage)
- **Reference**: See `docs/cache-usage-guide.md` and
  `docs/specs/unified-caching-layer.md` for complete patterns
- **Reference**: See `docs/specs/unified-caching-layer.md` and
  `docs/cache-usage-guide.md`

**❌ Don't:**

```typescript
// Custom cache implementation
private cache = new Map<string, CachedData>();
private ttl = new Map<string, number>();

async get(key: string) {
  const cached = this.cache.get(key);
  if (cached && Date.now() - this.ttl.get(key)! < 300000) {
    return cached;
  }
  return null;
}
```

**✅ Do:**

```typescript
// Use UnifiedCacheManager
import { UnifiedCacheManager } from '@civicpress/core';

class MyService {
  private cacheManager: UnifiedCacheManager;

  constructor(cacheManager: UnifiedCacheManager) {
    this.cacheManager = cacheManager;
  }

  async getData(key: string) {
    const cache = this.cacheManager.getCache<CachedData>('myCache');
    const cached = await cache.get(key);
    if (cached) {
      return cached;
    }

    const data = await this.fetchData();
    await cache.set(key, data, { ttl: 5 * 60 * 1000 }); // 5 minutes
    return data;
  }
}
```

**Registering New Caches:**

1. Register cache in `completeServiceInitialization()` in
   `core/src/civic-core-services.ts`:

   ```typescript
   await cacheManager.registerFromConfig('myCache', {
     strategy: 'memory',
     enabled: true,
     defaultTTL: 5 * 60 * 1000, // 5 minutes
     maxSize: 1000,
   });
   ```

2. Access cache via `civicPress.getCacheManager().getCache<T>('myCache')`
3. For file-based caches, use `FileWatcherCache` strategy
4. See existing caches (`search`, `diagnostics`, `templates`, `storageMetadata`)
   for reference

## Storage System Patterns

- **⚠️ CRITICAL**: All storage operations MUST follow established patterns
- **Performance**: Use metadata caching, batch operations, streaming for large
  files
- **Reliability**: Implement retry, failover, circuit breaker, health checks,
  timeouts
- **Observability**: Collect metrics, usage reporting, quota enforcement
- **Error Handling**: Use storage-specific error classes extending
  `CivicPressError`
- **Service Registration**: All storage services must be registered in DI
  container
- **Reference**: See `docs/specs/storage.md` and `docs/uuid-storage-system.md`

**❌ Don't:**

```typescript
// Direct storage operations without retry/failover
async uploadFile(file: Buffer) {
  await s3Client.putObject({ Bucket: bucket, Key: key, Body: file });
}

// No caching for list operations
async listFiles(folder: string) {
  return await db.query('SELECT * FROM storage_files WHERE folder = ?', [folder]);
}

// Generic errors
throw new Error('Storage quota exceeded');
```

**✅ Do:**

```typescript
// Use CloudUuidStorageService with all enhancements
import { CloudUuidStorageService } from '@civicpress/storage';
import { QuotaExceededError } from '@civicpress/storage/errors';

// Service automatically handles:
// - Retry with exponential backoff
// - Automatic failover
// - Circuit breaker
// - Health checks
// - Timeout handling
// - Metadata caching
// - Metrics collection
const result = await storageService.uploadFile(request);

// Use structured errors
if (quotaExceeded) {
  throw new QuotaExceededError(quota, { folder, fileSize });
}
```

**Storage Service Patterns:**

1. **Metadata Caching**: Always use `StorageMetadataCacheAdapter` for list
   operations
2. **Batch Operations**: Use `batchUpload()` and `batchDelete()` for multiple
   files
3. **Streaming**: Use `uploadFileStream()` and `downloadFileStream()` for large
   files (>10MB)
4. **Concurrency Limits**: Respect configured limits via `ConcurrencyLimiter`
5. **Retry Logic**: Wrap operations with `RetryManager.withRetry()`
6. **Failover**: Use `StorageFailoverManager.executeWithFailover()` for provider
   switching
7. **Circuit Breaker**: Check circuit breaker state before operations
8. **Health Checks**: Use `StorageHealthChecker` for provider monitoring
9. **Timeouts**: Wrap operations with `withTimeout()` utility
10. **Metrics**: Record operations via `StorageMetricsCollector`
11. **Quota**: Check quotas via `QuotaManager` before uploads
12. **Error Handling**: Use storage-specific error classes (see
    `modules/storage/src/errors/storage-errors.ts`)

**Storage Service Registration:**

All storage services are registered in `modules/storage/src/storage-services.ts`
and called from `core/src/civic-core-services.ts`:

```typescript
// Storage services automatically registered
import { registerStorageServices } from '@civicpress/storage/storage-services';

registerStorageServices(container, config);
```

**Storage Configuration:**

- Configuration in `.system-data/storage.yml` (see
  `core/src/defaults/storage.yml` for template)
- All new configuration options must be validated
- Use metadata format for configuration fields when applicable

## Module Integration

- **⚠️ CRITICAL**: All modules must follow established integration patterns
- **Core Dependency**: Modules depend on `@civicpress/core` for types and
  utilities
- **Service Registration**: Consider DI container registration for module
  services
- **Error Handling**: Use core error types (`CivicPressError`, domain-specific
  errors)
- **Logging**: Use `Logger` from core for consistent logging
- **Pattern Selection**: Choose appropriate integration pattern based on module
  needs
- **Reference**: See `docs/module-integration-guide.md` for complete patterns

**Integration Patterns:**

1. **Pattern 1: Direct Core Dependency** - Simple modules using core
   types/utilities
2. **Pattern 2: Service Registration** - Modules registering services in DI
   container (future)
3. **Pattern 3: Independent Initialization** - Modules initializing services
   independently (current storage pattern)

**❌ Don't:**

```typescript
// Module directly instantiating services without core dependency
import { MyService } from './my-service';
const service = new MyService(); // No core integration

// Module using console.log instead of Logger
console.log('Module operation complete');

// Module throwing generic errors
throw new Error('Module error');
```

**✅ Do:**

```typescript
// Module using core types and utilities
import { Logger, CivicPressError } from '@civicpress/core';

class MyModuleService {
  constructor(private logger: Logger) {}

  async doSomething() {
    this.logger.info('Module operation started');
    // ... operation
  }
}

// Module using core error types
import { ValidationError } from '@civicpress/core/errors';
throw new ValidationError('Invalid module data', { field: 'value' });
```

**Module Development Checklist:**

- ✅ Uses `@civicpress/core` for types and utilities
- ✅ Uses `Logger` from core (not console.log)
- ✅ Uses `CivicPressError` hierarchy for errors
- ✅ Documents integration pattern used
- ✅ Documents core services used
- ✅ Documents configuration requirements
- ✅ Follows established patterns from existing modules

**Reference**: See `docs/module-integration-guide.md` for complete module
integration patterns and examples

## Architecture References

When developing new features, always reference:

- **Architecture Overview**: `docs/architecture.md` - Complete system
  architecture
- **Module Integration**: `docs/module-integration-guide.md` - How modules
  integrate with core
- **Dependency Injection**: `docs/dependency-injection-guide.md` - DI container
  usage
- **Error Handling**: `docs/error-handling.md` - Error handling patterns
- **Caching**: `docs/cache-usage-guide.md` - Caching system usage
- **Saga Pattern**: `docs/saga-pattern-usage-guide.md` - Saga pattern usage
- **Architecture Decisions**: `docs/architecture/decisions/` - ADRs for major
  decisions

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
