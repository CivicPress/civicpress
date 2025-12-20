# Template API Usage Guide

This guide provides practical examples for using the CivicPress Template API.

## Overview

The Template API allows you to manage templates programmatically, including
creating, updating, deleting, and previewing templates. All endpoints require
authentication and appropriate permissions.

## Authentication

All API requests require a Bearer token in the Authorization header:

```bash
Authorization: Bearer <your-token>
```

## Base URL

```
/api/v1/templates
```

## Common Operations

### List Templates

Get all available templates, optionally filtered by type:

```bash
# Get all templates
curl -X GET "http://localhost:3000/api/v1/templates" \
  -H "Authorization: Bearer <token>"

# Filter by type
curl -X GET "http://localhost:3000/api/v1/templates?type=bylaw" \
  -H "Authorization: Bearer <token>"

# Search templates
curl -X GET "http://localhost:3000/api/v1/templates?search=default" \
  -H "Authorization: Bearer <token>"

# Paginated results
curl -X GET "http://localhost:3000/api/v1/templates?page=1&limit=10" \
  -H "Authorization: Bearer <token>"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "id": "bylaw/default",
        "type": "bylaw",
        "name": "default",
        "description": "Default bylaw template",
        "content": "# {{title}}\n\n...",
        "validation": {
          "required_fields": ["title", "type", "status"]
        }
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 10
  }
}
```

### Get Single Template

Retrieve a specific template by ID:

```bash
curl -X GET "http://localhost:3000/api/v1/templates/bylaw%2Fdefault" \
  -H "Authorization: Bearer <token>"
```

**Note:** Template IDs contain slashes, so they must be URL-encoded (`/` becomes
`%2F`).

**Response:**

```json
{
  "success": true,
  "data": {
    "template": {
      "id": "bylaw/default",
      "type": "bylaw",
      "name": "default",
      "content": "# {{title}}\n\n...",
      "variables": [
        {
          "name": "title",
          "type": "static",
          "description": "Record title"
        }
      ]
    }
  }
}
```

### Create Template

Create a new template:

```bash
curl -X POST "http://localhost:3000/api/v1/templates" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "bylaw",
    "name": "custom-template",
    "description": "Custom bylaw template",
    "content": "# {{title}}\n\n## Purpose\n{{purpose}}\n\n## Provisions\n{{provisions}}",
    "validation": {
      "required_fields": ["title", "purpose", "provisions"]
    }
  }'
```

**Required Fields:**

- `type`: Template type (e.g., "bylaw", "policy")
- `name`: Template name (alphanumeric, hyphens, underscores only)
- `content`: Markdown content with variable placeholders

**Optional Fields:**

- `description`: Template description
- `extends`: Parent template ID for inheritance
- `validation`: Validation rules object
- `sections`: Section definitions

**Response:**

```json
{
  "success": true,
  "data": {
    "template": {
      "id": "bylaw/custom-template",
      "type": "bylaw",
      "name": "custom-template",
      "content": "# {{title}}\n\n..."
    }
  }
}
```

### Update Template

Update an existing template (only custom templates can be updated):

```bash
curl -X PUT "http://localhost:3000/api/v1/templates/bylaw%2Fcustom-template" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description",
    "content": "# {{title}}\n\nUpdated content..."
  }'
```

**Note:** All fields are optional. Only provided fields will be updated.

### Delete Template

Delete a template:

```bash
curl -X DELETE "http://localhost:3000/api/v1/templates/bylaw%2Fcustom-template" \
  -H "Authorization: Bearer <token>"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "Template deleted successfully"
  }
}
```

### Preview Template

Preview a template with variable substitution:

```bash
curl -X POST "http://localhost:3000/api/v1/templates/bylaw%2Fdefault/preview" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Bylaw",
    "purpose": "To test the template system",
    "provisions": "Sample provisions text"
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "rendered": "# Test Bylaw\n\n## Purpose\nTo test the template system\n\n## Provisions\nSample provisions text",
    "variables": {
      "used": ["title", "purpose", "provisions"],
      "missing": ["author"],
      "available": [
        {
          "name": "title",
          "type": "static",
          "description": "Record title"
        }
      ]
    }
  }
}
```

### Validate Template

Validate a template's structure and inheritance:

```bash
curl -X POST "http://localhost:3000/api/v1/templates/bylaw%2Fdefault/validate" \
  -H "Authorization: Bearer <token>"
```

