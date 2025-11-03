# 📊 Record Format Standard - Code Analysis by Block

**Related**: [Record Format Standard](./record-format-standard.md) | [Implementation Plan](./record-format-implementation-plan.md)

## 🎯 Analysis Overview

This document breaks down **exactly** what needs to be changed in each code block to implement the standardized record format. Since there's no production data, we can update everything directly without migration complexity.

---

## 🔵 BLOCK 1: CORE MODULE

### 1.1 Type Definitions & Interfaces

**Files to Update:**

#### `core/src/records/record-manager.ts`
- **Line 16-53**: `RecordData` interface
  - ✅ Add `authors?: Array<{name, username, role?, email?}>` field
  - ✅ Add `source?: {reference, original_title?, original_filename?, url?, type?, imported_at?, imported_by?}` field
  - ✅ Keep `author: string` (required)
  - ⚠️ Note: `created_at`/`updated_at` are internal (database), frontmatter uses `created`/`updated`

#### `core/src/civic-core.ts`
- **Line 53-75**: `CreateRecordRequest` interface
  - ✅ Add `authors?: Array<...>` field
  - ✅ Add `source?: {...}` field
  - ✅ Ensure all existing fields are present

- **Line 77-98**: `UpdateRecordRequest` interface
  - ✅ Add `authors?: Array<...>` field
  - ✅ Add `source?: {...}` field
  - ✅ Ensure all existing fields are present

### 1.2 Record Parsing (Reading from Markdown)

**Files to Update:**

#### `core/src/records/record-manager.ts`
- **Line 250-359**: `getRecord()` method
  - ❌ **Current**: Uses regex to extract frontmatter, line-by-line parsing for geography
  - ✅ **Needed**: Replace with proper YAML parser (gray-matter or js-yaml)
  - ✅ **Needed**: Parse `authors` array if present
  - ✅ **Needed**: Parse `source` object if present
  - ✅ **Needed**: Normalize `created`/`updated` from frontmatter to `created_at`/`updated_at`
  - ✅ **Needed**: Handle old format gracefully (backward compatibility during transition)

**Implementation Approach:**
```typescript
// NEW: Use proper YAML parser
import matter from 'gray-matter';

async getRecord(id: string): Promise<RecordData | null> {
  const record = await this.db.getRecord(id);
  if (!record) return null;
  
  // Read from markdown file (source of truth)
  if (record.path) {
    const filePath = path.join(this.dataDir, record.path);
    const fileContent = await fs.readFile(filePath, 'utf8');
    const { data: frontmatter, content } = matter(fileContent);
    
    // Parse and normalize to RecordData
    const parsed = this.parseFrontmatterToRecordData(frontmatter, content);
    return { ...record, ...parsed };
  }
  
  return record;
}
```

#### `core/src/indexing/indexing-service.ts`
- **Line 155-189**: `extractRecordMetadata()` method
  - ❌ **Current**: Uses `extractFrontmatter()` with basic YAML parsing
  - ✅ **Needed**: Use same parsing logic as RecordManager
  - ✅ **Needed**: Extract `authors` array
  - ✅ **Needed**: Extract `source` object
  - ✅ **Needed**: Handle `created`/`updated` timestamps properly

- **Line 194-204**: `extractFrontmatter()` method
  - ✅ **Current**: Uses `yaml.load()` - this is good, keep it
  - ✅ **Needed**: Ensure it handles new format fields correctly

- **Line 437-470**: `createRecordFromFile()` method
  - ✅ **Needed**: Update to handle new format when syncing from files
  - ✅ **Needed**: Map `authors` array correctly
  - ✅ **Needed**: Map `source` object correctly

### 1.3 Record Serialization (Writing to Markdown)

**Files to Update:**

