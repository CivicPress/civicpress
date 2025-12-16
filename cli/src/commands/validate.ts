import { CAC } from 'cac';
import { readFile, readdir } from 'fs/promises';
import { join, extname, dirname, resolve } from 'path';
import { loadConfig } from '@civicpress/core';
import chalk from 'chalk';
import * as fs from 'fs';
import { glob } from 'glob';
import * as yaml from 'yaml';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
import {
  cliSuccess,
  cliError,
  cliInfo,
  cliWarn,
  cliDebug,
  cliStartOperation,
} from '../utils/cli-output.js';
import {
  Logger,
  TemplateEngine,
  RecordValidator,
  RecordParser,
  RecordSchemaValidator,
  parseRecordRelativePath,
} from '@civicpress/core';
import matter from 'gray-matter';
import {
  getAvailableRecords,
  resolveRecordReference,
} from '../utils/record-locator.js';

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
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('validate');

      try {
        const config = await loadConfig();
        if (!config) {
          cliError(
            'No CivicPress configuration found. Run "civic init" first.',
            'NOT_INITIALIZED',
            undefined,
            'validate'
          );
          process.exit(1);
        }

        const validateOptions = {
          fix: options.fix || false,
          strict: options.strict || false,
          format: options.format || 'human',
        };

        if (!config.dataDir) {
          throw new Error('dataDir is not configured');
        }

        if (options.all) {
          await validateAllRecords(config.dataDir, validateOptions);
        } else if (record) {
          await validateSingleRecord(config.dataDir, record, validateOptions);
        } else {
          cliInfo('📋 Validation Commands:', 'validate');
          cliInfo(
            '  civic validate <record>              # Validate a single record',
            'validate'
          );
          cliInfo(
            '  civic validate --all                 # Validate all records',
            'validate'
          );
          cliInfo(
            '  civic validate --all --fix           # Auto-fix validation issues',
            'validate'
          );
          cliInfo(
            '  civic validate --all --strict        # Treat warnings as errors',
            'validate'
          );
          cliInfo(
            '  civic validate --all --json          # JSON output',
            'validate'
          );
        }
      } catch (error) {
        cliError(
          'Validation failed',
          'VALIDATION_FAILED',
          {
            error: error instanceof Error ? error.message : String(error),
          },
          'validate'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });
}

async function validateAllRecords(dataDir: string, options: any) {
  const recordsDir = join(dataDir, 'records');

  try {
    if (!fs.existsSync(recordsDir)) {
      cliError(
        'No records directory found',
        'NO_RECORDS_DIR',
        undefined,
        'validate'
      );
      return;
    }

    const recordFiles = await glob('**/*.md', { cwd: recordsDir });
    const results: ValidationResult[] = [];

    cliInfo(`🔍 Validating ${recordFiles.length} record(s)...\n`, 'validate');

    for (const file of recordFiles) {
      const result = await validateRecord(dataDir, file, options);
      results.push(result);
    }

    displayValidationResults(results, options);
  } catch (error) {
    cliError(
      'Error validating records',
      'VALIDATION_ERROR',
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'validate'
    );
  }
}

