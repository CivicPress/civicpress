# Automated Device Control Analysis

## Question
**Can CivicPress control devices automatically without human interaction for scheduled sessions (e.g., starting at 7PM)?**

## Current State Analysis

### ✅ What EXISTS

#### 1. **Event-Driven Automation (Workflows & Hooks)**
- **Hook System**: CivicPress has a robust hook system that triggers workflows on events
- **Session Hooks Available**:
  - `session:created` - When a session record is created
  - `session:started` - When a session status changes to "live"
  - `session:ended` - When a session ends
- **Broadcast Box Workflow Triggers**: Already registered in `BroadcastBoxWorkflowTriggers`
  - `onSessionCreated` - Can auto-start recording if `autoRecord` flag is set
  - `onSessionEnd` - Can auto-stop recording when session ends

#### 2. **Auto-Record Feature (Event-Based)**
**Location**: `modules/broadcast-box/src/workflows/triggers.ts`

The system **already supports** automatic recording when a session is created:

```typescript
// When session:created hook fires
if (data.record.metadata?.broadcastBox?.autoRecord) {
  // Automatically starts recording
  await this.sessionController.startSession({
    deviceId,
    civicpressSessionId: data.record.id,
    // ... config from metadata
  });
}
```

**How it works**:
- Session record created with `metadata.broadcastBox.autoRecord = true`
- Hook `session:created` fires
- Workflow checks for `autoRecord` flag
- Automatically calls `sessionController.startSession()`
- Device receives `start_session` command via WebSocket

**Limitation**: This is **event-driven**, not **time-based**. It triggers when the session record is created, not at the scheduled time.

#### 3. **Session Scheduling Data**
- Sessions have a `date` field (ISO 8601) in metadata: `metadata.date = "2025-01-15T19:00:00Z"`
- Session schema supports scheduled sessions: `session_type: "regular"` (scheduled)
- Status workflow: `scheduled → live → ended → uploading → archived`

#### 4. **Scheduler Specification**
**Location**: `docs/specs/scheduler.md`

A scheduler system is **specified** but **implementation status unclear**:
- `.civic/schedule.yml` for scheduled tasks
- `civic schedule run` CLI command
- Can schedule workflows or CLI commands
- Uses cron-style or ISO timestamps

**Example from spec**:
```yaml
- id: publish-fireworks-ban
  run_at: 2025-12-31T00:00:00Z
  command: civic publish records/bylaws/2025-18-fireworks-ban.md
```

### ❌ What's MISSING

#### 1. **Time-Based Scheduler Implementation**
- **Scheduler spec exists** but no evidence of implementation in codebase
- No `core/src/scheduler.ts` file found
- No `civic schedule` CLI command implementation found
- No background process monitoring scheduled tasks

#### 2. **Session Time-Based Triggering**
- No mechanism to:
  - Monitor sessions with `metadata.date` in the future
  - Trigger actions at the scheduled time (e.g., 7PM)
  - Automatically transition `scheduled → live` at the scheduled time
  - Start device recording at the scheduled time

#### 3. **Device Command Scheduling**
- No way to schedule device commands (e.g., `start_session`) for future execution
- No integration between scheduler and Broadcast Box module
- No workflow that monitors session dates and triggers device commands

## Current Capabilities

### ✅ CAN DO (Event-Driven)

1. **Auto-start recording when session is created**:
   ```yaml
   # Session record metadata
   metadata:
     broadcastBox:
       autoRecord: true
       deviceId: "device-uuid"
       videoSource: "HDMI-1"
       audioSource: "Line-In"
   ```
   - When session record is created → Hook fires → Recording starts immediately

2. **Auto-stop recording when session ends**:
   - When session status changes to `ended` → Hook fires → Recording stops automatically

3. **Workflow-based automation**:
   - Custom workflows can be written to trigger device commands
   - Workflows can check conditions and call `sessionController.startSession()`

### ❌ CANNOT DO (Time-Based)

1. **Schedule recording for 7PM**:
   - No way to create a session at 2PM and have it automatically start recording at 7PM
   - Would require manual intervention or external cron job

2. **Automatic session status transitions**:
   - No automatic `scheduled → live` transition at the scheduled time
   - Requires manual status change or external trigger

3. **Scheduled device commands**:
   - Cannot schedule `start_session` command for future execution
   - Cannot schedule `switch_source` or other commands

## Implementation Gaps

### Gap 1: Scheduler Implementation
**Status**: Specified but not implemented

**What's needed**:
- Implement `core/src/scheduler.ts` with:
  - Parse `.civic/schedule.yml`
  - Monitor scheduled tasks
  - Execute tasks at scheduled times
  - CLI command: `civic schedule run` (or background daemon)

**Complexity**: Medium (2-3 days)

