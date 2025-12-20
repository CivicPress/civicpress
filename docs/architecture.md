# CivicPress Architecture Overview

## System Overview

CivicPress is a **Git-native, modular civic platform** designed for
transparency, auditability, and local governance. The architecture emphasizes
simplicity, security, and civic trust.

This document explains the "why" behind the system design, helping contributors
understand the system holistically.

## Core Architecture Principles

### 1. Local-First Philosophy

CivicPress is built on a **local-first** architecture that prioritizes
resilience, independence, and offline capability:

- **Offline Operation**: The system works without internet connectivity once
  initialized
- **Data Ownership**: All civic data lives in local files and Git repositories
  under municipal control
- **Resilience**: No dependency on external cloud services for core
  functionality
- **Portability**: Complete civic records can be moved, backed up, or migrated
  as simple file structures
- **Small Town Friendly**: Designed to work in municipalities with limited IT
  infrastructure or unreliable internet

**Implementation**:

- SQLite database for local data storage (no external database required)
- Future support for PostgreSQL, AWS RDS, and other relational databases for
  larger deployments
- Git repository for version control (works entirely offline)
- Markdown files for records (human-readable, no proprietary formats)
- Local file storage with optional cloud backup

This philosophy ensures that municipalities maintain full control over their
civic data and can operate independently of external services.

### 2. Git as Versioning Engine

Git is not just a development tool in CivicPress—it's the **core versioning
engine** for all civic records:

**Why Git?**

- **Complete Audit Trail**: Every change is tracked with author, timestamp, and
  commit message
- **Reversibility**: Any change can be undone by reverting to a previous commit
- **Transparency**: Full history is inspectable by anyone with repository access
- **Branching**: Supports proposal workflows where changes are reviewed before
  merging
- **Distributed**: Multiple copies of the repository provide natural backup

**How It Works**:

- All civic records are stored as Markdown files in `data/records/`
- Every record change creates a Git commit with role-aware commit messages
- Git history provides the complete audit trail for compliance and transparency
- Branch-based workflows enable proposal → review → approval processes
- Git diffs show exactly what changed between versions

**Example Workflow**:

```
1. Clerk creates a new bylaw → Git commit: "feat: add noise ordinance bylaw"
2. Council reviews → Git commit: "review: update noise ordinance section 3"
3. Mayor approves → Git commit: "approve: noise ordinance by council"
4. Published → Git commit: "publish: noise ordinance effective 2025-02-01"
```

### 3. Modular Plugin System

- Core platform provides foundation
- Civic modules add specific functionality
- Plugin system for extensibility
- Sandboxed execution for security

### 4. Security-First Approach

- Sandboxed workflow execution
- Role-based access control
- Comprehensive audit logging
- Cryptographic integrity verification

### 5. Transparency by Default

- All changes traceable
- Public audit logs
- Open source by design
- No hidden automation

## Directory Structure

```
civicpress/
├── .civicrc                    # System configuration (dataDir, modules, roles)
├── .system-data/               # Sensitive system data (database, logs)
│   └── civic.db               # SQLite database
├── data/                       # User data directory
│   ├── .civic/                # Platform configuration (Git-versioned)
│   │   ├── org-config.yml     # Organization configuration
│   │   ├── workflows.yml      # Workflow definitions
│   │   ├── hooks.yml          # Hook configurations
│   │   ├── roles.yml          # Role definitions
│   │   ├── notifications.yml  # Notification settings
│   │   ├── storage.yml        # Storage configuration
│   │   ├── templates/         # Template directory
│   │   └── workflows/         # Workflow directory
│   ├── records/               # Civic records
│   │   ├── bylaw/            # Bylaw records (core type)
│   │   ├── policy/           # Policy records (core type)
│   │   ├── resolution/       # Resolution records (core type)
│   │   ├── ordinance/        # Ordinance records (core type)
│   │   ├── proclamation/     # Proclamation records (core type)
│   │   ├── geography/        # Geography records (core type)
│   │   └── session/          # Session records (core type)
│   └── .git/                 # Git repository for records
├── core/                      # Core platform modules
│   ├── civic-core.ts          # Main CivicPress orchestrator
│   ├── hooks/hook-system.ts   # Event system
│   ├── workflows/workflow-engine.ts # Workflow execution
│   ├── git/git-engine.ts      # Git operations
│   ├── database/database-service.ts # Database service
│   ├── auth/auth-service.ts   # Authentication service
│   ├── records/record-manager.ts # Record management
│   ├── utils/template-engine.ts # Template engine
│   └── indexing/indexing-service.ts # Indexing service
├── modules/                   # Civic modules
│   ├── api/                  # REST API module
│   ├── cli/                  # CLI module
│   ├── ui/                   # UI module
│   └── legal-register/       # Legal document management
├── docs/specs/               # Detailed specifications
└── agent/                    # AI agent memory system
```

## Core Components

### 1. CivicPress Class (`civic-core.ts`)

**Purpose**: Central orchestrator managing all services

**Responsibilities**:

- Initialize and manage all core services via Dependency Injection Container
- Coordinate service interactions
- Handle platform lifecycle
- Provide unified API for all services

**Key Methods**:

- `initialize()` - Platform startup (initializes DI container and services)
- `shutdown()` - Platform shutdown (shuts down cache manager and database)
- `getService<T>(key)` - Access services via DI container (preferred method)
- `getDatabaseService()`, `getAuthService()`, etc. - Backward-compatible getters
- `healthCheck()` - System health monitoring

**Service Initialization Order**:

1. `DatabaseService.initialize()` - Database connection and schema
2. `completeServiceInitialization()` - Cache registration, indexing service
   setup
