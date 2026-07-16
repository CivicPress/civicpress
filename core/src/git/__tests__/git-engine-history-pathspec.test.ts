import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';
import { GitEngine } from '../git-engine.js';

/**
 * Post-audit Tier-C: record history is now scoped by a git PATHSPEC on the
 * record's file (git log -- <path>), not a commit-message substring match.
 * The message match both missed commits that touched the file without naming
 * it and matched unrelated commits that merely mentioned the id.
 */
describe('GitEngine.getHistory pathspec scoping', () => {
  let repoDir: string;
  let engine: GitEngine;

  beforeEach(async () => {
    repoDir = mkdtempSync(join(tmpdir(), 'civic-history-'));
    execSync('git init', { cwd: repoDir, stdio: 'ignore' });
    execSync('git config user.email "t@civicpress.example"', { cwd: repoDir });
    execSync('git config user.name "civic-test"', { cwd: repoDir });
    engine = new GitEngine(repoDir);
    await engine.initialize();

    // Commit 1: create records/policy/target.md — message does NOT name the file.
    writeFileSync(join(repoDir, 'target.md'), 'v1\n');
    await engine.commit('initial import', ['target.md']);

    // Commit 2: an UNRELATED file, but the message MENTIONS 'target.md'.
    writeFileSync(join(repoDir, 'other.md'), 'other\n');
    await engine.commit('note about target.md but touches other', ['other.md']);

    // Commit 3: modify target.md — message again does NOT name it.
    writeFileSync(join(repoDir, 'target.md'), 'v2\n');
    await engine.commit('revise the file', ['target.md']);
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('returns exactly the commits that TOUCHED the path, regardless of message', async () => {
    const history = await engine.getHistory(undefined, 'target.md');
    const messages = history.map((c) => c.message);

    // Both commits that touched target.md — even though neither names it.
    expect(messages).toContain('initial import');
    expect(messages).toContain('revise the file');
    // The commit that only MENTIONS target.md (touched other.md) is excluded.
    expect(messages).not.toContain('note about target.md but touches other');
    expect(history).toHaveLength(2);
  });

  it('unscoped history (no pathspec) still returns all commits', async () => {
    const all = await engine.getHistory();
    expect(all.length).toBe(3);
  });
});
