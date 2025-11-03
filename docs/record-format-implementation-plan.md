# 🔧 Record Format Standard - Implementation Plan

**Version**: 1.0.0  
**Status**: Planning  
**Related**: [Record Format Standard](./record-format-standard.md)

## 🎯 Overview

This document outlines all code changes needed to implement the standardized record format across the CivicPress platform. The goal is to normalize and standardize record formats while maintaining backward compatibility during transition.

## 📋 Implementation Phases

### Phase 1: Core Infrastructure
### Phase 2: Record Reading/Parsing
### Phase 3: Record Writing/Serialization
### Phase 4: Validation & Migration
### Phase 5: UI & API Updates
### Phase 6: Documentation & Testing

---

## 🔨 Phase 1: Core Infrastructure

### 1.1 Update Type Definitions

**Files to Update:**
- `core/src/records/record-manager.ts` - `RecordData` interface
- `core/src/civic-core.ts` - `CreateRecordRequest`, `UpdateRecordRequest`
- `modules/ui/app/stores/records.ts` - `CivicRecord` interface

**Changes Needed:**
- Add `authors` array field (optional)
- Standardize timestamp field names (`created`, `updated` in frontmatter)
- Ensure all optional fields are properly typed
- Add support for `geography` and `session` record types

**Key Updates:**
```typescript
export interface RecordData {
  id: string;
  title: string;
  type: string;
  status: string;
  content?: string;
  
  // Authorship - support both formats
  author: string;  // Required: primary author username
  authors?: Array<{  // Optional: detailed author info
    name: string;
    username: string;
    role?: string;
    email?: string;
  }>;
  
  // Timestamps - use ISO 8601
  created_at: string;  // Internal (database)
  updated_at: string;  // Internal (database)
  // Note: Frontmatter uses 'created' and 'updated'
  
  // Source & Origin - for imported/legacy documents
  source?: {
    reference: string;  // Required: Original document identifier/reference
    original_title?: string;  // Optional: Original title from source system
    original_filename?: string;  // Optional: Original filename from source system
    url?: string;  // Optional: Link to original document
    type?: 'legacy' | 'import' | 'external';  // Optional: Source type
    imported_at?: string;  // Optional: ISO 8601 import timestamp
    imported_by?: string;  // Optional: Username who imported it
  };
  
  // ... rest of fields
}
```

### 1.2 Add New Record Types

**Files to Update:**
- `core/src/config/record-types.ts` - Add `geography` and `session`
- `core/src/defaults/config.yml` - Add new record types
- `modules/api/src/routes/system.ts` - Update record types endpoint

**New Record Types:**
```typescript
export const DEFAULT_RECORD_TYPES: RecordTypesConfig = {
  // ... existing types
  geography: {
    label: 'Geography',
    description: 'Geographic data files (GeoJSON/KML)',
    source: 'core',
    priority: 6,
  },
  session: {
    label: 'Session',
    description: 'Meeting sessions and minutes',
    source: 'core',
    priority: 7,
  },
};
```

### 1.3 Create Record Parser Utility

**New File:**
- `core/src/records/record-parser.ts`

**Purpose:**
- Parse markdown files with standardized format
- Handle backward compatibility with old formats
- Convert old formats to new format on read
- Validate frontmatter structure

**Key Functions:**
```typescript
export class RecordParser {
  // Parse markdown file to RecordData
  static parseFromMarkdown(content: string, filePath?: string): RecordData;
  
  // Serialize RecordData to markdown
  static serializeToMarkdown(record: RecordData): string;
  
  // Normalize old format to new format
  static normalizeFormat(metadata: any): RecordData;
  
  // Validate frontmatter structure
  static validateFrontmatter(frontmatter: any): ValidationResult;
}
```

---

## 📖 Phase 2: Record Reading/Parsing

### 2.1 Update RecordManager.getRecord()

**File:** `core/src/records/record-manager.ts`

**Current Issues:**
- Uses regex to extract frontmatter (line-by-line parsing for geography)
- Doesn't use proper YAML parser for all fields
- Hardcoded field extraction logic

