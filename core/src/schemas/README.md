# CivicPress Record Schemas

This directory contains JSON Schema definitions for validating CivicPress record frontmatter.

## Base Schema

**`record-base-schema.json`** - Base schema for all CivicPress records

This schema validates the frontmatter structure as defined in `docs/record-format-standard.md`.

### Usage

The schema can be used with any JSON Schema validator (e.g., `ajv` in Node.js, `jsonschema` in Python).

#### Example: Node.js with ajv

```javascript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import schema from './record-base-schema.json';

const ajv = new Ajv();
addFormats(ajv); // Adds date-time format support

const validate = ajv.compile(schema);

// Validate frontmatter (after parsing YAML to JSON)
const frontmatter = {
  id: "record-123",
  title: "Test Record",
  type: "bylaw",
  status: "draft",
  author: "admin",
  created: "2025-01-15T10:30:00Z",
  updated: "2025-01-15T10:30:00Z"
};

const valid = validate(frontmatter);
if (!valid) {
  console.error(validate.errors);
}
```

#### Example: Python with jsonschema

```python
import json
import jsonschema
from jsonschema import validate

with open('record-base-schema.json') as f:
    schema = json.load(f)

frontmatter = {
    "id": "record-123",
    "title": "Test Record",
    "type": "bylaw",
    "status": "draft",
    "author": "admin",
    "created": "2025-01-15T10:30:00Z",
    "updated": "2025-01-15T10:30:00Z"
}

try:
    validate(instance=frontmatter, schema=schema)
    print("Valid!")
except jsonschema.exceptions.ValidationError as e:
    print(f"Validation error: {e.message}")
```

### Dynamic Enums

**Note**: The `type` and `status` fields are defined as strings in the schema, but their valid values are loaded dynamically from configuration:

- **Record Types**: Loaded from `CentralConfigManager.getRecordTypesConfig()`
- **Record Statuses**: Loaded from `CentralConfigManager.getRecordStatusesConfig()`

When using this schema externally, you should:
1. Load valid types/statuses from your configuration
2. Add `enum` constraints to the schema before validation, OR
3. Validate types/statuses separately after schema validation

### Compliance Fields

The schema includes all compliance fields from the standard:
- Legal/Government metadata (document_number, legal_authority, jurisdiction, etc.)
- Records Management (ISO 15489) fields (retention_schedule, classification, etc.)
- Public Records/FOIA compliance fields (public_access, redaction, etc.)
- Accessibility metadata (WCAG compliance, alternative formats)
- Dublin Core metadata (subject, coverage, rights)
- Audit Trail fields (approval_chain, change_history)

All compliance fields are **optional** - records remain valid without them.

### External Use

This schema is designed to be used by external tools (e.g., document extraction systems) to validate records before importing them into CivicPress.

**For your document extraction project:**
1. Parse scanned documents to extract metadata
2. Convert to JSON format matching this schema
3. Validate against this schema
4. Generate markdown files with validated frontmatter

### Schema Version

- **Version**: 1.1.0
- **Last Updated**: November 2025
- **Standard Reference**: `docs/record-format-standard.md` v1.1.0

