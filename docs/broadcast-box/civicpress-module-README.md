# CivicPress Broadcast Box Module - Implementation Guide

**Status**: Ready for Implementation  
**Version**: 1.0.0  
**Target**: CivicPress `modules/broadcast-box`  
**Last Updated**: 2025-01-30

---

## Quick Start

This document package provides everything needed to implement the Broadcast Box
control module in CivicPress.

### Documents Included

1. **`civicpress-module-spec.md`** - Complete module specification
   - Architecture & integration
   - Data models
   - WebSocket server
   - REST API endpoints
   - Command & event protocol
   - UI components
   - Workflow integration
   - Storage integration
   - Testing strategy
   - Implementation plan

2. **`civicpress-module-api-reference.md`** - Detailed API reference
   - All endpoints with request/response examples
   - Error codes and handling
   - Authentication & authorization
   - Rate limiting
   - Pagination

3. **`civicpress-module-types.ts`** - TypeScript type definitions
   - Device types
   - Session types
   - Upload types
   - WebSocket protocol types
   - API request/response types
   - Service interfaces

4. **`civicpress-module-migrations.sql`** - Database migrations
   - Initial schema
   - Indexes
   - SQLite and PostgreSQL compatible

5. **`civicpress-module-mock-box.ts`** - Mock Broadcast Box for testing
   - Simulates device behavior
   - Command/event handling
   - Error simulation
   - Latency simulation

6. **`civicpress-module-implementation-checklist.md`** - Implementation tracking
   - Phase-by-phase checklist
   - Success criteria
   - Dependencies

---

## Copy Instructions

### Step 1: Copy Specification

Copy `civicpress-module-spec.md` to:

```
civicpress/docs/specs/broadcast-box-module.md
```

### Step 2: Copy API Reference

Copy `civicpress-module-api-reference.md` to:

```
civicpress/docs/api/broadcast-box-api.md
```

### Step 3: Copy Type Definitions

Copy `civicpress-module-types.ts` to:

```
civicpress/modules/broadcast-box/src/types/index.ts
```

### Step 4: Copy Migrations

Copy `civicpress-module-migrations.sql` to:

```
civicpress/modules/broadcast-box/src/storage/migrations/001_initial_schema.sql
```

### Step 5: Copy Mock Box

Copy `civicpress-module-mock-box.ts` to:

```
civicpress/modules/broadcast-box/tests/mocks/broadcast-box.ts
```

### Step 6: Copy Checklist

Copy `civicpress-module-implementation-checklist.md` to:

```
civicpress/modules/broadcast-box/IMPLEMENTATION.md
```

---

## Key Design Decisions

### 1. WebSocket Server Integration

**Decision**: Extend `modules/realtime` with device rooms

**Rationale**:

- Reuse existing WebSocket infrastructure
- Shared authentication, scaling, monitoring
- Consistent patterns with collaborative editing
- Easier maintenance

**Implementation**: Add room type `device:<deviceId>` to existing realtime
server

### 2. Database Schema

**Decision**: Separate tables for devices, sessions, uploads

**Rationale**:

- Clear separation of concerns
- Easy to query and index
- Supports future scaling
- Compatible with SQLite and PostgreSQL

### 3. Storage Integration

**Decision**: Use existing `modules/storage` (Storage Manager)

**Rationale**:

- Reuse existing file storage infrastructure
- Consistent with other CivicPress file handling
- No need to reinvent storage

### 4. Workflow Integration

**Decision**: Use CivicPress workflow engine

**Rationale**:

- Flexible automation
- No hardcoded logic
- Municipalities can customize workflows
- Consistent with CivicPress patterns

---

## Integration Points

### With `modules/realtime`

- Extend WebSocket server with device rooms
- Share connection management
- Share authentication logic
- Share scaling infrastructure

### With `modules/api`

- Use authentication/authorization
- Use permission checking
- Extend API routes
- Use record management for session linking

### With `modules/storage`

- Use Storage Manager for file storage
- Use file verification
- Link files to session records

### With `modules/workflows`

- Add workflow triggers
- Add workflow actions
- Enable automation

### With `modules/ui`

- Add UI components to records editor
- Display device status
- Control recording

---

## Testing Strategy

### Unit Tests

- Models (100% coverage)
- Services (90% coverage)
- API handlers (90% coverage)
- WebSocket handlers (90% coverage)

### Integration Tests

- Device enrollment flow
- Session control flow
- Upload processing flow
- WebSocket communication
- Workflow integration

### E2E Tests

- Complete recording workflow
- Error scenarios
- Reconnection scenarios

### Mock Broadcast Box

Use `MockBroadcastBox` class for testing without hardware.

---

## Implementation Timeline

**Total**: ~17 weeks (4 months)

- **Phase 1-2**: Core infrastructure (4 weeks)
- **Phase 3-4**: Device & session management (4 weeks)
- **Phase 5-6**: Upload & UI (4 weeks)
- **Phase 7-8**: Workflow & testing (4 weeks)
- **Phase 9-10**: Security & documentation (1 week)

---

## Questions & Support

For questions about:

- **Protocol**: See `docs/websocket-protocol.md` in Broadcast Box repo
- **Architecture**: See `docs/architecture-proposal.md` in Broadcast Box repo
- **Integration**: See `docs/specs/session-recorder-integration.md` in
  CivicPress repo

---

## Next Steps

1. **Review** all specification documents
2. **Copy** documents to CivicPress project
3. **Set up** module structure
4. **Begin** Phase 1 implementation
5. **Track** progress using checklist

---

**Status**: Ready for implementation  
**Last Updated**: 2025-01-30
