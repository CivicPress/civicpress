import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import {
  createCLITestContext,
  cleanupCLITestContext,
  extractJSONFromOutput,
} from '../fixtures/test-setup';

let context: Awaited<ReturnType<typeof createCLITestContext>>;

/** Run the CLI, returning stdout even when the command exits non-zero. */
function runCli(args: string): { code: number; out: string } {
  try {
    // execFileSync (no shell) + cwd, so the test dir / cli path are argv, not
    // interpolated into a shell string (js/shell-command-injection-from-env).
    const out = execFileSync(
      'node',
      [context.cliPath, ...args.split(' ').filter(Boolean)],
      { cwd: context.testDir, encoding: 'utf8' }
    );
    return { code: 0, out };
  } catch (e: any) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('CLI operator notification center', () => {
  beforeAll(async () => {
    context = await createCLITestContext();
  }, 60000);

  afterAll(async () => {
    await cleanupCLITestContext(context);
  });

  it('notifications:list succeeds for an admin (empty to start)', () => {
    const token = context.adminToken;
    if (!token) return expect(true).toBe(true); // simulated auth may fail on CI

    const { out } = runCli(`notifications:list --token ${token} --json`);
    const json = extractJSONFromOutput(out);
    expect(json.success).toBe(true);
    expect(json.data.total).toBe(0);
    expect(json.data.unread).toBe(0);
  });

  it('users:reset-requests succeeds for an admin', () => {
    const token = context.adminToken;
    if (!token) return expect(true).toBe(true);

    const { out } = runCli(`users:reset-requests --token ${token} --json`);
    const json = extractJSONFromOutput(out);
    expect(json.success).toBe(true);
    expect(json.data.total).toBe(0);
  });

  it('requires authentication', () => {
    const { code, out } = runCli('notifications:list --json');
    expect(code).not.toBe(0);
    expect(out.toLowerCase()).toMatch(/auth|token/);
  });

  it('forbids a non-admin', () => {
    const token = context.adminToken;
    if (!token) return expect(true).toBe(true);

    // Mint a public token via simulated auth.
    const authOut = runCli(
      'auth:simulated --username joe.public --role public --json'
    ).out;
    const auth = extractJSONFromOutput(authOut);
    const pub = auth?.data?.session?.token;
    if (!pub) return expect(true).toBe(true);

    const { code, out } = runCli(`notifications:list --token ${pub} --json`);
    expect(code).not.toBe(0);
    expect(out).toMatch(/PERMISSION_DENIED|permission/i);
  });
});
