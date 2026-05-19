import { CAC } from 'cac';
import {
  NotificationService,
  NotificationConfig,
  AuthTemplate,
  EmailChannel,
  type EmailChannelOptions,
} from '@civicpress/core';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
import {
  cliSuccess,
  cliError,
  cliInfo,
  cliWarn,
  cliStartOperation,
} from '../utils/cli-output.js';

// Deep-normalize metadata-shaped values { value, type, ... } -> value
function normalizeMetadata<T = any>(input: any): T {
  if (input == null) return input as T;
  if (Array.isArray(input))
    return input.map((i) => normalizeMetadata(i)) as any;
  if (typeof input === 'object') {
    // If this looks like a metadata field, unwrap its value
    if (
      'value' in input &&
      Object.keys(input).some(
        (k) =>
          k === 'type' ||
          k === 'description' ||
          k === 'required' ||
          k === 'options' ||
          k === 'value'
      )
    ) {
      return normalizeMetadata((input as any).value) as T;
    }
    const out: any = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = normalizeMetadata(v);
    }
    return out as T;
  }
  return input as T;
}

// Adapter: NotificationService dispatches via the {getName, isEnabled, send}
// channel surface with a `ChannelRequest`. The canonical EmailChannel speaks
// the simpler `EmailMessage` envelope. This adapter glues them together so
// the CLI's notify command can register one channel without re-implementing
// nodemailer transport setup.
//
// Built from a flat config object whose shape mirrors what
// `NotificationConfig.getChannelConfig('email')` returns plus the provider
// chosen by the --provider flag.
type CliEmailAdapterInput = {
  enabled: boolean;
  provider: 'sendgrid' | 'smtp' | 'nodemailer';
  credentials: any;
  settings?: Record<string, any>;
};

function buildEmailChannelAdapter(input: CliEmailAdapterInput) {
  const normalized = normalizeMetadata(input);
  const creds = normalized.credentials || {};

  const options: EmailChannelOptions = (() => {
    if (normalized.provider === 'sendgrid') {
      return {
        sendgrid: { apiKey: creds.apiKey },
        defaultFrom: creds.from,
      };
    }
    // smtp + nodemailer both map to the SMTP transport (they were aliases in
    // the legacy code — nodemailer was just a label for "generic SMTP").
    return {
      smtp: {
        host: creds.host,
        port: Number(creds.port ?? 587),
        secure: Boolean(creds.secure),
        auth: creds.auth,
        tls: creds.tls || { rejectUnauthorized: false },
      },
      defaultFrom: creds.from,
    };
  })();

  const canonical = new EmailChannel(options);

  return {
    getName(): string {
      return 'email';
    },
    isEnabled(): boolean {
      return normalized.enabled === true;
    },
    async send(request: any) {
      try {
        const normalizedRequest = normalizeMetadata(request);
        const { messageId } = await canonical.send({
          to: normalizedRequest.to,
          subject:
            normalizedRequest.content?.subject || 'CivicPress Notification',
          text:
            normalizedRequest.content?.text || normalizedRequest.content?.body,
          html: normalizedRequest.content?.html,
        });
        return { success: true, messageId };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Email send failed',
        };
      }
    },
  };
}

