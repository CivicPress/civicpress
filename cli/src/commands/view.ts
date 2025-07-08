import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress } from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';

export const viewCommand = (cli: CAC) => {
  cli
    .command('view <record>', 'View a specific civic record')
    .option('-r, --raw', 'Show raw markdown content')
    .action(async (recordName: string, options: any) => {
      try {
        console.log(chalk.blue(`📖 Viewing record: ${recordName}`));

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
          console.log(chalk.red(`❌ Record "${recordName}" not found.`));
          console.log(chalk.blue('Available records:'));

          // List available records
          for (const type of recordTypes) {
            const typeDir = path.join(recordsDir, type);
            const files = fs
              .readdirSync(typeDir)
              .filter((file) => file.endsWith('.md'))
              .map((file) => path.basename(file, '.md'));

            if (files.length > 0) {
              console.log(chalk.cyan(`  ${type}:`));
              for (const file of files) {
                console.log(chalk.gray(`    ${file}`));
              }
            }
          }
          return;
        }

        // Read and parse the record
        const content = fs.readFileSync(recordPath, 'utf8');
        const { data: frontmatter, content: markdownContent } = matter(content);

        // Display record information
        console.log(chalk.cyan('\n' + '='.repeat(60)));
        console.log(
          chalk.white.bold(
            `📄 ${frontmatter.title || path.basename(recordPath, '.md')}`
          )
        );
        console.log(chalk.cyan('='.repeat(60)));

        // Metadata section
        console.log(chalk.blue('\n📋 Metadata:'));
        console.log(chalk.gray('─'.repeat(40)));

        const statusColors: Record<string, any> = {
          draft: chalk.yellow,
          proposed: chalk.blue,
          approved: chalk.green,
          active: chalk.green,
          archived: chalk.gray,
        };
        const statusColor = statusColors[frontmatter.status] || chalk.white;

        console.log(chalk.white(`  Type: ${chalk.cyan(recordType)}`));
        console.log(
          chalk.white(`  Status: ${statusColor(frontmatter.status || 'draft')}`)
        );
        console.log(
          chalk.white(
            `  Created: ${frontmatter.created ? new Date(frontmatter.created).toLocaleString() : 'unknown'}`
          )
        );
        console.log(
          chalk.white(
            `  Updated: ${frontmatter.updated ? new Date(frontmatter.updated).toLocaleString() : 'unknown'}`
          )
        );
        console.log(
          chalk.white(`  Author: ${frontmatter.author || 'unknown'}`)
        );
        console.log(
          chalk.white(`  Version: ${frontmatter.version || '1.0.0'}`)
        );
        console.log(
          chalk.white(`  File: ${path.relative(dataDir, recordPath)}`)
        );

        // Content section
        console.log(chalk.blue('\n📝 Content:'));
        console.log(chalk.gray('─'.repeat(40)));

        if (options.raw) {
          // Show raw markdown
          console.log(chalk.gray(markdownContent));
        } else {
          // Show formatted content (basic markdown rendering)
          const lines = markdownContent.split('\n');
          for (const line of lines) {
            if (line.startsWith('# ')) {
              console.log(chalk.white.bold(line.substring(2)));
            } else if (line.startsWith('## ')) {
              console.log(chalk.cyan.bold(line.substring(3)));
            } else if (line.startsWith('### ')) {
              console.log(chalk.blue.bold(line.substring(4)));
            } else if (line.startsWith('- ') || line.startsWith('* ')) {
              console.log(chalk.gray(`  ${line}`));
            } else if (line.trim() === '') {
              console.log('');
            } else {
              console.log(chalk.white(line));
            }
          }
        }

        console.log(chalk.cyan('\n' + '='.repeat(60)));
        console.log(chalk.green('✅ Record displayed successfully!'));
      } catch (error) {
        console.error(chalk.red('❌ Failed to view record:'), error);
        process.exit(1);
      }
    });
};
