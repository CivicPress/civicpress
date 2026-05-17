# CivicPress Broadcast Box Module - API Reference

**Status**: Complete API Specification  
**Version**: 1.0.0  
**Target**: CivicPress `modules/broadcast-box`  
**Last Updated**: 2025-01-30

---

## Base URL

```
/api/v1/broadcast-box
```

All endpoints require authentication via JWT token in
`Authorization: Bearer <token>` header.

---

## Device Management Endpoints

### `GET /api/v1/broadcast-box/devices`

List all devices for the authenticated user's organization.

**Query Parameters**:

- `status` (optional): Filter by status (`enrolled`, `active`, `suspended`,
  `revoked`)
- `room` (optional): Filter by room location
- `limit` (optional): Pagination limit (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response** (200 OK):

```json
{
  "devices": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "organizationId": "org-uuid",
      "deviceUuid": "box-device-uuid",
      "name": "Council Chamber Recorder",
      "roomLocation": "Council Chamber",
      "status": "active",
      "capabilities": {
        "videoSources": ["hdmi1", "hdmi2", "usb_camera"],
        "audioSources": ["usb_audio", "hdmi_audio"],
        "pipSupported": true,
        "maxResolution": "1920x1080"
      },
      "config": {
        "defaultVideoSource": "hdmi1",
        "defaultAudioSource": "usb_audio",
        "qualityPreset": "standard"
      },
      "connected": true,
      "lastSeenAt": "2025-01-30T14:00:00Z",
      "createdAt": "2025-01-15T10:00:00Z",
      "updatedAt": "2025-01-30T14:00:00Z"
    }
  ],
  "pagination": {
    "total": 2,
    "limit": 50,
    "offset": 0
  }
}
```

**Permissions**: `broadcast_box.devices.view`

---

### `GET /api/v1/broadcast-box/devices/:id`

Get detailed information about a specific device.

**Response** (200 OK):

```json
{
  "device": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "organizationId": "org-uuid",
    "deviceUuid": "box-device-uuid",
    "name": "Council Chamber Recorder",
    "roomLocation": "Council Chamber",
    "status": "active",
    "capabilities": { ... },
    "config": { ... },
    "lastSeenAt": "2025-01-30T14:00:00Z",
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-30T14:00:00Z"
  },
  "connection": {
    "connected": true,
    "endpoint": "cloud",
    "lastHeartbeat": "2025-01-30T14:00:10Z",
    "state": {
      "status": "idle",
      "activeSessionId": null,
      "health": {
        "score": 95,
        "status": "healthy",
        "metrics": {
          "memoryPercent": 45,
          "cpuPercent": 30,
          "diskPercent": 60
        }
      }
    }
  },
  "recentSessions": [
    {
      "id": "session-uuid",
      "civicpressSessionId": "civicpress-session-uuid",
      "status": "complete",
      "startedAt": "2025-01-29T14:00:00Z",
      "completedAt": "2025-01-29T15:30:00Z"
    }
  ]
}
```

**Errors**:

- `404 Not Found`: Device not found
- `403 Forbidden`: Not authorized to view this device

**Permissions**: `broadcast_box.devices.view`

---

### `POST /api/v1/broadcast-box/devices`

Register a new device (enrollment).

**Request Body**:

```json
{
  "deviceUuid": "box-device-uuid-from-qr",
  "enrollmentCode": "enrollment-code-from-qr",
  "name": "Council Chamber Recorder",
  "roomLocation": "Council Chamber"
}
```

**Response** (201 Created):

```json
{
  "device": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "deviceUuid": "box-device-uuid",
    "name": "Council Chamber Recorder",
    "status": "enrolled",
    ...
  },
  "credentials": {
    "token": "device-auth-jwt-token",
    "expiresAt": "2026-01-30T14:00:00Z"
  }
}
```

**Errors**:

- `400 Bad Request`: Invalid enrollment code or device UUID
- `409 Conflict`: Device already enrolled
- `403 Forbidden`: Not authorized to enroll devices

**Permissions**: `broadcast_box.devices.manage`

---

### `PATCH /api/v1/broadcast-box/devices/:id`

Update device configuration.

**Request Body**:

```json
{
  "name": "Updated Device Name",
  "roomLocation": "New Room Location",
  "config": {
    "defaultVideoSource": "hdmi2",
    "defaultAudioSource": "hdmi_audio",
    "qualityPreset": "high",
    "autoStart": false
  }
}
```

**Response** (200 OK):

```json
{
  "device": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Updated Device Name",
    "roomLocation": "New Room Location",
    "config": { ... },
    "updatedAt": "2025-01-30T14:05:00Z"
  }
}
```

**Errors**:

- `404 Not Found`: Device not found
- `400 Bad Request`: Invalid configuration
- `403 Forbidden`: Not authorized to update this device

**Permissions**: `broadcast_box.devices.manage`

---

### `DELETE /api/v1/broadcast-box/devices/:id`

Revoke a device (soft delete).

**Response** (200 OK):

```json
{
  "device": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "revoked",
    "updatedAt": "2025-01-30T14:10:00Z"
  }
}
```

**Errors**:

- `404 Not Found`: Device not found
- `403 Forbidden`: Not authorized to revoke this device
- `409 Conflict`: Device has active session

**Permissions**: `broadcast_box.devices.manage`

---

## Session Control Endpoints

### `POST /api/v1/broadcast-box/sessions`

Start a recording session.

**Request Body**:

```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "civicpressSessionId": "civicpress-session-uuid",
  "config": {
    "videoSource": "hdmi1",
    "audioSource": "usb_audio",
    "quality": "standard",
    "pip": {
      "enabled": true,
      "main": "hdmi1",
      "pip": "hdmi2",
      "position": "bottom-right"
    }
  }
}
```

**Response** (201 Created):

```json
{
  "session": {
    "id": "broadcast-session-uuid",
    "deviceId": "550e8400-e29b-41d4-a716-446655440000",
    "civicpressSessionId": "civicpress-session-uuid",
    "status": "recording",
    "startedAt": "2025-01-30T14:00:00Z",
    "metadata": {
      "videoSource": "hdmi1",
      "audioSource": "usb_audio",
      "quality": "standard",
      "pip": { ... }
    },
    "createdAt": "2025-01-30T14:00:00Z"
  }
}
```

**Errors**:

- `400 Bad Request`: Invalid configuration or missing required fields
- `404 Not Found`: Device not found
- `409 Conflict`: Device already has active session
- `503 Service Unavailable`: Device not connected
- `403 Forbidden`: Not authorized to control this device

**Permissions**: `broadcast_box.sessions.control`

---

### `POST /api/v1/broadcast-box/sessions/:id/stop`

Stop a recording session.

**Response** (200 OK):

```json
{
  "session": {
    "id": "broadcast-session-uuid",
    "status": "stopping",
    "stoppedAt": "2025-01-30T14:30:00Z",
    "updatedAt": "2025-01-30T14:30:00Z"
  }
}
```

**Errors**:

- `404 Not Found`: Session not found
- `409 Conflict`: Session already stopped
- `403 Forbidden`: Not authorized to control this session

**Permissions**: `broadcast_box.sessions.control`

---

### `GET /api/v1/broadcast-box/sessions/:id`

Get session status and details.

**Response** (200 OK):

```json
{
  "session": {
    "id": "broadcast-session-uuid",
    "deviceId": "550e8400-e29b-41d4-a716-446655440000",
    "civicpressSessionId": "civicpress-session-uuid",
    "status": "uploading",
    "startedAt": "2025-01-30T14:00:00Z",
    "stoppedAt": "2025-01-30T14:30:00Z",
    "metadata": { ... },
    "createdAt": "2025-01-30T14:00:00Z",
    "updatedAt": "2025-01-30T14:35:00Z"
  },
  "upload": {
    "id": "upload-uuid",
    "status": "uploading",
    "progressPercent": 45,
    "fileSize": 1000000000,
    "bytesUploaded": 450000000,
    "estimatedSecondsRemaining": 60
  }
}
```

**Errors**:

- `404 Not Found`: Session not found
- `403 Forbidden`: Not authorized to view this session

**Permissions**: `broadcast_box.sessions.view`

---

### `GET /api/v1/broadcast-box/sessions`

List sessions with filters.

**Query Parameters**:

- `deviceId` (optional): Filter by device ID
- `civicpressSessionId` (optional): Filter by CivicPress session ID
- `status` (optional): Filter by status
- `limit` (optional): Pagination limit (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response** (200 OK):

```json
{
  "sessions": [
    {
      "id": "broadcast-session-uuid",
      "deviceId": "550e8400-e29b-41d4-a716-446655440000",
      "civicpressSessionId": "civicpress-session-uuid",
      "status": "complete",
      "startedAt": "2025-01-30T14:00:00Z",
      "completedAt": "2025-01-30T14:35:00Z"
    }
  ],
  "pagination": {
    "total": 10,
    "limit": 50,
    "offset": 0
  }
}
```

**Permissions**: `broadcast_box.sessions.view`

---

## Upload Management Endpoints

### `GET /api/v1/broadcast-box/uploads/:id`

Get upload status.

**Response** (200 OK):

```json
{
  "upload": {
    "id": "upload-uuid",
    "sessionId": "broadcast-session-uuid",
    "deviceId": "550e8400-e29b-41d4-a716-446655440000",
    "fileName": "session-uuid.mp4",
    "fileSize": 1000000000,
    "fileHash": "sha256:abc123...",
    "mimeType": "video/mp4",
    "status": "uploading",
    "progressPercent": 45,
    "storageLocation": null,
    "startedAt": "2025-01-30T14:35:00Z",
    "createdAt": "2025-01-30T14:35:00Z",
    "updatedAt": "2025-01-30T14:40:00Z"
  }
}
```

**Errors**:

- `404 Not Found`: Upload not found
- `403 Forbidden`: Not authorized to view this upload

**Permissions**: `broadcast_box.uploads.view`

---

### `GET /api/v1/broadcast-box/uploads`

List uploads with filters.

**Query Parameters**:

- `sessionId` (optional): Filter by session ID
- `deviceId` (optional): Filter by device ID
- `status` (optional): Filter by status
- `limit` (optional): Pagination limit
- `offset` (optional): Pagination offset

**Response** (200 OK):

```json
{
  "uploads": [ ... ],
  "pagination": { ... }
}
```

**Permissions**: `broadcast_box.uploads.view`

---

### `POST /api/v1/broadcast-box/uploads`

Initiate file upload (chunked/resumable).

**Request Body**:

```json
{
  "sessionId": "broadcast-session-uuid",
  "fileName": "session-uuid.mp4",
  "fileSize": 1000000000,
  "fileHash": "sha256:abc123...",
  "mimeType": "video/mp4"
}
```

**Response** (201 Created):

```json
{
  "upload": {
    "id": "upload-uuid",
    "status": "pending",
    "uploadUrl": "/api/v1/broadcast-box/uploads/upload-uuid/chunks"
  }
}
```

**Errors**:

- `400 Bad Request`: Invalid request
- `404 Not Found`: Session not found
- `409 Conflict`: Upload already exists

**Permissions**: `broadcast_box.uploads.create`

---

### `POST /api/v1/broadcast-box/uploads/:id/chunks`

Upload file chunk (multipart/form-data).

**Request**:

- `chunk`: File chunk (binary)
- `chunkNumber`: Chunk sequence number
- `totalChunks`: Total number of chunks

**Response** (200 OK):

```json
{
  "chunk": {
    "chunkNumber": 1,
    "totalChunks": 10,
    "received": true
  }
}
```

**Errors**:

- `400 Bad Request`: Invalid chunk
- `404 Not Found`: Upload not found
- `409 Conflict`: Chunk already received

---

## Health & Status Endpoints

### `GET /api/v1/broadcast-box/devices/:id/health`

Get device health metrics.

**Response** (200 OK):

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
    "endpoint": "cloud",
    "lastHeartbeat": "2025-01-30T14:00:10Z"
  },
  "lastUpdated": "2025-01-30T14:00:10Z"
}
```

**Errors**:

- `404 Not Found`: Device not found
- `503 Service Unavailable`: Device not connected

**Permissions**: `broadcast_box.devices.view`

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { ... }
  }
}
```

**HTTP Status Codes**:

- `400 Bad Request`: Invalid request
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Not authorized
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Service unavailable

---

## Rate Limiting

- **Default**: 100 requests per minute per user
- **Upload endpoints**: 10 requests per minute per user
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Pagination

All list endpoints support pagination:

**Query Parameters**:

- `limit`: Number of items per page (default: 50, max: 100)
- `offset`: Number of items to skip (default: 0)

**Response Format**:

```json
{
  "items": [ ... ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## Filtering & Sorting

**Filtering**: Use query parameters (e.g.,
`?status=active&room=Council Chamber`)

**Sorting**: Use `sort` parameter (e.g., `?sort=createdAt:desc`)

**Supported Sort Fields**:

- `createdAt`
- `updatedAt`
- `lastSeenAt`
- `name`

---

**Last Updated**: 2025-01-30
