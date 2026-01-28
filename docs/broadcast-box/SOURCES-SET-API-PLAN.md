# Sources Set API Plan

**Status**: Plan only (no code changes yet)  
**Last Updated**: 2026-01-28  
**Purpose**: Implement centralized source configuration via `sources.set`,
breaking changes to `preview.start` / `record.start` / `session.start`,
deprecation of `switch_source`, new event `sources.changed`, and recommended UI
flow.

---

## 1. Overview

We've refactored how video/audio sources are configured. Instead of passing
sources with each command, sources are now configured once via `sources.set` and
automatically used by all subsequent commands (preview, record, session). If
`sources.set` is called while capturing, FFmpeg automatically restarts with the
new sources.

---

## 2. Summary of Changes

| Area                        | Change                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New command**             | `sources.set` – primary way to set active video/audio. Payload `{ video?: string, audio?: string }` (at least one required). `video` can be device identifier or `"pip"`. Response: `{ video, audio, status: "configured", live_switched?: boolean }`. Sources persist across sessions. If called while capturing, FFmpeg restarts (`live_switched: true`). |
| **New alias**               | `pip.configure` – same as existing `set_pip`; both names must work.                                                                                                                                                                                                                                                                                         |
| **Breaking**                | **preview.start** – no longer accepts `video_source`/`audio_source`; payload only `{ quality: {...} }`.                                                                                                                                                                                                                                                     |
| **Breaking**                | **record.start** – no longer accepts `video_source`/`audio_source` in config; only `{ config: { quality } }`.                                                                                                                                                                                                                                               |
| **Breaking**                | **session.start** – no longer accepts `video_source`/`audio_source` in config; only `{ session_id, config: { quality } }`.                                                                                                                                                                                                                                  |
| **Deprecated**              | **switch_source** (device may call it `source.switch`) – use `sources.set` instead. Old command still works but logs deprecation and delegates to `sources.set`.                                                                                                                                                                                            |
| **New event**               | `sources.changed` – emitted when sources are updated via `sources.set`; payload `{ video, audio }`.                                                                                                                                                                                                                                                         |
| **Quality in capabilities** | Already done; `device.connected` includes `capabilities.quality` (presets + defaults).                                                                                                                                                                                                                                                                      |
| **UI flow**                 | See Recommended UI Flow and Migration Checklist below.                                                                                                                                                                                                                                                                                                      |

---

## 3. Command and Response Format (reference)

**sources.set command** (CivicPress → device):

```json
{
  "type": "command",
  "command": "sources.set",
  "payload": {
    "video": "razer_kiyo_pro",
    "audio": "razer_kiyo_pro"
  }
}
```

- `video`: device identifier or `"pip"` (use configured PiP layout).
- `audio`: device identifier.
- At least one of `video` or `audio` must be provided.

**sources.set response** (device → CivicPress):

```json
{
  "video": "razer_kiyo_pro",
  "audio": "razer_kiyo_pro",
  "status": "configured",
  "live_switched": true
}
```

- `live_switched`: `true` if FFmpeg was restarted because capture was active;
  otherwise omit or `false`.
- Sources persist across sessions. If called while capturing, FFmpeg
  automatically restarts with new sources.

---

## 4. Backend Implementation

### 4.1 Command: `sources.set`

**File**: `modules/broadcast-box/src/websocket/command-handlers.ts`

- Register handler for action `sources.set`.
- **Payload**: `{ video?: string, audio?: string }` – at least one of `video` or
  `audio` required.
- **Validation**:
  - `video` can be a source identifier from device capabilities (e.g. `"hdmi1"`,
    `"razer_kiyo_pro"`) or the literal `"pip"` (use PiP composite as video
    source).
  - `audio` must be a valid audio source identifier from capabilities.
  - If only one of `video`/`audio` is sent, only that source is updated; the
    other remains unchanged (or use current device source if first time).
- **Behaviour**: Forward to device; persist active sources (e.g. in device
  config or status) so they survive sessions. Device may return
  `live_switched: true` when FFmpeg was restarted.
- **Response**: Forward device response:
  `{ video, audio, status: "configured", live_switched?: boolean }`.
- **Errors**: `INVALID_PAYLOAD` (missing both), `SOURCE_NOT_FOUND`,
  `SOURCE_NOT_AVAILABLE`, `DEVICE_NOT_FOUND`.

**File**: `modules/broadcast-box/src/services/device-command-service.ts`

- Add `setSources(deviceId, { video?, audio? })`: build command payload, send to
  device via existing command path, optionally update stored device
  config/status with new active sources.

**File**: `modules/broadcast-box/src/api/devices.ts`

- Add `sources.set` to `allowedActions` (around line 877).

### 4.2 Alias: `pip.configure`

