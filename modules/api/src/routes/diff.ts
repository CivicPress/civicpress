import { Router, Response } from 'express';
import { simpleGit, SimpleGit } from 'simple-git';
import * as diff from 'diff';

import {
  sendSuccess,
  handleApiError,
  logApiRequest,
} from '../utils/api-logger.js';
import { AuthenticatedRequest, requirePermission } from '../middleware/auth.js';

// Types for diff API
interface DiffOptions {
  commit1?: string;
  commit2?: string;
  format?: 'unified' | 'side-by-side' | 'json';
  context?: number;
  showMetadata?: boolean;
  showContent?: boolean;
  wordLevel?: boolean;
  includeStats?: boolean;
}

interface DiffResult {
  recordId: string;
  type: string;
  commit1: string;
  commit2: string;
  changes: {
    metadata: MetadataChange[];
    content: ContentDiff;
  };
  summary: DiffSummary;
}

interface MetadataChange {
  field: string;
  oldValue?: string;
  newValue?: string;
  type: 'added' | 'removed' | 'modified';
}

interface ContentDiff {
  unified?: string;
  sideBySide?: {
    left: DiffLine[];
    right: DiffLine[];
  };
  wordLevel?: {
    lines: WordLevelLine[];
  };
  stats: {
    linesAdded: number;
    linesRemoved: number;
    wordsAdded: number;
    wordsRemoved: number;
    filesChanged: number;
  };
}

interface DiffLine {
  lineNumber: number;
  content: string;
  type: 'unchanged' | 'added' | 'removed' | 'context';
  wordChanges?: WordChange[];
}

interface WordLevelLine {
  lineNumber: number;
  words: WordChange[];
}

interface WordChange {
  word: string;
  type: 'unchanged' | 'added' | 'removed';
  position: number;
}

interface DiffSummary {
  hasChanges: boolean;
  changeTypes: string[];
  severity: 'none' | 'minor' | 'major';
  totalFiles: number;
  totalChanges: number;
}

interface CommitInfo {
  hash: string;
  shortHash: string;
  date: string;
  author: string;
  message: string;
  changes: string[];
}

