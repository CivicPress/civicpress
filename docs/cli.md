# CivicPress CLI Usage Guide

This document provides a high-level overview of the CivicPress CLI layer.

- Location: `cli/`

## Quick Start

### Installation

```bash
# Install dependencies
pnpm install

# Build the CLI
pnpm run build

# Initialize a new CivicPress instance
civic init
```

### Authentication

```bash
# Authenticate with simulated account (development)
civic auth:simulated --username admin --role admin

# Authenticate with GitHub OAuth
civic auth:login --token <github_token>

# Authenticate with username/password
civic auth:password --username <username> --password <password>
```

## Command Reference

### Core Commands

#### `init`

Initialize a new CivicPress project.

```bash
civic init [options]
```

**Options:**

- `--config <path>` - Use configuration file instead of prompts
- `--data-dir <path>` - Specify data directory
- `--demo-data [city]` - Load demo data (optional city name)
- `--yes` - Skip prompts and use defaults

**Examples:**

```bash
# Interactive initialization
civic init

# Non-interactive with config file
civic init --config config.yml

# Initialize with demo data
civic init --demo-data "Springfield"
```

#### `create`

Create a new civic record.

```bash
civic create <type> <title> [options]
```

**Required Permission:** `records:create`

**Options:**

- `--template <template>` - Use specific template
- `--dry-run` - Preview without creating
- `--json` - Output as JSON
- `--silent` - Suppress output

**Examples:**

```bash
# Create a new bylaw
civic create bylaw "Noise Ordinance"

# Create with template
civic create policy "Data Privacy" --template advanced

# Dry-run creation
civic create resolution "Budget 2025" --dry-run
```

#### `list`

List records with filtering.

```bash
civic list [type] [options]
```

**Required Permission:** `records:view`

**Options:**

- `--status <status>` - Filter by status
- `--author <author>` - Filter by author
- `--format <format>` - Output format (human, json, csv)
- `--include-content` - Include record content
- `--sort <field>` - Sort by field

**Examples:**

```bash
# List all records
civic list

# List only bylaws
civic list bylaw

# Filter by status
civic list --status draft,proposed

# JSON output
civic list --format json
```

#### `view`

View a specific record.

```bash
civic view <record-id> [options]
```

**Required Permission:** `records:view`

**Options:**

- `--format <format>` - Output format (human, json, markdown)
- `--include-metadata` - Include full metadata
- `--json` - Output as JSON

**Examples:**

```bash
# View record
civic view bylaw/noise-ordinance

# JSON output
civic view policy/data-privacy --json
```

#### `edit`

Edit a record.

```bash
civic edit <record-id> [options]
```

**Required Permission:** `records:edit`

**Options:**

- `--title <title>` - Update title
- `--content <content>` - Update content
- `--status <status>` - Update status
- `--dry-run` - Preview changes
- `--json` - Output as JSON

**Examples:**

```bash
# Edit record
civic edit bylaw/noise-ordinance --title "Updated Noise Ordinance"

# Update status
civic edit policy/data-privacy --status proposed
```

#### `commit`

Commit changes to records.

```bash
civic commit [record] [options]
```

**Required Permission:** `records:edit`

**Options:**

- `--message <message>` - Commit message
- `--all` - Commit all changes
- `--dry-run` - Preview commit
- `--json` - Output as JSON

**Examples:**

```bash
# Commit specific record
civic commit bylaw/noise-ordinance --message "Update noise restrictions"

# Commit all changes
civic commit --all --message "Batch update"
```

### Search & Discovery

#### `search`

Search records by content, metadata, or Git history.

```bash
civic search [query] [options]
```

**Options:**

- `--content <text>` - Search in record content
- `--title <text>` - Search in record titles
- `--tags <text>` - Search in record tags
- `--status <status>` - Filter by status
- `--type <type>` - Filter by record type
- `--author <author>` - Search by author
- `--date <date>` - Search by date
- `--git <text>` - Search in Git history
- `--case-sensitive` - Case-sensitive search
- `--regex` - Treat as regular expressions
- `--limit <number>` - Limit results (default: 50)
- `--format <format>` - Output format (table, json, list)

**Examples:**

```bash
# Basic search
civic search "noise"

# Search with filters
civic search "budget" --type resolution --status approved

# Search in Git history
civic search "update" --git

# JSON output
civic search "policy" --format json
```

### Authentication & Users

#### `auth:simulated`

Create simulated user account (development only).

```bash
civic auth:simulated --username <username> --role <role>
```

**Options:**

- `--username <username>` - Username (required)
- `--role <role>` - User role (default: public)
- `--json` - Output as JSON

**Examples:**

```bash
# Create admin user
civic auth:simulated --username admin --role admin

# Create clerk user
civic auth:simulated --username clerk --role clerk
```

#### `auth:login`

Authenticate with GitHub OAuth.

```bash
civic auth:login --token <github_token>
```

**Options:**

- `--token <token>` - GitHub OAuth token
- `--json` - Output as JSON

#### `auth:password`

Authenticate with username/password.

```bash
civic auth:password --username <username> --password <password>
```

