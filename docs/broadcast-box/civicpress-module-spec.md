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

**Decision**: **Extend `modules/realtime`** with device rooms.

The broadcast-box module uses the same WebSocket infrastructure as other
realtime features (collaborative editing, messaging, etc.). This provides:

- Shared infrastructure (auth, scaling, monitoring)
- Consistent patterns across all realtime features
- Easier maintenance and unified connection management
- Room type: `device:<deviceId>` for device-specific connections

**Implementation**: The `modules/realtime` server will support multiple room
types:

- `record:<recordId>` - Collaborative editing rooms
- `device:<deviceId>` - Broadcast box device rooms
- Future: `consultation:<id>`, `dashboard:<id>`, etc.

#### 2. Database Integration

**Tables** (SQLite/PostgreSQL compatible):

```sql
-- Devices table
CREATE TABLE broadcast_devices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'default', -- Reserved for future multi-tenancy (Phase 7+)
  device_uuid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  room_location TEXT,
  status TEXT NOT NULL, -- 'enrolled', 'active', 'suspended', 'revoked'
  capabilities TEXT NOT NULL, -- JSON string (SQLite-compatible)
  config TEXT, -- JSON string (SQLite-compatible)
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
  -- Note: organization_id foreign key will be added when multi-tenancy is implemented
);

-- Recording sessions table
CREATE TABLE broadcast_sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  civicpress_session_id TEXT NOT NULL, -- Links to CivicPress session record (records.id)
  status TEXT NOT NULL, -- 'pending', 'recording', 'stopping', 'encoding', 'uploading', 'complete', 'failed'
  started_at TIMESTAMP,
  stopped_at TIMESTAMP,
  completed_at TIMESTAMP,
  error TEXT,
  metadata TEXT, -- JSON string (SQLite-compatible)
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  FOREIGN KEY (device_id) REFERENCES broadcast_devices(id) ON DELETE CASCADE
  -- Note: civicpress_session_id references records.id but foreign key constraint
  -- may not exist depending on CivicPress database schema
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

**Integrates with CivicPress Workflow Engine**:

The broadcast-box module extends the workflow engine with new rules and
features:

- **Workflow Triggers**: Emitted via HookSystem
  - `onSessionCreated` - When CivicPress session record is created
  - `onSessionStart` - When session status changes to "live"
  - `onSessionEnd` - When session status changes to "ended"
  - `onRecordingComplete` - When recording upload completes
  - `onBroadcastSessionStatusChanged` - When broadcast-box session status
    changes (see Session Status Lifecycle section)
  - `onDeviceConnected` - When device connects to WebSocket
  - `onDeviceDisconnected` - When device disconnects

- **Workflow Actions**: Available in workflow scripts
  - `broadcast_box.start_recording` - Start recording on device
  - `broadcast_box.stop_recording` - Stop recording
  - `broadcast_box.process_upload` - Process uploaded recording
  - `broadcast_box.link_media` - Link media to session record

- **Workflow Rules**: Extend `data/.civic/workflows.yml` with broadcast-box
  specific rules

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

The broadcast-box module uses the same WebSocket server as other realtime
features (`modules/realtime`).

**URL Format**:

```
wss://<host>/realtime/devices/:deviceId?token=<device-jwt-token>
```

**Alternative** (Header-based auth):

```
wss://<host>/realtime/devices/:deviceId
Headers:
  Authorization: Bearer <device-jwt-token>
