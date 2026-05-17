# Realtime Module Integration Checklist

**Purpose**: Ensure realtime module spec is complete before implementation  
**Based On**: Storage module integration pattern  
**Status**: Template for module spec completion

---

## ✅ Spec Completeness Checklist

### Core Sections (Required)

- [x] **Module Overview** - Purpose, scope, responsibilities
- [x] **Architecture & Design** - High-level design, components
- [x] **File/Folder Location** - Module structure
- [ ] **Module Integration** - Service registration, DI container
- [ ] **Service Registration** - `registerRealtimeServices()` function
- [ ] **Configuration Management** - Config file, schema, loading
- [ ] **Error Handling** - Error hierarchy, error classes
- [ ] **Initialization & Lifecycle** - Startup, shutdown procedures
- [x] **API/Protocol Specification** - WebSocket protocol, messages
- [x] **Testing Strategy** - Unit, integration, E2E tests
- [x] **Deployment & Scaling** - Deployment patterns, scaling
- [x] **Security** - Authentication, authorization, rate limiting

### Integration Sections (Required)

- [ ] **Core Service Dependencies** - List of core services used
- [ ] **DI Container Integration** - How services are registered
- [ ] **Hook System Integration** - Events emitted, event structure
- [ ] **Logging Patterns** - Use of Logger, structured logging
- [ ] **Database Integration** - Snapshot storage (if applicable)
- [ ] **API Integration Pattern** - How realtime calls API endpoints

### Extension Sections (Optional but Recommended)

- [ ] **Room Type Extension** - How to add new room types
- [ ] **Health Check Endpoints** - Health monitoring
- [ ] **Metrics & Observability** - Metrics exposed, monitoring

---

## 📋 Required Additions to Spec

### 1. Module Integration Section

**Location**: After "File/Folder Location" section

**Content**:

- Service registration function signature
- DI container integration pattern
- Service key naming conventions
- Integration with core initialization

**Reference**: `docs/module-integration-guide.md` - Storage Module Integration

---

### 2. Configuration Section

**Location**: After "Module Integration" section

**Content**:

- Configuration file location (`.system-data/realtime.yml`)
- Configuration schema/structure
- Default values
- Configuration loading pattern
- Configuration validation

**Reference**: `modules/storage/src/storage-config-manager.ts`

---

### 3. Error Handling Section

**Location**: After "Configuration" section

**Content**:

- Error hierarchy (extending `CivicPressError`)
- Domain-specific error classes
- Error codes and status codes
- Correlation ID integration

**Reference**: `core/src/errors/domain-errors.ts`

---

### 4. Initialization & Lifecycle Section

**Location**: After "Error Handling" section

**Content**:

- Module initialization sequence
- Service startup order
- Graceful shutdown procedure
- Resource cleanup

**Reference**: `CivicPress.initialize()` and `CivicPress.shutdown()`

---

### 5. Core Service Dependencies Section

**Location**: After "Initialization & Lifecycle" section

**Content**:

- Explicit list of core services
- Service resolution pattern
- Dependency diagram
- Integration points

**Services to Document**:

- `Logger` - Logging utilities
- `HookSystem` - Event emission
- `AuthService` - Authentication
- `DatabaseService` - Snapshot storage (optional)
- `UnifiedCacheManager` - Caching (optional)

---

### 6. Hook System Integration Section

**Location**: After "Core Service Dependencies" section

**Content**:

- Hook events emitted by realtime module
- Hook event structure
- Integration with workflow engine
- Event-driven patterns

**Hook Events**:

- `realtime:room:created`
- `realtime:room:destroyed`
- `realtime:client:connected`
- `realtime:client:disconnected`
- `realtime:snapshot:saved`

---

### 7. Logging Patterns Section

**Location**: After "Hook System Integration" section

**Content**:

- Use of `Logger` from core (not `console.log`)
- Structured logging format
- Log levels and contexts
- Integration with core logging

**Reference**: `modules/storage/src/storage-config-manager.ts` (uses `Logger`)

---

## 🔧 Implementation Template

### Service Registration Template

```typescript
// modules/realtime/src/realtime-services.ts
import {
  ServiceContainer,
  CivicPressConfig,
  Logger,
  HookSystem,
  AuthService,
  DatabaseService,
} from '@civicpress/core';
import { RealtimeServer } from './realtime-server.js';
import { RoomManager } from './rooms/room-manager.js';
import { RealtimeConfigManager } from './realtime-config-manager.js';

export function registerRealtimeServices(
  container: ServiceContainer,
  config: CivicPressConfig
): void {
  const systemDataDir = config.dataDir || '.system-data';

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

### Error Handling Template

```typescript
// modules/realtime/src/errors/realtime-errors.ts
import {
  CivicPressError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
} from '@civicpress/core/errors';