**Changes Needed:**
- Replace regex-based parsing with proper YAML parser (gray-matter or js-yaml)
- Use RecordParser utility for consistent parsing
- Handle both old and new formats during transition
- Parse `authors` array if present
- Normalize `created`/`updated` to `created_at`/`updated_at`

**Implementation:**
```typescript
async getRecord(id: string): Promise<RecordData | null> {
  const record = await this.db.getRecord(id);
  if (!record) return null;
  
  // Try to read from markdown file (source of truth)
  if (record.path) {
    try {
      const filePath = path.join(this.dataDir, record.path);
      const fileContent = await fs.readFile(filePath, 'utf8');
      
      // Use RecordParser for consistent parsing
      const parsedRecord = RecordParser.parseFromMarkdown(fileContent, record.path);
      
      // Merge with database record (database has latest sync info)
      return { ...record, ...parsedRecord };
    } catch (error) {
      logger.warn(`Failed to read record file: ${error}`);
      // Fall back to database record
    }
  }
  
  return record;
}
```

### 2.2 Update IndexingService.extractRecordMetadata()

**File:** `core/src/indexing/indexing-service.ts`

**Current Issues:**
- Uses custom YAML parsing
- May not extract all fields properly
- Doesn't handle new format fields

**Changes Needed:**
- Use RecordParser for consistent extraction
- Extract `authors` array
- Handle new record types (geography, session)
- Normalize date formats

### 2.3 Update CLI Validation

**File:** `cli/src/commands/validate.ts`

**Changes Needed:**
- Use RecordParser for validation
- Validate against new format standard
- Report format inconsistencies
- Suggest format migrations

### 2.4 Update CLI Import

**File:** `cli/src/commands/import.ts`

**Changes Needed:**
- Parse imported files with RecordParser
- Normalize imported records to new format
- Support importing both old and new formats

### 2.5 Update CLI Search

**File:** `cli/src/commands/search.ts`

**Changes Needed:**
- Use RecordParser for metadata extraction
- Handle new format fields in search
- Support searching by new fields (authors, tags, etc.)

---

## ✍️ Phase 3: Record Writing/Serialization

### 3.1 Update RecordManager.createMarkdownContent()

**File:** `core/src/records/record-manager.ts`

**Current Issues:**
- Uses manual string building for YAML
- Doesn't follow standardized field ordering
- Doesn't include section comments
- JSON.stringify for complex objects (not proper YAML)

**Changes Needed:**
- Replace with RecordParser.serializeToMarkdown()
- Use proper YAML library (js-yaml) with formatting
- Include section comments for human readability
- Follow logical field ordering from standard
- Use proper YAML formatting (not JSON.stringify)

**Implementation:**
```typescript
private createMarkdownContent(record: RecordData): string {
  return RecordParser.serializeToMarkdown(record);
}
```

### 3.2 Create RecordParser.serializeToMarkdown()

**File:** `core/src/records/record-parser.ts` (new)

**Requirements:**
- Generate YAML frontmatter with proper formatting
- Include section comments for organization
- Use logical field ordering
- Handle all field types correctly (arrays, objects, dates)
- Format ISO 8601 timestamps consistently
- Support both `author` (string) and `authors` (array)

**Key Logic:**
```typescript
static serializeToMarkdown(record: RecordData): string {
  const frontmatter: any = {};
  
  // Core Identification
  frontmatter.id = record.id;
  frontmatter.title = record.title;
  frontmatter.type = record.type;
  frontmatter.status = record.status;
  
  // Authorship
  frontmatter.author = record.author;
  if (record.authors && record.authors.length > 0) {
    frontmatter.authors = record.authors;
  }
  
  // Timestamps (convert internal to frontmatter format)
  frontmatter.created = record.created_at || record.created;
  frontmatter.updated = record.updated_at || record.updated;
  
  // ... continue with all fields in logical order
  
  // Generate YAML with comments and proper formatting
  const yamlContent = this.generateYamlWithComments(frontmatter);
  
  return `---\n${yamlContent}---\n\n${record.content || ''}`;
}
```

