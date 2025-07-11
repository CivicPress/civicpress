# CivicPress Development Decisions

## Global Authentication Utility Decision (2024-07-10)

### **Decision**: Implement `AuthUtils` Class for Centralized CLI Authentication

**Context**: Multiple CLI commands needed authentication validation, leading to
duplicated code and inconsistent error handling across commands.

**Decision**: Implement `AuthUtils` class to centralize authentication logic and
provide consistent error handling across all CLI commands.

### **Architecture**:

```
AuthUtils Class
├── requireAuthWithCivic(): Validates token and returns civic instance
├── requireAuth(): Validates token and returns user info
├── validateAuth(): Core validation logic with error handling
└── Consistent Error Messages: Same format across all commands
```

### **Key Principles**:

1. **DRY Principle**: No duplicated authentication code
2. **Consistent Errors**: Same error messages across all commands
3. **Easy Integration**: Simple import and method call
4. **Centralized Logic**: All auth logic in one place
5. **Better Maintainability**: Changes only need to be made once

### **Implementation**:

- **AuthUtils Class**: `cli/src/utils/auth-utils.ts`
- **Core Method**: `requireAuthWithCivic(token, shouldOutputJson)`
- **Error Handling**: Consistent JSON and human-readable output
- **CivicPress Integration**: Returns initialized civic instance
- **User Validation**: Validates session tokens and returns user info

### **Commands Updated**:

- ✅ `civic create` - Uses `AuthUtils.requireAuthWithCivic()`
- ✅ `civic edit` - Uses `AuthUtils.requireAuthWithCivic()`
- ✅ `civic commit` - Uses `AuthUtils.requireAuthWithCivic()`
- ✅ `civic me` - Uses existing auth validation

### **Benefits**:

- **Reduced Code**: ~50 lines less per command
- **Consistent UX**: Same error messages everywhere
- **Easy to Add**: Simple to add auth to new commands
- **Maintainable**: Centralized auth logic
- **Testable**: Single point to test authentication

### **Status**: ✅ Implemented and tested

---

## Authentication System Decision (2025-01-27)

### **Decision**: JWT-Based Authentication with Role-Based Permissions

**Context**: Need a robust authentication system that works across CLI and API
while maintaining security and scalability.

**Decision**: Implement JWT-based authentication with role-based permissions,
replacing the previous API key approach.

### **Architecture**:

```
Authentication Flow
├── CLI Login: civic login (generates JWT token)
├── API Authentication: JWT middleware on protected routes
├── Role-Based Permissions: Granular access control
└── Stateless Sessions: No server-side session storage
```

### **Key Principles**:

1. **JWT Tokens**: Stateless authentication with proper token handling
2. **Role-Based Access**: Granular permissions (admin, clerk, council, public)
3. **CLI Integration**: Login command with token storage
4. **API Protection**: All sensitive endpoints require JWT authentication
5. **Security**: Proper token validation and error handling
6. **Stateless**: No server-side session storage needed

### **Implementation**:

- **AuthenticationService**: JWT token generation and validation
- **JWT Middleware**: Express middleware for route protection
- **CLI Login**: `civic login` command with token handling
- **Role Management**: Granular permission system
- **Error Handling**: Proper 401/403 responses for auth failures

### **Benefits**:

- **Scalable**: Stateless authentication works across multiple servers
- **Secure**: JWT tokens with proper validation
- **Flexible**: Role-based permissions for different access levels
- **Integrated**: Works seamlessly across CLI and API
- **Testable**: Easy to mock and test authentication flows

### **Status**: ✅ Implemented and tested

---

## Database Integration Decision (2025-01-27)

### **Decision**: SQLite Integration with Adapter Pattern

**Context**: Need database integration for record management while maintaining
the file-based philosophy.

**Decision**: Implement SQLite integration using adapter pattern for record
management and user data.

### **Architecture**:

```
Database Layer
├── DatabaseService: Centralized database operations
├── DatabaseAdapter: SQLite adapter with CRUD operations
├── RecordManager: Record lifecycle management
└── Integration: API endpoints connected to database
```

### **Key Principles**:

1. **Adapter Pattern**: Database-agnostic design for future PostgreSQL support
2. **SQLite First**: File-based database for development and small deployments
3. **Record Management**: Full CRUD operations for civic records
4. **Test Coverage**: Comprehensive database integration tests
5. **Error Handling**: Proper database error handling and recovery

### **Implementation**:

- **DatabaseService**: Centralized database operations
- **DatabaseAdapter**: SQLite adapter with full CRUD support
- **RecordManager**: Comprehensive record lifecycle management
- **API Integration**: All record endpoints connected to database
- **Test Coverage**: Complete database integration tests

