# CivicPress Spec: `templates.md`

---

version: 2.0.0 status: stable created: '2025-01-15' updated: '2025-12-17'
implementation_status: completed deprecated: false sunset_date: null
breaking_changes: [] additions:

- Comprehensive API endpoint specifications
- Template service layer architecture
- Security and permission model
- Error handling and validation
- Caching strategy
- Template ID format standardization fixes:
- API endpoint structure inconsistencies
- Missing error handling specifications
- Incomplete permission model migration_guide: null compatibility:
  min_civicpress: '0.2.0' max_civicpress: null dependencies:
- 'auth.md: >=1.2.0'
- 'permissions.md: >=1.1.0'
- 'records.md: >=1.0.0' authors:
- 'Sophie Germain <sophie@civicpress.io>' reviewers:
- 'Ada Lovelace'
- 'Irène Joliot-Curie'

---

## Name

Template System for Record Creation

## Purpose

Provide a comprehensive template system that allows users to create civic
records using predefined templates with variable substitution, inheritance,
validation rules, and secure API access. Templates support advanced features
including partials, conditional blocks, and multi-level inheritance.

## Scope & Responsibilities

Responsibilities:

- Load templates from `data/.civic/templates/` directory structure
- Support template inheritance and extension (multi-level)
- Variable substitution with form data and smart defaults
- Template selection UI in record creation forms
- Template confirmation workflow to prevent accidental content loss
- RESTful API for template management and retrieval
- Template validation and error reporting
- Caching for performance optimization
- Security and permission enforcement

Out of Scope:

- Template editing UI (templates are managed as files or via CLI)
- Complex template logic beyond variable substitution and conditionals
- Template versioning system (v2.0+)
- Template marketplace or sharing

## Inputs & Outputs

| Input          | Description                                   |
| -------------- | --------------------------------------------- |
| Record type    | Type of record (bylaw, policy, etc.)          |
| Template ID    | Template identifier in format `{type}/{name}` |
| Form data      | Current form values for variable substitution |
| Variables      | Key-value pairs for template rendering        |
| Authentication | User token and permissions                    |

| Output             | Description                                   |
| ------------------ | --------------------------------------------- |
| Template content   | Populated template with substituted variables |
| Template metadata  | Name, description, type, validation rules     |
| Template list      | Filtered and paginated template listings      |
| Validation results | Structured error and warning reports          |
| Rendered preview   | Template with variables applied               |

## File/Folder Location

```
data/.civic/templates/
├── bylaw/
│ ├── default.md
│ ├── advanced.md
│ └── base.md
├── policy/
│ └── default.md
└── resolution/
 └── default.md

data/.civic/partials/
├── header.md
├── footer.md
└── approval-section.md

.system-data/templates/  (read-only system templates)
├── bylaw/
│ └── default.md
└── policy/
 └── default.md
```

## Template Format

Templates are Markdown files with YAML frontmatter:

```yaml
---
template: bylaw/default
type: bylaw
description: Standard bylaw template
extends: bylaw/base  # Optional parent template
validation:
  required_fields: [title, type, status, author]
  status_values: [draft, proposed, approved, active, archived]
  sections:
    - name: "purpose"
      required: true
      min_length: 50
  advanced_rules:
    - name: "approval_workflow"
      condition: "status == 'approved'"
      fields: [approval_date, approved_by]
      rule: "field_dependency"
      severity: "error"
---

# {{title}}

## Purpose
{{purpose}}

## Definitions
{{definitions}}
```

## Template ID Format

Templates are identified using the format: `{type}/{name}`

- **Type**: Record type (bylaw, policy, resolution, etc.)
- **Name**: Template name without extension (default, advanced, etc.)
- **Examples**: `bylaw/default`, `policy/advanced`, `resolution/budget`

This format:

- Matches the file system structure
- Is human-readable
- Prevents ID collisions
- Supports hierarchical organization

## Template Inheritance

Templates can extend parent templates with multi-level support:

```yaml
---
template: bylaw/advanced
extends: bylaw/base
---

# {{title}}

## Additional Sections
{{additional_content}}
```

**Inheritance Rules:**

1. **Field Merging** - Child templates add to parent required fields
2. **Rule Composition** - Advanced rules are combined from all levels
3. **Content Override** - Child content replaces parent content
4. **Validation Inheritance** - All validation rules are inherited
5. **Cycle Detection** - Circular inheritance is prevented

## Variable Substitution

Templates support variable substitution using `{{variable}}` syntax:

**Built-in Variables:**

