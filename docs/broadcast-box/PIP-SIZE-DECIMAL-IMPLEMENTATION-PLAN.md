# PiP Size Decimal Format – Implementation Plan

**Status**: Plan only (no code changes yet)  
**Last Updated**: 2026-01-23  
**Purpose**: Document where the new PiP size payload format lives, and what must
change in the UI and backend when size is sent as decimals instead of pixels.

---

## 1. Where is the new payload format?

**Current state:** The new “decimal” PiP size format is **not** described in the
repo yet. All existing docs and code assume pixel size:
`{ width: number, height: number }` in pixels (e.g.
`{ width: 320, height: 240 }`).

**Where it should be documented:**

1. **`docs/broadcast-box/DEVICE-MESSAGE-PROTOCOL.md`**
   - Section **“4. `set_pip` / `configure_pip`”** (around lines 232–291).
   - Today it defines `pipSize` as:
     - `pipSize` (object): `width` and `height` in **pixels** (positive
       integers).
   - This section must be updated to define the **new** size format
     (decimal/fraction) and mark the old pixel format as deprecated or removed.

2. **`docs/broadcast-box/DEVICE-CAPABILITIES-MESSAGES.md`**
   - Sections that mention PiP size:
     - `capabilities.pip.min_size` / `capabilities.pip.max_size` (lines 65–67,
       291–292).
     - `sources.pip.size` in status (lines 167, 185, 198, 211, 314).
   - If the device now reports min/max/current size in decimals, these sections
     must be updated to describe the decimal schema and semantics.

3. **Single source of truth**
   - Add a short “PiP size format” subsection that states:
     - **`pipSize`** is a **single number** (decimal), fraction of main frame,
       typically in `(0, 1]` (e.g. `0.25` = 25%).
     - Default (e.g. `0.25`).
     - How this relates to `min_size` / `max_size` in capabilities/status if
       those also use decimals.

**Conclusion:**  
The new format is defined in **section 2** of this document (from the device
request/response you provided). That content should be copied into
`DEVICE-MESSAGE-PROTOCOL.md` so it is the single source of truth. The
implementation plan below uses that format: **`pipSize` as a single number**
(e.g. `0.25`).

---

## 2. New payload format (from device)

**Request:**

```json
{
  "type": "command",
  "payload": {
    "action": "set_pip",
    "mainSource": 0,
    "pipSource": 1,
    "pipPosition": "top_right",
    "pipSize": 0.25
  },
  "id": "cmd-131",
  "timestamp": 1706630400.123
}
```

**Response:**

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

**Format summary:**

- **`pipSize`**: a **single number** (decimal), e.g. `0.25`. Represents PiP size
  as a fraction of the main frame (0.25 ≈ 25%). Range is typically `(0, 1]`
  (e.g. 0.05–1.0).
- **Not** an object `{ width, height }` in pixels. The old
  `{ width: 320, height: 240 }` format is no longer used.
- **Request**: camelCase (`pipSize`, `mainSource`, `pipSource`, `pipPosition`).
- **Response result**: snake_case (`pip_size`, `main_source`, `pip_source`,
  `pip_position`).

All changes below use **`pipSize` as a single decimal number**.

---

## 3. What needs to change – by area

### 3.1 Documentation

| File                                                   | What to change                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/broadcast-box/DEVICE-MESSAGE-PROTOCOL.md`        | In **“4. `set_pip` / `configure_pip`”**: (1) Define `pipSize` as a **single number** (decimal, e.g. 0.25 = 25% of frame); (2) Document range (e.g. 0.05–1.0), default (e.g. 0.25); (3) Note that the old `{ width, height }` pixel format is no longer used. Add the request/response example from section 2 above. |
| `docs/broadcast-box/DEVICE-CAPABILITIES-MESSAGES.md`   | If the device reports PiP size in status/capabilities: update `sources.pip.size` to a single decimal; update `min_size`/`max_size` to decimals if the device uses them.                                                                                                                                             |
| `docs/broadcast-box/PIP-CONFIGURATION-COMMAND-PLAN.md` | Align `pipSize` with single-number decimal format and validation (range, default).                                                                                                                                                                                                                                  |

### 3.2 Backend (broadcast-box module)

| File                                                      | What to change                                                                                                                                                                                                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/broadcast-box/src/websocket/command-handlers.ts` | **`setPipHandler`**: (1) Treat `pipSize` as a **single number** (not `{ width, height }`); (2) Validate as decimal in range (e.g. 0.05–1.0); (3) Default to `0.25` when omitted; (4) Pass through `pipSize` as a number to the device. Remove integer/pixel validation. |
| `modules/broadcast-box/src/types/index.ts`                | If there are types for PiP payload, change `pipSize` from `{ width, height }` to `number`.                                                                                                                                                                              |
| `modules/broadcast-box/src/websocket/event-handlers.ts`   | Where device status/events are parsed: if the device sends `pip_size` or `size` as a single decimal, parse and store it as a number.                                                                                                                                    |

### 3.3 UI – Types and composables

