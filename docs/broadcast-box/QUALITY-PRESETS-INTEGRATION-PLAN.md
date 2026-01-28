# Quality Presets Integration Plan

**Status**: Plan only (no code changes yet)  
**Last Updated**: 2026-01-28  
**Purpose**: Store device quality presets and defaults from `device.connected`
in the database and expose them for the UI (dropdown options and pre-selection
per output type).

---

## 1. Incoming Message Shape

The device sends `device.connected` with `payload.capabilities.quality`:

```json
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
    { "name": "high", ... },
    { "name": "ultra", ... }
  ],
  "defaults": {
    "preview": "low",
    "streaming": "standard",
    "recording": "high"
  }
}
```

- **`presets`**: Array of preset definitions (name, bitrates, resolution
  `[width, height]`, framerate). Preset names are device-defined (e.g. `low`,
  `standard`, `high`, `ultra`).
- **`defaults`**: Preset names to use when no config is set, per output type:
  `preview`, `streaming`, `recording`.

**UI usage**: Use `quality.presets` to populate quality dropdown options; use
`quality.defaults` to know which preset to pre-select for each output type (e.g.
`defaults.recording` for the recording quality control).

---

## 2. Current Codebase Summary

### 2.1 Storage

- **Table**: `broadcast_devices` (see
  `modules/broadcast-box/src/storage/migrations/001_initial_schema.sql`).
- **Column**: `capabilities` (TEXT, JSON). All capability data is stored in this
  single JSON column; no separate column for quality.
- **Model**: `modules/broadcast-box/src/models/device.ts` – `DeviceModel`
  reads/writes `capabilities` as a JSON string; no dedicated field for quality.
- **Conclusion**: Quality presets and defaults should be stored **inside** the
  existing `capabilities` JSON. No new DB column or migration required.

### 2.2 Backend Types

- **File**: `modules/broadcast-box/src/types/index.ts`.
- **`DeviceCapabilities`**: Currently has `videoSources`, `audioSources`,
  `pipSupported`, `pipCapabilities`, `audioMixingCapabilities`,
  `hardwareEncodingCapabilities`, `maxResolution`, `encodingPresets?`,
  `hardwareEncoding?`.
- **`EncodingPreset`**: Existing type with `name: 'low' | 'standard' | 'high'`,
  `videoBitrate`, `audioBitrate`, `resolution: string`, `framerate`. Device
  sends `resolution` as `[number, number]` and arbitrary preset names (e.g.
  `ultra`), so the device format does not match this type.
- **Conclusion**: Introduce new types for the **device** quality format
  (presets + defaults) and add a single optional field on `DeviceCapabilities`
  (e.g. `quality?: QualityCapabilities`). Keep or refactor `EncodingPreset`
  separately if still used elsewhere.

### 2.3 device.connected Handling

- **File**: `modules/broadcast-box/src/websocket/event-handlers.ts`.
- **Handler**: `device.connected` (around lines 97–244).
- **Flow**: Reads `event.payload.capabilities` (or `eventData.capabilities` in
  nested format), merges into `updatedCapabilities`:
  - `pip` → `pipCapabilities` + `pipSupported`
  - `audio_mixing` → `audioMixingCapabilities`
  - `hardware_encoding` → `hardwareEncodingCapabilities`
- Then, if capabilities changed, calls
  `context.deviceManager.updateDevice(context.deviceId, { capabilities: updatedCapabilities })`.
- **Conclusion**: Add a block that reads `capabilities.quality`, normalizes it
  (presets array + defaults object), assigns to `updatedCapabilities.quality`
  (or `qualityCapabilities`), and persists via the same `updateDevice` path. No
  new persistence layer.

### 2.4 Status Message Capabilities Merge

- **File**: Same `event-handlers.ts`; status handler (around 1103–1360) merges
  `payload.capabilities` (video/audio sources, pip, hardware_encoding,
  audio_mixing) into `updatedCapabilities` and updates the device.
- **Conclusion**: If status messages can ever include `quality`, add the same
  quality normalization and merge in the status branch so
  `device.capabilities.quality` stays in sync. If only `device.connected`
  carries quality, then only the `device.connected` handler needs to be updated.

### 2.5 UI – Device List / Detail and Config

- **Device data**: Devices are loaded via API; each device has `capabilities`
  (and optional `pipConfig`, `activeSources`, etc.). So once backend stores
  `capabilities.quality`, the API already returns it.
