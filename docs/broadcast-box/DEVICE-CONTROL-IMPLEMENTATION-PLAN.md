# Device Control Implementation Plan

## Overview
Implement live device control UI with scheduler-compatible architecture, following the design in `DEVICE-CONTROL-SCHEDULER-COMPATIBILITY-ANALYSIS.md`.

## Implementation Phases

### Phase 1: DeviceCommandService (Foundation)
**Goal**: Create unified command execution layer  
**Estimated Time**: 4-6 hours  
**Priority**: Critical (foundation for everything)

#### Step 1.1: Create DeviceCommandService
**File**: `modules/broadcast-box/src/services/device-command-service.ts`

**Tasks**:
1. Create `DeviceCommandService` class
2. Define interfaces:
   - `CommandSource` (type, userId, schedulerId, metadata)
   - `CommandRequest` (deviceId, action, payload, source, timeout)
   - `CommandResponse` (success, commandId, ack, error, timestamp)
3. Implement core methods:
   - `executeCommand(request: CommandRequest): Promise<CommandResponse>`
   - `private sendCommandViaWebSocket(...)`
   - `private validateCommand(...)`
   - `private logCommand(...)`
4. Dependencies:
   - `RoomManager` (for WebSocket transport)
   - `ProtocolHandler` (for command creation)
   - `DeviceConnectionTracker` (for connection checks)
   - `DeviceEventModel` (for audit logging)
   - `DeviceManager` (for device validation)

**Key Implementation Details**:
- Check device connection before sending
- Create command message via `ProtocolHandler`
- Send via `RoomManager.getRoom().broadcast()`
- Wait for ack response (with timeout, default 5s)
- Handle errors and timeouts gracefully
- Log command execution to `DeviceEventModel`

#### Step 1.2: Register Service in DI Container
**File**: `modules/broadcast-box/src/broadcast-box-services.ts`

**Tasks**:
1. Register `DeviceCommandService` as singleton
2. Resolve dependencies:
   - `realtimeRoomManager`
   - `broadcastBoxProtocol`
   - `broadcastBoxConnectionTracker`
   - `broadcastBoxDeviceEventModel`
   - `broadcastBoxDeviceManager`
   - `logger`

#### Step 1.3: Add Convenience Methods
**File**: `modules/broadcast-box/src/services/device-command-service.ts`

**Tasks**:
1. Add helper methods:
   - `switchSource(deviceId, videoSource?, audioSource?, source)`
   - `updateConfig(deviceId, config, source)`
   - `getStatus(deviceId, source)`
   - `listSources(deviceId, source)`
2. Each method calls `executeCommand()` with appropriate action/payload

#### Step 1.4: Unit Tests
**File**: `modules/broadcast-box/src/__tests__/device-command-service.test.ts`

**Tasks**:
1. Test command execution flow
2. Test connection validation
3. Test timeout handling
4. Test error handling
5. Test audit logging
6. Mock dependencies (RoomManager, ProtocolHandler, etc.)

---

### Phase 2: Backend Command Handlers
**Goal**: Add new command handlers for device control  
**Estimated Time**: 2-3 hours  
**Priority**: High

#### Step 2.1: Add `switch_source` Handler
**File**: `modules/broadcast-box/src/websocket/command-handlers.ts`

**Tasks**:
1. Register `switch_source` handler in `createDefaultCommandHandlers()`
2. Validate `videoSource` and `audioSource` against device capabilities
3. Update device state/config
4. Return ack with new active sources
5. Handle errors (invalid source, device not connected, etc.)

**Handler Logic**:
```typescript
registry.registerHandler('switch_source', async (command, context) => {
  const { videoSource, audioSource } = command.payload;
  
  // Get device to validate capabilities
  const device = await context.deviceManager.getDevice(context.deviceId);
  
  // Validate sources against capabilities
  if (videoSource && !device.capabilities.videoSources.includes(videoSource)) {
    return context.protocol.createAck(command.id, false, 'Invalid video source');
  }
  if (audioSource && !device.capabilities.audioSources.includes(audioSource)) {
    return context.protocol.createAck(command.id, false, 'Invalid audio source');
  }
  
  // Update device config (if DeviceManager supports it)
  // Or just return ack - device will handle the switch
  
  return context.protocol.createAck(command.id, true, undefined, {
    videoSource: videoSource || device.config.defaultVideoSource,
    audioSource: audioSource || device.config.defaultAudioSource,
  });
});
```

