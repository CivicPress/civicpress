import { CAC } from 'cac';
import { simpleGit, SimpleGit } from 'simple-git';
import { loadConfig, parseRecordRelativePath } from '@civicpress/core';
import chalk from 'chalk';
import * as diff from 'diff';
import * as readline from 'readline';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';
import {
  getAvailableRecords,
  resolveRecordReference,
} from '../utils/record-locator.js';

interface DiffOptions {
  record?: string;
  commit1?: string;
  commit2?: string;
  format?: 'unified' | 'side-by-side' | 'json';
  context?: number;
  showMetadata?: boolean;
  showContent?: boolean;
  color?: boolean;
  content?: boolean;
  metadata?: boolean;
  interactive?: boolean;
}

interface DiffResult {
  record: string;
  type: string;
  changes: {
    field: string;
    oldValue?: string;
    newValue?: string;
    type: 'added' | 'removed' | 'modified';
  }[];
  contentDiff?: string;
  metadataDiff?: string;
}

interface CommitInfo {
  hash: string;
  date: string;
  author: string;
  message: string;
  changes: string[];
}

function resolveRecordPath(
  dataDir: string,
  recordRef: string
): { relativePath: string; displayPath: string } | null {
  const resolved = resolveRecordReference(dataDir, recordRef);
  if (!resolved) {
    return null;
  }

  const relativePath = resolved.relativePath.replace(/\\/g, '/');
  const displayPath = relativePath.replace(/^records\//, '');
  return {
    relativePath,
    displayPath,
  };
}

export function registerDiffCommand(cli: CAC) {
  cli
    .command(
      'diff [record]',
      'Compare record versions or show changes between commits'
    )
    .option(
      '-c1, --commit1 <commit>',
      'First commit/reference (default: HEAD~1)'
    )
    .option(
      '-c2, --commit2 <commit>',
      'Second commit/reference (default: HEAD)'
    )
    .option('-f, --format <format>', 'Output format', { default: 'unified' })
    .option('-C, --context <lines>', 'Number of context lines', { default: 3 })
    .option('--metadata', 'Show metadata changes only')
    .option('--content', 'Show content changes only')
    .option('--no-color', 'Disable colored output')
    .option(
      '-i, --interactive',
      'Interactive mode - show commit history and select version'
    )
    .action(async (record: string, options: DiffOptions) => {
      // Initialize logger with global options
      const globalOptions = getGlobalOptionsFromArgs();
      const logger = initializeLogger();

      try {
        const config = await loadConfig();
        if (!config) {
          logger.error(
            '❌ No CivicPress configuration found. Run "civic init" first.'
          );
          process.exit(1);
        }

        const diffOptions: DiffOptions = {
          ...options,
          format: options.format || 'unified',
          context: parseInt(options.context?.toString() || '3'),
          showMetadata: options.showMetadata !== false,
          showContent: options.showContent !== false,
          color: options.color !== false,
          content: options.content || false,
          metadata: options.metadata || false,
          interactive: options.interactive || false,
        };

        // Check if we should output JSON
        const shouldOutputJson = globalOptions.json;

        // Handle content-only and metadata-only flags
        if (options.content) {
          diffOptions.showMetadata = false;
        }
        if (options.metadata) {
          diffOptions.showContent = false;
        }

        // If record is provided as first argument, use it
        if (record && !options.record) {
          diffOptions.record = record;
        }

        // Handle interactive mode
        if (diffOptions.interactive && diffOptions.record) {
          if (!config.dataDir) {
            throw new Error('dataDir is not configured');
          }
          await handleInteractiveDiff(config.dataDir, diffOptions);
        } else {
          if (!config.dataDir) {
            throw new Error('dataDir is not configured');
          }
          const results = await compareRecords(config.dataDir, diffOptions);
          displayDiffResults(results, diffOptions, shouldOutputJson);
        }
      } catch (error) {
        logger.error('❌ Diff failed:', error);
        process.exit(1);
      }
    });
}

async function handleInteractiveDiff(dataDir: string, options: DiffOptions) {
  const logger = initializeLogger();
  const git = simpleGit(dataDir);
  const resolved = resolveRecordPath(dataDir, options.record!);

  if (!resolved) {
    logger.error(`❌ Record "${options.record}" not found.`);
    const availableRecords = getAvailableRecords(dataDir);
    const entries = Object.entries(availableRecords);
    if (entries.length > 0) {
      logger.info('Available records:');
      for (const [type, files] of entries) {
        if (files.length === 0) continue;
        for (const file of files) {
          logger.debug(`  ${type}/${file}`);
        }
      }
    }
    return;
  }

  const recordPath = resolved.relativePath;

  try {
    // Get commit history for this file
    const commits = await getFileCommitHistory(git, recordPath);

    if (commits.length === 0) {
      logger.warn('📄 No commit history found for this record.');
      return;
    }

    logger.info(`📄 Record: ${recordPath}`);
    logger.info(`📜 Found ${commits.length} commits with changes:\n`);

    // Display commit history
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const date = new Date(commit.date).toLocaleDateString();
      const time = new Date(commit.date).toLocaleTimeString();

      logger.info(`${i + 1}. ${commit.hash.substring(0, 8)}`);
      logger.info(`   📅 ${date} ${time}`);
      logger.info(`   👤 ${commit.author}`);
      logger.info(`   💬 ${commit.message}`);

      if (commit.changes.length > 0) {
        logger.info(`   📝 Changes: ${commit.changes.join(', ')}`);
      }
      logger.info('');
    }

    // Get user selection
    const selectedCommit = await promptForCommitSelection(commits.length);
    if (selectedCommit === null) {
      logger.error('❌ No selection made.');
      return;
    }

    const selectedCommitInfo = commits[selectedCommit - 1];
    logger.info(
      `\n🔍 Comparing current version with commit ${selectedCommitInfo.hash.substring(0, 8)}...\n`
    );

    // Compare with current version
    const result = await compareSingleRecord(
      git,
      recordPath,
      selectedCommitInfo.hash,
      'HEAD',
      options
    );

    if (result) {
      displayDiffResults([result], options);
    } else {
      logger.info('🔍 No differences found.');
    }
  } catch (error) {
    logger.error('Error in interactive diff:', error);
  }
}

