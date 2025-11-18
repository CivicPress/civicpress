import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import {
  createCLITestContext,
  cleanupCLITestContext,
} from '../fixtures/test-setup';

let context: Awaited<ReturnType<typeof createCLITestContext>>;

describe('CLI Config - status and init', () => {
  beforeAll(async () => {
    context = await createCLITestContext();
  }, 60000);

  afterAll(async () => {
    await cleanupCLITestContext(context);
  });

  it('should show config status', () => {
    const out = execSync(`node ${context.cliPath} config:status`, {
      cwd: context.testDir,
    }).toString();
    expect(out).toMatch(/Configuration status/);
  });

  it('should init missing configs (noop when present)', () => {
    const out = execSync(`node ${context.cliPath} config:init --all`, {
      cwd: context.testDir,
    }).toString();
    // Match either "Initialized" or "Skipped" (with or without emoji)
    expect(out).toMatch(/Initialized|Skipped/);
  });
});
