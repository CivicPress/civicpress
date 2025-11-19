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
      try {
        const result = await validateGeographyFile(filePath, options);

        if (options.silent) {
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          displayGeographyValidationResult(result, options);
        }
      } catch (error) {
        if (!options.silent) {
          console.error('❌ Error:', (error as Error).message);
        }
        process.exit(1);
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
      try {
        const results = await scanDirectoryForGeography(dirPath, options);

        if (options.silent) {
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          displayGeographyScanResults(results, options);
        }
      } catch (error) {
        if (!options.silent) {
          console.error('❌ Error:', (error as Error).message);
        }
        process.exit(1);
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
        try {
          const result = await normalizeGeographyFile(filePath, options);

          if (options.silent) {
            return;
          }

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            displayGeographyNormalizationResult(result, options);
          }
        } catch (error) {
          if (!options.silent) {
            console.error('❌ Error:', (error as Error).message);
          }
          process.exit(1);
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
  console.log(`📍 Geography Validation: ${result.file}`);
  console.log('');

  if (!result.hasGeography) {
    console.log('ℹ️  No geography data found');
    return;
  }

  if (options.summary) {
    console.log(`📋 Summary: ${result.summary}`);
    console.log('');
  }

  if (result.isEmpty) {
    console.log('⚠️  Geography data is empty (no meaningful information)');
    console.log('');
  }

  if (result.validation.valid) {
    console.log('✅ Geography data is valid');
  } else {
    console.log('❌ Geography data has validation errors:');
    result.validation.errors.forEach((error: string) => {
      console.log(`   • ${error}`);
    });
  }

  if (result.validation.warnings.length > 0) {
    console.log('');
    console.log('⚠️  Warnings:');
    result.validation.warnings.forEach((warning: string) => {
      console.log(`   • ${warning}`);
    });
  }

  if (options.normalize && result.normalized) {
    console.log('');
    console.log('🔄 Normalized data:');
    console.log(JSON.stringify(result.normalized, null, 2));
  }
}

function displayGeographyScanResults(
  results: any,
  options: GeographyValidationOptions
) {
  console.log(`📍 Geography Scan: ${results.directory}`);
  console.log(
    `📊 Found ${results.filesWithGeography} files with geography data out of ${results.totalFiles} total files`
  );
  console.log('');

  if (results.results.length === 0) {
    console.log('ℹ️  No files with geography data found');
    return;
  }

  results.results.forEach((file: GeographyFile) => {
    console.log(`📄 ${path.relative(results.directory, file.path)}`);

    if (options.summary) {
      const summary = getGeographySummary(file.geography);
      console.log(`   📋 ${summary}`);
    }

    if (file.validation.valid) {
      console.log('   ✅ Valid');
    } else {
      console.log(`   ❌ ${file.validation.errors.length} error(s)`);
    }
    console.log('');
  });
}

function displayGeographyNormalizationResult(
  result: any,
  options: GeographyValidationOptions
) {
  console.log(`📍 Geography Normalization: ${result.file}`);
  console.log('');

  if (!result.hasGeography) {
    console.log('ℹ️  No geography data found');
    return;
  }

  if (options.summary) {
    console.log(`📋 Summary: ${result.summary}`);
    console.log('');
  }

  console.log('🔄 Normalized data:');
  console.log(JSON.stringify(result.normalized, null, 2));
  console.log('');

  if (result.validation.valid) {
    console.log('✅ Normalized geography data is valid');
  } else {
    console.log('❌ Normalized geography data still has validation errors:');
    result.validation.errors.forEach((error: string) => {
      console.log(`   • ${error}`);
    });
  }

  if (result.updated) {
    console.log('');
    console.log('💾 File updated with normalized geography data');
  }
}
