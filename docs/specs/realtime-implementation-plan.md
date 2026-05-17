# Realtime Module Implementation Plan

**Date**: 2025-01-30  
**Status**: Planning  
**Specification**: `docs/specs/realtime-architecture.md` (v1.1.0 - Complete)

---

## Overview

This plan outlines the implementation of the `modules/realtime` service for
CivicPress, providing WebSocket-based collaborative editing, presence tracking,
and future live civic features.

**Reference**: Complete specification in `docs/specs/realtime-architecture.md`

---

## Implementation Phases

### Phase 1: Foundation & Module Setup (Week 1)

**Goal**: Set up module structure and core infrastructure

#### 1.1 Module Structure Setup

- [ ] Create `modules/realtime/` directory structure
- [ ] Initialize `package.json` with dependencies:
  - `ws` or `uws` for WebSocket server
  - `yjs` for collaborative document management
  - `@civicpress/core` for core services
- [ ] Set up TypeScript configuration
- [ ] Create basic module structure:

  ```
  modules/realtime/
  ├── src/
  │   ├── realtime-services.ts      # Service registration
  │   ├── realtime-server.ts         # WebSocket server
  │   ├── realtime-config-manager.ts # Configuration management
  │   ├── auth.ts                    # WebSocket authentication
  │   ├── rooms/
  │   │   ├── room-manager.ts        # Room management
  │   │   └── yjs-room.ts            # yjs document room
  │   ├── presence/
  │   │   ├── presence-manager.ts    # Presence tracking
  │   │   └── awareness.ts           # yjs awareness
  │   ├── persistence/
  │   │   ├── snapshots.ts           # Snapshot management
  │   │   └── storage.ts             # Snapshot storage adapter
  │   ├── errors/
  │   │   └── realtime-errors.ts     # Error hierarchy
  │   └── types/
  │       ├── realtime.types.ts      # TypeScript types
  │       └── messages.ts             # WebSocket message types
  ├── package.json
  └── tsconfig.json
  ```

#### 1.2 Type Definitions

- [ ] Create `types/realtime.types.ts`:
  - `RealtimeConfig` interface
  - `RoomConfig` interface
  - `ClientConnection` interface
  - `RoomState` interface
- [ ] Create `types/messages.ts`:
  - `BaseMessage` interface
  - `SyncMessage` interface
  - `PresenceMessage` interface
  - `ControlMessage` interface
  - Message type enums

#### 1.3 Error Hierarchy

- [ ] Create `errors/realtime-errors.ts`:
  - `RealtimeError` (base)
  - `RoomNotFoundError`
  - `ConnectionLimitExceededError`
  - `InvalidYjsUpdateError`
  - `AuthenticationFailedError`
  - `PermissionDeniedError`
- [ ] All errors extend `CivicPressError`
- [ ] Include proper error codes and status codes

**Deliverable**: Module structure with types and error hierarchy

---

### Phase 2: Configuration & Service Registration (Week 1-2)

**Goal**: Implement configuration management and DI container integration

#### 2.1 Configuration Manager

- [ ] Create `realtime-config-manager.ts`:
  - Follow `StorageConfigManager` pattern
  - Load from `.system-data/realtime.yml`
  - Default configuration values
  - Configuration validation
  - Merge with defaults
- [ ] Create default config template:
  - Port, host, path settings
  - Room limits and cleanup
  - Snapshot configuration
  - Rate limiting settings
- [ ] Add to `core/src/defaults/realtime.yml`

#### 2.2 Service Registration

- [ ] Create `realtime-services.ts`:
  - `registerRealtimeServices()` function
  - Register `realtimeConfigManager` (singleton)
  - Register `realtimeServer` (singleton)
  - Register `realtimeRoomManager` (singleton)
- [ ] Integrate in `core/src/civic-core-services.ts`:
  - Import and call `registerRealtimeServices()`
  - Handle optional module gracefully
- [ ] Document core service dependencies:
  - `Logger` (required)
  - `HookSystem` (required)
  - `AuthService` (required)
  - `DatabaseService` (optional, for snapshots)

**Deliverable**: Configuration management and service registration working

---

### Phase 3: WebSocket Server Foundation (Week 2)

**Goal**: Basic WebSocket server with authentication

