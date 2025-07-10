import { CAC } from 'cac';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';

export const historyCommand = (cli: CAC) => {
  cli
    .command('history [record]', 'View civic record history')
    .option('-l, --limit <number>', 'Limit number of entries', {
      default: '10',
    })
    .option('--format <format>', 'Output format', { default: 'human' })
    .action(async (record: string, options: any) => {
      // Initialize logger with global options
      const globalOptions = getGlobalOptionsFromArgs();
      const logger = initializeLogger();

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

        // Get commit history
        const limit = parseInt(options.limit) || 10;
        const history = await git.getHistory(limit);

        // Check if we should output JSON
        const shouldOutputJson = globalOptions.json;

        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                history,
                summary: {
                  totalCommits: history.length,
                  limit,
                  record: record || 'all',
                },
              },
              null,
              2
            )
          );
          return;
        }

        logger.info('📜 Viewing civic record history...');

        if (history.length === 0) {
          logger.warn('📜 No commits found');
          return;
        }

        logger.info(`📜 Showing last ${history.length} commits:`);
        logger.debug('');

        // Display commit history
        for (const commit of history) {
          const date = new Date(commit.date).toLocaleDateString();
          const time = new Date(commit.date).toLocaleTimeString();
          const role =
            commit.message.match(/feat\(([^)]+)\):/)?.[1] || 'unknown';

          logger.info(`🔗 ${commit.hash.substring(0, 8)}`);
          logger.debug(`   📅 ${date} ${time}`);
          logger.debug(`   👤 ${role}`);
          logger.output(`   💬 ${commit.message}`);
          logger.debug('');
        }

        logger.success('✅ History displayed successfully!');
      } catch (error) {
        logger.error('❌ Failed to view history:', error);
        process.exit(1);
      }
    });
};
