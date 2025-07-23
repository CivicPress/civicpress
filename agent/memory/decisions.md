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

### Key Implementation Decisions

1. **API-First Design**: Frontend consumes REST API endpoints
   - Clean separation of concerns
   - Enables multiple frontend implementations
2. **No Custom CSS Initially**: Using Nuxt UI Pro components for styling
   - Removed custom Tailwind config and PostCSS config
   - All styling handled by Nuxt UI Pro components
3. **Development Server**: Running on port 3030 with hot reload
4. **Authentication**: Planned OAuth + user/password integration

### Current Working State

- ✅ Nuxt 4 development server running on port 3030
- ✅ Nuxt UI Pro components available and working
- ✅ Static page serving successfully
- ✅ API server integration configured (port 3000)
- ✅ Development tools enabled
- ✅ Both servers running without conflicts

### Manual Setup Required

- User manually installed Nuxt UI Pro
- User manually updated to `@nuxt/ui-pro` in nuxt.config.ts
- Removed custom CSS files that were causing issues
- Cleaned up PostCSS and Tailwind configs

### Next Steps

1. **Immediate**: Implement API composables for backend integration
2. **Short Term**: Add authentication flow (OAuth + user/password)
3. **Medium Term**: Create record management interface
4. **Long Term**: Build admin dashboard and plugin registry

### Troubleshooting Resolved

- **Port Conflicts**: Resolved by using port 3030 for UI
- **CSS Issues**: Resolved by removing custom CSS and using Nuxt UI Pro
- **YAML Errors**: Fixed demo data frontmatter parsing issues
- **Build Errors**: Resolved by cleaning up configuration files

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