| File                                                      | What to change                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/ui/app/composables/broadcast-box-types.ts`       | **`PiPConfiguration.size`**: change from `{ width: number, height: number }` to **`number`** (single decimal, e.g. 0.25). Update JSDoc.                                                                                                                                                                                                       |
| `modules/ui/app/composables/useDeviceCommands.ts`         | **`SetPipOptions`**: change `size` from `{ width, height }` to **`size?: number`** (single decimal). When building the `set_pip` payload, send `pipSize: options.size` (number). Remove `pipSize: options.size` object form.                                                                                                                  |
| `modules/ui/app/composables/useDeviceConnectionStatus.ts` | Where `pip.size` is read from status/events: if the device sends `pip_size` or `size` as a number, store it as `number`. Update any code that expects `size.width`/`size.height`. For capabilities, if the device sends `min_size`/`max_size` as decimals, use them as numbers; otherwise document and handle legacy pixel min/max if needed. |

### 3.4 UI – Device PiP control component

| File                                                           | What to change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `modules/ui/app/components/broadcast-box/DevicePiPControl.vue` | **Size input and display:** (1) **Form state:** Replace `sizeWidth` / `sizeHeight` with a single **`pipSizeValue`** (number, e.g. 0.25). (2) **Input control:** One input or slider for PiP size (decimal 0.05–1.0), e.g. step 0.05 or 0.01. Optionally show as percentage (25% for 0.25). (3) **Labels/UX:** Use “PiP size” or “Scale” and show as percentage (e.g. “25%”). (4) **Defaults:** Use `0.25` when unset. (5) **Validation:** Enforce range (e.g. 0.05–1.0); remove pixel/width/height checks. (6) **Apply:** Call `setPip(…, { size: pipSizeValue })` with a single number; `useDeviceCommands.setPip` must accept `options.size` as `number` and send `pipSize: options.size`. (7) **“Current configuration” display:** Show `currentPipConfig.size` as percentage (e.g. “25%”) when it is a number. |
| `modules/ui/app/components/broadcast-box/DevicePiPControl.vue` | **Capabilities:** If the device sends `min_size`/`max_size` as decimals (e.g. 0.1, 1.0), use them for the size input min/max. If capabilities still use pixel objects, either ignore for size or document a mapping; the command payload always sends a single `pipSize` number.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### 3.5 UI – Device detail page (read-only PiP display)

| File                                                         | What to change                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/ui/app/pages/settings/broadcast-box/[id]/index.vue` | Where PiP size is shown (e.g. “Size: 320×240”): treat `connectionStatus.pip?.size` or `device?.pip?.size` as a **number** and display as percentage (e.g. “25%”), not as pixel dimensions. Remove any `size.width`/`size.height` usage. |

### 3.6 i18n and copy

| File                              | What to change                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `modules/ui/i18n/locales/en.json` | If you add labels like “PiP scale” or “Fraction of frame”, add keys (e.g. under `broadcastBox`) and use them in the PiP control. |
| `modules/ui/i18n/locales/fr.json` | Same keys as in English, with French translations.                                                                               |

---

## 4. Data flow summary

- **Outbound (UI → device):**  
  `DevicePiPControl` → `useDeviceCommands.setPip(…, { size: 0.25 })` → `set_pip`
  payload with `pipSize: 0.25`.  
  **Change:** `size` is a single number (e.g. 0.25); payload uses
  `pipSize: number`.

- **Inbound (device → UI):**  
  Status/events → `useDeviceConnectionStatus` → `connectionStatus.pip.size`
  (number).  
  **Change:** `pip.size` is a single number; display as percentage (e.g. “25%”).

- **Backend:**  
  Command handler receives `pipSize` (number), validates range (e.g. 0.05–1.0),
  forwards to device.  
  **Change:** No `{ width, height }`; validate and pass through a single
  decimal.

---

## 5. Implementation order (recommended)

1. **Document the new format**
   - In `DEVICE-MESSAGE-PROTOCOL.md`: document `pipSize` as a single number
     (e.g. 0.25), request/response example, range, default.
   - In `DEVICE-CAPABILITIES-MESSAGES.md` if the device reports size/min/max as
     decimals.

2. **Backend**
   - Update `command-handlers.ts`: treat `pipSize` as number, validate range
     (e.g. 0.05–1.0), default 0.25, remove width/height validation.
   - Update types and event-handlers if they reference PiP size.

3. **Types and composables**
   - `PiPConfiguration.size`: type `number`.
   - `SetPipOptions.size`: type `number`.
   - `useDeviceCommands.setPip`: send `pipSize: options.size` (number).
   - `useDeviceConnectionStatus`: parse and store `pip.size` as number.

4. **DevicePiPControl**
   - Single size input (decimal 0.05–1.0), e.g. slider or number input; show as
     percentage.
   - Call `setPip(…, { size: pipSizeValue })` with one number.
   - Display current size as percentage.
   - Update labels/i18n (“PiP size”, “Scale”, “25%”).

5. **Device detail page**
   - Show PiP size as percentage when `pip.size` is a number.

6. **Sanity checks**
   - Send `set_pip` with `pipSize: 0.25`; confirm device and UI show 25%.

---

## 6. Open questions (if any remain)

1. **Range**
   - Confirm allowed range for `pipSize` (e.g. `0.05`–`1.0`). Use this for
     validation and slider/input min/max.

2. **Capabilities**
   - If the device reports `min_size`/`max_size` in status/capabilities, are
     they now single decimals too? Use them for the UI size input bounds if
     available.

3. **Status**
   - Confirm that `sources.pip.size` (or equivalent) in status is a single
     number. If the device still sends an object occasionally, document whether
     the UI must support both during a transition.

4. **Default**
   - Use `0.25` as default when `pipSize` is omitted, unless the device spec
     says otherwise.

The request/response in section 2 is the source of truth for the new format;
implement to match it and update DEVICE-MESSAGE-PROTOCOL accordingly.