**Options:**

- `--username <username>` - Username
- `--password <password>` - Password
- `--json` - Output as JSON

#### `users`

Manage users (admin only).

```bash
civic users [command] [options]
```

**Commands:**

- `list` - List all users
- `create` - Create new user
- `update` - Update user
- `delete` - Delete user

**Examples:**

```bash
# List users
civic users list

# Create user
civic users create --username clerk --role clerk
```

### System & Configuration

#### `status`

Change record status.

```bash
civic status <record> <status> [options]
```

**Required Permission:** `records:edit`

**Options:**

- `--message <message>` - Status change message
- `--role <role>` - Role for status change
- `--dry-run` - Preview change
- `--json` - Output as JSON

**Examples:**

```bash
# Change status
civic status bylaw/noise-ordinance proposed

# With message
civic status policy/data-privacy approved --message "Approved by council"
```

#### `info`

Show system information.

```bash
civic info [options]
```

**Options:**

- `--token <token>` - Authentication token
- `--json` - Output as JSON

#### `debug`

Debug system configuration.

```bash
civic debug [command] [options]
```

**Commands:**

- `config` - Show configuration
- `permissions` - Show permissions
- `hooks` - Show hooks

**Examples:**

```bash
# Show configuration
civic debug config

# Show permissions
civic debug permissions
```

#### `config` (Configuration Management)

Manage system configuration files (parity with UI/API). Supports raw YAML and
normalized JSON.

```bash
# Show status (user/default/missing)
civic config:status

# Initialize configs from defaults (no overwrite)
civic config:init --all
civic config:init roles

# List available configs
civic config:list

# Get a config (normalized JSON)
civic config:get org-config

# Get raw YAML
civic config:get roles --raw

# Save raw YAML from a file
civic config:put org-config --file ./org-config.yml

# Validate a specific config
civic config:validate roles

# Validate all configs
civic config:validate --all

# Reset a config to defaults
civic config:reset hooks

# Export all configs to a directory
civic config:export --dir ./backup-configs

# Import configs from a directory
civic config:import --dir ./backup-configs
```

Supported config types: `org-config`, `roles`, `workflows`, `hooks`,
`notifications`.

All commands support global flags: `--json`, `--silent`, `--quiet`, `--verbose`,
`--no-color`.

### Templates & Workflows

#### `template`

Manage record templates.

```bash
civic template [command] [options]
```

**Commands:**

- `--list` - List all templates
- `--show <template>` - Show template details
- `--create <name>` - Create new template
- `--validate <template>` - Validate template
- `--init` - Initialize default templates

**Examples:**

```bash
# List templates
civic template --list

# Show template
civic template --show bylaw/default

# Create template
civic template --create "advanced-bylaw" --type bylaw
```

#### `hook`

Manage hooks and workflows.

```bash
civic hook [command] [options]
```

**Commands:**

- `--list` - List all hooks
- `--enable <hook>` - Enable hook
- `--disable <hook>` - Disable hook
- `--test <hook>` - Test hook
- `--workflows` - List workflows

**Examples:**

```bash
# List hooks
civic hook --list

# Enable hook
civic hook --enable record:created

# Test hook
civic hook --test record:updated
```

### Import & Export

#### `export`

Export records.

```bash
civic export [options]
```

**Options:**

- `--format <format>` - Export format (json, csv, markdown)
- `--type <type>` - Filter by record type
- `--status <status>` - Filter by status
- `--output <file>` - Output file
- `--json` - Output as JSON

**Examples:**

```bash
# Export all records
civic export --format json

# Export specific type
civic export --type bylaw --format csv
```

#### `import`

Import records.

```bash
civic import <file> [options]
```

**Options:**

- `--format <format>` - Import format (json, csv, markdown)
- `--dry-run` - Preview import
- `--json` - Output as JSON

**Examples:**

```bash
# Import records
civic import records.json --format json

# Preview import
civic import records.csv --format csv --dry-run
```

### Validation & Testing

#### `validate`

Validate records.

```bash
civic validate [options]
```

**Options:**

- `--all` - Validate all records
- `--record <id>` - Validate specific record
- `--format <format>` - Output format
- `--json` - Output as JSON

**Examples:**

```bash
# Validate all records
civic validate --all

# Validate specific record
civic validate --record bylaw/noise-ordinance
```

#### `diff`

Show differences between records or commits.

```bash
civic diff [options]
```

**Options:**

- `--record <id>` - Compare record versions
- `--commit1 <commit>` - First commit
- `--commit2 <commit>` - Second commit
- `--format <format>` - Output format
- `--json` - Output as JSON

**Examples:**

```bash
# Compare record versions
civic diff --record bylaw/noise-ordinance

# Compare commits
civic diff --commit1 HEAD~1 --commit2 HEAD
```

## Global Options

All commands support these global options:

- `--json` - Output as JSON
- `--silent` - Suppress output
- `--quiet` - Minimal output
- `--verbose` - Verbose output
- `--no-color` - Disable color output
- `--token <token>` - Authentication token

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
- **`workflows:execute`** - Execute workflows

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