- `{{title}}` - Record title
- `{{user}}` - Current user name
- `{{timestamp}}` - Current timestamp (ISO format)
- `{{date}}` - Current date (YYYY-MM-DD)
- `{{type}}` - Record type
- `{{status}}` - Record status
- `{{author}}` - Record author
- `{{version}}` - Template version

**Type-Specific Variables:**

- `{{bylaw_number}}` - Auto-generated bylaw number
- `{{policy_number}}` - Auto-generated policy number
- `{{resolution_number}}` - Auto-generated resolution number
- `{{fiscal_year}}` - Current fiscal year

**Conditional Blocks:**

```markdown
{{#if status == 'approved'}}
**Approved:** {{approval_date}}
**By:** {{approved_by}}
{{/if}}
```

**Partials:**

```markdown
{{> header title=document_title}}
{{> approval-section approval_date=approval_date}}
```

## API Endpoints

### List Templates

**GET** `/api/v1/templates`

List all available templates with optional filtering.

**Query Parameters:**

- `type` (optional): Filter by record type (e.g., `bylaw`, `policy`)
- `search` (optional): Search templates by name or description
- `include` (optional): Include additional data (`metadata`, `validation`,
  `variables`)
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Results per page (default: 50, max: 100)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "id": "bylaw/default",
        "type": "bylaw",
        "name": "default",
        "description": "Standard bylaw template",
        "extends": "bylaw/base",
        "metadata": {
          "created": "2025-01-15T10:00:00Z",
          "updated": "2025-01-15T10:00:00Z"
        },
        "validation": {
          "required_fields": ["title", "type", "status", "author"],
          "sections": [
            {
              "name": "purpose",
              "required": true,
              "min_length": 50
            }
          ]
        },
        "variables": [
          {
            "name": "title",
            "type": "static",
            "description": "Record title"
          }
        ]
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 50
  }
}
```

**Permissions:** `templates:view`

### Get Template

**GET** `/api/v1/templates/:id`

Get a specific template by ID.

**Path Parameters:**

- `id`: Template ID in format `{type}/{name}` (e.g., `bylaw/default`)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "template": {
      "id": "bylaw/default",
      "type": "bylaw",
      "name": "default",
      "description": "Standard bylaw template",
      "extends": "bylaw/base",
      "content": "# {{title}}\n\n## Purpose\n{{purpose}}",
      "rawContent": "---\n...\n---\n\n# {{title}}",
      "validation": { ... },
      "sections": [ ... ],
      "variables": [ ... ],
      "partials": ["header", "footer"],
      "metadata": {
        "created": "2025-01-15T10:00:00Z",
        "updated": "2025-01-15T10:00:00Z"
      }
    }
  }
}
```

**Error Responses:**

- `404`: Template not found
- `403`: Insufficient permissions

**Permissions:** `templates:view`

### Preview Template

**POST** `/api/v1/templates/:id/preview`

Preview a template with variable substitution.

**Path Parameters:**

- `id`: Template ID

**Request Body:**

```json
{
  "variables": {
    "title": "My Record Title",
    "purpose": "This is the purpose",
    "status": "draft"
  }
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "rendered": "# My Record Title\n\n## Purpose\nThis is the purpose",
    "variables": {
      "used": ["title", "purpose", "status"],
      "missing": ["author"],
      "available": [ ... ]
    }
  }
}
```

**Permissions:** `templates:view` or `templates:use`

### Create Template

**POST** `/api/v1/templates`

Create a new template.

**Request Body:**

```json
{
  "type": "bylaw",
  "name": "custom",
  "description": "Custom bylaw template",
  "extends": "bylaw/base",
  "content": "# {{title}}\n\n## Purpose\n{{purpose}}",
  "validation": {
    "required_fields": ["title", "type", "status"]
  }
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "template": {
      "id": "bylaw/custom",
      "type": "bylaw",
      "name": "custom",
      ...
    }
  }
}
```

**Error Responses:**

- `400`: Invalid template data
- `409`: Template already exists
- `403`: Insufficient permissions

**Permissions:** `templates:create`

### Update Template

**PUT** `/api/v1/templates/:id`

Update an existing template.

**Path Parameters:**

- `id`: Template ID

