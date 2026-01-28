# Broadcast Box: Error Handling and Reporting — Implementation Plan

This plan aligns CivicPress (TypeScript) with the device-side error handling
spec: standardized error codes, typed errors, structured responses, error event
publishing, and error-code inference.

---

## 1. Error Codes (`modules/broadcast-box/src/types/errors.ts`)

**Current state**: `BroadcastBoxErrorCode` enum exists with a subset
(SESSION*\*, INVALID_CONFIG, SOURCE*_, PIP\__, DEVICE\_\*, etc.).
`getErrorMessage(code)` exists.

**Target**: Add the full set of codes from the spec. Use `ERR_` prefix for
consistency with the spec and programmatic handling.

| Category      | Codes to add / align                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **General**   | `ERR_UNKNOWN`, `ERR_INVALID_COMMAND`, `ERR_MISSING_PARAMETER`, `ERR_SERVICE_UNAVAILABLE`                                                                  |
| **Source**    | `ERR_SOURCE_NOT_FOUND`, `ERR_SOURCE_NOT_CONFIGURED`, `ERR_DEVICE_NOT_FOUND` (keep existing SOURCE_NOT_FOUND, DEVICE_NOT_FOUND; add NOT_CONFIGURED or map) |
| **Session**   | `ERR_SESSION_NOT_ACTIVE`, `ERR_SESSION_ALREADY_ACTIVE`, `ERR_SESSION_INVALID_STATE`                                                                       |
| **Streaming** | `ERR_STREAMING_NOT_CONFIGURED`, `ERR_STREAMING_ALREADY_ACTIVE`, `ERR_STREAMING_NOT_ACTIVE`, `ERR_STREAMING_CONNECTION_FAILED`                             |
| **Preview**   | `ERR_PREVIEW_NOT_ACTIVE`, `ERR_WEBRTC_FAILED`                                                                                                             |
| **Storage**   | `ERR_STORAGE_FULL`, `ERR_FILE_NOT_FOUND`                                                                                                                  |

**Tasks**:

- Extend `BroadcastBoxErrorCode` with all codes above. Keep existing enum values
  for backward compatibility (e.g. `SESSION_ALREADY_ACTIVE` or add
  `ERR_SESSION_ALREADY_ACTIVE` and use that in new code).
- Extend `getErrorMessage()` for every new code.
- Optionally add a type/category map (e.g.
  `getErrorCategory(code): 'source' | 'session' | 'streaming' | ...`) for UI or
  logging.

---

## 2. Typed Errors (same module or `types/errors.ts`)

**Target**: Introduce error classes that carry `code` and a structured
`toDict()` (or `toJSON()`) for API/event payloads.

**Proposed types**:

- **Base**: `BroadcastBoxBaseError` extends `Error` with:
  - `code: BroadcastBoxErrorCode`
  - `details?: Record<string, unknown>`
  - `toDict(): { code, message, type, details }` where `type` is the class name
    (e.g. `StreamingError`).

- **Concrete**:
  - `StreamingError` (code in streaming set)
  - `SourceError` (code in source set)
  - `PreviewError` (code in preview set)
  - `SessionError` (code in session set)
  - `StorageError` (code in storage set)
  - Generic fallback: `BroadcastBoxError` for general/unknown.

**Tasks**:

- Add `BroadcastBoxBaseError` and subclasses in `types/errors.ts`.
- Ensure all have `code` and `toDict()` returning
  `{ code, message, type, details }`.
- In command handlers and device-command-service, throw these typed errors (or
  wrap caught errors) so ACK and API can use `toDict()`.

---

## 3. Structured Error Responses

**Target**: Every error response (ACK and HTTP) includes:

```json
{
  "code": "ERR_STREAMING_NOT_CONFIGURED",
  "message": "RTMP not configured - use stream.configure first",
  "type": "StreamingError",
  "details": { ... }
}
```

### 3.1 ACK (device → CivicPress and CivicPress → client)

**Current**: `AckMessage` has `error?: string`, `errorCode?: string`.
`ProtocolHandler.createAck(commandId, success, error?, payload?, errorCode?)`.

