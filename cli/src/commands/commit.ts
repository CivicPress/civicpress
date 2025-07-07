import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress } from '@civicpress/core';

export const commitCommand = (cli: CAC) => {
  cli
    .command('commit', 'Commit civic records with role-based messages')
    .option('-m, --message <message>', 'Commit message')
    .option('-r, --role <role>', 'Role for commit (clerk, council, etc.)')
    .action(async (options: any) => {
      try {
        console.log(chalk.blue('💾 Committing civic records...'));

        // Validate required options
        if (!options.message) {
          console.error(
            chalk.red('❌ Commit message is required. Use -m or --message')
          );
          process.exit(1);
        }

        // Initialize CivicPress
        const civic = new CivicPress();
        const git = civic.getGitEngine();

        // Set role if provided
        if (options.role) {
          git.setRole(options.role);
          console.log(chalk.blue(`👤 Using role: ${options.role}`));
        }

        // Create role-based commit
        const commitHash = await git.commit(options.message);
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
