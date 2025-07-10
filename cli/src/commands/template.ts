import { CAC } from 'cac';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { Logger, TemplateEngine, userCan } from '@civicpress/core';
import * as yaml from 'yaml';
import * as fs from 'fs';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';
import { AuthUtils } from '../utils/auth-utils.js';

interface LegacyTemplate {
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
    .option('--token <token>', 'Session token for authentication')
    .option('-l, --list', 'List all available templates')
    .option('-s, --show <template>', 'Show template details')
    .option('-c, --create <name>', 'Create a new template')
    .option('-v, --validate <template>', 'Validate a template')
    .option('--type <type>', 'Record type for new template')
    .option('--init', 'Initialize default templates')
    .option('--preview <template>', 'Preview template with sample variables')
    .option('--partials', 'List available partials')
    .option('--partial <name>', 'Show partial details')
    .option('--create-partial <name>', 'Create a new partial')
    .action(async (options: any) => {
      // Initialize logger with global options
      const globalOptions = getGlobalOptionsFromArgs();
      const logger = initializeLogger();
      const shouldOutputJson = globalOptions.json;

      // Validate authentication and get civic instance
      const { civic, user } = await AuthUtils.requireAuthWithCivic(
        options.token,
        shouldOutputJson
      );
      const dataDir = civic.getDataDir();

      // Check template management permissions
      const canManageTemplates = await userCan(user, 'templates:manage');
      if (!canManageTemplates) {
        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: false,
                error: 'Insufficient permissions',
                details: 'You do not have permission to manage templates',
                requiredPermission: 'templates:manage',
                userRole: user.role,
              },
              null,
              2
            )
          );
        } else {
          logger.error('❌ Insufficient permissions to manage templates');
          logger.info(`Role '${user.role}' cannot manage templates`);
        }
        process.exit(1);
      }

      try {
        if (options.init) {
          await initializeDefaultTemplates(dataDir, shouldOutputJson);
        } else if (options.list) {
          await listTemplates(dataDir, shouldOutputJson);
        } else if (options.show) {
          await showTemplate(dataDir, options.show, shouldOutputJson);
        } else if (options.create) {
          await createTemplate(
            dataDir,
            options.create,
            options.type,
            shouldOutputJson
          );
        } else if (options.validate) {
          await validateTemplate(dataDir, options.validate, shouldOutputJson);
        } else if (options.preview) {
          await previewTemplate(dataDir, options.preview, shouldOutputJson);
        } else if (options.partials) {
          await listPartials(dataDir, shouldOutputJson);
        } else if (options.partial) {
          await showPartial(dataDir, options.partial, shouldOutputJson);
        } else if (options.createPartial) {
          await createPartial(dataDir, options.createPartial, shouldOutputJson);
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
            '  civic template --preview <template>      # Preview template with sample data'
          );
          logger.info(
            '  civic template --init                    # Initialize default templates'
          );
          logger.info('');
          logger.info('📋 Partial Management Commands:');
          logger.info(
            '  civic template --partials               # List available partials'
          );
          logger.info(
            '  civic template --partial <name>         # Show partial details'
          );
          logger.info(
            '  civic template --create-partial <name>  # Create new partial'
          );
        }
      } catch (error) {
        logger.error('❌ Template command failed:', error);
        process.exit(1);
      }
    });
}