**Tasks**:

- Extend `AckMessage` (in `types/index.ts`) with optional `errorType?: string`,
  `errorDetails?: Record<string, unknown>` (or a single
  `error?: StructuredError` object with `code`, `message`, `type`, `details`).
- Extend `createAck()` to accept a structured error object (or `code`,
  `message`, `type`, `details`) and set `error`, `errorCode`, `errorType`,
  `errorDetails` on the ACK.
- When command handlers throw a typed error, call
  `createAck(command.id, false, ..., error.toDict())` (or pass
  code/message/type/details).
- When device sends an ACK with `success: false`, preserve device-provided
  `code` / `message` / `details` if present and pass through in `AckMessage` and
  in API response.

### 3.2 Device command service

**Current**: On failure, `handleAckResponse` rejects with
`new Error(ack.error || 'Command failed on device')`; `executeCommand` catches
and returns `CommandResponse { success: false, error }`.

**Tasks**:

- Define `CommandResponse` to include optional `errorCode?: string`,
  `errorType?: string`, `errorDetails?: Record<string, unknown>` (or a single
  `error?: StructuredError`).
- In `handleAckResponse`, when `ack.success === false`, reject with a typed
  error (e.g. `BroadcastBoxError`) that carries `ack.errorCode`, `ack.error`
  (message), `ack.errorType`, `ack.errorDetails` (or build from ack payload).
- In `executeCommand` catch block, if the caught error is a typed Broadcast Box
  error, set `errorCode`, `errorType`, `errorDetails` on `CommandResponse`;
  otherwise set a generic `ERR_UNKNOWN` and message.

### 3.3 HTTP API (devices router)

**Current**: On command failure,
`res.status(500).json({ success: false, error: { message }, commandId, timestamp })`.

**Tasks**:

- On command failure, return `error: { code, message, type, details }` from
  `CommandResponse` (and from device ACK when available).
- Use a consistent status code rule if desired (e.g. 400 for
  validation/ERR_INVALID_COMMAND, 404 for ERR_DEVICE_NOT_FOUND, 409 for
  ERR_SESSION_ALREADY_ACTIVE, 500 for others) — optional.
- Ensure catch block for “failed to execute command” also returns a structured
  error (e.g. `ERR_SERVICE_UNAVAILABLE` or `ERR_UNKNOWN`).

---

## 4. Error Event Publishing (`command.error`)

**Target**: When a command fails (handler throws or device ACK
`success: false`), publish a `command.error` event for monitoring/audit.

**Tasks**:

- **Event payload**: At least `commandId`, `action`, `deviceId`, `code`,
  `message`, `type`, `details` (and optionally `source`, `timestamp`).
- **Where to publish**:
  - **Option A — Realtime / device room**: From the place that handles device
    ACK (e.g. realtime message handler that calls
    `deviceCommandService.handleAckResponse`). When handling a failed ACK, emit
    `command.error` to the device room or to a monitoring channel so subscribed
    clients (e.g. UI) receive it.
  - **Option B — Command service**: Inside
    `DeviceCommandService.executeCommand`, when the promise rejects (device
    error or timeout), before rethrowing, emit `command.error` via an injected
    event emitter or callback.
  - **Option C — Event handlers**: In the same path that processes device
    events, when a failed ACK is processed, register a handler that publishes
    `command.error` (e.g. persist to `device_events` with
    `eventType: 'command.error'` and optionally broadcast to WebSocket clients).
- **Persistence**: Reuse or extend existing audit in
  `logCommand(..., status: 'failed', ack, error)`: ensure stored `eventData`
  includes `code`, `type`, `details` so that `command.<action>.failed` (or a
  dedicated `command.error`) events are queryable and consistent with the
  structured format.
- **Documentation**: Add `command.error` to `DEVICE-MESSAGE-PROTOCOL.md` (or an
  “Events emitted by CivicPress” section) with payload schema.

Recommendation: Use Option C — when handling a failed ACK in the realtime/device
path, create a device event `command.error` with the structured payload and, if
the architecture allows, broadcast to observers so monitoring UIs can subscribe.

