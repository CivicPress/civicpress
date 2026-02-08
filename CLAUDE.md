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
  hardware
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
- **Pre-commit hook**: Runs full test suite (can take ~200s)

## Common Patterns

- **Error handling**: Domain-specific error hierarchy in `core/src/errors/`
- **Auth**: JWT tokens, simulated auth for dev/test (`/api/v1/auth/simulated`)
- **Config**: YAML files in `data/.civic/` and `.system-data/`
- **Database**: SQLite with Git integration
- **i18n**: English/French via `@nuxtjs/i18n`

## Important Notes

- Session expiration dates in tests must use future dates (not hardcoded past
  dates)
- The authorization test (`tests/api/authorization.test.ts`) can be flaky when
  run concurrently due to port conflicts - error guards were added to surface
  failures clearly
- `generateParticipantColor()` in `realtime-server.ts` is currently unused but
  retained
- Branch `broadcast-box` contains all realtime + broadcast-box feature work
