# CivicPress Spec: `dependency-injection.md`

---

version: 1.0.0 status: implemented created: '2025-01-27' updated: '2025-12-18'
deprecated: false sunset_date: null breaking_changes: [] additions:

- Dependency injection container system
- Service registration and resolution
- Lazy initialization support
- Service lifecycle management fixes: [] migration_guide: null compatibility:
  min_civicpress: '0.2.0' max_civicpress: null dependencies:
- 'core.md: >=1.0.0' authors:
- 'AI Assistant <assistant@civicpress.io>' reviewers: []

---

## Name

`dependency-injection` — CivicPress Dependency Injection Container System

## Purpose

Provide a lightweight, type-safe dependency injection container that manages
service instantiation, lifecycle, and dependency resolution throughout the
CivicPress platform. This system enables better testability, loose coupling,
lazy initialization, and easier service management.

## Scope & Responsibilities

Responsibilities:

- **Service Registration**: Register services with factory functions or direct
  instances
- **Dependency Resolution**: Automatically resolve service dependencies through
  constructor injection
- **Lifecycle Management**: Support singleton, transient, and scoped service
  lifetimes
- **Lazy Initialization**: Defer service creation until first access
- **Circular Dependency Detection**: Detect and prevent circular dependency
  chains
- **Type Safety**: Provide TypeScript-first API with type inference
- **Service Discovery**: Enable service discovery and health checking
- **Testing Support**: Provide mock-friendly container for unit tests

Out of Scope:

- Automatic dependency scanning (services must be explicitly registered)
- Aspect-oriented programming (AOP) features
- Service proxies or interceptors
- Distributed service resolution
- Service versioning or multiple implementations

## Inputs & Outputs

| Input             | Description                               |
| ----------------- | ----------------------------------------- |
| Service factories | Functions that create service instances   |
| Service instances | Direct service instances for registration |
| Service keys      | String identifiers or class constructors  |
| Configuration     | Service configuration and options         |
| Dependency graph  | Service dependency relationships          |

| Output            | Description                                               |
| ----------------- | --------------------------------------------------------- |
| Resolved services | Fully initialized service instances                       |
| Service container | Container instance with registered services               |
| Dependency graph  | Visual representation of service dependencies             |
| Error messages    | Clear error messages for missing or circular dependencies |
| Service metadata  | Information about registered services                     |

## File/Folder Location

```
core/
├── src/
│   ├── di/
│   │   ├── container.ts              # Main ServiceContainer class
│   │   ├── service-lifetime.ts      # Service lifetime enums and types
│   │   ├── service-registry.ts      # Service registration and metadata
│   │   ├── dependency-resolver.ts   # Dependency resolution logic
│   │   ├── circular-dependency-detector.ts # Circular dependency detection
│   │   ├── types.ts                 # TypeScript interfaces and types
│   │   └── errors.ts                # DI-specific error classes
│   ├── civic-core.ts                # Updated to use DI container
│   └── index.ts                     # Export DI container
├── tests/
│   └── di/
│       ├── container.test.ts
│       ├── dependency-resolver.test.ts
│       ├── circular-dependency.test.ts
│       └── integration.test.ts
└── docs/
    └── dependency-injection-guide.md
```

## Core Concepts

### Service Lifetime

Services can have three lifetime scopes:

1. **Singleton**: One instance shared across the entire application lifecycle
2. **Transient**: New instance created on every resolution request
3. **Scoped**: One instance per scope (e.g., per request, per test)

### Service Registration

Services can be registered in multiple ways:

```typescript
// Factory function
container.register('logger', () => new Logger(options));

// Singleton (eager initialization)
container.singleton('database', () => new DatabaseService(config));

// Transient (new instance each time)
container.transient('validator', () => new RecordValidator());

// Direct instance
container.registerInstance('config', configObject);

// Class constructor (auto-wiring)
container.registerClass('RecordManager', RecordManager);
```

### Dependency Resolution

Dependencies are resolved automatically through constructor injection:

```typescript
class RecordManager {
  constructor(
    private db: DatabaseService,
    private git: GitEngine,
    private logger: Logger
  ) {}
}

// Container automatically resolves dependencies
const recordManager = container.resolve<RecordManager>('RecordManager');
```

### Circular Dependency Detection

The container detects circular dependencies and provides clear error messages:

```typescript
// Service A depends on B, B depends on A
// Error: Circular dependency detected: A -> B -> A
```

## API Design

### ServiceContainer Class

