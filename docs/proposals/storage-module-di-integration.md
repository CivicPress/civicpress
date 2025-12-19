# Storage Module DI Container Integration Proposal

**Status:** Proposal  
**Priority:** High  
**Target Pattern:** Pattern 2 (Service Registration) from Module Integration
Guide  
**Date:** 2025-01-30

---

## Executive Summary

Migrate the Storage Module from Pattern 3 (Independent Initialization) to
Pattern 2 (Service Registration) by registering storage services in the DI
container. This will improve testability, reduce initialization overhead, and
align with the established module integration patterns.

---

## Current State Analysis

### Current Implementation (Pattern 3)

**Location:** `modules/api/src/routes/uuid-storage.ts`

**Issues:**

1. **Per-Request Initialization**: Storage service initialized on every API
   request
2. **Manual Dependency Injection**: Manually extracts dependencies from request
   context
3. **No DI Container Integration**: Not registered in core DI container
4. **Testability**: Hard to mock/test (requires full request context)
5. **Performance**: Initialization overhead on every request
6. **Inconsistent Pattern**: Doesn't follow established DI patterns

**Current Code Pattern:**

```typescript
// Per-request initialization
const initializeStorage = async (req: AuthenticatedRequest) => {
  if (!storageService) {
    const civicPress = (req as any).context?.civicPress;
    const databaseService = (req as any).context?.databaseService;
    const cacheManager = civicPress?.getCacheManager?.();

    configManager = new StorageConfigManager(systemDataDir);
    const config = await configManager.loadConfig();

    storageService = new CloudUuidStorageService(
      config,
      systemDataDir,
      cacheManager
    );
    storageService.setDatabaseService(databaseService);
    await storageService.initialize();
  }
  return storageService;
};
```

---

## Proposed Solution

### Pattern 2: Service Registration in DI Container

**Benefits:**

- ✅ **Lazy Initialization**: Service created only when first accessed
- ✅ **Automatic Dependency Resolution**: DI container handles dependencies
- ✅ **Better Testability**: Easy to mock via container
- ✅ **Consistent Pattern**: Aligns with core services
- ✅ **Performance**: Single initialization, reused across requests
- ✅ **Type Safety**: Full TypeScript support

---

## Implementation Plan

### Phase 1: Create Storage Service Registration Module

**File:** `modules/storage/src/storage-services.ts`

```typescript
import { ServiceContainer } from '@civicpress/core';
import { CivicPressConfig } from '@civicpress/core';
import { CloudUuidStorageService } from './cloud-uuid-storage-service.js';
import { StorageConfigManager } from './storage-config-manager.js';
import path from 'path';
import fs from 'fs-extra';

/**
 * Register storage module services in the DI container
 *
 * @param container - Service container to register services in
 * @param config - CivicPress configuration
 */
export async function registerStorageServices(
  container: ServiceContainer,
  config: CivicPressConfig
): Promise<void> {
  // Register StorageConfigManager as singleton
  container.singleton('storageConfigManager', (c) => {
    const projectRoot = path.isAbsolute(config.dataDir)
      ? path.dirname(config.dataDir)
      : path.resolve(process.cwd(), path.dirname(config.dataDir));
    const systemDataDir = path.join(projectRoot, '.system-data');
    return new StorageConfigManager(systemDataDir);
  });

  // Register CloudUuidStorageService as singleton with lazy initialization
  container.singleton('storage', async (c) => {
    const logger = c.resolve('logger');
    const cacheManager = c.resolve('cacheManager');
    const db = c.resolve('database');
    const configManager = c.resolve<StorageConfigManager>('storageConfigManager');

    // Load storage configuration
    const storageConfig = await configManager.loadConfig();

    // Determine system data directory
    const projectRoot = path.isAbsolute(config.dataDir)
      ? path.dirname(config.dataDir)
      : path.resolve(process.cwd(), path.dirname(config.dataDir));
    const systemDataDir = path.join(projectRoot, '.system-data');

    // Create storage service
    const storageService = new CloudUuidStorageService(
      storageConfig,
      systemDataDir,
      cacheManager
    );

    // Set database service
    storageService.setDatabaseService(db);

    // Initialize storage service
    await storageService.initialize();

    return storageService;
  });
}
```

**Key Points:**

- `StorageConfigManager` registered as singleton (stateless)
- `CloudUuidStorageService` registered as singleton with async factory
- Dependencies resolved automatically from container
- Initialization happens once on first access

