# Complete Integration Review & RTMP Plan

**Source**: `Broadcast Box API Changes - Complete Int.md`  
**Purpose**: Verify integrated items, note doc/code alignment, and plan
integration of missing RTMP features.

---

## 1. Review: What Is Already Integrated

### 1.1 Source configuration ✓

| Doc item                                                      | Implementation                                                                                                                                           | Status       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `sources.set` command                                         | `command-handlers.ts`: handler with validation (video/audio or "pip"); `device-command-service.ts`: `setSources()`; `allowedActions` in `api/devices.ts` | ✓ Integrated |
| Response `{ video, audio, status, live_switched? }`           | Handler returns `createAck(..., { video, audio, status: 'configured' })`; device may add `live_switched`                                                 | ✓            |
| Notes (at least one required, "pip", persist, FFmpeg restart) | Validation enforces at least one; "pip" allowed for video; doc in DEVICE-MESSAGE-PROTOCOL                                                                | ✓            |

### 1.2 Preview commands ✓

| Doc item                                          | Implementation                                                                                            | Status       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------ |
| `preview.start` payload `{ quality: {...} }` only | `sanitizeCommandPayload()` strips sources; handler uses quality only; useDevicePreview sends only quality | ✓ Integrated |
| `preview.stop` payload `{}`                       | Handler and UI already use empty payload                                                                  | ✓            |

### 1.3 Recording commands ✓

| Doc item                                              | Implementation                                                                   | Status       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- | ------------ |
| `record.start` payload `{ config: { quality } }` only | Sanitize strips sources; `startManualRecording` sends only `config: { quality }` | ✓ Integrated |
| `record.stop` / `record.list`                         | Handlers and allowedActions present                                              | ✓            |

### 1.4 Session commands ✓

| Doc item                                           | Implementation                                                                                         | Status       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------ |
| `session.start` (doc) / `start_session` (protocol) | We use action `start_session`; payload only `session_id`, `civicpressSessionId`, `config: { quality }` | ✓ Integrated |
| `session.stop` (doc) / `stop_session` (protocol)   | We use `stop_session`                                                                                  | ✓            |

**Doc alignment**: The doc uses "session.start" / "session.stop"; the protocol
uses `start_session` / `stop_session`. No code change; doc is shorthand.

### 1.5 PiP commands ✓

| Doc item                                                            | Implementation                                                                                                             | Status       |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `pip.configure`                                                     | Registered as alias of `set_pip`; `allowedActions` includes `pip.configure`                                                | ✓ Integrated |
| Payload (doc: main_source, pip_source; code: mainSource, pipSource) | Handler expects `mainSource`, `pipSource`, `pipPosition`, `pipSize` (camelCase). Device can send either; we use camelCase. | ✓            |

### 1.6 Events ✓

| Doc item                                                                                 | Implementation                                                                                          | Status       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------ |
| `sources.changed`                                                                        | Event handler in `event-handlers.ts`; persists activeSources; UI `useDeviceConnectionStatus` handles it | ✓ Integrated |
| `streaming.rtmp.started` / `streaming.rtmp.stopped` / `streaming.rtmp.connection_failed` | **Not implemented**                                                                                     | ✗ Missing    |

### 1.7 Deprecated / breaking ✓

| Doc item                                       | Implementation                                                                               | Status       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------ |
| `source.switch` deprecated → use `sources.set` | API rewrites `switch_source` to `sources.set` and logs deprecation; handler logs deprecation | ✓ Integrated |
| Breaking: no sources in preview/record/session | Sanitize + session-controller + UI                                                           | ✓            |

### 1.8 Quality presets ✓

| Doc item                                   | Implementation                                                                                             | Status       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------ |
| Presets in `device.connected` capabilities | Quality types and `device.connected` / status merge already implemented (QUALITY-PRESETS-INTEGRATION-PLAN) | ✓ Integrated |
| Defaults (preview/streaming/recording)     | Stored in capabilities.quality.defaults                                                                    | ✓            |

### 1.9 Migration checklist (sources part) ✓

- sources.set on camera/mic change ✓
- No sources in preview/record/session ✓
- Replace switch_source with sources.set ✓
- sources.changed subscription ✓
- Quality from capabilities ✓

**Migration checklist (streaming part)** – not yet done:

- Add streaming UI (stream.configure, stream.start, stream.stop) ✗
- stream.configure only when user changes RTMP (persisted) ✗
- Subscribe to streaming.rtmp.\* events ✗

---

## 2. Doc/Code Alignment Notes

- **Session command names**: Doc says "session.start" / "session.stop"; protocol
  uses `start_session` / `stop_session`. Keep protocol as-is; doc is user-facing
  shorthand.
- **PiP payload**: Doc shows `main_source`, `pip_source`; our handler uses
  `mainSource`, `pipSource`. Protocol doc (DEVICE-MESSAGE-PROTOCOL) uses
  camelCase; device may send either if device firmware accepts both.
- **RTMP section**: Entire "Streaming Commands (NEW)" and related
  events/UI/migration items are **not yet in code**. Plan below.

---

## 3. Missing: RTMP Streaming Integration Plan

### 3.1 Backend – Commands

