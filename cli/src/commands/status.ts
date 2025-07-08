import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress } from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';

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
    .action(async (recordName: string, newStatus: string, options: any) => {
      try {
        console.log(
          chalk.blue(`🔄 Changing status of ${recordName} to ${newStatus}...`)
        );

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
          console.error(chalk.red(`❌ Invalid status: ${newStatus}`));
          console.log(chalk.blue('Valid statuses:'), validStatuses.join(', '));
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
          console.log(
            chalk.yellow(
              '📁 No records directory found. Create some records first!'
            )
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
          console.log(chalk.red(`❌ Record "${recordName}" not found.`));
          console.log(chalk.blue('Available records:'));

          // List available records
          for (const type of recordTypes) {
            const typeDir = path.join(recordsDir, type);
            const files = fs
              .readdirSync(typeDir)
              .filter((file) => file.endsWith('.md'))
              .map((file) => path.basename(file, '.md'));

            if (files.length > 0) {
              console.log(chalk.cyan(`  ${type}:`));
              for (const file of files) {
                console.log(chalk.gray(`    ${file}`));
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
          console.log(
            chalk.yellow(`⚠️  Record "${recordName}" is already ${newStatus}.`)
          );
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
        console.log(
          chalk.cyan(`📄 Record: ${frontmatter.title || recordName}`)
        );
        console.log(chalk.gray(`📁 Type: ${recordType}`));
        console.log(
          chalk.white(
            `🔄 Status: ${currentStatusColor(currentStatus)} → ${statusColor(newStatus)}`
          )
        );

        if (options.role) {
          console.log(chalk.gray(`👤 Changed by: ${options.role}`));
        }

        if (options.message) {
          console.log(chalk.gray(`💬 Message: ${options.message}`));
        }

        // Write updated record
        const updatedContent = matter.stringify(
          markdownContent,
          updatedFrontmatter
        );
        fs.writeFileSync(recordPath, updatedContent);

        console.log(chalk.green(`✅ Status updated successfully!`));

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

        const commitHash = await git.commit(commitMessage, [
          path.relative(dataDir, recordPath),
        ]);
        console.log(chalk.green(`💾 Committed status change`));
        console.log(chalk.blue(`🔗 Commit hash: ${commitHash}`));

        // Emit hook for audit trail
        const hooks = civic.getHookSystem();
        await hooks.emit('record:status_changed', {
          recordName,
          recordType,
          previousStatus: currentStatus,
          newStatus,
          role: options.role || 'unknown',
          message: options.message,
          commitHash,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(chalk.red('❌ Failed to change status:'), error);
        process.exit(1);
      }
    });
};