**Response:**

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
    },
    "structure": {
      "valid": true,
      "errors": []
    }
  }
}
```

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "TEMPLATE_NOT_FOUND",
    "message": "Template 'bylaw/invalid' not found",
    "details": {
      "templateId": "bylaw/invalid"
    }
  }
}
```

### Common Error Codes

| Code                 | HTTP Status | Description                   |
| -------------------- | ----------- | ----------------------------- |
| `TEMPLATE_NOT_FOUND` | 404         | Template does not exist       |
| `TEMPLATE_INVALID`   | 400         | Template structure is invalid |
| `INHERITANCE_CYCLE`  | 400         | Circular inheritance detected |
| `TEMPLATE_EXISTS`    | 409         | Template already exists       |
| `PERMISSION_DENIED`  | 403         | Insufficient permissions      |
| `VALIDATION_FAILED`  | 400         | Template validation failed    |
| `FILE_SYSTEM_ERROR`  | 500         | File system operation failed  |

## Permissions

| Permission         | Required For                 |
| ------------------ | ---------------------------- |
| `templates:view`   | List, Get, Preview, Validate |
| `templates:create` | Create                       |
| `templates:edit`   | Update                       |
| `templates:delete` | Delete                       |

## Security Considerations

1. **Template IDs**: Must follow `{type}/{name}` format. Only alphanumeric
   characters, hyphens, and underscores are allowed.

2. **Path Traversal**: Template IDs are validated to prevent directory traversal
   attacks (e.g., `../`).

3. **System Templates**: Templates in `.system-data/templates/` are read-only
   and cannot be modified via API.

4. **Variable Sanitization**: Variable values are sanitized to prevent code
   injection when rendering templates.

5. **File System Permissions**: The API only allows creating/updating templates
   in the custom templates directory (`data/.civic/templates/`).

## Best Practices

1. **Use Descriptive Names**: Choose clear, descriptive template names (e.g.,
   `bylaw/comprehensive` instead of `bylaw/t1`).

2. **Validate Before Creating**: Use the validate endpoint to check template
   structure before creating.

3. **Preview Before Use**: Always preview templates with sample data to ensure
   correct rendering.

4. **Handle Missing Variables**: Check the `missing` array in preview responses
   to identify required variables.

5. **Inheritance**: Use template inheritance to create base templates and extend
   them for specific use cases.

6. **Error Handling**: Always check the `success` field and handle errors
   appropriately.

## Example: Complete Workflow

```bash
# 1. List available templates
TEMPLATES=$(curl -s -X GET "http://localhost:3000/api/v1/templates?type=bylaw" \
  -H "Authorization: Bearer <token>")

# 2. Get a specific template
TEMPLATE=$(curl -s -X GET "http://localhost:3000/api/v1/templates/bylaw%2Fdefault" \
  -H "Authorization: Bearer <token>")

# 3. Preview with variables
PREVIEW=$(curl -s -X POST "http://localhost:3000/api/v1/templates/bylaw%2Fdefault/preview" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Sample Bylaw",
    "purpose": "Example purpose",
    "provisions": "Example provisions"
  }')

# 4. Validate template
VALIDATION=$(curl -s -X POST "http://localhost:3000/api/v1/templates/bylaw%2Fdefault/validate" \
  -H "Authorization: Bearer <token>")
```

## JavaScript/TypeScript Example

```typescript
const API_BASE = 'http://localhost:3000/api/v1';
const TOKEN = 'your-auth-token';

async function listTemplates(type?: string) {
  const url = `${API_BASE}/templates${type ? `?type=${type}` : ''}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`
    }
  });
  const data = await response.json();
  return data.data.templates;
}

async function previewTemplate(templateId: string, variables: Record<string, any>) {
  const encodedId = encodeURIComponent(templateId);
  const response = await fetch(`${API_BASE}/templates/${encodedId}/preview`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(variables)
  });
  const data = await response.json();
  return data.data;
}

// Usage
const templates = await listTemplates('bylaw');
const preview = await previewTemplate('bylaw/default', {
  title: 'Test Bylaw',
  purpose: 'Testing'
});
console.log(preview.rendered);
```

## Related Documentation

- [Template System Specification](../specs/templates.md)
- [Template System Guide](../templates.md)
- [API Authentication](../api.md)
