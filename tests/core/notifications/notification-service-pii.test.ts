/**
 * Phase 2b Task 7 — notifications-003 unit pinning.
 *
 * Pins the PII-correctness behavior that Phase 2a Task 8 introduced in
 * `core/src/notifications/notification-service.ts:159-166`. Before the
 * fix, `security.sanitizeContent(request.data)` ran on the template
 * variable bag BEFORE rendering — which meant a user's email used as
 * the template variable for the message body became literal "[REDACTED]"
 * in the email they received ("Hello [REDACTED], please verify..."). The
 * fix removed that pre-render sanitization; PII protection belongs at
 * the audit-log persistence path (the audit log currently does not
 * record user PII fields at all today).
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from '../../fixtures/test-setup';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync, copyFileSync } from 'fs';
import { NotificationService } from '../../../core/src/notifications/notification-service.js';
import { NotificationConfig } from '../../../core/src/notifications/notification-config.js';
import { AuthTemplate } from '../../../core/src/notifications/templates/auth-template.js';
import { NotificationSecurity } from '../../../core/src/notifications/notification-security.js';

const TEST_DATA_DIR = '.system-data-test-notif-pii';
const NOTIF_FIXTURE = join(__dirname, '../../fixtures/notifications.yml');
const NOTIF_CONFIG_PATH = join(TEST_DATA_DIR, 'notifications.yml');

describe('NotificationService — PII sanitization path (notifications-003)', () => {
  let service: NotificationService;
  let config: NotificationConfig;
  let auditSpy: ReturnType<typeof vi.spyOn>;
  let capturedSendArgs: any[];

  beforeEach(() => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });
    copyFileSync(NOTIF_FIXTURE, NOTIF_CONFIG_PATH);

    config = new NotificationConfig(TEST_DATA_DIR);
    service = new NotificationService(config);

    auditSpy = vi
      .spyOn((service as any).audit, 'logNotification')
      .mockResolvedValue(undefined);

    capturedSendArgs = [];
    service.registerChannel(
      'email',
      {
        send: vi.fn(async (args: any) => {
          capturedSendArgs.push(args);
        }),
      } as any
    );
    service.registerTemplate(
      'welcome',
      new AuthTemplate('welcome', 'Hello {{user_email}}, welcome to CivicPress')
    );
  });

  afterEach(() => {
    auditSpy.mockRestore();
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  it('renders email-as-template-variable as the actual email in the message body', async () => {
    await service.sendNotification({
      email: 'recipient@example.com',
      channels: ['email'],
      template: 'welcome',
      data: { user_email: 'subject@example.com' },
    });

    expect(capturedSendArgs.length).toBe(1);
    const sent = capturedSendArgs[0];

    // The rendered body must contain the ACTUAL email, not the redacted
    // form. This is the literal symptom Phase 2a Task 8 fixed.
    const bodyText = JSON.stringify(sent.content);
    expect(bodyText).toContain('subject@example.com');
    expect(bodyText).not.toContain('[REDACTED]');
  });

  it('passes the template variable through unmodified to the channel data', async () => {
    await service.sendNotification({
      email: 'recipient@example.com',
      channels: ['email'],
      template: 'welcome',
      data: { user_email: 'subject@example.com', name: 'Alice' },
    });

    const sent = capturedSendArgs[0];
    expect(sent.data.user_email).toBe('subject@example.com');
    expect(sent.data.name).toBe('Alice');
  });

  it('regression pin: pre-render sanitizer is NOT in the render path', async () => {
    // Spy on the security sanitize method. After the Phase 2a fix, the
    // service no longer calls security.sanitizeContent() before rendering.
    // If anyone wires it back in, this test fails.
    const sanitizeSpy = vi.spyOn(
      (service as any).security as NotificationSecurity,
      'sanitizeContent'
    );

    await service.sendNotification({
      email: 'recipient@example.com',
      channels: ['email'],
      template: 'welcome',
      data: { user_email: 'subject@example.com' },
    });

    expect(sanitizeSpy).not.toHaveBeenCalled();
  });

  it('PII patterns still work as a method (sanitizer available for audit-log path use)', async () => {
    // The sanitizer is still useful — just not on the render path. It
    // should still be reachable as an instance method on the security
    // object, ready to be wired into the audit-log persistence path
    // when notifications-007 / future work needs it.
    const security = new NotificationSecurity();
    const sanitized = security.sanitizeContent({
      body: 'Email me at user@example.com',
      ssn: '123-45-6789 noted',
    });
    expect(sanitized.body).toContain('[REDACTED]');
    expect(sanitized.body).not.toContain('user@example.com');
    expect(sanitized.ssn).toContain('[REDACTED]');
    expect(sanitized.ssn).not.toContain('123-45-6789');
  });

  it('email regex character-class bug stays fixed (notifications-003 bonus)', async () => {
    // Phase 2a Task 8 also fixed notification-security.ts:15 — the email
    // PII pattern was `[A-Z|a-z]` (literal pipe in a character class) and
    // is now `[A-Za-z]`. Verify the regex matches a normal email.
    const security = new NotificationSecurity();
    const sanitized = security.sanitizeContent({
      mixedCase: 'Reach me at Foo@Bar.COM today',
    });
    // The address should be redacted — i.e. NOT survive in the output.
    expect(sanitized.mixedCase).not.toContain('Foo@Bar.COM');
    expect(sanitized.mixedCase).toContain('[REDACTED]');
  });
});
