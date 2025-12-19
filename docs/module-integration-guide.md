# Module Integration Guide

**Last Updated:** 2025-01-30  
**Status:** Active

---

## Overview

This guide explains how modules integrate with the CivicPress core platform. It
covers integration patterns, best practices, and examples for developing new
modules.

## Module Architecture

CivicPress follows a modular architecture where:

- **Core Module** (`core/`): Provides foundation services (DI container,
  database, auth, etc.)
- **Modules** (`modules/`): Extend core functionality (API, CLI, UI, Storage,
  etc.)

### Module Structure

```
modules/
├── api/              # REST API module
├── cli/              # CLI module (in root cli/)
├── ui/               # Web UI module
├── storage/          # Storage module
└── legal-register/   # Legal register module
```

## Module Integration Patterns

### Pattern 1: Direct Core Dependency

**Description**: Modules depend on `@civicpress/core` and use core services
directly.

**When to Use**:

- Simple modules that need core types and utilities
- Modules that don't need DI container integration
- Standalone modules with minimal core interaction

**Example**:

```typescript
// modules/my-module/src/my-service.ts
import { Logger, DatabaseService } from '@civicpress/core';
import { CivicPressError } from '@civicpress/core';

class MyModuleService {
  constructor(
    private logger: Logger,
    private db: DatabaseService
  ) {}

  async doSomething() {
    this.logger.info('Doing something...');
    // Use database service
    const result = await this.db.query('SELECT * FROM records');
    return result;
  }
}
```

**Pros**:

- Simple and straightforward
- No DI container complexity
- Easy to understand

**Cons**:

- Services must be passed manually
- Harder to test (need to mock services)
- No automatic dependency resolution

### Pattern 2: Service Registration (Future Enhancement)

**Description**: Modules register services in the DI container.

**When to Use**:

- Modules that provide services to other modules
- Modules that need automatic dependency resolution
- Complex modules with multiple services

**Example** (Future Implementation):

```typescript
// modules/my-module/src/index.ts
import { ServiceContainer, CivicPressConfig } from '@civicpress/core';

export interface MyModuleConfig {
  // Module-specific configuration
}

export function registerMyModuleServices(
  container: ServiceContainer,
  config: CivicPressConfig & { myModule?: MyModuleConfig }
): void {
  container.singleton('myModuleService', (c) => {
    const logger = c.resolve<Logger>('logger');
    const db = c.resolve<DatabaseService>('database');
    return new MyModuleService(logger, db, config.myModule);
  });
}

// In core initialization
import { registerMyModuleServices } from '@civicpress/my-module';
registerMyModuleServices(container, config);
```

**Pros**:

- Automatic dependency resolution
- Better testability (mock via container)
- Consistent with core services

**Cons**:

- More complex setup
- Requires DI container knowledge
- Not yet implemented

### Pattern 3: Independent Initialization (Current Storage Pattern)

**Description**: Modules initialize services independently, typically
per-request or on-demand.

**When to Use**:

- Modules that need per-request instances
- Modules with heavy initialization
- Modules that don't fit DI container pattern

**Example** (Current Storage Module):

```typescript
// modules/api/src/routes/uuid-storage.ts
import { CloudUuidStorageService } from '@civicpress/storage';
import { StorageConfigManager } from '@civicpress/storage';

async function initializeStorage(req: AuthenticatedRequest) {
  const configManager = new StorageConfigManager();
  const storageConfig = await configManager.loadConfig();

  const storageService = new CloudUuidStorageService(
    storageConfig,
    req.civic.getDataDir()
  );

  await storageService.initialize();
  return storageService;
}

router.post('/files', async (req, res) => {
  const storageService = await initializeStorage(req);
  // Use storage service
  const result = await storageService.uploadFile({...});
});
```

**Pros**:

- Flexible initialization
- Can handle per-request instances
- Works well for heavy services

**Cons**:

- No automatic dependency resolution
- Manual service management
- Harder to test

## Storage Module Integration (Current Implementation)

The Storage module is a complete example of Pattern 3 (Independent
Initialization).

### Architecture

```
modules/storage/
├── src/
│   ├── cloud-uuid-storage-service.ts  # Main storage service
│   ├── uuid-storage-service.ts         # Base storage service
│   ├── storage-config-manager.ts       # Configuration management
│   ├── credential-manager.ts           # Credential management
│   └── types/
│       └── storage.types.ts            # TypeScript types
└── package.json
```

### Integration Points

1. **Core Dependency**: Uses `@civicpress/core` for:
   - `Logger` - Logging utilities
   - `UnifiedCacheManager` - Cache integration
   - `CivicPressError` - Error types

2. **API Integration**: Initialized per-request in API routes:

   ```typescript
   // modules/api/src/routes/uuid-storage.ts
   async function initializeStorage(req: AuthenticatedRequest) {
     // Load config and initialize service
   }
   ```

3. **Configuration**: Uses `.system-data/storage.yml` for configuration

4. **Database**: Uses core `DatabaseService` for file metadata tracking

### Current Limitations

- Not registered in DI container
- Initialized per-request (could be optimized)
- No unified service access pattern

### Future Enhancements

Consider registering storage service in DI container:

```typescript
// Future: In core/src/civic-core-services.ts
container.singleton('storage', async (c) => {
  const config = c.resolve<CivicPressConfig>('config');
  const logger = c.resolve<Logger>('logger');
  const db = c.resolve<DatabaseService>('database');

  const storageConfig = await loadStorageConfig();
  const storageService = new CloudUuidStorageService(
    storageConfig,
    config.dataDir,
    logger,
    db
  );
  await storageService.initialize();
  return storageService;
});
```

## Module Development Guidelines

### 1. Use Core Types