3. `WorkflowEngine.initialize()` - Workflow definitions loading
4. `GitEngine.initialize()` - Git repository initialization
5. `HookSystem.initialize()` - Hook configuration loading

**Dependency Injection**:

All services are registered in the DI container during construction and resolved
lazily on first access. This provides:

- **90% faster startup time** - Services created only when needed
- **Better testability** - Mock services via test utilities
- **Clear dependency graph** - Automatic circular dependency detection
- **Type-safe resolution** - TypeScript ensures correct service types

**Reference**: `docs/dependency-injection-guide.md`

### 2. Dependency Injection Container (`di/container.ts`)

**Purpose**: Centralized service management and dependency resolution

**Responsibilities**:

- Register services with factory functions
- Resolve service dependencies automatically
- Manage service lifetimes (singleton, transient, scoped)
- Detect and prevent circular dependencies
- Provide type-safe service resolution

**Implementation**:

- `ServiceContainer` class with singleton, transient, and scoped lifetimes
- Centralized service registration in `registerCivicPressServices()`
- Lazy service initialization (services created on first access)
- Circular dependency detection and prevention
- Type-safe service resolution

**Service Registration**:

All services are registered in `core/src/civic-core-services.ts`:

```typescript
export function registerCivicPressServices(
  container: ServiceContainer,
  config: CivicPressConfig
): void {
  // Step 1: Register logger and config (no dependencies)
  container.singleton('logger', () => new Logger(loggerOptions));
  container.registerInstance('config', config);

  // Step 2: Register database service (depends on logger)
  container.singleton('database', (c) => {
    const logger = c.resolve<Logger>('logger');
    return new DatabaseService(dbConfig, logger);
  });

  // Step 3: Register services with dependencies
  // ... all services registered in dependency order
}
```

**Service Lifetimes**:

- **Singleton** (default): One instance shared across all requests
- **Transient**: New instance created for each resolution
- **Scoped**: One instance per scope (future enhancement)

**Benefits**:

- **Improved testability** - Mock services via test utilities
- **Clear dependency graph** - Automatic circular dependency detection
- **90% faster startup time** - Lazy initialization
- **Better error messages** - Clear errors when dependencies missing
- **Type safety** - TypeScript ensures correct service types

**Usage Example**:

```typescript
// In CivicPress class
const db = this.container.resolve<DatabaseService>('database');
const auth = this.container.resolve<AuthService>('auth');

// Or via getService method
const db = civic.getService<DatabaseService>('database');
```

**Reference**: `docs/dependency-injection-guide.md`

### 3. Hook System (`hook-system.ts`)

**Purpose**: Event-driven architecture for civic processes

**Responsibilities**:

- Emit civic events with `emit()` method
- Handle event listeners and workflows
- Configure hooks via `data/.civic/hooks.yml`
- Log event activity for audit trails

**How Hooks Work**:

Hooks enable **event-driven automation** where civic actions trigger configured
workflows:

1. **Event Emission**: When a civic action occurs (e.g., record created), the
   system emits a hook event
2. **Hook Configuration**: `data/.civic/hooks.yml` defines which workflows
   should run for each event
3. **Workflow Execution**: Configured workflows are executed automatically
4. **Audit Logging**: All hook events and workflow executions are logged

**Hook Configuration Example** (`data/.civic/hooks.yml`):

```yaml
hooks:
  record:created:
    enabled: true
    workflows:
      - validate-record
      - notify-council
    audit: true

  record:updated:
    enabled: true
    workflows:
      - auto-index
      - update-search-index
    audit: true

  status:changed:
    enabled: true
    workflows:
      - send-notification
      - update-public-index
    audit: true
```

**Key Events**:

- `record:created` - New civic record created
- `record:updated` - Record modified
- `record:deleted` - Record deleted
- `record:committed` - Record committed to Git
- `status:changed` - Record status transition
- `validation:failed` - Record validation failure
- `workflow:started` - Workflow execution started
- `workflow:completed` - Workflow execution completed

**Hook Benefits**:

- **Automation**: Automatically trigger workflows on civic events
- **Extensibility**: Easy to add new hooks and workflows
- **Auditability**: All hook events are logged for compliance
- **Flexibility**: Configure different workflows for different events

### 4. Workflow Engine (`workflow-engine.ts`)

**Purpose**: Execute civic processes and automation

**Responsibilities**:

- Load workflow definitions from `data/.civic/workflows.yml`
- Execute workflows safely with auto-indexing
- Handle workflow state and transitions
- Log workflow activity for audit

**How Workflows Work**:

Workflows define the **status lifecycle** and **approval processes** for civic
records:

1. **Status Definitions**: Define available statuses (draft, proposed, approved,
   archived)
2. **Transitions**: Define which status changes are allowed
3. **Role Permissions**: Define which roles can perform which transitions
4. **Automation**: Workflows can be triggered by hooks for automated processes

**Workflow Configuration Example** (`data/.civic/workflows.yml`):

```yaml
statuses:
  - draft
  - proposed
  - reviewed
  - approved
  - published
  - archived

transitions:
  draft: [proposed, archived]
  proposed: [reviewed, archived]
  reviewed: [approved, archived]
  approved: [published, archived]
  published: [archived]
  archived: []

roles:
  clerk:
    can_transition:
      draft: [proposed]
      proposed: [reviewed]
    can_view: ['*']

  council:
    can_transition:
      reviewed: [approved]
      any: [archived]
    can_view: ['*']

  mayor:
    can_transition:
      approved: [published]
      any: [archived]
    can_view: ['*']

  public:
    can_view: [bylaw, policy, resolution]
```

**Workflow Features**:

- **Status Validation**: Only allowed transitions are permitted
- **Role-Based Access**: Different roles have different transition permissions
- **Automated Workflows**: Workflows can be triggered by hooks
- **Audit Trail**: All workflow executions are logged
- **Flexibility**: Each municipality can define their own workflow