#### 3.1 WebSocket Server

- [ ] Create `realtime-server.ts`:
  - WebSocket server initialization
  - Connection handling
  - Message routing
  - Connection lifecycle management
- [ ] Implement connection establishment:
  - URL parsing (`/realtime/records/:recordId`)
  - Token extraction (query string or header)
  - Authentication validation
- [ ] Implement connection cleanup:
  - Graceful disconnect handling
  - Resource cleanup
  - Room cleanup on last disconnect

#### 3.2 Authentication

- [ ] Create `auth.ts`:
  - Token validation (JWT or session)
  - User permission checking
  - Record access validation
  - Integration with `AuthService`
- [ ] Implement authentication flow:
  - Validate token
  - Check record exists
  - Check user permissions
  - Allow/deny connection

#### 3.3 Basic Message Handling

- [ ] Implement message parsing:
  - JSON message parsing
  - Message type validation
  - Error handling for invalid messages
- [ ] Implement ping/pong heartbeat:
  - Client ping handling
  - Server pong response
  - Connection keep-alive

**Deliverable**: WebSocket server accepting connections with authentication

---

### Phase 4: Room Management (Week 2-3)

**Goal**: Room creation, management, and lifecycle

#### 4.1 Room Manager

- [ ] Create `rooms/room-manager.ts`:
  - Room creation and destruction
  - Room lookup and retrieval
  - Room type registration
  - Room cleanup on disconnect
- [ ] Implement room lifecycle:
  - Create room on first connection
  - Destroy room when last client leaves
  - Grace period for room retention
  - Memory management

#### 4.2 Room Types

- [ ] Create `rooms/yjs-room.ts`:
  - yjs document management
  - Document state synchronization
  - Update broadcasting
  - State persistence
- [ ] Implement room type factory:
  - `record:<recordId>` room type
  - Extensible room type system
  - Room type registration pattern

#### 4.3 Room State Management

- [ ] Implement room state:
  - Current yjs document state
  - Participant list
  - Version tracking
  - State snapshots

**Deliverable**: Room management system with yjs document support

---

### Phase 5: yjs Integration (Week 3-4)

**Goal**: Full yjs document collaboration

#### 5.1 yjs Document Setup

- [ ] Integrate yjs library:
  - Document creation
  - Update encoding/decoding
  - State synchronization
  - Awareness integration
- [ ] Implement document initialization:
  - Load from snapshot (if available)
  - Load from API (fallback)
  - Convert Markdown to yjs
  - Initial state broadcast

#### 5.2 Update Synchronization

- [ ] Implement update broadcasting:
  - Receive updates from clients
  - Validate updates
  - Broadcast to other clients
  - Version tracking
- [ ] Implement update validation:
  - yjs update format validation
  - Version conflict handling
  - Corruption detection

#### 5.3 Document Serialization

- [ ] Implement yjs → Markdown conversion:
  - Extract text content
  - Preserve formatting
  - Handle civic reference nodes
  - Handle attachments
- [ ] Implement Markdown → yjs conversion:
  - Parse Markdown
  - Create yjs structure
  - Preserve structure

**Deliverable**: Full yjs document collaboration working

---

### Phase 6: Presence Tracking (Week 4)

**Goal**: User presence and cursor tracking

#### 6.1 Presence Manager

- [ ] Create `presence/presence-manager.ts`:
  - User join/leave tracking
  - Cursor position tracking
  - Selection range tracking
  - Idle status tracking
- [ ] Implement presence broadcasting:
  - Join events
  - Leave events
  - Cursor updates
  - Awareness updates

#### 6.2 yjs Awareness

- [ ] Create `presence/awareness.ts`:
  - yjs awareness integration
  - Awareness state management
  - Awareness broadcasting
  - Awareness cleanup

#### 6.3 Presence Data

- [ ] Implement presence data structure:
  - User information (id, name, color)
  - Cursor position
  - Selection ranges
  - Idle status
- [ ] Implement presence throttling:
  - Limit update frequency
  - Debounce rapid updates
  - Prioritize critical updates

**Deliverable**: Presence tracking with cursor and selection support

---

### Phase 7: Snapshot Persistence (Week 5)

**Goal**: Snapshot save/load for recovery

#### 7.1 Snapshot Manager

