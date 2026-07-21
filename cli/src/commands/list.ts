import { CAC } from 'cac';
import * as fs from 'fs';
import * as path from 'path';
import matter = require('gray-matter');
import {
  listRecordFilesSync,
  parseRecordRelativePath,
  userCan,
} from '@civicpress/core';
import { withCli } from '../utils/with-cli.js';
import { AuthUtils } from '../utils/auth-utils.js';
import {
  cliSuccess,
  cliError,
  cliInfo,
  cliWarn,
  cliDebug,
  cliTable,
  cliList,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .action(
      withCli<[string, any]>(
        {
          operation: 'list records',
          errorMessage: 'Failed to list records',
          errorCode: 'LIST_FAILED',
        },
        async ({ globalOptions }, type: string, options: any) => {
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

          cliSuccess(
            outputData,
            `Successfully listed ${totalRecords} records`,
            {
              operation: 'list records',
              totalRecords,
              recordTypes: Object.keys(typeCounts),
              statuses: Object.keys(statusCounts),
            }
          );

          // Human mode used to end here, printing ONLY the
          // "✅ Successfully listed N records" line from cliSuccess — the records
          // themselves were never rendered, so `civic list` told you how many
          // records existed but not which ones. Render them for humans.
          //
          // Guarded on `!json` deliberately: cliSuccess above has already emitted
          // the single JSON document, and cliTable/cliList would each emit
          // ANOTHER `{success:true,…}` blob in JSON mode (see CliOutput.table /
          // .list, which delegate to .success), breaking parseability. cliTable
          // and cliList self-suppress under --silent/--quiet.
          if (!globalOptions.json) {
            cliTable(
              records.map((record) => ({
                title: record.title,
                type: record.type,
                status: record.status,
                author: record.author,
                updated: record.updated,
                path: record.relativePath,
              })),
              options.all
                ? ['title', 'type', 'status', 'author', 'updated', 'path']
                : ['title', 'type', 'status', 'updated'],
              'list records'
            );

            cliList(
              Object.entries(statusCounts).map(
                ([status, count]) => `${status}: ${count}`
              ),
              `\nBy status (${totalRecords} total):`,
              'list records'
            );
          }
        }
      )
    );
};
