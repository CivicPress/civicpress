import { Router } from 'express';
import { requirePermission } from '../middleware/auth.js';
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
function normalizeMetadata<T = unknown>(input: unknown): T {
  if (input == null) return input as T;
  if (Array.isArray(input))
    return input.map((i) => normalizeMetadata(i)) as unknown as T;
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if (
      'value' in obj &&
      Object.keys(obj).some((k) =>
        ['type', 'description', 'required', 'options', 'value'].includes(k)
      )
    ) {
      return normalizeMetadata(obj.value) as T;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = normalizeMetadata(v);
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
    // Provider-specific credential blocks (sendgrid / smtp / nodemailer / etc.)
    // are stored as siblings of the typed channel fields; lookup is dynamic.
    const cfgRecord = emailConfig as unknown as Record<string, unknown>;
    const rawCreds = cfgRecord[effectiveProvider] ?? cfgRecord.sendgrid;
    const credentials = normalizeMetadata<Record<string, unknown>>(rawCreds);

    let channel: EmailChannel;
    if (effectiveProvider === 'smtp' || effectiveProvider === 'nodemailer') {
      channel = new EmailChannel({
        smtp: {
          host: String(credentials.host || ''),
          port: Number(credentials.port ?? 587),
          secure: Boolean(credentials.secure),
          auth: credentials.auth as { user: string; pass: string } | undefined,
          tls: (credentials.tls as { rejectUnauthorized: boolean } | undefined) || {
            rejectUnauthorized: false,
          },
        },
        defaultFrom: credentials.from as string | undefined,
      });
    } else {
      channel = new EmailChannel({
        sendgrid: { apiKey: String(credentials.apiKey || '') },
        defaultFrom: credentials.from as string | undefined,
      });
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
        content?: { subject?: string; text?: string; body?: string; html?: string };
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
