# Broadcast Box Device Troubleshooting Guide

**Last Updated**: 2026-01-16  
**Purpose**: Help device developers debug why commands aren't being received and
implement proper connection lifecycle management

---

## Command Delivery Flow

When CivicPress sends a command to your device, here's the flow:

1. **Command Created**: `DeviceCommandService` creates a command message
2. **Room Lookup**: Finds the device room: `device:<deviceUuid>`
3. **Client ID Lookup**: Searches `clientToDevice` map to find your device's
   WebSocket `clientId`
4. **WebSocket Send**: Sends message via `ws.send(JSON.stringify(message))` to
   your device's WebSocket connection

---

## Why Commands Might Not Arrive

### 1. Device Not Connected

**Symptom**: Server logs show "Device client not found in clientToDevice map"

**Check**:

- Is your device WebSocket connection established?
- Did you connect to:
  `ws://<server>/realtime/devices/<deviceUuid>?token=<deviceToken>`?
- Did authentication succeed? (You should receive a `connection.ack` message)

**Fix**:

- Ensure device connects before commands are sent
- Verify authentication token is valid
- Check device status is 'active' or 'enrolled' in CivicPress

---

### 2. WebSocket Not in OPEN State

**Symptom**: Server logs show "Device WebSocket not in OPEN state" with
readyState != 1

**WebSocket Ready States**:

- `0` = CONNECTING - Connection is being established
- `1` = OPEN - Connection is open and ready
- `2` = CLOSING - Connection is closing
- `3` = CLOSED - Connection is closed

**Check**:

- Is your WebSocket connection still open?
- Did it close unexpectedly?
- Are you handling connection errors?

**Fix**:

- Ensure WebSocket stays open during command execution
- Implement reconnection logic
- Handle `onclose` and `onerror` events

---

### 3. Device Not Listening for Messages

**Symptom**: Command is sent (server logs show success) but device never
receives it

**Check**:

- Do you have a `onmessage` handler on your WebSocket?
- Are you parsing JSON messages correctly?
- Are you filtering messages by type?

**Fix**:

```javascript
// Example WebSocket message handler
ws.onmessage = (event) => {
  try {
    const message = JSON.parse(event.data);

    // Log all messages for debugging
    console.log('[Device] Received message:', {
      type: message.type,
      id: message.id,
      action: message.action,
      timestamp: message.timestamp,
    });

    // Handle command messages
    if (message.type === 'command') {
      handleCommand(message);
    }
    // Handle other message types...
  } catch (error) {
    console.error('[Device] Failed to parse message:', error);
  }
};
```

---

### 4. Device UUID Mismatch

**Symptom**: Server logs show device not found, but device is connected

**Check**:

- Is the `deviceUuid` in your WebSocket URL correct?
- Does it match the UUID in the `clientToDevice` map?
- Did you connect with the correct device UUID?

**Fix**:

- Verify the device UUID in your connection URL matches your device's UUID
- Check server logs for "clientToDeviceEntries" to see what UUIDs are registered
- Ensure you're connecting with the same UUID that CivicPress expects

---

### 5. Message Format Issues

**Symptom**: Device receives message but can't parse it

**Check**:

- Is the message valid JSON?
- Does it match the expected structure?
- Are required fields present?

**Expected Command Format**:

```json
{
  "type": "command",
  "id": "uuid-here",
  "timestamp": "2026-01-16T17:57:55.393Z",
  "action": "preview.start",
  "payload": {
    "quality": {
      "width": 640,
      "height": 360,
      "framerate": 15,
      "bitrate": 500
    }
  }
}
```

**Fix**:

- Parse JSON carefully
- Validate message structure
- Handle missing fields gracefully

---

## Debugging Checklist for Device Developer

### ✅ Connection Checklist

- [ ] Device connects to correct WebSocket URL:
      `ws://<server>/realtime/devices/<deviceUuid>?token=<token>`
- [ ] Authentication succeeds (receive `connection.ack` message)
- [ ] WebSocket `readyState` is `1` (OPEN)
- [ ] Device sends `device.connected` event after connection

