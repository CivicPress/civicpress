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

        if (!dataDir) {
          throw new Error('Data directory not found. Run "civic init" first.');
        }

        const recordsDir = path.join(dataDir, 'records');
        if (!fs.existsSync(recordsDir)) {
          logger.warn(
            '📁 No records directory found. Create some records first!'
          );
          return;
        }

        // Get all record types
        const recordTypes = fs
          .readdirSync(recordsDir, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name);

        if (recordTypes.length === 0) {
          logger.warn('📁 No record types found. Create some records first!');
          return;
        }

        // Filter by type if specified
        const typesToShow = type ? [type] : recordTypes;

        let totalRecords = 0;
        const statusCounts: Record<string, number> = {};

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

          logger.info(
            `\n📁 ${recordType.toUpperCase()} (${files.length} records):`
          );
          logger.debug('─'.repeat(50));

          for (const filePath of files) {
            try {
              const content = fs.readFileSync(filePath, 'utf8');
              const { data: frontmatter } = matter(content);

              const title = frontmatter.title || path.basename(filePath, '.md');
              const status = frontmatter.status || 'draft';
              const created = frontmatter.created
                ? new Date(frontmatter.created).toLocaleDateString()
                : 'unknown';
              const updated = frontmatter.updated
                ? new Date(frontmatter.updated).toLocaleDateString()
                : 'unknown';
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

              // Count status
              statusCounts[status] = (statusCounts[status] || 0) + 1;
              totalRecords++;

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
                logger.debug(`     Created: ${created}`);
                logger.debug(`     Updated: ${updated}`);
                logger.debug(`     Author: ${author}`);
                logger.debug(`     File: ${path.relative(dataDir, filePath)}`);
              }

              logger.debug('');
            } catch (error) {
              logger.error(
                `  ❌ Error reading ${path.basename(filePath)}: ${error}`
              );
            }
          }
        }

        // Summary
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
      } catch (error) {
        const logger = getLogger();
        logger.error('❌ Failed to list records:', error);
        process.exit(1);
      }
    });
};
