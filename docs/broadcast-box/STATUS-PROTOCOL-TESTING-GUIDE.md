# Broadcast Box Status Message Protocol - Testing Guide

**Date**: 2025-01-02  
**Status**: Ready for Testing

---

## Overview

This guide provides step-by-step instructions for testing the Broadcast Box
Status Message Protocol integration. The implementation extracts and displays
active sources, PiP configuration, and network connectivity from device status
messages.

---

## Prerequisites

1. **CivicPress API Server Running**

   ```bash
   cd modules/api
   pnpm run dev
   ```

2. **CivicPress UI Running**

   ```bash
   cd modules/ui
   pnpm run dev
   ```

3. **Database Migration Applied**
   - Migration 003 runs automatically when the API server starts
   - Check server logs for: `Broadcast Box database migrations completed`
   - If migration fails, check logs for errors

4. **Broadcast Box Device Connected**
   - Device must be enrolled and connected via WebSocket
   - Device should be sending status messages (every 10 seconds by default)

---

## Testing Steps

### Step 1: Verify Database Migration

**Check if migration ran successfully:**

1. Check API server logs on startup:

   ```
   [INFO] Migration 003_add_active_sources_pip statement 1/2 executed successfully
   [INFO] Migration 003_add_active_sources_pip statement 2/2 executed successfully
   [INFO] Broadcast Box database migrations completed
   ```

2. **Verify columns exist** (optional - SQLite):

   ```bash
   sqlite3 .system-data/civic.db
   .schema broadcast_devices
   ```

   You should see:

   ```sql
   active_sources TEXT
   pip_config TEXT
   ```

**If migration failed:**

- Check for "already exists" errors (columns may already exist - this is OK)
- Check for syntax errors in migration file
- Verify database connection is working

---

### Step 2: Test Backend Status Message Processing

#### 2.1 Monitor API Server Logs

Watch for status message processing:

```bash
# In API server terminal, look for:
[INFO] Status event processed
[INFO] Device active sources updated from status
[INFO] Device PiP configuration updated from status
```

#### 2.2 Send Test Status Message (via WebSocket)

If you have a test device or mock client, send a status message:

```json
{
  "type": "status",
  "id": "test-status-123",
  "timestamp": "2025-01-02T12:00:00Z",
  "payload": {
    "device_id": "your-device-id",
    "state": "idle",
    "session_id": null,
    "health": {
      "score": 95,
      "cpu_usage": 25.5,
      "memory_usage": 45.2,
      "disk_usage": 30.1,
      "network_connected": true
    },
    "active_sources": {
      "video": {
        "id": 0,
        "identifier": "hdmi1",
        "name": "HDMI Input 1",
        "path": "/dev/video0",
        "resolution": [1920, 1080],
        "framerate": 30,
        "available": true
      },
      "audio": {
        "id": 0,
        "identifier": "hdmi1",
        "name": "HDMI Audio",
        "path": "/dev/audio0",
        "available": true
      }
    },
    "pip": {
      "enabled": true,
      "pip_source": {
        "id": 1,
        "identifier": "hdmi2",
        "name": "HDMI Input 2"
      },
      "main_source": {
        "id": 0,
        "identifier": "hdmi1",
        "name": "HDMI Input 1"
      },
      "position": "top_right",
      "size": {
        "width": 320,
        "height": 240
      }
    }
  }
}
```

**Expected Backend Behavior:**

- ✅ Status event handler processes the message
- ✅ Active sources stored in database
- ✅ PiP configuration stored in database
- ✅ Health data updated (including network_connected)
- ✅ State mapped correctly ("capturing" → "recording" if applicable)

**Check Database** (optional):

```sql
SELECT id, name, active_sources, pip_config FROM broadcast_devices WHERE device_uuid = 'your-device-uuid';
```

---

### Step 3: Test Frontend UI Display

#### 3.1 Navigate to Device Detail Page

1. Open browser: `http://localhost:3000`
2. Navigate to: Settings → Broadcast Box → [Select a Device]
3. URL should be: `/settings/broadcast-box/[device-id]`

