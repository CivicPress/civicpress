/**
 * CLI parity — `--json` purity, `list` human mode, `users:delete` confirmation.
 *
 * `--json` is a machine contract: stdout must be exactly one parseable JSON
 * document. These tests call `JSON.parse(stdout)` DIRECTLY rather than going
 * through the `extractJSONFromOutput` fixture, because that helper's whole job
 * is to dig a JSON object out of surrounding prose — using it here would hide
 * precisely the contamination under test.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  createCLITestContext,
  cleanupCLITestContext,
  setupGlobalTestEnvironment,
  extractJSONFromOutput,
} from '../fixtures/test-setup';

await setupGlobalTestEnvironment();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let context: any;
let adminToken: string | undefined;

const SAMPLE_RECORD = 'cli-parity-record';
const SAMPLE_TITLE = 'CLI Parity Record';

/**
 * `view` and `list` read the canonical on-disk layout
 * (`<dataDir>/records/<type>/<year>/<id>.md`, per `buildRecordRelativePath` /
 * `listRecordFilesSync`). The shared CLI fixture writes its sample records one
 * level up — `<dataDir>/<type>/<year>/` — so those commands find nothing in it.
 * Seed our own record in the layout the commands actually read rather than
 * editing the shared fixture out from under other suites.
 */
function seedRecord(dataDir: string) {
  const dir = join(dataDir, 'records', 'bylaw', '2025');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${SAMPLE_RECORD}.md`),
    [
      '---',
      `title: ${SAMPLE_TITLE}`,
      'type: bylaw',
      'status: adopted',
      'author: tester',
      'version: 1.0.0',
      "created: '2025-01-01T10:00:00Z'",
      "updated: '2025-02-01T10:00:00Z'",
      '---',
      '',
      `# ${SAMPLE_TITLE}`,
      '',
      'Body text for the parity test.',
      '',
    ].join('\n')
  );
}

function run(
  args: string,
  opts: { expectFailure?: boolean } = {}
): { stdout: string; stderr: string; failed: boolean } {
  try {
    const stdout = execSync(
      `cd ${context.testDir} && node ${context.cliPath} ${args}`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return { stdout, stderr: '', failed: false };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    if (!opts.expectFailure) {
      throw new Error(
        `Command failed unexpectedly: ${args}\nstdout: ${e.stdout}\nstderr: ${e.stderr}`
      );
    }
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', failed: true };
  }
}

beforeAll(async () => {
  context = await createCLITestContext();
  adminToken = context.adminToken;
  seedRecord(join(context.testDir, 'data'));
}, 180000);

afterAll(async () => {
  await cleanupCLITestContext(context);
});

describe('view --json purity', () => {
  it('emits stdout that is exactly one parseable JSON document', () => {
    if (!adminToken) return;

    const { stdout } = run(`view ${SAMPLE_RECORD} --token ${adminToken} --json`);

    // The bug: `initializeLogger()` built its Logger with NO options, so
    // `json` stayed false and every `logger.info()` / `logger.output()` in the
    // command body printed banners, separators and the rendered markdown
    // around the JSON blob. A bare JSON.parse is the whole assertion.
    const parsed = JSON.parse(stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.data.record.title).toBe(SAMPLE_TITLE);
  });

  it('leaks no human banner text into stdout', () => {
    if (!adminToken) return;

    const { stdout } = run(`view ${SAMPLE_RECORD} --token ${adminToken} --json`);

    // Each of these was printed by the pre-fix command under --json.
    expect(stdout).not.toContain('📖 Viewing record');
    expect(stdout).not.toContain('📋 Metadata');
    expect(stdout).not.toContain('📝 Content');
    expect(stdout).not.toContain('Record displayed successfully');
    expect(stdout).not.toContain('====');
    // The end-of-operation line printed by CliOutput's own logger.
    expect(stdout).not.toContain('CLI operation completed');
  });

  it('still renders the human view when --json is absent', () => {
    if (!adminToken) return;

    const { stdout } = run(`view ${SAMPLE_RECORD} --token ${adminToken}`);
    expect(stdout).toContain('📋 Metadata');
    expect(stdout).toContain('📝 Content');
  });
});

describe('list human mode', () => {
  it('actually shows the records, not just a count', () => {
    if (!adminToken) return;

    const { stdout } = run(`list --token ${adminToken}`);

    // Pre-fix, human mode printed ONLY "✅ Successfully listed N records" —
    // you were told how many records existed but never which ones.
    expect(stdout).toContain('Successfully listed');
    expect(stdout).toContain('CLI Parity Record');
    expect(stdout).toContain('title');
    expect(stdout).toContain('status');
    expect(stdout).toContain('By status');
  });

  it('keeps --json to a single parseable document', () => {
    if (!adminToken) return;

    const { stdout } = run(`list --token ${adminToken} --json`);

    // The human table must NOT be emitted in JSON mode, and cliTable/cliList
    // must not add a second `{success:true,…}` blob.
    const parsed = JSON.parse(stdout);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.data.records)).toBe(true);
    expect(parsed.data.summary.totalRecords).toBeGreaterThan(0);
  });
});

describe('users:delete confirmation', () => {
  const createUser = (username: string) => {
    execSync(
      `cd ${context.testDir} && node ${context.cliPath} users:create ` +
        `--username ${username} --password Deletepass!123 --name "Del" ` +
        `--role public --token ${adminToken}`,
      { stdio: 'pipe' }
    );
  };

  it('refuses to delete without confirmation in a non-interactive shell', () => {
    if (!adminToken) return;
    createUser('confirmguard');

    const { stdout, stderr, failed } = run(
      `users:delete --username confirmguard --token ${adminToken}`,
      { expectFailure: true }
    );

    expect(failed).toBe(true);
    expect(`${stdout}${stderr}`).toContain('Refusing to delete a user');

    // ...and the user must still exist.
    const list = execSync(
      `cd ${context.testDir} && node ${context.cliPath} users:list --token ${adminToken} --json`,
      { encoding: 'utf8' }
    );
    const parsed = extractJSONFromOutput(list);
    const usernames = (parsed.data?.users ?? []).map(
      (u: { username: string }) => u.username
    );
    expect(usernames).toContain('confirmguard');
  });

  it('reports the refusal as a structured error under --json', () => {
    if (!adminToken) return;

    const { stdout, stderr, failed } = run(
      `users:delete --username confirmguard --token ${adminToken} --json`,
      { expectFailure: true }
    );

    expect(failed).toBe(true);
    // cliError writes the JSON envelope to stderr in JSON mode.
    const payload = JSON.parse((stderr || stdout).trim());
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('CONFIRMATION_REQUIRED');
  });

  it('deletes when --yes is supplied', () => {
    if (!adminToken) return;

    const { stdout } = run(
      `users:delete --username confirmguard --token ${adminToken} --yes`
    );
    expect(stdout).toContain('User deleted successfully');
  });

  it('accepts --force as an alias for --yes', () => {
    if (!adminToken) return;
    createUser('forceguard');

    const { stdout } = run(
      `users:delete --username forceguard --token ${adminToken} --force --json`
    );
    const parsed = JSON.parse(stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.data.user.username).toBe('forceguard');
  });
});