### **Benefits**:

- **Portable**: SQLite files can be easily backed up and moved
- **Fast**: Local database provides excellent performance
- **Reliable**: Mature SQLite with excellent stability
- **Testable**: Easy to create test databases and fixtures
- **Scalable**: Adapter pattern allows PostgreSQL migration later

### **Status**: ✅ Implemented and tested

---

## Testing Strategy Decision (2025-01-27)

### **Decision**: Comprehensive Test Suite with 95.6% Pass Rate Target

**Context**: Need robust testing to ensure system reliability and
maintainability.

**Decision**: Implement comprehensive test suite covering CLI, Core, and API
with high pass rate target.

### **Architecture**:

```
Test Coverage
├── CLI Tests: All commands with comprehensive coverage
├── Core Tests: Database, auth, config services
├── API Tests: Authentication and record endpoints
├── Integration Tests: End-to-end system testing
└── Test Fixtures: Complete test data and examples
```

### **Key Principles**:

1. **High Coverage**: Target 95%+ pass rate across all modules
2. **Real Testing**: Use real authentication and database integration
3. **Comprehensive**: Cover CLI, Core, and API functionality
4. **Fixtures**: Complete test data and examples
5. **Integration**: End-to-end system testing

### **Implementation**:

- **CLI Tests**: All commands with proper mocking
- **Core Tests**: Database service, auth service, config discovery
- **API Tests**: Authentication and record endpoints
- **Integration Tests**: End-to-end system testing
- **Test Fixtures**: Complete test data and examples

### **Benefits**:

- **Reliable**: High test coverage ensures system stability
- **Maintainable**: Easy to catch regressions and bugs
- **Confidence**: Real integration testing builds confidence
- **Documentation**: Tests serve as living documentation
- **Quality**: High pass rate indicates system quality

### **Status**: ✅ Achieved 95.6% pass rate

---

## Role-Based Authorization Decision (2024-07-09)

### **Decision**: Comprehensive Role-Based Authorization for All CLI Commands

**Context**: Need granular access control across all CLI commands to ensure
security and proper permission management in civic government workflows.

**Decision**: Implement comprehensive role-based authorization system with
granular permissions for all CLI commands, including role hierarchy and
automatic permission inheritance.

### **Architecture**:

```
Authorization System
├── RoleManager: Centralized role and permission management
├── Permission Matrix: Granular permissions for each command type
├── Role Hierarchy: Admin > Mayor > Council > Clerk > Editor > Viewer > Public
├── userCan(): Core permission checking function
└── CLI Integration: All commands check appropriate permissions
```

### **Key Principles**:

1. **Granular Permissions**: Specific permissions for each command type
2. **Role Hierarchy**: Permissions inherit from parent roles
3. **Security First**: All commands require authentication and authorization
4. **Consistent UX**: Same error messages and JSON output across commands
5. **Default Roles**: Comprehensive role configuration with inheritance
6. **Non-Interactive Setup**: `--data-dir` support with automatic role setup

### **Permission Matrix**:

| Command          | Permission Required | Description           |
| ---------------- | ------------------- | --------------------- |
| `civic create`   | `records:create`    | Create new records    |
| `civic edit`     | `records:edit`      | Edit existing records |
| `civic commit`   | `records:edit`      | Commit changes        |
| `civic hook`     | `hooks:manage`      | Manage hooks          |
| `civic template` | `templates:manage`  | Manage templates      |
| `civic import`   | `records:import`    | Import records        |
| `civic export`   | `records:export`    | Export records        |
| `civic list`     | `records:view`      | List records          |
| `civic view`     | `records:view`      | View specific records |
| `civic search`   | `records:view`      | Search records        |
| `civic status`   | `records:view`      | Check status          |
| `civic history`  | `records:view`      | View history          |
| `civic diff`     | `records:view`      | Show differences      |

### **Implementation**:

- **RoleManager Class**: `core/src/auth/role-manager.ts`
- **userCan Function**: `core/src/auth/role-utils.ts`
- **Default Roles**: `.system-data/roles.default.yml`
- **CLI Integration**: All commands use `userCan()` for permission checks
- **Non-Interactive Init**: `--data-dir` support with automatic role setup
- **Comprehensive Testing**: 272 tests passing with authorization coverage

### **Benefits**:

- **Security**: Granular access control for all operations
- **Scalability**: Role hierarchy supports complex permission scenarios
- **Usability**: Consistent error messages and JSON output
- **Maintainability**: Centralized authorization logic
- **Testability**: Comprehensive test coverage for all scenarios
- **Flexibility**: Easy to add new roles and permissions

