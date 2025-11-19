# 🔍 Schema Validation Guide

**Version**: 1.0.0  
**Status**: Official Documentation  
**Last Updated**: January 2025

## 🎯 Overview

CivicPress uses **JSON Schema** (draft-07) to validate record frontmatter,
ensuring data integrity and consistency across all record types. This guide
explains how schema validation works, how to use it, and how to extend it.

## 📋 Table of Contents

1. [How It Works](#-how-it-works)
2. [Validation Layers](#-validation-layers)
3. [Using Validation](#️-using-validation)
4. [Schema Composition](#-schema-composition)
5. [Extending Schemas](#-extending-schemas)
6. [Error Messages](#-error-messages)
7. [Troubleshooting](#-troubleshooting)

---

## 🔧 How It Works

### Architecture

The schema validation system consists of three main components:

1. **RecordSchemaBuilder**: Builds dynamic schemas from base + config +
   modules + plugins
2. **RecordSchemaValidator**: Validates frontmatter against JSON Schema using
   `ajv`
3. **RecordValidator**: Integrates schema validation with business rule
   validation

### Validation Flow

```
Markdown File
    ↓
Extract Frontmatter (YAML → JSON)
    ↓
Schema Validation (JSON Schema)
    ├─ Base Schema (required fields, types)
    ├─ Type Extension (geography, session)
    ├─ Module Extension (legal-register)
    └─ Plugin Extensions (runtime-registered)
    ↓
Business Rule Validation
    ├─ Field relationships
    ├─ Compliance fields
    └─ Custom logic
    ↓
Validation Result (errors, warnings, info)
```

---

## 📊 Validation Layers

### Layer 1: Schema Validation (JSON Schema)

**Purpose**: Validate structure, types, formats, and enums

**Validates**:

- Required fields (id, title, type, status, author, created, updated)
- Data types (string, number, boolean, array, object)
- Formats (date-time, email, uri)
- Patterns (document numbers, language codes)
- Enums (type values, status values - loaded from config)

**Tools**: `RecordSchemaValidator.validate()`

### Layer 2: Business Rule Validation

**Purpose**: Validate relationships, business logic, compliance

**Validates**:

- Cross-field relationships (created ≤ updated)
- Compliance fields (ISO 639-1 language codes, retention schedules)
- Business rules (document number uniqueness, approval chains)

**Tools**: `RecordValidator.validateRecord()`

### Layer 3: Content Validation (Future)

**Purpose**: Validate markdown content structure

**Status**: Planned for future implementation

---

## 🛠️ Using Validation

### CLI Validation

Validate a single record:

```bash
civic validate records/bylaw/noise-restrictions.md
```

Validate all records:

```bash
civic validate --all
```

Strict mode (treat warnings as errors):

```bash
civic validate --all --strict
```

JSON output:

```bash
civic validate --all --json
```

### API Validation

Validate a record:

```bash
POST /api/v1/validation/record
Content-Type: application/json

{
  "recordId": "record-1234567890",
  "type": "bylaw"
}
```

Bulk validation:

```bash
POST /api/v1/validation/bulk
Content-Type: application/json

{
  "recordIds": ["record-1", "record-2"],
  "types": ["bylaw", "policy"]
}
```

Get validation status:

```bash
GET /api/v1/validation/status?type=bylaw&severity=error&limit=50
```

### Automatic Validation

Records are automatically validated:

- **Before saving**: `RecordManager.createRecord()`,
  `RecordManager.updateRecord()`
- **During parsing**: `RecordParser.parseFromMarkdown()` (fail fast)
- **During validation**: `RecordValidator.validateRecord()` (schema first, then
  business rules)

---

## 🧩 Schema Composition

Schemas are composed dynamically at runtime:

### 1. Base Schema

**Location**: `core/src/schemas/record-base-schema.json`

**Contains**:

- All required fields (id, title, type, status, author, created, updated)
- Standard optional fields (tags, slug, version, priority, department)
- Source & origin fields
- Relationships (linked_records, linked_geography_files)
- File attachments (attached_files)
- Spatial data (geography)
- Compliance metadata (all compliance fields)

### 2. Dynamic Enums

**Source**: Configuration files (`data/.civic/config.yml`)

**Injected**:

- `type` enum: Valid record types from `record_types_config`
- `status` enum: Valid status values from `record_statuses_config`

**Benefit**: New types/statuses can be added via config without code changes

### 3. Type-Specific Extensions

**Location**: `core/src/schemas/record-type-schemas/{type}-schema.json`

**Examples**:

- `geography-schema.json`: Validates `geography_data`, `category`
- `session-schema.json`: Validates `session_type`, `date`, `duration`,
  `location`, `attendees`, `topics`, `media`

**Applied**: Only when `record.type` matches the schema type

### 4. Module Extensions

**Location**: `modules/{module}/schemas/record-schema-extension.json`

**Example**: `modules/legal-register/schemas/record-schema-extension.json`

**Applied**: When:

- Module is enabled in `config.yml` (`modules: ['legal-register']`)
- Record type matches module's applicable types (legal-register applies to
  bylaw, ordinance, policy, proclamation, resolution)

### 5. Plugin Extensions

**Registration**: Runtime via `RecordSchemaBuilder.registerPluginSchema()`

**Applied**: When plugin's `appliesTo()` function returns `true` for the record
type

**Example**:

```typescript
RecordSchemaBuilder.registerPluginSchema(
  'custom-plugin',
  customSchema,
  (recordType) => recordType === 'custom-type'
);
```

### Composition Order

Schemas are merged in this order (using JSON Schema `allOf`):

1. Base schema
2. Dynamic enums (injected)
3. Type-specific extension (if applicable)
4. Module extension (if applicable)
5. Plugin extensions (if any registered)

---

## 🔌 Extending Schemas

### Adding a Type-Specific Schema

1. Create schema file: `core/src/schemas/record-type-schemas/{type}-schema.json`
2. Define properties for type-specific fields
3. Schema is automatically loaded when `record.type === '{type}'`

**Example**: `core/src/schemas/record-type-schemas/custom-type-schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "custom_field": {
      "type": "string",
      "description": "Custom field for this record type"
    }
  },
  "additionalProperties": false
}
```

### Adding a Module Schema Extension

1. Create module directory: `modules/{module-name}/schemas/`
2. Create schema file:
   `modules/{module-name}/schemas/record-schema-extension.json`
3. Enable module in `config.yml`: `modules: ['{module-name}']`
4. Update `RecordSchemaBuilder.shouldApplyModuleSchema()` to define which record
   types the module applies to

**Example**: See `modules/legal-register/schemas/record-schema-extension.json`

### Registering a Plugin Schema (Overview)

```typescript
import { RecordSchemaBuilder } from '@civicpress/core';

const pluginSchema = {
  type: 'object',
  properties: {
    metadata: {
      properties: {
        custom_field: {
          type: 'string',
          minLength: 1
        }
      }
    }
  }
};

RecordSchemaBuilder.registerPluginSchema(
  'my-plugin',
  pluginSchema,
  (recordType) => recordType === 'bylaw' // Only apply to bylaws
);
```

### Unregistering a Plugin Schema

```typescript
RecordSchemaBuilder.unregisterPluginSchema('my-plugin');
```

---

## ❌ Error Messages

Schema validation provides clear, actionable error messages:

### Error Format

```json
{
  "severity": "error",
  "code": "SCHEMA_VALIDATION_ERROR",
  "message": "Missing required field: author",
  "field": "author",
  "suggestion": "Add the \"author\" field to the frontmatter"
}
```

### Common Error Codes

- `SCHEMA_VALIDATION_ERROR`: General schema validation error
- `MISSING_REQUIRED_FIELD`: Required field is missing
- `INVALID_TYPE`: Field has wrong data type
- `INVALID_ENUM`: Field value not in allowed enum
- `INVALID_FORMAT`: Field format is invalid (e.g., date-time, email)
- `INVALID_PATTERN`: Field doesn't match required pattern
- `COMPLIANCE_VALIDATION_ERROR`: Compliance field validation failed

### Error Examples

**Missing Required Field**:

```
Field "author": Missing required field: author
💡 Add the "author" field to the frontmatter
```

**Invalid Format**:

```
Field "created": Field "created" must be a valid date-time
💡 Use ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ (e.g., "2025-01-15T10:30:00Z")
```

**Invalid Enum**:

```
Field "status": Field "status" must be one of: draft, pending_review, approved, published
💡 Choose one of the allowed values: draft, pending_review, approved, published
```

---

## 🔧 Troubleshooting

### Schema Not Loading

**Problem**: Module schema not being applied

**Solutions**:

1. Check module is enabled in `config.yml`: `modules: ['legal-register']`
2. Verify schema file exists:
   `modules/{module}/schemas/record-schema-extension.json`
3. Check `shouldApplyModuleSchema()` logic in `RecordSchemaBuilder`
4. Clear schema cache: `RecordSchemaBuilder.clearCache()`

### Validation Errors on Valid Records

**Problem**: Record appears valid but fails schema validation

**Solutions**:

1. Check for typos in field names (case-sensitive)
2. Verify date formats are ISO 8601: `YYYY-MM-DDTHH:mm:ssZ`
3. Check enum values match config (type, status)
4. Verify nested objects match schema structure
5. Use `civic validate --all` to see all errors

### Plugin Schema Not Applied

**Problem**: Registered plugin schema not being used

**Solutions**:

1. Verify `appliesTo()` function returns `true` for the record type
2. Check schema is registered before validation
3. Clear schema cache after registration
4. Verify `includePluginExtensions` option is not `false`

### Performance Issues

**Problem**: Validation is slow

**Solutions**:

1. Schema caching is automatic (schemas are cached after first build)
2. Check cache stats: `RecordSchemaBuilder.getCacheStats()`
3. Clear cache if config changes: `RecordSchemaBuilder.clearCache()`
4. Consider disabling type/module extensions if not needed

### CLI Serialization Bug _(tracked)_

**Problem**: Running `civic validate <record>` against a record outside the
`data/records/` directory reports schema errors such as “Field `date` must be of
type string, got object,” even though the frontmatter already contains ISO 8601
strings.

**Root Cause**: `RecordParser.parseFromMarkdown()` returns the correct strings,
but the CLI’s `validateRecord()` helper re-serializes the `RecordData` back to
markdown before calling `RecordSchemaValidator.validate()`. During that round
trip, `gray-matter` converts ISO timestamps into `Date` objects, so Ajv sees an
object instead of the original string.

**Workaround**:

1. Copy the file into `data/records/` before validation so the CLI reads it
   directly without the extra serialization step; **or**
2. Use `RecordSchemaValidator.validate(matter(content).data, type)` directly in
   scripts and tests until the CLI bug is fixed.

**Next Step**: Patch `cli/src/commands/validate.ts` so it validates the original
frontmatter object rather than re-serializing the parsed record.

---

## 📚 Related Documentation

- [Record Format Standard](./record-format-standard.md) - Complete field
  definitions
- [API Documentation](./api.md) - API validation endpoints
- [Configuration Architecture](./configuration-architecture.md) - Config-driven
  validation

---

## 🎓 Examples

### Validating a Record (Node.js)

```typescript
import { RecordSchemaValidator, RecordParser } from '@civicpress/core';
import { readFileSync } from 'fs';

const content = readFileSync('records/bylaw/noise-restrictions.md', 'utf-8');
const { data: frontmatter } = matter(content);

const result = RecordSchemaValidator.validate(
  frontmatter,
  'bylaw',
  {
    includeModuleExtensions: true,
    includeTypeExtensions: true,
  }
);

if (!result.isValid) {
  console.error('Validation errors:');
  result.errors.forEach(err => {
    console.error(`  ${err.field}: ${err.message}`);
  });
}
```

### Registering a Plugin Schema (Example)

```typescript
import { RecordSchemaBuilder } from '@civicpress/core';

// Define plugin schema
const myPluginSchema = {
  type: 'object',
  properties: {
    metadata: {
      properties: {
        custom_metadata: {
          type: 'object',
          properties: {
            custom_field: {
              type: 'string',
              minLength: 1
            }
          }
        }
      }
    }
  }
};

// Register plugin
RecordSchemaBuilder.registerPluginSchema(
  'my-custom-plugin',
  myPluginSchema,
  (recordType) => ['bylaw', 'policy'].includes(recordType)
);

// Now all bylaw and policy records will be validated with this schema
```

---

**Note**: This guide covers schema validation for frontmatter only. Content
validation will be implemented separately in the future.

### New Fields (v1.2.0)

The schema includes the following new optional fields:

- **Commit Linkage Fields** (top-level):
  - `commit_ref` (string) - Git commit SHA, populated during export/archive
    operations
  - `commit_signature` (string) - Cryptographic signature reference, populated
    during export/archive operations

- **Extensions Object** (inside `metadata`):
  - `metadata.extensions` (object) - Reserved for future optional fields and
    experimental extensions
  - Completely open structure (`additionalProperties: true`) for flexibility

These fields are optional and do not affect normal record operations. See
`docs/record-format-standard.md` for complete field documentation.