### ✅ Message Handling Checklist

- [ ] `onmessage` handler is registered on WebSocket
- [ ] Messages are parsed as JSON
- [ ] Command messages (`type: "command"`) are handled
- [ ] ACK responses are sent for all commands
- [ ] Log all received messages for debugging

### ✅ Command Response Checklist

- [ ] Send ACK within timeout (5s default, 20s for preview commands)
- [ ] ACK includes `commandId` from original command
- [ ] ACK has `success: true` or `success: false`
- [ ] Include error message if command fails

---

## Example Device WebSocket Implementation

```javascript
class BroadcastBoxDevice {
  constructor(serverUrl, deviceUuid, deviceToken) {
    this.deviceUuid = deviceUuid;
    this.wsUrl = `${serverUrl}/realtime/devices/${deviceUuid}?token=${deviceToken}`;
    this.ws = null;
  }

  connect() {
    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      console.log('[Device] WebSocket connected');

      // Send device.connected event
      this.sendEvent('device.connected', {
        deviceId: this.deviceUuid,
        version: '1.0.0',
        capabilities: {
          videoSources: ['hdmi1', 'hdmi2'],
          audioSources: ['usb_audio'],
          pipSupported: true,
        },
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[Device] 📥 Received message:', {
          type: message.type,
          id: message.id,
          action: message.action,
          timestamp: message.timestamp,
        });

        // Handle commands
        if (message.type === 'command') {
          this.handleCommand(message);
        }

        // Handle other message types
        if (message.type === 'control' && message.event === 'connection.ack') {
          console.log('[Device] Connection acknowledged');
        }
      } catch (error) {
        console.error('[Device] ❌ Failed to parse message:', error, event.data);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[Device] ❌ WebSocket error:', error);
    };

    this.ws.onclose = (event) => {
      console.log('[Device] WebSocket closed:', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      // Implement reconnection logic here
    };
  }

  handleCommand(command) {
    console.log('[Device] 🔧 Handling command:', {
      action: command.action,
      commandId: command.id,
      payload: command.payload,
    });

    // Handle different command actions
    switch (command.action) {
      case 'preview.start':
        this.handlePreviewStart(command);
        break;
      case 'preview.stop':
        this.handlePreviewStop(command);
        break;
      case 'switch_source':
        this.handleSwitchSource(command);
        break;
      // ... other commands
      default:
        this.sendAck(command.id, false, `Unknown command: ${command.action}`);
    }
  }

  sendAck(commandId, success, error = null, payload = null) {
    const ack = {
      type: 'ack',
      id: this.generateUUID(),
      timestamp: new Date().toISOString(),
      commandId: commandId,
      success: success,
    };

    if (error) {
      ack.error = error;
    }

    if (payload) {
      ack.payload = payload;
    }

    console.log('[Device] 📤 Sending ACK:', ack);
    this.ws.send(JSON.stringify(ack));
  }

  sendEvent(event, payload) {
    const message = {
      type: 'event',
      id: this.generateUUID(),
      timestamp: new Date().toISOString(),
      event: event,
      payload: payload,
    };

    console.log('[Device] 📤 Sending event:', message);
    this.ws.send(JSON.stringify(message));
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
```

---

## Connection Lifecycle Management

**IMPORTANT**: Proper connection lifecycle management prevents multiple
connection issues and ensures reliable command delivery.

### Problem: Multiple Connections for Same Device

**Symptom**: Server logs show "Multiple OPEN connections found for device" or
"Multiple connections detected for device"

**Cause**: Device creates new WebSocket connections without closing existing
ones. This can happen when:

- Device reconnects without closing old connection first
- Network issues cause device to retry connection while old one is still active
- Device crash/restart leaves old connection open

**Impact**:

- Commands may be sent to the wrong (stale) connection
- Server may receive duplicate messages
- Connection tracking becomes inconsistent
- Command delivery may fail if sent to closed connection

### Solution: Always Close Old Connection Before Creating New One

**Requirement**: **MUST** close existing connection before creating a new one.

