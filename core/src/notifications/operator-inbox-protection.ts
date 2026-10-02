// Apply `notifications.yml`'s `security` keys to an operator inbox — any
// DatabaseService, not only the one CivicPress wires. `civic backup` records
// a failed backup and `civic system:check-updates` records an available
// update through a bare DatabaseService, on purpose (they must work when the
// rest of the instance does not); without this they would write plain rows
// into an inbox the booted instance keeps sealed and redacted.
import type { DatabaseService } from '../database/database-service.js';
import { NotificationConfig } from './notification-config.js';
import { SecretsManager } from '../security/secrets.js';
import { AtRestCodec } from '../security/at-rest-codec.js';
import { coreError, coreWarn } from '../utils/core-output.js';

export interface ProtectOperatorInboxOptions {
  /** The configuration to read; defaults to the instance's `notifications.yml`. */
  notificationConfig?: NotificationConfig;
  /** An initialized secrets manager; when absent, one is initialized from `dataDir` / `systemDataDir`. */
  secretsManager?: SecretsManager;
  dataDir?: string;
  systemDataDir?: string;
}

export interface OperatorInboxProtectionOutcome {
  redactPii: boolean;
  encryptAtRest: boolean;
  /** Rows written before encryption was on, sealed by this call. */
  sealed: number;
}

/**
 * Configure the inbox the way the file asks, and seal rows written before
 * encryption was on. Never throws: a store that cannot be configured keeps
 * writing plain rows and the reason is logged, because neither a backup nor
 * a boot should fail over the inbox.
 */
export async function protectOperatorInbox(
  db: DatabaseService,
  options: ProtectOperatorInboxOptions = {}
): Promise<OperatorInboxProtectionOutcome> {
  const outcome: OperatorInboxProtectionOutcome = {
    redactPii: false,
    encryptAtRest: false,
    sealed: 0,
  };
  try {
    const settings = (
      options.notificationConfig ??
      new NotificationConfig(options.systemDataDir)
    ).getSecuritySettings();
    outcome.redactPii = settings.filter_pii === true;
    const wantsEncryption = settings.encrypt_sensitive_data === true;

    const codec = await inboxCodec(options);
    if (wantsEncryption && !codec) {
      coreWarn(
        'encrypt_sensitive_data is on but no instance secret is available; operator notifications are stored redacted but not sealed',
        { operation: 'operator-notifications:protect' }
      );
    }
    outcome.encryptAtRest = wantsEncryption && !!codec;
    outcome.sealed = await db.configureOperatorNotificationProtection({
      redactPii: outcome.redactPii,
      encryptAtRest: outcome.encryptAtRest,
      codec,
    });
  } catch (error) {
    coreError(
      'Failed to apply the notification security settings to the operator inbox',
      'OPERATOR_INBOX_PROTECTION_FAILED',
      { error: error instanceof Error ? error.message : String(error) },
      { operation: 'operator-notifications:protect' }
    );
  }
  return outcome;
}

/** The at-rest codec, when an instance secret can be had; otherwise undefined. */
async function inboxCodec(
  options: ProtectOperatorInboxOptions
): Promise<AtRestCodec | undefined> {
  let secrets = options.secretsManager;
  if (!secrets) {
    if (!options.dataDir) return undefined;
    secrets = SecretsManager.getInstance(
      options.dataDir,
      options.systemDataDir
    );
  }
  try {
    await secrets.initialize();
    return new AtRestCodec(
      secrets.deriveKey('operator_notifications', 'at-rest')
    );
  } catch {
    return undefined;
  }
}
