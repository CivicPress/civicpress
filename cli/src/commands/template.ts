import { CAC } from 'cac';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join, extname } from 'path';
import { loadConfig, getLogger } from '@civicpress/core';
import chalk from 'chalk';
import * as fs from 'fs';
import * as yaml from 'yaml';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';

interface Template {
  name: string;
  type: string;
  description: string;
  metadata: Record<string, any>;
  content: string;
  validation: ValidationRules;
}

interface ValidationRules {
  required: string[];
  optional: string[];
  formats?: Record<string, string>;
  content?: {
    minLength?: number;
    maxLength?: number;
    sections?: string[];
  };
}

export function registerTemplateCommand(cli: CAC) {
  cli
    .command('template', 'Manage record templates')
    .option('-l, --list', 'List all available templates')
    .option('-s, --show <template>', 'Show template details')
    .option('-c, --create <name>', 'Create a new template')
    .option('-v, --validate <template>', 'Validate a template')
    .option('--type <type>', 'Record type for new template')
    .option('--init', 'Initialize default templates')
    .action(async (options: any) => {
      try {
        // Initialize logger with global options
        const globalOptions = getGlobalOptionsFromArgs();
        initializeLogger(globalOptions);
        const logger = getLogger();

        const config = await loadConfig();
        if (!config) {
          logger.error(
            '❌ No CivicPress configuration found. Run "civic init" first.'
          );
          process.exit(1);
        }

        // Check if we should output JSON
        const shouldOutputJson = globalOptions.json;

        if (options.init) {
          await initializeDefaultTemplates(config.dataDir, shouldOutputJson);
        } else if (options.list) {
          await listTemplates(config.dataDir, shouldOutputJson);
        } else if (options.show) {
          await showTemplate(config.dataDir, options.show, shouldOutputJson);
        } else if (options.create) {
          await createTemplate(
            config.dataDir,
            options.create,
            options.type,
            shouldOutputJson
          );
        } else if (options.validate) {
          await validateTemplate(
            config.dataDir,
            options.validate,
            shouldOutputJson
          );
        } else {
          logger.info('📋 Template Management Commands:');
          logger.info(
            '  civic template --list                    # List all templates'
          );
          logger.info(
            '  civic template --show <template>         # Show template details'
          );
          logger.info(
            '  civic template --create <name> --type <type>  # Create new template'
          );
          logger.info(
            '  civic template --validate <template>     # Validate template'
          );
          logger.info(
            '  civic template --init                    # Initialize default templates'
          );
        }
      } catch (error) {
        const logger = getLogger();
        logger.error('❌ Template command failed:', error);
        process.exit(1);
      }
    });
}

async function initializeDefaultTemplates(
  dataDir: string,
  shouldOutputJson?: boolean
) {
  const templatesDir = join(dataDir, '.civic', 'templates');

  try {
    // Create templates directory
    await mkdir(templatesDir, { recursive: true });

    // Create default templates
    const defaultTemplates = getDefaultTemplates();

    const createdTemplates: string[] = [];
    for (const template of defaultTemplates) {
      const templatePath = join(templatesDir, `${template.name}.yml`);
      const templateContent = yaml.stringify(template);
      await writeFile(templatePath, templateContent);
      createdTemplates.push(template.name);
      const logger = getLogger();
      if (!shouldOutputJson) {
        logger.info(`✅ Created template: ${template.name}`);
      }
    }

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            success: true,
            message: 'Default templates initialized successfully',
            templates: createdTemplates,
          },
          null,
          2
        )
      );
    } else {
      const logger = getLogger();
      logger.info('\n🎉 Default templates initialized successfully!');
    }
  } catch (error) {
    const logger = getLogger();
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            success: false,
            error: 'Error initializing templates',
            details: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      );
    } else {
      logger.error('❌ Error initializing templates:', error);
    }
  }
}

