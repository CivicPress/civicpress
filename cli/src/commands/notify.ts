/* eslint-disable @typescript-eslint/no-explicit-any -- CLI command handlers pass CAC's untyped options through withCli. */
import { withCli } from '../utils/with-cli.js';
import { CAC } from 'cac';
import {
  NotificationService,
  NotificationConfig,
  AuthTemplate,
  EmailChannel,
  emailChannelOptionsFromConfig,
  authTemplateFromConfig,
  AUTH_TEMPLATE_NAMES,
  EMAIL_PROVIDERS,
  UnknownEmailProviderError,
  type AuthTemplateName,
  type EmailChannelOptions,
} from '@civicpress/core';
import { cliSuccess, cliError, cliWarn } from '../utils/cli-output.js';

// Adapter: NotificationService dispatches via the {getName, isEnabled, send}
// channel surface with a `ChannelRequest`. The canonical EmailChannel speaks
// the simpler `EmailMessage` envelope. This adapter glues them together so
// the CLI's notify command can register one channel without re-implementing
// transport setup — the options come from `emailChannelOptionsFromConfig`,
// the same function the real-mail path uses, so a test send exercises the
// transport real mail will use.
function buildEmailChannelAdapter(options: EmailChannelOptions) {
  const canonical = new EmailChannel(options);

  return {
    getName(): string {
      return 'email';
    },
    isEnabled(): boolean {
      return true;
    },
    async send(request: any) {
      try {
        const { messageId } = await canonical.send({
          to: request.to,
          subject: request.content?.subject || 'CivicPress Notification',
          text: request.content?.text || request.content?.body,
          html: request.content?.html,
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
      `Transport for this send: ${EMAIL_PROVIDERS.join(' or ')} (default: the configured provider)`
    )
    .option(
      '--template <template>',
      `Send an authentication email template (${AUTH_TEMPLATE_NAMES.join(', ')}) as configured in notifications.yml`
    )
    .option('--variables <variables>', 'Template variables as JSON string')
    .option('--json', 'Output in JSON format')
    .option('--silent', 'Suppress output')
    .option('--verbose', 'Enable verbose debugging output')
    .action(
      withCli<[any]>(
        {
          operation: 'notify:test',
          errorMessage: 'Notification test failed',
          errorCode: 'NOTIFY_TEST_FAILED',
          // Faithful to the old `errorMessage` local: a non-Error throw
          // read 'Unknown error' here, not String(error).
          details: (error) => ({
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        },
        async (_ctx, options: any) => {
          const { to, subject, message, provider, template, variables } =
            options;

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
          // EmailChannel from @civicpress/core). `--provider` overrides the
          // configured transport for this send only.
          let channelOptions: EmailChannelOptions;
          try {
            channelOptions = emailChannelOptionsFromConfig(emailConfig, {
              provider,
            });
          } catch (error) {
            if (error instanceof UnknownEmailProviderError) {
              throw new Error(error.message);
            }
            throw error;
          }
          const emailChannel = buildEmailChannelAdapter(channelOptions);

          notificationService.registerChannel('email', emailChannel as any);

          // Handle template-based sending
          if (template) {
            // The template as the instance configures it (auth_templates in
            // notifications.yml), with the same placeholder checks and
            // fallback the authentication flows apply — so a test send shows
            // the operator the email a user would get.
            if (!AUTH_TEMPLATE_NAMES.includes(template as AuthTemplateName)) {
              throw new Error(
                `Unknown template: ${template} (expected one of: ${AUTH_TEMPLATE_NAMES.join(', ')})`
              );
            }
            const templateName = template as AuthTemplateName;
            const authTemplate = authTemplateFromConfig(
              config,
              templateName,
              (message) => cliWarn(message, 'notify:test')
            );
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

            if (!to) {
              throw new Error('Recipient email address required (use --to)');
            }

            // Send template-based notification
            const result = await notificationService.sendNotification({
              email: to,
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

            return;
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

          return;
        }
      )
    );

  cli
    .command('notify:config', 'Show notification configuration')
    .option('--json', 'Output in JSON format')
    .option('--silent', 'Suppress output')
    .action(
      withCli<[any]>(
        {
          operation: 'notify:config',
          errorMessage: 'Failed to get notification configuration',
          errorCode: 'GET_CONFIG_FAILED',
          // Faithful to the old `errorMessage` local: a non-Error throw
          // read 'Unknown error' here, not String(error).
          details: (error) => ({
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        },
        async (_ctx, _options: any) => {
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
        }
      )
    );

  cli
    .command('notify:queue', 'Show notification history and statistics')
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
    .action(
      withCli<[any]>(
        {
          operation: 'notify:queue',
          errorMessage: 'Failed to get notification queue',
          errorCode: 'GET_QUEUE_FAILED',
          // Faithful to the old `errorMessage` local: a non-Error throw
          // read 'Unknown error' here, not String(error).
          details: (error) => ({
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        },
        async (_ctx, options: any) => {
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
              if (status === 'completed')
                return entry.details?.success === true;
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
        }
      )
    );
}