### **Status**: ✅ Implemented and tested (272 tests passing)

---

## Database Architecture Decision (2025-07-09)

### **Decision**: Database as Performance Layer, File System as Source of Truth

**Context**: Need to add database for scaling, auth, indexing, and vendor
independence while maintaining CivicPress's human-readable, transparent
philosophy.

**Decision**: Implement database as **performance optimization layer**, with
file system remaining the **source of truth**.

### **Architecture**:

```
// Database is OPTIMIZATION, not source of truth
File System (Source of Truth)
├── .civic/records/bylaw-001.md
├── .civic/records/policy-002.md
└── .civic/config.yml

Database (Performance Layer)
├── Fast search indexing
├── User sessions
├── API key storage
└── Cached metadata
```

### **Key Principles**:

1. **Files are the source of truth** - always human-readable
2. **Database is performance optimization** - never overwrites files
3. **Git provides audit trail** - immutable history
4. **Database can be rebuilt** from files at any time
5. **Civic records stay in Markdown** - never in database
6. **Database only for ephemeral data** - sessions, keys, cache

### **Sync Direction**:

- **File → Database** (one-way sync for civic data)
- **Database → File** (only for user management data)

### **What Goes Where**:

#### **File System (Source of Truth)**:

- ✅ Civic records (bylaws, policies, etc.)
- ✅ Configuration (`.civic/config.yml`)
- ✅ Templates (`.civic/templates/`)
- ✅ Workflows (`.civic/workflows.yml`)

#### **Database (Performance Only)**:

- ✅ Search indexes
- ✅ User sessions
- ✅ API keys
- ✅ Cached metadata
- ✅ Audit logs

### **Implementation Strategy**:

1. Start with SQLite (file-based, Git-friendly)
2. Database syncs FROM files, never overwrites
3. Civic records always read from files first
4. Database provides fast search and user management
5. Easy migration path to PostgreSQL later

### **Benefits**:

- **Resilient**: Database failure = no data loss
- **Transparent**: Files are always readable
- **Portable**: Can work without database
- **Trustworthy**: Git provides immutable audit trail
- **Fast**: Database provides performance when available

### **Status**: Approved and ready for implementation

---

## Previous Decisions

## Architecture & Technology Stack

### CLI Framework

- **Decision**: Using CAC (Command And Conquer) instead of Commander
- **Reason**: Better TypeScript support and more modern API
- **Status**: ✅ Implemented

### Testing Framework

- **Decision**: Using Vitest for testing
- **Reason**: Better performance and modern features compared to Jest
- **Status**: ✅ Implemented

### Package Manager

- **Decision**: Using pnpm for monorepo management
- **Reason**: Better performance and disk space efficiency
- **Status**: ✅ Implemented

### CLI Output Format

- **Decision**: All CLI commands support `--json` and `--silent` flags
- **Reason**: Machine-readable output for automation and testing
- **Status**: ✅ Implemented

### Exit Codes

- **Decision**: CLI returns exit code 0 when no records found (not an error)
- **Reason**: Consistent with Unix philosophy - no results is not an error
- **Status**: ✅ Implemented

### Configuration Management

- **Decision**: Configuration files stored in `data/.civic/` directory
- **Reason**: Centralized configuration management
- **Status**: ✅ Implemented

### Template Storage

- **Decision**: Templates stored in `.civic` folder with basic defaults
- **Reason**: Easy access and version control
- **Status**: ✅ Implemented

### Hook System

- **Decision**: `civic hook --disable record:updated` auto-commits changes
- **Reason**: Better UX - no manual commit step required
- **Status**: ✅ Implemented

### Dry Run Options

- **Decision**:
  - `--dry-run`: Complete dry-run
  - `--dry-run-hooks`: Dry-run only hooks while executing main actions
  - Combined flags result in complete dry-run with hooks activated
- **Reason**: Granular control over what gets executed
- **Status**: ✅ Implemented

### Documentation

- **Decision**: Using Mermaid for all architecture diagrams
- **Reason**: Standard format, good tooling support
- **Status**: ✅ Implemented

### Commit Message Style

- **Decision**: Toned-down, non-pretentious commit messages
- **Reason**: Professional but approachable communication
- **Status**: ✅ Implemented

## API Development

### REST API Framework

- **Decision**: Express.js with TypeScript
- **Reason**: Mature, well-supported, excellent TypeScript integration
- **Status**: ✅ Implemented

### API Documentation

