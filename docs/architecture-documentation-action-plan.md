# Architecture Documentation Action Plan

**Created:** 2025-01-30  
**Status:** Ready for Implementation  
**Priority:** High

---

## Overview

This document outlines the specific actions needed to update the CivicPress
architecture documentation to reflect the current implementation state.

---

## Phase 1: Critical Updates (High Priority)

### 1.1 Update `architecture.md` - Core Components Section

**File:** `docs/architecture.md`

**Actions:**

1. Add **Dependency Injection Container** section after "CivicPress Class"
2. Add **Unified Cache Manager** section after "Template Engine"
3. Add **Saga Pattern** section after "Record Manager"
4. Add **Unified Error Handling** section in Security Architecture
5. Update **Service Initialization** to reflect DI container usage

**Content to Add:**

#### Dependency Injection Container

````markdown
### Dependency Injection Container

**Purpose**: Centralized service management and dependency resolution

**Implementation**:
- `ServiceContainer` class with singleton, transient, and scoped lifetimes
- Centralized service registration in `registerCivicPressServices()`
- Lazy service initialization (services created on first access)
- Circular dependency detection and prevention
- Type-safe service resolution

**Benefits**:
- Improved testability (mock services via test utilities)
- Clear dependency graph (automatic circular dependency detection)
- 90% faster startup time (lazy initialization)
- Better error messages when dependencies missing

**Usage**:
```typescript
// Services registered in civic-core-services.ts
registerCivicPressServices(container, config);

// Services resolved lazily
const db = container.resolve<DatabaseService>('database');
````

**Reference**: `docs/dependency-injection-guide.md`

````

#### Unified Cache Manager

```markdown
### Unified Cache Manager

**Purpose**: Centralized caching with consistent strategies

**Implementation**:
- `UnifiedCacheManager` with strategy pattern
- `MemoryCache`: TTL-based in-memory cache with LRU eviction
- `FileWatcherCache`: File watching + manual invalidation
- Centralized registry for all caches
- Cache metrics and monitoring
- Cache warming support

**Benefits**:
- Consistent cache interface across all implementations
- Easy to swap implementations (strategy pattern)
- Centralized cache metrics and monitoring
- Memory management with size and memory limits

**Usage**:
```typescript
const cacheManager = civic.getCacheManager();
const cache = cacheManager.getCache('search');
await cache.set('key', value, { ttl: 5000 });
const value = await cache.get('key');
````

**Reference**: `docs/cache-usage-guide.md`

````

#### Saga Pattern

```markdown
### Saga Pattern for Multi-Step Operations

**Purpose**: Reliable multi-step operations across storage boundaries

**Implementation**:
- 4 sagas: `PublishDraftSaga`, `CreateRecordSaga`, `UpdateRecordSaga`, `ArchiveRecordSaga`
- State persistence, idempotency, resource locking
- Recovery and metrics collection
- Compensation logic for failures

**Why Saga, Not Transactions**:
- Git commits are authoritative history (cannot be rolled back)
- CivicPress philosophy: auditability over invisibility
- Derived state (indexing) is eventually consistent
- True distributed transactions don't work across Git/DB/filesystem boundaries

**Operations Using Saga Pattern**:
1. **PublishDraft**: Move from `record_drafts` → `records` table → file creation → Git commit
2. **CreateRecord**: Create in `records` table → file creation → Git commit
3. **UpdateRecord**: Update in `records` table → update file → Git commit
4. **ArchiveRecord**: Update status → move file → Git commit

**Reference**: `docs/saga-pattern-usage-guide.md`
````

#### Unified Error Handling

```markdown
### Unified Error Handling System

**Purpose**: Consistent error handling across all layers

**Implementation**:
- `CivicPressError` base class with domain-specific errors
- Correlation IDs for distributed tracing
- Integration with API, CLI, and Core layers
- Structured error responses

**Error Hierarchy**:
- `CivicPressError` (base class)
  - `ValidationError` (400)
  - `NotFoundError` (404)
  - `DatabaseError` (500)
  - `StorageError` (500)
  - Domain-specific errors

**Benefits**:
- Consistent error responses
- Better debugging with correlation IDs
- Type-safe error handling
- Clear error recovery paths

**Reference**: `docs/error-handling.md`
```

