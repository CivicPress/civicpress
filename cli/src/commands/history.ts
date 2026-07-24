/* eslint-disable @typescript-eslint/no-explicit-any -- CLI command handlers pass CAC's untyped options through withCli. */
import { CAC } from 'cac';
import { withCli } from '../utils/with-cli.js';
import { cliSuccess, cliInfo, cliWarn, cliDebug } from '../utils/cli-output.js';

export const historyCommand = (cli: CAC) => {
  cli
    .command('history [record]', 'View civic record history')
    .option('-l, --limit <number>', 'Limit number of entries', {
      default: '10',
    })
    .option('--format <format>', 'Output format', { default: 'human' })
    .action(
      withCli<[any, any]>(
        {
          operation: 'history',
          errorMessage: 'Failed to view history',
          errorCode: 'HISTORY_ERROR',
          details: (error) => ({
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          }),
        },
        async ({ logger }, record: any, options: any) => {
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
            throw new Error(
              'Data directory not found. Run "civic init" first.'
            );
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

          // When a record is named, scope the log to its file via a pathspec
          // (git log -- <path>) instead of ignoring the argument entirely, as
          // this command used to. Resolve the record's real path through a
          // CivicPress instance; unresolvable → unscoped history.
          let pathspec: string | undefined;
          if (record) {
            try {
              const { CivicPress, CentralConfigManager } =
                await import('@civicpress/core');
              const civic = new CivicPress({
                dataDir,
                database: CentralConfigManager.getDatabaseConfig(),
              });
              await civic.initialize();
              try {
                const rec = await civic.getRecordManager().getRecord(record);
                pathspec = (rec as { path?: string } | null)?.path;
              } finally {
                await civic.shutdown();
              }
            } catch {
              // fall back to unscoped history
            }
          }

          // Get commit history
          const limit = parseInt(options.limit) || 10;
          let history: any[] = [];

          try {
            history = await git.getHistory(limit, pathspec);
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
        }
      )
    );
};
