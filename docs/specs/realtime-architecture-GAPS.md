# Realtime Module Spec - Critical Gaps Analysis

**Date**: 2025-01-30  
**Reviewer**: Top 0.1% Senior Engineer Analysis  
**Status**: Complete Gap Analysis

---

## Executive Summary

The `realtime-architecture.md` spec is **architecturally sound** but **missing
essential module integration details** required for implementation. This
analysis identifies **10 critical gaps** that must be addressed before
implementation can begin.

**Verdict**: Spec is **70% complete** - needs module integration sections added.

---

## Critical Gaps (P0 - Must Fix)

### Gap 1: Service Registration & DI Container Integration ❌

**What's Missing**:

- Service registration function (`registerRealtimeServices()`)
- DI container integration pattern
- Service dependencies and resolution
- Service key naming conventions

**Impact**: **BLOCKER** - Cannot implement without this

**Current State**: Spec mentions services but no registration pattern

**Required Addition**:

```typescript
// modules/realtime/src/realtime-services.ts
export function registerRealtimeServices(
  container: ServiceContainer,
  config: CivicPressConfig
): void {
  // Register RealtimeServer
  container.singleton('realtimeServer', (c) => {
    const logger = c.resolve<Logger>('logger');
    const hookSystem = c.resolve<HookSystem>('hooks');
    const authService = c.resolve<AuthService>('auth');
    const db = c.resolve<DatabaseService>('database');
    return new RealtimeServer(logger, hookSystem, authService, db, config);
  });

  // Register RoomManager
  container.singleton('realtimeRoomManager', (c) => {
    const logger = c.resolve<Logger>('logger');
    const server = c.resolve<RealtimeServer>('realtimeServer');
    return new RoomManager(logger, server);
  });
}
```

**Reference**: See `modules/storage/src/storage-services.ts` for pattern

---

### Gap 2: Error Handling Hierarchy ❌

**What's Missing**:

- Error classes extending `CivicPressError`
- Domain-specific error types
- Error codes and status codes
- Correlation ID integration

**Impact**: **BLOCKER** - Required for unified error handling

**Current State**: Generic error messages, no error classes

**Required Addition**:

```typescript
// modules/realtime/src/errors/realtime-errors.ts
import {
  CivicPressError,
  NotFoundError,
  ValidationError,
  UnauthorizedError
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
}

export class InvalidYjsUpdateError extends ValidationError {
  code = 'INVALID_YJS_UPDATE';
}
```

**Reference**: See `core/src/errors/domain-errors.ts` for pattern

---

### Gap 3: Configuration Management ❌

**What's Missing**:

- Configuration file location (`.system-data/realtime.yml`?)
- Configuration schema/structure
- Configuration loading pattern
- Default configuration values
- Configuration validation

**Impact**: **BLOCKER** - Required for deployment

**Current State**: Mentions `realtime.yml` but no structure

**Required Addition**:

```typescript
// modules/realtime/src/realtime-config-manager.ts
export interface RealtimeConfig {
  enabled: boolean;
  port: number;
  host: string;
  path: string;
  rooms: {
    max_rooms: number;
    cleanup_timeout: number;
  };
  snapshots: {
    enabled: boolean;
    interval: number;
    max_updates: number;
    storage: 'database' | 'filesystem';
  };
  rate_limiting: {
    messages_per_second: number;
    connections_per_ip: number;
    connections_per_user: number;
  };
}

export class RealtimeConfigManager {
  // Similar to StorageConfigManager pattern
}
```

**Reference**: See `modules/storage/src/storage-config-manager.ts` for pattern

---

### Gap 4: Module Initialization & Shutdown Lifecycle ❌

**What's Missing**:

- Initialization sequence
- Service startup order
- Graceful shutdown procedure
- Resource cleanup
- Health check initialization

**Impact**: **BLOCKER** - Required for proper lifecycle management

**Current State**: No lifecycle defined

**Required Addition**:

