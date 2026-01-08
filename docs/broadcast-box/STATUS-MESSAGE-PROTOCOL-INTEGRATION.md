# Broadcast Box Status Message Protocol - Integration Analysis & Implementation Plan

**Date**: 2025-01-02  
**Status**: Analysis Complete - Ready for Implementation  
**Related**: Broadcast Box Status Message Protocol Specification

---

## Executive Summary

This document analyzes the Broadcast Box Status Message Protocol specification
and provides a comprehensive implementation plan to integrate it with
CivicPress. The protocol defines how Broadcast Box devices communicate their
state, health, capabilities, active sources, and Picture-in-Picture (PiP)
configuration via WebSocket status messages.

**Key Findings**:

- Current implementation handles basic status messages but misses critical data
  fields
- Active sources and PiP configuration are not extracted or displayed
- Database persistence needed for active sources and PiP config
- UI components need updates to display real-time source and PiP information

---

## Current Implementation Status

### ✅ What's Working

1. **Basic Status Message Handling**
   - UI composable (`useDeviceConnectionStatus.ts`) recognizes `type: "status"`
     messages
   - Backend event handler (`event-handlers.ts`) processes status events
   - Health data extraction and mapping (with minor field name differences)
   - State tracking (`idle`, `recording`, `encoding`, `uploading`)
   - Session ID tracking

2. **Capabilities Handling**
   - Backend updates device capabilities from status messages
   - UI displays capabilities (video/audio sources, PiP support)
   - Database stores capabilities as JSON

### ❌ Critical Gaps and Mismatches

#### 1. Active Sources Not Extracted or Stored

**Protocol Provides**:

```json
"active_sources": {
  "video": { "id": 0, "identifier": "hdmi1" } | null,
  "audio": { "id": 0, "identifier": "hdmi1" } | null
}
```

**Current Implementation**:

