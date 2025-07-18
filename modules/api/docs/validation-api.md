# Validation API Documentation

## Overview

The Validation API provides comprehensive record validation and quality checking
for CivicPress. It validates record structure, content, metadata, and identifies
potential issues that could affect data quality and governance compliance.

## Authentication

All endpoints require authentication via Bearer token:

```bash
Authorization: Bearer <your-token>
```

## Validation Features

### Record Structure Validation

- YAML frontmatter parsing and validation
- Required fields checking (title, type)
- Optional fields validation (status, author, dates)
- Standard status and type value validation

### Content Analysis

- Content length assessment
- Template variable detection
- TODO/FIXME marker identification
- File readability and format checking

### Issue Categorization

- **Error**: Critical issues that prevent record processing
- **Warning**: Issues that may affect quality or compliance
- **Info**: Informational issues for awareness

## Endpoints

### POST /api/validation/record

Validate a single record with detailed issue reporting.

**Authentication:** Required  
**Permission:** `records:view`

#### Request Body

```json
{
  "recordId": "article-001---animal-control",
  "type": "bylaw"
}
```

#### Request Parameters

| Parameter  | Type   | Required | Description                            |
| ---------- | ------ | -------- | -------------------------------------- |
| `recordId` | string | Yes      | Record ID (filename without extension) |
| `type`     | string | No       | Record type for faster lookup          |

#### Response Format

```json
{
  "success": true,
  "data": {
    "recordId": "article-001---animal-control",
    "isValid": true,
    "issues": [],
    "content": "---\ntype: bylaw\ntitle: Article 001 - Animal Control\nstatus: active\nauthor: City Council\ncreated: '2024-01-01'\nupdated: '2024-01-01'\n---\n\nAll dogs must be leashed in public parks at all times.\n",
    "metadata": {
      "title": "Article 001 - Animal Control",
      "type": "bylaw",
      "status": "active",
      "author": "City Council",
      "created": "2024-01-01",
      "updated": "2024-01-01"
    }
  },
  "meta": {
    "isValid": true,
    "issues": 0
  }
}
```

#### Example Requests

```bash
# Validate a specific record
curl -X POST http://localhost:3000/api/validation/record \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "recordId": "article-001---animal-control",
    "type": "bylaw"
  }'

# Validate without specifying type (searches all types)
curl -X POST http://localhost:3000/api/validation/record \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "recordId": "debug-test"
  }'
```

### POST /api/validation/bulk

Validate multiple records with summary reporting.

**Authentication:** Required  
**Permission:** `records:view`

#### Request Body

```json
{
  "recordIds": ["article-001---animal-control", "debug-test"],
  "types": ["bylaw", "bylaw"],
  "includeContent": false
}
```

#### Request Parameters

| Parameter        | Type    | Required | Description                                         |
| ---------------- | ------- | -------- | --------------------------------------------------- |
| `recordIds`      | array   | Yes      | Array of record IDs to validate                     |
| `types`          | array   | No       | Array of record types (must match recordIds length) |
| `includeContent` | boolean | No       | Include full content in response (default: false)   |

#### Response Format

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "recordId": "article-001---animal-control",
        "isValid": true,
        "issues": [],
        "metadata": {
          "title": "Article 001 - Animal Control",
          "type": "bylaw",
          "status": "active",
          "author": "City Council",
          "created": "2024-01-01",
          "updated": "2024-01-01"
        }
      },
      {
        "recordId": "debug-test",
        "isValid": true,
        "issues": [
          {
            "severity": "warning",
            "code": "TEMPLATE_VARIABLES",
            "message": "Record contains template variables that may not be resolved",
            "field": "content"
          }
        ],
        "metadata": {
          "title": "Debug Test",
          "type": "bylaw",
          "status": "draft",
          "author": "system",
          "created": "2025-07-09T00:40:16.261Z",
          "updated": "2025-07-09T00:40:16.261Z"
        }
      }
    ],
    "summary": {
      "totalRecords": 2,
      "validCount": 2,
      "invalidCount": 0,
      "bySeverity": {
        "error": 0,
        "warning": 1,
        "info": 0
      }
    }
  },
  "meta": {
    "totalRecords": 2,
    "validRecords": 2,
    "invalidRecords": 0
  }
}
```

#### Example Requests

```bash
# Validate multiple records
curl -X POST http://localhost:3000/api/validation/bulk \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "recordIds": ["article-001---animal-control", "debug-test"],
    "types": ["bylaw", "bylaw"]
  }'