- **Decision**: Swagger UI with OpenAPI 3.0 specification
- **Reason**: Industry standard, interactive documentation
- **Status**: ✅ Implemented (with SSL issues in development)

### HTTPS Strategy for Development

- **Decision**: Keep HTTP for local development, add HTTPS later
- **Reason**:
  - Reduces initial setup complexity
  - Browser SSL issues can be worked around with desktop tools
  - HTTPS can be added when closer to production
- **Status**: ✅ Current approach

### API Testing Tools

- **Decision**: Hybrid approach - Swagger UI for docs, Hoppscotch/Postman for
  testing
- **Reason**:
  - Desktop apps don't have browser SSL restrictions
  - Swagger UI provides good documentation
  - Best of both worlds
- **Status**: ✅ Current approach

### API Authentication

- **Decision**: JWT-based authentication with role-based permissions
- **Reason**: Secure, scalable, and works across CLI and API
- **Status**: ✅ Implemented

### Error Handling

- **Decision**: Consistent error response format with timestamps and context
- **Reason**: Better debugging and monitoring
- **Status**: ✅ Implemented

### Rate Limiting

- **Decision**: Implement rate limiting for API endpoints
- **Reason**: Security and resource protection
- **Status**: ✅ Implemented

### CORS Configuration

- **Decision**: Configured CORS for development and production
- **Reason**: Enable cross-origin requests when needed
- **Status**: ✅ Implemented

## Development Workflow

### Code Quality

- **Decision**: ESLint with TypeScript support in all packages
- **Reason**: Consistent code quality across monorepo
- **Status**: ✅ Implemented

### Build Process

- **Decision**: Separate build processes for CLI and API
- **Reason**: Independent deployment and testing
- **Status**: ✅ Implemented

### Development Server

- **Decision**: `pnpm run dev` starts entire solution (core, CLI, API)
- **Reason**: Single command for full development environment
- **Status**: ✅ Implemented

## Future Considerations

### HTTPS for Development

- **Decision**: Add mkcert for local HTTPS when closer to production
- **Reason**: Better matches production environment
- **Status**: 🔄 Planned for later

### OpenAPI Spec Generation

- **Decision**: Generate real OpenAPI specs from actual endpoint implementations
- **Reason**: Accurate and up-to-date documentation
- **Status**: 🔄 Planned for later

### API Integration Tests

- **Decision**: Add comprehensive API integration tests
- **Reason**: Ensure API reliability
- **Status**: 🔄 Planned for later

### Deployment Strategy

- **Decision**: TBD - likely containerized deployment
- **Reason**: Consistent environments
- **Status**: 🔄 To be decided

## API Architecture Decisions

### Centralized Response System (2024-01-XX)

**Decision**: Implement centralized response handling across all API routes
**Rationale**:

- Ensures consistent error handling and logging
- Provides standardized success/error response formats
- Improves maintainability and debugging
- Enables better observability and monitoring **Implementation**: Created
  `sendSuccess` and `sendError` utilities in API middleware

### Status API Design (2024-01-XX)

**Decision**: Implement comprehensive system monitoring API with multiple
endpoints **Rationale**:

- Provides system health and performance monitoring
- Enables Git repository status tracking
- Offers record statistics and configuration monitoring
- Supports operational visibility and troubleshooting **Implementation**:
- `GET /api/status` - Comprehensive system status
- `GET /api/status/git` - Detailed Git status
- `GET /api/status/records` - Record statistics
- Includes system health, memory usage, uptime, configuration status

### Validation API Design (2024-01-XX)

**Decision**: Implement record validation API with issue categorization
**Rationale**:

- Ensures data quality and governance compliance
- Provides detailed issue reporting with severity levels
- Supports both single and bulk validation operations
- Enables proactive quality monitoring **Implementation**:
- `POST /api/validation/record` - Single record validation
- `POST /api/validation/bulk` - Bulk validation with summaries
- `GET /api/validation/status` - System-wide validation status
- `GET /api/validation/record/:recordId` - Validate specific record
- Issue categorization: error, warning, info
- YAML validation, content analysis, template variable detection

### History API Implementation (2024-01-XX)

**Decision**: Implement Git commit history API for transparency and audit
**Rationale**:

- Provides trust and transparency for record changes
- Enables audit trail functionality
- Supports filtering and pagination for large histories
- Mirrors CLI history command functionality **Implementation**:
- `GET /api/history` - Git commit history with filtering
- `GET /api/history/:record` - History for specific record
- Supports author, date range, pagination filtering
- Returns detailed commit information with metadata

## CLI Architecture Decisions

