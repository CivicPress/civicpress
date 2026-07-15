/**
 * Unit Tests for List CLI Command
 *
 * Phase 2b Task 10 (cli-001-tier1).
 *
 * Pattern follows `diagnose.test.ts`: in-process import + cac() instance
 * + registration-surface assertions. Like `create`, executing the
 * action requires an authenticated CivicPress instance with an indexed
 * record store, which is a Phase 2d integration concern.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { listCommand } from '../list.js';
import { cac } from 'cac';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('List CLI Command', () => {
  let cli: any;
  let testDataDir: string;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    testDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'civicpress-list-test-')
    );

    originalExit = process.exit;
    process.exit = vi.fn((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as any;

    cli = cac('civic');
    listCommand(cli);
  });

  afterEach(() => {
    process.exit = originalExit;
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('command registration', () => {
    it('should register the list command with optional [type] argument', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'list');
      expect(cmd).toBeDefined();
      // Optional positional [type] — this is what lets `civic list` (no
      // type) list everything, and `civic list bylaw` filter.
      expect(cmd.rawName).toMatch(/\[type\]/);
      expect(cmd.description).toMatch(/list civic records/i);
    });

    it('should register exactly one list command', () => {
      const matches = cli.commands.filter((c: any) => c.name === 'list');
      expect(matches).toHaveLength(1);
    });
  });

  describe('command options', () => {
    it('should expose --status filter for triage / publication slices', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'list');
      const raw = cmd.options.map((o: any) => o.rawName || o.name).join(' ');
      expect(raw).toMatch(/--status/);
    });

    it('should expose --all / -a for full-detail output', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'list');
      const raw = cmd.options.map((o: any) => o.rawName || o.name).join(' ');
      // cac stores the rawName as `-a, --all`
      expect(raw).toMatch(/--all/);
    });

    it('should expose --json and --silent for scripted consumers', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'list');
      const raw = cmd.options.map((o: any) => o.rawName || o.name).join(' ');
      expect(raw).toMatch(/--json/);
      expect(raw).toMatch(/--silent/);
    });

    it('should expose --token for authenticated invocation', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'list');
      const raw = cmd.options.map((o: any) => o.rawName || o.name).join(' ');
      expect(raw).toMatch(/--token/);
    });
  });
});