---

## 5. Error Code Inference (`_infer_error_code()`)

**Target**: Map common error messages (e.g. from device or from thrown `Error`)
to the appropriate `BroadcastBoxErrorCode` so that even non-typed errors get a
consistent `code`.

**Tasks**:

- Add `inferErrorCode(message: string): BroadcastBoxErrorCode` in
  `types/errors.ts`.
- Implement a small map or regex set: e.g. “not configured” / “stream.configure
  first” → `ERR_STREAMING_NOT_CONFIGURED`; “already active” / “already in
  progress” → `ERR_SESSION_ALREADY_ACTIVE` or `ERR_STREAMING_ALREADY_ACTIVE`;
  “not found” → `ERR_SOURCE_NOT_FOUND` or `ERR_DEVICE_NOT_FOUND`; “timeout” →
  `ERR_TIMEOUT`; “connection failed” / “connection refused” →
  `ERR_STREAMING_CONNECTION_FAILED`; etc.
- Use `inferErrorCode` when:
  - Building a structured error from a device ACK that has `message` but no
    `code`.
  - Catching a generic `Error` in command execution and converting to structured
    response (set `code = inferErrorCode(err.message)` if not already a typed
    Broadcast Box error).

---

## 6. Implementation Order and Files

| Step | Area             | Files to touch                                                                                  |
| ---- | ---------------- | ----------------------------------------------------------------------------------------------- |
| 1    | Error codes      | `types/errors.ts`                                                                               |
| 2    | Typed errors     | `types/errors.ts`                                                                               |
| 3    | inferErrorCode   | `types/errors.ts`                                                                               |
| 4    | ACK + createAck  | `types/index.ts` (AckMessage), `websocket/protocol.ts` (createAck)                              |
| 5    | Command handlers | `websocket/command-handlers.ts` — throw typed errors, use createAck with structured error       |
| 6    | Command response | `services/device-command-service.ts` — CommandResponse, handleAckResponse, executeCommand catch |
| 7    | API response     | `api/devices.ts` — return structured error on command failure and in catch                      |
| 8    | command.error    | Realtime/device message handler or event-handlers + device_events; optional broadcast           |
| 9    | Docs             | `DEVICE-MESSAGE-PROTOCOL.md` (ACK error shape, command.error event)                             |

---

## 7. Backward Compatibility

- Keep existing `BroadcastBoxErrorCode` values that are already used (or add
  aliases) so existing handlers and tests do not break.
- API clients that only read `error.message` continue to work; new clients can
  use `error.code` and `error.details` for programmatic handling.
- ACK: devices that only send `error` (string) still work; CivicPress can set
  `code` via `inferErrorCode(ack.error)` when `errorCode` is missing.

---

## 8. Testing

- Unit tests for `inferErrorCode()` (various message strings → expected codes).
- Unit tests for typed errors: `toDict()` shape and that
  `code`/`message`/`type`/`details` are correct.
- Command handler tests: assert that on validation/device errors, ACK and (if
  applicable) API response contain the expected structured error and code.
- Optional: integration test that triggers a failed command and asserts a
  `command.error` event (or `command.<action>.failed` with structured data) is
  stored or broadcast.

---

## Summary

1. **Error codes**: Extend `BroadcastBoxErrorCode` with full set (General,
   Source, Session, Streaming, Preview, Storage) and `getErrorMessage`.
2. **Typed errors**: Add `BroadcastBoxBaseError` and `StreamingError`,
   `SourceError`, `PreviewError`, etc., with `code` and `toDict()`.
3. **Structured responses**: ACK and API return
   `{ code, message, type, details }`; extend `AckMessage`, `CommandResponse`,
   and `createAck()`/service/API.
4. **command.error**: Publish when a command fails (handler or device ACK), with
   structured payload; persist and optionally broadcast.
5. **inferErrorCode**: Map common messages to codes; use when converting device
   or generic errors to structured form.

This allows CivicPress and clients to handle errors programmatically based on
the `code` field while keeping human-readable `message` and optional `details`.