#### `core/src/records/record-manager.ts`
- **Line 651-701**: `createMarkdownContent()` method
  - ❌ **Current**: Manual string building, JSON.stringify for complex objects
  - ❌ **Current**: No logical field ordering, no section comments
  - ❌ **Current**: Uses `created_at`/`updated_at` instead of `created`/`updated`
  - ✅ **Needed**: Use proper YAML library (js-yaml) with formatting
  - ✅ **Needed**: Implement logical field ordering with section comments
  - ✅ **Needed**: Convert `created_at`/`updated_at` to `created`/`updated` in frontmatter
  - ✅ **Needed**: Serialize `authors` array properly
  - ✅ **Needed**: Serialize `source` object properly
  - ✅ **Needed**: Use proper YAML formatting (not JSON.stringify for objects)

**Implementation Approach:**
```typescript
// NEW: Use js-yaml for proper formatting
import * as yaml from 'js-yaml';

private createMarkdownContent(record: RecordData): string {
  const frontmatter: any = {
    // Core Identification
    id: record.id,
    title: record.title,
    type: record.type,
    status: record.status,
    
    // Authorship
    author: record.author,
    ...(record.authors && record.authors.length > 0 ? { authors: record.authors } : {}),
    
    // Timestamps (convert internal to frontmatter format)
    created: record.created_at || record.created,
    updated: record.updated_at || record.updated,
    
    // ... rest of fields in logical order
    
    // Source & Origin
    ...(record.source ? { source: record.source } : {}),
  };
  
  // Generate YAML with section comments
  const yamlContent = this.generateYamlWithComments(frontmatter);
  
  return `---\n${yamlContent}---\n\n${record.content || ''}`;
}
```

### 1.4 Record Creation & Updates

**Files to Update:**

#### `core/src/records/record-manager.ts`
- **Line 82-161**: `createRecord()` method
  - ✅ **Needed**: Handle `authors` array from request
  - ✅ **Needed**: Handle `source` object from request
  - ✅ **Needed**: Ensure `created_at`/`updated_at` are set (for database)
  - ✅ **Needed**: Ensure `author` string is always set (from user.username)

- **Line 166-245**: `createRecordWithId()` method
  - ✅ **Needed**: Same updates as `createRecord()`

- **Line 364-425**: `updateRecord()` method
  - ✅ **Needed**: Handle `authors` array updates
  - ✅ **Needed**: Handle `source` object updates
  - ✅ **Needed**: Update `updated_at` timestamp

### 1.5 Record Type Configuration

**Files to Update:**

#### `core/src/config/record-types.ts`
- **Line 25-56**: `DEFAULT_RECORD_TYPES` constant
  - ✅ **Needed**: Add `geography` record type (priority 6)
  - ✅ **Needed**: Add `session` record type (priority 7)

#### `core/src/defaults/config.yml`
- **Line 15-41**: `record_types_config` section
  - ✅ **Needed**: Add `geography:` entry
  - ✅ **Needed**: Add `session:` entry

### 1.6 Database Schema

**Files to Update:**

#### `core/src/database/database-adapter.ts`
- **Line 158-172**: `CREATE TABLE records` statement
  - ⚠️ **Note**: Database stores JSON strings for complex fields
  - ⚠️ **Note**: `authors` and `source` should be stored in `metadata` JSON column OR we add new columns
  - 🤔 **Decision Needed**: Store in `metadata` JSON or add `authors` and `source` columns?
  - 💡 **Recommendation**: Store in `metadata` JSON (flexible, no schema changes needed)

#### `core/src/database/database-service.ts`
- **Line 400-441**: `createRecord()` method
  - ✅ **Needed**: Ensure `authors` and `source` are included in metadata JSON string
  - ⚠️ **Note**: Already uses `metadata` JSON column, so should work as-is

---

## 🔵 BLOCK 2: API MODULE

### 2.1 API Request/Response Interfaces

**Files to Update:**

#### `modules/api/src/services/records-service.ts`
- **Line 47-81**: `createRecord()` method signature
  - ✅ **Needed**: Add `authors?: Array<...>` to data parameter
  - ✅ **Needed**: Add `source?: {...}` to data parameter

- **Line 214-249**: `updateRecord()` method signature
  - ✅ **Needed**: Add `authors?: Array<...>` to data parameter
  - ✅ **Needed**: Add `source?: {...}` to data parameter

