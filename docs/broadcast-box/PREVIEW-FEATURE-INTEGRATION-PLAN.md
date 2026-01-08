# Broadcast Box Preview Feature - WebRTC Integration Plan

**Purpose**: This document outlines the implementation plan for integrating the
WebRTC-based preview feature into CivicPress, allowing users to view live video
feed from Broadcast Box devices.

**Target Audience**: CivicPress developers implementing the preview feature.

**Last Updated**: 2025-01-31

---

## Overview

The preview feature allows users to view a real-time video stream from Broadcast
Box devices using WebRTC. The preview stream shows the composited output (main
video + PiP if enabled) and can run independently of recording sessions.

**Key Characteristics**:

- Uses WebRTC for low-latency streaming (< 1 second delay)
- Default: 640x360 @ 15fps, 500 kbps
- Preview shows composited output (main + PiP if configured)
- Works independently of recording sessions
- Device uses STUN/TURN for NAT traversal

---

## Current State Analysis

### Existing Infrastructure

**✅ What's Already in Place**:

1. **WebSocket Connection**: `useDeviceConnectionStatus` composable manages
   WebSocket connections to device rooms
2. **Command System**: `useDeviceCommands` composable handles device commands
   via REST API
3. **Event Handling**: `useDeviceConnectionStatus` listens to WebSocket events
   (status, device.connected, etc.)
4. **Device UI**: Device detail page at `/settings/broadcast-box/[id]/index.vue`
5. **Room Management**: Backend has room-based WebSocket routing via
   `DeviceRoom`
6. **Command Service**: `DeviceCommandService` handles command execution and ACK
   responses

**❌ What's Missing**:

1. **Preview Command Support**: `preview.start` and `preview.stop` commands not
   implemented
2. **WebRTC Message Handling**: No handlers for `preview.offer`,
   `preview.answer`, `preview.ice_candidate`
3. **WebRTC Connection Management**: No `RTCPeerConnection` setup in frontend
4. **Preview UI Component**: No component to display preview stream
5. **WebRTC Event Handling**: No listeners for `preview.started` and
   `preview.stopped` events

---

## Implementation Plan

### Phase 1: Backend - Preview Command Support

#### 1.1 Add Preview Commands to Command Handlers

**File**: `modules/broadcast-box/src/websocket/command-handlers.ts`

**Changes**:

- Add `preview.start` command handler
- Add `preview.stop` command handler
- Return WebRTC offer in ACK response (for `preview.start`)
- Handle optional quality parameters

**Expected Behavior**:

- `preview.start` → Returns ACK with WebRTC offer in `result.offer`
- `preview.stop` → Returns ACK with success status
- Device should also emit `preview.offer` event separately (for redundancy)

#### 1.2 Add Preview Actions to API Endpoint

**File**: `modules/broadcast-box/src/api/devices.ts`

**Changes**:

- Add `'preview.start'` and `'preview.stop'` to `allowedActions` array
- These commands can use existing command endpoint structure

**No additional validation needed** - existing command endpoint handles it.

#### 1.3 Add Preview Message Types to Protocol

**File**: `modules/broadcast-box/src/websocket/protocol.ts` or
`event-handlers.ts`

**Changes**:

- Handle `preview.offer` messages (Device → CivicPress)
- Handle `preview.answer` messages (CivicPress → Device) - forward to device
  room
- Handle `preview.ice_candidate` messages (bidirectional) - forward between
  client and device
- Handle `preview.started` and `preview.stopped` events

**Note**: These messages are sent directly via WebSocket, not through the REST
API command endpoint.

---

### Phase 2: Backend - WebRTC Message Routing

#### 2.1 Update Real-time Server for Preview Messages

**File**: `modules/realtime/src/realtime-server.ts`

**Changes**:

- Add message handlers for `preview.offer`, `preview.answer`,
  `preview.ice_candidate`
- These messages should be routed to/from the device room
- For `preview.answer` and `preview.ice_candidate` (CivicPress → Device):
  - Extract device UUID from room or message
  - Forward to device via room broadcast
- For `preview.offer` and `preview.ice_candidate` (Device → CivicPress):
  - Forward to observing clients in the device room

**Key Challenge**: Need to distinguish between:

- Device client (device connecting to room)
- Observing client (UI connecting to room)

**Solution**: Use existing client metadata or connection type detection in room
handling.

---

### Phase 3: Frontend - WebRTC Composable