```

**Note**: Device authentication uses separate JWT tokens (not user tokens).
Tokens are issued during device enrollment and validated by the realtime
server's authentication layer.

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

**Action**: Link media to session record using hybrid approach, trigger
transcription.

```typescript
{
  type: 'broadcast_box.link_recording',
  sessionId: '{{session.id}}',
  recordingFileId: '{{upload.storageFileId}}',  // UUID from storage system
  metadata: {
    originalName: '{{upload.fileName}}',
    description: 'Session recording'
  }
}
```

**Implementation**: Calls `linkRecordingToSession()` which:

1. Stores UUID in `media.recording` field
2. Adds entry to `attached_files` array with category "recording"
3. Ensures both fields stay in sync

#### `onBroadcastSessionStatusChanged`

Triggered when broadcast-box session status changes.

**Action**: Map technical status to business status via workflow.

```typescript
{
  type: 'broadcast-box:session:status_changed',
  broadcastSessionId: '{{broadcastSession.id}}',
  civicpressSessionId: '{{session.id}}',
  previousStatus: 'pending',
  newStatus: 'recording',
  timestamp: '2025-01-30T14:00:00Z'
}
```

**Implementation**: Workflow script decides if business status should change
(see Session Status Lifecycle section below).

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
   - Links to CivicPress session record using hybrid approach:
     - Stores UUID in `media.recording` field (quick access)
     - Adds entry to `attached_files` array with category "recording" (rich
       metadata)
   - Updates session metadata

### Storage Manager Integration

```typescript
// Upload handling
import { CloudUuidStorageService } from '@civicpress/storage';
import { RecordManager } from '@civicpress/core';

async function processUpload(upload: UploadJob) {
  // Use UUID-based storage service
  const storageService = container.resolve<CloudUuidStorageService>('storage');
  const recordManager = container.resolve<RecordManager>('recordManager');

  // Store file using stream upload for large files
  const result = await storageService.uploadFileStream({
    stream: uploadStream,
    filename: upload.fileName,
    folder: 'sessions', // Store in sessions folder
    contentType: upload.mimeType,
    size: upload.fileSize,
    description: `Recording for session ${upload.sessionId}`,
    uploaded_by: 'broadcast-box-system'
  });

  // Link to session record using hybrid approach
  await linkRecordingToSession(
    upload.civicpressSessionId,
    result.data.id, // UUID from storage system
    {
      originalName: upload.fileName,
      description: `Session recording - ${upload.fileName}`,
      size: upload.fileSize
    }
  );

  return result.data.id;
}

/**
 * Link recording to session record using hybrid approach:
 * - Store UUID in media.recording (quick access)
 * - Add entry to attached_files with category "recording" (rich metadata)
 */
async function linkRecordingToSession(
  sessionId: string,
  recordingFileId: string,
  metadata: {
    originalName: string;
    description?: string;
    size?: number;
  }
): Promise<void> {
  // Get session record
  const session = await recordManager.getRecord(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Update media.recording with UUID
  const updatedMetadata = {
    ...session.metadata,
    media: {
      ...session.metadata?.media,
      recording: recordingFileId // UUID for quick access
    }
  };

  // Add to attached_files with category
  const existingAttachments = session.attachedFiles || [];
  const recordingAttachment = {
    id: recordingFileId, // Same UUID
    path: `sessions/${recordingFileId}.mp4`, // Will be resolved from storage_files
    original_name: metadata.originalName,
    description: metadata.description || 'Session recording',
    category: {
      value: 'recording',
      label: 'Recording',
      description: 'Session recording'
    }
  };

  // Check if recording already exists (replace if exists)
  const hasRecording = existingAttachments.some(
    f => f.id === recordingFileId ||
         (f.category && typeof f.category === 'object' && f.category.value === 'recording')
  );

  const updatedAttachments = hasRecording
    ? existingAttachments.map(f => {
        const isRecording = f.id === recordingFileId ||
          (f.category && typeof f.category === 'object' && f.category.value === 'recording');
        return isRecording ? recordingAttachment : f;
      })
    : [...existingAttachments, recordingAttachment];

  // Update record
  await recordManager.updateRecord(sessionId, {
    metadata: updatedMetadata,
    attachedFiles: updatedAttachments
  });
}
```

### Upload Chunking Strategy

**Decision**: Handle chunked uploads in local storage or temporary folder before
final upload.

**Flow**:

1. **Chunk Reception**: Receive chunks via
   `/api/v1/broadcast-box/uploads/:id/chunks`
2. **Temporary Storage**: Store chunks in temporary directory (e.g.,
   `.system-data/tmp/uploads/:uploadId/`)
3. **Reassembly**: Reassemble chunks into complete file
4. **Hash Verification**: Verify file hash matches expected hash
5. **Final Upload**: Upload complete file to Storage Manager using
   `uploadFileStream()`
6. **Link to Session**: Link recording to session record using hybrid approach
   (see below)
7. **Cleanup**: Remove temporary chunks after successful upload

**Benefits**:

- Allows resumable uploads (track which chunks received)
- Validates integrity before final storage
- Handles network interruptions gracefully
- Uses existing Storage Manager for final storage

### Session Media Field Structure

**Decision**: **Hybrid Approach** - Store recording UUID in both
`media.recording` and `attached_files`.

**Rationale**:

- **Quick Access**: `media.recording` provides direct UUID lookup for common use
  cases
- **Rich Metadata**: `attached_files` provides full metadata (description,
  category, original name)
- **UI Integration**: Works with FileBrowser and attachment management
  components
- **Backward Compatible**: Aligns with existing `media` schema
- **Future Flexibility**: Supports multiple recordings via `attached_files`

**Structure**:

```json
{
  "media": {
    "recording": "123e4567-e89b-12d3-a456-426614174000"  // UUID for quick access
  },
  "attached_files": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",     // Same UUID
      "path": "sessions/recording.123e4567.mp4",
      "original_name": "council-meeting-2025-01-30.mp4",
      "description": "Full recording of council meeting",
      "category": {
        "value": "recording",
        "label": "Recording",
        "description": "Session recording"
      }
    }
  ]
}
```

**Access Patterns**:

```typescript
// Quick access (common use case)
const recordingId = session.metadata?.media?.recording;
if (recordingId) {
  const fileUrl = `/api/v1/storage/files/${recordingId}`;
}