```typescript
export class RealtimeServer {
  async initialize(): Promise<void> {
    // 1. Load configuration
    // 2. Validate configuration
    // 3. Start WebSocket server
    // 4. Register room types
    // 5. Setup health checks
    // 6. Register hooks
  }

  async shutdown(): Promise<void> {
    // 1. Stop accepting new connections
    // 2. Close existing connections gracefully
    // 3. Save pending snapshots
    // 4. Cleanup rooms
    // 5. Close server
  }
}
```

**Reference**: See `CivicPress.initialize()` and `CivicPress.shutdown()` for
pattern

---

## High Priority Gaps (P1 - Should Fix)

### Gap 5: Core Service Dependencies

**What's Missing**:

- Explicit list of core services used
- Service resolution pattern
- Dependency diagram
- Integration points

**Required**: Document all dependencies:

- `Logger` - Logging
- `HookSystem` - Event emission
- `AuthService` - Authentication
- `DatabaseService` - Snapshot storage (if DB)
- `UnifiedCacheManager` - Caching (if needed)

---

### Gap 6: Logging Patterns

**What's Missing**:

- Use of `Logger` from core (not `console.log`)
- Structured logging format
- Log levels and contexts
- Integration with core logging

**Required**: Use `Logger` pattern:

```typescript
import { Logger } from '@civicpress/core';

class RealtimeServer {
  constructor(private logger: Logger) {}

  async handleConnection() {
    this.logger.info('Client connected', {
      clientId,
      roomId,
      operation: 'realtime:connection'
    });
  }
}
```

---

### Gap 7: Hook System Integration

**What's Missing**:

- Hook events emitted
- Hook event structure
- Integration with workflow engine

**Required**: Document hooks:

- `realtime:room:created`
- `realtime:room:destroyed`
- `realtime:client:connected`
- `realtime:client:disconnected`
- `realtime:snapshot:saved`

---

## Medium Priority Gaps (P2 - Nice to Have)

### Gap 8: Database Integration

**What's Missing**:

- Snapshot storage mechanism (DB vs filesystem)
- Database schema for snapshots
- Migration strategy

**Decision Needed**: Where to store snapshots?

---

### Gap 9: API Integration Pattern

**What's Missing**:

- How realtime calls API endpoints
- Internal vs external calls
- Service account pattern

**Current**: Mentions API endpoints but not integration

---

### Gap 10: Room Type Extension Mechanism

**What's Missing**:

- How to add new room types (e.g., `device:<deviceId>`)
- Room type factory pattern
- Extension registration

**Required for**: Broadcast-box integration

---

## Recommended Spec Additions

### Section 1: Module Integration (NEW)

Add after "File/Folder Location":

```markdown
## Module Integration

### Service Registration

The realtime module registers services in the CivicPress DI container:

**File**: `modules/realtime/src/realtime-services.ts`

\`\`\`typescript
export function registerRealtimeServices(
  container: ServiceContainer,
  config: CivicPressConfig
): void {
  // Register services...
}
\`\`\`

### Core Service Dependencies

- `Logger` - Logging utilities
- `HookSystem` - Event emission
- `AuthService` - Authentication validation
- `DatabaseService` - Snapshot storage (optional)
- `UnifiedCacheManager` - Caching (optional)

### Initialization

\`\`\`typescript
// In core initialization
if (realtimeModule?.registerRealtimeServices) {
  realtimeModule.registerRealtimeServices(container, config);
}
\`\`\`
```

### Section 2: Configuration (NEW)

Add after "Module Integration":

```markdown
## Configuration

### Configuration File

**Location**: `.system-data/realtime.yml`

**Structure**:

\`\`\`yaml
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
    storage: 'database'

  rate_limiting:
    messages_per_second: 10
    connections_per_ip: 100
    connections_per_user: 10
\`\`\`

### Configuration Loading

Uses `RealtimeConfigManager` pattern similar to `StorageConfigManager`.
```

### Section 3: Error Handling (NEW)

Add after "Configuration":

