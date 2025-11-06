# 🏗️ CivicPress Architecture Memory

**Last Updated**: 2025-01-27  
**Architecture Version**: 2.0.0

## 🎯 **System Overview**

CivicPress is a **Git-native, modular civic platform** designed for
transparency, auditability, and local governance. The architecture emphasizes
simplicity, security, and civic trust.

## 🏛️ **Core Architecture Principles**

### 1. **Git-Native Design**

- All civic records stored as Markdown files in Git
- Complete audit trail through Git history
- Version control for all civic documents
- Branch-based workflow for proposals and approvals

### 2. **Modular Plugin System**

- Core platform provides foundation
- Civic modules add specific functionality
- Plugin system for extensibility
- Sandboxed execution for security

### 3. **Security-First Approach**

- Sandboxed workflow execution
- Role-based access control
- Comprehensive audit logging
- Cryptographic integrity verification

### 4. **Transparency by Default**

- All changes traceable
- Public audit logs
- Open source by design
- No hidden automation

## 📁 **Actual Directory Structure**

```
civicpress/
├── .civicrc                    # System configuration (dataDir, modules, roles)
├── .system-data/               # Sensitive system data (database, logs)
│   └── civic.db               # SQLite database
├── data/                       # User data directory (IMPLEMENTED)
│   ├── .civic/                # Platform configuration (IMPLEMENTED)
│   │   ├── org-config.yml     # Organization configuration
│   │   ├── workflows.yml      # Workflow definitions
│   │   ├── hooks.yml          # Hook configurations
│   │   ├── roles.yml          # Role definitions
│   │   ├── templates/         # Template directory
│   │   └── workflows/         # Workflow directory
│   ├── records/               # Civic records (IMPLEMENTED)
│   │   ├── bylaw/            # Bylaw records (core type)
│   │   ├── policy/           # Policy records (core type)
│   │   ├── resolution/       # Resolution records (core type)
│   │   ├── ordinance/        # Ordinance records (core type)
│   │   ├── proclamation/     # Proclamation records (core type)
│   │   ├── geography/        # Geography records (core type)
│   │   └── session/          # Session records (core type)
│   └── .git/                 # Git repository for records
├── core/                      # Core platform modules (IMPLEMENTED)
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
│   ├── api/                  # REST API module (IMPLEMENTED)
│   ├── cli/                  # CLI module (IMPLEMENTED)
│   ├── ui/                   # UI module (95% COMPLETE)
│   └── legal-register/       # Legal document management (PLANNED)
│                            # Extends core record types (bylaw, ordinance, etc.)
│                            # with specialized features (digital signatures, compliance)
├── docs/specs/               # 50+ detailed specifications
└── agent/                    # AI agent memory system
    ├── memory/               # Core memory
    ├── context/              # Contextual information
    ├── knowledge/            # Domain knowledge
    └── sessions/             # Session management
```

## 🔧 **Core Components (IMPLEMENTED)**

### 1. **CivicPress Class (`civic-core.ts`)**

- **Purpose**: Central orchestrator managing all services
- **Responsibilities**:
  - Initialize and manage all core services
  - Coordinate service interactions
  - Handle platform lifecycle
  - Provide unified API for all services
- **Key Methods**:
  - `initialize()` - Platform startup
  - `shutdown()` - Platform shutdown
  - `getService()` - Access individual services
  - `healthCheck()` - System health monitoring

### 2. **Hook System (`hook-system.ts`)**

- **Purpose**: Event-driven architecture for civic processes
- **Responsibilities**:
  - Emit civic events with `emit()` method
  - Handle event listeners and workflows
  - Configure hooks via `data/.civic/hooks.yml`
  - Log event activity for audit trails
- **Key Events**:
  - `record:created` - New civic record
  - `record:updated` - Record modified
  - `record:committed` - Record committed to Git
  - `status:changed` - Record status change
  - `validation:failed` - Record validation failure

### 3. **Workflow Engine (`workflow-engine.ts`)**

