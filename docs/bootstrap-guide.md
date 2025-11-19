# 🚀 CivicPress Bootstrap Guide

> **Complete step-by-step guide to get started with CivicPress**

This guide walks you through the entire CivicPress workflow, from initial setup
to advanced operations. Each section includes copy-paste commands and
explanations.

## 📋 Prerequisites

Before starting, ensure you have:

- Node.js 20.11.1+ installed
- Git installed
- A terminal/command prompt ready

## 🏗️ 1. Project Setup

### Clone and Install

```bash
# Clone the repository
git clone https://github.com/CivicPress/civicpress.git
cd civicpress

# Install dependencies
pnpm install

# Build the project (required before using CLI)
pnpm run build

# Make CLI executable (fixes permission issues on Unix systems)
chmod +x cli/dist/index.js
```

**Note**: The `chmod +x` step is required on Unix-like systems (macOS, Linux) to
make the CLI executable. Without it, you'll get a "permission denied" error.

### Verify Installation

```bash
# Test that the CLI works
./cli/dist/index.js --help
```

You should see the CivicPress CLI help output with all available commands.

## 🗄️ Database Configuration

CivicPress uses a central configuration file, `.civicrc`, at the project root to
define where your data lives and how the database is set up.

By default, CivicPress uses SQLite for local development. In the future, you can
switch to PostgreSQL for production or scaling needs.

### Example: .civicrc for SQLite (default)

```yaml
# .civicrc
# Central CivicPress configuration

dataDir: data

database:
  type: sqlite
  sqlite:
    file: .system-data/civic.db
```

- `dataDir`: Path to your civic data directory (relative to project root)
- `database.type`: Set to `sqlite` for local development
- `database.sqlite.file`: Path to the SQLite database file (default:
  `.system-data/civic.db` for private system data)

### Example: .civicrc for PostgreSQL (future)

```yaml
# .civicrc

dataDir: data

database:
  type: postgres
  postgres:
    url: postgres://user:password@localhost:5432/civicpress
```

- `database.type`: Set to `postgres` for PostgreSQL
- `database.postgres.url`: Connection string for your PostgreSQL instance

> **Note:** Only SQLite is supported at the moment. PostgreSQL support is coming
> soon!

### Architectural Principle

- **File system is the source of truth**: All civic records and configuration
  are stored as human-readable files and versioned with Git.
- **Database is a performance layer**: Used for fast search, user sessions, API
  keys, and caching. The database can always be rebuilt from the files.

For more details, see [database.md](specs/database.md) and the
[architecture decision](../agent/memory/decisions.md).

---

## 🎯 2. Initialize Your CivicPress Repository

### Basic Initialization

```bash
# Initialize a new CivicPress repository (interactive)
./cli/dist/index.js init
```

When prompted, you can use the defaults:

- **Data directory**: `data` (press Enter)
- **Git repository**: `yes` (press Enter)

### Initialize with Demo Data

For the fastest way to see CivicPress in action, you can initialize with
pre-configured demo data:

```bash
# Initialize with Richmond demo data (French/English)
./cli/dist/index.js init --yes --demo-data richmond-quebec

# Or initialize with Springfield demo data (English)
./cli/dist/index.js init --yes --demo-data springfield-usa
```

The demo data includes sample bylaws, meeting minutes, and geography layers to
demonstrate how documents, sessions, and zones appear in the system.

### Verify Initialization

```bash
# Check that the repository was created
ls -la .civic/
ls -la data/
```

You should see:

- `.civic/` directory with configuration files
- `data/` directory for your records

## 📝 3. Create Your First Records

### Create a Basic Bylaw

```bash
# Create a simple bylaw
./cli/dist/index.js create bylaw "Public Meeting Procedures"
```

This will create a new bylaw record with a default template.

### Create a Policy

```bash
# Create a policy
./cli/dist/index.js create policy "Data Privacy Policy"
```

### Create a Resolution

```bash
# Create a resolution
./cli/dist/index.js create resolution "Budget Approval 2024"
```

### List Your Records

```bash
# View all records
./cli/dist/index.js list

# View only bylaws
./cli/dist/index.js list --type bylaw

# View only draft records
./cli/dist/index.js list --status draft
```

## 👀 4. View and Edit Records

