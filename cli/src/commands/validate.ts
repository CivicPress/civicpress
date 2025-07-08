import { CAC } from 'cac';
import { readFile, readdir } from 'fs/promises';
import { join, extname } from 'path';
import { loadConfig, getLogger, TemplateEngine } from '@civicpress/core';
import chalk from 'chalk';
import * as fs from 'fs';
import matter from 'gray-matter';
import { glob } from 'glob';
import * as yaml from 'yaml';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';

interface ValidationResult {
  record: string;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

export function registerValidateCommand(cli: CAC) {
  cli
    .command('validate [record]', 'Validate records against their templates')
    .option('-a, --all', 'Validate all records')
    .option('-f, --fix', 'Attempt to auto-fix validation issues')
    .option('-s, --strict', 'Treat warnings as errors')
    .option('--format <format>', 'Output format', { default: 'human' })
    .action(async (record: string, options: any) => {
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

        const validateOptions = {
          fix: options.fix || false,
          strict: options.strict || false,
          format: options.format || 'human',
        };

        // Check if we should output JSON
        const shouldOutputJson = globalOptions.json;

        if (options.all) {
          await validateAllRecords(
            config.dataDir,
            validateOptions,
            shouldOutputJson
          );
        } else if (record) {
          await validateSingleRecord(
            config.dataDir,
            record,
            validateOptions,
            shouldOutputJson
          );
        } else {
          logger.info('📋 Validation Commands:');
          logger.info(
            '  civic validate <record>              # Validate a single record'
          );
          logger.info(
            '  civic validate --all                 # Validate all records'
          );
          logger.info(
            '  civic validate --all --fix           # Auto-fix validation issues'
          );
          logger.info(
            '  civic validate --all --strict        # Treat warnings as errors'
          );
          logger.info('  civic validate --all --json          # JSON output');
        }
      } catch (error) {
        const logger = getLogger();
        logger.error('❌ Validation failed:', error);
        process.exit(1);
      }
    });
}

async function validateAllRecords(
  dataDir: string,
  options: any,
  shouldOutputJson?: boolean
) {
  const recordsDir = join(dataDir, 'records');

  try {
    if (!fs.existsSync(recordsDir)) {
      const logger = getLogger();
      if (shouldOutputJson) {
        console.log(
          JSON.stringify({ error: 'No records directory found' }, null, 2)
        );
        return;
      } else {
        logger.warn('📁 No records directory found.');
        return;
      }
    }

    const recordFiles = await glob('**/*.md', { cwd: recordsDir });
    const results: ValidationResult[] = [];

    const logger = getLogger();
    if (!shouldOutputJson) {
      logger.info(`🔍 Validating ${recordFiles.length} record(s)...\n`);
    }

    for (const file of recordFiles) {
      const result = await validateRecord(dataDir, file, options);
      results.push(result);
    }

    displayValidationResults(results, options, shouldOutputJson);
  } catch (error) {
    const logger = getLogger();
    logger.error('❌ Error validating records:', error);
  }
}

async function validateSingleRecord(
  dataDir: string,
  recordPath: string,
  options: any,
  shouldOutputJson?: boolean
) {
  const fullPath = recordPath.endsWith('.md') ? recordPath : `${recordPath}.md`;

  try {
    const result = await validateRecord(dataDir, fullPath, options);
    displayValidationResults([result], options, shouldOutputJson);
  } catch (error) {
    const logger = getLogger();
    logger.error(`❌ Error validating ${recordPath}:`, error);
  }
}

async function validateRecord(
  dataDir: string,
  recordPath: string,
  options: any
): Promise<ValidationResult> {
  const fullPath = join(dataDir, 'records', recordPath);

  if (!fs.existsSync(fullPath)) {
    return {
      record: recordPath,
      isValid: false,
      errors: [
        {
          field: 'file',
          message: 'Record file not found',
          severity: 'error',
        },
      ],
      warnings: [],
      suggestions: [],
    };
  }

  // Load template engine
  const templateEngine = new TemplateEngine(dataDir);

  const content = await readFile(fullPath, 'utf-8');
  const { data: metadata, content: markdownContent } = matter(content);

  const recordType = metadata.type || recordPath.split('/')[0];

  // Try to load the template using the template engine
  let template: any | null = null;
  try {
    // First try to load the specific template if specified in metadata
    const templateName = metadata.template || 'default';
    template = await templateEngine.loadTemplate(recordType, templateName);
  } catch (error) {
    // Fall back to default template
    try {
      template = await templateEngine.loadTemplate(recordType, 'default');
    } catch (fallbackError) {
      // No template found, will do basic validation
    }
  }

  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const suggestions: string[] = [];

  // Use template engine's advanced validation if template is available
  if (template) {
    const validationResult = templateEngine.validateRecord(fullPath, template);

    // Convert template engine validation results to CLI format
    for (const error of validationResult.errors) {
      errors.push({
        field: 'validation',
        message: String(error),
        severity: 'error',
      });
    }

    for (const warning of validationResult.warnings) {
      warnings.push({
        field: 'validation',
        message: String(warning),
      });
    }
  } else {
    // Fall back to basic validation
    validateBasicMetadata(metadata, errors, warnings);
  }

  // Check for common issues
  validateCommonIssues(
    metadata,
    markdownContent,
    errors,
    warnings,
    suggestions
  );

  const isValid = errors.filter((e) => e.severity === 'error').length === 0;
  if (options.strict) {
    // In strict mode, warnings become errors
    warnings.forEach((warning) => {
      errors.push({
        field: warning.field,
        message: warning.message,
        severity: 'error',
      });
    });
  }

  return {
    record: recordPath,
    isValid,
    errors,
    warnings: options.strict ? [] : warnings,
    suggestions,
  };
}

