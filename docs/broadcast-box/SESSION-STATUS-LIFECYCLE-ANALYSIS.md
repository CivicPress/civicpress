# Session Status Lifecycle - Analysis & Recommendation

**Date**: 2025-01-30  
**Question**: How to sync broadcast-box session status with CivicPress session
record status?

---

## Current State Analysis

### 1. Broadcast-Box Session Status (Technical/Operational)

**Location**: `broadcast_sessions` table  
**Purpose**: Track recording/upload technical state

**Statuses**:

- `pending` - Recording requested but not started
- `recording` - Actively recording
- `stopping` - Recording stop requested
- `encoding` - Recording stopped, encoding video
- `uploading` - Encoding complete, uploading to storage
- `complete` - Upload complete, ready for use
- `failed` - Error occurred at any stage

**Characteristics**:

- Technical/operational focus
- Internal to broadcast-box module
- Tracks recording pipeline state
- Not visible to end users directly

### 2. CivicPress Session Record Status (Business/Logical)

**Location**: `records` table (session type records)  
**Purpose**: Track meeting/session business state

**Standard Statuses** (from record-statuses.ts):

- `draft` - Initial working version
- `pending_review` - Submitted for review
- `under_review` - Currently under review
- `approved` - Approved and in effect
- `published` - Publicly available
- `rejected` - Rejected
- `archived` - No longer active
- `expired` - Past effective date

**Session-Specific States** (from session-recorder-integration.md):

- `scheduled` - Meeting scheduled
- `live` - Meeting in progress
- `ended` - Meeting concluded
- `uploading` - Post-meeting processing
- `archived` - Finalized and archived

**Characteristics**:

- Business/logical focus
- Visible to users
- Governed by workflow engine
- Requires permission/role validation
- Auditable transitions

---

## Key Principles (Top 0.1% Engineering)

### 1. **Separation of Concerns**

- Technical status ≠ Business status
- Different purposes, different lifecycles
- Don't tightly couple them

### 2. **Event-Driven Architecture**

- Status changes emit events
- Workflows react to events
- Loose coupling between systems

### 3. **Workflow Automation**

- Use CivicPress workflow engine
- Municipalities can customize behavior
- No hardcoded logic

### 4. **Selective Synchronization**

- Only sync meaningful events
- Internal technical states stay internal
- Business status changes require validation

---

## Recommended Solution: Event-Driven Status Mapping

### Architecture

```
Broadcast-Box Status Change
    ↓
Emit Hook Event
    ↓
Workflow Engine Processes Event
    ↓
Workflow Decides Business Status Change
    ↓
Update Session Record Status (if needed)
```

### Status Mapping Strategy

**Meaningful Events** (sync to business status):