export default function notifyCommand(cli: CAC) {
  cli
    .command('notify:test', 'Test notification system')
    .option('-t, --to <email>', 'Recipient email address')
    .option('-s, --subject <subject>', 'Email subject')
    .option('-m, --message <message>', 'Email message')
    .option(
      '-p, --provider <provider>',
      'Email provider (sendgrid, nodemailer, ses, smtp)',
      {
        default: 'sendgrid',
      }
    )
    .option(
      '--template <template>',
      'Use predefined template (email_verification, password_reset, etc.)'
    )
    .option('--variables <variables>', 'Template variables as JSON string')
    .option('--json', 'Output in JSON format')
    .option('--silent', 'Suppress output')
    .option('--verbose', 'Enable verbose debugging output')
    .action(async (options) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('notify:test');

      try {
        const {
          to,
          subject,
          message,
          provider,
          template,
          variables,
          json,
          silent,
          verbose,
        } = options;

        // Initialize configuration
        const config = new NotificationConfig();

        // Create notification service
        const notificationService = new NotificationService(config);

        // Get email configuration
        const emailConfig = config.getChannelConfig('email');
        if (!emailConfig || !emailConfig.enabled) {
          throw new Error('Email channel not enabled in configuration');
        }

        // Create and register email channel (adapter around canonical
        // EmailChannel from @civicpress/core).
        const rawCreds =
          (emailConfig as any)[provider as any] ||
          (emailConfig as any).sendgrid;
        const emailChannel = buildEmailChannelAdapter({
          enabled: emailConfig.enabled,
          provider: provider as 'sendgrid' | 'smtp' | 'nodemailer',
          credentials: rawCreds,
          settings: {},
        });

        notificationService.registerChannel('email', emailChannel as any);

        // Handle template-based sending
        if (template) {
          // Register template
          let templateContent = '';
          let templateName = template;

          switch (template) {
            case 'email_verification':
              templateContent =
                'Please click the following link to verify your account: {{verification_url}}';
              break;
            case 'password_reset':
              templateContent =
                'Click here to reset your password: {{reset_url}}';
              break;
            case 'two_factor_auth':
              templateContent = 'Your verification code is: {{code}}';
              break;
            case 'security_alert':
              templateContent = 'Suspicious activity detected: {{details}}';
              break;
            default:
              throw new Error(`Unknown template: ${template}`);
          }

          const authTemplate = new AuthTemplate(templateName, templateContent);
          notificationService.registerTemplate(templateName, authTemplate);

          // Parse variables
          let templateData = {};
          if (variables) {
            try {
              templateData = JSON.parse(variables);
            } catch {
              throw new Error(`Invalid JSON in --variables: ${variables}`);
            }
          }

          // Send template-based notification
          const result = await notificationService.sendNotification({
            channels: ['email'],
            template: templateName,
            data: templateData,
          });

          if (result.success) {
            cliSuccess(
              {
                notificationId: result.notificationId,
                sentChannels: result.sentChannels,
              },
              `Email sent successfully using template ${templateName}`,
              {
                operation: 'notify:test',
                template: templateName,
                notificationId: result.notificationId,
              }
            );
          } else {
            cliError(
              `Email failed to send: ${result.errors?.join(', ')}`,
              'SEND_FAILED',
              {
                errors: result.errors,
                template: templateName,
              },
              'notify:test'
            );
            process.exit(1);
          }

          return result;
        }

        // Handle direct message sending
        if (!to) {
          throw new Error('Recipient email address required (use --to)');
        }

        if (!subject || !message) {
          throw new Error(
            'Subject and message required for direct sending (use --subject and --message)'
          );
        }

        // For direct sending, we'll use a simple template
        const directTemplate = new AuthTemplate('direct', message);
        notificationService.registerTemplate('direct', directTemplate);

        const result = await notificationService.sendNotification({
          email: to,
          channels: ['email'],
          template: 'direct',
          data: {},
        });

        if (result.success) {
          cliSuccess(
            {
              notificationId: result.notificationId,
              sentChannels: result.sentChannels,
              to,
              subject,
            },
            `Email sent successfully to ${to}`,
            {
              operation: 'notify:test',
              to,
              notificationId: result.notificationId,
            }
          );
        } else {
          cliError(
            `Email failed to send: ${result.errors?.join(', ')}`,
            'SEND_FAILED',
            {
              errors: result.errors,
              to,
            },
            'notify:test'
          );
          process.exit(1);
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        cliError(
          'Notification test failed',
          'NOTIFY_TEST_FAILED',
          { error: errorMessage },
          'notify:test'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });

  cli
    .command('notify:config', 'Show notification configuration')
    .option('--json', 'Output in JSON format')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('notify:config');

      try {
        const config = new NotificationConfig();
        const emailConfig = config.getChannelConfig('email');

        const emailData = {
          enabled: emailConfig?.enabled,
          provider: emailConfig?.provider,
          sendgrid: emailConfig?.sendgrid
            ? {
                apiKey: emailConfig.sendgrid.apiKey ? '***' : undefined,
                from: emailConfig.sendgrid.from,
              }
            : undefined,
        };

        const message = emailConfig?.enabled
          ? `Email notifications enabled (${emailConfig?.provider || 'default'} provider)`
          : 'Email notifications disabled';

        cliSuccess({ email: emailData }, message, {
          operation: 'notify:config',
          emailEnabled: emailConfig?.enabled,
          provider: emailConfig?.provider,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        cliError(
          'Failed to get notification configuration',
          'GET_CONFIG_FAILED',
          { error: errorMessage },
          'notify:config'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });

  cli
    .command('notify:queue', 'List notification queue status')
    .option(
      '--status <status>',
      'Filter by status (pending, processing, completed, failed)',
      {
        default: 'all',
      }
    )
    .option('--limit <number>', 'Maximum number of entries to show', {
      default: '20',
    })
    .option('--json', 'Output in JSON format')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('notify:queue');

      try {
        const { status, limit } = options;

        // Initialize configuration
        const config = new NotificationConfig();

        // Create notification service
        const notificationService = new NotificationService(config);

        // Get queue statistics
        const stats = await notificationService.getStatistics();

        // Get recent history
        const history = await notificationService.getHistory(parseInt(limit));

        // Filter by status if specified
        let filteredHistory = history;
        if (status !== 'all') {
          filteredHistory = history.filter((entry) => {
            if (status === 'completed') return entry.details?.success === true;
            if (status === 'failed') return entry.details?.success === false;
            if (status === 'pending')
              return entry.details?.status === 'pending';
            if (status === 'processing')
              return entry.details?.status === 'processing';
            return true;
          });
        }

        const successRate =
          stats.totalSent > 0
            ? (
                (stats.totalSent / (stats.totalSent + stats.totalFailed)) *
                100
              ).toFixed(1)
            : '0';

        const message =
          filteredHistory.length === 0
            ? `No notifications found (status: ${status})`
            : `Found ${filteredHistory.length} notification${filteredHistory.length === 1 ? '' : 's'} (${stats.totalSent} sent, ${stats.totalFailed} failed, ${successRate}% success rate)`;

        cliSuccess(
          {
            statistics: stats,
            queue: filteredHistory,
            filters: {
              status,
              limit: parseInt(limit),
            },
          },
          message,
          {
            operation: 'notify:queue',
            totalSent: stats.totalSent,
            totalFailed: stats.totalFailed,
            queueLength: filteredHistory.length,
          }
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        cliError(
          'Failed to get notification queue',
          'GET_QUEUE_FAILED',
          { error: errorMessage },
          'notify:queue'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });

  cli
    .command('notify:retry', 'Retry failed notifications')
    .option('--id <id>', 'Retry specific notification by ID')
    .option('--all', 'Retry all failed notifications')
    .option(
      '--limit <number>',
      'Maximum number of failed notifications to retry',
      {
        default: '10',
      }
    )
    .option('--json', 'Output in JSON format')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('notify:retry');

      try {
        const { id, all, limit } = options;

        // Initialize configuration
        const config = new NotificationConfig();

        // Create notification service
        const notificationService = new NotificationService(config);

        if (id) {
          // Retry specific notification
          cliWarn('Retry functionality not yet implemented', 'notify:retry');
        } else if (all) {
          // Retry all failed notifications
          const history = await notificationService.getHistory(parseInt(limit));
          const failedNotifications = history.filter(
            (entry) => !entry.details?.success
          );

          cliWarn(
            `Found ${failedNotifications.length} failed notification${failedNotifications.length === 1 ? '' : 's'} to retry, but retry functionality is not yet implemented`,
            'notify:retry'
          );
        } else {
          cliError(
            'Please specify --id or --all',
            'VALIDATION_ERROR',
            undefined,
            'notify:retry'
          );
          process.exit(1);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        cliError(
          'Failed to retry notifications',
          'RETRY_FAILED',
          { error: errorMessage },
          'notify:retry'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });
}
