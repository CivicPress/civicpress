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

- `-s, --status <status>` - Filter by status
- `-a, --all` - List all records including archived
- `--json` - Output as JSON
- `--silent` - Suppress output

**Examples:**

```bash
# List all records
civic list

# List only bylaws
civic list bylaw

# Filter by status
civic list --status draft

# JSON output
civic list --json
```

#### `view`

View a specific record.

```bash
civic view <record-id> [options]
```

**Required Permission:** `records:view`

**Options:**

- `-r, --raw` - Show raw file content
- `--token <token>` - Authentication token

**Examples:**

```bash
# View record
civic view bylaw/noise-ordinance

# View raw content
civic view policy/data-privacy --raw
```

#### `edit`

Open a record in an external editor.

```bash
civic edit <record-id> [options]
```

**Required Permission:** `records:edit`

**Options:**

- `-e, --editor <editor>` - Specify editor to use
- `--dry-run` - Preview changes without saving
- `--token <token>` - Authentication token

**Examples:**

```bash
# Edit record in default editor
civic edit bylaw/noise-ordinance

# Edit with specific editor
civic edit policy/data-privacy --editor vim
```

#### `commit`

Commit changes to records.

```bash
civic commit [record] [options]
```

**Required Permission:** `records:edit`

**Options:**

- `-m, --message <message>` - Commit message
- `-r, --role <role>` - Role for commit message
- `-a, --all` - Commit all changes
- `--json` - Output as JSON

#### `records migrate-folders`

Organize existing markdown files into year-based subdirectories to prevent
overgrown type folders.

```bash
civic records migrate-folders [options]
```

**Options:**

- `--dry-run` - Preview moves without touching files or the database
- `--include-archive` - Also reorganize files under `data/archive/`
- `--data-dir <path>` - Override the data directory (defaults to config)
- `--json` / `--silent` - Standard output controls

**Examples:**

```bash
# Preview how many files would move
civic records migrate-folders --dry-run

# Migrate records and archive content
civic records migrate-folders --include-archive
```

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
- `--git-history` - Search in Git history
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
civic search "update" --git-history

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

Manage users and security settings.

```bash
civic users [command] [options]
```

**User Management Commands:**

- `list` - List all users (admin only)
- `create` - Create new user (admin only)
- `update` - Update user (admin only)
- `delete` - Delete user (admin only)

**Security Management Commands:**

- `change-password <username>` - Change user password (self-service or admin)
- `set-password <username>` - Set user password (admin only)
- `request-email-change <username>` - Request email address change
- `verify-email <token>` - Verify email change with token
- `cancel-email-change <username>` - Cancel pending email change
- `security-info <username>` - View user security information

**Basic Examples:**

```bash
# List users
civic users list

# Create user
civic users create --username clerk --role clerk

# Update user
civic users update --username clerk --name "City Clerk"
```

**Security Examples:**

```bash
# Change own password (interactive prompts)
civic users:change-password myusername --token $TOKEN

# Change password with command-line options
civic users:change-password myusername \
  --token $TOKEN \
  --current-password "oldpass123" \
  --new-password "newpass456"

# Admin sets password for user
civic users:set-password someuser \
  --token $ADMIN_TOKEN \
  --password "adminsetpass123"

# Request email change
civic users:request-email-change myusername \
  --token $TOKEN \
  --email "newemail@example.com"

# Verify email change (from email link)
civic users:verify-email "abc123tokenxyz"

# Cancel pending email change
civic users:cancel-email-change myusername --token $TOKEN

# View security information
civic users:security-info myusername --token $TOKEN

# View security info in JSON format
civic users:security-info myusername --token $TOKEN --json
```

**Security Guard Examples:**

```bash
# This will fail for GitHub-authenticated users
$ civic users:set-password github-user --password "newpass123" --token $ADMIN_TOKEN
Error: User 'github-user' is authenticated via github
Password management is handled by the external provider

# This will show external auth status
$ civic users:security-info github-user --token $ADMIN_TOKEN
Security Information for 'github-user':
  User ID: 123
  Email: user@github.com
  Email Verified: ✓
  Auth Provider: github
  Can Set Password: ✗
  External Auth: ✓
  Pending Email: None
```