function getDefaultTemplates(): Template[] {
  return [
    {
      name: 'policy',
      type: 'policy',
      description:
        'Standard policy template with sections for description, content, and references',
      metadata: {
        title: '',
        type: 'policy',
        status: 'draft',
        author: '',
        version: '1.0.0',
      },
      content: `# {{title}}

## Description

[Add policy description here]

## Purpose

[Explain the purpose and scope of this policy]

## Policy Statement

[State the policy clearly and concisely]

## Implementation

[Describe how this policy will be implemented]

## Compliance

[Outline compliance requirements and monitoring]

## References

[Add relevant references, laws, or related documents]

## Review Schedule

[Specify when this policy should be reviewed]`,
      validation: {
        required: ['title', 'type', 'status', 'author'],
        optional: ['version', 'description', 'review_date'],
        content: {
          sections: [
            'Description',
            'Purpose',
            'Policy Statement',
            'Implementation',
            'Compliance',
            'References',
            'Review Schedule',
          ],
        },
      },
    },
    {
      name: 'bylaw',
      type: 'bylaw',
      description:
        'Comprehensive bylaw template with legal structure and enforcement details',
      metadata: {
        title: '',
        type: 'bylaw',
        status: 'draft',
        author: '',
        version: '1.0.0',
      },
      content: `# {{title}}

## Preamble

[Add preamble or background information]

## Definitions

[Define key terms used in this bylaw]

## Scope and Application

[Specify what this bylaw applies to and who it affects]

## Requirements

[Detail the specific requirements and obligations]

## Enforcement

[Describe how this bylaw will be enforced]

## Penalties

[Outline penalties for non-compliance]

## Appeals Process

[Describe the appeals process if applicable]

## Effective Date

[Specify when this bylaw takes effect]

## References

[Add references to related laws or documents]`,
      validation: {
        required: ['title', 'type', 'status', 'author'],
        optional: ['version', 'effective_date', 'review_date'],
        content: {
          sections: [
            'Preamble',
            'Definitions',
            'Scope and Application',
            'Requirements',
            'Enforcement',
            'Penalties',
            'Appeals Process',
            'Effective Date',
            'References',
          ],
        },
      },
    },
    {
      name: 'resolution',
      type: 'resolution',
      description: 'Resolution template for formal decisions and declarations',
      metadata: {
        title: '',
        type: 'resolution',
        status: 'draft',
        author: '',
        version: '1.0.0',
      },
      content: `# {{title}}

## Background

[Provide background context for this resolution]

## Whereas

[State the premises and reasoning]

## Be It Resolved

[State the resolution clearly]

## Implementation

[Describe how this resolution will be implemented]

## Timeline

[Specify timeline for implementation]

## Budget Impact

[Describe any budget implications]

## Monitoring

[Outline how progress will be monitored]

## References

[Add relevant references or supporting documents]`,
      validation: {
        required: ['title', 'type', 'status', 'author'],
        optional: ['version', 'effective_date', 'budget_impact'],
        content: {
          sections: [
            'Background',
            'Whereas',
            'Be It Resolved',
            'Implementation',
            'Timeline',
            'Budget Impact',
            'Monitoring',
            'References',
          ],
        },
      },
    },
    {
      name: 'ordinance',
      type: 'ordinance',
      description:
        'Municipal ordinance template with legal structure and enforcement',
      metadata: {
        title: '',
        type: 'ordinance',
        status: 'draft',
        author: '',
        version: '1.0.0',
      },
      content: `# {{title}}

## Purpose

[State the purpose of this ordinance]

## Definitions

[Define terms used in this ordinance]

## Applicability

[Specify what and who this ordinance applies to]

## Requirements

[Detail the specific requirements]

## Prohibitions

[List what is prohibited under this ordinance]

## Enforcement

[Describe enforcement mechanisms]

## Penalties

[Specify penalties for violations]

## Appeals

[Describe appeals process]

## Effective Date

[Specify when this ordinance takes effect]

## References

[Add references to related laws or regulations]`,
      validation: {
        required: ['title', 'type', 'status', 'author'],
        optional: ['version', 'effective_date', 'sunset_date'],
        content: {
          sections: [
            'Purpose',
            'Definitions',
            'Applicability',
            'Requirements',
            'Prohibitions',
            'Enforcement',
            'Penalties',
            'Appeals',
            'Effective Date',
            'References',
          ],
        },
      },
    },
  ];
}

