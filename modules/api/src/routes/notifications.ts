import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import {
  AuditLogger,
  NotificationService,
  NotificationConfig,
  AuthTemplate,
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

    // Build a minimal inline email channel using SendGrid or SMTP
    const effectiveProvider = provider || emailConfig.provider || 'sendgrid';
    const rawCreds =
      (emailConfig as any)[effectiveProvider] || (emailConfig as any).sendgrid;
    const credentials = normalizeMetadata(rawCreds);

    const emailChannel = {
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

        if (
          effectiveProvider === 'smtp' ||
          effectiveProvider === 'nodemailer'
        ) {
          const nodemailer = await import('nodemailer');
          const transporter = nodemailer.createTransport({
            host: String(credentials.host || ''),
            port: Number(credentials.port ?? 587),
            secure: Boolean(credentials.secure),
            auth: credentials.auth,
            tls: credentials.tls || { rejectUnauthorized: false },
          } as any);
          await transporter.verify();
          const info = await transporter.sendMail({
            from: credentials.from,
            to,
            subject: subj,
            text: bodyText,
            html: bodyHtml,
          });
          return { success: true, messageId: info.messageId };
        }

        // Default to SendGrid
        const sg = await import('@sendgrid/mail');
        sg.default.setApiKey(credentials.apiKey);
        const resp = await sg.default.send({
          to,
          from: credentials.from,
          subject: subj,
          text: bodyText,
          html: bodyHtml,
        });
        return {
          success: true,
          messageId: resp?.[0]?.headers?.['x-message-id'] || `sg_${Date.now()}`,
        };
      },
    };

    const service = new NotificationService(config);
    service.registerChannel('email', emailChannel as any);

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

    const actor = (req as any).user || {};
    await audit.log({
      source: 'api',
      actor: { id: actor.id, username: actor.username, role: actor.role },
      action: 'notifications:test',
      target: { type: 'notification', name: 'test_email' },
      outcome: result.success ? 'success' : 'failure',
      metadata: { provider: effectiveProvider, to },
    });

    return res.json({ success: true, data: result });
  } catch (error: any) {
    const actor = (req as any).user || {};
    await audit.log({
      source: 'api',
      actor: { id: actor.id, username: actor.username, role: actor.role },
      action: 'notifications:test',
      target: { type: 'notification', name: 'test_email' },
      outcome: 'failure',
      message: String(error?.message || error),
    });
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to send test email',
    });
  }
});

export default router;