**Interactive vs Non-Interactive Usage:**

```bash
# Interactive mode (prompts for missing values)
civic users:change-password myuser --token $TOKEN
# Will prompt for current password and new password

# Non-interactive mode (all values provided)
civic users:change-password myuser \
  --token $TOKEN \
  --current-password "current123" \
  --new-password "new456"

# Silent mode (no output except errors)
civic users:security-info myuser --token $TOKEN --silent

# JSON mode (machine-readable output)
civic users:security-info myuser --token $TOKEN --json
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

### Indexing

#### `index`

Generate and manage civic record indexes.

```bash
civic index [options]
```

**Options:**

- `--rebuild` - Rebuild indexes from scratch
- `--module <module>` - Filter by module
- `--type <type>` - Filter by record type
- `--status <status>` - Filter by status
- `--search <query>` - Search within indexes
- `--list` - List index entries
- `--validate` - Validate index integrity
- `--sync-db` - Synchronize index with database
- `--conflict-resolution <strategy>` - Conflict resolution strategy
- `--json` / `--silent` - Output controls

**Examples:**

```bash
# Rebuild all indexes
civic index --rebuild

# Search within index
civic index --search "noise ordinance"

# Validate index integrity
civic index --validate
```

#### `auto-index`

Test and demonstrate the auto-indexing workflow.

```bash
civic auto-index [options]
```

**Options:**

- `--create` - Create test records and index
- `--update` - Update test records and re-index
- `--list` - List indexed records
- `--demo` - Run full demo workflow
- `--json` / `--silent` - Output controls

### History & Diff

#### `history`

View record version history from Git.

```bash
civic history <record> [options]
```

**Options:**

- `-l, --limit <number>` - Limit number of entries
- `--format <format>` - Output format

**Examples:**

```bash
# View history of a record
civic history bylaw/noise-ordinance

# Limit to last 5 entries
civic history policy/data-privacy --limit 5
```

### Storage Management

#### `storage`

Manage file storage configuration and files.

```bash
civic storage:[command] [options]
```

**Commands:**

- `config` - Show storage configuration
- `upload` - Upload file to storage folder
- `download` - Download file from storage
- `list` - List files in storage folder
- `delete` - Delete file from storage
- `info` - Get file information
- `folder:add` - Add new storage folder
- `folder:update` - Update storage folder configuration
- `folder:remove` - Remove storage folder

**Common Options:**

- `--token <token>` - Authentication token
- `-i, --input <path>` - Input file path
- `-o, --output <path>` - Output file path
- `-n, --name <name>` - Folder or file name
- `-u, --uuid <uuid>` - File UUID
- `-f, --force` - Force operation
- `--json` / `--silent` - Output controls

**Examples:**

```bash
# Show storage configuration
civic storage:config

# Upload a file
civic storage:upload --input ./document.pdf --name public --token $TOKEN

# List files in a folder
civic storage:list public --token $TOKEN

# Download a file by UUID
civic storage:download --uuid abc123 --output ./download.pdf --token $TOKEN

# Add a new storage folder
civic storage:folder:add --name permits --token $TOKEN
```

### Notifications

#### `notify`

Test and manage the notification system.

```bash
civic notify:[command] [options]
```

**Commands:**

- `test` - Send a test notification
- `config` - Show notification configuration
- `queue` - List notification queue status
- `retry` - Retry failed notifications

**Options:**

- `-t, --to <address>` - Recipient address
- `-s, --subject <text>` - Notification subject
- `-m, --message <text>` - Notification message
- `-p, --provider <provider>` - Notification provider
- `--template <name>` - Use notification template
- `--json` / `--silent` / `--verbose` - Output controls

**Examples:**

```bash
# Send test notification
civic notify:test --to user@example.com --subject "Test" --message "Hello"

# Show notification configuration
civic notify:config