**Common Workflow Patterns**:

- **Simple Approval**: `draft → approved → archived`
- **Multi-Step Review**: `draft → proposed → reviewed → approved → published`
- **Committee Process**: `draft → committee-review → council-review → approved`

**Security**: Sandboxed execution environment ensures workflows cannot access
unauthorized resources

### 5. Git Engine (`git-engine.ts`)

**Purpose**: Git-native civic record management

**Responsibilities**:

- Commit civic changes with role-aware messages
- Handle Git history and diff operations
- Manage branches for proposals
- Track civic history with audit trails

**Key Features**:

- Role-based commit messages
- Automatic Git integration for all record changes
- History tracking and diff capabilities
- Conflict resolution strategies

### 6. Database Service (`database-service.ts`)

**Purpose**: Persistent data storage and management

**Responsibilities**:

- SQLite database management
- User and session storage
- Record metadata storage
- Search index management

**Key Features**:

- SQLite with full CRUD operations
- User management with roles
- Session management with JWT
- Search index persistence

**Database Support**:

- **Current**: SQLite (file-based, zero-maintenance, perfect for local-first
  architecture)
- **Future**: PostgreSQL, AWS RDS, and other relational databases will be
  supported for larger deployments and multi-user scenarios

### 7. Auth Service (`auth-service.ts`)

**Purpose**: Authentication and authorization management

**Responsibilities**:

- Multiple authentication methods (OAuth, password, simulated)
- JWT token management
- Role-based access control
- Session management

**Key Features**:

- GitHub OAuth integration
- Password authentication
- Simulated accounts for development
- JWT token validation and management

### 8. Record Manager (`record-manager.ts`)

**Purpose**: Civic record lifecycle management

**Responsibilities**:

- Create, read, update, delete records
- Manage record lifecycle (draft → proposed → approved → archived)
- Validate record integrity
- Coordinate with Git and workflow systems
- Execute multi-step operations via Saga pattern

**Key Features**:

- Complete CRUD operations
- Lifecycle management with status transitions
- Validation and integrity checks
- Integration with Git and workflows
- Saga pattern for reliable multi-step operations

**Saga Pattern Integration**:

Record Manager uses the Saga pattern for complex operations that span multiple
storage boundaries:

- **PublishDraftSaga**: Move draft to published record (DB → File → Git)
- **CreateRecordSaga**: Create new record (DB → File → Git)
- **UpdateRecordSaga**: Update existing record (DB → File → Git)
- **ArchiveRecordSaga**: Archive record (DB → File → Git)

**Why Saga Pattern**:

- Git commits are authoritative history (cannot be rolled back)
- CivicPress philosophy: auditability over invisibility
- Derived state (indexing) is eventually consistent
- True distributed transactions don't work across Git/DB/filesystem boundaries

**Reference**: `docs/saga-pattern-usage-guide.md`

### 9. Template Engine (`template-engine.ts`)

**Purpose**: Record template management

**Responsibilities**:

- Load templates from `data/.civic/templates/`
- Generate records from templates
- Validate template structure
- Support all record types

**Key Features**:

- Template system for all record types
- Template validation and integrity
- Dynamic template generation
- Template customization support

### 10. Indexing Service (`indexing-service.ts`)

**Purpose**: Search and discovery system

**Responsibilities**:

- Generate search indexes
- Provide full-text search capabilities
- Support filtering and ranking
- Auto-update indexes on record changes

**Key Features**:

- Full-text search across all records
- Advanced filtering by type, status, author
- Search result ranking and relevance
- Auto-indexing with workflow integration

### 11. Unified Cache Manager (`cache/unified-cache-manager.ts`)

**Purpose**: Centralized caching with consistent strategies

**Responsibilities**:

- Manage all cache instances with unified interface
- Provide cache strategies (MemoryCache, FileWatcherCache)
- Collect cache metrics and statistics
- Support cache warming and lifecycle management

**Implementation**:

- `UnifiedCacheManager` with strategy pattern
- `MemoryCache`: TTL-based in-memory cache with LRU eviction
- `FileWatcherCache`: File watching + manual invalidation
- Centralized registry for all caches
- Cache metrics and monitoring
- Cache warming support

**Cache Strategies**:

1. **MemoryCache**:
   - TTL-based expiration
   - LRU eviction when size limit reached
   - Memory usage tracking
   - Hit/miss statistics

2. **FileWatcherCache**:
   - File system watching for automatic invalidation
   - Debounced invalidation
   - Pattern-based key mapping
   - Lifecycle management (proper shutdown)

**Usage**:

```typescript
// Get cache manager
const cacheManager = civic.getCacheManager();

// Get a cache instance
const searchCache = cacheManager.getCache('search');

// Use cache
await searchCache.set('key', value, { ttl: 5000 });
const value = await searchCache.get('key');
await searchCache.delete('key');
```

**Benefits**:

- **Consistent interface** - All caches use same API
- **Easy to swap** - Strategy pattern allows implementation changes
- **Centralized metrics** - All cache stats in one place
- **Memory management** - Size and memory limits prevent leaks
- **Cache warming** - Preload caches for better performance

**Registered Caches**:

- `search` - Search result caching (MemoryCache, 5min TTL)
- `searchSuggestions` - Search suggestions caching (MemoryCache, 5min TTL)
- `diagnostics` - Diagnostic results caching (MemoryCache, 5min TTL)
- `templates` - Template caching (FileWatcherCache, file watching)

**Reference**: `docs/cache-usage-guide.md`

### 12. Diagnostic Service (`diagnostics/diagnostic-service.ts`)

**Purpose**: System health monitoring and issue detection