async function loadTemplate(
  dataDir: string,
  recordType: string
): Promise<any | null> {
  try {
    const templateEngine = new TemplateEngine(dataDir);
    const template = await templateEngine.loadTemplate(recordType, 'default');

    if (!template) {
      return null;
    }

    return {
      name: template.name,
      type: template.type,
      description: '',
      metadata: template.validation || {},
      content: template.content,
      validation: {
        required: template.validation?.required_fields || [],
        optional: [],
        formats: {},
        content: {
          minLength: template.validation?.sections?.find(
            (s) => s.name === 'content'
          )?.min_length,
          maxLength: undefined,
          sections: template.validation?.sections?.map((s) => s.name) || [],
        },
      },
    };
  } catch (error) {
    return null;
  }
}

function validateMetadata(
  metadata: Record<string, any>,
  template: any,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  suggestions: string[]
) {
  // Check required fields
  for (const field of template.validation.required) {
    if (!metadata[field] || metadata[field] === '') {
      errors.push({
        field,
        message: `Required field '${field}' is missing or empty`,
        severity: 'error',
      });
    }
  }

  // Check optional fields
  for (const field of template.validation.optional) {
    if (!metadata[field]) {
      warnings.push({
        field,
        message: `Optional field '${field}' is missing`,
        suggestion: `Consider adding a ${field}`,
      });
    }
  }

  // Check field formats
  if (template.validation.formats) {
    for (const [field, format] of Object.entries(template.validation.formats)) {
      const value = (metadata as any)[field];
      if (value !== undefined && value !== null) {
        validateFieldFormat(
          String(value),
          String(format),
          field,
          errors,
          warnings
        );
      }
    }
  }

  // Check status values
  if (metadata.status) {
    const validStatuses = [
      'draft',
      'proposed',
      'approved',
      'active',
      'archived',
      'rejected',
    ];
    if (!validStatuses.includes(metadata.status)) {
      errors.push({
        field: 'status',
        message: `Invalid status '${metadata.status}'. Valid statuses: ${validStatuses.join(', ')}`,
        severity: 'error',
      });
    }
  }

  // Check dates
  if (metadata.created) {
    if (!isValidDate(metadata.created)) {
      errors.push({
        field: 'created',
        message: 'Invalid created date format',
        severity: 'error',
      });
    }
  }

  if (metadata.updated) {
    if (!isValidDate(metadata.updated)) {
      errors.push({
        field: 'updated',
        message: 'Invalid updated date format',
        severity: 'error',
      });
    }
  }
}

