/**
 * OperatorNotifier — the write + read API for the operator notification center
 * (the "inbox"). Thin service over DatabaseService's operator_notifications
 * store: typed producers for the common signals plus the read/ack surface the
 * dashboard and CLI consume.
 *
 * Producer calls are failure-isolated: a notification is a side effect of some
 * primary operation (a backup, a login, a reset request), and must never be
 * able to break that operation. Every write is best-effort and swallows its
 * own errors (logged), returning null on failure.
 */

import type { DatabaseService } from '../database/database-service.js';
import type { Logger } from '../utils/logger.js';
import type {
  OperatorNotificationRow,
  OperatorNotificationSeverity,
  OperatorNotificationStatus,
} from '../database/types/row-types.js';
import type {
  CreateOperatorNotificationInput,
  ListOperatorNotificationsOptions,
} from '../database/stores/operator-notification-store.js';
import { coreError } from '../utils/core-output.js';

/** Notification type slugs the notifier emits. Extend freely — free-text. */
export type OperatorNotificationType =
  | 'password_reset_request'
  | 'system_error'
  | 'security_alert'
  | 'update_available'
  | string;

export interface OperatorNotificationView {
  id: number;
  type: string;
  severity: OperatorNotificationSeverity;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  status: OperatorNotificationStatus;
  audienceRole?: string;
  createdAt?: string;
  readAt?: string;
  dismissedAt?: string;
}

export class OperatorNotifier {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger?: Logger
  ) {}

  // -- Writes ----------------------------------------------------------------

  /** Low-level create. Returns the row id, or null if the write failed. */
  async notify(
    input: CreateOperatorNotificationInput
  ): Promise<number | null> {
    try {
      return await this.db.createOperatorNotification(input);
    } catch (error) {
      coreError(
        'Failed to write operator notification',
        'OPERATOR_NOTIFY_FAILED',
        {
          type: input.type,
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'operator-notifier:notify' }
      );
      this.logger?.warn?.('Operator notification write failed', error);
      return null;
    }
  }

  /**
   * A password-reset request that could not be delivered to the user (no
   * user-facing channel configured). This is an ACTIONABLE task: the operator
   * fulfills it with the existing admin set-password primitive and relays the
   * new credential out-of-band. Deliberately carries NO reset token — the
   * feed is not a place to keep account-takeover secrets.
   */
  async passwordResetRequested(user: {
    userId: number;
    username: string;
    email?: string;
  }): Promise<number | null> {
    return this.notify({
      type: 'password_reset_request',
      severity: 'action',
      title: `Password reset requested: ${user.username}`,
      body:
        `${user.username} requested a password reset, but no email channel is ` +
        `configured to send them a link. Set a new password for this account ` +
        `and share it with them over a trusted channel.`,
      data: { userId: user.userId, username: user.username, email: user.email },
      audienceRole: 'admin',
    });
  }

  /** A background/system failure the operator should know about. */
  async systemError(input: {
    title: string;
    body?: string;
    data?: Record<string, unknown>;
    dedupeKey?: string;
  }): Promise<number | null> {
    return this.notify({
      type: 'system_error',
      severity: 'critical',
      title: input.title,
      body: input.body,
      data: input.data,
      dedupeKey: input.dedupeKey,
      audienceRole: 'admin',
    });
  }

  /** A security-relevant event (account lockout, suspicious activity, …). */
  async securityAlert(input: {
    title: string;
    body?: string;
    data?: Record<string, unknown>;
    dedupeKey?: string;
    severity?: Extract<OperatorNotificationSeverity, 'warning' | 'critical'>;
  }): Promise<number | null> {
    return this.notify({
      type: 'security_alert',
      severity: input.severity ?? 'warning',
      title: input.title,
      body: input.body,
      data: input.data,
      dedupeKey: input.dedupeKey,
      audienceRole: 'admin',
    });
  }

  /** An available software update. Deduped so it collapses until dismissed. */
  async updateAvailable(input: {
    version: string;
    current?: string;
    body?: string;
  }): Promise<number | null> {
    return this.notify({
      type: 'update_available',
      severity: 'info',
      title: `Update available: ${input.version}`,
      body:
        input.body ??
        `A newer CivicPress release (${input.version}) is available` +
          (input.current ? ` — you are on ${input.current}.` : '.'),
      data: { version: input.version, current: input.current },
      dedupeKey: `update_available:${input.version}`,
      audienceRole: 'admin',
    });
  }

  // -- Reads / acks ----------------------------------------------------------

  async list(options: ListOperatorNotificationsOptions = {}): Promise<{
    notifications: OperatorNotificationView[];
    total: number;
    unread: number;
  }> {
    const [{ notifications, total }, unread] = await Promise.all([
      this.db.listOperatorNotifications(options),
      this.db.countUnreadOperatorNotifications(),
    ]);
    return { notifications: notifications.map(toView), total, unread };
  }

  async get(id: number): Promise<OperatorNotificationView | null> {
    const row = await this.db.getOperatorNotificationById(id);
    return row ? toView(row) : null;
  }

  async countUnread(): Promise<number> {
    return this.db.countUnreadOperatorNotifications();
  }

  async markRead(id: number): Promise<boolean> {
    return this.db.markOperatorNotificationRead(id);
  }

  async markAllRead(): Promise<number> {
    return this.db.markAllOperatorNotificationsRead();
  }

  async dismiss(id: number): Promise<boolean> {
    return this.db.dismissOperatorNotification(id);
  }
}

/** Row → API view: parse the JSON `data` blob, camelCase timestamps. */
function toView(row: OperatorNotificationRow): OperatorNotificationView {
  let data: Record<string, unknown> | undefined;
  if (row.data) {
    try {
      data = JSON.parse(row.data) as Record<string, unknown>;
    } catch {
      data = undefined;
    }
  }
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    body: row.body,
    data,
    status: row.status,
    audienceRole: row.audience_role,
    createdAt: row.created_at,
    readAt: row.read_at,
    dismissedAt: row.dismissed_at,
  };
}
