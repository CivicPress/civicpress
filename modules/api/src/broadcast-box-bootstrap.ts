/**
 * In-process broadcast-box bootstrap (BroadcastBox Phase 5).
 *
 * Mounts the optional `broadcast-box` module into the running API, mirroring the
 * realtime/transcription launchers:
 *  - config-gated: only mounts when `broadcast-box` is in the CivicPress config
 *    `modules:` list, with a `BROADCAST_BOX_ENABLED=false` env opt-out;
 *  - crash-safe: every failure path logs + returns `{ started: false }` so a
 *    broadcast-box wiring problem never takes down the API;
 *  - reuses the module's tested registration hooks (`registerBroadcastBoxServices`
 *    for the DI services + SQL migrations, `registerBroadcastBoxRoutes` for the
 *    Express routers) against core's DI container.
 *
 * The device-room WebSocket handler (device connect / command / status /
 * `session.manifest`) is wired when an in-process realtime server is supplied:
 * we bridge it into the DI container so the module's handler-registration block
 * registers the `DeviceRoomHandler`. Without a realtime server, only the HTTP
 * routes mount (a device can't connect over WS).
 */

import type { Application } from 'express';
import type { CivicPress, Logger } from '@civicpress/core';
import { CentralConfigManager } from '@civicpress/core';
import {
  registerBroadcastBoxServices,
  registerBroadcastBoxRoutes,
} from '@civicpress/broadcast-box';
import { authMiddleware } from './middleware/auth.js';

/** Outcome of attempting to mount broadcast-box in-process. */
export interface BroadcastBoxStartResult {
  /** True when services + routes were registered. */
  started: boolean;
  /** Stop any background work (e.g. the enrollment-cleanup timer). */
  stop: () => void;
}

export interface BroadcastBoxStartOptions {
  /** Hard on/off switch (default: BROADCAST_BOX_ENABLED !== 'false'). */
  enabled?: boolean;
  /**
   * The API's in-process realtime server. When supplied, the device-room WS
   * handler is registered so devices can connect to `/realtime/devices/:id`
   * and send commands / `session.manifest`. Omit → HTTP routes only. Typed
   * loosely to keep this module off a hard `@civicpress/realtime` dependency.
   */
  realtimeServer?: unknown;
}

const NOOP_STOP = () => {};

/**
 * Mount broadcast-box (devices / sessions / uploads routes + their services)
 * onto the API's Express app, using core's DI container.
 *
 * @param civicPress  Initialized core instance (provides the container + config).
 * @param app         The API's Express application (routers are added live).
 * @param logger      API logger for mount/skip/failure reporting.
 * @param options     Hard enable switch (env opt-out).
 */