#### 3.1 Create `useDevicePreview` Composable

**File**: `modules/ui/app/composables/useDevicePreview.ts`

**Purpose**: Manage WebRTC connection lifecycle for device preview.

**Key Responsibilities**:

1. **Preview State Management**:
   - `isPreviewActive: Ref<boolean>` - Whether preview is running
   - `connectionState: Ref<'disconnected' | 'connecting' | 'connected' | 'failed'>`
   - `error: Ref<string | null>`

2. **WebRTC Connection**:
   - Create and manage `RTCPeerConnection` instance
   - Handle ICE candidate gathering
   - Set remote/local descriptions
   - Handle connection state changes
   - Clean up on component unmount

3. **WebSocket Message Handling**:
   - Listen for `preview.offer` messages from WebSocket
   - Listen for `preview.ice_candidate` messages from WebSocket
   - Send `preview.answer` messages via WebSocket
   - Send `preview.ice_candidate` messages via WebSocket
   - Listen for `preview.started` and `preview.stopped` events

4. **Preview Control Methods**:
   - `startPreview()` - Send `preview.start` command, wait for offer, establish
     WebRTC
   - `stopPreview()` - Send `preview.stop` command, close WebRTC connection
   - `retryConnection()` - Retry failed connection

**WebRTC Setup Flow**:

```typescript
// 1. Create RTCPeerConnection with STUN servers
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // Can add TURN servers later if needed
  ]
});

// 2. Handle ICE candidates
pc.onicecandidate = (event) => {
  if (event.candidate) {
    // Send to device via WebSocket
    sendIceCandidate(event.candidate);
  }
};

// 3. Handle track (video stream)
pc.ontrack = (event) => {
  // Attach stream to video element
  previewVideoRef.value.srcObject = event.streams[0];
};

// 4. Handle connection state
pc.onconnectionstatechange = () => {
  connectionState.value = pc.connectionState;
};

// 5. When offer received:
// - Set remote description
// - Create answer
// - Set local description
// - Send answer via WebSocket
```

**Integration Points**:

- Uses `useDeviceCommands` for sending `preview.start` and `preview.stop`
  commands
- Uses `useDeviceConnectionStatus` WebSocket connection for receiving preview
  messages
- Returns `previewStream: Ref<MediaStream | null>` for video element binding

---

### Phase 4: Frontend - Preview UI Component

#### 4.1 Create `DevicePreview.vue` Component

**File**: `modules/ui/app/components/broadcast-box/DevicePreview.vue`

**Features**:

- Video element to display preview stream
- Connection status indicator (connecting, connected, disconnected, failed)
- Start/Stop preview buttons
- Error display with retry option
- Loading state while connecting
- Responsive layout (full width on mobile, constrained on desktop)

**UI States**:

1. **Initial**: Show "Start Preview" button
2. **Connecting**: Show spinner, disable controls
3. **Connected**: Show video stream, "Stop Preview" button, connection status
4. **Failed**: Show error message, "Retry" button
5. **Disconnected**: Show "Start Preview" button again

**Props**:

- `device: BroadcastDevice` - Device to preview
- `isDeviceConnected: boolean` - Whether device is connected via WebSocket

**Emits**:

- `started` - When preview starts
- `stopped` - When preview stops
- `error` - When error occurs

---

#### 4.2 Integrate Preview Component into Device Detail Page

**File**: `modules/ui/app/pages/settings/broadcast-box/[id]/index.vue`

**Changes**:

- Add preview section (above or below device control cards)
- Use `DevicePreview` component
- Pass device and connection status
- Position: Full-width card above or alongside control cards

**Layout Suggestion**:

```
┌─────────────────────────────────────┐
│  Device Info & Connection Status    │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  Preview Stream (DevicePreview)     │
│  [Video Element]                    │
└─────────────────────────────────────┘
┌─────────────────┬───────────────────┐
│ Source Control  │ PiP Control       │
└─────────────────┴───────────────────┘
```

---

### Phase 5: Frontend - WebSocket Message Handling

#### 5.1 Update `useDeviceConnectionStatus` for Preview Messages

**File**: `modules/ui/app/composables/useDeviceConnectionStatus.ts`

**Changes**:

- Add handlers for `preview.offer`, `preview.ice_candidate` messages
- These messages should be exposed via the composable's return value
- Consider using an event emitter pattern or reactive refs for preview messages

