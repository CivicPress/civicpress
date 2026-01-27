# Broadcast Box Device Message Protocol

**Last Updated**: 2026-01-16  
**Version**: 1.0.0  
**Purpose**: Complete reference for all messages exchanged between CivicPress
and Broadcast Box devices (commands sent TO devices, events and ACKs sent FROM
devices)

---

## Overview

This document describes all message types exchanged between CivicPress and
Broadcast Box devices via WebSocket:

- **Commands** (CivicPress → Device): Control messages sent from CivicPress to
  devices
- **ACKs** (Device → CivicPress): Acknowledgments sent from devices in response
  to commands
- **Events** (Device → CivicPress): State change notifications sent from devices
- **WebRTC Messages** (Bidirectional): WebRTC negotiation messages exchanged
  between device and CivicPress

All messages are JSON objects sent over the WebSocket connection established
when the device connects to the Realtime Server.

**WebSocket Endpoint**:
`ws://<server>/realtime/devices/<deviceUuid>?token=<deviceToken>`

---

## Message Format

All messages follow this base structure:

```typescript
interface BaseMessage {
  type: string;        // Message type: 'command', 'ack', 'event', etc.
  id: string;         // UUID (e.g., "3d9a1e19-0c46-471d-b27b-b0822618d3d3")
  timestamp: string;  // ISO 8601 (e.g., "2026-01-16T17:46:16.879Z")
  payload?: any;      // Message-specific payload
}
```

---

## Commands (CivicPress → Device)

Commands are sent from CivicPress to control the device. The device must respond
with an `ack` message.

### Command Message Structure

```typescript
interface CommandMessage extends BaseMessage {
  type: 'command';
  action: string;      // Command action (see below)
  payload: CommandPayload;
}
```

---

### 1. `preview.start`

Start a WebRTC preview stream.

**Command**:

```json
{
  "type": "command",
  "id": "df47ab6d-a95c-4b51-88a5-2462f5843672",
  "timestamp": "2026-01-16T17:46:16.879Z",
  "action": "preview.start",
  "payload": {
    "quality": {
      "width": 640,
      "height": 360,
      "framerate": 15,
      "bitrate": 500
    }
  }
}
```

**Payload Fields**:

- `quality` (optional): Object with stream quality parameters
  - `width` (number, default: 640): Video width in pixels
  - `height` (number, default: 360): Video height in pixels
  - `framerate` (number, default: 15): Frames per second
  - `bitrate` (number, default: 500): Bitrate in kbps

**Expected ACK**:

```json
{
  "type": "ack",
  "id": "ack-uuid",
  "commandId": "df47ab6d-a95c-4b51-88a5-2462f5843672",
  "timestamp": "2026-01-16T17:46:16.900Z",
  "success": true,
  "payload": {
    "quality": {
      "width": 640,
      "height": 360,
      "framerate": 15,
      "bitrate": 500
    }
  }
}
```

**Note**: After sending the ACK, the device should send a `preview.offer` WebRTC
message to establish the WebRTC connection.

---

### 2. `preview.stop`

Stop the WebRTC preview stream.

**Command**:

```json
{
  "type": "command",
  "id": "stop-preview-uuid",
  "timestamp": "2026-01-16T17:50:00.000Z",
  "action": "preview.stop",
  "payload": {}
}
```

**Expected ACK**:

```json
{
  "type": "ack",
  "id": "ack-uuid",
  "commandId": "stop-preview-uuid",
  "timestamp": "2026-01-16T17:50:00.100Z",
  "success": true,
  "payload": {
    "stopped": true
  }
}
```

---

### 3. `switch_source`

Switch the active video or audio source.

**Command** (using videoSource/audioSource - current format):

```json
{
  "type": "command",
  "id": "switch-source-uuid",
  "timestamp": "2026-01-16T17:55:00.000Z",
  "action": "switch_source",
  "payload": {
    "videoSource": 0,
    "audioSource": 1
  }
}
```

**Command** (using sourceType/sourceId - protocol format):

```json
{
  "type": "command",
  "id": "switch-source-uuid",
  "timestamp": "2026-01-16T17:55:00.000Z",
  "action": "switch_source",
  "payload": {
    "sourceType": "video",
    "sourceId": 0
  }
}
```

