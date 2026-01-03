# Device Control UI - Implementation Plan

## Overview
Add interactive control cards to the Broadcast Box device detail page (`/settings/broadcast-box/[id]`) that allow users to send commands to devices via WebSocket in real-time.

## Current State Analysis

### ✅ What Exists
1. **WebSocket Connection Infrastructure**:
   - `useDeviceConnectionStatus` composable connects to device rooms as observers
   - Connection established via `ws://localhost:3001/realtime/devices/:deviceUuid`
   - User authentication via token in `Sec-WebSocket-Protocol` header
   - Receives events: `device.connected`, `device.disconnected`, `health.update`, `status` messages

2. **Backend Command Infrastructure**:
   - `ProtocolHandler.createCommand()` creates command messages
   - Commands sent via `room.broadcast()` in `SessionController`
   - Command handlers exist for: `start_session`, `stop_session`, `update_config`, `get_status`, `heartbeat`
   - Device rooms support broadcasting to all clients

3. **UI Infrastructure**:
   - Device detail page shows device info, capabilities, health, sessions
   - Real-time connection status displayed
   - Device configuration modal exists (but uses REST API)

### ❌ What's Missing
1. **WebSocket Command Sending**:
   - No composable to send commands via WebSocket
   - UI only observes, doesn't send commands
   - No command response handling (ack messages)

2. **New Commands**:
   - `switch_source` - Not implemented in backend
   - `list_sources` - Not implemented in backend

3. **UI Control Components**:
   - No interactive control cards
   - No real-time source switching
   - No live configuration updates

## Architecture Design

### 1. New Composable: `useDeviceCommands`

**Location**: `modules/ui/app/composables/useDeviceCommands.ts`

**Purpose**: Send commands to devices via WebSocket and handle responses

**API**:
```typescript
export function useDeviceCommands(deviceUuid: Ref<string | undefined>) {
  const sendCommand = async (
    action: string,
    payload: any
  ): Promise<CommandResponse>
  
  const getStatus = () => Promise<DeviceStatus>
  const updateConfig = (config: DeviceConfig) => Promise<void>
  const switchSource = (videoSource?: string, audioSource?: string) => Promise<void>
  const listSources = () => Promise<{ video: string[], audio: string[] }>
  
  return {
    sendCommand,
    getStatus,
    updateConfig,
    switchSource,
    listSources,
    isConnected,
    lastError
  }
}
```

**Implementation Details**:
- Reuse existing WebSocket connection from `useDeviceConnectionStatus`
- Send commands as JSON: `{ type: 'command', action: '...', payload: {...}, id: uuid, timestamp: ISO }`
- Wait for `ack` response with matching `commandId`
- Handle timeouts (5 second default)
- Track pending commands to avoid duplicates
- Emit events for command success/failure

### 2. Backend Command Handler Updates

**Location**: `modules/broadcast-box/src/websocket/command-handlers.ts`

**New Handlers Needed**:

1. **`switch_source` Handler**:
   ```typescript
   registry.registerHandler('switch_source', async (command, context) => {
     const { videoSource, audioSource } = command.payload;
     // Validate sources against device capabilities
     // Update device state
     // Return ack with new active sources
   });
   ```

2. **`list_sources` Handler**:
   ```typescript
   registry.registerHandler('list_sources', async (command, context) => {
     // Get device capabilities
     // Return available video/audio sources
   });
   ```

**Note**: These handlers need to be registered in `createDefaultCommandHandlers()`.

### 3. UI Control Cards

**Location**: `modules/ui/app/pages/settings/broadcast-box/[id]/index.vue`

**New Sections to Add** (after Device Capabilities, before Device Health):

#### Card 1: Source Control
- **Purpose**: Switch active video/audio sources in real-time
- **Features**:
  - Dropdown for video sources (from capabilities)
  - Dropdown for audio sources (from capabilities)
  - "Switch" button to apply changes
  - Shows current active sources (from device config)
  - Disabled if device not connected
  - Real-time updates when source changes

