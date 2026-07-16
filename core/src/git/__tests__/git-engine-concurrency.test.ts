import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';
import { GitEngine } from '../git-engine.js';

/**
 * Post-audit hardening batch 2: `git add` + `git commit` are two steps
 * against ONE shared .git/index, so concurrent commit() calls — e.g. two
 * sagas on DIFFERENT records, each satisfied with its own per-record lock —
 * used to interleave staging and commit each other's files. GitEngine now
 * serializes index mutations; every commit must contain exactly the files
 * it was asked to commit, no matter how many run "at once".
 */
describe('GitEngine concurrent commits', () => {
  let repoDir: string;
  let engine: GitEngine;

  beforeEach(async () => {
    repoDir = mkdtempSync(join(tmpdir(), 'civic-git-mutex-'));
    execSync('git init', { cwd: repoDir, stdio: 'ignore' });
    // Local identity so the test is independent of runner/global config.
    execSync('git config user.email "test@civicpress.example"', {
      cwd: repoDir,
    });
    execSync('git config user.name "civic-test"', { cwd: repoDir });

    engine = new GitEngine(repoDir);
    await engine.initialize();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('keeps concurrent pathspec commits isolated (one file per commit)', async () => {
    const N = 12;
    const names = Array.from({ length: N }, (_, i) => `record-${i}.md`);
    for (const name of names) {
      writeFileSync(join(repoDir, name), `content of ${name}\n`);
    }

    // Fire all commits without awaiting in between — pre-fix, add/commit
    // pairs interleave on the shared index and commits swallow each
    // other's files.
    const hashes = await Promise.all(
      names.map((name) => engine.commit(`commit ${name}`, [name]))
    );

    expect(new Set(hashes).size).toBe(N);

    for (let i = 0; i < N; i++) {
      const shown = execSync(
        `git show --pretty=format: --name-only ${hashes[i]}`,
        { cwd: repoDir, encoding: 'utf8' }
      )
        .trim()
        .split('\n')
        .filter(Boolean);
      expect(shown).toEqual([names[i]]);
    }
  });

  it('propagates a failing commit without wedging the queue', async () => {
    writeFileSync(join(repoDir, 'ok.md'), 'ok\n');

    const results = await Promise.allSettled([
      engine.commit('missing file', ['does-not-exist.md']),
      engine.commit('ok file', ['ok.md']),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('fulfilled');

    const okHash = (results[1] as PromiseFulfilledResult<string>).value;
    const shown = execSync(`git show --pretty=format: --name-only ${okHash}`, {
      cwd: repoDir,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(shown).toEqual(['ok.md']);
  });
});