**Alternative Approach** (Recommended):

- Keep `useDeviceConnectionStatus` focused on status updates
- Create separate `useDeviceWebSocket` composable for raw WebSocket message
  handling
- `useDevicePreview` uses `useDeviceWebSocket` to listen for preview messages

**Decision Needed**: Single composable vs. separation of concerns?

#### 5.2 Handle Preview Events

**Preview Events to Handle**:

- `preview.started` - Update preview state to active
- `preview.stopped` - Update preview state to inactive, close WebRTC connection

**Location**: `useDevicePreview` composable

---

### Phase 6: Error Handling & Edge Cases

#### 6.1 Error Scenarios

1. **WebRTC Connection Failed**:
   - Display error message
   - Allow retry
   - Fallback: Suggest checking network/firewall

2. **Preview Start Command Failed**:
   - Display error from ACK
   - Common errors: "Preview encoder service not available"
   - Allow retry

3. **WebSocket Disconnected**:
   - Close WebRTC connection
   - Update UI state
   - Attempt to reconnect WebSocket

4. **ICE Connection Failed**:
   - Log ICE connection state changes
   - Display appropriate error
   - Suggest TURN server configuration if needed

5. **Offer/Answer Exchange Failed**:
   - Timeout handling (30 seconds)
   - Retry mechanism
   - Error logging

#### 6.2 Cleanup

- Close `RTCPeerConnection` when component unmounts
- Stop all tracks when preview stops
- Clear WebSocket message listeners
- Cancel pending promises/timeouts

---

### Phase 7: Configuration & Customization

#### 7.1 Preview Quality Configuration

**Future Enhancement**: Allow users to configure preview quality

- Resolution (640x360, 854x480, 1280x720)
- Framerate (15, 30 fps)
- Bitrate (500, 1000, 2000 kbps)

**Implementation**:

- Add quality selector to `DevicePreview` component
- Pass quality settings to `preview.start` command payload
- Store user preference in localStorage

#### 7.2 STUN/TURN Configuration

**Future Enhancement**: Allow configuring STUN/TURN servers

- Default: Google STUN (`stun:stun.l.google.com:19302`)
- Custom STUN servers
- TURN server configuration (for restrictive networks)

**Implementation**:

- Add configuration UI (settings page)
- Store in user preferences or device config
- Pass to `RTCPeerConnection` constructor

---

## Technical Implementation Details

### WebRTC Connection Flow

```
1. User clicks "Start Preview"
   ↓
2. Frontend: sendCommand('preview.start') via useDeviceCommands
   ↓
3. Backend: Command sent to device via WebSocket room
   ↓
4. Device: Processes command, creates WebRTC offer
   ↓
5. Device → Backend: ACK with offer in result
   Device → Backend: preview.offer event (same offer)
   ↓
6. Backend → Frontend: ACK response via REST API
   Backend → Frontend: preview.offer message via WebSocket
   ↓
7. Frontend: useDevicePreview receives offer (from WebSocket or ACK)
   ↓
8. Frontend: Create RTCPeerConnection, set remote description (offer)
   ↓
9. Frontend: Create answer, set local description
   ↓
10. Frontend → Backend: preview.answer message via WebSocket
    ↓
11. Backend → Device: Forward preview.answer to device room
    ↓
12. Device: Set remote description (answer)
    ↓
13. Both sides: Exchange ICE candidates via preview.ice_candidate messages
    ↓
14. WebRTC connection established, video stream begins
```

### Message Formats

**Preview Offer (Device → CivicPress)**:

```typescript
{
  type: 'preview.offer',
  payload: {
    type: 'offer',
    sdp: string // WebRTC SDP offer
  },
  timestamp: number
}
```

**Preview Answer (CivicPress → Device)**:

```typescript
{
  type: 'preview.answer',
  payload: {
    type: 'answer',
    sdp: string // WebRTC SDP answer
  },
  timestamp: number
}
```

**ICE Candidate (Bidirectional)**:

```typescript
{
  type: 'preview.ice_candidate',
  payload: {
    candidate: string, // ICE candidate string
    sdpMid: string | null,
    sdpMLineIndex: number | null
  },
  timestamp: number
}
```

---

## File Structure Summary

### New Files to Create

1. **`modules/ui/app/composables/useDevicePreview.ts`**
   - WebRTC connection management
   - Preview state management
   - WebSocket message handling for preview

