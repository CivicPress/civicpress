import { CAC } from 'cac';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import * as fs from 'fs';
import matter from 'gray-matter';
import { glob } from 'glob';
import { userCan } from '@civicpress/core';
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

interface ImportOptions {
  token?: string;
  format?: 'json' | 'csv' | 'markdown';
  input?: string;
  type?: string;
  status?: string;
  author?: string;
  overwrite?: boolean;
  dryRun?: boolean;
  validate?: boolean;
  template?: string;
}

interface ImportRecord {
  path?: string;
  type: string;
  title: string;
  status: string;
  created?: string;
  updated?: string;
  author: string;
  content?: string;
  metadata?: Record<string, any>;
}

export function registerImportCommand(cli: CAC) {
  cli
    .command('import [file]', 'Import records from various formats')
    .option('--token <token>', 'Session token for authentication')
    .option('-f, --format <format>', 'Import format', { default: 'json' })
    .option('-i, --input <path>', 'Input file or directory path')
    .option('-t, --type <type>', 'Default record type for imported records')
    .option('-s, --status <status>', 'Default status for imported records')
    .option('-a, --author <author>', 'Default author for imported records')
    .option('--overwrite', 'Overwrite existing records')
    .option('--dry-run', 'Show what would be imported without importing')
    .option('--validate', 'Validate imported records')
    .option('--template <template>', 'Default template for imported records')
    .action(async (file: string, options: ImportOptions) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('import');

      // Validate authentication and get civic instance
      const { civic, user } = await AuthUtils.requireAuthWithCivic(
        options.token,
        globalOptions.json
      );
      const dataDir = civic.getDataDir();

      // Check import permissions
      const canImport = await userCan(user, 'records:import');
      if (!canImport) {
        cliError(
          'Insufficient permissions to import records',
          'PERMISSION_DENIED',
          {
            requiredPermission: 'records:import',
            userRole: user.role,
          },
          'import'
        );
        process.exit(1);
      }

      try {
        const importOptions: ImportOptions = {
          ...options,
          format: options.format || 'json',
          overwrite: options.overwrite || false,
          dryRun: options.dryRun || false,
          validate: options.validate || false,
        };

        // If specific file is provided, import just that file
        if (file) {
          await importSingleFile(dataDir, file, importOptions);
        } else {
          // Import from input directory or file
          await importRecords(dataDir, importOptions);
        }
      } catch (error) {
        cliError(
          'Import failed',
          'IMPORT_FAILED',
          {
            error: error instanceof Error ? error.message : String(error),
          },
          'import'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });
}

async function importSingleFile(
  dataDir: string,
  filePath: string,
  options: ImportOptions
) {
  try {
    if (!fs.existsSync(filePath)) {
      cliError(
        `File not found: ${filePath}`,
        'FILE_NOT_FOUND',
        { filePath },
        'import'
      );
      return;
    }

    const content = await readFile(filePath, 'utf-8');
    const records = await parseImportFile(content, options);

    if (options.dryRun) {
      await dryRunImport(records, options);
    } else {
      await performImport(records, dataDir, options);
    }

    cliSuccess(
      {
        records,
        summary: {
          totalRecords: records.length,
          format: options.format,
          file: filePath,
        },
      },
      `Imported ${records.length} record${records.length === 1 ? '' : 's'} from ${filePath}`,
      {
        operation: 'import',
        recordCount: records.length,
        format: options.format,
      }
    );
  } catch (error) {
    cliError(
      `Error importing ${filePath}`,
      'IMPORT_FAILED',
      {
        error: error instanceof Error ? error.message : String(error),
        filePath,
      },
      'import'
    );
    throw error;
  }
}

async function importRecords(dataDir: string, options: ImportOptions) {
  const inputPath = options.input || '.';

  try {
    if (!fs.existsSync(inputPath)) {
      cliError(
        `Input path not found: ${inputPath}`,
        'INPUT_PATH_NOT_FOUND',
        { inputPath },
        'import'
      );
      process.exit(1);
    }

    const stats = fs.statSync(inputPath);
    let allRecords: ImportRecord[] = [];

    if (stats.isFile()) {
      // Single file import
      const content = await readFile(inputPath, 'utf-8');
      allRecords = await parseImportFile(content, options);
    } else {
      // Directory import - find all matching files
      const pattern = getFilePattern(options.format || 'json');
      const files = await glob(pattern, { cwd: inputPath });

      for (const file of files) {
        const filePath = join(inputPath, file);
        const content = await readFile(filePath, 'utf-8');
        const records = await parseImportFile(content, options);
        allRecords.push(...records);
      }
    }

    if (allRecords.length === 0) {
      cliWarn('No records found to import', 'import');
      return;
    }

    if (options.dryRun) {
      await dryRunImport(allRecords, options);
    } else {
      await performImport(allRecords, dataDir, options);
    }

    cliSuccess(
      {
        records: allRecords,
        summary: {
          totalRecords: allRecords.length,
          format: options.format,
          input: inputPath,
        },
      },
      `Imported ${allRecords.length} record${allRecords.length === 1 ? '' : 's'} from ${inputPath}`,
      {
        operation: 'import',
        recordCount: allRecords.length,
        format: options.format,
      }
    );
  } catch (error) {
    cliError(
      'Error importing records',
      'IMPORT_FAILED',
      {
        error: error instanceof Error ? error.message : String(error),
        inputPath,
      },
      'import'
    );
    throw error;
  }
}

async function parseImportFile(
  content: string,
  options: ImportOptions
): Promise<ImportRecord[]> {
  switch (options.format) {
    case 'json':
      return parseJSONImport(content, options);

    case 'csv':
      return parseCSVImport(content, options);

    case 'markdown':
      return parseMarkdownImport(content, options);

    default:
      throw new Error(`Unsupported import format: ${options.format}`);
  }
}

function parseJSONImport(
  content: string,
  options: ImportOptions
): ImportRecord[] {
  try {
    const data = JSON.parse(content);

    // Handle different JSON structures
    if (Array.isArray(data)) {
      return data.map((record: Record<string, any>) =>
        normalizeImportRecord(record, options)
      );
    } else if (data.records && Array.isArray(data.records)) {
      return data.records.map((record: Record<string, any>) =>
        normalizeImportRecord(record, options)
      );
    } else if (data.record) {
      return [normalizeImportRecord(data.record, options)];
    } else {
      return [normalizeImportRecord(data, options)];
    }
  } catch (error) {
    throw new Error(
      `Invalid JSON format: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function parseCSVImport(
  content: string,
  options: ImportOptions
): ImportRecord[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file must have at least a header and one data row');
  }

  const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
  const records: ImportRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const record: Record<string, any> = {};

    headers.forEach((header, index) => {
      if (values[index] !== undefined) {
        record[header] = values[index];
      }
    });

    records.push(normalizeImportRecord(record, options));
  }

  return records;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseMarkdownImport(
  content: string,
  options: ImportOptions
): ImportRecord[] {
  // For markdown, we expect a single record per file
  const { data: metadata, content: markdownContent } = matter(content);

  const record: ImportRecord = {
    type: metadata.type || options.type || 'document',
    title: metadata.title || 'Imported Document',
    status: metadata.status || options.status || 'draft',
    author: metadata.author || options.author || 'system',
    content: markdownContent,
    metadata: metadata,
  };

  return [record];
}

function normalizeImportRecord(
  record: Record<string, any>,
  options: ImportOptions
): ImportRecord {
  return {
    path: record.path,
    type: record.type || options.type || 'document',
    title: record.title || 'Imported Record',
    status: record.status || options.status || 'draft',
    created: record.created || new Date().toISOString(),
    updated: record.updated || new Date().toISOString(),
    author: record.author || options.author || 'system',
    content: record.content,
    metadata: record.metadata || {},
  };
}

function getFilePattern(format: string): string {
  switch (format) {
    case 'json':
      return '**/*.json';
    case 'csv':
      return '**/*.csv';
    case 'markdown':
      return '**/*.md';
    default:
      return '**/*';
  }
}

async function dryRunImport(records: ImportRecord[], options: ImportOptions) {
  const logger = initializeLogger();
  logger.info('🔍 Dry run - would import the following records:');

  for (const record of records) {
    const path =
      record.path ||
      `${record.type}/${record.title.toLowerCase().replace(/\s+/g, '-')}.md`;
    const action = options.overwrite ? 'overwrite' : 'create';

    logger.info(`  ${action}: ${path}`);
    logger.info(`    Type: ${record.type}`);
    logger.info(`    Title: ${record.title}`);
    logger.info(`    Status: ${record.status}`);
    logger.info(`    Author: ${record.author}`);
    if (record.content) {
      logger.info(`    Content: ${record.content.length} characters`);
    }
  }

  logger.success(
    `✅ Dry run complete - ${records.length} record(s) would be imported`
  );
}

async function performImport(
  records: ImportRecord[],
  dataDir: string,
  options: ImportOptions
) {
  const logger = initializeLogger();
  const recordsDir = join(dataDir, 'records');

  // Ensure records directory exists
  await mkdir(recordsDir, { recursive: true });

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const record of records) {
    try {
      const path =
        record.path ||
        `${record.type}/${record.title.toLowerCase().replace(/\s+/g, '-')}.md`;
      const fullPath = join(recordsDir, path);

      // Check if file exists
      if (fs.existsSync(fullPath) && !options.overwrite) {
        logger.warn(`⚠️  Skipping existing file: ${path}`);
        skipped++;
        continue;
      }

      // Ensure directory exists
      const dir = dirname(fullPath);
      await mkdir(dir, { recursive: true });

      // Prepare metadata
      const metadata = {
        type: record.type,
        title: record.title,
        status: record.status,
        author: record.author,
        created: record.created,
        updated: record.updated,
        ...record.metadata,
      };

      // Create markdown content with frontmatter
      const content = matter.stringify(record.content || '', metadata);
      await writeFile(fullPath, content);

      logger.success(`✅ Imported: ${path}`);
      imported++;
    } catch (error) {
      logger.error(`❌ Error importing record "${record.title}":`, error);
      errors++;
    }
  }

  logger.success(
    `✅ Import complete: ${imported} imported, ${skipped} skipped, ${errors} errors`
  );
}

// Export for testing
export { importRecords, importSingleFile, parseImportFile };
