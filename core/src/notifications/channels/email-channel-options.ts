// One place that turns the `channels.email` configuration into the options
// the canonical EmailChannel takes.
//
// Until 2026-10-01 there were three: the real-mail path
// (`email-channel-setup.ts`) always built an SMTP transport from the `smtp`
// block whatever `provider` said, while `civic notify:test` and
// `POST /notifications/test` each had their own copy that did honour it. So an
// operator who selected SendGrid saw a test email succeed through SendGrid and
// then every real email go to the SMTP block — `localhost:587` on an untouched
// file. `replyTo` was declared, documented and passed to nothing.
import type { EmailChannelOptions } from './email-channel.js';

/** The transports that exist. `nodemailer` is accepted as a legacy alias of `smtp`. */
export const EMAIL_PROVIDERS = ['smtp', 'sendgrid'] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export class UnknownEmailProviderError extends Error {
  constructor(public readonly provider: string) {
    super(
      `Unknown email provider '${provider}' (expected one of: ${EMAIL_PROVIDERS.join(', ')})`
    );
    this.name = 'UnknownEmailProviderError';
  }
}

/** The plain-shape `channels.email` block (what NotificationConfig returns). */
export interface EmailChannelConfigLike {
  provider?: string;
  smtp?: {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: { user?: string; pass?: string };
    from?: string;
    tls?: { rejectUnauthorized?: boolean };
  };
  sendgrid?: { apiKey?: string; from?: string };
  replyTo?: string | null;
}

/**
 * Normalise a provider name. `nodemailer` was shipped as a fourth option for
 * years; it was the SMTP transport under another key, so files that still say
 * it keep working.
 */
export function resolveEmailProvider(value: unknown): EmailProvider {
  const name =
    String(value ?? '')
      .trim()
      .toLowerCase() || 'smtp';
  if (name === 'nodemailer') return 'smtp';
  if ((EMAIL_PROVIDERS as readonly string[]).includes(name)) {
    return name as EmailProvider;
  }
  throw new UnknownEmailProviderError(name);
}

/**
 * Build EmailChannel options from the configured email channel.
 *
 * `override.provider` lets a test send pick a transport explicitly (the CLI
 * `--provider` flag, the settings page's selector); otherwise the configured
 * `provider` decides.
 */
export function emailChannelOptionsFromConfig(
  email: EmailChannelConfigLike,
  override: { provider?: string } = {}
): EmailChannelOptions {
  const provider = resolveEmailProvider(override.provider ?? email.provider);
  const replyTo =
    typeof email.replyTo === 'string' && email.replyTo.trim() !== ''
      ? email.replyTo.trim()
      : undefined;

  if (provider === 'sendgrid') {
    const sendgrid = email.sendgrid ?? {};
    return {
      sendgrid: { apiKey: String(sendgrid.apiKey ?? '') },
      defaultFrom: sendgrid.from || undefined,
      defaultReplyTo: replyTo,
    };
  }

  const smtp = email.smtp ?? {};
  const user = String(smtp.auth?.user ?? '');
  return {
    smtp: {
      host: String(smtp.host ?? ''),
      port: Number(smtp.port ?? 587),
      secure: Boolean(smtp.secure),
      // A relay that takes no credentials is configured with an empty user.
      // Handed `{ user: '', pass: '' }`, nodemailer fails client-side with
      // "Missing credentials" as soon as the server advertises AUTH, before
      // anything is sent; leave `auth` out instead.
      ...(user ? { auth: { user, pass: String(smtp.auth?.pass ?? '') } } : {}),
      // Validate the server certificate unless the file opts out explicitly
      // (a self-signed test relay). Same default as before, now in one place.
      tls: { rejectUnauthorized: smtp.tls?.rejectUnauthorized !== false },
    },
    defaultFrom: smtp.from || undefined,
    defaultReplyTo: replyTo,
  };
}
