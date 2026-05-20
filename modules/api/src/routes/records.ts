import { Router } from 'express';
import { RecordsService } from '../services/records-service.js';
import { registerReadRoutes } from './records/read-handlers.js';
import { registerWriteRoutes } from './records/write-handlers.js';
import { registerStatusRoutes } from './records/status-handlers.js';
import { registerDraftRoutes } from './records/draft-handlers.js';
import { registerLockRoutes } from './records/lock-handlers.js';

export function createRecordsRouter(recordsService: RecordsService): Router {
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

  return router;
}
