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
import { AtRestCodec } from '../../security/at-rest-codec.js';
import { redactPii } from '../../notifications/pii-redaction.js';
import { coreError } from '../../utils/core-output.js';

/** What a reader sees in place of a body that cannot be unsealed. */
export const UNREADABLE_PLACEHOLDER =
  '[unreadable: sealed under another instance secret]';
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

/**
 * What `notifications.yml`'s `security` keys ask of the inbox. Set once at
 * service initialization (`completeServiceInitialization`); a store that was
 * never configured writes plain rows, as it always did.
 */
export interface OperatorNotificationProtection {
  /** `security.filter_pii`: redact addresses, phone numbers, … from `body` and `data` before they are stored. */
  redactPii: boolean;
  /** `security.encrypt_sensitive_data`: seal `body` and `data` with the codec before they are stored, and migrate rows that are still plain. */
  encryptAtRest: boolean;
  /** Present whenever the instance secret is available; reads decrypt through it even when `encryptAtRest` is off. */
  codec?: AtRestCodec;
}

export class OperatorNotificationStore {
  private adapter: DatabaseAdapter;
  private protection?: OperatorNotificationProtection;
  private unreadableLogged = false;

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
  }

  /** Apply the instance's `security` settings to every write and read from now on. */
  configureProtection(protection: OperatorNotificationProtection): void {
    if (protection.encryptAtRest && !protection.codec) {
      throw new Error(
        '[OperatorNotificationStore] encryptAtRest needs a codec (the instance secret)'
      );
    }
    this.protection = protection;
  }

  /**
   * Seal the `body` and `data` of rows written before encryption was on.
   * Idempotent: only rows without the marker are touched. Returns how many.
   */
  async migratePlaintextRows(): Promise<number> {
    const codec = this.protection?.codec;
    if (!this.protection?.encryptAtRest || !codec) return 0;
    const rows = await this.adapter.query<{
      id: number;
      body: string | null;
      data: string | null;
    }>(
      `SELECT id, body, data FROM operator_notifications
        WHERE (body IS NOT NULL AND body NOT LIKE 'enc:v1:%')
           OR (data IS NOT NULL AND data NOT LIKE 'enc:v1:%')`
    );
    for (const row of rows) {
      await this.adapter.execute(
        'UPDATE operator_notifications SET body = ?, data = ? WHERE id = ?',
        [
          row.body !== null && !AtRestCodec.isEncrypted(row.body)
            ? codec.encrypt(row.body)
            : row.body,
          row.data !== null && !AtRestCodec.isEncrypted(row.data)
            ? codec.encrypt(row.data)
            : row.data,
          row.id,
        ]
      );
    }
    return rows.length;
  }

  /** `body` as it is stored: redacted, then sealed, as configured. */
  private protectBody(body: string | null): string | null {
    if (body === null || !this.protection) return body;
    const text = this.protection.redactPii ? redactPii(body) : body;
    return this.seal(text);
  }

  /**
   * `data` as it is stored: redacted as an OBJECT (so a numeric value or a key
   * is never rewritten into something that is no longer JSON), serialized,
   * then sealed.
   */
  private protectData(
    data: Record<string, unknown> | undefined
  ): string | null {
    if (!data) return null;
    const object = this.protection?.redactPii ? redactPii(data) : data;
    return this.seal(JSON.stringify(object));
  }

  private seal(text: string): string {
    return this.protection?.encryptAtRest && this.protection.codec
      ? this.protection.codec.encrypt(text)
      : text;
  }

  /**
   * A stored row with `body`/`data` readable again. A value that cannot be
   * unsealed — written under another instance secret, or altered — becomes
   * {@link UNREADABLE_PLACEHOLDER} (and `null` for `data`) so one such row
   * does not take the whole inbox down: the operator can still see, read and
   * dismiss it. Logged once per process.
   */
  private reveal(row: OperatorNotificationRow): OperatorNotificationRow {
    const codec = this.protection?.codec;
    if (!codec) return row;
    return {
      ...row,
      body: this.unseal(row, 'body', row.body),
      data: this.unseal(row, 'data', row.data),
    };
  }

  private unseal(
    row: OperatorNotificationRow,
    field: 'body' | 'data',
    value: string | undefined
  ): string | undefined {
    const codec = this.protection?.codec;
    if (typeof value !== 'string' || !codec) return value;
    try {
      return codec.decrypt(value);
    } catch (error) {
      if (!this.unreadableLogged) {
        this.unreadableLogged = true;
        coreError(
          'An operator notification cannot be unsealed — written under another instance secret, or altered',
          'OPERATOR_NOTIFICATION_UNREADABLE',
          {
            id: row.id,
            field,
            error: error instanceof Error ? error.message : String(error),
          },
          { operation: 'operator-notifications:reveal' }
        );
      }
      return field === 'body' ? UNREADABLE_PLACEHOLDER : undefined;
    }
  }

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
        this.protectBody(input.body ?? null),
        this.protectData(input.data),
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
    return {
      notifications: notifications.map((row) => this.reveal(row)),
      total,
    };
  }

  async getById(id: number): Promise<OperatorNotificationRow | null> {
    const rows = await this.adapter.query<OperatorNotificationRow>(
      'SELECT * FROM operator_notifications WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? this.reveal(rows[0]) : null;
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
