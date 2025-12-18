# Dependency Injection Container Implementation Plan

**Status:** Ready for Implementation  
**Priority:** High  
**Estimated Effort:** 2-3 weeks  
**Target Version:** v0.2.0

---

## Overview

This document outlines the step-by-step implementation plan for the Dependency
Injection Container system in CivicPress. The implementation follows a phased
approach to minimize risk and ensure backward compatibility.

## Goals

1. **Implement lightweight DI container** with type safety
2. **Refactor CivicPress class** to use container for service management
3. **Maintain backward compatibility** during transition
4. **Improve testability** with mock-friendly container
5. **Enable lazy initialization** for better startup performance

## Implementation Phases

### Phase 1: Core Container Implementation (Week 1)

#### Step 1.1: Create DI Module Structure

**Files to Create:**

```
core/src/di/
├── container.ts
├── service-lifetime.ts
├── service-registry.ts
├── dependency-resolver.ts
├── circular-dependency-detector.ts
├── types.ts
└── errors.ts
```

**Tasks:**

1. Create directory structure
2. Define TypeScript interfaces and types
3. Create error classes
4. Set up module exports

**Acceptance Criteria:**

- [ ] All files created with proper structure
- [ ] TypeScript types defined
- [ ] Error classes implemented
- [ ] Module exports configured

#### Step 1.2: Implement Service Lifetime System

**File:** `core/src/di/service-lifetime.ts`

**Implementation:**

```typescript
export enum ServiceLifetime {
  Singleton = 'singleton',
  Transient = 'transient',
  Scoped = 'scoped',
}

export interface ServiceMetadata<T = any> {
  key: string | Class<T>;
  factory?: (container: ServiceContainer) => T;
  instance?: T;
  lifetime: ServiceLifetime;
  dependencies: Array<string | Class<any>>;
  initialized: boolean;
  initializationPromise?: Promise<T>;
}
```

**Tasks:**

1. Define `ServiceLifetime` enum
2. Create `ServiceMetadata` interface
3. Add lifetime validation logic
4. Write unit tests

**Acceptance Criteria:**

- [ ] Lifetime enum defined
- [ ] Metadata interface complete
- [ ] Validation logic implemented
- [ ] Unit tests passing

#### Step 1.3: Implement Service Registry

**File:** `core/src/di/service-registry.ts`

**Implementation:**

```typescript
export class ServiceRegistry {
  private services = new Map<string | Class<any>, ServiceMetadata>();

  register<T>(metadata: ServiceMetadata<T>): void {
    // Validate registration
    // Store metadata
    // Handle overrides
  }

  get<T>(key: string | Class<T>): ServiceMetadata<T> | undefined {
    return this.services.get(key);
  }

  has(key: string | Class<any>): boolean {
    return this.services.has(key);
  }

  clear(): void {
    this.services.clear();
  }
}
```

**Tasks:**

1. Implement service storage (Map)
2. Add registration validation
3. Implement lookup methods
4. Add clear method for testing
5. Write unit tests

**Acceptance Criteria:**

- [ ] Services can be registered
- [ ] Services can be retrieved
- [ ] Duplicate registration handled
- [ ] Clear method works
- [ ] Unit tests passing

#### Step 1.4: Implement Circular Dependency Detector

**File:** `core/src/di/circular-dependency-detector.ts`

**Implementation:**

```typescript
export class CircularDependencyDetector {
  private resolutionStack: Array<string | Class<any>> = [];

  check(key: string | Class<any>): void {
    if (this.resolutionStack.includes(key)) {
      const cycle = [...this.resolutionStack, key];
      throw new CircularDependencyError(cycle);
    }
  }

  enter(key: string | Class<any>): void {
    this.resolutionStack.push(key);
  }

  exit(): void {
    this.resolutionStack.pop();
  }

  getCycle(): Array<string | Class<any>> {
    return [...this.resolutionStack];
  }
}
```

**Tasks:**

1. Implement resolution stack tracking
2. Add cycle detection logic
3. Create clear error messages
4. Write unit tests with various cycle scenarios

**Acceptance Criteria:**

- [ ] Simple cycles detected (A -> B -> A)
- [ ] Complex cycles detected (A -> B -> C -> A)
- [ ] Clear error messages
- [ ] Unit tests passing

#### Step 1.5: Implement Dependency Resolver

**File:** `core/src/di/dependency-resolver.ts`

**Implementation:**

