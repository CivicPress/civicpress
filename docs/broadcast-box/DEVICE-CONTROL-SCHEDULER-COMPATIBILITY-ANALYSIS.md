# Device Control - Scheduler Compatibility Analysis

## Goal
Design the device control system (live UI controls) to be compatible with future scheduler implementation, ensuring both manual and automated control use the same underlying infrastructure.

## Current Architecture Analysis

### Current Command Flow

#### Flow 1: SessionController (API/Workflow Initiated)
```
SessionController.startSession()
  → ProtocolHandler.createCommand()
  → RoomManager.getRoom()
  → Room.broadcast(command)
  → Device receives via WebSocket
```

**Characteristics**:
- High-level service method (`startSession`)
- Business logic (validation, state management)
- Database operations (create session, log events)
- WebSocket transport (via RoomManager)

#### Flow 2: Direct WebSocket (Future UI Control)
```
UI → useDeviceCommands.sendCommand()
  → WebSocket.send(command)
  → Device receives via WebSocket
  → Device responds with ack
  → UI handles response
```

**Characteristics**:
- Low-level command sending
- Direct WebSocket communication
- No business logic
- No database operations
- Response handling in UI

### Problem: Architectural Mismatch

**Issue 1**: Two different command execution paths
- SessionController: High-level, business-logic-aware
- UI WebSocket: Low-level, transport-only

**Issue 2**: Scheduler needs what?
- Scheduler will need to execute commands at scheduled times
- Should it use SessionController (high-level) or direct WebSocket (low-level)?
- What about commands that don't involve sessions (e.g., `switch_source`, `update_config`)?

**Issue 3**: Command source tracking
- Manual commands (UI) vs Automated commands (scheduler)
- Need audit trail: who/what triggered the command
- Current system doesn't track command source

## Recommended Architecture

### Layer Separation

```
┌─────────────────────────────────────────────────────────┐
│                    Command Sources                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │    UI    │  │ Scheduler│  │ Workflow │             │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘             │
└───────┼─────────────┼──────────────┼───────────────────┘
        │             │              │
        └─────────────┼──────────────┘
                      │
        ┌─────────────▼──────────────┐
        │  DeviceCommandService      │  ← NEW: Unified Command Layer
        │  (Command Execution Core)   │
        └─────────────┬──────────────┘
                      │
        ┌─────────────▼──────────────┐
        │  Command Transport Layer   │
        │  (WebSocket/RoomManager)    │
        └─────────────┬──────────────┘
                      │
        ┌─────────────▼──────────────┐
        │         Device              │
        └─────────────────────────────┘
```

### Proposed: DeviceCommandService

**Purpose**: Unified command execution layer that:
- Accepts commands from any source (UI, scheduler, workflow, API)
- Handles validation, transport, response, and audit
- Abstracts transport mechanism (WebSocket/RoomManager)
- Tracks command source for audit trail

**Location**: `modules/broadcast-box/src/services/device-command-service.ts`

**Interface**:
```typescript
export interface CommandSource {
  type: 'user' | 'scheduler' | 'workflow' | 'api';
  userId?: number;        // For user-initiated
  schedulerId?: string;   // For scheduler-initiated
  workflowId?: string;    // For workflow-initiated
  metadata?: Record<string, any>;
}

export interface CommandRequest {
  deviceId: string;
  action: string;
  payload: any;
  source: CommandSource;
  timeout?: number;       // Optional timeout override
}

export interface CommandResponse {
  success: boolean;
  commandId: string;
  ack?: AckMessage;
  error?: string;
  timestamp: Date;
}

export class DeviceCommandService {
  /**
   * Execute a command on a device
   * Unified entry point for all command sources
   */
  async executeCommand(
    request: CommandRequest
  ): Promise<CommandResponse>
  
  /**
   * Send command via WebSocket (internal)
   */
  private async sendCommandViaWebSocket(
    deviceId: string,
    command: CommandMessage
  ): Promise<AckMessage>
  
  /**
   * Validate command before execution
   */
  private validateCommand(
    deviceId: string,
    action: string,
    payload: any
  ): void
  
  /**
   * Log command execution for audit
   */
  private async logCommand(
    request: CommandRequest,
    response: CommandResponse
  ): Promise<void>
}
```

