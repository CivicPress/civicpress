# CivicPress Development Decisions

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

- **Decision**: API key authentication with role-based access (clerk, council,
  public)
- **Reason**: Simple but effective for civic governance use case
- **Status**: ✅ Placeholder implemented

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
