# CivicPress CLI

The CivicPress Command Line Interface provides a comprehensive toolset for
managing civic records, workflows, and system administration through a
Git-backed, file-based workflow.

## Overview

The CLI module is the primary interface for CivicPress operations, offering:

- **Record Management**: Create, edit, view, and manage civic records
- **Authentication**: Multi-method authentication (OAuth, password, simulated)
- **Search & Discovery**: Full-text search with filtering and ranking
- **User Management**: Complete user CRUD operations with role-based access
- **System Administration**: Configuration, debugging, and monitoring tools

## Features

### ✅ Core Functionality

- **20+ Commands**: Comprehensive command set for all operations
- **JSON Output**: Machine-readable output for automation
- **Authentication**: Multiple auth methods with JWT tokens
- **Role-Based Access**: Granular permissions for different civic roles
- **Git Integration**: Automatic version control and audit trails

### ✅ Record Management

- **Create Records**: `civic create bylaw "Noise Ordinance"`
- **List Records**: `civic list --type bylaw --status approved`
- **View Records**: `civic view bylaw/noise-ordinance`
- **Edit Records**: `civic edit bylaw/noise-ordinance --status proposed`
- **Search Records**: `civic search "budget" --type resolution`

### ✅ Authentication & Users

- **Simulated Auth**: `civic auth:simulated --username admin --role admin`
- **GitHub OAuth**: `civic auth:login --token <github_token>`
- **Password Auth**: `civic auth:password --username <user> --password <pass>`
- **User Management**: `civic users list`, `civic users create`

### ✅ System Administration

- **Status Management**: `civic status bylaw/noise-ordinance approved`
- **Configuration**: `civic debug config`, `civic debug permissions`
- **Export/Import**: `civic export --format json`, `civic import records.json`
- **Validation**: `civic validate --all`

## Quick Start

### Installation

```bash
# Install dependencies
pnpm install

# Build the CLI
pnpm run build

# Initialize CivicPress
civic init --demo-data "Springfield"

# Authenticate (development)
civic auth:simulated --username admin --role admin
```

### Basic Usage

```bash
# Create a new record
civic create bylaw "Noise Ordinance"

# List all records
civic list

# Search for records
civic search "budget"

# View a specific record
civic view bylaw/noise-ordinance

# Edit a record
civic edit bylaw/noise-ordinance --status proposed

# Commit changes
civic commit bylaw/noise-ordinance --message "Update noise restrictions"
```

## Command Reference

### Core Commands

| Command  | Description                   | Example                                              |
| -------- | ----------------------------- | ---------------------------------------------------- |
| `init`   | Initialize CivicPress project | `civic init --demo-data "Springfield"`               |
| `create` | Create new civic record       | `civic create bylaw "Noise Ordinance"`               |
| `list`   | List records with filtering   | `civic list --type bylaw --status approved`          |
| `view`   | View specific record          | `civic view bylaw/noise-ordinance`                   |
| `edit`   | Edit record properties        | `civic edit bylaw/noise-ordinance --status proposed` |
| `commit` | Commit changes to records     | `civic commit --all --message "Batch update"`        |

### Authentication Commands

| Command          | Description             | Example                                               |
| ---------------- | ----------------------- | ----------------------------------------------------- |
| `auth:simulated` | Create simulated user   | `civic auth:simulated --username admin --role admin`  |
| `auth:login`     | GitHub OAuth login      | `civic auth:login --token <github_token>`             |
| `auth:password`  | Password authentication | `civic auth:password --username user --password pass` |

### Search & Discovery

| Command  | Description             | Example                                     |
| -------- | ----------------------- | ------------------------------------------- |
| `search` | Search records          | `civic search "budget" --type resolution`   |
| `diff`   | Compare record versions | `civic diff --record bylaw/noise-ordinance` |

### System Administration

| Command    | Description                | Example                                       |
| ---------- | -------------------------- | --------------------------------------------- |
| `status`   | Change record status       | `civic status bylaw/noise-ordinance approved` |
| `debug`    | Debug system configuration | `civic debug config`                          |
| `info`     | Show system information    | `civic info`                                  |
| `export`   | Export records             | `civic export --format json`                  |
| `import`   | Import records             | `civic import records.json`                   |
| `validate` | Validate records           | `civic validate --all`                        |