// Rich metadata access (UI, details)
const recording = session.attachedFiles?.find(
  f => f.category?.value === 'recording'
);
if (recording) {
  // Access: recording.description, recording.original_name, etc.
  const fileUrl = `/api/v1/storage/files/${recording.id}`;
}
```

**Implementation**: See `linkRecordingToSession()` function in Storage Manager
Integration section above.

**Note**: Both fields must contain the same UUID. The implementation ensures
they stay in sync.

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

## Service Registration & DI Container

### Service Registration Pattern

All broadcast-box services are registered in the CivicPress DI container
following the standard module pattern:

**File**: `modules/broadcast-box/src/broadcast-box-services.ts`

```typescript
import { ServiceContainer, CivicPressConfig } from '@civicpress/core';
import { DeviceManager } from './services/device-manager.js';
import { SessionController } from './services/session-controller.js';
import { UploadProcessor } from './services/upload-processor.js';

export function registerBroadcastBoxServices(
  container: ServiceContainer,
  config: CivicPressConfig
): void {
  // Register DeviceManager (depends on DatabaseService)
  container.singleton('broadcastBox.deviceManager', (c) => {
    const db = c.resolve<DatabaseService>('database');
    const logger = c.resolve<Logger>('logger');
    return new DeviceManager(db, logger);
  });

  // Register SessionController (depends on DeviceManager, DatabaseService)
  container.singleton('broadcastBox.sessionController', (c) => {
    const deviceManager = c.resolve<DeviceManager>('broadcastBox.deviceManager');
    const db = c.resolve<DatabaseService>('database');
    const logger = c.resolve<Logger>('logger');
    return new SessionController(deviceManager, db, logger);
  });

  // Register UploadProcessor (depends on StorageService, DatabaseService)
  container.singleton('broadcastBox.uploadProcessor', (c) => {
    const storage = c.resolve<CloudUuidStorageService>('storage');
    const db = c.resolve<DatabaseService>('database');
    const logger = c.resolve<Logger>('logger');
    return new UploadProcessor(storage, db, logger);
  });
}
```

**Integration**: Call `registerBroadcastBoxServices()` during CivicPress
initialization, similar to `registerStorageServices()`.

---

## Error Handling

### Error Hierarchy

All broadcast-box errors extend from `CivicPressError` following the unified
error handling pattern:

**File**: `modules/broadcast-box/src/errors/broadcast-box-errors.ts`

```typescript
import {
  CivicPressError,
  NotFoundError,
  ValidationError,
  ConflictError,
  InternalError
} from '@civicpress/core/errors';

