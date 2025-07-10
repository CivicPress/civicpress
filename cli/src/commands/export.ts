import { CAC } from 'cac';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import * as fs from 'fs';
import matter = require('gray-matter');
import { glob } from 'glob';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';
import { AuthUtils } from '../utils/auth-utils.js';

interface ExportOptions {
  token?: string;
  format?: 'json' | 'csv' | 'html' | 'pdf';
  output?: string;
  type?: string;
  status?: string;
  author?: string;
  date?: string;
  includeContent?: boolean;
  includeMetadata?: boolean;
  pretty?: boolean;
  template?: string;
}

interface ExportRecord {
  path: string;
  type: string;
  title: string;
  status: string;
  created: string;
  updated: string;
  author: string;
  content?: string;
  metadata: Record<string, any>;
}

export function registerExportCommand(cli: CAC) {
  cli
    .command('export [record]', 'Export records in various formats')
    .option('--token <token>', 'Session token for authentication')
    .option('-f, --format <format>', 'Export format', { default: 'json' })
    .option('-o, --output <path>', 'Output file or directory path')
    .option('-t, --type <type>', 'Filter by record type')
    .option('-s, --status <status>', 'Filter by record status')
    .option('-a, --author <author>', 'Filter by author')
    .option(
      '--date <date>',
      'Filter by date (YYYY-MM-DD or relative like "1 week ago")'
    )
    .option('--include-content', 'Include record content in export')
    .option('--include-metadata', 'Include full metadata in export')
    .option('--pretty', 'Pretty-print JSON output')
    .option('--template <template>', 'Custom HTML template file')
    .action(async (record: string, options: ExportOptions) => {
      // Initialize logger with global options
      const globalOptions = getGlobalOptionsFromArgs();
      const logger = initializeLogger();
      const shouldOutputJson = globalOptions.json;

      // Validate authentication and get civic instance
      const { civic } = await AuthUtils.requireAuthWithCivic(
        options.token,
        shouldOutputJson
      );
      const dataDir = civic.getDataDir();

      try {
        const exportOptions: ExportOptions = {
          ...options,
          format: options.format || 'json',
          includeContent: options.includeContent || false,
          includeMetadata: options.includeMetadata || false,
          pretty: options.pretty || false,
        };

        // If specific record is provided, export just that record
        if (record) {
          const recordPath = record.endsWith('.md') ? record : `${record}.md`;
          await exportSingleRecord(
            dataDir,
            recordPath,
            exportOptions,
            shouldOutputJson
          );
        } else {
          // Export filtered records
          await exportRecords(dataDir, exportOptions, shouldOutputJson);
        }
      } catch (error) {
        logger.error('❌ Export failed:', error);
        process.exit(1);
      }
    });
}

async function exportSingleRecord(
  dataDir: string,
  recordPath: string,
  options: ExportOptions,
  shouldOutputJson?: boolean
) {
  const logger = initializeLogger();
  const fullPath = join(dataDir, 'records', recordPath);

  try {
    if (!fs.existsSync(fullPath)) {
      if (shouldOutputJson) {
        console.log(
          JSON.stringify(
            {
              error: `Record not found: ${recordPath}`,
            },
            null,
            2
          )
        );
        return;
      } else {
        logger.error(`❌ Record not found: ${recordPath}`);
        process.exit(1);
      }
    }

    const content = await readFile(fullPath, 'utf-8');
    const { data: metadata, content: markdownContent } = matter(content);

    const exportRecord: ExportRecord = {
      path: recordPath,
      type: metadata.type || recordPath.split('/')[0],
      title: metadata.title || recordPath.replace(/\.md$/, ''),
      status: metadata.status || 'draft',
      created: metadata.created || '',
      updated: metadata.updated || '',
      author: metadata.author || 'unknown',
      content: options.includeContent ? markdownContent : undefined,
      metadata: options.includeMetadata ? metadata : {},
    };

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            record: exportRecord,
            summary: {
              totalRecords: 1,
              format: options.format,
              includeContent: options.includeContent,
              includeMetadata: options.includeMetadata,
            },
          },
          null,
          2
        )
      );
      return;
    }

    const output = await formatExport([exportRecord], options);
    await writeExport(output, options);
  } catch (error) {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            error: `Error exporting ${recordPath}`,
            details: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      );
    } else {
      logger.error(`❌ Error exporting ${recordPath}:`, error);
      process.exit(1);
    }
  }
}

