import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress } from '@civicpress/core';

export const historyCommand = (cli: CAC) => {
  cli
    .command('history [record]', 'View civic record history')
    .option('-l, --limit <number>', 'Limit number of entries', {
      default: '10',
    })
    .option('--format <format>', 'Output format', { default: 'human' })
    .action(async (record: string, options: any) => {
      try {
        // Quick fix: Suppress console output for JSON format
        // TODO: Implement proper silent mode in CivicPress core and hook system
        let originalConsoleLog: typeof console.log | undefined;
        if (options.format === 'json') {
          originalConsoleLog = console.log;
          console.log = () => {}; // Suppress all console.log output
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

        // Get commit history
        const limit = parseInt(options.limit) || 10;
        const history = await git.getHistory(limit);

        if (options.format === 'json') {
          if (originalConsoleLog) {
            console.log = originalConsoleLog; // Restore console.log
          }
          console.log(JSON.stringify(history, null, 2));
          return;
        }

        // Restore console.log if it was overridden
        if (originalConsoleLog) {
          console.log = originalConsoleLog;
        }

        console.log(chalk.blue('📜 Viewing civic record history...'));

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