// Domain-specific errors
export class DeviceNotFoundError extends NotFoundError {
  code = 'DEVICE_NOT_FOUND';
  constructor(deviceId: string, context?: Record<string, any>) {
    super(`Device '${deviceId}' not found`, { deviceId, ...context });
  }
}

export class SessionAlreadyActiveError extends ConflictError {
  code = 'SESSION_ALREADY_ACTIVE';
  constructor(deviceId: string, context?: Record<string, any>) {
    super(`Device '${deviceId}' already has an active session`, { deviceId, ...context });
  }
}

export class DeviceNotConnectedError extends InternalError {
  code = 'DEVICE_NOT_CONNECTED';
  constructor(deviceId: string, context?: Record<string, any>) {
    super(`Device '${deviceId}' is not connected`, { deviceId, ...context });
  }
}

export class UploadValidationError extends ValidationError {
  code = 'UPLOAD_VALIDATION_ERROR';
  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
  }
}
```

**Usage**:

```typescript
import { DeviceNotFoundError } from './errors/broadcast-box-errors.js';

if (!device) {
  throw new DeviceNotFoundError(deviceId, { operation: 'getDevice' });
}
```

**Integration**: API layer automatically recognizes `CivicPressError` instances
and formats responses with correlation IDs.

---

## Session Status Lifecycle

### Status Separation

**Key Principle**: Keep technical and business statuses separate.

- **Broadcast-Box Status** (Technical): Tracks recording/upload pipeline state
  - Location: `broadcast_sessions.status`
  - Statuses: `pending`, `recording`, `stopping`, `encoding`, `uploading`,
    `complete`, `failed`
  - Purpose: Internal operational tracking

- **Session Record Status** (Business): Tracks meeting/session business state
  - Location: `records.status` (for session type records)
  - Statuses: `draft`, `scheduled`, `live`, `ended`, `archived`, etc.
  - Purpose: Business logic, workflow, permissions

### Event-Driven Status Mapping

**Architecture**: Event-driven status synchronization via workflow engine.

```
Broadcast-Box Status Change
    ↓
Emit Hook Event
    ↓
Workflow Engine Processes Event
    ↓
Workflow Decides Business Status Change
    ↓