#### Step 2.2: Add `list_sources` Handler
**File**: `modules/broadcast-box/src/websocket/command-handlers.ts`

**Tasks**:
1. Register `list_sources` handler
2. Get device capabilities
3. Return available video/audio sources

**Handler Logic**:
```typescript
registry.registerHandler('list_sources', async (command, context) => {
  const device = await context.deviceManager.getDevice(context.deviceId);
  
  return context.protocol.createAck(command.id, true, undefined, {
    videoSources: device.capabilities.videoSources || [],
    audioSources: device.capabilities.audioSources || [],
  });
});
```

#### Step 2.3: Update Existing Handlers (if needed)
**File**: `modules/broadcast-box/src/websocket/command-handlers.ts`

**Tasks**:
1. Review existing handlers (`update_config`, `get_status`)
2. Ensure they work with new architecture
3. Add any missing validation

#### Step 2.4: Unit Tests
**File**: `modules/broadcast-box/src/__tests__/command-handlers.test.ts`

**Tasks**:
1. Test `switch_source` handler
2. Test `list_sources` handler
3. Test validation logic
4. Test error cases

---

### Phase 3: API Endpoint
**Goal**: Add REST API endpoint for device commands  
**Estimated Time**: 2-3 hours  
**Priority**: High

#### Step 3.1: Add Command Endpoint
**File**: `modules/broadcast-box/src/api/devices.ts`

**Tasks**:
1. Add `POST /api/v1/broadcast-box/devices/:id/command` route
2. Validate request body (action, payload)
3. Resolve `DeviceCommandService` from container
4. Extract user from `req.user` (from auth middleware)
5. Call `deviceCommandService.executeCommand()` with:
   - `deviceId` from route params
   - `action` from body
   - `payload` from body
   - `source: { type: 'user', userId: req.user.id, metadata: { ip: req.ip } }`
6. Return `CommandResponse` as JSON
7. Handle errors appropriately

**Route Implementation**:
```typescript
router.post(
  '/:id/command',
  authMiddleware, // Require authentication
  [
    body('action').isString().notEmpty(),
    body('payload').optional().isObject(),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    // Validation, service call, response
  }
);
```

#### Step 3.2: Add Validation
**File**: `modules/broadcast-box/src/api/devices.ts`

**Tasks**:
1. Validate `action` is one of allowed actions
2. Validate `payload` structure based on action
3. Validate device exists and user has permission
4. Return clear error messages

#### Step 3.3: Update Router Registration
**File**: `modules/broadcast-box/src/api/index.ts`

**Tasks**:
1. Pass `DeviceCommandService` to `createDevicesRouter()`
2. Update function signature if needed

#### Step 3.4: Integration Tests
**File**: `modules/broadcast-box/src/__tests__/api/devices-command.test.ts`

**Tasks**:
1. Test command endpoint with valid requests
2. Test authentication requirement
3. Test validation errors
4. Test device not found
5. Test device not connected
6. Test command execution success/failure

---

### Phase 4: UI Composable
**Goal**: Create Vue composable for device commands  
**Estimated Time**: 2-3 hours  
**Priority**: High

#### Step 4.1: Create useDeviceCommands Composable
**File**: `modules/ui/app/composables/useDeviceCommands.ts`

**Tasks**:
1. Create composable function
2. Use `useNuxtApp().$civicApi` for API calls
3. Implement methods:
   - `sendCommand(action, payload)`
   - `switchSource(videoSource?, audioSource?)`
   - `updateConfig(config)`
   - `getStatus()`
   - `listSources()`
4. Handle loading states
5. Handle errors (toast notifications)
6. Return reactive state (loading, error, lastResponse)

