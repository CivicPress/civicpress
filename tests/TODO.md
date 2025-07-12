# Test Infrastructure TODO

## Problem

We keep fixing individual test issues one by one, which is inefficient and
error-prone. Common issues include:

- Missing mocks for `@civicpress/core` exports
- Inconsistent test setup and teardown
- Database initialization problems
- Git engine initialization issues
- Authentication configuration problems
- Duplicate mock implementations across test files

## Solution: Comprehensive Test Infrastructure

### ✅ Created: `tests/fixtures/test-setup.ts`

This centralized test infrastructure provides:

#### 1. **Unified Mock System**

- Single source of truth for all `@civicpress/core` mocks
- Consistent mock implementations across all test types
- Easy to update when core exports change

#### 2. **Test Context Management**

- `APITestContext` - For API tests with server setup
- `CLITestContext` - For CLI tests with command execution
- `CoreTestContext` - For core module tests with database setup

#### 3. **Test Directory Management**

- Automatic temporary directory creation
- Proper cleanup on test completion
- Isolated test environments

#### 4. **Configuration Generation**

- `createCivicConfig()` - Generate `.civicrc` files
- `createWorkflowConfig()` - Generate workflow configurations
- `createSampleRecords()` - Generate test data

#### 5. **Test Utilities**

- `createTestUser()` - Generate test users
- `createAuthToken()` - Generate auth tokens
- `withTestSetup()` - Decorator for setup/teardown

## Migration Plan

### Phase 1: Update API Tests

- [ ] Update `tests/api/authorization.test.ts` to use new infrastructure
- [ ] Update `tests/api/records.test.ts` to use new infrastructure
- [ ] Update `tests/api/indexing.test.ts` to use new infrastructure
- [ ] Update `tests/api/health.test.ts` to use new infrastructure
- [ ] Update `tests/api/history.test.ts` to use new infrastructure

### Phase 2: Update CLI Tests

- [ ] Update `tests/cli/users.test.ts` to use new infrastructure
- [ ] Update `tests/cli/init.test.ts` to use new infrastructure
- [ ] Update `tests/cli/auth.test.ts` to use new infrastructure
- [ ] Update all other CLI tests

### Phase 3: Update Core Tests

- [ ] Update `tests/core/user-management.test.ts` to use new infrastructure
- [ ] Update `tests/core/auth-service.test.ts` to use new infrastructure
- [ ] Update `tests/core/database-service.test.ts` to use new infrastructure
- [ ] Update all other core tests

### Phase 4: Integration Tests

- [ ] Create integration tests using the new infrastructure
- [ ] Test full user workflows (create → authenticate → use → delete)
- [ ] Test API + CLI integration
- [ ] Test core + API integration

## Example Migration

### Before (Current API Test)

```typescript
// tests/api/authorization.test.ts
vi.mock('@civicpress/core', () => ({
  CivicPress: vi.fn().mockImplementation(() => ({
    // ... 200+ lines of mock setup
  })),
  // ... more mocks
}));

describe('API Authorization System', () => {
  let api: CivicPressAPI;
  let testDataDir: string;

  beforeEach(async () => {
    // Manual setup code
    testDataDir = join(process.cwd(), 'test-api-data');
    mkdirSync(testDataDir, { recursive: true });
    // ... more setup
  });

  afterEach(async () => {
    // Manual cleanup
    await api.shutdown();
    rmSync(testDataDir, { recursive: true, force: true });
  });
});
```

### After (Using New Infrastructure)

```typescript
// tests/api/authorization.test.ts
import {
  describe, it, expect, beforeEach, afterEach,
  createAPITestContext, cleanupAPITestContext,
  setupGlobalTestEnvironment
} from '../fixtures/test-setup';

setupGlobalTestEnvironment();

describe('API Authorization System', () => {
  let context: APITestContext;

  beforeEach(async () => {
    context = await createAPITestContext();
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  it('should require authentication', async () => {
    // Test implementation
  });
});
```

## Benefits

1. **Consistency**: All tests use the same setup patterns
2. **Maintainability**: Changes to mocks only need to be made in one place
3. **Reliability**: Proper cleanup prevents test interference
4. **Speed**: Faster test execution with optimized setup
5. **Debugging**: Easier to debug test issues with standardized setup

## Next Steps

1. **Fix linter errors** in `test-setup.ts`
2. **Migrate one test file** as proof of concept
3. **Update vitest config** to use global setup
4. **Create migration script** to automate test updates
5. **Document usage patterns** for team members

## Notes

- The new infrastructure is backward compatible
- Tests can be migrated incrementally
- Existing tests will continue to work during migration
- The infrastructure supports both mocked and real implementations