export function createDiffRouter() {
  const router = Router();

  // GET /api/diff/:recordId - Compare record versions
  router.get(
    '/:recordId',
    requirePermission('records:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'compare_record_versions' });

      try {
        const { recordId } = req.params;
        const commit1 = (req.query.commit1 as string) || 'HEAD~1';
        const commit2 = (req.query.commit2 as string) || 'HEAD';
        const format = ((req.query.format as string) || 'unified') as
          | 'unified'
          | 'side-by-side'
          | 'json';
        const context = parseInt((req.query.context as string) || '3');
        const showMetadata = req.query.showMetadata !== 'false';
        const showContent = req.query.showContent !== 'false';
        const wordLevel = req.query.wordLevel === 'true';
        const includeStats = req.query.includeStats !== 'false';

        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        const recordPath = recordId.endsWith('.md')
          ? recordId
          : `${recordId}.md`;
        // DEBUG LOGGING
        console.log('[DIFF DEBUG] dataDir:', dataDir);
        console.log('[DIFF DEBUG] recordPath:', recordPath);

        const git = simpleGit(dataDir);

        // Validate commits exist
        try {
          await git.show([commit1]);
          await git.show([commit2]);
        } catch (error) {
          const err = new Error('One or both commits not found');
          (err as any).statusCode = 400;
          (err as any).code = 'COMMIT_NOT_FOUND';
          throw err;
        }

        const result = await compareRecordVersions(
          git,
          recordPath,
          commit1,
          commit2,
          {
            format,
            context: parseInt(context.toString()),
            showMetadata,
            showContent,
            wordLevel,
            includeStats,
          }
        );

        if (!result) {
          const err = new Error('Record not found or no changes');
          (err as any).statusCode = 404;
          (err as any).code = 'NO_CHANGES';
          throw err;
        }

        sendSuccess(result, req, res, {
          operation: 'compare_record_versions',
          meta: {
            recordId,
            commit1,
            commit2,
            hasChanges: result.summary.hasChanges,
          },
        });
      } catch (error) {
        handleApiError(
          'compare_record_versions',
          error,
          req,
          res,
          'Failed to generate diff'
        );
      }
    }
  );

  // GET /api/diff/:recordId/history - Get record commit history
  router.get(
    '/:recordId/history',
    requirePermission('records:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_record_history' });

      try {
        const { recordId } = req.params;
        const { limit = 20, author, since } = req.query;

        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        const recordPath = recordId.endsWith('.md')
          ? recordId
          : `${recordId}.md`;
        // DEBUG LOGGING
        console.log('[DIFF DEBUG] dataDir:', dataDir);
        console.log('[DIFF DEBUG] recordPath:', recordPath);

        const git = simpleGit(dataDir);

        const commits = await getRecordCommitHistory(git, recordPath, {
          limit: parseInt(limit.toString()),
          author: author as string,
          since: since as string,
        });

        sendSuccess(
          {
            recordId,
            commits,
            summary: {
              totalCommits: commits.length,
              firstCommit: commits[commits.length - 1]?.hash,
              lastCommit: commits[0]?.hash,
            },
          },
          req,
          res,
          {
            operation: 'get_record_history',
            meta: {
              recordId,
              totalCommits: commits.length,
            },
          }
        );
      } catch (error) {
        handleApiError(
          'get_record_history',
          error,
          req,
          res,
          'Failed to get commit history'
        );
      }
    }
  );

  // POST /api/diff/bulk - Bulk diff operations
  router.post(
    '/bulk',
    requirePermission('records:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'bulk_diff' });

      try {
        const { records, options = {} } = req.body;

        if (!Array.isArray(records)) {
          const err = new Error('Records must be an array');
          (err as any).statusCode = 400;
          (err as any).code = 'INVALID_INPUT';
          throw err;
        }

        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        // DEBUG LOGGING
        console.log('[DIFF DEBUG] dataDir:', dataDir);
        // Each record will log its own path in the loop below

        const git = simpleGit(dataDir);
        const results: DiffResult[] = [];

        for (const record of records) {
          const { recordId, commit1 = 'HEAD~1', commit2 = 'HEAD' } = record;
          const recordPath = recordId.endsWith('.md')
            ? recordId
            : `${recordId}.md`;
          // DEBUG LOGGING
          console.log('[DIFF DEBUG] recordPath:', recordPath);

          try {
            const result = await compareRecordVersions(
              git,
              recordPath,
              commit1,
              commit2,
              options
            );
            if (result) {
              results.push(result);
            }
          } catch (error) {
            // Continue with other records even if one fails
            console.warn(`Failed to diff record ${recordId}:`, error);
          }
        }

        sendSuccess(
          {
            results,
            summary: {
              totalRecords: records.length,
              successfulDiffs: results.length,
              failedDiffs: records.length - results.length,
            },
          },
          req,
          res,
          {
            operation: 'bulk_diff',
            meta: {
              totalRecords: records.length,
              successfulDiffs: results.length,
              failedDiffs: records.length - results.length,
            },
          }
        );
      } catch (error) {
        handleApiError(
          'bulk_diff',
          error,
          req,
          res,
          'Failed to perform bulk diff'
        );
      }
    }
  );

  // GET /api/diff/commits/:commit1/:commit2 - Compare all records between commits
  router.get(
    '/commits/:commit1/:commit2',
    requirePermission('records:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'compare_commits' });

      try {
        const { commit1, commit2 } = req.params;
        const format = ((req.query.format as string) || 'unified') as
          | 'unified'
          | 'side-by-side'
          | 'json';
        const context = parseInt((req.query.context as string) || '3');
        const showMetadata = req.query.showMetadata !== 'false';
        const showContent = req.query.showContent !== 'false';
        const wordLevel = req.query.wordLevel === 'true';

        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        // DEBUG LOGGING
        console.log('[DIFF DEBUG] dataDir:', dataDir);

        const git = simpleGit(dataDir);

        // Validate commits exist
        try {
          await git.show([commit1]);
          await git.show([commit2]);
        } catch (error) {
          const err = new Error('One or both commits not found');
          (err as any).statusCode = 400;
          (err as any).code = 'COMMIT_NOT_FOUND';
          throw err;
        }

        const changedFiles = await getChangedFiles(git, commit1, commit2);
        const recordFiles = changedFiles.filter((file) => file.endsWith('.md'));

        if (req.query.type) {
          const recordType = req.query.type as string;
          const filteredFiles = recordFiles.filter((file) =>
            file.startsWith(`records/${recordType}/`)
          );
          recordFiles.splice(0, recordFiles.length, ...filteredFiles);
        }

        const results: DiffResult[] = [];

        for (const file of recordFiles) {
          try {
            const result = await compareRecordVersions(
              git,
              file,
              commit1,
              commit2,
              {
                format,
                context: parseInt(context.toString()),
                showMetadata,
                showContent,
                wordLevel,
              }
            );
            if (result) {
              results.push(result);
            }
          } catch (error) {
            console.warn(`Failed to diff file ${file}:`, error);
          }
        }

        sendSuccess(
          {
            commit1,
            commit2,
            results,
            summary: {
              totalFiles: recordFiles.length,
              changedFiles: results.length,
              unchangedFiles: recordFiles.length - results.length,
            },
          },
          req,
          res,
          {
            operation: 'compare_commits',
            meta: {
              commit1,
              commit2,
              totalFiles: recordFiles.length,
              changedFiles: results.length,
            },
          }
        );
      } catch (error) {
        handleApiError(
          'compare_commits',
          error,
          req,
          res,
          'Failed to compare commits'
        );
      }
    }
  );

  return router;
}