- **Config control**:
  `modules/ui/app/components/broadcast-box/DeviceConfigControl.vue` – quality
  dropdown is **hardcoded** to `[low, standard, high]` and bound to
  `device.config.qualityPreset`; it does not read from capabilities.
- **Conclusion**: Update the config UI to derive dropdown options from
  `device.capabilities?.quality?.presets` and, when
  `device.config.qualityPreset` is unset, pre-select using
  `device.capabilities?.quality?.defaults?.recording` (or a single “default” if
  we don’t distinguish preview/streaming/recording in the config control yet).

### 2.6 UI – Real-Time Connection Status

- **File**: `modules/ui/app/composables/useDeviceConnectionStatus.ts`.
- **device.connected handling**: When `message.type === 'event'` and
  `message.event === 'device.connected'`, it extracts capabilities from
  `message.payload.capabilities` (pip, audio_mixing, hardware_encoding, sources)
  and merges into `statusUpdate.capabilities`, then updates in-memory device
  status.
- **Conclusion**: Extract `payload.capabilities.quality` the same way (normalize
  presets + defaults) and set `statusUpdate.capabilities.quality` so that
  real-time connection status also exposes quality for the UI without waiting
  for a full device refetch.

### 2.7 update_config and Session/Recording

- **update_config**: Command handler forwards `payload.config` to the device
  (ACK with config). Config already includes `qualityPreset` from the UI. No
  change required for “store quality in DB”; optional follow-up: validate that
  `qualityPreset` is one of the device’s preset names.
- **Session/recording**: Session controller and workflows use `quality` from
  request/session metadata. Resolving a preset name to concrete params (bitrate,
  resolution, framerate) from `device.capabilities.quality.presets` can be a
  later enhancement; out of scope for this plan.

---

## 3. Type Design (Backend)

- **QualityPreset** (device format):
  - `name: string`
  - `video_bitrate_kbps: number`
  - `audio_bitrate_kbps: number`
  - `resolution: [number, number]`
  - `framerate: number`
- **QualityDefaults**:
  - `preview?: string` // preset name
  - `streaming?: string`
  - `recording?: string`
- **QualityCapabilities**:
  - `presets: QualityPreset[]`
  - `defaults?: QualityDefaults`
- **DeviceCapabilities**: Add optional `quality?: QualityCapabilities` (or
  `qualityCapabilities` for consistency with pip/audio/hardware naming). Prefer
  one name and use it consistently in backend and UI.

Normalization in handlers: ensure `presets` is an array of objects with the
expected shape; drop invalid entries if needed; ensure `defaults` is an object
with only string values. Store snake_case from device as-is or normalize to
camelCase in one place and use camelCase in types (recommended: normalize to
camelCase in backend types and DB JSON for consistency with existing
capabilities).

---

## 4. Implementation Checklist (No Code – Plan Only)

### 4.1 Backend – Types

| Item                                       | Action                                                                                                                                                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/broadcast-box/src/types/index.ts` | Add `QualityPreset`, `QualityDefaults`, `QualityCapabilities`. Add `quality?: QualityCapabilities` to `DeviceCapabilities`. Decide camelCase in JSON (e.g. `videoBitrateKbps`, `audioBitrateKbps`) vs snake_case; document in protocol. |

### 4.2 Backend – device.connected Handler

| Item                                                    | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/broadcast-box/src/websocket/event-handlers.ts` | In `device.connected`, after existing capability merges (pip, audio_mixing, hardware_encoding), read `(capabilities as any).quality`. If present and valid: normalize `presets` (array of { name, video_bitrate_kbps, audio_bitrate_kbps, resolution, framerate }) and `defaults` ({ preview?, streaming?, recording? }); set `updatedCapabilities.quality` (or chosen name). Ensure this runs before `deviceManager.updateDevice` so updated capabilities include quality. |

### 4.3 Backend – Status Handler (Optional)

| Item                     | Action                                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same file, status branch | If status payload can include `capabilities.quality`, add the same normalization and merge into `updatedCapabilities.quality` so DB and real-time state stay aligned. If not, skip. |

### 4.4 Database / Migrations

| Item       | Action                                                                     |
| ---------- | -------------------------------------------------------------------------- |
| Migrations | No new column. Quality lives inside `broadcast_devices.capabilities` JSON. |

### 4.5 API

| Item                 | Action                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Device API responses | No change. Device responses already return `capabilities`; once backend sets `capabilities.quality`, it will be included automatically. |

