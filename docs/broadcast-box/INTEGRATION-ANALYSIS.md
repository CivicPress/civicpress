# Broadcast Box Integration - Architecture Analysis & Questions

**Status**: Analysis & Planning  
**Date**: 2025-01-30  
**Purpose**: Identify integration points, compatibility issues, and questions
before implementation

---

## Executive Summary

This document analyzes the broadcast-box module specification against CivicPress
architecture to identify:

1. **Compatibility issues** that need resolution
2. **Integration points** with existing CivicPress systems
3. **Architectural decisions** required before implementation
4. **Questions** that need answers to reach 95% confidence

---

## Key Findings

### ✅ Compatible Design Decisions

1. **Storage Integration**: The spec correctly identifies using
   `modules/storage` with UUID-based file system
2. **Session Records**: Session records exist in CivicPress with `media` field
   for recordings
3. **Workflow Integration**: Workflow engine exists and supports hooks/triggers
4. **File Attachments**: System supports linking files to records via
   `attached_files` JSON column
5. **API Structure**: Follows `/api/v1/` prefix convention

### ⚠️ Compatibility Issues Identified

1. **Realtime Module Doesn't Exist**: `modules/realtime` is only a spec, not
   implemented
2. **No Organization ID**: CivicPress is single-tenant; `organization_id` field
   doesn't exist
3. **Database Schema**: Uses TEXT for JSON instead of JSONB (PostgreSQL
   compatibility)
4. **Workflow Engine**: Simpler than spec suggests; may need extension
5. **Service Registration**: Must register all services in DI container
6. **Error Handling**: Must use unified error hierarchy (`CivicPressError`)
7. **Output Functions**: Must use centralized output (`coreInfo`, `coreError`,
   etc.)

---

## Critical Questions

### 1. WebSocket Server Architecture

**Question**: Should we build `modules/realtime` first, or create a separate
WebSocket server for broadcast-box?

**Context**:

- `modules/realtime` spec exists but is not implemented
- Spec is designed for collaborative editing (yjs documents)
- Broadcast-box needs device-specific rooms: `device:<deviceId>`
- Realtime spec mentions future room types: `consultation:<id>`,
  `dashboard:<id>`

**Options**:

- **Option A**: Build `modules/realtime` first as generic WebSocket
  infrastructure, then extend with device rooms
- **Option B**: Build broadcast-box WebSocket server separately, design it to be
  merged into realtime later
- **Option C**: Build broadcast-box WebSocket server as part of
  `modules/broadcast-box`, make it reusable

**Recommendation**: **Option A** - Build `modules/realtime` as generic
infrastructure first, then extend with device rooms. This aligns with the spec's
recommendation and provides shared infrastructure for future features.

**Decision Needed**: Which option should we pursue?

---

### 2. Organization/Multi-Tenancy

**Question**: How should we handle device isolation if CivicPress is
single-tenant?

**Context**:

- Spec uses `organization_id` in database schema
- CivicPress appears to be single-tenant per deployment
- No `organizations` table exists in database
- Devices need to be isolated per deployment

**Options**:

- **Option A**: Remove `organization_id` field entirely (single deployment =
  single org)
- **Option B**: Keep field but always set to a constant (e.g., `'default'`)
- **Option C**: Add organizations table for future multi-tenancy support

**Recommendation**: **Option A** - Remove `organization_id` since CivicPress is
single-tenant. If multi-tenancy is needed later, it can be added as a breaking
change.

**Decision Needed**: Confirm single-tenant assumption and preferred approach.

---

### 3. Database Schema Compatibility

**Question**: Should we use JSONB for PostgreSQL compatibility or TEXT for
SQLite compatibility?

**Context**:

- Spec uses TEXT for JSON columns (SQLite-compatible)
- CivicPress supports both SQLite and PostgreSQL
- PostgreSQL has native JSONB support with better performance
- Migration file has commented PostgreSQL JSONB conversion

**Options**:

- **Option A**: Use TEXT (SQLite-compatible), convert to JSONB in PostgreSQL
  adapter
- **Option B**: Use JSONB in PostgreSQL, TEXT in SQLite (adapter handles
  conversion)
- **Option C**: Use separate migration files for SQLite vs PostgreSQL

**Recommendation**: **Option B** - Let database adapter handle JSON/JSONB
conversion. Check how other tables handle JSON in CivicPress.

**Decision Needed**: How does CivicPress currently handle JSON columns in
database schema?

---

### 4. Session Record Media Field Structure ✅

**Question**: How should we structure media links in session records?

**Context**:

- Session records have `media` field (object) with properties: `livestream`,
  `recording`, `minutes`, `transcript`, `agenda`
- File attachment system uses `attached_files` JSON array with UUID references
- Broadcast-box uploads create files in storage system with UUIDs
- Need to link recordings to session records