### 2.2 API Routes

**Files to Update:**

#### `modules/api/src/routes/records.ts`
- **Line 296-362**: POST `/api/v1/records` (create record)
  - ✅ **Needed**: Extract `authors` from `req.body`
  - ✅ **Needed**: Extract `source` from `req.body`
  - ✅ **Needed**: Pass to `recordsService.createRecord()`

- **Line 403-500+**: PUT `/api/v1/records/:id` (update record)
  - ✅ **Needed**: Extract `authors` from `req.body`
  - ✅ **Needed**: Extract `source` from `req.body`
  - ✅ **Needed**: Pass to `recordsService.updateRecord()`

#### `modules/api/src/routes/system.ts`
- **Line 9-75**: GET `/api/v1/system/record-types` endpoint
  - ✅ **Needed**: Add `geography` to recordTypes array
  - ✅ **Needed**: Add `session` to recordTypes array

### 2.3 API Response Transformation

**Files to Update:**

#### `modules/api/src/services/records-service.ts`
- **Line 109-136**: `createRecord()` response transformation
  - ✅ **Needed**: Include `authors` in response if present
  - ✅ **Needed**: Include `source` in response if present

- **Line 250-306**: `updateRecord()` response transformation
  - ✅ **Needed**: Include `authors` in response if present
  - ✅ **Needed**: Include `source` in response if present

---

## 🔵 BLOCK 3: UI MODULE

### 3.1 TypeScript Interfaces

**Files to Update:**

#### `modules/ui/app/stores/records.ts`
- **Line 4-51**: `CivicRecord` interface
  - ✅ **Needed**: Add `authors?: Array<{name, username, role?, email?}>` field
  - ✅ **Needed**: Add `source?: {reference, original_title?, original_filename?, url?, type?, imported_at?, imported_by?}` field
  - ✅ **Needed**: Ensure `author: string` remains (required)
  - ✅ **Needed**: Update type union to include `'geography' | 'session'`

### 3.2 Record Form Component

**Files to Update:**

#### `modules/ui/app/components/RecordForm.vue`
- **Line 206-279**: `onMounted()` initialization
  - ✅ **Needed**: Load `authors` array if present in record
  - ✅ **Needed**: Load `source` object if present in record

- **Line 321-342**: `handleSubmit()` - recordData preparation
  - ✅ **Needed**: Include `authors` in submitted data if present
  - ✅ **Needed**: Include `source` in submitted data if present

- **Template Section**: Form fields
  - ✅ **Needed**: Add UI fields for `authors` array (optional)
  - ✅ **Needed**: Add UI fields for `source` object (optional, for imports)
  - 💡 **Note**: These can be added later, not blocking

### 3.3 Record Display Components

**Files to Update:**

#### `modules/ui/app/pages/records/[type]/[id]/index.vue`
- **Line 58-73**: Record transformation from API
  - ✅ **Needed**: Map `authors` array if present
  - ✅ **Needed**: Map `source` object if present
  - ✅ **Needed**: Display `authors` information in UI
  - ✅ **Needed**: Display `source` information in UI (for imported records)

#### `modules/ui/app/pages/records/[type]/[id]/edit.vue`
- **Line 40-73**: Record transformation from API
  - ✅ **Needed**: Map `authors` array if present
  - ✅ **Needed**: Map `source` object if present

#### `modules/ui/app/pages/records/[type]/[id]/raw.vue`
- **Line 67+**: Raw record display
  - ✅ **Needed**: Display complete frontmatter including new fields

### 3.4 Record Type Management

**Files to Update:**

#### `modules/ui/app/composables/useRecordTypes.ts`
- ✅ **Needed**: Ensure `geography` and `session` are included in record types
- ✅ **Needed**: Handle new record types in UI dropdowns/filters

---

## 🔵 BLOCK 4: TEMPLATES

### 4.1 Default Templates

**Files to Update:**

