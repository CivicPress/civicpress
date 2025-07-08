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

export const viewCommand = (cli: CAC) => {
  cli
    .command('view <record>', 'View a specific civic record')
    .option('-r, --raw', 'Show raw markdown content')
    .action(async (recordName: string, options: any) => {
      try {
        // Initialize logger with global options
        const globalOptions = getGlobalOptionsFromArgs();
        initializeLogger(globalOptions);
        const logger = getLogger();

        logger.info(`📖 Viewing record: ${recordName}`);

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

        // Find the record file
        let recordPath: string | null = null;
        let recordType: string | null = null;

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
              recordType = type;
              break;
            }
          }
          if (recordPath) break;
        }

        if (!recordPath) {
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
          return;
        }

        // Read and parse the record
        const content = fs.readFileSync(recordPath, 'utf8');
        const { data: frontmatter, content: markdownContent } = matter(content);

        // Display record information
        logger.info('\n' + '='.repeat(60));
        logger.info(
          `📄 ${frontmatter.title || path.basename(recordPath, '.md')}`
        );
        logger.info('='.repeat(60));

        // Metadata section
        logger.info('\n📋 Metadata:');
        logger.debug('─'.repeat(40));

        const statusColors: Record<string, any> = {
          draft: chalk.yellow,
          proposed: chalk.blue,
          approved: chalk.green,
          active: chalk.green,
          archived: chalk.gray,
        };
        const statusColor = statusColors[frontmatter.status] || chalk.white;

        logger.info(`  Type: ${recordType}`);
        logger.info(`  Status: ${statusColor(frontmatter.status || 'draft')}`);
        logger.info(
          `  Created: ${frontmatter.created ? new Date(frontmatter.created).toLocaleString() : 'unknown'}`
        );
        logger.info(
          `  Updated: ${frontmatter.updated ? new Date(frontmatter.updated).toLocaleString() : 'unknown'}`
        );
        logger.info(`  Author: ${frontmatter.author || 'unknown'}`);
        logger.info(`  Version: ${frontmatter.version || '1.0.0'}`);
        logger.info(`  File: ${path.relative(dataDir, recordPath)}`);

        // Content section
        logger.info('\n📝 Content:');
        logger.debug('─'.repeat(40));

        if (options.raw) {
          // Show raw markdown
          logger.output(markdownContent);
        } else {
          // Show formatted content (basic markdown rendering)
          const lines = markdownContent.split('\n');
          for (const line of lines) {
            if (line.startsWith('# ')) {
              logger.output(line.substring(2));
            } else if (line.startsWith('## ')) {
              logger.output(line.substring(3));
            } else if (line.startsWith('### ')) {
              logger.output(line.substring(4));
            } else if (line.startsWith('- ') || line.startsWith('* ')) {
              logger.output(`  ${line}`);
            } else if (line.trim() === '') {
              logger.output('');
            } else {
              logger.output(line);
            }
          }
        }

        logger.info('\n' + '='.repeat(60));
        logger.success('✅ Record displayed successfully!');
      } catch (error) {
        const logger = getLogger();
        logger.error('❌ Failed to view record:', error);
        process.exit(1);
      }
    });
};
