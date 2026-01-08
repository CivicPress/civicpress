# PiP Configuration Command Integration Plan

## Overview

This document outlines the plan for integrating Picture-in-Picture (PiP)
configuration commands into CivicPress. The device expects `set_pip` or
`configure_pip` commands with source identifiers that need to be converted to
numeric IDs.

## Command Specification

### Device Command Format

**Action**: `set_pip` or `configure_pip` (we'll use `set_pip` for consistency)

**Payload Structure**:

```typescript
{
  mainSource: string;              // Required: Main video source identifier (e.g., "hdmi1", "hdmi2")
  pipSource: string | null;        // Optional: PiP source identifier, null to disable
  pipPosition?: string;            // Optional: "top_left" | "top_right" | "bottom_left" | "bottom_right" | "center"
  pipSize?: {                      // Optional: PiP window size
    width: number;
    height: number;
  }
}
```

**Defaults**:

- `pipPosition`: `"top_right"`
- `pipSize`: `{ width: 320, height: 240 }`

## Implementation Plan

### Phase 1: Backend Command Handler

#### 1.1 Command Handler Registration

**File**: `modules/broadcast-box/src/websocket/command-handlers.ts`

**Tasks**:

- Register `set_pip` command handler (and optionally `configure_pip` as alias)
- Follow the same pattern as `switch_source` handler
- Validate required fields (`mainSource`)
- Validate optional fields (`pipSource`, `pipPosition`, `pipSize`)

**Validation Requirements**:

- `mainSource` must be provided and valid video source
- `pipSource` must be valid video source if not null
- `pipPosition` must be one of: `"top_left"`, `"top_right"`, `"bottom_left"`,
  `"bottom_right"`, `"center"`
- `pipSize.width` and `pipSize.height` must be positive numbers if provided
- Both sources must exist in device capabilities
- Both sources must be available (if `available` field exists)

**Source ID Conversion**:

- Similar to `switch_source`, need to convert string identifiers to numeric IDs
- Use existing source lookup logic from `switch_source` handler
- Support both protocol format (numeric IDs) and current format (string
  identifiers)

**Error Handling**:

- `DEVICE_NOT_FOUND` - Device doesn't exist
- `SOURCE_NOT_FOUND` - Source identifier not found in capabilities
- `SOURCE_NOT_AVAILABLE` - Source exists but not available
- `INVALID_CONFIG` - Invalid position or size values
- `PIP_NOT_SUPPORTED` - Device doesn't support PiP (check
  `capabilities.pipSupported`)

#### 1.2 Command Payload Processing

**Logic Flow**:

1. Extract `mainSource`, `pipSource`, `pipPosition`, `pipSize` from payload
2. Get device from database to validate capabilities
3. Check if device supports PiP (`capabilities.pipSupported`)
4. Validate `mainSource` exists and is available
5. If `pipSource` is not null:
   - Validate `pipSource` exists and is available
   - Ensure `pipSource` is different from `mainSource`
6. Apply defaults for `pipPosition` and `pipSize` if not provided
7. Validate `pipPosition` is valid enum value
8. Validate `pipSize` dimensions are positive numbers
9. Convert source identifiers to numeric IDs
10. Return success ack with configured values

**Source ID Conversion Strategy**:

- If payload contains numeric IDs directly, use them
- If payload contains string identifiers, look up in:
  1. `device.capabilities.videoSourceObjects` (by identifier or name)
  2. Fallback to active sources if available
  3. Use identifier extraction logic (e.g., "HDMI Capture Device 2" → "hdmi2")

### Phase 2: Frontend Composable

#### 2.1 Add `setPip` Function

**File**: `modules/ui/app/composables/useDeviceCommands.ts`

**Function Signature**:

```typescript
const setPip = async (
  mainSource: string | number,
  pipSource?: string | number | null,
  options?: {
    position?: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center';
    size?: { width: number; height: number };
  },
  device?: BroadcastDevice
): Promise<CommandResponse>
```

