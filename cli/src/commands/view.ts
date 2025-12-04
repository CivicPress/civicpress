import { CAC } from 'cac';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import matter = require('gray-matter');
import { userCan } from '@civicpress/core';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
import { AuthUtils } from '../utils/auth-utils.js';
import {
  getAvailableRecords,
  resolveRecordReference,
} from '../utils/record-locator.js';
import {
  cliSuccess,
  cliError,
  cliInfo,
  cliWarn,
  cliStartOperation,
} from '../utils/cli-output.js';

export const viewCommand = (cli: CAC) => {
  cli
    .command('view <record>', 'View a specific civic record')
    .option('--token <token>', 'Session token for authentication')
    .option('-r, --raw', 'Show raw markdown content')
    .action(async (recordName: string, options: any) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const logger = initializeLogger();
      const endOperation = cliStartOperation('view');

      // Validate authentication and get civic instance
      const { civic, user } = await AuthUtils.requireAuthWithCivic(
        options.token,
        globalOptions.json
      );
      const dataDir = civic.getDataDir();

      // Check view permissions
      const canView = await userCan(user, 'records:view');
      if (!canView) {
        cliError(
          'Insufficient permissions to view records',
          'PERMISSION_DENIED',
          {
            requiredPermission: 'records:view',
            userRole: user.role,
          },
          'view'
        );
        process.exit(1);
      }

      try {
        logger.info(`📖 Viewing record: ${recordName}`);

        // Check if we should output JSON
        const shouldOutputJson = globalOptions.json;

        if (!dataDir) {
          throw new Error('Data directory not found. Run "civic init" first.');
        }

        const recordsDir = path.join(dataDir, 'records');
        if (!fs.existsSync(recordsDir)) {
          cliWarn('No records directory found', 'view');
          return;
        }

        const resolvedRecord = resolveRecordReference(dataDir, recordName);

        if (!resolvedRecord) {
          const availableRecords = getAvailableRecords(dataDir);

          cliError(
            `Record "${recordName}" not found`,
            'RECORD_NOT_FOUND',
            {
              recordName,
              availableRecords,
            },
            'view'
          );
          return;
        }

        const recordPath = resolvedRecord.absolutePath;
        const parsedRecord = resolvedRecord.parsed;
        const recordType = parsedRecord.type;

        // Read and parse the record
        const content = fs.readFileSync(recordPath, 'utf8');
        const { data: frontmatter, content: markdownContent } = matter(content);

        // Create record object for JSON output
        const pathFromDataRoot = path
          .relative(dataDir, recordPath)
          .replace(/\\/g, '/');
        const pathFromRecordsDir = path
          .relative(path.join(dataDir, 'records'), recordPath)
          .replace(/\\/g, '/');

        const record = {
          title: frontmatter.title || path.basename(recordPath, '.md'),
          type: recordType,
          status: frontmatter.status || 'draft',
          author: frontmatter.author || 'unknown',
          version: frontmatter.version || '1.0.0',
          path: pathFromDataRoot,
          relativePath: pathFromRecordsDir,
          createdAt: frontmatter.created
            ? new Date(frontmatter.created).toISOString()
            : null,
          updatedAt: frontmatter.updated
            ? new Date(frontmatter.updated).toISOString()
            : null,
          created: frontmatter.created
            ? new Date(frontmatter.created).toLocaleString()
            : 'unknown',
          updated: frontmatter.updated
            ? new Date(frontmatter.updated).toLocaleString()
            : 'unknown',
          metadata: frontmatter,
          content: markdownContent,
          rawContent: content,
        };

        cliSuccess({ record }, `Record: ${record.title}`, {
          operation: 'view',
          recordType: record.type,
          recordTitle: record.title,
        });

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
        logger.error('❌ Failed to view record:', error);
        process.exit(1);
      }
    });
};