**File**: `modules/broadcast-box/src/websocket/command-handlers.ts`

- Register `pip.configure` as an alias that invokes the same handler as
  `set_pip` (same pattern as existing `configure_pip`).

**File**: `modules/broadcast-box/src/api/devices.ts`

- Add `pip.configure` to `allowedActions` if not already present (keep `set_pip`
  and `configure_pip` as well).

### 4.3 Breaking: `preview.start` payload

**File**: `modules/broadcast-box/src/websocket/command-handlers.ts`

- In `preview.start` handler: remove support for `video_source`/`audio_source`
  in payload. Accept only `{ quality: { width, height, framerate, ... } }`. Do
  not forward source fields to the device.

**UI**: Remove `video_source`/`audio_source` from all `preview.start` payloads;
call `sources.set` when user changes camera/mic before or during preview.

### 4.4 Breaking: `record.start` payload

**File**: `modules/broadcast-box/src/websocket/command-handlers.ts`

- In `record.start` handler: accept only `payload.config.quality` (and any other
  non-source config). Do not forward `video_source` or `audio_source` to the
  device.
- Optional: validate that at least one of video/audio source is already set on
  the device (from previous `sources.set` or device default) and return a clear
  error if not.

### 4.5 Breaking: `session.start` payload

**File**: `modules/broadcast-box/src/websocket/command-handlers.ts`

- In `session.start` (or `start_session`) handler: accept only `session_id` /
  `sessionId` and `config.quality` in payload. Do not forward `video_source` or
  `audio_source` in config to the device.

**UI / API**: Remove `video_source`/`audio_source` from all `session.start`
payloads; sources are taken from current `sources.set` state.

### 4.6 Deprecated: `switch_source` (device may use `source.switch`)

**File**: `modules/broadcast-box/src/websocket/command-handlers.ts`

- Keep `switch_source` handler but have it delegate to `sources.set` (map
  `videoSource`/`audioSource` or `sourceType`+value to `video`/`audio`). Log a
  deprecation warning when used.
- Document: clients should use `sources.set` instead. Example:
  `{"command": "source.switch", "payload": {"videoSource": "camera_0"}}` → use
  `{"command": "sources.set", "payload": {"video": "camera_0"}}`.

### 4.7 Event: `sources.changed`

**File**: `modules/broadcast-box/src/websocket/event-handlers.ts`

- Register handler for event `sources.changed`.
- **Message format** (device → CivicPress):
  `{ "type": "event", "event": "sources.changed", "payload": { "video": "...", "audio": "..." } }`.
- **Behaviour**: Update stored device state (e.g. `activeSources` or equivalent
  in DB/cache) so API and UI can reflect current sources; broadcast to relevant
  clients if needed.

**Persistence**: Store active sources (from ACK of `sources.set` and/or from
`sources.changed` events) in device record so they persist across sessions and
are available after reconnect.

---

## 5. API Layer

- **allowedActions** (`modules/broadcast-box/src/api/devices.ts`): Include
  `sources.set` and `pip.configure`.
- **Device command service**
  (`modules/broadcast-box/src/services/device-command-service.ts`): Implement
  `setSources` and use it from the `sources.set` command handler.

---

## 6. UI Implementation

### 6.1 Composables

**File**: `modules/ui/app/composables/useDeviceCommands.ts`

- Add `setSources(video?: string, audio?: string)`: call
  `sendCommand('sources.set', { video, audio })` with at least one argument.
  Optionally update local device state from ACK (including `live_switched` if
  present).
- Change `startManualRecording`: remove `video_source`/`audio_source` from the
  payload. Send only `record.start { config: { quality } }`. Callers must ensure
  `sources.set` has been called beforehand when they want specific sources.

### 6.2 Device settings / source control

**File**: `modules/ui/app/components/broadcast-box/DeviceSourceControl.vue` (or
equivalent)

- When user changes video or audio selection, call `setSources(video, audio)`
  (only when selection actually changes). Optionally keep `switch_source` for
  backward compatibility during transition, but prefer `sources.set` as the
  primary path.
- Subscribe to or reflect `sources.changed` so UI shows current active sources
  (e.g. from connection status or real-time events).

### 6.3 PiP flow

**File**: `modules/ui/app/components/broadcast-box/DevicePiPControl.vue`

- Enable PiP: call `pip.configure` (or `setPip`) with main/pip sources and
  options; then call `sources.set({ video: "pip", audio })` so recording/preview
  use the PiP composite as video source.
- Ensure `pip.configure` and `sources.set` are both exposed and used in this
  order where applicable.

### 6.4 Manual recording

**File**: `modules/ui/app/composables/useManualRecording.ts`

