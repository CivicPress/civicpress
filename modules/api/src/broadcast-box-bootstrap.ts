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
 * The device-room WebSocket handler (the `session.manifest` transport) is NOT
 * wired here — `registerBroadcastBoxServices` skips it gracefully when the
 * realtime server isn't in the container. It lands with the manifest handler.
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

    // 1. DI services + SQL migrations + the enrollment-cleanup timer. This is
    //    the module's tested container-based registration hook; the realtime
    //    device-room wiring inside it no-ops when realtime isn't in the
    //    container (the WS transport is wired with the manifest handler).
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

    logger.info('Broadcast-box mounted in-process (devices/sessions/uploads)');
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
