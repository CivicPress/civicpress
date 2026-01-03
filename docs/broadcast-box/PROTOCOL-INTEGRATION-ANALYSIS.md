# Broadcast Box Protocol Integration Analysis

**Date**: 2025-01-30  
**Purpose**: Compare the CivicPress Broadcast Box integration protocol with current implementation and identify gaps

---

## Executive Summary

The current implementation has **good foundational coverage** but is missing several protocol features, particularly around:
1. **Message format differences** - Protocol uses nested `payload.event_type` structure, we use flat `event` field
2. **Source management** - Protocol uses numeric IDs and detailed source objects, we use string names
3. **Status message format** - Protocol has comprehensive status structure, we have simplified version
4. **Configuration handling** - Protocol has detailed encoding presets and options, we have basic config
5. **Command naming** - Protocol uses `get_sources`, we use `list_sources`

---

## Message Format Comparison

### Protocol Specification
```json
{
  "type": "message_type",
  "payload": {
    "event_type": "...",  // For events
    "event_data": {...}    // For events
  },
  "timestamp": 1234567890.123
}
```

### Current Implementation
```typescript
{
  type: 'command' | 'event' | 'ack',
  id: string,              // UUID
  timestamp: string,       // ISO 8601
  action?: string,         // For commands
  event?: string,          // For events (flat, not nested)
  payload?: any,           // Direct payload, not nested
  commandId?: string,      // For acks
  success?: boolean        // For acks
}
```

**Gap**: Protocol uses nested `payload.event_type` and `payload.event_data`, while we use flat `event` field. This is a **structural mismatch** that needs alignment.

**Recommendation**: 
- **Option A**: Update our implementation to match protocol (breaking change)
- **Option B**: Update protocol documentation to match our simpler structure (if protocol is flexible)
- **Option C**: Add adapter layer to translate between formats

---

## Events (Device → CivicPress)

### 1. `device.connected` Event

#### Protocol Specification
- **Structure**: Nested `payload.event_type` and `payload.event_data`
- **Contains**: 
  - `sources.video[]` with detailed objects (id, path, name, resolution, framerate, available)
  - `sources.audio[]` with detailed objects (id, name, channels, sample_rate, available)
  - `capabilities` (pip, encoding_presets, max_resolution, max_framerate)
  - `configuration` (encoding_presets details, available_options)

#### Current Implementation
- **Structure**: Flat `event` field
- **Contains**: Basic `capabilities` and `version`
- **Missing**: 
  - Detailed source objects (we only have string arrays)
  - Source IDs (we use string names, protocol uses numeric IDs)
  - Configuration details (encoding presets, available options)
  - Source metadata (path, resolution, framerate, channels, sample_rate)

