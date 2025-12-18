# Dependency Injection Container - User Guide

## Overview

The CivicPress Dependency Injection (DI) Container provides a lightweight,
type-safe system for managing service dependencies throughout the platform. It
enables better testability, loose coupling, lazy initialization, and easier
service management.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Basic Usage](#basic-usage)
3. [Service Registration](#service-registration)
4. [Service Resolution](#service-resolution)
5. [Service Lifetimes](#service-lifetimes)
6. [Dependency Injection](#dependency-injection)
7. [Testing with DI](#testing-with-di)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

## Quick Start

```typescript
import { ServiceContainer } from '@civicpress/core/di';

// Create a container
const container = new ServiceContainer();

// Register a service
container.singleton('myService', () => {
  return new MyService();
});

// Resolve a service
const myService = container.resolve('myService');
```

## Basic Usage

### Creating a Container

```typescript
import { ServiceContainer } from '@civicpress/core/di';

const container = new ServiceContainer();
```

### Registering Services

Services can be registered in three ways:

#### 1. Singleton (Default)

```typescript
container.singleton('logger', () => {
  return new Logger();
});
```

#### 2. Transient

```typescript
container.transient('validator', () => {
  return new Validator();
});
```

#### 3. Direct Instance

```typescript
const instance = new MyService();
container.registerInstance('myService', instance);
```

#### 4. Class Registration

```typescript
class MyService {
  constructor(private logger: Logger) {}
}

container.registerClass('myService', MyService, ['logger']);
```

## Service Registration

### Factory Functions

The most common way to register services is using factory functions:

```typescript
container.singleton('database', (container) => {
  const logger = container.resolve<Logger>('logger');
  const config = container.resolve<Config>('config');
  return new DatabaseService(config, logger);
});
```

### Service Keys

Services can be registered with:

- **String keys**: `'database'`, `'logger'`, etc.
- **Class constructors**: `DatabaseService`, `Logger`, etc.

```typescript
// String key
container.singleton('db', () => new DatabaseService());

// Class constructor
container.singleton(DatabaseService, () => new DatabaseService());

// Resolve by class
const db = container.resolve(DatabaseService);
```

## Service Resolution

### Basic Resolution

```typescript
const service = container.resolve('serviceKey');
```

### Type-Safe Resolution

```typescript
const logger = container.resolve<Logger>('logger');
```

### Checking Registration

```typescript
if (container.isRegistered('serviceKey')) {
  const service = container.resolve('serviceKey');
}
```

### Getting All Registered Keys

```typescript
const keys = container.getRegisteredKeys();
console.log(keys); // ['logger', 'database', 'auth', ...]
```

## Service Lifetimes

### Singleton

A single instance is created and reused for all resolutions:

```typescript
container.singleton('config', () => {
  console.log('Creating config...'); // Only called once
  return new Config();
});

const config1 = container.resolve('config');
const config2 = container.resolve('config');
// config1 === config2 (same instance)
```

### Transient

A new instance is created for each resolution:

```typescript
container.transient('validator', () => {
  console.log('Creating validator...'); // Called each time
  return new Validator();
});

const v1 = container.resolve('validator');
const v2 = container.resolve('validator');
// v1 !== v2 (different instances)
```

### Scoped

One instance per scope (for future use):

```typescript
const scoped = container.createScope();
const service = scoped.resolve('scopedService');
```

## Dependency Injection

### Automatic Dependency Resolution

When registering a class, specify dependencies:

```typescript
class UserService {
  constructor(
    private db: DatabaseService,
    private logger: Logger
  ) {}
}

container.singleton('database', () => new DatabaseService());
container.singleton('logger', () => new Logger());
container.registerClass('userService', UserService, ['database', 'logger']);

const userService = container.resolve('userService');
// Dependencies are automatically injected
```

### Factory-Based Injection

```typescript
container.singleton('userService', (container) => {
  const db = container.resolve<DatabaseService>('database');
  const logger = container.resolve<Logger>('logger');
  return new UserService(db, logger);
});
```

## Testing with DI

### Test Utilities

The DI system provides test utilities for easy testing:

```typescript
import {
  createTestContainer,
  createMockContainer,
  createTestLogger,
  createMockLogger,
} from '@civicpress/core/di';

// Create a test container with real services
const container = createTestContainer();

// Create a mock container with mock services
const mockContainer = createMockContainer({
  database: createMockDatabase(),
  logger: createMockLogger(),
});
```

### Mocking Services

```typescript
// Register a mock service
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};

container.registerInstance('logger', mockLogger);

// Use in tests
const service = container.resolve('myService');
service.doSomething();
expect(mockLogger.info).toHaveBeenCalled();
```

### Test Container Factory

```typescript
import { createTestContainer } from '@civicpress/core/di';

describe('MyService', () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = createTestContainer({
      logger: createTestLogger(),
    });
  });

  it('should work with test container', () => {
    const service = container.resolve('myService');
    expect(service).toBeDefined();
  });
});
```

## Best Practices

### 1. Register Services in Order

Register services in dependency order (dependencies first):

```typescript
// ✅ Good: Register dependencies first
container.singleton('logger', () => new Logger());
container.singleton('database', (c) => {
  const logger = c.resolve<Logger>('logger');
  return new DatabaseService(logger);
});

// ❌ Bad: Registering before dependencies exist
container.singleton('database', (c) => {
  const logger = c.resolve<Logger>('logger'); // Error if not registered
  return new DatabaseService(logger);
});
```

### 2. Use Singleton for Shared Services

Use singleton for services that should be shared:

```typescript
// ✅ Good: Shared database connection
container.singleton('database', () => new DatabaseService());

// ✅ Good: Unique validators per use
container.transient('validator', () => new Validator());
```

### 3. Avoid Circular Dependencies

Design services to avoid circular dependencies:

```typescript
// ❌ Bad: Circular dependency
container.singleton('A', (c) => ({ b: c.resolve('B') }));
container.singleton('B', (c) => ({ a: c.resolve('A') })); // Error!

// ✅ Good: Use events or mediator pattern
container.singleton('A', () => new ServiceA());
container.singleton('B', () => new ServiceB());
// Services communicate via events, not direct references
```

### 4. Use Type-Safe Resolution

Always use type parameters for better type safety:

```typescript
// ✅ Good: Type-safe
const logger = container.resolve<Logger>('logger');

// ❌ Bad: No type safety
const logger = container.resolve('logger'); // Type: any
```

### 5. Lazy Initialization

Services are created lazily (on first resolution), which is efficient:

```typescript
// Service is not created until first resolve()
container.singleton('heavyService', () => {
  console.log('Creating heavy service...'); // Only called when resolved
  return new HeavyService();
});

// Later...
const service = container.resolve('heavyService'); // Now created
```

## Troubleshooting

### Service Not Found

**Error:** `ServiceNotFoundError: Service 'myService' is not registered`

**Solution:** Ensure the service is registered before resolving:

```typescript
// Register first
container.singleton('myService', () => new MyService());

// Then resolve
const service = container.resolve('myService');
```

### Circular Dependency

**Error:** `CircularDependencyError: Circular dependency detected: A -> B -> A`

**Solution:** Refactor to break the cycle:

```typescript
// Instead of direct references, use:
// 1. Events/observers
// 2. Mediator pattern
// 3. Dependency inversion
```

### Type Errors

**Error:** TypeScript type errors when resolving

**Solution:** Use type parameters:

```typescript
// ✅ Correct
const logger = container.resolve<Logger>('logger');

// ❌ Incorrect
const logger = container.resolve('logger'); // Type: any
```

### Service Not Initialized

**Error:** Service methods fail because dependencies aren't ready

**Solution:** Ensure all dependencies are registered and initialized:

```typescript
// Register all dependencies
container.singleton('logger', () => new Logger());
container.singleton('database', (c) => {
  const logger = c.resolve<Logger>('logger');
  return new DatabaseService(logger);
});

// Initialize if needed
const db = container.resolve<DatabaseService>('database');
await db.initialize();
```

## Advanced Topics

### Dependency Graph

Get a visualization of service dependencies:

```typescript
const graph = container.getDependencyGraph();
console.log(graph.nodes); // All services
console.log(graph.edges); // Dependencies
console.log(graph.circular); // Circular dependencies (if any)
```

### Scoped Containers

Create child containers for scoped services:

```typescript
const scoped = container.createScope();
// Scoped container inherits singleton registrations
const service = scoped.resolve('singletonService');
```

### Custom Error Handling

```typescript
try {
  const service = container.resolve('nonexistent');
} catch (error) {
  if (error instanceof ServiceNotFoundError) {
    console.error('Service not registered:', error.serviceKey);
  }
}
```

## Integration with CivicPress

The DI container is integrated into CivicPress:

```typescript
import { CivicPress } from '@civicpress/core';

const civic = new CivicPress(config);

// Services are automatically registered
// Access via getter methods (backward compatible)
const db = civic.getDatabaseService();
const auth = civic.getAuthService();

// Or use the new getService method
const db2 = civic.getService<DatabaseService>('database');
```

## See Also

- [Dependency Injection Specification](../specs/dependency-injection.md)
- [Implementation Plan](../implementation-plans/dependency-injection-implementation.md)
- [Architecture Analysis](../architecture-analysis-and-improvements.md)