### Command Execution Flow (Unified)

```
1. Command Source (UI/Scheduler/Workflow/API)
   ↓
2. DeviceCommandService.executeCommand()
   ├─ Validate command
   ├─ Check device connection
   ├─ Create command message
   ├─ Log command (audit)
   ├─ Send via transport layer
   ├─ Wait for ack response
   ├─ Handle timeout/errors
   └─ Log response (audit)
   ↓
3. Transport Layer (WebSocket/RoomManager)
   ↓
4. Device receives command
   ↓
5. Device responds with ack
   ↓
6. DeviceCommandService receives ack
   ↓
7. Return CommandResponse to caller
```

## Implementation Strategy

### Phase 1: Create DeviceCommandService (Foundation)

**What to build**:
1. `DeviceCommandService` class
   - Core command execution logic
   - Transport abstraction (WebSocket/RoomManager)
   - Response handling with timeout
   - Command validation
   - Audit logging

2. **Command Types**:
   - Session commands: `start_session`, `stop_session` (delegate to SessionController for business logic)
   - Device commands: `switch_source`, `update_config`, `get_status`, `list_sources` (direct execution)

3. **Integration Points**:
   - Use existing `RoomManager` for WebSocket transport
   - Use existing `ProtocolHandler` for message creation
   - Use existing `DeviceConnectionTracker` for connection checks
   - Use existing `DeviceEventModel` for audit logging

**Key Design Decisions**:
- **Session commands**: Keep `SessionController` for business logic, but have it call `DeviceCommandService` for transport
- **Device commands**: Execute directly via `DeviceCommandService`
- **Transport**: Abstract WebSocket sending behind service interface
- **Response handling**: Centralized timeout and error handling

### Phase 2: Update SessionController (Refactor)

**Current**:
```typescript
// SessionController.startSession()
const command = this.protocol.createCommand(...);
const room = this.roomManager.getRoom(...);
room.broadcast(command);
```

**New**:
```typescript
// SessionController.startSession()
// ... business logic (validation, session creation) ...

// Delegate command execution to DeviceCommandService
await this.deviceCommandService.executeCommand({
  deviceId: request.deviceId,
  action: 'start_session',
  payload: { sessionId, civicpressSessionId, config },
  source: {
    type: 'workflow', // or 'api', 'user'
    workflowId: context?.workflowId,
    metadata: { sessionId: created.id }
  }
});
```

**Benefits**:
- Consistent command execution
- Unified audit trail
- Scheduler can use same path

### Phase 3: UI Integration (Live Controls)

**Current Plan** (from DEVICE-CONTROL-UI-PLAN.md):
```typescript
// useDeviceCommands composable
const sendCommand = async (action, payload) => {
  // Direct WebSocket.send()
}
```

**New Approach**:
```typescript
// useDeviceCommands composable
const sendCommand = async (action, payload) => {
  // Call API endpoint that uses DeviceCommandService
  return await $civicApi.post('/api/v1/broadcast-box/devices/:id/command', {
    action,
    payload
  });
}
```

**API Endpoint**:
```typescript
// POST /api/v1/broadcast-box/devices/:id/command
router.post('/:id/command', async (req, res) => {
  const response = await deviceCommandService.executeCommand({
    deviceId: req.params.id,
    action: req.body.action,
    payload: req.body.payload,
    source: {
      type: 'user',
      userId: req.user.id,
      metadata: { ip: req.ip }
    }
  });
  res.json(response);
});
```

**Benefits**:
- Consistent with scheduler path
- Server-side validation
- Audit trail
- Error handling
- No direct WebSocket from UI (simpler)

