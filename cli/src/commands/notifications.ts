/* eslint-disable @typescript-eslint/no-explicit-any -- CLI command handlers pass CAC's untyped options through withCli. */
import { CAC } from 'cac';
import { AuthUtils } from '../utils/auth-utils.js';
import { withCli } from '../utils/with-cli.js';
import { cliSuccess, cliError } from '../utils/cli-output.js';

const NOTIFICATIONS_PERMISSION = 'system:admin';

/**
 * Guard the operator notification center behind system:admin (mirrors the API
 * mount). Exits the process on refusal. Returns { user, civic } on success.
 */
async function requireAdmin(
  token: string | undefined,
  json: boolean | undefined,
  operation: string
) {
  const { user, civic } = await AuthUtils.requireAuthWithCivic(token, json);
  if (
    user.role !== 'admin' &&
    !(await civic.getAuthService().userCan(user, NOTIFICATIONS_PERMISSION))
  ) {
    cliError(
      'Insufficient permissions for the operator notification center',
      'PERMISSION_DENIED',
      { requiredPermission: NOTIFICATIONS_PERMISSION, userRole: user.role },
      operation
    );
    await civic.shutdown();
    process.exit(1);
  }
  return { user, civic };
}

const VALID_STATUS = ['unread', 'read', 'dismissed'];
const VALID_SEVERITY = ['info', 'warning', 'critical', 'action'];

/**
 * Register the operator notification-center commands. These read/ack the
 * durable, channel-free admin feed (undeliverable password-reset requests +
 * system signal) — the same store the dashboard bell surfaces.
 */
export function registerNotificationsCommand(cli: CAC): void {
  cli
    .command('notifications:list', 'List operator notifications')
    .option('--token <token>', 'Session token for authentication')
    .option('--status <status>', 'Filter by status (unread|read|dismissed)')
    .option('--type <type>', 'Filter by type (e.g. password_reset_request)')
    .option('--severity <severity>', 'Filter by severity (info|warning|critical|action)')
    .option('--limit <limit>', 'Max rows (default 50)')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(
      withCli<[any]>(
        {
          operation: 'notifications:list',
          errorMessage: 'Failed to list notifications',
          errorCode: 'LIST_NOTIFICATIONS_FAILED',
          details: (error) => ({
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        },
        async ({ globalOptions }, options) => {
          const { civic } = await requireAdmin(
            options.token,
            globalOptions.json,
            'notifications:list'
          );

          const listOptions: Record<string, unknown> = {
            limit: options.limit ? parseInt(options.limit, 10) : 50,
          };
          if (options.status && VALID_STATUS.includes(options.status)) {
            listOptions.status = options.status;
          }
          if (options.type) listOptions.type = options.type;
          if (options.severity && VALID_SEVERITY.includes(options.severity)) {
            listOptions.severity = options.severity;
          }

          const { notifications, total, unread } = await civic
            .getOperatorNotifier()
            .list(listOptions);

          cliSuccess(
            { notifications, total, unread },
            total === 0
              ? 'No notifications'
              : `${total} notification${total === 1 ? '' : 's'} (${unread} unread)`,
            { operation: 'notifications:list', total, unread }
          );

          await civic.shutdown();
        }
      )
    );

  cli
    .command(
      'users:reset-requests',
      'List pending password-reset requests awaiting operator action'
    )
    .option('--token <token>', 'Session token for authentication')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(
      withCli<[any]>(
        {
          operation: 'users:reset-requests',
          errorMessage: 'Failed to list reset requests',
          errorCode: 'LIST_RESET_REQUESTS_FAILED',
          details: (error) => ({
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        },
        async ({ globalOptions }, options) => {
          const { civic } = await requireAdmin(
            options.token,
            globalOptions.json,
            'users:reset-requests'
          );

          const { notifications, total } = await civic
            .getOperatorNotifier()
            .list({ type: 'password_reset_request', status: 'unread' });

          cliSuccess(
            { requests: notifications, total },
            total === 0
              ? 'No pending password-reset requests'
              : `${total} pending password-reset request${total === 1 ? '' : 's'} — fulfill with: civic users:set-password <username>`,
            { operation: 'users:reset-requests', total }
          );

          await civic.shutdown();
        }
      )
    );

  cli
    .command('notifications:read <id>', 'Mark an operator notification as read')
    .option('--token <token>', 'Session token for authentication')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(
      withCli<[any, any]>(
        {
          operation: 'notifications:read',
          errorMessage: 'Failed to mark notification read',
          errorCode: 'READ_NOTIFICATION_FAILED',
          details: (error, id) => ({
            error: error instanceof Error ? error.message : 'Unknown error',
            id,
          }),
        },
        async ({ globalOptions }, id, options) => {
          const { civic } = await requireAdmin(
            options.token,
            globalOptions.json,
            'notifications:read'
          );
          const changed = await civic
            .getOperatorNotifier()
            .markRead(parseInt(String(id), 10));
          cliSuccess(
            { id: parseInt(String(id), 10), changed },
            changed ? `Marked notification ${id} as read` : `Notification ${id} was not unread`,
            { operation: 'notifications:read' }
          );
          await civic.shutdown();
        }
      )
    );

  cli
    .command('notifications:dismiss <id>', 'Dismiss an operator notification')
    .option('--token <token>', 'Session token for authentication')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(
      withCli<[any, any]>(
        {
          operation: 'notifications:dismiss',
          errorMessage: 'Failed to dismiss notification',
          errorCode: 'DISMISS_NOTIFICATION_FAILED',
          details: (error, id) => ({
            error: error instanceof Error ? error.message : 'Unknown error',
            id,
          }),
        },
        async ({ globalOptions }, id, options) => {
          const { civic } = await requireAdmin(
            options.token,
            globalOptions.json,
            'notifications:dismiss'
          );
          const changed = await civic
            .getOperatorNotifier()
            .dismiss(parseInt(String(id), 10));
          cliSuccess(
            { id: parseInt(String(id), 10), changed },
            changed ? `Dismissed notification ${id}` : `Notification ${id} was already dismissed`,
            { operation: 'notifications:dismiss' }
          );
          await civic.shutdown();
        }
      )
    );

  cli
    .command('notifications:read-all', 'Mark every unread notification as read')
    .option('--token <token>', 'Session token for authentication')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(
      withCli<[any]>(
        {
          operation: 'notifications:read-all',
          errorMessage: 'Failed to mark all read',
          errorCode: 'READ_ALL_NOTIFICATIONS_FAILED',
          details: (error) => ({
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        },
        async ({ globalOptions }, options) => {
          const { civic } = await requireAdmin(
            options.token,
            globalOptions.json,
            'notifications:read-all'
          );
          const updated = await civic.getOperatorNotifier().markAllRead();
          cliSuccess(
            { updated },
            `Marked ${updated} notification${updated === 1 ? '' : 's'} as read`,
            { operation: 'notifications:read-all' }
          );
          await civic.shutdown();
        }
      )
    );
}

export default registerNotificationsCommand;
