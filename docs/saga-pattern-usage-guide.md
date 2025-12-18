# Saga Pattern Usage Guide

**Version:** 1.0.0  
**Status:** Complete  
**Last Updated:** 2025-12-18

## Overview

This guide provides practical examples and best practices for using the Saga
Pattern in CivicPress. The saga pattern is automatically used for all published
record operations, ensuring reliable multi-step operations with proper error
handling and compensation.

## Quick Start

### Using Sagas (Automatic)

Sagas are automatically used by `RecordManager` methods. No code changes needed:

```typescript
import { CivicPress } from '@civicpress/core';

const civic = new CivicPress({ dataDir: './data' });
await civic.initialize();

const recordManager = civic.getRecordManager();

// PublishDraftSaga - automatically used
const published = await recordManager.publishDraft('draft-123', user, 'published');

// CreateRecordSaga - automatically used for published records
const record = await recordManager.createRecord({
  title: 'New Bylaw',
  type: 'bylaw',
  content: '# Content',
  status: 'published', // Saga used because status !== 'draft'
}, user);

// UpdateRecordSaga - automatically used for published records
const updated = await recordManager.updateRecord('record-123', {
  title: 'Updated Title',
  content: '# Updated Content',
}, user);

// ArchiveRecordSaga - automatically used
const archived = await recordManager.archiveRecord('record-123', user);
```

### Manual Saga Execution

For advanced use cases, you can execute sagas manually:

```typescript
import {
  PublishDraftSaga,
  SagaExecutor,
  SagaStateStore,
  IdempotencyManager,
  ResourceLockManager,
} from '@civicpress/core/saga';

// Create saga executor
const stateStore = new SagaStateStore(db);
const idempotencyManager = new IdempotencyManager(stateStore);
const lockManager = new ResourceLockManager(db);
const executor = new SagaExecutor(stateStore, idempotencyManager, lockManager);

// Create saga
const saga = new PublishDraftSaga(
  db,
  recordManager,
  gitEngine,
  hookSystem,
  indexingService,
  dataDir
);

// Create context
const context = {
  correlationId: `publish-${draftId}-${Date.now()}`,
  startedAt: new Date(),
  draftId: 'draft-123',
  user: user,
  targetStatus: 'published',
  metadata: {
    recordId: 'draft-123',
    draftId: 'draft-123',
  },
};

// Execute saga
const result = await executor.execute(saga, context);
console.log('Published record:', result.result);
```

## Saga Context

All sagas require a context that extends `SagaContext`:

```typescript
interface SagaContext {
  correlationId: string;        // Required: Unique ID for tracing
  idempotencyKey?: string;      // Optional: For idempotent operations
  startedAt: Date;              // Required: When saga started
  user?: {                      // Optional: User info
    id: string | number;
    username: string;
    role: string;
  };
  metadata?: Record<string, any>; // Optional: Additional metadata
}
```

### Generating Correlation IDs

```typescript
// Simple correlation ID
const correlationId = `operation-${recordId}-${Date.now()}`;

// With request ID (if available)
const correlationId = requestId || `operation-${recordId}-${Date.now()}`;

// With user context
const correlationId = `${user.id}-${operation}-${Date.now()}`;
```

## Idempotency

Sagas support idempotency via `idempotencyKey`:

```typescript
const context = {
  correlationId: `publish-${draftId}-${Date.now()}`,
  idempotencyKey: `publish-draft-${draftId}`, // Same key = same result
  startedAt: new Date(),
  draftId,
  user,
};

// First execution
const result1 = await executor.execute(saga, context);

// Second execution with same idempotencyKey - returns cached result
const result2 = await executor.execute(saga, {
  ...context,
  correlationId: `publish-${draftId}-${Date.now()}-2`, // Different correlation ID
});

// result1.result === result2.result (same record)
```

## Error Handling

### Handling Saga Failures

```typescript
try {
  const result = await recordManager.publishDraft(draftId, user);
  console.log('Published:', result);
} catch (error) {
  if (error instanceof SagaStepError) {
    console.error('Saga step failed:', error.step);
    console.error('Original error:', error.originalError);
    // Compensation has been attempted
  } else if (error instanceof SagaCompensationError) {
    console.error('Compensation failed:', error.step);
    // Manual intervention may be required
  } else {
    console.error('Saga failed:', error);
  }
}
```

### Checking Saga State

```typescript
import { SagaStateStore } from '@civicpress/core/saga';

const stateStore = new SagaStateStore(db);

// Get saga state by ID
const state = await stateStore.getState(sagaId);
console.log('Status:', state?.status); // 'executing', 'completed', 'failed'
console.log('Current step:', state?.currentStep);
console.log('Error:', state?.error);

// Get failed sagas
const failedSagas = await stateStore.getFailedSagas();
console.log('Failed sagas:', failedSagas);

// Get stuck sagas (executing too long)
const stuckSagas = await stateStore.getStuckSagas(300000); // 5 minutes
console.log('Stuck sagas:', stuckSagas);
```

## Recovery

### Recovering Failed Sagas

```typescript
import { SagaRecovery } from '@civicpress/core/saga';

const recovery = new SagaRecovery(stateStore);

// Recover stuck sagas
const recovered = await recovery.recoverStuckSagas();
console.log(`Recovered ${recovered} stuck sagas`);

// Recover failed sagas
const failed = await recovery.recoverFailedSagas();
console.log(`Processed ${failed} failed sagas`);

// Get recovery statistics
const stats = await recovery.getRecoveryStats();
console.log('Recovery stats:', stats);
```

## Observability

### Metrics

