# Test Coverage Analysis

**Date**: 2025-01-27  
**Purpose**: Analyze test coverage gaps for recent additions (dual status model,
draft/publish endpoints, workflowState)

## Executive Summary

Recent additions to CivicPress include:

1. **Dual Status Model**: `status` (legal/public) + `workflowState` (internal
   editorial)
2. **Draft/Publish System**: New endpoints for draft management and publishing
3. **Database Schema Updates**: `workflow_state` column added to `records` and
   `record_drafts` tables

**Current Coverage**: Most of these features are **untested** or have minimal
test coverage.

---

## 1. Core Module - Database Service

### Database Service - Current Status

- ✅ Basic placeholder test exists: `tests/core/database-service.test.ts`
- ❌ **No actual tests** for database operations
- ❌ **No tests** for `workflow_state` field handling

### Database Service - Missing Tests

#### 1.1 DatabaseService - Record Operations with workflowState

**File**: `tests/core/database-service.test.ts`

**Missing Tests**:

```typescript
describe('DatabaseService - workflowState support', () => {
  it('should create record with workflow_state field', async () => {
    // Test: Create record with both status and workflowState
    // Verify workflow_state is stored correctly in DB
    // Verify workflow_state is NOT included in YAML frontmatter
  });

  it('should update workflow_state independently of status', async () => {
    // Test: Update only workflowState without changing status
    // Verify both fields can be updated separately
  });

  it('should default workflow_state to "draft" when not provided', async () => {
    // Test: Create record without workflowState
    // Verify default is 'draft'
  });

  it('should retrieve record with workflow_state', async () => {
    // Test: Get record and verify workflowState is returned
  });
});

describe('DatabaseService - Draft Operations', () => {
  it('should create draft with workflow_state', async () => {
    // Test: Create draft record with workflowState
  });

  it('should update draft workflow_state', async () => {
    // Test: Update draft's workflowState field
  });

  it('should list drafts filtered by workflow_state', async () => {
    // Test: Query drafts by workflowState
  });
});
```

---

## 2. Core Module - Record Manager

### Record Manager - Current Status

- ❌ **No dedicated test file** for RecordManager
- ❌ **No tests** for draft/publish operations
- ❌ **No tests** for workflowState handling

### Record Manager - Missing Tests

#### 2.1 RecordManager - Draft Operations

**File**: `tests/core/record-manager.test.ts` (to be created)

**Missing Tests**:

```typescript
describe('RecordManager - Draft Operations', () => {
  it('should create draft without creating file', async () => {
    // Test: createDraft() should only write to DB, not filesystem
    // Verify no .md file is created
  });

  it('should update draft without modifying published record', async () => {
    // Test: Update draft when published version exists
    // Verify published record is unchanged
  });

  it('should publish draft and create file', async () => {
    // Test: publishDraft() should:
    // 1. Copy draft to records table
    // 2. Create .md file in filesystem
    // 3. Optionally delete draft
  });

  it('should handle workflowState during publish', async () => {
    // Test: workflowState should be preserved when publishing
    // Verify workflowState is NOT written to YAML frontmatter
  });
});

describe('RecordManager - workflowState Handling', () => {
  it('should preserve workflowState during record creation', async () => {
    // Test: Create record with workflowState
    // Verify it's stored in DB but not in YAML
  });

  it('should update workflowState independently', async () => {
    // Test: Update workflowState without changing status
  });

  it('should exclude workflowState from YAML frontmatter', async () => {
    // Test: Serialize record to markdown
    // Verify workflowState is NOT in frontmatter
  });
});
```

---

## 3. API Module - Records Endpoints

### API Records - Current Status

- ✅ Basic CRUD tests exist: `tests/api/records.test.ts`
- ❌ **No tests** for draft endpoints
- ❌ **No tests** for publish endpoint
- ❌ **No tests** for workflowState in API requests/responses

### API Records - Missing Tests

#### 3.1 Draft Endpoints

**File**: `tests/api/records.test.ts`

**Missing Endpoints to Test**:

1. **GET /api/v1/records/drafts**

   ```typescript
   describe('GET /api/v1/records/drafts', () => {
     it('should list user drafts when authenticated', async () => {
       // Test: Get list of user's drafts
     });

     it('should return 401 when not authenticated', async () => {
       // Test: Reject unauthenticated requests
     });

     it('should filter drafts by type', async () => {
       // Test: ?type=bylaw query parameter
     });

     it('should filter drafts by workflowState', async () => {
       // Test: Filter by workflowState parameter
     });
   });
   ```