# Check queue status
civic notify:queue
```

### Geography Data

#### `geography`

Validate, scan, and normalize geographic data in records.

```bash
civic geography:[command] [options]
```

**Commands:**

- `validate` - Validate geography data in record files
- `scan` - Scan all records for geography data
- `normalize` - Normalize and fix geography data issues

**Options:**

- `--normalize` - Apply normalization fixes
- `--summary` - Show summary only
- `--write` - Write fixes to files
- `--json` / `--silent` - Output controls

**Examples:**

```bash
# Validate geography data in a record
civic geography:validate bylaw/zoning-code

# Scan all records for geography data
civic geography:scan

# Normalize geography data with fixes
civic geography:normalize --write
```

### Backup & Restore

#### `backup`

Create and restore data backups.

```bash
civic backup [options]
civic backup:restore <backup-path> [options]
```

**Options (create):**

- `--include-storage` - Include storage files in backup
- `--git-bundles` - Include Git bundles
- `--compress` - Compress backup archive
- `--compression-level <level>` - Compression level
- `--dry-run` - Preview backup without creating

**Options (restore):**

- `--no-verify` - Skip verification after restore

**Examples:**

```bash
# Create backup
civic backup

# Create backup with storage files
civic backup --include-storage

# Restore from backup
civic backup:restore ./backups/2025-01-15
```

### System Diagnostics

#### `diagnose`

Run system diagnostics and health checks.

```bash
civic diagnose [options]
```

**Options:**

- `--component <name>` - Run specific component check (database, search, config,
  filesystem, system)
- `--fix` - Attempt to auto-fix issues
- `--format <format>` - Output format
- `--timeout <ms>` - Timeout for checks
- `--max-concurrency <n>` - Max concurrent checks
- `--no-cache` - Skip cached results
- `--force` - Force all checks
- `--dry-run` - Preview fixes without applying
- `--json` - Output as JSON

**Examples:**

```bash
# Run all diagnostics
civic diagnose

# Check specific component
civic diagnose --component database

# Auto-fix issues
civic diagnose --fix

# Dry-run fixes
civic diagnose --fix --dry-run
```

### Cache Management

#### `cache`

Inspect and manage the unified cache system.

```bash
civic cache:[command] [options]
```

**Commands:**

- `metrics` - Show cache metrics and statistics
- `health` - Run cache health checks
- `list` - List registered cache instances

**Options:**

- `--name <cache>` - Filter by cache name
- `--json` / `--silent` - Output controls

**Examples:**

```bash
# Show cache metrics
civic cache:metrics

# Health check for a specific cache
civic cache:health --name search

# List all registered caches
civic cache:list
```

### Cleanup

#### `cleanup`

Remove all data and reset to a clean default state.

```bash
civic cleanup [options]
```

**Options:**

- `--force` - Skip confirmation prompt
- `--json` / `--silent` - Output controls

### Authentication (additional commands)

#### `login`

Standalone login/logout/status commands.

```bash
civic login [options]
civic logout
civic status
```

**Options:**

- `--token <token>` - Authentication token
- `--username <username>` - Username
- `--password <password>` - Password
- `--method <method>` - Authentication method

#### `auth:me`

Show current authenticated user information.

```bash
civic auth:me --token <token>
```

#### `auth:providers`

List available OAuth providers.

```bash
civic auth:providers
```

#### `auth:validate`

Validate an OAuth token.

```bash
civic auth:validate --token <token>
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
civic info
```

## Troubleshooting

### Common Issues

**Authentication Errors:**

```bash
# Check if user exists
civic auth:simulated --username admin --role admin

# Verify current user
civic auth:me --token $TOKEN
```

**Permission Errors:**

```bash
# Check user role and permissions
civic auth:me --token $TOKEN

# View user security information
civic users:security-info myuser --token $TOKEN
```

**Configuration Issues:**

```bash
# Show system information
civic info

# Check configuration status
civic config:status

# Run diagnostics
civic diagnose
```

### Getting Help

```bash
# Show command help
civic --help
civic create --help

# List all commands
civic --help
```
