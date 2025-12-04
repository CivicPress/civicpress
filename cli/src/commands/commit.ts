import { CAC } from 'cac';
import { AuthUtils } from '../utils/auth-utils.js';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
import { userCan } from '@civicpress/core';
import {
  getAvailableRecords,
  resolveRecordReference,
} from '../utils/record-locator.js';
import {
  cliSuccess,
  cliError,
  cliInfo,
  cliWarn,
  cliStartOperation,
} from '../utils/cli-output.js';

export const commitCommand = (cli: CAC) => {
  cli
    .command('commit [record]', 'Commit civic records with role-based messages')
    .option('--token <token>', 'Session token for authentication')
    .option('-m, --message <message>', 'Commit message')
    .option('-r, --role <role>', 'Role for commit (clerk, council, etc.)')
    .option('-a, --all', 'Commit all changes (not just specific files)')
    .action(async (recordName: string, options: any) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('commit');

      // Validate authentication and get civic instance
      const { civic, user } = await AuthUtils.requireAuthWithCivic(
        options.token,
        globalOptions.json
      );
      const coreMod: any = await import('@civicpress/core');
      const audit = new coreMod.AuditLogger();
      const dataDir = civic.getDataDir();

      // Check commit permissions
      const canCommit = await userCan(user, 'records:edit');
      if (!canCommit) {
        cliError(
          'Insufficient permissions to commit records',
          'PERMISSION_DENIED',
          {
            requiredPermission: 'records:edit',
            userRole: user.role,
          },
          'commit'
        );
        process.exit(1);
      }

      try {
        // Validate required options
        if (!options.message) {
          cliError(
            'Commit message is required. Use -m or --message',
            'VALIDATION_ERROR',
            undefined,
            'commit'
          );
          process.exit(1);
        }

        // Create GitEngine with the data directory
        const git = new (await import('@civicpress/core')).GitEngine(dataDir);

        // Set role if provided
        if (options.role) {
          git.setRole(options.role);
        }

        // Determine which files to commit
        let filesToCommit: string[] = [];

        if (options.all) {
          // Commit all changes
          const status = await git.status();
          filesToCommit = [
            ...status.modified,
            ...status.created,
            ...status.deleted,
            ...status.renamed,
          ];
        } else if (recordName) {
          const resolved = resolveRecordReference(dataDir, recordName);

          if (!resolved) {
            const availableRecords = getAvailableRecords(dataDir);

            cliError(
              `Record "${recordName}" not found`,
              'RECORD_NOT_FOUND',
              {
                recordName,
                availableRecords,
              },
              'commit'
            );
            process.exit(1);
          }

          // Check if the specific file has changes
          const status = await git.status();
          const allChangedFiles = [
            ...status.modified,
            ...status.created,
            ...status.deleted,
            ...status.renamed,
          ];

          const relativeRecordPath = resolved.relativePath.replace(/\\/g, '/');
          if (allChangedFiles.includes(relativeRecordPath)) {
            filesToCommit = [relativeRecordPath];
          } else {
            cliWarn(`No changes found for record "${recordName}"`, 'commit');
            process.exit(1);
          }
        }

        if (filesToCommit.length === 0) {
          cliWarn('No files to commit', 'commit');
          process.exit(1);
        }

        // Commit the files
        const commitHash = await git.commit(options.message, filesToCommit);

        cliSuccess(
          {
            commitHash,
            files: filesToCommit,
            message: options.message,
            role: options.role,
          },
          `Committed ${filesToCommit.length} file${filesToCommit.length === 1 ? '' : 's'}`,
          {
            operation: 'commit',
            fileCount: filesToCommit.length,
            role: options.role,
          }
        );
        await audit.log({
          source: 'cli',
          actor: { username: user.username, role: user.role },
          action: 'record_commit',
          target: { type: 'record', name: recordName || 'multiple' },
          outcome: 'success',
          metadata: { files: filesToCommit },
        });
      } catch (error) {
        await audit.log({
          source: 'cli',
          actor: { username: user.username, role: user.role },
          action: 'record_commit',
          target: { type: 'record', name: recordName || 'multiple' },
          outcome: 'failure',
          message: error instanceof Error ? error.message : String(error),
        });
        cliError(
          'Failed to commit records',
          'COMMIT_FAILED',
          {
            error: error instanceof Error ? error.message : String(error),
            recordName,
          },
          'commit'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });
};