### 3.3 Update CLI Create Command

**File:** `cli/src/commands/create.ts`

**Changes Needed:**
- Use RecordParser for markdown generation
- Follow new format standard
- Include proper field ordering and comments

### 3.4 Update CLI Export Command

**File:** `cli/src/commands/export.ts`

**Changes Needed:**
- Export in new standard format
- Use RecordParser for consistent formatting
- Support exporting old format for compatibility

---

## ✅ Phase 4: Validation & Migration

### 4.1 Create Validation Service

**New File:** `core/src/records/record-validator.ts`

**Purpose:**
- Validate records against new format standard
- Check required fields
- Validate field types and formats
- Verify ISO 8601 timestamps
- Check status and type values

**Key Functions:**
```typescript
export class RecordValidator {
  static validateRequiredFields(frontmatter: any): ValidationError[];
  static validateFieldTypes(frontmatter: any): ValidationError[];
  static validateTimestamps(frontmatter: any): ValidationError[];
  static validateStatus(frontmatter: any): ValidationError[];
  static validateType(frontmatter: any): ValidationError[];
  static validateComplete(record: RecordData): ValidationResult;
}
```

### 4.2 Create Migration Utility

**New File:** `core/src/records/record-migrator.ts`

**Purpose:**
- Convert old format records to new format
- Normalize date formats
- Convert author formats
- Move custom fields to metadata
- Handle backward compatibility

**Key Functions:**
```typescript
export class RecordMigrator {
  static migrateFromOldFormat(record: any): RecordData;
  static normalizeDates(record: any): RecordData;
  static normalizeAuthor(record: any): RecordData;
  static normalizeMetadata(record: any): RecordData;
  static migrateRecordFile(filePath: string): MigrationResult;
  static migrateAllRecords(dataDir: string): MigrationReport;
}
```

### 4.3 Add CLI Migration Command

**New File:** `cli/src/commands/migrate.ts`

**Purpose:**
- Batch migrate existing records to new format
- Validate migration results
- Create backup before migration
- Report migration statistics

### 4.4 Update API Validation Endpoint

**File:** `modules/api/src/routes/validation.ts`

**Changes Needed:**
- Use RecordValidator for validation
- Validate against new format standard
- Report format inconsistencies
- Suggest format improvements

---

## 🖥️ Phase 5: UI & API Updates

### 5.1 Update UI Record Interfaces

**Files:**
- `modules/ui/app/stores/records.ts`
- `modules/ui/app/components/RecordForm.vue`
- `modules/ui/app/pages/records/[type]/[id]/index.vue`

**Changes Needed:**
- Update `CivicRecord` interface to match new format
- Support `authors` array in forms
- Display author information properly
- Handle new record types (geography, session)
- Format timestamps consistently (ISO 8601)

### 5.2 Update API Record Endpoints

**Files:**
- `modules/api/src/routes/records.ts`
- `modules/api/src/services/records-service.ts`

**Changes Needed:**
- Ensure API responses match new format
- Parse records using RecordParser
- Serialize records using RecordParser
- Handle new fields in create/update operations

### 5.3 Update Record Types API

**File:** `modules/api/src/routes/system.ts`

**Changes Needed:**
- Add `geography` and `session` to record types list
- Update field lists for new format
- Include validation rules for new format

### 5.4 Update Templates

**Files:**
- `core/src/defaults/templates/*/default.md`

**Changes Needed:**
- Update all templates to use new format
- Include proper field ordering
- Add section comments
- Use ISO 8601 timestamps
- Support `authors` array

---

## 📚 Phase 6: Documentation

### 6.1 Update Documentation

**Files to Update:**
- All existing docs that reference record format
- Update examples to use new format
- Add migration guides
- Document backward compatibility

---

## 🧪 Phase 7: Test Suite Updates

### 7.1 Update Test Fixtures

**Files to Update:**
- `tests/fixtures/*.md` - All record fixture files
- Update to use new standardized format
- Ensure all fixtures include required fields
- Use ISO 8601 timestamps
- Include proper field ordering