// Helper functions
async function compareRecordVersions(
  git: SimpleGit,
  recordPath: string,
  commit1: string,
  commit2: string,
  options: DiffOptions
): Promise<DiffResult | null> {
  try {
    const content1 = await getFileContent(git, recordPath, commit1);
    const content2 = await getFileContent(git, recordPath, commit2);

    if (!content1 && !content2) {
      return null; // File doesn't exist in either commit
    }

    const recordId = recordPath.replace(/\.md$/, '');
    const type = recordPath.split('/')[1] || 'unknown';
    const changes: DiffResult['changes'] = {
      metadata: [],
      content: {
        stats: {
          linesAdded: 0,
          linesRemoved: 0,
          wordsAdded: 0,
          wordsRemoved: 0,
          filesChanged: 1,
        },
      },
    };

    // Compare metadata
    if (options.showMetadata) {
      const metadata1 = content1 ? parseRecordMetadata(content1) : {};
      const metadata2 = content2 ? parseRecordMetadata(content2) : {};
      changes.metadata = compareMetadata(metadata1, metadata2);
    }

    // Compare content
    if (options.showContent && content1 !== content2) {
      changes.content = generateContentDiff(
        content1,
        content2,
        recordPath,
        options
      );
    }

    const summary = generateDiffSummary(changes);

    return {
      recordId,
      type,
      commit1,
      commit2,
      changes,
      summary,
    };
  } catch (error) {
    console.warn(`Error comparing ${recordPath}:`, error);
    return null;
  }
}

function compareMetadata(
  metadata1: Record<string, any>,
  metadata2: Record<string, any>
): MetadataChange[] {
  const changes: MetadataChange[] = [];
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

  return changes;
}

function generateContentDiff(
  content1: string | null,
  content2: string | null,
  recordPath: string,
  options: DiffOptions
): ContentDiff {
  const contentDiff: ContentDiff = {
    stats: {
      linesAdded: 0,
      linesRemoved: 0,
      wordsAdded: 0,
      wordsRemoved: 0,
      filesChanged: 1,
    },
  };

  if (content1 && content2) {
    // Generate unified diff
    contentDiff.unified = diff.createPatch(
      recordPath,
      content1,
      content2,
      `Commit ${options.commit1}`,
      `Commit ${options.commit2}`,
      { context: options.context }
    );

    // Generate side-by-side diff for frontend
    if (options.format === 'side-by-side') {
      contentDiff.sideBySide = generateSideBySideDiff(
        content1,
        content2,
        options.context || 3
      );
    }

    // Generate word-level diff
    if (options.wordLevel) {
      contentDiff.wordLevel = generateWordLevelDiff(content1, content2);
    }

    // Calculate statistics
    const diffResult = diff.diffLines(content1, content2);

    let linesAdded = 0;
    let linesRemoved = 0;
    let wordsAdded = 0;
    let wordsRemoved = 0;

    for (const change of diffResult) {
      if (change.added) {
        linesAdded += change.count || 0;
        wordsAdded += (change.value.match(/\S+/g) || []).length;
      } else if (change.removed) {
        linesRemoved += change.count || 0;
        wordsRemoved += (change.value.match(/\S+/g) || []).length;
      }
    }

    contentDiff.stats = {
      linesAdded,
      linesRemoved,
      wordsAdded,
      wordsRemoved,
      filesChanged: 1,
    };
  } else if (content1) {
    // File was deleted
    contentDiff.unified = `--- ${recordPath}\n+++ /dev/null\n@@ -1,${content1.split('\n').length} +0,0 @@\n${content1
      .split('\n')
      .map((line) => `-${line}`)
      .join('\n')}`;
    contentDiff.stats.linesRemoved = content1.split('\n').length;
  } else if (content2) {
    // File was created
    contentDiff.unified = `--- /dev/null\n+++ ${recordPath}\n@@ -0,0 +1,${content2.split('\n').length} @@\n${content2
      .split('\n')
      .map((line) => `+${line}`)
      .join('\n')}`;
    contentDiff.stats.linesAdded = content2.split('\n').length;
  }

  return contentDiff;
}

