# 🌱 CivicPress

> **Public infrastructure platform designed to bring transparency,
> participation, and trust back to local governance.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.11.1-brightgreen.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-blue.svg)](https://pnpm.io/)
[![Tests](https://img.shields.io/badge/tests-95.6%25%20passing-brightgreen.svg)](https://github.com/CivicPress/civicpress)

## 🎯 Mission

CivicPress exists to replace opaque, expensive, and fragile government IT
systems with open, modular, Git-native civic software that is accessible,
auditable, and human-centered.

## 🌟 Core Principles

- **Transparency by default** — Government should work in daylight
- **Trust through traceability** — Every record, every change, every action is
  inspectable
- **Open-source and auditable** — No black boxes, no hidden logic
- **Equity and accessibility** — Built for everyone, not just the tech-savvy
- **Local-first resilience** — Works offline, in small towns, or at scale
- **Markdown as civic format** — Legible, versionable, future-proof civic
  records

## 🚀 Quick Start

### Prerequisites

- Node.js 20.11.1+ (see `.nvmrc`)
- pnpm (will be installed automatically)

### Installation

```bash
# Clone the repository
git clone https://github.com/CivicPress/civicpress.git
cd civicpress

# Run the setup script
./setup.sh

# Or manually install dependencies
pnpm install

# Build all packages
pnpm run build
```

### First Steps

```bash
# Initialize your CivicPress repository
civic init

# Login to get JWT token
civic login

# Create your first record
civic create bylaw "Public Meeting Procedures"

# View your records
civic list
```

### Development

```bash
# Install dependencies (if not already done)
pnpm install

# Start the development environment
pnpm run dev

# Run tests (95.6% pass rate)
pnpm run test:run

# Format code
pnpm run format

# Check formatting
pnpm run format:check

# Validate specifications
pnpm run spec:validate

# Check spec dependencies
pnpm run spec:check-deps

# List all specs
pnpm run spec:list

# Run all spec checks
pnpm run spec:check
```

## 📖 Documentation

- [🚀 Bootstrap Guide](docs/bootstrap-guide.md) - **Start here!** Complete
  step-by-step setup guide
- [CLI Usage Guide](docs/cli.md)
- [Template System Guide](docs/templates.md)
- [Validation System Guide](docs/validation.md)
- [Workflow Configuration](docs/workflows.md)
- [🔌 API Integration Guide](docs/api-integration-guide.md) - **NEW!** REST API
  for programmatic access
- [🛠️ Development Patterns](docs/dev-pattern.md) - **NEW!** Development
  guidelines and patterns

## 🔌 REST API

CivicPress provides a comprehensive REST API with JWT authentication for
programmatic access to civic records, workflows, and governance features:

### Quick API Start

```bash
# Start the API server
cd modules/api && pnpm run dev

# Test the API
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/records
```

### API Features

- **🔐 JWT Authentication**: Secure JWT-based authentication with role-based
  permissions
- **📋 Records Management**: Full CRUD operations for civic records with
  database integration
- **👥 Role-based Access**: Enforce permissions based on user roles (admin,
  clerk, council, public)
- **🔄 Workflow Control**: Manage record status transitions
- **📄 Template System**: Use predefined templates for record creation
- **📊 Export/Import**: Bulk data operations
- **🔍 Search & Filter**: Advanced querying capabilities
- **🗄️ Database Integration**: SQLite database with full record management

### Example API Usage

```bash
# Login to get JWT token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "clerk", "password": "password"}'

# Use JWT token for authenticated requests
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/v1/records

# Create new bylaw
curl -X POST http://localhost:3000/api/v1/records \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "Parking Regulations",
    "type": "bylaw",
    "content": "# Parking Regulations\n\nNo parking on Main Street..."
  }'

# Update record status
curl -X PUT http://localhost:3000/api/v1/records/parking-regulations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"status": "proposed"}'
```

### API Documentation

- [📚 Complete API Reference](modules/api/README.md) - Detailed endpoint
  documentation
- [🔧 Integration Guide](docs/api-integration-guide.md) - Developer guide with
  examples
- [🎯 Quick Examples](docs/api-integration-guide.md#api-integration-examples) -
  Code samples in JavaScript, Python, cURL

## 🎛️ CLI Features

CivicPress provides a comprehensive command-line interface with JWT
authentication for managing civic records with governance workflows, role-based
permissions, and advanced features:

### Authentication

```bash
# Login to get JWT token
civic login

# Check authentication status
civic status
```

### Record Management

```bash
# Create records with templates
civic create bylaw "Public Meeting Procedures" --template advanced
civic create policy "Data Privacy Policy" --template default
civic create resolution "Budget Approval 2024" --template standard

# View and edit records
civic view "public-meeting-procedures"
civic edit "data-privacy-policy"

# List and search records
civic list --type bylaw --status draft
civic search "privacy" --type policy
```

### Governance Workflows

```bash
# Change record status with role-based permissions
civic status "public-meeting-procedures" proposed --role clerk
civic status "budget-approval" approved --role council

# View available status transitions
civic status "public-meeting-procedures"

# Commit changes with role-based messages
civic commit "public-meeting-procedures" --role clerk
```

### Import & Export

```bash
# Export records in multiple formats
node cli/dist/index.js export --format json --output reports/
node cli/dist/index.js export --format csv
node cli/dist/index.js export --format markdown

# Import records from various sources
node cli/dist/index.js import path/to/records/ --overwrite
node cli/dist/index.js import path/to/record.json --dry-run
```

### Advanced Template System

```bash
# List available templates
node cli/dist/index.js template --list

# Show template details
node cli/dist/index.js template --show bylaw/advanced

# Create custom templates
node cli/dist/index.js template --create "custom-bylaw" --type bylaw
```

### Validation & Quality

```bash
# Validate records
node cli/dist/index.js validate bylaw/public-meeting-procedures
node cli/dist/index.js validate --all --json

# Validate templates
node cli/dist/index.js template --validate bylaw/default
```

### Git Integration

```bash
# View history
node cli/dist/index.js history "public-meeting-procedures"

# Compare versions
node cli/dist/index.js diff "data-privacy-policy" --from v1.0.0 --to v1.1.0

# View recent changes
node cli/dist/index.js diff "public-meeting-procedures"
```

### Hooks & Automation

```bash
# Manage hooks
node cli/dist/index.js hook --list
node cli/dist/index.js hook --enable "record:created"
node cli/dist/index.js hook --disable "record:updated"
```

## 🎨 Advanced Template System

CivicPress features a sophisticated template system with inheritance,
validation, and customization:

### Template Inheritance

```yaml
# .civic/templates/bylaw/advanced.md
---
template: bylaw/advanced
extends: bylaw/base
validation:
  required_fields: [bylaw_number, fiscal_year]
  advanced_rules:
    - name: "approval_workflow"
      condition: "status == 'approved'"
      fields: [approval_date, approved_by]
      rule: "approved_by_authority"
      severity: "error"
---
```

### Advanced Validation

- **Conditional Rules** - Validation that applies based on record status
- **Field Relationships** - Required together, mutually exclusive fields
- **Custom Validators** - Email, phone, date, semantic version validation
- **Business Rules** - Complex approval workflows and compliance checks

### Template Features

- **Multi-level Inheritance** - Templates can extend and override parent
  templates
- **Variable Substitution** - Dynamic content with context-aware variables
- **Conditional Blocks** - Content that shows/hides based on record data
- **Section Validation** - Required sections with minimum length requirements

## 🔄 Governance Workflows

CivicPress supports configurable governance workflows with role-based
permissions:

### Workflow Configuration

```yaml
# .civic/workflows.yml
statuses:
  - draft
  - proposed
  - approved
  - archived

transitions:
  draft: [proposed]
  proposed: [approved, archived]
  approved: [archived]
  archived: []

roles:
  clerk:
    can_transition:
      draft: [proposed]
      proposed: [approved]
  council:
    can_transition:
      approved: [archived]
      any: [archived]
  public:
    can_view: [bylaw, policy, resolution]
```

### Role-Based Permissions

- **Status Transitions** - Control who can change record status
- **Record Operations** - Create, edit, view, delete permissions
- **Workflow Enforcement** - Automatic validation of all actions
- **Audit Trail** - Complete history of all changes

## 📊 Validation System

Comprehensive validation ensures data quality and compliance:

### Validation Types

- **Basic Validation** - Required fields, data types, format checking
- **Advanced Validation** - Business rules, field relationships, custom
  validators
- **Content Validation** - Section requirements, placeholder detection
- **Template Validation** - Template structure and inheritance validation
- **Workflow Validation** - Status transitions and role permissions

### Validation Commands

```bash
# Validate single record
node cli/dist/index.js validate bylaw/public-meeting-procedures

# Validate all records
node cli/dist/index.js validate --all --json

# Validate with auto-fix
node cli/dist/index.js validate --all --fix

# Strict validation (warnings as errors)
node cli/dist/index.js validate --all --strict
```

## 📁 Project Structure

```
civicpress/
├── .civic/          # CivicPress platform configuration
│   ├── templates/   # Template system (inheritance, validation)
│   ├── workflows.yml # Governance workflow configuration
│   └── config.yml   # Platform configuration
├── agent/           # Local AI memory used for dev context only — not deployed with the app
├── cli/             # Command-line interface
├── core/            # Core platform modules
├── modules/         # Civic modules (legal-register, etc.)
├── data/            # Civic records and data
├── tests/           # Comprehensive test suite
├── docs/            # Documentation
└── setup.sh         # Development environment setup
```

## 🧩 Architecture

CivicPress is built as a modular monorepo using pnpm workspaces:

- **Core Platform**: Foundational services and utilities
- **CLI Interface**: Comprehensive command-line tools for record management
- **Template Engine**: Advanced template system with inheritance and validation
- **Workflow Engine**: Governance workflows with role-based permissions
- **Civic Modules**: Specialized modules for different civic functions
- **Agent Context**: AI development memory and context (not deployed)

## 🎯 Key Features

### ✅ **Complete Record Lifecycle**

- Create, edit, view, list, delete records
- Version control with Git integration
- History tracking and diff comparison
- Status management with workflow validation

### ✅ **Advanced Template System**

- Multi-level template inheritance
- Conditional content and validation
- Custom template creation
- Template validation and testing

### ✅ **Governance Workflows**

- Configurable status transitions
- Role-based permissions
- Workflow validation
- Audit trail and compliance

### ✅ **Import/Export Capabilities**

- Multiple formats: JSON, CSV, Markdown
- Bulk import from directories
- Export with custom templates
- Data portability and backup

### ✅ **Comprehensive Validation**

- Field-level validation
- Business rule validation
- Template structure validation
- Workflow compliance checking

### ✅ **CLI Excellence**

- All commands support `--json` and `--silent` flags
- Comprehensive help and documentation
- Error handling and user feedback
- Scripting-friendly output formats

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md)
for details.

### Development Standards

- Follow the [Code of Conduct](CODE_OF_CONDUCT.md)
- Use conventional commits
- Ensure all code is formatted with Prettier
- Write clear, accessible documentation
- Maintain comprehensive test coverage

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.

## 📋 Specifications

CivicPress specifications are organized into the following categories:

### 🔐 Core System

- [`manifest.md`](.civic/specs/manifest.md) — CivicPress manifest and
  configuration
- [`auth.md`](.civic/specs/auth.md) — Authentication and identity management
- [`permissions.md`](.civic/specs/permissions.md) — User roles and permissions
- [`git-policy.md`](.civic/specs/git-policy.md) — Git-based governance and
  policies
- [`workflows.md`](.civic/specs/workflows.md) — Civic workflow management
- [`hooks.md`](.civic/specs/hooks.md) — Event hooks and automation

### 📊 Version Management

- [`spec-versioning.md`](.civic/specs/spec-versioning.md) — Specification
  versioning and change management
- [`version-tracker.md`](.civic/specs/version-tracker.md) — Version tracking and
  dependency management

### 🧩 Plugin System

- [`plugins.md`](.civic/specs/plugins.md) — Plugin architecture and capabilities
- [`plugin-api.md`](.civic/specs/plugin-api.md) — Plugin API interfaces and
  lifecycle
- [`plugin-development.md`](.civic/specs/plugin-development.md) — Plugin
  development workflow and best practices

### 🧪 Testing & Quality

- [`testing-framework.md`](.civic/specs/testing-framework.md) — Comprehensive
  testing standards and tools

### 🔒 Security & Compliance

- [`security.md`](.civic/specs/security.md) — Security architecture and best
  practices
- [`backup.md`](.civic/specs/backup.md) — Backup and disaster recovery
- [`storage.md`](.civic/specs/storage.md) — Data storage and management

### 🎨 User Experience

- [`ui.md`](.civic/specs/ui.md) — User interface and interaction design
- [`accessibility.md`](.civic/specs/accessibility.md) — Accessibility standards
  and guidelines
- [`themes.md`](.civic/specs/themes.md) — Theme system and customization
- [`translations.md`](.civic/specs/translations.md) — Internationalization and
  localization

### 📊 Data & Records

- [`public-data-structure.md`](.civic/specs/public-data-structure.md) — Public
  data organization and structure
- [`records-validation.md`](.civic/specs/records-validation.md) — Record
  validation and integrity
- [`indexing.md`](.civic/specs/indexing.md) — Data indexing and search
  optimization
- [`search.md`](.civic/specs/search.md) — Search functionality and algorithms

### ⚙️ System & Infrastructure

- [`api.md`](.civic/specs/api.md) — API design and endpoints
- [`cli.md`](.civic/specs/cli.md) — Command-line interface and tools
- [`deployment.md`](.civic/specs/deployment.md) — Deployment and infrastructure
- [`scheduler.md`](.civic/specs/scheduler.md) — Task scheduling and automation

### 📚 Additional Resources

- [`glossary.md`](.civic/specs/glossary.md) — Key terms and definitions
- [`legal-register.md`](.civic/specs/legal-register.md) — Legal document
  management
- [`archive-policy.md`](.civic/specs/archive-policy.md) — Data archiving and
  retention
- [`status-tags.md`](.civic/specs/status-tags.md) — Status tracking and workflow
  states
- [`notifications.md`](.civic/specs/notifications.md) — Notification system and
  channels
- [`observability.md`](.civic/specs/observability.md) — Monitoring and
  observability
- [`database.md`](.civic/specs/database.md) — Database design and management
- [`users.md`](.civic/specs/users.md) — User management and profiles
- [`moderation.md`](.civic/specs/moderation.md) — Content moderation and
  governance
- [`scheduler.md`](.civic/specs/scheduler.md) — Task scheduling and automation

## 🔗 Resources

- [Full Manifesto](https://github.com/CivicPress/manifesto/blob/master/manifesto.md)
- [Community Guidelines](CODE_OF_CONDUCT.md)

## 🙏 Acknowledgments

CivicPress is built for the public good, by the public, for the public. Thank
you to all contributors and supporters who believe in transparent, accessible
civic technology.

---

**Built with ❤️ for better governance**
