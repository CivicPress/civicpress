import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from '../fixtures/test-setup';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync, copyFileSync } from 'fs';
import { NotificationService } from '../../core/src/notifications/notification-service.js';
import { NotificationConfig } from '../../core/src/notifications/notification-config.js';
import { EmailChannel } from '../../modules/notifications/channels/email-channel.js';
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
      // Create email channel
      const emailConfig = config.getChannelConfig('email');
      const emailChannel = new EmailChannel({
        enabled: emailConfig.enabled,
        provider: emailConfig.provider,
        credentials: emailConfig.nodemailer, // Use nodemailer config for tests
        settings: {},
      });
      notificationService.registerChannel('email', emailChannel);

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

  describe('EmailChannel', () => {
    it('should create email channel with configuration', () => {
      const emailConfig = config.getChannelConfig('email');
      const channel = new EmailChannel({
        enabled: emailConfig.enabled,
        provider: emailConfig.provider,
        credentials: emailConfig.nodemailer, // Use nodemailer config for tests
        settings: {},
      });
      expect(channel.getName()).toBe('email');
      expect(channel.isEnabled()).toBe(true);
      expect(channel.getProvider()).toBe('nodemailer');
    });

    it('should create SendGrid email channel', () => {
      const emailConfig = config.getChannelConfig('email');
      const channel = new EmailChannel({
        enabled: emailConfig.enabled,
        provider: 'sendgrid',
        credentials: emailConfig.sendgrid, // Use sendgrid config
        settings: {},
      });
      expect(channel.getName()).toBe('email');
      expect(channel.isEnabled()).toBe(true);
      expect(channel.getProvider()).toBe('sendgrid');
    });

    it('should validate configuration', async () => {
      // Always use the valid fixture config
      const emailConfig = config.getChannelConfig('email');
      const channel = new EmailChannel({
        enabled: emailConfig.enabled,
        provider: emailConfig.provider,
        credentials: emailConfig.nodemailer, // Use nodemailer config for tests
        settings: {},
      });
      const isValid = await channel.validateConfig();
      expect(isValid).toBe(true);
    });

    it('should fail validation with invalid config (missing credentials/host)', async () => {
      // Missing credentials
      const invalidConfig = { enabled: true, settings: {} };
      const channel = new EmailChannel(invalidConfig as any);
      // Should not throw, should return false
      const isValid = await channel.validateConfig();
      expect(isValid).toBe(false);
    });

    it('should get capabilities', () => {
      const emailConfig = config.getChannelConfig('email');
      const channel = new EmailChannel({
        enabled: emailConfig.enabled,
        provider: emailConfig.provider,
        credentials: emailConfig.nodemailer, // Use nodemailer config for tests
        settings: {},
      });
      const capabilities = channel.getCapabilities();
      expect(capabilities.supportsHtml).toBe(true);
      expect(capabilities.supportsAttachments).toBe(true);
      expect(capabilities.supportsTemplates).toBe(true);
    });

    it('should handle SendGrid email sending (mocked)', async () => {
      const emailConfig = config.getChannelConfig('email');
      const channel = new EmailChannel({
        enabled: emailConfig.enabled,
        provider: 'sendgrid',
        credentials: {
          apiKey: 'SG.test-api-key',
          from: 'test@example.com',
        },
        settings: {},
      });

      const request = {
        to: 'recipient@example.com',
        content: {
          subject: 'Test Email',
          body: 'This is a test email',
          html: '<p>This is a test email</p>',
        },
        priority: 'normal' as const,
      };

      // For now, we'll test that the channel is properly configured
      // and can handle the request structure
      expect(channel.getProvider()).toBe('sendgrid');
      expect(channel.isEnabled()).toBe(true);

      // Test that the channel can validate its config
      const isValid = await channel.validateConfig();
      expect(isValid).toBe(true);
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