```typescript
export class DependencyResolver {
  constructor(
    private registry: ServiceRegistry,
    private detector: CircularDependencyDetector
  ) {}

  resolveDependencies(
    dependencies: Array<string | Class<any>>,
    container: ServiceContainer
  ): any[] {
    return dependencies.map(dep => {
      this.detector.check(dep);
      this.detector.enter(dep);
      try {
        return container.resolve(dep);
      } finally {
        this.detector.exit();
      }
    });
  }

  extractDependencies(constructor: Class<any>): Array<string | Class<any>> {
    // Use TypeScript metadata or manual specification
    // For now, manual specification required
    return [];
  }
}
```

**Tasks:**

1. Implement dependency extraction (manual for now)
2. Implement dependency resolution
3. Integrate with circular dependency detector
4. Write unit tests

**Acceptance Criteria:**

- [ ] Dependencies resolved correctly
- [ ] Circular dependencies detected
- [ ] Error handling works
- [ ] Unit tests passing

#### Step 1.6: Implement ServiceContainer

**File:** `core/src/di/container.ts`

**Implementation:**

```typescript
export class ServiceContainer {
  private registry: ServiceRegistry;
  private detector: CircularDependencyDetector;
  private resolver: DependencyResolver;

  constructor() {
    this.registry = new ServiceRegistry();
    this.detector = new CircularDependencyDetector();
    this.resolver = new DependencyResolver(this.registry, this.detector);
  }

  register<T>(
    key: string | Class<T>,
    factory: (container: ServiceContainer) => T,
    lifetime: ServiceLifetime = ServiceLifetime.Singleton
  ): void {
    // Implementation
  }

  singleton<T>(
    key: string | Class<T>,
    factory: (container: ServiceContainer) => T
  ): void {
    this.register(key, factory, ServiceLifetime.Singleton);
  }

  transient<T>(
    key: string | Class<T>,
    factory: (container: ServiceContainer) => T
  ): void {
    this.register(key, factory, ServiceLifetime.Transient);
  }

  resolve<T>(key: string | Class<T>): T {
    // Implementation with lazy initialization
  }

  // ... other methods
}
```

**Tasks:**

1. Implement service registration methods
2. Implement service resolution with lazy initialization
3. Add singleton caching
4. Integrate circular dependency detection
5. Add helper methods (isRegistered, clear, etc.)
6. Write comprehensive unit tests

**Acceptance Criteria:**

- [ ] Services can be registered
- [ ] Services can be resolved
- [ ] Singleton caching works
- [ ] Transient creates new instances
- [ ] Circular dependencies detected
- [ ] All unit tests passing

**Testing Checklist:**

- [ ] Register and resolve singleton
- [ ] Register and resolve transient
- [ ] Dependency injection works
- [ ] Circular dependency detection
- [ ] Error handling (service not found)
- [ ] Clear method works
- [ ] Type safety verified

### Phase 2: CivicPress Integration (Week 2)

#### Step 2.1: Create Service Registration Module

**File:** `core/src/civic-core-services.ts` (new)

**Purpose:** Centralize all service registrations

**Implementation:**

```typescript
export function registerCivicPressServices(
  container: ServiceContainer,
  config: CivicPressConfig
): void {
  // Register logger first (no dependencies)
  container.singleton('logger', () => new Logger(config.logger));
  container.registerInstance('config', config);

  // Register database service
  container.singleton('database', (c) => {
    const logger = c.resolve<Logger>('logger');
    const config = c.resolve<CivicPressConfig>('config');
    // ... database config setup
    return new DatabaseService(dbConfig, logger);
  });

  // Register auth service
  container.singleton('auth', (c) => {
    const db = c.resolve<DatabaseService>('database');
    const config = c.resolve<CivicPressConfig>('config');
    return new AuthService(db, config.dataDir);
  });

  // Register other services...
}
```

**Tasks:**

1. Create service registration function
2. Register all existing services
3. Maintain service initialization order
4. Add comments explaining dependencies
5. Write integration tests

**Acceptance Criteria:**

- [ ] All services registered
- [ ] Dependencies correctly specified
- [ ] Registration order correct
- [ ] Integration tests passing

#### Step 2.2: Refactor CivicPress Constructor

**File:** `core/src/civic-core.ts`

**Changes:**

