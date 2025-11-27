# CivicPress Spec: `records.md`

---

version: 1.0.0 
status: stable 
created: '2025-01-15' 
updated: '2025-01-15' 
deprecated: false

---

## Name

Core Record Management System

## Purpose

Manage civic records (bylaws, policies, resolutions, sessions, geography) with
full lifecycle support, version control, and validation.

## Scope & Responsibilities

Responsibilities:

- Record CRUD operations (create, read, update, delete)
- Record lifecycle management (draft → proposed → approved → published →
 archived)
- Status transition controls with workflow validation
- Directory-based organization (`data/records/<type>/<year>/...`)
- Markdown format with YAML frontmatter
- Record validation and schema checking
- Search and discovery
- File attachments support

Out of Scope:

- Record content editing (handled by UI)
- Complex workflow automation (handled by workflows spec)

## Inputs & Outputs

| Input | Description |
| ---------------- | -------------------------------------- |
| Record data | Markdown content with YAML frontmatter |
| Record metadata | Type, status, author, dates, etc. |
| File attachments | Linked files with categorization |

| Output | Description |
| ------------------ | ------------------------------------------- |
| Record files | Markdown files in `data/records/` structure |
| Record metadata | Structured record information |
| Validation results | Schema and content validation |

## File/Folder Location

```
data/records/
├── bylaw/
│ └── 2024/
│ └── bylaw-example.md
├── policy/
│ └── 2024/
│ └── policy-example.md
├── session/
│ └── 2024/
│ └── session-example.md
└── geography/
 └── geography-example.md
```

## Record Format

Records use Markdown with YAML frontmatter:

```yaml
---
title: "Example Bylaw"
type: bylaw
status: approved
author: "John Doe"
version: "1.0.0"
created: "2024-01-15T10:00:00Z"
updated: "2024-01-20T14:30:00Z"
---

# Example Bylaw

Content here...
```

## Record Lifecycle

Status transitions:

- `draft` → `proposed` → `under_review` → `approved` → `published` → `archived`
- Transitions validated by workflow rules
- Status change history tracked

## Record Types

Supported record types:

- `bylaw` - Municipal bylaws
- `ordinance` - City ordinances
- `policy` - Administrative policies
- `proclamation` - Official proclamations
- `resolution` - Council resolutions
- `session` - Meeting sessions and minutes
- `geography` - Geographic boundaries and zones

## API Endpoints

- `GET /api/v1/records` - List records with filtering
- `GET /api/v1/records/summary` - Aggregate counts by type/status
- `GET /api/v1/records/:id` - Get specific record
- `POST /api/v1/records` - Create new record
- `PUT /api/v1/records/:id` - Update record
- `DELETE /api/v1/records/:id` - Delete record
- `POST /api/v1/records/:id/status` - Change record status

## Related Specs

- [Templates](specs/templates.md) - Template system for record creation
- [Validation](specs/records-validation.md) - Record validation rules
- [Workflows](specs/workflows.md) - Status transition workflows
- [File Attachments](docs/file-attachment-system.md) - File attachment system

---

## History

- Created: 2025-01-15 - Documented existing record system implementation