2. **`modules/ui/app/components/broadcast-box/DevicePreview.vue`**
   - Preview UI component
   - Video element display
   - Controls and status indicators

3. **`modules/ui/app/composables/useDeviceWebSocket.ts`** (Optional)
   - Raw WebSocket message handling
   - Event emitter for preview messages
   - Separates concerns from status monitoring

### Files to Modify

1. **Backend**:
   - `modules/broadcast-box/src/websocket/command-handlers.ts` - Add preview
     command handlers
   - `modules/broadcast-box/src/api/devices.ts` - Add preview actions to
     allowedActions
   - `modules/broadcast-box/src/websocket/event-handlers.ts` - Handle preview
     events
   - `modules/realtime/src/realtime-server.ts` - Route preview WebRTC messages

2. **Frontend**:
   - `modules/ui/app/composables/useDeviceCommands.ts` - Add preview command
     helpers (optional)
   - `modules/ui/app/composables/useDeviceConnectionStatus.ts` - Handle preview
     events OR create separate composable
   - `modules/ui/app/pages/settings/broadcast-box/[id]/index.vue` - Integrate
     preview component
   - `modules/ui/i18n/locales/en.json` - Add preview-related translation keys
   - `modules/ui/i18n/locales/fr.json` - Add preview-related translation keys

---

## Translation Keys Needed

```json
{
  "broadcastBox": {
    "preview": {
      "title": "Live Preview",
      "start": "Start Preview",
      "stop": "Stop Preview",
      "connecting": "Connecting...",
      "connected": "Connected",
      "disconnected": "Disconnected",
      "failed": "Connection Failed",
      "retry": "Retry",
      "error": {
        "startFailed": "Failed to start preview",
        "connectionFailed": "WebRTC connection failed",
        "iceFailed": "Network connection failed",
        "encoderNotAvailable": "Preview encoder not available on device"
      },
      "status": {
        "disconnected": "Preview stopped",
        "connecting": "Establishing connection...",
        "connected": "Preview active",
        "failed": "Connection failed"
      }
    }
  }
}
```

---

## Testing Strategy

### Unit Tests

1. **`useDevicePreview` Composable**:
   - Test WebRTC connection setup
   - Test offer/answer exchange
   - Test ICE candidate handling
   - Test error handling
   - Test cleanup on unmount

2. **Command Handlers** (Backend):
   - Test `preview.start` command handler
   - Test `preview.stop` command handler
   - Test error responses

### Integration Tests

1. **End-to-End Preview Flow**:
   - Start preview → Receive offer → Establish connection → Display video
   - Stop preview → Close connection → Update UI
   - Error scenarios (encoder not available, connection failed, etc.)

2. **WebSocket Message Routing**:
   - Verify preview messages are routed correctly
   - Verify bidirectional ICE candidate exchange
   - Verify offer/answer delivery

### Manual Testing Checklist

- [ ] Preview starts successfully
- [ ] Video stream displays correctly
- [ ] Preview shows composited output (main + PiP)
- [ ] Preview works independently of recording sessions
- [ ] Connection state indicators work correctly
- [ ] Error handling works for various failure scenarios
- [ ] Cleanup works when component unmounts
- [ ] WebSocket reconnection handles preview state correctly
- [ ] Multiple browser tabs can observe same device preview
- [ ] Preview works on mobile devices (iOS Safari, Android Chrome)

---

## Considerations & Challenges

### 1. WebRTC Browser Compatibility

**Challenge**: WebRTC support varies across browsers

- **Solution**: Check for `RTCPeerConnection` support, show error if not
  available
- **Fallback**: Display message: "Preview requires a modern browser with WebRTC
  support"

### 2. WebSocket Message Routing

**Challenge**: Need to route preview messages between device and observing
clients

- **Solution**: Use existing room-based routing, distinguish client types
- **Alternative**: Use separate WebSocket connection for preview (not
  recommended - adds complexity)

### 3. ICE Connection in Restrictive Networks

**Challenge**: Some networks block WebRTC without TURN servers

- **Solution**: Start with STUN only, add TURN server configuration as future
  enhancement
- **User Feedback**: Show clear error message if ICE connection fails

### 4. Multiple Observers

**Challenge**: Multiple users viewing same device preview simultaneously

- **Solution**: Each observer creates their own WebRTC connection
- **Performance**: Device should handle multiple WebRTC connections (handled by
  device firmware)

### 5. State Synchronization

