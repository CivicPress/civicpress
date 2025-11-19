# CivicPress

A comprehensive civic technology platform for managing and publishing civic
records with Git-based version control, role-based access control, and a modern
API.

**🌐 Website:** [civicpress.io](https://civicpress.io) | **📧 Contact:**
[hello@civicpress.io](mailto:hello@civicpress.io)

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
- **Status Transition Controls**: Web UI for managing record status changes with
  workflow validation
- **Bulk Operations**: Efficient bulk record operations
- **Search & Discovery**: Advanced indexing and search
- **Validation System**: Comprehensive record validation and integrity
- **Geography Data Management**: Complete spatial document management system
  - Centralized geography file management with public access
  - Text box input for GeoJSON/KML with live map preview
  - Interactive maps with Leaflet integration
  - Geography file linking to civic records
  - Comprehensive validation and standardized structure

### 🚀 Advanced Features (Planned)

- **Plugin System**: Extensible architecture with custom modules
- **Federation**: Multi-node synchronization and data sharing
- **Advanced Workflows**: Configurable civic approval processes
- **Audit Trails**: Comprehensive change tracking and compliance
- **Civic Modules**: Specialized modules for legal register, voting, feedback
- **Advanced Security**: Cryptographic signatures and verification
- **Multi-tenant Support**: Support for multiple municipalities

### ✅ Workflow Features (Implemented)

- **Status Transition Controls**: Web UI for managing record status changes
- **Role-Based Permissions**: Granular control over who can change record status
- **Workflow Validation**: Automatic enforcement of status transition rules
- **Smart Error Handling**: Helpful error messages with typo suggestions
- **Audit Trail**: Complete logging of all status changes with user attribution

## Quick Start

### Developer Bootstrap

Get up and running quickly with these commands:

```bash
# 1. Clone the repository
git clone https://github.com/CivicPress/civicpress.git
cd civicpress

# 2. Install dependencies
pnpm install

# 3. Build the project (required before using CLI)
pnpm run build

# 4. Make CLI executable (fixes permission issues)
chmod +x cli/dist/index.js

# 5. Initialize a new CivicPress instance
./cli/dist/index.js init

# Or initialize with demo data (Richmond or Springfield)
./cli/dist/index.js init --yes --demo-data richmond-quebec
# or
./cli/dist/index.js init --yes --demo-data springfield-usa
```

**Note**: The `chmod +x` step is required on Unix-like systems (macOS, Linux) to
make the CLI executable. Without it, you'll get a "permission denied" error.

### Initialize a New CivicPress Instance

```bash
# Interactive setup (will prompt for configuration)
./cli/dist/index.js init

# Non-interactive with demo data
./cli/dist/index.js init --yes --demo-data richmond-quebec
./cli/dist/index.js init --yes --demo-data springfield-usa

# With configuration file
./cli/dist/index.js init --config config.yml
```

**Note**: Most operations require authentication. CivicPress supports both
GitHub OAuth and simulated authentication for development. See
[Authentication Guide](docs/auth-system.md) for setup instructions.

### Development Commands

CivicPress provides multiple development commands for different workflows:

```bash
# Start both API and UI in watch mode (recommended)
pnpm run dev

# API development (watch mode by default)
pnpm run dev:api

# UI development
pnpm run dev:ui

# All services in parallel
pnpm run dev:parallel
```

**Note**: Both `pnpm run dev` and `pnpm run dev:api` run in watch mode by
default, automatically restarting when files change.

### CLI Authentication

CivicPress supports multiple authentication methods:

```bash
# Simulated authentication (development)
./cli/dist/index.js auth:simulated --username admin --role admin

# GitHub OAuth (production)
./cli/dist/index.js auth:login --token <your_github_token>

# Username/Password (traditional authentication)
./cli/dist/index.js auth:password --username <username> --password <password>
```

### Basic Usage

```bash
# Create a new record
./cli/dist/index.js create bylaw "Noise Ordinance"

# List all records
./cli/dist/index.js list

# Search records
./cli/dist/index.js search "budget"

# View record history
./cli/dist/index.js history bylaw/noise-ordinance

# Change record status
./cli/dist/index.js status bylaw/noise-ordinance proposed
```

**Tip**: You can create an alias for convenience:

```bash
alias civic='./cli/dist/index.js'
# Then use: civic init, civic list, etc.
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
  -d '{"token": "your_github_token", "provider": "github"}'

# GitHub OAuth authentication
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"token": "your_github_token", "provider": "github"}'

# Password authentication
curl -X POST http://localhost:3000/auth/password \
  -H "Content-Type: application/json" \
  -d '{"username": "user", "password": "password"}'

# Simulated authentication (for testing)
curl -X POST http://localhost:3000/api/auth/simulated \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "role": "admin"}'
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

### API Testing with Hoppscotch

CivicPress includes a comprehensive Hoppscotch collection for testing the API.
The collection is located at `docs/hoppscotch/collection.json` and includes
pre-configured requests for:

- **Authentication** - Login with GitHub token, username/password, and simulated
  auth
- **Records** - CRUD operations for civic records
- **Search** - Full-text search and filtering
- **Geography** - Geography file management and operations
- **Storage** - UUID-based file storage operations
- **Configuration** - System and organization configuration management
- **Users** - User management and permissions

**To use the collection:**

1. Install [Hoppscotch](https://hoppscotch.io/) (browser extension or desktop
   app)
2. Import the collection: `docs/hoppscotch/collection.json`
3. Set environment variables:
   - `baseUrl`: `http://localhost:3000` (or your API URL)
   - `authGitHubToken`: Your GitHub token (if using GitHub auth)
4. Start making requests!

The collection includes automatic token management - after logging in, the
`civicToken` environment variable is automatically set and used for
authenticated requests.

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

### Build & Development Commands

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
pnpm run dev    # Both API and UI in watch mode (recommended)
pnpm run dev:api    # API server in watch mode (port 3000)
pnpm run dev:ui     # UI server (port 3030)
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
- **Testing**: Vitest with comprehensive test coverage (599 tests passing, 22
  skipped)
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
- **[Project Status](docs/project-status.md)** - Current status overview
- **[Roadmap](docs/roadmap.md)** - Development roadmap
- **[Milestones](docs/milestones.md)** - Milestone checklist
- **[Root TODO](docs/todo.md)** - General TODO list

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

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for development guidelines.

## Code of Conduct

Please read our [Code of Conduct](.github/CODE_OF_CONDUCT.md).

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**🌐 [civicpress.io](https://civicpress.io)** | **📧
[hello@civicpress.io](mailto:hello@civicpress.io)** | **💬
[Community Discussions](https://github.com/CivicPress/civicpress/discussions)**

Built with ❤️ for better governance