## User Roles & Permissions

### Available Roles

| Role      | Description        | Permissions                 |
| --------- | ------------------ | --------------------------- |
| `admin`   | Full system access | All permissions             |
| `clerk`   | Municipal clerk    | Create, edit, view records  |
| `council` | Council member     | Approve, edit, view records |
| `public`  | Public citizen     | View published records only |

### Permission Examples

- **`records:create`** - Create new civic records
- **`records:edit`** - Edit existing records
- **`records:view`** - View records
- **`records:delete`** - Archive/delete records
- **`system:admin`** - Administrative access

## Global Options

All commands support these global options:

- `--json` - Output as JSON
- `--silent` - Suppress output
- `--quiet` - Minimal output
- `--verbose` - Verbose output
- `--no-color` - Disable color output
- `--token <token>` - Authentication token

## Error Handling

The CLI provides consistent error handling:

- **Exit codes**: 0 for success, 1 for errors
- **JSON output**: Use `--json` for machine-readable errors
- **Silent mode**: Use `--silent` to suppress error output
- **Validation**: Commands validate inputs and permissions

## Examples

### Complete Workflow

```bash
# 1. Initialize project
civic init --demo-data "Springfield"

# 2. Authenticate
civic auth:simulated --username admin --role admin

# 3. Create record
civic create bylaw "Noise Ordinance" --template default

# 4. Edit record
civic edit bylaw/noise-ordinance --status proposed

# 5. Commit changes
civic commit bylaw/noise-ordinance --message "Propose noise ordinance"

# 6. Search records
civic search "noise" --type bylaw

# 7. Export data
civic export --format json --type bylaw
```

### Development Workflow

```bash
# 1. Setup development environment
civic init --config dev-config.yml

# 2. Create test user
civic auth:simulated --username test --role clerk

# 3. Create test records
civic create policy "Test Policy" --dry-run
civic create bylaw "Test Bylaw" --dry-run

# 4. Validate setup
civic validate --all
civic debug config
```

## Troubleshooting

### Common Issues

**Authentication Errors:**

```bash
# Check if user exists
civic auth:simulated --username admin --role admin

# Verify permissions
civic debug permissions
```

**Permission Errors:**

```bash
# Check user role
civic auth:me

# Verify record permissions
civic debug permissions --user <username>
```

**Configuration Issues:**

```bash
# Show configuration
civic debug config

# Reinitialize if needed
civic init --config config.yml
```

### Getting Help

```bash
# Show command help
civic --help
civic create --help

# List all commands
civic --help
```

## Development

### Building the CLI

```bash
# Install dependencies
pnpm install

# Build the CLI
pnpm run build

# Run tests
pnpm run test:run
```

### Project Structure

```
cli/
├── src/
│   ├── commands/          # CLI command implementations
│   ├── utils/             # Utility functions
│   └── index.ts           # Main CLI entry point
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── README.md             # This file
```

### Testing

```bash
# Run all CLI tests
pnpm run test:run

# Run specific test file
pnpm run test:run tests/cli/users.test.ts

# Run tests in watch mode
pnpm run test:watch
```

## Contributing

### Development Guidelines

- Follow the existing code style and patterns
- Add tests for new functionality
- Update documentation for command changes
- Use conventional commit messages
- Ensure all tests pass before submitting

### Areas for Contribution

- **New Commands**: Additional CLI functionality
- **Command Improvements**: Better UX and error handling
- **Documentation**: Guides, examples, and tutorials
- **Testing**: Additional test coverage and scenarios
- **Performance**: Optimization and efficiency improvements

## Related Documentation

- **[CLI Usage Guide](../docs/cli.md)** - Comprehensive command reference
- **[Authentication Guide](../docs/auth-system.md)** - Authentication and
  authorization
- **[API Documentation](../docs/api.md)** - REST API reference
- **[Project Status](../docs/project-status.md)** - Current implementation
  status

---

**The CivicPress CLI provides a powerful, user-friendly interface for managing
civic records with comprehensive authentication, role-based access control, and
Git integration.**
