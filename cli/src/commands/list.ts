import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress } from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';

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
        console.log(chalk.blue('📋 Listing civic records...'));

        // Initialize CivicPress (will auto-discover config)
        const civic = new CivicPress();
        const core = civic.getCore();
        const dataDir = core.getDataDir();

        if (!dataDir) {
          throw new Error('Data directory not found. Run "civic init" first.');
        }

        const recordsDir = path.join(dataDir, 'records');
        if (!fs.existsSync(recordsDir)) {
          console.log(
            chalk.yellow(
              '📁 No records directory found. Create some records first!'
            )
          );
          return;
        }

        // Get all record types
        const recordTypes = fs
          .readdirSync(recordsDir, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name);

        if (recordTypes.length === 0) {
          console.log(
            chalk.yellow('📁 No record types found. Create some records first!')
          );
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

          console.log(
            chalk.cyan(
              `\n📁 ${recordType.toUpperCase()} (${files.length} records):`
            )
          );
          console.log(chalk.gray('─'.repeat(50)));

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

              console.log(chalk.white(`  📄 ${title}`));
              console.log(chalk.gray(`     Status: ${statusColor(status)}`));

              if (options.all) {
                console.log(chalk.gray(`     Created: ${created}`));
                console.log(chalk.gray(`     Updated: ${updated}`));
                console.log(chalk.gray(`     Author: ${author}`));
                console.log(
                  chalk.gray(`     File: ${path.relative(dataDir, filePath)}`)
                );
              }

              console.log('');
            } catch (error) {
              console.log(
                chalk.red(
                  `  ❌ Error reading ${path.basename(filePath)}: ${error}`
                )
              );
            }
          }
        }

        // Summary
        console.log(chalk.blue(`\n📊 Summary:`));
        console.log(chalk.white(`  Total records: ${totalRecords}`));

        if (Object.keys(statusCounts).length > 0) {
          console.log(chalk.white(`  By status:`));
          for (const [status, count] of Object.entries(statusCounts)) {
            const statusColor =
              {
                draft: chalk.yellow,
                proposed: chalk.blue,
                approved: chalk.green,
                active: chalk.green,
                archived: chalk.gray,
              }[status] || chalk.white;

            console.log(chalk.gray(`    ${statusColor(status)}: ${count}`));
          }
        }

        console.log(chalk.green('\n✅ Records listed successfully!'));
      } catch (error) {
        console.error(chalk.red('❌ Failed to list records:'), error);
        process.exit(1);
      }
    });
};
