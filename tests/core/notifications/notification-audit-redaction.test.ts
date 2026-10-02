import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { NotificationAudit } from '../../../core/src/notifications/notification-audit.js';
import { REDACTED } from '../../../core/src/notifications/pii-redaction.js';

// `security.filter_pii` on the notification audit log. A delivery error
// quotes the recipient; the log is where it must not stay.

describe('NotificationAudit redaction', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'civic-notif-audit-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const lastEntry = () => {
    const file = join(dir, 'notification-audit.jsonl');
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    return JSON.parse(lines[lines.length - 1]);
  };

  it('redacts personal data from the entry it writes when asked to', async () => {
    const audit = new NotificationAudit(dir, { redactPii: true });
    await audit.logNotification({
      id: 'n1',
      action: 'notification_partial_or_failed',
      details: {
        template: 'password_reset',
        errors: ['email: Error: 550 <lea@town.example> User unknown'],
        recipient: 'lea@town.example',
      },
      metadata: { phone: '5145551234' },
    });
    const entry = lastEntry();
    expect(entry.details.errors[0]).toBe(
      `email: Error: 550 <${REDACTED}> User unknown`
    );
    expect(entry.details.recipient).toBe(REDACTED);
    expect(entry.metadata.phone).toBe(REDACTED);
    expect(entry.details.template).toBe('password_reset');
  });

  it('writes the entry as given when redaction is off', async () => {
    const audit = new NotificationAudit(dir, { redactPii: false });
    await audit.logNotification({
      id: 'n2',
      action: 'notification_sent',
      details: { recipient: 'lea@town.example' },
    });
    expect(lastEntry().details.recipient).toBe('lea@town.example');
  });
});
