# Running Realtime Module Standalone

## Architecture Overview

The realtime module has the following dependencies:

### ✅ Independent of API Server

- **Does NOT require Express** or REST API endpoints
- **Runs on its own port** (default: 3001)
- **Separate WebSocket server** (not part of Express app)

### ❌ Requires CivicPress Core

- **Requires CivicPress core** to be initialized
- **Needs core services**: AuthService, RecordManager, DatabaseService,
  HookSystem
- **Initialized during** `CivicPress.initialize()` →
  `completeServiceInitialization()`

## Dependency Chain

```
API Server (Express)
  └─> CivicPress Core
        └─> Realtime Module (WebSocket Server on port 3001)
```

**You can skip the API server**, but you **cannot skip CivicPress core**.

## Running Standalone (Without API Server)

You can run the realtime module without the REST API by initializing CivicPress
core directly:

```typescript
import { CivicPress } from '@civicpress/core';

const civicPress = new CivicPress({
  dataDir: './data',
});

await civicPress.initialize();
// Realtime server is now running on port 3001

// Keep process alive
process.on('SIGINT', async () => {
  await civicPress.shutdown();
  process.exit(0);
});
```

## Use Cases

### With API Server (Current Setup)

- REST API on port 3000
- WebSocket server on port 3001
- Both share the same CivicPress core instance
- **Recommended for most use cases**

### Standalone (Core Only)

- No REST API
- WebSocket server on port 3001
- Useful for:
  - WebSocket-only deployments
  - Microservices architecture
  - Testing realtime module in isolation

## Configuration

The realtime module uses the same configuration regardless of whether the API
server is running:

- Config file: `.system-data/realtime.yml`
- Default port: 3001
- Same authentication (uses AuthService from core)
- Same record access (uses RecordManager from core)

## Example: Standalone Script

See `standalone-realtime.mjs` for a complete example of running realtime without
the API server.