```typescript
import { sagaMetrics } from '@civicpress/core/saga';

// Get metrics for a saga type
const metrics = sagaMetrics.getMetrics('PublishDraft');
console.log('Execution count:', metrics?.executionCount);
console.log('Success count:', metrics?.successCount);
console.log('Failure count:', metrics?.failureCount);
console.log('Average duration:', metrics?.averageDuration);
console.log('P95 duration:', metrics?.p95Duration);

// Get all metrics
const allMetrics = sagaMetrics.getAllMetrics();
allMetrics.forEach(m => {
  console.log(`${m.sagaType}: ${m.successCount}/${m.executionCount} successful`);
});
```

## Best Practices

### 1. Always Provide Correlation IDs

```typescript
// ✅ Good
const context = {
  correlationId: `publish-${draftId}-${Date.now()}`,
  // ...
};

// ❌ Bad
const context = {
  // Missing correlationId
  // ...
};
```

### 2. Use Idempotency Keys for Retries

```typescript
// ✅ Good - retries are safe
const context = {
  correlationId: `publish-${draftId}-${Date.now()}`,
  idempotencyKey: `publish-draft-${draftId}`,
  // ...
};

// ❌ Bad - retries may create duplicates
const context = {
  correlationId: `publish-${draftId}-${Date.now()}`,
  // No idempotencyKey
  // ...
};
```

### 3. Handle Compensation Failures

```typescript
try {
  await executor.execute(saga, context);
} catch (error) {
  if (error instanceof SagaCompensationError) {
    // Compensation failed - manual intervention may be needed
    console.error('Compensation failed - check state:', error.step);
    // Log to monitoring system
    // Alert operations team
  }
}
```

### 4. Monitor Saga Metrics

```typescript
// Regularly check metrics
const metrics = sagaMetrics.getMetrics('PublishDraft');
if (metrics && metrics.failureCount > metrics.successCount) {
  console.warn('High failure rate detected!');
  // Alert operations team
}
```

### 5. Set Appropriate Timeouts

```typescript
// For long-running operations
const executor = new SagaExecutor(stateStore, idempotencyManager, lockManager, {
  defaultTimeout: 600000, // 10 minutes
  defaultStepTimeout: 120000, // 2 minutes per step
});
```

## Common Patterns

### Pattern 1: Publishing with Retry

```typescript
async function publishWithRetry(
  draftId: string,
  user: AuthUser,
  maxRetries: number = 3
): Promise<RecordData> {
  const idempotencyKey = `publish-draft-${draftId}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await recordManager.publishDraft(
        draftId,
        user,
        undefined, // targetStatus
        undefined, // sagaExecutor
        undefined, // indexingService
        `${idempotencyKey}-attempt-${attempt}` // correlationId
      );
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  throw new Error('Max retries exceeded');
}
```

### Pattern 2: Batch Operations

```typescript
async function publishMultipleDrafts(
  draftIds: string[],
  user: AuthUser
): Promise<RecordData[]> {
  const results = await Promise.allSettled(
    draftIds.map(draftId =>
      recordManager.publishDraft(
        draftId,
        user,
        undefined,
        undefined,
        undefined,
        `batch-publish-${draftId}-${Date.now()}`
      )
    )
  );

  const successful = results
    .filter((r): r is PromiseFulfilledResult<RecordData> => r.status === 'fulfilled')
    .map(r => r.value);

  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => r.reason);

  if (failed.length > 0) {
    console.warn(`${failed.length} drafts failed to publish`);
  }

  return successful;
}
```

### Pattern 3: Monitoring Saga Health

```typescript
async function checkSagaHealth(): Promise<{
  healthy: boolean;
  issues: string[];
}> {
  const stateStore = new SagaStateStore(db);
  const recovery = new SagaRecovery(stateStore);

  const stats = await recovery.getRecoveryStats();
  const issues: string[] = [];

  if (stats.stuckCount > 0) {
    issues.push(`${stats.stuckCount} stuck sagas detected`);
  }

  if (stats.failedCount > 10) {
    issues.push(`${stats.failedCount} failed sagas (threshold: 10)`);
  }

  // Check metrics
  const allMetrics = sagaMetrics.getAllMetrics();
  for (const m of allMetrics) {
    const failureRate = m.executionCount > 0
      ? m.failureCount / m.executionCount
      : 0;

    if (failureRate > 0.1) { // 10% failure rate
      issues.push(`${m.sagaType} has high failure rate: ${(failureRate * 100).toFixed(1)}%`);
    }
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}
```

## Troubleshooting

### Issue: Saga Stuck in "executing" State

**Symptoms:** Saga state shows `status: 'executing'` for a long time

**Solution:**

```typescript
const recovery = new SagaRecovery(stateStore);
await recovery.recoverStuckSagas();
```

### Issue: Compensation Fails

**Symptoms:** `SagaCompensationError` thrown

**Solution:**

1. Check saga state for details
2. Manually verify system state
3. May require manual intervention

### Issue: High Failure Rate

**Symptoms:** Many sagas failing

**Solution:**

1. Check metrics: `sagaMetrics.getMetrics('SagaName')`
2. Review error logs
3. Check system resources (database, disk, Git)
4. Verify permissions

### Issue: Idempotency Not Working

**Symptoms:** Duplicate operations despite idempotency key

**Solution:**

1. Verify `idempotencyKey` is consistent across retries
2. Check idempotency TTL (default: 24 hours)
3. Verify `IdempotencyManager` is working correctly

## Related Documentation

- [Saga Pattern Specification](../specs/saga-pattern.md) - Complete
  specification
- [Saga Pattern Specification](../specs/saga-pattern.md) - Complete
  specification
- [Architecture Analysis](../architecture-analysis-and-improvements.md) -
  Overall architecture
- [Error Handling](../error-handling.md) - Error handling patterns
