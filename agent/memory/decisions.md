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
