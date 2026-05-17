# Preview WebRTC Debugging Guide

**Purpose**: Step-by-step guide to debug WebRTC preview connection issues.

**Last Updated**: 2026-01-08

---

## Quick Checklist

When the ICE connection fails, verify each step:

- [ ] Browser is sending `preview.answer` message
- [ ] Browser is sending `preview.ice_candidate` messages
- [ ] Realtime server is forwarding messages to device
- [ ] Device is receiving `preview.answer` message
- [ ] Device is receiving `preview.ice_candidate` messages
- [ ] Device is processing answer (calling `setRemoteDescription`)
- [ ] Device is processing ICE candidates (calling `addIceCandidate`)
- [ ] Network connectivity (NAT/firewall not blocking UDP)

---

## Step 1: Check Browser Console Logs

Open browser DevTools Console and look for these logs:

### Expected Logs (in order)

1. **Offer Received**:

   ```
   [DevicePreview] Received preview.offer message
   [DevicePreview] Extracted SDP from preview.offer
   ```

2. **Answer Created**:

   ```
   [DevicePreview] Remote description set successfully
   [DevicePreview] Creating answer...
   [DevicePreview] Answer created successfully
   [DevicePreview] Sending preview.answer to device
   [DevicePreview] preview.answer sent successfully
   ```

3. **ICE Candidates Sent**:

   ```
   [DevicePreview] Local ICE candidate generated
   [DevicePreview] Sending ICE candidate to device
   [DevicePreview] ICE candidate sent successfully
   ```

4. **ICE Candidates Received**:

   ```
   [DevicePreview] Received preview.ice_candidate
   [DevicePreview] ICE candidate added successfully
   ```

5. **Connection State**:

   ```
   [DevicePreview] ICE connection state changed
   [DevicePreview] Connection state changed
   ```

### What to Check

- ✅ **If you see "Sending preview.answer"**: Browser is sending the answer
- ✅ **If you see "Local ICE candidate generated"**: Browser is generating
  candidates
- ✅ **If you see "Sending ICE candidate"**: Browser is sending candidates
- ❌ **If you DON'T see these**: Check WebSocket connection status

---

## Step 2: Check Device Logs

In the device logs, look for:

### Expected Logs (in order)

1. **Answer Received**:

   ```
   Message received: preview.answer
   ```

2. **Answer Processed**:

   ```
   Setting remote description (answer)
   Remote description set successfully
   ```

3. **ICE Candidates Received**:

   ```
   Message received: preview.ice_candidate
   Adding ICE candidate...
   ICE candidate added successfully
   ```

4. **ICE Connection State**:

   ```
   ICE connection state: checking
   ICE connection state: connected
   ```

### What to Check

- ✅ **If device receives `preview.answer`**: Realtime server is forwarding
  correctly
- ✅ **If device calls `setRemoteDescription(answer)`**: Device is processing
  answer
- ✅ **If device receives `preview.ice_candidate`**: Realtime server is
  forwarding candidates
- ✅ **If device calls `addIceCandidate()`**: Device is processing candidates
- ❌ **If device doesn't receive messages**: Check realtime server logs

---

## Step 3: Check Realtime Server Logs

In the realtime server logs, look for:

### Expected Logs

1. **Answer Forwarded**:

   ```
   Preview answer forwarded to device (from observer)
   ```

2. **ICE Candidate Forwarded**:

   ```
   Preview ICE candidate forwarded to device (from observer)
   ```

### What to Check

- ✅ **If you see "forwarded to device"**: Server is routing correctly
- ❌ **If you DON'T see these**: Observer message handler may not be working
- ❌ **If you see errors**: Check room state and participant list

---

## Step 4: Verify Message Flow

### Complete Message Flow

```
Browser → Realtime Server → Device
   ↓            ↓              ↓
1. preview.answer
2. preview.ice_candidate (multiple)
```

### Debugging Each Step

1. **Browser → Realtime Server**:
   - Check browser console for "Sending preview.answer"
   - Check browser Network tab → WS → Messages sent
   - Verify WebSocket connection is OPEN

2. **Realtime Server → Device**:
   - Check realtime server logs for "forwarded to device"
   - Verify device is in room participants
   - Verify `clientToDevice.has(participant.id)` is true

3. **Device Processing**:
   - Check device logs for message receipt
   - Check device logs for WebRTC API calls
   - Verify device is calling `setRemoteDescription` and `addIceCandidate`

---

## Step 5: Network Debugging

If all messages are exchanged but ICE still fails:

### Check Network Connectivity

1. **Same Network**:
   - Are browser and device on the same network?
   - If not, you may need TURN servers

2. **Firewall/NAT**:
   - Is UDP traffic blocked?
   - Check firewall rules
   - Check router NAT settings

3. **STUN/TURN Servers**:
   - Are STUN servers configured? (should be default)
   - Do you need TURN servers? (for NAT traversal)

### Test with WebRTC Internals

1. Open Chrome DevTools
2. Go to `chrome://webrtc-internals/`
3. Start preview
4. Check:
   - **ICE Connection State**: Should go from `new` → `checking` → `connected`
   - **ICE Candidates**: Should show candidates from both sides
   - **Stats**: Check packet loss, RTT, etc.

---

## Common Issues and Solutions

