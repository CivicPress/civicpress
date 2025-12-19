# ADR-002: Saga Pattern for Multi-Step Operations

**Status**: Accepted  
**Date**: 2025-01-30  
**Deciders**: Architecture Team  
**Tags**: architecture, transactions, saga-pattern, reliability

---

## Context

CivicPress operations often span multiple storage boundaries:

1. **Database** (SQLite) - Local ACID transactions
2. **Git Repository** - Authoritative history (cannot be rolled back)
3. **File System** - Record files
4. **Indexing** - Derived state (can be rebuilt)

### Problem: Multi-Step Operations

Operations like `publishDraft` require:

1. Move record from `record_drafts` → `records` table (database)
2. Create published file (file system)
3. Commit to Git (authoritative history)
4. Delete draft (database)
5. Update search index (derived state)

**Challenge**: How to ensure reliability when operations span multiple
boundaries?

### Previous Approach

Operations were executed sequentially without coordination:

```typescript
// Old approach - no transaction coordination
await db.moveDraftToRecord(draftId);
await fs.createFile(recordPath, content);
await git.commit(recordPath);
await db.deleteDraft(draftId);
await indexingService.updateIndex(recordId);
```

**Problems**:

- If Git commit fails, database already updated (inconsistent state)
- No way to rollback Git commits (they're authoritative history)
- No idempotency (retrying could cause duplicates)
- No recovery mechanism for partial failures

---

## Decision

We will use the **Saga Pattern** (not distributed transactions) for multi-step
operations that span storage boundaries.

### Why Saga, Not Distributed Transactions?

1. **Git commits are authoritative history** - Cannot be "rolled back" without
   losing audit trail
2. **CivicPress philosophy: auditability over invisibility** - Rolling back
   commits erases evidence
3. **Derived state is eventually consistent** - Indexing failures don't need to
   rollback records
4. **True distributed transactions (2PC) don't work** across Git/DB/filesystem
   boundaries

### Saga Pattern Architecture

- **Local ACID**: Use SQLite transactions for database operations
- **Global Saga**: Use Saga pattern for cross-boundary operations
- **Git as Authoritative**: Git commits are never rolled back automatically
- **Derived State**: Indexing and hooks are fire-and-forget with retry

### Implementation

```typescript
// Saga execution
const saga = new PublishDraftSaga(context);
const result = await sagaExecutor.execute(saga);

// Saga steps
1. DatabaseService (transaction) - Can rollback
2. File System (create file) - Can cleanup
3. GitEngine (commit) - Never rollback (authoritative)
4. HookSystem (emit event) - Fire-and-forget
5. IndexingService (update index) - Fire-and-forget with retry
```

---

## Consequences

### Positive

✅ **Reliable multi-step operations** - Handles failures gracefully  
✅ **Respects Git as authoritative** - Never rolls back commits  
✅ **Clear failure states** - Explicit compensation logic  
✅ **Idempotency** - Safe to retry operations  
✅ **Audit trail** - Complete saga execution history  
✅ **Recovery** - Can recover from partial failures

### Negative

⚠️ **Complexity** - More complex than simple transactions  
⚠️ **Eventual consistency** - Derived state may be temporarily inconsistent  
⚠️ **Manual compensation** - Need to write compensation logic

### Neutral

- Operations are still atomic within each boundary
- Git commits provide permanent audit trail
- Derived state can be rebuilt if needed

---

## Implementation Details

### Saga Infrastructure

- **SagaExecutor**: Executes saga steps with error handling
- **SagaStateStore**: Persists saga state for recovery
- **IdempotencyManager**: Ensures operations are idempotent
- **ResourceLockManager**: Prevents concurrent execution
- **SagaRecovery**: Recovers from partial failures
- **SagaMetricsCollector**: Tracks saga execution metrics

### Implemented Sagas

1. **PublishDraftSaga**: Move draft to published record
2. **CreateRecordSaga**: Create new record
3. **UpdateRecordSaga**: Update existing record
4. **ArchiveRecordSaga**: Archive record

### Failure Strategy

- **ACID steps (DB)**: Rollback transaction on failure
- **Authoritative steps (Git)**: Operation fails, previous state remains (never
  rollback commits)
- **Derived state (indexing/hooks)**: Queue for retry, don't fail operation

---

## Alternatives Considered

### 1. Distributed Transactions (2PC)

**Approach**: Use two-phase commit across all boundaries

**Rejected because**:

- Git doesn't support 2PC
- Would require rolling back Git commits (violates auditability principle)
- Too complex for our use case
- Doesn't work across different storage types

### 2. Event Sourcing

**Approach**: Store all state changes as events

**Rejected because**:

- Major architectural change
- Git already provides event sourcing (commits)
- Would duplicate functionality
- Too complex for current needs

### 3. Choreography Pattern

**Approach**: Services coordinate via events

**Rejected because**:

- Less control over execution order
- Harder to ensure consistency
- More complex error handling
- Doesn't fit our synchronous operation model

### 4. Orchestration Pattern (Current)

**Approach**: Central orchestrator coordinates steps

**Chosen because**:

- Clear execution flow
- Easy to understand
- Good error handling
- Fits our architecture

---

## References

- Specification: `docs/specs/saga-pattern.md`
- Usage Guide: `docs/saga-pattern-usage-guide.md`
- Implementation: `core/src/saga/`
- All 4 sagas implemented and in production use

---

## Notes

- All 4 sagas fully implemented and tested
- Comprehensive test coverage (1,167+ tests passing)
- Production-ready with compensation logic, timeout handling, and error recovery
- Complete documentation and usage guides
