/**
 * Unit Tests for Init CLI Command
 *
 * Phase 2b Task 10 (cli-001-tier1).
 *
 * Pattern follows `diagnose.test.ts`: in-process import of the register
 * function, build a `cac()` instance, and assert against the registered
 * command + option shape. We do NOT execute the action handler — `init`
 * touches the filesystem, spawns Git, copies bundled defaults, runs an
 * inquirer prompt session, and instantiates the full CivicPress core,
 * which would require extensive mocking to exercise cleanly in a unit
 * test. Phase 2d will revisit this with a child-process integration
 * harness.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { initCommand } from '../init.js';
import { cac } from 'cac';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('Init CLI Command', () => {
  let cli: any;
  let testDataDir: string;
  let originalExit: typeof process.exit;
  let originalCwd: string;

  beforeEach(() => {
    // Create temporary test directory
    testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civicpress-init-test-'));

    // Mock process.exit so any accidental invocation fails the test cleanly
    originalExit = process.exit;
    process.exit = vi.fn((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as any;

    originalCwd = process.cwd();

    // Create CLI instance
    cli = cac('civic');
    initCommand(cli);
  });

  afterEach(() => {
    // Restore process state
    process.exit = originalExit;
    if (process.cwd() !== originalCwd) {
      process.chdir(originalCwd);
    }
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('command registration', () => {
    it('should register the init command', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'init');
      expect(cmd).toBeDefined();
      expect(cmd.description).toMatch(/initialize/i);
    });

    it('should only register a single init command (no collisions)', () => {
      const matches = cli.commands.filter((c: any) => c.name === 'init');
      expect(matches).toHaveLength(1);
    });
  });

  describe('command options', () => {
    it('should expose non-interactive flags (--yes / --no-prompt)', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'init');
      const rawOptions = cmd.options.map((o: any) => o.rawName || o.name);
      const joined = rawOptions.join(' ');
      expect(joined).toMatch(/--yes/);
      expect(joined).toMatch(/--no-prompt/);
    });

    it('should expose --data-dir option for non-interactive setup', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'init');
      const rawOptions = cmd.options.map((o: any) => o.rawName || o.name);
      expect(rawOptions.join(' ')).toMatch(/--data-dir/);
    });

    it('should expose --config option for file-driven setup', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'init');
      const rawOptions = cmd.options.map((o: any) => o.rawName || o.name);
      expect(rawOptions.join(' ')).toMatch(/--config/);
    });

    it('should expose --demo-data option', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'init');
      const rawOptions = cmd.options.map((o: any) => o.rawName || o.name);
      expect(rawOptions.join(' ')).toMatch(/--demo-data/);
    });
  });

  describe('isolated workspace', () => {
    it('should produce a writable tmpdir for fixture-based use', () => {
      // Sanity check that the test fixture itself is sound; init's real
      // workflow assumes it can write into cwd. Future Phase 2d
      // integration tests will exercise this end-to-end.
      const probe = path.join(testDataDir, 'probe.txt');
      fs.writeFileSync(probe, 'ok');
      expect(fs.readFileSync(probe, 'utf8')).toBe('ok');
    });
  });
});
