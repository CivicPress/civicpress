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

export const listCommand = (cli: CAC) => {
  cli
    .command('list [type]', 'List civic records')
    .option(
      '-s, --status <status>',
      'Filter by status (draft, proposed, approved, active, archived, rejected)'
    )
    .option('-a, --all', 'Show all details')
    .action(async (type: string, options: any) => {
      try {
        // Initialize logger with global options
        const globalOptions = getGlobalOptionsFromArgs();
        initializeLogger(globalOptions);
        const logger = getLogger();

        logger.info('📋 Listing civic records...');

        // Initialize CivicPress (will auto-discover config)
        const civic = new CivicPress();
        const core = civic.getCore();
        const dataDir = core.getDataDir();

        // Check if we should output JSON
        const shouldOutputJson = globalOptions.json;

        if (!dataDir) {
          throw new Error('Data directory not found. Run "civic init" first.');
        }

        const recordsDir = path.join(dataDir, 'records');
        if (!fs.existsSync(recordsDir)) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  records: [],
                  summary: { totalRecords: 0, byStatus: {}, byType: {} },
                },
                null,
                2
              )
            );
            return;
          } else {
            logger.warn(
              '📁 No records directory found. Create some records first!'
            );
            return;
          }
        }

        // Get all record types
        const recordTypes = fs
          .readdirSync(recordsDir, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name);

        if (recordTypes.length === 0) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  records: [],
                  summary: { totalRecords: 0, byStatus: {}, byType: {} },
                },
                null,
                2
              )
            );
            return;
          } else {
            logger.warn('📁 No record types found. Create some records first!');
            return;
          }
        }

        // Filter by type if specified
        const typesToShow = type ? [type] : recordTypes;

        let totalRecords = 0;
        const statusCounts: Record<string, number> = {};
        const typeCounts: Record<string, number> = {};
        const records: any[] = [];

        for (const recordType of typesToShow) {
          const typeDir = path.join(recordsDir, recordType);

          if (!fs.existsSync(typeDir)) {
            continue;
          }

          const files = fs
            .readdirSync(typeDir)
            .filter((file) => file.endsWith('.md'))
            .map((file) => path.join(typeDir, file));

          if (files.length === 0) {
            continue;
          }

          if (!shouldOutputJson) {
            logger.info(
              `\n📁 ${recordType.toUpperCase()} (${files.length} records):`
            );
            logger.debug('─'.repeat(50));
          }

          for (const filePath of files) {
            try {
              const content = fs.readFileSync(filePath, 'utf8');
              const { data: frontmatter } = matter(content);

              const title = frontmatter.title || path.basename(filePath, '.md');
              const status = frontmatter.status || 'draft';
              const createdAt = frontmatter.created || null;
              const updatedAt = frontmatter.updated || null;
              const author = frontmatter.author || 'unknown';

              // Apply status filter if specified
              if (options.status) {
                const allowedStatuses = options.status
                  .split(',')
                  .map((s: string) => s.trim());
                if (!allowedStatuses.includes(status)) {
                  continue;
                }
              }

              // Count status and type
              statusCounts[status] = (statusCounts[status] || 0) + 1;
              typeCounts[recordType] = (typeCounts[recordType] || 0) + 1;
              totalRecords++;

              // Create record object for JSON output
              const record = {
                title,
                type: recordType,
                status,
                author,
                path: path.relative(dataDir, filePath),
                relativePath: path.relative(
                  path.join(dataDir, 'records'),
                  filePath
                ),
                createdAt: createdAt ? new Date(createdAt).toISOString() : null,
                updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
                created: createdAt
                  ? new Date(createdAt).toLocaleDateString()
                  : 'unknown',
                updated: updatedAt
                  ? new Date(updatedAt).toLocaleDateString()
                  : 'unknown',
              };

              records.push(record);

              // Human-readable output
              if (!shouldOutputJson) {
                // Status color
                const statusColors: Record<string, any> = {
                  draft: chalk.yellow,
                  proposed: chalk.blue,
                  approved: chalk.green,
                  active: chalk.green,
                  archived: chalk.gray,
                };
                const statusColor = statusColors[status] || chalk.white;

                logger.info(`  📄 ${title}`);
                logger.debug(`     Status: ${statusColor(status)}`);

                if (options.all) {
                  logger.debug(`     Created: ${record.created}`);
                  logger.debug(`     Updated: ${record.updated}`);
                  logger.debug(`     Author: ${author}`);
                  logger.debug(`     File: ${record.path}`);
                }

                logger.debug('');
              }
            } catch (error) {
              logger.error(
                `  ❌ Error reading ${path.basename(filePath)}: ${error}`
              );
            }
          }
        }

        // Output JSON or human-readable summary
        if (shouldOutputJson) {
          const jsonOutput = {
            records,
            summary: {
              totalRecords,
              byStatus: statusCounts,
              byType: typeCounts,
            },
          };
          console.log(JSON.stringify(jsonOutput, null, 2));
        } else {
          // Human-readable summary
          logger.info(`\n📊 Summary:`);
          logger.info(`  Total records: ${totalRecords}`);

          if (Object.keys(statusCounts).length > 0) {
            logger.info(`  By status:`);
            for (const [status, count] of Object.entries(statusCounts)) {
              const statusColor =
                {
                  draft: chalk.yellow,
                  proposed: chalk.blue,
                  approved: chalk.green,
                  active: chalk.green,
                  archived: chalk.gray,
                }[status] || chalk.white;

              logger.debug(`    ${statusColor(status)}: ${count}`);
            }
          }

          logger.success('\n✅ Records listed successfully!');
        }
      } catch (error) {
        const logger = getLogger();
        logger.error('❌ Failed to list records:', error);
        process.exit(1);
      }
    });
};