**Responsibilities**:

- Component-specific health checks (database, search, config, filesystem,
  system)
- Auto-fix capabilities for common issues
- Comprehensive diagnostic reports
- Integration with health check endpoints

**Key Features**:

- **Database Diagnostics**: Integrity checks, schema validation, index
  verification, FTS5 health
- **Search Diagnostics**: Index synchronization, query performance, cache status
- **Configuration Diagnostics**: Validation, migration status, completeness
  checks
- **Filesystem Diagnostics**: File integrity, Git repository health, directory
  structure
- **System Diagnostics**: Memory usage, CPU performance, disk space monitoring
- **Auto-Fix**: Automated repair for fixable issues with backup creation
- **Circuit Breaker**: Prevents cascading failures during diagnostic runs
- **Caching**: Result caching for performance (5-minute TTL)

**Diagnostic Checkers**:

- `DatabaseDiagnosticChecker` - Database integrity and schema
- `SearchDiagnosticChecker` - Search index health
- `ConfigurationDiagnosticChecker` - Configuration validation
- `FilesystemDiagnosticChecker` - File system health
- `SystemDiagnosticChecker` - System resource monitoring

**Usage**:

```typescript
// CLI
civic diagnose
civic diagnose --fix
civic diagnose --component database

// API
GET /api/v1/diagnose
GET /api/v1/diagnose?component=database&fix=true
```

**Reference**: `docs/specs/diagnostic-tools.md`

### 13. Backup Service (`backup/backup-service.ts`)

**Purpose**: Data backup and restore functionality

**Responsibilities**:

- Create compressed backups of data and local storage
- Restore backups with metadata
- Backup management and retention
- Git bundle creation for version history

**Key Features**:

- **Tarball Compression**: Creates `.tar.gz` archives for efficient storage
- **Storage File Restoration**: Restores files from storage directories
- **Git Bundle Support**: Creates Git bundles for complete version history
- **Metadata Tracking**: Comprehensive backup metadata with timestamps
- **Selective Backup**: Option to include/exclude storage and Git bundles
- **Demo Data Loading**: Load demo data via backup restoration

**Backup Contents**:

- `data/` directory (all civic records and configuration)
- `.system-data/storage/` (optional, if `includeStorage` is true)
- Git bundle (optional, if `includeGitBundle` is true)
- Backup metadata file

**Usage**:

```typescript
// CLI
civic backup create
civic backup create --include-storage
civic backup restore <backup-dir>
```

**Reference**: `docs/backup-strategy.md`

### 14. Configuration Service (`config/configuration-service.ts`)

**Purpose**: Centralized configuration management

**Responsibilities**:

- Load and validate configuration files from `data/.civic/`
- Provide configuration access to services
- Support configuration hot-reload
- Template handling from `core/src/defaults/`

**Key Features**:

- **Configuration Discovery**: Automatically discovers available configuration
  files
- **Validation**: Configuration validation and integrity checks
- **Template Handling**: Loads default templates from `core/src/defaults/`
- **Format Transformation**: Handles both old and new metadata formats
- **Migration Support**: Automatic migration from old to new format

**Configuration Files**:

- `org-config.yml` - Organization configuration
- `workflows.yml` - Workflow definitions
- `hooks.yml` - Hook configurations
- `roles.yml` - Role definitions
- `notifications.yml` - Notification settings
- `storage.yml` - Storage configuration
- `config.yml` - Record types and statuses

**Reference**: `docs/configuration-architecture.md`

### 15. Template Service (`templates/template-service.ts`)

**Purpose**: Template CRUD operations and management

**Responsibilities**:

- Template loading and caching
- Template validation
- Template CRUD operations (create, read, update, delete)
- Variable substitution and preview

**Key Features**:

- **Template CRUD**: Full create, read, update, delete operations
- **File Watching**: Automatic cache invalidation on file changes
- **Security Hardening**: Path traversal prevention, variable sanitization
- **Template Validation**: YAML frontmatter and structure validation
- **Variable Extraction**: Automatic variable detection from templates
- **Template Preview**: Preview templates with variable substitution

**Security Features**:

- Path traversal prevention via `TemplateValidator`
- File system permission checks (system templates are read-only)
- Variable sanitization to prevent code injection
- YAML frontmatter validation
- Template ID format validation

**Usage**:

```typescript
// List templates
const templates = await templateService.listTemplates({ type: 'bylaw' });

// Get template
const template = await templateService.getTemplate('bylaw/default');

// Create template
const newTemplate = await templateService.createTemplate({
  type: 'bylaw',
  name: 'custom',
  content: '...',
});

// Preview template
const preview = await templateService.previewTemplate('bylaw/default', {
  title: 'Test Bylaw',
});
```

**Reference**: `docs/template-system.md`, `docs/templates-api-usage.md`

### 16. Search Service (`search/search-service.ts`)

**Purpose**: Full-text search implementation

**Responsibilities**:

- FTS5-based full-text search
- Search query parsing
- Result ranking and relevance
- Search caching

**Key Features**:

- **SQLite FTS5 Integration**: Native full-text search using SQLite FTS5
- **Multi-Word Queries**: Supports multiple search terms
- **Phrase Matching**: Exact phrase matching support
- **Typo Tolerance**: Levenshtein distance for typo correction
- **Relevance Ranking**: Composite scoring (BM25 + field matches + recency)
- **Search Caching**: Results cached for performance (5-minute TTL)
- **Search Suggestions**: Autocomplete with typo tolerance
- **Faceting**: Type and status counts for search results

**Search Scoring**:

- **Field Match Score**: Title matches weighted higher than content
- **Recency Score**: Recent records ranked higher
- **Type Priority**: Record type priority scoring
- **Status Priority**: Status priority scoring
- **Composite Score**: Combined relevance score

