import { CAC } from 'cac';
import * as fs from 'fs';
import * as path from 'path';
import matter = require('gray-matter');
import {
  listRecordFilesSync,
  parseRecordRelativePath,
  userCan,
} from '@civicpress/core';
import {
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
import { AuthUtils } from '../utils/auth-utils.js';
import {
  cliSuccess,
  cliError,
  cliInfo,
  cliWarn,
  cliDebug,
  cliStartOperation,
} from '../utils/cli-output.js';

export const listCommand = (cli: CAC) => {
  cli
    .command('list [type]', 'List civic records')
    .option('--token <token>', 'Session token for authentication')
    .option(
      '-s, --status <status>',
      'Filter by status (draft, proposed, approved, active, archived, rejected)'
    )
    .option('-a, --all', 'Show all details')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (type: string, options: any) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('list records');

      try {
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
            'list records'
          );
          process.exit(1);
        }

        cliInfo('Listing civic records...', 'list records');

        if (!dataDir) {
          cliError(
            'Data directory not found. Run "civic init" first.',
            'DATA_DIR_NOT_FOUND',
            undefined,
            'list records'
          );
          process.exit(1);
        }

        const recordPaths = listRecordFilesSync(dataDir, { type });

        if (recordPaths.length === 0) {
          cliSuccess(
            {
              records: [],
              summary: { totalRecords: 0, byStatus: {}, byType: {} },
            },
            'No records found',
            { operation: 'list records', totalRecords: 0 }
          );
          return;
        }

        let totalRecords = 0;
        const statusCounts: Record<string, number> = {};
        const typeCounts: Record<string, number> = {};
        const records: any[] = [];

        for (const relativePath of recordPaths) {
          const parsed = parseRecordRelativePath(relativePath);
          if (parsed.type === '') {
            continue;
          }

          const filePath = path.join(dataDir, relativePath);

          cliDebug(
            `Processing record ${relativePath}`,
            { recordType: parsed.type, relativePath },
            'list records'
          );

          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const { data: frontmatter } = matter(content);

            const title = frontmatter.title || path.basename(filePath, '.md');
            const status = frontmatter.status || 'draft';
            const createdAt = frontmatter.created || null;
            const updatedAt = frontmatter.updated || null;
            const author = frontmatter.author || 'unknown';

            if (options.status) {
              const allowedStatuses = options.status
                .split(',')
                .map((s: string) => s.trim());
              if (!allowedStatuses.includes(status)) {
                continue;
              }
            }

            statusCounts[status] = (statusCounts[status] || 0) + 1;
            typeCounts[parsed.type] = (typeCounts[parsed.type] || 0) + 1;
            totalRecords++;

            const record = {
              title,
              type: parsed.type,
              status,
              author,
              year: parsed.year,
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

            cliDebug(
              `Processed record: ${title}`,
              { title, status, type: parsed.type },
              'list records'
            );
          } catch (error) {
            cliWarn(
              `Error reading ${path.basename(filePath)}: ${error}`,
              'list records'
            );
          }
        }

        // Prepare output data
        const outputData = {
          records,
          summary: {
            totalRecords,
            byStatus: statusCounts,
            byType: typeCounts,
          },
        };

        cliSuccess(outputData, `Successfully listed ${totalRecords} records`, {
          operation: 'list records',
          totalRecords,
          recordTypes: Object.keys(typeCounts),
          statuses: Object.keys(statusCounts),
        });

        endOperation();
      } catch (error) {
        cliError(
          'Failed to list records',
          'LIST_FAILED',
          { error: error instanceof Error ? error.message : String(error) },
          'list records'
        );
        process.exit(1);
      }
    });
};
