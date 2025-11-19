import { Router } from 'express';
import { AuditLogger } from '@civicpress/core';
import { authMiddleware, requirePermission } from '../middleware/auth.js';

export function createAuditRouter() {
  const router = Router();
  const audit = new AuditLogger();

  // Admin-only
  router.use(requirePermission('system:admin'));

  // GET /api/v1/audit?limit=100&offset=0&source=&actor=&action=&outcome=&since=&before=
  router.get('/', async (req, res) => {
    try {
      const limit = Math.min(
        1000,
        Math.max(1, parseInt((req.query.limit as string) || '100'))
      );
      const offset = Math.max(0, parseInt((req.query.offset as string) || '0'));
      const items = await audit.tail(5000);

      const source = (req.query.source as string) || undefined;
      const outcome = (req.query.outcome as string) || undefined;
      const action = (req.query.action as string) || undefined;
      const actor = (req.query.actor as string) || undefined;
      const since = (req.query.since as string) || undefined;
      const before = (req.query.before as string) || undefined;

      const parseTs = (v?: string) =>
        v ? (isNaN(Number(v)) ? Date.parse(v) : Number(v)) : undefined;
      const sinceMs = parseTs(since);
      const beforeMs = parseTs(before);

      const filtered = items.filter((e: any) => {
        if (source && e.source !== source) return false;
        if (outcome && e.outcome !== outcome) return false;
        if (action && e.action !== action) return false;
        if (actor) {
          const idStr = e.actor?.id != null ? String(e.actor.id) : '';
          const userStr = e.actor?.username || '';
          if (idStr !== actor && userStr !== actor) return false;
        }
        const ts = Date.parse(e.timestamp);
        if (sinceMs != null && ts < sinceMs) return false;
        if (beforeMs != null && ts > beforeMs) return false;
        return true;
      });

      const total = filtered.length;
      const start = Math.min(offset, Math.max(0, total));
      const end = Math.min(start + limit, total);
      const paged = filtered.slice(start, end);
      res.json({
        success: true,
        data: {
          entries: paged,
          pagination: {
            total,
            limit,
            offset,
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to load activity log',
      });
    }
  });

  return router;
}
