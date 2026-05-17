# PiP as Video Source — Implementation Plan

**Summary:** The Broadcast Box API now treats PiP as a **virtual video source**
instead of a separate enable/disable toggle. Activate PiP by selecting
`video: "pip"` via `sources.set`; deactivate by selecting a regular camera.
Status uses `pip.configured` instead of `pip.enabled`.

---

## 1. API contract (reference)

| Area                     | Old                                          | New                                                                                                                                               |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **get_sources**          | No PiP in list                               | `sources.video` includes virtual entry `{ id: "pip", identifier: "pip", name: "Picture-in-Picture", type: "virtual" }` when device has 2+ cameras |
| **Activate PiP**         | PiP “enable” toggle + optional `sources.set` | `sources.set` with `video: "pip"` only                                                                                                            |
| **Deactivate PiP**       | PiP “disable” or set_pip with null           | `sources.set` with `video: "camera_0"` (or any non-pip camera)                                                                                    |
| **Status `sources.pip`** | `enabled: boolean`                           | `configured: boolean` (layout configured via pip.configure; not “PiP on”)                                                                         |
| **Is PiP active?**       | `pip.enabled`                                | `sources.active.video.identifier === "pip"`                                                                                                       |

`pip.configure` is unchanged: it still sets main/pip sources, position, size and
saves layout defaults.

---

## 2. Types and interfaces

### 2.1 Rename `enabled` → `configured` on PiP config

**Files:**

- **`modules/ui/app/composables/broadcast-box-types.ts`**
  - In `PiPConfiguration`:
    - Replace `enabled: boolean` with `configured: boolean`.
    - Comment: “Whether the user has run pip.configure and main/pip sources are
      set. PiP is _active_ when active video source is ‘pip’.”
- **`modules/broadcast-box/src/types/index.ts`**
  - In `PiPConfiguration` (or equivalent PiP config type): same change —
    `enabled` → `configured`, comment as above.

**Backward compatibility:** When reading status, support both
`pipPayload.enabled` and `pipPayload.configured` and map to `configured` (e.g.
`configured: pipPayload.configured ?? pipPayload.enabled ?? false`). This keeps
old devices or docs that still send `enabled` working.

---

## 3. Derive “PiP active” from active video source

**Rule:** PiP is considered **active** when
`sources.active.video.identifier === "pip"` (or equivalent). Use this everywhere
instead of `pip.enabled`.

**Places to update:**

- **`modules/ui/app/composables/useDeviceConnectionStatus.ts`**
  - Where status builds `pip` from `pipPayload`: set `configured` from
    `pipPayload.configured ?? pipPayload.enabled`; do **not** set an `enabled`
    field on the pip config.
  - Optionally add a computed or helper: “is Pip active for this device” =
    `activeSources?.video?.identifier === 'pip'`. Only add if needed for
    multiple consumers; otherwise derive at use site.
- **`modules/ui/app/components/broadcast-box/DevicePiPControl.vue`**
  - Any logic that used `currentPipConfig.enabled` to mean “PiP is on” should
    use “active video source is pip” instead, e.g.
    `connectionStatus.activeSources?.video?.identifier === 'pip'`.
- **`modules/broadcast-box/src/websocket/event-handlers.ts`**
  - Status handler that builds `pipConfig` from `payload.sources.pip`: use
    `configured: Boolean(pipPayload.configured ?? pipPayload.enabled)` and stop
    setting `enabled`. If any code there uses `pipConfig.enabled` to mean “PiP
    in use”, switch it to derive from active video source (e.g. from
    `payload.sources?.active?.video` or equivalent in the same status payload).

---

## 4. Status message parsing: `enabled` → `configured`

**Files:**

- **`modules/ui/app/composables/useDeviceConnectionStatus.ts`**
  - In the status block where `pip` is built from `payload.pip` /
    `payload.sources?.pip`:
    - Replace `enabled: pipPayload.enabled || false` with
      `configured: pipPayload.configured ?? pipPayload.enabled ?? false`.
  - Ensure `PiPConfiguration` in this file (or imported type) uses `configured`
    and that no code still expects `pip.enabled`.
- **`modules/broadcast-box/src/websocket/event-handlers.ts`**
  - Where `pipConfig` is built from `pipPayload` (status):
    - Use `configured: Boolean(pipPayload.configured ?? pipPayload.enabled)`.
    - Remove or replace usages of `pipConfig.enabled` (e.g. logging
      `pipEnabled`) with `pipConfig.configured` or “active = active video ===
      ‘pip’”.

---