### Phase 4: Scheduler Integration (Future)

**Scheduler Integration**:
```typescript
// When scheduler executes scheduled task
await deviceCommandService.executeCommand({
  deviceId: scheduledTask.deviceId,
  action: scheduledTask.action,
  payload: scheduledTask.payload,
  source: {
    type: 'scheduler',
    schedulerId: scheduledTask.id,
    metadata: { 
      scheduledAt: scheduledTask.runAt,
      taskId: scheduledTask.id
    }
  }
});
```

**Scheduler Config Example**:
```yaml
# .civic/schedule.yml
- id: start-council-meeting-7pm
  run_at: 2025-01-15T19:00:00Z
  command: broadcast-box:command
  params:
    deviceId: "ffae3291-62ff-4303-86b7-1e86234fe4d0"
    action: "start_session"
    payload:
      sessionId: "session-uuid"
      civicpressSessionId: "civicpress-session-uuid"
      config:
        videoSource: "HDMI-1"
        audioSource: "Line-In"
```

## Key Design Principles

### 1. **Single Source of Truth for Command Execution**
- All commands go through `DeviceCommandService`
- No direct WebSocket sending from UI or scheduler
- Consistent validation, transport, and audit

### 2. **Command Source Tracking**
- Every command includes `CommandSource`
- Audit log tracks: who/what/when/why
- Enables debugging and compliance

### 3. **Transport Abstraction**
- `DeviceCommandService` abstracts WebSocket/RoomManager
- Future: Could support other transports (MQTT, HTTP, etc.)
- Scheduler doesn't need to know about WebSocket

### 4. **Separation of Concerns**
- **Business Logic**: SessionController (session lifecycle)
- **Command Execution**: DeviceCommandService (transport, validation, audit)
- **Transport**: RoomManager/WebSocket (low-level communication)
- **UI**: API calls (no direct WebSocket)

### 5. **Idempotency**
- Commands should be idempotent where possible
- `switch_source` can be called multiple times safely
- `get_status` is read-only (always safe)
- `start_session` should check if already recording

### 6. **Error Handling**
- Centralized error handling in `DeviceCommandService`
- Consistent error responses
- Retry logic (future enhancement)
- Timeout handling

## Migration Path

### Step 1: Build DeviceCommandService
- Create service with core execution logic
- Support existing commands (`start_session`, `stop_session`, `get_status`, `update_config`)
- Add new commands (`switch_source`, `list_sources`)

### Step 2: Refactor SessionController
- Keep business logic in SessionController
- Delegate command execution to DeviceCommandService
- Maintain backward compatibility

### Step 3: Add API Endpoint
- `POST /api/v1/broadcast-box/devices/:id/command`
- Use DeviceCommandService internally
- Support all device commands

### Step 4: Update UI
- `useDeviceCommands` calls API endpoint
- No direct WebSocket from UI
- Simpler, more consistent

### Step 5: Future Scheduler Integration
- Scheduler calls DeviceCommandService directly
- Or scheduler calls API endpoint
- Or scheduler uses CLI command that calls DeviceCommandService

## Compatibility Checklist

### ✅ Must Support
- [x] Manual UI commands (live control)
- [x] API-initiated commands
- [x] Workflow-initiated commands
- [ ] Scheduler-initiated commands (future)
- [x] Command source tracking
- [x] Audit logging
- [x] Error handling
- [x] Timeout handling

### ✅ Design Considerations
- [x] Transport abstraction (WebSocket today, other transports future)
- [x] Command validation
- [x] Response handling
- [x] Idempotency where possible
- [x] Backward compatibility with existing SessionController

## API Design

### DeviceCommandService API

