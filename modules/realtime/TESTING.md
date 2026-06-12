# Realtime — Operator Testing Guide

This guide is for operators verifying that a deployed CivicPress realtime
server is reachable and protocol-compliant.

Document edits and presence travel as **binary y-protocols** (Yjs CRDT over
WebSocket): the binary `SYNC` and `AWARENESS` frames. The old JSON **document**
protocol (a JSON `{ "type": "sync" }` update / `room_state`) was removed in
Phase 3 — do not expect it. A few JSON **control/lifecycle** frames remain:
`control`/`connection.ack` on connect, `control`/`error` on a rejected message,
and an optional client-initiated `ping` → `pong` keep-alive.

The realtime server runs **in-process with the API** (same Node process) but
listens on its **own WebSocket port** (default `3001`, separate from the API's
HTTP port `3000`). See `DEPLOYMENT.md` for the hosting model.

## Prerequisites

1. Build the workspace (realtime depends on `@civicpress/core` and
   `@civicpress/editor-schema`):

   ```bash
   # from the repo root
   pnpm install
   pnpm -r build
   ```

2. Start the API process — it boots the in-process realtime server when
   `realtime.enabled` is true (the default):

   ```bash
   pnpm run dev:api
   ```

   The API serves HTTP on `3000`; the realtime WebSocket server listens on
   `3001`.

3. Have an authentication token and an existing record id. Obtain a session
   token through your normal auth flow, e.g.:

   ```bash
   curl -X POST http://localhost:3000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "admin", "password": "your-password"}'
   ```

   The realtime server validates the token via `AuthService.validateSession`
   and requires `records:view` (and `records:edit` to edit) on the target
   record.

## Authentication

The server's `extractToken` (`src/auth.ts`) accepts the token three ways, in
priority order:

1. `Authorization: Bearer <token>` header — Node.js clients.
2. `Sec-WebSocket-Protocol: auth.<token>` subprotocol — browser clients (a
   browser cannot set arbitrary headers on a WebSocket).
3. `?token=<token>` query string — **deprecated**, kept for backward
   compatibility only; avoid in production (tokens leak into logs/URLs).

## Smoke test: is the server up?

`test-websocket.mjs` performs a real binary `SYNC` step-1/step-2 handshake. It
connects with the `auth.<token>` subprotocol, sends `SYNC step 1`, processes the
server's reply, then closes.

```bash
WS_URL=ws://localhost:3001 \
  TOKEN=<session-token> \
  RECORD_ID=<existing-record-id> \
  node modules/realtime/test-websocket.mjs
```

Expected output:

```
[ok] connected to ws://localhost:3001/realtime/records/<id>
[->] sent SYNC step 1
[<-] received SYNC message; local doc state size: N bytes
[ok] smoke test complete
[ok] closed: code=1000 reason=none
```

If the connection is rejected, the server closes with a 4xxx code instead of
opening — see "Close codes" below.

## Multi-client convergence

Open the same record in two terminals with two valid tokens:

```bash
# Terminal 1
WS_URL=ws://localhost:3001 TOKEN=$JWT_A RECORD_ID=R1 \
  node modules/realtime/test-websocket.mjs

# Terminal 2
WS_URL=ws://localhost:3001 TOKEN=$JWT_B RECORD_ID=R1 \
  node modules/realtime/test-websocket.mjs
```

Expected: both connections are accepted and both receive a `SYNC` message. The
smoke client only does a single sync pass (it is a connectivity probe, not a
soak test); for true convergence testing use the integration suites below or
the browser editor.

## Close codes

These are the codes the server actually sends (verified against
`modules/realtime/src/realtime-server.ts`). The 4xxx codes carry a JSON reason
payload of the form `{"code":"<NAME>", ...context}`.