### Issue 0: Localhost/Emulator on Same Machine

**Symptoms**:

- Device is an emulator running on the same computer as the browser
- SDP shows `127.0.0.1` or `localhost` in the origin line
- ICE connection fails even though all messages are exchanged
- Browser and device are on the same network (same machine)

**Root Cause**: When the device and browser are on the same machine:

1. Device may generate ICE candidates with `127.0.0.1` which some browsers
   reject
2. WebRTC may have issues with loopback addresses in certain configurations
3. Network interface binding might conflict

**Solutions**:

1. **Use actual network IP instead of localhost**:
   - Device should use the machine's actual IP (e.g., `192.168.1.100`) instead
     of `127.0.0.1`
   - Check device SDP - if it shows `o=- ... IN IP4 127.0.0.1`, that's the
     problem
   - Device should bind to `0.0.0.0` or the actual network interface IP

2. **Check ICE candidates**:
   - Device should generate host candidates with the actual network IP
   - Not `127.0.0.1` or `localhost`
   - Example: `candidate:1 1 UDP 2130706431 192.168.1.100 54321 typ host`

3. **Browser WebRTC settings**:
   - Some browsers restrict localhost WebRTC
   - Try accessing via `http://localhost` instead of `http://127.0.0.1`
   - Or use the actual network IP: `http://192.168.1.100:3000`

4. **Test with actual device**:
   - If possible, test with a real device on the network
   - This eliminates localhost/loopback issues entirely

**Quick Fix for Testing**:

- If device is Python-based, check how it's creating the RTCPeerConnection
- Ensure it's not binding to `127.0.0.1` specifically
- Use `0.0.0.0` or get the actual network interface IP

### Issue 1: Device Not Receiving Answer

**Symptoms**:

- Browser sends answer, but device doesn't receive it
- Device logs show no `preview.answer` message

**Solutions**:

1. Check realtime server logs for forwarding errors
2. Verify device is in room participants
3. Verify `clientToDevice` mapping is correct
4. Check WebSocket connection state (device must be connected)

### Issue 2: Device Not Processing Answer

**Symptoms**:

- Device receives answer, but doesn't call `setRemoteDescription`
- Device logs show message received but no WebRTC API calls

**Solutions**:

1. Check device code - ensure it handles `preview.answer` messages
2. Verify device calls `setRemoteDescription(answer)` after receiving message
3. Check for errors in device WebRTC implementation

### Issue 3: ICE Candidates Not Exchanged

**Symptoms**:

- Browser generates candidates but device doesn't receive them
- Or device generates candidates but browser doesn't receive them

**Solutions**:

1. Check realtime server is forwarding `preview.ice_candidate` messages
2. Verify bidirectional routing (device → client AND client → device)
3. Check both sides are calling `addIceCandidate()` for received candidates

### Issue 4: NAT/Firewall Blocking

**Symptoms**:

- All messages exchanged correctly
- ICE connection state stays at `checking` or goes to `failed`
- WebRTC internals shows candidates but no connection

**Solutions**:

1. Configure TURN servers for NAT traversal (see TURN Server Configuration
   below)
2. Check firewall allows UDP traffic
3. Test on same network first (eliminates NAT issues)
4. Use `chrome://webrtc-internals/` to see candidate pairs being tested

---

## Testing Checklist

Use this checklist when testing:

### Pre-Test Setup

- [ ] Realtime server is running
- [ ] Device is connected to realtime server
- [ ] Browser is connected to realtime server (as observer)
- [ ] Both are in the same device room

### During Test

- [ ] Browser console shows offer received
- [ ] Browser console shows answer sent
- [ ] Browser console shows ICE candidates sent
- [ ] Realtime server logs show messages forwarded
- [ ] Device logs show answer received
- [ ] Device logs show ICE candidates received
- [ ] Device logs show WebRTC API calls (`setRemoteDescription`,
      `addIceCandidate`)

### Post-Test

- [ ] Check WebRTC internals for connection state
- [ ] Verify video stream is received (if connection succeeds)
- [ ] Check for any errors in all logs

---

## Debugging Commands

### Check Realtime Server State

```bash
# Check if device is connected
# Look for "Device connected" logs

# Check room participants
# Look for "Room participants" in logs
```

### Check Browser WebSocket

```javascript
// In browser console
// Check WebSocket connection
const ws = /* your WebSocket connection */;
console.log('WebSocket state:', ws.readyState); // Should be 1 (OPEN)
```

### Check Device WebSocket

```python
# In device code
# Log WebSocket state
print(f"WebSocket state: {ws.state}")  # Should be OPEN
```

---

## Next Steps

If ICE connection still fails after checking all above:

1. **Enable verbose logging** in all components
2. **Use WebRTC internals** (`chrome://webrtc-internals/`) to see detailed stats
3. **Test on same network** to eliminate NAT issues
4. **Configure TURN servers** if NAT traversal is needed
5. **Check device WebRTC implementation** - ensure it's calling all required
   APIs

---

## Related Documentation

- [Preview Message Format](./PREVIEW-MESSAGE-FORMAT.md) - Message format
  specification
- [Preview Feature Integration Plan](./PREVIEW-FEATURE-INTEGRATION-PLAN.md) -
  Implementation details