### 1.2 Update Service Initialization Section

**File:** `docs/architecture.md`

**Current Text:**

```markdown
### 1. CivicPress Class (`civic-core.ts`)

**Key Methods**:
- `initialize()` - Platform startup
- `shutdown()` - Platform shutdown
- `getService()` - Access individual services
- `healthCheck()` - System health monitoring
```

**Update To:**

```markdown
### 1. CivicPress Class (`civic-core.ts`)

**Key Methods**:
- `initialize()` - Platform startup (initializes DI container and services)
- `shutdown()` - Platform shutdown (shuts down cache manager and database)
- `getService<T>(key)` - Access services via DI container (preferred method)
- `getDatabaseService()`, `getAuthService()`, etc. - Backward-compatible getters
- `healthCheck()` - System health monitoring

**Service Initialization Order**:
1. DatabaseService.initialize()
2. completeServiceInitialization() (cache registration, indexing)
3. WorkflowEngine.initialize()
4. GitEngine.initialize()
5. HookSystem.initialize()

**Dependency Injection**:
All services are registered in the DI container during construction and resolved lazily on first access. This provides:
- 90% faster startup time
- Better testability
- Clear dependency graph
```

---

## Phase 2: Module Integration Documentation (High Priority)

### 2.1 Create Module Integration Guide

**File:** `docs/module-integration-guide.md` (NEW)

**Content:**

````markdown
# Module Integration Guide

## Overview

This guide explains how modules integrate with the CivicPress core platform.

## Module Architecture

CivicPress follows a modular architecture where:

- **Core Module**: Provides foundation services (DI container, database, auth, etc.)
- **Modules**: Extend core functionality (API, CLI, UI, Storage, etc.)

## Module Integration Patterns

### Pattern 1: Direct Core Dependency

Modules depend on `@civicpress/core` and use core services directly:

```typescript
import { Logger, DatabaseService } from '@civicpress/core';

class MyModuleService {
  constructor(
    private logger: Logger,
    private db: DatabaseService
  ) {}
}
````

### Pattern 2: Service Registration (Future)

Modules can register services in the DI container:

```typescript
// In module initialization
container.singleton('myModuleService', (c) => {
  const logger = c.resolve<Logger>('logger');
  const db = c.resolve<DatabaseService>('database');
  return new MyModuleService(logger, db);
});
```

### Pattern 3: Independent Initialization (Current)

Modules initialize services independently (used by Storage module):

```typescript
// In API route
async function initializeStorage(req: AuthenticatedRequest) {
  const storageConfig = await loadStorageConfig();
  const storageService = new CloudUuidStorageService(storageConfig);
  await storageService.initialize();
  return storageService;
}
```

## Storage Module Integration

The Storage module currently uses Pattern 3 (Independent Initialization):

- **Location**: `modules/storage/`
- **Dependencies**: `@civicpress/core` for types and utilities
- **Initialization**: Per-request in API routes
- **Future**: Consider DI container registration

## Module Development Guidelines

1. **Use Core Types**: Import types from `@civicpress/core`
2. **Use Core Errors**: Extend `CivicPressError` for module errors
3. **Use Core Logging**: Use `Logger` from core
4. **Follow Patterns**: Use established integration patterns
5. **Document Integration**: Document how module integrates with core

## Module Registration (Future Enhancement)

Future enhancement: Standardized module registration system:

```typescript
interface CivicPressModule {
  name: string;
  version: string;
  register(container: ServiceContainer, config: CivicPressConfig): void;
  initialize(container: ServiceContainer): Promise<void>;
  shutdown(container: ServiceContainer): Promise<void>;
}
```

````

### 2.2 Update Architecture.md - Module Structure Section

**File:** `docs/architecture.md`

**Add After "Storage Module" Section:**

```markdown
### Module Integration

**Current Pattern**: Modules depend on `@civicpress/core` and initialize services independently.

**Storage Module Example**:
- Depends on `@civicpress/core` for types and utilities
- Initializes `CloudUuidStorageService` per-request in API routes
- Uses core error types and logging