- `recording` → `live` (when recording starts, session is live)
- `complete` → `ended` (when recording complete, session ended)
- `failed` → Keep current status (error doesn't change business state)

**Internal Events** (don't sync):

- `pending` → No change (internal state)
- `stopping` → No change (internal state)
- `encoding` → No change (internal state)
- `uploading` → No change (internal state)

**Manual Override**:

- Clerks can manually change session status
- Workflow validates transitions
- Broadcast-box status doesn't override manual changes

---

## Implementation Pattern

### 1. Hook Events (Emitted by Broadcast-Box Module)

```typescript
// When broadcast-box session status changes
async function onBroadcastSessionStatusChange(
  broadcastSession: BroadcastSession,
  previousStatus: SessionStatus,
  newStatus: SessionStatus
): Promise<void> {
  const hookSystem = container.resolve<HookSystem>('hookSystem');

  // Emit hook event
  await hookSystem.emit('broadcast-box:session:status_changed', {
    broadcastSessionId: broadcastSession.id,
    civicpressSessionId: broadcastSession.civicpressSessionId,
    previousStatus,
    newStatus,
    timestamp: new Date().toISOString()
  });
}
```

### 2. Workflow Script (Municipality Customizable)

**File**: `data/.civic/workflows/onBroadcastSessionStatusChanged.js`

```javascript
module.exports = async ({ broadcastSessionId, civicpressSessionId, previousStatus, newStatus, context }) => {
  const civic = context.civic;

  // Get session record
  const session = await civic.getRecord(civicpressSessionId);
  if (!session) {
    console.warn(`Session record ${civicpressSessionId} not found`);
    return;
  }

  // Map technical status to business status
  const statusMapping = {
    'recording': 'live',      // Recording started → session is live
    'complete': 'ended',      // Recording complete → session ended
    'failed': null            // Failed → keep current status
  };

  const targetBusinessStatus = statusMapping[newStatus];

  // Only update if mapping exists and status is different
  if (targetBusinessStatus && session.status !== targetBusinessStatus) {
    // Validate transition using workflow engine
    const canTransition = await civic.canTransitionStatus(
      session.status,
      targetBusinessStatus,
      context.user?.role || 'system'
    );

    if (canTransition) {
      // Update session record status
      await civic.updateRecord(civicpressSessionId, {
        status: targetBusinessStatus,
        metadata: {
          ...session.metadata,
          broadcastSessionStatus: newStatus,
          broadcastSessionStatusUpdatedAt: new Date().toISOString()
        }
      });

      console.log(`Session ${civicpressSessionId} status updated: ${session.status} → ${targetBusinessStatus}`);
    } else {
      console.warn(`Cannot transition session ${civicpressSessionId} from ${session.status} to ${targetBusinessStatus}`);
    }
  }

  // Log status change for audit
  await civic.logEvent({
    type: 'broadcast_session_status_changed',
    sessionId: civicpressSessionId,
    broadcastSessionId,
    previousStatus,
    newStatus,
    businessStatus: session.status
  });
};
```

### 3. Status Tracking in Metadata

Store broadcast-box status in session record metadata for reference:

```json
{
  "metadata": {
    "broadcastSessionStatus": "recording",
    "broadcastSessionStatusUpdatedAt": "2025-01-30T14:00:00Z",
    "broadcastSessionId": "broadcast-session-uuid"
  }
}
```

**Benefits**:

- Quick lookup of technical status
- Audit trail of status changes
- No database schema changes needed

---

## Status Transition Matrix

| Broadcast-Box Status | Business Status Change | Workflow Action             | Notes                               |
| -------------------- | ---------------------- | --------------------------- | ----------------------------------- |
| `pending`            | None                   | None                        | Internal state, no sync             |
| `recording`          | → `live`               | Update if not already live  | Recording started = session live    |
| `stopping`           | None                   | None                        | Internal state, no sync             |
| `encoding`           | None                   | None                        | Internal state, no sync             |
| `uploading`          | None                   | None                        | Internal state, no sync             |
| `complete`           | → `ended`              | Update if not already ended | Recording done = session ended      |
| `failed`             | None                   | Log error                   | Error doesn't change business state |

**Important**: Business status can be manually changed by clerks. Broadcast-box
status is informational only.

---

## Advanced Scenarios

### Scenario 1: Manual Status Override

**Situation**: Clerk manually changes session status to `ended` before recording
completes.

**Behavior**:

- Broadcast-box continues recording/uploading
- Business status remains `ended` (manual override)
- When broadcast-box completes, workflow checks current status
- If already `ended`, no change (respects manual override)

### Scenario 2: Recording Starts Before Session Scheduled

**Situation**: Recording starts but session status is still `scheduled`.

**Behavior**:

- Workflow validates transition: `scheduled` → `live`
- If valid, updates to `live`
- If invalid (workflow rules prevent), logs warning, keeps `scheduled`
- Broadcast-box status stored in metadata for reference

### Scenario 3: Multiple Recordings

**Situation**: Session has multiple recordings (different devices/angles).

**Behavior**:

- Each broadcast-session tracks its own status
- Business status reflects overall session state
- Workflow can use "any recording active" → `live`
- Workflow can use "all recordings complete" → `ended`

### Scenario 4: Recording Fails

**Situation**: Recording fails (`failed` status).

**Behavior**:

- Business status unchanged (error doesn't change meeting state)
- Error logged in metadata
- Notification sent to clerks
- Manual intervention required

---

## Implementation Details

### 1. Hook Registration

**File**: `modules/broadcast-box/src/workflows/triggers.ts`

```typescript
import { HookSystem } from '@civicpress/core';

export function registerBroadcastBoxHooks(hookSystem: HookSystem): void {
  // Hook is emitted when broadcast session status changes
  // Workflow scripts in data/.civic/workflows/ handle the event
}
```

### 2. Status Change Handler

**File**: `modules/broadcast-box/src/services/session-controller.ts`

```typescript
async function updateBroadcastSessionStatus(
  sessionId: string,
  newStatus: SessionStatus
): Promise<void> {
  // Update database
  const session = await this.getSession(sessionId);
  const previousStatus = session.status;

  await this.db.updateBroadcastSession(sessionId, {
    status: newStatus,
    updated_at: new Date()
  });

  // Emit hook event
  await this.hookSystem.emit('broadcast-box:session:status_changed', {
    broadcastSessionId: sessionId,
    civicpressSessionId: session.civicpressSessionId,
    previousStatus,
    newStatus,
    timestamp: new Date().toISOString()
  });

  // Update session record metadata (always, for reference)
  await this.updateSessionRecordMetadata(
    session.civicpressSessionId,
    {
      broadcastSessionStatus: newStatus,
      broadcastSessionStatusUpdatedAt: new Date().toISOString(),
      broadcastSessionId: sessionId
    }
  );
}
```

### 3. Metadata Update Helper

```typescript
async function updateSessionRecordMetadata(
  sessionId: string,
  metadata: Record<string, any>
): Promise<void> {
  const recordManager = container.resolve<RecordManager>('recordManager');
  const session = await recordManager.getRecord(sessionId);

  if (!session) {
    return; // Session not found, skip
  }

  await recordManager.updateRecord(sessionId, {
    metadata: {
      ...session.metadata,
      ...metadata
    }
  }, {
    username: 'broadcast-box-system',
    role: 'system'
  });
}
```

---

## Benefits of This Approach

### ✅ Separation of Concerns

- Technical status separate from business status
- Each serves its purpose
- No tight coupling

### ✅ Flexibility

- Municipalities customize via workflow scripts
- Different rules for different scenarios
- No hardcoded logic

### ✅ Auditability

- All status changes logged
- Hook events provide audit trail
- Metadata tracks technical state

### ✅ Reliability

- Workflow validates transitions
- Manual overrides respected
- Error handling built-in

### ✅ Extensibility

- Easy to add new status mappings
- Support for multiple recordings
- Future scenarios supported

---

## Configuration Example

**File**: `data/.civic/workflows.yml`

```yaml
# Broadcast-box status mapping configuration
broadcast_box:
  status_mapping:
    recording: live      # Recording started → session live
    complete: ended      # Recording complete → session ended
    failed: null         # Failed → no change

  # Optional: Require all recordings complete before ending
  require_all_complete: false

  # Optional: Auto-archive when complete
  auto_archive: false
```

---

## Summary

**Recommended Approach**: **Event-Driven Status Mapping with Workflow
Automation**

1. **Keep statuses separate**: Technical status in `broadcast_sessions`,
   business status in `records`
2. **Emit hook events**: When broadcast-box status changes, emit
   `broadcast-box:session:status_changed`
3. **Workflow handles mapping**: Workflow scripts decide if business status
   should change
4. **Store in metadata**: Keep broadcast-box status in session record metadata
   for reference
5. **Respect manual overrides**: Business status changes by clerks take
   precedence
6. **Validate transitions**: Workflow engine validates all status transitions

**Key Benefits**:

- ✅ Loose coupling
- ✅ Flexible and customizable
- ✅ Auditable
- ✅ Reliable
- ✅ Extensible

**Trade-offs**:

- ⚠️ Requires workflow script (but that's a feature, not a bug)
- ⚠️ Slight delay (async workflow processing)

---

**Status**: Ready for implementation  
**Next Step**: Update spec with this recommendation