Always import types from `@civicpress/core`:

```typescript
import {
  Logger,
  DatabaseService,
  CivicPressError,
  CivicPressConfig,
} from '@civicpress/core';
```

### 2. Use Core Errors

Extend `CivicPressError` for module-specific errors:

```typescript
import { CivicPressError } from '@civicpress/core';

export class MyModuleError extends CivicPressError {
  code = 'MY_MODULE_ERROR';
  statusCode = 500;

  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
  }
}
```

### 3. Use Core Logging

Use `Logger` from core for consistent logging:

```typescript
import { Logger } from '@civicpress/core';

class MyService {
  constructor(private logger: Logger) {}

  async doSomething() {
    this.logger.info('Doing something...', { context: 'value' });
  }
}
```

### 4. Follow Established Patterns

- Use the same error handling patterns as core
- Follow the same logging patterns
- Use consistent naming conventions
- Document module integration points

### 5. Document Integration

Document how your module integrates with core:

- What core services it uses
- How it's initialized
- Configuration requirements
- API endpoints (if applicable)
- CLI commands (if applicable)

## Module Registration (Future Enhancement)

Future enhancement: Standardized module registration system.

### Proposed Interface

```typescript
interface CivicPressModule {
  name: string;
  version: string;

  /**
   * Register module services in DI container
   */
  register(
    container: ServiceContainer,
    config: CivicPressConfig
  ): void;

  /**
   * Initialize module (called after all services registered)
   */
  initialize(container: ServiceContainer): Promise<void>;

  /**
   * Shutdown module (called during platform shutdown)
   */
  shutdown(container: ServiceContainer): Promise<void>;
}
```

### Example Implementation

```typescript
// modules/my-module/src/index.ts
export class MyModule implements CivicPressModule {
  name = 'my-module';
  version = '1.0.0';

  register(container: ServiceContainer, config: CivicPressConfig): void {
    container.singleton('myModuleService', (c) => {
      const logger = c.resolve<Logger>('logger');
      return new MyModuleService(logger, config);
    });
  }

  async initialize(container: ServiceContainer): Promise<void> {
    const service = container.resolve<MyModuleService>('myModuleService');
    await service.initialize();
  }

  async shutdown(container: ServiceContainer): Promise<void> {
    const service = container.resolve<MyModuleService>('myModuleService');
    await service.shutdown();
  }
}

// In core initialization
const modules = [
  new MyModule(),
  new StorageModule(),
  // ... other modules
];

for (const module of modules) {
  module.register(container, config);
}

await Promise.all(modules.map(m => m.initialize(container)));
```

## Best Practices

### 1. Keep Modules Independent

- Modules should not depend on other modules
- Use core as the shared foundation
- Communicate via events/hooks when needed

### 2. Use Core Abstractions

- Use `Logger` instead of `console.log`
- Use `CivicPressError` instead of generic `Error`
- Use core types for consistency

### 3. Handle Errors Gracefully

- Always use `CivicPressError` hierarchy
- Include correlation IDs for tracing
- Provide meaningful error messages

### 4. Document Dependencies

- Clearly document what core services your module uses
- Document configuration requirements
- Document initialization requirements

### 5. Test Integration Points

- Test module initialization
- Test error handling
- Test service interactions
- Test configuration loading

## Examples

### Example 1: Simple Module (Pattern 1)

```typescript
// modules/simple-module/src/simple-service.ts
import { Logger } from '@civicpress/core';

export class SimpleService {
  constructor(private logger: Logger) {}

  async process(data: any) {
    this.logger.info('Processing data', { data });
    // Process data
    return { success: true };
  }
}

// Usage in API
import { SimpleService } from '@civicpress/simple-module';

router.post('/process', async (req, res) => {
  const logger = req.civic.getService<Logger>('logger');
  const service = new SimpleService(logger);
  const result = await service.process(req.body);
  res.json(result);
});
```

### Example 2: Module with Configuration (Pattern 3)

```typescript
// modules/config-module/src/config-service.ts
import { Logger, CivicPressConfig } from '@civicpress/core';

export interface MyModuleConfig {
  apiKey: string;
  endpoint: string;
}

export class ConfigService {
  private config: MyModuleConfig;

  constructor(
    private logger: Logger,
    config: CivicPressConfig & { myModule?: MyModuleConfig }
  ) {
    this.config = config.myModule || {
      apiKey: process.env.MY_MODULE_API_KEY || '',
      endpoint: process.env.MY_MODULE_ENDPOINT || '',
    };
  }

  async initialize() {
    if (!this.config.apiKey) {
      throw new Error('MY_MODULE_API_KEY is required');
    }
    this.logger.info('Config service initialized');
  }
}

// Usage
const configService = new ConfigService(logger, config);
await configService.initialize();
```

## Troubleshooting

### Module Not Found

**Problem**: `Cannot find module '@civicpress/my-module'`

**Solution**:

- Ensure module is in `modules/` directory
- Check `package.json` name matches import
- Run `pnpm install` to link workspace packages

### Service Not Available

**Problem**: `Service 'myService' not found in container`

**Solution**:

- Ensure service is registered in DI container
- Check service key matches resolution key
- Verify service registration order

### Configuration Not Loading

**Problem**: Module configuration not found

**Solution**:

- Check configuration file location
- Verify configuration file format
- Ensure configuration is loaded before module initialization

## Related Documentation

- [Architecture Overview](architecture.md) - Core architecture
- [Dependency Injection Guide](dependency-injection-guide.md) - DI container
  usage
- [Error Handling](error-handling.md) - Error handling patterns
- [Storage System](uuid-storage-system.md) - Storage module details

---

**Status**: Active  
**Last Updated**: 2025-01-30  
**Next Review**: After module registration system implementation