### View a Record

```bash
# View a specific record (replace with your record name)
./cli/dist/index.js view "public-meeting-procedures"

# View with JSON output
./cli/dist/index.js view "public-meeting-procedures" --json
```

### Edit a Record

```bash
# Edit a record (opens in your default editor)
./cli/dist/index.js edit "public-meeting-procedures"
```

## 🔍 5. Search and Explore

### Search Records

```bash
# Search by content
./cli/dist/index.js search "privacy"

# Search by type
./cli/dist/index.js search "meeting" --type bylaw

# Search with JSON output
./cli/dist/index.js search "policy" --json
```

### View Record History

```bash
# View history of a record
./cli/dist/index.js history "public-meeting-procedures"

# View history with JSON output
./cli/dist/index.js history "public-meeting-procedures" --json
```

### Compare Versions

```bash
# Show differences between versions
./cli/dist/index.js diff "public-meeting-procedures"

# Compare specific commits
./cli/dist/index.js diff "public-meeting-procedures" --from HEAD~1 --to HEAD
```

## 🎨 6. Template System

### List Available Templates

```bash
# List all templates
./cli/dist/index.js template --list

# Show template details
./cli/dist/index.js template --show bylaw/default
```

### Create a Custom Template

```bash
# Create a custom bylaw template
./cli/dist/index.js template --create "custom-bylaw" --type bylaw

# Create a custom policy template
./cli/dist/index.js template --create "detailed-policy" --type policy
```

### Use Custom Templates

```bash
# Create a record with a custom template
./cli/dist/index.js create bylaw "Advanced Zoning Regulations" --template custom-bylaw

# Create a policy with a custom template
./cli/dist/index.js create policy "Comprehensive IT Policy" --template detailed-policy
```

## ✅ 7. Validation

### Validate Records

```bash
# Validate a single record
./cli/dist/index.js validate "public-meeting-procedures"

# Validate all records
./cli/dist/index.js validate --all

# Validate with JSON output
./cli/dist/index.js validate --all --json
```

### Check Template Validation

```bash
# Validate template structure
./cli/dist/index.js template --validate bylaw/default
```

## 🔄 8. Status Management

### Change Record Status

```bash
# Change status to proposed
./cli/dist/index.js status "public-meeting-procedures" proposed

# Change status to approved
./cli/dist/index.js status "public-meeting-procedures" approved

# Change status to archived
./cli/dist/index.js status "public-meeting-procedures" archived
```

### View Status Transitions

```bash
# See what status changes are allowed
./cli/dist/index.js status "public-meeting-procedures"
```

## 📤 9. Export and Import

### Export Records

```bash
# Export a single record to JSON
./cli/dist/index.js export "public-meeting-procedures" --format json

# Export all records to JSON
./cli/dist/index.js export --format json

# Export to CSV
./cli/dist/index.js export --format csv

# Export to Markdown
./cli/dist/index.js export --format markdown

# Export to a specific directory
./cli/dist/index.js export --format json --output exports/
```

### Import Records

```bash
# Import from a single file
./cli/dist/index.js import path/to/record.json

# Import from a directory
./cli/dist/index.js import path/to/records/

# Import with overwrite
./cli/dist/index.js import path/to/records/ --overwrite

# Import with dry-run (preview)
./cli/dist/index.js import path/to/records/ --dry-run
```

## 🪝 10. Hooks and Workflows

### Manage Hooks

```bash
# List current hooks
./cli/dist/index.js hook --list

# Enable a hook
./cli/dist/index.js hook --enable "record:created"

# Disable a hook
./cli/dist/index.js hook --disable "record:updated"

# Show hook configuration
./cli/dist/index.js hook --show
```

### Configure Workflows

Edit the workflow configuration file:

```bash
# Open workflow configuration
nano .civic/workflows.yml
```

Example workflow configuration:

```yaml
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

## 🔧 11. Advanced Operations

### Commit Records

```bash
# Commit all changes
./cli/dist/index.js commit

# Commit a specific record
./cli/dist/index.js commit "public-meeting-procedures"

# Commit with a custom message
./cli/dist/index.js commit --message "Updated meeting procedures"
```

### Silent and JSON Output

```bash
# Silent mode (no output except errors)
./cli/dist/index.js list --silent

