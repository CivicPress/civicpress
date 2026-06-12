# Realtime Module Deployment Guide

## Overview

This guide covers deploying the CivicPress realtime module (collaborative record
editing over a binary y-protocols Yjs WebSocket) in production.

## Hosting model (as shipped)

The realtime server runs **in-process with the API**: the same Node process that
serves the REST API also hosts the realtime WebSocket server. It listens on its
**own port** (default `3001`) — it does *not* share the API's HTTP listener
(`3000`). Because the two are one process, the API can call the realtime server
directly in-memory; that is what the `POST /api/v1/records/:id/snapshot` endpoint
relies on.

There is no separate "realtime service" binary or `civic realtime …` CLI command
in the shipped build. Starting the API starts realtime:

```bash
# from the repo root — boots the API on 3000 and realtime on 3001
pnpm run dev:api
```

Startup is config-gated and crash-safe:

- If `realtime.enabled` is `false`, the WS server is never started (the rest of
  the API runs normally).
- If realtime fails to start (e.g. its port is already in use), the error is
  logged and **swallowed** — it must not crash the API. The snapshot endpoint
  then degrades gracefully (no in-memory room → `snapshotCreated: false`).
- An explicit env opt-out is also honored at bootstrap (the API can skip
  realtime entirely without touching the config file).

> A `standalone-realtime.mjs` script exists for running the WebSocket server from
> core *without* the REST API (it still requires `@civicpress/core` to be
> initialized). It is a development/diagnostic aid, not the recommended
> production topology. See `STANDALONE.md`.

## Prerequisites

- CivicPress core initialized and running (realtime uses core's `AuthService`,
  `RecordManager`, `DatabaseService`, and `HookSystem`).
- A database for snapshot storage (CivicPress uses SQLite by default; snapshots
  live in the `realtime_snapshots` table).
- Network access to the WebSocket port (default `3001`).

## Configuration

Configuration lives at `.system-data/realtime.yml`, nested under a top-level
`realtime:` key. If the file is absent, built-in defaults are used. The fields
below are the **actual** `RealtimeConfig` fields (see
`src/types/realtime.types.ts` and `src/realtime-config-manager.ts`).

```yaml
# .system-data/realtime.yml
realtime:
  enabled: true            # master on/off for the in-process WS server
  port: 3001               # WebSocket port (separate from the API's HTTP port)
  host: '0.0.0.0'          # bind address; use a specific IP in production
  path: '/realtime'        # base path; record rooms live at /realtime/records/:id

  rooms:
    max_rooms: 100         # cap on concurrently-open collaboration rooms
    cleanup_timeout: 3600  # seconds; idle-room cleanup timeout
    grace_period_ms: 300000  # ms; keep a room's Yjs state in memory this long
                             # after the last client disconnects, so a reconnect
                             # within the window resumes without data loss
                             # (default 5 min)

  snapshots:
    enabled: true          # whether to persist Yjs snapshot blobs at all
    interval: 300          # seconds; periodic snapshot + Markdown-writeback cadence
                           # (0 disables the periodic timer)
    max_updates: 100       # update-count threshold hint
    storage: 'database'    # 'database' (recommended) or 'filesystem'

  rate_limiting:
    messages_per_second: 10  # per-client inbound message cap; exceeding it
                             # closes the connection with code 1008
    connections_per_ip: 100  # per-IP connection cap (close code 4029)
    connections_per_user: 10 # per-user connection cap (close code 4029)

  # Optional. Background sweep that closes connections idle past a threshold.
  connection_cleanup:
    enabled: true
    check_interval: 60     # seconds between sweeps
    stale_threshold: 600   # seconds; close connections idle longer than this
```

### Fields that do NOT exist

Earlier drafts of this guide documented configuration knobs that are **not**
part of `RealtimeConfig`. Do not add them — they are silently ignored:

- `realtime.tls.*` — TLS is **not** terminated in the realtime process; see
  "Transport security" below.
- `realtime.allowed_origins` — there is no built-in WS origin allowlist; do
  origin filtering at the reverse proxy.
- `realtime.redis.*` — there is no Redis/multi-node adapter; see "Scaling".

### Constants (not configurable)

A few snapshot behaviours are code constants, not YAML fields:

- **Snapshot TTL** — `SNAPSHOT_TTL_MS = 48h`. Snapshot rows older than 48h whose
  room is no longer active are deleted by the cleanup sweep.
- **Cleanup sweep interval** — the TTL sweep runs every **6h** (and once at
  startup).
- **Oversize warning threshold** — `MAX_SNAPSHOT_BYTES`. Oversize snapshots are
  **warned about, not rejected** (a `realtime:snapshot:oversize` hook fires; the
  blob still persists).

## Transport security (TLS / WSS)

The realtime server does **not** terminate TLS. Terminate TLS at a reverse proxy
(nginx, Caddy, etc.) and proxy the WebSocket upgrade to the realtime port.
Clients then connect over `wss://`.

Example nginx location for the realtime upgrade:

```nginx
location /realtime/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 3600s;   # keep long-lived collab sockets open
}
```

Do origin restriction and any IP allowlisting here at the proxy as well.

## Environment variables

