import { CAC } from 'cac';
import {
  validateGeography,
  normalizeGeography,
  getGeographySummary,
  isEmptyGeography,
} from '@civicpress/core';
import fs from 'fs-extra';
import path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
import {
  cliSuccess,
  cliError,
  cliInfo,
  cliWarn,
  cliStartOperation,
} from '../utils/cli-output.js';

interface GeographyValidationOptions {
  json?: boolean;
  silent?: boolean;
  normalize?: boolean;
  summary?: boolean;
}

interface GeographyFile {
  path: string;
  geography: any;
  validation: any;
}

export function registerGeographyCommand(cli: CAC) {
  cli
    .command(
      'geography:validate <file>',
      'Validate geography data in a record file'
    )
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .option('--normalize', 'Show normalized geography data')
    .option('--summary', 'Show geography summary')
    .action(async (filePath: string, options: GeographyValidationOptions) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('geography:validate');

      try {
        const result = await validateGeographyFile(filePath, options);

        cliSuccess(
          result,
          result.hasGeography
            ? result.validation?.valid
              ? `Geography data is valid in ${filePath}`
              : `Geography data has validation errors in ${filePath}`
            : `No geography data found in ${filePath}`,
          {
            operation: 'geography:validate',
            filePath,
            hasGeography: result.hasGeography,
            isValid: result.validation?.valid,
          }
        );
      } catch (error) {
        cliError(
          'Failed to validate geography data',
          'VALIDATE_GEOGRAPHY_FAILED',
          {
            error: (error as Error).message,
            filePath,
          },
          'geography:validate'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });

  cli
    .command(
      'geography:scan <directory>',
      'Scan directory for records with geography data'
    )
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .option('--summary', 'Show geography summaries')
    .action(async (dirPath: string, options: GeographyValidationOptions) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('geography:scan');

      try {
        const results = await scanDirectoryForGeography(dirPath, options);

        const message =
          results.filesWithGeography === 0
            ? `No files with geography data found in ${dirPath}`
            : `Found ${results.filesWithGeography} file${results.filesWithGeography === 1 ? '' : 's'} with geography data out of ${results.totalFiles} total files`;

        cliSuccess(results, message, {
          operation: 'geography:scan',
          directory: dirPath,
          totalFiles: results.totalFiles,
          filesWithGeography: results.filesWithGeography,
        });
      } catch (error) {
        cliError(
          'Failed to scan directory for geography data',
          'SCAN_GEOGRAPHY_FAILED',
          {
            error: (error as Error).message,
            directory: dirPath,
          },
          'geography:scan'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });

  cli
    .command(
      'geography:normalize <file>',
      'Normalize geography data in a record file'
    )
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .option('--write', 'Write normalized data back to file')
    .action(
      async (
        filePath: string,
        options: GeographyValidationOptions & { write?: boolean }
      ) => {
        // Initialize CLI output with global options
        const globalOptions = getGlobalOptionsFromArgs();
        initializeCliOutput(globalOptions);

        const endOperation = cliStartOperation('geography:normalize');

        try {
          const result = await normalizeGeographyFile(filePath, options);

          const message = result.hasGeography
            ? result.updated
              ? `Geography data normalized and written to ${filePath}`
              : `Geography data normalized for ${filePath}${result.validation?.valid ? ' (valid)' : ' (has errors)'}`
            : `No geography data found in ${filePath}`;

          cliSuccess(result, message, {
            operation: 'geography:normalize',
            filePath,
            hasGeography: result.hasGeography,
            updated: result.updated,
            isValid: result.validation?.valid,
          });
        } catch (error) {
          cliError(
            'Failed to normalize geography data',
            'NORMALIZE_GEOGRAPHY_FAILED',
            {
              error: (error as Error).message,
              filePath,
            },
            'geography:normalize'
          );
          process.exit(1);
        } finally {
          endOperation();
        }
      }
    );
}

async function validateGeographyFile(
  filePath: string,
  options: GeographyValidationOptions
) {
  const fullPath = path.resolve(filePath);

  if (!(await fs.pathExists(fullPath))) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = await fs.readFile(fullPath, 'utf-8');
  const geography = extractGeographyFromContent(content);

  if (!geography) {
    return {
      file: filePath,
      hasGeography: false,
      message: 'No geography data found in file',
    };
  }

  const validation = validateGeography(geography);
  const normalized = options.normalize
    ? normalizeGeography(geography)
    : undefined;
  const summary = options.summary ? getGeographySummary(geography) : undefined;

  return {
    file: filePath,
    hasGeography: true,
    geography,
    validation,
    normalized,
    summary,
    isEmpty: isEmptyGeography(geography),
  };
}

async function scanDirectoryForGeography(
  dirPath: string,
  options: GeographyValidationOptions
) {
  const fullPath = path.resolve(dirPath);

  if (!(await fs.pathExists(fullPath))) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const results: GeographyFile[] = [];
  const files = await findMarkdownFiles(fullPath);

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const geography = extractGeographyFromContent(content);

      if (geography) {
        const validation = validateGeography(geography);
        results.push({
          path: file,
          geography,
          validation,
        });
      }
    } catch {
      // Skip files that can't be read
      continue;
    }
  }

  return {
    directory: dirPath,
    totalFiles: files.length,
    filesWithGeography: results.length,
    results,
  };
}

