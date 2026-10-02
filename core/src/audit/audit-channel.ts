/**
 * AuditChannel — the unified audit trail for CivicPress.
 *
 * Phase 2c (Task 9) replaced two parallel uncoordinated audit stores
 * (file-JSONL via AuditLogger writing `.system-data/activity.log`; DB via
 * `db.logAuditEvent` writing the `audit_logs` table) with a single channel
 * that writes both: file-JSONL FIRST (resilient archival per the manifesto
 * — survives DB failure / lock / migration drift), then DB (queryable from
 * the API).
 *
 * Closes core-001 (record-manager wrote DB audit without userId) and
 * core-013 (sagas wrote neither store). The architectural intent of the
 * channel is captured in `docs/audits/2026-05-16-manifesto-fit-findings.md`
 * core-001 + core-013 sections.
 *
 * Direct callers should NOT use `Database.logAuditEvent` going forward —
 * route everything through this channel. The DB method is marked
 * `@internal` so future audits can flag direct-call-site regressions.
 */
import type { DatabaseService } from '../database/database-service.js';
import {
  AuditLogger,
  type ActivityOutcome,
  type ActivitySource,
  type ActivityActor,
  type ActivityTarget,
  type ActivityLogEntry,
} from './audit-logger.js';
import { coreError } from '../utils/core-output.js';

export type AuditEvent = {
  /** Event action key. Examples: 'record:create', 'user:login', 'saga:publish-draft:start'. */
  action: string;
  /** Resource type the action targets. */
  resourceType: 'record' | 'user' | 'config' | 'system' | 'saga' | string;
  /** Resource identifier (record ID, user ID, saga ID, etc.). Optional for system events. */
  resourceId?: string | number;
  /** User performing the action. REQUIRED for user-attributable actions; omit only for system events. */
  userId?: number;
  /** Where the action originated. */
  source: ActivitySource | 'saga';
  /** Whether the action succeeded. Defaults to 'success' if omitted. */
  outcome?: ActivityOutcome;
  /** Human-readable message. */
  message?: string;
  /** Free-form structured details (saga step, error class, etc.). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: Record<string, any>;
  /** Who acted, when more than the numeric id is known (username, role). */
  actor?: ActivityActor;
  /** What was acted on, when more than type and id is known (name, path). */
  target?: ActivityTarget;
};

export class AuditChannel {
  constructor(
    private readonly db: DatabaseService,
    private readonly fileLogger: AuditLogger
  ) {}

  /**
   * Write an audit event. File-JSONL first (resilient), DB second (queryable).
   *
   * File-JSONL writes are best-effort (AuditLogger never throws — see its
   * `append` method's catch block). DB writes propagate errors so the
   * caller can decide whether to compensate; the on-disk trace persists
   * regardless.
   */
  async record(event: AuditEvent): Promise<void> {
    const outcome: ActivityOutcome = event.outcome ?? 'success';
    const actorId = event.actor?.id ?? event.userId;
    const actor: ActivityActor | undefined =
      actorId !== undefined || event.actor?.username
        ? { ...event.actor, id: actorId }
        : undefined;
    const target: ActivityTarget | undefined = event.resourceType
      ? {
          type: event.resourceType as
            | 'config'
            | 'user'
            | 'record'
            | 'system'
            | string,
          id: event.resourceId,
          ...event.target,
        }
      : event.target;
    await this.write(
      {
        source: event.source as ActivitySource,
        actor,
        action: event.action,
        target,
        outcome,
        message: event.message,
        metadata: event.details,
      },
      { throwOnDbFailure: true }
    );
  }

  /**
   * Write an entry in the activity file's own shape — what the API and CLI
   * handlers have always written to their file-only `AuditLogger`. With this
   * they write to both sinks through one call, unchanged at the call site.
   *
   * Best effort on the database side: a request that did its work must not
   * fail because the queryable trail could not take the row; the file still
   * has it, and the failure is logged.
   */
  async log(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): Promise<void> {
    await this.write(entry, { throwOnDbFailure: false });
  }

  private async write(
    entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>,
    options: { throwOnDbFailure: boolean }
  ): Promise<void> {
    await this.fileLogger.log(entry);

    const userId =
      typeof entry.actor?.id === 'number'
        ? entry.actor.id
        : typeof entry.actor?.id === 'string' && /^\d+$/.test(entry.actor.id)
          ? Number(entry.actor.id)
          : undefined;
    try {
      await this.db.logAuditEvent({
        userId,
        action: entry.action,
        resourceType: entry.target?.type,
        resourceId:
          entry.target?.id !== undefined ? String(entry.target.id) : undefined,
        details: entry.message ?? this.stringifyDetails(entry.metadata),
        source: entry.source,
        outcome: entry.outcome,
        message: entry.message,
        metadata: entry.metadata,
        actorUsername: entry.actor?.username,
        actorRole: entry.actor?.role,
        targetName: entry.target?.name ?? entry.target?.path,
      });
    } catch (err) {
      coreError(
        '[AuditChannel] DB write failed; on-disk JSONL still has the entry',
        'AUDIT_DB_WRITE_FAILED',
        {
          action: entry.action,
          resourceType: entry.target?.type,
          resourceId: entry.target?.id,
          error: err instanceof Error ? err.message : String(err),
        },
        { operation: 'audit:record' }
      );
      if (options.throwOnDbFailure) throw err;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private stringifyDetails(details?: Record<string, any>): string | undefined {
    if (!details) return undefined;
    try {
      return JSON.stringify(details);
    } catch {
      return '[unserializable details]';
    }
  }
}
