import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailChannel } from '../../../core/src/notifications/channels/email-channel.js';

// EmailChannel takes its nodemailer transport factory as an injectable
// dependency, so tests pass a fake `createTransport` directly — no
// `vi.mock('nodemailer')`, which was fragile here (the source resolves
// nodemailer from core/'s node_modules, this root test from the root, so the
// module mock missed and real SMTP/DNS was hit). See known-test-issues D1.
const sendMail = vi.fn().mockResolvedValue({ messageId: 'test-id-1' });
const createTransport = vi.fn(
  () =>
    ({ sendMail }) as unknown as ReturnType<
      typeof import('nodemailer').createTransport
    >
);

describe('EmailChannel (canonical)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMail.mockResolvedValue({ messageId: 'test-id-1' });
  });

  it('uses SMTP transport when options.smtp is provided', () => {
    new EmailChannel(
      {
        smtp: { host: 'smtp.example.com', port: 587 },
        defaultFrom: 'noreply@civicpress.org',
      },
      createTransport
    );
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com', port: 587 })
    );
  });

  it('uses SendGrid transport when options.sendgrid is provided', () => {
    new EmailChannel(
      {
        sendgrid: { apiKey: 'SG.test-key' },
        defaultFrom: 'noreply@civicpress.org',
      },
      createTransport
    );
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'SendGrid' })
    );
  });

  it('throws if neither smtp nor sendgrid is configured', () => {
    expect(
      () => new EmailChannel({ defaultFrom: 'x@y.z' } as any, createTransport)
    ).toThrow(/smtp\{\} or sendgrid\{\}/);
  });

  it('sends with default from when message.from is omitted', async () => {
    const ch = new EmailChannel(
      {
        smtp: { host: 'smtp.example.com', port: 587 },
        defaultFrom: 'noreply@civicpress.org',
      },
      createTransport
    );
    const { messageId } = await ch.send({
      to: 'user@example.com',
      subject: 'hi',
      text: 'body',
    });
    expect(messageId).toBe('test-id-1');
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@civicpress.org',
        to: 'user@example.com',
      })
    );
  });

  it('throws if no from and no defaultFrom', async () => {
    const ch = new EmailChannel(
      { smtp: { host: 'smtp.example.com', port: 587 } },
      createTransport
    );
    await expect(
      ch.send({ to: 'u@e.com', subject: 's', text: 'b' })
    ).rejects.toThrow(/from required/);
  });

  it('passes tls option through to nodemailer.createTransport when provided', () => {
    new EmailChannel(
      {
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          tls: { rejectUnauthorized: false },
        },
        defaultFrom: 'noreply@civicpress.org',
      },
      createTransport
    );
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ tls: { rejectUnauthorized: false } })
    );
  });

  it('throws if both smtp and sendgrid are provided', () => {
    expect(
      () =>
        new EmailChannel(
          {
            smtp: { host: 'smtp.example.com', port: 587 },
            sendgrid: { apiKey: 'SG.test-key' },
          },
          createTransport
        )
    ).toThrow(/not both/);
  });

  it('joins array of recipients into comma-separated string', async () => {
    const ch = new EmailChannel(
      {
        smtp: { host: 'smtp.example.com', port: 587 },
        defaultFrom: 'noreply@civicpress.org',
      },
      createTransport
    );
    await ch.send({
      to: ['a@example.com', 'b@example.com'],
      subject: 'multi',
      text: 'hi',
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@example.com, b@example.com' })
    );
  });
});