### Centralized Output System (2024-01-XX)

**Decision**: Implement centralized CLI output system with structured logging
**Rationale**:

- Ensures consistent user experience across commands
- Provides JSON and silent modes for automation
- Improves maintainability and debugging
- Enables better error reporting and progress tracking **Implementation**:
  Created CLI output utilities with success/error/info/debug/progress outputs

### CLI Command Convention (2024-01-XX)

**Decision**: Mirror CLI commands after REST API endpoints **Rationale**:

- Provides consistent interface patterns
- Reduces cognitive load for users
- Enables easier API-to-CLI mapping
- Supports automation and scripting **Implementation**: CLI commands follow REST
  API resource patterns

## Core Architecture Decisions

### Centralized Core Output System (2024-01-XX)

**Decision**: Implement centralized output system for core module **Rationale**:

- Provides consistent logging across core services
- Enables structured output and context awareness
- Improves debugging and monitoring
- Supports operation timing and error context **Implementation**: Built on
  existing logger with structured output capabilities

## Testing Decisions

### Standardized Test Suite (2024-01-XX)

**Decision**: Use standardized test suite with robust setup/teardown
**Rationale**:

- Ensures consistent test environment
- Provides reusable fixtures and configurations
- Improves test reliability and maintainability
- Supports comprehensive test coverage **Implementation**: Created fixtures for
  configs, roles, and YAML documents

### Test Output Expectations (2024-01-XX)

**Decision**: CLI commands return exit code 0 when no records found
**Rationale**:

- Distinguishes between "no results" and "error"
- Enables proper error handling in scripts
- Provides consistent behavior across commands
- Supports automation workflows **Implementation**: All CLI commands return
  success with appropriate output messages

## Configuration Decisions

### Template Storage (2024-01-XX)

**Decision**: Store templates in `.civic` folder with default templates
**Rationale**:

- Provides centralized template management
- Ensures templates are version controlled
- Supports default templates for new installations
- Enables easy template customization **Implementation**: Templates stored in
  `.civic/templates/` with basic defaults

### Hook Configuration (2024-01-XX)

**Decision**: Auto-commit hook configuration changes **Rationale**:

- Ensures configuration changes are tracked
- Reduces manual intervention
- Provides audit trail for configuration changes
- Supports automation workflows **Implementation**: Hook commands automatically
  commit configuration changes

## Development Workflow Decisions

### Build Process (2024-01-XX)

**Decision**: Use `pnpm run build` for CLI builds without post-build patching
**Rationale**:

- Avoids bad practice of patching dist/ folder
- Ensures clean build process
- Improves build reliability
- Supports proper dependency management **Implementation**: CLI builds use
  standard pnpm build process

### Documentation Standards (2024-01-XX)

**Decision**: Use Mermaid for all architecture diagrams **Rationale**:

- Provides consistent diagram format
- Enables version-controlled documentation
- Supports automated diagram generation
- Improves documentation maintainability **Implementation**: All diagrams use
  Mermaid syntax in `.civic/diagrams/`

### Commit Message Style (2024-01-XX)

**Decision**: Use toned-down, non-pretentious commit messages **Rationale**:

- Improves readability and clarity
- Reduces cognitive load for reviewers
- Supports clear change tracking
- Enables better project history **Implementation**: Commit messages use clear,
  descriptive language

## Security Decisions

### Authentication Strategy (2024-01-XX)

**Decision**: Use OAuth-based authentication with role mapping **Rationale**:

- Provides secure, industry-standard authentication
- Supports multiple identity providers
- Enables role-based access control
- Reduces security maintenance burden **Implementation**: OAuth integration with
  GitHub, Google, Microsoft support

### Permission System (2024-01-XX)

**Decision**: Implement granular, role-based permission system **Rationale**:

- Provides fine-grained access control
- Supports governance and compliance requirements
- Enables flexible user role management
- Ensures data security and privacy **Implementation**: Permission system with
  inherited permissions hierarchy

## Performance Decisions

### API Response Optimization (2024-01-XX)

**Decision**: Implement strategic caching for frequently accessed data
**Rationale**:

- Improves response times for common operations
- Reduces server load and resource usage
- Enhances user experience
- Supports scalability requirements **Implementation**: Caching for status,
  validation, and history endpoints

### Git Operations Optimization (2024-01-XX)

**Decision**: Optimize Git operations for large repositories **Rationale**:

- Improves performance for history and status operations
- Reduces memory usage for large commit histories
- Enhances user experience
- Supports enterprise-scale deployments **Implementation**: Efficient Git
  command execution with proper pagination