**Key Updates:**
- Convert date formats to ISO 8601
- Normalize author formats
- Add `id` fields if missing
- Standardize `status` values
- Add section comments for readability
- Ensure proper field ordering

### 7.2 Update Core Tests

**Files to Update:**
- `tests/core/record-manager.test.ts`
- `tests/core/indexing-service.test.ts`
- Any other core record-related tests

**Changes Needed:**
- Update expected data structures to match new format
- Test new fields (`authors`, `source`)
- Test new record types (`geography`, `session`)
- Test field name conversion (`created` ↔ `created_at`)
- Test backward compatibility with old format
- Update assertions to match new interface

### 7.3 Update CLI Tests

**Files to Update:**
- `tests/cli/create.test.ts`
- `tests/cli/import.test.ts`
- `tests/cli/export.test.ts`
- `tests/cli/validate.test.ts`
- `tests/cli/search.test.ts`

**Changes Needed:**
- Test new format in all commands
- Test CLI output matches new format
- Test validation against new standard
- Test import/export of new format
- Test backward compatibility

### 7.4 Update API Tests

**Files to Update:**
- `tests/api/records.test.ts`
- `tests/api/validation.test.ts`
- Any other API record-related tests

**Changes Needed:**
- Test API request/response with new fields
- Test create/update operations with new format
- Test validation endpoint with new standard
- Test new record types in API
- Update expected responses

### 7.5 Update UI Tests

**Files to Update:**
- `tests/ui/*.test.ts` - All UI tests referencing records

**Changes Needed:**
- Test UI components with new format
- Test form handling of new fields
- Test display of new fields
- Test new record types in UI
- Update mock data to match new format

### 7.6 Create New Test Files

**New Test Files:**
- `tests/core/record-parser.test.ts` - Comprehensive parser tests
- `tests/core/record-validator.test.ts` - Validation logic tests
- `tests/core/record-migrator.test.ts` - Migration utility tests
- `tests/core/record-format-standard.test.ts` - Format conformance tests

**Test Coverage Required:**
- Parse old format records → new format
- Parse new format records correctly
- Serialize RecordData to new format
- Validate required fields (id, title, type, status, author, created, updated)
- Validate field types (string, array, object, ISO 8601 dates)
- Validate status values against approved list
- Validate type values include new types
- Migrate old to new format (all field conversions)
- Backward compatibility (read old, write new)
- Edge cases (missing fields, invalid dates, malformed YAML)
- Error handling (invalid files, missing required fields)

### 7.7 Test Execution & Validation

**Tasks:**
- Run full test suite after Phase 1-6 completion
- Fix all failing tests
- Ensure 100% test coverage for new format logic
- Validate all test fixtures match new format
- Document any test changes made

**Success Criteria:**
- ✅ All existing tests pass or are updated appropriately
- ✅ All new format tests pass
- ✅ Test coverage maintained or improved
- ✅ No regressions introduced
- ✅ All test fixtures use new format

---

## 📊 Detailed File Change List

### Core Module (`core/src/`)

**New Files:**
- `records/record-parser.ts` - Record parsing/serialization
- `records/record-validator.ts` - Format validation
- `records/record-migrator.ts` - Format migration

**Modified Files:**
- `records/record-manager.ts` - Use RecordParser, update getRecord()
- `indexing/indexing-service.ts` - Use RecordParser for metadata extraction
- `config/record-types.ts` - Add geography and session types
- `civic-core.ts` - Update interfaces for new format
- `defaults/config.yml` - Add new record types
- `defaults/templates/*/default.md` - Update all templates

### CLI Module (`cli/src/`)

**New Files:**
- `commands/migrate.ts` - Migration command

**Modified Files:**
- `commands/validate.ts` - Use RecordValidator
- `commands/import.ts` - Use RecordParser
- `commands/export.ts` - Use RecordParser
- `commands/create.ts` - Use RecordParser
- `commands/search.ts` - Use RecordParser

### API Module (`modules/api/src/`)

**Modified Files:**
- `routes/records.ts` - Use RecordParser
- `routes/validation.ts` - Use RecordValidator
- `routes/system.ts` - Add new record types
- `services/records-service.ts` - Use RecordParser

