import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress, WorkflowConfigManager } from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import matter = require('gray-matter');
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
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

export function statusCommand(cli: CAC) {
  cli
    .command('status <record> <status>', 'Change the status of a civic record')
    .option(
      '-m, --message <message>',
      'Optional message about the status change'
    )
    .option(
      '-r, --role <role>',
      'Role for the status change (clerk, council, etc.)'
    )
    .option('--token <token>', 'Session token for authentication')
    .option('--dry-run', 'Complete dry-run (no files modified, no commits)')
    .option(
      '--dry-run-hooks <hooks>',
      'Dry-run specific hooks (comma-separated)'
    )
    .action(async (recordName: string, newStatus: string, options: any) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('status');

      const coreMod: any = await import('@civicpress/core');
      const audit = new coreMod.AuditLogger();
      try {
        // Validate status
        const validStatuses = [
          'draft',
          'proposed',
          'approved',
          'active',
          'archived',
          'rejected',
        ];
        if (!validStatuses.includes(newStatus)) {
          cliError(
            `Invalid status: ${newStatus}`,
            'INVALID_STATUS',
            {
              requestedStatus: newStatus,
              validStatuses,
            },
            'status'
          );
          process.exit(1);
        }

        // Initialize CivicPress (will auto-discover config)
        // Get data directory from config discovery
        const { loadConfig } = await import('@civicpress/core');
        const config = await loadConfig();
        if (!config) {
          throw new Error(
            'CivicPress not initialized. Run "civic init" first.'
          );
        }
        const dataDir = config.dataDir;
        if (!dataDir) {
          throw new Error('dataDir is not configured');
        }
        const civic = new CivicPress({ dataDir });

        const recordsDir = path.join(dataDir, 'records');
        if (!fs.existsSync(recordsDir)) {
          cliError(
            'No records directory found',
            'RECORDS_DIR_NOT_FOUND',
            { dataDir },
            'status'
          );
          process.exit(1);
        }

        const resolvedRecord = resolveRecordReference(dataDir, recordName);

        if (!resolvedRecord) {
          const availableRecords = getAvailableRecords(dataDir);

          cliError(
            `Record "${recordName}" not found`,
            'RECORD_NOT_FOUND',
            {
              recordName,
              availableRecords,
            },
            'status'
          );
          process.exit(1);
        }

        const recordPath = resolvedRecord.absolutePath;
        const recordType = resolvedRecord.parsed.type;

        // Read current record
        const content = fs.readFileSync(recordPath, 'utf8');
        const { data: frontmatter, content: markdownContent } = matter(content);

        // Get current status
        const currentStatus = frontmatter.status || 'draft';

        if (currentStatus === newStatus) {
          cliWarn(`Record "${recordName}" is already ${newStatus}`, 'status');
          process.exit(1);
        }

        // Validate workflow transition
        const workflowManager = new WorkflowConfigManager(dataDir);
        const transitionValidation = await workflowManager.validateTransition(
          currentStatus,
          newStatus,
          options.role
        );

        if (!transitionValidation.valid) {
          const availableTransitions =
            await workflowManager.getAvailableTransitions(
              currentStatus,
              options.role
            );

          cliError(
            `Invalid workflow transition: ${transitionValidation.reason}`,
            'INVALID_TRANSITION',
            {
              currentStatus,
              requestedStatus: newStatus,
              role: options.role || 'none',
              availableTransitions,
            },
            'status'
          );
          process.exit(1);
        }

        // Update frontmatter
        const updatedFrontmatter: any = {
          ...frontmatter,
          status: newStatus,
          updated: new Date().toISOString(),
          status_changed: new Date().toISOString(),
          status_changed_by: options.role || 'unknown',
          previous_status: currentStatus,
        };

        // Add status change message if provided
        if (options.message) {
          updatedFrontmatter.status_message = options.message;
        }

        // Create status color mapping
        const statusColors: Record<string, any> = {
          draft: chalk.yellow,
          proposed: chalk.blue,
          approved: chalk.green,
          active: chalk.green,
          archived: chalk.gray,
          rejected: chalk.red,
        };

        const statusColor = statusColors[newStatus] || chalk.white;
        const currentStatusColor = statusColors[currentStatus] || chalk.white;

        // Handle dry-run modes
        const isCompleteDryRun = options.dryRun;
        const dryRunHooks = options.dryRunHooks
          ? options.dryRunHooks.split(',').map((h: string) => h.trim())
          : [];

        // Write updated record
        const updatedContent = matter.stringify(
          markdownContent,
          updatedFrontmatter
        );

        let commitHash: string | undefined;

        if (isCompleteDryRun) {
          cliWarn(
            `Would update record and change status: ${currentStatus} → ${newStatus}`,
            'status'
          );
        } else {
          fs.writeFileSync(recordPath, updatedContent);

          // Commit the change
          const git = new (await import('@civicpress/core')).GitEngine(dataDir);

          // Set role if provided
          if (options.role) {
            git.setRole(options.role);
          }

          // Create commit message
          const commitMessage = options.message
            ? `Change status to ${newStatus}: ${options.message}`
            : `Change status from ${currentStatus} to ${newStatus}`;

          commitHash = await git.commit(commitMessage, [
            path.relative(dataDir, recordPath),
          ]);

          // Emit hook for audit trail
          const hooks = civic.getHookSystem();

          if (!dryRunHooks.includes('status:changed')) {
            await hooks.emit('status:changed', {
              record: {
                title: frontmatter.title || recordName,
                type: recordType,
                status: newStatus,
                path: recordPath,
              },
              previousStatus: currentStatus,
              newStatus,
              role: options.role || 'unknown',
              message: options.message,
              commitHash: commitHash || 'unknown',
            });
          }
        }

        cliSuccess(
          {
            recordName,
            recordTitle: frontmatter.title || recordName,
            recordType,
            recordPath,
            previousStatus: currentStatus,
            newStatus,
            role: options.role || 'unknown',
            message: options.message,
            commitHash,
            dryRun: isCompleteDryRun,
          },
          `Status changed from ${currentStatus} to ${newStatus}`,
          {
            operation: 'status',
            recordName,
            previousStatus: currentStatus,
            newStatus,
          }
        );
        await audit.log({
          source: 'cli',
          action: 'record_status_change',
          target: { type: 'record', name: recordName, path: recordPath },
          outcome: 'success',
          metadata: { previousStatus: currentStatus, newStatus },
        });
      } catch (error) {
        await audit.log({
          source: 'cli',
          action: 'record_status_change',
          target: { type: 'record', name: recordName },
          outcome: 'failure',
          message: error instanceof Error ? error.message : String(error),
        });
        cliError(
          'Failed to change status',
          'STATUS_CHANGE_FAILED',
          {
            error: error instanceof Error ? error.message : String(error),
            recordName,
          },
          'status'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });
}