# Validate with content included
curl -X POST http://localhost:3000/api/validation/bulk \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "recordIds": ["article-001---animal-control"],
    "types": ["bylaw"],
    "includeContent": true
  }'
```

### GET /api/validation/status

Get system-wide validation status and issues.

**Authentication:** Required  
**Permission:** `records:view`

#### Query Parameters

| Parameter  | Type    | Required | Description                                             |
| ---------- | ------- | -------- | ------------------------------------------------------- |
| `type`     | string  | No       | Filter by record type                                   |
| `severity` | string  | No       | Filter by issue severity (`error`, `warning`, `info`)   |
| `limit`    | integer | No       | Maximum number of issues to return (1-100, default: 50) |

#### Response Format

```json
{
  "success": true,
  "data": {
    "issues": [
      {
        "severity": "warning",
        "code": "TEMPLATE_VARIABLES",
        "message": "Record contains template variables that may not be resolved",
        "field": "content",
        "recordId": "debug-test",
        "recordType": "bylaw",
        "file": "records/bylaw/debug-test.md"
      }
    ],
    "summary": {
      "totalIssues": 31,
      "bySeverity": {
        "error": 0,
        "warning": 31,
        "info": 0
      },
      "byType": {
        "bylaw": 24,
        "policy": 5,
        "resolution": 2
      }
    }
  },
  "meta": {
    "totalIssues": 31
  }
}
```

#### Example Requests

```bash
# Get all validation issues
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/validation/status"

# Get only error issues
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/validation/status?severity=error"

# Get issues for bylaw records only
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/validation/status?type=bylaw"

# Get limited number of issues
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/validation/status?limit=10"
```

### GET /api/validation/record/:recordId

Validate a specific record by ID.

**Authentication:** Required  
**Permission:** `records:view`

#### Path Parameters

| Parameter  | Type   | Required | Description           |
| ---------- | ------ | -------- | --------------------- |
| `recordId` | string | Yes      | Record ID to validate |

#### Query Parameters

| Parameter | Type   | Required | Description                   |
| --------- | ------ | -------- | ----------------------------- |
| `type`    | string | No       | Record type for faster lookup |

#### Response Format

```json
{
  "success": true,
  "data": {
    "recordId": "debug-test",
    "isValid": true,
    "issues": [
      {
        "severity": "warning",
        "code": "TEMPLATE_VARIABLES",
        "message": "Record contains template variables that may not be resolved",
        "field": "content"
      }
    ],
    "content": "---\ntitle: Debug Test\ntype: bylaw\nstatus: draft\n---\n\n# Debug Test\n\n{{purpose}}\n\n{{provisions}}\n",
    "metadata": {
      "title": "Debug Test",
      "type": "bylaw",
      "status": "draft",
      "author": "system",
      "created": "2025-07-09T00:40:16.261Z",
      "updated": "2025-07-09T00:40:16.261Z"
    }
  },
  "meta": {
    "isValid": true,
    "issues": 1
  }
}
```

#### Example Requests

```bash
# Validate specific record
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/validation/record/debug-test"

