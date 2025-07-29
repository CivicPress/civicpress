import { Router, Response } from 'express';
import { param, query, validationResult } from 'express-validator';
import { simpleGit, SimpleGit } from 'simple-git';
import {
  sendSuccess,
  logApiRequest,
  handleApiError,
} from '../utils/api-logger';
import { requirePermission } from '../middleware/auth';
import { AuthenticatedRequest } from '../middleware/auth';

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
    [
      param('recordId')
        .isString()
        .notEmpty()
        .withMessage('Record ID is required'),
      query('commit1')
        .isString()
        .notEmpty()
        .withMessage('Commit 1 is required'),
      query('commit2')
        .isString()
        .notEmpty()
        .withMessage('Commit 2 is required'),
      query('format')
        .optional()
        .isIn(['unified', 'side-by-side', 'json'])
        .withMessage('Format must be unified, side-by-side, or json'),
      query('context')
        .optional()
        .isInt({ min: 0, max: 10 })
        .withMessage('Context must be between 0 and 10'),
      query('showMetadata')
        .optional()
        .isBoolean()
        .withMessage('showMetadata must be a boolean'),
      query('showContent')
        .optional()
        .isBoolean()
        .withMessage('showContent must be a boolean'),
      query('wordLevel')
        .optional()
        .isBoolean()
        .withMessage('wordLevel must be a boolean'),
      query('includeStats')
        .optional()
        .isBoolean()
        .withMessage('includeStats must be a boolean'),
    ],
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'compare_record_versions' });

      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: {
              message: 'Validation failed',
              details: errors.array(),
            },
          });
        }

        const { recordId } = req.params;
        const {
          commit1,
          commit2,
          format = 'unified',
          context = 3,
          showMetadata = true,
          showContent = true,
          wordLevel = false,
          includeStats = true,
        } = req.query;

        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        const recordPath = recordId.endsWith('.md')
          ? recordId
          : `${recordId}.md`;

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
            total: commits.length,
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
          'Failed to get record history'
        );
      }
    }
  );

  // GET /api/diff/:recordId/commits - Get commits that modified the record
  router.get(
    '/:recordId/commits',
    requirePermission('records:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_record_commits' });

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

        const git = simpleGit(dataDir);

        // Get commits that modified this file
        const log = await git.log({
          file: recordPath,
          maxCount: parseInt(limit.toString()),
          author: author as string,
          since: since as string,
        });

        const commits = log.all.map((commit) => ({
          hash: commit.hash,
          shortHash: commit.hash.substring(0, 7),
          date: commit.date,
          author: commit.author_name,
          message: commit.message,
          changes: commit.diff?.files?.map((file) => file.file) || [],
        }));

        sendSuccess(
          {
            recordId,
            commits,
            total: commits.length,
          },
          req,
          res,
          {
            operation: 'get_record_commits',
            meta: {
              recordId,
              totalCommits: commits.length,
            },
          }
        );
      } catch (error) {
        handleApiError(
          'get_record_commits',
          error,
          req,
          res,
          'Failed to get record commits'
        );
      }
    }
  );

  // GET /api/diff/:recordId/versions - Get all versions of a record
  router.get(
    '/:recordId/versions',
    requirePermission('records:view'),
    async (req: AuthenticatedRequest, res: Response) => {
      logApiRequest(req, { operation: 'get_record_versions' });

      try {
        const { recordId } = req.params;
        const { limit = 20 } = req.query;

        const civicPress = (req as any).civicPress;
        if (!civicPress) {
          throw new Error('CivicPress not initialized');
        }

        const dataDir = civicPress.getDataDir();
        const recordPath = recordId.endsWith('.md')
          ? recordId
          : `${recordId}.md`;

        const git = simpleGit(dataDir);

        // Get all commits that modified this file
        const log = await git.log({
          file: recordPath,
          maxCount: parseInt(limit.toString()),
        });

        const versions = await Promise.all(
          log.all.map(async (commit) => {
            const content = await getFileContent(git, recordPath, commit.hash);
            const metadata = content ? parseRecordMetadata(content) : {};

            return {
              commit: {
                hash: commit.hash,
                shortHash: commit.hash.substring(0, 7),
                date: commit.date,
                author: commit.author_name,
                message: commit.message,
              },
              content,
              metadata,
            };
          })
        );

        sendSuccess(
          {
            recordId,
            versions,
            total: versions.length,
          },
          req,
          res,
          {
            operation: 'get_record_versions',
            meta: {
              recordId,
              totalVersions: versions.length,
            },
          }
        );
      } catch (error) {
        handleApiError(
          'get_record_versions',
          error,
          req,
          res,
          'Failed to get record versions'
        );
      }
    }
  );

  return router;
}