**Payload Fields** (at least one required):

- `videoSource` (string | number, optional): Video source identifier (name or
  numeric ID)
- `audioSource` (string | number, optional): Audio source identifier (name or
  numeric ID)
- `sourceType` (string, optional): 'video' | 'audio' | 'pip' (protocol format)
- `sourceId` (number, optional): Numeric source ID (protocol format)

**Expected ACK**:

```json
{
  "type": "ack",
  "id": "ack-uuid",
  "commandId": "switch-source-uuid",
  "timestamp": "2026-01-16T17:55:00.100Z",
  "success": true,
  "payload": {
    "sources": [
      {
        "source_type": "video",
        "source_id": 0,
        "status": "switched"
      },
      {
        "source_type": "audio",
        "source_id": 1,
        "status": "switched"
      }
    ],
    "status": "switched"
  }
}
```

**Note**: The server processes the `sources` array in the ACK payload to update
device active sources. Each source object should include:

- `source_type`: `"video"` or `"audio"`
- `source_id`: Numeric ID of the source
- `status`: Status string (e.g., `"switched"`, `"active"`)

---

### 4. `set_pip` / `configure_pip`

Configure picture-in-picture (PiP) settings. Both actions are aliases.

**Command**:

```json
{
  "type": "command",
  "id": "cmd-131",
  "timestamp": 1706630400.123,
  "payload": {
    "action": "set_pip",
    "mainSource": 0,
    "pipSource": 1,
    "pipPosition": "top_right",
    "pipSize": 0.25
  }
}
```

**Payload Fields**:

- `mainSource` (string | number, required): Main video source identifier or
  numeric ID
- `pipSource` (string | number | null, optional): PiP video source identifier or
  numeric ID (null to disable PiP)
- `pipPosition` (string, optional, default: "top_right"): Position of PiP window
  - Valid values: `"top_left"`, `"top_right"`, `"bottom_left"`,
    `"bottom_right"`, `"center"`
- `pipSize` (number, optional, default: 0.25): PiP size as a fraction of the
  main frame. Decimal in range (0, 1], e.g. `0.25` = 25%. Replaces the previous
  pixel-based `{ width, height }` format.

**Expected ACK**:

```json
{
  "type": "ack",
  "payload": {
    "commandId": "cmd-131",
    "success": true,
    "result": {
      "main_source": 0,
      "pip_source": 1,
      "pip_position": "top_right",
      "pip_size": 0.25,
      "status": "configured"
    }
  }
}
```

**Note**: The device may return the result in snake_case (`main_source`,
`pip_source`, `pip_position`, `pip_size`). The ACK payload structure may vary;
consume `result.pip_size` (number) for the configured PiP size.

---

### 5. `update_config`

Update device configuration.

**Command**:

```json
{
  "type": "command",
  "id": "update-config-uuid",
  "timestamp": "2026-01-16T18:05:00.000Z",
  "action": "update_config",
  "payload": {
    "config": {
      "defaultVideoSource": "hdmi1",
      "defaultAudioSource": "usb_audio",
      "qualityPreset": "standard"
    }
  }
}
```

**Payload Fields**:

- `config` (object, required): Configuration object with device settings

**Expected ACK**:

```json
{
  "type": "ack",
  "id": "ack-uuid",
  "commandId": "update-config-uuid",
  "timestamp": "2026-01-16T18:05:00.100Z",
  "success": true,
  "payload": {
    "config": {
      "defaultVideoSource": "hdmi1",
      "defaultAudioSource": "usb_audio",
      "qualityPreset": "standard"
    }
  }
}
```

---

### 6. `get_status`

Request current device status.

**Command**:

```json
{
  "type": "command",
  "id": "get-status-uuid",
  "timestamp": "2026-01-16T18:10:00.000Z",
  "action": "get_status",
  "payload": {}
}
```

**Expected ACK**:

```json
{
  "type": "ack",
  "id": "ack-uuid",
  "commandId": "get-status-uuid",
  "timestamp": "2026-01-16T18:10:00.100Z",
  "success": true,
  "payload": {
    "state": {
      "status": "idle"
    },
    "connected": true,
    "lastHeartbeat": "2026-01-16T18:09:50.000Z"
  }
}
```

