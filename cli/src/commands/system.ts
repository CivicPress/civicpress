/* eslint-disable @typescript-eslint/no-explicit-any -- CLI command handlers pass CAC's untyped options through withCli. */
import { CAC } from 'cac';
import { createRequire } from 'module';
import {
  CentralConfigManager,
  DatabaseService,
  OperatorNotifier,
  UpdateChecker,
  fetchLatestReleaseTag,
} from '@civicpress/core';
import { withCli } from '../utils/with-cli.js';
import { cliSuccess, cliError } from '../utils/cli-output.js';

const require = createRequire(import.meta.url);
const { version: civicpressVersion } = require('../../../package.json');

/**
 * Register system maintenance commands.
 *
 * `system:check-updates` is a LOCAL operation (like `civic backup`): it needs
 * no session token, so it is cron-friendly. It checks the newest GitHub release
 * against the running version and, if newer, records an `update_available`
 * entry (deduped) in the operator notification center. `--latest` skips the
 * network for offline/testing.
 */
export function registerSystemCommand(cli: CAC): void {
  cli
    .command(
      'system:check-updates',
      'Check for a newer CivicPress release; records it in the operator notification center'
    )
    .option(
      '--latest <version>',
      'Compare against this version instead of fetching (offline/testing)'
    )
    .option('--repo <owner/name>', 'GitHub repo to read releases from', {
      default: process.env.CIVIC_UPDATE_REPO || 'CivicPress/civicpress',
    })
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(
      withCli<[any]>(
        {
          operation: 'system:check-updates',
          errorMessage: 'Failed to check for updates',
          errorCode: 'CHECK_UPDATES_FAILED',
          details: (error) => ({
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        },
        async (_ctx, options) => {
          const dbConfig = CentralConfigManager.getDatabaseConfig();
          if (!dbConfig) {
            cliError(
              'No database configured',
              'NO_DATABASE',
              undefined,
              'system:check-updates'
            );
            process.exit(1);
          }

          const db = new DatabaseService(dbConfig);
          await db.initialize();
          try {
            const notifier = new OperatorNotifier(db);
            const fetchLatest = options.latest
              ? async () => String(options.latest)
              : () => fetchLatestReleaseTag(String(options.repo));

            const result = await new UpdateChecker(notifier, fetchLatest).check(
              civicpressVersion
            );

            const message =
              result.latestVersion === null
                ? 'Could not determine the latest version (offline or no releases)'
                : result.updateAvailable
                  ? `Update available: ${result.latestVersion} (you are on ${result.currentVersion}) — recorded in the operator notification center`
                  : `Up to date (${result.currentVersion})`;

            cliSuccess(result, message, {
              operation: 'system:check-updates',
              updateAvailable: result.updateAvailable,
            });
          } finally {
            await db.close();
          }
        }
      )
    );
}

export default registerSystemCommand;
