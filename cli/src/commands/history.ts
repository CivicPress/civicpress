import { CAC } from 'cac';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
import {
  cliSuccess,
  cliError,
  cliInfo,
  cliWarn,
  cliDebug,
  cliStartOperation,
} from '../utils/cli-output.js';

export const historyCommand = (cli: CAC) => {
  cli
    .command('history [record]', 'View civic record history')
    .option('-l, --limit <number>', 'Limit number of entries', {
      default: '10',
    })
    .option('--format <format>', 'Output format', { default: 'human' })
    .action(async (record: string, options: any) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const logger = initializeLogger();
      const endOperation = cliStartOperation('history');

      try {
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
          throw new Error('Data directory not found. Run "civic init" first.');
        }

        // Create GitEngine with the data directory
        const git = new (await import('@civicpress/core')).GitEngine(dataDir);

        // Initialize GitEngine
        try {
          await git.initialize();
        } catch (error: any) {
          logger.error(
            '❌ Failed to initialize Git repository:',
            error.message
          );
          logger.info('💡 Run "civic init" to set up the repository first');
          process.exit(1);
        }

        // Get commit history
        const limit = parseInt(options.limit) || 10;
        let history: any[] = [];

        try {
          history = await git.getHistory(limit);
        } catch (error: any) {
          // Handle case where there are no commits yet
          if (
            error.message.includes('does not have any commits yet') ||
            error.message.includes('No commits found') ||
            error.message.includes('does not have any commits')
          ) {
            history = [];
          } else {
            throw error;
          }
        }

        const summary = {
          history,
          summary: {
            totalCommits: history.length,
            limit,
            record: record || 'all',
          },
        };

        cliSuccess(summary, 'History retrieved', {
          operation: 'history',
        });

        cliInfo('📜 Viewing civic record history...', 'history');

        if (history.length === 0) {
          cliWarn('📜 No commits found yet', 'history');
          cliInfo(
            '💡 Try creating a record first: civic create <type> <title>',
            'history'
          );
          return;
        }

        cliInfo(`📜 Showing last ${history.length} commits:`, 'history');
        cliDebug('', 'history');

        // Display commit history
        for (const commit of history) {
          const date = new Date(commit.date).toLocaleDateString();
          const time = new Date(commit.date).toLocaleTimeString();
          const role =
            commit.message.match(/feat\(([^)]+)\):/)?.[1] || 'unknown';

          cliInfo(`🔗 ${commit.hash.substring(0, 8)}`, 'history');
          cliDebug(`   📅 ${date} ${time}`, 'history');
          cliDebug(`   👤 ${role}`, 'history');
          cliInfo(`   💬 ${commit.message}`, 'history');
          cliDebug('', 'history');
        }

        cliInfo('✅ History displayed successfully!', 'history');
      } catch (error: any) {
        cliError(
          'Failed to view history',
          'HISTORY_ERROR',
          {
            error: error.message,
            stack: error.stack,
          },
          'history'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });
};
