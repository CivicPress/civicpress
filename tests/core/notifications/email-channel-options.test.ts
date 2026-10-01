import { describe, it, expect } from 'vitest';
import {
  emailChannelOptionsFromConfig,
  resolveEmailProvider,
  UnknownEmailProviderError,
  EMAIL_PROVIDERS,
} from '../../../core/src/notifications/channels/email-channel-options.js';

// One function builds the transport options for real mail, the CLI test send
// and the API test send. Until 2026-10-01 real mail ignored `provider` and
// always used the `smtp` block, and `replyTo` reached nothing.

const smtp = {
  host: 'smtp.example.org',
  port: 465,
  secure: true,
  auth: { user: 'relay', pass: 'secret' },
  from: 'clerk@town.example',
  tls: { rejectUnauthorized: true },
};
const sendgrid = { apiKey: 'SG.key', from: 'noreply@town.example' };

describe('resolveEmailProvider', () => {
  it('knows exactly two transports', () => {
    expect([...EMAIL_PROVIDERS]).toEqual(['smtp', 'sendgrid']);
    expect(resolveEmailProvider('smtp')).toBe('smtp');
    expect(resolveEmailProvider('SendGrid')).toBe('sendgrid');
  });

  it('treats the legacy `nodemailer` name as smtp', () => {
    expect(resolveEmailProvider('nodemailer')).toBe('smtp');
  });

  it('defaults to smtp when nothing is configured', () => {
    expect(resolveEmailProvider(undefined)).toBe('smtp');
    expect(resolveEmailProvider('')).toBe('smtp');
  });

  it('refuses a transport that does not exist, naming the ones that do', () => {
    expect(() => resolveEmailProvider('ses')).toThrow(
      UnknownEmailProviderError
    );
    expect(() => resolveEmailProvider('ses')).toThrow(/smtp, sendgrid/);
  });
});

describe('emailChannelOptionsFromConfig', () => {
  it('builds the SMTP transport the configured provider names', () => {
    const options = emailChannelOptionsFromConfig({
      provider: 'smtp',
      smtp,
      sendgrid,
    });
    expect(options.sendgrid).toBeUndefined();
    expect(options.smtp).toEqual({
      host: 'smtp.example.org',
      port: 465,
      secure: true,
      auth: { user: 'relay', pass: 'secret' },
      tls: { rejectUnauthorized: true },
    });
    expect(options.defaultFrom).toBe('clerk@town.example');
  });

  it('builds the SendGrid transport when the file says so — the case real mail used to ignore', () => {
    const options = emailChannelOptionsFromConfig({
      provider: 'sendgrid',
      smtp,
      sendgrid,
    });
    expect(options.smtp).toBeUndefined();
    expect(options.sendgrid).toEqual({ apiKey: 'SG.key' });
    expect(options.defaultFrom).toBe('noreply@town.example');
  });

  it('lets a test send override the configured provider for that send', () => {
    const options = emailChannelOptionsFromConfig(
      { provider: 'smtp', smtp, sendgrid },
      { provider: 'sendgrid' }
    );
    expect(options.sendgrid).toEqual({ apiKey: 'SG.key' });
  });

  it('carries `replyTo` onto the channel, and ignores an empty one', () => {
    expect(
      emailChannelOptionsFromConfig({
        provider: 'smtp',
        smtp,
        replyTo: ' records@town.example ',
      }).defaultReplyTo
    ).toBe('records@town.example');
    expect(
      emailChannelOptionsFromConfig({ provider: 'smtp', smtp, replyTo: null })
        .defaultReplyTo
    ).toBeUndefined();
    expect(
      emailChannelOptionsFromConfig({ provider: 'smtp', smtp, replyTo: '' })
        .defaultReplyTo
    ).toBeUndefined();
  });

  it('leaves `auth` out for a relay configured without credentials', () => {
    const options = emailChannelOptionsFromConfig({
      provider: 'smtp',
      smtp: { ...smtp, auth: { user: '', pass: '' } },
    });
    expect(options.smtp).not.toHaveProperty('auth');
  });

  it('validates the server certificate unless the file opts out explicitly', () => {
    expect(
      emailChannelOptionsFromConfig({
        provider: 'smtp',
        smtp: { ...smtp, tls: undefined },
      }).smtp?.tls
    ).toEqual({ rejectUnauthorized: true });
    expect(
      emailChannelOptionsFromConfig({
        provider: 'smtp',
        smtp: { ...smtp, tls: { rejectUnauthorized: false } },
      }).smtp?.tls
    ).toEqual({ rejectUnauthorized: false });
  });

  it('refuses an unknown provider rather than guessing a transport', () => {
    expect(() =>
      emailChannelOptionsFromConfig({ provider: 'ses', smtp, sendgrid })
    ).toThrow(UnknownEmailProviderError);
  });
});
