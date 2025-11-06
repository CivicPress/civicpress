import { CAC } from 'cac';
import {
  WorkflowConfigManager,
  userCan,
  RecordParser,
  RecordData,
  RecordSchemaValidator,
} from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';
import { AuthUtils } from '../utils/auth-utils.js';
import matter from 'gray-matter';

export const createCommand = (cli: CAC) => {
  cli
    .command('create <type> <title>', 'Create a new civic record')
    .option('--token <token>', 'Session token for authentication')
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
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (type: string, title: string, options: any) => {
      // Initialize logger with global options
      const globalOptions = getGlobalOptionsFromArgs();
      const logger = initializeLogger();

      // Check if we should output JSON
      const shouldOutputJson = globalOptions.json;

      // Validate authentication
      const { civic, user } = await AuthUtils.requireAuthWithCivic(
        options.token,
        shouldOutputJson
      );
      const coreMod: any = await import('@civicpress/core');
      const audit = new coreMod.AuditLogger();
      // Get data directory from civic instance
      const dataDir = civic.getDataDir();

      // Check create permissions
      const canCreate = await userCan(user, 'records:create');
      if (!canCreate) {
        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: false,
                error: 'Insufficient permissions',
                details: 'You do not have permission to create records',
                requiredPermission: 'records:create',
                userRole: user.role,
              },
              null,
              2
            )
          );
        } else {
          logger.error('❌ Insufficient permissions to create records');
          logger.info(`Role '${user.role}' cannot create records`);
        }
        process.exit(1);
      }

      try {
        if (!shouldOutputJson) {
          logger.info(`📝 Creating ${type}: ${title}`);
        }

        // Validate record type (includes new types)
        const validTypes = [
          'bylaw',
          'policy',
          'proposal',
          'resolution',
          'proclamation',
          'ordinance',
          'geography',
          'session',
        ];
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

        // Validate role permissions for creating this record type
        const workflowManager = new WorkflowConfigManager(dataDir);
        const role = options.role || user.role;
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

        // Generate record ID
        const recordId = `record-${Date.now()}`;
        const now = new Date().toISOString();

        // Create RecordData object following standard format
        const recordData: RecordData = {
          id: recordId,
          title: title,
          type: type,
          status: 'draft',
          content: processedContent,
          author: user.username,
          authors: [
            {
              name: user.name || user.username,
              username: user.username,
              role: user.role,
              email: user.email,
            },
          ],
          created_at: now,
          updated_at: now,
          metadata: {
            version: '1.0.0',
          },
        };

        // Use RecordParser to serialize to properly formatted markdown
        const fullContent = RecordParser.serializeToMarkdown(recordData);

        // Validate schema before saving (fail fast)
        const { data: frontmatter } = matter(fullContent);
        const schemaValidation = RecordSchemaValidator.validate(
          frontmatter,
          type,
          {
            includeModuleExtensions: true,
            includeTypeExtensions: true,
            strict: false,
          }
        );

        if (!schemaValidation.isValid && schemaValidation.errors.length > 0) {
          const errorMessages = schemaValidation.errors
            .map((err) => `${err.field}: ${err.message}`)
            .join('; ');
          
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Schema validation failed',
                  details: errorMessages,
                  errors: schemaValidation.errors,
                },
                null,
                2
              )
            );
          } else {
            logger.error('❌ Schema validation failed:');
            for (const error of schemaValidation.errors) {
              logger.error(`  ${error.field}: ${error.message}`);
              if (error.suggestion) {
                logger.info(`    💡 ${error.suggestion}`);
              }
            }
          }
          process.exit(1);
        }

        // Log schema validation warnings if any
        if (schemaValidation.warnings.length > 0 && !shouldOutputJson) {
          logger.warn('⚠️  Schema validation warnings:');
          for (const warning of schemaValidation.warnings) {
            logger.warn(`  ${warning.field}: ${warning.message}`);
            if (warning.suggestion) {
              logger.info(`    💡 ${warning.suggestion}`);
            }
          }
        }

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
              `📋 Would commit: feat(record): create ${type} "${title}"`
            );
            logger.warn(`📋 Would stage: ${filePath}`);
          }
        } else {
          const git = new (await import('@civicpress/core')).GitEngine(dataDir);
          await git.initialize();
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
        await audit.log({
          source: 'cli',
          actor: { username: user.username, role: user.role },
          action: 'record_create',
          target: {
            type: 'record',
            name: `${type}/${filename}`,
            path: filePath,
          },
          outcome: 'success',
          metadata: { type, title, dryRun: isCompleteDryRun },
        });
      } catch (error) {
        await audit.log({
          source: 'cli',
          actor: { username: user.username, role: user.role },
          action: 'record_create',
          target: { type: 'record', name: `${type}/${title}` },
          outcome: 'failure',
          message: error instanceof Error ? error.message : String(error),
        });
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