```typescript
export class ServiceContainer {
  /**
   * Register a service with factory function
   */
  register<T>(
    key: string | Class<T>,
    factory: (container: ServiceContainer) => T,
    lifetime?: ServiceLifetime
  ): void;

  /**
   * Register a singleton service (eager initialization)
   */
  singleton<T>(
    key: string | Class<T>,
    factory: (container: ServiceContainer) => T
  ): void;

  /**
   * Register a transient service (new instance each time)
   */
  transient<T>(
    key: string | Class<T>,
    factory: (container: ServiceContainer) => T
  ): void;

  /**
   * Register a direct instance
   */
  registerInstance<T>(key: string | Class<T>, instance: T): void;

  /**
   * Register a class with automatic dependency injection
   */
  registerClass<T>(
    key: string | Class<T>,
    constructor: Class<T>,
    lifetime?: ServiceLifetime
  ): void;

  /**
   * Resolve a service by key
   */
  resolve<T>(key: string | Class<T>): T;

  /**
   * Check if a service is registered
   */
  isRegistered(key: string | Class<T>): boolean;

  /**
   * Get all registered service keys
   */
  getRegisteredKeys(): Array<string | Class<any>>;

  /**
   * Clear all registrations (useful for testing)
   */
  clear(): void;

  /**
   * Create a child container (for scoped services)
   */
  createScope(): ServiceContainer;

  /**
   * Get dependency graph visualization
   */
  getDependencyGraph(): DependencyGraph;
}
```

### Service Lifetime Enum

```typescript
export enum ServiceLifetime {
  Singleton = 'singleton',
  Transient = 'transient',
  Scoped = 'scoped',
}
```

### Type Definitions

```typescript
export type Class<T> = new (...args: any[]) => T;

export interface ServiceMetadata {
  key: string | Class<any>;
  factory?: (container: ServiceContainer) => any;
  instance?: any;
  lifetime: ServiceLifetime;
  dependencies: Array<string | Class<any>>;
  initialized: boolean;
}

export interface DependencyGraph {
  nodes: Array<{ key: string; type: string }>;
  edges: Array<{ from: string; to: string }>;
  circular: Array<string[]>;
}
```

## Implementation Details

### Service Registration Flow

1. **Validate Registration**: Check if service is already registered (unless
   override allowed)
2. **Analyze Dependencies**: Extract constructor dependencies using TypeScript
   metadata or manual specification
3. **Store Metadata**: Store service factory, lifetime, and dependency
   information
4. **Initialize Singleton**: If singleton and eager, create instance immediately

### Dependency Resolution Flow

1. **Check Registration**: Verify service is registered
2. **Check Lifetime**: Determine if instance exists (singleton) or needs
   creation
3. **Resolve Dependencies**: Recursively resolve all constructor dependencies
4. **Detect Circular Dependencies**: Track resolution path to detect cycles
5. **Create Instance**: Invoke factory or constructor with resolved dependencies
6. **Cache Instance**: Store singleton instances for reuse
7. **Return Instance**: Return fully initialized service

### Circular Dependency Detection

The container maintains a resolution stack during dependency resolution:

```typescript
private resolutionStack: Array<string | Class<any>> = [];

private resolveWithStack<T>(key: string | Class<T>): T {
  if (this.resolutionStack.includes(key)) {
    const cycle = [...this.resolutionStack, key];
    throw new CircularDependencyError(cycle);
  }

  this.resolutionStack.push(key);
  try {
    return this.resolveInternal<T>(key);
  } finally {
    this.resolutionStack.pop();
  }
}
```

### Type Safety

The container uses TypeScript generics for type safety:

```typescript
// Type-safe resolution
const logger = container.resolve<Logger>('logger');
const db = container.resolve<DatabaseService>('database');

// Type inference from class
container.registerClass(RecordManager, RecordManager);
const manager = container.resolve(RecordManager); // Type: RecordManager
```

## Integration with CivicPress

### CivicPress Class Refactoring

The `CivicPress` class will use the container for service management:

```typescript
export class CivicPress {
  private container: ServiceContainer;

  constructor(config: CivicPressConfig) {
    this.container = new ServiceContainer();
    this.registerServices(config);
  }

  private registerServices(config: CivicPressConfig): void {
    // Register logger first (no dependencies)
    this.container.singleton('logger', () => new Logger(config.logger));
    this.container.registerInstance('config', config);

    // Register database service
    this.container.singleton('database', (c) => {
      const logger = c.resolve<Logger>('logger');
      return new DatabaseService(dbConfig, logger);
    });

    // Register auth service (depends on database)
    this.container.singleton('auth', (c) => {
      const db = c.resolve<DatabaseService>('database');
      const config = c.resolve<CivicPressConfig>('config');
      return new AuthService(db, config.dataDir);
    });

    // Register other services...
  }

  async initialize(): Promise<void> {
    // Services are lazy-loaded, initialize explicitly
    const db = this.container.resolve<DatabaseService>('database');
    await db.initialize();
    // ...
  }

  getService<T>(key: string | Class<T>): T {
    return this.container.resolve<T>(key);
  }
}
```

### Service Access Pattern

Services are accessed through the container:

```typescript
// Before (tight coupling)
const recordManager = new RecordManager(
  this.databaseService,
  this.gitEngine,
  this.hookSystem
);

// After (loose coupling)
const recordManager = container.resolve<RecordManager>('RecordManager');
```