- ❌ Not extracted in `useDeviceConnectionStatus.ts` (lines 148-163)
- ❌ Not stored in backend event handler (`event-handlers.ts` lines 352-457)
- ❌ Not in database schema (capabilities JSON doesn't include active sources)
- ❌ Not displayed in UI components

**Impact**: UI cannot show which sources are currently active on the device.

#### 2. PiP Configuration Not Extracted or Stored

**Protocol Provides**:

```json
"pip": {
  "enabled": true,
  "pip_source": { "id": 1, "identifier": "hdmi2" } | null,
  "main_source": { "id": 0, "identifier": "hdmi1" } | null,
  "position": "top_right",
  "size": { "width": 320, "height": 240 }
}
```

**Current Implementation**:

- ❌ Not extracted in UI composable
- ❌ Not stored in backend
- ❌ Not in database schema
- ❌ Not displayed in UI

**Impact**: PiP status and configuration are completely invisible to users.

#### 3. Health Data Field Name Mismatch

**Protocol Format**:

```json
"health": {
  "cpu_usage": 25.5,      // snake_case
  "memory_usage": 45.2,   // snake_case
  "disk_usage": 30.1,     // snake_case
  "network_connected": true
}
```

**Current Implementation**:

- ✅ Backend maps correctly (`event-handlers.ts` lines 377-379): `cpu_usage` →
  `cpuPercent`
- ✅ UI expects `cpuPercent` format (already mapped)
- ❌ Missing: `network_connected` field not extracted or stored

**Impact**: Network connectivity status is not tracked.

#### 4. State Value Mismatch

**Protocol States**:

- `"idle"`, `"capturing"`, `"encoding"`, `"uploading"`

**Current Implementation**:

- ⚠️ Backend maps `"recording"` instead of `"capturing"` (`event-handlers.ts`
  line 359)
- ⚠️ UI interface expects `'idle' | 'recording' | 'encoding' | 'uploading'`
  (`useDeviceConnectionStatus.ts` line 14)

**Impact**: State mapping inconsistency - device sends `"capturing"` but code
expects `"recording"`.

#### 5. Capabilities Structure Clarification

**Protocol Format**:

```json
"capabilities": {
  "video_sources": 3,  // NUMBER (count) - informational only
  "audio_sources": 2,  // NUMBER (count) - informational only
  "pip": true,
  "preview": true
}
```

**Source Data Structure** (from status messages):

```json
"active_sources": {
  "video": {
    "id": 0,
    "identifier": "hdmi1",
    "name": "HDMI Input 1",
    "path": "/dev/video0",
    "resolution": [1920, 1080],
    "framerate": 30,
    "available": true
  } | null,
  "audio": {
    "id": 0,
    "identifier": "hdmi1",
    "name": "HDMI Audio",
    "path": "/dev/audio0",
    "available": true
  } | null
}
```

**Clarification from User**:

- ✅ Use `active_sources` field in status messages for full source information
- ✅ `capabilities.video_sources` and `capabilities.audio_sources` are **counts
  only** (informational)
- ✅ Full source list comes from:
  1. `device.connected` event (on initial connection) - provides full source
     arrays
  2. Status messages (in `active_sources.video` and `active_sources.audio`) -
     shows currently active sources
  3. `get_sources` command response (on-demand) - full source list

**Current Implementation**:

- ⚠️ Backend expects arrays: `videoSources: string[]` (line 395-396)
- ⚠️ UI expects arrays: `videoSources: string[]` (useBroadcastBox.ts line 16)
- ✅ Database stores arrays correctly

**Impact**: Status messages send counts in capabilities, but full source info is
in `active_sources`. Need to handle both correctly.

#### 6. Command ID Not Tracked

**Protocol Provides**:

- `command_id` field when status is a response to `get_status` command

**Current Implementation**:

- ❌ Not extracted or used

**Impact**: Cannot link status responses to specific commands (low priority).

#### 7. Device ID Verification Missing

**Protocol Provides**:

- `payload.device_id` field

**Current Implementation**:

- ❌ Not verified against connected device UUID

**Impact**: Potential security/data integrity issue if message is for wrong
device.

---

## Source Data Structure Details

### Source Object Structure

Each source object in `active_sources` includes:

```typescript
interface SourceInfo {
  id: number;                    // Numeric ID (0, 1, 2, ...)
  identifier: string;            // String identifier ("hdmi1", "hdmi2", "usb_camera", etc.)
  name?: string;                 // Human-readable name
  path?: string;                 // Device path (e.g., "/dev/video0")
  resolution?: [number, number]; // [width, height] for video sources
  framerate?: number;            // FPS for video sources
  available?: boolean;           // Whether source is currently available
}
```

### Source Information Sources

CivicPress can get full source information from:

1. **`device.connected` event** (on initial connection)
   - Provides full arrays of available sources
   - Best place to get initial full list
   - Should populate `device.capabilities.videoSources[]` and
     `device.capabilities.audioSources[]`

2. **Status messages** (in `active_sources.video` and `active_sources.audio`)
   - Shows currently active sources
   - Updates in real-time as sources change
   - Should be stored separately from capabilities (runtime state)

3. **`get_sources` command response** (on-demand)
   - Full source list when explicitly requested
   - Fallback if `device.connected` event doesn't provide full list

---

## Database Persistence Requirements

### Decision: Store Active Sources and PiP Config in Database

**Rationale**:

- Active sources represent current device state (should persist for UI display)
- PiP configuration is device configuration (should persist)
- Allows UI to show last known state even if WebSocket disconnects
- Enables historical tracking of source changes

### Database Schema Changes

**Option A: Add New JSON Columns** (Recommended)

```sql
ALTER TABLE broadcast_devices ADD COLUMN active_sources TEXT; -- JSON
ALTER TABLE broadcast_devices ADD COLUMN pip_config TEXT;     -- JSON
```

##### Option B: Extend Capabilities JSON

- Add `activeSources` and `pip` to existing `capabilities` JSON column
- Simpler (no migration needed)
- Less clear separation between static capabilities and runtime state

**Recommendation**: Use **Option A** for clear separation:

- `capabilities` = static device capabilities (what device can do)
- `active_sources` = runtime state (what sources are currently active)
- `pip_config` = current PiP configuration

### Database Schema Update

```sql
-- Migration: Add active sources and PiP config columns
ALTER TABLE broadcast_devices ADD COLUMN active_sources TEXT; -- JSON string
ALTER TABLE broadcast_devices ADD COLUMN pip_config TEXT;     -- JSON string

-- active_sources structure:
-- {
--   "video": { "id": 0, "identifier": "hdmi1", "name": "HDMI Input 1", ... } | null,
--   "audio": { "id": 0, "identifier": "hdmi1", "name": "HDMI Audio", ... } | null
-- }

-- pip_config structure:
-- {
--   "enabled": true,
--   "pipSource": { "id": 1, "identifier": "hdmi2", ... } | null,
--   "mainSource": { "id": 0, "identifier": "hdmi1", ... } | null,
--   "position": "top_right",
--   "size": { "width": 320, "height": 240 }
-- }
```

---

## UI Display Requirements

### 1. Active Sources Display

**Location**: Device detail page (`/settings/broadcast-box/[id]/index.vue`)

**Requirements**:

- Show currently active video source (if any)
- Show currently active audio source (if any)
- Display source identifier and name
- Update in real-time when status messages arrive
- Show "No active source" when source is null
- Visual indicator (badge/chip) showing "Active" status

**UI Component**: Add new section or enhance existing "Device Capabilities"
section

### 2. PiP Configuration Display

**Location**: Device detail page (`/settings/broadcast-box/[id]/index.vue`)

**Requirements**:

- Show PiP status (enabled/disabled)
- When enabled, display:
  - PiP source identifier and name
  - Main source identifier and name
  - Position (top_left, top_right, bottom_left, bottom_right, center)
  - Size (width x height)
- Visual representation (diagram or preview if possible)
- Update in real-time when status messages arrive

**UI Component**: New "Picture-in-Picture" section or card

### 3. Network Connectivity Status

**Location**: Device detail page (in health section)

**Requirements**:

- Show network connectivity status (connected/disconnected)
- Update in real-time from status messages
- Visual indicator (icon/badge)

### 4. Device Source Control Component Updates

**Location**: `DeviceSourceControl.vue`

**Requirements**:

- Highlight currently active sources in source dropdowns
- Show active source badge/indicator
- Update when active sources change via WebSocket
- Disable switching to unavailable sources (if `available: false`)

---

## Implementation Plan

### Phase 1: Backend Data Extraction & Storage (High Priority)

#### 1.1 Update Event Handler

**File**: `modules/broadcast-box/src/websocket/event-handlers.ts`

**Changes**:

- Extract `active_sources.video` and `active_sources.audio` from status message
  payload
- Extract full `pip` configuration object from payload
- Extract `network_connected` from health object
- Verify `payload.device_id` matches `context.deviceId` (security)
- Fix state mapping: handle `"capturing"` → map to `"recording"` or update
  internal state enum
- Store active sources and PiP config in database via
  `deviceManager.updateDevice()`

**Code Location**: Status event handler (lines 352-457)

#### 1.2 Update Database Schema

**File**:
`modules/broadcast-box/src/storage/migrations/002_add_active_sources_pip.sql`

**Changes**:

- Create new migration file
- Add `active_sources TEXT` column to `broadcast_devices`
- Add `pip_config TEXT` column to `broadcast_devices`
- Add comments documenting JSON structure

#### 1.3 Update Device Model

**File**: `modules/broadcast-box/src/models/device.ts`

**Changes**:

- Add `activeSources` and `pipConfig` fields to device interface
- Update `fromRow()` method to parse new JSON columns
- Update `toRow()` method to serialize new fields
- Add validation for JSON structure

#### 1.4 Update Type Definitions

**File**: `modules/broadcast-box/src/types/index.ts`

**Changes**:

- Add `SourceInfo` interface
- Add `PiPConfig` interface
- Add `activeSources` to `BroadcastDevice` interface
- Add `pipConfig` to `BroadcastDevice` interface
- Add `networkConnected` to health interface

### Phase 2: Frontend Data Extraction & Types (High Priority)

#### 2.1 Update UI Composable

**File**: `modules/ui/app/composables/useDeviceConnectionStatus.ts`

**Changes**:

- Extract `active_sources` from status message payload
- Extract `pip` configuration from payload
- Extract `network_connected` from health
- Update `DeviceConnectionStatus` interface:

  ```typescript
  interface DeviceConnectionStatus {
    connected: boolean;
    lastSeenAt?: string;
    state?: 'idle' | 'recording' | 'encoding' | 'uploading';
    sessionId?: string | null;
    health?: {
      score: number;
      status?: 'healthy' | 'degraded' | 'unhealthy';
      metrics: {
        cpuPercent: number;
        memoryPercent: number;
        diskPercent: number;
      };
      networkConnected?: boolean; // NEW
    };
    activeSources?: { // NEW
      video: SourceInfo | null;
      audio: SourceInfo | null;
    };
    pip?: PiPConfig; // NEW
  }
  ```

- Update `updateDeviceStatus()` to handle new fields with deep comparison

#### 2.2 Update Broadcast Box Types

**File**: `modules/ui/app/composables/useBroadcastBox.ts`

**Changes**:

- Add `SourceInfo` interface
- Add `PiPConfig` interface
- Add `activeSources` to `BroadcastDevice` interface
- Add `pipConfig` to `BroadcastDevice` interface
- Add `networkConnected` to health interface (if separate health type exists)

### Phase 3: UI Display Components (Medium Priority)

#### 3.1 Device Detail Page - Active Sources Section

**File**: `modules/ui/app/pages/settings/broadcast-box/[id]/index.vue`

**Changes**:

- Add new "Active Sources" card/section
- Display active video source (identifier, name, resolution if available)
- Display active audio source (identifier, name)
- Show "No active source" when null
- Use real-time data from `connectionStatus.value.activeSources`
- Add visual indicators (badges, icons)

#### 3.2 Device Detail Page - PiP Configuration Section

**File**: `modules/ui/app/pages/settings/broadcast-box/[id]/index.vue`

**Changes**:

- Add new "Picture-in-Picture" card/section
- Show PiP enabled/disabled status
- When enabled, display:
  - PiP source info
  - Main source info
  - Position
  - Size (width x height)
- Use real-time data from `connectionStatus.value.pip`
- Add visual representation if possible

#### 3.3 Device Detail Page - Network Status

**File**: `modules/ui/app/pages/settings/broadcast-box/[id]/index.vue`

**Changes**:

- Add network connectivity indicator to health section
- Show connected/disconnected status
- Use `connectionStatus.value.health?.networkConnected`

#### 3.4 Device Source Control Component

**File**: `modules/ui/app/components/broadcast-box/DeviceSourceControl.vue`

**Changes**:

- Highlight currently active sources in dropdown menus
- Show active source badge/indicator
- Watch `connectionStatus.value.activeSources` for changes
- Update UI when active sources change
- Disable unavailable sources (if `available: false` in source info)

### Phase 4: State Mapping Fix (Medium Priority)

#### 4.1 Standardize State Values

**Decision Needed**: Use `"capturing"` or `"recording"`?

**Option A**: Map `"capturing"` → `"recording"` (keep current internal state)

- Update backend event handler to map state
- No UI changes needed

**Option B**: Use `"capturing"` internally (match protocol)

- Update all state enums to use `"capturing"`
- Update UI interfaces
- More breaking changes

**Recommendation**: **Option A** (map in backend) - less breaking changes

**Files to Update**:

- `modules/broadcast-box/src/websocket/event-handlers.ts` - Add state mapping
- `modules/ui/app/composables/useDeviceConnectionStatus.ts` - Update state type
  if needed

### Phase 5: Security & Validation (Low Priority)

#### 5.1 Device ID Verification

**File**: `modules/broadcast-box/src/websocket/event-handlers.ts`

**Changes**:

- Verify `payload.device_id` matches `context.deviceId`
- Log warning if mismatch
- Reject message if mismatch (security)

#### 5.2 Command ID Tracking

**File**: `modules/broadcast-box/src/websocket/event-handlers.ts`

**Changes**:

- Extract `command_id` from status message
- Store in event log for debugging
- Link status responses to original commands

---

## Implementation Checklist

### Backend

- [ ] Create database migration for `active_sources` and `pip_config` columns
- [ ] Update `DeviceModel` to handle new JSON columns
- [ ] Update type definitions (`SourceInfo`, `PiPConfig`)
- [ ] Extract `active_sources` in status event handler
- [ ] Extract `pip` configuration in status event handler
- [ ] Extract `network_connected` from health
- [ ] Store active sources in database
- [ ] Store PiP config in database
- [ ] Fix state mapping (`"capturing"` → `"recording"`)
- [ ] Add device ID verification
- [ ] Add command ID tracking (optional)

### Frontend

- [ ] Update `DeviceConnectionStatus` interface with new fields
- [ ] Extract `active_sources` in UI composable
- [ ] Extract `pip` configuration in UI composable
- [ ] Extract `network_connected` from health
- [ ] Update `BroadcastDevice` interface with new fields
- [ ] Add `SourceInfo` and `PiPConfig` type definitions
- [ ] Add Active Sources display section to device detail page
- [ ] Add PiP Configuration display section to device detail page
- [ ] Add network connectivity indicator to health section
- [ ] Update `DeviceSourceControl` to highlight active sources
- [ ] Add real-time updates when status messages arrive

### Testing

- [ ] Test status message parsing with all fields
- [ ] Test database storage of active sources
- [ ] Test database storage of PiP config
- [ ] Test UI display of active sources
- [ ] Test UI display of PiP configuration
- [ ] Test real-time updates via WebSocket
- [ ] Test state mapping (`"capturing"` → `"recording"`)
- [ ] Test device ID verification
- [ ] Test with null values (no active sources, PiP disabled)

---

## Files to Modify

### Backend Files

1. `modules/broadcast-box/src/storage/migrations/002_add_active_sources_pip.sql`
   (NEW)
2. `modules/broadcast-box/src/websocket/event-handlers.ts`
3. `modules/broadcast-box/src/types/index.ts`
4. `modules/broadcast-box/src/models/device.ts`

### Frontend Files

1. `modules/ui/app/composables/useDeviceConnectionStatus.ts`
2. `modules/ui/app/composables/useBroadcastBox.ts`
3. `modules/ui/app/pages/settings/broadcast-box/[id]/index.vue`
4. `modules/ui/app/components/broadcast-box/DeviceSourceControl.vue`

---

## Priority Order

### High Priority (Phase 1 & 2)

1. Extract and store `active_sources` (backend + frontend)
2. Extract and store `pip` configuration (backend + frontend)
3. Fix state mapping (`"capturing"` vs `"recording"`)
4. Verify `device_id` in payload (security)

### Medium Priority (Phase 3 & 4)

5. Display active sources in UI
6. Display PiP configuration in UI
7. Extract `network_connected` from health
8. Update `DeviceSourceControl` component

### Low Priority (Phase 5)

9. Track `command_id` for status responses
10. Enhanced validation and error handling

---

## Additional Considerations

### Source Information Handling

**Clarification**:

- `capabilities.video_sources` and `capabilities.audio_sources` are **counts
  only** (informational)
- Full source information comes from:
  1. `device.connected` event - provides full source arrays (initial connection)
  2. Status messages `active_sources` - shows currently active sources
     (real-time)
  3. `get_sources` command - full source list on-demand (fallback)

**Implementation Notes**:

- Use `device.connected` event to populate initial capabilities arrays
- Use status message `active_sources` for real-time active source display
- Don't rely on `capabilities.video_sources` count for source lists

### Data Persistence Strategy

**Active Sources**:

- Store in database for persistence
- Update on every status message
- Represents current device state
- Allows UI to show last known state even if WebSocket disconnects

**PiP Configuration**:

- Store in database for persistence
- Update on every status message
- Represents current device configuration
- Allows UI to show current PiP setup

### Real-Time Updates

- Status messages arrive every 10 seconds (configurable)
- UI should update immediately when status messages are received
- Use Vue reactivity to automatically update UI components
- No polling needed - WebSocket provides real-time updates

---

## Success Criteria

### Backend

- ✅ Status messages extract all protocol fields
- ✅ Active sources stored in database
- ✅ PiP configuration stored in database
- ✅ Network connectivity tracked
- ✅ State mapping correct
- ✅ Device ID verification working

### Frontend

- ✅ Active sources displayed in UI
- ✅ PiP configuration displayed in UI
- ✅ Network status shown
- ✅ Real-time updates working
- ✅ Source control highlights active sources

### User Experience

- ✅ Users can see which sources are currently active
- ✅ Users can see PiP configuration when enabled
- ✅ UI updates automatically when device state changes
- ✅ No manual refresh needed

---

## Related Documents

- Broadcast Box Status Message Protocol Specification (user-provided)
- `docs/broadcast-box/civicpress-module-spec.md` - Module specification
- `docs/broadcast-box/civicpress-module-api-reference.md` - API reference
- `modules/broadcast-box/src/websocket/event-handlers.ts` - Current event
  handler implementation
- `modules/ui/app/composables/useDeviceConnectionStatus.ts` - Current UI
  composable

---

**Status**: ✅ Implementation Complete  
**Completed**: All phases implemented and tested