**Implementation Details**:

- Convert source identifiers to numeric IDs (reuse logic from `switchSource`)
- Build payload with defaults applied
- Call `sendCommand('set_pip', payload)`
- Handle success/error responses
- Show toast notifications

**Source ID Conversion**:

- Reuse the `findSourceId` helper from `switchSource`
- Handle both string identifiers and numeric IDs
- Support device parameter for source object lookup

#### 2.2 Type Definitions

**File**: `modules/ui/app/composables/useDeviceCommands.ts`

**Add Interface**:

```typescript
export interface SetPipOptions {
  position?: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center';
  size?: {
    width: number;
    height: number;
  };
}
```

### Phase 3: UI Components

#### 3.1 PiP Configuration Form Component

**File**: `modules/ui/app/components/broadcast-box/DevicePiPControl.vue` (new)

**Features**:

- Main source selector (dropdown of available video sources)
- PiP source selector (dropdown with "None" option to disable)
- Position selector (dropdown with 5 options)
- Size inputs (width and height number inputs)
- Enable/Disable toggle
- "Apply Configuration" button
- Real-time display of current PiP config (read-only section)
- Validation and error handling

**UI Layout**:

```
┌─────────────────────────────────────┐
│ PiP Configuration                   │
├─────────────────────────────────────┤
│ [Enable PiP] Toggle                │
│                                     │
│ Main Source: [Dropdown ▼]          │
│ PiP Source:  [Dropdown ▼]          │
│ Position:    [Dropdown ▼]          │
│ Size:        [Width] x [Height]    │
│                                     │
│ [Apply Configuration] Button        │
│                                     │
│ Current Configuration (read-only)   │
│ ────────────────────────────────   │
│ Status: Enabled                     │
│ Main: hdmi1                         │
│ PiP:  hdmi2                         │
│ Position: top_right                 │
│ Size: 320x240                       │
└─────────────────────────────────────┘
```

**State Management**:

- Form state (selected sources, position, size)
- Loading state during command execution
- Error state for validation/API errors
- Current config from `connectionStatus.pip` or `device.pip`

**Validation**:

- Main source is required
- PiP source must be different from main source (if enabled)
- Size dimensions must be positive numbers
- Position must be valid enum value

#### 3.2 Integration with Device Detail Page

**File**: `modules/ui/app/pages/settings/broadcast-box/[id]/index.vue`

**Changes**:

- Replace or enhance existing PiP Configuration display section
- Add `DevicePiPControl` component below the read-only display
- Show control component when device is connected
- Hide or disable when device is offline

**Layout**:

- Keep existing read-only display section
- Add new control section below it
- Use conditional rendering based on device connection status

### Phase 4: Translation Keys

#### 4.1 Add Missing Translation Keys

**Files**:

- `modules/ui/i18n/locales/en.json`
- `modules/ui/i18n/locales/fr.json`

**Keys to Add**:

```json
{
  "broadcastBox": {
    "pipControl": "PiP Control",
    "pipMainSource": "Main Source",
    "pipSource": "PiP Source",
    "pipPosition": "Position",
    "pipSize": "Size",
    "pipWidth": "Width",
    "pipHeight": "Height",
    "pipDisable": "Disable PiP",
    "pipEnable": "Enable PiP",
    "pipApply": "Apply Configuration",
    "pipNone": "None (Disable PiP)",
    "pipPositionTopLeft": "Top Left",
    "pipPositionTopRight": "Top Right",
    "pipPositionBottomLeft": "Bottom Left",
    "pipPositionBottomRight": "Bottom Right",
    "pipPositionCenter": "Center",
    "pipValidationMainSourceRequired": "Main source is required",
    "pipValidationPipSourceDifferent": "PiP source must be different from main source",
    "pipValidationSizeRequired": "Size dimensions are required",
    "pipValidationSizePositive": "Size dimensions must be positive numbers",
    "pipSuccess": "PiP configuration updated",
    "pipError": "Failed to update PiP configuration"
  }
}
```