---

### 7. `list_sources` / `get_sources`

List all available video and audio sources. Both actions are aliases.

**Command**:

```json
{
  "type": "command",
  "id": "list-sources-uuid",
  "timestamp": "2026-01-16T18:15:00.000Z",
  "action": "list_sources",
  "payload": {}
}
```

**Expected ACK**:

```json
{
  "type": "ack",
  "id": "ack-uuid",
  "commandId": "list-sources-uuid",
  "timestamp": "2026-01-16T18:15:00.100Z",
  "success": true,
  "payload": {
    "video": [
      {
        "id": 0,
        "name": "HDMI 1",
        "identifier": "hdmi1",
        "available": true,
        "resolution": "1920x1080",
        "framerate": 30
      },
      {
        "id": 1,
        "name": "HDMI 2",
        "identifier": "hdmi2",
        "available": true,
        "resolution": "1920x1080",
        "framerate": 30
      }
    ],
    "audio": [
      {
        "id": 0,
        "name": "USB Audio",
        "identifier": "usb_audio",
        "available": true
      },
      {
        "id": 1,
        "name": "HDMI Audio",
        "identifier": "hdmi_audio",
        "available": true
      }
    ],
    "videoSources": ["hdmi1", "hdmi2"],
    "audioSources": ["usb_audio", "hdmi_audio"],
    "currentVideoSource": "hdmi1",
    "currentAudioSource": "usb_audio",
    "currentVideoSourceId": 0,
    "currentAudioSourceId": 0
  }
}
```

---

### 8. `start_session`

Start a recording session.

**Command**:

```json
{
  "type": "command",
  "id": "start-session-uuid",
  "timestamp": "2026-01-16T18:20:00.000Z",
  "action": "start_session",
  "payload": {
    "sessionId": "broadcast-session-uuid",
    "civicpressSessionId": "civicpress-session-uuid",
    "config": {
      "videoSource": "hdmi1",
      "audioSource": "usb_audio",
      "quality": "standard"
    }
  }
}
```

**Payload Fields**:

- `sessionId` (string, required): Broadcast Box session ID
- `civicpressSessionId` (string, required): CivicPress session record ID
- `config` (object, optional): Session configuration

**Expected ACK**:

```json
{
  "type": "ack",
  "id": "ack-uuid",
  "commandId": "start-session-uuid",
  "timestamp": "2026-01-16T18:20:00.100Z",
  "success": true,
  "payload": {
    "sessionId": "broadcast-session-uuid",
    "state": "recording"
  }
}
```

---

### 9. `stop_session`

Stop a recording session.

**Command**:

```json
{
  "type": "command",
  "id": "stop-session-uuid",
  "timestamp": "2026-01-16T18:50:00.000Z",
  "action": "stop_session",
  "payload": {
    "sessionId": "broadcast-session-uuid"
  }
}
```

**Payload Fields**:

- `sessionId` (string, required): Broadcast Box session ID to stop

**Expected ACK**:

```json
{
  "type": "ack",
  "id": "ack-uuid",
  "commandId": "stop-session-uuid",
  "timestamp": "2026-01-16T18:50:00.100Z",
  "success": true,
  "payload": {
    "sessionId": "broadcast-session-uuid",
    "state": "stopping"
  }
}
```

---

## WebRTC Preview Messages (Bidirectional)

These messages are used for WebRTC preview stream negotiation. They are
exchanged between the device and CivicPress UI clients via the Realtime Server.

### 9. `preview.offer` (Device → CivicPress)

WebRTC offer SDP sent from the device to CivicPress after receiving
`preview.start` command.

**IMPORTANT**: The offer MUST be sent as a separate `preview.offer` message. Do
NOT include the offer in the ACK response to `preview.start`.

**Message**:

```json
{
  "type": "preview.offer",
  "id": "offer-uuid",
  "timestamp": "2026-01-16T17:46:17.000Z",
  "payload": {
    "type": "offer",
    "sdp": "v=0\r\no=- 7818242139954836446 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n..."
  }
}
```

**Alternative Format** (also supported):