### UI Module (`modules/ui/app/`)

**Modified Files:**
- `stores/records.ts` - Update CivicRecord interface
- `components/RecordForm.vue` - Support new format fields
- `pages/records/[type]/[id]/index.vue` - Display new format
- `composables/useRecordTypes.ts` - Handle new record types

### Tests (`tests/`)

**New Files:**
- `core/record-parser.test.ts`
- `core/record-validator.test.ts`
- `core/record-migrator.test.ts`
- `core/record-format-standard.test.ts`

**Modified Files:**
- All existing record tests
- Test fixtures

### Documentation (`docs/`)

**New Files:**
- `record-format-standard.md` ✅ (Already created)
- `record-format-implementation-plan.md` ✅ (This file)
- `record-format-migration-guide.md` (To be created)

**Modified Files:**
- Update all docs referencing record format
- Update examples

---

## 🔄 Migration Strategy

### Backward Compatibility

1. **Read Old Format**: Parser should handle old formats gracefully
2. **Convert on Read**: Automatically normalize old format to new format when reading
3. **Write New Format**: Always write in new format
4. **Validation Warnings**: Warn about old format but don't fail

### Migration Steps

1. **Phase 1**: Update code to read both formats
2. **Phase 2**: Update code to write new format
3. **Phase 3**: Provide migration tool
4. **Phase 4**: Validate all records
5. **Phase 5**: Optionally migrate all records in batch

### Migration Tool Features

```bash
# Validate format
civic record:validate --format

# Migrate single record
civic record:migrate <record-path>

# Migrate all records
civic record:migrate --all

# Dry-run migration
civic record:migrate --all --dry-run
```

---

## ✅ Checklist

### Core Infrastructure
- [ ] Update RecordData interface
- [ ] Add geography record type
- [ ] Add session record type
- [ ] Create RecordParser utility
- [ ] Create RecordValidator utility
- [ ] Create RecordMigrator utility

### Reading/Parsing
- [ ] Update RecordManager.getRecord()
- [ ] Update IndexingService
- [ ] Update CLI validate command
- [ ] Update CLI import command
- [ ] Update CLI search command

### Writing/Serialization
- [ ] Update RecordManager.createMarkdownContent()
- [ ] Implement RecordParser.serializeToMarkdown()
- [ ] Update CLI create command
- [ ] Update CLI export command

### Validation & Migration
- [ ] Implement RecordValidator
- [ ] Implement RecordMigrator
- [ ] Create CLI migrate command
- [ ] Update API validation endpoint

### UI & API
- [ ] Update UI interfaces
- [ ] Update RecordForm component
- [ ] Update API endpoints
- [ ] Update record types API

### Documentation
- [ ] Create migration guide
- [ ] Update all documentation
- [ ] Update examples to new format

### Testing
- [ ] Update all test fixtures to new format
- [ ] Update core tests for new format
- [ ] Update CLI tests for new format
- [ ] Update API tests for new format
- [ ] Update UI tests for new format
- [ ] Create parser tests
- [ ] Create validator tests
- [ ] Create migrator tests
- [ ] Create format standard conformance tests
- [ ] Run full test suite and fix all failures
- [ ] Ensure 100% test coverage for new format logic

---

## 🎯 Success Criteria

1. ✅ All records can be read in both old and new formats
2. ✅ All new records are written in standardized format
3. ✅ All record types (including geography and session) supported
4. ✅ Format validation works correctly
5. ✅ Migration tool successfully converts old records
6. ✅ All tests pass
7. ✅ Documentation is complete and accurate
8. ✅ UI displays records correctly in new format
9. ✅ API endpoints handle new format correctly

---

## 📝 Notes

- **Priority**: High - This is foundational for data consistency
- **Risk**: Medium - Requires careful testing to avoid data loss
- **Timeline**: Estimated 2-3 weeks for complete implementation
- **Dependencies**: None - Can be done incrementally

---

**Next Steps**: Begin with Phase 1 (Core Infrastructure) and create the RecordParser utility as the foundation for all other changes.