#### Card 2: Configuration Control
- **Purpose**: Update device configuration remotely
- **Features**:
  - Quality preset selector (low/standard/high)
  - Auto-start toggle
  - "Apply" button
  - Shows current configuration
  - Disabled if device not connected

#### Card 3: Status & Refresh
- **Purpose**: Get current device status and refresh data
- **Features**:
  - "Refresh Status" button (sends `get_status` command)
  - Shows last refresh time
  - Displays current device state (idle/recording/encoding/uploading)
  - Shows active session ID if recording
  - Auto-refresh toggle (every 30 seconds)

#### Card 4: Session Control (Optional Enhancement)
- **Purpose**: Start/stop recording sessions directly
- **Features**:
  - "Start Recording" button (if idle)
  - "Stop Recording" button (if recording)
  - Link to active session
  - Session status indicator
- **Note**: This might overlap with existing session management UI

## Implementation Phases

### Phase 1: WebSocket Command Infrastructure
**Priority**: High  
**Estimated Time**: 2-3 hours

1. Create `useDeviceCommands` composable
   - Extend existing WebSocket connection
   - Implement command sending with response handling
   - Add timeout and error handling
   - Track command state (pending/success/failed)

2. Update `useDeviceConnectionStatus` to expose WebSocket connection
   - Add method to get active WebSocket instance
   - Or merge both composables into one

3. Test command sending with `get_status` command

### Phase 2: Backend Command Handlers
**Priority**: High  
**Estimated Time**: 1-2 hours

1. Implement `switch_source` handler
   - Validate sources against device capabilities
   - Update device state
   - Return acknowledgment

2. Implement `list_sources` handler
   - Return available sources from device capabilities
   - Handle case where device doesn't report sources

3. Update command handler registry

4. Add tests for new handlers

### Phase 3: Source Control Card
**Priority**: Medium  
**Estimated Time**: 2-3 hours

1. Create `DeviceSourceControl.vue` component
   - Video source selector
   - Audio source selector
   - Current active sources display
   - Switch button with loading state
   - Error handling

2. Integrate into device detail page
   - Add card after Device Capabilities
   - Connect to `useDeviceCommands`
   - Handle real-time updates

3. Add translation keys

### Phase 4: Configuration Control Card
**Priority**: Medium  
**Estimated Time**: 2 hours

1. Create `DeviceConfigControl.vue` component
   - Quality preset selector
   - Auto-start toggle
   - Current config display
   - Apply button

2. Integrate into device detail page
   - Connect to `useDeviceCommands`
   - Handle config updates

3. Add translation keys

### Phase 5: Status Refresh Card
**Priority**: Low  
**Estimated Time**: 1-2 hours

1. Create `DeviceStatusControl.vue` component
   - Refresh button
   - Last refresh timestamp
   - Current state display
   - Auto-refresh toggle

2. Integrate into device detail page

3. Add translation keys

## Technical Considerations

### WebSocket Message Flow

**Command Sending**:
```
UI → WebSocket.send({ type: 'command', action: 'switch_source', payload: {...}, id: uuid, timestamp: ISO })
```

**Command Routing**:
```
RealtimeServer → DeviceRoom.broadcast() → Device WebSocket
```

**Response Handling**:
```
Device → WebSocket.send({ type: 'ack', commandId: uuid, success: true, payload: {...} })
RealtimeServer → broadcastToRoom() → UI WebSocket
UI → useDeviceCommands receives ack → Resolve promise
```

### Error Handling

1. **Connection Errors**:
   - Show "Device not connected" message
   - Disable control buttons
   - Auto-retry when connection restored

2. **Command Timeouts**:
   - 5 second timeout per command
   - Show error toast
   - Allow retry

3. **Command Failures**:
   - Parse `ack.success === false`
   - Display error message from `ack.error`
   - Show in UI with error state

### Security Considerations

1. **Permission Checks**:
   - Only users with `broadcast-box:devices:control` permission can send commands
   - Verify permission in UI before showing controls
   - Backend should also validate (future enhancement)

2. **Rate Limiting**:
   - Realtime server already has message rate limiting
   - UI should debounce rapid button clicks
   - Show warning if approaching rate limit

