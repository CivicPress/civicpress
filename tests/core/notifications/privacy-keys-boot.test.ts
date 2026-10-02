import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { CivicPress } from '../../../core/src/civic-core.js';
import { AT_REST_MARKER } from '../../../core/src/security/at-rest-codec.js';
import { REDACTED } from '../../../core/src/notifications/pii-redaction.js';
import {
  createTestDirectory,
  cleanupTestDirectory,
} from '../../fixtures/test-setup';

// The three `security` keys, end to end: a booted instance applies them to
// its operator inbox through `completeServiceInitialization`.

type RawRow = { body: string | null; data: string | null };

describe('notifications.yml security keys on a booted instance', () => {
  let civicPress: CivicPress | undefined;
  let testConfig: ReturnType<typeof createTestDirectory>;

  afterEach(async () => {
    await civicPress?.shutdown();
    civicPress = undefined;
    cleanupTestDirectory(testConfig);
  });

  async function boot(security: Record<string, boolean>) {
    testConfig = createTestDirectory('privacy-keys');
    const systemData = join(testConfig.testDir, '.system-data');
    mkdirSync(systemData, { recursive: true });
    writeFileSync(
      join(systemData, 'notifications.yml'),
      [
        'channels:',
        '  email:',
        '    enabled: false',
        '    provider: smtp',
        'security:',
        ...Object.entries(security).map(([k, v]) => `  ${k}: ${v}`),
        '',
      ].join('\n')
    );
    civicPress = new CivicPress({
      dataDir: testConfig.dataDir,
      database: {
        type: 'sqlite',
        sqlite: { file: join(testConfig.testDir, 'test.db') },
      },
    });
    await civicPress.initialize();
    return civicPress;
  }

  const rawRow = async (cp: CivicPress) =>
    (
      await cp
        .getDatabaseService()
        .getAdapter()
        .query<RawRow>(
          'SELECT body, data FROM operator_notifications ORDER BY id DESC LIMIT 1'
        )
    )[0];

  it('seals and redacts what the inbox stores when the keys are on', async () => {
    const cp = await boot({
      encrypt_sensitive_data: true,
      filter_pii: true,
      audit_all_notifications: true,
    });
    await cp.getOperatorNotifier().passwordResetRequested({
      userId: 3,
      username: 'sam',
      email: 'sam@town.example',
    });
    const row = await rawRow(cp);
    expect(row.data?.startsWith(AT_REST_MARKER)).toBe(true);
    const { notifications } = await cp.getOperatorNotifier().list();
    expect(notifications[0].data).toEqual({
      userId: 3,
      username: 'sam',
      email: REDACTED,
    });
  });

  it('stores plain rows when the keys are off', async () => {
    const cp = await boot({
      encrypt_sensitive_data: false,
      filter_pii: false,
      audit_all_notifications: false,
    });
    await cp
      .getOperatorNotifier()
      .systemError({ title: 'x', body: 'mail sam@town.example' });
    expect((await rawRow(cp)).body).toBe('mail sam@town.example');
  });
});
