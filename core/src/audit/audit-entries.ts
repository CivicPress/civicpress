// The `audit_logs` table as the Activity page reads it, and the one-time
// import of the activity file an instance already has.
//
// Until 2026-10-02 the page read the file — its newest 5,000 lines — and the
// table was written by core events only and read by nothing. The table now
// takes every event (see `AuditChannel.log`) and carries the file's fields;
// the page reads it. What the file already held is imported once, so an
// upgraded instance keeps its history on the page instead of starting over.
import type { ActivityLogEntry, AuditLogger } from './audit-logger.js';
import type { DatabaseService } from '../database/database-service.js';
import type { AuditLogWithUserRow } from '../database/types/row-types.js';
import { coreError, coreInfo } from '../utils/core-output.js';

/** A table row in the activity file's shape. */
export function rowToActivityEntry(row: AuditLogWithUserRow): ActivityLogEntry {
  let metadata: Record<string, unknown> | undefined;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      metadata = undefined;
    }
  }
  const username = row.actor_username ?? row.username;
  const actor =
    row.user_id != null || username || row.actor_role
      ? {
          id: row.user_id ?? undefined,
          username: username ?? undefined,
          role: row.actor_role ?? undefined,
        }
      : undefined;
  const target = row.resource_type
    ? {
        type: row.resource_type,
        id: row.resource_id ?? undefined,
        name: row.target_name ?? undefined,
      }
    : undefined;
  // Rows from before the columns existed have no message column; `details`
  // then holds the message, or the stringified details.
  const message =
    row.message ?? (row.details && !row.metadata ? row.details : undefined);
  return {
    id: `db_${row.id}`,
    timestamp: sqliteTimestampToIso(row.created_at),
    source: (row.source ?? 'core') as ActivityLogEntry['source'],
    actor,
    action: row.action,
    target,
    outcome: (row.outcome ?? 'success') as ActivityLogEntry['outcome'],
    message,
    metadata,
  };
}

/** `YYYY-MM-DD HH:MM:SS` (UTC, SQLite's CURRENT_TIMESTAMP) → ISO. */
export function sqliteTimestampToIso(value: string | undefined): string {
  if (!value) return new Date(0).toISOString();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? value.replace(' ', 'T') + 'Z'
    : value;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : normalized;
}

/** The most an import takes from the live file — the file's own retention. */
export const BACKFILL_LIMIT = 10_000;

/** The schema-ledger id the import records, so it runs once per database. */
export const BACKFILL_MIGRATION_ID = 'audit_logs.backfill-from-activity-file';

/**
 * Import the activity file into `audit_logs`, once per database — recorded
 * in the schema ledger. Runs on the first read of the trail after the
 * upgrade (not at boot: every CLI command and test boots an instance, and
 * the file can be thousands of lines). Takes the live file's newest entries
 * (up to {@link BACKFILL_LIMIT}), in one transaction, and only the ones the
 * table does not already hold: core and saga events were written to both
 * sinks before 2026-10-02, and anything the channel has written since the
 * upgrade is in the table with its source — so entries from the channel's
 * first row onward, and core/saga entries when legacy rows exist, are left
 * out. Returns how many were imported. Never throws — a read must not fail
 * because history could not be imported — and says why not.
 */
export async function backfillAuditLogsFromActivityFile(
  db: DatabaseService,
  fileLogger: AuditLogger
): Promise<number> {
  try {
    if (await db.hasDataMigration(BACKFILL_MIGRATION_ID)) return 0;
    const newestFirst = await fileLogger.tail(BACKFILL_LIMIT);
    const cutoff = await db.earliestDurableAuditTimestamp();
    const legacyRows = (await db.countLegacyAuditEntries()) > 0;
    const entries = [...newestFirst].reverse().filter((entry) => {
      const source = String(entry.source);
      if (legacyRows && (source === 'core' || source === 'saga')) return false;
      if (cutoff && toSqliteStamp(entry.timestamp) >= cutoff) return false;
      return true;
    });
    const imported =
      entries.length === 0
        ? 0
        : await db.insertAuditEntries(
            entries.map((entry) => ({
              userId:
                typeof entry.actor?.id === 'number'
                  ? entry.actor.id
                  : typeof entry.actor?.id === 'string' &&
                      /^\d+$/.test(entry.actor.id)
                    ? Number(entry.actor.id)
                    : undefined,
              action: entry.action,
              resourceType: entry.target?.type,
              resourceId:
                entry.target?.id !== undefined
                  ? String(entry.target.id)
                  : undefined,
              details: entry.message,
              source: entry.source,
              outcome: entry.outcome,
              message: entry.message,
              metadata: entry.metadata,
              actorUsername: entry.actor?.username,
              actorRole: entry.actor?.role,
              targetName: entry.target?.name ?? entry.target?.path,
              occurredAt: entry.timestamp,
            }))
          );
    await db.recordDataMigration(BACKFILL_MIGRATION_ID);
    if (imported > 0) {
      coreInfo(`Imported ${imported} activity-log entries into audit_logs`, {
        operation: 'audit:backfill',
      });
    }
    return imported;
  } catch (error) {
    coreError(
      'Failed to import the activity file into audit_logs',
      'AUDIT_BACKFILL_FAILED',
      { error: error instanceof Error ? error.message : String(error) },
      { operation: 'audit:backfill' }
    );
    return 0;
  }
}

/** ISO → `YYYY-MM-DD HH:MM:SS`, the shape `created_at` compares in. */
function toSqliteStamp(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms)
    ? new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
    : iso;
}