**Implementation**:
```typescript
export function useDeviceCommands(deviceId: Ref<string | undefined>) {
  const $civicApi = useNuxtApp().$civicApi;
  const toast = useToast();
  const { t } = useI18n();
  
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastResponse = ref<CommandResponse | null>(null);
  
  const sendCommand = async (action: string, payload: any) => {
    if (!deviceId.value) throw new Error('Device ID required');
    
    loading.value = true;
    error.value = null;
    
    try {
      const response = await $civicApi(
        `/api/v1/broadcast-box/devices/${deviceId.value}/command`,
        {
          method: 'POST',
          body: { action, payload },
        }
      );
      
      lastResponse.value = response;
      return response;
    } catch (err: any) {
      error.value = err.message;
      toast.add({
        title: t('broadcastBox.errors.commandFailed'),
        description: err.message,
        color: 'error',
      });
      throw err;
    } finally {
      loading.value = false;
    }
  };
  
  // Convenience methods...
  
  return {
    sendCommand,
    switchSource,
    updateConfig,
    getStatus,
    listSources,
    loading,
    error,
    lastResponse,
  };
}
```

#### Step 4.2: Add Translation Keys
**Files**: 
- `modules/ui/i18n/locales/en.json`
- `modules/ui/i18n/locales/fr.json`

**Tasks**:
1. Add keys for command errors
2. Add keys for command success messages
3. Add keys for loading states

---

### Phase 5: UI Control Components
**Goal**: Create UI control cards for device management  
**Estimated Time**: 4-6 hours  
**Priority**: Medium

#### Step 5.1: Source Control Card Component
**File**: `modules/ui/app/components/broadcast-box/DeviceSourceControl.vue`

**Tasks**:
1. Create component
2. Props: `device` (BroadcastDevice)
3. Use `useDeviceCommands` composable
4. Display:
   - Video source dropdown (from capabilities)
   - Audio source dropdown (from capabilities)
   - Current active sources (from config)
   - "Switch" button
5. Handle loading state
6. Show success/error feedback
7. Disable if device not connected

#### Step 5.2: Configuration Control Card Component
**File**: `modules/ui/app/components/broadcast-box/DeviceConfigControl.vue`

**Tasks**:
1. Create component
2. Props: `device` (BroadcastDevice)
3. Use `useDeviceCommands` composable
4. Display:
   - Quality preset selector
   - Auto-start toggle
   - Current configuration
   - "Apply" button
5. Handle loading state
6. Show success/error feedback

#### Step 5.3: Status Control Card Component
**File**: `modules/ui/app/components/broadcast-box/DeviceStatusControl.vue`

**Tasks**:
1. Create component
2. Props: `device` (BroadcastDevice), `connectionStatus` (from useDeviceConnectionStatus)
3. Use `useDeviceCommands` composable
4. Display:
   - "Refresh Status" button
   - Last refresh time
   - Current device state
   - Active session ID (if recording)
   - Auto-refresh toggle
5. Implement auto-refresh (every 30s when enabled)

#### Step 5.4: Integrate into Device Detail Page
**File**: `modules/ui/app/pages/settings/broadcast-box/[id]/index.vue`

**Tasks**:
1. Import new components
2. Add cards after "Device Capabilities" section
3. Pass required props
4. Handle component events if needed

---

### Phase 6: Testing & Refinement
**Goal**: Test and refine implementation  
**Estimated Time**: 2-3 hours  
**Priority**: High

#### Step 6.1: Integration Testing
**Tasks**:
1. Test full flow: UI → API → DeviceCommandService → Device
2. Test error scenarios (device disconnected, invalid command, etc.)
3. Test with real device (if available)
4. Test command response handling
5. Test audit logging

#### Step 6.2: UI/UX Refinement
**Tasks**:
1. Test loading states
2. Test error messages
3. Test success feedback
4. Test disabled states
5. Test responsive design
6. Test accessibility

#### Step 6.3: Documentation
**Tasks**:
1. Update `modules/broadcast-box/README.md`
2. Document new API endpoint
3. Document new composable
4. Document new components

