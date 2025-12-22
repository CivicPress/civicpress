# CivicPress Module Specification Template

**Purpose**: Template for creating new module specifications  
**Based On**: Complete realtime-architecture.md specification  
**Last Updated**: 2025-01-30

---

## How to Use This Template

1. Copy this template to create a new module spec
2. Fill in all sections marked with `[TODO]`
3. Remove sections that don't apply to your module
4. Follow the patterns established in `realtime-architecture.md` and `storage`
   module
5. Ensure all integration sections are complete before implementation

---

# CivicPress Spec: `[module-name].md`

---

version: 1.0.0  
status: draft  
created: '[YYYY-MM-DD]'  
updated: '[YYYY-MM-DD]'  
deprecated: false  
sunset_date: null  
breaking_changes: []  
additions:

- [Feature 1]
- [Feature 2] fixes: []  
  migration_guide: null  
  compatibility: min_civicpress: '1.0.0'  
   max_civicpress: null  
  dependencies:
- '[related-spec.md: >=1.0.0]' authors:
- 'Core Team <team@civicpress.io>'  
  reviewers: []

---

## Name

`[module-name]` — [Brief description of module]

## Purpose

[Define the design and responsibilities of the `modules/[module-name]` service]

[Explain what the module provides and its role in CivicPress]

## Scope & Responsibilities

Responsibilities:

- [Responsibility 1]
- [Responsibility 2]
- [Responsibility 3]

Out of Scope:

- [What the module does NOT do]
- [What other modules handle]

## Inputs & Outputs

| Input     | Description   |
| --------- | ------------- |
| [Input 1] | [Description] |
| [Input 2] | [Description] |

| Output     | Description   |
| ---------- | ------------- |
| [Output 1] | [Description] |
| [Output 2] | [Description] |

## File/Folder Location

```
modules/[module-name]/
├── src/
│   ├── [module-name]-services.ts      # Service registration
│   ├── [module-name]-config-manager.ts # Configuration management
│   ├── [main-service].ts              # Main service
│   ├── errors/
│   │   └── [module-name]-errors.ts    # Error hierarchy
│   └── types/
│       └── [module-name].types.ts      # TypeScript types
├── package.json
└── tsconfig.json

tests/
└── [module-name]/
  ├── [main-service].test.ts
  └── [integration].test.ts
```

## Module Integration

The [module-name] module integrates with CivicPress core using **Pattern 2
(Service Registration)** from the Module Integration Guide.

### Service Registration

Services are registered in the CivicPress DI container during core
initialization:

**File**: `modules/[module-name]/src/[module-name]-services.ts`

```typescript
import {
  ServiceContainer,
  CivicPressConfig,
  Logger,
  // Add other core service dependencies
} from '@civicpress/core';
import { [MainService] } from './[main-service].js';
import { [ConfigManager] } from './[module-name]-config-manager.js';

export function register[ModuleName]Services(
  container: ServiceContainer,
  config: CivicPressConfig
): void {
  const systemDataDir = config.dataDir || '.system-data';

  // Register '[moduleName]ConfigManager' (singleton)
  container.singleton('[moduleName]ConfigManager', () => {
    return new [ConfigManager](systemDataDir);
  });

  // Register '[moduleName]Service' (singleton)
  container.singleton('[moduleName]Service', (c) => {
    const logger = c.resolve<Logger>('logger');
    const configManager = c.resolve<[ConfigManager]>('[moduleName]ConfigManager');

    return new [MainService](
      logger,
      configManager,
      config
    );
  });
}
```

**Integration Point**: In `core/src/civic-core-services.ts`:

```typescript
// Register [module-name] module services if available
try {
  const [moduleName]Module = await import('@civicpress/[module-name]/[module-name]-services');
  if ([moduleName]Module?.register[ModuleName]Services) {
    [moduleName]Module.register[ModuleName]Services(container, config);
  }
} catch (error) {
  // Module not available - optional module
  logger.debug('[Module-name] module not available');
}
```

### Core Service Dependencies

The [module-name] module depends on the following core services:

| Service          | Purpose           | Required |
| ---------------- | ----------------- | -------- |
| `Logger`         | Logging utilities | ✅ Yes   |
| `[OtherService]` | [Purpose]         | [Yes/No] |

**Service Resolution**: Services are resolved from the DI container:

```typescript
const logger = container.resolve<Logger>('logger');
const [otherService] = container.resolve<[OtherService]>('[otherService]');
```

### Service Access Pattern

Services are accessed via the DI container:

```typescript
// In API routes or other modules
const [service] = civicPress.getService<[MainService]>('[moduleName]Service');
```

## Configuration

The [module-name] module uses a configuration file for deployment-specific
settings.

### Configuration File

**Location**: `.system-data/[module-name].yml`

**Structure**:

```yaml
[module-name]:
  enabled: true
  [setting1]: [value1]
  [setting2]: [value2]
```

### Configuration Loading

Uses `[ConfigManager]` pattern similar to `StorageConfigManager`:

