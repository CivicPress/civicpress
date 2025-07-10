import { CAC } from 'cac';
import { CivicPress, WorkflowConfigManager } from '@civicpress/core';
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
    .option(
      '--template <template>',
      'Template to use for creation (defaults to type/default)'
    )
    .option('-r, --role <role>', 'Role for the action (clerk, council, etc.)')
    .action(async (type: string, title: string, options: any) => {
      // Initialize logger with global options
      const globalOptions = getGlobalOptionsFromArgs();
      const logger = initializeLogger();

      // Check if we should output JSON
      const shouldOutputJson = globalOptions.json;

      try {
        if (!shouldOutputJson) {
          logger.info(`📝 Creating ${type}: ${title}`);
        }

        // Validate record type
        const validTypes = ['bylaw', 'policy', 'proposal', 'resolution'];
        if (!validTypes.includes(type)) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Invalid record type',
                  details: `Invalid type: ${type}`,
                  validTypes: validTypes,
                },
                null,
                2
              )
            );
          } else {
            logger.error(`❌ Invalid record type: ${type}`);
            logger.info('Valid types: ' + validTypes.join(', '));
          }
          process.exit(1);
        }

        // Initialize CivicPress (will auto-discover config)
        // Get data directory from config discovery
        const { loadConfig } = await import('@civicpress/core');
        const config = await loadConfig();
        if (!config) {
          throw new Error(
            'CivicPress not initialized. Run "civic init" first.'
          );
        }
        const dataDir = config.dataDir;
        const civic = new CivicPress({ dataDir });

        if (!dataDir) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Data directory not found',
                  details: 'Run "civic init" first',
                },
                null,
                2
              )
            );
          } else {
            throw new Error(
              'Data directory not found. Run "civic init" first.'
            );
          }
          process.exit(1);
        }

        // Validate role permissions for creating this record type
        const workflowManager = new WorkflowConfigManager(dataDir);
        const role = options.role || 'unknown';
        const actionValidation = await workflowManager.validateAction(
          'create',
          type,
          role
        );

        if (!actionValidation.valid) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Insufficient permissions',
                  details: actionValidation.reason,
                  data: {
                    action: 'create',
                    recordType: type,
                    role: role,
                  },
                },
                null,
                2
              )
            );
          } else {
            logger.error(
              `❌ Insufficient permissions: ${actionValidation.reason}`
            );
            logger.info(
              `Role '${role}' cannot create records of type '${type}'`
            );
          }
          process.exit(1);
        }

        // Load template
        const coreModule = await import('@civicpress/core');
        const templateEngine = new coreModule.TemplateEngine(dataDir);
        const templateName = options.template || 'default';
        const template = await templateEngine.loadTemplate(type, templateName);

        if (!template) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Template not found',
                  details: `Template ${type}/${templateName} not found`,
                  availableTemplates: templateEngine.listTemplates(type),
                },
                null,
                2
              )
            );
          } else {
            logger.error(`❌ Template ${type}/${templateName} not found`);
            logger.info('Available templates:');
            const templates = templateEngine.listTemplates(type);
            templates.forEach((t: string) => logger.info(`  ${t}`));
          }
          process.exit(1);
        }

        // Create filename from title
        const filename = title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim();
        if (!dataDir) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Data directory not found',
                  details: 'Run "civic init" first',
                },
                null,
                2
              )
            );
          } else {
            throw new Error(
              'Data directory not found. Run "civic init" first.'
            );
          }
          process.exit(1);
        }

        // Create directory structure
        const recordsDir = path.join(dataDir, 'records', type);
        if (!fs.existsSync(recordsDir)) {
          fs.mkdirSync(recordsDir, { recursive: true });
        }

        // Create the record file
        const filePath = path.join(recordsDir, `${filename}.md`);

        // Create template context
        const context = {
          title: title,
          type: type,
          status: 'draft',
          author: 'system', // TODO: Get from user context
          version: '1.0.0',
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };

        // Process template with context
        const processedContent = templateEngine.generateContent(
          template,
          context
        );

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

        // Combine frontmatter and processed content
        const fullContent = `---\n${yaml.stringify(frontmatter)}---\n${processedContent}`;

        // Handle dry-run modes
        const isCompleteDryRun = options.dryRun;
        const dryRunHooks = options.dryRunHooks
          ? options.dryRunHooks.split(',').map((h: string) => h.trim())
          : [];

        if (isCompleteDryRun) {
          if (!shouldOutputJson) {
            logger.warn(`📋 Would create: ${filePath}`);
            logger.warn(`📋 Would write content: ${title}`);
          }
        } else {
          // Write the file
          fs.writeFileSync(filePath, fullContent);
          if (!shouldOutputJson) {
            logger.success(`📄 Created record: ${filePath}`);
          }
        }

        // Emit record created hook
        const hooks = civic.getHookSystem();

        if (isCompleteDryRun || dryRunHooks.includes('record:created')) {
          if (!shouldOutputJson) {
            logger.warn(`📋 Would fire hook: record:created`);
            logger.debug(`   Record: ${title} (${type})`);
          }
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
          if (!shouldOutputJson) {
            logger.warn(
              `📋 Would commit: "feat(record): create ${type} "${title}""`
            );
            logger.warn(`📋 Would stage: ${filePath}`);
          }
        } else {
          const git = new (await import('@civicpress/core')).GitEngine(dataDir);
          await git.commit(`feat(record): create ${type} "${title}"`, [
            filePath,
          ]);
          if (!shouldOutputJson) {
            logger.success(`💾 Committed to Git`);
          }
        }

        // Emit record committed hook
        if (isCompleteDryRun || dryRunHooks.includes('record:committed')) {
          if (!shouldOutputJson) {
            logger.warn(`📋 Would fire hook: record:committed`);
            logger.debug(`   Record: ${title} (${type})`);
          }
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

        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: true,
                message: `Created ${type}: ${title}`,
                data: {
                  type: type,
                  title: title,
                  filename: filename,
                  filePath: filePath,
                  status: 'draft',
                  template: templateName,
                  templatePath: `${type}/${templateName}`,
                  dryRun: isCompleteDryRun,
                  hooksFired: !isCompleteDryRun && dryRunHooks.length === 0,
                },
              },
              null,
              2
            )
          );
        } else {
          logger.success(`✅ Created ${type}: ${title}`);
          logger.info(`📁 Location: ${filePath}`);
          logger.info(`📋 Template: ${type}/${templateName}`);
        }
      } catch (error) {
        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: false,
                error: 'Failed to create record',
                details: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            )
          );
        } else {
          logger.error('❌ Failed to create record:', error);
        }
        process.exit(1);
      }
    });
};