| Command              | Purpose                                                 | Implementation steps                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **stream.configure** | Set RTMP URL, stream key, platform; persisted on device | 1) Add to `allowedActions` in `api/devices.ts`. 2) Register handler in `command-handlers.ts`: validate payload (url, stream_key, platform); optional: persist to device config/DB (e.g. device stream config table or device config JSON). 3) Forward to device or return ACK with `status: 'configured'`, `platform`, `url`, `stream_key_set: true`. 4) If persistence is server-side: add `streamConfig` (or similar) to device model/DB and update in handler. |
| **stream.start**     | Start RTMP stream; optional quality                     | 1) Add to `allowedActions`. 2) Handler: accept optional `quality`; forward to device. 3) Sanitize payload to `{ quality? }` only (sources from sources.set). 4) Device returns `status: 'streaming'`, `platform`, `url`, `quality`.                                                                                                                                                                                                                               |
| **stream.stop**      | Stop RTMP stream                                        | 1) Add to `allowedActions`. 2) Handler: forward to device; ACK `status: 'stopped'`, `platform`.                                                                                                                                                                                                                                                                                                                                                                   |

**Persistence**: Doc says "Configuration is saved to database and persists
across restarts." Options: (A) Device persists and reports back (no server DB
change). (B) Server stores stream config (e.g. `device.stream_config` or new
columns) and sends to device on connect or on demand. Plan should pick one;
recommend (A) unless product needs server-side copy.

### 3.2 Backend – Events

| Event                                | Payload                            | Implementation steps                                                                                                                                   |
| ------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **streaming.rtmp.started**           | `{ platform, url }`                | Register in `event-handlers.ts`; update device/connection state (e.g. `streaming: { active: true, platform, url }`); broadcast to observers if needed. |
| **streaming.rtmp.stopped**           | `{ platform }`                     | Register handler; set `streaming: { active: false }` or clear.                                                                                         |
| **streaming.rtmp.connection_failed** | `{ platform, error, retry_count }` | Register handler; store/forward error for UI; optional: emit to observers.                                                                             |

Decide where streaming state lives: connection tracker only, or also device
record (e.g. `device.streamingStatus`).

### 3.3 API

- **allowedActions**: Add `stream.configure`, `stream.start`, `stream.stop`.
- **Device command service** (optional): Add `configureStream()`,
  `startStream()`, `stopStream()` if other callers (e.g. workflows) need them;
  otherwise UI can call generic execute with these actions.

### 3.4 UI

| Item                         | Implementation steps                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Streaming settings panel** | New component or section: RTMP URL, stream key, platform (youtube, facebook, twitch, generic). "Save" or "Apply" calls `stream.configure` only when user changes settings.              |
| **Start / Stop stream**      | Buttons that call `stream.start` (optional quality) and `stream.stop`. Quality can come from capabilities.quality.defaults.streaming or user choice.                                    |
| **Streaming status**         | Show "Streaming to YouTube" / "Stopped" / "Connection failed" using `streaming.rtmp.*` events (subscribe in `useDeviceConnectionStatus` or dedicated composable).                       |
| **useDeviceCommands**        | Add `configureStream(url, streamKey, platform)`, `startStream(quality?)`, `stopStream()` that call the same command API with actions `stream.configure`, `stream.start`, `stream.stop`. |

### 3.5 Documentation

- **DEVICE-MESSAGE-PROTOCOL.md**: Add sections for `stream.configure`,
  `stream.start`, `stream.stop` (payload, response, notes).
- **DEVICE-MESSAGE-PROTOCOL.md** (Events): Add `streaming.rtmp.started`,
  `streaming.rtmp.stopped`, `streaming.rtmp.connection_failed`.
- **Mock device** (if used): In `civicpress-module-mock-box.ts`, add handlers
  for `stream.configure`, `stream.start`, `stream.stop` and emit the three
  events when appropriate.

### 3.6 Implementation order (recommended)

1. **Backend commands**: Add `stream.configure`, `stream.start`, `stream.stop`
   to allowedActions; register handlers (forward to device; minimal validation).
2. **Backend events**: Register `streaming.rtmp.started`,
   `streaming.rtmp.stopped`, `streaming.rtmp.connection_failed`; update
   connection/device state.
3. **Persistence** (if server-side): Add stream config storage and merge into
   device config or new field; document decision.
4. **Docs**: Update DEVICE-MESSAGE-PROTOCOL with stream commands and events.
5. **UI**: Add `configureStream`, `startStream`, `stopStream` to
   useDeviceCommands; add streaming panel and status; subscribe to
   streaming.rtmp.\* in connection status or composable.
6. **Mock**: Add stream command and event handling to mock box for tests.

---

## 4. Summary

- **Already integrated**: sources.set, pip.configure, preview/record/session
  without sources, sources.changed, switch_source deprecation, quality presets.
  Aligns with the doc except for naming shorthand (session.start =
  start_session) and PiP camelCase.
- **Not integrated**: All RTMP features — stream.configure, stream.start,
  stream.stop, streaming.rtmp.\* events, streaming UI, and related migration
  checklist items. Plan in §3 covers backend, API, UI, docs, and mock.
