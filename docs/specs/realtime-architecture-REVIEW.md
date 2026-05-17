# Realtime Module Spec Review - Gaps & Improvements

**Date**: 2025-01-30  
**Reviewer**: Architecture Analysis  
**Status**: Complete Review

---

## Executive Summary

The `realtime-architecture.md` spec is **well-structured** but **missing
critical module integration details** that are essential for implementation.
This review identifies gaps and provides recommendations to align with
CivicPress module integration patterns.

---

## ✅ What's Complete

1. **Architecture & Design**: Clear separation of concerns, room model, protocol
2. **WebSocket Protocol**: Detailed message types and lifecycle
3. **Authentication & Authorization**: Token validation, permission checking
4. **Performance & Scaling**: Memory management, scaling considerations
5. **Testing Strategy**: Unit, integration, E2E, performance tests
6. **Security**: Rate limiting, WSS, connection limits

---

## ❌ Critical Gaps Identified

### 1. **Service Registration & DI Container Integration** ⚠️ CRITICAL

**Missing**:

- How services are registered in DI container
- Service registration function pattern
- Service dependencies and resolution
- Service lifecycle (initialization, shutdown)

**Impact**: Cannot implement without knowing integration pattern

**Recommendation**: Add section following `registerStorageServices()` pattern

---

### 2. **Error Handling Pattern** ⚠️ CRITICAL

**Missing**:

- Error hierarchy (extending `CivicPressError`)
- Domain-specific error classes
- Correlation IDs for error tracing
- Integration with unified error handling

**Current**: Generic error messages mentioned, no error class definitions

**Recommendation**: Define error hierarchy following CivicPress pattern

---

### 3. **Configuration Management** ⚠️ HIGH

**Missing**:

- Configuration file location (`.system-data/realtime.yml` or
  `.civic/realtime.yml`?)
- Configuration structure and defaults
- Configuration loading pattern
- Configuration validation

**Current**: Mentions `realtime.yml` but no structure defined

**Recommendation**: Define configuration schema and loading pattern

---

### 4. **Module Initialization & Shutdown** ⚠️ HIGH

**Missing**:

- Module initialization sequence
- Service initialization order
- Graceful shutdown procedure
- Resource cleanup

**Current**: No lifecycle management defined

**Recommendation**: Add initialization and shutdown lifecycle

---

### 5. **Core Service Dependencies** ⚠️ HIGH

**Missing**:

- Explicit list of core services used
- How services are resolved (DI container)
- Service dependencies diagram
- Integration points with core

**Current**: Mentions using `api` but not how

**Recommendation**: Document all core service dependencies

---

### 6. **Logging & Output Functions** ⚠️ MEDIUM

**Missing**:

- Use of centralized output functions (`coreInfo`, `coreError`, etc.)
- Logging patterns and levels
- Structured logging format
- Integration with core logging

**Current**: No logging patterns defined

**Recommendation**: Use centralized output functions, not `console.log`

---

### 7. **Hook System Integration** ⚠️ MEDIUM

**Missing**:

- Hook events emitted by realtime module
- Hook event structure
- Integration with workflow engine
- Event-driven patterns

**Current**: No hook integration mentioned

**Recommendation**: Document hook events for room lifecycle, connection events

---

### 8. **Database Integration** ⚠️ MEDIUM

**Missing**:

- Database schema for snapshots (if stored in DB)
- Database service usage pattern
- Migration strategy
- Query patterns

**Current**: Mentions snapshots but not storage mechanism

**Recommendation**: Define snapshot storage (DB vs file system)

---

### 9. **API Integration Points** ⚠️ MEDIUM

**Missing**:

- How realtime calls API endpoints
- Internal vs external API calls
- Service account authentication
- API client pattern

**Current**: Mentions API endpoints but not integration pattern

**Recommendation**: Document API integration pattern

---

### 10. **Room Type Extension Pattern** ⚠️ MEDIUM

**Missing**:

- How to add new room types (e.g., `device:<deviceId>` for broadcast-box)
- Room type registration pattern
- Room type factory pattern
- Extension mechanism

**Current**: Mentions future room types but no extension pattern

**Recommendation**: Define extensible room type system

---

## 🔧 Recommended Additions

### 1. Service Registration Section

```typescript
// modules/realtime/src/realtime-services.ts
export function registerRealtimeServices(
  container: ServiceContainer,
  config: CivicPressConfig
): void {
  // Register RealtimeServer (singleton)
  container.singleton('realtimeServer', (c) => {
    const logger = c.resolve<Logger>('logger');
    const hookSystem = c.resolve<HookSystem>('hooks');
    const authService = c.resolve<AuthService>('auth');
    return new RealtimeServer(logger, hookSystem, authService, config);
  });

  // Register RoomManager (singleton)
  container.singleton('realtimeRoomManager', (c) => {
    const logger = c.resolve<Logger>('logger');
    const server = c.resolve<RealtimeServer>('realtimeServer');
    return new RoomManager(logger, server);
  });
}
```

