# Device Capabilities Message Formats

This document describes the message formats used to report device capabilities
to CivicPress, specifically for Picture-in-Picture (PiP) support and other
device features.

## Message Types

### 1. `device.connected` Event

**When:** Sent once when the device first connects to CivicPress via WebSocket

**Where:** `src/broadcast_box/services/connector/websocket_client.py` -
`_handle_send_device_connected()` method

**Message Format:**

```json
{
  "type": "event",
  "id": "uuid-here",
  "timestamp": "2026-01-17T20:00:00.000000+00:00",
  "event": "device.connected",
  "payload": {
    "capabilities": {
      "pip": {
        "supported": true,
        "max_sources": 2,
        "supported_positions": [
          "top_left",
          "top_right",
          "bottom_left",
          "bottom_right",
          "center"
        ],
        "min_size": {
          "width": 160,
          "height": 120
        },
        "max_size": {
          "width": 1920,
          "height": 1080
        }
      },
      "audio_mixing": {
        "supported": true,
        "max_inputs": 4
      },
      "hardware_encoding": {
        "supported": true
      }
    }
  }
}
```

**Field Descriptions:**

- `capabilities.pip.supported`: `boolean` - Whether the device supports
  Picture-in-Picture functionality
- `capabilities.pip.max_sources`: `integer` - Maximum number of video sources
  the device can handle for PiP
- `capabilities.pip.supported_positions`: `array<string>` - List of supported
  PiP positions
- `capabilities.pip.min_size`: `number` or `object` - Minimum PiP size
  supported. Preferred: decimal fraction of frame (e.g. `0.1`). Legacy:
  `{ width, height }` in pixels.
- `capabilities.pip.max_size`: `number` or `object` - Maximum PiP size
  supported. Preferred: decimal fraction (e.g. `1.0`). Legacy:
  `{ width, height }` in pixels.
- `capabilities.audio_mixing.supported`: `boolean` - Whether the device supports
  audio mixing
- `capabilities.audio_mixing.max_inputs`: `integer` - Maximum number of audio
  inputs supported
- `hardware_encoding.supported`: `boolean` - Whether the device supports
  hardware encoding

**Notes:**

- This message is sent automatically after WebSocket connection is established
- Capabilities are detected during device initialization
- The message follows the standard event message protocol format

---

### 2. `status` Message - PiP Section

**When:** Sent periodically (default: every 30 seconds) and after state changes

**Where:** `src/broadcast_box/services/connector/status_reporter.py` -
`_collect_status()` method

**Message Format:**

```json
{
  "type": "status",
  "id": "uuid-here",
  "timestamp": "2026-01-17T20:00:00.000000+00:00",
  "payload": {
    "timestamp": 1768678275.5542421,
    "device_id": "device-001",
    "session": {
      "state": "idle",
      "session_id": null,
      "metadata": {}
    },
    "resources": {
      "cpu_percent": 6.3,
      "memory_percent": 52.9,
      "disk_percent": 2.48,
      "healthy": true
    },
    "storage": {
      "total_size_mb": 0,
      "session_count": 0
    },
    "upload": {
      "queue_size": 0,
      "active_uploads": 0,
      "total_completed": 0,
      "total_failed": 0
    },
    "connection": {
      "connected": true,
      "state": "connected",
      "endpoint": "ws://localhost:3001/realtime/device/..."
    },
    "sources": {
      "video": [...],
      "audio": [...],
      "active": {
        "video": {
          "id": 0,
          "identifier": "hd_webcam_c615"
        },
        "audio": {
          "id": 3,
          "identifier": "audio_3"
        }
      },
      "pip": {
        "supported": true,
        "enabled": false,
        "pip_source": null,
        "main_source": null,
        "position": "top_right",
        "size": 0.25
      }
    }
  }
}
```

**PiP Field Descriptions:**

- `sources.pip.supported`: `boolean` - **NEW FIELD** - Whether the device
  supports PiP functionality (capability indicator)
- `sources.pip.enabled`: `boolean` - Whether PiP is currently active/enabled
  (state indicator)
- `sources.pip.pip_source`: `string|null` - Current PiP source identifier (null
  if not set)
- `sources.pip.main_source`: `string|null` - Current main source identifier
  (null if not set)
