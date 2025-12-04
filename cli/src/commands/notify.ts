import { CAC } from 'cac';
import {
  NotificationService,
  NotificationConfig,
  AuthTemplate,
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

// We'll create a simple email channel for the CLI that uses SendGrid directly
class EmailChannel {
  public config: any;
  private name: string = 'email';

  constructor(config: any) {
    // Normalize entire config so provider credentials are plain scalars
    this.config = normalizeMetadata(config);
  }

  getName(): string {
    return this.name;
  }

  isEnabled(): boolean {
    return this.config?.enabled || false;
  }

  async send(request: any) {
    try {
      const provider = this.config.provider || 'sendgrid';

      if (provider === 'smtp') {
        return await this.sendViaSMTP(normalizeMetadata(request));
      } else {
        return await this.sendViaSendGrid(normalizeMetadata(request));
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Email send failed',
      };
    }
  }

  private async sendViaSendGrid(request: any) {
    const sgMail = await import('@sendgrid/mail');
    sgMail.default.setApiKey(this.config.credentials.apiKey);

    const msg = {
      to: request.to || this.config.credentials.from,
      from: this.config.credentials.from,
      subject: request.content?.subject || 'CivicPress Notification',
      text: request.content?.text || request.content?.body,
      html: request.content?.html,
    };

    const response = await sgMail.default.send(msg);

    return {
      success: true,
      messageId: response[0]?.headers['x-message-id'] || `sg_${Date.now()}`,
    };
  }

  private async sendViaSMTP(request: any) {
    try {
      const nodemailer = await import('nodemailer');

      const transporter = nodemailer.default.createTransport({
        host: this.config.credentials.host,
        port: this.config.credentials.port,
        secure: this.config.credentials.secure,
        auth: this.config.credentials.auth,
        tls: this.config.credentials.tls || { rejectUnauthorized: false },
        debug: false,
        logger: false,
      });

      // Test connection first
      await transporter.verify();

      const mailOptions = {
        from: this.config.credentials.from,
        to: request.to,
        subject: request.content?.subject || 'CivicPress Notification',
        text: request.content?.text || request.content?.body,
        html: request.content?.html,
      };

      const info = await transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId || `smtp_${Date.now()}`,
      };
    } catch (error: any) {
      // Error will be handled by the caller
      throw new Error(
        `SMTP Error: ${error.message}${error.code ? ` (${error.code})` : ''}`
      );
    }
  }

  async test(): Promise<boolean> {
    try {
      const config = this.config.credentials;
      if (!config.apiKey) {
        return false;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      const config = this.config.credentials;
      if (!config.apiKey && this.config.provider === 'sendgrid') {
        return false;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  getCapabilities(): any {
    return {
      supportsHtml: true,
      supportsAttachments: true,
      supportsTemplates: true,
      maxMessageLength: 100000,
      rateLimit: 100,
    };
  }

  getConfig(): any {
    return this.config;
  }

  updateConfig(config: any): void {
    this.config = normalizeMetadata(config);
  }
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

        // Create and register email channel
        const rawCreds =
          (emailConfig as any)[provider as any] ||
          (emailConfig as any).sendgrid;
        const emailChannel = new EmailChannel({
          enabled: emailConfig.enabled,
          provider: provider as any,
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
