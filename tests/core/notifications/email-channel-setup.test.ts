import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { registerEmailChannelOn } from '../../../core/src/auth/email-validation-service/email-channel-setup.js';
import { NotificationConfig } from '../../../core/src/notifications/notification-config.js';
import { NotificationService } from '../../../core/src/notifications/notification-service.js';
import type { Logger } from '../../../core/src/utils/logger.js';

// The real-mail path. Until 2026-10-01 it built an SMTP transport from the
// `smtp` block whatever `provider` said, and never passed `replyTo`.

const sendMail = vi.fn().mockResolvedValue({ messageId: 'mid-1' });
const createTransport = vi.fn(
  () =>
    ({ sendMail }) as unknown as ReturnType<
      typeof import('nodemailer').createTransport
    >
);
const logger = {
  warn: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

let dir: string;
beforeEach(() => {
  vi.clearAllMocks();
  dir = mkdtempSync(join(tmpdir(), 'civic-email-setup-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function configWith(yaml: string): NotificationConfig {
  writeFileSync(join(dir, 'notifications.yml'), yaml);
  return new NotificationConfig(dir);
}

const SMTP_BLOCK = [
  '    smtp:',
  '      host: smtp.town.example',
  '      port: 587',
  '      secure: false',
  '      auth: { user: relay, pass: secret }',
  '      from: clerk@town.example',
].join('\n');

function registered(config: NotificationConfig) {
  const service = new NotificationService(config);
  const register = vi.spyOn(service, 'registerChannel');
  registerEmailChannelOn(service, logger, {
    notificationConfig: config,
    createTransport,
  });
  return register.mock.calls[0]?.[1] as
    | { send(request: unknown): Promise<{ success: boolean }> }
    | undefined;
}

describe('registerEmailChannelOn', () => {
  it('builds the SendGrid transport when the file selects it', () => {
    registered(
      configWith(
        [
          'channels:',
          '  email:',
          '    enabled: true',
          '    provider: sendgrid',
          '    sendgrid: { apiKey: SG.key, from: noreply@town.example }',
          SMTP_BLOCK,
        ].join('\n')
      )
    );
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport.mock.calls[0][0]).toMatchObject({
      service: 'SendGrid',
      auth: { user: 'apikey', pass: 'SG.key' },
    });
  });

  it('builds the SMTP transport when the file selects it', () => {
    registered(
      configWith(
        [
          'channels:',
          '  email:',
          '    enabled: true',
          '    provider: smtp',
          SMTP_BLOCK,
        ].join('\n')
      )
    );
    expect(createTransport.mock.calls[0][0]).toMatchObject({
      host: 'smtp.town.example',
      port: 587,
      auth: { user: 'relay', pass: 'secret' },
      tls: { rejectUnauthorized: true },
    });
  });

  it('still sends through SMTP for a file written when the option was called nodemailer', () => {
    registered(
      configWith(
        [
          'channels:',
          '  email:',
          '    enabled: true',
          '    provider: nodemailer',
          '    nodemailer:',
          '      host: legacy.town.example',
          '      port: 25',
          '      secure: false',
          '      auth: { user: u, pass: p }',
          '      from: clerk@town.example',
        ].join('\n')
      )
    );
    expect(createTransport.mock.calls[0][0]).toMatchObject({
      host: 'legacy.town.example',
      port: 25,
    });
  });

  it('puts the configured replyTo on every message', async () => {
    const channel = registered(
      configWith(
        [
          'channels:',
          '  email:',
          '    enabled: true',
          '    provider: smtp',
          SMTP_BLOCK,
          '    replyTo: records@town.example',
        ].join('\n')
      )
    );
    expect(channel).toBeDefined();
    const result = await channel!.send({
      to: 'someone@example.org',
      content: { subject: 'Hello', body: 'Body' },
    });
    expect(result.success).toBe(true);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'someone@example.org',
        from: 'clerk@town.example',
        replyTo: 'records@town.example',
      })
    );
  });

  it('registers nothing when email is off', () => {
    expect(
      registered(
        configWith(
          [
            'channels:',
            '  email:',
            '    enabled: false',
            '    provider: smtp',
            SMTP_BLOCK,
          ].join('\n')
        )
      )
    ).toBeUndefined();
    expect(createTransport).not.toHaveBeenCalled();
  });
});