async function normalizeGeographyFile(
  filePath: string,
  options: { write?: boolean } = {}
) {
  const fullPath = path.resolve(filePath);

  if (!(await fs.pathExists(fullPath))) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = await fs.readFile(fullPath, 'utf-8');
  const geography = extractGeographyFromContent(content);

  if (!geography) {
    return {
      file: filePath,
      hasGeography: false,
      message: 'No geography data found in file',
    };
  }

  const normalized = normalizeGeography(geography);
  const validation = validateGeography(normalized);
  const summary = getGeographySummary(normalized);

  if (options.write) {
    const updatedContent = updateGeographyInContent(content, normalized);
    await fs.writeFile(fullPath, updatedContent, 'utf-8');
  }

  return {
    file: filePath,
    hasGeography: true,
    original: geography,
    normalized,
    validation,
    summary,
    updated: options.write,
  };
}

function extractGeographyFromContent(content: string): any {
  // Look for YAML frontmatter
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!frontmatterMatch) {
    return null;
  }

  try {
    const frontmatter = parseYaml(frontmatterMatch[1]) as any;
    return frontmatter.geography || null;
  } catch {
    return null;
  }
}

function updateGeographyInContent(content: string, geography: any): string {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!frontmatterMatch) {
    // No frontmatter, add it
    const newFrontmatter = stringifyYaml({ geography });
    return `---\n${newFrontmatter}---\n\n${content}`;
  }

  try {
    const frontmatter = parseYaml(frontmatterMatch[1]) as any;
    frontmatter.geography = geography;
    const newFrontmatter = stringifyYaml(frontmatter);
    return content.replace(
      frontmatterMatch[0],
      `---\n${newFrontmatter}---\n\n`
    );
  } catch {
    throw new Error('Failed to update frontmatter');
  }
}

async function findMarkdownFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];

  async function scanDirectory(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await scanDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  await scanDirectory(dirPath);
  return files;
}

function displayGeographyValidationResult(
  result: any,
  options: GeographyValidationOptions
) {
  // This function is deprecated - output is now handled by cliSuccess
  // Keeping function signature for backward compatibility but it won't be called
}

function displayGeographyScanResults(
  results: any,
  options: GeographyValidationOptions
) {
  // This function is deprecated - output is now handled by cliSuccess
  // Keeping function signature for backward compatibility but it won't be called
}

function displayGeographyNormalizationResult(
  result: any,
  options: GeographyValidationOptions
) {
  // This function is deprecated - output is now handled by cliSuccess
  // Keeping function signature for backward compatibility but it won't be called
}