```json
{
  "type": "preview.offer",
  "id": "offer-uuid",
  "timestamp": "2026-01-16T17:46:17.000Z",
  "payload": "v=0\r\no=- 7818242139954836446 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n..."
}
```

**Payload Fields**:

- `type` (string, optional): `"offer"` (if payload is an object)
- `sdp` (string, required if payload is object): WebRTC SDP offer string
- OR `payload` can be the SDP string directly (alternative format)

**SDP Requirements**:

- Must be a valid WebRTC SDP offer
- Must include `ice-ufrag` and `ice-pwd` attributes
- `ice-pwd` must be 22-256 characters long
- Must contain media descriptions (`m=` lines)

**Note**: The server forwards this message to all observing UI clients in the
device room.

---

### 10. `preview.answer` (CivicPress → Device)

WebRTC answer SDP (sent from UI client to device after receiving
`preview.offer`).

**Message**:

```json
{
  "type": "preview.answer",
  "id": "answer-uuid",
  "timestamp": "2026-01-16T17:46:17.000Z",
  "payload": {
    "type": "answer",
    "sdp": "v=0\r\no=- 7818242139954836446 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n..."
  }
}
```

**Payload Fields**:

- `type` (string, required): Always `"answer"`
- `sdp` (string, required): WebRTC SDP answer string

---

### 11. `preview.ice_candidate` (Bidirectional)

WebRTC ICE candidate exchanged between device and CivicPress UI clients during
WebRTC connection establishment. **This message is bidirectional** - both the
device and UI clients send ICE candidates to each other.

**Message Format** (same for both directions):

```json
{
  "type": "preview.ice_candidate",
  "id": "ice-candidate-uuid",
  "timestamp": "2026-01-16T17:46:17.500Z",
  "payload": {
    "candidate": "candidate:2019976577 1 udp 2113937151 9aa90157-2237-4d57-8f12-05a141f81122.local 51201 typ host generation 0",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```

**Direction**:

- **Device → CivicPress**: Device sends ICE candidates to UI clients (forwarded
  by server)
- **CivicPress → Device**: UI clients send ICE candidates to device (forwarded
  by server)

**Payload Fields**:

- `candidate` (string, required): ICE candidate string (e.g.,
  `"candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host"`)
- `sdpMid` (string | null, optional): SDP media stream identification tag
- `sdpMLineIndex` (number | null, optional): SDP media description index

**Note**: The server automatically routes ICE candidates:

- Device → Observing clients: Forwards to all UI clients observing the device
- UI client → Device: Forwards to the device only

---

## Events (Device → CivicPress)

Events are sent from the device to CivicPress to notify about state changes,
connection status, and other device activities.

### Event Message Structure

```typescript
interface EventMessage extends BaseMessage {
  type: 'event';        // REQUIRED: Must be exactly "event"
  event: string;        // REQUIRED: Event type (e.g., "device.connected", "session.started")
  payload: EventPayload; // Event-specific data
}
```

### Critical Requirements

1. **`type: "event"` is REQUIRED**: The server uses this field to identify event
   messages.

2. **`event` field is REQUIRED**: This field specifies the event type. Without
   it, the event will not be processed. The server uses this field to route the
   event to the appropriate handler.

3. **`id` must be a UUID**: Generate a unique UUID for each event message.

4. **`timestamp` must be ISO 8601 format**: Use format
   `"YYYY-MM-DDTHH:mm:ss.sssZ"` (e.g., `"2026-01-16T17:46:16.900Z"`).

### 1. `device.connected`

Sent by the device immediately after establishing the WebSocket connection to
notify CivicPress that the device is online and provide device capabilities.

**Event Message**:

```json
{
  "type": "event",
  "id": "event-uuid",
  "timestamp": "2026-01-16T17:46:16.900Z",
  "event": "device.connected",
  "payload": {
    "deviceId": "75fa2989-39dc-4d1d-bc9f-d3c0503ff6df",
    "version": "1.0.0",
    "protocolVersion": "1.0",
    "capabilities": {
      "videoSources": ["hdmi1", "hdmi2"],
      "audioSources": ["usb_audio"],
      "pipSupported": true,
      "hardwareEncoding": true
    },
    "sources": {
      "video": [
        {
          "id": 0,
          "identifier": "hdmi1",
          "name": "HDMI 1",
          "path": "/dev/video0",
          "resolution": "1920x1080",
          "framerate": 30,
          "available": true
        }
      ],
      "audio": [
        {
          "id": 0,
          "identifier": "usb_audio",
          "name": "USB Audio",
          "channels": 2,
          "sample_rate": 48000,
          "available": true
        }
      ]
    },
    "configuration": {
      "encodingPresets": ["low", "medium", "high"],
      "maxResolution": "1920x1080",
      "maxFramerate": 60
    }
  }
}
```