## 5. Source picker: include virtual “pip” source

- **Device** (firmware): When the device has 2+ cameras, `get_sources` / status
  includes the virtual `pip` entry in `sources.video`. CivicPress does not need
  to invent it; it only needs to **not** filter it out.
- **UI:**
  - **`modules/ui/app/components/broadcast-box/DeviceSourceControl.vue`**
    - Video source list is built from `videoSourceObjects` / `videoSources`
      (from capabilities/status). Ensure no filter removes entries with
      `identifier === 'pip'` or `type === 'virtual'`. If the device sends
      `{ id: "pip", identifier: "pip", name: "Picture-in-Picture", type: "virtual" }`,
      it should appear as a normal option. No code change if we already show all
      `videoSourceObjects`; otherwise remove any exclusion of `pip` or
      `virtual`.
  - **`modules/ui/app/components/broadcast-box/DevicePiPControl.vue`**
    - Main source and PiP source dropdowns: they should use the same source list
      that comes from the device (including “pip” for main only if we ever want
      to allow it; typically “pip” is only selected as the _active_ video
      source, not as main/pip in pip.configure). So:
      - **Main source** list: real cameras only (exclude
        `identifier === 'pip'`), since main is always a physical camera.
      - **PiP source** list: real cameras only (exclude `identifier === 'pip'`),
        since pip source is the small window camera.
      - **Source Control** (DeviceSourceControl): must include “pip” so the user
        can select it as the active video source and thus “turn on” PiP.

So the only place that must include the “pip” virtual source is the **video
source picker in DeviceSourceControl**. DevicePiPControl’s main/pip dropdowns
stay camera-only. No change needed if DeviceSourceControl already shows all
entries from status; only verify and add a short comment.

---

## 6. Remove PiP enable/disable toggle and use source selection only

**File: `modules/ui/app/components/broadcast-box/DevicePiPControl.vue`**

- **Remove** the PiP “Enable/Disable” toggle (the `USwitch` bound to
  `pipEnabled` and `handlePipEnabledChange`).
- **Remove** local state and logic that mean “PiP on/off”:
  - Remove or repurpose `pipEnabled` (no longer “PiP on”; if we need a notion of
    “PiP layout is configured” for display, derive from
    `currentPipConfig.configured`).
- **Behavior:**
  - **Activate PiP:** User selects video source “pip” in **DeviceSourceControl**
    (which calls `setSources('pip', currentAudio)`). No separate “enable” in
    DevicePiPControl.
  - **Deactivate PiP:** User selects a different video source (e.g. a camera) in
    DeviceSourceControl (which calls `setSources(cameraId, currentAudio)`).
- **DevicePiPControl** should only:
  - Show **layout configuration**: main source, PiP source, position, size.
  - “Apply” = call `pip.configure` (set_pip) with main, pip source, position,
    size.
  - Optionally show a short note: “To show PiP on preview/stream, select
    ‘Picture-in-Picture’ as the video source in the Source Control section
    above.”
- **Current configuration block:** Replace “Status: Enabled/Disabled” with:
  - **Configured:** Yes/No (from `currentPipConfig.configured`).
  - **PiP in use:** Yes if
    `connectionStatus.activeSources?.video?.identifier === 'pip'`, else No (and
    optionally “Select ‘Picture-in-Picture’ in Source Control to use PiP”).
- **Disable path removal:** Remove the “Disable PiP” branch that calls
  `setPip(mainSourceValue, null, ...)`. Deactivating PiP is done only by
  switching the video source away from “pip” in DeviceSourceControl. If the UI
  previously called something to “turn off” PiP, that path is replaced by
  instructing the user to select another video source (or we could add a small
  “Use main camera” button that calls `setSources(mainCameraId, currentAudio)`
  using the current main source from pip config; optional).

---

## 7. DevicePiPControl: “Apply” and setSources

- **On Apply (pip.configure):** Keep current behavior: call
  `setPip(mainSource, pipSource, { position, size }, device)`. Do **not**
  automatically call `setSources('pip', ...)` after Apply. Let the user
  explicitly choose “pip” in Source Control when they want to use PiP.
- **Optional:** After a successful Apply, show a hint: “PiP layout saved. Select
  ‘Picture-in-Picture’ in the Source Control card to use it,” and optionally a
  one-click “Use PiP now” that calls `setSources('pip', currentAudio)`. Prefer
  leaving activation to Source Control for consistency.

(If we already have “After enabling PiP, set active video source to pip” and we
remove the enable toggle, then “Apply” only saves layout; we can add a “Use PiP
now” button that just does `setSources('pip', currentAudio)` for convenience.)