### Phase 5: Error Handling & Edge Cases

#### 5.1 Error Scenarios

- Device not connected → Show error, disable controls
- Source not found → Show validation error, highlight field
- Source not available → Show warning, allow but warn user
- PiP not supported → Hide controls or show "not supported" message
- Command timeout → Show timeout error, allow retry
- Invalid configuration → Show validation errors inline

#### 5.2 Edge Cases

- **Disabling PiP**: When `pipSource` is set to `null`, only send `mainSource`
  and `pipSource: null`
- **Same source**: Prevent selecting same source for main and PiP
- **Device capabilities**: Check `pipSupported` before showing controls
- **Source availability**: Warn if selected source is not available
- **Default values**: Apply defaults when user doesn't specify position/size

### Phase 6: Testing Considerations

#### 6.1 Backend Tests

**File**: `modules/broadcast-box/src/__tests__/command-handlers.test.ts`

**Test Cases**:

- Valid PiP configuration with all fields
- Valid PiP configuration with defaults
- Disable PiP (pipSource: null)
- Invalid main source
- Invalid pip source
- Same source for main and PiP
- Invalid position value
- Invalid size values
- Device doesn't support PiP
- Source not available

#### 6.2 Frontend Tests

**File**: `modules/ui/app/components/broadcast-box/DevicePiPControl.test.ts`
(new)

**Test Cases**:

- Component renders correctly
- Form validation works
- Source ID conversion works
- Command execution works
- Error handling works
- Loading states work
- Disable PiP functionality

## Implementation Checklist

### Backend

- [ ] Add `set_pip` command handler in `command-handlers.ts`
- [ ] Implement source validation logic
- [ ] Implement source ID conversion (reuse from `switch_source`)
- [ ] Add default value application
- [ ] Add error handling for all scenarios
- [ ] Register handler in command registry
- [ ] Add unit tests for command handler

### Frontend Composable

- [ ] Add `setPip` function to `useDeviceCommands.ts`
- [ ] Implement source ID conversion (reuse from `switchSource`)
- [ ] Add payload building with defaults
- [ ] Add error handling
- [ ] Add toast notifications

### UI Components

- [ ] Create `DevicePiPControl.vue` component
- [ ] Add form fields (main source, pip source, position, size)
- [ ] Add validation logic
- [ ] Add loading/error states
- [ ] Add current config display
- [ ] Integrate with device detail page
- [ ] Add conditional rendering based on device state

### Translations

- [ ] Add English translation keys
- [ ] Add French translation keys

### Testing

- [ ] Write backend unit tests
- [ ] Write frontend component tests
- [ ] Manual testing with real device
- [ ] Test all error scenarios
- [ ] Test edge cases

## Dependencies

### Existing Code Reuse

- Source ID conversion logic from `switch_source` handler
- Source ID conversion logic from `switchSource` composable
- Command execution infrastructure
- Device capabilities validation
- Error handling patterns

### New Dependencies

- None (all functionality can use existing patterns)

## Success Criteria

1. ✅ User can configure PiP from UI
2. ✅ Source identifiers are correctly converted to numeric IDs
3. ✅ Default values are applied when not specified
4. ✅ Validation prevents invalid configurations
5. ✅ Error messages are clear and actionable
6. ✅ UI updates reflect current PiP state
7. ✅ Disabling PiP works correctly
8. ✅ All edge cases are handled gracefully

## Notes

- The device expects string identifiers in the command payload, but we should
  convert them to numeric IDs for consistency with `switch_source`
- Default values should be applied on the backend to ensure consistency
- The UI should show current PiP config from both WebSocket updates and database
  state
- Consider adding a "Reset to Defaults" button for convenience
- Consider adding presets for common PiP configurations (small, medium, large)
