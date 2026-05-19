// Canonical EmailChannel for CivicPress notifications.
//
// Consolidates 3 previously ad-hoc nodemailer.createTransport call sites
// (cli/src/commands/notify.ts, core/src/auth/email-validation-service.ts,
// modules/notifications/channels/email-channel.ts) into one tested
// implementation. Supports SMTP (with optional TLS settings) and SendGrid
// transports. AWS SES support was advertised but never implemented in the
// deleted module copy — it is intentionally NOT carried forward; reintroduce
// when there is a tested production code path that needs it.
//
// closes: notifications-005 (3-impl consolidation),
//         notifications-006 (createTransporter typo in the deleted file)
import nodemailer, { type Transporter } from 'nodemailer';
import { coreError } from '../../utils/core-output.js';

export type EmailMessage = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
};

export type SmtpOptions = {
  host: string;
  port: number;
  secure?: boolean;
  auth?: { user: string; pass: string };
  // Optional TLS settings (the legacy email-validation impl and CLI passed
  // `tls: { rejectUnauthorized: false }` for self-signed test SMTP servers).
  tls?: { rejectUnauthorized?: boolean };
};

export type SendGridOptions = {
  apiKey: string;
};

export type EmailChannelOptions = {
  // SMTP path (covers what the legacy code called both `smtp` and `nodemailer`
  // — they were the same nodemailer transport with different config keys).
  smtp?: SmtpOptions;
  // SendGrid path (mutually exclusive with smtp).
  sendgrid?: SendGridOptions;
  defaultFrom?: string;
};

export type EmailSendResult = {
  messageId: string;
};

export class EmailChannel {
  private readonly transporter: Transporter;
  private readonly defaultFrom?: string;

  constructor(options: EmailChannelOptions) {
    this.defaultFrom = options.defaultFrom;
    if (options.smtp && options.sendgrid) {
      throw new Error(
        '[EmailChannel] options must include EITHER smtp{} or sendgrid{}, not both'
      );
    }
    if (options.smtp) {
      this.transporter = nodemailer.createTransport({
        host: options.smtp.host,
        port: options.smtp.port,
        secure: options.smtp.secure ?? false,
        auth: options.smtp.auth,
        ...(options.smtp.tls ? { tls: options.smtp.tls } : {}),
      });
    } else if (options.sendgrid) {
      // Use nodemailer's SendGrid service shortcut. The standalone
      // @sendgrid/mail library is a separate code path that we intentionally
      // do not duplicate here — if/when richer SendGrid features (templates,
      // sandbox mode, etc.) are needed, add a second class rather than
      // expanding this one.
      this.transporter = nodemailer.createTransport({
        service: 'SendGrid',
        auth: { user: 'apikey', pass: options.sendgrid.apiKey },
      });
    } else {
      throw new Error(
        '[EmailChannel] options must include either smtp{} or sendgrid{}'
      );
    }
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const from = message.from ?? this.defaultFrom;
    if (!from) {
      throw new Error(
        '[EmailChannel] message.from required (or set defaultFrom in constructor)'
      );
    }
    try {
      const info = await this.transporter.sendMail({
        from,
        to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo,
      });
      return { messageId: info.messageId };
    } catch (err) {
      coreError(
        '[EmailChannel] send failed',
        'EMAIL_SEND_FAILED',
        err instanceof Error ? { message: err.message, name: err.name } : err
      );
      throw err;
    }
  }
}