**Decision**: **Option C - Hybrid Approach** ✅

Store recording UUID in both places:

- `media.recording`: UUID string for quick, direct access
- `attached_files`: Full entry with category "recording" for rich metadata and
  UI integration

**Rationale**:

- Quick access via `media.recording` (common use case)
- Full attachment system features via `attached_files` (UI, metadata,
  categorization)
- Backward compatible with existing `media` schema
- Future flexibility (multiple recordings via `attached_files`)
- Both fields must contain same UUID (implementation ensures sync)

**Implementation**: See `linkRecordingToSession()` function in spec.

---

### 5. Workflow Integration Pattern

**Question**: How should broadcast-box workflows integrate with existing
workflow engine?

**Context**:

- Workflow engine exists in `core/src/workflows/workflow-engine.ts`
- Uses hooks system (`HookSystem`) for event triggers
- Spec mentions workflow triggers: `onSessionCreated`, `onSessionStart`,
  `onSessionEnd`
- Workflow engine is simpler than spec suggests (basic registration system)

**Options**:

- **Option A**: Use hook system to trigger workflow scripts in
  `data/.civic/workflows/`
- **Option B**: Extend workflow engine with broadcast-box specific methods
- **Option C**: Create workflow actions that can be called from hooks

**Recommendation**: **Option A** - Use existing hook system. Emit hooks like
`record:created` (when session created), `broadcast-box:session:started`, etc.
Let workflow scripts handle the logic.

**Decision Needed**: Confirm hook-based workflow pattern is correct.

---

### 6. Device Authentication & Authorization

**Question**: How should devices authenticate and what permissions are needed?

**Context**:

- Devices need JWT tokens for WebSocket connections
- Spec mentions device enrollment with enrollment codes
- Need to distinguish device authentication from user authentication
- Permissions needed: `broadcast_box.devices.view`,
  `broadcast_box.sessions.control`, etc.

**Options**:

- **Option A**: Create separate device authentication system (device JWT tokens)
- **Option B**: Use existing user auth system, create "device" users
- **Option C**: Extend auth system to support device tokens

**Recommendation**: **Option A** - Create separate device authentication.
Devices are not users. Use device-specific JWT tokens issued during enrollment.

**Decision Needed**: Confirm device authentication approach and permission
model.

---

### 7. Service Registration & DI Container

**Question**: How should broadcast-box services be registered in DI container?

**Context**:

- CivicPress uses DI container for service management
- All services must be registered
- Need to register: DeviceManager, SessionController, UploadProcessor,
  WebSocketHandler
- Services depend on: DatabaseService, StorageManager, AuthService, etc.

**Options**:

- **Option A**: Register all services in `modules/broadcast-box/src/index.ts`
- **Option B**: Create service registration file similar to other modules
- **Option C**: Auto-register via module discovery

**Recommendation**: **Option B** - Follow existing module patterns. Check how
`modules/storage` or `modules/api` register services.

**Decision Needed**: What's the standard pattern for module service
registration?

---

### 8. Error Handling

**Question**: How should broadcast-box errors integrate with unified error
handling?

**Context**:

- CivicPress uses unified error hierarchy (`CivicPressError` base class)
- Domain-specific errors extend base class
- Spec defines error codes: `SESSION_ALREADY_ACTIVE`, `DEVICE_NOT_FOUND`, etc.

**Options**:

- **Option A**: Create `BroadcastBoxError` extending `CivicPressError`
- **Option B**: Use existing error types with broadcast-box specific codes
- **Option C**: Create domain-specific errors: `DeviceError`, `SessionError`,
  `UploadError`

**Recommendation**: **Option C** - Create domain-specific errors extending
`CivicPressError`. Follow pattern used in other modules.

**Decision Needed**: Confirm error handling pattern and check existing error
hierarchy.

---

### 9. Upload Chunking & Resumable Uploads

**Question**: How should chunked/resumable uploads integrate with storage
system?

**Context**:

- Storage system supports `uploadFileStream()` for large files
- Spec requires chunked/resumable uploads
- Need to track upload progress
- Need to verify file integrity (hash checking)

**Options**:

- **Option A**: Extend storage system with chunked upload support
- **Option B**: Handle chunking in broadcast-box module, use storage for final
  file
- **Option C**: Use existing storage stream API, handle chunking at API layer

**Recommendation**: **Option B** - Handle chunking in broadcast-box module.
Reassemble chunks, then use storage system's `uploadFileStream()` for final
upload. Storage system doesn't need to know about chunks.

**Decision Needed**: Confirm approach and check if storage system needs
extension.

---

### 10. Session Status Lifecycle ✅

**Question**: How should broadcast-box session status map to CivicPress session
record status?

**Context**:

- Broadcast-box sessions have status: `pending`, `recording`, `stopping`,
  `encoding`, `uploading`, `complete`, `failed`