async function initializeDefaultTemplates(
  dataDir: string,
  shouldOutputJson?: boolean
) {
  const logger = initializeLogger();
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
      logger.info('\n🎉 Default templates initialized successfully!');
    }
  } catch (error) {
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

function getDefaultTemplates(): LegacyTemplate[] {
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
  const logger = initializeLogger();
  const templateEngine = new TemplateEngine(dataDir);

  try {
    const recordTypes = ['bylaw', 'policy', 'proposal', 'resolution'];
    const allTemplates: any[] = [];

    for (const type of recordTypes) {
      const templates = templateEngine.listTemplates(type);

      for (const templateName of templates) {
        try {
          const template = await templateEngine.loadTemplate(
            type,
            templateName
          );
          if (template) {
            if (shouldOutputJson) {
              allTemplates.push({
                name: templateName,
                type: type,
                extends: (template as any).extends,
                hasParent: !!(template as any).parentTemplate,
                sections: template.sections?.length || 0,
                requiredFields:
                  template.validation?.required_fields?.length || 0,
              });
            } else {
              logger.info(`  ${type}/${templateName}`);
              if ((template as any).extends) {
                logger.info(`    Extends: ${(template as any).extends}`);
              }
              if ((template as any).parentTemplate) {
                logger.info(
                  `    Inherits from: ${(template as any).parentTemplate.name}`
                );
              }
              logger.info(`    Sections: ${template.sections?.length || 0}`);
              logger.info(
                `    Required fields: ${template.validation?.required_fields?.length || 0}`
              );
              logger.info('');
            }
          }
        } catch {
          // Skip templates that can't be loaded
          continue;
        }
      }
    }

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            templates: allTemplates,
            summary: {
              totalTemplates: allTemplates.length,
              types: recordTypes,
            },
          },
          null,
          2
        )
      );
    } else if (allTemplates.length === 0) {
      logger.warn(
        '�� No templates found. Run "civic template --init" to create default templates.'
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
  const logger = initializeLogger();
  const templateEngine = new TemplateEngine(dataDir);

  try {
    // Parse template name to get type and name
    const parts = templateName.split('/');
    let type: string;
    let name: string;

    if (parts.length === 2) {
      [type, name] = parts;
    } else {
      // Default to bylaw if no type specified
      type = 'bylaw';
      name = templateName;
    }

    const template = await templateEngine.loadTemplate(type, name);

    if (!template) {
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

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            template: {
              name: template.name,
              type: template.type,
              extends: (template as any).extends,
              hasParent: !!(template as any).parentTemplate,
              sections: template.sections,
              validation: template.validation,
              content: template.content,
            },
          },
          null,
          2
        )
      );
    } else {
      logger.info(`📋 Template: ${template.name}`);
      logger.info(`Type: ${template.type}`);
      if ((template as any).extends) {
        logger.info(`Extends: ${(template as any).extends}`);
      }
      if ((template as any).parentTemplate) {
        logger.info(`Inherits from: ${(template as any).parentTemplate.name}`);
      }

      logger.info('\n📝 Content Template:');
      logger.info(template.content);

      logger.info('\n✅ Validation Rules:');
      logger.info(
        `Required fields: ${template.validation.required_fields?.join(', ') || 'none'}`
      );
      logger.info(
        `Status values: ${template.validation.status_values?.join(', ') || 'none'}`
      );
      logger.info(
        `Business rules: ${template.validation.business_rules?.length || 0}`
      );
      logger.info(
        `Advanced rules: ${(template.validation as any).advanced_rules?.length || 0}`
      );
      logger.info(
        `Field relationships: ${(template.validation as any).field_relationships?.length || 0}`
      );
      logger.info(
        `Custom validators: ${(template.validation as any).custom_validators?.length || 0}`
      );
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
  const logger = new Logger();
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

    const template: LegacyTemplate = {
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
  const logger = initializeLogger();
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
    const template = yaml.parse(templateContent) as LegacyTemplate;

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

async function previewTemplate(
  dataDir: string,
  templateName: string,
  shouldOutputJson?: boolean
) {
  const logger = initializeLogger();
  const templateEngine = new TemplateEngine(dataDir);

  try {
    // Parse template name to get type and name
    const parts = templateName.split('/');
    let type: string;
    let name: string;

    if (parts.length === 2) {
      [type, name] = parts;
    } else {
      // Default to bylaw if no type specified
      type = 'bylaw';
      name = templateName;
    }

    const template = await templateEngine.loadTemplate(type, name);

    if (!template) {
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

    if (!shouldOutputJson) {
      logger.info(`🔍 Previewing template: ${template.name}`);
    }

    const sampleVariables: Record<string, any> = {
      title: 'My Record Title',
      description: 'This is a description for a sample record.',
      content: 'This is the content of a sample record.',
      author: 'John Doe',
      version: '1.0.0',
      effective_date: '2023-10-27',
      review_date: '2024-10-27',
      budget_impact: 'No significant impact',
      status: 'draft',
      type: template.type,
      // Add other relevant sample variables here
    };

    // Use TemplateEngine to process template with partials
    const renderedContent = templateEngine.generateContent(
      template,
      sampleVariables
    );

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            template: templateName,
            renderedContent,
          },
          null,
          2
        )
      );
    } else {
      logger.info(`📄 Preview of ${template.name}:`);
      logger.info(renderedContent);
    }
  } catch (error) {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            error: 'Error previewing template',
            details: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      );
    } else {
      logger.error('❌ Error previewing template:', error);
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
  previewTemplate,
  listPartials,
  showPartial,
  createPartial,
};