3. **Input Validation**:
   - Validate source selections against device capabilities
   - Prevent invalid configurations
   - Show validation errors before sending

### State Management

1. **Command State**:
   - Track pending commands (Map<commandId, Promise>)
   - Track last command result
   - Track last error

2. **Device State**:
   - Update local state when commands succeed
   - Sync with real-time events (e.g., `device.connected` updates config)
   - Optimistic updates for better UX

### UI/UX Considerations

1. **Loading States**:
   - Show spinner on buttons during command execution
   - Disable controls while command pending
   - Show success checkmark briefly after success

2. **Feedback**:
   - Toast notifications for success/error
   - Inline error messages for validation
   - Visual indicators for active sources

3. **Accessibility**:
   - Proper ARIA labels
   - Keyboard navigation
   - Screen reader announcements for state changes

## Translation Keys Needed

```json
{
  "broadcastBox": {
    "deviceControl": "Device Control",
    "sourceControl": "Source Control",
    "videoSource": "Video Source",
    "audioSource": "Audio Source",
    "switchSource": "Switch Source",
    "switchingSource": "Switching...",
    "sourceSwitched": "Source switched successfully",
    "sourceSwitchFailed": "Failed to switch source",
    "currentVideoSource": "Current Video Source",
    "currentAudioSource": "Current Audio Source",
    "configControl": "Configuration",
    "qualityPreset": "Quality Preset",
    "autoStart": "Auto Start",
    "applyConfig": "Apply Configuration",
    "applyingConfig": "Applying...",
    "configApplied": "Configuration applied successfully",
    "configApplyFailed": "Failed to apply configuration",
    "statusControl": "Status",
    "refreshStatus": "Refresh Status",
    "refreshingStatus": "Refreshing...",
    "lastRefreshed": "Last refreshed",
    "currentState": "Current State",
    "autoRefresh": "Auto Refresh",
    "deviceNotConnected": "Device not connected",
    "commandTimeout": "Command timed out",
    "commandFailed": "Command failed"
  }
}
```

## Testing Strategy

### Unit Tests
1. `useDeviceCommands` composable
   - Command sending
   - Response handling
   - Timeout handling
   - Error handling

2. Command handlers (backend)
   - `switch_source` validation
   - `list_sources` response format

### Integration Tests
1. End-to-end command flow
   - UI → WebSocket → Device → Response → UI
   - Test with real device simulator

2. Error scenarios
   - Device disconnected
   - Invalid command
   - Timeout

### Manual Testing
1. Test all control cards with real device
2. Test error states
3. Test real-time updates
4. Test permission restrictions

## Future Enhancements

1. **Advanced Controls**:
   - PiP toggle during recording
   - Quality adjustment during recording
   - Network settings

2. **Command History**:
   - Show recent commands
   - Allow command replay
   - Command audit log

3. **Bulk Operations**:
   - Control multiple devices
   - Device groups
   - Scheduled commands

4. **Visual Feedback**:
   - Live video preview (if device supports)
   - Audio level meters
   - Recording indicator

## Dependencies

- Existing: `useDeviceConnectionStatus` composable
- Existing: WebSocket connection infrastructure
- Existing: Device room broadcasting
- New: Command response handling
- New: UI control components

## Risks & Mitigations

1. **Risk**: WebSocket connection drops during command
   - **Mitigation**: Auto-reconnect, queue commands, show connection status

2. **Risk**: Command conflicts (multiple users)
   - **Mitigation**: Last-write-wins, show conflicts in UI

3. **Risk**: Device doesn't support command
   - **Mitigation**: Check capabilities, disable unsupported controls

4. **Risk**: Performance with many devices
   - **Mitigation**: Lazy load controls, debounce commands

## Success Criteria

1. ✅ Users can switch video/audio sources in real-time
2. ✅ Users can update device configuration remotely
3. ✅ Users can refresh device status on demand
4. ✅ All commands show proper loading/error states
5. ✅ Controls are disabled when device not connected
6. ✅ Real-time updates reflect command changes
7. ✅ All actions are properly logged/audited

