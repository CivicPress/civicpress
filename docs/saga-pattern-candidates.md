# Saga Pattern Implementation Candidates

**Date:** 2025-12-18  
**Status:** Analysis Complete

## Summary

This document identifies operations in CivicPress that should use the Saga
Pattern but currently don't. The Saga Pattern is required for any multi-step
operation that spans multiple storage boundaries (database, Git, filesystem).

---

## ✅ Already Using Saga Pattern

The following operations are **already implemented** with sagas:

1. **`PublishDraftSaga`** - Publishing draft records
   - Location: `core/src/saga/publish-draft-saga.ts`
   - Used by: `RecordManager.publishDraftSaga()`

2. **`CreateRecordSaga`** - Creating published records
   - Location: `core/src/saga/create-record-saga.ts`
   - Used by: `RecordManager.createRecord()` (for published records)

3. **`UpdateRecordSaga`** - Updating published records
   - Location: `core/src/saga/update-record-saga.ts`
   - Used by: `RecordManager.updateRecord()` (for published records)

4. **`ArchiveRecordSaga`** - Archiving records
   - Location: `core/src/saga/archive-record-saga.ts`
   - Used by: `RecordManager.archiveRecord()`

---

## 🔍 Candidates for Saga Pattern Implementation

### 1. **Geography File Operations** ⚠️ HIGH PRIORITY

**Current State:**

- `GeographyManager.createGeographyFile()` - Creates file, no Git commit
- `GeographyManager.updateGeographyFile()` - Updates file, no Git commit
- `GeographyManager.deleteGeographyFile()` - Deletes file, no Git commit

**Issue:**

- Geography files are stored in `data/geography/` which should be Git versioned
- According to spec (`docs/geography-system.md`), geography files should be
  committed to Git
- Currently, geography operations only write files, no Git commits
- No database persistence (TODO comments in code)

**Why Saga Pattern is Needed:**

- Future: Will involve database operations (TODO comments indicate this)
- Files need to be committed to Git (authoritative history)
- Multi-step: File creation → Database save → Git commit

**Recommended Saga:**

- `CreateGeographySaga` - Create geography file + DB + Git commit
- `UpdateGeographySaga` - Update geography file + DB + Git commit
- `DeleteGeographySaga` - Delete geography file + DB + Git commit

**Priority:** High (once database persistence is implemented)

**Files:**

- `core/src/geography/geography-manager.ts` (lines 46-131, 228-295)

---

### 2. **CLI Create Command (Draft Records)** ⚠️ MEDIUM PRIORITY

**Current State:**

- `cli/src/commands/create.ts` - Creates draft records with direct Git commits
- Lines 255-277: Direct file write → Hook emission → Git commit

**Issue:**

- Creates draft records with direct Git commits (not using saga)
- Drafts are simpler (no database for drafts), but still multi-step
- Inconsistent with published record creation (which uses saga)

**Why Saga Pattern Could Help:**

- Consistency with published record operations
- Better error handling and compensation
- Idempotency support
- However, drafts are simpler (no DB operations currently)

**Consideration:**

- Drafts don't use database (stored only in files)
- Current implementation is simpler and works
- Could be refactored for consistency, but lower priority

**Priority:** Medium (consistency improvement, not critical)

**Files:**

- `cli/src/commands/create.ts` (lines 254-291)

---

### 3. **Template Operations** ✅ NOT NEEDED

**Current State:**

- `TemplateService.createTemplate()` - Creates template files
- `TemplateService.updateTemplate()` - Updates template files

**Analysis:**

- Templates are system files (not user content)
- Templates are stored in `.civic/templates/` (system config, not Git versioned)
- No database operations
- No Git commits needed (templates are config, not content)

**Conclusion:** **No saga pattern needed** - Templates are system configuration,
not content that needs Git versioning.

**Files:**

- `core/src/templates/template-service.ts`

---

### 4. **Configuration Operations** ✅ NOT NEEDED

**Current State:**

- `ConfigurationService.updateConfig()` - Updates config files
- Configs stored in `data/.civic/` (system config)

**Analysis:**

- Configuration files are system config (not user content)
- Configs are managed by Configuration Service (not Git versioned)
- No database operations
- No Git commits needed (configs are managed separately)

**Conclusion:** **No saga pattern needed** - Configuration is system state, not
content that needs Git versioning.

**Files:**

- `core/src/config/configuration-service.ts`

---

### 5. **Backup Operations** ✅ NOT NEEDED

**Current State:**

- `BackupService.createBackup()` - Creates backup files
- Backups stored in `data/exports/backups/`

**Analysis:**

- Backups are exports (not content)
- No database operations (backups are copies)
- No Git commits needed (backups are exports, not versioned content)

**Conclusion:** **No saga pattern needed** - Backups are exports, not content
operations.

**Files:**

- `core/src/backup/backup-service.ts`

---

## 📋 Implementation Recommendations

### Immediate Actions

1. **Geography Operations** (High Priority - when DB persistence is added)
   - Create `CreateGeographySaga`
   - Create `UpdateGeographySaga`
   - Create `DeleteGeographySaga`
   - Integrate with `GeographyManager`

### Future Considerations

2. **CLI Create Command** (Medium Priority - consistency)
   - Consider refactoring to use saga pattern for consistency
   - Lower priority since drafts are simpler and current implementation works

### Not Needed

3. **Template, Config, Backup Operations**
   - These are system operations, not content operations
   - No saga pattern needed

---

## 🎯 Decision Criteria

An operation should use the Saga Pattern if it:

1. ✅ **Spans multiple storage boundaries** (DB + Git, DB + File + Git)
2. ✅ **Involves Git commits** (authoritative history)
3. ✅ **Requires compensation logic** (rollback on failure)
4. ✅ **Needs idempotency** (safe retries)
5. ✅ **Needs state persistence** (recovery from crashes)

An operation does NOT need Saga Pattern if it:

1. ❌ **Only involves single storage boundary** (e.g., DB-only, file-only)
2. ❌ **Does not commit to Git** (system config, exports)
3. ❌ **Is a simple read operation** (no writes)
4. ❌ **Is a derived state operation** (indexing, hooks - these are
   fire-and-forget)

---

## 📝 Notes

- **RecordManager private methods** (`createRecordFile`, `updateRecordFile`,
  `archiveRecordFile`) are correctly used by saga steps - these are fine as-is
- **Draft records** currently don't use database, so they're simpler - saga
  pattern could be added for consistency but not critical
- **Geography files** will need saga pattern once database persistence is
  implemented (TODO comments indicate this is planned)

---

**Last Updated:** 2025-12-18  
**Next Review:** When geography database persistence is implemented