- [ ] Create `persistence/snapshots.ts`:
  - Snapshot creation
  - Snapshot loading
  - Snapshot versioning
  - Snapshot cleanup
- [ ] Implement snapshot strategy:
  - Periodic snapshots (configurable interval)
  - Update-based snapshots (after N updates)
  - On disconnect snapshots
  - Snapshot compression

#### 7.2 Snapshot Storage

- [ ] Create `persistence/storage.ts`:
  - Database storage adapter
  - Filesystem storage adapter
  - Storage strategy selection
  - Storage abstraction
- [ ] Implement database storage:
  - Create `realtime_snapshots` table
  - Save snapshots to database
  - Load snapshots from database
  - Snapshot querying
- [ ] Implement filesystem storage:
  - Save snapshots to `.system-data/realtime/snapshots/`
  - Load snapshots from filesystem
  - File naming convention

#### 7.3 Snapshot API Integration

- [ ] Implement API calls for snapshots:
  - `GET /api/v1/records/:id/collab-snapshot`
  - `POST /api/v1/records/:id/collab-snapshot`
  - Service account authentication
  - Error handling and retry

**Deliverable**: Snapshot persistence working (database or filesystem)

---

### Phase 8: Initialization & Lifecycle (Week 5)

**Goal**: Proper service lifecycle management

#### 8.1 Initialization

- [ ] Implement `RealtimeServer.initialize()`:
  - Load configuration
  - Validate configuration
  - Start WebSocket server
  - Register room types
  - Setup health checks
  - Register hooks
- [ ] Implement initialization sequence:
  - Config loading
  - Server startup
  - Room type registration
  - Health check setup

#### 8.2 Shutdown

- [ ] Implement `RealtimeServer.shutdown()`:
  - Stop accepting connections
  - Close existing connections gracefully
  - Save pending snapshots
  - Cleanup rooms
  - Close server
- [ ] Implement graceful shutdown:
  - Wait for in-flight operations
  - Save state before shutdown
  - Resource cleanup

#### 8.3 Health Checks

- [ ] Implement health check endpoint:
  - Connection count
  - Room count
  - Memory usage
  - Server status
- [ ] Integrate with core health system

**Deliverable**: Complete lifecycle management

---

### Phase 9: Hook System Integration (Week 5-6)

**Goal**: Event emission for workflow integration

#### 9.1 Hook Events

- [ ] Implement hook event emission:
  - `realtime:room:created`
  - `realtime:room:destroyed`
  - `realtime:client:connected`
  - `realtime:client:disconnected`
  - `realtime:snapshot:saved`
- [ ] Implement hook event structure:
  - Event name
  - Timestamp
  - Event data
  - Correlation ID

#### 9.2 Workflow Integration

- [ ] Document hook events in spec
- [ ] Create example workflow configurations
- [ ] Test workflow integration

**Deliverable**: Hook system integration working

---

### Phase 10: Error Handling & Logging (Week 6)

**Goal**: Comprehensive error handling and logging

#### 10.1 Error Handling

- [ ] Implement error handling throughout:
  - Connection errors
  - Authentication errors
  - Permission errors
  - Sync errors
  - Snapshot errors
- [ ] Use error hierarchy:
  - All errors extend `CivicPressError`
  - Proper error codes
  - Correlation IDs
  - Context data

#### 10.2 Logging

- [ ] Implement logging throughout:
  - Use `Logger` from core
  - Structured logging format
  - Operation context
  - Log levels (info, warn, error, debug)
- [ ] Log key events:
  - Connection events
  - Room lifecycle
  - Errors and warnings
  - Performance metrics

**Deliverable**: Complete error handling and logging

---

### Phase 11: Rate Limiting & Security (Week 6)

**Goal**: Security and performance protections

#### 11.1 Rate Limiting

- [ ] Implement rate limiting:
  - Per connection (messages/second)
  - Per IP (connections per IP)
  - Per user (concurrent connections)
- [ ] Implement rate limit handling:
  - Throttle messages
  - Send warnings
  - Close connections on violation

#### 11.2 Security

- [ ] Implement security measures:
  - WSS enforcement in production
  - Token validation
  - Permission checking
  - Input validation
  - Connection limits
- [ ] Implement monitoring:
  - Suspicious pattern detection
  - Security event logging
  - Alert on violations

