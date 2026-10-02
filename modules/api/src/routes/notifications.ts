import { Router } from 'express';
import { requirePermission } from '../middleware/auth.js';
import {
  AuditLogger,
  NotificationService,
  NotificationConfig,
  AuthTemplate,
  EmailChannel,
  emailChannelOptionsFromConfig,
  UnknownEmailProviderError,
} from '@civicpress/core';

const router = Router();
const audit = new AuditLogger();

// Protect all routes
router.use(requirePermission('system:admin'));

// POST /api/v1/notifications/test
router.post('/test', async (req, res) => {
  try {
    const { to, subject, message, provider } = req.body || {};

    if (!to) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Recipient email (to) is required',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    // Load notifications config
    const config = new NotificationConfig();
    const emailConfig = config.getChannelConfig('email');
    if (!emailConfig || !emailConfig.enabled) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Email channel is not enabled in configuration',
          code: 'EMAIL_CHANNEL_DISABLED',
        },
      });
    }

    // The transport comes from the same function the real-mail path uses, so
    // this test send exercises what real mail will do. `provider` in the body
    // (the settings page's selector) overrides the configured one for this
    // send only.
    let channel: EmailChannel;
    let effectiveProvider: string;
    try {
      const options = emailChannelOptionsFromConfig(emailConfig, { provider });
      effectiveProvider = options.sendgrid ? 'sendgrid' : 'smtp';
      channel = new EmailChannel(options);
    } catch (error) {
      if (error instanceof UnknownEmailProviderError) {
        return res.status(400).json({
          success: false,
          error: {
            message: error.message,
            code: 'UNKNOWN_EMAIL_PROVIDER',
          },
        });
      }
      throw error;
    }

    // Wrap the canonical EmailChannel in a NotificationChannel-shaped adapter
    // so NotificationService.registerChannel + sendNotification keeps working.
    // NotificationChannel is an abstract class, not an interface — the adapter
    // is structurally compatible with the subset NotificationService actually
    // calls (getName, isEnabled, send), so we cast through `unknown` rather
    // than subclass it (subclassing would require implementing abstract `test`,
    // `validateConfig`, `getCapabilities` which the test endpoint doesn't use).
    const notificationChannel = {
      getName() {
        return 'email';
      },
      isEnabled() {
        return true;
      },
      async send(request: {
        content?: {
          subject?: string;
          text?: string;
          body?: string;
          html?: string;
        };
      }) {
        const subj =
          request?.content?.subject || subject || 'CivicPress Notification';
        const bodyText =
          request?.content?.text || request?.content?.body || message || '';
        const bodyHtml = request?.content?.html || undefined;
        const result = await channel.send({
          to,
          subject: subj,
          text: bodyText,
          html: bodyHtml,
        });
        return { success: true, messageId: result.messageId };
      },
    };

    const service = new NotificationService(config);
    service.registerChannel(
      'email',
      notificationChannel as unknown as Parameters<
        NotificationService['registerChannel']
      >[1]
    );

    // Register a simple template and send
    const tmpl = new AuthTemplate(
      'direct',
      message || 'This is a test email from CivicPress.'
    );
    service.registerTemplate('direct', tmpl);
    const result = await service.sendNotification({
      email: to,
      channels: ['email'],
      template: 'direct',
      data: {},
    });

    const actor = req.user;
    await audit.log({
      source: 'api',
      actor: { id: actor?.id, username: actor?.username, role: actor?.role },
      action: 'notifications:test',
      target: { type: 'notification', name: 'test_email' },
      outcome: result.success ? 'success' : 'failure',
      metadata: { provider: effectiveProvider, to },
    });

    // A send the channel reported as failed is a failure. This used to answer
    // `{ success: true, data: result }` whatever `result.success` said, so the
    // settings page showed "Test email sent" for mail that never left — and
    // `result.errors`, the raw channel errors, went out on the wire, which is
    // what the catch block below is careful not to do.
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to send test email',
          code: 'NOTIFICATION_SEND_FAILED',
        },
      });
    }

    return res.json({ success: true, data: result });
  } catch (error: unknown) {
    const actor = req.user;
    const errorMessage = error instanceof Error ? error.message : String(error);
    await audit.log({
      source: 'api',
      actor: { id: actor?.id, username: actor?.username, role: actor?.role },
      action: 'notifications:test',
      target: { type: 'notification', name: 'test_email' },
      outcome: 'failure',
      message: errorMessage,
    });
    // The raw message stays in the audit log above — never on the wire
    // (SMTP errors carry hosts, credential hints, and config paths).
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to send test email',
        code: 'NOTIFICATION_SEND_FAILED',
      },
    });
  }
});

export default router;