Update Session Record Status (if needed)
```

### Status Mapping Strategy

**Meaningful Events** (sync to business status):

- `recording` → `live` (when recording starts, session is live)
- `complete` → `ended` (when recording complete, session ended)
- `failed` → No change (error doesn't change business state)

**Internal Events** (don't sync):

- `pending`, `stopping`, `encoding`, `uploading` → No change (internal states)

### Implementation

#### 1. Hook Event Emission

When broadcast-box session status changes, emit hook event:

```typescript
// In session-controller.ts
async function updateBroadcastSessionStatus(
  sessionId: string,
  newStatus: SessionStatus
): Promise<void> {
  const session = await this.getSession(sessionId);
  const previousStatus = session.status;

  // Update database
  await this.db.updateBroadcastSession(sessionId, {
    status: newStatus,
    updated_at: new Date()
  });

  // Emit hook event for workflow processing
  await this.hookSystem.emit('broadcast-box:session:status_changed', {
    broadcastSessionId: sessionId,
    civicpressSessionId: session.civicpressSessionId,
    previousStatus,
    newStatus,
    timestamp: new Date().toISOString()
  });

  // Always update session record metadata (for reference)
  await this.updateSessionRecordMetadata(
    session.civicpressSessionId,
    {
      broadcastSessionStatus: newStatus,
      broadcastSessionStatusUpdatedAt: new Date().toISOString(),
      broadcastSessionId: sessionId
    }
  );
}
```

#### 2. Workflow Script (Municipality Customizable)

**File**: `data/.civic/workflows/onBroadcastSessionStatusChanged.js`

```javascript
module.exports = async ({
  broadcastSessionId,
  civicpressSessionId,
  previousStatus,
  newStatus,
  context
}) => {
  const civic = context.civic;

  // Get session record
  const session = await civic.getRecord(civicpressSessionId);
  if (!session) {
    console.warn(`Session record ${civicpressSessionId} not found`);
    return;
  }

  // Map technical status to business status
  const statusMapping = {
    'recording': 'live',      // Recording started → session is live
    'complete': 'ended',      // Recording complete → session ended
    'failed': null            // Failed → keep current status
  };

  const targetBusinessStatus = statusMapping[newStatus];

  // Only update if mapping exists and status is different
  if (targetBusinessStatus && session.status !== targetBusinessStatus) {
    // Validate transition using workflow engine
    const canTransition = await civic.canTransitionStatus(
      session.status,
      targetBusinessStatus,
      context.user?.role || 'system'
    );

    if (canTransition) {
      // Update session record status
      await civic.updateRecord(civicpressSessionId, {
        status: targetBusinessStatus,
        metadata: {
          ...session.metadata,
          broadcastSessionStatus: newStatus,
          broadcastSessionStatusUpdatedAt: new Date().toISOString()
        }
      });
    }
  }
};
```

#### 3. Status Tracking in Metadata

Store broadcast-box status in session record metadata for reference:

```json
{
  "metadata": {
    "broadcastSessionStatus": "recording",
    "broadcastSessionStatusUpdatedAt": "2025-01-30T14:00:00Z",
    "broadcastSessionId": "broadcast-session-uuid"
  }
}
```

### Status Transition Matrix

| Broadcast-Box Status | Business Status Change | Workflow Action             | Notes                               |
| -------------------- | ---------------------- | --------------------------- | ----------------------------------- |
| `pending`            | None                   | None                        | Internal state, no sync             |
| `recording`          | → `live`               | Update if not already live  | Recording started = session live    |
| `stopping`           | None                   | None                        | Internal state, no sync             |
| `encoding`           | None                   | None                        | Internal state, no sync             |
| `uploading`          | None                   | None                        | Internal state, no sync             |
| `complete`           | → `ended`              | Update if not already ended | Recording done = session ended      |
| `failed`             | None                   | Log error                   | Error doesn't change business state |

### Advanced Scenarios

#### Manual Status Override

**Situation**: Clerk manually changes session status to `ended` before recording
completes.

**Behavior**:

- Broadcast-box continues recording/uploading
- Business status remains `ended` (manual override respected)
- When broadcast-box completes, workflow checks current status
- If already `ended`, no change (respects manual override)

#### Recording Starts Before Session Scheduled

**Situation**: Recording starts but session status is still `scheduled`.

**Behavior**:

- Workflow validates transition: `scheduled` → `live`
- If valid, updates to `live`
- If invalid (workflow rules prevent), logs warning, keeps `scheduled`
- Broadcast-box status stored in metadata for reference

#### Multiple Recordings

**Situation**: Session has multiple recordings (different devices/angles).

**Behavior**:

- Each broadcast-session tracks its own status
- Business status reflects overall session state
- Workflow can use "any recording active" → `live`
- Workflow can use "all recordings complete" → `ended`

### Benefits

- ✅ **Separation of Concerns**: Technical and business status separate
- ✅ **Flexibility**: Municipalities customize via workflow scripts
- ✅ **Auditability**: All status changes logged via hooks
- ✅ **Reliability**: Workflow validates transitions
- ✅ **Respects Manual Overrides**: Clerk changes take precedence

---

## Security & Permissions

### Authentication

**Device Authentication**: Separate authentication system for devices (not
users).

- Devices authenticate via device-specific JWT token (issued during enrollment)
- Token validated on WebSocket connection by `modules/realtime` auth layer
- Token stored securely on device
- Device tokens have different lifetime and scope than user tokens

**User Authentication**: Users accessing broadcast-box APIs use standard user
authentication.

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
- Device token rotation: Tokens can be rotated/revoked

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
