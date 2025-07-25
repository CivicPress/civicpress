# CivicPress Development Decisions

## UI Module Development (Latest)

### Technology Stack Decisions

- **Framework**: Nuxt 4 (Vue 3) chosen over other options
- **UI Library**: Nuxt UI Pro selected for enhanced components
  - Note: Currently paid but planned to go free soon
  - Provides advanced components and better styling out of the box
- **Mode**: SPA (Single Page Application) - no SSR since API-driven
- **Port**: 3030 to avoid conflicts with API server (3000)
- **Styling**: Nuxt UI Pro handles Tailwind CSS automatically

### Authentication Implementation Status

#### **✅ Completed Features**

1. **Login System**:
   - **Dual Authentication**: Username/password + GitHub token support
   - **Form Validation**: Real-time validation with proper error handling
   - **Loading States**: Proper loading indicators during authentication
   - **Error Handling**: Comprehensive error display and recovery
   - **Session Management**: JWT token storage with localStorage persistence
   - **Token Expiration**: Automatic session cleanup on token expiry

2. **Auth Store (Pinia)**:
   - **State Management**: Centralized auth state with Pinia
   - **Persistence**: localStorage-based session persistence
   - **Security**: Proper token validation and cleanup
   - **Integration**: Seamless integration with API plugin
   - **Permissions**: Role and permission checking capabilities

3. **API Integration**:
   - **Automatic Token Injection**: JWT tokens automatically added to requests
   - **401 Handling**: Automatic logout and redirect on authentication failure
   - **Login Endpoint Bypass**: Proper handling of authentication endpoints
   - **Error Recovery**: Graceful handling of network and auth errors

4. **Logout System**:
   - **Confirmation Dialog**: User-friendly logout confirmation
   - **State Cleanup**: Complete auth state and localStorage cleanup
   - **API Integration**: Proper logout API call with error handling
   - **Redirect Flow**: Automatic redirect to login page

#### **❌ Missing Features**

1. **Account Registration**:
   - **Status**: Not implemented
   - **Missing**: User registration page (`/auth/register`)
   - **Missing**: Account creation workflow
   - **Missing**: Email verification (if needed)

2. **Password Reset**:
   - **Status**: Not implemented
   - **Missing**: Password reset page (`/auth/forgot-password`)
   - **Missing**: Password reset workflow
   - **Missing**: Email-based reset functionality

3. **Account Management**:
   - **Status**: Not implemented
   - **Missing**: User profile management
   - **Missing**: Password change functionality
   - **Missing**: Account settings page

### Key Implementation Decisions

1. **API-First Design**: Frontend consumes REST API endpoints
   - Clean separation of concerns
   - Enables multiple frontend implementations
2. **No Custom CSS Initially**: Using Nuxt UI Pro components for styling
   - Removed custom Tailwind config and PostCSS config
   - All styling handled by Nuxt UI Pro components
3. **Development Server**: Running on port 3030 with hot reload
4. **Authentication**: OAuth + user/password integration working

### Current Working State

- ✅ Nuxt 4 development server running on port 3030
- ✅ Nuxt UI Pro components available and working
- ✅ Authentication system functional (login/logout)
- ✅ API server integration configured (port 3000)
- ✅ Development tools enabled
- ✅ Both servers running without conflicts
- ✅ Records interface with search/filtering working

### Manual Setup Required

- User manually installed Nuxt UI Pro
- User manually updated to `@nuxt/ui-pro` in nuxt.config.ts
- Removed custom CSS files that were causing issues
- Cleaned up PostCSS and Tailwind configs

### Next Steps

1. **Immediate**: Implement account registration and password reset
2. **Short Term**: Add user profile management
3. **Medium Term**: Create admin dashboard and plugin registry
4. **Long Term**: Build advanced civic modules

### Troubleshooting Resolved

- **Port Conflicts**: Resolved by using port 3030 for UI
- **CSS Issues**: Resolved by removing custom CSS and using Nuxt UI Pro
- **YAML Errors**: Fixed demo data frontmatter parsing issues
- **Build Errors**: Resolved by cleaning up configuration files
- **Authentication**: Resolved JWT token handling and API integration

## Previous Decisions

### PostgreSQL Support

- **Decision**: Mark PostgreSQL as unsupported with warnings and fallback to
  SQLite
- **Implementation**: Added warnings in CLI init command
- **Reason**: PostgreSQL adapter not implemented, SQLite sufficient for current
  needs

### Test Database Isolation

- **Decision**: Tests should run against their own database, not modify main
  .system-data/civic.db
- **Implementation**: Each test creates its own temporary database
- **Reason**: Prevents test interference and database corruption

### Debug Message Removal

- **Decision**: Remove debug messages from test files for cleaner output
- **Implementation**: Cleaned up console.log statements in test files
- **Reason**: Improve test output readability and performance

### CLI Init Command Enhancement

- **Decision**: When users opt out of demo data, ask for basic organization info
- **Implementation**: Added prompts for organization name and location
- **Reason**: Better user experience and data quality

## Architecture Decisions

### Monorepo Structure

- **Package Manager**: pnpm for efficient monorepo management
- **Workspace**: Configured with pnpm-workspace.yaml
- **Modules**: CLI, API, Core, UI as separate packages
- **Testing**: Vitest for comprehensive test coverage

### Authentication System

- **Multiple Methods**: OAuth (GitHub), user/password, simulated
- **JWT Tokens**: All methods return valid JWT tokens
- **Role-Based**: Granular permissions for civic roles
- **Security**: Proper token validation and role checking

### Database Strategy

- **Primary**: SQLite for simplicity and portability
- **Version Control**: Git-based with automatic commits
- **Indexing**: Advanced search and discovery capabilities
- **Sync**: Real-time synchronization with database

### API Design

- **RESTful**: Comprehensive REST API with 20+ endpoints
- **Authentication**: JWT-based with proper authorization
- **Documentation**: Auto-generated API documentation
- **Testing**: Comprehensive API test suite

## Development Workflow

### Testing Strategy

- **Comprehensive Coverage**: 391 tests passing across all modules
- **Isolation**: Each test runs in its own environment
- **CI/CD Ready**: Automated testing pipeline
- **Quality**: High test coverage ensures stability

### Documentation

- **Specifications**: 50+ comprehensive platform specs
- **API Docs**: Auto-generated and comprehensive
- **Development Guides**: Step-by-step setup instructions
- **Architecture**: Clear system design documentation

### Version Control

- **Git Integration**: Automatic commits for all changes
- **Audit Trail**: Complete history of all modifications
- **Branching**: Feature branches for development
- **Deployment**: Ready for production deployment

## Future Considerations

### Plugin System

- **Architecture**: Extensible plugin registry with hooks
- **Integration**: Custom workflow and component system
- **Security**: Sandboxed plugin execution
- **Documentation**: Comprehensive plugin development guide

### Federation

- **Multi-Node**: Synchronization between multiple instances
- **Data Sharing**: Secure data exchange between municipalities
- **Scalability**: Support for large-scale deployments
- **Resilience**: Offline-first architecture

### Advanced Features

- **Cryptographic Security**: Digital signatures and verification
- **Audit Framework**: Comprehensive change tracking
- **Multi-tenant Support**: Multiple municipality deployments
- **Advanced Workflows**: Configurable civic approval processes
