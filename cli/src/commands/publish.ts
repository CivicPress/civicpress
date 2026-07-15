/**
 * `civic publish <draftId>` — wraps `publish-draft-saga`.
 *
 * Phase 2c Task 11 (cli-001 follow-up).
 *
 * Before this command shipped, `publish-draft-saga.ts` existed in core
 * (orchestrating: move draft → write file → commit → delete draft →
 * index → emit hook) but had no public CLI entry point. Operators had to
 * invoke the saga programmatically or use `civic status` workarounds.
 *
 * The saga's contract uses `draftId` (not `recordId`) — once the saga
 * succeeds, the draft is *gone* and the record lives in `records`. This
 * command matches that surface.
 */
import { CAC } from 'cac';
import { AuthUtils } from '../utils/auth-utils.js';
import {
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
import {
  cliSuccess,
  cliError,
  cliStartOperation,
} from '../utils/cli-output.js';

export const publishCommand = (cli: CAC) => {
  cli
    .command(
      'publish <draftId>',
      'Publish a draft record (runs the publish-draft saga: ' +
        'moves draft to records, writes file, commits to git, ' +
        'emits hook)'
    )
    .option('--token <token>', 'Session token for authentication')
    .option(
      '--target-status <status>',
      'Override target status (default: draft status, typically "published")'
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .action(async (draftId: string, options: any) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('publish');

      // Validate authentication and get civic instance
      const { civic, user } = await AuthUtils.requireAuthWithCivic(
        options.token,
        globalOptions.json
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const coreMod: any = await import('@civicpress/core');
      const audit = new coreMod.AuditLogger();

      try {
        const recordManager = civic.getRecordManager();
        const indexingService = civic.getIndexingService();

        // Run saga via RecordManager.publishDraft. The saga handles:
        //   1. Move draft → records table (ACID)
        //   2. Create/update file on disk
        //   3. Commit to git (authoritative)
        //   4. Delete from record_drafts (ACID)
        //   5. Queue indexing (derived, fire-and-forget)
        //   6. Emit record:published hook (derived, fire-and-forget)
        const record = await recordManager.publishDraft(
          draftId,
          user,
          options.targetStatus,
          undefined, // sagaExecutor — let RecordManager construct one
          indexingService
        );

        cliSuccess(
          {
            draftId,
            recordId: record.id,
            recordTitle: record.title,
            recordType: record.type,
            status: record.status,
            path: record.path,
          },
          `Published draft ${draftId} as record "${record.title}" (status: ${record.status})`,
          {
            operation: 'publish',
            draftId,
            recordId: record.id,
            status: record.status,
          }
        );

        await audit.log({
          source: 'cli',
          actor: { username: user.username, role: user.role },
          action: 'record_publish',
          target: { type: 'record', id: record.id, name: record.title },
          outcome: 'success',
          metadata: { draftId, status: record.status },
        });

        process.exit(0);
      } catch (error) {
        await audit.log({
          source: 'cli',
          actor: { username: user.username, role: user.role },
          action: 'record_publish',
          target: { type: 'draft', id: draftId },
          outcome: 'failure',
          message: error instanceof Error ? error.message : String(error),
        });
        cliError(
          'Failed to publish draft',
          'PUBLISH_FAILED',
          {
            error: error instanceof Error ? error.message : String(error),
            draftId,
          },
          'publish'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });
};
