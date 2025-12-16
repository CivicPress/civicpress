import { CAC } from 'cac';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';
import { simpleGit } from 'simple-git';
import { loadConfig } from '@civicpress/core';
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
  cliStartOperation,
} from '../utils/cli-output.js';

interface SearchOptions {
  content?: string;
  title?: string;
  description?: string;
  tags?: string;
  status?: string;
  type?: string;
  author?: string;
  date?: string;
  git?: string;
  caseSensitive?: boolean;
  regex?: boolean;
  limit?: number;
  format?: 'table' | 'json' | 'list';
}

interface SearchResult {
  path: string;
  type: string;
  title: string;
  status: string;
  matches: {
    field: string;
    value: string;
    context?: string;
  }[];
  metadata: Record<string, any>;
}

export function registerSearchCommand(cli: CAC) {
  cli
    .command(
      'search [query]',
      'Search records by content, metadata, or Git history'
    )
    .option('-c, --content <text>', 'Search in record content')
    .option('-t, --title <text>', 'Search in record titles')
    .option('-d, --description <text>', 'Search in record descriptions')
    .option('--tags <text>', 'Search in record tags')
    .option('-s, --status <status>', 'Filter by record status')
    .option('--type <type>', 'Filter by record type')
    .option('-a, --author <author>', 'Search by author')
    .option(
      '--date <date>',
      'Search by date (YYYY-MM-DD or relative like "1 week ago")'
    )
    .option('-g, --git <text>', 'Search in Git commit messages and history')
    .option('--case-sensitive', 'Case-sensitive search')
    .option('-r, --regex', 'Treat search terms as regular expressions')
    .option('-l, --limit <number>', 'Limit number of results', { default: 50 })
    .option('-f, --format <format>', 'Output format', { default: 'table' })
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (query: string, options: SearchOptions) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('search');

      try {
        const config = await loadConfig();
        if (!config) {
          cliError(
            'No CivicPress configuration found. Run "civic init" first.',
            'NOT_INITIALIZED',
            undefined,
            'search'
          );
          process.exit(1);
        }

        const searchOptions: SearchOptions = {
          ...options,
          caseSensitive: options.caseSensitive || false,
          regex: options.regex || false,
          limit: parseInt(options.limit?.toString() || '50'),
          format: options.format || 'table',
        };

        // If query is provided as first argument, use it as content search
        if (query && !options.content) {
          searchOptions.content = query;
        }

        if (!config.dataDir) {
          throw new Error('dataDir is not configured');
        }
        const results = await searchRecords(config.dataDir, searchOptions);

        const summary = {
          results,
          summary: {
            totalResults: results.length,
            searchOptions: {
              content: searchOptions.content,
              title: searchOptions.title,
              status: searchOptions.status,
              type: searchOptions.type,
              author: searchOptions.author,
              limit: searchOptions.limit,
            },
          },
        };

        cliSuccess(summary, 'Search completed', {
          operation: 'search',
        });

        displayResults(results, searchOptions);
      } catch (error) {
        cliError(
          'Search failed',
          'SEARCH_FAILED',
          {
            error: error instanceof Error ? error.message : String(error),
          },
          'search'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });
}