#### `core/src/defaults/templates/bylaw/default.md`
- ✅ **Needed**: Update to new format standard
- ✅ **Needed**: Use `created`/`updated` (not `created_at`/`updated_at`)
- ✅ **Needed**: Include proper field ordering with section comments
- ✅ **Needed**: Remove `version`, `priority`, `department` if not needed (or make them optional examples)

#### `core/src/defaults/templates/ordinance/default.md`
- ✅ **Same updates as bylaw**

#### `core/src/defaults/templates/policy/default.md`
- ✅ **Same updates as bylaw**

#### `core/src/defaults/templates/proclamation/default.md`
- ✅ **Same updates as bylaw**

#### `core/src/defaults/templates/resolution/default.md`
- ✅ **Same updates as bylaw**

### 4.2 New Templates Needed

**Files to Create:**

#### `core/src/defaults/templates/geography/default.md`
- ✅ **Needed**: Create new template for geography records
- ✅ **Needed**: Include `geography_data` and `category` fields
- ✅ **Needed**: Follow standard format

#### `core/src/defaults/templates/session/default.md`
- ✅ **Needed**: Create new template for session records
- ✅ **Needed**: Include `session_type`, `date`, `location`, `attendees`, `topics`, `media` fields
- ✅ **Needed**: Follow standard format

### 4.3 Template Engine

**Files to Check:**

#### `core/src/utils/template-engine.ts`
- **Line 106-164**: Template loading and parsing
- ⚠️ **Note**: Uses `gray-matter` which should handle new format fine
- ✅ **Verify**: Template parsing doesn't break with new format
- ✅ **Verify**: Template variable substitution works with new fields

---

## 🔵 BLOCK 5: DEMO DATA & INIT

### 5.1 Demo Data Records

**Files to Update (12 files):**

#### `cli/src/demo-data/records/*.md`
All demo record files need updating:

1. `bylaw-noise-restrictions.md`
2. `bylaw-noise-ordinance.md`
3. `bylaw-parking-regulations.md`
4. `bylaw-building-codes.md`
5. `bylaw-zoning-code.md`
6. `ordinance-tax-increase.md`
7. `policy-data-privacy.md`
8. `policy-environmental-protection.md`
9. `policy-accessibility.md`
10. `proclamation-mayors-day.md`
11. `resolution-budget-2025.md`
12. Plus any others