#### Example: Proper Connection Lifecycle Management

```javascript
// Example: Proper connection lifecycle management
class DeviceConnection {
  constructor(deviceUuid, token, serverUrl) {
    this.deviceUuid = deviceUuid;
    this.token = token;
    this.serverUrl = serverUrl;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    this.isReconnecting = false;
  }

  connect() {
    // CRITICAL: Close existing connection before creating new one
    if (this.ws) {
      const currentState = this.ws.readyState;

      if (currentState === WebSocket.CONNECTING || currentState === WebSocket.OPEN) {
        console.log('[Device] Closing existing connection before reconnecting');
        // Remove event listeners to prevent interference
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;

        // Close the connection
        this.ws.close(1000, 'Reconnecting'); // 1000 = normal closure
      }

      this.ws = null;
    }

    // Wait a brief moment for cleanup (prevents race conditions)
    setTimeout(() => {
      this._doConnect();
    }, 100);
  }

  _doConnect() {
    if (this.isReconnecting) {
      console.log('[Device] Reconnection already in progress, skipping');
      return;
    }

    const url = `${this.serverUrl}/realtime/devices/${this.deviceUuid}?token=${this.token}`;
    console.log('[Device] Connecting to:', url.replace(this.token, '[TOKEN_REDACTED]'));

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[Device] ✅ Connected');
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      this.reconnectDelay = 1000; // Reset delay

      // Send device.connected event
      this.sendEvent('device.connected', {
        deviceId: this.deviceUuid,
        version: '1.0.0',
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[Device] 📥 Received:', message.type, message.action || message.event);

        // Handle connection acknowledgment
        if (message.type === 'control' && message.event === 'connection.ack') {
          console.log('[Device] Connection acknowledged by server');
          return;
        }

        // Handle commands
        if (message.type === 'command') {
          this.handleCommand(message);
        }

        // Handle other message types...
      } catch (error) {
        console.error('[Device] ❌ Failed to parse message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[Device] ❌ WebSocket error:', error);
      // Error handler will be called before close, so we don't reconnect here
    };

    this.ws.onclose = (event) => {
      console.log('[Device] WebSocket closed:', {
        code: event.code,
        reason: event.reason || 'none',
        wasClean: event.wasClean,
      });

      this.ws = null;
      this.isReconnecting = false;

      // Only retry if it wasn't a clean close (code 1000) and we haven't exceeded max retries
      // Don't retry on normal closure (code 1000) or policy violation (code 1008)
      if (
        event.code !== 1000 &&
        event.code !== 1008 &&
        this.reconnectAttempts < this.maxReconnectAttempts
      ) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

        console.log(
          `[Device] Will retry connection in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
        );

        setTimeout(() => {
          // Only reconnect if connection is still closed
          if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
            this.isReconnecting = true;
            this.connect();
          }
        }, delay);
      } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[Device] ❌ Max reconnection attempts reached, giving up');
      }
    };
  }

  disconnect() {
    console.log('[Device] Disconnecting...');

    // Reset reconnection state
    this.isReconnecting = false;
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection

    if (this.ws) {
      // Remove event listeners
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;

      // Close cleanly
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'Device disconnecting'); // 1000 = normal closure
      }

      this.ws = null;
    }
  }

  sendEvent(event, payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[Device] Cannot send event: WebSocket not open');
      return false;
    }

    const message = {
      type: 'event',
      id: this.generateUUID(),
      timestamp: new Date().toISOString(),
      event: event,
      payload: payload,
    };

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('[Device] Failed to send event:', error);
      return false;
    }
  }

  handleCommand(command) {
    // Handle command and send ACK
    // ... (implement your command handlers)

    // Example: Always send ACK
    this.sendAck(command.id, true, null, { /* result */ });
  }

  sendAck(commandId, success, error = null, payload = null) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[Device] Cannot send ACK: WebSocket not open');
      return false;
    }

    const ack = {
      type: 'ack',
      id: this.generateUUID(),
      timestamp: new Date().toISOString(),
      commandId: commandId,
      success: success,
    };

    if (error) {
      ack.error = error;
    }

    if (payload) {
      ack.payload = payload;
    }

    try {
      this.ws.send(JSON.stringify(ack));
      return true;
    } catch (error) {
      console.error('[Device] Failed to send ACK:', error);
      return false;
    }
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

