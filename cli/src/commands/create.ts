import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress } from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import * as matter from 'gray-matter';

export const createCommand = (cli: CAC) => {
  cli
    .command('create <type> <title>', 'Create a new civic record')
    .action(async (type: string, title: string) => {
      try {
        console.log(chalk.blue(`📝 Creating ${type}: ${title}`));

        // Validate record type
        const validTypes = ['bylaw', 'policy', 'proposal', 'resolution'];
        if (!validTypes.includes(type)) {
          console.error(chalk.red(`❌ Invalid record type: ${type}`));
          console.log(chalk.blue('Valid types:'), validTypes.join(', '));
          process.exit(1);
        }

        // Initialize CivicPress
        const civic = new CivicPress();

        // Create filename from title
        const filename = title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim();

        // Create directory structure
        const recordsDir = path.join('.civic', 'records', type);
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

        // Combine frontmatter and content
        const fullContent = matter.stringify(content, frontmatter);

        // Write the file
        fs.writeFileSync(filePath, fullContent);
        console.log(chalk.green(`📄 Created record: ${filePath}`));

        // Stage in Git
        const git = civic.getGitEngine();
        await git.commit(`feat(record): create ${type} "${title}"`, [filePath]);
        console.log(chalk.green(`💾 Committed to Git`));

        console.log(chalk.green(`✅ Created ${type}: ${title}`));
        console.log(chalk.blue(`📁 Location: ${filePath}`));
      } catch (error) {
        console.error(chalk.red('❌ Failed to create record:'), error);
        process.exit(1);
      }
    });
};
