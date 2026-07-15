/**
 * In-process realtime bootstrap.
 *
 * The realtime collaborative-editing server runs IN-PROCESS with the API: the
 * same Node process that serves the REST API also hosts the realtime WebSocket
 * server. The WS server listens on its OWN port (from RealtimeConfig, default
 * 3001) — it does NOT share the API's HTTP listener — but because they are one
 * process, the API can call the realtime server directly in-memory (this is
 * what the `POST /records/:id/snapshot` endpoint relies on).
 *
 * This module owns:
 *  - {@link RealtimeServerLike}: the NARROW interface the router layer depends
 *    on, so route handlers never import `@civicpress/realtime` types.
 *  - {@link startInProcessRealtime}: constructs + starts the realtime server
 *    from the core services the API already holds, config-gated and crash-safe.
 */

import type { CivicPress, Logger } from '@civicpress/core';
import {
  createRealtimeServer,
  type RealtimeServer,
} from '@civicpress/realtime';

/**
 * The only realtime capability the records router needs: trigger a snapshot for
 * a record and report back what happened. Declaring it here (rather than
 * importing the concrete `RealtimeServer`) keeps the route layer decoupled from
 * the realtime module — the API bootstrap is the single place that takes a
 * runtime dependency on `@civicpress/realtime`.
 */
export interface RealtimeServerLike {
  triggerRecordSnapshot(recordId: string): Promise<{
    snapshotCreated: boolean;
    version: number | null;
    timestamp: number;
  }>;
}

/** Outcome of attempting to start the in-process realtime server. */
export interface RealtimeStartResult {
  /** The server instance, or null if realtime is disabled / failed to start. */
  server: RealtimeServer | null;
  /** True when the server was constructed AND initialize() resolved. */
  started: boolean;
}

/**
 * Construct and start the in-process realtime server using the API's existing
 * core services.
 *
 * Lifecycle contract:
 *  - Config gate: `RealtimeServer.initialize()` is itself gated on
 *    `RealtimeConfig.enabled` (default ON) and is a no-op when disabled, so the
 *    server is always constructed but only begins listening when enabled.
 *    Callers can additionally force-skip via the `enabled` arg (env-driven).
 *  - Crash safety: a startup failure (e.g. the realtime port is already in use)
 *    is logged and swallowed — it MUST NOT crash the API. In that case the
 *    returned `server` may be non-null but `started` is false; the snapshot
 *    endpoint then degrades gracefully (no in-memory room → snapshotCreated
 *    false).
 *
 * @param civicPress  Initialized core instance (provides the wired services).
 * @param logger      API logger for start/skip/failure reporting.
 * @param enabled     Hard on/off switch (default true). When false, realtime is
 *                    not even constructed — used to honor an explicit env
 *                    opt-out without depending on the realtime config file.
 */
export async function startInProcessRealtime(
  civicPress: CivicPress,
  logger: Logger,
  enabled: boolean = true
): Promise<RealtimeStartResult> {
  if (!enabled) {
    logger.info(
      'Realtime server disabled via configuration (REALTIME_ENABLED=false); skipping in-process start'
    );
    return { server: null, started: false };
  }

  // Build the server from the core services the API already holds. We use the
  // public accessors rather than core's (private) DI container; the realtime
  // module's createRealtimeServer mirrors registerRealtimeServices exactly.
  let server: RealtimeServer;
  try {
    server = createRealtimeServer(
      {
        logger,
        hookSystem: civicPress.getHookSystem(),
        authService: civicPress.getAuthService(),
        recordManager: civicPress.getRecordManager(),
        databaseService: civicPress.getDatabaseService(),
      },
      { dataDir: civicPress.getDataDir() }
    );
  } catch (error) {
    logger.error(
      'Failed to construct in-process realtime server; continuing without realtime:',
      error
    );
    return { server: null, started: false };
  }

  // initialize() loads config, gates on `enabled`, and (if enabled) starts the
  // WS server on its own port. A port-in-use error here must not take down the
  // API, so we isolate it.
  try {
    await server.initialize();
    logger.info('In-process realtime server started');
    return { server, started: true };
  } catch (error) {
    logger.error(
      'Failed to start in-process realtime server (e.g. port in use); the API will run without realtime:',
      error
    );
    // Best-effort teardown of any partially-initialized state.
    try {
      await server.shutdown();
    } catch {
      // ignore — server may never have started listening
    }
    return { server, started: false };
  }
}
