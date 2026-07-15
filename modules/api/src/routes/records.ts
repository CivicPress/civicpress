import { Router } from 'express';
import { RecordsService } from '../services/records-service.js';
import { registerReadRoutes } from './records/read-handlers.js';
import { registerWriteRoutes } from './records/write-handlers.js';
import { registerStatusRoutes } from './records/status-handlers.js';
import { registerDraftRoutes } from './records/draft-handlers.js';
import { registerLockRoutes } from './records/lock-handlers.js';
import { registerSnapshotRoutes } from './records/snapshot-handlers.js';
import type { RealtimeServerLike } from '../realtime-bootstrap.js';

/**
 * Build the records router.
 *
 * @param recordsService  Records domain service.
 * @param getRealtimeServer  Lazy provider for the in-process realtime server,
 *   used by the snapshot route. It is a provider (not a value) because routes
 *   are wired during API initialize() while the realtime server starts later in
 *   API start(); it returns null when realtime is disabled / not running, in
 *   which case the snapshot endpoint degrades gracefully. Defaults to a
 *   null-provider so callers/tests that don't need realtime are unaffected.
 */
export function createRecordsRouter(
  recordsService: RecordsService,
  getRealtimeServer: () => RealtimeServerLike | null = () => null
): Router {
  const router = Router();

  // IMPORTANT: Draft routes are registered BEFORE read routes so that the literal
  // path `/drafts` matches before the parameterized `/:id` (otherwise Express would
  // try to interpret "drafts" as an :id). This preserves the ordering of the
  // pre-refactor single-file records router.
  registerDraftRoutes(router, recordsService);
  registerReadRoutes(router, recordsService);
  registerWriteRoutes(router, recordsService);
  registerStatusRoutes(router, recordsService);
  registerLockRoutes(router, recordsService);
  registerSnapshotRoutes(router, recordsService, getRealtimeServer);

  return router;
}