```typescript
export class CivicPress {
  private container: ServiceContainer;

  constructor(config: CivicPressConfig) {
    this.container = new ServiceContainer();
    registerCivicPressServices(this.container, config);
  }

  // Keep existing getter methods for backward compatibility
  getDatabaseService(): DatabaseService {
    return this.container.resolve<DatabaseService>('database');
  }

  getAuthService(): AuthService {
    return this.container.resolve<AuthService>('auth');
  }

  // ... other getters

  // New method for direct container access
  getService<T>(key: string | Class<T>): T {
    return this.container.resolve<T>(key);
  }
}
```

**Tasks:**

1. Add container property
2. Call service registration function
3. Update getter methods to use container
4. Add new `getService` method
5. Maintain backward compatibility
6. Write integration tests

**Acceptance Criteria:**

- [ ] Container initialized in constructor
- [ ] All services registered
- [ ] Existing getter methods work
- [ ] New getService method works
- [ ] Backward compatibility maintained
- [ ] Integration tests passing

#### Step 2.3: Update Service Initialization

**File:** `core/src/civic-core.ts`

**Changes:**

```typescript
async initialize(): Promise<void> {
  try {
    this.logger.info('Initializing CivicPress...');

    // Services are lazy-loaded, initialize explicitly
    const db = this.container.resolve<DatabaseService>('database');
    await db.initialize();
    this.logger.info('Database initialized');

    const workflow = this.container.resolve<WorkflowEngine>('workflow');
    await workflow.initialize();

    const git = this.container.resolve<GitEngine>('git');
    await git.initialize();

    const hooks = this.container.resolve<HookSystem>('hooks');
    await hooks.initialize();

    this.logger.info('CivicPress initialized successfully');
  } catch (error) {
    this.logger.error('Failed to initialize CivicPress:', error);
    throw error;
  }
}
```

**Tasks:**

1. Update initialize method to use container
2. Maintain initialization order
3. Keep error handling
4. Write integration tests

**Acceptance Criteria:**

- [ ] Services initialized correctly
- [ ] Initialization order maintained
- [ ] Error handling works
- [ ] Integration tests passing

#### Step 2.4: Update Service Dependencies

**Files:** All service files that create other services

**Changes:**

Services that currently create other services should receive them via
constructor:

```typescript
// Before
class RecordManager {
  constructor(
    private db: DatabaseService,
    private git: GitEngine,
    // ...
  ) {}
}

// After (same, but registered in container)
container.registerClass('RecordManager', RecordManager);
```

**Tasks:**

1. Review all service constructors
2. Ensure services use constructor injection
3. Register services with container
4. Update service instantiation in container
5. Write integration tests

**Acceptance Criteria:**

- [ ] All services use constructor injection
- [ ] Services registered in container
- [ ] Dependencies resolved correctly
- [ ] Integration tests passing

### Phase 3: Testing & Validation (Week 2-3)

#### Step 3.1: Create Test Utilities

**File:** `core/tests/di/test-container.ts`

**Implementation:**

```typescript
export function createTestContainer(): ServiceContainer {
  const container = new ServiceContainer();

  container.registerInstance('config', createTestConfig());
  container.registerInstance('database', createTestDatabase());
  container.registerInstance('logger', createTestLogger());

  return container;
}

export function createMockContainer(): ServiceContainer {
  const container = new ServiceContainer();

  container.registerInstance('database', createMockDatabase());
  container.registerInstance('logger', createMockLogger());

  return container;
}
```

**Tasks:**

1. Create test container factory
2. Create mock container factory
3. Add common test fixtures
4. Write helper utilities

**Acceptance Criteria:**

- [ ] Test containers work
- [ ] Mock containers work
- [ ] Fixtures available
- [ ] Utilities documented

#### Step 3.2: Update Existing Tests

**Files:** All test files that use CivicPress

**Changes:**

```typescript
// Before
const civic = new CivicPress(config);
await civic.initialize();

// After (same API, but can also use container)
const civic = new CivicPress(config);
await civic.initialize();

// Or for testing with mocks
const container = createMockContainer();
container.registerClass(RecordManager, RecordManager);
const manager = container.resolve<RecordManager>(RecordManager);
```

**Tasks:**

1. Review all existing tests
2. Update tests to use container where beneficial
3. Add container-based test utilities
4. Ensure all tests pass
5. Add new container-specific tests

**Acceptance Criteria:**

- [ ] All existing tests pass
- [ ] New container tests added
- [ ] Test coverage maintained
- [ ] Performance acceptable

#### Step 3.3: Integration Testing

**File:** `core/tests/di/integration.test.ts`