**Usage**:

```typescript
// Search records
const results = await searchService.search('noise ordinance', {
  type: 'bylaw',
  limit: 20,
  sort: 'relevance',
});

// Get suggestions
const suggestions = await searchService.getSuggestions('nois', 10);

// Get facets
const facets = await searchService.getFacets('noise', { type: 'bylaw' });
```

**Reference**: `docs/specs/search.md`

### 17. Notification Service (`notifications/notification-service.ts`)

**Purpose**: Notification delivery system

**Responsibilities**:

- Email notification delivery
- SMS notification delivery (future)
- Webhook notifications
- Notification queuing and rate limiting

**Key Features**:

- **Multiple Channels**: Email, SMS (future), webhooks
- **Template System**: Notification templates with variable substitution
- **Rate Limiting**: Prevents notification spam
- **Security**: Content sanitization and validation
- **Audit Logging**: Complete notification audit trail
- **Queue Management**: Queued notifications with retry logic
- **Priority Support**: Low, normal, high, urgent priorities

**Notification Channels**:

- **Email Channel**: SMTP-based email delivery
- **SMS Channel**: SMS delivery (future implementation)
- **Webhook Channel**: HTTP webhook notifications

**Security Features**:

- Request validation
- Content sanitization
- Rate limiting per user/channel
- Audit logging for all notifications

**Usage**:

```typescript
// Send notification
const result = await notificationService.sendNotification({
  email: 'user@example.com',
  channels: ['email'],
  template: 'record-created',
  data: { recordTitle: 'Noise Ordinance' },
  priority: 'normal',
});
```

**Reference**: `docs/notifications.md`

### 18. Geography Manager (`geography/geography-manager.ts`)

**Purpose**: Geographic data management

**Responsibilities**:

- GeoJSON/KML parsing and validation
- Geography file management
- Geography data linking to records
- Geography preset management

**Key Features**:

- **Text Box Input**: Paste GeoJSON/KML content with API validation
- **File Generation**: Automatic file generation from content
- **Live Preview**: Real-time map preview with Leaflet
- **Public Access**: Geography files accessible at `/geography/`
- **Geography Linking**: Link geography files to civic records
- **Data Validation**: Comprehensive validation (geometry, SRID, bounds)
- **Interactive Maps**: Leaflet integration throughout the system
- **Standardized Structure**: API-enforced consistent data structure

**Geography File Format**:

- Markdown files with YAML frontmatter
- GeoJSON/KML content in code blocks
- Metadata with color/icon mappings
- Bounding box and SRID information

**Usage**:

```typescript
// Create geography file
const geography = await geographyManager.createGeographyFile({
  name: 'Zoning Map',
  type: 'geojson',
  category: 'zoning',
  content: '{ "type": "FeatureCollection", ... }',
  srid: 4326,
}, user);

// Link to record
record.geography = {
  file_id: geography.id,
  file_path: geography.file_path,
};
```

**Reference**: `docs/geography-system.md`

## Indexing & Search Algorithms

### Index Generation

The indexing system scans all Markdown files in `data/records/` and creates
structured index files:

**Process**:

1. Scan `data/records/` directory recursively
2. Parse YAML frontmatter from each Markdown file
3. Extract metadata (title, type, status, tags, authors, dates)
4. Generate `index.yml` file with all record summaries
5. Create module-specific indexes (e.g., `legal-register/index.yml`)

**Index Format** (`data/records/index.yml`):

```yaml
entries:
  - title: 'Noise Restrictions'
    type: bylaw
    status: approved
    file: 'bylaw/noise-restrictions.md'
    slug: 'noise-restrictions'
    tags: ['noise', 'nighttime']
    authors:
      - name: 'Ada Lovelace'
        role: 'clerk'
    created: '2025-06-12T10:00:00Z'
    updated: '2025-07-01T14:30:00Z'
```

### Search Algorithm

The search algorithm uses a **filter-then-search** approach:

1. **Filter by Options**: First filter by type, status, module, or tags
2. **Text Search**: Then search within filtered results
3. **Ranking**: Results ranked by relevance (title matches > tag matches >
   author matches)

**Search Implementation**:

```typescript
searchIndex(index, query, options) {
  // Step 1: Filter by options (type, status, module, tags)
  let results = index.entries.filter(entry => {
    if (options.type && entry.type !== options.type) return false;
    if (options.status && entry.status !== options.status) return false;
    if (options.module && entry.module !== options.module) return false;
    if (options.tags && !hasMatchingTag(entry.tags, options.tags)) return false;
    return true;
  });

  // Step 2: Text search within filtered results
  if (query) {
    const lowerQuery = query.toLowerCase();
    results = results.filter(entry => {
      return entry.title.toLowerCase().includes(lowerQuery) ||
             entry.slug?.toLowerCase().includes(lowerQuery) ||
             entry.tags?.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
             entry.authors?.some(author =>
               author.name.toLowerCase().includes(lowerQuery)
             );
    });
  }

  return results;
}
```

**Search Features**:

- Case-insensitive matching
- Partial word matching
- Multi-field search (title, slug, tags, authors)
- Fast filtering (no full-text content scanning)
- Module-specific search (searches within module indexes)

### Index Updates

Indexes are automatically updated when:

- Records are created, updated, or deleted
- Workflows trigger indexing hooks
- Manual index regeneration via `civic index` command

**Auto-Indexing Workflow**:

```
Record Change → Hook Event (record:created/updated/deleted)
  → Workflow Trigger (auto-index)
  → Index Regeneration
  → Index File Update
```

## Module Structure

CivicPress follows a **CLI → Core → API** architecture pattern where:

1. **CLI Layer**: Every feature starts as a CLI command for local testing and
   automation