async function exportRecords(
  dataDir: string,
  options: ExportOptions,
  shouldOutputJson?: boolean
) {
  const logger = initializeLogger();
  const recordsDir = join(dataDir, 'records');

  try {
    if (!fs.existsSync(recordsDir)) {
      if (shouldOutputJson) {
        console.log(
          JSON.stringify(
            {
              error: 'No records directory found',
            },
            null,
            2
          )
        );
        return;
      } else {
        logger.warn('📁 No records directory found.');
        return;
      }
    }

    // Get all record files
    const recordFiles = await glob('**/*.md', { cwd: recordsDir });
    const records: ExportRecord[] = [];

    for (const file of recordFiles) {
      const filePath = join(recordsDir, file);
      const content = await readFile(filePath, 'utf-8');
      const { data: metadata, content: markdownContent } = matter(content);

      // Apply filters
      if (options.type && metadata.type !== options.type) continue;
      if (options.status && metadata.status !== options.status) continue;
      if (options.author && metadata.author !== options.author) continue;
      if (options.date) {
        const recordDate = new Date(metadata.created || metadata.updated || '');
        const searchDate = parseDateFilter(options.date);
        if (searchDate && recordDate < searchDate) continue;
      }

      records.push({
        path: file,
        type: metadata.type || file.split('/')[0],
        title: metadata.title || file.replace(/\.md$/, ''),
        status: metadata.status || 'draft',
        created: metadata.created || '',
        updated: metadata.updated || '',
        author: metadata.author || 'unknown',
        content: options.includeContent ? markdownContent : undefined,
        metadata: options.includeMetadata ? metadata : {},
      });
    }

    if (records.length === 0) {
      if (shouldOutputJson) {
        console.log(
          JSON.stringify(
            {
              error: 'No records found matching your criteria',
            },
            null,
            2
          )
        );
        return;
      } else {
        logger.warn('🔍 No records found matching your criteria.');
        return;
      }
    }

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            records,
            summary: {
              totalRecords: records.length,
              format: options.format,
              includeContent: options.includeContent,
              includeMetadata: options.includeMetadata,
              filters: {
                type: options.type,
                status: options.status,
                author: options.author,
                date: options.date,
              },
            },
          },
          null,
          2
        )
      );
      return;
    }

    logger.info(`📦 Exporting ${records.length} record(s)...`);

    const output = await formatExport(records, options);
    await writeExport(output, options);
  } catch (error) {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            error: 'Error exporting records',
            details: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      );
    } else {
      logger.error('❌ Error exporting records:', error);
      process.exit(1);
    }
  }
}

async function formatExport(
  records: ExportRecord[],
  options: ExportOptions
): Promise<string> {
  switch (options.format) {
    case 'json':
      return JSON.stringify(records, null, options.pretty ? 2 : 0);

    case 'csv':
      return formatCSV(records, options);

    case 'html':
      return formatHTML(records, options);

    case 'pdf':
      return formatHTML(records, options); // PDF will be converted from HTML

    default:
      throw new Error(`Unsupported format: ${options.format}`);
  }
}