#### 3.2 Verify Active Sources Section

**What to Look For:**

- ✅ "Active Sources" card appears (if device has active sources)
- ✅ Active video source displayed with:
  - Source identifier (e.g., "hdmi1")
  - Source name (if available)
  - Resolution and framerate (if available)
  - "Active" badge
- ✅ Active audio source displayed with:
  - Source identifier
  - Source name (if available)
  - "Active" badge
- ✅ "No active source" message if source is null

**Test Cases:**

1. **Device with active sources**: Should show both video and audio sources
2. **Device with no active sources**: Should show "No active video/audio source"
3. **Real-time updates**: Change active source on device, UI should update
   within 10 seconds

#### 3.3 Verify PiP Configuration Section

**What to Look For:**

- ✅ "Picture-in-Picture" card appears (only if PiP is enabled)
- ✅ PiP status shows "Enabled" badge
- ✅ Main source displayed with identifier and name
- ✅ PiP source displayed with identifier and name
- ✅ Position displayed (e.g., "Top Right")
- ✅ Size displayed (e.g., "320x240")

**Test Cases:**

1. **PiP enabled**: Card should be visible with all details
2. **PiP disabled**: Card should not appear
3. **Real-time updates**: Enable/disable PiP on device, UI should update

#### 3.4 Verify Network Connectivity Status

**What to Look For:**

- ✅ Network status in Device Health section
- ✅ Green "Connected" badge when network is connected
- ✅ Red "Disconnected" badge when network is disconnected
- ✅ WiFi icon (connected) or WiFi-off icon (disconnected)

**Test Cases:**

1. **Connected device**: Should show green "Connected" badge
2. **Disconnected device**: Should show red "Disconnected" badge
3. **Real-time updates**: Disconnect device network, status should update

#### 3.5 Verify Source Control Component

**What to Look For:**

- ✅ Active sources highlighted in dropdown menus
- ✅ "Active" badge next to currently active sources in dropdown
- ✅ Real-time updates when active sources change

**Test Cases:**

1. **Open video source dropdown**: Active source should have "Active" badge
2. **Open audio source dropdown**: Active source should have "Active" badge
3. **Change active source on device**: Badge should move to new source

---

### Step 4: Test Real-Time Updates

#### 4.1 Monitor WebSocket Messages

Open browser DevTools → Console, look for:

```
[DeviceConnectionStatus] Status message received for [device-uuid]: status no event/action
[DeviceConnectionStatus] Status message received for [device-uuid]: {health: {...}, state: "idle", hasActiveSources: true, hasPiP: true}
```

#### 4.2 Verify Updates Happen Automatically

1. **Change active source on device**
2. **Wait 10 seconds** (status message interval)
3. **Check UI**: Active Sources section should update automatically
4. **No page refresh needed**: Updates via WebSocket

#### 4.3 Verify Deep Comparison Works

**Test for Reactivity Issues:**

- UI should NOT scroll to top when status updates
- UI should NOT reload the page
- Only affected sections should update

**How to Test:**

1. Scroll down on device detail page
2. Wait for status message (10 seconds)
3. Verify scroll position is maintained
4. Verify no page reload

---

### Step 5: Test Edge Cases

#### 5.1 Null/Empty Values

**Test Cases:**

1. **No active video source** (`active_sources.video: null`):
   - Should show "No active video source"
   - Should not crash

2. **No active audio source** (`active_sources.audio: null`):
   - Should show "No active audio source"
   - Should not crash

3. **PiP not configured** (`pip.configured: false`):
   - PiP card may show "Configured: No"; "PiP in use: No"
   - Should not crash
   - PiP is "in use" when `sources.active.video.identifier === "pip"`

4. **Missing health data**:
   - Should use fallback values
   - Should not crash

#### 5.2 State Mapping

**Test Cases:**

1. **Device sends "capturing"**:
   - Should be mapped to "recording" in UI
   - Check state display shows "Recording"

2. **Device sends "idle"**:
   - Should display as "Idle"

3. **Device sends "encoding"**:
   - Should display as "Encoding"

#### 5.3 Device ID Verification

**Test Cases:**