export async function startInProcessBroadcastBox(
  civicPress: CivicPress,
  app: Application,
  logger: Logger,
  options: BroadcastBoxStartOptions = {}
): Promise<BroadcastBoxStartResult> {
  const envEnabled = process.env.BROADCAST_BOX_ENABLED !== 'false';
  const enabled = options.enabled ?? envEnabled;
  if (!enabled) {
    logger.info(
      'Broadcast-box disabled via configuration (BROADCAST_BOX_ENABLED=false); skipping in-process mount'
    );
    return { started: false, stop: NOOP_STOP };
  }

  // Module gate: only mount when the operator enabled broadcast-box in the
  // CivicPress config `modules:` list (the same seam that gates its schema
  // extension). Absent → the API exposes no device endpoints.
  let modules: string[] = [];
  try {
    modules = CentralConfigManager.getModules() ?? [];
  } catch {
    modules = [];
  }
  if (!modules.includes('broadcast-box')) {
    logger.info(
      'Broadcast-box not in config modules:; skipping in-process mount'
    );
    return { started: false, stop: NOOP_STOP };
  }

  const container = civicPress.getContainer();

  try {
    const config = container.resolve<any>('config');

    // Bridge the in-process realtime server into the DI container so
    // registerBroadcastBoxServices wires the device room:
    //   - 'realtimeServer'      → its handler-registration block registers the
    //     DeviceRoomHandler (connect / message / session.manifest);
    //   - 'realtimeRoomManager' → its room-type block registers the device room
    //     FACTORY, so the server can create `device:<uuid>` rooms (else a
    //     connecting device gets ROOM_NOT_FOUND);
    //   - 'authService'         → the handler block resolves this key; core
    //     registers auth as 'auth', so alias it.
    // All guarded so we never clobber an existing registration.
    if (options.realtimeServer) {
      const realtimeServer = options.realtimeServer as {
        getRoomManager?: () => unknown;
      };
      if (!container.isRegistered('realtimeServer')) {
        container.registerInstance('realtimeServer', realtimeServer);
      }
      const roomManager = realtimeServer.getRoomManager?.();
      if (roomManager && !container.isRegistered('realtimeRoomManager')) {
        container.registerInstance('realtimeRoomManager', roomManager);
      }
      if (!container.isRegistered('authService')) {
        container.registerInstance('authService', civicPress.getAuthService());
      }
    }

    // 1. DI services + SQL migrations + the enrollment-cleanup timer + (when the
    //    realtime server was bridged above) the device-room WS handler. The
    //    module's tested container-based registration hook.
    await registerBroadcastBoxServices(container, config);

    // 2. Resolve the services the routers need. deviceManager + deviceAuth are
    //    required; the rest are optional (e.g. uploads needs `storage`, which is
    //    only present when the storage module is mounted) — a missing optional
    //    service just omits its router.
    const deviceManager = container.resolve<any>('broadcastBoxDeviceManager');
    const deviceAuth = container.resolve<any>('broadcastBoxDeviceAuth');
    const connectionTracker = resolveOptional(
      container,
      'broadcastBoxConnectionTracker',
      logger
    );
    const deviceCommandService = resolveOptional(
      container,
      'broadcastBoxDeviceCommandService',
      logger
    );
    const sessionController = resolveOptional(
      container,
      'broadcastBoxSessionController',
      logger
    );
    const uploadProcessor = resolveOptional(
      container,
      'broadcastBoxUploadProcessor',
      logger
    );

    // 3. Mount the routers. Auth is enforced via the API's standard middleware;
    //    device self-registration stays public (handled inside the hook).
    await registerBroadcastBoxRoutes(
      app,
      deviceManager,
      deviceAuth,
      logger,
      authMiddleware(civicPress),
      connectionTracker,
      deviceCommandService,
      sessionController,
      uploadProcessor
    );

    logger.info(
      `Broadcast-box mounted in-process (devices/sessions/uploads${
        options.realtimeServer ? ' + device-room WS handler' : ''
      })`
    );
    return { started: true, stop: () => stopBroadcastBox(container, logger) };
  } catch (error) {
    logger.error(
      'Failed to mount broadcast-box in-process; the API will run without device endpoints:',
      error
    );
    return { started: false, stop: NOOP_STOP };
  }
}

/** Resolve a container service, returning undefined (and logging) if absent. */
function resolveOptional(
  container: ReturnType<CivicPress['getContainer']>,
  key: string,
  logger: Logger
): any {
  try {
    return container.resolve<any>(key);
  } catch (error) {
    logger.warn(
      `Broadcast-box: optional service '${key}' unavailable; its router is omitted`,
      { error: error instanceof Error ? error.message : String(error) }
    );
    return undefined;
  }
}

/** Stop background work — currently the enrollment-cleanup interval. */
function stopBroadcastBox(
  container: ReturnType<CivicPress['getContainer']>,
  logger: Logger
): void {
  try {
    if (container.isRegistered('broadcastBoxEnrollmentCleanup')) {
      container.resolve<any>('broadcastBoxEnrollmentCleanup').stop();
    }
  } catch (error) {
    logger.warn('Broadcast-box: failed to stop enrollment-cleanup service', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
