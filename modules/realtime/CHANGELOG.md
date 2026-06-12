# Realtime Module Changelog

## 2025-01-30 - Service Separation

### Changed

- **Default behavior**: API and realtime now run separately by default for
  better debugging
- API server disables realtime module via `CIVIC_REALTIME_ENABLED=false`
- Realtime runs as standalone service via `pnpm run dev:realtime`

### Added

- `pnpm run dev` - Starts all 3 services (API, WS, UI) separately
- `pnpm run dev:api:with-realtime` - Bundled mode (API + realtime together)
- Environment variable `CIVIC_REALTIME_ENABLED` to control realtime
  initialization

### Benefits

- ✅ Clear log separation (each service in its own terminal)
- ✅ Independent restarts (restart one without affecting others)
- ✅ Better debugging (easier to isolate issues)
- ✅ Matches UI pattern (consistency)

### Migration

- **Old**: `pnpm run dev:api` started API + realtime together
- **New**: `pnpm run dev:api` starts API only (realtime disabled)
- **New**: `pnpm run dev:realtime` starts realtime standalone
- **New**: `pnpm run dev` starts all 3 services separately
- **Bundled**: `pnpm run dev:api:with-realtime` for old behavior
