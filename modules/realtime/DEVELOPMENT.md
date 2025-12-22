# Development Guide

## Running Services Separately

You have **3 independent services** that can run in separate terminals:

### Terminal 1: API Server (REST API)

```bash
pnpm run dev:api
# Runs on port 3000
# Includes realtime module (bundled for convenience)
```

### Terminal 2: UI Server (Frontend)

```bash
pnpm run dev:ui
# Runs on port 3030
# Connects to API on port 3000
```

### Terminal 3: Realtime Server (WebSocket) - Optional

```bash
pnpm run dev:realtime
# Or: pnpm run dev:ws
# Runs on port 3001
# Only needed if you want realtime separate from API
```

## Current Setup (Separated by Default)

**By default, API and realtime run separately** for better debugging:

```bash
# Terminal 1: API only
pnpm run dev:api
# ✅ REST API on 3000
# ❌ No WebSocket (realtime disabled)

# Terminal 2: Realtime standalone
pnpm run dev:realtime
# ✅ WebSocket on 3001

# Terminal 3: UI
pnpm run dev:ui
# ✅ Frontend on 3030
```

**Or use the convenience command to start all three:**

```bash
pnpm run dev
# Starts API, WS, and UI in separate processes
```

## Bundled Mode (Optional)

If you want the old bundled behavior (API + realtime together):

```bash
# Terminal 1: API with realtime bundled
pnpm run dev:api:with-realtime
# ✅ REST API on 3000
# ✅ WebSocket on 3001 (automatically started)

# Terminal 2: UI
pnpm run dev:ui
# ✅ Frontend on 3030
```

**Why separate by default?**

- ✅ Better debugging (clear log separation)
- ✅ Independent restarts (restart one without affecting the other)
- ✅ Matches UI pattern (consistency)
- ✅ Easier error isolation
- ✅ Can test services independently

**When to use bundled mode?**

- Quick testing (one command)
- Shared core instance (slightly more efficient)
- Simpler for basic development

## Service Dependencies

```
┌─────────────┐
│     UI      │  Port 3030
│  (Nuxt 4)   │  ──connects to──> API (port 3000)
└─────────────┘

┌─────────────┐
│     API     │  Port 3000
│  (Express)  │  ──includes──> Realtime (port 3001)
└──────┬──────┘     (bundled for convenience)
       │
       ▼
┌─────────────┐
│    Core     │
│ (CivicPress)│
└─────────────┘

┌─────────────┐
│  Realtime   │  Port 3001
│ (WebSocket) │  ──can run standalone──> Core
└─────────────┘
```

## Summary

| Service      | Port | Default Mode | Can Run Alone? |
| ------------ | ---- | ------------ | -------------- |
| **UI**       | 3030 | Separate     | ✅ Yes         |
| **API**      | 3000 | Separate     | ✅ Yes         |
| **Realtime** | 3001 | Separate     | ✅ Yes         |

**Default**: All 3 services run separately for better debugging.

**Convenience**: Use `pnpm run dev` to start all three together, or
`pnpm run dev:api:with-realtime` for bundled mode.