2. **Core Layer**: Pure business logic, reusable across CLI, API, and UI
3. **API Layer**: REST endpoints that wrap core logic for programmatic access
4. **UI Layer**: Web interface that consumes the API

This ensures consistency, testability, and transparency across all interfaces.

### Core Module (`core/`)

**Purpose**: Central business logic and services

**Responsibilities**:

- Record management and lifecycle
- Authentication and authorization
- Workflow execution
- Git operations
- Indexing and search
- Template processing
- Database operations

**Key Principle**: Core contains **no I/O or UI dependencies**—pure TypeScript
functions that can be tested in isolation and called by CLI, API, or UI.

### API Module (`modules/api/`)

**Status**: Fully implemented

**Purpose**: REST API for programmatic access

**Architecture**:

- Express.js server with TypeScript
- Thin wrapper around core services
- Authentication middleware for all protected routes
- Role-based authorization checks
- Standardized JSON responses

**Features**:

- 25+ REST endpoints
- Authentication middleware
- Authorization with role-based access
- Comprehensive error handling
- API documentation

**Endpoints**:

- `/api/v1/records/*` - Record CRUD operations
- `/api/v1/auth/*` - Authentication
- `/api/v1/indexing/*` - Search and indexing
- `/api/v1/storage/*` - File management
- `/api/v1/config/*` - Configuration management

### CLI Module (`cli/`)

**Status**: Fully implemented

**Purpose**: Command-line interface for all operations

**Architecture**:

- CAC (Command And Conquer) CLI framework
- Commands wrap core services
- JSON output support for automation
- Human-readable output by default

**Features**:

- 25+ CLI commands
- JSON output support (`--json` flag)
- Silent mode (`--silent` flag)
- Authentication integration
- Role-based access control
- Git integration

**Example Commands**:

- `civic create bylaw "Noise Ordinance"` - Create a new record
- `civic list --type bylaw --status approved` - List records with filters
- `civic index --search "noise"` - Search records
- `civic commit --message "Update ordinance"` - Commit changes to Git

### UI Module (`modules/ui/`)

**Status**: Complete

**Purpose**: Modern web interface

**Architecture**:

- Nuxt 4 (Vue.js framework)
- Vue 3 with Composition API
- Nuxt UI Pro component library
- SPA mode with API integration
- Server-side rendering for public pages

**Features**:

- Complete authentication system
- Records interface with search and filtering
- Record detail pages with Markdown rendering
- Responsive design with modern components
- Accessible (WCAG 2.1 AA compliant)

**Pages**:

- `/` - Homepage
- `/records` - Record listing with filters
- `/records/[type]/[id]` - Record detail view
- `/auth/login` - Authentication
- `/settings/*` - Configuration management

### Storage Module (`modules/storage/`)

**Status**: Fully implemented

**Purpose**: File storage and management

**Architecture**:

- UUID-based file identification
- Multi-provider support (local, S3, Azure, GCS)
- Database metadata tracking
- Secure file access control

**Features**:

- Local file storage (default)
- Cloud storage support (S3, Azure, GCS)
- UUID-based file references
- File attachment system for records
- Public and private storage folders
- Database tracking of file metadata
- Retry logic with exponential backoff
- Automatic failover between providers
- Circuit breaker for fault tolerance
- Comprehensive metrics collection

**Storage Folders**:

- `public/` - Publicly accessible files
- `private/` - Authenticated access only
- `sessions/` - Meeting recordings and minutes
- `permits/` - Permit documents

**File Management**:

- Files are stored with UUID prefixes for security
- Original filenames preserved in database
- File metadata tracked in `storage_files` table
- Integration with record attachment system

**Module Integration**:

The Storage module uses **Pattern 2: Service Registration** (DI Container):

- **Registered in DI Container**: Storage services are registered during core
  initialization
- **Service Keys**:
  - `storage` - `CloudUuidStorageService` (singleton, lazy initialization)
  - `storageConfigManager` - `StorageConfigManager` (singleton)
- **Dependencies**: Uses `Logger`, `UnifiedCacheManager`, and `DatabaseService`
  from core
- **Lazy Initialization**: Service is created synchronously but initialized
  asynchronously on first use
- **Configuration**: Loaded from `.system-data/storage.yml` via
  `StorageConfigManager`
- **Access Pattern**: Services accessed via `civicPress.getService('storage')`
  or `civicPress.getService('storageConfigManager')`

**Registration Flow**:

1. Core calls `registerStorageServices()` during service registration
2. Storage module registers services in DI container
3. API routes access storage service via DI container
4. Service initializes lazily on first use with actual config

**Reference**: `docs/module-integration-guide.md`, `docs/uuid-storage-system.md`

### Legal Register Module (`modules/legal-register/`)

**Status**: Schema extension implemented

**Purpose**: Specialized legal document management

**Architecture**:

- Record types (`bylaw`, `ordinance`, `policy`, `proclamation`, `resolution`)
  are core record types (defined in core)
- Legal-register is a separate module that extends these core types with
  specialized functionality
- Module provides: schema extensions for legal-specific fields
- Module is optional and can be disabled if not needed

**Module Integration**:

- Uses core record types and extends with specialized fields
- Integrates with Record Manager for legal document operations
- Provides schema extensions for legal-specific metadata

**Reference**: `docs/module-integration-guide.md`

## Record Types & Metadata

### Core Record Types

All record types are defined in **core** and provide base functionality:

1. **`bylaw`** - Municipal bylaws and regulations
2. **`ordinance`** - Local ordinances and municipal codes
3. **`policy`** - Organizational policies and procedures
4. **`proclamation`** - Official proclamations and declarations
5. **`resolution`** - Resolutions and formal decisions
6. **`geography`** - Geographic data files (GeoJSON/KML)
7. **`session`** - Meeting sessions and minutes