async function listTemplates(dataDir: string, shouldOutputJson?: boolean) {
  const logger = getLogger();
  const templatesDir = join(dataDir, '.civic', 'templates');

  try {
    if (!fs.existsSync(templatesDir)) {
      if (shouldOutputJson) {
        console.log(
          JSON.stringify(
            {
              error: 'No templates directory found',
              suggestion:
                'Run "civic template --init" to create default templates',
            },
            null,
            2
          )
        );
        return;
      } else {
        logger.warn(
          '📁 No templates directory found. Run "civic template --init" to create default templates.'
        );
        return;
      }
    }

    const files = await readdir(templatesDir);
    const templateFiles = files.filter(
      (file) => file.endsWith('.yml') || file.endsWith('.yaml')
    );

    if (templateFiles.length === 0) {
      if (shouldOutputJson) {
        console.log(
          JSON.stringify(
            {
              error: 'No templates found',
              suggestion:
                'Run "civic template --init" to create default templates',
            },
            null,
            2
          )
        );
        return;
      } else {
        logger.warn(
          '📁 No templates found. Run "civic template --init" to create default templates.'
        );
        return;
      }
    }

    const templates: any[] = [];
    for (const file of templateFiles) {
      const templateName = file.replace(/\.(yml|yaml)$/, '');
      const templatePath = join(templatesDir, file);
      const templateContent = await readFile(templatePath, 'utf-8');
      const template = yaml.parse(templateContent) as Template;

      if (shouldOutputJson) {
        templates.push({
          name: templateName,
          type: template.type,
          description: template.description,
        });
      } else {
        logger.info(`  ${templateName}`);
        logger.info(`    Type: ${template.type}`);
        logger.info(`    Description: ${template.description}`);
        logger.info('');
      }
    }

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            templates,
            summary: {
              totalTemplates: templates.length,
            },
          },
          null,
          2
        )
      );
    }
  } catch (error) {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            error: 'Error listing templates',
            details: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      );
    } else {
      logger.error('❌ Error listing templates:', error);
    }
  }
}

async function showTemplate(
  dataDir: string,
  templateName: string,
  shouldOutputJson?: boolean
) {
  const logger = getLogger();
  const templatePath = join(
    dataDir,
    '.civic',
    'templates',
    `${templateName}.yml`
  );

  try {
    if (!fs.existsSync(templatePath)) {
      if (shouldOutputJson) {
        console.log(
          JSON.stringify(
            {
              error: `Template not found: ${templateName}`,
            },
            null,
            2
          )
        );
        return;
      } else {
        logger.error(`❌ Template not found: ${templateName}`);
        return;
      }
    }

    const templateContent = await readFile(templatePath, 'utf-8');
    const template = yaml.parse(templateContent) as Template;

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            template: {
              name: template.name,
              type: template.type,
              description: template.description,
              metadata: template.metadata,
              content: template.content,
              validation: template.validation,
            },
          },
          null,
          2
        )
      );
    } else {
      logger.info(`📋 Template: ${template.name}`);
      logger.info(`Type: ${template.type}`);
      logger.info(`Description: ${template.description}`);

      logger.info('\n📋 Metadata:');
      logger.info(JSON.stringify(template.metadata, null, 2));

      logger.info('\n📝 Content Template:');
      logger.info(template.content);

      logger.info('\n✅ Validation Rules:');
      logger.info(
        `Required fields: ${template.validation.required.join(', ')}`
      );
      logger.info(
        `Optional fields: ${template.validation.optional.join(', ')}`
      );

      if (template.validation.content?.sections) {
        logger.info(
          `Content sections: ${template.validation.content.sections.join(', ')}`
        );
      }
    }
  } catch (error) {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            error: 'Error showing template',
            details: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      );
    } else {
      logger.error('❌ Error showing template:', error);
    }
  }
}

