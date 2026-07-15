import { SimpleGit } from 'simple-git';
import { parseRecordRelativePath, coreError } from '@civicpress/core';
import {
  ContentDiff,
  DiffLine,
  DiffOptions,
  DiffResult,
  DiffSummary,
  MetadataChange,
  WordChange,
  WordLevelLine,
} from './types.js';
import { getFileContent } from './git-history.js';
import { parseRecordMetadata } from './record-paths.js';

export async function compareRecordVersions(
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

    const parsedPath = parseRecordRelativePath(recordPath);

    return {
      recordId: parsedPath.id || recordPath.replace('.md', ''),
      type: parsedPath.type || 'record',
      commit1,
      commit2,
      changes: {
        metadata: metadataChanges,
        content: contentDiff,
      },
      summary,
    };
  } catch (error) {
    coreError(
      'Error comparing record versions',
      'DIFF_COMPARE_ERROR',
      {
        error: error instanceof Error ? error.message : String(error),
        recordPath,
        commit1,
        commit2,
      },
      { operation: 'diff:compare' }
    );
    return null;
  }
}

export function compareMetadata(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata1: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export function generateContentDiff(
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

export function generateUnifiedDiff(
  content1: string,
  content2: string,
  _context: number
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

export function generateSideBySideDiff(
  content1: string,
  content2: string,
  _context: number
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

export function generateWordLevelDiff(
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

export function generateDiffSummary(
  changes: DiffResult['changes']
): DiffSummary {
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