function validateContent(
  content: string,
  template: any,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  suggestions: string[]
) {
  if (!template.validation.content) return;

  const contentRules = template.validation.content;

  // Check content length
  if (contentRules.minLength && content.length < contentRules.minLength) {
    errors.push({
      field: 'content',
      message: `Content is too short (${content.length} chars, minimum ${contentRules.minLength})`,
      severity: 'error',
    });
  }

  if (contentRules.maxLength && content.length > contentRules.maxLength) {
    warnings.push({
      field: 'content',
      message: `Content is very long (${content.length} chars, maximum ${contentRules.maxLength})`,
      suggestion: 'Consider breaking into smaller sections',
    });
  }

  // Check for required sections
  if (contentRules.sections) {
    for (const section of contentRules.sections) {
      const sectionRegex = new RegExp(
        `^##\\s*${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'm'
      );
      if (!sectionRegex.test(content)) {
        warnings.push({
          field: 'content',
          message: `Missing recommended section: ${section}`,
          suggestion: `Add a "## ${section}" section`,
        });
      }
    }
  }

  // Check for empty sections
  const sectionMatches = content.match(/^##\s+(.+)$/gm);
  if (sectionMatches) {
    for (const match of sectionMatches) {
      const sectionName = match.replace(/^##\s+/, '');
      const sectionContent = extractSectionContent(content, sectionName);
      if (sectionContent && sectionContent.trim() === '') {
        warnings.push({
          field: 'content',
          message: `Section "${sectionName}" is empty`,
          suggestion: 'Add content to this section or remove it',
        });
      }
    }
  }
}

function validateBasicMetadata(
  metadata: Record<string, any>,
  errors: ValidationError[],
  warnings: ValidationWarning[]
) {
  const basicRequired = ['title', 'type', 'status'];

  for (const field of basicRequired) {
    if (!metadata[field] || metadata[field] === '') {
      errors.push({
        field,
        message: `Required field '${field}' is missing`,
        severity: 'error',
      });
    }
  }

  if (!metadata.author) {
    warnings.push({
      field: 'author',
      message: 'Author field is missing',
      suggestion: 'Add an author field',
    });
  }
}

function validateCommonIssues(
  metadata: Record<string, any>,
  content: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  suggestions: string[]
) {
  // Check for placeholder content
  const placeholders = content.match(/\[.*?\]/g);
  if (placeholders && placeholders.length > 0) {
    warnings.push({
      field: 'content',
      message: `Found ${placeholders.length} placeholder(s) in content`,
      suggestion: 'Replace placeholders with actual content',
    });
  }

  // Check for very short content
  if (content.length < 100) {
    warnings.push({
      field: 'content',
      message: 'Content is very short',
      suggestion: 'Add more detailed content',
    });
  }

  // Check for missing title in content
  if (!content.includes(`# ${metadata.title}`)) {
    warnings.push({
      field: 'content',
      message: 'Content does not start with the record title',
      suggestion: `Start content with "# ${metadata.title}"`,
    });
  }
}

function validateFieldFormat(
  value: any,
  format: string,
  field: string,
  errors: ValidationError[],
  warnings: ValidationWarning[]
) {
  switch (format) {
    case 'email':
      if (!isValidEmail(String(value))) {
        errors.push({
          field,
          message: 'Invalid email format',
          severity: 'error',
        });
      }
      break;
    case 'date':
      if (!isValidDate(String(value))) {
        errors.push({
          field,
          message: 'Invalid date format',
          severity: 'error',
        });
      }
      break;
    case 'url':
      if (!isValidUrl(String(value))) {
        warnings.push({
          field,
          message: 'Invalid URL format',
          suggestion: 'Use a valid URL format (e.g., https://example.com)',
        });
      }
      break;
  }
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidDate(date: string): boolean {
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime());
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function extractSectionContent(
  content: string,
  sectionName: string
): string | null {
  const sectionRegex = new RegExp(
    `^##\\s*${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=^##|$)`,
    'm'
  );
  const match = content.match(sectionRegex);
  return match ? match[1] : null;
}

function displayValidationResults(
  results: ValidationResult[],
  options: any,
  shouldOutputJson?: boolean
) {
  const logger = getLogger();
  const totalRecords = results.length;
  const validRecords = results.filter((r) => r.isValid).length;
  const invalidRecords = totalRecords - validRecords;

  let totalErrors = 0;
  let totalWarnings = 0;

  if (shouldOutputJson) {
    console.log(
      JSON.stringify(
        {
          results,
          summary: {
            totalRecords,
            validRecords,
            invalidRecords,
            totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
            totalWarnings: results.reduce(
              (sum, r) => sum + r.warnings.length,
              0
            ),
          },
        },
        null,
        2
      )
    );
    return;
  }

  // Summary
  logger.info('📊 Validation Summary:');
  logger.info(`  Total records: ${totalRecords}`);
  logger.info(`  Valid records: ${validRecords}`);
  logger.info(`  Invalid records: ${invalidRecords}`);

  // Detailed results
  for (const result of results) {
    if (
      !result.isValid ||
      result.errors.length > 0 ||
      result.warnings.length > 0
    ) {
      logger.info(`\n📄 ${result.record}`);

      if (result.isValid) {
        logger.info('  ✅ Valid');
      } else {
        logger.error('  ❌ Invalid');
      }

      // Show errors
      for (const error of result.errors) {
        logger.error(`    ❌ ${error.field}: ${error.message}`);
        totalErrors++;
      }

      // Show warnings
      for (const warning of result.warnings) {
        logger.warn(`    ⚠️  ${warning.field}: ${warning.message}`);
        if (warning.suggestion) {
          logger.info(`       💡 ${warning.suggestion}`);
        }
        totalWarnings++;
      }

      // Show suggestions
      for (const suggestion of result.suggestions) {
        logger.info(`    💡 ${suggestion}`);
      }
    }
  }

  // Final summary
  logger.info('\n📊 Final Summary:');
  logger.info(`  Total errors: ${totalErrors}`);
  logger.info(`  Total warnings: ${totalWarnings}`);

  if (totalErrors === 0 && totalWarnings === 0) {
    logger.info('\n🎉 All records are valid!');
  } else if (totalErrors === 0) {
    logger.warn(
      '\n⚠️  All records are valid, but there are warnings to address.'
    );
  } else {
    logger.error(
      '\n❌ Some records have validation errors that need to be fixed.'
    );
  }
}

// Export for testing
export { validateRecord, validateAllRecords, validateSingleRecord };
