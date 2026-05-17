# Test Execution Rules

**⚠️ CRITICAL**: These rules MUST be followed when running tests to prevent
system crashes and ensure proper test execution.

## Resource Limits (MANDATORY)

All Vitest configurations have been set with strict resource limits to prevent
CPU/RAM overload:

### Main Test Config (`vitest.config.mjs`)

- **Pool**: `forks` (required for API tests with `process.chdir()`)
- **Max Workers**: 2 (prevents CPU overload)
- **File Parallelism**: 1 (one test file at a time)
- **Max Concurrency**: 1 (one test at a time within a file)

### UI Test Config (`vitest.config.ui.mjs`)

- **Pool**: `threads`
- **Max Threads**: 2
- **Max Workers**: 2
- **File Parallelism**: 1 (reduced from 2)
- **Max Concurrency**: 1

### Realtime Module Config (`modules/realtime/vitest.config.ts`)

- **Pool**: `forks` (required for integration tests)
- **Max Workers**: 1 (strict limit for heavy integration tests)
- **File Parallelism**: 1
- **Max Concurrency**: 1

**NEVER** modify these limits without explicit approval. These limits prevent
system crashes.

## Running Tests

### Running All Tests

```bash
# Run all tests (main + UI)
pnpm run test

# Run only main tests (API, Core, CLI)
pnpm run test:run

# Run only UI tests
pnpm run test:ui:run
```

### Running a Single Test File

**⚠️ IMPORTANT**: Use `test:single` script or pass arguments with `--`:

```bash
# Method 1: Use test:single script (RECOMMENDED)
pnpm run test:single modules/realtime/src/__tests__/auth.test.ts

# Method 2: Use -- to pass arguments
pnpm run test:run -- modules/realtime/src/__tests__/auth.test.ts

# Method 3: Direct vitest command
pnpm vitest run modules/realtime/src/__tests__/auth.test.ts
```

**DO NOT** use `pnpm run test <file>` without `--` - it will run ALL tests!

### Running Tests by Pattern

```bash
# Run all tests matching a pattern
pnpm run test:single -- -t "auth"

# Run tests in a specific directory
pnpm run test:single -- modules/realtime/src/__tests__/
```

### Watch Mode

```bash
# Watch mode for main tests
pnpm run test:watch

# Watch mode for UI tests
pnpm run test:ui
```

## Cache Management

### Cleanup Script

**Always run cleanup before reporting test issues:**

```bash
# Clean all test caches
pnpm run cleanup
```

This removes:

- Vitest/Vite caches (`node_modules/.vite/`, `.vitest/`)
- Coverage reports (`coverage/` directories)
- TypeScript build cache (`*.tsbuildinfo` files)
- Coverage cache (`.nyc_output/`)
- Test attachments (`.vitest-attachments/`)

### When to Clean

Run `pnpm run cleanup` when:

- Tests are failing unexpectedly
- Test results seem stale
- Switching between branches
- After major dependency updates
- Before reporting test issues

## Test Execution Best Practices

### 1. Always Use Resource-Limited Commands

**✅ DO:**

```bash
pnpm run test:single <file>
pnpm run test:run
```

**❌ DON'T:**

```bash
# Don't bypass resource limits
vitest run --maxWorkers=10
```

### 2. Run Single Tests During Development

**✅ DO:**

```bash
# Run only the test you're working on
pnpm run test:single modules/realtime/src/__tests__/auth.test.ts
```

**❌ DON'T:**

```bash
# Don't run all tests repeatedly during development
pnpm run test  # Only use for final verification
```

### 3. Clean Caches Regularly

**✅ DO:**

```bash
# Clean before starting work
pnpm run cleanup
pnpm run test:single <file>
```

**❌ DON'T:**

```bash
# Don't ignore cache issues
# If tests are flaky, clean caches first
```

## Troubleshooting

### Tests Using Too Much CPU/RAM

1. **Check resource limits are set**:

   ```bash
   # Verify config files have maxWorkers set
   grep -r "maxWorkers" vitest.config.* modules/*/vitest.config.*
   ```

2. **Run cleanup**:

   ```bash
   pnpm run cleanup
   ```

3. **Run single test**:

   ```bash
   pnpm run test:single <specific-test-file>
   ```

### Single Test Not Running

**Problem**: `pnpm run test <file>` runs all tests

**Solution**: Use `test:single` or `--` separator:

```bash
pnpm run test:single <file>
# OR
pnpm run test:run -- <file>
```

### Cache Issues

**Symptoms**: Tests fail unexpectedly, stale results

**Solution**:

```bash
pnpm run cleanup
pnpm run test:single <file>
```

## AI Assistant Rules

When running tests as an AI assistant:

1. **ALWAYS use resource-limited commands** - Never bypass `maxWorkers` limits
2. **ALWAYS run single tests during development** - Use `test:single` for
   focused testing
3. **ALWAYS clean caches when tests fail** - Run `cleanup` before
   troubleshooting
4. **NEVER modify resource limits** - These are set to prevent system crashes
5. **NEVER run all tests repeatedly** - Only run full test suite for final
   verification

## Configuration Files

- `vitest.config.mjs` - Main test configuration (API, Core, CLI)
- `vitest.config.ui.mjs` - UI test configuration
- `modules/realtime/vitest.config.ts` - Realtime module tests
- `scripts/cleanup-test-caches.mjs` - Cache cleanup script

## Related Documentation

- [Coding Conventions](./conventions.md) - General coding standards
- [Project Configuration](./project.yml) - Project-wide rules

---

**Last Updated**: 2025-01-30  
**Status**: Enforced - All test executions must follow these rules