**Future Enhancement**: Standardized module registration system for DI container integration.

**Reference**: `docs/module-integration-guide.md`
````

---

## Phase 3: Missing Service Documentation (Medium Priority)

### 3.1 Document Missing Services

**Files to Create/Update:**

1. **Diagnostic Service** - `docs/services/diagnostic-service.md`
2. **Backup Service** - `docs/services/backup-service.md`
3. **Configuration Service** - `docs/services/configuration-service.md`
4. **Template Service** - `docs/services/template-service.md`
5. **Search Service** - `docs/services/search-service.md`
6. **Notification Service** - `docs/services/notification-service.md`
7. **Geography Manager** - `docs/services/geography-manager.md`

**Template for Each Service:**

```markdown
# [Service Name]

## Overview

[Service description]

## Architecture

[Service architecture]

## Integration

[How service integrates with core]

## API

[Service API]

## Configuration

[Service configuration]

## Reference

[Related documentation]
```

### 3.2 Update Architecture.md - Add Missing Services Section

**File:** `docs/architecture.md`

**Add After "Indexing Service" Section:**

```markdown
### 10. Diagnostic Service (`diagnostic-service.ts`)

**Purpose**: System health monitoring and issue detection

**Responsibilities**:
- Component-specific health checks (database, search, config, filesystem, system)
- Auto-fix capabilities for common issues
- Comprehensive diagnostic reports
- Integration with health check endpoints

**Key Features**:
- Database diagnostics (integrity, schema, indexes, FTS5)
- Search diagnostics (index sync, performance, cache)
- Configuration diagnostics (validation, migration status)
- Filesystem diagnostics (file integrity, Git health)
- System diagnostics (memory, CPU, disk space)

**Reference**: `docs/specs/diagnostic-tools.md`

### 11. Backup Service (`backup-service.ts`)

**Purpose**: Data backup and restore functionality

**Responsibilities**:
- Create compressed backups of data and local storage
- Restore backups with metadata
- Backup management and retention

**Key Features**:
- Tarball compression
- Storage file restoration
- Demo data loading via backups
- CLI commands: `civic backup create/restore`

**Reference**: `docs/backup-strategy.md`

### 12. Configuration Service (`configuration-service.ts`)

**Purpose**: Centralized configuration management

**Responsibilities**:
- Load and validate configuration files
- Provide configuration access to services
- Support configuration hot-reload
- Template handling from defaults

**Key Features**:
- Configuration discovery from `data/.civic/`
- Validation and persistence
- Template handling from `core/src/defaults/`
- Transformation between old/new config formats

**Reference**: `docs/configuration-architecture.md`

### 13. Template Service (`template-service.ts`)

**Purpose**: Template CRUD operations

**Responsibilities**:
- Template loading and caching
- Template validation
- Template CRUD operations
- Variable substitution

**Key Features**:
- File watching for automatic cache invalidation
- Security hardening (path traversal prevention)
- Template validation
- API endpoints for template management

**Reference**: `docs/template-system.md`

### 14. Search Service (`search-service.ts`)

**Purpose**: Full-text search implementation

**Responsibilities**:
- FTS5-based full-text search
- Search query parsing
- Result ranking and relevance
- Search caching

**Key Features**:
- SQLite FTS5 integration
- Multi-word queries and phrase matching
- Typo tolerance (Levenshtein distance)
- Search result caching

**Reference**: `docs/specs/search.md`

### 15. Notification Service (`notification-service.ts`)

**Purpose**: Notification delivery system

**Responsibilities**:
- Email notification delivery
- SMS notification delivery (future)
- Webhook notifications
- Notification queuing and rate limiting

**Key Features**:
- Multiple notification channels
- Rate limiting and security
- Notification templates
- Audit logging

**Reference**: `docs/notifications.md`

### 16. Geography Manager (`geography-manager.ts`)

**Purpose**: Geographic data management

**Responsibilities**:
- GeoJSON/KML parsing and validation
- Geography file management
- Geography data linking to records
- Geography preset management

**Key Features**:
- Text box input with API validation
- Live preview with Leaflet
- Public access at `/geography/`
- Geography linking to civic records

**Reference**: `docs/geography-system.md`
```

