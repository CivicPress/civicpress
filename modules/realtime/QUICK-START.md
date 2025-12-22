# Quick Start - Testing Realtime Module

## Step 1: Build Dependencies

```bash
# From project root
pnpm install
pnpm --filter @civicpress/core run build
pnpm --filter @civicpress/realtime run build
```

## Step 2: Start Server

The realtime module initializes automatically when CivicPress core initializes.
You have two options:

### Option A: With API Server (Recommended - Bundled)

```bash
# From project root
pnpm run dev:api

# This starts:
# - REST API on port 3000
# - Realtime WebSocket on port 3001 (bundled for convenience)
```

### Option B: Standalone (Separate Terminal)

```bash
# Run standalone realtime server (no REST API)
pnpm run dev:realtime
# Or: pnpm run dev:ws

# This starts:
# - Realtime WebSocket on port 3001
# - No REST API
```

**Note**: The realtime module is independent of the API server but requires
CivicPress core. See `STANDALONE.md` and `DEVELOPMENT.md` for details.

**All 3 services run separately by default:**

- Terminal 1: `pnpm run dev:api` (API only, realtime disabled)
- Terminal 2: `pnpm run dev:realtime` (WebSocket standalone)
- Terminal 3: `pnpm run dev:ui` (Frontend)

**Or use the convenience command:**

- `pnpm run dev` - Starts all 3 services together

You should see logs like:

```
Realtime services registered successfully
Realtime server initialized
WebSocket server started on port 3001
```

## Step 3: Get Authentication Token

You need a valid session token. If you have auth endpoints:

```bash
# Example (adjust based on your auth setup)
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password"}'
```

Or use the CLI to create a session:

```bash
civic auth:simulated admin
# This will output a token
```

## Step 4: Test WebSocket Connection

### Option A: Use Test Script

```bash
# Set environment variables
export RECORD_ID=your-record-id
export TOKEN=your-session-token

# Run test script
node modules/realtime/test-websocket.mjs
```

### Option B: Browser Console

1. Open browser console on your CivicPress UI
2. Get your session token (from localStorage or API)
3. Run:

```javascript
const token = 'your-token';
const recordId = 'your-record-id';
const ws = new WebSocket(`ws://localhost:3001/realtime/records/${recordId}?token=${token}`);

ws.onopen = () => console.log('Connected!');
ws.onmessage = (e) => console.log('Message:', JSON.parse(e.data));
ws.onerror = (e) => console.error('Error:', e);
```

### Option C: wscat CLI

```bash
npm install -g wscat
wscat -c "ws://localhost:3001/realtime/records/your-record-id?token=your-token"
```

## Step 5: Verify It's Working

You should see:

- ✅ Connection successful
- ✅ Room state message received
- ✅ Ping/pong working
- ✅ Presence messages when multiple clients connect

## Troubleshooting

**"Cannot find module" errors:**

- Run `pnpm install` from root
- Build core: `pnpm --filter @civicpress/core run build`
- Build realtime: `pnpm --filter @civicpress/realtime run build`

**"Connection refused":**

- Check realtime server is enabled in `.system-data/realtime.yml`
- Verify port 3001 is not in use
- Check API server logs for realtime initialization

**"Authentication failed":**

- Verify token is valid and not expired
- Check record exists and user has permissions
- Ensure token format is correct

**"Module not registered":**

- This is expected if module isn't built yet
- Core handles it gracefully (module is optional)
- Build the module to enable it

## Next Steps

- Test with multiple clients (collaborative editing)
- Test presence tracking (cursor positions)
- Test snapshots (check database/filesystem)
- Integrate with UI for real-time editing