- `sources.pip.position`: `string` - Current PiP position (e.g., "top_right")
- `sources.pip.size`: `number` or `object` - Current PiP size. Preferred:
  decimal fraction of frame (e.g. `0.25` = 25%). Legacy: `{ width, height }` in
  pixels.

**Key Distinction:**

- `supported`: Indicates if the device **can** support PiP (capability)
- `enabled`: Indicates if PiP is **currently active** (state)

**Example Scenarios:**

1. **Device supports PiP, but it's not configured:**

   ```json
   "pip": {
     "supported": true,
     "enabled": false,
     "pip_source": null,
     "main_source": null,
     "position": "top_right",
     "size": 0.25
   }
   ```

2. **Device supports PiP, and it's active:**

   ```json
   "pip": {
     "supported": true,
     "enabled": true,
     "pip_source": "hd_webcam_c615",
     "main_source": "razer_kiyo_pro",
     "position": "top_right",
     "size": 0.25
   }
   ```

3. **Device does NOT support PiP:**

   ```json
   "pip": {
     "supported": false,
     "enabled": false,
     "pip_source": null,
     "main_source": null,
     "position": "top_right",
     "size": 0.25
   }
   ```

---

## Implementation Details

### Capability Detection

**Location:** `src/broadcast_box/main.py` - `_detect_capabilities()` method

**Detection Logic:**

- PiP support is determined by:
  1. Presence of `CompositorService`
  2. Availability of OpenCV (required for compositing)
  3. Number of video devices available (at least 1 needed, ideally 2+)

### Message Sending

1. **`device.connected` event:**
   - Sent automatically after WebSocket connection
   - Contains full capabilities information
   - Sent once per connection

2. **`status` message:**
   - Sent periodically (configurable, default 30 seconds)
   - Sent after state changes (source switches, PiP configuration, etc.)
   - Contains current state + `supported` flag for quick capability check

---

## Migration Notes for CivicPress

### New Fields

1. **`device.connected` event payload:**
   - New `capabilities` object with device capability information
   - Previously: payload was empty
   - Now: payload contains capabilities

2. **`status.sources.pip` object:**
   - New `supported` field (boolean)
   - Previously: only state fields (`enabled`, `pip_source`, `main_source`)
   - Now: includes both capability (`supported`) and state fields

### Recommended Server-Side Handling

1. **Store capabilities** from `device.connected` event in device metadata
2. **Use `supported` field** in status messages for UI logic:
   - If `supported: false` → Hide/disable PiP configuration UI
   - If `supported: true` and `enabled: false` → Show PiP configuration UI, but
     indicate it's not active
   - If `supported: true` and `enabled: true` → Show active PiP configuration

3. **Backward compatibility:**
   - If `supported` field is missing (old devices), assume `supported: true` for
     compatibility
   - If `capabilities` object is missing in `device.connected`, device may not
     report capabilities

---

## Example Full Message Flow

### On Device Connection

```json
{
  "type": "event",
  "id": "abc-123-def",
  "timestamp": "2026-01-17T20:00:00.000000+00:00",
  "event": "device.connected",
  "payload": {
    "capabilities": {
      "pip": {
        "supported": true,
        "max_sources": 2,
        "supported_positions": ["top_left", "top_right", "bottom_left", "bottom_right", "center"],
        "min_size": 0.1,
        "max_size": 1.0
      }
    }
  }
}
```

### Status Message (Periodic)

```json
{
  "type": "status",
  "id": "xyz-789-abc",
  "timestamp": "2026-01-17T20:00:30.000000+00:00",
  "payload": {
    "sources": {
      "pip": {
        "supported": true,
        "enabled": false,
        "pip_source": null,
        "main_source": null,
        "position": "top_right",
        "size": 0.25
      }
    }
  }
}
```

---

## Files Modified

1. `src/broadcast_box/main.py`
   - Added `_detect_capabilities()` method
   - Stores `device_capabilities` in app instance
   - Passes capabilities to WebSocketClient and StatusReporter

2. `src/broadcast_box/services/connector/websocket_client.py`
   - Added `device_capabilities` parameter to `__init__`
   - Includes capabilities in `device.connected` event payload

3. `src/broadcast_box/services/connector/status_reporter.py`
   - Added `device_capabilities` parameter to `__init__`
   - Adds `supported` field to `sources.pip` in status messages