- **Purpose**: Execute civic processes and automation
- **Responsibilities**:
  - Load workflow definitions from `data/.civic/workflows.yml`
  - Execute workflows safely with auto-indexing
  - Handle workflow state and transitions
  - Log workflow activity for audit
- **Security**: Sandboxed execution environment
- **Examples**:
  - Approval workflows with role validation
  - Auto-indexing workflows triggered by record changes
  - Notification workflows for status changes
  - Validation workflows for record integrity

### 4. **Git Engine (`git-engine.ts`)**

- **Purpose**: Git-native civic record management
- **Responsibilities**:
  - Commit civic changes with role-aware messages
  - Handle Git history and diff operations
  - Manage branches for proposals
  - Track civic history with audit trails
- **Key Features**:
  - Role-based commit messages
  - Automatic Git integration for all record changes
  - History tracking and diff capabilities
  - Conflict resolution strategies

### 5. **Database Service (`database-service.ts`)**

- **Purpose**: Persistent data storage and management
- **Responsibilities**:
  - SQLite database management
  - User and session storage
  - Record metadata storage
  - Search index management
- **Key Features**:
  - SQLite with full CRUD operations
  - User management with roles
  - Session management with JWT
  - Search index persistence

### 6. **Auth Service (`auth-service.ts`)**

- **Purpose**: Authentication and authorization management
- **Responsibilities**:
  - Multiple authentication methods (OAuth, password, simulated)
  - JWT token management
  - Role-based access control
  - Session management
- **Key Features**:
  - GitHub OAuth integration
  - Password authentication
  - Simulated accounts for development
  - JWT token validation and management

### 7. **Record Manager (`record-manager.ts`)**

- **Purpose**: Civic record lifecycle management
- **Responsibilities**:
  - Create, read, update, delete records
  - Manage record lifecycle (draft → proposed → approved → archived)
  - Validate record integrity
  - Coordinate with Git and workflow systems
- **Key Features**:
  - Complete CRUD operations
  - Lifecycle management with status transitions
  - Validation and integrity checks
  - Integration with Git and workflows

### 8. **Template Engine (`template-engine.ts`)**

- **Purpose**: Record template management
- **Responsibilities**:
  - Load templates from `data/.civic/templates/`
  - Generate records from templates
  - Validate template structure
  - Support all record types
- **Key Features**:
  - Template system for all record types
  - Template validation and integrity
  - Dynamic template generation
  - Template customization support

### 9. **Indexing Service (`indexing-service.ts`)**

- **Purpose**: Search and discovery system
- **Responsibilities**:
  - Generate search indexes
  - Provide full-text search capabilities
  - Support filtering and ranking
  - Auto-update indexes on record changes
- **Key Features**:
  - Full-text search across all records
  - Advanced filtering by type, status, author
  - Search result ranking and relevance
  - Auto-indexing with workflow integration

## 📋 **Record Types Architecture**

### Core Record Types

All record types are defined in **core** and provide base functionality:

1. **`bylaw`** - Municipal bylaws and regulations
2. **`ordinance`** - Local ordinances and municipal codes
3. **`policy`** - Organizational policies and procedures
4. **`proclamation`** - Official proclamations and declarations
5. **`resolution`** - Resolutions and formal decisions
6. **`geography`** - Geographic data files (GeoJSON/KML)
7. **`session`** - Meeting sessions and minutes

**All core record types:**
- Use the standardized markdown format (defined in `docs/record-format-standard.md`)
- Support base CRUD operations via `RecordManager`
- Support validation via `RecordValidator`
- Support indexing via `IndexingService`
- Can be extended by modules with specialized fields and functionality

### Module Extensions

**Legal-Register Module:**
- Extends legal record types (`bylaw`, `ordinance`, `policy`, `proclamation`, `resolution`)
- Adds specialized features: digital signatures, compliance tracking, legal workflows
- Provides schema extensions for legal-specific fields
- Module is optional - can be disabled if not needed

