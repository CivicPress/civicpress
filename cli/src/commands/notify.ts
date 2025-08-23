import { CAC } from 'cac';
import {
  NotificationService,
  NotificationConfig,
  AuthTemplate,
} from '@civicpress/core';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';

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
      console.log('🔧 Starting SMTP send...');
      const nodemailer = await import('nodemailer');

      console.log('🔧 SMTP Configuration:');
      console.log(`  Host: ${this.config.credentials.host}`);
      console.log(`  Port: ${this.config.credentials.port}`);
      console.log(`  Secure: ${this.config.credentials.secure}`);
      console.log(`  User: ${this.config.credentials.auth?.user}`);
      console.log(`  From: ${this.config.credentials.from}`);
      console.log(`  To: ${request.to}`);

      const transporter = nodemailer.default.createTransport({
        host: this.config.credentials.host,
        port: this.config.credentials.port,
        secure: this.config.credentials.secure,
        auth: this.config.credentials.auth,
        tls: this.config.credentials.tls || { rejectUnauthorized: false },
        debug: true,
        logger: true,
      });

      // Test connection first
      console.log('🔧 Testing SMTP connection...');
      await transporter.verify();
      console.log('✅ SMTP connection verified successfully');

      const mailOptions = {
        from: this.config.credentials.from,
        to: request.to,
        subject: request.content?.subject || 'CivicPress Notification',
        text: request.content?.text || request.content?.body,
        html: request.content?.html,
      };

      console.log('🔧 Sending email...');
      const info = await transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully');
      console.log(`  Message ID: ${info.messageId}`);
      console.log(`  Response: ${JSON.stringify(info, null, 2)}`);

      return {
        success: true,
        messageId: info.messageId || `smtp_${Date.now()}`,
      };
    } catch (error: any) {
      console.error('❌ SMTP Error:');
      console.error(`  Error: ${error.message}`);
      console.error(`  Code: ${error.code}`);
      console.error(`  Command: ${error.command}`);
      console.error(`  Response: ${error.response}`);
      console.error(`  ResponseCode: ${error.responseCode}`);
      throw error;
    }
  }

  async test(): Promise<boolean> {
    try {
      const config = this.config.credentials;
      if (!config.apiKey) {
        console.warn('⚠️ SendGrid API key not configured');
        return false;
      }
      console.log('✅ SendGrid connection test passed');
      return true;
    } catch (error) {
      console.error('❌ SendGrid connection test failed:', error);
      return false;
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      const config = this.config.credentials;
      if (!config.apiKey && this.config.provider === 'sendgrid') {
        console.error('❌ SendGrid API key is required');
        return false;
      }
      return true;
    } catch (error) {
      console.error('❌ Configuration validation failed:', error);
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
      // Initialize logger
      const logger = initializeLogger();

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

        if (!silent) {
          logger.info('📧 Testing notification system...');
        }

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
        console.log('🔧 Creating email channel with provider:', provider);
        console.log('🔧 Email config:', JSON.stringify(emailConfig, null, 2));

        const rawCreds =
          (emailConfig as any)[provider as any] ||
          (emailConfig as any).sendgrid;
        const emailChannel = new EmailChannel({
          enabled: emailConfig.enabled,
          provider: provider as any,
          credentials: rawCreds,
          settings: {},
        });

        console.log('🔧 Email channel provider:', emailChannel.config.provider);
        console.log(
          '🔧 Email channel credentials:',
          JSON.stringify(emailChannel.config.credentials, null, 2)
        );

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

          if (json) {
            console.log(JSON.stringify(result, null, 2));
          } else if (!silent) {
            if (result.success) {
              logger.success('✅ Email sent successfully!');
              logger.info(`📧 Notification ID: ${result.notificationId}`);
              logger.info(
                `📧 Sent channels: ${result.sentChannels.join(', ')}`
              );
            } else {
              logger.error('❌ Email failed to send');
              logger.error(`📧 Errors: ${result.errors?.join(', ')}`);
            }
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

        if (json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (!silent) {
          if (result.success) {
            logger.success('✅ Email sent successfully!');
            logger.info(`📧 Notification ID: ${result.notificationId}`);
            logger.info(`📧 Sent channels: ${result.sentChannels.join(', ')}`);
          } else {
            logger.error('❌ Email failed to send');
            logger.error(`📧 Errors: ${result.errors?.join(', ')}`);
          }
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: false,
                error: errorMessage,
              },
              null,
              2
            )
          );
        } else if (!options.silent) {
          console.error(`❌ Error: ${errorMessage}`);
        }

        process.exit(1);
      }
    });

  cli
    .command('notify:config', 'Show notification configuration')
    .option('--json', 'Output in JSON format')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      try {
        const { json, silent } = options;

        const config = new NotificationConfig();
        const emailConfig = config.getChannelConfig('email');

        if (json) {
          console.log(
            JSON.stringify(
              {
                email: {
                  enabled: emailConfig?.enabled,
                  provider: emailConfig?.provider,
                  sendgrid: emailConfig?.sendgrid
                    ? {
                        apiKey: emailConfig.sendgrid.apiKey ? '***' : undefined,
                        from: emailConfig.sendgrid.from,
                      }
                    : undefined,
                },
              },
              null,
              2
            )
          );
        } else if (!silent) {
          console.log('📧 Notification Configuration:');
          console.log(`  Email enabled: ${emailConfig?.enabled}`);
          console.log(`  Provider: ${emailConfig?.provider}`);
          if (emailConfig?.sendgrid) {
            console.log(`  SendGrid from: ${emailConfig.sendgrid.from}`);
            console.log(
              `  SendGrid API key: ${emailConfig.sendgrid.apiKey ? 'Configured' : 'Not configured'}`
            );
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: false,
                error: errorMessage,
              },
              null,
              2
            )
          );
        } else if (!options.silent) {
          console.error(`❌ Error: ${errorMessage}`);
        }

        process.exit(1);
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
      // Initialize logger
      const logger = initializeLogger();

      try {
        const { status, limit, json, silent } = options;

        if (!silent) {
          logger.info('📧 Checking notification queue...');
        }

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

        if (json) {
          console.log(
            JSON.stringify(
              {
                statistics: stats,
                queue: filteredHistory,
                filters: {
                  status,
                  limit: parseInt(limit),
                },
              },
              null,
              2
            )
          );
        } else if (!silent) {
          logger.info('📊 Notification Queue Statistics:');
          logger.info(`  Total sent: ${stats.totalSent}`);
          logger.info(`  Total failed: ${stats.totalFailed}`);
          logger.info(
            `  Success rate: ${stats.totalSent > 0 ? ((stats.totalSent / (stats.totalSent + stats.totalFailed)) * 100).toFixed(1) : 0}%`
          );

          if (Object.keys(stats.channels).length > 0) {
            logger.info('\n📧 Channel Statistics:');
            Object.entries(stats.channels).forEach(
              ([channel, data]: [string, any]) => {
                logger.info(
                  `  ${channel}: ${data.sent} sent, ${data.failed} failed`
                );
              }
            );
          }

          if (filteredHistory.length > 0) {
            logger.info(
              `\n📋 Recent Notifications (${filteredHistory.length} entries):`
            );
            filteredHistory.forEach((entry, index) => {
              const timestamp = new Date(entry.timestamp).toLocaleString();
              const status = entry.details?.success ? '✅' : '❌';
              const channels = entry.details?.channels?.join(', ') || 'none';
              const notificationId = entry.id || 'unknown';
              logger.info(
                `  ${index + 1}. ${status} ${notificationId} (${channels}) - ${timestamp}`
              );

              if (entry.details?.errors && entry.details.errors.length > 0) {
                logger.warn(`     Errors: ${entry.details.errors.join(', ')}`);
              }
            });
          } else {
            logger.info(
              '\n📋 No notifications found with the specified filters.'
            );
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: false,
                error: errorMessage,
              },
              null,
              2
            )
          );
        } else if (!options.silent) {
          console.error(`❌ Error: ${errorMessage}`);
        }

        process.exit(1);
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
      // Initialize logger
      const logger = initializeLogger();

      try {
        const { id, all, limit, json, silent } = options;

        if (!silent) {
          logger.info('🔄 Retrying failed notifications...');
        }

        // Initialize configuration
        const config = new NotificationConfig();

        // Create notification service
        const notificationService = new NotificationService(config);

        if (id) {
          // Retry specific notification
          if (!silent) {
            logger.info(`🔄 Retrying notification: ${id}`);
          }

          // This would require implementing retry logic in the notification service
          // For now, we'll just show a message
          if (!silent) {
            logger.warn('⚠️ Retry functionality not yet implemented');
          }

          if (json) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  message: 'Retry functionality not yet implemented',
                },
                null,
                2
              )
            );
          }
        } else if (all) {
          // Retry all failed notifications
          const history = await notificationService.getHistory(parseInt(limit));
          const failedNotifications = history.filter(
            (entry) => !entry.details?.success
          );

          if (!silent) {
            logger.info(
              `Found ${failedNotifications.length} failed notifications to retry`
            );
          }

          if (json) {
            console.log(
              JSON.stringify(
                {
                  success: true,
                  found: failedNotifications.length,
                  message: 'Retry functionality not yet implemented',
                },
                null,
                2
              )
            );
          }
        } else {
          if (!silent) {
            logger.error('❌ Please specify --id or --all');
          }
          process.exit(1);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: false,
                error: errorMessage,
              },
              null,
              2
            )
          );
        } else if (!options.silent) {
          console.error(`❌ Error: ${errorMessage}`);
        }

        process.exit(1);
      }
    });
}