async function getFileCommitHistory(
  git: SimpleGit,
  filePath: string
): Promise<CommitInfo[]> {
  try {
    const log = await git.log({
      file: filePath,
      maxCount: 20,
    });

    const commits: CommitInfo[] = [];

    for (const commit of log.all) {
      // Get what changed in this commit for this file
      const changes = await getCommitChanges(git, commit.hash, filePath);

      commits.push({
        hash: commit.hash,
        date: commit.date,
        author: commit.author_name,
        message: commit.message,
        changes,
      });
    }

    return commits;
  } catch (error) {
    console.warn('Error getting file commit history:', error);
    return [];
  }
}

async function getCommitChanges(
  git: SimpleGit,
  commitHash: string,
  filePath: string
): Promise<string[]> {
  try {
    const diff = await git.diff([
      `${commitHash}~1..${commitHash}`,
      '--name-status',
      filePath,
    ]);
    const changes: string[] = [];

    if (diff.includes('A')) changes.push('created');
    if (diff.includes('M')) changes.push('modified');
    if (diff.includes('D')) changes.push('deleted');
    if (diff.includes('R')) changes.push('renamed');

    return changes;
  } catch (error) {
    return [];
  }
}

async function promptForCommitSelection(
  maxCommits: number
): Promise<number | null> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      chalk.yellow(`Select a commit (1-${maxCommits}) or 'q' to quit: `),
      (answer) => {
        rl.close();

        if (answer.toLowerCase() === 'q') {
          resolve(null);
          return;
        }

        const selection = parseInt(answer);
        if (isNaN(selection) || selection < 1 || selection > maxCommits) {
          console.log(
            chalk.red(
              '❌ Invalid selection. Please enter a number between 1 and',
              maxCommits
            )
          );
          resolve(null);
          return;
        }

        resolve(selection);
      }
    );
  });
}

