/**
 * The notification reader against the file a real instance actually has.
 *
 * `civic init` copies `core/src/defaults/notifications.yml` into a new instance
 * byte for byte, and that file is written in the FIELD shape
 * (`enabled: { value: false, type: 'boolean', … }`). So is whatever the config
 * editor saves. `NotificationConfig` used to cast the parsed file straight to
 * its typed plain shape, and on such a file:
 *
 *   - `isChannelEnabled('email')` returned the field object — truthy — so a
 *     channel that was switched off read as on;
 *   - the hourly limit was an object, so `limit - count` was NaN, `NaN > 0`
 *     was false, and every send was refused as rate-limited.
 *
 * No notification could be sent on an instance created by `civic init`.
 *
 * Every other notification test copies `tests/fixtures/notifications.yml`,
 * which is written in the plain shape — so the suite proved the feature
 * against a file no instance has. These tests load the shipped one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { NotificationConfig } from '../notification-config.js';
import { NotificationRateLimiter } from '../notification-rate-limiter.js';
import { NotificationService } from '../notification-service.js';
import { AuthTemplate } from '../templates/auth-template.js';
import {
  PasswordRecoveryService,
  type ResetTokenIssuer,
} from '../password-recovery-service.js';
import { ConfigurationService } from '../../config/configuration-service.js';
import type {
  ChannelRequest,
  NotificationChannel,
} from '../notification-channel.js';
import type { NotificationRequest } from '../notification-service.js';

const SHIPPED = join(__dirname, '../../defaults/notifications.yml');

/** The shipped file with email switched on, edited the way an operator would. */
function shippedWithEmailOn(): string {
  const shipped = readFileSync(SHIPPED, 'utf8');
  const edited = shipped.replace(
    /(email:\n\s+enabled:\n\s+value: )false/,
    '$1true'
  );
  if (edited === shipped) {
    throw new Error(
      'the shipped file no longer has email.enabled.value: false'
    );
  }
  return edited;
}

const request = (channels: string[]): NotificationRequest =>
  ({
    email: 'jo@example.org',
    channels,
    template: 'greeting',
    data: { name: 'Jo' },
  }) as unknown as NotificationRequest;

function recordingEmailChannel(sink: ChannelRequest[]): NotificationChannel {
  return {
    getName: () => 'email',
    isEnabled: () => true,
    async send(sent: ChannelRequest) {
      sink.push(sent);
      return { success: true, messageId: 'recorded' };
    },
  } as unknown as NotificationChannel;
}