**Challenge**: Preview state needs to sync across UI and WebSocket events

- **Solution**: Use reactive refs in composable, update based on events and
  commands
- **Race Conditions**: Handle cases where `preview.stopped` event arrives before
  `preview.stop` ACK

### 6. Component Lifecycle

**Challenge**: WebRTC connection cleanup when component unmounts or route
changes

- **Solution**: Proper cleanup in `onUnmounted` hook
- **Cleanup Steps**: Close peer connection, stop tracks, clear refs, cancel
  timeouts

---

## Dependencies

### Browser APIs Required

- `RTCPeerConnection` - WebRTC peer connection
- `WebSocket` - Already in use for device communication
- `MediaStream` - Video stream handling

### No Additional NPM Packages Needed

- Standard WebRTC APIs are built into modern browsers
- WebSocket is already used in the project

### Optional Enhancements (Future)

- `simple-peer` - Simplified WebRTC wrapper (if complexity grows)
- TURN server configuration UI
- Preview quality selector component

---

## Performance Considerations

1. **Memory**: WebRTC connections consume memory - ensure proper cleanup
2. **Bandwidth**: Preview stream uses ~500 kbps - acceptable for most networks
3. **CPU**: Video decoding in browser - modern devices handle this well
4. **Multiple Connections**: Device firmware should handle multiple WebRTC
   connections efficiently

---

## Security Considerations

1. **Authentication**: Preview commands require device authentication (already
   handled)
2. **Authorization**: Only authorized users can access device rooms (already
   handled)
3. **WebRTC**: Uses encrypted connections (DTLS/SRTP) by default
4. **TURN Servers**: If using custom TURN servers, ensure they're trusted

---

## Success Criteria

✅ Preview feature is considered complete when:

1. Users can start/stop preview from device detail page
2. Video stream displays correctly in browser
3. Preview shows composited output (main + PiP if configured)
4. Connection state is clearly indicated in UI
5. Error handling works for all failure scenarios
6. Cleanup works properly on component unmount
7. Preview works independently of recording sessions
8. Multiple observers can view same device preview
9. WebSocket reconnection doesn't break preview state
10. All translation keys are implemented

---

## Future Enhancements

1. **Preview Quality Settings**: Allow users to configure
   resolution/framerate/bitrate
2. **Picture-in-Picture**: Browser PiP for preview window
3. **Recording from Preview**: Start recording directly from preview UI
4. **Multiple Device Preview**: Grid view showing multiple device previews
5. **Preview History**: Replay recent preview recordings
6. **Custom STUN/TURN Configuration**: UI for configuring NAT traversal servers
7. **Preview Analytics**: Connection quality metrics, bitrate graphs
8. **Mobile Optimization**: Optimized preview UI for mobile devices

---

## Open Questions

1. **Offer Source Priority**: Should we prefer offer from ACK or from
   `preview.offer` event?
   - **Recommendation**: Use `preview.offer` event (more consistent with
     event-driven architecture)

2. **Multiple Preview Connections**: Should we limit number of simultaneous
   preview connections per device?
   - **Recommendation**: No limit initially, let device firmware handle it

3. **Preview Persistence**: Should preview auto-start when device connects?
   - **Recommendation**: No - let users explicitly start preview (saves
     bandwidth)

4. **Preview During Recording**: Should preview continue during recording
   sessions?
   - **Recommendation**: Yes - preview and recording are independent features

5. **ICE Candidate Handling**: Should we queue ICE candidates if received before
   offer?
   - **Recommendation**: Yes - queue and apply once remote description is set

---

## Timeline Estimate

- **Phase 1** (Backend Commands): 2-3 hours
- **Phase 2** (Message Routing): 3-4 hours
- **Phase 3** (WebRTC Composable): 4-6 hours
- **Phase 4** (Preview Component): 3-4 hours
- **Phase 5** (WebSocket Integration): 2-3 hours
- **Phase 6** (Error Handling): 2-3 hours
- **Phase 7** (Configuration - Optional): 2-3 hours

**Total Estimate**: 18-26 hours

**Testing**: Additional 4-6 hours

---

## Next Steps

1. Review and approve this integration plan
2. Decide on composable structure (single vs. separated concerns)
3. Start with Phase 1 (backend command support)
4. Implement incrementally, testing each phase
5. Document any deviations from plan
6. Update this document with implementation notes

---

**Last Updated**: 2025-01-31
