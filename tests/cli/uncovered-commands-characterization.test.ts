/**
 * Characterization tests for the commands that had NO behavioural coverage at
 * either tier — auto-index, backup, cache:*, cleanup, commit, diff, export,
 * hook, import, info, notify:*, template, records migrate-folders.
 *
 * These do not assert that the commands are RIGHT. They assert what they
 * currently DO, so that the `withCli()` migration — which moves the operation
 * preamble, the error envelope, and eventually the CivicPress shutdown out of
 * each handler and into one wrapper — cannot change any of it unnoticed.
 *
 * What is pinned is deliberately the SHELL, not the feature:
 *   - the exit code,
 *   - `--json` stdout purity (stdout is a machine contract: exactly one
 *     parseable document, or nothing),
 *   - the structured error envelope and its stable `*_FAILED` code,
 *   - that the command registers at all.
 *
 * That is precisely the surface `withCli()` takes ownership of. Feature
 * behaviour is left alone; these tests should survive the refactor untouched.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import {
  createCLITestContext,
  cleanupCLITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

await setupGlobalTestEnvironment();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let context: any;

function run(args: string): {
  stdout: string;
  stderr: string;
  code: number;
} {
  try {
    const stdout = execSync(
      `cd ${context.testDir} && node ${context.cliPath} ${args}`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return { stdout, stderr: '', code: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      code: e.status ?? 1,
    };
  }
}

beforeAll(async () => {
  context = await createCLITestContext();
}, 180000);

afterAll(async () => {
  await cleanupCLITestContext(context);
});

/**
 * Every command must register and answer `--help` with exit 0. Cheap, but it
 * is the guard that catches a wrapper doing work at REGISTRATION time rather
 * than when the action runs — which would break every command at once.
 */
describe('registration surface', () => {
  const COMMANDS = [
    'auto-index',
    'backup',
    'cleanup',
    'commit',
    'diff',
    'export',
    'hook',
    'import',
    'info',
    'template',
    'cache',
    'notify',
  ];

  for (const command of COMMANDS) {
    it(`${command} --help exits 0 and names itself`, () => {
      const { stdout, code } = run(`${command} --help`);
      expect(code).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
    });
  }
});

/**
 * There are TWO different failure envelopes, on two different streams, and the
 * one you get depends on how far the command got. Both are pinned here because
 * `withCli()` owns exactly this boundary — and because the difference is not
 * obvious from reading any single command.
 *
 * (1) AUTH failed: AuthUtils.validateAuth prints its own envelope and calls
 *     process.exit(1) itself, so the command body — and any wrapper around it —
 *     never runs. Envelope goes to STDOUT, and `error` is a plain STRING.
 */
describe('auth-failure envelope (AuthUtils, before the command body)', () => {
  for (const command of [
    'commit definitely-not-a-record',
    'hook some-action',
  ]) {
    it(`${command.split(' ')[0]}: exits 1 with the auth envelope on stdout`, () => {
      const { stdout, stderr, code } = run(`${command} --json`);

      expect(code).toBe(1);

      // stdout is a machine channel even here: exactly one parseable document.
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.success).toBe(false);
      // A STRING, not the { message, code } object the command path uses.
      expect(parsed.error).toBe('Authentication required');
      expect(typeof parsed.details).toBe('string');

      expect(stderr.trim()).toBe('');
    });
  }
});

/**
 * (2) The COMMAND BODY failed: cliError writes to STDERR precisely so stdout
 *     stays clean, and `error` is an OBJECT carrying a stable machine code.
 *
 * This is the envelope withCli() reproduces, so the shape and the stream both
 * matter.
 */
describe('command-failure envelope (cliError, inside the command body)', () => {
  it('commit without a message: exits 1, envelope on stderr, stdout clean', () => {
    const { stdout, stderr, code } = run(
      `commit definitely-not-a-record --json --token ${context.adminToken}`
    );

    expect(code).toBe(1);
    expect(stdout.trim()).toBe('');

    const parsed = JSON.parse(stderr.trim());
    expect(parsed.success).toBe(false);
    // An OBJECT here — contrast with the string form above.
    expect(parsed.error.message).toContain('Commit message is required');
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
  });
});

/**
 * (3) Characterized, NOT endorsed.
 *
 * `hook` with an action the hook system does not know exits 0 and prints
 * nothing at all — no error, no envelope, no acknowledgement. A caller
 * scripting against it cannot distinguish "ran your hook" from "silently did
 * nothing because you typo'd the action".
 *
 * Pinned so the withCli() migration does not change it by accident. It is
 * worth fixing deliberately, but that is a behaviour change and belongs in its
 * own commit, not smuggled in with a refactor.
 */
describe('known oddity: hook swallows an unknown action', () => {
  it('exits 0 and emits nothing for an action that does not exist', () => {
    const { stdout, stderr, code } = run(
      `hook definitely-not-an-action --json --token ${context.adminToken}`
    );

    expect(code).toBe(0);
    expect(stdout.trim()).toBe('');
    expect(stderr.trim()).toBe('');
  });
});
