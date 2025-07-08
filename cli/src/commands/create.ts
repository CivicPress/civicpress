import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress, getLogger } from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';

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
        // Initialize logger with global options
        const globalOptions = getGlobalOptionsFromArgs();
        initializeLogger(globalOptions);
        const logger = getLogger();

        logger.info(`📝 Creating ${type}: ${title}`);

        // Validate record type
        const validTypes = ['bylaw', 'policy', 'proposal', 'resolution'];
        if (!validTypes.includes(type)) {
          logger.error(`❌ Invalid record type: ${type}`);
          logger.info('Valid types: ' + validTypes.join(', '));
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
          logger.warn(`📋 Would create: ${filePath}`);
          logger.warn(`📋 Would write content: ${title}`);
        } else {
          // Write the file
          fs.writeFileSync(filePath, fullContent);
          logger.success(`📄 Created record: ${filePath}`);
        }

        // Emit record created hook
        const hooks = civic.getHookSystem();

        if (isCompleteDryRun || dryRunHooks.includes('record:created')) {
          logger.warn(`📋 Would fire hook: record:created`);
          logger.debug(`   Record: ${title} (${type})`);
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
          logger.warn(
            `📋 Would commit: "feat(record): create ${type} "${title}""`
          );
          logger.warn(`📋 Would stage: ${filePath}`);
        } else {
          const git = new (await import('@civicpress/core')).GitEngine(dataDir);
          await git.commit(`feat(record): create ${type} "${title}"`, [
            filePath,
          ]);
          logger.success(`💾 Committed to Git`);
        }

        // Emit record committed hook
        if (isCompleteDryRun || dryRunHooks.includes('record:committed')) {
          logger.warn(`📋 Would fire hook: record:committed`);
          logger.debug(`   Record: ${title} (${type})`);
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

        logger.success(`✅ Created ${type}: ${title}`);
        logger.info(`📁 Location: ${filePath}`);
      } catch (error) {
        const logger = getLogger();
        logger.error('❌ Failed to create record:', error);
        process.exit(1);
      }
    });
};
