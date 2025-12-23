# Module Integration Guide

**Last Updated:** 2025-12-19  
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

The Storage module is a complete example of **Pattern 2 (Service Registration)**
with lazy initialization.

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
   - `DatabaseService` - Database operations
   - `CivicPressError` - Error types
   - `ServiceContainer` - DI container for service registration

2. **DI Container Registration**: Services registered during core
   initialization:

   ```typescript
   // In core/src/civic-core-services.ts
   if (storageModule?.registerStorageServices) {
     storageModule.registerStorageServices(container, config);
   }

   // In modules/storage/src/storage-services.ts
   export function registerStorageServices(
     container: ServiceContainer,
     config: CivicPressConfig
   ): void {
     // Register 'storageConfigManager' (singleton)
     container.singleton('storageConfigManager', () => {
       return new StorageConfigManager(systemDataDir);
     });

     // Register 'storage' (singleton, lazy initialization)
     container.singleton('storage', (c) => {
       const cacheManager = c.resolve<UnifiedCacheManager>('cacheManager');
       const db = c.resolve<DatabaseService>('database');
       const configManager = c.resolve<StorageConfigManager>('storageConfigManager');

       const storageService = new CloudUuidStorageService(
         configManager.getDefaultConfig(),
         systemDataDir,
         cacheManager
       );
       storageService.setDatabaseService(db);
       return storageService; // Lazy init on first use
     });
   }
   ```

3. **API Integration**: Services accessed via DI container:

   ```typescript
   // modules/api/src/routes/uuid-storage.ts
   async function getStorageService(req: AuthenticatedRequest) {
     const civicPress = req.civicPress;
     // Get from DI container (Pattern 2)
     const storageService = civicPress.getService('storage');
     // Lazy initialization on first use
     await initializeStorageService(storageService);
     return storageService;
   }
   ```

4. **Configuration**: Uses `.system-data/storage.yml` for configuration via
   `StorageConfigManager`

5. **Database**: Uses core `DatabaseService` for file metadata tracking

6. **Lazy Initialization**: Service is created synchronously but initialized
   asynchronously on first use to handle async config loading

### Current Implementation

- ✅ **Registered in DI Container**: Services available via
  `civicPress.getService('storage')`
- ✅ **Unified Service Access**: Consistent with other core services
- ✅ **Lazy Initialization**: Handles async config loading gracefully
- ✅ **Optional Module**: Gracefully handles cases where storage module is not
  available

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

## Realtime Module Integration ✅ (Implemented)

The Realtime module follows **Pattern 2 (Service Registration)** similar to the
Storage module, with additional considerations for WebSocket server lifecycle
and room management. **Implementation is complete and tested.**

### Architecture

```
modules/realtime/
├── src/
│   ├── realtime-services.ts      # Service registration
│   ├── realtime-server.ts         # WebSocket server
│   ├── realtime-config-manager.ts # Configuration management
│   ├── rooms/
│   │   ├── room-manager.ts        # Room management
│   │   └── yjs-room.ts            # yjs document room
│   ├── errors/
│   │   └── realtime-errors.ts     # Error hierarchy
│   └── types/
│       └── realtime.types.ts       # TypeScript types
└── package.json
```

### Integration Points

1. **Core Dependency**: Uses `@civicpress/core` for:
   - `Logger` - Logging utilities
   - `HookSystem` - Event emission
   - `AuthService` - Authentication validation
   - `DatabaseService` - Snapshot storage (optional)
   - `ServiceContainer` - DI container for service registration

2. **DI Container Registration**: Services registered during core
   initialization:

   ```typescript
   // In core/src/civic-core-services.ts
   if (realtimeModule?.registerRealtimeServices) {
     realtimeModule.registerRealtimeServices(container, config);
   }

   // In modules/realtime/src/realtime-services.ts
   export function registerRealtimeServices(
     container: ServiceContainer,
     config: CivicPressConfig
   ): void {
     // Register 'realtimeConfigManager' (singleton)
     container.singleton('realtimeConfigManager', () => {
       return new RealtimeConfigManager(systemDataDir);
     });

     // Register 'realtimeServer' (singleton)
     container.singleton('realtimeServer', (c) => {
       const logger = c.resolve<Logger>('logger');
       const hookSystem = c.resolve<HookSystem>('hooks');
       const authService = c.resolve<AuthService>('auth');
       const configManager = c.resolve<RealtimeConfigManager>('realtimeConfigManager');

       return new RealtimeServer(
         logger,
         hookSystem,
         authService,
         configManager,
         config
       );
     });

     // Register 'realtimeRoomManager' (singleton)
     container.singleton('realtimeRoomManager', (c) => {
       const logger = c.resolve<Logger>('logger');
       const server = c.resolve<RealtimeServer>('realtimeServer');
       return new RoomManager(logger, server);
     });
   }
   ```

