# Testing the Realtime Module

## Prerequisites

1. **Build the module and dependencies**:

   ```bash
   # From project root
   pnpm install
   pnpm --filter @civicpress/core run build
   pnpm --filter @civicpress/realtime run build
   ```

2. **Create realtime configuration**: The realtime module will use default
   config if `.system-data/realtime.yml` doesn't exist. To customize, create
   `.system-data/realtime.yml`:

   ```yaml
   realtime:
     enabled: true
     port: 3001
     host: '0.0.0.0'
     path: '/realtime'

     rooms:
       max_rooms: 100
       cleanup_timeout: 3600

     snapshots:
       enabled: true
       interval: 300
       max_updates: 100
       storage: 'database'

     rate_limiting:
       messages_per_second: 10
       connections_per_ip: 100
       connections_per_user: 10
   ```

3. **Ensure you have a test record**: Create a test record via the API or CLI to
   test collaborative editing.

## Starting the API Server

The realtime module is automatically initialized when the API server starts (if
the module is available).

```bash
# From project root
pnpm run dev:api

# Or from modules/api
cd modules/api
pnpm run dev
```

The API server runs on port 3000, and the realtime WebSocket server runs on port
3001 (configurable).

## Testing WebSocket Connection

### 1. Get an Authentication Token

First, authenticate via the API to get a session token:

```bash
# Login (adjust endpoint based on your auth setup)
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password"}'
```

Save the token from the response.

### 2. Connect to WebSocket

#### Using Node.js Test Script

Use the provided test script (see below).

#### Using Browser Console

```javascript
// In browser console (after logging in)
const token = 'your-session-token';
const recordId = 'your-record-id';

const ws = new WebSocket(`ws://localhost:3001/realtime/records/${recordId}?token=${token}`);

ws.onopen = () => {
  console.log('Connected to realtime server');

  // Send ping
  ws.send(JSON.stringify({ type: 'ping' }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);

  if (message.type === 'control' && message.event === 'room_state') {
    console.log('Room state:', message.room);
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected');
};
```

#### Using wscat (CLI tool)

```bash
# Install wscat globally
npm install -g wscat

# Connect
wscat -c "ws://localhost:3001/realtime/records/your-record-id?token=your-token"
```

## Test Script

A simple Node.js test script is provided in `test-websocket.mjs`.

```bash
# Run the test script
node modules/realtime/test-websocket.mjs
```

## Expected Behavior

1. **Connection**: Should connect successfully and receive `room_state` message
2. **Ping/Pong**: Send `ping`, receive `pong` response
3. **Presence**: When another client connects, you should receive `presence`
   messages
4. **Sync**: Send yjs updates, they should be broadcast to other clients

## Troubleshooting

### Module Not Found Errors

If you see "Cannot find module '@civicpress/realtime'", ensure:

1. Module is built: `pnpm --filter @civicpress/realtime run build`
2. Core is built: `pnpm --filter @civicpress/core run build`
3. Dependencies installed: `pnpm install`

### WebSocket Server Not Starting

Check logs for:

- Configuration errors
- Port conflicts (default: 3001)
- Missing dependencies

### Authentication Failures

- Ensure token is valid and not expired
- Check that record exists and user has permissions
- Verify token format (should be JWT or session token)

### Connection Refused

- Check that realtime server is enabled in config
- Verify port is not in use: `lsof -i :3001`
- Check firewall settings

## Manual Testing Checklist

- [ ] API server starts successfully
- [ ] Realtime server initializes (check logs)
- [ ] WebSocket connection succeeds
- [ ] Room state received on connect
- [ ] Ping/pong works
- [ ] Presence messages work (join/leave)
- [ ] yjs updates sync between clients
- [ ] Snapshots are created (check database/filesystem)
- [ ] Disconnect cleanup works
