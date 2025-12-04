import { CAC } from 'cac';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { Logger, TemplateEngine, userCan } from '@civicpress/core';
import * as yaml from 'yaml';
import * as fs from 'fs';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
import { AuthUtils } from '../utils/auth-utils.js';
import {
  cliSuccess,
  cliError,
  cliInfo,
  cliWarn,
  cliStartOperation,
} from '../utils/cli-output.js';

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
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('template');

      // Validate authentication and get civic instance
      const { civic, user } = await AuthUtils.requireAuthWithCivic(
        options.token,
        globalOptions.json
      );
      const dataDir = civic.getDataDir();

      // Check template management permissions
      const canManageTemplates = await userCan(user, 'templates:manage');
      if (!canManageTemplates) {
        cliError(
          'Insufficient permissions to manage templates',
          'PERMISSION_DENIED',
          {
            requiredPermission: 'templates:manage',
            userRole: user.role,
          },
          'template'
        );
        process.exit(1);
      }

      try {
        if (options.init) {
          await initializeDefaultTemplates(dataDir);
        } else if (options.list) {
          await listTemplates(dataDir, globalOptions.json);
        } else if (options.show) {
          await showTemplate(dataDir, options.show);
        } else if (options.create) {
          await createTemplate(dataDir, options.create, options.type);
        } else if (options.validate) {
          await validateTemplate(dataDir, options.validate);
        } else if (options.preview) {
          await previewTemplate(dataDir, options.preview);
        } else if (options.partials) {
          await listPartials(dataDir);
        } else if (options.partial) {
          await showPartial(dataDir, options.partial);
        } else if (options.createPartial) {
          await createPartial(dataDir, options.createPartial);
        } else {
          cliInfo(
            'Template Management Commands:\n' +
              '  civic template --list                    # List all templates\n' +
              '  civic template --show <template>         # Show template details\n' +
              '  civic template --create <name> --type <type>  # Create new template\n' +
              '  civic template --validate <template>     # Validate template\n' +
              '  civic template --preview <template>      # Preview template with sample data\n' +
              '  civic template --init                    # Initialize default templates\n' +
              '\n' +
              'Partial Management Commands:\n' +
              '  civic template --partials               # List available partials\n' +
              '  civic template --partial <name>         # Show partial details\n' +
              '  civic template --create-partial <name>  # Create new partial',
            'template'
          );
        }
      } catch (error) {
        cliError(
          'Template command failed',
          'TEMPLATE_COMMAND_FAILED',
          {
            error: error instanceof Error ? error.message : String(error),
          },
          'template'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });
}

async function initializeDefaultTemplates(dataDir: string) {
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
    }

    cliSuccess(
      {
        templates: createdTemplates,
      },
      `Default templates initialized successfully (${createdTemplates.length} template${createdTemplates.length === 1 ? '' : 's'})`,
      {
        operation: 'template:init',
        templateCount: createdTemplates.length,
      }
    );
  } catch (error) {
    cliError(
      'Error initializing templates',
      'INIT_TEMPLATES_FAILED',
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'template:init'
    );
    throw error;
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
  const templateEngine = new TemplateEngine(dataDir);
  const logger = initializeLogger();

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
            allTemplates.push({
              name: templateName,
              type: type,
              extends: (template as any).extends,
              hasParent: !!(template as any).parentTemplate,
              sections: template.sections?.length || 0,
              requiredFields: template.validation?.required_fields?.length || 0,
            });
          }
        } catch {
          // Skip templates that can't be loaded
          continue;
        }
      }
    }

    if (shouldOutputJson) {
      cliSuccess(
        {
          templates: allTemplates,
          summary: {
            totalTemplates: allTemplates.length,
            types: recordTypes,
          },
        },
        `Found ${allTemplates.length} template${allTemplates.length === 1 ? '' : 's'}`,
        {
          operation: 'template:list',
          templateCount: allTemplates.length,
        }
      );
    } else if (allTemplates.length === 0) {
      logger.warn(
        '�� No templates found. Run "civic template --init" to create default templates.'
      );
    }
  } catch (error) {
    if (shouldOutputJson) {
      cliError(
        'Error listing templates',
        'LIST_TEMPLATES_FAILED',
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'template:list'
      );
      throw error;
    } else {
      logger.error('❌ Error listing templates:', error);
    }
  }
}

async function showTemplate(dataDir: string, templateName: string) {
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
      cliError(
        `Template not found: ${templateName}`,
        'TEMPLATE_NOT_FOUND',
        { templateName },
        'template:show'
      );
      return;
    }

    cliSuccess(
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
      `Template: ${template.name} (${template.type})`,
      {
        operation: 'template:show',
        templateName: template.name,
        templateType: template.type,
      }
    );
  } catch (error) {
    cliError(
      'Error showing template',
      'SHOW_TEMPLATE_FAILED',
      {
        error: error instanceof Error ? error.message : String(error),
        templateName,
      },
      'template:show'
    );
    throw error;
  }
}