**Sessions:**
- Stays in core as a fundamental record type
- No separate module needed (unless specialized features are required later)
- If specialized features needed (livestream, transcript processing), can create sessions module or use plugins

## 🧩 **Module Architecture**

### API Module (`modules/api/`)

- **Status**: ✅ Fully implemented
- **Purpose**: REST API for programmatic access
- **Features**:
  - 20+ REST endpoints
  - Authentication middleware
  - Authorization with role-based access
  - Comprehensive error handling
  - API documentation

### CLI Module (`modules/cli/`)

- **Status**: ✅ Fully implemented
- **Purpose**: Command-line interface for all operations
- **Features**:
  - 20+ CLI commands
  - JSON output support
  - Authentication integration
  - Role-based access control
  - Git integration

### UI Module (`modules/ui/`)

- **Status**: ✅ 95% complete
- **Purpose**: Modern web interface
- **Features**:
  - Nuxt 4 + Vue 3 + Nuxt UI Pro
  - Complete authentication system
  - Records interface with search and filtering
  - Record detail pages with Markdown rendering
  - Responsive design with modern components

### Legal Register Module (`modules/legal-register/`)

- **Status**: 📋 Planned (only README exists)
- **Purpose**: Specialized legal document management
- **Architecture**:
  - **Record types** (`bylaw`, `ordinance`, `policy`, `proclamation`, `resolution`) are **core record types** (defined in core)
  - **Legal-register** is a **separate module** that extends these core types with specialized functionality
  - Module provides: digital signatures, compliance tracking, legal workflows, legal-specific schema extensions
  - Module is optional and can be disabled if not needed
- **Features**: Planned for future implementation
  - Digital signature support
  - Compliance tracking and reporting
  - Legal-specific workflows
  - Legal document versioning
  - Schema extensions for legal fields

## 🔌 **Configuration System (IMPLEMENTED)**

### System Configuration (`.civicrc`)

```yaml
version: 1.0.0
dataDir: data
modules: [legal-register]
record_types: [bylaw, policy]
default_role: clerk
hooks: { enabled: true }
workflows: { enabled: true }
audit: { enabled: true }
database: { type: sqlite }
```

### Organization Configuration (`data/.civic/org-config.yml`)

```yaml
name: Civic Records
city: Richmond
state: Quebec
country: Canada
timezone: America/Montreal
# ... complete organization details
```

### Workflow Configuration (`data/.civic/workflows.yml`)

```yaml
statuses: [draft, proposed, reviewed, approved, archived]
transitions:
  draft: [proposed, archived]
  proposed: [reviewed, archived]
  # ... complete workflow transitions
roles:
  admin: # Full admin permissions
  clerk: # Limited clerk permissions
  public: # Public view permissions
```

### Hook Configuration (`data/.civic/hooks.yml`)

```yaml
hooks:
  record:created:
    enabled: true
    workflows: [validate-record, notify-council]
    audit: true
  # ... complete hook configuration
```

## 🔐 **Security Architecture**

### 1. **Authentication & Authorization**

- **Multiple Methods**: OAuth (GitHub), user/password, simulated accounts
- **JWT Tokens**: All methods return valid JWT tokens with proper validation
- **Role-Based Access**: Granular permissions system with role hierarchy
- **Session Management**: JWT-based stateless sessions with proper cleanup

### 2. **Data Integrity**

- **Git Integration**: All changes tracked in Git with role-aware commits
- **Validation**: Comprehensive record validation and integrity checks
- **Audit Trails**: Complete audit logging for all operations
- **Backup**: Git provides natural backup and version control

### 3. **Configuration Security**

- **Separation**: System config (`.civicrc`) vs Organization config
  (`data/.civic/`)
- **Validation**: Configuration validation and integrity checks
- **Access Control**: Role-based access to configuration
- **Audit**: Configuration changes logged and tracked

## 🎨 **User Interface Architecture**

### Frontend Design

