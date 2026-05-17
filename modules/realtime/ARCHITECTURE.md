# Realtime Module Architecture

## Independence & Dependencies

### ✅ API and Realtime are Independent Services

Both the **API server** and **realtime module** are **independent services**
that can run separately. They share a common dependency: **CivicPress Core**.

```
┌─────────────────────────────────────────────────────────┐
│                    CivicPress Core                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ AuthService  │  │ RecordMgr   │  │  Database   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└────────────┬───────────────────────────────┬───────────┘
             │                               │
             │                               │
    ┌────────▼────────┐            ┌────────▼────────┐
    │   API Server    │            │ Realtime Module │
    │   (Express)     │            │  (WebSocket)    │
    │   Port 3000     │            │   Port 3001     │
    └─────────────────┘            └─────────────────┘
         │                                  │
         │                                  │
         └──────────┬───────────────────────┘
                    │
            Can run together
            or independently
```

### Dependency Chain

**API Server:**

```
API Server → CivicPress Core → (optionally) Realtime Module
```

**Realtime Module:**

```
Realtime Module → CivicPress Core
```

**Both Together:**

```
API Server ──┐
             ├─→ CivicPress Core ──→ Realtime Module
Realtime ────┘
```

## Running Modes

### Mode 1: API Only (No Realtime)

```bash
# Start API server
pnpm run dev:api

# Realtime module won't initialize if:
# - Module not built
# - Module disabled in config
# - Module not available
```

**Result:**

- ✅ REST API on port 3000
- ❌ No WebSocket server
- ✅ All REST endpoints work

### Mode 2: Realtime Only (No API)

```bash
# Start standalone realtime
node modules/realtime/standalone-realtime.mjs

# Or initialize CivicPress core directly
```

**Result:**

- ❌ No REST API
- ✅ WebSocket server on port 3001
- ✅ All WebSocket features work

### Mode 3: Both Together (Recommended)

```bash
# Start API server (which initializes core, which initializes realtime)
pnpm run dev:api
```

**Result:**

- ✅ REST API on port 3000
- ✅ WebSocket server on port 3001
- ✅ Both share same core instance
- ✅ Both share same database
- ✅ Both share same authentication

## Why Bundle Together?

### Convenience ✅

- **Single command** to start everything
- **Shared configuration** (same data directory, database, etc.)
- **Shared authentication** (same users, same tokens)
- **Easier development** (one process to manage)

### Not Required ❌

- API doesn't need realtime to function
- Realtime doesn't need API to function
- They're **loosely coupled** through core

## Use Cases

### Microservices Architecture

You could deploy them separately:

```bash
# Service 1: API Server
docker run civicpress-api:latest

# Service 2: Realtime Server
docker run civicpress-realtime:latest

# Both connect to same database
# Both use same auth tokens
```

### Development

```bash
# Option 1: Everything together (convenient)
pnpm run dev:api

# Option 2: Separate (for debugging)
# Terminal 1: API only
CIVIC_REALTIME_ENABLED=false pnpm run dev:api

# Terminal 2: Realtime only
node modules/realtime/standalone-realtime.mjs
```

### Production

```bash
# Option 1: Monolith (simpler)
# One process runs both

# Option 2: Separate services (scalable)
# API server: handles HTTP traffic
# Realtime server: handles WebSocket traffic
# Can scale independently
```

## Configuration

Both services read from the same configuration:

- **Data directory**: `CIVIC_DATA_DIR` or config
- **Database**: Shared SQLite/PostgreSQL
- **Authentication**: Same AuthService, same tokens
- **Records**: Same RecordManager, same files

**Realtime-specific config:**

- `.system-data/realtime.yml` (only affects realtime)

**API-specific config:**

- API routes, middleware (only affects API)

## Summary

| Aspect               | API Server  | Realtime Module |
| -------------------- | ----------- | --------------- |
| **Port**             | 3000        | 3001            |
| **Protocol**         | HTTP/REST   | WebSocket       |
| **Requires Core**    | ✅ Yes      | ✅ Yes          |
| **Requires API**     | ❌ No       | ❌ No           |
| **Can Run Alone**    | ✅ Yes      | ✅ Yes          |
| **Bundled Together** | Convenience | Convenience     |

**Answer**: Yes, they're independent services. Bundling them in the API is just
convenience - they both need CivicPress core, but they don't need each other.
