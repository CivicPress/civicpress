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
  details?: Record<string, any>;
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

    await this.fileLogger.log({
      source: event.source as ActivitySource,
      actor: event.userId ? { id: event.userId } : undefined,
      action: event.action,
      target: event.resourceType
        ? {
            type: event.resourceType as
              | 'config'
              | 'user'
              | 'record'
              | 'system'
              | string,
            id: event.resourceId,
          }
        : undefined,
      outcome,
      message: event.message,
      metadata: event.details,
    });

    try {
      await this.db.logAuditEvent({
        userId: typeof event.userId === 'number' ? event.userId : undefined,
        action: event.action,
        resourceType: event.resourceType,
        resourceId:
          event.resourceId !== undefined ? String(event.resourceId) : undefined,
        details: event.message ?? this.stringifyDetails(event.details),
      });
    } catch (err) {
      coreError(
        '[AuditChannel] DB write failed; on-disk JSONL still has the entry',
        'AUDIT_DB_WRITE_FAILED',
        {
          action: event.action,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          error: err instanceof Error ? err.message : String(err),
        },
        { operation: 'audit:record' }
      );
      throw err;
    }
  }

  private stringifyDetails(details?: Record<string, any>): string | undefined {
    if (!details) return undefined;
    try {
      return JSON.stringify(details);
    } catch {
      return '[unserializable details]';
    }
  }
}