export class RealtimeError extends CivicPressError {
  code = 'REALTIME_ERROR';
  statusCode = 500;
}

export class RoomNotFoundError extends NotFoundError {
  code = 'ROOM_NOT_FOUND';

  constructor(roomId: string, context?: Record<string, any>) {
    super(`Room '${roomId}' not found`, { roomId, ...context });
  }
}

export class ConnectionLimitExceededError extends ValidationError {
  code = 'CONNECTION_LIMIT_EXCEEDED';
  statusCode = 429;

  constructor(limit: number, context?: Record<string, any>) {
    super(`Connection limit exceeded: ${limit}`, { limit, ...context });
  }
}

export class InvalidYjsUpdateError extends ValidationError {
  code = 'INVALID_YJS_UPDATE';

  constructor(message: string, context?: Record<string, any>) {
    super(`Invalid yjs update: ${message}`, context);
  }
}
```

### Configuration Manager Template

```typescript
// modules/realtime/src/realtime-config-manager.ts
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import { Logger } from '@civicpress/core';
import { RealtimeConfig } from './types/realtime.types.js';

export class RealtimeConfigManager {
  private configPath: string;
  private logger: Logger;
  private defaultConfig: RealtimeConfig;

  constructor(basePath: string = '.system-data') {
    this.configPath = path.join(basePath, 'realtime.yml');
    this.logger = new Logger();

    this.defaultConfig = {
      enabled: true,
      port: 3001,
      host: '0.0.0.0',
      path: '/realtime',
      rooms: {
        max_rooms: 100,
        cleanup_timeout: 3600,
      },
      snapshots: {
        enabled: true,
        interval: 300,
        max_updates: 100,
        storage: 'database',
      },
      rate_limiting: {
        messages_per_second: 10,
        connections_per_ip: 100,
        connections_per_user: 10,
      },
    };
  }

  async loadConfig(): Promise<RealtimeConfig> {
    // Similar to StorageConfigManager pattern
  }

  getDefaultConfig(): RealtimeConfig {
    return this.defaultConfig;
  }
}
```

---

## 📊 Completion Status

| Section                        | Status         | Priority | Notes                     |
| ------------------------------ | -------------- | -------- | ------------------------- |
| Module Overview                | ✅ Complete    | P0       | Present in spec           |
| Architecture                   | ✅ Complete    | P0       | Present in spec           |
| File/Folder Location           | ✅ Complete    | P0       | Present in spec           |
| **Module Integration**         | ❌ **Missing** | **P0**   | **Must add**              |
| **Service Registration**       | ❌ **Missing** | **P0**   | **Must add**              |
| **Configuration**              | ⚠️ **Partial** | **P0**   | **Must complete**         |
| **Error Handling**             | ❌ **Missing** | **P0**   | **Must add**              |
| **Initialization & Lifecycle** | ❌ **Missing** | **P0**   | **Must add**              |
| API/Protocol                   | ✅ Complete    | P0       | Present in spec           |
| Testing Strategy               | ✅ Complete    | P1       | Present in spec           |
| Deployment                     | ✅ Complete    | P1       | Present in spec           |
| Security                       | ✅ Complete    | P1       | Present in spec           |
| **Core Dependencies**          | ❌ **Missing** | **P1**   | **Should add**            |
| **Hook Integration**           | ❌ **Missing** | **P1**   | **Should add**            |
| **Logging Patterns**           | ❌ **Missing** | **P1**   | **Should add**            |
| Database Integration           | ⚠️ Partial     | P2       | Mentions but not detailed |
| API Integration                | ⚠️ Partial     | P2       | Mentions but not detailed |
| Room Type Extension            | ⚠️ Partial     | P2       | Mentions but not detailed |

**Overall Completion**: ~70%  
**Blockers**: 5 missing P0 sections  
**Recommendation**: Complete P0 sections before implementation

---

## 🎯 Next Steps

1. **Update realtime-architecture.md** with missing sections
2. **Use as template** for broadcast-box module spec
3. **Update module-integration-guide.md** with realtime example (✅ Done)
4. **Create module spec template** based on complete realtime spec

---

**Status**: Checklist Complete  
**Action Required**: Update realtime spec with missing sections