async function createTemplate(
  dataDir: string,
  templateName: string,
  recordType?: string
) {
  const templatesDir = join(dataDir, '.civic', 'templates');
  const templatePath = join(templatesDir, `${templateName}.yml`);

  try {
    // Ensure templates directory exists
    await mkdir(templatesDir, { recursive: true });

    if (fs.existsSync(templatePath)) {
      cliError(
        `Template already exists: ${templateName}`,
        'TEMPLATE_EXISTS',
        { templateName, path: templatePath },
        'template:create'
      );
      return;
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

    cliSuccess(
      {
        template: {
          name: templateName,
          type: recordType || 'custom',
          path: templatePath,
        },
      },
      `Created template: ${templateName}`,
      {
        operation: 'template:create',
        templateName,
        templateType: recordType || 'custom',
      }
    );
  } catch (error) {
    cliError(
      'Error creating template',
      'CREATE_TEMPLATE_FAILED',
      {
        error: error instanceof Error ? error.message : String(error),
        templateName,
      },
      'template:create'
    );
    throw error;
  }
}

async function validateTemplate(dataDir: string, templateName: string) {
  const templatePath = join(
    dataDir,
    '.civic',
    'templates',
    `${templateName}.yml`
  );

  try {
    if (!fs.existsSync(templatePath)) {
      cliError(
        `Template not found: ${templateName}`,
        'TEMPLATE_NOT_FOUND',
        { templateName },
        'template:validate'
      );
      return;
    }

    const templateContent = await readFile(templatePath, 'utf-8');
    const template = yaml.parse(templateContent) as LegacyTemplate;

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

    if (errors.length === 0 && warnings.length === 0) {
      cliSuccess(
        {
          template: templateName,
          isValid: true,
          errors,
          warnings,
        },
        `Template '${templateName}' is valid`,
        {
          operation: 'template:validate',
          templateName,
        }
      );
    } else if (errors.length === 0) {
      cliWarn(
        `Template '${templateName}' is valid but has ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`,
        'template:validate'
      );
    } else {
      cliError(
        `Template '${templateName}' has ${errors.length} error${errors.length === 1 ? '' : 's'}${warnings.length > 0 ? ` and ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : ''}`,
        'VALIDATION_FAILED',
        {
          template: templateName,
          isValid: false,
          errors,
          warnings,
          summary: {
            totalErrors: errors.length,
            totalWarnings: warnings.length,
          },
        },
        'template:validate'
      );
    }
  } catch (error) {
    cliError(
      'Error validating template',
      'VALIDATE_TEMPLATE_FAILED',
      {
        error: error instanceof Error ? error.message : String(error),
        templateName,
      },
      'template:validate'
    );
    throw error;
  }
}

async function previewTemplate(dataDir: string, templateName: string) {
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
      cliError(
        `Template not found: ${templateName}`,
        'TEMPLATE_NOT_FOUND',
        { templateName },
        'template:preview'
      );
      return;
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

    cliSuccess(
      {
        template: templateName,
        renderedContent,
      },
      `Preview of template: ${template.name}`,
      {
        operation: 'template:preview',
        templateName: template.name,
      }
    );
  } catch (error) {
    cliError(
      'Error previewing template',
      'PREVIEW_TEMPLATE_FAILED',
      {
        error: error instanceof Error ? error.message : String(error),
        templateName,
      },
      'template:preview'
    );
    throw error;
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

async function listPartials(dataDir: string) {
  const templateEngine = new TemplateEngine(dataDir);

  try {
    const partials = templateEngine.listPartials();

    if (partials.length === 0) {
      cliInfo(
        'No partials found. Create your first partial with: civic template --create-partial <name>',
        'template:list-partials'
      );
    } else {
      cliSuccess(
        {
          partials,
          count: partials.length,
        },
        `Found ${partials.length} partial${partials.length === 1 ? '' : 's'}`,
        {
          operation: 'template:list-partials',
          partialCount: partials.length,
        }
      );
    }
  } catch (error) {
    cliError(
      'Error listing partials',
      'LIST_PARTIALS_FAILED',
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'template:list-partials'
    );
    throw error;
  }
}

async function showPartial(dataDir: string, partialName: string) {
  const templateEngine = new TemplateEngine(dataDir);

  try {
    const partial = templateEngine.getPartialDetails(partialName);

    if (!partial) {
      cliError(
        `Partial not found: ${partialName}`,
        'PARTIAL_NOT_FOUND',
        { partialName },
        'template:show-partial'
      );
      return;
    }

    cliSuccess(
      {
        partial: partialName,
        details: partial,
      },
      `Partial: ${partial.name}`,
      {
        operation: 'template:show-partial',
        partialName: partial.name,
      }
    );
  } catch (error) {
    cliError(
      'Error showing partial',
      'SHOW_PARTIAL_FAILED',
      {
        error: error instanceof Error ? error.message : String(error),
        partialName,
      },
      'template:show-partial'
    );
    throw error;
  }
}

async function createPartial(dataDir: string, partialName: string) {
  try {
    const partialsDir = join(dataDir, '.civic', 'partials');
    await mkdir(partialsDir, { recursive: true });

    const partialPath = join(partialsDir, `${partialName}.md`);

    if (fs.existsSync(partialPath)) {
      cliError(
        `Partial already exists: ${partialName}`,
        'PARTIAL_EXISTS',
        { partialName, path: partialPath },
        'template:create-partial'
      );
      return;
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

    cliSuccess(
      {
        partialName,
        path: partialPath,
      },
      `Partial created: ${partialName}`,
      {
        operation: 'template:create-partial',
        partialName,
      }
    );
  } catch (error) {
    cliError(
      'Error creating partial',
      'CREATE_PARTIAL_FAILED',
      {
        error: error instanceof Error ? error.message : String(error),
        partialName,
      },
      'template:create-partial'
    );
    throw error;
  }
}