---

## Phase 4: Data Flow Updates (Medium Priority)

### 4.1 Update Data Flow Diagrams

**File:** `docs/architecture.md`

**Update "Data Flow" Section:**

```markdown
## Data Flow

### 1. Record Creation (with Saga Pattern)

```

User Input → API/CLI Layer → RecordManager.createRecord() → CreateRecordSaga →
DatabaseService (transaction) → File System (create file) → GitEngine (commit) →
HookSystem (emit event) → WorkflowEngine (execute workflows) → IndexingService
(update index) → Success/Compensation

```

### 2. Record Publication (with Saga Pattern)

```

Draft Approval → RecordManager.publishDraft() → PublishDraftSaga →
DatabaseService (move draft → record) → File System (create published file) →
GitEngine (commit) → HookSystem (emit event) → WorkflowEngine (execute
workflows) → IndexingService (update index) → Success/Compensation

```

### 3. Error Handling Flow

```

Error Occurs → CivicPressError (with correlation ID) → Error Handler
(API/CLI/Core) → Structured Error Response → Logging (with correlation ID) →
User Notification

```

### 4. Caching Flow

```

Service Request → UnifiedCacheManager → Cache Strategy
(MemoryCache/FileWatcherCache) → Cache Hit → Return Cached Value → Cache Miss →
Execute Operation → Cache Result → Metrics Collection

```

```

---

## Phase 5: Architecture Decision Records (Low Priority)

### 5.1 Create ADR Directory

**Directory:** `docs/architecture/decisions/`

**ADRs to Create:**

1. **ADR-001: Dependency Injection Container**
   - Decision: Use lightweight DI container
   - Context: Need for testability and service management
   - Consequences: 90% faster startup, better testability

2. **ADR-002: Saga Pattern for Multi-Step Operations**
   - Decision: Use Saga pattern instead of distributed transactions
   - Context: Git commits are authoritative, cannot be rolled back
   - Consequences: Reliable multi-step operations with audit trail

3. **ADR-003: Unified Caching Layer**
   - Decision: Unified cache manager with strategy pattern
   - Context: Multiple caching implementations with inconsistencies
   - Consequences: Consistent caching, better monitoring

4. **ADR-004: Unified Error Handling**
   - Decision: Type-safe error hierarchy with correlation IDs
   - Context: Inconsistent error handling across layers
   - Consequences: Better debugging, consistent error responses

---

## Implementation Checklist

### Phase 1: Critical Updates

- [ ] Update `architecture.md` - Add DI Container section
- [ ] Update `architecture.md` - Add Unified Cache Manager section
- [ ] Update `architecture.md` - Add Saga Pattern section
- [ ] Update `architecture.md` - Add Unified Error Handling section
- [ ] Update `architecture.md` - Update Service Initialization section

### Phase 2: Module Integration

- [ ] Create `module-integration-guide.md`
- [ ] Update `architecture.md` - Add Module Integration section

### Phase 3: Missing Services

- [ ] Create service documentation files
- [ ] Update `architecture.md` - Add missing services sections

### Phase 4: Data Flow Updates

- [ ] Update data flow diagrams in `architecture.md`

### Phase 5: ADRs

- [ ] Create ADR directory
- [ ] Create ADR-001: DI Container
- [ ] Create ADR-002: Saga Pattern
- [ ] Create ADR-003: Unified Caching
- [ ] Create ADR-004: Unified Error Handling

---

## Estimated Effort

- **Phase 1**: 4-6 hours
- **Phase 2**: 2-3 hours
- **Phase 3**: 6-8 hours
- **Phase 4**: 2-3 hours
- **Phase 5**: 3-4 hours

**Total**: 17-24 hours

---

## Priority Order

1. **Phase 1** (Critical) - Update core architecture documentation
2. **Phase 2** (High) - Document module integration
3. **Phase 3** (Medium) - Document missing services
4. **Phase 4** (Medium) - Update data flow diagrams
5. **Phase 5** (Low) - Create ADRs

---

**Status**: Ready for Implementation  
**Next Review**: After Phase 1 completion
