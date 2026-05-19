import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock state. Declared inside vi.mock factory via hoisted refs so the
// test can both (a) drive the mock and (b) assert against it.
const mocks = vi.hoisted(() => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'test-id-1' });
  const createTransport = vi.fn(() => ({ sendMail }));
  return { sendMail, createTransport };
});

vi.mock('nodemailer', () => {
  return {
    default: { createTransport: mocks.createTransport },
    createTransport: mocks.createTransport,
  };
});

import { EmailChannel } from '../../../core/src/notifications/channels/email-channel.js';

describe('EmailChannel (canonical)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses SMTP transport when options.smtp is provided', () => {
    new EmailChannel({
      smtp: { host: 'smtp.example.com', port: 587 },
      defaultFrom: 'noreply@civicpress.org',
    });
    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com', port: 587 })
    );
  });

  it('uses SendGrid transport when options.sendgrid is provided', () => {
    new EmailChannel({
      sendgrid: { apiKey: 'SG.test-key' },
      defaultFrom: 'noreply@civicpress.org',
    });
    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'SendGrid' })
    );
  });

  it('throws if neither smtp nor sendgrid is configured', () => {
    expect(
      () => new EmailChannel({ defaultFrom: 'x@y.z' } as any)
    ).toThrow(/smtp\{\} or sendgrid\{\}/);
  });

  it('sends with default from when message.from is omitted', async () => {
    const ch = new EmailChannel({
      smtp: { host: 'smtp.example.com', port: 587 },
      defaultFrom: 'noreply@civicpress.org',
    });
    const { messageId } = await ch.send({
      to: 'user@example.com',
      subject: 'hi',
      text: 'body',
    });
    expect(messageId).toBe('test-id-1');
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@civicpress.org',
        to: 'user@example.com',
      })
    );
  });

  it('throws if no from and no defaultFrom', async () => {
    const ch = new EmailChannel({
      smtp: { host: 'smtp.example.com', port: 587 },
    });
    await expect(
      ch.send({ to: 'u@e.com', subject: 's', text: 'b' })
    ).rejects.toThrow(/from required/);
  });

  it('passes tls option through to nodemailer.createTransport when provided', () => {
    new EmailChannel({
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        tls: { rejectUnauthorized: false },
      },
      defaultFrom: 'noreply@civicpress.org',
    });
    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ tls: { rejectUnauthorized: false } })
    );
  });

  it('throws if both smtp and sendgrid are provided', () => {
    expect(
      () =>
        new EmailChannel({
          smtp: { host: 'smtp.example.com', port: 587 },
          sendgrid: { apiKey: 'SG.test-key' },
        })
    ).toThrow(/not both/);
  });

  it('joins array of recipients into comma-separated string', async () => {
    const ch = new EmailChannel({
      smtp: { host: 'smtp.example.com', port: 587 },
      defaultFrom: 'noreply@civicpress.org',
    });
    await ch.send({
      to: ['a@example.com', 'b@example.com'],
      subject: 'multi',
      text: 'hi',
    });
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@example.com, b@example.com' })
    );
  });
});