---

## 8. Backend (broadcast-box module)

- **`modules/broadcast-box/src/websocket/event-handlers.ts`**
  - Status handler: when building `pipConfig` from `payload.sources.pip`, use
    `configured` (and backward compat `enabled`) as in section 4. Do not expose
    “enabled” as the meaning “PiP is on”; that is derived from active source.
- **`modules/broadcast-box/src/websocket/command-handlers.ts`**
  - `sources.set` already accepts `video: "pip"`. Ensure validation allows
    `video === 'pip'` and that the device receives it. No change if already
    implemented.
- **Device manager / storage:** If any stored `pipConfig` or API response still
  has an `enabled` field, consider adding `configured` and deprecating
  `enabled`, or mapping on read so the UI and logic only rely on `configured`
  and active source.

---

## 9. Documentation and tests

- **`docs/broadcast-box/DEVICE-MESSAGE-PROTOCOL.md`** (or equivalent): Document
  that `sources.pip` uses `configured`; that PiP is active when
  `sources.active.video.identifier === "pip"`; and that the virtual source `pip`
  appears in `sources.video` when the device has 2+ cameras.
- **`docs/broadcast-box/DEVICE-CAPABILITIES-MESSAGES.md`**: Replace any
  “pip.enabled” or “PiP enabled” with `pip.configured` and “PiP active when
  active video is pip.”
- **`docs/broadcast-box/STATUS-PROTOCOL-TESTING-GUIDE.md`**: Update the “PiP
  disabled” / “PiP enabled” cases to use `configured` and active video source.
- **Mock device / tests:** If a mock device or integration test sends status
  with `pip.enabled`, add `pip.configured` and keep `enabled` only for backward
  compat in parsing. Tests that assert “PiP on” should assert active video
  source === “pip” (and optionally `pip.configured === true`).

---

## 10. Implementation order (checklist)

1. **Types**
   - [ ] `broadcast-box-types.ts`: PiPConfiguration `enabled` → `configured`,
         comment.
   - [ ] `modules/broadcast-box/src/types/index.ts`: same.

2. **Status parsing (enabled → configured)**
   - [ ] `useDeviceConnectionStatus.ts`: build `pip` with
         `configured: pipPayload.configured ?? pipPayload.enabled ?? false`;
         remove use of `pip.enabled` for “is PiP on” and use active video source
         where needed.
   - [ ] `event-handlers.ts`: build `pipConfig` with `configured`, stop using
         `enabled` for “PiP in use”.

3. **“PiP active” everywhere**
   - [ ] Replace all logic that used `pip.enabled` to mean “PiP is currently on”
         with `activeSources?.video?.identifier === 'pip'` (in DevicePiPControl
         and anywhere else).

4. **Source picker**
   - [ ] DeviceSourceControl: confirm video source list includes the “pip”
         virtual source when the device sends it; add comment.
   - [ ] DevicePiPControl: main/pip source lists stay camera-only (exclude “pip”
         if needed).

5. **DevicePiPControl UI**
   - [ ] Remove PiP enable/disable toggle and `handlePipEnabledChange`.
   - [ ] Remove “Disable PiP” apply path (setPip(..., null)); deactivation =
         selecting another video source in Source Control.
   - [ ] Current config: show “Configured” and “PiP in use” (from configured +
         active video === “pip”).
   - [ ] Optional: “Use PiP now” button or hint to select “pip” in Source
         Control.

6. **Backend**
   - [ ] event-handlers status pip block: use `configured`; ensure no code
         assumes `enabled` means “PiP on”.

7. **Docs and tests**
   - [ ] Update protocol/capability docs and status testing guide.
   - [ ] Mock/tests: send `configured`; assert “PiP on” via active source.

---

## 11. Quick reference

| Concept                      | How to implement                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| **PiP layout configured**    | `pip.configured` from status (with fallback `pip.enabled` for old devices).                              |
| **PiP currently in use**     | `activeSources?.video?.identifier === 'pip'`.                                                            |
| **Turn PiP on**              | User selects “Picture-in-Picture” in Source Control → `setSources('pip', currentAudio)`.                 |
| **Turn PiP off**             | User selects a camera in Source Control → `setSources(cameraId, currentAudio)`.                          |
| **Virtual source in picker** | Shown in DeviceSourceControl video dropdown when device includes it in `sources.video` (no filtering).   |
| **No separate toggle**       | DevicePiPControl has no enable/disable switch; only layout config (main, pip, position, size) and Apply. |