## Testing Support

### Mock Container

The container supports easy mocking for tests:

```typescript
describe('RecordManager', () => {
  let container: ServiceContainer;
  let mockDb: jest.Mocked<DatabaseService>;

  beforeEach(() => {
    container = new ServiceContainer();
    mockDb = createMockDatabaseService();

    container.registerInstance('database', mockDb);
    container.registerInstance('logger', createMockLogger());
    container.registerClass(RecordManager, RecordManager);
  });

  it('should create record', async () => {
    const manager = container.resolve<RecordManager>(RecordManager);
    await manager.createRecord({ title: 'Test' });
    expect(mockDb.createRecord).toHaveBeenCalled();
  });
});
```

### Test Fixtures

Common test fixtures can be registered:

```typescript
export function createTestContainer(): ServiceContainer {
  const container = new ServiceContainer();

  container.registerInstance('config', createTestConfig());
  container.registerInstance('database', createTestDatabase());
  container.registerInstance('logger', createTestLogger());

  return container;
}
```

## Error Handling

### Error Types

```typescript
export class ServiceNotFoundError extends Error {
  constructor(key: string | Class<any>) {
    super(`Service not found: ${key}`);
  }
}

export class CircularDependencyError extends Error {
  constructor(cycle: Array<string | Class<any>>) {
    super(`Circular dependency detected: ${cycle.join(' -> ')}`);
    this.cycle = cycle;
  }
  cycle: Array<string | Class<any>>;
}

export class ServiceRegistrationError extends Error {
  constructor(key: string | Class<any>, reason: string) {
    super(`Failed to register service ${key}: ${reason}`);
  }
}
```

## Performance Considerations

### Lazy Initialization

Services are created on-demand, not during registration:

```typescript
// Registration is fast (just stores factory)
container.singleton('database', () => new DatabaseService(...));

// Resolution creates instance (only when needed)
const db = container.resolve<DatabaseService>('database');
```

### Singleton Caching

Singleton instances are cached after first resolution:

```typescript
// First call: creates instance
const db1 = container.resolve<DatabaseService>('database');

// Subsequent calls: returns cached instance
const db2 = container.resolve<DatabaseService>('database');
// db1 === db2 (same instance)
```

### Dependency Graph Caching

Dependency graphs are analyzed once and cached:

```typescript
// First resolution: analyzes dependencies
const manager = container.resolve<RecordManager>(RecordManager);

// Subsequent resolutions: uses cached dependency info
const manager2 = container.resolve<RecordManager>(RecordManager);
```

## Security & Trust Considerations

### Service Isolation

- Services cannot access container internals
- No reflection or dynamic code execution
- All dependencies must be explicitly registered

### Error Information

- Error messages do not expose internal implementation details
- Circular dependency errors show only the cycle path
- Service registration errors are logged but don't leak sensitive data

### Testing Security

- Test containers are isolated from production containers
- Mock services cannot access real services
- Service registration in tests is scoped to test container

## Migration Strategy

### Phase 1: Container Implementation

1. Implement `ServiceContainer` class
2. Add service lifetime support
3. Implement dependency resolution
4. Add circular dependency detection
5. Write comprehensive tests

### Phase 2: CivicPress Integration

1. Refactor `CivicPress` constructor to use container
2. Register all existing services in container
3. Update service access to use container
4. Maintain backward compatibility during transition

### Phase 3: Service Refactoring

1. Update services to use constructor injection
2. Remove direct service instantiation
3. Update tests to use container
4. Document service registration patterns

### Phase 4: Cleanup

1. Remove old service instantiation code
2. Update documentation
3. Add service registration examples
4. Performance testing and optimization

## Testing & Validation

### Unit Tests

- Service registration and resolution
- Singleton vs transient behavior
- Circular dependency detection
- Error handling
- Type safety

### Integration Tests

- Full CivicPress initialization with container
- Service dependency resolution
- Service lifecycle management
- Test container isolation

### Performance Tests

- Resolution performance benchmarks
- Memory usage with singleton caching
- Dependency graph analysis performance

## Future Enhancements

### Potential Additions

- **Decorator Support**: `@Injectable()` decorator for automatic registration
- **Property Injection**: Support for property-based injection
- **Service Interceptors**: AOP-style interceptors for cross-cutting concerns
- **Configuration Injection**: Automatic configuration object injection
- **Service Health Checks**: Built-in health check integration
- **Service Metrics**: Performance and usage metrics for services

### Considerations

- Keep container lightweight (no heavy frameworks)
- Maintain type safety as primary goal
- Ensure backward compatibility
- Document all patterns and best practices

## Related Specs

- [`core.md`](./core.md) — Core platform architecture
- [`testing-framework.md`](./testing-framework.md) — Testing standards
- [`api.md`](./api.md) — API service integration
- [`cli.md`](./cli.md) — CLI service integration

## History

- Drafted: 2025-01-27
- Status: Draft for review and implementation