**Changes Needed for Each:**
- ✅ Convert `created`/`updated` from date strings to ISO 8601 timestamps
- ✅ Normalize `author` to string format (if it's in `authors` array, extract username)
- ✅ Add `id` field if missing
- ✅ Standardize `status` values
- ✅ Add section comments for organization
- ✅ Ensure proper field ordering
- ✅ Remove `version`, `priority`, `department` if present (or move to metadata)
- ✅ Ensure `tags` is an array
- ✅ Ensure `module` and `slug` are properly formatted

**Example Transformation:**
```yaml
# OLD FORMAT
---
title: 'Règlement sur les restrictions de bruit'
type: bylaw
status: adopted
authors:
  - name: 'Marie-Claude Tremblay'
    role: 'clerk'
created: '2025-01-15'
updated: '2025-02-01'
---

# NEW FORMAT
---
# ============================================
# CORE IDENTIFICATION (Required)
# ============================================
id: "record-1736966400000"
title: "Règlement sur les restrictions de bruit"
type: bylaw
status: approved

# ============================================
# AUTHORSHIP & ATTRIBUTION (Required)
# ============================================
author: "mc.tremblay"
authors:
  - name: "Marie-Claude Tremblay"
    username: "mc.tremblay"
    role: "clerk"

# ============================================
# TIMESTAMPS (Required)
# ============================================
created: "2025-01-15T00:00:00Z"
updated: "2025-02-01T00:00:00Z"

# ============================================
# CLASSIFICATION (Optional but recommended)
# ============================================
tags: ["noise", "nighttime", "curfew", "bruit", "nuit"]
module: "legal-register"
slug: "noise-restrictions"

---
```

### 5.2 CLI Init Command

**Files to Update:**

#### `cli/src/commands/init.ts`
- **Line 1002-1186**: `loadDemoData()` function
- ✅ **Note**: Function just copies files, so updated demo data files will be copied automatically
- ✅ **No code changes needed** - just update the demo data files themselves

---

## 🔵 BLOCK 6: CLI COMMANDS

### 6.1 CLI Create Command

**Files to Update:**

#### `cli/src/commands/create.ts`
- **Line 206-218**: Frontmatter creation
  - ✅ **Needed**: Use new format standard
  - ✅ **Needed**: Include section comments
  - ✅ **Needed**: Use proper field ordering
  - ✅ **Needed**: Use `created`/`updated` (not `created_at`/`updated_at`)
  - ✅ **Needed**: Use ISO 8601 timestamps

### 6.2 CLI Import Command

**Files to Update:**

#### `cli/src/commands/import.ts`
- **Line 398-415**: `parseMarkdownImport()` function
  - ✅ **Needed**: Handle new format fields
  - ✅ **Needed**: Normalize old format to new format on import

- **Line 472-531**: `performImport()` function
  - ✅ **Needed**: Use new format when writing imported records

### 6.3 CLI Export Command

**Files to Update:**

#### `cli/src/commands/export.ts`
- **Line 151-164**: Export record metadata extraction
  - ✅ **Needed**: Extract new format fields
  - ✅ **Needed**: Include `authors` and `source` in export

### 6.4 CLI Validate Command

**Files to Update:**

#### `cli/src/commands/validate.ts`
- **Line 162-265**: `validateRecord()` function
  - ✅ **Needed**: Validate against new format standard
  - ✅ **Needed**: Check required fields (id, title, type, status, author, created, updated)
  - ✅ **Needed**: Validate ISO 8601 timestamps
  - ✅ **Needed**: Validate `authors` array structure
  - ✅ **Needed**: Validate `source` object structure

### 6.5 CLI Search Command

**Files to Update:**

#### `cli/src/commands/search.ts`
- **Line 315-334**: `parseRecordMetadata()` function
  - ✅ **Needed**: Extract new format fields
  - ✅ **Needed**: Handle `authors` array in search
  - ✅ **Needed**: Handle `source` object in search

---

## 🔵 BLOCK 7: VALIDATION

### 7.1 API Validation

**Files to Update:**

#### `modules/api/src/routes/validation.ts`
- **Line 373-518**: `validateRecordContent()` function
  - ✅ **Needed**: Validate new format standard
  - ✅ **Needed**: Check required fields
  - ✅ **Needed**: Validate ISO 8601 timestamps
  - ✅ **Needed**: Validate `authors` array structure
  - ✅ **Needed**: Validate `source` object structure
  - ✅ **Needed**: Validate status values match approved list
  - ✅ **Needed**: Validate type values include new types (geography, session)

---

## 📋 Summary Checklist by Block

### ✅ CORE BLOCK
- [ ] Update `RecordData` interface with `authors` and `source`
- [ ] Update `CreateRecordRequest` and `UpdateRecordRequest` interfaces
- [ ] Replace `createMarkdownContent()` with proper YAML serialization
- [ ] Replace `getRecord()` parsing with proper YAML parsing (gray-matter)
- [ ] Update `IndexingService.extractRecordMetadata()` for new format
- [ ] Add `geography` and `session` to `DEFAULT_RECORD_TYPES`
- [ ] Update `createRecord()` and `updateRecord()` to handle new fields
- [ ] Ensure database `createRecord()` includes new fields in metadata JSON

### ✅ API BLOCK
- [ ] Update `RecordsService.createRecord()` signature
- [ ] Update `RecordsService.updateRecord()` signature
- [ ] Update POST `/api/v1/records` route to accept new fields
- [ ] Update PUT `/api/v1/records/:id` route to accept new fields
- [ ] Add `geography` and `session` to `/api/v1/system/record-types` endpoint
- [ ] Update API response transformation to include new fields

### ✅ UI BLOCK
- [ ] Update `CivicRecord` interface with `authors` and `source`
- [ ] Update `RecordForm.vue` to handle new fields (optional - can add UI later)
- [ ] Update record display pages to show new fields
- [ ] Update `useRecordTypes` composable for new record types
- [ ] Update type unions to include `'geography' | 'session'`

### ✅ TEMPLATES BLOCK
- [ ] Update all 5 existing templates (bylaw, ordinance, policy, proclamation, resolution)
- [ ] Create `geography/default.md` template
- [ ] Create `session/default.md` template
- [ ] Verify template engine handles new format correctly

### ✅ DEMO DATA BLOCK
- [ ] Update all 12+ demo record files to new format
- [ ] Convert dates to ISO 8601
- [ ] Normalize author formats
- [ ] Add section comments
- [ ] Ensure proper field ordering

### ✅ CLI BLOCK
- [ ] Update `create.ts` to use new format
- [ ] Update `import.ts` to handle new format
- [ ] Update `export.ts` to include new fields
- [ ] Update `validate.ts` to validate new format
- [ ] Update `search.ts` to extract new fields

### ✅ VALIDATION BLOCK
- [ ] Update API validation endpoint for new format
- [ ] Add validation for ISO 8601 timestamps
- [ ] Add validation for `authors` array structure
- [ ] Add validation for `source` object structure

---

## 🚨 Critical Implementation Notes

### Field Name Mapping (Frontmatter ↔ Internal)

| Frontmatter (File) | Internal (RecordData) | Database Column | Notes |
|-------------------|----------------------|-----------------|-------|
| `created` | `created_at` | `created_at` | Convert on read/write |
| `updated` | `updated_at` | `updated_at` | Convert on read/write |
| `author` | `author` | `author` | Always string |
| `authors` | `authors` | `metadata` JSON | Optional array |
| `source` | `source` | `metadata` JSON | Optional object |
| `id` | `id` | `id` | Same |
| `title` | `title` | `title` | Same |
| `type` | `type` | `type` | Same |
| `status` | `status` | `status` | Same |
| All others | Same | `metadata` JSON or specific column | As appropriate |

### Backward Compatibility Strategy

Since no production data exists:
- ✅ **Option**: Direct update (recommended)
  - Update all code to new format
  - Update all demo data to new format
  - No migration code needed
  - Clean slate approach

- ⚠️ **Alternative**: If we want to be safe, add a simple converter:
  - Read old format
  - Convert on-the-fly to new format
  - Write in new format
  - Remove converter after all records updated

### YAML Library Choice

**Recommendation**: Use `js-yaml` for writing, `gray-matter` for reading
- `gray-matter`: Excellent for parsing (already used in template-engine)
- `js-yaml`: Excellent for formatting with comments (better than gray-matter for writing)

---

## 🎯 Implementation Priority Order

1. **Core RecordParser Utility** (Foundation)
   - Create `core/src/records/record-parser.ts`
   - Implement `parseFromMarkdown()` and `serializeToMarkdown()`

2. **Core RecordManager** (Critical)
   - Update `createMarkdownContent()` to use RecordParser
   - Update `getRecord()` to use RecordParser

3. **Core IndexingService** (Important)
   - Update metadata extraction

4. **Core Type Definitions** (Foundation)
   - Update all interfaces

5. **API Layer** (Integration)
   - Update request/response handling

6. **Templates** (Content)
   - Update all templates

7. **Demo Data** (Content)
   - Update all demo files

8. **CLI Commands** (Tooling)
   - Update all commands

9. **UI Components** (User-facing)
   - Update interfaces and forms (can be incremental)

---

## 📝 Notes

- **No Migration Needed**: Since there's no production data, we can update everything directly
- **Breaking Changes**: Acceptable - clean slate approach
- **Testing**: All existing tests will need updates for new format
- **Timeline**: Estimated 1-2 weeks for complete implementation

---

**Next Step**: Begin with Core RecordParser utility, then work through blocks in priority order.