**Gap**: **CRITICAL** - We're missing the rich source information that the protocol provides. This affects:
- Source selection UI (can't show device details)
- Source validation (can't check availability)
- Configuration UI (can't show encoding preset details)

**Impact**: **HIGH** - UI cannot display proper source information or validate source availability.

---

### 2. `status` Event (Periodic Updates)

#### Protocol Specification
```json
{
  "type": "status",
  "payload": {
    "timestamp": 1706630400.123,
    "device_id": "...",
    "session": {
      "state": "idle",
      "session_id": null,
      "metadata": {}
    },
    "resources": {
      "cpu_percent": 25.5,
      "memory_percent": 45.2,
      "disk_percent": 60.1,
      "healthy": true
    },
    "storage": {
      "total_size_mb": 50000,
      "session_count": 5
    },
    "upload": {
      "queue_size": 0,
      "active_uploads": 0,
      "total_completed": 10,
      "total_failed": 0
    },
    "connection": {
      "connected": true,
      "state": "connected",
      "endpoint": "..."
    },
    "sources": {
      "video": [...],
      "audio": [...],
      "last_updated": 1706630400.123
    }
  }
}
```

#### Current Implementation
- We have `health.update` event with basic health metrics
- We track device state in `DeviceConnectionTracker`
- **Missing**:
  - Comprehensive status structure
  - Storage information
  - Upload queue information
  - Source updates in status
  - Session metadata

**Gap**: **MEDIUM** - Status updates are simplified. We have health metrics but not the full status structure.

**Impact**: **MEDIUM** - UI cannot display storage usage, upload queue, or detailed session information.

---

### 3. `session.started`, `session.stopped`, `session.complete`

#### Protocol vs Current
✅ **IMPLEMENTED** - All three events are handled correctly.

**Status**: **COMPLETE**

---

## Commands (CivicPress → Device)

### 1. `start_session`

#### Protocol Specification
```json
{
  "type": "command",
  "payload": {
    "action": "start_session",
    "session_id": "session-uuid-123",
    "config": {
      "video_source": 0,        // Numeric ID
      "audio_source": 0,        // Numeric ID
      "quality": "standard",
      "pip": {
        "enabled": true,
        "main": 0,
        "pip": 1,
        "position": "bottom-right"
      }
    }
  }
}
```

#### Current Implementation
```typescript
{
  action: 'start_session',
  payload: {
    sessionId: string,
    civicpressSessionId: string,
    config?: {
      videoSource?: string,    // String name, not numeric ID
      audioSource?: string,     // String name, not numeric ID
      quality?: string,
      pip?: PiPConfig
    }
  }
}
```

**Gap**: **MEDIUM** - We use string source names, protocol uses numeric IDs. This is a **data format mismatch**.

**Impact**: **MEDIUM** - If devices send numeric IDs, we need to map them to string names or update our system to use IDs.

---

### 2. `stop_session`

✅ **IMPLEMENTED** - Matches protocol specification.

**Status**: **COMPLETE**

---

### 3. `get_sources` vs `list_sources`

#### Protocol Specification
- Command name: `get_sources`
- Returns: Detailed source objects with IDs, paths, names, metadata

#### Current Implementation
- Command name: `list_sources`
- Returns: String arrays of source names

**Gap**: **LOW** - Command name difference (`get_sources` vs `list_sources`) and return format (detailed objects vs string arrays).

**Impact**: **LOW** - Easy to rename and enhance return format.

---

### 4. `get_status`

✅ **IMPLEMENTED** - Basic implementation exists, but returns simplified status compared to protocol.

**Gap**: **LOW** - Return format is simplified (connection state only), protocol expects full status structure.

---

### 5. `switch_source`

#### Protocol Specification
```json
{
  "action": "switch_source",
  "source_type": "video",  // "video", "audio", or "pip"
  "source_id": 1           // Numeric ID
}
```

#### Current Implementation
```typescript
{
  action: 'switch_source',
  payload: {
    videoSource?: string,  // String name
    audioSource?: string   // String name
  }
}
```

**Gap**: **MEDIUM** - Protocol uses `source_type` + `source_id` (numeric), we use `videoSource`/`audioSource` (string names). Also missing `pip` source type.

**Impact**: **MEDIUM** - Need to support protocol format or map between formats.

---

### 6. `update_config`

#### Protocol Specification
```json
{
  "action": "update_config",
  "config": {
    "quality_presets": {
      "standard": {
        "video_bitrate": 2000,
        "audio_bitrate": 128
      }
    },
    "network": {
      "bandwidth_limit_mbps": 10
    }
  }
}
```

#### Current Implementation
```typescript
{
  action: 'update_config',
  payload: {
    config: {
      defaultVideoSource?: string,
      defaultAudioSource?: string,
      qualityPreset?: 'low' | 'standard' | 'high',
      autoStart?: boolean
    }
  }
}
```

**Gap**: **HIGH** - Protocol supports detailed configuration (quality presets with bitrates, network settings), we only support basic config (preset names, auto-start).

**Impact**: **HIGH** - Cannot configure advanced settings like bitrates, network limits, etc.

---

## Data Structure Gaps

### Source Objects

#### Protocol Format
```typescript
{
  id: number,              // Numeric device ID
  path: string,           // e.g., "/dev/video0"
  name: string,           // Human-readable name
  resolution: [number, number],  // [width, height]
  framerate: number,      // FPS
  available: boolean      // Is device plugged in?
}
```

#### Current Format
```typescript
videoSources: string[]    // Just names: ["HDMI1", "HDMI2"]
audioSources: string[]    // Just names: ["USB Audio", "HDMI Audio"]
```

**Gap**: **CRITICAL** - We're missing all source metadata (IDs, paths, resolution, framerate, availability).

**Impact**: **HIGH** - UI cannot:
- Show device details
- Validate source availability
- Display resolution/framerate information
- Handle device plug/unplug events

---

### Configuration Objects

#### Protocol Format
```typescript
{
  encoding_presets: {
    low: { video_bitrate: 1000, audio_bitrate: 96, resolution: "1280x720", framerate: 30 },
    standard: { video_bitrate: 2000, audio_bitrate: 128, resolution: "1920x1080", framerate: 30 },
    high: { video_bitrate: 4000, audio_bitrate: 192, resolution: "1920x1080", framerate: 30 }
  },
  available_options: {
    inputs: { source_naming: true, default_boot_source: true, per_session_selection: true },
    pip: { enabled: true, layouts: [...], positions: [...] },
    audio_routing: { select_inputs: true, gain_presets: true, channel_selection: true },
    network: { ethernet: true, wifi: true, proxy_support: true, bandwidth_limits: true },
    storage: { buffer_size_limits: true, retention_rules: true }
  }
}
```

#### Current Format
```typescript
{
  defaultVideoSource?: string,
  defaultAudioSource?: string,
  qualityPreset?: 'low' | 'standard' | 'high',
  autoStart?: boolean
}
```

**Gap**: **HIGH** - We're missing detailed configuration options and encoding preset details.

**Impact**: **HIGH** - Cannot configure advanced features like:
- Custom bitrates
- Network settings
- Storage limits
- Audio routing
- PiP layouts

---

## Error Handling

### Protocol Error Codes
- `SESSION_ALREADY_ACTIVE`
- `SESSION_NOT_FOUND`
- `INVALID_CONFIG`
- `DEVICE_BUSY`
- `CAPTURE_ERROR`
- `SOURCE_NOT_FOUND`
- `SOURCE_NOT_AVAILABLE`

### Current Implementation
- Generic error messages
- No standardized error codes

**Gap**: **MEDIUM** - Missing standardized error codes.

**Impact**: **MEDIUM** - Error handling is less precise, harder to provide user-friendly error messages.

---

## Implementation Recommendations

### Priority 1: CRITICAL Gaps

1. **Source Object Structure** ⚠️
   - **Action**: Update `DeviceCapabilities` to include detailed source objects
   - **Files**: `types/index.ts`, `models/device.ts`, `services/device-manager.ts`
   - **Impact**: Enables proper source selection UI and validation

2. **Message Format Alignment** ⚠️
   - **Action**: Decide on message format (nested vs flat) and align implementation
   - **Options**: 
     - Update implementation to match protocol (breaking change)
     - Add adapter layer for translation
     - Update protocol to match implementation (if flexible)

### Priority 2: HIGH Gaps

3. **Configuration Structure** 
   - **Action**: Extend `DeviceConfig` to include encoding presets and advanced options
   - **Files**: `types/index.ts`, `services/device-manager.ts`, UI components
   - **Impact**: Enables advanced configuration features

4. **Status Message Format**
   - **Action**: Enhance status updates to include storage, upload queue, and source updates
   - **Files**: `websocket/event-handlers.ts`, `services/device-connection-tracker.ts`
   - **Impact**: Better device monitoring and status display

### Priority 3: MEDIUM Gaps

5. **Command Format Alignment**
   - **Action**: Align `switch_source` and `start_session` to use numeric IDs or add mapping
   - **Files**: `websocket/command-handlers.ts`, `services/device-command-service.ts`
   - **Impact**: Proper source switching and session start

6. **Error Code Standardization**
   - **Action**: Add standardized error codes matching protocol
   - **Files**: `websocket/command-handlers.ts`, `websocket/event-handlers.ts`
   - **Impact**: Better error handling and user feedback

### Priority 4: LOW Gaps

7. **Command Naming**
   - **Action**: Rename `list_sources` to `get_sources` (or vice versa)
   - **Files**: `websocket/command-handlers.ts`, `services/device-command-service.ts`, API endpoints
   - **Impact**: Consistency with protocol

---

## Migration Strategy

### Phase 1: Data Structure Updates (Non-Breaking)
1. Add new fields to types (make optional for backward compatibility)
2. Update database schema to store detailed source information
3. Update device registration to accept detailed sources

### Phase 2: Message Format Alignment
1. Add adapter layer to translate between formats
2. Support both formats during transition
3. Gradually migrate to protocol format

### Phase 3: Feature Enhancement
1. Add advanced configuration options
2. Enhance status updates
3. Add error code standardization

---

## Testing Checklist

Based on protocol requirements:

- [ ] Device connects and sends `device.connected` with detailed sources
- [ ] `get_sources` (or `list_sources`) returns detailed source objects
- [ ] `start_session` accepts numeric source IDs (or maps string names)
- [ ] `stop_session` works correctly
- [ ] `switch_source` supports video/audio/pip source types
- [ ] Status updates include storage, upload queue, and source updates
- [ ] Error codes match protocol specification
- [ ] Reconnection works after disconnect
- [ ] Source availability updates when devices are plugged/unplugged

---

## Conclusion

The current implementation provides a **solid foundation** but needs significant enhancements to fully align with the protocol specification. The most critical gaps are:

1. **Source object structure** - Missing detailed source information
2. **Message format** - Structural differences between protocol and implementation
3. **Configuration options** - Missing advanced configuration features

**Recommendation**: Implement a **phased migration** approach, starting with data structure updates (non-breaking) and gradually aligning with the protocol specification.

