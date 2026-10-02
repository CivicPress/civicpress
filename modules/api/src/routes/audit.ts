import { Router } from 'express';
import {
  AuditLogger,
  rowToActivityEntry,
  backfillAuditLogsFromActivityFile,
  type ActivityLogEntry,
  type CivicPress,
} from '@civicpress/core';
import { requirePermission } from '../middleware/auth.js';

/**
 * GET /api/v1/audit — the activity trail, newest first, filtered and paged.
 *
 * Reads the `audit_logs` table (since 2026-10-02). It used to read the
 * activity file — its newest 5,000 lines of a file that deleted its oldest
 * entries past 10,000 — so the page had a fixed horizon and never saw an
 * event the API layer had written to the database. The file is still written
 * (and archived, not deleted); it is the fallback here only while a table
 * has no row written through the channel, which the one-time import at start
 * makes a short window on an upgraded instance.
 */
export function createAuditRouter() {
  const router = Router();
  const fileLogger = new AuditLogger();

  router.use(requirePermission('system:admin'));

  router.get('/', async (req, res) => {
    try {
      // `?limit=abc` used to fall through as NaN; bound to SQL that is a
      // datatype mismatch and a 500. Not a number → the default.
      const asInt = (raw: unknown, fallback: number) => {
        const n = parseInt(String(raw ?? ''), 10);
        return Number.isFinite(n) ? n : fallback;
      };
      const limit = Math.min(1000, Math.max(1, asInt(req.query.limit, 100)));
      const offset = Math.max(0, asInt(req.query.offset, 0));
      const filters = {
        source: (req.query.source as string) || undefined,
        outcome: (req.query.outcome as string) || undefined,
        action: (req.query.action as string) || undefined,
        actor: (req.query.actor as string) || undefined,
        since: (req.query.since as string) || undefined,
        before: (req.query.before as string) || undefined,
      };

      const civicPress = req.civicPress as CivicPress | null | undefined;
      const db = civicPress?.getDatabaseService();
      if (db) await importedOnce(db, fileLogger);
      let entries: ActivityLogEntry[];
      let total: number;
      if (db && (await tableIsLive(db))) {
        const result = await db.queryAuditLogs(filters, { limit, offset });
        entries = result.rows.map(rowToActivityEntry);
        total = result.total;
      } else {
        ({ entries, total } = fromFile(
          await fileLogger.tail(5000),
          filters,
          limit,
          offset
        ));
      }

      res.json({
        success: true,
        data: {
          entries,
          pagination: { total, limit, offset },
        },
      });
    } catch {
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to load activity log',
          code: 'LOAD_ACTIVITY_LOG_FAILED',
        },
      });
    }
  });

  return router;
}

type AuditDb = Parameters<typeof backfillAuditLogsFromActivityFile>[0] & {
  countDurableAuditEntries(): Promise<number>;
};

/**
 * The activity file an upgraded instance already has is imported into the
 * table once per database, on the first read — here, not at boot, so a CLI
 * command or a test boots without paying for it. One in-flight import per
 * database instance; the schema ledger makes it once per database file.
 */
const imports = new WeakMap<AuditDb, Promise<number>>();
function importedOnce(db: AuditDb, fileLogger: AuditLogger): Promise<number> {
  let pending = imports.get(db);
  if (!pending) {
    pending = backfillAuditLogsFromActivityFile(db, fileLogger).then(
      (count) => {
        if (count > 0) live.add(db);
        return count;
      }
    );
    imports.set(db, pending);
  }
  return pending;
}

/**
 * Whether the table has a row written through the channel. Once true it stays
 * true for that database — rows are never removed — so a page load does not
 * count the table every time.
 */
const live = new WeakSet<AuditDb>();
async function tableIsLive(db: AuditDb): Promise<boolean> {
  if (!live.has(db) && (await db.countDurableAuditEntries()) > 0) live.add(db);
  return live.has(db);
}

/** The pre-2026-10-02 reader, kept as the fallback for a table with nothing in it yet. */
function fromFile(
  items: ActivityLogEntry[],
  filters: {
    source?: string;
    outcome?: string;
    action?: string;
    actor?: string;
    since?: string;
    before?: string;
  },
  limit: number,
  offset: number
): { entries: ActivityLogEntry[]; total: number } {
  const parseTs = (v?: string) =>
    v ? (isNaN(Number(v)) ? Date.parse(v) : Number(v)) : undefined;
  const sinceMs = parseTs(filters.since);
  const beforeMs = parseTs(filters.before);
  const filtered = items.filter((e) => {
    if (filters.source && e.source !== filters.source) return false;
    if (filters.outcome && e.outcome !== filters.outcome) return false;
    if (filters.action && e.action !== filters.action) return false;
    if (filters.actor) {
      const idStr = e.actor?.id != null ? String(e.actor.id) : '';
      const userStr = e.actor?.username || '';
      if (idStr !== filters.actor && userStr !== filters.actor) return false;
    }
    const ts = Date.parse(e.timestamp);
    if (sinceMs != null && ts < sinceMs) return false;
    if (beforeMs != null && ts > beforeMs) return false;
    return true;
  });
  const total = filtered.length;
  const start = Math.min(offset, Math.max(0, total));
  const end = Math.min(start + limit, total);
  return { entries: filtered.slice(start, end), total };
}