**Deliverable**: Security and rate limiting working

---

### Phase 12: Testing (Week 7)

**Goal**: Comprehensive test coverage

#### 12.1 Unit Tests

- [ ] WebSocket server tests:
  - Connection establishment
  - Authentication flow
  - Message routing
  - Error handling
- [ ] Room management tests:
  - Room creation and cleanup
  - yjs document initialization
  - Snapshot save/load
- [ ] Presence tracking tests:
  - User join/leave events
  - Cursor updates
  - Awareness synchronization

#### 12.2 Integration Tests

- [ ] Multi-client scenarios:
  - Multiple clients editing same document
  - yjs update synchronization
  - Presence broadcasting
  - Reconnection scenarios
- [ ] API integration tests:
  - Snapshot endpoint integration
  - Authentication endpoint integration
  - Permission checking

#### 12.3 E2E Tests

- [ ] Collaborative workflows:
  - Complete collaborative editing session
  - Reconnection during active editing
  - Snapshot recovery after restart
- [ ] Error scenarios:
  - Authentication failure handling
  - Permission revocation during edit
  - Network failure recovery

#### 12.4 Performance Tests

- [ ] Load testing:
  - 100+ concurrent connections
  - 50+ active rooms
  - Message throughput
  - Memory usage under load
- [ ] Stress testing:
  - Very large documents (>500KB)
  - Rapid update bursts
  - Snapshot performance under load

**Deliverable**: Complete test suite with good coverage

---

### Phase 13: Documentation & Deployment (Week 7-8)

**Goal**: Complete documentation and deployment readiness

#### 13.1 Documentation

- [ ] Update module README:
  - Installation instructions
  - Configuration guide
  - Usage examples
  - API reference
- [ ] Update integration guide:
  - Service registration
  - Configuration
  - Error handling
  - Lifecycle management
- [ ] Create deployment guide:
  - Single-node setup
  - Multi-node setup
  - Configuration examples
  - Troubleshooting

#### 13.2 Deployment

- [ ] Create deployment scripts:
  - Configuration templates
  - Health check setup
  - Monitoring setup
- [ ] Document scaling:
  - Single-node deployment
  - Multi-node deployment
  - Redis integration (future)

**Deliverable**: Complete documentation and deployment ready

---

## Implementation Dependencies

### Core Dependencies

1. **Core Services** (Required):
   - `Logger` - Logging utilities
   - `HookSystem` - Event emission
   - `AuthService` - Authentication validation
   - `DatabaseService` - Snapshot storage (optional)

2. **External Dependencies**:
   - `ws` or `uws` - WebSocket server
   - `yjs` - Collaborative document management
   - `y-protocols` - yjs protocols

3. **API Endpoints** (Required):
   - `GET /api/v1/records/:id` - Load record
   - `GET /api/v1/records/:id/collab-snapshot` - Load snapshot
   - `POST /api/v1/records/:id/collab-snapshot` - Save snapshot
   - `GET /api/v1/auth/me` - Validate token

---

## Implementation Checklist

### Pre-Implementation

- [x] Complete specification (`realtime-architecture.md`)
- [x] Module development standards enforced
- [x] Reference implementations identified (Storage module)
- [ ] Review specification with team
- [ ] Get approval to proceed

### Phase 1: Foundation

- [ ] Module structure created
- [ ] Type definitions complete
- [ ] Error hierarchy defined
- [ ] Basic tests for types/errors

### Phase 2: Configuration

- [ ] Configuration manager implemented
- [ ] Service registration working
- [ ] DI container integration tested
- [ ] Configuration loading tested

### Phase 3: WebSocket Server

- [ ] WebSocket server running
- [ ] Authentication working
- [ ] Basic message handling
- [ ] Connection lifecycle tested

### Phase 4: Room Management

- [ ] Room manager implemented
- [ ] Room types working
- [ ] Room lifecycle tested
- [ ] Memory management verified

### Phase 5: yjs Integration

- [ ] yjs documents working
- [ ] Update synchronization
- [ ] Document serialization
- [ ] Multi-client editing tested

### Phase 6: Presence

- [ ] Presence tracking working
- [ ] Cursor updates
- [ ] Awareness integration
- [ ] Presence broadcasting tested

