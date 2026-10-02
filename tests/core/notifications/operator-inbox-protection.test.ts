import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DatabaseService } from '../../../core/src/database/database-service.js';
import { OperatorNotifier } from '../../../core/src/notifications/operator-notifier.js';
import { protectOperatorInbox } from '../../../core/src/notifications/operator-inbox-protection.js';
import { SecretsManager } from '../../../core/src/security/secrets.js';
import { AT_REST_MARKER } from '../../../core/src/security/at-rest-codec.js';
import { REDACTED } from '../../../core/src/notifications/pii-redaction.js';

// `civic backup` and `civic system:check-updates` write to the inbox through
// a bare DatabaseService; this is what makes them honour the file.

type RawRow = { body: string | null; data: string | null };

describe('protectOperatorInbox on a bare DatabaseService', () => {
  let root: string;
  let db: DatabaseService;
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'civic-inbox-protect-'));
    mkdirSync(join(root, 'data'), { recursive: true });
    mkdirSync(join(root, '.system-data'), { recursive: true });
    SecretsManager.resetInstance();
    db = new DatabaseService({
      type: 'sqlite',
      sqlite: { file: join(root, 'test.db') },
    });
    await db.initialize();
  });
  afterEach(async () => {
    await db.close();
    SecretsManager.resetInstance();
    rmSync(root, { recursive: true, force: true });
  });

  const file = (security: Record<string, boolean>) =>
    writeFileSync(
      join(root, '.system-data', 'notifications.yml'),
      [
        'channels:',
        '  email:',
        '    enabled: false',
        'security:',
        ...Object.entries(security).map(([k, v]) => `  ${k}: ${v}`),
        '',
      ].join('\n')
    );
  const rawRow = async () =>
    (
      await db
        .getAdapter()
        .query<RawRow>(
          'SELECT body, data FROM operator_notifications ORDER BY id DESC LIMIT 1'
        )
    )[0];

  it('applies the file: redacted and sealed under the instance secret', async () => {
    file({
      filter_pii: true,
      encrypt_sensitive_data: true,
      audit_all_notifications: true,
    });
    const outcome = await protectOperatorInbox(db, {
      dataDir: join(root, 'data'),
      systemDataDir: join(root, '.system-data'),
    });
    expect(outcome).toMatchObject({ redactPii: true, encryptAtRest: true });
    await new OperatorNotifier(db).systemError({
      title: 'Backup failed',
      body: 'mail ops@town.example',
    });
    expect((await rawRow()).body?.startsWith(AT_REST_MARKER)).toBe(true);
    const { notifications } = await new OperatorNotifier(db).list();
    expect(notifications[0].body).toBe(`mail ${REDACTED}`);
  });

  it('redacts without sealing when no secret can be had, and says so instead of throwing', async () => {
    file({
      filter_pii: true,
      encrypt_sensitive_data: true,
      audit_all_notifications: true,
    });
    const outcome = await protectOperatorInbox(db, {
      systemDataDir: join(root, '.system-data'),
      // no dataDir → no secrets manager
    });
    expect(outcome).toMatchObject({ redactPii: true, encryptAtRest: false });
    await new OperatorNotifier(db).systemError({
      title: 'x',
      body: 'mail ops@town.example',
    });
    expect((await rawRow()).body).toBe(`mail ${REDACTED}`);
  });

  it('leaves the inbox plain when the file says so', async () => {
    file({
      filter_pii: false,
      encrypt_sensitive_data: false,
      audit_all_notifications: false,
    });
    await protectOperatorInbox(db, {
      dataDir: join(root, 'data'),
      systemDataDir: join(root, '.system-data'),
    });
    await new OperatorNotifier(db).systemError({
      title: 'x',
      body: 'mail ops@town.example',
    });
    expect((await rawRow()).body).toBe('mail ops@town.example');
  });
});
