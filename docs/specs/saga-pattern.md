# Saga Pattern for Multi-Step Operations

**Version:** 1.0.0  
**Status:** implemented  
**Created:** 2025-12-18  
**Updated:** 2025-12-18  
**Deprecated:** false

## Overview

This specification defines the Saga pattern implementation for CivicPress
multi-step operations that span multiple storage boundaries (database, Git,
filesystem, indexing).

## Problem Statement

CivicPress operations like `publishDraft`, `createRecord`, `updateRecord`, and
`archiveRecord` involve multiple steps:

1. **Database operations** (local ACID transactions)
2. **File system operations** (Git working tree)
3. **Git commits** (authoritative history - cannot be rolled back)
4. **Indexing** (derived state - can be rebuilt)
5. **Hooks/Workflows** (derived state - async)

The challenge: **We cannot use traditional distributed transactions** because:

- Git commits are authoritative history (cannot be "rolled back" without losing
  audit trail)
- Indexing is derived state (can be rebuilt, doesn't need rollback)
- CivicPress philosophy: **auditability over invisibility**

## Solution: Saga Pattern

### Core Principles

1. **Local ACID + Global Saga**
   - Use ACID transactions within single storage boundaries (e.g., SQLite for
     DB)
   - Use Saga pattern for cross-boundary operations

2. **Git as Authoritative History**
   - Git commits are **never rolled back** automatically
   - If a Git commit fails, the operation fails (record remains in previous
     state)
   - If later steps fail, create compensating actions (not rollbacks)

3. **Derived State is Eventually Consistent**
   - Indexing failures don't rollback records
   - Indexing is queued for retry/rebuild
   - Hooks/workflows are fire-and-forget (with retry mechanisms)

4. **Clear Failure States**
   - Each step has a clear failure state
   - Operations produce audit trails
   - Status is always queryable

## Architecture

### Saga Structure

```typescript
interface SagaStep<TContext, TResult> {
  name: string;
  execute(context: TContext): Promise<TResult>;
  compensate?(context: TContext, result: TResult): Promise<void>;
  isCompensatable: boolean; // Can this step be compensated?
}

interface Saga<TContext, TFinalResult> {
  steps: SagaStep<TContext, any>[];
  execute(context: TContext): Promise<TFinalResult>;
}
```

### Step Categories

#### 1. **ACID Steps** (Local Transactions)

- Database writes (within SQLite transaction)
- **Compensatable:** Yes (can delete/update within transaction)
- **Failure Strategy:** Rollback transaction

#### 2. **Authoritative Steps** (Git Commits)

- Git commits (authoritative history)
- **Compensatable:** No (never rollback Git commits)
- **Failure Strategy:** Operation fails, previous state remains

#### 3. **Derived State Steps** (Indexing, Hooks)

- Indexing updates
- Hook emissions
- **Compensatable:** No (derived state, can be rebuilt)
- **Failure Strategy:** Queue for retry, don't fail operation

## Implementation Pattern

### Example: PublishDraft Saga

```typescript
class PublishDraftSaga {
  async execute(draftId: string, user: AuthUser): Promise<RecordData> {
    const context = { draftId, user, record: null, commitHash: null };

    try {
      // Step 1: Move from record_drafts to records table (ACID)
      context.record = await this.step1_moveToRecords(context);

      // Step 2: Create file in Git working tree
      await this.step2_createFile(context);

      // Step 3: Commit to Git (Authoritative - no rollback)
      context.commitHash = await this.step3_commitToGit(context);

      // Step 4: Delete from record_drafts (ACID)
      await this.step4_deleteDraft(context);

      // Step 5: Queue indexing (Derived - fire and forget)
      await this.step5_queueIndexing(context);

      // Step 6: Emit hooks (Derived - fire and forget)
      await this.step6_emitHooks(context);

      return context.record;

    } catch (error) {
      // Compensate only compensatable steps
      await this.compensate(context, error);
      throw error;
    }
  }

  private async compensate(context: PublishDraftContext, error: Error): Promise<void> {
    // Step 4: Delete draft - if we got here, draft still exists (no compensation needed)

    // Step 3: Git commit - NEVER rollback (authoritative history)
    // If commit succeeded but later steps failed, record is published (intended state)

    // Step 2: File creation - if commit failed, file is uncommitted (can be cleaned up)
    if (context.commitHash === null && context.record) {
      await this.cleanupUncommittedFile(context.record);
    }

    // Step 1: Move to records - if commit failed, move back to record_drafts
    if (context.commitHash === null && context.record) {
      await this.moveBackToDrafts(context.record);
    }
  }
}
```

### Failure Scenarios

#### Scenario 1: Git Commit Fails

- **State:** Record in `records` table, file exists but uncommitted
- **Compensation:** Move record back to `record_drafts`, delete uncommitted file
- **Result:** Draft remains, no Git history created

#### Scenario 2: Indexing Fails

- **State:** Record published, Git commit succeeded
- **Compensation:** None (indexing is derived state)
- **Result:** Record is published, indexing queued for retry

#### Scenario 3: Hook Emission Fails

- **State:** Record published, Git commit succeeded
- **Compensation:** None (hooks are derived state)
- **Result:** Record is published, hooks retried later

## Operations Requiring Saga Pattern

### 1. **PublishDraft**

**Steps:**

1. Move from `record_drafts` to `records` table (ACID)
2. Create file in Git working tree
3. Commit to Git (Authoritative)
4. Delete from `record_drafts` (ACID)
5. Queue indexing (Derived)
6. Emit `record:published` hook (Derived)

**Failure Points:**

- Git commit fails → Move back to `record_drafts`
- Indexing fails → Record published, indexing queued
- Hook fails → Record published, hook retried

### 2. **CreateRecord** (Direct Published Record)

**Steps:**

1. Create in `records` table (ACID)
2. Create file in Git working tree
3. Commit to Git (Authoritative)
4. Queue indexing (Derived)
5. Emit `record:created` hook (Derived)

**Failure Points:**

- Git commit fails → Delete from `records` table
- Indexing fails → Record created, indexing queued
- Hook fails → Record created, hook retried

### 3. **UpdateRecord**

**Steps:**

1. Update in `records` table (ACID)
2. Update file in Git working tree
3. Commit to Git (Authoritative)
4. Queue re-indexing (Derived)
5. Emit `record:updated` hook (Derived)

**Failure Points:**

- Git commit fails → Revert DB update (within transaction)
- Indexing fails → Record updated, indexing queued
- Hook fails → Record updated, hook retried

### 4. **ArchiveRecord**

**Steps:**

1. Update status to `archived` in `records` table (ACID)
2. Move file to archive folder
3. Commit to Git (Authoritative)
4. Remove from index (Derived)
5. Emit `record:archived` hook (Derived)

**Failure Points:**

- Git commit fails → Revert status update (within transaction)
- Indexing fails → Record archived, index cleanup queued
- Hook fails → Record archived, hook retried

## Implementation Guidelines

### Do's

✅ **Use ACID transactions for database operations**

- Wrap multiple DB operations in a transaction
- Rollback on failure

✅ **Treat Git commits as authoritative**

- Never automatically rollback Git commits
- If commit succeeds, operation succeeds (even if derived steps fail)

✅ **Queue derived state operations**

- Indexing failures don't fail the operation
- Hooks are fire-and-forget with retry

✅ **Provide clear failure states**

- Operations return clear status
- Audit trail shows what happened

✅ **Compensate only compensatable steps**

- Database operations: compensate
- Git commits: never compensate
- Derived state: no compensation needed

### Don'ts

❌ **Don't rollback Git commits**

- Git history is authoritative
- Rolling back erases audit trail

❌ **Don't fail operations due to derived state**

- Indexing failures shouldn't fail record operations
- Hook failures shouldn't fail record operations

❌ **Don't use distributed transactions**

- 2PC doesn't work across Git/DB/filesystem
- Saga pattern is the correct approach

❌ **Don't hide failures**

- Always produce audit trail
- Status should be queryable

## Error Handling

### Error Types

```typescript
class SagaStepError extends CivicPressError {
  constructor(
    public step: string,
    public context: any,
    public originalError: Error
  ) {
    super(`Saga step failed: ${step}`, originalError);
  }
}

class UncompensatableFailureError extends CivicPressError {
  constructor(
    public step: string,
    public context: any
  ) {
    super(`Uncompensatable step failed: ${step}. Manual intervention required.`);
  }
}
```

### Error Recovery

1. **Compensatable failures:** Automatically compensate
2. **Uncompensatable failures:** Log error, return clear status
3. **Derived state failures:** Log error, queue for retry

## Testing Strategy

### Unit Tests

- Test each saga step independently
- Test compensation logic
- Test failure scenarios

### Integration Tests

- Test full saga execution
- Test partial failures
- Test compensation

### Failure Injection Tests

- Inject failures at each step
- Verify compensation behavior
- Verify audit trail

## Implementation Status

✅ **All sagas have been implemented and are in production use:**

1. **PublishDraftSaga** - ✅ Implemented
   - Publishes draft records to published state
   - Handles both new record creation and existing record updates
   - Full compensation support

2. **CreateRecordSaga** - ✅ Implemented
   - Creates published records directly (bypassing drafts)
   - Automatic saga usage for published records
   - Document number generation for legal types

3. **UpdateRecordSaga** - ✅ Implemented
   - Updates published records
   - Stores original state for compensation
   - Automatic saga usage for published records

4. **ArchiveRecordSaga** - ✅ Implemented
   - Archives records (soft delete)
   - Moves files to archive folder
   - Removes from search index

All sagas are automatically used by `RecordManager` methods when appropriate
(published records use sagas, drafts use legacy flow for backward
compatibility).

## Related Documentation

- [Architecture Analysis](../architecture-analysis-and-improvements.md) -
  Overall architecture
- [Usage Guide](../saga-pattern-usage-guide.md) - How to use sagas in your code
- [Records Architecture](../architecture-records-drafts.md) - Draft vs Published
- [Git Engine Spec](./git-engine.md) - Git operations
- [Indexing Spec](./indexing.md) - Indexing system
- [Hooks Spec](./hooks.md) - Hook system

## Implementation Details

### Core Components

All saga infrastructure is located in `core/src/saga/`:

- **`types.ts`** - Type definitions and interfaces
- **`errors.ts`** - Saga-specific error classes
- **`saga-step.ts`** - Base step class with common functionality
- **`saga-state-store.ts`** - State persistence for recovery
- **`idempotency.ts`** - Idempotency management
- **`resource-lock.ts`** - Concurrency control
- **`saga-executor.ts`** - Core orchestration engine
- **`saga-recovery.ts`** - Recovery mechanism for failed sagas
- **`saga-metrics.ts`** - Observability and metrics

### Saga Implementations

- **`publish-draft-saga.ts`** - PublishDraftSaga
- **`create-record-saga.ts`** - CreateRecordSaga
- **`update-record-saga.ts`** - UpdateRecordSaga
- **`archive-record-saga.ts`** - ArchiveRecordSaga

### Usage

Sagas are automatically used by `RecordManager` methods:

```typescript
// PublishDraftSaga - automatically used
await recordManager.publishDraft(draftId, user, targetStatus);

// CreateRecordSaga - automatically used for published records
await recordManager.createRecord(request, user); // Uses saga if status !== 'draft'

// UpdateRecordSaga - automatically used for published records
await recordManager.updateRecord(id, request, user); // Uses saga if record is published

// ArchiveRecordSaga - automatically used
await recordManager.archiveRecord(id, user);
```

### Features Implemented

✅ **Idempotency & Retry Safety** - All operations are idempotent via
correlation IDs ✅ **Saga State Persistence** - State persisted in `saga_states`
table for recovery ✅ **Concurrency Control** - Resource locking via
`saga_resource_locks` table ✅ **Compensation Failure Handling** - Comprehensive
compensation with failure handling ✅ **Database Transaction Boundaries** -
Transaction support in DatabaseAdapter ✅ **Observability** - Metrics collection
and state tracking ✅ **Recovery** - Saga recovery mechanism for stuck/failed
sagas

## See Also

- [Saga Pattern (Martin Fowler)](https://microservices.io/patterns/data/saga.html)
- [Event Sourcing and CQRS](https://martinfowler.com/eaaDev/EventSourcing.html)