**Payload Fields**:

- `deviceId` (string, optional): Device UUID (can be omitted, server knows from
  connection)
- `version` (string, optional): Device firmware/software version
- `protocolVersion` (string, optional): Protocol version supported by device
- `capabilities` (object, optional): Device capabilities
  - `videoSources` (string[], optional): Array of video source identifiers
  - `audioSources` (string[], optional): Array of audio source identifiers
  - `pipSupported` (boolean, optional): Whether PiP is supported
  - `hardwareEncoding` (boolean, optional): Whether hardware encoding is
    available
- `sources` (object, optional): Detailed source information
  - `video` (array, optional): Array of video source objects with full details
  - `audio` (array, optional): Array of audio source objects with full details
- `configuration` (object, optional): Device configuration details

**Note**: The `device.connected` event is processed by the server to:

- Update device capabilities in the database
- Activate the device if it's in "enrolled" status
- Log the connection event
- Notify observing clients that the device is online

**Common Mistakes**:

❌ **Missing `event` field**:

```json
{
  "type": "event",
  "id": "event-uuid",
  "timestamp": "2026-01-16T17:46:16.900Z",
  "payload": {
    "deviceId": "...",
    "version": "1.0.0"
  }
}
```

**Problem**: Server won't know which event handler to use.

❌ **Missing `type: "event"`**:

```json
{
  "event": "device.connected",
  "payload": { ... }
}
```

**Problem**: Server won't recognize this as an event message.

✅ **Correct format**:

```json
{
  "type": "event",
  "id": "event-uuid",
  "timestamp": "2026-01-16T17:46:16.900Z",
  "event": "device.connected",
  "payload": {
    "deviceId": "...",
    "version": "1.0.0",
    "capabilities": { ... }
  }
}
```

---

## ACK Response Format

All commands must be acknowledged with an ACK message. **The ACK message format
is strict and must match exactly as specified below.**

### Required Fields

```typescript
interface AckMessage extends BaseMessage {
  type: 'ack';                    // REQUIRED: Must be exactly "ack" (lowercase)
  id: string;                     // REQUIRED: UUID for this ACK message (e.g., "3d9a1e19-0c46-471d-b27b-b0822618d3d3")
  timestamp: string;               // REQUIRED: ISO 8601 timestamp (e.g., "2026-01-16T17:46:16.900Z")
  commandId: string;              // REQUIRED: ID of the command being acknowledged (from command.id)
  success: boolean;                // REQUIRED: true if command succeeded, false if failed
  error?: string;                  // Optional: Error message if success=false
  errorCode?: string;              // Optional: Standardized error code (e.g., "SOURCE_NOT_FOUND")
  payload?: any;                   // Optional: Result data (use this field, NOT "result")
}
```

### Critical Requirements

1. **`type: "ack"` is REQUIRED**: The server uses this field to identify ACK
   messages. Without it, the ACK will not be processed and the command will
   timeout.

2. **`id` must be a UUID**: Generate a unique UUID for each ACK message.

3. **`timestamp` must be ISO 8601 format**: Use format
   `"YYYY-MM-DDTHH:mm:ss.sssZ"` (e.g., `"2026-01-16T17:46:16.900Z"`). Do NOT use
   Unix timestamps or numeric values.

4. **`commandId` must match**: Use the exact `id` value from the command message
   you received.

5. **`success` must be boolean**: Use `true` or `false`, not strings like
   `"true"` or `"success"`.

6. **Use `payload` for result data**: Put result data in the `payload` field,
   NOT in a `result` field.

### Success ACK Example

