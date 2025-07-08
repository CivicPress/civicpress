import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress } from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';

export const commitCommand = (cli: CAC) => {
  cli
    .command('commit [record]', 'Commit civic records with role-based messages')
    .option('-m, --message <message>', 'Commit message')
    .option('-r, --role <role>', 'Role for commit (clerk, council, etc.)')
    .option('-a, --all', 'Commit all changes (not just specific files)')
    .action(async (recordName: string, options: any) => {
      try {
        console.log(chalk.blue('💾 Committing civic records...'));

        // Validate required options
        if (!options.message) {
          console.error(
            chalk.red('❌ Commit message is required. Use -m or --message')
          );
          process.exit(1);
        }

        // Initialize CivicPress (will auto-discover config)
        const civic = new CivicPress();
        const core = civic.getCore();
        const dataDir = core.getDataDir();

        if (!dataDir) {
          throw new Error('Data directory not found. Run "civic init" first.');
        }

        // Create GitEngine with the data directory
        const git = new (await import('@civicpress/core')).GitEngine(dataDir);

        // Set role if provided
        if (options.role) {
          git.setRole(options.role);
          console.log(chalk.blue(`👤 Using role: ${options.role}`));
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
          // Find specific record file
          const recordsDir = path.join(dataDir, 'records');
          let recordPath: string | null = null;

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

          // Check if the specific file has changes
          const status = await git.status();
          const allChangedFiles = [
            ...status.modified,
            ...status.created,
            ...status.deleted,
            ...status.renamed,
          ];

          const relativeRecordPath = path.relative(dataDir, recordPath);
          if (allChangedFiles.includes(relativeRecordPath)) {
            filesToCommit = [relativeRecordPath];
          } else {
            console.log(
              chalk.yellow(
                `⚠️  Record "${recordName}" has no changes to commit.`
              )
            );
            return;
          }
        } else {
          // Default: commit all changed files
          const status = await git.status();
          filesToCommit = [
            ...status.modified,
            ...status.created,
            ...status.deleted,
            ...status.renamed,
          ];
        }

        if (filesToCommit.length === 0) {
          console.log(
            chalk.yellow(
              '⚠️  No files to commit. All changes are already committed.'
            )
          );
          return;
        }

        let commitHash: string;

        if (options.all) {
          console.log(chalk.blue('📁 Committing all changes...'));
          commitHash = await git.commit(options.message);
        } else {
          console.log(chalk.blue('📁 Files to commit:'));
          filesToCommit.forEach((file) => {
            console.log(chalk.gray(`  ${file}`));
          });

          // Create role-based commit with specific files
          commitHash = await git.commit(options.message, filesToCommit);
        }

        console.log(chalk.green(`✅ Committed successfully!`));
        console.log(chalk.blue(`🔗 Commit hash: ${commitHash}`));

        // Emit hook for audit trail
        const hooks = civic.getHookSystem();
        await hooks.emit('record:committed', {
          commitHash,
          message: options.message,
          role: options.role || 'unknown',
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(chalk.red('❌ Failed to commit records:'), error);
        process.exit(1);
      }
    });
};