# JSON output for scripting
./cli/dist/index.js list --json

# Combine silent and JSON
./cli/dist/index.js list --silent --json
```

### Verbose Debugging

```bash
# Verbose output for debugging
./cli/dist/index.js create bylaw "Test Bylaw" --verbose

# Quiet mode (errors and warnings only)
./cli/dist/index.js list --quiet
```

## 🧪 12. Testing and Validation

### Run Tests

```bash
# Run all tests
pnpm run test:run

# Run tests in watch mode
pnpm run test

# Run specific test file
pnpm run test tests/cli/create.test.ts
```

### Validate Configuration

```bash
# Validate workflow configuration
./cli/dist/index.js validate --config

# Validate templates
./cli/dist/index.js template --validate-all
```

## 📊 13. Monitoring and Maintenance

### Check System Health

```bash
# List all records with status
./cli/dist/index.js list --status all

# Check for validation errors
./cli/dist/index.js validate --all --json | jq '.errors'

# View recent activity
./cli/dist/index.js history --recent
```

### Backup and Restore

```bash
# Export all data for backup
./cli/dist/index.js export --all --format json --output backup/

# Import from backup
./cli/dist/index.js import backup/ --overwrite
```

## 🎯 14. Common Workflows

### Complete Record Lifecycle

```bash
# 1. Create a new bylaw
./cli/dist/index.js create bylaw "Traffic Safety Regulations"

# 2. Edit the record
./cli/dist/index.js edit "traffic-safety-regulations"

# 3. Validate the record
./cli/dist/index.js validate "traffic-safety-regulations"

# 4. Change status to proposed
./cli/dist/index.js status "traffic-safety-regulations" proposed

# 5. Commit changes
./cli/dist/index.js commit "traffic-safety-regulations"

# 6. Export for sharing
./cli/dist/index.js export "traffic-safety-regulations" --format json
```

### Template Development

```bash
# 1. Create a custom template
./cli/dist/index.js template --create "detailed-bylaw" --type bylaw

# 2. Edit the template
nano .civic/templates/bylaw/detailed-bylaw.md

# 3. Validate the template
./cli/dist/index.js template --validate bylaw/detailed-bylaw

# 4. Create a record with the template
./cli/dist/index.js create bylaw "Test Bylaw" --template detailed-bylaw
```

### Bulk Import

```bash
# 1. Prepare your data files
mkdir imports/
# Add your JSON/CSV/Markdown files to imports/

# 2. Preview the import
./cli/dist/index.js import imports/ --dry-run

# 3. Perform the import
./cli/dist/index.js import imports/ --overwrite

# 4. Validate imported records
./cli/dist/index.js validate --all
```

## 🆘 15. Troubleshooting

### Common Issues

**CLI not found:**

```bash
# Rebuild the project
pnpm run build

# Make CLI executable again
chmod +x cli/dist/index.js
```

**Permission errors:**

```bash
# Check file permissions
ls -la .civic/
chmod 644 .civic/*.yml
```

**Validation errors:**

```bash
# Check record syntax
./cli/dist/index.js validate --verbose

# Check template syntax
./cli/dist/index.js template --validate-all
```

**Git issues:**

```bash
# Check git status
git status

# Initialize git if needed
git init
git add .
git commit -m "Initial commit"
```

### Getting Help

```bash
# General help
./cli/dist/index.js --help

# Command-specific help
./cli/dist/index.js create --help
./cli/dist/index.js validate --help
./cli/dist/index.js template --help
```

## 🎉 Congratulations

You've successfully set up and used CivicPress! You now have:

- ✅ A working CivicPress repository
- ✅ Records created and managed
- ✅ Templates configured
- ✅ Validation working
- ✅ Export/import capabilities
- ✅ Workflow management

### Next Steps

1. **Explore the documentation** in the `docs/` directory
2. **Customize templates** for your specific needs
3. **Configure workflows** for your organization
4. **Set up hooks** for automation
5. **Integrate with your existing systems**

### Resources

- [CLI Documentation](cli.md)
- [Template System Guide](templates.md)
- [Validation Guide](validation.md)
- [Workflow Configuration](workflows.md)
- [Contributing Guide](../.github/CONTRIBUTING.md)

Happy governing! 🌱