async function compareRecordVersions(
  git: SimpleGit,
  recordPath: string,
  commit1: string,
  commit2: string,
  options: DiffOptions
): Promise<DiffResult | null> {
  try {
    // Get file content from both commits
    const content1 = await getFileContent(git, recordPath, commit1);
    const content2 = await getFileContent(git, recordPath, commit2);

    // If file doesn't exist in either commit, return null
    if (!content1 && !content2) {
      return null;
    }

    // Parse metadata from both versions
    const metadata1 = content1 ? parseRecordMetadata(content1) : {};
    const metadata2 = content2 ? parseRecordMetadata(content2) : {};

    // Compare metadata
    const metadataChanges = options.showMetadata
      ? compareMetadata(metadata1, metadata2)
      : [];

    // Compare content
    const contentDiff = options.showContent
      ? generateContentDiff(content1, content2, recordPath, options)
      : {
          stats: {
            linesAdded: 0,
            linesRemoved: 0,
            wordsAdded: 0,
            wordsRemoved: 0,
            filesChanged: 0,
          },
        };

    // Generate summary
    const summary = generateDiffSummary({
      metadata: metadataChanges,
      content: contentDiff,
    });

    return {
      recordId: recordPath.replace('.md', ''),
      type: 'record',
      commit1,
      commit2,
      changes: {
        metadata: metadataChanges,
        content: contentDiff,
      },
      summary,
    };
  } catch (error) {
    console.error('Error comparing record versions:', error);
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
  const content1Clean = content1
    ? content1.replace(/^---\n[\s\S]*?\n---\n/, '')
    : '';
  const content2Clean = content2
    ? content2.replace(/^---\n[\s\S]*?\n---\n/, '')
    : '';

  const result: ContentDiff = {
    stats: {
      linesAdded: 0,
      linesRemoved: 0,
      wordsAdded: 0,
      wordsRemoved: 0,
      filesChanged: 0,
    },
  };

  if (options.format === 'unified') {
    result.unified = generateUnifiedDiff(
      content1Clean,
      content2Clean,
      options.context || 3
    );
  } else if (options.format === 'side-by-side') {
    result.sideBySide = generateSideBySideDiff(
      content1Clean,
      content2Clean,
      options.context || 3
    );
  }

  if (options.wordLevel) {
    result.wordLevel = generateWordLevelDiff(content1Clean, content2Clean);
  }

  // Calculate basic stats
  const lines1 = content1Clean.split('\n');
  const lines2 = content2Clean.split('\n');
  result.stats.linesAdded = Math.max(0, lines2.length - lines1.length);
  result.stats.linesRemoved = Math.max(0, lines1.length - lines2.length);
  result.stats.filesChanged = content1 !== content2 ? 1 : 0;

  return result;
}

function generateUnifiedDiff(
  content1: string,
  content2: string,
  context: number
): string {
  const lines1 = content1.split('\n');
  const lines2 = content2.split('\n');
  const diff: string[] = [];

  // Simple unified diff generation
  diff.push('--- a/record.md');
  diff.push('+++ b/record.md');
  diff.push('@@ -1,' + lines1.length + ' +1,' + lines2.length + ' @@');

  for (let i = 0; i < Math.max(lines1.length, lines2.length); i++) {
    const line1 = lines1[i] || '';
    const line2 = lines2[i] || '';

    if (line1 === line2) {
      diff.push(' ' + line1);
    } else {
      if (line1) diff.push('-' + line1);
      if (line2) diff.push('+' + line2);
    }
  }

  return diff.join('\n');
}

function generateSideBySideDiff(
  content1: string,
  content2: string,
  context: number
): { left: DiffLine[]; right: DiffLine[] } {
  const lines1 = content1.split('\n');
  const lines2 = content2.split('\n');
  const left: DiffLine[] = [];
  const right: DiffLine[] = [];

  const maxLines = Math.max(lines1.length, lines2.length);

  for (let i = 0; i < maxLines; i++) {
    const line1 = lines1[i] || '';
    const line2 = lines2[i] || '';

    if (line1 === line2) {
      left.push({
        lineNumber: i + 1,
        content: line1,
        type: 'unchanged',
      });
      right.push({
        lineNumber: i + 1,
        content: line2,
        type: 'unchanged',
      });
    } else {
      if (line1) {
        left.push({
          lineNumber: i + 1,
          content: line1,
          type: 'removed',
        });
      }
      if (line2) {
        right.push({
          lineNumber: i + 1,
          content: line2,
          type: 'added',
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

  const maxLines = Math.max(lines1.length, lines2.length);

  for (let i = 0; i < maxLines; i++) {
    const line1 = lines1[i] || '';
    const line2 = lines2[i] || '';

    if (line1 === line2) {
      // No changes in this line
      lines.push({
        lineNumber: i + 1,
        words: line1.split(' ').map((word, index) => ({
          word,
          type: 'unchanged' as const,
          position: index,
        })),
      });
    } else {
      // Simple word-level diff
      const words1 = line1.split(' ');
      const words2 = line2.split(' ');
      const words: WordChange[] = [];

      const maxWords = Math.max(words1.length, words2.length);
      for (let j = 0; j < maxWords; j++) {
        const word1 = words1[j] || '';
        const word2 = words2[j] || '';

        if (word1 === word2) {
          words.push({
            word: word1,
            type: 'unchanged',
            position: j,
          });
        } else {
          if (word1) {
            words.push({
              word: word1,
              type: 'removed',
              position: j,
            });
          }
          if (word2) {
            words.push({
              word: word2,
              type: 'added',
              position: j,
            });
          }
        }
      }

      lines.push({
        lineNumber: i + 1,
        words,
      });
    }
  }

  return { lines };
}

function generateDiffSummary(changes: DiffResult['changes']): DiffSummary {
  const { metadata, content } = changes;
  const changeTypes: string[] = [];

  if (metadata.length > 0) {
    changeTypes.push('metadata');
  }

  if (content.stats.linesAdded > 0 || content.stats.linesRemoved > 0) {
    changeTypes.push('content');
  }

  const hasChanges = changeTypes.length > 0;
  const totalChanges =
    metadata.length + content.stats.linesAdded + content.stats.linesRemoved;

  let severity: 'none' | 'minor' | 'major' = 'none';
  if (totalChanges > 10) {
    severity = 'major';
  } else if (totalChanges > 0) {
    severity = 'minor';
  }

  return {
    hasChanges,
    changeTypes,
    severity,
    totalFiles: 1,
    totalChanges,
  };
}

async function getRecordCommitHistory(
  git: SimpleGit,
  filePath: string,
  options: { limit: number; author?: string; since?: string }
): Promise<CommitInfo[]> {
  try {
    const log = await git.log({
      file: filePath,
      maxCount: options.limit,
      author: options.author,
      since: options.since,
    });

    return log.all.map((commit) => ({
      hash: commit.hash,
      shortHash: commit.hash.substring(0, 7),
      date: commit.date,
      author: commit.author_name,
      message: commit.message,
      changes: commit.diff?.files?.map((file) => file.file) || [],
    }));
  } catch (error) {
    console.error('Error getting commit history:', error);
    return [];
  }
}

async function getCommitChanges(
  git: SimpleGit,
  commitHash: string,
  filePath: string
): Promise<string[]> {
  try {
    const diff = await git.diff([commitHash, '--', filePath]);
    return diff
      .split('\n')
      .filter((line) => line.startsWith('+') || line.startsWith('-'));
  } catch (error) {
    console.error('Error getting commit changes:', error);
    return [];
  }
}

async function getFileContent(
  git: SimpleGit,
  filePath: string,
  commit: string
): Promise<string | null> {
  try {
    return await git.show([`${commit}:${filePath}`]);
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
  try {
    const diff = await git.diff([commit1, commit2, '--name-only']);
    return diff.split('\n').filter((file) => file.trim());
  } catch (error) {
    console.error('Error getting changed files:', error);
    return [];
  }
}

function parseRecordMetadata(content: string): Record<string, any> {
  const metadataMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!metadataMatch) {
    return {};
  }

  const metadataLines = metadataMatch[1].split('\n');
  const metadata: Record<string, any> = {};

  for (const line of metadataLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      metadata[key] = value;
    }
  }

  return metadata;
}