```typescript
// modules/[module-name]/src/[module-name]-config-manager.ts
export class [ConfigManager] {
  private configPath: string;
  private logger: Logger;
  private defaultConfig: [ModuleConfig];

  constructor(basePath: string = '.system-data') {
    this.configPath = path.join(basePath, '[module-name].yml');
    this.logger = new Logger();
    this.defaultConfig = { /* defaults */ };
  }

  async loadConfig(): Promise<[ModuleConfig]> {
    // Load from file, merge with defaults
  }

  getDefaultConfig(): [ModuleConfig] {
    return this.defaultConfig;
  }
}
```

## Error Handling

All [module-name] errors extend the CivicPress error hierarchy.

### Error Hierarchy

```typescript
// modules/[module-name]/src/errors/[module-name]-errors.ts
import {
  CivicPressError,
  NotFoundError,
  ValidationError,
  // Add other base errors as needed
} from '@civicpress/core/errors';

export class [ModuleName]Error extends CivicPressError {
  code = '[MODULE_NAME]_ERROR';
  statusCode = 500;
}

export class [Specific]NotFoundError extends NotFoundError {
  code = '[SPECIFIC]_NOT_FOUND';

  constructor([id]: string, context?: Record<string, any>) {
    super(`[Specific] '[${id}]' not found`, { [id], ...context });
  }
}

// Add other domain-specific errors
```

### Error Response Format

Errors follow the unified CivicPress error format:

```json
{
  "error": {
    "code": "[ERROR_CODE]",
    "message": "[Error message]",
    "statusCode": 404,
    "correlationId": "abc-123-def",
    "context": {
      "[contextKey]": "[contextValue]"
    }
  }
}
```

## Initialization & Lifecycle

The [module-name] module follows a clear initialization and shutdown lifecycle.

### Module Initialization

Initialization sequence:

1. **Service Registration** (synchronous)
   - Services registered in DI container during core initialization
   - Configuration manager created
   - Service instances created (not yet started)

2. **Service Initialization** (asynchronous)

   ```typescript
   export class [MainService] {
     async initialize(): Promise<void> {
       // 1. Load configuration
       const config = await this.configManager.loadConfig();

       // 2. Validate configuration
       this.validateConfig(config);

       // 3. Initialize service
       await this.startService(config);

       // 4. Register hooks (if applicable)
       this.registerHooks();

       this.logger.info('[Module-name] service initialized');
     }
   }
   ```

3. **Initialization Order**
   - Core services initialized first
   - [Module-name] services initialized after core services

### Graceful Shutdown

Shutdown procedure:

```typescript
export class [MainService] {
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down [module-name] service...');

    // 1. Stop accepting new requests
    // 2. Complete in-flight operations
    // 3. Cleanup resources
    // 4. Close connections

    this.logger.info('[Module-name] service shut down');
  }
}
```

## Hook System Integration

[If applicable] The [module-name] module emits hook events for workflow
integration.

### Hook Events Emitted

| Event                   | Description   | Payload               |
| ----------------------- | ------------- | --------------------- |
| `[module-name]:[event]` | [Description] | `{ [field]: [type] }` |

### Hook Event Structure

```typescript
// Example: [module-name]:[event]
{
  event: '[module-name]:[event]',
  timestamp: 1701705600000,
  data: {
    [field]: [value],
  },
  correlationId: 'abc-123-def',
}
```

## Logging Patterns

The [module-name] module uses the core `Logger` service for consistent logging.

### Logging Usage

```typescript
import { Logger } from '@civicpress/core';

export class [MainService] {
  constructor(private logger: Logger) {}

  async [operation]() {
    this.logger.info('[Operation description]', {
      [contextKey]: [contextValue],
      operation: '[module-name]:[operation]',
      timestamp: Date.now(),
    });
  }
}
```

### Log Levels

- **`info`**: Normal operations, lifecycle events
- **`warn`**: Warnings, non-critical errors
- **`error`**: Errors, failures
- **`debug`**: Detailed debugging (verbose mode only)

## Design Principles

1. **[Principle 1]**
2. **[Principle 2]**
3. **[Principle 3]**

## High-Level Architecture

### Components

- `modules/[module-name]`
  - [Description]
- `modules/api`
  - [Integration description]

### Typical Flow

1. [Step 1]
2. [Step 2]
3. [Step 3]

## Module Boundaries

### [Module] ←→ [Other Module]

- Transport: [HTTP/WebSocket/etc.]
- Protocol: [Description]

## [Feature/Protocol Specification]

[Detailed specification of main features/protocols]

## Testing & Validation

### Unit Tests

- [Test category 1]
- [Test category 2]

### Integration Tests

- [Integration scenario 1]
- [Integration scenario 2]

### E2E Tests

- [E2E scenario 1]
- [E2E scenario 2]

## Deployment and Scaling

### Minimal Setup

[Single-node deployment description]

### Future Scaling

[Multi-node deployment description]

## Security & Trust Considerations

- [Security consideration 1]
- [Security consideration 2]

## Related Specs

- [`[related-spec-1].md`](./[related-spec-1].md) — [Description]
- [`[related-spec-2].md`](./[related-spec-2].md) — [Description]

## Open Questions

- [Question 1]
- [Question 2]

## History

- Created: [YYYY-MM-DD] — Initial specification for [module-name] module

---

**Template Version**: 1.0.0  
**Last Updated**: 2025-01-30  
**Based On**: `realtime-architecture.md` (complete specification)
