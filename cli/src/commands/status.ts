import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress, getLogger } from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';

export const statusCommand = (cli: CAC) => {
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
    .option('--dry-run', 'Complete dry-run (no files modified, no commits)')
    .option(
      '--dry-run-hooks <hooks>',
      'Dry-run specific hooks (comma-separated)'
    )
    .action(async (recordName: string, newStatus: string, options: any) => {
      // Initialize logger with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeLogger(globalOptions);
      const logger = getLogger();

      // Check if we should output JSON
      const shouldOutputJson = globalOptions.json;

      try {
        if (!shouldOutputJson) {
          logger.info(`🔄 Changing status of ${recordName} to ${newStatus}...`);
        }

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
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Invalid status',
                  details: `Invalid status: ${newStatus}`,
                  validStatuses: validStatuses,
                },
                null,
                2
              )
            );
          } else {
            logger.error(`❌ Invalid status: ${newStatus}`);
            logger.info('Valid statuses: ' + validStatuses.join(', '));
          }
          process.exit(1);
        }

        // Initialize CivicPress (will auto-discover config)
        const civic = new CivicPress();
        const core = civic.getCore();
        const dataDir = core.getDataDir();

        if (!dataDir) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Data directory not found',
                  details: 'Run "civic init" first',
                },
                null,
                2
              )
            );
          } else {
            throw new Error(
              'Data directory not found. Run "civic init" first.'
            );
          }
          process.exit(1);
        }

        const recordsDir = path.join(dataDir, 'records');
        if (!fs.existsSync(recordsDir)) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'No records directory found',
                  details: 'Create some records first',
                },
                null,
                2
              )
            );
          } else {
            logger.warn(
              '📁 No records directory found. Create some records first!'
            );
          }
          process.exit(1);
        }

        // Find the record file
        let recordPath: string | null = null;
        let recordType: string | null = null;

        // Search through all record types
        const recordTypes = fs
          .readdirSync(recordsDir, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name);

        for (const type of recordTypes) {
          const typeDir = path.join(recordsDir, type);
          const files = fs
            .readdirSync(typeDir)
            .filter((file) => file.endsWith('.md'))
            .map((file) => path.join(typeDir, file));

          for (const filePath of files) {
            const filename = path.basename(filePath, '.md');
            if (filename === recordName || filePath.includes(recordName)) {
              recordPath = filePath;
              recordType = type;
              break;
            }
          }
          if (recordPath) break;
        }

        if (!recordPath) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Record not found',
                  details: `Record "${recordName}" not found`,
                  availableRecords: recordTypes.reduce(
                    (acc, type) => {
                      const typeDir = path.join(recordsDir, type);
                      const files = fs
                        .readdirSync(typeDir)
                        .filter((file) => file.endsWith('.md'))
                        .map((file) => path.basename(file, '.md'));
                      if (files.length > 0) {
                        acc[type] = files;
                      }
                      return acc;
                    },
                    {} as Record<string, string[]>
                  ),
                },
                null,
                2
              )
            );
          } else {
            logger.error(`❌ Record "${recordName}" not found.`);
            logger.info('Available records:');

            // List available records
            for (const type of recordTypes) {
              const typeDir = path.join(recordsDir, type);
              const files = fs
                .readdirSync(typeDir)
                .filter((file) => file.endsWith('.md'))
                .map((file) => path.basename(file, '.md'));

              if (files.length > 0) {
                logger.info(`  ${type}:`);
                for (const file of files) {
                  logger.debug(`    ${file}`);
                }
              }
            }
          }
          process.exit(1);
        }

        // Read current record
        const content = fs.readFileSync(recordPath, 'utf8');
        const { data: frontmatter, content: markdownContent } = matter(content);

        // Get current status
        const currentStatus = frontmatter.status || 'draft';

        if (currentStatus === newStatus) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Status already set',
                  details: `Record "${recordName}" is already ${newStatus}`,
                  currentStatus: currentStatus,
                  requestedStatus: newStatus,
                },
                null,
                2
              )
            );
          } else {
            logger.warn(`⚠️  Record "${recordName}" is already ${newStatus}.`);
          }
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

        // Display status change
        if (!shouldOutputJson) {
          logger.info(`📄 Record: ${frontmatter.title || recordName}`);
          logger.debug(`📁 Type: ${recordType}`);
          logger.info(
            `🔄 Status: ${currentStatusColor(currentStatus)} → ${statusColor(newStatus)}`
          );

          if (options.role) {
            logger.debug(`👤 Changed by: ${options.role}`);
          }

          if (options.message) {
            logger.debug(`💬 Message: ${options.message}`);
          }
        }

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

        if (isCompleteDryRun) {
          if (!shouldOutputJson) {
            logger.warn(`📋 Would update: ${recordPath}`);
            logger.warn(
              `📋 Would change status: ${currentStatus} → ${newStatus}`
            );
          }
        } else {
          fs.writeFileSync(recordPath, updatedContent);
          if (!shouldOutputJson) {
            logger.success(`✅ Status updated successfully!`);
          }
        }

        // Commit the change
        let commitHash: string | undefined;

        if (isCompleteDryRun) {
          const commitMessage = options.message
            ? `Change status to ${newStatus}: ${options.message}`
            : `Change status from ${currentStatus} to ${newStatus}`;
          if (!shouldOutputJson) {
            logger.warn(`📋 Would commit: "${commitMessage}"`);
            logger.warn(
              `📋 Would stage: ${path.relative(dataDir, recordPath)}`
            );
          }
        } else {
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
          if (!shouldOutputJson) {
            logger.success(`💾 Committed status change`);
            logger.info(`🔗 Commit hash: ${commitHash}`);
          }
        }

        // Emit hook for audit trail
        const hooks = civic.getHookSystem();

        if (isCompleteDryRun || dryRunHooks.includes('status:changed')) {
          if (!shouldOutputJson) {
            logger.warn(`📋 Would fire hook: status:changed`);
            logger.debug(
              `   Record: ${frontmatter.title || recordName} (${recordType})`
            );
            logger.debug(`   Status: ${currentStatus} → ${newStatus}`);
          }
        } else {
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

        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: true,
                message: 'Status changed successfully',
                data: {
                  recordName: recordName,
                  recordTitle: frontmatter.title || recordName,
                  recordType: recordType,
                  recordPath: recordPath,
                  previousStatus: currentStatus,
                  newStatus: newStatus,
                  role: options.role || 'unknown',
                  message: options.message,
                  commitHash: commitHash,
                  dryRun: isCompleteDryRun,
                },
              },
              null,
              2
            )
          );
        }
      } catch (error) {
        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: false,
                error: 'Failed to change status',
                details: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            )
          );
        } else {
          const logger = getLogger();
          logger.error('❌ Failed to change status:', error);
        }
        process.exit(1);
      }
    });
};
