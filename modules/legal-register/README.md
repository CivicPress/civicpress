# CivicPress Legal-Register Module

The Legal-Register module extends CivicPress core record types with legal-specific validation and features.

## Architecture

**Important**: This module extends core record types, it does not replace them.

- **Core Record Types**: `bylaw`, `ordinance`, `policy`, `proclamation`, `resolution` are defined in core
- **Module Extension**: Legal-register adds legal-specific validation rules and recommended fields
- **Schema Extension**: Located at `modules/legal-register/schemas/record-schema-extension.json`

## Schema Extension

The legal-register module provides a JSON Schema extension that:

1. **Extends metadata validation** for legal document types
2. **Recommends legal-specific fields** like `document_number`, `legal_authority`, `jurisdiction`
3. **Validates legal compliance fields** like approval chains, change history, retention schedules

## Usage

The schema extension is automatically loaded when:
- A record type is `bylaw`, `ordinance`, `policy`, `proclamation`, or `resolution`
- The `legal-register` module is enabled in `config.yml` (under `modules`)

## Schema Location

```
modules/legal-register/schemas/record-schema-extension.json
```

## Validation

When validating a legal document type, the system:
1. Loads the base schema
2. Loads type-specific schema (if any)
3. **Loads legal-register extension** (for legal document types)
4. Merges all schemas using JSON Schema `allOf` pattern

## Example

A bylaw record automatically gets legal-register validation:

```yaml
---
type: bylaw
metadata:
  document_number: "BYL-2024-001"  # Validated by legal-register schema
  legal_authority: "Municipal Act, Section 15"
  jurisdiction: "municipal"
---
```

## Development

To extend the legal-register schema:

1. Edit `modules/legal-register/schemas/record-schema-extension.json`
2. Follow JSON Schema draft-07 format
3. Use `allOf` pattern for conditional validation
4. Test with `civic validate` command