describe('NotificationConfig, reading what an instance really has', () => {
  let dir: string;
  const savedConsole = process.env.CIVIC_CONSOLE_NOTIFICATIONS;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'civic-notif-shipped-'));
    // The console sink is a dev convenience that would otherwise stand in for
    // the email channel and hide whether email was actually chosen.
    process.env.CIVIC_CONSOLE_NOTIFICATIONS = 'false';
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (savedConsole === undefined)
      delete process.env.CIVIC_CONSOLE_NOTIFICATIONS;
    else process.env.CIVIC_CONSOLE_NOTIFICATIONS = savedConsole;
    vi.restoreAllMocks();
  });

  const install = (yaml: string) =>
    writeFileSync(join(dir, 'notifications.yml'), yaml);

  describe('the shipped file, byte for byte — what `civic init` writes', () => {
    beforeEach(() => copyFileSync(SHIPPED, join(dir, 'notifications.yml')));

    it('is in the field shape (or this file is testing nothing)', () => {
      expect(readFileSync(SHIPPED, 'utf8')).toMatch(
        /email:\n\s+enabled:\n\s+value: false/
      );
    });

    it('reads email as OFF, because the file says it is off', () => {
      const config = new NotificationConfig(dir);

      expect(config.isChannelEnabled('email')).toBe(false);
      expect(config.isChannelEnabled('sms')).toBe(false);
      expect(config.isChannelEnabled('slack')).toBe(false);
    });

    it('reads the hourly limits as numbers', () => {
      expect(new NotificationConfig(dir).getRateLimits()).toEqual({
        email_per_hour: 100,
        sms_per_hour: 50,
        slack_per_hour: 200,
      });
    });

    it('reads every other scalar as the scalar it declares', () => {
      const config = new NotificationConfig(dir);
      const email = config.getChannelConfig('email') as {
        provider: unknown;
        smtp: {
          host: unknown;
          port: unknown;
          secure: unknown;
          auth: { user: unknown };
          tls: { rejectUnauthorized: unknown };
        };
      };

      expect(email.provider).toBe('smtp');
      expect(email.smtp.host).toBe('localhost');
      expect(email.smtp.port).toBe(587);
      expect(email.smtp.secure).toBe(false);
      expect(email.smtp.auth.user).toBe('');
      expect(email.smtp.tls.rejectUnauthorized).toBe(true);
      expect(config.getRetrySettings()).toEqual({ attempts: 3, delay: 5000 });
      expect(config.getSecuritySettings()).toEqual({
        encrypt_sensitive_data: true,
        audit_all_notifications: true,
        filter_pii: true,
      });
    });

    it('lets the limiter allow a send', async () => {
      const limiter = new NotificationRateLimiter(
        new NotificationConfig(dir).getRateLimits()
      );

      const result = await limiter.checkRateLimit(request(['email']));

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(100);
    });

    it('does not mint a reset token while email is off', async () => {
      // The documented invariant: a token is minted ONLY when a channel can
      // deliver it. With "off" reading as on, one was minted on every request
      // and then could not be delivered.
      const issuer = {
        findResetEligibleUser: vi.fn(async () => ({
          userId: 4,
          username: 'jo',
          email: 'jo@example.org',
        })),
        mintResetTokenForUser: vi.fn(async () => 'plaintext-token'),
      } satisfies ResetTokenIssuer;
      const operatorNotifier = { passwordResetRequested: vi.fn(async () => 1) };

      const service = new PasswordRecoveryService({
        issuer,
        operatorNotifier: operatorNotifier as never,
        notificationConfig: new NotificationConfig(dir),
      });
      const outcome = await service.requestReset('jo', {
        resetUrlBase: 'https://civic.example/auth/reset-password',
      });

      expect(outcome).toEqual({
        outcome: 'operator-task',
        channel: 'operator',
      });
      expect(issuer.mintResetTokenForUser).not.toHaveBeenCalled();
      expect(operatorNotifier.passwordResetRequested).toHaveBeenCalledTimes(1);
    });
  });

  describe('the shipped file, after an operator switches email on', () => {
    beforeEach(() => install(shippedWithEmailOn()));

    it('reads email as on', () => {
      expect(new NotificationConfig(dir).isChannelEnabled('email')).toBe(true);
    });

    it('sends — through the real service, gates and all', async () => {
      const sent: ChannelRequest[] = [];
      const config = new NotificationConfig(dir);
      const service = new NotificationService(config);
      vi.spyOn(
        (service as unknown as { audit: { logNotification(): Promise<void> } })
          .audit,
        'logNotification'
      ).mockResolvedValue(undefined);
      service.registerTemplate(
        'greeting',
        new AuthTemplate('greeting', 'Hello {{name}}')
      );
      service.registerChannel('email', recordingEmailChannel(sent));

      const result = await service.sendNotification(request(['email']));

      expect(result.success).toBe(true);
      expect(sent).toHaveLength(1);
    });

    it('enforces the configured limit, and not before it', async () => {
      // 100 an hour: the hundredth send goes out, the hundred-and-first does
      // not. Pins the path from the number in the file to the decision.
      const limiter = new NotificationRateLimiter(
        new NotificationConfig(dir).getRateLimits()
      );

      for (let i = 0; i < 100; i++) {
        expect((await limiter.checkRateLimit(request(['email']))).allowed).toBe(
          true
        );
      }
      expect((await limiter.checkRateLimit(request(['email']))).allowed).toBe(
        false
      );
    });

    it('delivers a password reset by email', async () => {
      const sent: ChannelRequest[] = [];
      const config = new NotificationConfig(dir);
      const notificationService = new NotificationService(config);
      vi.spyOn(
        (
          notificationService as unknown as {
            audit: { logNotification(): Promise<void> };
          }
        ).audit,
        'logNotification'
      ).mockResolvedValue(undefined);
      notificationService.registerChannel('email', recordingEmailChannel(sent));
      const issuer = {
        findResetEligibleUser: vi.fn(async () => ({
          userId: 4,
          username: 'jo',
          email: 'jo@example.org',
        })),
        mintResetTokenForUser: vi.fn(async () => 'plaintext-token'),
      } satisfies ResetTokenIssuer;
      const operatorNotifier = { passwordResetRequested: vi.fn(async () => 1) };

      const service = new PasswordRecoveryService({
        issuer,
        operatorNotifier: operatorNotifier as never,
        notificationConfig: config,
        notificationService,
      });
      const outcome = await service.requestReset('jo', {
        resetUrlBase: 'https://civic.example/auth/reset-password',
      });

      expect(outcome).toEqual({ outcome: 'delivered', channel: 'email' });
      expect(sent).toHaveLength(1);
      expect(operatorNotifier.passwordResetRequested).not.toHaveBeenCalled();
    });
  });

  describe('a file saved through the config editor', () => {
    it('is still readable after the editor rewrites it in the field shape', async () => {
      // An operator's hand-written plain file…
      const systemData = join(dir, '.system-data');
      mkdirSync(systemData, { recursive: true });
      writeFileSync(
        join(systemData, 'notifications.yml'),
        [
          'channels:',
          '  email:',
          '    enabled: false',
          "    provider: 'smtp'",
          'auth_templates: {}',
          'rules:',
          '  rate_limits:',
          '    email_per_hour: 7',
          '    sms_per_hour: 50',
          '    slack_per_hour: 200',
          '  retry_attempts: 3',
          '  retry_delay: 5000',
          '',
        ].join('\n')
      );
      expect(new NotificationConfig(systemData).getRateLimits()).toMatchObject({
        email_per_hour: 7,
      });

      // …saved, unchanged, through the service behind `PUT /config/notifications`.
      const editor = new ConfigurationService({
        dataPath: join(dir, 'data', '.civic'),
        systemDataPath: systemData,
      });
      await editor.saveConfiguration(
        'notifications',
        await editor.loadConfiguration('notifications')
      );

      // The editor wrote fields. If it ever stops, this test has nothing to say.
      expect(
        readFileSync(join(systemData, 'notifications.yml'), 'utf8')
      ).toMatch(/email_per_hour:\n\s+value: 7/);

      const config = new NotificationConfig(systemData);
      expect(config.isChannelEnabled('email')).toBe(false);
      expect(config.getRateLimits()).toMatchObject({ email_per_hour: 7 });
    });
  });
});
