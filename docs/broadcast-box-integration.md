# Broadcast Box Integration Reference

> This document describes the Broadcast Box device protocol from the CivicPress
> server's perspective. It covers every integration surface: REST enrollment,
> WebSocket messaging, command dispatch, status ingestion, and WebRTC preview
> relay. It is self-contained — no external references are needed.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Enrollment Protocol](#2-enrollment-protocol)
3. [WebSocket Connection](#3-websocket-connection)
4. [Message Envelope Formats](#4-message-envelope-formats)
5. [Commands Reference (CivicPress → Device)](#5-commands-reference-civicpress--device)
6. [Device Messages (Device → CivicPress)](#6-device-messages-device--civicpress)
7. [Device Capabilities](#7-device-capabilities)
8. [WebRTC Preview Signaling](#8-webrtc-preview-signaling)
9. [Authentication & Lifecycle](#9-authentication--lifecycle)
10. [Status Report Schema](#10-status-report-schema)
11. [Error Codes](#11-error-codes)
12. [Implementation Checklist for CivicPress](#12-implementation-checklist-for-civicpress)

---

## 1. Overview

### What the Broadcast Box Is

The Broadcast Box is a municipal capture appliance — a dedicated device that
captures video/audio from connected cameras and microphones for public meetings.
It runs as a single Python process with an event-driven architecture built on an
async event bus and an FFmpeg media pipeline for encoding, recording, and
streaming.

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Broadcast Box                      │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Capture   │  │ Encoder  │  │ Recording        │  │
│  │ Service   │──│ Service  │──│ Service           │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│       │              │                               │
│       │         ┌──────────┐  ┌──────────────────┐  │
│       │         │ Preview  │  │ Streaming (RTMP)  │  │
│       └─────────│ (WebRTC) │  │ Service           │  │
│                 └──────────┘  └──────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │              Event Bus (async)                │   │
│  └──────────────────────────────────────────────┘   │
│       │                        │                     │
│  ┌──────────┐           ┌──────────────────┐        │
│  │ WebSocket │           │ REST API         │        │
│  │ Client    │           │ (AP Mode)        │        │
│  └──────────┘           └──────────────────┘        │
└───────┬──────────────────────────┘                   │
        │                                              │
        ▼                                              │
   CivicPress Server                                   │
```

### Two Integration Surfaces

| Surface                 | Purpose                                       | Direction           |
| ----------------------- | --------------------------------------------- | ------------------- |
| **REST Enrollment API** | Device registration, credential exchange      | Device → CivicPress |
| **WebSocket**           | Real-time commands, status, preview signaling | Bidirectional       |

---

## 2. Enrollment Protocol

### Endpoint CivicPress Must Provide

```
POST /api/v1/broadcast-box/devices
```

### Request Body

```json
{
  "deviceUuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "enrollmentCode": "ABC123",
  "name": "broadcast-box-a1b2c3d4"
}
```

| Field            | Type          | Required | Notes                                      |
| ---------------- | ------------- | -------- | ------------------------------------------ |
| `deviceUuid`     | string (UUID) | Yes      | Stable device identifier                   |
| `enrollmentCode` | string        | Yes      | Code from QR scan or manual entry          |
| `name`           | string        | No       | Defaults to `broadcast-box-{uuid-first-8}` |

The device sends this request with a 10-second timeout.

### Success Response (HTTP 200 or 201)

```json
{
  "success": true,
  "device": {
    "id": "device-db-id",
    "name": "City Hall Chamber 1",
    "status": "enrolled"
  },
  "credentials": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresAt": "2025-07-01T00:00:00Z"
  }
}
```

The device stores the `token` encrypted (Fernet symmetric encryption) and uses
it for all subsequent WebSocket connections.

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "INVALID_ENROLLMENT_CODE",
    "message": "The enrollment code has expired or is invalid"
  }
}
```

### Error Codes for Enrollment

| Code                      | Meaning                              |
| ------------------------- | ------------------------------------ |
| `INVALID_ENROLLMENT_CODE` | Code expired, wrong, or already used |
| `DEVICE_ALREADY_ENROLLED` | This UUID is already registered      |
| `ENROLLMENT_DISABLED`     | Server is not accepting new devices  |
| `INVALID_REQUEST`         | Missing or malformed fields          |

### QR Code Payload Format

The QR code displayed in the CivicPress admin UI encodes:

```json
{
  "type": "civicpress-enrollment",
  "url": "https://cityserver.example.com/api/v1/broadcast-box/devices",
  "code": "ABC123",
  "v": 1
}
```

| Field  | Type    | Notes                            |
| ------ | ------- | -------------------------------- |
| `type` | string  | Always `"civicpress-enrollment"` |
| `url`  | string  | Full enrollment endpoint URL     |
| `code` | string  | The enrollment code to send      |
| `v`    | integer | Protocol version, currently `1`  |

### Auto Re-enrollment

When the device receives an `AUTH_FAILED` error from the server (via a WebSocket
error message with `error.code == "AUTH_FAILED"`), it automatically:

1. Calls the same `POST /api/v1/broadcast-box/devices` endpoint with its stored
   `deviceUuid`, `enrollmentCode`, and device name
2. On success: stores new credentials, reconnects the WebSocket
3. On failure: disconnects and publishes an auth failure event internally

This means CivicPress should accept re-enrollment calls from already-enrolled
devices and issue fresh tokens.

---

## 3. WebSocket Connection

### Endpoint Format

```
wss://{host}/realtime/device/{deviceUuid}?token={jwt}
```

Examples:

- Cloud:
  `wss://cityserver.example.com/realtime/device/a1b2c3d4-e5f6-7890-abcd-ef1234567890?token=eyJ...`
- Local:
  `ws://localhost:3001/realtime/device/a1b2c3d4-e5f6-7890-abcd-ef1234567890?token=eyJ...`

For local connections, if the CivicPress HTTP server is on port 3000, the
WebSocket port is 3001 (HTTP port + 1). Otherwise it uses the same port.

### Authentication Headers

In addition to the `?token=` query parameter, the device sends these headers:

```
Authorization: Bearer {token}
X-Device-Token: {token}
```

CivicPress should validate the token from any of these three sources (query
param, Authorization header, or X-Device-Token header).

### Connection Properties

| Parameter                | Value                                          |
| ------------------------ | ---------------------------------------------- |
| Ping interval            | 20 seconds                                     |
| Ping timeout             | 10 seconds                                     |
| Close timeout            | 10 seconds                                     |
| Status keepalive         | 30 seconds (via status reports)                |
| Staleness threshold      | 90 seconds with no messages                    |
| Status failure threshold | 3 consecutive failures before considered stale |
| Health monitor interval  | 15 seconds                                     |

### Reconnection Strategy

Exponential backoff starting at 5 seconds, doubling each attempt, capped at 300
seconds (5 minutes):

```
Attempt 1:   5s
Attempt 2:  10s
Attempt 3:  20s
Attempt 4:  40s
Attempt 5:  80s
Attempt 6: 160s
Attempt 7: 300s  (capped)
Attempt 8: 300s  (capped)
...
```

Formula: `delay = min(5 * 2^(attempt-1), 300)`

The device prioritizes endpoints in this order:

1. Last successfully connected endpoint
2. Cloud endpoint
3. Local endpoint

### On Connect

Immediately after establishing the WebSocket connection, the device sends a
`device.connected` event (see
[Section 6](#6-device-messages-device--civicpress)).

### Connection States

| State          | Meaning                                      |
| -------------- | -------------------------------------------- |
| `disconnected` | Not connected                                |
| `connecting`   | Attempting initial connection                |
| `connected`    | Active connection                            |
| `reconnecting` | Lost connection, attempting to restore       |
| `failed`       | Connection attempts exhausted or fatal error |

---

## 4. Message Envelope Formats

### Outbound Messages (Device → CivicPress)

All device messages use this envelope:

```json
{
  "type": "status|event|preview.offer|preview.ice_candidate|preview.stopped",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-06-15T14:30:00.000Z",
  "payload": { }
}
```

| Field       | Type                  | Notes                        |
| ----------- | --------------------- | ---------------------------- |
| `type`      | string                | Message type identifier      |
| `id`        | string (UUID v4)      | Unique message ID            |
| `timestamp` | string (ISO 8601 UTC) | When the message was created |
| `payload`   | object                | Type-specific data           |

For event messages, an additional `event` field names the specific event:

```json
{
  "type": "event",
  "id": "...",
  "timestamp": "...",
  "event": "device.connected",
  "payload": { }
}
```

### Inbound Commands (CivicPress → Device)

The device accepts three message formats and normalizes them internally.
CivicPress can use any of these, but **Format 3 (Server format)** is the
simplest to implement.

#### Format 1: Standard protocol

```json
{
  "type": "command",
  "id": "cmd-uuid",
  "timestamp": "2025-06-15T14:30:00.000Z",
  "action": "start_session",
  "payload": { }
}
```

#### Format 2: Legacy/control

```json
{
  "type": "control",
  "event": "start_session",
  "payload": { }
}
```

Normalization: `event` is mapped to `action`.

#### Format 3: Server format (recommended)

```json
{
  "action": "start_session",
  "commandId": "cmd-uuid",
  "deviceId": "device-uuid",
  "payload": { }
}
```

Normalization: `commandId` is mapped to `id`. No `type` field needed.

All three formats are normalized to `(action, payload, id)` and dispatched to
the matching command handler.

### ACK Format (Device → CivicPress)

ACKs are sent as direct responses to every command (except protocol-level
messages like `connection.ack` and `error`).

**Success ACK:**

```json
{
  "type": "ack",
  "id": "ack-uuid",
  "timestamp": "2025-06-15T14:30:01.000Z",
  "commandId": "original-cmd-uuid",
  "success": true,
  "payload": { }
}
```

**Error ACK:**

```json
{
  "type": "ack",
  "id": "ack-uuid",
  "timestamp": "2025-06-15T14:30:01.000Z",
  "commandId": "original-cmd-uuid",
  "success": false,
  "error": "Video source not found: device_3",
  "errorCode": "ERR_SOURCE_NOT_FOUND"
}
```

| Field       | Type    | Notes                                                      |
| ----------- | ------- | ---------------------------------------------------------- |
| `commandId` | string  | ID of the command being acknowledged                       |
| `success`   | boolean | Whether the command succeeded                              |
| `payload`   | object  | Present on success; command-specific response data         |
| `error`     | string  | Present on failure; human-readable error message           |
| `errorCode` | string  | Present on failure; machine-readable error code (optional) |

---

## 5. Commands Reference (CivicPress → Device)

### Protocol-Level Messages (No ACK Sent)

| Action           | Direction           | Purpose                                                              |
| ---------------- | ------------------- | -------------------------------------------------------------------- |
| `connection.ack` | CivicPress → Device | Server acknowledges the connection                                   |
| `error`          | CivicPress → Device | Server reports an error (e.g., `AUTH_FAILED` triggers re-enrollment) |

---

### Session Commands

#### `start_session`

Start a capture session on the device.

**Payload:**

```json
{
  "session_id": "session-uuid",
  "metadata": {},
  "config": {
    "quality": "standard"
  }
}
```

| Field            | Type          | Required | Notes                                                                |
| ---------------- | ------------- | -------- | -------------------------------------------------------------------- |
| `session_id`     | string (UUID) | Yes      | Server-assigned session ID                                           |
| `metadata`       | object        | No       | Arbitrary session metadata                                           |
| `config.quality` | string        | No       | `"low"`, `"standard"`, `"high"`, or `"ultra"`. Default: `"standard"` |

**ACK Payload:**

```json
{
  "session_id": "session-uuid",
  "status": "started",
  "config_applied": {
    "video_source": "FaceTime HD Camera",
    "audio_source": "MacBook Pro Microphone",
    "quality": "standard",
    "pip": {
      "main": "FaceTime HD Camera",
      "pip": "USB Camera",
      "position": "top_right"
    }
  }
}
```

#### `stop_session`

Stop the active capture session.

**Payload:** Empty or omitted.

**ACK Payload:**

```json
{
  "session_id": "session-uuid",
  "status": "stopped"
}
```

---

### Source Commands

#### `get_sources` / `list_sources`

Both names are accepted as aliases. Returns available video and audio devices.

**Payload:** Empty or omitted.

**ACK Payload:**

```json
{
  "video": [
    { "id": 0, "identifier": "FaceTime HD Camera", "name": "FaceTime HD Camera" },
    { "id": "pip", "identifier": "pip", "name": "Picture-in-Picture", "type": "virtual" }
  ],
  "audio": [
    { "id": 0, "identifier": "MacBook Pro Microphone", "name": "MacBook Pro Microphone" }
  ]
}
```

The virtual `pip` source is included when 2 or more video devices are available.

#### `sources.set`

Set active video and/or audio source.

**Payload:**

```json
{
  "video": "FaceTime HD Camera",
  "audio": "MacBook Pro Microphone"
}
```

| Field   | Type   | Required                    | Notes                        |
| ------- | ------ | --------------------------- | ---------------------------- |
| `video` | string | At least one of video/audio | Source identifier or `"pip"` |
| `audio` | string | At least one of video/audio | Source identifier            |

**ACK Payload:**

```json
{
  "video": "FaceTime HD Camera",
  "audio": "MacBook Pro Microphone",
  "status": "configured",
  "live_switched": true
}
```

`live_switched` is `true` if the source was switched while an active capture was
running.

---

### Preview Commands

#### `preview.start`

Start a WebRTC preview stream from the device.

**Payload:**

```json
{
  "quality": {
    "width": 640,
    "height": 360,
    "framerate": 30
  }
}
```

All quality fields are optional.

**ACK Payload:**

```json
{
  "status": "started",
  "quality": {
    "width": 640,
    "height": 360,
    "framerate": 30
  }
}
```

**Side effect:** After the ACK, the device sends a `preview.offer` message with
the WebRTC SDP offer (see [Section 8](#8-webrtc-preview-signaling)).

#### `preview.stop`

Stop the active WebRTC preview.

**Payload:** Empty.

**ACK Payload:**

```json
{
  "status": "stopping"
}
```

---

### PiP Commands

#### `pip.configure` / `set_pip`

Both names are accepted. Configure Picture-in-Picture layout. Accepts both
camelCase and snake_case field names.

**Payload:**

```json
{
  "mainSource": "FaceTime HD Camera",
  "pipSource": "USB Camera",
  "pipPosition": "top_right",
  "pipSize": 0.25
}
```

| Field                          | Type           | Required | Notes                                                                      |
| ------------------------------ | -------------- | -------- | -------------------------------------------------------------------------- |
| `mainSource` / `main_source`   | string         | Yes      | Primary video source identifier                                            |
| `pipSource` / `pip_source`     | string or null | No       | PiP overlay source; `null` to disable PiP                                  |
| `pipPosition` / `pip_position` | string         | No       | `"top_left"`, `"top_right"`, `"bottom_left"`, `"bottom_right"`, `"center"` |
| `pipSize` / `pip_size`         | float          | No       | 0.1 to 0.9. Default: 0.25                                                  |

**ACK Payload:**

```json
{
  "main_source": "FaceTime HD Camera",
  "pip_source": "USB Camera",
  "pip_position": "top_right",
  "pip_size": 0.25,
  "status": "configured"
}
```

---

### Recording Commands

#### `record.start`

Start recording to local storage.

**Payload:**

```json
{
  "config": {
    "quality": "high"
  }
}
```

| Field            | Type   | Required | Notes                                      |
| ---------------- | ------ | -------- | ------------------------------------------ |
| `config.quality` | string | No       | `"low"`, `"standard"`, `"high"`, `"ultra"` |

**ACK Payload:**

```json
{
  "recording_id": "recording-uuid",
  "status": "recording"
}
```

#### `record.stop`

Stop the active recording.

**Payload:** Empty.

**ACK Payload:**

```json
{
  "recording_id": "recording-uuid",
  "file_path": "/storage/recordings/2025-06-15_session.mp4",
  "hash": "sha256:abcdef1234567890..."
}
```

#### `record.list`

List all recordings on the device.

**Payload:** Empty.

**ACK Payload:**

```json
{
  "recordings": [
    {
      "recording_id": "recording-uuid",
      "file_path": "/storage/recordings/...",
      "created_at": "2025-06-15T14:30:00Z",
      "duration_seconds": 3600,
      "size_bytes": 1073741824
    }
  ],
  "count": 1
}
```

#### `record.get`

Get details for a specific recording.

**Payload:**

```json
{
  "recording_id": "recording-uuid"
}
```

**ACK Payload:**

```json
{
  "recording": {
    "recording_id": "recording-uuid",
    "file_path": "/storage/recordings/...",
    "created_at": "2025-06-15T14:30:00Z",
    "duration_seconds": 3600,
    "size_bytes": 1073741824,
    "hash": "sha256:abcdef..."
  }
}
```

---

### Streaming Commands

#### `stream.configure`

Configure RTMP streaming destination.

**Payload:**

```json
{
  "url": "rtmp://a.rtmp.youtube.com/live2",
  "stream_key": "xxxx-xxxx-xxxx-xxxx",
  "platform": "youtube"
}
```

| Field        | Type   | Required | Notes                                              |
| ------------ | ------ | -------- | -------------------------------------------------- |
| `url`        | string | Yes      | RTMP server URL                                    |
| `stream_key` | string | No       | Appended to URL if provided                        |
| `platform`   | string | No       | `"youtube"`, `"facebook"`, `"twitch"`, `"generic"` |

**ACK Payload:**

```json
{
  "status": "configured",
  "platform": "youtube",
  "url": "rtmp://a.rtmp.youtube.com/live2",
  "stream_key_set": true
}
```

#### `stream.start`

Start streaming to the configured RTMP destination.

**Payload:**

```json
{
  "quality": "standard"
}
```

| Field     | Type   | Required | Notes                                      |
| --------- | ------ | -------- | ------------------------------------------ |
| `quality` | string | No       | `"low"`, `"standard"`, `"high"`, `"ultra"` |

**ACK Payload:**

```json
{
  "status": "streaming",
  "platform": "youtube",
  "url": "rtmp://a.rtmp.youtube.com/live2",
  "quality": "standard"
}
```

#### `stream.stop`

Stop the active RTMP stream.

**Payload:** Empty.

**ACK Payload:**

```json
{
  "status": "stopped",
  "platform": "youtube"
}
```

#### `stream.status`

Get current streaming status.

**Payload:** Empty.

**ACK Payload:**

```json
{
  "available": true,
  "configured": true,
  "streaming": true,
  "platform": "youtube",
  "url": "rtmp://a.rtmp.youtube.com/live2"
}
```

---

### Quality Commands

#### `quality.set`

Set quality presets for streaming and recording.

**Payload:**

```json
{
  "quality": "standard"
}
```

| Field     | Type   | Required | Notes                                      |
| --------- | ------ | -------- | ------------------------------------------ |
| `quality` | string | Yes      | `"low"`, `"standard"`, `"high"`, `"ultra"` |

**ACK Payload:**

```json
{
  "quality": "standard",
  "streaming_quality": "standard",
  "recording_quality": "high"
}
```

---

### Watermark Commands

#### `watermark.upload`

Upload a watermark image (PNG, base64-encoded).

**Payload:**

```json
{
  "data": "iVBORw0KGgoAAAANSUhEUgAA..."
}
```

**ACK Payload:**

```json
{
  "file_path": "/storage/watermarks/watermark.png",
  "enabled": true
}
```

#### `watermark.set`

Configure watermark display settings.

**Payload:**

```json
{
  "enabled": true,
  "position": "top_right",
  "scale": 0.10,
  "opacity": 0.8
}
```

| Field      | Type    | Required | Notes                                                          |
| ---------- | ------- | -------- | -------------------------------------------------------------- |
| `enabled`  | boolean | No       | Enable/disable watermark                                       |
| `position` | string  | No       | `"top_left"`, `"top_right"`, `"bottom_left"`, `"bottom_right"` |
| `scale`    | float   | No       | 0.05 to 0.30                                                   |
| `opacity`  | float   | No       | 0.0 to 1.0                                                     |

**ACK Payload:** Current watermark configuration object.

#### `watermark.remove`

Remove the watermark entirely.

**Payload:** Empty.

**ACK Payload:**

```json
{
  "removed": true
}
```

#### `watermark.status`

Get current watermark state.

**Payload:** Empty.

**ACK Payload:**

```json
{
  "configured": true,
  "valid": true,
  "enabled": true,
  "position": "top_right",
  "scale": 0.10,
  "opacity": 0.8,
  "file_path": "/storage/watermarks/watermark.png"
}
```

---

### Configuration Commands

#### `update_config`

Update device configuration remotely.

**Payload:**

```json
{
  "config": {
    "video_resolution": "1920x1080",
    "video_framerate": "30",
    "video_bitrate": "2000",
    "audio_bitrate": "128",
    "quality_preset": "standard",
    "storage_quota_mb": "10240",
    "upload_priority": "normal",
    "network_timeout": "30"
  }
}
```

All fields in `config` are optional; only provided keys are updated.

**ACK Payload:**

```json
{
  "updated_keys": ["video_resolution", "quality_preset"]
}
```

---

### Command Summary Table

| #   | Command            | Category  | Has Payload | Notes                   |
| --- | ------------------ | --------- | ----------- | ----------------------- |
| 1   | `start_session`    | Session   | Yes         | Requires `session_id`   |
| 2   | `stop_session`     | Session   | No          |                         |
| 3   | `get_sources`      | Sources   | No          | Alias: `list_sources`   |
| 4   | `sources.set`      | Sources   | Yes         |                         |
| 5   | `preview.start`    | Preview   | Optional    | Triggers WebRTC offer   |
| 6   | `preview.stop`     | Preview   | No          |                         |
| 7   | `pip.configure`    | PiP       | Yes         | Alias: `set_pip`        |
| 8   | `record.start`     | Recording | Optional    |                         |
| 9   | `record.stop`      | Recording | No          |                         |
| 10  | `record.list`      | Recording | No          |                         |
| 11  | `record.get`       | Recording | Yes         | Requires `recording_id` |
| 12  | `stream.configure` | Streaming | Yes         |                         |
| 13  | `stream.start`     | Streaming | Optional    |                         |
| 14  | `stream.stop`      | Streaming | No          |                         |
| 15  | `stream.status`    | Streaming | No          |                         |
| 16  | `quality.set`      | Quality   | Yes         |                         |
| 17  | `watermark.upload` | Watermark | Yes         | Base64 PNG              |
| 18  | `watermark.set`    | Watermark | Yes         |                         |
| 19  | `watermark.remove` | Watermark | No          |                         |
| 20  | `watermark.status` | Watermark | No          |                         |
| 21  | `update_config`    | Config    | Yes         |                         |

---

## 6. Device Messages (Device → CivicPress)

### `device.connected` Event

Sent immediately after the WebSocket connection is established.

```json
{
  "type": "event",
  "id": "msg-uuid",
  "timestamp": "2025-06-15T14:30:00.000Z",
  "event": "device.connected",
  "payload": {
    "capabilities": { },
    "sources": {
      "video": [
        { "id": 0, "identifier": "FaceTime HD Camera", "name": "FaceTime HD Camera" }
      ],
      "audio": [
        { "id": 0, "identifier": "MacBook Pro Microphone", "name": "MacBook Pro Microphone" }
      ]
    }
  }
}
```

See [Section 7](#7-device-capabilities) for the full capabilities structure.

### `status` Reports

Sent every 30 seconds. See [Section 10](#10-status-report-schema) for the full
schema.

```json
{
  "type": "status",
  "id": "msg-uuid",
  "timestamp": "2025-06-15T14:30:30.000Z",
  "payload": { }
}
```

### `ack` Responses

Sent after every command. See [Section 4](#ack-format-device--civicpress) for
the format.

### `preview.offer`

WebRTC SDP offer for browser preview. Sent after a `preview.start` command
succeeds.

```json
{
  "type": "preview.offer",
  "id": "msg-uuid",
  "timestamp": "2025-06-15T14:30:01.000Z",
  "payload": {
    "type": "offer",
    "sdp": "v=0\r\no=- 1234567890 2 IN IP4 127.0.0.1\r\n...",
    "offer_id": "offer-uuid"
  }
}
```

### `preview.ice_candidate`

WebRTC ICE candidate trickle during preview negotiation.

```json
{
  "type": "preview.ice_candidate",
  "id": "msg-uuid",
  "timestamp": "2025-06-15T14:30:01.500Z",
  "payload": {
    "candidate": "candidate:1 1 UDP 2013266431 192.168.1.100 12345 typ host",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```

### `preview.stopped`

Sent when the device stops its preview (either from a command or internally).

```json
{
  "type": "preview.stopped",
  "id": "msg-uuid",
  "timestamp": "2025-06-15T14:35:00.000Z",
  "payload": {}
}
```

### Message Type Summary

| Message Type                 | Trigger                          | Frequency                |
| ---------------------------- | -------------------------------- | ------------------------ |
| `event` (`device.connected`) | WebSocket connection established | Once per connection      |
| `status`                     | Timer                            | Every 30 seconds         |
| `ack`                        | Command received                 | Once per command         |
| `preview.offer`              | Preview started                  | Once per preview session |
| `preview.ice_candidate`      | WebRTC negotiation               | Multiple during setup    |
| `preview.stopped`            | Preview stopped                  | Once per preview session |

---

## 7. Device Capabilities

Reported in the `device.connected` event payload and included in status reports.
This is the exact structure:

```json
{
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
    "min_size": { "width": 160, "height": 120 },
    "max_size": { "width": 1920, "height": 1080 }
  },
  "audio_mixing": {
    "supported": true,
    "max_inputs": 4
  },
  "hardware_encoding": {
    "supported": true
  },
  "quality": {
    "presets": [
      {
        "name": "low",
        "video_bitrate_kbps": 1000,
        "audio_bitrate_kbps": 96,
        "resolution": [1280, 720],
        "framerate": 30
      },
      {
        "name": "standard",
        "video_bitrate_kbps": 2000,
        "audio_bitrate_kbps": 128,
        "resolution": [1920, 1080],
        "framerate": 30
      },
      {
        "name": "high",
        "video_bitrate_kbps": 10000,
        "audio_bitrate_kbps": 192,
        "resolution": [1920, 1080],
        "framerate": 30
      },
      {
        "name": "ultra",
        "video_bitrate_kbps": 15000,
        "audio_bitrate_kbps": 256,
        "resolution": [1920, 1080],
        "framerate": 30
      }
    ],
    "defaults": {
      "preview": "low",
      "streaming": "standard",
      "recording": "high"
    }
  },
  "streaming": {
    "supported": true,
    "platforms": ["youtube", "facebook", "twitch", "generic"],
    "configured": {
      "url": "rtmp://a.rtmp.youtube.com/live2",
      "platform": "youtube",
      "stream_key_set": true
    },
    "is_streaming": false
  }
}
```

### Capability Details

| Capability            | Key Fields                                        | Notes                                |
| --------------------- | ------------------------------------------------- | ------------------------------------ |
| **PiP**               | `max_sources`, `supported_positions`, size limits | Only available with 2+ video sources |
| **Audio Mixing**      | `max_inputs`                                      | Up to 4 audio inputs                 |
| **Hardware Encoding** | `supported`                                       | Platform-dependent                   |
| **Quality**           | `presets[]`, `defaults`                           | Defaults vary by output type         |
| **Streaming**         | `platforms`, `configured`, `is_streaming`         | `configured` is null if not set up   |

---

## 8. WebRTC Preview Signaling

### Overview

The preview system uses WebRTC to stream live video from the device to a
browser. In cloud mode, the device is the WebRTC offerer and CivicPress acts as
a relay between the device and browser.

### Signaling Flow (Cloud Mode)

```
Browser              CivicPress Server           Broadcast Box
  │                       │                           │
  │  "Start preview"      │                           │
  │──────────────────────>│   preview.start            │
  │                       │──────────────────────────>│
  │                       │                    (creates offer)
  │                       │   preview.offer            │
  │                       │<──────────────────────────│
  │  SDP Offer            │                           │
  │<──────────────────────│                           │
  │                       │                           │
  │  (creates answer)     │                           │
  │  SDP Answer           │                           │
  │──────────────────────>│   preview.answer           │
  │                       │──────────────────────────>│
  │                       │                           │
  │  ICE Candidates       │   preview.ice_candidate    │
  │<─────────────────────>│<─────────────────────────>│
  │                       │                           │
  │  ◄══ Media Stream ══► │                           │
  │  (P2P or via TURN)    │                           │
```

### SDP Message Formats

**Offer (Device → CivicPress → Browser):**

```json
{
  "type": "preview.offer",
  "id": "msg-uuid",
  "timestamp": "2025-06-15T14:30:01.000Z",
  "payload": {
    "type": "offer",
    "sdp": "v=0\r\no=- ...",
    "offer_id": "offer-uuid"
  }
}
```

**Answer (Browser → CivicPress → Device):**

CivicPress should send this to the device via WebSocket:

```json
{
  "action": "preview.answer",
  "commandId": "cmd-uuid",
  "payload": {
    "type": "answer",
    "sdp": "v=0\r\no=- ...",
    "offer_id": "offer-uuid"
  }
}
```

The `offer_id` must match the one from the offer. If it doesn't match (e.g., the
device has since re-offered), the answer is rejected as stale.

**ICE Candidate (either direction):**

Device → CivicPress:

```json
{
  "type": "preview.ice_candidate",
  "id": "msg-uuid",
  "timestamp": "...",
  "payload": {
    "candidate": "candidate:1 1 UDP 2013266431 ...",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```

CivicPress → Device:

```json
{
  "action": "preview.ice_candidate",
  "commandId": "cmd-uuid",
  "payload": {
    "candidate": "candidate:1 1 UDP 2013266431 ...",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```

### Re-offer on Reconnect

When the WebSocket reconnects (after a dropped connection), the device
automatically re-offers its preview if one was active. CivicPress should be
prepared to receive a new `preview.offer` at any time after a `device.connected`
event.

### STUN/TURN Configuration

The device uses:

- STUN: `stun:stun.l.google.com:19302` (default)
- TURN: None by default (configurable)

CivicPress and the browser client should use compatible STUN/TURN servers for
ICE negotiation to succeed.

---

## 9. Authentication & Lifecycle

### Token Handling

The device stores its JWT token encrypted using Fernet symmetric encryption. It
sends the token in three places on every WebSocket connection:

1. URL query parameter: `?token={jwt}`
2. HTTP header: `Authorization: Bearer {jwt}`
3. HTTP header: `X-Device-Token: {jwt}`

CivicPress should check all three and accept any valid token.

### Token Refresh / Re-enrollment

There is no separate token refresh endpoint. When a token expires or is
rejected:

1. The server sends an `error` message via WebSocket with
   `error.code == "AUTH_FAILED"`
2. The device calls `POST /api/v1/broadcast-box/devices` with its stored
   enrollment credentials
3. On success, the device stores the new token and reconnects
4. On failure, the device disconnects and enters a failed state

**CivicPress must** accept re-enrollment requests from already-enrolled devices
and issue fresh tokens.

### Device Lifecycle States

```
                    ┌──────────┐
                    │ ENROLLED │
                    └────┬─────┘
                         │ (first connection)
                    ┌────▼─────┐
               ┌────│  ACTIVE  │────┐
               │    └────┬─────┘    │
               │         │          │
          ┌────▼──────┐  │   ┌──────▼──────┐
          │ SUSPENDED  │  │   │   REVOKED   │
          └────┬──────┘  │   └──────┬──────┘
               │         │          │
               └─────────┘          │
                                    │
                         ┌──────────▼───────────┐
                         │   DECOMMISSIONED     │
                         └──────────────────────┘
```

| State            | Meaning                                                      |
| ---------------- | ------------------------------------------------------------ |
| `ENROLLED`       | Device registered but hasn't connected yet                   |
| `ACTIVE`         | Device connected and operational                             |
| `SUSPENDED`      | Temporarily disabled (e.g., maintenance)                     |
| `REVOKED`        | Credentials invalidated, device must re-enroll with new code |
| `DECOMMISSIONED` | Permanently removed from service                             |

### Session States

Independent of device lifecycle, each capture session tracks its own state:

```
IDLE → STARTING → CAPTURING → STOPPING → UPLOADING → COMPLETE → IDLE
                      │            │           │
                      └────────────┴───────────┘
                                   │
                                FAILED → IDLE
```

| State       | Meaning                                         |
| ----------- | ----------------------------------------------- |
| `idle`      | No active session                               |
| `starting`  | Session starting, initializing capture pipeline |
| `capturing` | Actively capturing video/audio                  |
| `stopping`  | Tearing down capture pipeline                   |
| `uploading` | Uploading recorded content                      |
| `complete`  | Session finished successfully                   |
| `failed`    | Session failed, will return to idle             |

### Capture States

The capture pipeline has its own orthogonal state:

| State                      | Meaning                           |
| -------------------------- | --------------------------------- |
| `idle`                     | No active capture                 |
| `previewing`               | Preview only (WebRTC)             |
| `recording`                | Recording only                    |
| `previewing_and_recording` | Both preview and recording active |

---

## 10. Status Report Schema

Sent as a `status` message every 30 seconds. This is the complete payload
structure:

```json
{
  "timestamp": 1718459400.0,
  "device_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",

  "session": {
    "state": "idle",
    "session_id": null,
    "metadata": {}
  },

  "resources": {
    "cpu_percent": 25.5,
    "memory_percent": 42.3,
    "disk_percent": 18.7,
    "healthy": true
  },

  "storage": {
    "total_size_mb": 1024,
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
    "endpoint": "wss://cityserver.example.com/realtime/device/a1b2c3d4..."
  },

  "sources": {
    "video": [
      { "id": 0, "identifier": "FaceTime HD Camera", "name": "FaceTime HD Camera" },
      { "id": "pip", "identifier": "pip", "name": "Picture-in-Picture", "type": "virtual" }
    ],
    "audio": [
      { "id": 0, "identifier": "MacBook Pro Microphone", "name": "MacBook Pro Microphone" }
    ],
    "active": {
      "video": { "id": 0, "identifier": "FaceTime HD Camera" },
      "audio": { "id": 0, "identifier": "MacBook Pro Microphone" }
    },
    "last_updated": 1718459400.0,
    "pip": {
      "supported": true,
      "configured": true,
      "pip_source": { "id": 1, "identifier": "USB Camera" },
      "main_source": { "id": 0, "identifier": "FaceTime HD Camera" },
      "position": "top_right",
      "size": 0.25
    }
  },

  "streaming": {
    "available": true,
    "configured": true,
    "streaming": false,
    "platform": "youtube"
  }
}
```

### Field Reference

| Path                       | Type           | Notes                                                                                  |
| -------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| `timestamp`                | float          | Unix timestamp (seconds)                                                               |
| `device_id`                | string         | Device UUID                                                                            |
| `session.state`            | string         | One of: `idle`, `starting`, `capturing`, `stopping`, `uploading`, `complete`, `failed` |
| `session.session_id`       | string or null | Active session UUID                                                                    |
| `session.metadata`         | object         | Arbitrary session metadata                                                             |
| `resources.cpu_percent`    | float          | 0-100                                                                                  |
| `resources.memory_percent` | float          | 0-100                                                                                  |
| `resources.disk_percent`   | float          | 0-100                                                                                  |
| `resources.healthy`        | boolean        | Overall health assessment                                                              |
| `storage.total_size_mb`    | integer        | Total storage used in MB                                                               |
| `storage.session_count`    | integer        | Number of stored sessions                                                              |
| `upload.queue_size`        | integer        | Pending uploads                                                                        |
| `upload.active_uploads`    | integer        | In-progress uploads                                                                    |
| `upload.total_completed`   | integer        | Lifetime successful uploads                                                            |
| `upload.total_failed`      | integer        | Lifetime failed uploads                                                                |
| `connection.connected`     | boolean        | Currently connected                                                                    |
| `connection.state`         | string         | `connected`, `disconnected`, `connecting`, `reconnecting`, `failed`                    |
| `connection.endpoint`      | string         | Current WebSocket URL                                                                  |
| `sources.video[]`          | array          | Available video devices                                                                |
| `sources.audio[]`          | array          | Available audio devices                                                                |
| `sources.active.video`     | object         | Currently selected video source                                                        |
| `sources.active.audio`     | object         | Currently selected audio source                                                        |
| `sources.last_updated`     | float          | Unix timestamp of last source enumeration                                              |
| `sources.pip.supported`    | boolean        | Whether PiP is available                                                               |
| `sources.pip.configured`   | boolean        | Whether PiP is currently active                                                        |
| `sources.pip.pip_source`   | object         | PiP overlay source                                                                     |
| `sources.pip.main_source`  | object         | PiP main source                                                                        |
| `sources.pip.position`     | string         | Current PiP position                                                                   |
| `sources.pip.size`         | float          | Current PiP size (0.1-0.9)                                                             |
| `streaming.available`      | boolean        | Whether streaming service is available                                                 |
| `streaming.configured`     | boolean        | Whether an RTMP destination is set                                                     |
| `streaming.streaming`      | boolean        | Whether currently streaming                                                            |
| `streaming.platform`       | string         | Configured platform name                                                               |

---

## 11. Error Codes

Complete list of error codes the device may return in ACK responses.

### General Errors

| Code                      | Meaning                     |
| ------------------------- | --------------------------- |
| `ERR_UNKNOWN`             | Unexpected error            |
| `ERR_INVALID_COMMAND`     | Unrecognized command action |
| `ERR_INVALID_PAYLOAD`     | Payload failed validation   |
| `ERR_MISSING_PARAMETER`   | Required field not provided |
| `ERR_SERVICE_UNAVAILABLE` | Dependent service not ready |

### Source/Device Errors

| Code                        | Meaning                                   |
| --------------------------- | ----------------------------------------- |
| `ERR_SOURCE_NOT_FOUND`      | Requested source identifier doesn't exist |
| `ERR_SOURCE_NOT_CONFIGURED` | No active source configured for this type |
| `ERR_DEVICE_NOT_FOUND`      | Referenced device not found               |
| `ERR_DEVICE_BUSY`           | Device is processing another operation    |

### Session Errors

| Code                         | Meaning                                      |
| ---------------------------- | -------------------------------------------- |
| `ERR_SESSION_NOT_ACTIVE`     | No active session to operate on              |
| `ERR_SESSION_ALREADY_ACTIVE` | A session is already running                 |
| `ERR_SESSION_INVALID_STATE`  | Operation not valid in current session state |

### Capture Errors

| Code                         | Meaning                                     |
| ---------------------------- | ------------------------------------------- |
| `ERR_CAPTURE_NOT_ACTIVE`     | No active capture pipeline                  |
| `ERR_CAPTURE_ALREADY_ACTIVE` | Capture already running                     |
| `ERR_CAPTURE_FAILED`         | Capture pipeline failed to start or crashed |

### Streaming Errors

| Code                              | Meaning                          |
| --------------------------------- | -------------------------------- |
| `ERR_STREAMING_NOT_CONFIGURED`    | No RTMP destination configured   |
| `ERR_STREAMING_ALREADY_ACTIVE`    | Already streaming                |
| `ERR_STREAMING_NOT_ACTIVE`        | Not currently streaming          |
| `ERR_STREAMING_CONNECTION_FAILED` | Failed to connect to RTMP server |
| `ERR_STREAMING_INVALID_URL`       | Malformed RTMP URL               |

### Preview Errors

| Code                         | Meaning                                 |
| ---------------------------- | --------------------------------------- |
| `ERR_PREVIEW_NOT_ACTIVE`     | No active preview to stop               |
| `ERR_PREVIEW_ALREADY_ACTIVE` | Preview already running                 |
| `ERR_WEBRTC_FAILED`          | WebRTC negotiation or connection failed |

### Storage Errors

| Code                       | Meaning                       |
| -------------------------- | ----------------------------- |
| `ERR_STORAGE_FULL`         | Disk storage quota exceeded   |
| `ERR_STORAGE_WRITE_FAILED` | Failed to write to storage    |
| `ERR_FILE_NOT_FOUND`       | Requested file does not exist |

### Error Response Structure in ACKs

When a command fails, the ACK includes structured error information:

```json
{
  "type": "ack",
  "commandId": "cmd-uuid",
  "success": false,
  "error": "Video source not found: device_3",
  "errorCode": "ERR_SOURCE_NOT_FOUND"
}
```

For typed errors (`BroadcastBoxError` subclasses), the error hierarchy maps to
default codes:

| Error Type           | Default Code                      |
| -------------------- | --------------------------------- |
| `ConfigurationError` | `ERR_INVALID_PAYLOAD`             |
| `CaptureError`       | `ERR_CAPTURE_FAILED`              |
| `EncodingError`      | `ERR_CAPTURE_FAILED`              |
| `StorageError`       | `ERR_STORAGE_WRITE_FAILED`        |
| `NetworkError`       | `ERR_SERVICE_UNAVAILABLE`         |
| `StateError`         | `ERR_SESSION_INVALID_STATE`       |
| `StreamingError`     | `ERR_STREAMING_CONNECTION_FAILED` |
| `SourceError`        | `ERR_SOURCE_NOT_FOUND`            |
| `PreviewError`       | `ERR_PREVIEW_NOT_ACTIVE`          |

For plain `ValueError` exceptions, the error code is inferred from the error
message text using keyword matching (e.g., "source" → `ERR_SOURCE_NOT_FOUND`,
"session" → `ERR_SESSION_INVALID_STATE`).

---

## 12. Implementation Checklist for CivicPress

### API Endpoints

- [ ] `POST /api/v1/broadcast-box/devices` — Enrollment endpoint (accept initial
      enrollment and re-enrollment)
- [ ] WebSocket server at `/realtime/device/:deviceUuid` — Accept device
      connections with token auth

### Core Server Logic

- [ ] JWT token issuance — Generate tokens with expiration for device auth
- [ ] JWT token validation — Check token from query param, `Authorization`
      header, or `X-Device-Token` header
- [ ] Command dispatch — Send commands to connected devices via WebSocket (use
      any of the three message formats)
- [ ] ACK correlation — Match ACK responses to sent commands via `commandId`
- [ ] Status report ingestion — Parse and store periodic status reports (every
      30s)
- [ ] Device lifecycle management — Track device states: ENROLLED → ACTIVE →
      SUSPENDED → REVOKED → DECOMMISSIONED

### WebRTC Preview Relay

- [ ] Receive `preview.offer` from device — Extract SDP offer and `offer_id`
- [ ] Relay SDP offer to browser client — Via your frontend WebSocket or API
- [ ] Receive SDP answer from browser — Relay back to device as `preview.answer`
      command with matching `offer_id`
- [ ] ICE candidate relay — Forward `preview.ice_candidate` messages in both
      directions (device ↔ browser)
- [ ] Handle re-offers — Device may send new offers after reconnection

### Frontend

- [ ] Device list — Show registered devices with status from status reports
- [ ] Preview viewer — WebRTC video player that handles SDP negotiation via the
      server relay
- [ ] Session controls — Start/stop session, start/stop recording, configure
      streaming
- [ ] Source selection — List and switch video/audio sources
- [ ] PiP configuration — Configure picture-in-picture layout
- [ ] Quality settings — Set quality presets for preview/recording/streaming
- [ ] Enrollment UI — Generate enrollment codes and QR codes for device setup
