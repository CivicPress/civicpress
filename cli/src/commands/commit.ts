import { CAC } from 'cac';
import { CivicPress } from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';

export const commitCommand = (cli: CAC) => {
  cli
    .command('commit [record]', 'Commit civic records with role-based messages')
    .option('-m, --message <message>', 'Commit message')
    .option('-r, --role <role>', 'Role for commit (clerk, council, etc.)')
    .option('-a, --all', 'Commit all changes (not just specific files)')
    .action(async (recordName: string, options: any) => {
      // Initialize logger with global options
      const globalOptions = getGlobalOptionsFromArgs();
      const logger = initializeLogger();

      // Check if we should output JSON
      const shouldOutputJson = globalOptions.json;

      try {
        if (!shouldOutputJson) {
          logger.info('💾 Committing civic records...');
        }

        // Validate required options
        if (!options.message) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Commit message is required',
                  details: 'Use -m or --message',
                },
                null,
                2
              )
            );
          } else {
            logger.error('❌ Commit message is required. Use -m or --message');
          }
          process.exit(1);
        }

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
        const civic = new CivicPress({ dataDir });

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

        // Create GitEngine with the data directory
        const git = new (await import('@civicpress/core')).GitEngine(dataDir);

        // Set role if provided
        if (options.role) {
          git.setRole(options.role);
          if (!shouldOutputJson) {
            logger.info(`👤 Using role: ${options.role}`);
          }
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
            if (shouldOutputJson) {
              console.log(
                JSON.stringify(
                  {
                    success: false,
                    error: 'No changes to commit',
                    details: `Record "${recordName}" has no changes to commit`,
                  },
                  null,
                  2
                )
              );
            } else {
              logger.warn(
                `⚠️  Record "${recordName}" has no changes to commit.`
              );
            }
            process.exit(1);
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
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'No files to commit',
                  details: 'All changes are already committed',
                },
                null,
                2
              )
            );
          } else {
            logger.warn(
              '⚠️  No files to commit. All changes are already committed.'
            );
          }
          process.exit(1);
        }

        let commitHash: string;

        if (options.all) {
          if (!shouldOutputJson) {
            logger.info('📁 Committing all changes...');
          }
          commitHash = await git.commit(options.message);
        } else {
          if (!shouldOutputJson) {
            logger.info('📁 Files to commit:');
            filesToCommit.forEach((file) => {
              logger.debug(`  ${file}`);
            });
          }

          // Create role-based commit with specific files
          commitHash = await git.commit(options.message, filesToCommit);
        }

        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: true,
                message: 'Committed successfully',
                data: {
                  commitHash: commitHash,
                  message: options.message,
                  role: options.role || 'unknown',
                  filesCommitted: filesToCommit,
                  commitAll: options.all || false,
                },
              },
              null,
              2
            )
          );
        } else {
          logger.success(`✅ Committed successfully!`);
          logger.info(`🔗 Commit hash: ${commitHash}`);
        }

        // Emit hook for audit trail
        const hooks = civic.getHookSystem();
        await hooks.emit('record:committed', {
          commitHash,
          message: options.message,
          role: options.role || 'unknown',
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: false,
                error: 'Failed to commit records',
                details: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            )
          );
        } else {
          logger.error('❌ Failed to commit records:', error);
        }
        process.exit(1);
      }
    });
};