async function createTemplate(
  dataDir: string,
  templateName: string,
  recordType?: string,
  shouldOutputJson?: boolean
) {
  const logger = getLogger();
  const templatesDir = join(dataDir, '.civic', 'templates');
  const templatePath = join(templatesDir, `${templateName}.yml`);

  try {
    // Ensure templates directory exists
    await mkdir(templatesDir, { recursive: true });

    if (fs.existsSync(templatePath)) {
      if (shouldOutputJson) {
        console.log(
          JSON.stringify(
            {
              error: `Template already exists: ${templateName}`,
            },
            null,
            2
          )
        );
        return;
      } else {
        logger.error(`❌ Template already exists: ${templateName}`);
        return;
      }
    }

    const template: Template = {
      name: templateName,
      type: recordType || 'custom',
      description: `Custom template for ${templateName}`,
      metadata: {
        title: '',
        type: recordType || 'custom',
        status: 'draft',
        author: '',
        version: '1.0.0',
      },
      content: `# {{title}}

## Description

[Add description here]

## Content

[Add content here]

## References

[Add references here]`,
      validation: {
        required: ['title', 'type', 'status', 'author'],
        optional: ['version', 'description'],
      },
    };

    const templateContent = yaml.stringify(template);
    await writeFile(templatePath, templateContent);

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            success: true,
            message: `Created template: ${templateName}`,
            template: {
              name: templateName,
              type: recordType || 'custom',
              path: templatePath,
            },
          },
          null,
          2
        )
      );
    } else {
      logger.info(`✅ Created template: ${templateName}`);
      logger.info(`   Edit ${templatePath} to customize the template`);
    }
  } catch (error) {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            error: 'Error creating template',
            details: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      );
    } else {
      logger.error('❌ Error creating template:', error);
    }
  }
}

async function validateTemplate(
  dataDir: string,
  templateName: string,
  shouldOutputJson?: boolean
) {
  const logger = getLogger();
  const templatePath = join(
    dataDir,
    '.civic',
    'templates',
    `${templateName}.yml`
  );

  try {
    if (!fs.existsSync(templatePath)) {
      if (shouldOutputJson) {
        console.log(
          JSON.stringify(
            {
              error: `Template not found: ${templateName}`,
            },
            null,
            2
          )
        );
        return;
      } else {
        logger.error(`❌ Template not found: ${templateName}`);
        return;
      }
    }

    const templateContent = await readFile(templatePath, 'utf-8');
    const template = yaml.parse(templateContent) as Template;

    if (!shouldOutputJson) {
      logger.info(`🔍 Validating template: ${template.name}`);
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!template.name) errors.push('Missing template name');
    if (!template.type) errors.push('Missing template type');
    if (!template.description) warnings.push('Missing template description');
    if (!template.metadata) errors.push('Missing metadata section');
    if (!template.content) errors.push('Missing content template');
    if (!template.validation) errors.push('Missing validation rules');

    // Check metadata structure
    if (template.metadata) {
      const requiredMetadata = ['title', 'type', 'status', 'author'];
      for (const field of requiredMetadata) {
        if (!(field in template.metadata)) {
          warnings.push(`Missing recommended metadata field: ${field}`);
        }
      }
    }

    // Check validation structure
    if (template.validation) {
      if (!template.validation.required)
        errors.push('Missing required fields in validation');
      if (!template.validation.optional)
        warnings.push('Missing optional fields in validation');
    }

    // Check content template
    if (template.content) {
      if (!template.content.includes('{{title}}')) {
        warnings.push('Content template should include {{title}} placeholder');
      }
    }

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            template: templateName,
            isValid: errors.length === 0,
            errors,
            warnings,
            summary: {
              totalErrors: errors.length,
              totalWarnings: warnings.length,
            },
          },
          null,
          2
        )
      );
    } else {
      // Report results
      if (errors.length === 0 && warnings.length === 0) {
        logger.info('✅ Template is valid!');
      } else {
        if (errors.length > 0) {
          logger.error('❌ Validation errors:');
          errors.forEach((error) => logger.error(`  - ${error}`));
        }
        if (warnings.length > 0) {
          logger.warn('⚠️  Validation warnings:');
          warnings.forEach((warning) => logger.warn(`  - ${warning}`));
        }
      }
    }
  } catch (error) {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            error: 'Error validating template',
            details: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      );
    } else {
      logger.error('❌ Error validating template:', error);
    }
  }
}

// Export for testing
export {
  initializeDefaultTemplates,
  getDefaultTemplates,
  listTemplates,
  showTemplate,
  createTemplate,
  validateTemplate,
};