**Request Body:** (same as create, all fields optional)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "template": { ... }
  }
}
```

**Error Responses:**

- `404`: Template not found
- `400`: Invalid template data
- `403`: Insufficient permissions

**Permissions:** `templates:edit`

### Delete Template

**DELETE** `/api/v1/templates/:id`

Delete a template.

**Path Parameters:**

- `id`: Template ID

**Response (200):**

```json
{
  "success": true,
  "data": {
    "message": "Template deleted successfully"
  }
}
```

**Error Responses:**

- `404`: Template not found
- `403`: Insufficient permissions
- `409`: Template is in use (if protected)

**Permissions:** `templates:delete`

### Validate Template

**POST** `/api/v1/templates/:id/validate`

Validate a template structure and inheritance.

**Path Parameters:**

- `id`: Template ID

**Response (200):**

```json
{
  "success": true,
  "data": {
    "valid": true,
    "errors": [],
    "warnings": [
      "Template should include {{title}} placeholder"
    ],
    "inheritance": {
      "chain": ["bylaw/base", "bylaw/default"],
      "hasCycle": false
    }
  }
}
```

**Permissions:** `templates:view`

## Security & Permissions

### Permission Model

| Permission         | Description                      | Required For                  |
| ------------------ | -------------------------------- | ----------------------------- |
| `templates:view`   | View templates and metadata      | List, Get, Preview, Validate  |
| `templates:use`    | Use templates in record creation | Preview (alternative to view) |
| `templates:create` | Create new templates             | Create                        |
| `templates:edit`   | Modify existing templates        | Update                        |
| `templates:delete` | Remove templates                 | Delete                        |

### Security Considerations

1. **Path Traversal Prevention:**
   - Validate template names (alphanumeric, hyphens, underscores only)
   - Sanitize file paths
   - Prevent access to `.system-data/templates/` (read-only)

2. **Template Validation:**
   - Validate YAML frontmatter structure
   - Check for inheritance cycles
   - Verify file system permissions

3. **Content Security:**
   - Sanitize template content on creation/update
   - Validate variable substitution inputs
   - Prevent code injection in template variables

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "TEMPLATE_NOT_FOUND",
    "message": "Template 'bylaw/invalid' not found",
    "details": {
      "templateId": "bylaw/invalid",
      "availableTemplates": ["bylaw/default", "bylaw/advanced"]
    }
  }
}
```

### Error Codes

| Code                 | HTTP Status | Description                   |
| -------------------- | ----------- | ----------------------------- |
| `TEMPLATE_NOT_FOUND` | 404         | Template does not exist       |
| `TEMPLATE_INVALID`   | 400         | Template structure is invalid |
| `INHERITANCE_CYCLE`  | 400         | Circular inheritance detected |
| `TEMPLATE_EXISTS`    | 409         | Template already exists       |
| `PERMISSION_DENIED`  | 403         | Insufficient permissions      |
| `VALIDATION_FAILED`  | 400         | Template validation failed    |
| `FILE_SYSTEM_ERROR`  | 500         | File system operation failed  |

## Caching Strategy

### Cache Implementation

- **In-Memory Cache:** Template content and metadata
- **File Watchers:** Invalidate cache on file changes
- **Cache Keys:** Template ID (`{type}/{name}`)
- **TTL:** No expiration (invalidated on file change)

### Cache Invalidation

- File system events (create, update, delete)
- Manual invalidation via API (admin only)
- Cache cleared on template create/update/delete operations

## Service Layer Architecture

### TemplateService

Core service layer that wraps `TemplateEngine`:

```typescript
interface TemplateService {
  listTemplates(filters: TemplateFilters): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | null>;
  createTemplate(data: CreateTemplateRequest): Promise<Template>;
  updateTemplate(id: string, data: UpdateTemplateRequest): Promise<Template>;
  deleteTemplate(id: string): Promise<void>;
  previewTemplate(id: string, variables: Record<string, any>): Promise<string>;
  validateTemplate(id: string): Promise<ValidationResult>;
  invalidateCache(id?: string): Promise<void>;
}
```

### TemplateCache

Caching layer for template operations:

```typescript
interface TemplateCache {
  get(id: string): Promise<Template | null>;
  set(id: string, template: Template): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  watch(path: string, callback: () => void): void;
}
```

## UI Integration

Templates are integrated into record creation/editing forms:

- Template selection dropdown (visible after record type selection)
- "Load Template" button with confirmation modal
- Template preview in confirmation modal
- Variable substitution before loading
- Error handling for missing or invalid templates

## Related Specs

- [Records](specs/records.md) - Record management system
- [Validation](specs/records-validation.md) - Record validation rules
- [API](specs/api.md) - General API patterns and conventions
- [Permissions](specs/permissions.md) - Permission system

---

## History

- **v2.0.0** (2025-12-17): Comprehensive API specification, security model,
  caching strategy, service layer architecture
- **v1.0.0** (2025-01-15): Initial specification documenting existing template
  system implementation
