# CivicPress Spec: `templates.md`

---

version: 1.0.0 
status: stable 
created: '2025-01-15' 
updated: '2025-01-15' 
deprecated: false

---

## Name

Template System for Record Creation

## Purpose

Provide a template system that allows users to create civic records using
predefined templates with variable substitution, inheritance, and validation
rules.

## Scope & Responsibilities

Responsibilities:

- Load templates from `data/.civic/templates/` directory structure
- Support template inheritance and extension
- Variable substitution with form data
- Template selection UI in record creation forms
- Template confirmation workflow to prevent accidental content loss

Out of Scope:

- Template editing UI (templates are managed as files)
- Complex template logic beyond variable substitution

## Inputs & Outputs

| Input | Description |
| ------------- | --------------------------------------------- |
| Record type | Type of record (bylaw, policy, etc.) |
| Template name | Name of template to load |
| Form data | Current form values for variable substitution |

| Output | Description |
| ----------------- | --------------------------------------------- |
| Template content | Populated template with substituted variables |
| Template metadata | Name, description, type information |

## File/Folder Location

```
data/.civic/templates/
├── bylaw/
│ ├── default.md
│ └── advanced.md
├── policy/
│ └── default.md
└── resolution/
 └── default.md
```

## Template Format

Templates are Markdown files with YAML frontmatter:

```yaml
---
template: bylaw/default
type: bylaw
description: Standard bylaw template
---

# {{title}}

## Purpose
{{purpose}}

## Definitions
{{definitions}}
```

## Template Inheritance

Templates can extend parent templates:

```yaml
---
template: bylaw/advanced
extends: bylaw/base
---

# {{title}}

## Additional Sections
{{additional_content}}
```

## Variable Substitution

Templates support variable substitution using `{{variable}}` syntax:

- `{{title}}` - Record title
- `{{user}}` - Current user
- `{{timestamp}}` - Current timestamp
- Custom variables from form data

## API Endpoints

- `GET /api/v1/templates` - List all templates
- `GET /api/v1/templates?type={type}` - List templates for record type
- `GET /api/v1/templates/{type}/{name}` - Get specific template

## ️ UI Integration

Templates are integrated into record creation/editing forms:

- Template selection dropdown (visible after record type selection)
- "Load Template" button with confirmation modal
- Template preview in confirmation modal
- Variable substitution before loading

## Related Specs

- [Records](specs/records.md) - Record management system
- [Validation](specs/records-validation.md) - Record validation rules

---

## History

- Created: 2025-01-15 - Documented existing template system implementation
