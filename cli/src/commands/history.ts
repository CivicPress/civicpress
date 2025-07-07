import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress } from '@civicpress/core';

export const historyCommand = (cli: CAC) => {
  cli
    .command('history [record]', 'View civic record history')
    .option('-l, --limit <number>', 'Limit number of entries', {
      default: '10',
    })
    .action(async (record: string, options: any) => {
      try {
        console.log(chalk.blue('📜 Viewing civic record history...'));

        // Initialize CivicPress
        const civic = new CivicPress();
        const git = civic.getGitEngine();

        // Get commit history
        const limit = parseInt(options.limit) || 10;
        const history = await git.getHistory(limit);

        if (history.length === 0) {
          console.log(chalk.yellow('📜 No commits found'));
          return;
        }

        console.log(chalk.blue(`📜 Showing last ${history.length} commits:`));
        console.log('');

        // Display commit history
        for (const commit of history) {
          const date = new Date(commit.date).toLocaleDateString();
          const time = new Date(commit.date).toLocaleTimeString();
          const role =
            commit.message.match(/feat\(([^)]+)\):/)?.[1] || 'unknown';

          console.log(chalk.cyan(`🔗 ${commit.hash.substring(0, 8)}`));
          console.log(chalk.gray(`   📅 ${date} ${time}`));
          console.log(chalk.gray(`   👤 ${role}`));
          console.log(chalk.white(`   💬 ${commit.message}`));
          console.log('');
        }

        console.log(chalk.green('✅ History displayed successfully!'));
      } catch (error) {
        console.error(chalk.red('❌ Failed to view history:'), error);
        process.exit(1);
      }
    });
};
