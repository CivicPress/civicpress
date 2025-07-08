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
      try {
        // Initialize logger with global options
        const globalOptions = getGlobalOptionsFromArgs();
        initializeLogger(globalOptions);
        const logger = getLogger();

        logger.info(`🔄 Changing status of ${recordName} to ${newStatus}...`);

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
          logger.error(`❌ Invalid status: ${newStatus}`);
          logger.info('Valid statuses: ' + validStatuses.join(', '));
          process.exit(1);
        }

        // Initialize CivicPress (will auto-discover config)
        const civic = new CivicPress();
        const core = civic.getCore();
        const dataDir = core.getDataDir();

        if (!dataDir) {
          throw new Error('Data directory not found. Run "civic init" first.');
        }

        const recordsDir = path.join(dataDir, 'records');
        if (!fs.existsSync(recordsDir)) {
          logger.warn(
            '📁 No records directory found. Create some records first!'
          );
          return;
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
          return;
        }

        // Read current record
        const content = fs.readFileSync(recordPath, 'utf8');
        const { data: frontmatter, content: markdownContent } = matter(content);

        // Get current status
        const currentStatus = frontmatter.status || 'draft';

        if (currentStatus === newStatus) {
          logger.warn(`⚠️  Record "${recordName}" is already ${newStatus}.`);
          return;
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
          logger.warn(`📋 Would update: ${recordPath}`);
          logger.warn(
            `📋 Would change status: ${currentStatus} → ${newStatus}`
          );
        } else {
          fs.writeFileSync(recordPath, updatedContent);
          logger.success(`✅ Status updated successfully!`);
        }

        // Commit the change
        let commitHash: string | undefined;

        if (isCompleteDryRun) {
          const commitMessage = options.message
            ? `Change status to ${newStatus}: ${options.message}`
            : `Change status from ${currentStatus} to ${newStatus}`;
          logger.warn(`📋 Would commit: "${commitMessage}"`);
          logger.warn(`📋 Would stage: ${path.relative(dataDir, recordPath)}`);
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
          logger.success(`💾 Committed status change`);
          logger.info(`🔗 Commit hash: ${commitHash}`);
        }

        // Emit hook for audit trail
        const hooks = civic.getHookSystem();

        if (isCompleteDryRun || dryRunHooks.includes('status:changed')) {
          logger.warn(`📋 Would fire hook: status:changed`);
          logger.debug(
            `   Record: ${frontmatter.title || recordName} (${recordType})`
          );
          logger.debug(`   Status: ${currentStatus} → ${newStatus}`);
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
      } catch (error) {
        const logger = getLogger();
        logger.error('❌ Failed to change status:', error);
        process.exit(1);
      }
    });
};