### Record Format

All records are stored as **Markdown files** with YAML frontmatter:

```markdown
---
title: 'Noise Restrictions'
type: bylaw
status: approved
module: legal-register
tags: ['noise', 'nighttime', 'curfew']
authors:
  - name: 'Ada Lovelace'
    role: 'clerk'
created: '2025-06-12T10:00:00Z'
updated: '2025-07-01T14:30:00Z'
slug: 'noise-restrictions'
version: '1.0.0'
metadata:
  chapter: 3
  article: 15
  effective_date: '2025-08-01'
attached_files:
  - id: 'uuid-here'
    category: 'Reference'
    description: 'Related document'
---

# Bylaw: Noise Restrictions

## Section 1: Definitions
...
```

### Required Metadata Fields

- `title` - Human-readable title
- `type` - Record type (bylaw, policy, resolution, etc.)
- `status` - Current status (draft, proposed, approved, archived)

### Optional Metadata Fields

- `module` - Associated module (e.g., legal-register)
- `tags` - Array of tags for categorization
- `authors` - Array of authors with name and role
- `created` - Creation timestamp (ISO 8601)
- `updated` - Last update timestamp (ISO 8601)
- `slug` - URL-friendly identifier
- `version` - Version number
- `metadata` - Type-specific metadata (varies by record type)
- `attached_files` - Array of file attachments with UUIDs

### Record Lifecycle

Records follow a configurable lifecycle defined in `data/.civic/workflows.yml`:

```
draft → proposed → reviewed → approved → published → archived
```

Each transition can be:

- Restricted by role (only certain roles can transition)
- Triggered by hooks (automated workflows)
- Logged for audit (Git commits track all changes)

**All core record types**:

- Use the standardized markdown format
- Support base CRUD operations via `RecordManager`
- Support validation via `RecordValidator`
- Support indexing via `IndexingService`
- Can be extended by modules with specialized fields and functionality

## Data Flow

### 1. Record Creation (with Saga Pattern)

```
User Input
  → API/CLI Layer
  → RecordManager.createRecord()
  → CreateRecordSaga
    → DatabaseService (transaction)
    → File System (create file)
    → GitEngine (commit)
    → HookSystem (emit event)
    → WorkflowEngine (execute workflows)
    → IndexingService (update index)
  → Success/Compensation
```

### 2. Record Publication (with Saga Pattern)

```
Draft Approval
  → RecordManager.publishDraft()
  → PublishDraftSaga
    → DatabaseService (move draft → record)
    → File System (create published file)
    → GitEngine (commit)
    → HookSystem (emit event)
    → WorkflowEngine (execute workflows)
    → IndexingService (update index)
  → Success/Compensation
```

### 3. Error Handling Flow

```
Error Occurs
  → CivicPressError (with correlation ID)
  → Error Handler (API/CLI/Core)
  → Structured Error Response
  → Logging (with correlation ID)
  → User Notification
```

### 4. Caching Flow

```
Service Request
  → UnifiedCacheManager
  → Cache Strategy (MemoryCache/FileWatcherCache)
  → Cache Hit → Return Cached Value
  → Cache Miss → Execute Operation → Cache Result
  → Metrics Collection
```

### 5. Configuration Changes

```
Config Update → Validation → Service Reload → Hook Event → Workflow Trigger
```

## Security Architecture

### 1. Authentication & Authorization

- **Multiple Methods**: OAuth (GitHub), user/password, simulated accounts
- **JWT Tokens**: All methods return valid JWT tokens with proper validation
- **Role-Based Access**: Granular permissions system with role hierarchy
- **Session Management**: JWT-based stateless sessions with proper cleanup

### 2. Data Integrity

- **Git Integration**: All changes tracked in Git with role-aware commits
- **Validation**: Comprehensive record validation and integrity checks
- **Audit Trails**: Complete audit logging for all operations
- **Backup**: Git provides natural backup and version control
- **Saga Pattern**: Reliable multi-step operations with compensation logic

### 3. Unified Error Handling

**Purpose**: Consistent error handling across all layers

**Implementation**:

- `CivicPressError` base class with domain-specific errors
- Correlation IDs for distributed tracing
- Integration with API, CLI, and Core layers
- Structured error responses

**Error Hierarchy**:

```
CivicPressError (base class)
├── ValidationError (400) - Input validation failures
├── NotFoundError (404) - Resource not found
├── DatabaseError (500) - Database operation failures
├── StorageError (500) - Storage operation failures
├── RecordError - Record-specific errors
├── TemplateError - Template-specific errors
├── GeographyError - Geography-specific errors
└── AuthError - Authentication/authorization errors
```

**Key Features**:

- **Type-safe errors** - TypeScript ensures correct error types
- **Correlation IDs** - Track errors across distributed operations
- **Structured responses** - Consistent error format across all layers
- **Context preservation** - Error context included in responses
- **Recovery paths** - Clear error recovery strategies

**Usage**:

```typescript
// In services
throw new ValidationError('Invalid record data', { field: 'title' });

// In API
if (error instanceof CivicPressError) {
  res.status(error.statusCode).json({
    error: {
      code: error.code,
      message: error.message,
      context: error.context,
      correlationId: error.correlationId,
    },
  });
}
```

**Benefits**:

- **Consistent error responses** - Same format across API, CLI, Core
- **Better debugging** - Correlation IDs enable distributed tracing
- **Type safety** - TypeScript catches error handling mistakes
- **Clear recovery** - Structured errors provide clear recovery paths
- **User experience** - Meaningful error messages for users

**Reference**: `docs/error-handling.md`

### 4. Configuration Security