### 2. Error Handling Section

```typescript
// modules/realtime/src/errors/realtime-errors.ts
export class RealtimeError extends CivicPressError {
  code = 'REALTIME_ERROR';
  statusCode = 500;
}

export class RoomNotFoundError extends NotFoundError {
  code = 'ROOM_NOT_FOUND';
}

export class ConnectionLimitExceededError extends ValidationError {
  code = 'CONNECTION_LIMIT_EXCEEDED';
  statusCode = 429;
}
```

### 3. Configuration Section

```yaml
# .system-data/realtime.yml
realtime:
  enabled: true
  port: 3001
  host: '0.0.0.0'
  path: '/realtime'

  rooms:
    max_rooms: 100
    cleanup_timeout: 3600  # seconds

  snapshots:
    enabled: true
    interval: 300  # seconds
    max_updates: 100
    storage: 'database'  # 'database' or 'filesystem'

  rate_limiting:
    messages_per_second: 10
    connections_per_ip: 100
    connections_per_user: 10
```

### 4. Initialization & Shutdown Section

```typescript
export class RealtimeServer {
  async initialize(): Promise<void> {
    // Load configuration
    // Start WebSocket server
    // Register room types
    // Setup health checks
  }

  async shutdown(): Promise<void> {
    // Close all connections gracefully
    // Save pending snapshots
    // Cleanup rooms
    // Close server
  }
}
```

### 5. Hook Events Section

```typescript
// Hook events emitted by realtime module
- 'realtime:room:created' - When a room is created
- 'realtime:room:destroyed' - When a room is destroyed
- 'realtime:client:connected' - When client connects
- 'realtime:client:disconnected' - When client disconnects
- 'realtime:snapshot:saved' - When snapshot is saved
```

---

## 📋 Missing Sections Checklist

- [ ] Service Registration & DI Container Integration
- [ ] Error Handling (Error Hierarchy)
- [ ] Configuration Management
- [ ] Module Initialization & Shutdown Lifecycle
- [ ] Core Service Dependencies
- [ ] Logging & Output Functions
- [ ] Hook System Integration
- [ ] Database Integration (for snapshots)
- [ ] API Integration Pattern
- [ ] Room Type Extension Mechanism
- [ ] Service Discovery Pattern
- [ ] Health Check Endpoints
- [ ] Metrics & Observability Integration

---

## 🎯 Priority Recommendations

### **P0 (Must Have Before Implementation)**

1. **Service Registration Pattern** - Cannot implement without this
2. **Error Handling Hierarchy** - Required for consistent error handling
3. **Configuration Management** - Required for deployment
4. **Initialization/Shutdown Lifecycle** - Required for proper resource
   management

### **P1 (Should Have)**

5. **Core Service Dependencies** - Required for integration
6. **Logging Patterns** - Required for debugging and operations
7. **Hook System Integration** - Required for workflow integration

### **P2 (Nice to Have)**

8. **Database Integration** - If snapshots stored in DB
9. **API Integration Pattern** - For clarity
10. **Room Type Extension** - For future extensibility

---

## 📝 Recommended Spec Structure

Add these sections to `realtime-architecture.md`:

1. **Module Integration** (NEW)
   - Service Registration
   - DI Container Integration
   - Core Service Dependencies

2. **Configuration** (NEW)
   - Configuration File Structure
   - Configuration Loading
   - Default Values

3. **Error Handling** (NEW)
   - Error Hierarchy
   - Error Codes
   - Error Response Format

4. **Initialization & Lifecycle** (NEW)
   - Module Initialization
   - Service Startup Sequence
   - Graceful Shutdown

5. **Hook System Integration** (NEW)
   - Hook Events Emitted
   - Hook Event Structure
   - Workflow Integration

6. **Logging & Observability** (ENHANCE)
   - Centralized Output Functions
   - Logging Patterns
   - Metrics Integration

7. **Room Type Extension** (ENHANCE)
   - Room Type Registration
   - Extension Pattern
   - Factory Pattern

---

## 🔍 Comparison with Storage Module

The Storage module (`modules/storage`) is a **complete example** of proper
module integration:

✅ **Has**:

- `registerStorageServices()` function
- DI container integration
- Configuration management (`StorageConfigManager`)
- Error handling (extends `CivicPressError`)
- Lazy initialization pattern
- Service dependencies documented

❌ **Realtime spec missing**:

- All of the above

**Recommendation**: Use Storage module as template for realtime module
integration.

---

## 🚀 Next Steps

1. **Update realtime-architecture.md** with missing sections
2. **Use as template** for broadcast-box module integration
3. **Update module-integration-guide.md** with realtime example
4. **Create module spec template** based on complete realtime spec

---

**Status**: Review Complete  
**Action Required**: Update spec with missing sections before implementation