- Do not pass `videoSource`/`audioSource` into `startManualRecording` (or pass
  only for optional pre-check in UI). Before starting recording, rely on
  already-configured sources via `sources.set` (e.g. from device settings). Call
  `record.start({ config: { quality } })` only.

### 6.5 Preview start

**File**: `modules/ui/app/composables/useDevicePreview.ts`

- Remove `video_source`/`audio_source` from `preview.start` payload (around line
  1237). Send only `{ quality: { width, height, framerate, ... } }`. Sources are
  taken from current `sources.set` state.

### 6.6 Scheduled sessions

**File**: `modules/broadcast-box/src/services/session-controller.ts` (backend)

- When sending `start_session` to the device, remove
  `video_source`/`audio_source` from `config`. Send only
  `{ sessionId, civicpressSessionId, config: { quality } }`. Sources are taken
  from current device `sources.set` state.

---

## 7. Documentation

**File**: `docs/broadcast-box/DEVICE-MESSAGE-PROTOCOL.md`

- **Commands**:
  - Add section for `sources.set`: payload `{ video?, audio? }`, at least one
    required; `video` may be `"pip"`; response
    `{ video, audio, status: "configured", live_switched?: boolean }`; sources
    persist; FFmpeg restarts if called while capturing.
  - Add `pip.configure` to the PiP section as an alias of `set_pip` (both names
    valid).
  - Update `preview.start`: payload only `{ quality: {...} }`; no
    `video_source`/`audio_source`.
  - Update `record.start`: payload only `{ config: { quality } }`; no source
    fields.
  - Update `session.start` / `start_session`: payload only
    `{ session_id, config: { quality } }`; no source fields in config.
  - Document deprecation of `switch_source` / `source.switch`: use `sources.set`
    instead; old command delegates and logs deprecation.
- **Events**:
  - Add `sources.changed`: payload `{ video, audio }`; emitted when sources are
    updated via `sources.set`.

---

## 8. Tests (optional)

- **Backend**: Unit tests for `sources.set` handler (validation, success,
  errors) and for `sources.changed` handler (state update).
- **UI**: Integration or unit tests for `setSources` and for recording flow that
  uses `sources.set` + `record.start` without sources in payload.

---

## 9. Recommended UI Flow

1. Device connects → receive device list from `device.connected` event.
2. User opens settings → show camera/mic dropdowns.
3. User selects camera/mic → call `sources.set { video: "...", audio: "..." }`.
4. User enables PiP → call `pip.configure {...}`, then
   `sources.set { video: "pip", audio: "..." }`.
5. User clicks Preview → call `preview.start { quality: {...} }` (no sources in
   payload).
6. User changes camera mid-stream → call `sources.set { video: "new_camera" }`
   (FFmpeg automatically restarts).
7. User clicks Record → call `record.start { config: { quality: "high" } }`.
8. Scheduled session → call
   `session.start { session_id: "...", config: { quality: "standard" } }`.

---

## 10. Migration Checklist

- Update UI to call `sources.set` when user changes camera/mic selection.
- Remove `video_source`/`audio_source` from `preview.start` payloads.
- Remove `video_source`/`audio_source` from `record.start` payloads.
- Remove `video_source`/`audio_source` from `session.start` payloads.
- Replace `switch_source` (or `source.switch`) calls with `sources.set`.
- Subscribe to `sources.changed` event if tracking active sources.
- Update quality preset UI to use values from `capabilities.quality` (already
  done).

---

## 11. Implementation Order

1. Backend: Add `setSources` in device-command-service; register `sources.set`
   handler and `pip.configure` alias; add both to `allowedActions`.
2. Backend: Implement `sources.changed` event handler and persistence of active
   sources.
3. Backend: Restrict `preview.start` payload to `quality` only (strip/ignore
   source fields).
4. Backend: Restrict `record.start` payload to `config.quality` only
   (strip/ignore source fields).
5. Backend: Restrict `session.start` payload to `session_id` and
   `config.quality` only (strip/ignore source fields in config).
6. Backend: Make `switch_source` delegate to `sources.set` and log deprecation
   warning.
7. Docs: Update DEVICE-MESSAGE-PROTOCOL.md (sources.set, live_switched, breaking
   changes, deprecation, sources.changed).
8. UI: Add `setSources` in useDeviceCommands; remove sources from
   `preview.start` (useDevicePreview.ts), `startManualRecording` (record.start),
   and from `start_session` payload in session-controller.ts.
9. UI: DeviceSourceControl – use `sources.set` on selection change; replace
   `switch_source` with `sources.set`; optionally listen to `sources.changed`.
10. UI: DevicePiPControl – ensure flow uses `pip.configure` then
    `sources.set { video: "pip", ... }`.
11. UI: useManualRecording – stop passing sources into `startManualRecording`;
    rely on prior `sources.set`.
12. Optional: tests.