```typescript
// Core execution
executeCommand(request: CommandRequest): Promise<CommandResponse>

// Helper methods (convenience)
async switchSource(
  deviceId: string,
  videoSource?: string,
  audioSource?: string,
  source: CommandSource
): Promise<CommandResponse>

async updateConfig(
  deviceId: string,
  config: DeviceConfig,
  source: CommandSource
): Promise<CommandResponse>

async getStatus(
  deviceId: string,
  source: CommandSource
): Promise<CommandResponse>

async listSources(
  deviceId: string,
  source: CommandSource
): Promise<CommandResponse>
```

### REST API Endpoint

```typescript
POST /api/v1/broadcast-box/devices/:id/command
Body: {
  action: string;
  payload: any;
}
Response: {
  success: boolean;
  commandId: string;
  ack?: any;
  error?: string;
}
```

### CLI Command (Future Scheduler)

```bash
civic broadcast-box:command \
  --device-id <uuid> \
  --action switch_source \
  --payload '{"videoSource":"HDMI-1"}' \
  --source scheduler \
  --scheduler-id <task-id>
```

## Benefits of This Architecture

### For Current Implementation (Live Controls)
1. **Consistent**: All commands use same execution path
2. **Reliable**: Centralized error handling and timeout
3. **Auditable**: All commands logged with source
4. **Simple UI**: Just API calls, no WebSocket complexity

### For Future Scheduler
1. **Ready**: Architecture supports scheduler out of the box
2. **Flexible**: Scheduler can use API, CLI, or direct service call
3. **Consistent**: Same validation, transport, and audit as manual commands
4. **Traceable**: Can distinguish manual vs scheduled commands

### For Maintenance
1. **Single point of change**: Command execution logic in one place
2. **Testable**: Service can be unit tested independently
3. **Extensible**: Easy to add new commands or transports
4. **Debuggable**: Centralized logging and audit trail

## Potential Issues & Solutions

### Issue 1: WebSocket Connection State
**Problem**: UI needs to know if device is connected before sending commands

**Solution**: 
- API endpoint checks connection before executing
- Returns clear error if device not connected
- UI can check connection status via existing `useDeviceConnectionStatus`

### Issue 2: Real-time Response
**Problem**: UI might want immediate feedback, but API call is async

**Solution**:
- API endpoint returns immediately with `commandId`
- UI can poll for status or use WebSocket for real-time updates
- Or: API supports WebSocket upgrade for command responses

### Issue 3: Session Commands Complexity
**Problem**: `start_session` has complex business logic (session creation, validation)

**Solution**:
- Keep business logic in `SessionController`
- `SessionController` calls `DeviceCommandService` for transport
- Best of both worlds: business logic + unified command execution

### Issue 4: Command Queue/Retry
**Problem**: What if device is temporarily disconnected?

**Solution** (Future):
- `DeviceCommandService` can queue commands
- Retry when device reconnects
- Or: Return error immediately, let caller handle retry

## Conclusion

### Recommended Approach

1. **Build `DeviceCommandService`** as unified command execution layer
2. **Refactor `SessionController`** to use `DeviceCommandService` for transport
3. **Add API endpoint** for UI commands
4. **Update UI** to use API endpoint (not direct WebSocket)
5. **Future**: Scheduler uses same `DeviceCommandService`

### Key Benefits

- ✅ **Compatible**: Architecture ready for scheduler
- ✅ **Consistent**: All commands use same path
- ✅ **Maintainable**: Single point of command execution
- ✅ **Auditable**: All commands tracked with source
- ✅ **Flexible**: Supports UI, API, workflow, and future scheduler

### Implementation Order

1. **Phase 1**: Build `DeviceCommandService` (foundation)
2. **Phase 2**: Add API endpoint for device commands
3. **Phase 3**: Update UI to use API endpoint
4. **Phase 4**: Refactor `SessionController` (optional, can be later)
5. **Phase 5**: Future scheduler integration (uses existing infrastructure)

This architecture ensures that the live control implementation is fully compatible with future scheduler integration, requiring minimal changes when scheduler is implemented.

