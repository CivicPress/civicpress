import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../../database-service.js';
import { OperatorNotifier } from '../../../notifications/operator-notifier.js';
import {
  AtRestCodec,
  AT_REST_MARKER,
} from '../../../security/at-rest-codec.js';
import { REDACTED } from '../../../notifications/pii-redaction.js';
import { UNREADABLE_PLACEHOLDER } from '../operator-notification-store.js';

// `notifications.yml` → `security.filter_pii` and `encrypt_sensitive_data`,
// applied to the operator inbox. Both shipped `true` and were read by nothing
// until 2026-10-02.

type RawRow = {
  id: number;
  title: string;
  body: string | null;
  data: string | null;
};

describe('OperatorNotificationStore protection', () => {
  let dir: string;
  let db: DatabaseService;
  let notifier: OperatorNotifier;
  const codec = new AtRestCodec(randomBytes(32));

  const rawRows = () =>
    db
      .getAdapter()
      .query<RawRow>(
        'SELECT id, title, body, data FROM operator_notifications ORDER BY id'
      );

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'civic-opnotify-protect-'));
    db = new DatabaseService({
      type: 'sqlite',
      sqlite: { file: join(dir, 'test.db') },
    });
    await db.initialize();
    notifier = new OperatorNotifier(db);
  });
  afterEach(async () => {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes plain rows when nothing was configured — as it always did', async () => {
    await notifier.systemError({
      title: 'Backup failed',
      body: 'mail ops@town.example',
    });
    const [row] = await rawRows();
    expect(row.body).toBe('mail ops@town.example');
  });

  it('filter_pii: redacts body and data before they are stored, and leaves the title', async () => {
    await db.configureOperatorNotificationProtection({
      redactPii: true,
      encryptAtRest: false,
      codec,
    });
    await notifier.passwordResetRequested({
      userId: 7,
      username: 'j.tremblay',
      email: 'j@example.org',
    });
    const [row] = await rawRows();
    expect(row.title).toBe('Password reset requested: j.tremblay');
    expect(row.data).not.toContain('j@example.org');
    expect(JSON.parse(row.data as string)).toEqual({
      userId: 7,
      username: 'j.tremblay',
      email: REDACTED,
    });
    const { notifications } = await notifier.list();
    expect(notifications[0].data).toEqual({
      userId: 7,
      username: 'j.tremblay',
      email: REDACTED,
    });
  });

  it('encrypt_sensitive_data: seals body and data at rest, and reads them back', async () => {
    await db.configureOperatorNotificationProtection({
      redactPii: false,
      encryptAtRest: true,
      codec,
    });
    const id = (await notifier.systemError({
      title: 'Disk almost full',
      body: 'Volume /data at 97%',
      data: { volume: '/data', pct: 97 },
    })) as number;
    const [row] = await rawRows();
    expect(row.body?.startsWith(AT_REST_MARKER)).toBe(true);
    expect(row.data?.startsWith(AT_REST_MARKER)).toBe(true);
    expect(row.body).not.toContain('97%');
    expect(row.title).toBe('Disk almost full');

    const { notifications } = await notifier.list();
    expect(notifications[0].body).toBe('Volume /data at 97%');
    expect(notifications[0].data).toEqual({ volume: '/data', pct: 97 });
    expect((await notifier.get(id))?.body).toBe('Volume /data at 97%');
  });

  it('seals the rows written before encryption was switched on, once', async () => {
    await notifier.systemError({
      title: 'Old',
      body: 'plain body',
      data: { k: 1 },
    });
    await notifier.systemError({
      title: 'Older',
      body: null as unknown as undefined,
    });
    const before = await rawRows();
    expect(before[0].body).toBe('plain body');

    const sealed = await db.configureOperatorNotificationProtection({
      redactPii: false,
      encryptAtRest: true,
      codec,
    });
    expect(sealed).toBe(1); // the row with something to seal
    const after = await rawRows();
    expect(after[0].body?.startsWith(AT_REST_MARKER)).toBe(true);
    expect(after[0].data?.startsWith(AT_REST_MARKER)).toBe(true);
    expect(after[1].body).toBeNull();

    // Idempotent: nothing left to seal.
    expect(
      await db.configureOperatorNotificationProtection({
        redactPii: false,
        encryptAtRest: true,
        codec,
      })
    ).toBe(0);
    const { notifications } = await notifier.list();
    expect(notifications.find((n) => n.title === 'Old')?.body).toBe(
      'plain body'
    );
    expect(notifications.find((n) => n.title === 'Old')?.data).toEqual({
      k: 1,
    });
  });

  it('keeps reading sealed rows after encryption is switched off, as long as the secret is there', async () => {
    await db.configureOperatorNotificationProtection({
      redactPii: false,
      encryptAtRest: true,
      codec,
    });
    await notifier.systemError({ title: 'Sealed', body: 'secret body' });
    await db.configureOperatorNotificationProtection({
      redactPii: false,
      encryptAtRest: false,
      codec,
    });
    await notifier.systemError({ title: 'Plain again', body: 'plain body' });
    const rows = await rawRows();
    expect(rows[0].body?.startsWith(AT_REST_MARKER)).toBe(true);
    expect(rows[1].body).toBe('plain body');
    const { notifications } = await notifier.list();
    expect(notifications.find((n) => n.title === 'Sealed')?.body).toBe(
      'secret body'
    );
    expect(notifications.find((n) => n.title === 'Plain again')?.body).toBe(
      'plain body'
    );
  });

  it('refuses encryption without a key', async () => {
    await expect(
      db.configureOperatorNotificationProtection({
        redactPii: false,
        encryptAtRest: true,
      })
    ).rejects.toThrow(/needs a codec/);
  });

  it('redacts, then seals, when both are on', async () => {
    await db.configureOperatorNotificationProtection({
      redactPii: true,
      encryptAtRest: true,
      codec,
    });
    await notifier.securityAlert({
      title: 'Lockout',
      body: 'account j@example.org locked',
    });
    const [row] = await rawRows();
    expect(row.body?.startsWith(AT_REST_MARKER)).toBe(true);
    const { notifications } = await notifier.list();
    expect(notifications[0].body).toBe(`account ${REDACTED} locked`);
  });

  it('redacts data as an object, so a numeric value never breaks the JSON', async () => {
    await db.configureOperatorNotificationProtection({
      redactPii: true,
      encryptAtRest: false,
      codec,
    });
    await notifier.securityAlert({
      title: 'Lockout',
      data: { lockedUntil: 1759400000, attempts: 5, who: 'x@example.org' },
    });
    const { notifications } = await notifier.list();
    expect(notifications[0].data).toEqual({
      lockedUntil: 1759400000,
      attempts: 5,
      who: REDACTED,
    });
  });

  it('shows an entry sealed under another secret as unreadable, and keeps the inbox usable', async () => {
    await db.configureOperatorNotificationProtection({
      redactPii: false,
      encryptAtRest: true,
      codec: new AtRestCodec(randomBytes(32)),
    });
    const foreign = (await notifier.systemError({
      title: 'From another instance',
      body: 'secret',
      data: { k: 1 },
    })) as number;
    // The same database read under this instance's key.
    await db.configureOperatorNotificationProtection({
      redactPii: false,
      encryptAtRest: true,
      codec,
    });
    await notifier.systemError({ title: 'Ours', body: 'ours' });
    const { notifications, total } = await notifier.list();
    expect(total).toBe(2);
    const stranger = notifications.find(
      (n) => n.title === 'From another instance'
    );
    expect(stranger?.body).toBe(UNREADABLE_PLACEHOLDER);
    expect(stranger?.data).toBeUndefined();
    expect(notifications.find((n) => n.title === 'Ours')?.body).toBe('ours');
    expect((await notifier.get(foreign))?.body).toBe(UNREADABLE_PLACEHOLDER);
    expect(await notifier.dismiss(foreign)).toBe(true);
  });
});
