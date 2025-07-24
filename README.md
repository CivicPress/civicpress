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
- **Modern UI** with Nuxt 4 and Nuxt UI Pro for user interaction
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
- **Search System**: Advanced full-text search and discovery capabilities
- **User Management**: Complete CRUD operations for users with role management
- **Modern UI**: Nuxt 4 frontend with Nuxt UI Pro components

### ✅ Record Management (Implemented)

- **Markdown Schema**: YAML+Markdown with validation
- **Lifecycle Management**: Draft → Proposed → Approved → Archived flow
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

**Note**: Most operations require authentication. CivicPress supports both
GitHub OAuth and simulated authentication for development. See
[Authentication Guide](docs/auth-system.md) for setup instructions.

### Initialize a New CivicPress Instance

```bash
# Initialize with interactive setup
civic init

# Or initialize with demo data
civic init --demo-data "Springfield"

# Or initialize with configuration file
civic init --config config.yml
```

### Authentication

CivicPress supports multiple authentication methods:

```bash
# Simulated authentication (development)
civic auth:simulated --username admin --role admin

# GitHub OAuth (production)
civic auth:login --token <your_github_token>

# Username/Password (traditional authentication)
civic auth:password --username <username> --password <password>
```

### Basic Usage

```bash
# Create a new record
civic create bylaw "Noise Ordinance"

# List all records
civic list

# Search records
civic search "budget"

# View record history
civic history bylaw/noise-ordinance

# Change record status
civic status bylaw/noise-ordinance proposed
```

### Running the UI

```bash
# Start the API server (required for UI)
pnpm dev:api

# Start the UI development server
pnpm dev:ui

# Access the UI at http://localhost:3030
```

## API Usage

### Authentication

```bash
# Simulated authentication (development)
curl -X POST http://localhost:3000/auth/simulated \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "role": "admin"}'

# GitHub OAuth authentication
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"token": "your_github_token", "provider": "github"}'

# Password authentication
curl -X POST http://localhost:3000/auth/password \
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
  -d '{"title": "New Bylaw", "type": "bylaw", "status": "draft"}' \
  http://localhost:3000/api/records

# Search records
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/api/search?q=policy"
```

## Civic Roles & Permissions

CivicPress implements a comprehensive role-based access control system designed
for civic governance:

| Role      | Description                                | Permissions                      |
| --------- | ------------------------------------------ | -------------------------------- |
| `admin`   | Full system access and setup               | All permissions                  |
| `clerk`   | Creates, edits, and proposes civic records | Create, edit, propose records    |
| `council` | Reviews, comments, and approves records    | Review, comment, approve records |
| `public`  | Read-only access to published data         | Read published records           |

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

# Start development servers
pnpm dev:api    # API server on port 3000
pnpm dev:ui     # UI server on port 3030
```

## Architecture

```
CivicPress
├── CLI (Node.js + CAC) ✅ Fully tested
├── API (Node.js + Express) ✅ Fully tested
├── Core (TypeScript libraries) ✅ Fully tested
├── Database (SQLite + Git) ✅ Fully tested
└── UI (Nuxt 4 + Nuxt UI Pro) ✅ Static page working
    ├── API Integration 🔄 In progress
    ├── Authentication 🔄 Planned
    └── Admin Interface 🔄 Planned
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
- **[Authentication Guide](docs/auth-system.md)** - Authentication and
  authorization
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

- Search API with full-text search
- Configuration API for record types and statuses
- Export/Import API for bulk operations
- Status and monitoring API

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