function formatCSV(records: ExportRecord[], options: ExportOptions): string {
  const headers = [
    'Path',
    'Type',
    'Title',
    'Status',
    'Created',
    'Updated',
    'Author',
  ];
  if (options.includeContent) headers.push('Content');
  if (options.includeMetadata) headers.push('Metadata');

  const rows = [headers];

  for (const record of records) {
    const row = [
      record.path,
      record.type,
      record.title,
      record.status,
      record.created,
      record.updated,
      record.author,
    ];

    if (options.includeContent) {
      row.push(record.content ? `"${record.content.replace(/"/g, '""')}"` : '');
    }

    if (options.includeMetadata) {
      row.push(`"${JSON.stringify(record.metadata).replace(/"/g, '""')}"`);
    }

    rows.push(row);
  }

  return rows.map((row) => row.join(',')).join('\n');
}

function formatHTML(records: ExportRecord[], options: ExportOptions): string {
  const template = options.template
    ? fs.readFileSync(options.template, 'utf-8')
    : getDefaultHTMLTemplate();

  const recordsHTML = records
    .map((record) => {
      const content =
        options.includeContent && record.content
          ? `<div class="content"><h3>Content</h3><pre>${escapeHtml(record.content)}</pre></div>`
          : '';

      const metadata =
        options.includeMetadata && Object.keys(record.metadata).length > 0
          ? `<div class="metadata"><h3>Metadata</h3><pre>${escapeHtml(JSON.stringify(record.metadata, null, 2))}</pre></div>`
          : '';

      return `
      <div class="record">
        <h2>${escapeHtml(record.title)}</h2>
        <div class="info">
          <p><strong>Path:</strong> ${escapeHtml(record.path)}</p>
          <p><strong>Type:</strong> ${escapeHtml(record.type)}</p>
          <p><strong>Status:</strong> ${escapeHtml(record.status)}</p>
          <p><strong>Created:</strong> ${escapeHtml(record.created)}</p>
          <p><strong>Updated:</strong> ${escapeHtml(record.updated)}</p>
          <p><strong>Author:</strong> ${escapeHtml(record.author)}</p>
        </div>
        ${content}
        ${metadata}
      </div>
    `;
    })
    .join('');

  return template.replace('{{RECORDS}}', recordsHTML);
}

function getDefaultHTMLTemplate(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CivicPress Records Export</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
        .record { border: 1px solid #ddd; margin: 20px 0; padding: 20px; border-radius: 8px; }
        .info { background: #f9f9f9; padding: 15px; border-radius: 4px; margin: 10px 0; }
        .content, .metadata { margin: 15px 0; }
        pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
        h2 { color: #333; margin-top: 0; }
        h3 { color: #666; }
    </style>
</head>
<body>
    <h1>CivicPress Records Export</h1>
    <p>Generated on ${new Date().toLocaleString()}</p>
    {{RECORDS}}
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseDateFilter(dateFilter: string): Date | null {
  // Handle relative dates like "1 week ago", "2 days ago"
  const relativeMatch = dateFilter.match(
    /(\d+)\s+(day|week|month|year)s?\s+ago/i
  );
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    const date = new Date();

    switch (unit) {
      case 'day':
        date.setDate(date.getDate() - amount);
        break;
      case 'week':
        date.setDate(date.getDate() - amount * 7);
        break;
      case 'month':
        date.setMonth(date.getMonth() - amount);
        break;
      case 'year':
        date.setFullYear(date.getFullYear() - amount);
        break;
    }

    return date;
  }

  // Handle absolute dates like "2024-01-15"
  const absoluteDate = new Date(dateFilter);
  if (!isNaN(absoluteDate.getTime())) {
    return absoluteDate;
  }

  return null;
}

async function writeExport(output: string, options: ExportOptions) {
  const logger = initializeLogger();
  if (options.output) {
    // Ensure output directory exists
    const outputDir = dirname(options.output);
    if (outputDir !== '.') {
      await mkdir(outputDir, { recursive: true });
    }

    await writeFile(options.output, output);
    logger.success(`✅ Export saved to: ${options.output}`);
  } else {
    // Output to stdout
    logger.output(output);
  }
}

// Export for testing
export { exportRecords, exportSingleRecord, formatExport };
