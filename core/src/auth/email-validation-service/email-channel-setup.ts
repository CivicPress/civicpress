import { Logger } from '../../utils/logger.js';
import { NotificationService } from '../../notifications/notification-service.js';
import { NotificationConfig } from '../../notifications/notification-config.js';
import {
  EmailChannel,
  type EmailChannelOptions,
} from '../../notifications/channels/email-channel.js';
import type { ChannelRequest } from '../../notifications/notification-channel.js';

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
    // Loose `unknown` input: either the raw value, or `{ value: ... }` wrapper.
    // Returns `unknown` so callsites narrow explicitly per-field.
    const normalizeValue = (obj: unknown): unknown =>
      obj && typeof obj === 'object' && 'value' in obj
        ? (obj as { value: unknown }).value
        : obj;

    type SmtpShape = {
      host?: unknown;
      port?: unknown;
      secure?: unknown;
      auth?: { user?: unknown; pass?: unknown };
      from?: unknown;
      tls?: unknown;
    };
    const smtpConfig = normalizeValue(
      emailConfig.smtp || emailConfig
    ) as SmtpShape;
    const host = String(normalizeValue(smtpConfig.host) ?? '');
    const port = Number(normalizeValue(smtpConfig.port) ?? 587);
    const secure = Boolean(normalizeValue(smtpConfig.secure));
    const auth = {
      user: String(normalizeValue(smtpConfig.auth?.user) ?? ''),
      pass: String(normalizeValue(smtpConfig.auth?.pass) ?? ''),
    };
    const from = String(normalizeValue(smtpConfig.from) ?? '');
    const tlsRaw = normalizeValue(smtpConfig.tls) as
      | { rejectUnauthorized?: unknown }
      | null
      | undefined;
    // FA-API-017: validate the SMTP server cert by default; only an explicit
    // rejectUnauthorized:false in config may turn it off (e.g. a test relay).
    const rejectUnauthorized =
      tlsRaw?.rejectUnauthorized !== undefined
        ? Boolean(normalizeValue(tlsRaw.rejectUnauthorized))
        : true;

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
      async send(request: ChannelRequest) {
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

    // Register the channel. NotificationChannel is an abstract class but
    // the duck-typed adapter above implements the surface the service uses
    // (send/getName/isEnabled); structural cast through `unknown` to satisfy
    // the abstract-class parameter without re-declaring the class.
    notificationService.registerChannel(
      'email',
      emailChannel as unknown as Parameters<
        NotificationService['registerChannel']
      >[1]
    );

    logger.info('Email channel registered successfully');
  } catch (error) {
    logger.error('Error registering email channel:', error);
  }
}
