/**
 * GitEngine history pagination — `getHistory(limit, pathspec, skip)` +
 * `countCommits(pathspec)`.
 *
 * Git history is a log, not a table, so there is nothing to SQL-paginate. What
 * it CAN do is stop over-fetching: the history API used to call `getHistory()`
 * with no limit and `.slice()` a page out of the whole repository log, so
 * per-request memory grew with the age of the repo. `--skip` + `--max-count`
 * return exactly one page, and `rev-list --count` returns the true total
 * without materializing a single commit object.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GitEngine } from '../git-engine.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

describe('GitEngine history pagination', () => {
  let repoDir: string;
  let git: GitEngine;

  // 6 commits total: 5 touching records/a.md, 1 touching records/b.md.
  const TOTAL_COMMITS = 6;
  const A_COMMITS = 5;

  beforeAll(async () => {
    repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'civicpress-githist-'));
    execSync('git init', { cwd: repoDir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', {
      cwd: repoDir,
      stdio: 'ignore',
    });
    execSync('git config user.email "test@example.com"', {
      cwd: repoDir,
      stdio: 'ignore',
    });

    await fs.mkdir(path.join(repoDir, 'records'), { recursive: true });

    for (let i = 1; i <= A_COMMITS; i++) {
      await fs.writeFile(path.join(repoDir, 'records', 'a.md'), `v${i}\n`);
      execSync('git add -A', { cwd: repoDir, stdio: 'ignore' });
      execSync(`git commit -m "commit ${i} on a"`, {
        cwd: repoDir,
        stdio: 'ignore',
      });
    }

    await fs.writeFile(path.join(repoDir, 'records', 'b.md'), 'b\n');
    execSync('git add -A', { cwd: repoDir, stdio: 'ignore' });
    execSync('git commit -m "commit on b"', { cwd: repoDir, stdio: 'ignore' });

    git = new GitEngine(repoDir);
    await git.initialize();
  }, 60000);

  afterAll(async () => {
    try {
      await fs.rm(repoDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('counts every commit without fetching them', async () => {
    expect(await git.countCommits()).toBe(TOTAL_COMMITS);
  });

  it('counts commits scoped to a pathspec', async () => {
    expect(await git.countCommits('records/a.md')).toBe(A_COMMITS);
    expect(await git.countCommits('records/b.md')).toBe(1);
  });

  it('returns 0 for a pathspec no commit touched', async () => {
    expect(await git.countCommits('records/never-existed.md')).toBe(0);
  });

  it('pages with skip + limit, matching a slice of the full log', async () => {
    const full = await git.getHistory();
    expect(full).toHaveLength(TOTAL_COMMITS);

    // Walk the log two commits at a time and reassemble it. If `--skip` were
    // ignored, every page would repeat the newest commits and this would fail.
    const walked: string[] = [];
    for (let offset = 0; offset < TOTAL_COMMITS; offset += 2) {
      const page = await git.getHistory(2, undefined, offset);
      expect(page.length).toBeLessThanOrEqual(2);
      walked.push(...page.map((c) => c.hash));
    }

    expect(walked).toEqual(full.map((c) => c.hash));
    expect(new Set(walked).size).toBe(TOTAL_COMMITS);
  });

  it('pages within a pathspec-scoped log', async () => {
    const scopedFull = await git.getHistory(undefined, 'records/a.md');
    expect(scopedFull).toHaveLength(A_COMMITS);

    const page = await git.getHistory(2, 'records/a.md', 1);
    expect(page.map((c) => c.hash)).toEqual(
      scopedFull.slice(1, 3).map((c) => c.hash)
    );
  });

  it('returns an empty page past the end rather than throwing', async () => {
    const page = await git.getHistory(5, undefined, TOTAL_COMMITS + 10);
    expect(page).toEqual([]);
  });

  it('skip=0 is equivalent to no skip', async () => {
    const withZero = await git.getHistory(3, undefined, 0);
    const withoutSkip = await git.getHistory(3);
    expect(withZero.map((c) => c.hash)).toEqual(
      withoutSkip.map((c) => c.hash)
    );
  });
});
