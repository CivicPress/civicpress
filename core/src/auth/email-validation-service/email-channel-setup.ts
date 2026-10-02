import { Logger } from '../../utils/logger.js';
import { NotificationService } from '../../notifications/notification-service.js';
import { NotificationConfig } from '../../notifications/notification-config.js';
import {
  EmailChannel,
  type CreateTransport,
} from '../../notifications/channels/email-channel.js';
import { emailChannelOptionsFromConfig } from '../../notifications/channels/email-channel-options.js';
import type { ChannelRequest } from '../../notifications/notification-channel.js';

/**
 * Register an `email` channel on the given NotificationService.
 *
 * Extracted from `EmailValidationService.registerEmailChannel()` to keep the
 * main file under the master plan §5 LoC ceiling. Behaviour is identical to
 * the previous in-class implementation:
 *
 *   - reads channel config via {@link NotificationConfig}
 *   - builds the transport the configured `provider` names
 *     (`emailChannelOptionsFromConfig`), with `replyTo` applied
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
  logger: Logger,
  deps: {
    /** The configuration to read; defaults to the instance's file. */
    notificationConfig?: NotificationConfig;
    /** Transport factory, injectable so tests never open a socket. */
    createTransport?: CreateTransport;
  } = {}
): void {
  try {
    const notificationConfig =
      deps.notificationConfig ?? new NotificationConfig();
    const emailConfig = notificationConfig.getChannelConfig('email');

    if (!emailConfig || !emailConfig.enabled) {
      logger.warn('Email channel not enabled in configuration');
      return;
    }

    // The configured provider decides the transport — `smtp` or `sendgrid` —
    // and `replyTo` rides along. Until 2026-10-01 this path built an SMTP
    // transport from the `smtp` block whatever `provider` said, so a file that
    // selected SendGrid sent real mail to `localhost:587` while the test send
    // (which did honour it) succeeded.
    const options = emailChannelOptionsFromConfig(emailConfig);
    const canonical = deps.createTransport
      ? new EmailChannel(options, deps.createTransport)
      : new EmailChannel(options);

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
            error: error instanceof Error ? error.message : 'Email send failed',
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

    // Bootstrap detail — `debug`, not `info`: fires during core init for every
    // command; at `info` it prints to stdout and corrupts `--json` output.
    logger.debug('Email channel registered successfully');
  } catch (error) {
    logger.error('Error registering email channel:', error);
  }
}
