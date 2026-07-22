import { Router, Response } from 'express';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth.js';
import { logApiRequest } from '../utils/api-logger.js';

export const exportRouter = Router();

// api-004 (Critical) — was returning fake 200 OK with an "Export
// functionality" message + format list while exporting nothing. Now
// returns 501 Not Implemented with a clear message. Auth gate retained.
const NOT_IMPLEMENTED = {
  success: false,
  error: {
    message:
      'Bulk export is planned for v0.5.x (Pilot Readiness). See docs/audits/2026-05-16-manifesto-fit-findings.md (api-004).',
    code: 'NOT_IMPLEMENTED',
    details: {
      retry_after_milestone: 'v0.5.x',
      workaround:
        'Records are stored as plain Markdown in data/records/ and can be exported via git, rsync, or backup tools today.',
    },
  },
};

// GET /api/v1/export - Export data
exportRouter.get(
  '/',
  requirePermission('records:export'),
  (req: AuthenticatedRequest, res: Response) => {
    logApiRequest(req, { operation: 'export_data', status: 'not_implemented' });
    res.status(501).json(NOT_IMPLEMENTED);
  }
);
