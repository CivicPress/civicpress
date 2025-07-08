# CivicPress CLI Usage Guide

Welcome to the CivicPress CLI! This guide covers all available commands,
options, and usage examples for managing civic records with CivicPress.

## Table of Contents

- [Overview](#overview)
- [Command Reference](#command-reference)
  - [init](#init)
  - [create](#create)
  - [commit](#commit)
  - [history](#history)
  - [list](#list)
  - [view](#view)
  - [edit](#edit)
  - [status](#status)
  - [search](#search)
  - [diff](#diff)
  - [export](#export)
  - [template](#template)
  - [validate](#validate)
  - [hook](#hook)

---

## Overview

CivicPress CLI lets you manage civic records, policies, bylaws, and more using a
Git-backed, file-based workflow. All records and configuration live in a
dedicated data directory (e.g., `data/`).

The CLI features advanced template system with inheritance, comprehensive
validation, and powerful record management capabilities.

## Command Reference

### `init`

Initialize a new CivicPress data directory and configuration.

```sh
civic init
```

- Prompts for setup options and creates `.civic/config.yml`.
- Initializes a Git repo if needed.
- Sets up default templates and validation rules.

---

### `create`

Create a new record (policy, bylaw, resolution, etc.) with template support.

```sh
civic create <type> <name> [options]
```

**Basic Usage:**

```sh
civic create policy "Public Records Policy"
civic create bylaw "Public Meeting Procedures" --template advanced
civic create resolution "Budget Approval 2024" --template standard
```

**Options:**

- `--template <template>` - Use specific template (default: type/default)
- `--dry-run` - Complete dry-run (no files created, no commits)
- `--dry-run-hooks <hooks>` - Dry-run specific hooks (comma-separated)
- `--json` - Output results in JSON format

**Examples:**

```sh
# Create with advanced template
civic create bylaw "Financial Procedures" --template advanced

# Dry-run creation
civic create policy "Test Policy" --dry-run

# Hook dry-run
civic create policy "Test" --dry-run-hooks record:created,record:committed

# JSON output
civic create bylaw "Test Bylaw" --json
```

---

### `commit`

Commit changes to records in the data directory.

```sh
civic commit [record] [--all]
```

- Commit a specific record: `civic commit policy/public-records-policy`
- Commit all changes: `civic commit --all`

---

### `history`

Show the Git history of civic records.

```sh
civic history [record] [options]
```

**Options:**

- `--limit <number>` - Limit number of commits shown
- `--format <format>` - Output format (human, json)
- `--author <author>` - Filter by author

**Examples:**

```sh
# Show history for specific record
civic history bylaw/public-meeting-procedures

# Show recent commits with limit
civic history --limit 10

# JSON output
civic history --format json
```

---

### `list`

List records by type and status with advanced filtering.

```sh
civic list [type] [options]
```

**Options:**

- `--status <status>` - Filter by status (comma-separated)
- `--author <author>` - Filter by author
- `--format <format>` - Output format (human, json, csv)
- `--include-content` - Include record content in output
- `--sort <field>` - Sort by field (title, created, updated, status)

**Examples:**

```sh
# List all records
civic list

# List only policies
civic list policy

# Filter by status
civic list bylaw --status active,approved

# Filter by author
civic list --author "City Council"

# JSON output with content
civic list --format json --include-content

# Sort by creation date
civic list --sort created
```

---

### `view`

View a specific record's content and metadata.

```sh
civic view <record> [options]
```

**Options:**

- `--raw` - Show raw markdown
- `--format <format>` - Output format (human, json, yaml)
- `--include-content` - Include record content
- `--include-metadata` - Include full metadata

**Examples:**

```sh
# View record
civic view policy/public-records-policy

# Raw markdown output
civic view bylaw/public-meeting-procedures --raw

# JSON output
civic view resolution/budget-approval --format json

# Include content and metadata
civic view policy/test --include-content --include-metadata
```

---

### `edit`

Edit a record in your preferred editor.

```sh
civic edit <record> [options]
```

**Options:**

- `--editor <editor>` - Specify editor (vim, nano, code, etc.)
- `--dry-run` - Show what would be edited without opening editor

**Examples:**

```sh
# Edit record
civic edit bylaw/test-clean-structure

# Use specific editor
civic edit policy/public-records-policy --editor vim

# Dry-run edit
civic edit resolution/test --dry-run
```

---

### `status`

Change the status of a record (e.g., draft → approved).

```sh
civic status <record> <new-status> [options]
```

**Valid Statuses:**

- `draft` - Initial draft state
- `proposed` - Proposed for review
- `approved` - Approved and active
- `active` - Currently in effect
- `archived` - No longer in effect
- `rejected` - Rejected or withdrawn

**Options:**

- `--message <msg>` - Add status change message
- `--dry-run` - Complete dry-run
- `--dry-run-hooks <hooks>` - Dry-run specific hooks
- `--json` - Output results in JSON format

**Examples:**

```sh
# Change status
civic status policy/public-records-policy approved --message "Policy approved by council"

# Dry-run status change
civic status policy/test approved --dry-run

# Hook dry-run
civic status policy/test approved --dry-run-hooks status:changed

# JSON output
civic status bylaw/test approved --json
```

---

### `search`

Search records by content, metadata, status, type, author, date, or Git history.

```sh
civic search [query] [options]
```

**Options:**

- `--type <type>` - Filter by record type
- `--status <status>` - Filter by status
- `--author <author>` - Filter by author
- `--date <date>` - Filter by date (YYYY-MM-DD or relative)
- `--regex` - Use regex for search
- `--content` - Search in content only
- `--metadata` - Search in metadata only
- `--format <format>` - Output format (human, json, csv)
- `--limit <number>` - Limit number of results

**Examples:**

```sh
# Search content
civic search "budget"

# Filter by type and status
civic search --type policy --status approved

# Search by author
civic search --author system

# Regex search
civic search --regex --content "test"

# Date range search
civic search --date "2024-01-01..2024-12-31"

# JSON output
civic search --format json

# Limit results
civic search "privacy" --limit 5
```

---

### `diff`

Compare record versions or show changes between commits.

```sh
civic diff [record] [options]
```

**Options:**

- `--from <commit>` - Compare from specific commit
- `--to <commit>` - Compare to specific commit
- `--interactive` - Interactive diff mode
- `--metadata` - Show only metadata changes
- `--content` - Show only content changes
- `--format <format>` - Output format (human, json)
- `--stat` - Show statistics only

**Examples:**

```sh
# Compare last two commits
civic diff

# Compare specific record
civic diff policy/public-records-policy

# Interactive mode
civic diff policy/public-records-policy --interactive

# Show only metadata changes
civic diff --metadata

# Show only content changes
civic diff --content

# JSON output
civic diff --format json

# Compare specific commits
civic diff --from v1.0.0 --to v1.1.0
```

---

### `export`

Export records in various formats (JSON, CSV, HTML, PDF).

```sh
civic export [options]
```

**Options:**

- `--type <type>` - Export specific types (comma-separated)
- `--status <status>` - Filter by status
- `--author <author>` - Filter by author
- `--date <date>` - Filter by date
- `--format <format>` - Output format (json, csv, html, pdf)
- `--output <path>` - Output file or directory
- `--include-content` - Include record content
- `--include-metadata` - Include full metadata
- `--template <template>` - Custom HTML template
- `--pretty` - Pretty-print JSON output

**Examples:**

```sh
# Export all records
civic export

# Export specific types
civic export --type policy,bylaw

# Filter by status
civic export --status approved,active

# Include content
civic export --include-content

# Output formats
civic export --format json
civic export --format csv
civic export --format html --template custom-template.html

# Custom output path
civic export --output reports/

# Pretty JSON
civic export --format json --pretty
```

---

### `template`

Manage record templates with advanced inheritance and validation.

```sh
civic template [command] [options]
```

**Commands:**

#### List Templates

```sh
civic template --list [options]
```

**Options:**

- `--type <type>` - List templates for specific type
- `--format <format>` - Output format (human, json)
- `--include-inheritance` - Show inheritance information

**Examples:**

```sh
# List all templates
civic template --list

# List bylaw templates
civic template --list --type bylaw

# JSON output
civic template --list --format json

# Show inheritance info
civic template --list --include-inheritance
```

#### Show Template Details

```sh
civic template --show <template> [options]
```

**Options:**

- `--format <format>` - Output format (human, json, yaml)
- `--include-content` - Include template content
- `--include-validation` - Include validation rules

**Examples:**

```sh
# Show template details
civic template --show bylaw/advanced

# JSON output
civic template --show policy/default --format json

# Include content and validation
civic template --show resolution/standard --include-content --include-validation
```

#### Create Custom Templates

```sh
civic template --create <name> [options]
```

**Options:**

- `--type <type>` - Record type for template
- `--extends <template>` - Extend existing template
- `--description <desc>` - Template description
- `--format <format>` - Output format (human, json)

**Examples:**

```sh
# Create new template
civic template --create "custom-bylaw" --type bylaw

# Create with inheritance
civic template --create "financial-bylaw" --type bylaw --extends bylaw/base

# Add description
civic template --create "privacy-policy" --type policy --description "Privacy policy template"
```

#### Validate Templates

```sh
civic template --validate <template> [options]
```

**Options:**

- `--format <format>` - Output format (human, json)
- `--strict` - Treat warnings as errors

**Examples:**

```sh
# Validate template
civic template --validate bylaw/advanced

# JSON output
civic template --validate policy/default --format json

# Strict validation
civic template --validate resolution/standard --strict
```

---

### `validate`

Validate records against their templates with comprehensive rule checking.

```sh
civic validate [record] [options]
```

**Options:**

- `--all` - Validate all records
- `--fix` - Attempt to auto-fix validation issues
- `--strict` - Treat warnings as errors
- `--format <format>` - Output format (human, json)
- `--include-suggestions` - Include improvement suggestions

**Examples:**

#### Validate Single Record

```sh
# Basic validation
civic validate bylaw/public-meeting-procedures

# JSON output
civic validate policy/public-records-policy --json

# Strict validation
civic validate resolution/budget-approval --strict
```

#### Validate All Records

```sh
# Validate all records
civic validate --all

# JSON output
civic validate --all --json

# Auto-fix issues
civic validate --all --fix

# Strict validation
civic validate --all --strict

# Include suggestions
civic validate --all --include-suggestions
```

#### Validation Output Examples

**Human Readable:**

```
📊 Validation Summary:
  Total records: 15
  Valid records: 12
  Invalid records: 3

📄 bylaw/public-meeting-procedures.md
  ❌ Invalid
    ❌ bylaw_number: Required field 'bylaw_number' is missing or empty
    ⚠️  contact_email: Invalid email format
    ⚠️  content: Found 2 placeholder(s) in content

📊 Final Summary:
  Total errors: 1
  Total warnings: 2

❌ Some records have validation errors that need to be fixed.
```

**JSON Output:**

```json
{
  "results": [
    {
      "record": "bylaw/public-meeting-procedures.md",
      "isValid": false,
      "errors": [
        {
          "field": "bylaw_number",
          "message": "Required field 'bylaw_number' is missing or empty",
          "severity": "error"
        }
      ],
      "warnings": [
        {
          "field": "contact_email",
          "message": "Invalid email format",
          "suggestion": "Use a valid email format (e.g., user@example.com)"
        }
      ],
      "suggestions": []
    }
  ],
  "summary": {
    "totalRecords": 15,
    "validRecords": 12,
    "invalidRecords": 3,
    "totalErrors": 1,
    "totalWarnings": 2
  }
}
```

---

### `hook`

Manage event hooks and automation workflows.

```sh
civic hook [command] [options]
```

**Commands:**

#### List Hooks

```sh
civic hook --list [options]
```

**Options:**

- `--format <format>` - Output format (human, json)
- `--enabled` - Show only enabled hooks
- `--disabled` - Show only disabled hooks

**Examples:**

```sh
# List all hooks
civic hook --list

# JSON output
civic hook --list --format json

# Show enabled hooks only
civic hook --list --enabled
```

#### Enable/Disable Hooks

```sh
civic hook --enable <hook>
civic hook --disable <hook>
```

**Examples:**

```sh
# Enable hook
civic hook --enable record:created

# Disable hook
civic hook --disable record:committed
```

#### Show Hook Details

```sh
civic hook --show <hook> [options]
```

**Options:**

- `--format <format>` - Output format (human, json)

**Examples:**

```sh
# Show hook details
civic hook --show record:created

# JSON output
civic hook --show status:changed --format json
```

---

## Global Options

All commands support these global options:

- `--json` - Output results in JSON format
- `--silent` - Suppress all output (except errors)
- `--verbose` - Enable verbose output
- `--debug` - Enable debug output

**Examples:**

```sh
# JSON output for any command
civic list --json
civic search "test" --json
civic validate --all --json

# Silent mode
civic create policy "Test" --silent

# Verbose output
civic validate --all --verbose

# Debug mode
civic template --list --debug
```

---

## Configuration

CivicPress CLI configuration is stored in `.civic/config.yml`:

```yaml
# .civic/config.yml
dataDir: data
hooks:
  record:created:
    enabled: true
    workflows: [validate-record, notify-council]
  record:committed:
    enabled: true
    workflows: [validate-record]
validation:
  strict_mode: false
  auto_fix: false
  max_warnings: 10
templates:
  default_type: default
  inheritance_enabled: true
```

---

## Examples

### Complete Workflow

```sh
# Initialize CivicPress
civic init

# Create a new bylaw with advanced template
civic create bylaw "Public Meeting Procedures" --template advanced

# Edit the record
civic edit bylaw/public-meeting-procedures

# Validate the record
civic validate bylaw/public-meeting-procedures

# Change status to approved
civic status bylaw/public-meeting-procedures approved --message "Approved by council"

# View the final record
civic view bylaw/public-meeting-procedures

# Export for distribution
civic export --type bylaw --status approved --format html --output reports/
```

### Template Management

```sh
# List available templates
civic template --list

# Show advanced template details
civic template --show bylaw/advanced

# Create custom template
civic template --create "financial-bylaw" --type bylaw --extends bylaw/base

# Validate template
civic template --validate bylaw/advanced
```

### Validation and Quality

```sh
# Validate all records
civic validate --all

# Validate with auto-fix
civic validate --all --fix

# Strict validation
civic validate --all --strict

# Export validation report
civic validate --all --json > validation-report.json
```

---

## Additional Resources

- [Template System Guide](templates.md)
- [Validation System Guide](validation.md)
- [Configuration Reference](../.civic/config.yml)
- [Template Examples](../.civic/templates/)
