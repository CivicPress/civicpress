import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { appendFileSync, existsSync } from 'fs';
import { join } from 'path';
import { simpleGit } from 'simple-git';
import { CentralConfigManager } from '@civicpress/core';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

// HTTP integration tests for the `diff` router (`/api/v1/diff/*`). All endpoints
// require `records:view` behind authMiddleware. The fixture commits two bylaw
// records ('test-record', 'old-regulation') to git, so the history/commits/
// versions endpoints have real data to return.

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

await setupGlobalTestEnvironment();

describe('API Diff Integration', () => {
  let context: any;
  let adminToken: string;

  beforeEach(async () => {
    context = await createAPITestContext();

    const adminResponse = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin', role: 'admin' });
    adminToken = adminResponse.body.data.session.token;
  });

  afterEach(async () => {
    await cleanupAPITestContext(context);
  });

  /**
   * Give `test-record` a second commit that really changes it.
   *
   * The fixture "commits" the record five times, but four of those stage a
   * file that has not changed, so the record has ONE commit — and the compare
   * test below used to `return` early when it found fewer than two. It had
   * never compared anything.
   */
  const commitAChange = async () => {
    const dataDir = CentralConfigManager.getDataDir();
    const file = join(dataDir, 'records', 'bylaw', 'test-record.md');
    appendFileSync(file, '\nA second paragraph, added later.\n');
    const git = simpleGit(dataDir);
    await git.add(file);
    await git.commit('update(bylaw): amend test-record');
  };

  const commitsOf = async (recordId: string) =>
    (
      await request(context.api.getApp())
        .get(`/api/v1/diff/${recordId}/commits`)
        .set('Authorization', `Bearer ${adminToken}`)
    ).body.data.commits as Array<{ hash: string; shortHash: string }>;

  describe('authorization', () => {
    it('rejects an anonymous caller with 401', async () => {
      const response = await request(context.api.getApp()).get(
        '/api/v1/diff/test-record/commits'
      );
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/diff/:recordId/commits', () => {
    it('returns the git commits for a record (admin)', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/diff/test-record/commits')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.recordId).toBe('test-record');
      expect(Array.isArray(response.body.data.commits)).toBe(true);
      expect(response.body.data.total).toBe(response.body.data.commits.length);
      // The fixture commits this record, so it has at least one commit.
      expect(response.body.data.commits.length).toBeGreaterThan(0);
    });

    it('404s for a record that does not exist', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/diff/no-such-record/commits')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      // The body used to carry `availableRecords`: every record file on disk,
      // in every status, to anyone with records:view. It must not.
      expect(JSON.stringify(response.body)).not.toContain('availableRecords');
    });
  });

  describe('GET /api/v1/diff/:recordId/history', () => {
    it('returns the diff history for a record (admin)', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/diff/test-record/history')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/diff/:recordId/versions', () => {
    it('returns the versions for a record (admin)', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/diff/test-record/versions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/diff/:recordId (compare two commits)', () => {
    it('diffs a record between two real commits (admin)', async () => {
      await commitAChange();
      const commits = await commitsOf('test-record');
      expect(commits.length).toBeGreaterThanOrEqual(2);

      const [newer, older] = commits;
      const response = await request(context.api.getApp())
        .get(`/api/v1/diff/test-record`)
        .query({ commit1: older.hash, commit2: newer.hash })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // With no options given, the documented defaults apply: the content is
      // compared. It used to come back empty.
      expect(response.body.data.summary.hasChanges).toBe(true);
      expect(
        response.body.data.changes.content.stats.linesAdded
      ).toBeGreaterThan(0);
    });

    it('leaves the content out when asked to', async () => {
      await commitAChange();
      const [newer, older] = await commitsOf('test-record');

      const response = await request(context.api.getApp())
        .get(`/api/v1/diff/test-record`)
        .query({
          commit1: older.hash,
          commit2: newer.hash,
          showContent: 'false',
          showMetadata: 'false',
        })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.summary.hasChanges).toBe(false);
    });

    it('answers 400 COMMIT_NOT_FOUND for a well-formed hash that does not exist', async () => {
      const response = await request(context.api.getApp())
        .get(`/api/v1/diff/test-record`)
        .query({ commit1: 'deadbeef', commit2: 'HEAD' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('COMMIT_NOT_FOUND');
    });
  });

  /**
   * `commit1` / `commit2` are handed to git. They were validated only as
   * non-empty strings, so a value beginning with `-` was taken by git as an
   * OPTION: `git show --output=<path>` writes its output to <path>. Any caller
   * with `records:view` — which the `public` role holds, and registration is
   * open — could make the server create or overwrite a file anywhere it can
   * write.
   */
  describe('a commit parameter is a commit, never a git option', () => {
    let publicToken: string;

    beforeEach(async () => {
      const response = await request(context.api.getApp())
        .post('/api/v1/auth/simulated')
        .send({ username: 'anyone', role: 'public' });
      publicToken = response.body.data.session.token;
    });

    /** A path inside this test's own instance — nothing else is written to. */
    const target = () =>
      join(CentralConfigManager.getProjectRoot(), 'WRITTEN-BY-GIT');

    const compare = (query: Record<string, unknown>, token = publicToken) =>
      request(context.api.getApp())
        .get('/api/v1/diff/test-record')
        .query(query)
        .set('Authorization', `Bearer ${token}`);

    it.each(['commit1', 'commit2'])(
      'refuses --output in %s, and writes nothing',
      async (param) => {
        const other = param === 'commit1' ? 'commit2' : 'commit1';

        const response = await compare({
          [param]: `--output=${target()}`,
          [other]: 'HEAD',
        });

        expect(existsSync(target())).toBe(false);
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      }
    );

    it.each([
      ['a bare option', '-p'],
      ['a long option', '--no-index'],
      ['a revision range', 'HEAD~1..HEAD'],
      ['a tree path', 'HEAD:records/bylaw/test-record.md'],
      ['an option after a space', 'HEAD --output=/tmp/x'],
      ['a reflog expression', '@{-1}'],
      ['an empty string', ''],
    ])('refuses %s', async (_label, value) => {
      const response = await compare({ commit1: value, commit2: 'HEAD' });

      expect(response.status).toBe(400);
    });

    it('refuses a parameter sent more than once', async () => {
      const response = await request(context.api.getApp())
        .get(
          '/api/v1/diff/test-record?commit1=HEAD&commit1=HEAD~1&commit2=HEAD'
        )
        .set('Authorization', `Bearer ${publicToken}`);

      expect(response.status).toBe(400);
    });

    it.each(['HEAD', 'HEAD~1', 'HEAD^', 'main', 'v1.0.0', 'refs/heads/main'])(
      'still accepts the revision %s',
      async (value) => {
        const response = await compare(
          { commit1: value, commit2: 'HEAD' },
          adminToken
        );

        // Whether that revision EXISTS in the fixture is a different question
        // (400 COMMIT_NOT_FOUND). It must not be rejected as malformed.
        if (response.status === 400) {
          expect(response.body.error.code).toBe('COMMIT_NOT_FOUND');
        } else {
          expect([200, 404]).toContain(response.status);
        }
      }
    );

    it('still accepts an abbreviated hash', async () => {
      await commitAChange();
      const commits = await commitsOf('test-record');
      expect(commits.length).toBeGreaterThan(1);

      const response = await compare(
        { commit1: commits[1].shortHash, commit2: commits[0].shortHash },
        adminToken
      );

      expect(response.status).toBe(200);
    });
  });

  describe('history filters are validated before they reach git', () => {
    it.each([
      ['a limit that is not a number', { limit: 'abc' }],
      ['a negative limit', { limit: '-1' }],
      ['a limit of zero', { limit: '0' }],
      ['an absurd limit', { limit: '100000' }],
    ])('refuses %s', async (_label, query) => {
      for (const route of ['commits', 'history', 'versions']) {
        const response = await request(context.api.getApp())
          .get(`/api/v1/diff/test-record/${route}`)
          .query(query)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(400);
      }
    });

    it('refuses an author sent as a list', async () => {
      const response = await request(context.api.getApp())
        .get('/api/v1/diff/test-record/commits?author=a&author=b')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
    });

    // Both filters answered 500 whenever they were used: simple-git received
    // `{ author: 'x' }` and passed git the ARGUMENT `author=x`.
    it.each(['commits', 'history'])(
      'filters /%s by author and date',
      async (route) => {
        const all = await request(context.api.getApp())
          .get(`/api/v1/diff/test-record/${route}`)
          .query({ since: '2020-01-01', limit: 5 })
          .set('Authorization', `Bearer ${adminToken}`);
        expect(all.status).toBe(200);
        expect(all.body.data.commits.length).toBeGreaterThan(0);

        const nobody = await request(context.api.getApp())
          .get(`/api/v1/diff/test-record/${route}`)
          .query({ author: 'nobody-by-this-name' })
          .set('Authorization', `Bearer ${adminToken}`);
        expect(nobody.status).toBe(200);
        expect(nobody.body.data.commits).toEqual([]);

        // Not further out than this: git does not parse a date past 2099 and
        // ignores the filter instead of failing.
        const future = await request(context.api.getApp())
          .get(`/api/v1/diff/test-record/${route}`)
          .query({ since: '2035-01-01' })
          .set('Authorization', `Bearer ${adminToken}`);
        expect(future.status).toBe(200);
        expect(future.body.data.commits).toEqual([]);
      }
    );

    it('cannot be used to pass git an option', async () => {
      // The value rides inside `--author=<value>` / `--since=<value>`, so it is
      // never an argument of its own. `since` is capped at 64 characters, so
      // its target is relative: git runs in the data directory.
      const viaAuthor = join(
        CentralConfigManager.getProjectRoot(),
        'WRITTEN-BY-GIT-LOG'
      );
      const viaSince = join(CentralConfigManager.getDataDir(), 'WRITTEN');

      const response = await request(context.api.getApp())
        .get('/api/v1/diff/test-record/commits')
        .query({ author: `--output=${viaAuthor}`, since: '--output=WRITTEN' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(existsSync(viaAuthor)).toBe(false);
      expect(existsSync(viaSince)).toBe(false);
      expect(response.status).toBe(200);
    });
  });
});
