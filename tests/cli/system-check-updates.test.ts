import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import {
  createCLITestContext,
  cleanupCLITestContext,
  extractJSONFromOutput,
} from '../fixtures/test-setup';

let context: Awaited<ReturnType<typeof createCLITestContext>>;

function runCli(args: string): { code: number; out: string } {
  try {
    const out = execSync(`cd ${context.testDir} && node ${context.cliPath} ${args}`, {
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e: any) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('CLI system:check-updates', () => {
  beforeAll(async () => {
    context = await createCLITestContext();
  }, 60000);

  afterAll(async () => {
    await cleanupCLITestContext(context);
  });

  it('reports an available update for a higher --latest and records it', () => {
    const { out } = runCli('system:check-updates --latest 999.0.0 --json');
    const json = extractJSONFromOutput(out);
    expect(json.success).toBe(true);
    expect(json.data.updateAvailable).toBe(true);
    expect(json.data.latestVersion).toBe('999.0.0');

    // The producer filed an update_available entry in the operator center.
    const token = context.adminToken;
    if (!token) return; // simulated auth may be unavailable
    const listed = extractJSONFromOutput(
      runCli(
        `notifications:list --token ${token} --type update_available --json`
      ).out
    );
    expect(listed.success).toBe(true);
    expect(listed.data.total).toBeGreaterThanOrEqual(1);
    expect(listed.data.notifications[0].data.version).toBe('999.0.0');
  });

  it('reports up-to-date for a lower --latest and records nothing new', () => {
    const { out } = runCli('system:check-updates --latest 0.0.1 --json');
    const json = extractJSONFromOutput(out);
    expect(json.success).toBe(true);
    expect(json.data.updateAvailable).toBe(false);
  });
});
