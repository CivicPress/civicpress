import { CAC } from 'cac';
import {
  WorkflowConfigManager,
  userCan,
  RecordParser,
  RecordData,
  RecordSchemaValidator,
  getRecordYear,
} from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
import { AuthUtils } from '../utils/auth-utils.js';
import matter from 'gray-matter';
import {
  cliSuccess,
  cliError,
  cliInfo,
  cliWarn,
  cliStartOperation,
} from '../utils/cli-output.js';

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
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('create');

      // Validate authentication
      const { civic, user } = await AuthUtils.requireAuthWithCivic(
        options.token,
        globalOptions.json
      );
      const coreMod: any = await import('@civicpress/core');
      const audit = new coreMod.AuditLogger();
      // Get data directory from civic instance
      const dataDir = civic.getDataDir();

      // Check create permissions
      const canCreate = await userCan(user, 'records:create');
      if (!canCreate) {
        cliError(
          'Insufficient permissions to create records',
          'PERMISSION_DENIED',
          {
            requiredPermission: 'records:create',
            userRole: user.role,
          },
          'create'
        );
        process.exit(1);
      }

      try {
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
          cliError(
            `Invalid record type: ${type}`,
            'INVALID_RECORD_TYPE',
            {
              requestedType: type,
              validTypes,
            },
            'create'
          );
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
          cliError(
            `Insufficient permissions: ${actionValidation.reason}`,
            'PERMISSION_DENIED',
            {
              action: 'create',
              recordType: type,
              role,
            },
            'create'
          );
          process.exit(1);
        }

        // Load template
        const coreModule = await import('@civicpress/core');
        const templateEngine = new coreModule.TemplateEngine(dataDir);
        const templateName = options.template || 'default';
        const template = await templateEngine.loadTemplate(type, templateName);

        if (!template) {
          const availableTemplates = templateEngine.listTemplates(type);
          cliError(
            `Template ${type}/${templateName} not found`,
            'TEMPLATE_NOT_FOUND',
            {
              templateName: `${type}/${templateName}`,
              availableTemplates,
            },
            'create'
          );
          process.exit(1);
        }

        // Create filename from title
        const filename = title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim();

        const createdAt = new Date().toISOString();
        const recordYear = getRecordYear(createdAt);

        // Create directory structure
        const recordsDir = path.join(dataDir, 'records', type, recordYear);
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
          created: createdAt,
          updated: createdAt,
        };

        // Process template with context
        const processedContent = templateEngine.generateContent(
          template,
          context
        );

        // Generate record ID
        const recordId = `record-${Date.now()}`;

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
          created_at: createdAt,
          updated_at: createdAt,
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

          cliError(
            `Schema validation failed: ${errorMessages}`,
            'VALIDATION_FAILED',
            {
              errors: schemaValidation.errors,
            },
            'create'
          );
          process.exit(1);
        }

        // Log schema validation warnings if any
        if (schemaValidation.warnings.length > 0) {
          cliWarn(
            `Schema validation warnings: ${schemaValidation.warnings.map((w) => `${w.field}: ${w.message}`).join('; ')}`,
            'create'
          );
        }

        // Handle dry-run modes
        const isCompleteDryRun = options.dryRun;
        const dryRunHooks = options.dryRunHooks
          ? options.dryRunHooks.split(',').map((h: string) => h.trim())
          : [];

        if (isCompleteDryRun) {
          cliWarn(`Would create: ${filePath}`, 'create');
        } else {
          // Write the file
          fs.writeFileSync(filePath, fullContent);

          // Emit record created hook
          const hooks = civic.getHookSystem();

          if (!dryRunHooks.includes('record:created')) {
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
          const git = new (await import('@civicpress/core')).GitEngine(dataDir);
          await git.initialize();
          await git.commit(`feat(record): create ${type} "${title}"`, [
            filePath,
          ]);

          // Emit record committed hook
          if (!dryRunHooks.includes('record:committed')) {
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
        }

        cliSuccess(
          {
            type,
            title,
            filename,
            filePath,
            status: 'draft',
            template: templateName,
            templatePath: `${type}/${templateName}`,
            dryRun: isCompleteDryRun,
            hooksFired: !isCompleteDryRun && dryRunHooks.length === 0,
          },
          `Created ${type}: ${title}`,
          {
            operation: 'create',
            recordType: type,
            recordTitle: title,
          }
        );
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
        cliError(
          'Failed to create record',
          'CREATE_FAILED',
          {
            error: error instanceof Error ? error.message : String(error),
            type,
            title,
          },
          'create'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });
};