async function compareRecords(
  dataDir: string,
  options: DiffOptions
): Promise<DiffResult[]> {
  const results: DiffResult[] = [];
  const git = simpleGit(dataDir);

  try {
    // Get commit references
    const commit1 = options.commit1 || 'HEAD~1';
    const commit2 = options.commit2 || 'HEAD';

    // If specific record is provided, compare that record
    if (options.record) {
      const resolved = resolveRecordPath(dataDir, options.record);
      if (!resolved) {
        return [];
      }
      const result = await compareSingleRecord(
        git,
        resolved.relativePath,
        commit1,
        commit2,
        options
      );
      if (result) {
        results.push(result);
      }
    } else {
      // Compare all changed records between commits
      const changedFiles = await getChangedFiles(git, commit1, commit2);
      const recordFiles = changedFiles.filter((file) => file.endsWith('.md'));

      for (const file of recordFiles) {
        const result = await compareSingleRecord(
          git,
          file,
          commit1,
          commit2,
          options
        );
        if (result) {
          results.push(result);
        }
      }
    }

    return results;
  } catch (error) {
    console.error('Error comparing records:', error);
    return [];
  }
}

async function compareSingleRecord(
  git: SimpleGit,
  recordPath: string,
  commit1: string,
  commit2: string,
  options: DiffOptions
): Promise<DiffResult | null> {
  const logger = initializeLogger();
  try {
    // Get file content at both commits
    const content1 = await getFileContent(git, recordPath, commit1);
    const content2 = await getFileContent(git, recordPath, commit2);

    if (!content1 && !content2) {
      return null; // File doesn't exist in either commit
    }

    const parsedPath = parseRecordRelativePath(recordPath);
    const type = parsedPath.type || 'unknown';
    const changes: DiffResult['changes'] = [];

    // Parse metadata from both versions
    const metadata1 = content1 ? parseRecordMetadata(content1) : {};
    const metadata2 = content2 ? parseRecordMetadata(content2) : {};

    // Compare metadata fields
    if (options.showMetadata) {
      const allKeys = new Set([
        ...Object.keys(metadata1),
        ...Object.keys(metadata2),
      ]);

      for (const key of allKeys) {
        const value1 = metadata1[key];
        const value2 = metadata2[key];

        if (value1 !== value2) {
          if (value1 === undefined) {
            changes.push({
              field: key,
              newValue: value2,
              type: 'added',
            });
          } else if (value2 === undefined) {
            changes.push({
              field: key,
              oldValue: value1,
              type: 'removed',
            });
          } else {
            changes.push({
              field: key,
              oldValue: value1,
              newValue: value2,
              type: 'modified',
            });
          }
        }
      }
    }

    // Compare content
    let contentDiff: string | undefined;
    if (options.showContent && content1 !== content2) {
      if (content1 && content2) {
        contentDiff = diff.createPatch(
          recordPath,
          content1,
          content2,
          `Commit ${commit1}`,
          `Commit ${commit2}`,
          { context: options.context }
        );
      } else if (content1) {
        contentDiff = `--- ${recordPath}\n+++ /dev/null\n@@ -1,${content1.split('\n').length} +0,0 @@\n${content1
          .split('\n')
          .map((line) => `-${line}`)
          .join('\n')}`;
      } else if (content2) {
        contentDiff = `--- /dev/null\n+++ ${recordPath}\n@@ -0,0 +1,${content2.split('\n').length} @@\n${content2
          .split('\n')
          .map((line) => `+${line}`)
          .join('\n')}`;
      }
    }

    return {
      record: recordPath,
      type,
      changes,
      contentDiff,
      metadataDiff:
        changes.length > 0 ? formatMetadataDiff(changes) : undefined,
    };
  } catch (error) {
    logger.warn(`Error comparing ${recordPath}:`, error);
    return null;
  }
}