### Gap 2: Session Time-Based Automation
**Status**: Not implemented

**What's needed**:
1. **Option A: Scheduler Integration**
   - When session created with `metadata.date` in future:
     - Add entry to `.civic/schedule.yml`: `run_at: <session.date>`, `command: civic session start <session.id>`
   - Scheduler executes at scheduled time
   - Command triggers session status change → Hook fires → Recording starts

2. **Option B: Background Service**
   - Service polls sessions with `status: scheduled` and `metadata.date <= now`
   - Automatically transitions to `live` status
   - Hook fires → Recording starts

3. **Option C: Workflow-Based**
   - Workflow monitors scheduled sessions
   - Checks `metadata.date` against current time
   - Triggers device commands when time matches

**Complexity**: Medium-High (3-5 days)

### Gap 3: Device Command Scheduling
**Status**: Not implemented

**What's needed**:
- Extend scheduler to support device commands
- Or extend workflow system to support time-based conditions
- Integration with Broadcast Box `SessionController`

**Complexity**: Low-Medium (1-2 days)

## Recommended Implementation Approach

### Phase 1: Basic Scheduler (Foundation)
1. Implement `core/src/scheduler.ts`
2. Parse `.civic/schedule.yml`
3. CLI command: `civic schedule run` (runs due tasks)
4. Background daemon or cron integration

### Phase 2: Session Automation
1. When session created with future `metadata.date`:
   - Auto-add to schedule: `run_at: <date>`, `command: civic session:start <id>`
2. Implement `civic session:start` command that:
   - Updates session status: `scheduled → live`
   - This triggers `session:started` hook
   - Hook can trigger recording if `autoRecord` is set

### Phase 3: Direct Device Scheduling (Optional)
1. Extend scheduler to support device commands directly
2. Schedule entry: `run_at: 2025-01-15T19:00:00Z`, `command: broadcast-box:start-session <device-id> <session-id>`
3. Bypass session status workflow for direct device control

## Alternative Solutions (Without Full Scheduler)

### Option 1: External Cron Job
```bash
# Cron job runs every minute
* * * * * cd /path/to/civicpress && civic session:check-scheduled
```

CLI command `civic session:check-scheduled`:
- Queries sessions with `status: scheduled` and `metadata.date <= now`
- Transitions to `live` status
- Hook fires → Recording starts

**Pros**: Simple, uses existing infrastructure  
**Cons**: Requires external cron, 1-minute precision

### Option 2: Workflow with Polling
- Workflow runs periodically (via cron or scheduled task)
- Checks scheduled sessions
- Triggers device commands

**Pros**: Uses existing workflow system  
**Cons**: Still requires external scheduler for workflow execution

### Option 3: API Endpoint + External Scheduler
- API endpoint: `POST /api/v1/broadcast-box/sessions/:id/start-scheduled`
- External system (cron, systemd timer, etc.) calls API at scheduled time
- API triggers device command

**Pros**: Simple, flexible  
**Cons**: Requires external system, not fully automated

## Current Workflow Example

### How to Auto-Start Recording (Event-Based)

**Step 1**: Create session record with auto-record enabled:
```yaml
# data/records/sessions/2025-01-15-council-meeting.md
---
type: session
title: "Council Meeting - January 15, 2025"
status: scheduled
metadata:
  date: "2025-01-15T19:00:00Z"
  session_type: regular
  broadcastBox:
    autoRecord: true
    deviceId: "ffae3291-62ff-4303-86b7-1e86234fe4d0"
    videoSource: "HDMI-1"
    audioSource: "Line-In"
    quality: "standard"
---
```

**Step 2**: When record is created:
- `session:created` hook fires
- `BroadcastBoxWorkflowTriggers.onSessionCreated()` runs
- Checks `autoRecord` flag → **Starts recording immediately**

**Problem**: Recording starts when record is created (e.g., 2PM), not at scheduled time (7PM).

## Conclusion

### Current Answer: **PARTIALLY**

**What works NOW**:
- ✅ Event-driven auto-recording (when session is created)
- ✅ Auto-stop recording (when session ends)
- ✅ Workflow-based automation

**What doesn't work NOW**:
- ❌ Time-based scheduling (start at 7PM automatically)
- ❌ Scheduled device commands
- ❌ Automatic session status transitions at scheduled time

### To Enable Full Automation

**Minimum Required**:
1. Implement basic scheduler (or use external cron)
2. Add session time-checking logic
3. Integrate with existing hook system

**Recommended Path**:
- Use external cron + CLI command (quickest)
- Or implement full scheduler system (more robust, long-term)

### Estimated Implementation Time

- **Quick Solution** (External cron + CLI): 1-2 days
- **Full Scheduler Implementation**: 5-7 days
- **Full Integration** (Scheduler + Session automation + Device commands): 7-10 days