- CivicPress session records have status: `draft`, `scheduled`, `live`, `ended`,
  `archived`
- Need to sync status between broadcast-box and CivicPress session records

**Decision**: **Event-Driven Status Mapping with Workflow Automation** ✅

**Approach**:

1. **Keep statuses separate**: Technical status in `broadcast_sessions`,
   business status in `records`
2. **Emit hook events**: When broadcast-box status changes, emit
   `broadcast-box:session:status_changed`
3. **Workflow handles mapping**: Workflow scripts decide if business status
   should change
4. **Store in metadata**: Keep broadcast-box status in session record metadata
   for reference
5. **Respect manual overrides**: Business status changes by clerks take
   precedence

**Status Mapping**:

- `recording` → `live` (when recording starts, session is live)
- `complete` → `ended` (when recording complete, session ended)
- `failed` → No change (error doesn't change business state)
- Internal states (`pending`, `stopping`, `encoding`, `uploading`) → No change

**Implementation**: See Session Status Lifecycle section in spec.

---

## Integration Points Summary

### ✅ Confirmed Integration Points

1. **Storage System**: Use `CloudUuidStorageService` for file uploads
2. **Database**: Use `DatabaseService` for all database operations
3. **API Module**: Extend `modules/api` with broadcast-box endpoints
4. **Hook System**: Use `HookSystem` for workflow triggers
5. **Record Manager**: Link recordings to session records via `media` field and
   `attached_files`
6. **Auth System**: Extend for device authentication (separate from user auth)

### ⚠️ Integration Points Needing Clarification

1. **Realtime Module**: Build first or separate WebSocket server?
2. **Workflow Engine**: Use hooks or extend workflow engine?
3. **Error Handling**: Confirm error hierarchy pattern
4. **Service Registration**: Confirm DI container registration pattern
5. **Upload System**: Confirm chunking approach

---

## Recommended Architecture Adjustments

### 1. Database Schema Changes

**Remove**:

- `organization_id` field (single-tenant assumption)

**Add**:

- PostgreSQL JSONB support in adapter
- Proper foreign key constraints
- Indexes for performance

### 2. WebSocket Server

**Decision**: Build `modules/realtime` as generic infrastructure first, then
extend with device rooms.

**Structure**:

```
modules/realtime/
├── src/
│   ├── server.ts              # WebSocket server
│   ├── auth.ts                # Authentication
│   ├── rooms/
│   │   ├── index.ts           # Room manager
│   │   ├── record-room.ts     # Record collaboration rooms
│   │   └── device-room.ts     # Device rooms (broadcast-box)
│   └── types/
│       └── messages.ts        # Message types
```

### 3. Service Structure

**Follow CivicPress patterns**:

- Register services in DI container
- Use unified error handling
- Use centralized output functions
- Use Saga pattern for multi-step operations (if needed)

---

## Next Steps

1. **Answer Questions**: Get answers to all 10 questions above
2. **Update Specs**: Update broadcast-box specs based on answers
3. **Create Implementation Plan**: Detailed phase-by-phase plan
4. **Update Documentation**: Align all docs with CivicPress architecture
5. **Begin Implementation**: Start with Phase 1 (Core Infrastructure)

---

## Questions Summary & Answers

1. ✅ **WebSocket server architecture**: **Same server** - Broadcast-box uses
   same infrastructure as other realtime features (extend `modules/realtime`)
2. ✅ **Organization/multi-tenancy**: **Keep organization_id** - Reserved for
   future multi-tenancy (Phase 7+), default to 'default' for now
3. ✅ **Database schema**: **TEXT for JSON** - Use TEXT (SQLite-compatible),
   parse with JSON.parse() (matches CivicPress pattern)
4. ✅ **Session media field structure**: **Hybrid approach** - UUID in both
   `media.recording` and `attached_files` (see SESSION-MEDIA-ANALYSIS.md)
5. ✅ **Workflow integration**: **Extend workflow engine** - Add new rules and
   features to workflow engine
6. ✅ **Device authentication**: **Yes** - Separate device authentication system
   (device JWT tokens)
7. ✅ **Service registration**: **Yes** - Use DI container pattern
   (registerBroadcastBoxServices function)
8. ✅ **Error handling**: **Use CivicPress pattern** - Extend CivicPressError
   with domain-specific errors
9. ✅ **Upload chunking**: **Local storage/tmp folder** - Handle chunks in
   `.system-data/tmp/uploads/:uploadId/` before final upload
10. ✅ **Session status lifecycle**: **Event-driven status mapping** - Keep
    statuses separate, use workflow automation (see
    SESSION-STATUS-LIFECYCLE-ANALYSIS.md)

---

**Status**: Specs updated with answers  
**Next Action**:

- Complete analysis for questions 4, 9, 10 in second review
- Begin Phase 1 implementation (Core Infrastructure)