2. **PUT /api/v1/records/:id/draft**

   ```typescript
   describe('PUT /api/v1/records/:id/draft', () => {
     it('should create draft when draft does not exist', async () => {
       // Test: Create new draft
     });

     it('should update existing draft', async () => {
       // Test: Update draft fields
     });

     it('should update workflowState independently', async () => {
       // Test: Update workflowState without changing status
     });

     it('should require authentication', async () => {
       // Test: 401 when not authenticated
     });

     it('should validate workflowState values', async () => {
       // Test: Reject invalid workflowState values
     });

     it('should preserve workflowState when updating other fields', async () => {
       // Test: Update title, verify workflowState unchanged
     });
   });
   ```

3. **POST /api/v1/records/:id/publish**

   ```typescript
   describe('POST /api/v1/records/:id/publish', () => {
     it('should publish draft and create file', async () => {
       // Test: Publish draft, verify file created
     });

     it('should handle workflowState during publish', async () => {
       // Test: workflowState preserved in published record
     });

     it('should exclude workflowState from YAML frontmatter', async () => {
       // Test: Published file should not contain workflowState in frontmatter
     });

     it('should require authentication', async () => {
       // Test: 401 when not authenticated
     });

     it('should validate permissions', async () => {
       // Test: Check role-based permissions
     });

     it('should allow status transition on publish', async () => {
       // Test: Can specify target status on publish
     });
   });
   ```

4. **DELETE /api/v1/records/:id/draft**

   ```typescript
   describe('DELETE /api/v1/records/:id/draft', () => {
     it('should delete draft', async () => {
       // Test: Delete draft record
     });

     it('should not delete published record', async () => {
       // Test: Cannot delete published record via draft endpoint
     });

     it('should require authentication', async () => {
       // Test: 401 when not authenticated
     });

     it('should verify ownership', async () => {
       // Test: User can only delete own drafts
     });
   });
   ```

5. **GET /api/v1/records/:id** (with draft support)

   ```typescript
   describe('GET /api/v1/records/:id - Draft Support', () => {
     it('should return draft if user has permission', async () => {
       // Test: Get draft record when authenticated
     });

     it('should return published version for public users', async () => {
       // Test: Public users only see published records
     });

     it('should include workflowState in response for drafts', async () => {
       // Test: Draft response includes workflowState field
     });

     it('should not include workflowState in published record response', async () => {
       // Test: Published records don't expose workflowState
     });
   });
   ```

#### 3.2 workflowState in API Responses

**Missing Tests**:

```typescript
describe('API - workflowState Handling', () => {
  it('should accept workflowState in create draft request', async () => {
    // Test: POST with workflowState
  });

  it('should accept workflowState in update draft request', async () => {
    // Test: PUT /:id/draft with workflowState
  });

  it('should return workflowState in draft responses', async () => {
    // Test: GET /:id when draft exists
  });

  it('should not return workflowState in published record responses', async () => {
    // Test: GET /:id when only published exists
  });

  it('should validate workflowState enum values', async () => {
    // Test: Reject invalid workflowState values
    // Valid: draft, under_review, ready_for_publication, internal_only
  });
});
```

---

## 4. CLI Module

### CLI Module - Current Status

- ✅ Multiple CLI command tests exist
- ❌ **No tests** for draft-related commands (if any)
- ❌ **No tests** for workflowState handling in CLI

### CLI Module - Missing Tests

#### 4.1 CLI - Draft Commands (if applicable)

**Check if these commands exist**:

- `civic records draft create`
- `civic records draft publish`
- `civic records draft list`

If they exist, add tests similar to API tests above.

#### 4.2 CLI - workflowState Support

**Missing Tests**:

```typescript
describe('CLI - workflowState', () => {
  it('should create record with workflowState flag', async () => {
    // Test: --workflow-state flag
  });

  it('should update workflowState via CLI', async () => {
    // Test: Update command with workflowState
  });
});
```

---

## 5. Record Parser

### Record Parser - Current Status

- ❌ **No dedicated tests** for RecordParser
- ❌ **No tests** for workflowState exclusion from YAML

### Record Parser - Missing Tests

**File**: `tests/core/record-parser.test.ts` (to be created)