- **Separation**: System config (`.civicrc`) vs Organization config
  (`data/.civic/`)
- **Validation**: Configuration validation and integrity checks
- **Access Control**: Role-based access to configuration
- **Audit**: Configuration changes logged and tracked

## Technology Stack

### Backend

- **Node.js** - Runtime environment
- **TypeScript** - Type safety and developer experience
- **Express** - REST API framework
- **SQLite** - Database (file-based, zero-maintenance, current default)
- **PostgreSQL/RDS** - Future support for larger deployments and multi-user
  scenarios
- **Git** - Version control and audit trail

### Frontend

- **Nuxt 4** - Vue.js framework
- **Vue 3** - Progressive JavaScript framework
- **Nuxt UI Pro** - Component library
- **TypeScript** - Type safety

### Development Tools

- **pnpm** - Package manager
- **Vitest** - Testing framework
- **Prettier** - Code formatting
- **ESLint** - Code linting

## Development Patterns

### 1. Service Integration

- **CivicPress Class**: Central orchestrator for all services
- **Dependency Injection**: Services injected and managed centrally
- **Lifecycle Management**: Proper initialization and shutdown procedures
- **Error Handling**: Comprehensive error handling across all services

### 2. Configuration-Driven Development

- **Centralized Config**: All configuration in `data/.civic/`
- **Validation**: Configuration validation and integrity checks
- **Hot Reload**: Configuration changes without restart
- **Audit**: Configuration changes logged and tracked

### 3. Event-Driven Architecture

- **Hook System**: Event-driven architecture for all operations
- **Workflow Integration**: Workflows triggered by hooks
- **Audit Trails**: Complete audit logging for all events
- **Extensibility**: Easy to add new hooks and workflows

## Layout of the `.civic` Folder

The `data/.civic/` folder is the **single source of truth** for all platform
configuration. It is Git-versioned and contains no sensitive information.

### Directory Structure

```
data/.civic/
├── org-config.yml          # Organization branding, contact info, public details
├── workflows.yml           # Record statuses and approval workflows
├── hooks.yml               # Event-driven workflow automation rules
├── roles.yml               # User permissions and access control rules
├── notifications.yml       # Email, SMS, and webhook notification settings
├── storage.yml             # File storage provider configuration
├── templates/              # Content templates for different record types
│   ├── bylaw/
│   │   └── default.md
│   ├── policy/
│   │   └── default.md
│   └── resolution/
│       └── default.md
└── workflows/              # Custom workflow scripts (optional)
```

### Configuration Files

**`org-config.yml`** - Organization Configuration

- Organization name, city, state, country
- Contact information
- Website and branding
- Public-facing details

**`workflows.yml`** - Workflow Definitions

- Available statuses (draft, proposed, approved, etc.)
- Status transitions (which changes are allowed)
- Role permissions (who can perform which actions)

**`hooks.yml`** - Hook Configuration

- Event-to-workflow mappings
- Automated workflow triggers
- Audit logging settings

**`roles.yml`** - Role Definitions

- Role names and descriptions
- Permission sets for each role
- Role hierarchy

**`notifications.yml`** - Notification Settings

- Email configuration
- SMS settings (if applicable)
- Webhook endpoints
- Notification templates

**`storage.yml`** - Storage Configuration

- Storage provider (local, S3, Azure)
- Storage folder definitions
- Access control settings
- File size and type limits

**`templates/`** - Record Templates

- Default templates for each record type
- Variable substitution support
- Template inheritance

### Key Principles

1. **Git-Versioned**: All configuration is committed to Git for auditability
2. **No Sensitive Data**: Passwords, API keys, and secrets are stored in
   `.system-data/` or environment variables
3. **Human-Readable**: YAML format is easy to read and edit
4. **Validated**: Configuration is validated on load to catch errors early
5. **Hot Reload**: Configuration changes can be applied without restarting the
   system

### Default Templates

Default configuration templates are stored in `core/src/defaults/` and are:

- **Never used directly** by the running system
- **Copied to `data/.civic/`** during `civic init`
- **Used as reference** for expected structure
- **Updated** when new features require new configuration options

## Architecture Decision Records (ADRs)

Important architectural decisions are documented in Architecture Decision
Records:

- [ADR-001: Dependency Injection Container](architecture/decisions/ADR-001-dependency-injection-container.md) -
  DI container implementation decision
- [ADR-002: Saga Pattern for Multi-Step Operations](architecture/decisions/ADR-002-saga-pattern.md) -
  Saga pattern for cross-boundary operations
- [ADR-003: Unified Caching Layer](architecture/decisions/ADR-003-unified-caching-layer.md) -
  Unified caching system decision
- [ADR-004: Unified Error Handling](architecture/decisions/ADR-004-unified-error-handling.md) -
  Error handling system decision

See [Architecture Decision Records Index](architecture/decisions/README.md) for
complete list.

## Related Documentation

- [Configuration Architecture](configuration-architecture.md) - Detailed
  configuration system
- [API Documentation](api.md) - REST API reference
- [CLI Documentation](cli.md) - Command-line interface
- [Security System](security-system.md) - Security architecture
- [Indexing System](indexing-system.md) - Search and indexing details
- [Workflows](workflows.md) - Workflow configuration guide
- [Project Status](project-status.md) - Current implementation status
- [Specifications Index](specs-index.md) - Complete specification list
- [Module Integration Guide](module-integration-guide.md) - How modules
  integrate with core
- [Dependency Injection Guide](dependency-injection-guide.md) - DI container
  usage
- [Error Handling Guide](error-handling.md) - Error handling patterns
- [Cache Usage Guide](cache-usage-guide.md) - Caching system usage
- [Saga Pattern Usage Guide](saga-pattern-usage-guide.md) - Saga pattern usage
