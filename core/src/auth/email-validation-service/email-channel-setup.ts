import { Logger } from '../../utils/logger.js';
import { NotificationService } from '../../notifications/notification-service.js';
import { NotificationConfig } from '../../notifications/notification-config.js';
import {
  EmailChannel,
  type EmailChannelOptions,
} from '../../notifications/channels/email-channel.js';

/**
 * Register an `email` channel on the given NotificationService.
 *
 * Extracted from `EmailValidationService.registerEmailChannel()` to keep the
 * main file under the master plan §5 LoC ceiling. Behaviour is identical to
 * the previous in-class implementation:
 *
 *   - reads channel config via {@link NotificationConfig}
 *   - normalizes the metadata-shaped SMTP config (`{ value: ... }` wrappers)
 *   - constructs a canonical {@link EmailChannel}
 *   - wraps it in a thin `NotificationChannel`-shaped adapter that translates
 *     the notification system's `ChannelRequest` envelope into the canonical
 *     channel's `EmailMessage` envelope
 *   - registers the adapter under the name `email`
 *
 * If the email channel is not enabled in configuration, this returns silently
 * after warning, matching the pre-extraction behaviour.
 */
export function registerEmailChannelOn(
  notificationService: NotificationService,
  logger: Logger
): void {
  try {
    // Create notification config to get email configuration
    const notificationConfig = new NotificationConfig();
    const emailConfig = notificationConfig.getChannelConfig('email');

    if (!emailConfig || !emailConfig.enabled) {
      logger.warn('Email channel not enabled in configuration');
      return;
    }

    // Normalize the configuration (handle metadata format).
    const normalizeValue = (obj: any) =>
      obj && typeof obj === 'object' && 'value' in obj ? obj.value : obj;

    const smtpConfig = normalizeValue(emailConfig.smtp || emailConfig);
    const host = normalizeValue(smtpConfig.host);
    const port = Number(normalizeValue(smtpConfig.port) ?? 587);
    const secure = Boolean(normalizeValue(smtpConfig.secure));
    const auth = {
      user: normalizeValue(smtpConfig.auth?.user),
      pass: normalizeValue(smtpConfig.auth?.pass),
    };
    const from = normalizeValue(smtpConfig.from);
    const tlsRaw = normalizeValue(smtpConfig.tls);
    const rejectUnauthorized =
      tlsRaw && tlsRaw.rejectUnauthorized
        ? normalizeValue(tlsRaw.rejectUnauthorized)
        : false;

    const options: EmailChannelOptions = {
      smtp: {
        host,
        port,
        secure,
        auth,
        tls: { rejectUnauthorized },
      },
      defaultFrom: from,
    };

    const canonical = new EmailChannel(options);

    const emailChannel = {
      getName() {
        return 'email';
      },
      isEnabled() {
        return true;
      },
      async send(request: any) {
        try {
          const { messageId } = await canonical.send({
            to: request.to,
            subject:
              request.content?.subject || 'Verify your CivicPress account',
            text: request.content?.text || request.content?.body,
            html: request.content?.html,
          });
          return {
            success: true,
            messageId: messageId || `smtp_${Date.now()}`,
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error ? error.message : 'Email send failed',
          };
        }
      },
    };

    // Register the channel
    notificationService.registerChannel('email', emailChannel as any);

    logger.info('Email channel registered successfully');
  } catch (error) {
    logger.error('Error registering email channel:', error);
  }
}