async function searchRecords(
  dataDir: string,
  options: SearchOptions
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const recordsDir = join(dataDir, 'records');

  try {
    // Get all record files
    const recordFiles = await glob('**/*.md', { cwd: recordsDir });

    for (const file of recordFiles) {
      const filePath = join(recordsDir, file);
      const fileContent = await readFile(filePath, 'utf-8');

      // Parse record metadata
      const metadata = parseRecordMetadata(fileContent);
      const type = file.split('/')[0];
      const title = metadata.title || file.replace(/\.md$/, '');
      const status = metadata.status || 'draft';

      const matches: SearchResult['matches'] = [];

      // Search in content
      if (options.content) {
        const contentMatches = searchInText(
          fileContent,
          options.content,
          options.caseSensitive ?? false,
          options.regex ?? false
        );
        if (contentMatches.length > 0) {
          matches.push(
            ...contentMatches.map((match) => ({
              field: 'content',
              value: match,
              context: getContext(fileContent, match, 100),
            }))
          );
        }
      }

      // Search in title
      if (
        options.title &&
        matchesPattern(
          title,
          options.title,
          options.caseSensitive ?? false,
          options.regex ?? false
        )
      ) {
        matches.push({
          field: 'title',
          value: title,
        });
      }

      // Search in description
      if (options.description && metadata.description) {
        if (
          matchesPattern(
            metadata.description,
            options.description,
            options.caseSensitive ?? false,
            options.regex ?? false
          )
        ) {
          matches.push({
            field: 'description',
            value: metadata.description,
          });
        }
      }

      // Search in tags
      if (options.tags && metadata.tags) {
        const tags = Array.isArray(metadata.tags)
          ? metadata.tags
          : [metadata.tags];
        for (const tag of tags) {
          if (
            matchesPattern(
              tag,
              options.tags,
              options.caseSensitive ?? false,
              options.regex ?? false
            )
          ) {
            matches.push({
              field: 'tags',
              value: tag,
            });
          }
        }
      }

      // Filter by status
      if (options.status) {
        const allowedStatuses = options.status
          .split(',')
          .map((s: string) => s.trim());
        if (!allowedStatuses.includes(status)) {
          continue;
        }
      }

      // Filter by type
      if (options.type && type !== options.type) {
        continue;
      }

      // Search by author
      if (options.author && metadata.author) {
        if (
          matchesPattern(
            metadata.author,
            options.author,
            options.caseSensitive ?? false,
            options.regex ?? false
          )
        ) {
          matches.push({
            field: 'author',
            value: metadata.author,
          });
        }
      }

      // Search by date
      if (options.date && metadata.date) {
        const recordDate = new Date(metadata.date);
        const searchDate = parseDateFilter(options.date);
        if (searchDate && recordDate >= searchDate) {
          matches.push({
            field: 'date',
            value: metadata.date,
          });
        }
      }

      // If we have any matches or no specific search criteria, include the result
      if (
        matches.length > 0 ||
        (!options.content &&
          !options.title &&
          !options.description &&
          !options.tags &&
          !options.author &&
          !options.date &&
          !options.git)
      ) {
        results.push({
          path: file,
          type,
          title,
          status,
          matches,
          metadata,
        });
      }
    }

    // Search in Git history if requested
    if (options.git) {
      const gitResults = await searchGitHistory(
        dataDir,
        options.git,
        options.caseSensitive ?? false,
        options.regex ?? false
      );
      results.push(...gitResults);
    }

    // Remove duplicates and limit results
    const uniqueResults = removeDuplicates(results);
    return uniqueResults.slice(0, options.limit);
  } catch (error) {
    cliError(
      'Error searching records',
      'SEARCH_ERROR',
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'search'
    );
    return [];
  }
}

function parseRecordMetadata(content: string): Record<string, any> {
  const metadata: Record<string, any> = {};

  // Extract frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const lines = frontmatter.split('\n');

    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        const value = valueParts.join(':').trim();
        metadata[key.trim()] = value;
      }
    }
  }

  return metadata;
}

function searchInText(
  text: string,
  searchTerm: string,
  caseSensitive: boolean,
  regex: boolean
): string[] {
  const matches: string[] = [];

  if (regex) {
    try {
      const flags = caseSensitive ? 'g' : 'gi';
      const regexObj = new RegExp(searchTerm, flags);
      const matches_array = text.match(regexObj);
      if (matches_array) {
        matches.push(...matches_array);
      }
    } catch {
      cliWarn(`Invalid regex pattern: ${searchTerm}`, 'search');
    }
  } else {
    const searchText = caseSensitive ? text : text.toLowerCase();
    const searchLower = caseSensitive ? searchTerm : searchTerm.toLowerCase();

    const lines = searchText.split('\n');
    for (const line of lines) {
      if (line.includes(searchLower)) {
        matches.push(line.trim());
      }
    }
  }

  return matches;
}

function matchesPattern(
  text: string,
  pattern: string,
  caseSensitive: boolean,
  regex: boolean
): boolean {
  if (regex) {
    try {
      const flags = caseSensitive ? '' : 'i';
      const regexObj = new RegExp(pattern, flags);
      return regexObj.test(text);
    } catch {
      return false;
    }
  } else {
    const searchText = caseSensitive ? text : text.toLowerCase();
    const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
    return searchText.includes(searchPattern);
  }
}

