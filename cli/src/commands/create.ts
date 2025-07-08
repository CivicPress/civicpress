import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress } from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

export const createCommand = (cli: CAC) => {
  cli
    .command('create <type> <title>', 'Create a new civic record')
    .option('--dry-run', 'Complete dry-run (no files created, no commits)')
    .option(
      '--dry-run-hooks <hooks>',
      'Dry-run specific hooks (comma-separated)'
    )
    .action(async (type: string, title: string, options: any) => {
      try {
        console.log(chalk.blue(`📝 Creating ${type}: ${title}`));

        // Validate record type
        const validTypes = ['bylaw', 'policy', 'proposal', 'resolution'];
        if (!validTypes.includes(type)) {
          console.error(chalk.red(`❌ Invalid record type: ${type}`));
          console.log(chalk.blue('Valid types:'), validTypes.join(', '));
          process.exit(1);
        }

        // Initialize CivicPress (will auto-discover config)
        const civic = new CivicPress();

        // Create filename from title
        const filename = title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim();

        // Get data directory from core
        const dataDir = civic.getCore().getDataDir();
        if (!dataDir) {
          throw new Error('Data directory not found. Run "civic init" first.');
        }

        // Create directory structure
        const recordsDir = path.join(dataDir, 'records', type);
        if (!fs.existsSync(recordsDir)) {
          fs.mkdirSync(recordsDir, { recursive: true });
        }

        // Create the record file
        const filePath = path.join(recordsDir, `${filename}.md`);

        // Create YAML frontmatter
        const frontmatter = {
          title: title,
          type: type,
          status: 'draft',
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          author: 'system', // TODO: Get from user context
          version: '1.0.0',
        };

        // Create markdown content
        const content = `# ${title}

## Description

[Add description here]

## Content

[Add content here]

## References

[Add references here]
`;

        // Combine frontmatter and content using yaml
        const fullContent = `---\n${yaml.stringify(frontmatter)}---\n${content}`;

        // Handle dry-run modes
        const isCompleteDryRun = options.dryRun;
        const dryRunHooks = options.dryRunHooks
          ? options.dryRunHooks.split(',').map((h: string) => h.trim())
          : [];

        if (isCompleteDryRun) {
          console.log(chalk.yellow(`📋 Would create: ${filePath}`));
          console.log(chalk.yellow(`📋 Would write content: ${title}`));
        } else {
          // Write the file
          fs.writeFileSync(filePath, fullContent);
          console.log(chalk.green(`📄 Created record: ${filePath}`));
        }

        // Emit record created hook
        const hooks = civic.getHookSystem();

        if (isCompleteDryRun || dryRunHooks.includes('record:created')) {
          console.log(chalk.yellow(`📋 Would fire hook: record:created`));
          console.log(chalk.gray(`   Record: ${title} (${type})`));
        } else {
          await hooks.emit('record:created', {
            record: {
              title,
              type,
              status: 'draft',
              path: filePath,
            },
            user: 'system',
          });
        }

        // Stage in Git
        if (isCompleteDryRun) {
          console.log(
            chalk.yellow(
              `📋 Would commit: "feat(record): create ${type} "${title}""`
            )
          );
          console.log(chalk.yellow(`📋 Would stage: ${filePath}`));
        } else {
          const git = new (await import('@civicpress/core')).GitEngine(dataDir);
          await git.commit(`feat(record): create ${type} "${title}"`, [
            filePath,
          ]);
          console.log(chalk.green(`💾 Committed to Git`));
        }

        // Emit record committed hook
        if (isCompleteDryRun || dryRunHooks.includes('record:committed')) {
          console.log(chalk.yellow(`📋 Would fire hook: record:committed`));
          console.log(chalk.gray(`   Record: ${title} (${type})`));
        } else {
          await hooks.emit('record:committed', {
            record: {
              title,
              type,
              status: 'draft',
              path: filePath,
            },
            user: 'system',
          });
        }

        console.log(chalk.green(`✅ Created ${type}: ${title}`));
        console.log(chalk.blue(`📁 Location: ${filePath}`));
      } catch (error) {
        console.error(chalk.red('❌ Failed to create record:'), error);
        process.exit(1);
      }
    });
};