---

## Implementation Order

### Week 1: Foundation
1. ✅ Phase 1: DeviceCommandService (4-6 hours)
2. ✅ Phase 2: Backend Command Handlers (2-3 hours)
3. ✅ Phase 3: API Endpoint (2-3 hours)

**Total**: 8-12 hours

### Week 2: UI
4. ✅ Phase 4: UI Composable (2-3 hours)
5. ✅ Phase 5: UI Control Components (4-6 hours)
6. ✅ Phase 6: Testing & Refinement (2-3 hours)

**Total**: 8-12 hours

**Grand Total**: 16-24 hours (2-3 days of focused work)

---

## Dependencies & Prerequisites

### Required
- ✅ Existing WebSocket infrastructure (RoomManager, ProtocolHandler)
- ✅ DeviceConnectionTracker service
- ✅ DeviceEventModel for audit logging
- ✅ DeviceManager for device validation
- ✅ Authentication middleware for API

### Optional (for future)
- Scheduler system (not needed for Phase 1-6)
- Command queue/retry mechanism (can be added later)

---

## Testing Strategy

### Unit Tests
- DeviceCommandService (command execution, validation, error handling)
- Command handlers (switch_source, list_sources)
- API endpoint (validation, authentication, error handling)

### Integration Tests
- Full command flow (UI → API → Service → Device)
- Error scenarios
- Connection state handling

### Manual Testing
- Test with real device
- Test UI components
- Test error states
- Test loading states

---

## Success Criteria

### Phase 1 Complete When:
- [ ] DeviceCommandService created and registered
- [ ] Can execute commands via service
- [ ] Commands logged to audit trail
- [ ] Unit tests passing

### Phase 2 Complete When:
- [ ] `switch_source` handler implemented
- [ ] `list_sources` handler implemented
- [ ] Handlers registered and working
- [ ] Unit tests passing

### Phase 3 Complete When:
- [ ] API endpoint created
- [ ] Authentication required
- [ ] Validation working
- [ ] Can execute commands via API
- [ ] Integration tests passing

### Phase 4 Complete When:
- [ ] `useDeviceCommands` composable created
- [ ] All convenience methods implemented
- [ ] Error handling working
- [ ] Loading states working

### Phase 5 Complete When:
- [ ] All control card components created
- [ ] Components integrated into device detail page
- [ ] UI working end-to-end
- [ ] All features functional

### Phase 6 Complete When:
- [ ] All tests passing
- [ ] Manual testing complete
- [ ] Documentation updated
- [ ] Ready for production

---

## Risk Mitigation

### Risk 1: Device Not Connected
**Mitigation**: 
- Check connection before sending command
- Return clear error message
- UI shows connection status

### Risk 2: Command Timeout
**Mitigation**:
- Default 5s timeout
- Configurable per command
- Clear error message
- Allow retry

### Risk 3: Backward Compatibility
**Mitigation**:
- Keep SessionController unchanged initially
- DeviceCommandService is additive
- Can refactor SessionController later

### Risk 4: Performance
**Mitigation**:
- Commands are async
- No blocking operations
- Can add rate limiting if needed

---

## Future Enhancements (Post-MVP)

1. **Command Queue**: Queue commands when device disconnected, execute when reconnected
2. **Command Retry**: Automatic retry with exponential backoff
3. **Command History**: UI to view recent commands
4. **Batch Commands**: Execute multiple commands atomically
5. **Scheduler Integration**: Use DeviceCommandService for scheduled commands

---

## Notes

- All code should follow existing patterns in the codebase
- Use TypeScript strictly (no `any` types where possible)
- Follow existing error handling patterns
- Use existing logging infrastructure
- Maintain backward compatibility
- Write tests as you go (don't leave for later)

---

## Ready to Start?

**Prerequisites Check**:
- [x] Architecture designed
- [x] Implementation plan created
- [x] Dependencies identified
- [x] Testing strategy defined

**Next Step**: Begin Phase 1, Step 1.1 - Create DeviceCommandService

