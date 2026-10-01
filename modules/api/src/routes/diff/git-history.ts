import { SimpleGit } from 'simple-git';
import { coreError } from '@civicpress/core';
import { HttpError } from '../../utils/http-error.js';
import { CommitInfo } from './types.js';
import { assertRevision } from './revision.js';

/**
 * `--author` / `--since` for `git.log()`, only for the filters supplied.
 *
 * The keys carry their dashes on purpose. simple-git passes an option it does
 * not know as `<key>=<value>`, so `{ author: 'x' }` reached git as the
 * ARGUMENT `author=x` — a revision that does not exist — and the request
 * failed. Both filters have answered 500 whenever they were used. With the
 * dashes it is `--author=x`, and because the value rides inside that one
 * argument it cannot start an option of its own.
 */
export function historyFilterOptions(
  author: unknown,
  since: unknown
): Record<string, string> {
  return {
    ...(typeof author === 'string' && author ? { '--author': author } : {}),
    ...(typeof since === 'string' && since ? { '--since': since } : {}),
  };
}

export async function getRecordCommitHistory(
  git: SimpleGit,
  filePath: string,
  options: { limit: number; author?: string; since?: string }
): Promise<CommitInfo[]> {
  try {
    const log = await git.log({
      file: filePath,
      maxCount: options.limit,
      ...historyFilterOptions(options.author, options.since),
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
    coreError(
      'Error getting commit history',
      'DIFF_HISTORY_ERROR',
      {
        error: error instanceof Error ? error.message : String(error),
        filePath,
      },
      { operation: 'diff:history' }
    );
    return [];
  }
}

export async function getCommitChanges(
  git: SimpleGit,
  commitHash: string,
  filePath: string
): Promise<string[]> {
  try {
    const diff = await git.diff([assertRevision(commitHash), '--', filePath]);
    return diff
      .split('\n')
      .filter((line) => line.startsWith('+') || line.startsWith('-'));
  } catch (error) {
    coreError(
      'Error getting commit changes',
      'DIFF_COMMIT_CHANGES_ERROR',
      {
        error: error instanceof Error ? error.message : String(error),
        commitHash,
        filePath,
      },
      { operation: 'diff:commit-changes' }
    );
    return [];
  }
}

export async function getFileContent(
  git: SimpleGit,
  filePath: string,
  commit: string
): Promise<string | null> {
  try {
    return await git.show([`${assertRevision(commit)}:${filePath}`]);
  } catch (error) {
    // A malformed revision is the caller's error, not a missing file.
    if (error instanceof HttpError) throw error;
    // File doesn't exist in this commit
    return null;
  }
}

export async function getChangedFiles(
  git: SimpleGit,
  commit1: string,
  commit2: string
): Promise<string[]> {
  try {
    const diff = await git.diff([
      assertRevision(commit1),
      assertRevision(commit2),
      '--name-only',
    ]);
    return diff.split('\n').filter((file) => file.trim());
  } catch (error) {
    coreError(
      'Error getting changed files',
      'DIFF_CHANGED_FILES_ERROR',
      {
        error: error instanceof Error ? error.message : String(error),
        commit1,
        commit2,
      },
      { operation: 'diff:changed-files' }
    );
    return [];
  }
}
