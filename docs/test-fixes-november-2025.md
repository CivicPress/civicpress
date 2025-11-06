# Test Suite Fixes - November 2025

## Overview

Comprehensive fixes to the test suite following record format standardization
and schema validation implementation. All 596 tests now passing (100% success
rate).

## Issues Fixed

### 1. Schema ID Collision

**Problem**: AJV was caching schemas by `$id`, causing "schema with key or id
already exists" errors when the same schema was compiled multiple times.

**Solution**:

- Recursively remove `$id` from all schemas before validation
- Create fresh AJV instances when collision detected
- Handle collision errors gracefully with retry logic

**Files Modified**:

- `core/src/records/record-schema-validator.ts`: Added `removeSchemaIds()`
  method and collision handling

### 2. Additional Properties Validation

**Problem**: Schema validation failing with "must NOT have additional
properties" when merging base and extension schemas using `allOf`.

**Solution**:

- Set `additionalProperties: true` at root level of all schemas (base,
  type-specific, module extensions)
- Allows proper schema composition without validation conflicts

**Files Modified**:

- `core/src/schemas/record-base-schema.json`
- `core/src/schemas/record-type-schemas/geography-schema.json`
- `core/src/schemas/record-type-schemas/session-schema.json`
- `modules/legal-register/schemas/record-schema-extension.json`

### 3. Source Field Type Normalization

**Problem**: Database stored `source` as string (old format), but schema
requires object. Validation failing during sync operations.

**Solution**:

- Normalize `source` field in `getRecord()` when reading from database
- Normalize in `updateRecord()` before validation
- Normalize in `createRecordFile()` and `updateRecordFile()` before markdown
  creation
- Normalize in `normalizeFrontmatterForValidation()` for schema validation
- Handle `source` in metadata (extract to top-level, remove from metadata)

**Files Modified**:

- `core/src/records/record-manager.ts`: Multiple normalization points
- `core/src/records/record-parser.ts`: Added date normalization

### 4. Date Object Normalization

**Problem**: `gray-matter` parses ISO 8601 dates as `Date` objects, but schema
expects strings.

**Solution**:

- Convert `Date` objects to ISO strings in `normalizeFormat()` before schema
  validation
- Normalize dates in `normalizeFrontmatterForValidation()` as well

**Files Modified**:

- `core/src/records/record-parser.ts`: Date normalization in `normalizeFormat()`
- `core/src/records/record-manager.ts`: Date normalization in
  `normalizeFrontmatterForValidation()`

### 5. Test Fixture Updates

**Problem**: Test fixtures had outdated formats, invalid statuses, and incorrect
file paths.

**Solution**:

- Updated all test records to new standardized format
- Changed invalid status `adopted` to valid `approved`
- Fixed file path duplication (`records/records/` → `records/`)
- Removed invalid `attachments` field (not in schema)
- Updated test expectations to match new format

**Files Modified**:

- `tests/fixtures/test-setup.ts`: Updated sample records and file paths
- `tests/api/records.test.ts`: Changed invalid type test to use valid
  `geography` type
- `tests/cli/sync.test.ts`: Updated status from `adopted` to `approved`

## Test Results

### Before Fixes

- **24 failing tests** related to record format and schema validation
- Schema ID collisions preventing record parsing
- Source field type mismatches
- Date object validation failures

### After Fixes

- **596 tests passing** (100% success rate)
- **22 tests skipped** (intentional, environment-specific)
- **0 failing tests**

### Test Categories

- ✅ API Records Integration: 18/18 passing
- ✅ CLI Sync Commands: 12/12 passing
- ✅ Core Record Management: All passing
- ✅ Schema Validation: All passing
- ✅ Record Parser: All passing

## Technical Details

### Schema Validation Architecture

- **Base Schema**: Core fields, compliance metadata, commit linkage, extensions
- **Type Extensions**: Geography, session-specific fields
- **Module Extensions**: Legal-register module fields
- **Dynamic Composition**: Schemas merged at runtime using `allOf`
- **Validation**: AJV with format validators (date-time, email, uri)

### Normalization Pipeline

1. **Database → RecordData**: Normalize source (string → object), extract from
   metadata
2. **RecordData → Markdown**: Normalize source before serialization
3. **Markdown → Frontmatter**: Parse with `gray-matter`, normalize dates (Date →
   ISO string)
4. **Frontmatter → Validation**: Normalize dates and source before schema
   validation

### Error Handling

- Graceful degradation: Schema validation errors don't crash the system
- Comprehensive error messages: Field-level validation errors with clear
  messages
- Retry logic: Schema ID collisions automatically handled with fresh AJV
  instances

## Files Changed

### Core

- `core/src/records/record-manager.ts`: Source normalization, date normalization
- `core/src/records/record-parser.ts`: Date normalization in `normalizeFormat()`
- `core/src/records/record-schema-validator.ts`: Schema ID collision handling
- `core/src/schemas/record-base-schema.json`: `additionalProperties: true`
- `core/src/schemas/record-type-schemas/*.json`: `additionalProperties: true`

### Tests

- `tests/fixtures/test-setup.ts`: Updated sample records, fixed file paths
- `tests/api/records.test.ts`: Fixed invalid type test
- `tests/cli/sync.test.ts`: Fixed status filter test

### Documentation

- `docs/record-format-standard.md`: Updated with commit linkage and extensions
- `docs/schema-validation-guide.md`: Updated with new fields
- `docs/api.md`: Updated record response examples

## Lessons Learned

1. **Schema Composition**: When using `allOf` for schema merging, all schemas
   must allow additional properties
2. **Date Parsing**: Always normalize Date objects to strings before schema
   validation
3. **Field Migration**: When changing field types (string → object), normalize
   at all entry points
4. **Test Data**: Keep test fixtures in sync with schema changes
5. **AJV Caching**: Schema IDs can cause collisions; remove them or use fresh
   instances

## Next Steps

- ✅ All tests passing
- ✅ Schema validation working correctly
- ✅ Record format standardized
- ✅ Documentation updated

The test suite is now stable and ready for continued development.