```bash
# Data directory (Markdown records, Git repo)
CIVIC_DATA_DIR=/var/lib/civicpress/data

# System data directory (holds .system-data/realtime.yml)
CIVIC_SYSTEM_DATA_DIR=/var/lib/civicpress/.system-data

# Logging
LOG_LEVEL=info  # debug | info | warn | error
```

## Process management

Because realtime is in-process with the API, run and supervise the **API
process**; there is no separate realtime daemon to manage.

### systemd

`/etc/systemd/system/civicpress-api.service`:

```ini
[Unit]
Description=CivicPress API (hosts the in-process realtime server)
After=network.target

[Service]
Type=simple
User=civicpress
WorkingDirectory=/opt/civicpress
ExecStart=/usr/bin/node /opt/civicpress/modules/api/dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=CIVIC_DATA_DIR=/var/lib/civicpress/data
Environment=CIVIC_SYSTEM_DATA_DIR=/var/lib/civicpress/.system-data

[Install]
WantedBy=multi-user.target
```

Ensure the reverse proxy fronts both the API HTTP port and the realtime WS port,
and that the realtime port (`3001`) is reachable from the proxy but not exposed
directly to the public internet.

## Scaling

### Single node (the shipped topology)

- The default configuration targets single-node deployment; room state is held
  in the API process's memory.
- Watch connection counts and room counts; tune `rooms.max_rooms`,
  `rate_limiting.connections_per_ip`, and `connections_per_user` to your load.

### Multi-node

There is **no** multi-node / shared-state adapter in this build — room Yjs state
is per-process. A Redis (or similar) pub/sub adapter for multi-node fan-out is a
documented future option, not a shipped feature. Run realtime on a single node
(or pin record rooms to a node) until that lands.

## Monitoring & observability

### Health status

The realtime server exposes a structured health snapshot:

```typescript
const health = realtimeServer.getHealthStatus();
// { status, server: { listening, port, host },
//   connections: { total, perUser, perIP },
//   rooms: { total, maxRooms },
//   rateLimiting: { activeClients, messagesPerSecond }, memory? }
```

### What to watch

- Active WebSocket connections (total / per-IP / per-user).
- Active room count vs. `max_rooms`.
- Snapshot hook events: `realtime:snapshot:oversize`,
  `realtime:snapshot:integrity-failed`, `realtime:snapshot:expired`, and the
  writeback failure hook `realtime:snapshot:writeback-failed`.
- Close-code rates (`4001`/`4003`/`4029`/`1008`) as a signal of auth, permission,
  capacity, or abuse problems.

## Snapshots, durability & recovery

**The durable civic archive is the Markdown in Git, not the snapshot.**
Snapshots are an ephemeral merge-aid for fast reconnection:

- Each snapshot row records `integrity_hash` (sha256 of the blob, verified on
  load), `format_version` (a newer value than the server understands is
  discarded), `byte_size`, and `created_at`.
- On load, a hash mismatch or a too-new format version causes the server to
  **fall back to re-seeding the room from the record's Markdown** rather than
  trusting a corrupt/incompatible blob.
- Snapshot rows are TTL-cleaned after 48h of inactivity; the Markdown stays in
  Git indefinitely.

The collaborative content itself is written back through the **record-draft
pipeline** (`record_drafts.markdown_body`, authored `realtime-snapshot`), not
committed to Git automatically — a human publish is what turns a draft into a Git
commit. See the architecture spec for the full writeback model.

### Backup strategy

- **Database storage** (recommended): include the database in your normal
  backups. The `realtime_snapshots` table is ephemeral and need not be preserved
  — losing it only forces a re-seed from Markdown. The durable data is the
  `record_drafts` table (in-flight collaborative drafts) and the Git repo.
- **Filesystem storage**: snapshot blobs (and `.meta.json` sidecars) are written
  under the realtime snapshot directory; same ephemerality applies.

## Troubleshooting

### Clients cannot connect

- Verify the API process is up and `realtime.enabled` is true.
- Confirm the reverse proxy forwards the WebSocket upgrade to port `3001` and
  the `path` (`/realtime`) matches.
- Check auth token validity and that the user has `records:view` on the record.
- Check the API logs for "Failed to start in-process realtime server".

### High CPU / memory

- Reduce `rooms.max_rooms`.
- Tighten `rate_limiting` thresholds.
- Lower `rooms.grace_period_ms` so abandoned rooms finalize and evict sooner.

### Snapshots not being created

- Confirm `snapshots.enabled` is true and `snapshots.interval > 0`.
- Check database/filesystem permissions and free space.
- Look for `realtime:snapshot:*` hook events / warnings in the logs.

## Security checklist

- [ ] TLS terminated at the reverse proxy; clients connect over `wss://`.
- [ ] Realtime port (`3001`) reachable from the proxy only, not the public net.
- [ ] Origin restriction configured at the proxy.
- [ ] `rate_limiting` thresholds set for your traffic.
- [ ] `connections_per_ip` / `connections_per_user` caps set.
- [ ] Auth tokens validated (handled by core `AuthService`).
- [ ] Logging configured (no sensitive data; tokens never logged).

## Reference

- [Testing Guide](./TESTING.md)
- [Architecture Spec](../../docs/specs/realtime-architecture.md)
- [Standalone (dev/diagnostic) runner](./STANDALONE.md)
- Config types: `modules/realtime/src/types/realtime.types.ts`
- Config defaults/validation: `modules/realtime/src/realtime-config-manager.ts`
