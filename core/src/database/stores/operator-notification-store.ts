/**
 * Operator Notification Store — CRUD for `operator_notifications`, the
 * durable admin-facing "inbox" (the notification center).
 *
 * This is the channel-free sink that makes operator-facing signal work with
 * zero comms configuration: password-reset requests that can't reach a user,
 * plus system events (backup failed, security alerts, update available). Reads
 * power the dashboard bell + CLI; writes come from the OperatorNotifier.
 *
 * Follows the focused-store pattern (see user-store.ts): owns its own adapter
 * reference, DatabaseService delegates one-liners to it.
 */

import { DatabaseAdapter, SqlParam } from '../database-adapter.js';
import type {
  OperatorNotificationRow,
  OperatorNotificationSeverity,
  OperatorNotificationStatus,
  LastInsertIdRow,
  CountRow,
} from '../types/row-types.js';

export interface CreateOperatorNotificationInput {
  type: string;
  severity: OperatorNotificationSeverity;
  title: string;
  body?: string;
  /** Structured payload — serialized to JSON TEXT. */
  data?: Record<string, unknown>;
  audienceRole?: string;
  /**
   * When set, insert is skipped if an ACTIVE (unread/read, not dismissed)
   * notification with the same key already exists — so a recurring signal
   * collapses instead of piling up. Returns the existing row's id.
   */
  dedupeKey?: string;
}

export interface ListOperatorNotificationsOptions {
  status?: OperatorNotificationStatus;
  type?: string;
  severity?: OperatorNotificationSeverity;
  limit?: number;
  offset?: number;
}

export class OperatorNotificationStore {
  private adapter: DatabaseAdapter;

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
  }

  /**
   * Insert a notification, honoring dedupeKey. Returns the row id (existing
   * one if deduped). Dedup considers only ACTIVE rows (status != 'dismissed'):
   * once an operator dismisses "update available", the next occurrence is a
   * fresh, actionable row rather than being silently swallowed.
   */
  async create(input: CreateOperatorNotificationInput): Promise<number> {
    if (input.dedupeKey) {
      const existing = await this.adapter.query<{ id: number }>(
        `SELECT id FROM operator_notifications
          WHERE dedupe_key = ? AND status != 'dismissed'
          ORDER BY id DESC LIMIT 1`,
        [input.dedupeKey]
      );
      if (existing.length > 0) {
        return existing[0].id;
      }
    }

    await this.adapter.execute(
      `INSERT INTO operator_notifications
         (type, severity, title, body, data, audience_role, dedupe_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.type,
        input.severity,
        input.title,
        input.body ?? null,
        input.data ? JSON.stringify(input.data) : null,
        input.audienceRole ?? null,
        input.dedupeKey ?? null,
      ]
    );
    const rows = await this.adapter.query<LastInsertIdRow>(
      'SELECT last_insert_rowid() as id'
    );
    return rows[0].id;
  }

  async list(
    options: ListOperatorNotificationsOptions = {}
  ): Promise<{ notifications: OperatorNotificationRow[]; total: number }> {
    let where = ' WHERE 1=1';
    const params: SqlParam[] = [];

    if (options.status) {
      where += ' AND status = ?';
      params.push(options.status);
    }
    if (options.type) {
      where += ' AND type = ?';
      params.push(options.type);
    }
    if (options.severity) {
      where += ' AND severity = ?';
      params.push(options.severity);
    }

    const countRows = await this.adapter.query<CountRow>(
      `SELECT COUNT(*) as count FROM operator_notifications${where}`,
      params
    );
    const total = countRows[0].count;

    let sql = `SELECT * FROM operator_notifications${where} ORDER BY created_at DESC, id DESC`;
    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const notifications = await this.adapter.query<OperatorNotificationRow>(
      sql,
      params
    );
    return { notifications, total };
  }

  async getById(id: number): Promise<OperatorNotificationRow | null> {
    const rows = await this.adapter.query<OperatorNotificationRow>(
      'SELECT * FROM operator_notifications WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /** Count active (non-dismissed) unread notifications — the bell badge. */
  async countUnread(): Promise<number> {
    const rows = await this.adapter.query<CountRow>(
      "SELECT COUNT(*) as count FROM operator_notifications WHERE status = 'unread'"
    );
    return rows[0].count;
  }

  /** Flip unread → read. Returns true if a row actually changed. */
  async markRead(id: number): Promise<boolean> {
    const result = await this.adapter.execute(
      `UPDATE operator_notifications SET status = 'read', read_at = ?
        WHERE id = ? AND status = 'unread'`,
      [new Date().toISOString(), id]
    );
    return ((result as { changes?: number } | undefined)?.changes ?? 0) > 0;
  }

  /** Mark every unread notification read; returns how many changed. */
  async markAllRead(): Promise<number> {
    const result = await this.adapter.execute(
      `UPDATE operator_notifications SET status = 'read', read_at = ?
        WHERE status = 'unread'`,
      [new Date().toISOString()]
    );
    return (result as { changes?: number } | undefined)?.changes ?? 0;
  }

  /** Dismiss (soft close). Idempotent; returns true if a row changed. */
  async dismiss(id: number): Promise<boolean> {
    const result = await this.adapter.execute(
      `UPDATE operator_notifications SET status = 'dismissed', dismissed_at = ?
        WHERE id = ? AND status != 'dismissed'`,
      [new Date().toISOString(), id]
    );
    return ((result as { changes?: number } | undefined)?.changes ?? 0) > 0;
  }
}