- **Modern Stack**: Nuxt 4 + Vue 3 + Nuxt UI Pro
- **SPA Mode**: Single Page Application for API-driven architecture
- **Responsive Design**: Works on all devices with modern components
- **Accessibility**: WCAG compliant with proper accessibility features

### UI Components

- **Authentication**: Complete login/logout with JWT token management
- **Records Interface**: Complete with search, filtering, pagination
- **Record Detail**: Complete with Markdown rendering and metadata
- **API Integration**: Complete integration with backend REST API
- **Composables**: Complete reusable composables for DRY principle

## 🔄 **Data Flow**

### 1. **Record Creation**

```
User Input → Validation → Git Commit → Hook Event → Workflow Trigger → Index Update
```

### 2. **Record Publication**

```
Approval → Git Merge → Hook Event → Notification → Public Display → Index Update
```

### 3. **Configuration Changes**

```
Config Update → Validation → Service Reload → Hook Event → Workflow Trigger
```

## 📊 **Performance Considerations**

### 1. **Scalability**

- **Client-Side Pagination**: Efficient pagination without server calls
- **Caching**: Global caching for record types and statuses
- **Indexing**: Fast search with advanced filtering and ranking
- **Git Operations**: Efficient for large repositories

### 2. **Reliability**

- **Git as Source of Truth**: Complete audit trail through Git history
- **Database Backup**: SQLite with Git-based backup
- **Error Handling**: Comprehensive error handling and recovery
- **Graceful Degradation**: System continues working with partial failures

### 3. **Monitoring**

- **Comprehensive Logging**: Structured logging with configurable levels
- **Health Checks**: System health monitoring and reporting
- **Performance Metrics**: Response time and resource usage tracking
- **Error Tracking**: Detailed error reporting and debugging

## 🛠️ **Development Patterns**

### 1. **Service Integration**

- **CivicPress Class**: Central orchestrator for all services
- **Dependency Injection**: Services injected and managed centrally
- **Lifecycle Management**: Proper initialization and shutdown procedures
- **Error Handling**: Comprehensive error handling across all services

### 2. **Configuration-Driven Development**

- **Centralized Config**: All configuration in `data/.civic/`
- **Validation**: Configuration validation and integrity checks
- **Hot Reload**: Configuration changes without restart
- **Audit**: Configuration changes logged and tracked

### 3. **Event-Driven Architecture**

- **Hook System**: Event-driven architecture for all operations
- **Workflow Integration**: Workflows triggered by hooks
- **Audit Trails**: Complete audit logging for all events
- **Extensibility**: Easy to add new hooks and workflows

## 📚 **Key Specifications**

### Core System

- `manifest.md` - Platform configuration
- `auth.md` - Authentication and authorization
- `permissions.md` - Role-based access control
- `git-policy.md` - Git workflow policies

### Architecture

- `api.md` - REST API design
- `cli.md` - Command-line interface
- `frontend.md` - User interface design
- `ui.md` - UI architecture and components

### Security

- `security.md` - Security architecture
- `testing-framework.md` - Testing standards
- `accessibility.md` - Accessibility requirements

## 🎯 **Implementation Status**

### Phase 1: Core Foundation ✅ COMPLETE

- ✅ Implement `CivicPress` class orchestrator
- ✅ Build complete hook system with `emit()` method
- ✅ Create workflow engine with auto-indexing
- ✅ Add Git integration with role-aware commits
- ✅ Implement complete authentication system
- ✅ Add comprehensive configuration management

### Phase 2: Development Experience ✅ COMPLETE

- ✅ Implement complete CLI with 20+ commands
- ✅ Build comprehensive REST API with 20+ endpoints
- ✅ Create modern UI with Nuxt 4 + Vue 3 + Nuxt UI Pro
- ✅ Add complete testing framework with 391 tests
- ✅ Implement comprehensive documentation

### Phase 3: Advanced Features 🚀 IN PROGRESS

- 🔄 Complete UI module (95% done - only account management missing)
- 📋 Implement plugin system
- 📋 Complete legal-register module
- 📋 Add advanced workflows and federation