1. **Status message with matching device_id**:
   - Should process normally
   - No warnings in logs

2. **Status message with mismatched device_id**:
   - Should log warning
   - Should still process (for now)
   - Check API logs for: `Status message device_id mismatch`

---

## Manual Testing Checklist

### Backend Testing

- [ ] Migration 003 runs successfully on server start
- [ ] Status messages are received and processed
- [ ] Active sources extracted and stored in database
- [ ] PiP configuration extracted and stored in database
- [ ] Network connectivity extracted from health data
- [ ] State mapping works ("capturing" → "recording")
- [ ] Device ID verification logs warnings for mismatches

### Frontend Testing

- [ ] Active Sources card appears when device has active sources
- [ ] Active video source displays correctly with all details
- [ ] Active audio source displays correctly with all details
- [ ] "No active source" message shows when source is null
- [ ] PiP Configuration card appears when PiP is enabled
- [ ] PiP details display correctly (sources, position, size)
- [ ] Network connectivity status shows in health section
- [ ] Network status updates in real-time
- [ ] Source Control highlights active sources in dropdowns
- [ ] Real-time updates work (no page refresh needed)
- [ ] Scroll position maintained during updates
- [ ] No page reloads during status updates

### Integration Testing

- [ ] Status message → Database → UI flow works end-to-end
- [ ] Real-time updates via WebSocket work correctly
- [ ] Deep comparison prevents unnecessary reactivity
- [ ] Multiple devices can be monitored simultaneously
- [ ] UI handles device disconnection gracefully

---

## Troubleshooting

### Migration Not Running

**Symptoms:**

- Columns `active_sources` and `pip_config` don't exist
- API logs show migration errors

**Solutions:**

1. Check migration file exists:
   `modules/broadcast-box/src/storage/migrations/003_add_active_sources_pip.sql`
2. Check migration runner includes migration 003
3. Manually run migration if needed:

   ```sql
   ALTER TABLE broadcast_devices ADD COLUMN active_sources TEXT;
   ALTER TABLE broadcast_devices ADD COLUMN pip_config TEXT;
   ```

### Status Messages Not Processing

**Symptoms:**

- No "Status event processed" logs
- Active sources not updating in database

**Solutions:**

1. Check WebSocket connection is established
2. Verify device is sending status messages (check device logs)
3. Check event handler is registered (check API logs on startup)
4. Verify message format matches protocol specification

### UI Not Updating

**Symptoms:**

- Active Sources section doesn't appear
- Data doesn't update in real-time

**Solutions:**

1. Check WebSocket connection in browser DevTools
2. Verify `useDeviceConnectionStatus` composable is subscribed
3. Check browser console for errors
4. Verify `connectionStatus` reactive value is updating
5. Check deep comparison isn't preventing updates

### Type Errors

**Symptoms:**

- TypeScript errors in IDE
- Build fails

**Solutions:**

1. Run `pnpm run build` to check for type errors
2. Verify all type definitions are imported correctly
3. Check `SourceInfo`, `ActiveSources`, `PiPConfiguration` types are defined

---

## Automated Testing (Future)

For automated testing, consider:

1. **Unit Tests**:
   - Test event handler extraction logic
   - Test database model serialization/deserialization
   - Test type definitions

2. **Integration Tests**:
   - Test status message → database flow
   - Test WebSocket → UI update flow
   - Test state mapping

3. **E2E Tests**:
   - Test full status message → UI display flow
   - Test real-time updates
   - Test edge cases

---

## Success Criteria

✅ **All checklist items pass**  
✅ **No console errors in browser**  
✅ **No errors in API server logs**  
✅ **Real-time updates work smoothly**  
✅ **UI displays all protocol fields correctly**  
✅ **Database stores all data correctly**

---

## Next Steps

After successful testing:

1. **Monitor Production**: Watch for any issues in real-world usage
2. **Performance**: Monitor database query performance with new columns
3. **Feedback**: Collect user feedback on UI display
4. **Enhancements**: Consider additional features based on usage

---

**Status**: Ready for Testing  
**Last Updated**: 2025-01-02
