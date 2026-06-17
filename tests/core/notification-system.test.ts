import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from '../fixtures/test-setup';
import { vi } from 'vitest';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync, copyFileSync } from 'fs';

// Inject a fake nodemailer transport factory into the canonical EmailChannel
// so it does not attempt a real SMTP connection against the fixture host
// (`smtp.test.com`). EmailChannel takes `createTransport` as a dependency;
// a module-level `vi.mock('nodemailer')` was fragile here (cross-workspace
// resolution mismatch). See known-test-issues W5/D1.
const sendMail = vi
  .fn()
  .mockResolvedValue({ messageId: 'mock-mid-notification-system-test' });
const fakeCreateTransport = vi.fn(
  () =>
    ({ sendMail }) as unknown as ReturnType<
      typeof import('nodemailer').createTransport
    >
);

import { NotificationService } from '../../core/src/notifications/notification-service.js';
import { NotificationConfig } from '../../core/src/notifications/notification-config.js';
// Canonical EmailChannel + EmailChannelOptions. The module-side EmailChannel
// (modules/notifications/channels/email-channel.ts) was deleted as part of
// Phase 2c Task 6 — its tested surface lives here now.
import {
  EmailChannel,
  type EmailChannelOptions,
} from '../../core/src/notifications/channels/email-channel.js';
import { AuthTemplate } from '../../core/src/notifications/templates/auth-template.js';

// ---
// This test uses the global test setup and a notification config fixture.
// The config is copied from tests/fixtures/notifications.yml to .system-data-test/notifications.yml before each test.
// ---

const TEST_DATA_DIR = '.system-data-test';
const NOTIF_FIXTURE = join(__dirname, '../fixtures/notifications.yml');
const NOTIF_CONFIG_PATH = join(TEST_DATA_DIR, 'notifications.yml');

function setupNotificationTestDir() {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  copyFileSync(NOTIF_FIXTURE, NOTIF_CONFIG_PATH);
}