function getContext(
  text: string,
  match: string,
  contextLength: number
): string {
  const index = text.indexOf(match);
  if (index === -1) return match;

  const start = Math.max(0, index - contextLength / 2);
  const end = Math.min(text.length, index + match.length + contextLength / 2);

  let context = text.substring(start, end);
  if (start > 0) context = '...' + context;
  if (end < text.length) context = context + '...';

  return context;
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

async function searchGitHistory(
  dataDir: string,
  searchTerm: string,
  caseSensitive: boolean,
  regex: boolean
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  try {
    const git = simpleGit(dataDir);
    const log = await git.log();

    for (const commit of log.all) {
      const commitMessage = caseSensitive
        ? commit.message
        : commit.message.toLowerCase();
      const searchLower = caseSensitive ? searchTerm : searchTerm.toLowerCase();

      if (regex) {
        try {
          const regexObj = new RegExp(searchTerm, caseSensitive ? '' : 'i');
          if (regexObj.test(commit.message)) {
            // Find files changed in this commit
            const diff = await git.diff([commit.hash, '--name-only']);
            const changedFiles = diff
              .split('\n')
              .filter((f) => f.endsWith('.md'));

            for (const file of changedFiles) {
              results.push({
                path: file,
                type: file.split('/')[0],
                title: file.replace(/\.md$/, ''),
                status: 'unknown',
                matches: [
                  {
                    field: 'git',
                    value: commit.message,
                    context: `Commit: ${commit.hash.substring(0, 8)}`,
                  },
                ],
                metadata: {
                  commit: commit.hash,
                  author: commit.author_name,
                  date: commit.date,
                },
              });
            }
          }
        } catch {
          // Invalid regex, skip
        }
      } else if (commitMessage.includes(searchLower)) {
        // Find files changed in this commit
        const diff = await git.diff([commit.hash, '--name-only']);
        const changedFiles = diff.split('\n').filter((f) => f.endsWith('.md'));

        for (const file of changedFiles) {
          results.push({
            path: file,
            type: file.split('/')[0],
            title: file.replace(/\.md$/, ''),
            status: 'unknown',
            matches: [
              {
                field: 'git',
                value: commit.message,
                context: `Commit: ${commit.hash.substring(0, 8)}`,
              },
            ],
            metadata: {
              commit: commit.hash,
              author: commit.author_name,
              date: commit.date,
            },
          });
        }
      }
    }
  } catch (error) {
    const logger = initializeLogger();
    logger.warn('Git history search failed:', error);
  }

  return results;
}

function removeDuplicates(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.path}-${result.type}-${result.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function displayResults(results: SearchResult[], options: SearchOptions) {
  const logger = initializeLogger();

  if (results.length === 0) {
    logger.warn('🔍 No records found matching your search criteria.');
    return;
  }

  logger.info(`🔍 Found ${results.length} record(s):\n`);

  switch (options.format) {
    case 'json':
      logger.output(JSON.stringify(results, null, 2));
      break;

    case 'list':
      for (const result of results) {
        logger.info(`📄 ${result.path}`);
        logger.debug(`   Type: ${result.type}`);
        logger.debug(`   Title: ${result.title}`);
        logger.debug(`   Status: ${result.status}`);
        if (result.matches.length > 0) {
          logger.debug(
            `   Matches: ${result.matches.map((m) => `${m.field}: "${m.value}"`).join(', ')}`
          );
        }
        logger.debug('');
      }
      break;

    case 'table':
    default:
      // Simple table format
      logger.output(
        'Path'.padEnd(40) +
          'Type'.padEnd(15) +
          'Title'.padEnd(30) +
          'Status'.padEnd(10) +
          'Matches'
      );
      logger.output('-'.repeat(100));

      for (const result of results) {
        const path =
          result.path.length > 38
            ? result.path.substring(0, 35) + '...'
            : result.path;
        const type = result.type.padEnd(15);
        const title = (
          result.title.length > 28
            ? result.title.substring(0, 25) + '...'
            : result.title
        ).padEnd(30);
        const status = result.status.padEnd(10);
        const matchCount =
          result.matches.length > 0 ? `${result.matches.length} match(es)` : '';

        logger.output(
          `${path.padEnd(40)}${type}${title}${status}${matchCount}`
        );
      }
      break;
  }
}