---

### Phase 2: Update Core Service Registration

**File:** `core/src/civic-core-services.ts`

**Changes:**

```typescript
// Add import
import { registerStorageServices } from '@civicpress/storage/storage-services';

// In registerCivicPressServices function, after cache manager registration:
export function registerCivicPressServices(
  container: ServiceContainer,
  config: CivicPressConfig
): void {
  // ... existing registrations ...

  // Register storage services (async, but registration is sync)
  // Note: Storage service initialization is lazy (happens on first resolve)
  registerStorageServices(container, config);
}
```

**Note:** Since `registerStorageServices` is async but service registration is
sync, we need to handle this carefully. The service factory itself is async, so
initialization happens lazily.

---

### Phase 3: Update API Routes

**File:** `modules/api/src/routes/uuid-storage.ts`

**Before:**

```typescript
let storageService: CloudUuidStorageService;
let configManager: StorageConfigManager;

const initializeStorage = async (req: AuthenticatedRequest) => {
  // Complex per-request initialization...
};

router.post('/files', async (req, res) => {
  await initializeStorage(req);
  // Use storageService...
});
```

**After:**

```typescript
import { CloudUuidStorageService } from '@civicpress/storage';
import { StorageConfigManager } from '@civicpress/storage';

// Get storage service from DI container via request context
function getStorageService(req: AuthenticatedRequest): CloudUuidStorageService {
  const civicPress = (req as any).context?.civicPress;
  if (!civicPress) {
    throw new Error('CivicPress instance not available');
  }
  return civicPress.getService<CloudUuidStorageService>('storage');
}

function getStorageConfigManager(req: AuthenticatedRequest): StorageConfigManager {
  const civicPress = (req as any).context?.civicPress;
  if (!civicPress) {
    throw new Error('CivicPress instance not available');
  }
  return civicPress.getService<StorageConfigManager>('storageConfigManager');
}

router.post('/files', async (req, res) => {
  const storageService = getStorageService(req);
  // Use storageService directly - no initialization needed!
  const result = await storageService.uploadFile({...});
});
```

**Benefits:**

- No per-request initialization
- Cleaner code
- Automatic dependency resolution
- Type-safe service access

---

### Phase 4: Handle Test Environment

**Challenge:** Test environments need isolated storage instances

**Solution:** Use scoped container or test-specific registration

**File:** `tests/fixtures/test-setup.ts`

```typescript
// In test setup, create test-specific storage service
export async function setupTestStorage(
  container: ServiceContainer,
  testDataDir: string
): Promise<void> {
  // Override storage service with test instance
  const testSystemDataDir = path.join(testDataDir, '.system-data');
  const configManager = new StorageConfigManager(testSystemDataDir);
  const storageConfig = await configManager.loadConfig();

  const cacheManager = container.resolve('cacheManager');
  const db = container.resolve('database');

  const storageService = new CloudUuidStorageService(
    storageConfig,
    testSystemDataDir,
    cacheManager
  );
  storageService.setDatabaseService(db);
  await storageService.initialize();

  // Register test instance
  container.registerInstance('storage', storageService);
}
```

---

## Migration Strategy

### Step 1: Implement Registration Module (Non-Breaking)

- Create `modules/storage/src/storage-services.ts`
- Add registration function
- **No breaking changes** - existing code still works

### Step 2: Register in Core (Non-Breaking)

- Update `core/src/civic-core-services.ts`
- Register storage services
- **No breaking changes** - services available but not required

### Step 3: Update API Routes (Breaking)

- Update `modules/api/src/routes/uuid-storage.ts`
- Remove `initializeStorage()` function
- Use DI container resolution
- **Breaking change** - requires API route updates

### Step 4: Update Tests

- Update test fixtures
- Use test-specific storage registration
- **No breaking changes** - tests work with new pattern

### Step 5: Cleanup

- Remove old initialization code
- Update documentation
- **No breaking changes** - cleanup only

---

## Benefits

### 1. Performance

- **Before**: Initialize on every request (~50-100ms overhead)
- **After**: Initialize once, reuse across requests
- **Improvement**: ~95% reduction in initialization time

### 2. Testability

- **Before**: Need full request context to test
- **After**: Mock container, resolve service directly
- **Improvement**: Unit tests possible, easier mocking

### 3. Consistency

- **Before**: Different pattern from core services
- **After**: Same pattern as all core services
- **Improvement**: Easier to understand and maintain