**Tests to Add:**

1. Full CivicPress initialization with container
2. Service dependency resolution
3. Service lifecycle (singleton vs transient)
4. Circular dependency scenarios
5. Error handling scenarios
6. Performance benchmarks

**Tasks:**

1. Write integration test suite
2. Test full initialization flow
3. Test service resolution
4. Test error scenarios
5. Performance testing

**Acceptance Criteria:**

- [ ] Integration tests passing
- [ ] All scenarios covered
- [ ] Performance acceptable
- [ ] Error handling verified

### Phase 4: Documentation & Cleanup (Week 3)

#### Step 4.1: Write Documentation

**File:** `docs/dependency-injection-guide.md`

**Content:**

1. Overview and benefits
2. Basic usage examples
3. Service registration patterns
4. Dependency resolution
5. Testing with container
6. Best practices
7. Migration guide

**Tasks:**

1. Write comprehensive guide
2. Add code examples
3. Document patterns
4. Add troubleshooting section
5. Update architecture docs

**Acceptance Criteria:**

- [ ] Documentation complete
- [ ] Examples working
- [ ] Patterns documented
- [ ] Architecture docs updated

#### Step 4.2: Code Cleanup

**Tasks:**

1. Remove old service instantiation code (if any)
2. Clean up unused imports
3. Update comments
4. Run linter
5. Format code

**Acceptance Criteria:**

- [ ] No dead code
- [ ] Linter passing
- [ ] Code formatted
- [ ] Comments updated

#### Step 4.3: Performance Validation

**Tasks:**

1. Benchmark service resolution
2. Compare startup time (before/after)
3. Memory usage analysis
4. Dependency graph analysis performance
5. Document performance characteristics

**Acceptance Criteria:**

- [ ] Resolution performance acceptable
- [ ] Startup time not degraded
- [ ] Memory usage reasonable
- [ ] Performance documented

## Risk Mitigation

### Risk 1: Breaking Changes

**Mitigation:**

- Maintain backward compatibility with existing getter methods
- Gradual migration approach
- Comprehensive testing

### Risk 2: Performance Degradation

**Mitigation:**

- Lazy initialization to avoid startup cost
- Singleton caching for performance
- Performance benchmarks before/after

### Risk 3: Circular Dependencies

**Mitigation:**

- Comprehensive circular dependency detection
- Clear error messages
- Documentation on avoiding cycles

### Risk 4: Type Safety Issues

**Mitigation:**

- Strong TypeScript typing
- Type inference where possible
- Comprehensive type tests

## Success Criteria

### Functional Requirements

- [ ] All services can be registered in container
- [ ] All services can be resolved from container
- [ ] Dependency injection works correctly
- [ ] Circular dependencies are detected
- [ ] Singleton caching works
- [ ] Transient services create new instances

### Non-Functional Requirements

- [ ] Type safety maintained
- [ ] Performance acceptable (no degradation)
- [ ] Backward compatibility maintained
- [ ] Test coverage maintained (>90%)
- [ ] Documentation complete
- [ ] Code quality maintained

### Quality Metrics

- **Test Coverage:** >90% for DI module
- **Type Safety:** 100% TypeScript coverage
- **Performance:** <5ms service resolution (p95)
- **Memory:** No memory leaks with singleton caching
- **Documentation:** Complete API documentation

## Timeline

| Phase                   | Duration      | Start Date | End Date |
| ----------------------- | ------------- | ---------- | -------- |
| Phase 1: Core Container | 1 week        | TBD        | TBD      |
| Phase 2: Integration    | 1 week        | TBD        | TBD      |
| Phase 3: Testing        | 1 week        | TBD        | TBD      |
| Phase 4: Documentation  | 3 days        | TBD        | TBD      |
| **Total**               | **2-3 weeks** |            |          |

## Next Steps

1. **Review and approve** this implementation plan
2. **Create GitHub issues** for each phase
3. **Set up development branch** (`feature/dependency-injection`)
4. **Begin Phase 1** implementation
5. **Daily standups** to track progress
6. **Code reviews** after each phase

## References

- [Dependency Injection Spec](../specs/dependency-injection.md)
- [Architecture Analysis](../architecture-analysis-and-improvements.md)
- [Testing Framework Spec](../specs/testing-framework.md)

---

**Status:** ✅ **COMPLETE** - All phases implemented and tested  
**Last Updated:** 2025-12-18  
**Completed:** December 2024