async function listPartials(dataDir: string, shouldOutputJson?: boolean) {
  const logger = initializeLogger();
  const templateEngine = new TemplateEngine(dataDir);

  try {
    const partials = templateEngine.listPartials();

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            partials,
            count: partials.length,
          },
          null,
          2
        )
      );
    } else {
      if (partials.length === 0) {
        logger.info('📋 No partials found.');
        logger.info(
          '💡 Create your first partial with: civic template --create-partial <name>'
        );
      } else {
        logger.info(`📋 Available partials (${partials.length}):`);
        partials.forEach((partial: string) => {
          logger.info(`  - ${partial}`);
        });
      }
    }
  } catch (error) {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            error: 'Error listing partials',
            details: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      );
    } else {
      logger.error('❌ Error listing partials:', error);
    }
  }
}

async function showPartial(
  dataDir: string,
  partialName: string,
  shouldOutputJson?: boolean
) {
  const logger = initializeLogger();
  const templateEngine = new TemplateEngine(dataDir);

  try {
    const partial = templateEngine.getPartialDetails(partialName);

    if (!partial) {
      if (shouldOutputJson) {
        console.log(
          JSON.stringify(
            {
              error: `Partial not found: ${partialName}`,
            },
            null,
            2
          )
        );
        return;
      } else {
        logger.error(`❌ Partial not found: ${partialName}`);
        return;
      }
    }

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            partial: partialName,
            details: partial,
          },
          null,
          2
        )
      );
    } else {
      logger.info(`📋 Partial: ${partial.name}`);
      if (partial.description) {
        logger.info(`📝 Description: ${partial.description}`);
      }
      if (partial.parameters && partial.parameters.length > 0) {
        logger.info(`🔧 Parameters: ${partial.parameters.join(', ')}`);
      }
      logger.info(`📄 Content:`);
      logger.info(partial.content);
    }
  } catch (error) {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            error: 'Error showing partial',
            details: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      );
    } else {
      logger.error('❌ Error showing partial:', error);
    }
  }
}

async function createPartial(
  dataDir: string,
  partialName: string,
  shouldOutputJson?: boolean
) {
  const logger = initializeLogger();
  try {
    const partialsDir = join(dataDir, '.civic', 'partials');
    await mkdir(partialsDir, { recursive: true });

    const partialPath = join(partialsDir, `${partialName}.md`);

    if (fs.existsSync(partialPath)) {
      if (shouldOutputJson) {
        console.log(
          JSON.stringify(
            {
              error: `Partial already exists: ${partialName}`,
            },
            null,
            2
          )
        );
        return;
      } else {
        logger.error(`❌ Partial already exists: ${partialName}`);
        return;
      }
    }

    // Create a default partial template
    const defaultPartial = `---
description: "${partialName} partial"
parameters: []
---

# {{title}}

[Add your partial content here]

## Usage

Use this partial in templates with:
\`\`\`
{{> ${partialName} title=document_title}}
\`\`\`

## Parameters

- \`title\`: The title of the document
- Add more parameters as needed

## Example

\`\`\`
{{> ${partialName} title="My Document" author="John Doe"}}
\`\`\`
`;

    await writeFile(partialPath, defaultPartial);

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            success: true,
            message: `Partial created: ${partialName}`,
            path: partialPath,
          },
          null,
          2
        )
      );
    } else {
      logger.info(`✅ Created partial: ${partialName}`);
      logger.info(`📁 Location: ${partialPath}`);
      logger.info(
        '💡 Edit the partial to customize its content and parameters.'
      );
    }
  } catch (error) {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            error: 'Error creating partial',
            details: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      );
    } else {
      logger.error('❌ Error creating partial:', error);
    }
  }
}