### Phase 7: Snapshots

- [ ] Snapshot manager implemented
- [ ] Storage adapters working
- [ ] API integration tested
- [ ] Snapshot recovery tested

### Phase 8: Lifecycle

- [ ] Initialization working
- [ ] Shutdown graceful
- [ ] Health checks working
- [ ] Lifecycle tested

### Phase 9: Hooks

- [ ] Hook events emitted
- [ ] Workflow integration tested
- [ ] Events documented

### Phase 10: Error Handling

- [ ] Error handling complete
- [ ] Logging implemented
- [ ] Error scenarios tested

### Phase 11: Security

- [ ] Rate limiting working
- [ ] Security measures in place
- [ ] Security tested

### Phase 12: Testing

- [ ] Unit tests complete
- [ ] Integration tests complete
- [ ] E2E tests complete
- [ ] Performance tests complete

### Phase 13: Documentation

- [ ] README complete
- [ ] Integration guide updated
- [ ] Deployment guide created
- [ ] All documentation reviewed

---

## Timeline Estimate

| Phase                     | Duration     | Dependencies |
| ------------------------- | ------------ | ------------ |
| Phase 1: Foundation       | 1 week       | None         |
| Phase 2: Configuration    | 3 days       | Phase 1      |
| Phase 3: WebSocket Server | 1 week       | Phase 2      |
| Phase 4: Room Management  | 1 week       | Phase 3      |
| Phase 5: yjs Integration  | 1 week       | Phase 4      |
| Phase 6: Presence         | 3 days       | Phase 5      |
| Phase 7: Snapshots        | 1 week       | Phase 5      |
| Phase 8: Lifecycle        | 3 days       | Phase 3-7    |
| Phase 9: Hooks            | 3 days       | Phase 8      |
| Phase 10: Error Handling  | 3 days       | All phases   |
| Phase 11: Security        | 3 days       | Phase 3      |
| Phase 12: Testing         | 1 week       | All phases   |
| Phase 13: Documentation   | 3 days       | All phases   |
| **Total**                 | **~8 weeks** |              |

**Note**: Phases can be parallelized where dependencies allow (e.g., Phase 6 and
7 can run in parallel after Phase 5).

---

## Risk Mitigation

### Technical Risks

1. **yjs Integration Complexity**
   - **Risk**: yjs integration may be complex
   - **Mitigation**: Start with simple examples, iterate
   - **Fallback**: Use simpler collaboration approach if needed

2. **Performance at Scale**
   - **Risk**: Performance issues with many connections
   - **Mitigation**: Load testing early, optimize as needed
   - **Fallback**: Add Redis for multi-node scaling

3. **Snapshot Storage**
   - **Risk**: Snapshot storage may be slow
   - **Mitigation**: Use database for better performance
   - **Fallback**: Filesystem storage as alternative

### Integration Risks

1. **API Endpoint Dependencies**
   - **Risk**: Required API endpoints may not exist
   - **Mitigation**: Create API endpoints in parallel
   - **Fallback**: Use existing endpoints with workarounds

2. **Service Account Authentication**
   - **Risk**: Service-to-service auth may be complex
   - **Mitigation**: Use existing auth patterns
   - **Fallback**: Internal token generation

---

## Success Criteria

### Functional Requirements

- [ ] WebSocket server accepts connections
- [ ] Authentication and authorization working
- [ ] Multiple clients can edit same document
- [ ] Changes sync in real-time
- [ ] Presence tracking working
- [ ] Snapshots save/load correctly
- [ ] Graceful shutdown works
- [ ] Error handling comprehensive

### Non-Functional Requirements

- [ ] Supports 100+ concurrent connections
- [ ] Supports 50+ active rooms
- [ ] Message latency < 100ms
- [ ] Memory usage reasonable
- [ ] Test coverage > 80%
- [ ] Documentation complete
- [ ] Security measures in place

---

## Next Steps

1. **Review this plan** with the team
2. **Get approval** to proceed with Phase 1
3. **Set up development environment** for realtime module
4. **Begin Phase 1** implementation
5. **Regular checkpoints** after each phase

---

**Status**: Planning Complete  
**Ready for**: Implementation  
**Estimated Duration**: 8 weeks  
**Start Date**: TBD