3. **Configuration**: Uses `.system-data/realtime.yml` for configuration via
   `RealtimeConfigManager`:

   ```yaml
   realtime:
     enabled: true
     port: 3001
     host: '0.0.0.0'
     path: '/realtime'
     rooms:
       max_rooms: 100
       cleanup_timeout: 3600
     snapshots:
       enabled: true
       interval: 300
       max_updates: 100
     rate_limiting:
       messages_per_second: 10
       connections_per_ip: 100
       connections_per_user: 10
   ```

4. **Error Handling**: Domain-specific errors extending `CivicPressError`:

   ```typescript
   // modules/realtime/src/errors/realtime-errors.ts
   import {
     CivicPressError,
     NotFoundError,
     ValidationError
   } from '@civicpress/core/errors';

   export class RoomNotFoundError extends NotFoundError {
     code = 'ROOM_NOT_FOUND';
   }

   export class ConnectionLimitExceededError extends ValidationError {
     code = 'CONNECTION_LIMIT_EXCEEDED';
     statusCode = 429;
   }
   ```

5. **Initialization & Shutdown**: Lifecycle management:

   ```typescript
   export class RealtimeServer {
     async initialize(): Promise<void> {
       // Load configuration
       // Start WebSocket server
       // Register room types
       // Setup health checks
     }

     async shutdown(): Promise<void> {
       // Close connections gracefully
       // Save pending snapshots
       // Cleanup resources
     }
   }
   ```

6. **Hook System Integration**: Emits events for workflow integration:

   ```typescript
   // Hook events emitted
   - 'realtime:room:created'
   - 'realtime:room:destroyed'
   - 'realtime:client:connected'
   - 'realtime:client:disconnected'
   - 'realtime:snapshot:saved'
   ```

### Current Status

- ⚠️ **Spec Incomplete**: Missing module integration sections
- ⚠️ **Not Yet Implemented**: Planned for v3 editor
- ✅ **Architecture Defined**: See `docs/specs/realtime-architecture.md`
- ⚠️ **Gaps Identified**: See `docs/specs/realtime-architecture-GAPS.md`

### Lessons for Module Development

1. **Complete Spec First**: Ensure module integration sections are complete
   before implementation
2. **Follow Storage Pattern**: Use Storage module as template for new modules
3. **Document Dependencies**: Explicitly list all core service dependencies
4. **Error Hierarchy**: Define domain-specific errors extending
   `CivicPressError`
5. **Configuration Management**: Use config manager pattern for module settings
6. **Lifecycle Management**: Document initialization and shutdown procedures

## Related Documentation

- [Architecture Overview](architecture.md) - Core architecture
- [Dependency Injection Guide](dependency-injection-guide.md) - DI container
  usage
- [Error Handling](error-handling.md) - Error handling patterns
- [Storage System](uuid-storage-system.md) - Storage module details
- [Realtime Architecture](../specs/realtime-architecture.md) - Realtime module
  specification
- [Realtime Gaps Analysis](../specs/realtime-architecture-GAPS.md) - Identified
  gaps in realtime spec

---

## Module Spec Template

A complete module specification template is available at
[`docs/specs/module-spec-template.md`](../specs/module-spec-template.md). This
template is based on the complete realtime module specification and includes all
required sections for module integration.

**Key Sections in Template**:

- Module Integration (Service Registration)
- Configuration Management
- Error Handling
- Initialization & Lifecycle
- Hook System Integration
- Logging Patterns

**Usage**: Copy the template and fill in module-specific details while following
established CivicPress patterns.

## Related Documentation

- [Architecture Overview](architecture.md) - Core architecture
- [Dependency Injection Guide](dependency-injection-guide.md) - DI container
  usage
- [Error Handling](error-handling.md) - Error handling patterns
- [Storage System](uuid-storage-system.md) - Storage module details
- [Realtime Architecture](../specs/realtime-architecture.md) - Realtime module
  specification (complete example)
- [Realtime Gaps Analysis](../specs/realtime-architecture-GAPS.md) - Identified
  gaps in realtime spec
- [Module Spec Template](../specs/module-spec-template.md) - Template for new
  module specifications

---

**Status**: Active  
**Last Updated**: 2025-01-30  
**Next Review**: After realtime module implementation
