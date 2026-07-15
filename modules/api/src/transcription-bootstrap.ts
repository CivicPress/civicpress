/**
 * In-process transcription bootstrap (BroadcastBox W2).
 *
 * The optional transcription worker runs IN-PROCESS with the API — the same
 * pattern as the realtime server (see realtime-bootstrap.ts) — started by
 * CivicPressAPI.start() after the HTTP listener. It is:
 *   - config-gated: `transcription.enabled` (plus a TRANSCRIPTION_ENABLED env opt-out);
 *   - availability-gated: the engine's `available()` must pass (else idle);
 *   - crash-safe: any failure is logged and swallowed so it NEVER takes down the
 *     API, and the A/V stays public regardless (graceful degradation).
 *
 * This module is the single place the API takes a runtime dependency on
 * `@civicpress/transcription` (mirrors realtime-bootstrap.ts for @civicpress/realtime).
 *
 * NOTE: a first-class `civic start` CLI command is deferred to the deployment /
 * easy-install phase; today "civic start" = the API server boot, so starting the
 * worker here IS the civic-start launcher.
 */

import type { CivicPress, Logger } from '@civicpress/core';
import {
  CloudUuidStorageService,
  initializeStorageService,
} from '@civicpress/storage';
import {
  CoreRecordsGateway,
  TranscriptionWorker,
  createEngine,
  normalizeTranscriptionConfig,
  type BlobStore,
  type RecordStore,
  type TranscriptionEngine,
} from '@civicpress/transcription';

/** Outcome of attempting to start the in-process transcription worker. */
export interface TranscriptionStartResult {
  /** The running worker, or null if disabled / engine unavailable / failed. */
  worker: TranscriptionWorker | null;
  /** True when the worker poll loop was started. */
  started: boolean;
}

export interface TranscriptionStartOptions {
  /** Hard on/off (env opt-out). When false, the worker is not started. */
  enabled?: boolean;
  /** Test override: inject an engine instead of building one from config. */
  engine?: TranscriptionEngine;
  /** Test override: inject a blob store instead of resolving the storage service. */
  storage?: BlobStore;
}

/**
 * Construct + start the in-process transcription worker from the API's existing
 * core services. Never throws — every failure path returns
 * `{ worker: null, started: false }` and logs.
 */
export async function startInProcessTranscription(
  civicPress: CivicPress,
  rawConfig: Record<string, unknown> | undefined,
  logger: Logger,
  options: TranscriptionStartOptions = {}
): Promise<TranscriptionStartResult> {
  const config = normalizeTranscriptionConfig(rawConfig);
  const enabled = (options.enabled ?? true) && config.enabled;
  if (!enabled) {
    logger.info(
      'Transcription worker disabled (config/env); skipping in-process start'
    );
    return { worker: null, started: false };
  }

  // Engine availability gate — graceful degradation: if the engine (e.g.
  // whisper.cpp binary/model) is unavailable, the worker stays idle and the A/V
  // remains public.
  const engine = options.engine ?? createEngine(config, logger);
  let available = false;
  try {
    available = await engine.available();
  } catch (error) {
    logger.error(
      'Transcription: engine availability probe threw; skipping:',
      error
    );
    return { worker: null, started: false };
  }
  if (!available) {
    logger.warn(
      `Transcription engine '${engine.name}' unavailable; worker idle (A/V stays public)`
    );
    return { worker: null, started: false };
  }

  // Storage (A/V fetch) + records gateway, from the core services the API holds.
  let storage: BlobStore;
  try {
    if (options.storage) {
      storage = options.storage;
    } else {
      const service =
        civicPress.getService<CloudUuidStorageService>('storage');
      await initializeStorageService(service);
      storage = service;
    }
  } catch (error) {
    logger.error('Transcription: storage service unavailable; skipping:', error);
    return { worker: null, started: false };
  }

  const gateway = new CoreRecordsGateway({
    // The real RecordManager satisfies RecordStore structurally; the service
    // package stays @civicpress/core-free, so cast at this wiring boundary.
    records: civicPress.getRecordManager() as unknown as RecordStore,
    storage,
    logger,
  });
  const worker = new TranscriptionWorker({
    records: gateway,
    engine,
    logger,
    language: config.language,
    leadPadS: config.leadPadS,
    trailPadS: config.trailPadS,
  });

  // Fire-and-forget the poll loop; a loop error must not reject start().
  void worker.start(config.pollIntervalMs).catch((error) => {
    logger.error('Transcription worker loop terminated unexpectedly:', error);
  });
  logger.info(
    `In-process transcription worker started (engine=${engine.name}, language=${config.language}, poll=${config.pollIntervalMs}ms)`
  );
  return { worker, started: true };
}
