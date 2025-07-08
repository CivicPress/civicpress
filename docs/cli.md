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

---

## Overview

CivicPress CLI lets you manage civic records, policies, bylaws, and more using a
Git-backed, file-based workflow. All records and configuration live in a
dedicated data directory (e.g., `data/`).

## Command Reference

### `init`

Initialize a new CivicPress data directory and configuration.

```sh
civic init
```

- Prompts for setup options and creates `.civic/config.yml`.
- Initializes a Git repo if needed.

---

### `create`

Create a new record (policy, bylaw, resolution, etc.).

```sh
civic create <type> <name>
```

- Example: `civic create policy "Public Records Policy"`
- Prompts for metadata and opens your editor for content.

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
civic history
```

- Shows recent commits, authors, and messages.

---

### `list`

List records by type and status.

```sh
civic list [type] [--status <status>] [--all]
```

- List all records: `civic list`
- List only policies: `civic list policy`
- Filter by status: `civic list bylaw --status active,approved`

---

### `view`

View a specific record’s content and metadata.

```sh
civic view <record> [--raw]
```

- Example: `civic view policy/public-records-policy`
- Use `--raw` to show raw markdown.

---

### `edit`

Edit a record in your preferred editor.

```sh
civic edit <record> [--editor <editor>]
```

- Example: `civic edit bylaw/test-clean-structure --editor vim`

---

### `status`

Change the status of a record (e.g., draft → approved).

```sh
civic status <record> <new-status> [--message <msg>]
```

- Example:
  `civic status policy/public-records-policy approved --message "Policy approved by council"`

---

### `search`

Search records by content, metadata, status, type, author, date, or Git history.

```sh
civic search [query] [options]
```

- Search content: `civic search "budget"`
- Filter by type/status: `civic search --type policy --status approved`
- Search by author: `civic search --author system`
- Regex search: `civic search --regex --content "test"`
- Output as JSON: `civic search --format json`

---

### `diff`

Compare record versions or show changes between commits.

```sh
civic diff [record] [options]
```

- Compare last two commits: `civic diff`
- Compare a specific record: `civic diff policy/public-records-policy`
- Interactive mode: `civic diff policy/public-records-policy --interactive`
- Show only metadata/content changes: `civic diff --metadata` or
  `civic diff --content`
- Output as JSON: `civic diff --format json`

---

### `export`

Export records in various formats (JSON, CSV, HTML, PDF).

```sh
civic export [options]
```

- Export all records: `civic export`
- Export specific types: `civic export --type policy,bylaw`
- Filter by status: `civic export --status approved,active`
- Include content: `civic export --include-content`
- Output formats: `civic export --format json|csv|html|pdf`

---

### `template`

Manage record templates for consistent structure.

```sh
civic template [command] [options]
```

- List templates: `civic template list`
- Show template: `civic template show policy`
- Create template: `civic template create <type>`
- Validate template: `civic template validate <type>`

---

### `validate`

Validate records against their templates and check for common issues.

```sh
civic validate [record] [options]
```

- Validate a single record: `civic validate policy/public-records-policy`
- Validate all records: `civic validate --all`
- Strict mode (warnings as errors): `civic validate --all --strict`
- JSON output: `civic validate --all --format json`

The validation checks:

- Required and optional metadata fields
- Content structure and sections
- Field format validation (email, date, URL)
- Common issues like placeholders and empty sections
- Template compliance

---

## Tips

- Run `civic <command> --help` for detailed options.
- All commands operate on the civic data directory (not the app repo).
- Use relative paths for records (e.g., `policy/public-records-policy`).

---

For more information, see the main [README.md](../README.md) or visit the
CivicPress documentation site.
