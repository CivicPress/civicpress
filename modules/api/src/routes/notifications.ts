import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import {
  AuditLogger,
  NotificationService,
  NotificationConfig,
  AuthTemplate,
  EmailChannel,
} from '@civicpress/core';

const router = Router();
const audit = new AuditLogger();

// Protect all routes
router.use(requirePermission('system:admin'));

// Normalize metadata-shaped values { value, type, ... } to plain scalars
function normalizeMetadata<T = any>(input: any): T {
  if (input == null) return input as T;
  if (Array.isArray(input))
    return input.map((i) => normalizeMetadata(i)) as any;
  if (typeof input === 'object') {
    if (
      'value' in input &&
      Object.keys(input).some((k) =>
        ['type', 'description', 'required', 'options', 'value'].includes(k)
      )
    ) {
      return normalizeMetadata((input as any).value) as T;
    }
    const out: any = {};
    for (const [k, v] of Object.entries(input)) out[k] = normalizeMetadata(v);
    return out as T;
  }
  return input as T;
}

// POST /api/v1/notifications/test
router.post('/test', async (req, res) => {
  try {
    const { to, subject, message, provider } = req.body || {};

    if (!to) {
      return res
        .status(400)
        .json({ success: false, error: 'Recipient email (to) is required' });
    }

    // Load notifications config
    const config = new NotificationConfig();
    const emailConfig = config.getChannelConfig('email');
    if (!emailConfig || !emailConfig.enabled) {
      return res.status(400).json({
        success: false,
        error: 'Email channel is not enabled in configuration',
      });
    }

    // Build the canonical EmailChannel for this test send (Phase 2c.5 T3 —
    // closes the 4th ad-hoc EmailChannel impl that Phase 2c T6 missed).
    const effectiveProvider = provider || emailConfig.provider || 'sendgrid';
    const rawCreds =
      (emailConfig as any)[effectiveProvider] || (emailConfig as any).sendgrid;
    const credentials = normalizeMetadata<any>(rawCreds);

    let channel: EmailChannel;
    if (effectiveProvider === 'smtp' || effectiveProvider === 'nodemailer') {
      channel = new EmailChannel({
        smtp: {
          host: String(credentials.host || ''),
          port: Number(credentials.port ?? 587),
          secure: Boolean(credentials.secure),
          auth: credentials.auth,
          tls: credentials.tls || { rejectUnauthorized: false },
        },
        defaultFrom: credentials.from,
      });
    } else {
      channel = new EmailChannel({
        sendgrid: { apiKey: credentials.apiKey },
        defaultFrom: credentials.from,
      });
    }

    // Wrap the canonical EmailChannel in a NotificationChannel-shaped adapter
    // so NotificationService.registerChannel + sendNotification keeps working.
    const notificationChannel = {
      getName() {
        return 'email';
      },
      isEnabled() {
        return true;
      },
      async send(request: any) {
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
    service.registerChannel('email', notificationChannel as any);

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
    return res.status(500).json({
      success: false,
      error: errorMessage || 'Failed to send test email',
    });
  }
});

export default router;
