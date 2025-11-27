# Advanced Template System

CivicPress features a sophisticated template system that supports inheritance,
validation, and dynamic content generation.

## Overview

Templates in CivicPress are Markdown files with YAML frontmatter that define:

- **Structure** - How records are organized
- **Validation** - Rules for data quality and compliance
- **Inheritance** - Template extension and customization
- **Variables** - Dynamic content substitution

## Template Structure

### Basic Template

```yaml
---
template: bylaw/default
type: bylaw
validation:
  required_fields: [title, type, status, author]
  sections:
    - name: "purpose"
      required: true
      min_length: 50
---
# {{title}}

## Purpose
{{purpose}}

## Definitions
{{definitions}}

## Provisions
{{provisions}}
```

### Advanced Template with Inheritance

```yaml
---
template: bylaw/advanced
extends: bylaw/base
validation:
  required_fields: [bylaw_number, fiscal_year, purpose, provisions]
  advanced_rules:
    - name: "approval_workflow"
      condition: "status == 'approved'"
      fields: [approval_date, approved_by, approval_meeting]
      rule: "approved_by_authority"
      severity: "error"
      message: "Approved bylaws must have approval details"
  field_relationships:
    - name: "approval_required_together"
      type: "required_together"
      fields: [approval_date, approved_by]
      condition: "status == 'approved'"
      message: "Both approval date and approver must be specified"
  custom_validators:
    - name: "email_validation"
      field: "contact_email"
      validator: "email"
      message: "Contact email must be a valid email address"
---
# {{title}}

**Type:** {{type}}
**Status:** {{status}}
**Author:** {{author}}
**Version:** {{version}}
**Bylaw Number:** {{bylaw_number}}
**Fiscal Year:** {{fiscal_year}}

{{#if status == 'approved'}}
**Approved:** {{approval_date}}
**By:** {{approved_by}}
**Meeting:** {{approval_meeting}}
{{/if}}

## Purpose
{{purpose}}

## Provisions
{{provisions}}

## Enforcement
{{enforcement}}
```

## Template Inheritance

Templates can inherit from parent templates, allowing for:

- **Base templates** - Common structure and validation
- **Specialized templates** - Extended functionality
- **Multi-level inheritance** - Complex template hierarchies

### Inheritance Example

```yaml
# .civic/templates/bylaw/base.md
---
template: bylaw/base
validation:
  required_fields: [title, type, status, author]
  sections:
    - name: "purpose"
      required: true
---
# {{title}}

## Purpose
{{purpose}}

## Definitions
{{definitions}}
```

```yaml
# .civic/templates/bylaw/advanced.md
---
template: bylaw/advanced
extends: bylaw/base
validation:
  required_fields: [bylaw_number, fiscal_year]
  advanced_rules:
    - name: "date_sequence_validation"
      fields: [approval_date, effective_date]
      rule: "date_sequence"
      severity: "error"
---
# {{title}}

**Bylaw Number:** {{bylaw_number}}
**Fiscal Year:** {{fiscal_year}}

## Purpose
{{purpose}}

## Provisions
{{provisions}}
```

### Inheritance Rules

1. **Field Merging** - Child templates add to parent required fields
2. **Rule Composition** - Advanced rules are combined from all levels
3. **Content Override** - Child content replaces parent content
4. **Validation Inheritance** - All validation rules are inherited

## Advanced Validation

### Validation Types

#### Basic Validation

```yaml
validation:
  required_fields: [title, type, status, author]
  status_values: [draft, proposed, approved, active, archived]
  business_rules:
    - "bylaw number must be unique"
    - "fiscal year must be current or future"
```

#### Advanced Rules

```yaml
validation:
  advanced_rules:
    - name: "approval_workflow"
      condition: "status == 'approved'"
      fields: [approval_date, approved_by]
      rule: "approved_by_authority"
      severity: "error"
      message: "Approved bylaws must have approval details"
    - name: "date_sequence_validation"
      fields: [approval_date, effective_date]
      rule: "date_sequence"
      severity: "error"
      message: "Approval date must be before effective date"
    - name: "content_quality_check"
      fields: [purpose, provisions]
      rule: "content_quality"
      severity: "warning"
      message: "Content should be complete and professional"
```

#### Field Relationships

```yaml
validation:
  field_relationships:
    - name: "approval_required_together"
      type: "required_together"
      fields: [approval_date, approved_by]
      condition: "status == 'approved'"
      message: "Both approval date and approver must be specified"
    - name: "mutually_exclusive_contacts"
      type: "mutually_exclusive"
      fields: [contact_email, contact_phone]
      message: "Specify either email or phone contact, not both"
    - name: "dependent_on_approval"
      type: "dependent_on"
      fields: [effective_date, approval_date]
      message: "Effective date requires approval date"
```

#### Custom Validators