function cleanupNotificationTestDir() {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

describe('Notification System', () => {
  let notificationService: NotificationService;
  let config: NotificationConfig;

  beforeEach(() => {
    setupNotificationTestDir();
    config = new NotificationConfig(TEST_DATA_DIR);
    notificationService = new NotificationService(config);
  });

  afterEach(() => {
    cleanupNotificationTestDir();
  });

  describe('NotificationService', () => {
    it('should initialize with configuration', () => {
      expect(notificationService).toBeDefined();
    });

    it('should register and use email channel', async () => {
      // Build a canonical EmailChannel from the fixture's SMTP config and
      // wrap it in a NotificationChannel-shaped adapter so the
      // notification-service dispatcher can drive it.
      const emailConfig = config.getChannelConfig('email');
      const smtp = (emailConfig as any).nodemailer;
      const canonical = new EmailChannel(
        {
          smtp: {
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            auth: smtp.auth,
          },
          defaultFrom: smtp.from,
        },
        fakeCreateTransport
      );
      const emailChannel = {
        getName: () => 'email',
        isEnabled: () => true,
        async send(request: any) {
          const { messageId } = await canonical.send({
            to: request.to,
            subject: request.content?.subject || 'CivicPress Notification',
            text: request.content?.text || request.content?.body,
            html: request.content?.html,
          });
          return { success: true, messageId };
        },
      };
      notificationService.registerChannel('email', emailChannel as any);

      // Create template
      const template = new AuthTemplate(
        'email_verification',
        'Please verify your account: {{verification_url}}'
      );
      notificationService.registerTemplate('email_verification', template);

      // Send test notification
      const result = await notificationService.sendNotification({
        email: 'test@example.com',
        channels: ['email'],
        template: 'email_verification',
        data: {
          verification_url: 'https://example.com/verify?token=123',
        },
      });

      expect(result.success).toBe(true);
      expect(result.sentChannels).toContain('email');
      expect(result.notificationId).toBeDefined();
      // the injected fake transport was invoked by the canonical channel
      expect(sendMail).toHaveBeenCalled();
    });

    it('should handle missing template gracefully', async () => {
      await expect(
        notificationService.sendNotification({
          email: 'test@example.com',
          channels: ['email'],
          template: 'nonexistent_template',
          data: {},
        })
      ).rejects.toThrow('Template not found: nonexistent_template');
    });

    it('should handle missing channel gracefully', async () => {
      const template = new AuthTemplate('test_template', 'Test message');
      notificationService.registerTemplate('test_template', template);

      const result = await notificationService.sendNotification({
        email: 'test@example.com',
        channels: ['nonexistent_channel'],
        template: 'test_template',
        data: {},
      });

      expect(result.success).toBe(false);
      expect(result.failedChannels).toContain('nonexistent_channel');
    });
  });

  describe('NotificationConfig', () => {
    it('should load default configuration', () => {
      expect(config.getConfig()).toBeDefined();
      expect(config.getConfig().channels.email).toBeDefined();
      expect(
        config.getConfig().auth_templates.email_verification
      ).toBeDefined();
    });

    it('should check channel enabled status', () => {
      expect(config.isChannelEnabled('email')).toBe(true);
      expect(config.isChannelEnabled('nonexistent')).toBe(false);
    });

    it('should get rate limits', () => {
      const rateLimits = config.getRateLimits();
      expect(rateLimits.email_per_hour).toBe(100);
      expect(rateLimits.sms_per_hour).toBe(50);
      expect(rateLimits.slack_per_hour).toBe(200);
    });
  });

  // Note: detailed EmailChannel tests against the canonical surface
  // (SMTP path, SendGrid path, defaultFrom, recipient-array join, missing
  // transport, both-transports-set, tls passthrough) live in
  // `tests/core/notifications/email-channel.test.ts`. The legacy module
  // tests for `getProvider()`, `validateConfig()`, `getCapabilities()` were
  // testing surface that the canonical EmailChannel intentionally does not
  // expose — that surface was orphaned (no production caller used it). See
  // Phase 2c Task 6 commit message.
  describe('EmailChannel (canonical, smoke)', () => {
    it('constructs from fixture SMTP config without throwing', () => {
      const emailConfig = config.getChannelConfig('email');
      const smtp = (emailConfig as any).nodemailer;
      const options: EmailChannelOptions = {
        smtp: {
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          auth: smtp.auth,
        },
        defaultFrom: smtp.from,
      };
      const channel = new EmailChannel(options);
      expect(channel).toBeInstanceOf(EmailChannel);
    });

    it('constructs from fixture SendGrid config without throwing', () => {
      const emailConfig = config.getChannelConfig('email');
      const sendgrid = (emailConfig as any).sendgrid;
      const channel = new EmailChannel({
        sendgrid: { apiKey: sendgrid.apiKey || 'SG.placeholder' },
        defaultFrom: sendgrid.from,
      });
      expect(channel).toBeInstanceOf(EmailChannel);
    });
  });

  describe('AuthTemplate', () => {
    it('should process template with variables', async () => {
      const template = new AuthTemplate(
        'test_template',
        'Hello {{name}}, please verify: {{verification_url}}'
      );
      const result = await template.process({
        name: 'John',
        verification_url: 'https://example.com/verify',
      });
      expect(result.body).toBe(
        'Hello John, please verify: https://example.com/verify'
      );
      expect(result.html).toContain(
        'Hello John, please verify: https://example.com/verify'
      );
    });

    it('should handle missing required variables', async () => {
      const template = new AuthTemplate(
        'test_template',
        'Hello {{name}}, please verify: {{verification_url}}'
      );
      await expect(
        template.process({
          name: 'John',
          // Missing verification_url
        })
      ).rejects.toThrow('Missing required template variable: verification_url');
    });

    it('should handle optional variables', async () => {
      const template = new AuthTemplate(
        'test_template',
        'Hello {{name}}{{optional_title}}, please verify: {{verification_url}}'
      );
      const result = await template.process({
        name: 'John',
        verification_url: 'https://example.com/verify',
        // optional_title is not provided
      });
      expect(result.body).toBe(
        'Hello John, please verify: https://example.com/verify'
      );
    });
  });
});