async function getFileContent(
  git: SimpleGit,
  filePath: string,
  commit: string
): Promise<string | null> {
  try {
    const content = await git.show([`${commit}:${filePath}`]);
    return content || null;
  } catch (error) {
    // File doesn't exist in this commit
    return null;
  }
}

async function getChangedFiles(
  git: SimpleGit,
  commit1: string,
  commit2: string
): Promise<string[]> {
  const logger = initializeLogger();
  try {
    const diff = await git.diff([`${commit1}..${commit2}`, '--name-only']);
    return diff.split('\n').filter((file) => file.trim());
  } catch (error) {
    logger.warn('Error getting changed files:', error);
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

function formatMetadataDiff(changes: DiffResult['changes']): string {
  const lines: string[] = [];

  for (const change of changes) {
    switch (change.type) {
      case 'added':
        lines.push(`+ ${change.field}: ${change.newValue}`);
        break;
      case 'removed':
        lines.push(`- ${change.field}: ${change.oldValue}`);
        break;
      case 'modified':
        lines.push(`- ${change.field}: ${change.oldValue}`);
        lines.push(`+ ${change.field}: ${change.newValue}`);
        break;
    }
  }

  return lines.join('\n');
}

function displayDiffResults(
  results: DiffResult[],
  options: DiffOptions,
  shouldOutputJson?: boolean
) {
  const logger = initializeLogger();
  if (shouldOutputJson) {
    console.log(
      JSON.stringify(
        {
          results,
          summary: {
            totalRecords: results.length,
            options: {
              commit1: options.commit1 || 'HEAD~1',
              commit2: options.commit2 || 'HEAD',
              record: options.record,
              showMetadata: options.showMetadata,
              showContent: options.showContent,
            },
          },
        },
        null,
        2
      )
    );
    return;
  }

  if (results.length === 0) {
    logger.info('🔍 No differences found.');
    return;
  }

  logger.info(`🔍 Found ${results.length} record(s) with changes:\n`);

  for (const result of results) {
    logger.info(`📄 ${result.record}`);
    logger.info(`   Type: ${result.type}`);

    if (result.changes.length > 0) {
      logger.info('\n   📋 Metadata Changes:');
      for (const change of result.changes) {
        switch (change.type) {
          case 'added':
            logger.info(`     + ${change.field}: ${change.newValue}`);
            break;
          case 'removed':
            logger.error(`     - ${change.field}: ${change.oldValue}`);
            break;
          case 'modified':
            logger.error(`     - ${change.field}: ${change.oldValue}`);
            logger.info(`     + ${change.field}: ${change.newValue}`);
            break;
        }
      }
    }

    if (result.contentDiff) {
      logger.info('\n   📝 Content Changes:');

      if (options.format === 'json') {
        logger.info(
          JSON.stringify(
            {
              record: result.record,
              type: result.type,
              changes: result.changes,
              contentDiff: result.contentDiff,
            },
            null,
            2
          )
        );
      } else {
        // Display unified diff with colors
        const lines = result.contentDiff.split('\n');
        for (const line of lines) {
          if (line.startsWith('+') && !line.startsWith('+++')) {
            logger.info(`     ${line}`);
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            logger.error(`     ${line}`);
          } else if (line.startsWith('@')) {
            logger.info(`     ${line}`);
          } else {
            logger.info(`     ${line}`);
          }
        }
      }
    }

    logger.info('\n' + '─'.repeat(60) + '\n');
  }
}

// Export for testing
export { compareRecords, compareSingleRecord };
