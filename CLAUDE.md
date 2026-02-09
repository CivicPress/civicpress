# CivicPress - Agent Memory

## Project Overview

CivicPress is a civic technology platform for municipal document management,
collaborative editing, and public transparency. Monorepo with pnpm workspaces.

## Key Architecture

- **Monorepo**: pnpm workspaces (prefer `pnpm` over `npm` for all commands)
- **Core**: `core/` - Database, auth, records, search, errors, DI container
- **API**: `modules/api/` - Express REST API with saga pattern
- **UI**: `modules/ui/` - Nuxt 4 with Nuxt UI Pro, TipTap editor
- **Realtime**: `modules/realtime/` - WebSocket server with binary y-protocols
- **Broadcast Box**: `modules/broadcast-box/` - Device control for recording
  hardware (WebSocket device protocol, session recording, RTMP streaming)
- **Storage**: `modules/storage/` - Multi-provider file storage (local, S3,
  Azure, GCS)

## Realtime Module Details

The realtime server uses **binary y-protocols** (not JSON messages) for
collaborative editing:

- Server sends Yjs sync step 1 + step 2 on connection (binary)
- Clients send/receive binary sync updates (`YJS_MSG_SYNC = 0`) and awareness
  messages (`YJS_MSG_AWARENESS = 1`)
- Uses `lib0/encoding`, `lib0/decoding`, `y-protocols/sync` for binary encoding
- Legacy JSON message handlers (`sendRoomState`, `setupMessageHandlers`) were
  removed
- Room management: per-record Yjs documents with snapshot persistence
- Tests: 8 test files in `modules/realtime/src/__tests__/`, 111 total tests

## Testing

- **Framework**: Vitest
- **Run all**: `pnpm vitest run` (from repo root or module dir)
- **Run specific**: `pnpm vitest run src/__tests__/filename.test.ts`
- **Total**: 1291+ tests, 118 test files, 0 failures
- **Pre-commit hook**: Runs full test suite + lint-staged + build (can take
  ~200s)

### Skipped Tests

3 tests are intentionally skipped (`.skip()`) due to test database migration
timing — not production bugs:

- `tests/api/records.test.ts:454` — workflowState preservation on update
- `tests/api/records.test.ts:603` — workflowState in draft response
- `tests/integration/draft-publish-workflow.test.ts:29` — draft→publish with
  workflowState

See `docs/test-skip-decision.md` for details.

### Known Flaky Tests

- `tests/api/authorization.test.ts` — can be flaky under concurrency due to port
  conflicts; error guards were added to surface failures clearly
- `tests/api/records.test.ts` — occasionally flaky under heavy concurrent
  execution

## Documentation Structure

- **`docs/`** — Main documentation directory
  - `architecture.md` — Living architecture overview (single source of truth)
  - `architecture-diagrams.md` — Mermaid diagrams of system components
  - `project-status.md` — Current implementation status
  - `todo.md` — Task tracking and roadmap
  - `specs-index.md` — Index to all platform specifications
- **`docs/specs/`** — 50+ detailed specifications (API, CLI, auth, search, etc.)
- **`docs/architecture/decisions/`** — Architecture Decision Records (ADRs)
- **`docs/broadcast-box/`** — Broadcast Box module documentation

## Common Patterns

- **Error handling**: Domain-specific error hierarchy in `core/src/errors/`
- **Auth**: JWT tokens, simulated auth for dev/test (`/api/v1/auth/simulated`)
- **Config**: YAML files in `data/.civic/` and `.system-data/`
- **Database**: SQLite with Git integration
- **i18n**: English/French via `@nuxtjs/i18n`

## Important Notes

- Session expiration dates in tests must use future dates (not hardcoded past
  dates)
- `generateParticipantColor()` in `realtime-server.ts` is currently unused but
  retained
- Branch `broadcast-box` contains all realtime + broadcast-box feature work

## Broadcast Box UI Architecture

The single device page
(`modules/ui/app/pages/settings/broadcast-box/[id]/index.vue`) uses several
child components with shared state:

- **DevicePreview** — WebRTC live video preview with play/stop, mute, and
  recording controls (record button is in preview, not in ManualRecording card)
- **DeviceSourceControl** — Video/audio source dropdowns with multi-strategy
  matching. Virtual PiP option only added when `pipSupported` is explicitly true
- **DeviceManualRecording** — Mounted but hidden (`v-show="false"`); manages
  recording state via `useManualRecording` composable. Exposes state via
  `defineExpose` so the parent page can pass it as props to DevicePreview
- **Recordings list** — Rendered in a separate UCard on the page (not inside
  DeviceManualRecording) using template ref to access `manualRecordingRef` data

Key composables:

- `useManualRecording(deviceId, connectionStatus)` — recording start/stop,
  duration, recordings list
- `useDeviceCommands(deviceUuid)` — send commands to device (setSources, etc.)
- `useDevicePreview(deviceId, wsConnection, connectionStatus)` — WebRTC preview
  lifecycle
- `useDeviceConnectionStatus(deviceId)` — WebSocket connection status +
  real-time capabilities