### 4.6 UI – Types

| Item                                                                | Action                                                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `modules/ui/app/composables/broadcast-box-types.ts` (or equivalent) | Add types for quality presets and defaults (or re-export from a shared types module if backend types are shared). Ensure `BroadcastDevice.capabilities` can include `quality`. |

### 4.7 UI – DeviceConfigControl (Quality Dropdown)

| Item                                                              | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/ui/app/components/broadcast-box/DeviceConfigControl.vue` | Derive `qualityPresets` from `device.capabilities?.quality?.presets`: map to `{ label, value }` (e.g. label: preset name or humanized; value: preset name). Fallback to current hardcoded [low, standard, high] when `quality.presets` is missing. Pre-select: when `device.config.qualityPreset` is unset, use `device.capabilities?.quality?.defaults?.recording` (or a single default) for the initial selected value. Keep sending `qualityPreset` in `updateConfig` as today. |

### 4.8 UI – useDeviceConnectionStatus

| Item                                                      | Action                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/ui/app/composables/useDeviceConnectionStatus.ts` | In the `device.connected` branch where capabilities are extracted from `payload.capabilities`, add extraction of `quality` (same shape as backend: presets + defaults), normalize if needed, and set `capabilitiesUpdate.quality` so that real-time status exposes quality without refetch. |

### 4.9 Documentation

| Item                                                 | Action                                                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/broadcast-box/DEVICE-MESSAGE-PROTOCOL.md`      | In the `device.connected` section, document `payload.capabilities.quality` (structure: `presets` array, `defaults` object). Add example snippet. |
| `docs/broadcast-box/DEVICE-CAPABILITIES-MESSAGES.md` | If this file describes capability shapes, add a subsection for `capabilities.quality` (presets + defaults).                                      |

### 4.10 Tests

| Item                                                         | Action                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/broadcast-box/src/__tests__/event-handlers.test.ts` | In the existing `device.connected` test (or a new one), send `payload.capabilities.quality` with presets and defaults; assert that `deviceManager.updateDevice` is called with `capabilities` containing the normalized quality (or assert stored device has `capabilities.quality` if the test reads from DB/model). |
| Optional                                                     | Unit tests for normalization (e.g. malformed quality ignored, valid quality stored).                                                                                                                                                                                                                                  |

---

## 5. Data Flow Summary

1. **Device** sends `device.connected` with `payload.capabilities.quality`
   (presets + defaults).
2. **Backend** event handler normalizes and merges into
   `device.capabilities.quality`, then saves via `deviceManager.updateDevice`
   (same `capabilities` JSON column).
3. **API** continues to return `device.capabilities`; clients receive `quality`
   when present.
4. **UI** (DeviceConfigControl) uses `device.capabilities.quality.presets` for
   dropdown options and `device.capabilities.quality.defaults` for pre-selection
   when config has no quality preset.
5. **Real-time UI**: useDeviceConnectionStatus merges `quality` from
   `device.connected` into connection status capabilities so new connections
   show quality without a separate device fetch.

---

## 6. Edge Cases and Decisions

- **Missing `quality`**: Device may not send `quality`. UI falls back to current
  hardcoded presets; backend leaves `capabilities.quality` undefined.
- **Empty `presets`**: If `quality.presets` is `[]`, UI can fall back to
  hardcoded list or show a single “Default” option; document preferred behavior.
- **Preset name in config vs device**: User’s `config.qualityPreset` might be a
  name that no longer exists in device’s `quality.presets` after reconnect (e.g.
  device firmware changed). Optional: validate on apply or show warning in UI
  when selected preset is not in the device list.
- **Naming**: Use `quality` vs `qualityCapabilities` consistently (recommend
  `quality` for brevity; align with existing `pip` vs `pipCapabilities` pattern
  if desired).
- **Casing**: Prefer normalizing to camelCase in backend types and stored JSON
  (`videoBitrateKbps`, `audioBitrateKbps`, etc.) for consistency with other
  capabilities; document in protocol so device and UI agree.

---

## 7. Out of Scope for This Plan

- Changing `update_config` or session start to validate preset names or resolve
  preset names to bitrate/resolution/framerate.
- Adding separate quality settings per output type (preview vs streaming vs
  recording) in the config API or UI; the plan only stores device defaults and
  uses them for pre-selection.
- New database columns or migrations; quality is part of the existing
  capabilities JSON.
