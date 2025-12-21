# CivicPress Broadcast Box Module Specification

**Status**: Complete Implementation Specification  
**Version**: 1.0.0  
**Target**: CivicPress `modules/broadcast-box`  
**Last Updated**: 2025-01-30

---

## Executive Summary

This specification defines the **Broadcast Box Control Module** for CivicPress,
enabling remote control and monitoring of Broadcast Box devices for civic
session recording.

**Key Principles**:

- **Devices are "dumb"** - CivicPress is the source of truth and control
- **Session-driven** - Recording is tied to CivicPress session records
- **Workflow-integrated** - Automation via CivicPress workflow engine
- **Storage-integrated** - Uploads handled by CivicPress Storage Manager
- **WebSocket-based** - Real-time bidirectional communication

---

## Table of Contents

1. [Module Overview](#module-overview)
2. [Architecture & Integration](#architecture--integration)
3. [Data Models](#data-models)
4. [WebSocket Server](#websocket-server)
5. [REST API Endpoints](#rest-api-endpoints)
6. [Command & Event Protocol](#command--event-protocol)
7. [UI Components](#ui-components)
8. [Workflow Integration](#workflow-integration)
9. [Storage Integration](#storage-integration)
10. [Testing Strategy](#testing-strategy)
11. [Deployment & Scaling](#deployment--scaling)
12. [Security & Permissions](#security--permissions)
13. [Implementation Plan](#implementation-plan)

---

## Module Overview

### Purpose

The `modules/broadcast-box` module provides:

1. **Device Management**: Registration, enrollment, configuration, lifecycle
2. **Session Control**: Start/stop recording tied to CivicPress sessions
3. **Real-time Monitoring**: Device status, health, recording state
4. **File Ingestion**: Receive and process uploaded recordings
5. **Workflow Integration**: Automated recording triggers

### Module Location

```
modules/broadcast-box/
├── src/
│   ├── server.ts              # Express server entrypoint
│   ├── websocket/
│   │   ├── server.ts          # WebSocket server
│   │   ├── connection.ts      # Connection management
│   │   ├── protocol.ts        # Message protocol
│   │   └── handlers.ts        # Command/event handlers
│   ├── api/
│   │   ├── devices.ts         # Device CRUD endpoints
│   │   ├── sessions.ts        # Session control endpoints
│   │   ├── uploads.ts         # Upload handling endpoints
│   │   └── health.ts          # Health/status endpoints
│   ├── models/
│   │   ├── device.ts          # Device model
│   │   ├── session.ts         # Recording session model
│   │   └── upload.ts          # Upload job model
│   ├── services/
│   │   ├── device-manager.ts  # Device lifecycle management
│   │   ├── session-controller.ts # Session control logic
│   │   ├── upload-processor.ts   # Upload processing
│   │   └── storage-client.ts     # Storage Manager integration
│   ├── workflows/
│   │   └── triggers.ts        # Workflow trigger handlers
│   ├── storage/
│   │   ├── migrations/        # DB migrations
│   │   └── queries.ts         # DB queries
│   └── types/
│       ├── device.ts          # TypeScript types
│       ├── protocol.ts         # Protocol types
│       └── api.ts             # API types
├── tests/
│   ├── unit/
│   ├── integration/
│   └── mocks/
│       └── broadcast-box.ts   # Mock Broadcast Box for testing
├── package.json
└── tsconfig.json
```

### Dependencies

**Internal Modules**:

- `modules/api` - Authentication, permissions, record management
- `modules/realtime` - WebSocket infrastructure (may extend or share)
- `modules/storage` - File storage and management
- `modules/workflows` - Workflow engine integration

**External**:

- `express` - HTTP server
- `ws` or `socket.io` - WebSocket server
- `sqlite3` or `pg` - Database driver
- `multer` - File upload handling
- `uuid` - ID generation

---

## Architecture & Integration

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CivicPress Core                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │   modules/   │    │   modules/   │    │   modules/   │ │
│  │     api      │◄──►│  broadcast-  │◄──►│  workflows   │ │
│  │              │    │     box      │    │              │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│         │                   │                    │          │
│         │                   │                    │          │
│         ▼                   ▼                    ▼          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │   modules/   │    │   modules/   │    │   modules/   │ │
│  │   storage    │    │   realtime   │    │     ui       │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │                              │
         │ WebSocket (WSS/WS)           │ HTTP (REST)
         │                              │
         ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Broadcast Box Devices                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │  Box #1  │  │  Box #2  │  │  Box #N  │                 │
│  └──────────┘  └──────────┘  └──────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

### Integration Points

#### 1. WebSocket Server

**Option A: Extend `modules/realtime`**

- Reuse existing WebSocket infrastructure
- Add device-specific room types: `device:<deviceId>`
- Share connection management, authentication, scaling

**Option B: Separate `modules/broadcast-box/websocket`**

- Independent WebSocket server
- Dedicated to device communication
- Can share libraries but separate concerns

**Recommendation**: **Option A** - Extend `modules/realtime` with device rooms.
This provides:

- Shared infrastructure (auth, scaling, monitoring)
- Consistent patterns
- Easier maintenance

#### 2. Database Integration

**Tables** (SQLite/PostgreSQL compatible):

```sql
-- Devices table
CREATE TABLE broadcast_devices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  device_uuid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  room_location TEXT,
  status TEXT NOT NULL, -- 'enrolled', 'active', 'suspended', 'revoked'
  capabilities JSONB, -- {video_sources: [...], audio_sources: [...]}
  config JSONB, -- Device configuration
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- Recording sessions table
CREATE TABLE broadcast_sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  civicpress_session_id TEXT NOT NULL, -- Links to CivicPress session record
  status TEXT NOT NULL, -- 'pending', 'recording', 'stopping', 'encoding', 'uploading', 'complete', 'failed'
  started_at TIMESTAMP,
  stopped_at TIMESTAMP,
  completed_at TIMESTAMP,
  error TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  FOREIGN KEY (device_id) REFERENCES broadcast_devices(id),
  FOREIGN KEY (civicpress_session_id) REFERENCES sessions(id)
);

-- Upload jobs table
CREATE TABLE broadcast_uploads (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_hash TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending', 'uploading', 'processing', 'complete', 'failed'
  progress_percent INTEGER DEFAULT 0,
  storage_location TEXT, -- Final storage path in Storage Manager
  error TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  FOREIGN KEY (session_id) REFERENCES broadcast_sessions(id),
  FOREIGN KEY (device_id) REFERENCES broadcast_devices(id)
);

-- Device events/telemetry (for audit and monitoring)
CREATE TABLE broadcast_device_events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB,
  created_at TIMESTAMP NOT NULL,
  FOREIGN KEY (device_id) REFERENCES broadcast_devices(id)
);

CREATE INDEX idx_broadcast_devices_org ON broadcast_devices(organization_id);
CREATE INDEX idx_broadcast_sessions_device ON broadcast_sessions(device_id);
CREATE INDEX idx_broadcast_sessions_civicpress ON broadcast_sessions(civicpress_session_id);
CREATE INDEX idx_broadcast_uploads_session ON broadcast_uploads(session_id);
CREATE INDEX idx_broadcast_device_events_device ON broadcast_device_events(device_id);
```

#### 3. API Integration

**Extends `modules/api`**:

- Device endpoints: `/api/v1/broadcast-box/devices`
- Session endpoints: `/api/v1/broadcast-box/sessions`
- Upload endpoints: `/api/v1/broadcast-box/uploads`

**Uses `modules/api` services**:

- Authentication/authorization
- Permission checking
- Record management (for session linking)

#### 4. Storage Integration

**Uses `modules/storage`**:

- Upload handling via Storage Manager
- File verification (hash checking)
- Storage location management
- Link files to session records

#### 5. Workflow Integration

**Integrates with `modules/workflows`**:

- Triggers: `onSessionCreated`, `onSessionStart`, `onSessionEnd`
- Actions: `startRecording`, `stopRecording`, `processUpload`

---

## Data Models

### Device Model

```typescript
interface BroadcastDevice {
  id: string; // UUID
  organizationId: string;
  deviceUuid: string; // From Broadcast Box enrollment
  name: string; // User-friendly name
  roomLocation?: string; // "Council Chamber", "Committee Room A"
  status: 'enrolled' | 'active' | 'suspended' | 'revoked';
  capabilities: {
    videoSources: string[]; // ['hdmi1', 'hdmi2', 'usb_camera']
    audioSources: string[]; // ['usb_audio', 'hdmi_audio']
    pipSupported: boolean;
    maxResolution: string; // '1920x1080'
  };
  config: {
    defaultVideoSource?: string;
    defaultAudioSource?: string;
    qualityPreset?: 'low' | 'standard' | 'high';
    autoStart?: boolean;
  };
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface DeviceConnection {
  deviceId: string;
  connected: boolean;
  endpoint?: string; // 'cloud' | 'local'
  lastHeartbeat?: Date;
  state: {
    status: 'idle' | 'recording' | 'encoding' | 'uploading';
    activeSessionId?: string;
    health: {
      score: number; // 0-100
      status: 'healthy' | 'degraded' | 'unhealthy';
      metrics: {
        memoryPercent: number;
        cpuPercent: number;
        diskPercent: number;
      };
    };
  };
}
```

### Session Model

```typescript
interface BroadcastSession {
  id: string; // UUID
  deviceId: string;
  civicpressSessionId: string; // Links to CivicPress session record
  status: 'pending' | 'recording' | 'stopping' | 'encoding' | 'uploading' | 'complete' | 'failed';
  startedAt?: Date;
  stoppedAt?: Date;
  completedAt?: Date;
  error?: string;
  metadata: {
    videoSource?: string;
    audioSource?: string;
    quality?: string;
    pip?: {
      enabled: boolean;
      main: string;
      pip: string;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

interface UploadJob {
  id: string;
  sessionId: string;
  deviceId: string;
  filePath: string; // On device
  fileName: string;
  fileSize: number;
  fileHash: string; // SHA256
  mimeType: string;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'failed';
  progressPercent: number;
  storageLocation?: string; // Final location in Storage Manager
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## WebSocket Server

### Connection Endpoint

**URL Format**:

```
wss://<host>/realtime/devices/:deviceId?token=<jwt-token>
```

**Alternative** (Header-based auth):

```
wss://<host>/realtime/devices/:deviceId
Headers:
  Authorization: Bearer <jwt-token>
```

### Connection Lifecycle

1. **Device Connects**
   - Sends `device.connected` event
   - Includes device UUID, version, capabilities
   - CivicPress validates device enrollment

2. **State Synchronization**
   - Device sends `state_sync` with current status
   - CivicPress sends `connection.ack`

3. **Heartbeat**
   - Device sends `heartbeat` every 10 seconds
   - CivicPress responds with `pong`
   - Missing heartbeats → mark device as disconnected

4. **Reconnection**
   - Device reconnects → sends `device.connected`
   - CivicPress sends `state_sync` request
   - Device syncs state

### Room Model

**Room Key**: `device:<deviceId>`

- One room per device
- Room persists while device is connected
- Room cleaned up after disconnect timeout (5 minutes)

### Message Protocol

See [Command & Event Protocol](#command--event-protocol) section below.

---

## REST API Endpoints

### Device Management

#### `GET /api/v1/broadcast-box/devices`

List all devices for the organization.

**Query Parameters**:

- `status` - Filter by status
- `room` - Filter by room location

**Response**:

```json
{
  "devices": [
    {
      "id": "device-uuid",
      "name": "Council Chamber Recorder",
      "roomLocation": "Council Chamber",
      "status": "active",
      "connected": true,
      "lastSeenAt": "2025-01-30T14:00:00Z",
      "capabilities": { ... }
    }
  ]
}
```

#### `GET /api/v1/broadcast-box/devices/:id`

Get device details.

**Response**:

```json
{
  "device": { ... },
  "connection": {
    "connected": true,
    "endpoint": "cloud",
    "state": { ... }
  },
  "recentSessions": [ ... ]
}
```

#### `POST /api/v1/broadcast-box/devices`

Register new device (enrollment).

**Request**:

```json
{
  "deviceUuid": "box-uuid-from-qr",
  "enrollmentCode": "enrollment-code-from-qr",
  "name": "Council Chamber Recorder",
  "roomLocation": "Council Chamber"
}
```

**Response**:

```json
{
  "device": { ... },
  "credentials": {
    "token": "device-auth-token"
  }
}
```

#### `PATCH /api/v1/broadcast-box/devices/:id`

Update device configuration.

**Request**:

```json
{
  "name": "Updated Name",
  "roomLocation": "New Room",
  "config": {
    "defaultVideoSource": "hdmi1",
    "qualityPreset": "high"
  }
}
```

#### `DELETE /api/v1/broadcast-box/devices/:id`

Revoke device (soft delete).

### Session Control

#### `POST /api/v1/broadcast-box/sessions`

Start a recording session.

**Request**:

```json
{
  "deviceId": "device-uuid",
  "civicpressSessionId": "session-uuid",
  "config": {
    "videoSource": "hdmi1",
    "audioSource": "usb_audio",
    "quality": "standard",
    "pip": {
      "enabled": true,
      "main": "hdmi1",
      "pip": "hdmi2"
    }
  }
}
```

**Response**:

```json
{
  "session": {
    "id": "broadcast-session-uuid",
    "status": "recording",
    "startedAt": "2025-01-30T14:00:00Z"
  }
}
```

#### `POST /api/v1/broadcast-box/sessions/:id/stop`

Stop a recording session.

**Response**:

```json
{
  "session": {
    "id": "broadcast-session-uuid",
    "status": "stopping",
    "stoppedAt": "2025-01-30T14:30:00Z"
  }
}
```

#### `GET /api/v1/broadcast-box/sessions/:id`

Get session status.

**Response**:

```json
{
  "session": { ... },
  "upload": {
    "status": "uploading",
    "progressPercent": 45
  }
}
```

#### `GET /api/v1/broadcast-box/sessions`

List sessions (with filters).

**Query Parameters**:

- `deviceId` - Filter by device
- `civicpressSessionId` - Filter by CivicPress session
- `status` - Filter by status
- `limit`, `offset` - Pagination

### Upload Management

#### `GET /api/v1/broadcast-box/uploads/:id`

Get upload status.

#### `GET /api/v1/broadcast-box/uploads`

List uploads (with filters).

### Health & Status

#### `GET /api/v1/broadcast-box/devices/:id/health`

Get device health metrics.

**Response**:

```json
{
  "health": {
    "score": 95,
    "status": "healthy",
    "metrics": {
      "memoryPercent": 45,
      "cpuPercent": 30,
      "diskPercent": 60
    }
  },
  "connection": {
    "connected": true,
    "lastHeartbeat": "2025-01-30T14:00:00Z"
  }
}
```

---

## Command & Event Protocol

### Message Format

All messages are JSON objects:

```typescript
interface BaseMessage {
  type: string;
  id: string; // UUID
  timestamp: string; // ISO 8601
  payload?: any;
}
```

### Commands (CivicPress → Broadcast Box)

#### `start_session`

```json
{
  "type": "command",
  "id": "cmd-uuid",
  "timestamp": "2025-01-30T14:00:00Z",
  "action": "start_session",
  "payload": {
    "session_id": "broadcast-session-uuid",
    "civicpress_session_id": "civicpress-session-uuid",
    "config": {
      "video_source": "hdmi1",
      "audio_source": "usb_audio",
      "quality": "standard",
      "pip": {
        "enabled": true,
        "main": "hdmi1",
        "pip": "hdmi2",
        "position": "bottom-right"
      }
    }
  }
}
```

**Response** (Acknowledgment):

```json
{
  "type": "ack",
  "id": "ack-uuid",
  "command_id": "cmd-uuid",
  "timestamp": "2025-01-30T14:00:01Z",
  "status": "success",
  "payload": {
    "session_id": "broadcast-session-uuid",
    "state": "recording"
  }
}
```

#### `stop_session`

```json
{
  "type": "command",
  "id": "cmd-uuid",
  "timestamp": "2025-01-30T14:30:00Z",
  "action": "stop_session",
  "payload": {
    "session_id": "broadcast-session-uuid"
  }
}
```

#### `update_config`

```json
{
  "type": "command",
  "id": "cmd-uuid",
  "timestamp": "2025-01-30T14:00:00Z",
  "action": "update_config",
  "payload": {
    "config": {
      "quality_presets": {
        "standard": {
          "video_bitrate": "2000k",
          "audio_bitrate": "128k"
        }
      }
    }
  }
}
```

#### `get_status`

```json
{
  "type": "command",
  "id": "cmd-uuid",
  "timestamp": "2025-01-30T14:00:00Z",
  "action": "get_status"
}
```

### Events (Broadcast Box → CivicPress)

#### `device.connected`

```json
{
  "type": "event",
  "id": "event-uuid",
  "timestamp": "2025-01-30T14:00:00Z",
  "event": "device.connected",
  "payload": {
    "device_id": "device-uuid",
    "version": "1.0.0",
    "capabilities": ["hdmi1", "hdmi2", "usb_audio"]
  }
}
```

#### `session.started`

```json
{
  "type": "event",
  "id": "event-uuid",
  "timestamp": "2025-01-30T14:00:01Z",
  "event": "session.started",
  "payload": {
    "session_id": "broadcast-session-uuid",
    "state": "recording",
    "started_at": "2025-01-30T14:00:01Z"
  }
}
```

#### `session.stopped`

```json
{
  "type": "event",
  "id": "event-uuid",
  "timestamp": "2025-01-30T14:30:01Z",
  "event": "session.stopped",
  "payload": {
    "session_id": "broadcast-session-uuid",
    "state": "encoding",
    "stopped_at": "2025-01-30T14:30:01Z"
  }
}
```

#### `session.complete`

```json
{
  "type": "event",
  "id": "event-uuid",
  "timestamp": "2025-01-30T14:35:00Z",
  "event": "session.complete",
  "payload": {
    "session_id": "broadcast-session-uuid",
    "file_path": "/data/sessions/session-uuid.mp4",
    "file_size": 1000000000,
    "duration_seconds": 1800,
    "hash": "sha256:abc123...",
    "completed_at": "2025-01-30T14:35:00Z"
  }
}
```

#### `upload.progress`

```json
{
  "type": "event",
  "id": "event-uuid",
  "timestamp": "2025-01-30T14:40:00Z",
  "event": "upload.progress",
  "payload": {
    "session_id": "broadcast-session-uuid",
    "progress": {
      "bytes_uploaded": 500000000,
      "bytes_total": 1000000000,
      "percent": 50,
      "estimated_seconds_remaining": 60
    }
  }
}
```

#### `upload.complete`

```json
{
  "type": "event",
  "id": "event-uuid",
  "timestamp": "2025-01-30T14:45:00Z",
  "event": "upload.complete",
  "payload": {
    "session_id": "broadcast-session-uuid",
    "uploaded_at": "2025-01-30T14:45:00Z",
    "duration_seconds": 300
  }
}
```

#### `health.update`

```json
{
  "type": "event",
  "id": "event-uuid",
  "timestamp": "2025-01-30T14:00:00Z",
  "event": "health.update",
  "payload": {
    "device_id": "device-uuid",
    "health": {
      "score": 95,
      "status": "healthy",
      "metrics": {
        "memory_percent": 45,
        "cpu_percent": 30,
        "disk_percent": 60
      }
    }
  }
}
```

#### `device.error`

```json
{
  "type": "event",
  "id": "event-uuid",
  "timestamp": "2025-01-30T14:00:10Z",
  "event": "device.error",
  "payload": {
    "severity": "warning",
    "error": {
      "code": "RESOURCE_WARNING",
      "message": "Memory usage high: 85%"
    }
  }
}
```

#### `heartbeat`

```json
{
  "type": "heartbeat",
  "id": "heartbeat-uuid",
  "timestamp": "2025-01-30T14:00:10Z"
}
```

---

## UI Components

### Location: Records Editor Page

**File**: `modules/ui/components/records/BroadcastBoxControls.vue` (or
equivalent)

### Component Structure

```vue
<template>
  <div class="broadcast-box-controls">
    <!-- Device Selection -->
    <DeviceSelector
      v-if="!activeSession"
      :devices="availableDevices"
      @select="handleDeviceSelect"
    />

    <!-- Recording Controls -->
    <RecordingControls
      v-if="selectedDevice"
      :device="selectedDevice"
      :session="activeSession"
      @start="handleStartRecording"
      @stop="handleStopRecording"
    />

    <!-- Status Display -->
    <DeviceStatus
      :device="selectedDevice"
      :connection="deviceConnection"
    />

    <!-- Upload Progress -->
    <UploadProgress
      v-if="activeUpload"
      :upload="activeUpload"
    />
  </div>
</template>
```

### Component Features

1. **Device Selection**
   - Dropdown/list of available devices
   - Shows device status (connected, recording, etc.)
   - Filters by room location if needed

2. **Recording Controls**
   - Start/Stop buttons
   - Source selection (video/audio)
   - PiP configuration (if supported)
   - Quality preset selection

3. **Status Display**
   - Connection status (online/offline)
   - Current recording state
   - Device health score
   - Active session info

4. **Upload Progress**
   - Progress bar
   - Upload speed
   - Estimated time remaining

### Integration with Records Editor

- Component appears in session record editor
- Links recording to CivicPress session record
- Updates session record when recording completes
- Shows recording status in session metadata

### Live Preview

**Note**: Live preview is possible but **not through CivicPress instance**.

Options:

- Direct stream URL from Broadcast Box (if supported)
- Third-party streaming service URL
- Display "Live Preview Available" link (external)

---

## Workflow Integration

### Workflow Triggers

#### `onSessionCreated`

Triggered when a CivicPress session record is created.

**Action**: Optionally auto-start recording if device is configured for
auto-start.

```typescript
// Workflow action
{
  type: 'broadcast_box.start_recording',
  deviceId: 'device-uuid',
  sessionId: '{{session.id}}',
  config: {
    autoStart: true
  }
}
```

#### `onSessionStart`

Triggered when session status changes to "live".

**Action**: Start recording.

```typescript
{
  type: 'broadcast_box.start_recording',
  deviceId: 'device-uuid',
  sessionId: '{{session.id}}'
}
```

#### `onSessionEnd`

Triggered when session status changes to "ended".

**Action**: Stop recording.

```typescript
{
  type: 'broadcast_box.stop_recording',
  sessionId: '{{session.id}}'
}
```

#### `onRecordingComplete`

Triggered when recording upload completes.

**Action**: Link media to session record, trigger transcription.

```typescript
{
  type: 'session.link_media',
  sessionId: '{{session.id}}',
  mediaPath: '{{upload.storageLocation}}'
}
```

### Workflow Actions

#### `broadcast_box.start_recording`

Start recording on a device.

**Parameters**:

- `deviceId` - Device to use
- `sessionId` - CivicPress session ID
- `config` - Optional recording configuration

#### `broadcast_box.stop_recording`

Stop recording.

**Parameters**:

- `sessionId` - Session ID to stop

#### `broadcast_box.process_upload`

Process uploaded recording (transcription, etc.).

**Parameters**:

- `uploadId` - Upload job ID

---

## Storage Integration

### Upload Flow

1. **Broadcast Box Uploads File**
   - POST to `/api/v1/broadcast-box/uploads`
   - Chunked/resumable upload
   - Includes file hash for verification

2. **Upload Processor**
   - Receives file via `modules/storage`
   - Verifies hash
   - Stores in Storage Manager
   - Returns storage location

3. **Link to Session**
   - Creates artifact record
   - Links to CivicPress session record
   - Updates session metadata

### Storage Manager Integration

```typescript
// Upload handling
import { StorageManager } from '@civicpress/storage';

async function processUpload(upload: UploadJob) {
  // Store file
  const storageLocation = await StorageManager.store({
    file: upload.filePath,
    filename: upload.fileName,
    mimeType: upload.mimeType,
    metadata: {
      sessionId: upload.sessionId,
      deviceId: upload.deviceId,
      hash: upload.fileHash
    }
  });

  // Link to session record
  await linkMediaToSession(upload.sessionId, {
    type: 'video',
    path: storageLocation,
    hash: upload.fileHash,
    size: upload.fileSize
  });

  return storageLocation;
}
```

---

## Testing Strategy

### Mock Broadcast Box

**File**: `modules/broadcast-box/tests/mocks/broadcast-box.ts`

```typescript
class MockBroadcastBox {
  private ws: WebSocket;
  private state: {
    connected: boolean;
    recording: boolean;
    sessionId?: string;
  };

  connect(endpoint: string) {
    // Simulate WebSocket connection
  }

  sendEvent(event: Event) {
    // Simulate event from device
  }

  receiveCommand(handler: (cmd: Command) => void) {
    // Simulate command handling
  }
}
```

### Test Scenarios

1. **Device Enrollment**
   - Register device
   - Verify credentials
   - Test duplicate enrollment rejection

2. **Session Control**
   - Start recording
   - Stop recording
   - Handle errors (device offline, etc.)

3. **Upload Processing**
   - Receive upload
   - Verify hash
   - Store in Storage Manager
   - Link to session

4. **Workflow Integration**
   - Test workflow triggers
   - Test workflow actions
   - Test error handling

5. **WebSocket Communication**
   - Test connection lifecycle
   - Test command/event protocol
   - Test reconnection
   - Test error handling

### Test Setup

```typescript
// Test helper
async function setupTestEnvironment() {
  const mockBox = new MockBroadcastBox();
  const testDevice = await createTestDevice();
  await mockBox.connect(testDevice.endpoint);
  return { mockBox, testDevice };
}
```

---

## Deployment & Scaling

### Initial Deployment (1-2 devices)

**Single Node**:

- `modules/broadcast-box` runs alongside other modules
- WebSocket server shares port with `modules/realtime` or uses separate port
- Database: SQLite or PostgreSQL (same as CivicPress)

### Future Scaling

**Multi-Node**:

- Separate `modules/broadcast-box` to dedicated process/host
- Use Redis for shared WebSocket state (if needed)
- Load balancer routes WebSocket connections
- Database: PostgreSQL (shared or dedicated)

### Configuration

```yaml
# .civic/broadcast-box.yml
broadcast_box:
  enabled: true
  websocket:
    port: 3002
    path: '/realtime/devices'
  storage:
    upload_path: '/uploads/broadcast-box'
    max_file_size: 10737418240  # 10GB
  devices:
    max_per_organization: 10
    heartbeat_timeout: 30  # seconds
```

---

## Security & Permissions

### Authentication

- Devices authenticate via JWT token (from enrollment)
- Token validated on WebSocket connection
- Token stored securely on device

### Authorization

**Permissions**:

- `broadcast_box.devices.view` - View devices
- `broadcast_box.devices.manage` - Register/configure devices
- `broadcast_box.sessions.control` - Start/stop recording
- `broadcast_box.uploads.view` - View uploads

**Role-Based**:

- **Clerk**: Can control recording for their sessions
- **Admin**: Can manage devices and all sessions
- **Viewer**: Can view device status only

### Security Measures

- All WebSocket connections use WSS in production
- Rate limiting: Max 10 messages/second per device
- Connection limits: Max 10 concurrent connections per device
- Input validation: All commands validated before processing
- Audit logging: All device actions logged

---

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1-2)

- [ ] Database schema and migrations
- [ ] Device model and CRUD operations
- [ ] Basic WebSocket server (extend `modules/realtime`)
- [ ] Device connection management
- [ ] Authentication/authorization integration

### Phase 2: Session Control (Week 3-4)

- [ ] Session model and database
- [ ] Command protocol implementation
- [ ] Start/stop recording logic
- [ ] Event handling and state management
- [ ] API endpoints for session control

### Phase 3: Upload & Storage (Week 5-6)

- [ ] Upload job model
- [ ] File upload handling (chunked/resumable)
- [ ] Storage Manager integration
- [ ] Hash verification
- [ ] Link media to session records

### Phase 4: UI Components (Week 7-8)

- [ ] Device selector component
- [ ] Recording controls component
- [ ] Status display component
- [ ] Upload progress component
- [ ] Integration with records editor

### Phase 5: Workflow Integration (Week 9-10)

- [ ] Workflow triggers
- [ ] Workflow actions
- [ ] Auto-start/stop logic
- [ ] Error handling in workflows

### Phase 6: Testing & Polish (Week 11-12)

- [ ] Mock Broadcast Box implementation
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E tests
- [ ] Documentation
- [ ] Performance optimization

---

## Open Questions & Future Enhancements

1. **Multi-device coordination**: How to handle multiple devices recording same
   session?
2. **Live streaming integration**: How to link external stream URLs?
3. **Transcription triggers**: When/how to trigger transcription?
4. **Device firmware updates**: OTA update management?
5. **Analytics**: Device usage metrics and reporting?

---

## Related Documentation

- **Broadcast Box Protocol**: `docs/websocket-protocol.md` (in Broadcast Box
  repo)
- **Session Recorder Integration**: `docs/specs/session-recorder-integration.md`
  (in CivicPress repo)
- **Realtime Architecture**: `docs/specs/realtime-architecture.md` (in
  CivicPress repo)

---

**Status**: Ready for implementation  
**Next Steps**: Review with team, refine data models, begin Phase 1