```typescript
describe('RecordParser - workflowState Handling', () => {
  it('should parse record without workflowState in frontmatter', async () => {
    // Test: Parse markdown file without workflowState
    // Should not error
  });

  it('should ignore workflowState if present in frontmatter', async () => {
    // Test: If workflowState appears in YAML, ignore it
    // (it should never be there, but handle gracefully)
  });

  it('should serialize record without workflowState in frontmatter', async () => {
    // Test: Serialize RecordData with workflowState
    // Verify workflowState is NOT in output YAML
  });

  it('should preserve workflowState in RecordData but not in YAML', async () => {
    // Test: Round-trip: DB -> RecordData -> YAML -> RecordData
    // Verify workflowState persists in DB but not in file
  });
});
```

---

## 6. Database Adapter

### Database Adapter - Current Status

- ❌ **No tests** for schema migration (workflow_state column)
- ❌ **No tests** for workflow_state column operations

### Database Adapter - Missing Tests

**File**: `tests/core/database-adapter.test.ts` (to be created)

```typescript
describe('DatabaseAdapter - Schema', () => {
  it('should have workflow_state column in records table', async () => {
    // Test: Verify column exists
  });

  it('should have workflow_state column in record_drafts table', async () => {
    // Test: Verify column exists
  });

  it('should default workflow_state to "draft"', async () => {
    // Test: Schema default value
  });
});
```

---

## 7. Integration Tests

### Missing Integration Tests

**File**: `tests/integration/draft-publish-workflow.test.ts` (to be created)

```typescript
describe('Draft → Publish Workflow Integration', () => {
  it('should create draft, update workflowState, then publish', async () => {
    // Test: Full workflow
    // 1. Create draft
    // 2. Update workflowState to 'under_review'
    // 3. Update workflowState to 'ready_for_publication'
    // 4. Publish
    // Verify: workflowState preserved in DB, not in file
  });

  it('should handle concurrent draft updates', async () => {
    // Test: Multiple users updating same draft
  });

  it('should maintain workflowState across publish/unpublish cycles', async () => {
    // Test: Publish → Unpublish → Republish
  });
});
```

---

## Priority Ranking

### High Priority (Critical for Production)

1. **DatabaseService - workflowState operations** ✅ Create first
2. **API - Draft endpoints** ✅ Core functionality
3. **API - Publish endpoint** ✅ Core functionality
4. **RecordParser - workflowState exclusion** ✅ Data integrity

### Medium Priority

5. **RecordManager - Draft operations** ✅ Business logic
6. **API - workflowState validation** ✅ Input validation
7. **Integration - Draft → Publish workflow** ✅ End-to-end

### Low Priority (Nice to have)

8. **CLI - workflowState support** (if commands exist)
9. **DatabaseAdapter - Schema tests** ✅ Maintenance
10. **Performance tests** for draft operations

---

## Test Implementation Guidelines

### Test Structure

```typescript
// Example structure
describe('Feature Name', () => {
  beforeEach(() => {
    // Setup: Create test database, fixtures
  });

  afterEach(() => {
    // Cleanup: Remove test data
  });

  describe('Happy Path', () => {
    it('should ...', async () => {
      // Test successful operation
    });
  });

  describe('Error Handling', () => {
    it('should handle ...', async () => {
      // Test error cases
    });
  });

  describe('Edge Cases', () => {
    it('should handle ...', async () => {
      // Test edge cases
    });
  });
});
```

### Key Test Patterns

1. **workflowState Isolation**: Always verify workflowState is stored in DB but
   NOT in YAML
2. **Draft vs Published**: Verify drafts don't create files, published records
   do
3. **Permission Checks**: Test role-based access control
4. **Data Integrity**: Verify status and workflowState can be updated
   independently

---

## Next Steps

1. ✅ **Create DatabaseService tests** for workflowState operations
2. ✅ **Create RecordManager tests** for draft/publish
3. ✅ **Expand API records.test.ts** with draft endpoints
4. ✅ **Create RecordParser tests** for workflowState exclusion
5. ✅ **Create integration tests** for full workflows

---

## Notes

- All tests should use the test fixtures in `tests/fixtures/`
- Use `tests/utils/cli-test-utils.ts` for CLI tests
- Follow existing test patterns in `tests/api/` and `tests/core/`
- Consider using `describe.skip()` for tests that require infrastructure setup