```json
{
  "type": "ack",
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2026-01-16T17:46:16.900Z",
  "commandId": "df47ab6d-a95c-4b51-88a5-2462f5843672",
  "success": true,
  "payload": {
    "quality": {
      "width": 640,
      "height": 360,
      "framerate": 15,
      "bitrate": 500
    }
  }
}
```

### Error ACK Example

```json
{
  "type": "ack",
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2026-01-16T17:46:16.900Z",
  "commandId": "df47ab6d-a95c-4b51-88a5-2462f5843672",
  "success": false,
  "error": "Source not found",
  "errorCode": "SOURCE_NOT_FOUND"
}
```

### Common Mistakes to Avoid

❌ **Missing `type` field**:

```json
{
  "commandId": "...",
  "success": true
}
```

**Problem**: Server won't recognize this as an ACK message.

❌ **Using `result` instead of `payload`**:

```json
{
  "type": "ack",
  "commandId": "...",
  "success": true,
  "result": { ... }  // WRONG - use "payload" instead
}
```

❌ **Numeric timestamp**:

```json
{
  "type": "ack",
  "timestamp": 229313.987312916  // WRONG - must be ISO 8601 string
}
```

❌ **String success value**:

```json
{
  "type": "ack",
  "success": "true"  // WRONG - must be boolean true/false
}
```

✅ **Correct format**:

```json
{
  "type": "ack",
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2026-01-16T17:46:16.900Z",
  "commandId": "df47ab6d-a95c-4b51-88a5-2462f5843672",
  "success": true,
  "payload": { ... }
}
```

---

## Command Timeouts

- **Default timeout**: 5 seconds
- **Preview commands** (`preview.start`, `preview.stop`): 20 seconds (to allow
  for WebRTC setup)

If the device does not respond with an ACK within the timeout period, the
command is considered failed.

---

## Message Routing

Commands are sent directly to the device's WebSocket connection (not broadcast
to observers). The routing happens through:

1. `DeviceCommandService` creates the command message
2. Command is sent via `DeviceRoom.sendToDevice()` method
3. Message is routed to the device's WebSocket connection only
4. Device processes command and sends ACK response
5. ACK is routed back to `DeviceCommandService` which resolves the pending
   command promise

---

## Notes for Device Implementation

1. **All commands must be acknowledged**: Every command must receive an ACK
   response, even if it fails. The ACK must be sent within the timeout period (5
   seconds default, 20 seconds for preview commands).

2. **ACK format is strict**: The ACK message MUST include:
   - `type: "ack"` (required - server uses this to identify ACK messages)
   - `id`: UUID for the ACK message
   - `timestamp`: ISO 8601 format string (e.g., `"2026-01-16T17:46:16.900Z"`)
   - `commandId`: Must match the `id` from the command message
   - `success`: Boolean `true` or `false`
   - `payload`: Use this field for result data (NOT `result`)

3. **Command IDs**: Use the exact `id` value from the command message
   (`command.id`) as the `commandId` in your ACK response.

4. **Error handling**: If a command fails, set `success: false` and include an
   `error` message (and optionally `errorCode`). The ACK must still be sent even
   on failure.

5. **WebRTC preview**: For `preview.start`, after sending the ACK, the device
   should:
   - Create a WebRTC offer
   - Send `preview.offer` message to the UI client
   - Process `preview.answer` and `preview.ice_candidate` messages from the UI
     client
   - Establish the WebRTC connection

6. **Source identifiers**: Sources can be identified by:
   - Numeric ID (e.g., `0`, `1`)
   - String name (e.g., `"hdmi1"`, `"usb_audio"`)
   - String identifier (e.g., `"hdmi_1"`, `"usb_audio_1"`)

7. **PiP support**: The `set_pip` command requires device capability
   `pipSupported: true`.

---

## Related Documentation

- **WebRTC Preview**: See `docs/broadcast-box/PREVIEW-MESSAGE-FORMAT.md`
- **Status Messages**: See
  `docs/broadcast-box/STATUS-MESSAGE-PROTOCOL-INTEGRATION.md`
- **TURN Server**: See `docs/broadcast-box/TURN-SERVER-CONFIGURATION.md`
- **Full API Reference**: See
  `docs/broadcast-box/civicpress-module-api-reference.md`
