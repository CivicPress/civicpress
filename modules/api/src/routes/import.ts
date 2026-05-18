import { Router, Response } from 'express';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth.js';
import { logApiRequest } from '../utils/api-logger.js';

export const importRouter = Router();

// api-004 (Critical) — was returning fake 200 OK with an "Import
// functionality" message + format list while importing nothing. Now
// returns 501 Not Implemented with a clear message. Auth gate retained.
const NOT_IMPLEMENTED = {
  error: 'not_implemented',
  code: 'NOT_IMPLEMENTED',
  message:
    'Bulk import is planned for v0.5.x (Pilot Readiness). The civicpress-ingest sibling repo handles municipal record ingestion today; see docs/audits/sections/civicpress-ingest.md.',
  retry_after_milestone: 'v0.5.x',
  workaround:
    'Use the cp-extract / cp-format / cp-finalize pipeline in civicpress-ingest to produce Markdown civic records, then drop them into data/records/.',
};

// POST /api/v1/import - Import data
importRouter.post(
  '/',
  requirePermission('records:import'),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'import_data', status: 'not_implemented' });
    res.status(501).json(NOT_IMPLEMENTED);
  }
);