| Code | Name                        | Meaning                                                                   |
|-----:|-----------------------------|--------------------------------------------------------------------------|
| 1000 | (normal)                    | Normal closure (the smoke client closes this way).                       |
| 1008 | (policy violation)          | Per-client message rate limit exceeded (`rate_limiting.messages_per_second`). Reason: `Rate limit exceeded`. |
| 4001 | `AUTH_FAILED`               | Token missing, expired, or invalid.                                      |
| 4003 | `PERMISSION_DENIED`         | User lacks `records:view`/`records:edit`, **or** the record/draft does not exist (reason context `record_not_found`). |
| 4004 | `ROOM_TYPE_NOT_REGISTERED`  | The URL room type has no registered handler (e.g. anything other than `records` on a server that only registered the records handler). |
| 4029 | `CONNECTION_LIMIT_EXCEEDED` | Per-IP or per-user connection cap reached (`rate_limiting.connections_per_ip` / `connections_per_user`). |

Notes:

- There is **no** dedicated "room not found" code — a missing record surfaces
  as `4003 PERMISSION_DENIED` with `record_not_found` in the reason context.
- Malformed handshakes (no token, unparseable room URL) and unexpected server
  exceptions during connection are closed **without** an explicit application
  code (a bare `ws.close()` → standard `1006`/`1005`), after an error frame is
  sent. They are not assigned a 4xxx code.
- The codes `4013`, `4500`, and `4503` do **not** exist in the as-shipped
  server, despite appearing in earlier draft docs. Do not rely on them.

## Integration tests

The realtime module ships vitest suites that exercise the binary protocol,
connection limits, snapshot persistence, and the Markdown writeback against an
in-memory/throwaway server and database. Run them from the repo root:

```bash
# realtime module unit + integration suites
pnpm -C modules/realtime test:run
```

This covers, among others:

- `connection-limits.test.ts` — per-IP / per-user limit enforcement (closes
  realtime-001 + realtime-002); asserts the `4029` / `4001` close codes.
- `snapshot-manager.test.ts` — snapshot round-trip, integrity-hash verification,
  format-version gate, oversize-warning, and TTL cleanup.
- `record-room-handler.test.ts` — the Markdown-writeback handler (serialize →
  draft) and its per-room coalescing mutex.

The repo-level realtime exit-criterion tests live in `tests/realtime/` and are
run as part of the root test run (Vitest):

```bash
pnpm run test   # or: npx vitest run tests/realtime
```

- `tests/realtime/exit-criterion-offline-edit-reconnect.test.ts` — edit while
  disconnected, reconnect, converge (no lost edits).
- `tests/realtime/exit-criterion-collab-writes-markdown.test.ts` — a
  collaborative edit is serialized and written back as a record **draft**
  (validated against a real database).

## Snapshot inspection

> There is currently **no** CLI command for inspecting realtime snapshot rows
> (no `civic realtime …` subcommand exists). Snapshots are an ephemeral
> merge-aid, not an operator-managed artifact. To inspect them ad hoc, query the
> database directly:
>
> ```sql
> SELECT room_id, version, byte_size, format_version, integrity_hash, created_at
> FROM realtime_snapshots
> ORDER BY created_at DESC
> LIMIT 20;
> ```
>
> (Filesystem-storage mode writes the blob plus a `<...>.meta.json` sidecar
> under the snapshot directory instead.) A dedicated inspect command may be
> added in a future phase; it is not implemented today.

## Troubleshooting

### Connection refused

- Confirm the API process is running and that `realtime.enabled` is true.
- The realtime server listens on its own port (default `3001`), not the API's
  `3000`. Check `lsof -i :3001`.
- A realtime startup failure (e.g. the port is already in use) is logged and
  swallowed so it never crashes the API — check the API logs for
  "Failed to start in-process realtime server".

### Closes immediately with 4001 / 4003

- `4001`: the token is missing/expired/invalid, or was not delivered the way the
  server expects (use `auth.<token>` subprotocol or `Bearer` header).
- `4003`: the authenticated user lacks permission on the record, **or** the
  record id does not exist (no published record and no draft row).

### Module not found

- Build the workspace: `pnpm -r build` (realtime needs `@civicpress/core` and
  `@civicpress/editor-schema` built).

## Reference

- [Deployment Guide](./DEPLOYMENT.md)
- [Architecture Spec](../../docs/specs/realtime-architecture.md)
- Close codes in source: `modules/realtime/src/realtime-server.ts`
- Auth/token extraction: `modules/realtime/src/auth.ts`
