# CivicPress

A comprehensive civic technology platform for managing and publishing civic
records with Git-based version control, role-based access control, and a modern
API.

## 🌟 Platform Vision

CivicPress is designed as a **complete civic technology platform** that brings
transparency, participation, and trust back to local governance. The platform
provides:

- **Git-native civic records** with full version control and audit trails
- **Role-based access control** with granular permissions for different civic
  roles
- **Comprehensive API** for programmatic access and integration
- **Modular architecture** supporting plugins and federation
- **Enterprise-grade security** with cryptographic verification and audit logs
- **Scalable design** supporting multi-tenant deployments and federation

## Features

### ✅ Core Functionality (Implemented)

- **Git Integration**: Full Git-based version control for all records
- **Role-Based Access Control**: Granular permissions system with standard civic
  roles
- **REST API**: Comprehensive API with 20+ endpoints and authentication
- **CLI Interface**: Full command-line interface with JSON output support
- **Authentication**: Multiple auth methods (OAuth, simulated, password)
- **Indexing System**: Advanced search and discovery capabilities
- **User Management**: Complete CRUD operations for users with role management

### ✅ Record Management (Implemented)

- **Markdown Schema**: YAML+Markdown with validation
- **Lifecycle Management**: Draft → Published → Archived flow
- **Bulk Operations**: Efficient bulk record operations
- **Search & Discovery**: Advanced indexing and search
- **Validation System**: Comprehensive record validation and integrity

### 🚀 Advanced Features (Planned)

- **Plugin System**: Extensible architecture with custom modules
- **Federation**: Multi-node synchronization and data sharing
- **Advanced Workflows**: Configurable civic approval processes
- **Audit Trails**: Comprehensive change tracking and compliance
- **Civic Modules**: Specialized modules for legal register, voting, feedback
- **Advanced Security**: Cryptographic signatures and verification
- **Multi-tenant Support**: Support for multiple municipalities

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/CivicPress/civicpress.git
cd civicpress

# Install dependencies
pnpm install

# Build the project
pnpm run build
```

**Note**: Most operations require a GitHub Personal Access Token. See
[Authentication Guide](docs/auth-system.md) for setup instructions.

### Initialize a New CivicPress Instance

```bash
# Initialize with interactive setup
civic init

# Or initialize with defaults
civic init --non-interactive
```

### Basic Usage

```bash
# Create a new record
civic create --title "My Record" --type policy

# List all records
civic list

# Search records
civic search "keyword"

# View record history
civic history record-id
```

## API Usage

### Authentication

```bash
# Simulated authentication (for testing)
curl -X POST http://localhost:3000/api/auth/simulated \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "role": "admin"}'

# Password authentication
curl -X POST http://localhost:3000/api/auth/password \
  -H "Content-Type: application/json" \
  -d '{"username": "user", "password": "password"}'
```

### Records API

```bash
# List records
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/records

# Create record
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "New Record", "type": "policy"}' \
  http://localhost:3000/api/records
```

## Civic Roles & Permissions

CivicPress implements a comprehensive role-based access control system designed
for civic governance:

| Role             | Description                                | Permissions                      |
| ---------------- | ------------------------------------------ | -------------------------------- |
| `clerk`          | Creates, edits, and proposes civic records | Create, edit, propose records    |
| `council-member` | Reviews, comments, and approves records    | Review, comment, approve records |
| `mayor`          | Final approval and publishing              | Final approval, publish to main  |
| `auditor`        | Read-only access for auditing              | Audit commits and records        |
| `contributor`    | Proposes drafts requiring review           | Propose drafts                   |
| `admin`          | Full system access and setup               | Full access                      |
| `public`         | Read-only access to published data         | Read published records           |

## Development

### Running Tests

```bash
# Run all tests
pnpm run test:run

# Run specific test file
pnpm run test:run tests/cli/users.test.ts

# Run tests in watch mode
pnpm run test:watch
```

### Development Commands

```bash
# Build all packages
pnpm run build

# Clean build artifacts
pnpm run clean

# Lint code
pnpm run lint

# Type check
pnpm run type-check
```

## Architecture

```
CivicPress
├── CLI (Node.js + CAC) ✅ Fully tested
├── API (Node.js + Express) ✅ Fully tested
├── Core (TypeScript libraries) ✅ Fully tested
├── Modules (Plugin system) 🚀 Planned
├── Federation (Multi-node sync) 🚀 Planned
└── Frontend (Astro → Nuxt PWA) ⏳ Migration planned
```

## Technology Stack

- **Backend**: Node.js, TypeScript, Express, SQLite
- **Authentication**: JWT, OAuth, Role-based access control
- **Version Control**: Git integration with full audit trails
- **Testing**: Vitest with comprehensive test coverage (391 tests)
- **Build System**: pnpm workspaces
- **Security**: Cryptographic verification, audit logs, compliance

## Documentation

### 📚 Comprehensive Documentation

- **[Bootstrap Guide](docs/bootstrap-guide.md)** - Complete setup guide
- **[API Integration Guide](docs/api-integration-guide.md)** - Developer guide
  with examples
- **[CLI Usage Guide](docs/cli.md)** - Command-line interface documentation
- **[Specifications](docs/specs-index.md)** - Complete platform specifications
  (50+ specs)

### 🔧 Development Resources

- **[Development Patterns](docs/dev-pattern.md)** - Development guidelines
- **[Testing Framework](docs/specs/testing-framework.md)** - Testing standards
- **[API Reference](docs/api.md)** - Complete API documentation
- **[Security Guide](docs/specs/security.md)** - Security policies and practices

## Platform Roadmap

### ✅ Phase 1: Foundation (Complete)

- Core CLI and API functionality
- Basic authentication and permissions
- Git integration and version control
- Comprehensive test coverage

### 🚀 Phase 2: API Enhancement (Current)

- Diff API for record comparison
- Analytics API for usage statistics
- Bulk Operations API
- Advanced Search API

### 🔮 Phase 3: Advanced Features (Planned)

- Plugin system for extensibility
- Federation for multi-node support
- Advanced workflow engine
- Civic-specific modules (voting, feedback, legal register)

### 🌟 Phase 4: Enterprise Features (Planned)

- Multi-tenant support
- Advanced security features
- Comprehensive audit trails
- Federation and synchronization

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Built with ❤️ for better governance**