async function validateSingleRecord(
  dataDir: string,
  recordPath: string,
  options: any
) {
  const resolvedRecord = resolveRecordReference(dataDir, recordPath);

  if (!resolvedRecord) {
    const availableRecords = getAvailableRecords(dataDir);

    cliError(
      `Record "${recordPath}" not found`,
      'RECORD_NOT_FOUND',
      { recordPath, availableRecords },
      'validate'
    );

    cliInfo('Available records:', 'validate');
    for (const [type, files] of Object.entries(availableRecords)) {
      if (files.length > 0) {
        cliInfo(`  ${type}:`, 'validate');
        for (const file of files) {
          cliDebug(`    ${file}`, 'validate');
        }
      }
    }
    return;
  }

  const displayPath = resolvedRecord.relativePath.replace(/\\/g, '/');
  const normalizedPath = displayPath.replace(/^records\//, '');
  const fullPath = join(dataDir, ...displayPath.split('/').filter(Boolean));

  try {
    const result = await validateRecord(
      dataDir,
      normalizedPath,
      options,
      fullPath
    );
    displayValidationResults([result], options);
  } catch (error) {
    cliError(
      `Error validating ${recordPath}`,
      'VALIDATION_ERROR',
      {
        recordPath,
        error: error instanceof Error ? error.message : String(error),
      },
      'validate'
    );
  }
}

async function validateRecord(
  dataDir: string,
  recordPath: string,
  options: any,
  absoluteOverride?: string
): Promise<ValidationResult> {
  const normalizedPathRaw = recordPath.startsWith('records/')
    ? recordPath.replace(/^records\//, '')
    : recordPath;
  const normalizedPath = normalizedPathRaw.replace(/\\/g, '/');
  const displayPath = ['records', normalizedPath].join('/');
  const fullPath = absoluteOverride ?? join(dataDir, 'records', normalizedPath);

  if (!fs.existsSync(fullPath)) {
    return {
      record: displayPath,
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

  // Use RecordParser for consistent parsing
  let record;
  try {
    const parserPath = ['records', normalizedPath].join('/');
    record = RecordParser.parseFromMarkdown(content, parserPath);
  } catch (error) {
    return {
      record: displayPath,
      isValid: false,
      errors: [
        {
          field: 'parse',
          message: `Failed to parse record: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'error',
        },
      ],
      warnings: [],
      suggestions: [],
    };
  }

  const parsedPathInfo = parseRecordRelativePath(
    ['records', normalizedPath].join('/')
  );
  const recordType = record.type || parsedPathInfo.type;

  // Try to load the template using the template engine
  let template: any | null = null;
  try {
    // First try to load the specific template if specified in metadata
    const templateName = record.metadata?.template || 'default';
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

  // STEP 1: Schema validation (explicit for CLI output)
  const { data: frontmatter } = matter(content);
  const schemaValidation = RecordSchemaValidator.validate(
    frontmatter,
    record.type,
    {
      includeModuleExtensions: true,
      includeTypeExtensions: true,
      strict: false,
    }
  );

  // Add schema validation results
  for (const error of schemaValidation.errors) {
    errors.push({
      field: error.field,
      message: `[Schema] ${error.message}`,
      severity: 'error',
    });
    if (error.suggestion) {
      suggestions.push(`${error.field}: ${error.suggestion}`);
    }
  }

  for (const warning of schemaValidation.warnings) {
    warnings.push({
      field: warning.field,
      message: `[Schema] ${warning.message}`,
    });
    if (warning.suggestion) {
      suggestions.push(`${warning.field}: ${warning.suggestion}`);
    }
  }

  // STEP 2: Use RecordValidator for comprehensive validation (includes schema + business rules)
  const validationResult = RecordValidator.validateRecord(record, {
    strict: options.strict || false,
    checkFormat: true,
    checkContent: true,
  });

  // Convert RecordValidator results to CLI format
  for (const error of validationResult.errors) {
    errors.push({
      field: error.field,
      message: error.message,
      severity: error.severity === 'error' ? 'error' : 'warning',
    });
    if (error.suggestion) {
      suggestions.push(`${error.field}: ${error.suggestion}`);
    }
  }

  for (const warning of validationResult.warnings) {
    warnings.push({
      field: warning.field,
      message: warning.message,
    });
    if (warning.suggestion) {
      suggestions.push(`${warning.field}: ${warning.suggestion}`);
    }
  }

  // Use template engine's additional validation if template is available
  if (template) {
    try {
      const templateValidationResult = templateEngine.validateRecord(
        fullPath,
        template
      );

      // Add template-specific validation results
      for (const error of templateValidationResult.errors) {
        errors.push({
          field: 'template',
          message: String(error),
          severity: 'error',
        });
      }

      for (const warning of templateValidationResult.warnings) {
        warnings.push({
          field: 'template',
          message: String(warning),
        });
      }
    } catch (templateError) {
      // Template validation failed, skip it
    }
  }

  // Check for common content issues
  validateCommonIssues(
    record.title || '',
    record.metadata || {},
    record.content || '',
    errors,
    warnings,
    suggestions
  );

  validateMarkdownLinks(fullPath, dataDir, record.content || '', warnings);

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
    record: displayPath,
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
  title: string,
  metadata: Record<string, any>,
  content: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  suggestions: string[]
) {
  // Check for placeholder content (exclude markdown links)
  const linkRegex = /\[[^\]]+\]\([^)]+\)/g;
  const contentWithoutLinks = content.replace(linkRegex, '');
  const placeholderRegex = /\[[^\]]+\]/g;
  const placeholderMatches = contentWithoutLinks.match(placeholderRegex);

  if (placeholderMatches && placeholderMatches.length > 0) {
    warnings.push({
      field: 'content',
      message: `Found ${placeholderMatches.length} placeholder(s) in content`,
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

  const normalizedTitle = title.trim();
  if (normalizedTitle.length > 0) {
    const firstHeadingLine = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith('#'));

    if (!firstHeadingLine) {
      warnings.push({
        field: 'content',
        message: 'Content does not include a top-level heading',
        suggestion: `Add "# ${normalizedTitle}" near the top of the document`,
      });
    } else {
      const headingText = firstHeadingLine.replace(/^#+\s*/, '').trim();
      if (
        headingText.localeCompare(normalizedTitle, undefined, {
          sensitivity: 'base',
          usage: 'search',
        }) !== 0
      ) {
        warnings.push({
          field: 'content',
          message: 'Content does not start with the record title',
          suggestion: `Start content with "# ${normalizedTitle}"`,
        });
      }
    }
  } else if (!content.includes('# ')) {
    warnings.push({
      field: 'content',
      message: 'Content does not include a top-level heading',
      suggestion: 'Add a "# Title" heading near the top of the document',
    });
  }
}

function validateMarkdownLinks(
  fullPath: string,
  dataDir: string,
  content: string,
  warnings: ValidationWarning[]
) {
  if (!content) return;

  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  const recordDir = dirname(fullPath);
  const missingTargets = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(content)) !== null) {
    const rawTarget = match[1]?.trim();
    if (!rawTarget) continue;
    if (rawTarget.startsWith('#')) continue;
    if (
      /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawTarget) &&
      !rawTarget.startsWith('file:')
    ) {
      // Skip absolute URLs (http, https, mailto, etc.)
      continue;
    }

    const cleanedTarget = rawTarget.split('#')[0]?.split('?')[0]?.trim();
    if (!cleanedTarget) continue;

    if (extname(cleanedTarget).toLowerCase() !== '.md') {
      continue;
    }

    const resolvedPath = cleanedTarget.startsWith('/')
      ? join(dataDir, cleanedTarget.replace(/^\/+/, ''))
      : resolve(recordDir, cleanedTarget);

    if (!fs.existsSync(resolvedPath)) {
      missingTargets.add(cleanedTarget);
    }
  }

  for (const target of missingTargets) {
    warnings.push({
      field: 'content',
      message: `Linked record not found: ${target}`,
      suggestion: 'Ensure the linked record exists and the path is correct.',
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

function displayValidationResults(results: ValidationResult[], options: any) {
  const totalRecords = results.length;
  const validRecords = results.filter((r) => r.isValid).length;
  const invalidRecords = totalRecords - validRecords;

  let totalErrors = 0;
  let totalWarnings = 0;

  const summary = {
    results,
    summary: {
      totalRecords,
      validRecords,
      invalidRecords,
      totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
      totalWarnings: results.reduce((sum, r) => sum + r.warnings.length, 0),
    },
  };

  cliSuccess(summary, 'Validation completed', {
    operation: 'validate',
  });

  // Summary
  cliInfo('📊 Validation Summary:', 'validate');
  cliInfo(`  Total records: ${totalRecords}`, 'validate');
  cliInfo(`  Valid records: ${validRecords}`, 'validate');
  cliInfo(`  Invalid records: ${invalidRecords}`, 'validate');

  // Detailed results
  for (const result of results) {
    if (
      !result.isValid ||
      result.errors.length > 0 ||
      result.warnings.length > 0
    ) {
      cliInfo(`\n📄 ${result.record}`, 'validate');

      if (result.isValid) {
        cliInfo('  ✅ Valid', 'validate');
      } else {
        cliError(
          '  Invalid',
          'RECORD_INVALID',
          { record: result.record },
          'validate'
        );
      }

      // Show errors
      for (const error of result.errors) {
        cliError(
          `    ${error.field}: ${error.message}`,
          'VALIDATION_ERROR',
          { field: error.field, message: error.message },
          'validate'
        );
        totalErrors++;
      }

      // Show warnings
      for (const warning of result.warnings) {
        cliWarn(`    ${warning.field}: ${warning.message}`, 'validate');
        if (warning.suggestion) {
          cliInfo(`       💡 ${warning.suggestion}`, 'validate');
        }
        totalWarnings++;
      }

      // Show suggestions
      for (const suggestion of result.suggestions) {
        cliInfo(`    💡 ${suggestion}`, 'validate');
      }
    }
  }

  // Final summary
  cliInfo('\n📊 Final Summary:', 'validate');
  cliInfo(`  Total errors: ${totalErrors}`, 'validate');
  cliInfo(`  Total warnings: ${totalWarnings}`, 'validate');

  if (totalErrors === 0 && totalWarnings === 0) {
    cliInfo('\n🎉 All records are valid!', 'validate');
  } else if (totalErrors === 0) {
    cliWarn(
      '\n⚠️  All records are valid, but there are warnings to address.',
      'validate'
    );
  } else {
    cliError(
      '\n❌ Some records have validation errors that need to be fixed.',
      'VALIDATION_ERRORS',
      { totalErrors, totalWarnings },
      'validate'
    );
  }
}

// Export for testing
export { validateRecord, validateAllRecords, validateSingleRecord };
