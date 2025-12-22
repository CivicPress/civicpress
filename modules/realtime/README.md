# CivicPress Realtime Module

WebSocket-based realtime service for collaborative editing, presence tracking,
and future live civic features.

## Purpose

The Realtime Module provides:

- **Collaborative Editing**: Real-time collaborative document editing using yjs
- **Presence Tracking**: User presence, cursor positions, and selection ranges
- **Room Management**: Extensible room system for different collaboration
  contexts
- **Snapshot Persistence**: State snapshots for recovery and faster reconnection

## Architecture

### Core Components

- **RealtimeServer**: Main WebSocket server managing connections
- **RoomManager**: Manages collaboration rooms
- **YjsRoom**: yjs-based document room implementation
- **RealtimeConfigManager**: Configuration management
- **Authentication**: WebSocket connection authentication

### Room Types

- `record:<recordId>` - Collaborative editing of civic records (default)
- Extensible for future room types (device, consultation, dashboard)

## Configuration

Configuration file: `.system-data/realtime.yml`

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

## Service Registration

Services are registered in the DI container:

- `realtimeConfigManager` - Configuration manager
- `realtimeServer` - WebSocket server
- `realtimeRoomManager` - Room manager

## Architecture Notes

**Independent Services**: The API server and realtime module are **independent
services** that run separately by default. They both require **CivicPress
core**, but they don't require each other.

- **API Server**: REST API on port 3000 (requires core, realtime disabled by
  default)
- **Realtime Module**: WebSocket on port 3001 (requires core, runs standalone)
- **UI**: Frontend on port 3030 (connects to API)

**Default Development Setup:**

- **Separated** (recommended): `pnpm run dev` - starts all 3 services separately
- **Individual**: `pnpm run dev:api`, `pnpm run dev:realtime`, `pnpm run dev:ui`
- **Bundled** (optional): `pnpm run dev:api:with-realtime` - API + realtime
  together

See `ARCHITECTURE.md` and `DEVELOPMENT.md` for detailed explanations.

## Usage

### WebSocket Connection

```typescript
// SECURE: Use subprotocol (browser-compatible, recommended)
const ws = new WebSocket(
  'ws://localhost:3001/realtime/records/abc123',
  [`auth.${token}`] // Token in subprotocol, not in URL
);

// SECURE: Use Authorization header (Node.js clients only)
const ws = new WebSocket('ws://localhost:3001/realtime/records/abc123', {
  headers: {
    'Authorization': 'Bearer <jwt-token>'
  }
});

// DEPRECATED: Query string (kept for backward compatibility, less secure)
// const ws = new WebSocket('ws://localhost:3001/realtime/records/abc123?token=<jwt-token>');
```

### Message Types

- `sync` - yjs document updates
- `presence` - User presence (join, leave, cursor)
- `control` - Room state, errors, notices
- `ping`/`pong` - Heartbeat

## Development

### Building

```bash
pnpm build
```

### Testing

```bash
pnpm test
```

## Dependencies

- `ws` - WebSocket server
- `yjs` - Collaborative document management
- `y-protocols` - yjs protocols
- `@civicpress/core` - Core services

## Status

**Phase 1-4 Complete**: Foundation, configuration, WebSocket server, and room
management implemented.

**Next Steps**: yjs integration, presence tracking, snapshots, testing.

## Reference

- [Realtime Architecture Specification](../../docs/specs/realtime-architecture.md)
- [Implementation Plan](../../docs/specs/realtime-implementation-plan.md)
- [Module Integration Guide](../../docs/module-integration-guide.md)