# Validate with type specified
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/validation/record/debug-test?type=bylaw"
```

## Validation Issue Types

### Error Issues (Critical)

| Code                  | Description                | Field       |
| --------------------- | -------------------------- | ----------- |
| `RECORD_NOT_FOUND`    | Record file not found      | recordId    |
| `READ_ERROR`          | Failed to read record file | file        |
| `MISSING_FRONTMATTER` | No YAML frontmatter found  | frontmatter |
| `MISSING_TITLE`       | Record missing title field | title       |
| `MISSING_TYPE`        | Record missing type field  | type        |
| `INVALID_YAML`        | Malformed YAML frontmatter | frontmatter |
| `VALIDATION_ERROR`    | General validation error   | general     |

### Warning Issues (Quality)

| Code                 | Description                            | Field   |
| -------------------- | -------------------------------------- | ------- |
| `MISSING_STATUS`     | Record missing status field            | status  |
| `INVALID_STATUS`     | Non-standard status value              | status  |
| `INVALID_TYPE`       | Non-standard type value                | type    |
| `SHORT_CONTENT`      | Very short content                     | content |
| `TEMPLATE_VARIABLES` | Contains unresolved template variables | content |

### Info Issues (Awareness)

| Code         | Description                 | Field   |
| ------------ | --------------------------- | ------- |
| `TODO_FOUND` | Contains TODO/FIXME markers | content |

## Standard Values

### Valid Status Values

- `draft`
- `proposed`
- `reviewed`
- `approved`
- `active`
- `archived`

### Valid Type Values

- `bylaw`
- `policy`
- `resolution`
- `proposition`
- `ordinance`

## Use Cases

### Quality Assurance

- Validate records before publication
- Check for missing required fields
- Identify template variables that need resolution
- Ensure proper metadata structure

### Compliance Monitoring

- Monitor record structure across the system
- Track validation issues by severity
- Identify records needing attention
- Maintain data quality standards

### Development Workflow

- Validate records during development
- Check for TODO markers and incomplete content
- Ensure proper frontmatter structure
- Validate bulk imports

### System Health

- Monitor overall data quality
- Track validation trends
- Identify common issues
- Maintain governance standards

## Error Responses

```json
{
  "success": false,
  "error": {
    "message": "Permission denied: records:view",
    "code": "INSUFFICIENT_PERMISSIONS",
    "required": "records:view",
    "user": {
      "id": 5,
      "username": "user",
      "role": "public"
    }
  }
}
```

## Performance Notes

- Single record validation is fast and suitable for real-time validation
- Bulk validation should be used for batch operations
- System-wide validation status may be slow for large datasets
- Consider caching validation results for frequently accessed records
- Template variable detection is regex-based and may have false positives

## Integration Examples

### JavaScript/Node.js

```javascript
// Validate a single record
const response = await fetch('http://localhost:3000/api/validation/record', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    recordId: 'article-001---animal-control',
    type: 'bylaw'
  })
});

const result = await response.json();
console.log(`Valid: ${result.data.isValid}`);
console.log(`Issues: ${result.data.issues.length}`);
```

### Python

```python
import requests

# Validate multiple records
response = requests.post(
    'http://localhost:3000/api/validation/bulk',
    headers={'Authorization': 'Bearer your-token'},
    json={
        'recordIds': ['record1', 'record2'],
        'types': ['bylaw', 'policy'],
        'includeContent': False
    }
)

result = response.json()
print(f"Valid Records: {result['data']['summary']['validCount']}")
print(f"Invalid Records: {result['data']['summary']['invalidCount']}")
```

### Shell Script

```bash
#!/bin/bash

TOKEN="your-token"
RECORD_ID="article-001---animal-control"

# Validate a record
RESULT=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"recordId\":\"$RECORD_ID\",\"type\":\"bylaw\"}" \
  "http://localhost:3000/api/validation/record")

IS_VALID=$(echo $RESULT | jq -r '.data.isValid')
ISSUES=$(echo $RESULT | jq -r '.data.issues | length')

echo "Record: $RECORD_ID"
echo "Valid: $IS_VALID"
echo "Issues: $ISSUES"
```