```markdown
## Error Handling

### Error Hierarchy

All realtime errors extend `CivicPressError`:

\`\`\`typescript
// Domain-specific errors
export class RoomNotFoundError extends NotFoundError {
  code = 'ROOM_NOT_FOUND';
}

export class ConnectionLimitExceededError extends ValidationError {
  code = 'CONNECTION_LIMIT_EXCEEDED';
  statusCode = 429;
}
\`\`\`
```

### Section 4: Initialization & Lifecycle (NEW)

Add after "Error Handling":

```markdown
## Initialization & Lifecycle

### Module Initialization

1. Service registration (DI container)
2. Configuration loading
3. WebSocket server startup
4. Room type registration
5. Health check setup

### Graceful Shutdown

1. Stop accepting connections
2. Close existing connections
3. Save pending snapshots
4. Cleanup resources
```

### Section 5: Hook System Integration (NEW)

Add after "Initialization & Lifecycle":

```markdown
## Hook System Integration

### Hook Events Emitted

- `realtime:room:created` - When room is created
- `realtime:room:destroyed` - When room is destroyed
- `realtime:client:connected` - When client connects
- `realtime:client:disconnected` - When client disconnects
- `realtime:snapshot:saved` - When snapshot is saved
```

### Section 6: Room Type Extension (ENHANCE)

Enhance "Rooms and Document Model" section:

```markdown
### Room Type Extension

The realtime module supports extensible room types:

\`\`\`typescript
// Register new room type
roomManager.registerRoomType('device', DeviceRoom);
\`\`\`

**Built-in Types**:
- `record:<recordId>` - Collaborative editing
- `device:<deviceId>` - Broadcast box devices (future)
- `consultation:<id>` - Consultations (future)
```

---

## Comparison Matrix

| Aspect               | Realtime Spec | Storage Module | Gap?    |
| -------------------- | ------------- | -------------- | ------- |
| Service Registration | ❌ Missing    | ✅ Complete    | **YES** |
| Error Handling       | ❌ Missing    | ✅ Complete    | **YES** |
| Configuration        | ⚠️ Partial    | ✅ Complete    | **YES** |
| Initialization       | ❌ Missing    | ✅ Complete    | **YES** |
| DI Container         | ❌ Missing    | ✅ Complete    | **YES** |
| Logging              | ❌ Missing    | ✅ Complete    | **YES** |
| Hook Integration     | ❌ Missing    | ⚠️ Partial     | **YES** |
| Database             | ⚠️ Partial    | ✅ Complete    | **YES** |

---

## Action Items

### Immediate (Before Implementation)

1. ✅ Add Service Registration section
2. ✅ Add Error Handling section
3. ✅ Add Configuration section
4. ✅ Add Initialization & Lifecycle section

### High Priority

5. ✅ Add Core Service Dependencies section
6. ✅ Add Logging Patterns section
7. ✅ Add Hook System Integration section

### Medium Priority

8. ⚠️ Enhance Database Integration section
9. ⚠️ Add API Integration Pattern section
10. ⚠️ Add Room Type Extension section

---

## Template for Module Specs

Based on this analysis, a complete module spec should include:

1. **Module Overview** ✅ (Present)
2. **Architecture & Design** ✅ (Present)
3. **File/Folder Location** ✅ (Present)
4. **Module Integration** ❌ (Missing)
5. **Service Registration** ❌ (Missing)
6. **Configuration** ❌ (Missing)
7. **Error Handling** ❌ (Missing)
8. **Initialization & Lifecycle** ❌ (Missing)
9. **Core Service Dependencies** ❌ (Missing)
10. **Hook System Integration** ❌ (Missing)
11. **API/Protocol Specification** ✅ (Present)
12. **Testing Strategy** ✅ (Present)
13. **Deployment & Scaling** ✅ (Present)
14. **Security** ✅ (Present)

---

**Status**: Analysis Complete  
**Recommendation**: Update spec with missing sections before implementation