function generateSideBySideDiff(
  content1: string,
  content2: string,
  context: number
): { left: DiffLine[]; right: DiffLine[] } {
  const diffResult = diff.diffLines(content1, content2);

  const left: DiffLine[] = [];
  const right: DiffLine[] = [];
  let lineNumber1 = 1;
  let lineNumber2 = 1;

  for (const change of diffResult) {
    const lines = change.value.split('\n').slice(0, -1); // Remove empty line at end

    if (change.added) {
      // Only in right side
      for (let i = 0; i < lines.length; i++) {
        left.push({ lineNumber: 0, content: '', type: 'context' });
        right.push({
          lineNumber: lineNumber2++,
          content: lines[i],
          type: 'added',
        });
      }
    } else if (change.removed) {
      // Only in left side
      for (let i = 0; i < lines.length; i++) {
        left.push({
          lineNumber: lineNumber1++,
          content: lines[i],
          type: 'removed',
        });
        right.push({ lineNumber: 0, content: '', type: 'context' });
      }
    } else {
      // Unchanged in both sides
      for (let i = 0; i < lines.length; i++) {
        left.push({
          lineNumber: lineNumber1++,
          content: lines[i],
          type: 'unchanged',
        });
        right.push({
          lineNumber: lineNumber2++,
          content: lines[i],
          type: 'unchanged',
        });
      }
    }
  }

  return { left, right };
}

function generateWordLevelDiff(
  content1: string,
  content2: string
): { lines: WordLevelLine[] } {
  const lines1 = content1.split('\n');
  const lines2 = content2.split('\n');
  const lines: WordLevelLine[] = [];

  for (let i = 0; i < Math.max(lines1.length, lines2.length); i++) {
    const line1 = lines1[i] || '';
    const line2 = lines2[i] || '';

    if (line1 !== line2) {
      const wordDiff = diff.diffWords(line1, line2);
      const words: WordChange[] = [];
      let position = 0;

      for (const change of wordDiff) {
        if (change.added) {
          words.push({
            word: change.value,
            type: 'added',
            position: position++,
          });
        } else if (change.removed) {
          words.push({
            word: change.value,
            type: 'removed',
            position: position++,
          });
        } else {
          const wordList = change.value.split(/(\s+)/);
          for (const word of wordList) {
            if (word.trim()) {
              words.push({ word, type: 'unchanged', position: position++ });
            }
          }
        }
      }

      lines.push({ lineNumber: i + 1, words });
    } else {
      lines.push({
        lineNumber: i + 1,
        words: [{ word: line1, type: 'unchanged', position: 0 }],
      });
    }
  }

  return { lines };
}

function generateDiffSummary(changes: DiffResult['changes']): DiffSummary {
  const hasChanges: boolean =
    changes.metadata.length > 0 ||
    (changes.content.unified !== undefined &&
      changes.content.unified.length > 0);
  const changeTypes: string[] = [];

  if (changes.metadata.length > 0) changeTypes.push('metadata');
  if (changes.content.unified !== undefined) changeTypes.push('content');

  let severity: 'none' | 'minor' | 'major' = 'none';
  if (hasChanges) {
    const totalChanges =
      changes.metadata.length +
      (changes.content.stats.linesAdded + changes.content.stats.linesRemoved);
    if (totalChanges > 10) severity = 'major';
    else if (totalChanges > 3) severity = 'minor';
    else severity = 'minor';
  }

  return {
    hasChanges,
    changeTypes,
    severity,
    totalFiles: 1,
    totalChanges:
      changes.metadata.length +
      (changes.content.stats.linesAdded + changes.content.stats.linesRemoved),
  };
}

async function getRecordCommitHistory(
  git: SimpleGit,
  filePath: string,
  options: { limit: number; author?: string; since?: string }
): Promise<CommitInfo[]> {
  try {
    const logOptions: any = {
      file: filePath,
      maxCount: options.limit,
    };

    if (options.author) {
      logOptions.author = options.author;
    }

    if (options.since) {
      logOptions.since = options.since;
    }

    const log = await git.log(logOptions);
    const commits: CommitInfo[] = [];

    for (const commit of log.all) {
      const changes = await getCommitChanges(git, commit.hash, filePath);

      commits.push({
        hash: commit.hash,
        shortHash: commit.hash.substring(0, 8),
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

async function getFileContent(
  git: SimpleGit,
  filePath: string,
  commit: string
): Promise<string | null> {
  try {
    const content = await git.show([`${commit}:${filePath}`]);
    return content || null;
  } catch (error) {
    return null;
  }
}

async function getChangedFiles(
  git: SimpleGit,
  commit1: string,
  commit2: string
): Promise<string[]> {
  try {
    const diff = await git.diff([`${commit1}..${commit2}`, '--name-only']);
    return diff.split('\n').filter((file) => file.trim());
  } catch (error) {
    console.warn('Error getting changed files:', error);
    return [];
  }
}

function parseRecordMetadata(content: string): Record<string, any> {
  const metadata: Record<string, any> = {};

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