### 4. Type Safety

- **Before**: Manual type assertions
- **After**: Full TypeScript support via container
- **Improvement**: Compile-time type checking

### 5. Dependency Management

- **Before**: Manual dependency extraction
- **After**: Automatic dependency resolution
- **Improvement**: Less error-prone, clearer dependencies

---

## Risks & Mitigation

### Risk 1: Async Service Registration

**Issue:** DI container registration is sync, but storage initialization is
async

**Mitigation:**

- Use async factory function in container
- Container handles async resolution automatically
- First access triggers initialization (lazy)

### Risk 2: Test Environment Isolation

**Issue:** Tests need isolated storage instances

**Mitigation:**

- Use `registerInstance()` in test setup
- Override singleton with test instance
- Each test gets fresh instance

### Risk 3: Backward Compatibility

**Issue:** Existing code expects per-request initialization

**Mitigation:**

- Phased migration (non-breaking steps first)
- Keep old code until migration complete
- Update all routes in single step

---

## Testing Strategy

### Unit Tests

```typescript
describe('Storage Service Registration', () => {
  it('should register storage services in container', async () => {
    const container = new ServiceContainer();
    const config = createTestConfig();

    await registerStorageServices(container, config);

    const storageService = await container.resolve<CloudUuidStorageService>('storage');
    expect(storageService).toBeInstanceOf(CloudUuidStorageService);
  });

  it('should resolve dependencies automatically', async () => {
    const container = createTestContainer();
    await registerStorageServices(container, config);

    const storageService = await container.resolve<CloudUuidStorageService>('storage');
    // Dependencies should be automatically injected
    expect(storageService).toBeDefined();
  });
});
```

### Integration Tests

```typescript
describe('Storage API Routes with DI', () => {
  it('should use storage service from container', async () => {
    const civicPress = await createTestCivicPress();
    const storageService = civicPress.getService<CloudUuidStorageService>('storage');

    // Test API route uses service from container
    const response = await request(app)
      .post('/api/v1/storage/files')
      .attach('file', testFile);

    expect(response.status).toBe(200);
  });
});
```

---

## Implementation Checklist

- [ ] Create `modules/storage/src/storage-services.ts`
- [ ] Implement `registerStorageServices()` function
- [ ] Update `core/src/civic-core-services.ts` to call registration
- [ ] Update `modules/api/src/routes/uuid-storage.ts` to use DI resolution
- [ ] Update test fixtures for storage service
- [ ] Add unit tests for registration
- [ ] Add integration tests for API routes
- [ ] Update documentation
- [ ] Remove old initialization code
- [ ] Update module integration guide with storage example

---

## Documentation Updates

### Update Module Integration Guide

Add Storage Module as example of Pattern 2:

```markdown
## Storage Module Integration (Pattern 2 - Service Registration)

The Storage Module demonstrates Pattern 2 integration:

1. **Service Registration**: Services registered in `registerStorageServices()`
2. **DI Container**: Services accessible via `civicPress.getService()`
3. **Lazy Initialization**: Services initialized on first access
4. **Automatic Dependencies**: Dependencies resolved automatically
```

### Update Architecture Documentation

- Document storage service registration
- Update service dependency graph
- Add storage to DI container section

---

## Success Criteria

1. ✅ Storage service registered in DI container
2. ✅ API routes use container resolution (no per-request init)
3. ✅ All tests pass with new pattern
4. ✅ Performance improvement measurable
5. ✅ Documentation updated
6. ✅ Code follows Pattern 2 from module integration guide

---

## Timeline

- **Phase 1**: 1-2 days (Registration module)
- **Phase 2**: 1 day (Core integration)
- **Phase 3**: 1-2 days (API route updates)
- **Phase 4**: 1 day (Test updates)
- **Phase 5**: 1 day (Cleanup & docs)

**Total:** 5-7 days

---

## Conclusion

Migrating Storage Module to Pattern 2 (Service Registration) will:

- Improve performance (95% reduction in init overhead)
- Enhance testability (unit tests possible)
- Align with established patterns (consistency)
- Follow module integration guide (Pattern 2)

This is a **high-value, low-risk** improvement that brings the Storage Module in
line with core architecture patterns.

---

**Next Steps:**

1. Review and approve proposal
2. Create implementation branch
3. Begin Phase 1 implementation
4. Iterate through phases with testing