// Usage:
// const connection = new DeviceConnection(deviceUuid, token, 'ws://localhost:3001');
// connection.connect();
//
// Later, to reconnect:
// connection.connect(); // Will close old connection first
//
// To disconnect:
// connection.disconnect();
```

### Key Points

1. **Always check existing connection**: Before creating a new connection, check
   if `this.ws` exists and is in a state that needs closing
2. **Remove event listeners**: Before closing, remove all event listeners to
   prevent interference
3. **Close cleanly**: Use close code `1000` (normal closure) when closing
   intentionally
4. **Wait for cleanup**: Add a small delay after closing before creating new
   connection (prevents race conditions)
5. **Check state before operations**: Always check
   `readyState === WebSocket.OPEN` before sending messages
6. **Handle reconnection properly**: Track reconnection state to prevent
   multiple simultaneous reconnection attempts

### Detection: How to Know if Multiple Connections Exist

**On Device Side**:

- Monitor WebSocket connection state
- Log all connection/disconnection events
- Track if a connection already exists before creating new one

**Server Side** (in logs):

- Look for: `"Multiple OPEN connections found for device"`
- Look for: `"Multiple connections detected for device"`
- Check connection count per device UUID

### Error Handling: What to Do if Connection is Rejected

If server rejects connection (e.g., connection limit exceeded):

**Error Message**: `"Connection limit exceeded"` or close code `1008` (policy
violation)

**Action**:

1. **Check existing connections**: Verify you don't have multiple connections
   open
2. **Close all connections**: Ensure all old connections are properly closed
3. **Wait before retry**: Add a delay before attempting reconnection
4. **Log the error**: Record the rejection for debugging

```javascript
ws.onclose = (event) => {
  if (event.code === 1008) {
    // Policy violation (connection limit exceeded, etc.)
    console.error('[Device] Connection rejected by server:', event.reason);

    // Ensure we're not holding any stale connections
    this.ws = null;

    // Wait longer before retry for policy violations
    setTimeout(() => {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.connect();
      }
    }, 5000); // Wait 5 seconds for policy violations
  }
  // ... handle other close codes
};
```

---

## Server-Side Debugging

When commands aren't arriving, check server logs for:

1. **"Device client not found"**: Device not connected or UUID mismatch
2. **"Device WebSocket not in OPEN state"**: WebSocket connection closed
3. **"Command sent successfully"**: Command was sent - check device logs
4. **"clientToDeviceEntries"**: Shows all connected devices and their UUIDs

---

## Common Issues and Solutions

### Issue: "Device client not found in clientToDevice map"

**Cause**: Device not connected or connected with wrong UUID

**Solution**:

- Verify device connects before sending commands
- Check device UUID in connection URL matches expected UUID
- Ensure authentication succeeds

---

### Issue: "WebSocket not in OPEN state"

**Cause**: WebSocket connection closed or never opened

**Solution**:

- Implement connection monitoring
- Add reconnection logic
- Check for network issues

---

### Issue: Command sent but device never receives it

**Cause**: Device not listening for messages or filtering them out

**Solution**:

- Add comprehensive message logging
- Ensure `onmessage` handler is registered
- Don't filter out `type: "command"` messages

---

## Testing Your Device

1. **Connect**: Verify WebSocket connection succeeds
2. **Authenticate**: Check you receive `connection.ack`
3. **Send device.connected**: Verify event is received by server
4. **Receive command**: Send a test command from UI and verify it arrives
5. **Send ACK**: Verify ACK is sent and received by server

---

## Need More Help?

- Check server logs for detailed error messages
- Verify device UUID matches in all places
- Ensure WebSocket stays open during command execution
- Add comprehensive logging on both server and device sides