```yaml
validation:
  custom_validators:
    - name: "email_validation"
      field: "contact_email"
      validator: "email"
      message: "Contact email must be a valid email address"
    - name: "phone_validation"
      field: "contact_phone"
      validator: "phone"
      message: "Contact phone must be a valid phone number"
    - name: "version_validation"
      field: "version"
      validator: "semantic_version"
      message: "Version must be in semantic format (x.y.z)"
    - name: "conditional_approval_meeting"
      field: "approval_meeting"
      validator: "required_if"
      params: ["status", "approved"]
      message: "Approval meeting must be specified for approved bylaws"
```

### Built-in Validators

| Validator          | Description                | Example                |
| ------------------ | -------------------------- | ---------------------- |
| `email`            | Email format validation    | `user@example.com`     |
| `phone`            | Phone number validation    | `+1-555-123-4567`      |
| `date`             | Date format validation     | `2024-01-01`           |
| `url`              | URL format validation      | `https://example.com`  |
| `semantic_version` | Semantic versioning        | `1.2.3`                |
| `required_if`      | Conditional required field | `status == 'approved'` |

## Template Commands

### List Templates

```bash
# List all templates
civic template --list

# List templates for specific type
civic template --list --type bylaw
```

### Show Template Details

```bash
# Show template information
civic template --show bylaw/advanced

# Show with JSON output
civic template --show bylaw/advanced --json
```

### Create Custom Templates

```bash
# Create new template
civic template --create "custom-bylaw" --type bylaw

# Create with specific template
civic template --create "financial-bylaw" --type bylaw --extends bylaw/base
```

### Validate Templates

```bash
# Validate template structure
civic template --validate bylaw/advanced

# Validate with JSON output
civic template --validate bylaw/advanced --json
```

## Template Variables

### Basic Variables

```yaml
# Available in all templates
title: "Record title"
type: "Record type (bylaw, policy, etc.)"
status: "Record status"
author: "Record author"
version: "Record version"
created: "Creation timestamp"
updated: "Last update timestamp"
```

### Conditional Blocks

```markdown
{{#if status == 'approved'}}
**Approved:** {{approval_date}}
**By:** {{approved_by}}
{{/if}}

{{#if contact_email || contact_phone}}
**Contact:**
{{#if contact_email}}{{contact_email}}{{/if}}
{{#if contact_phone}}{{#if contact_email}} / {{/if}}{{contact_phone}}{{/if}}
{{/if}}
```

### Section Content

```markdown
## Purpose
{{purpose}}

## Definitions
{{#if definitions}}{{definitions}}{{else}}_Definitions will be added as needed._{{/if}}

## Provisions
{{provisions}}
```

## Template Examples

### Policy Template

```yaml
---
template: policy/default
validation:
  required_fields: [title, type, status, author, policy_number]
  sections:
    - name: "description"
      required: true
      min_length: 100
    - name: "implementation"
      required: true
---
# {{title}}

**Policy Number:** {{policy_number}}

## Description
{{description}}

## Purpose
{{purpose}}

## Implementation
{{implementation}}

## Compliance
{{compliance}}
```

### Resolution Template

```yaml
---
template: resolution/default
validation:
  required_fields: [title, type, status, author, resolution_number]
  advanced_rules:
    - name: "budget_impact_required"
      condition: "budget_impact > 0"
      fields: [budget_justification]
      rule: "budget_justification_required"
      severity: "error"
---
# {{title}}

**Resolution Number:** {{resolution_number}}

## Background
{{background}}

## Whereas
{{whereas}}

## Be It Resolved
{{resolved}}

## Implementation
{{implementation}}
```

## Template Development

### Best Practices

1. **Start with base templates** - Create reusable base templates
2. **Use inheritance** - Extend base templates for specialization
3. **Validate thoroughly** - Include comprehensive validation rules
4. **Document clearly** - Add comments and descriptions
5. **Test templates** - Validate templates before use

### Template Organization

```
.civic/templates/
├── bylaw/
│   ├── base.md          # Base bylaw template
│   ├── default.md       # Default bylaw template
│   ├── advanced.md      # Advanced bylaw template
│   └── financial.md     # Financial bylaw template
├── policy/
│   ├── base.md          # Base policy template
│   ├── default.md       # Default policy template
│   └── privacy.md       # Privacy policy template
└── resolution/
    ├── base.md          # Base resolution template
    ├── default.md       # Default resolution template
    └── budget.md        # Budget resolution template
```

### Template Validation

```bash
# Validate template structure
civic template --validate bylaw/advanced

# Check template inheritance
civic template --show bylaw/advanced

# Test template with sample data
civic create bylaw "Test Bylaw" --template advanced
```

## Additional Resources

- [Validation System Guide](validation.md)
- [CLI Usage Guide](cli.md)
- For template files location, see ../core/src/defaults/templates/
- [Validation Rules](../core/src/utils/template-engine.ts)
