/**
 * Unit Tests for Create CLI Command
 *
 * Phase 2b Task 10 (cli-001-tier1).
 *
 * Pattern follows `diagnose.test.ts`: in-process import of the register
 * function, build a `cac()` instance, and assert against the registered
 * command + option shape. Action execution requires an authenticated
 * CivicPress instance, a populated workflow config, and a populated
 * template directory; that lives in Phase 2d as an integration test.
 *
 * The `create` command is the entry point for every record on
 * CivicPress, so the validity of its registered surface (record type
 * arg, role flag, dry-run flag) is itself a civic-trust guarantee — a
 * dropped option silently breaks audit + workflow gates.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createCommand } from '../create.js';
import { cac } from 'cac';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('Create CLI Command', () => {
  let cli: any;
  let testDataDir: string;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    testDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'civicpress-create-test-')
    );

    originalExit = process.exit;
    process.exit = vi.fn((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as any;

    cli = cac('civic');
    createCommand(cli);
  });

  afterEach(() => {
    process.exit = originalExit;
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('command registration', () => {
    it('should register the create command with <type> <title> positional args', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'create');
      expect(cmd).toBeDefined();
      expect(cmd.rawName).toMatch(/<type>/);
      expect(cmd.rawName).toMatch(/<title>/);
      expect(cmd.description).toMatch(/civic record/i);
    });

    it('should register exactly one create command', () => {
      const matches = cli.commands.filter((c: any) => c.name === 'create');
      expect(matches).toHaveLength(1);
    });
  });

  describe('command options', () => {
    it('should expose --token for authenticated invocation', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'create');
      const raw = cmd.options.map((o: any) => o.rawName || o.name).join(' ');
      expect(raw).toMatch(/--token/);
    });

    it('should expose --dry-run for safe preview', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'create');
      const raw = cmd.options.map((o: any) => o.rawName || o.name).join(' ');
      expect(raw).toMatch(/--dry-run/);
    });

    it('should expose --role for workflow gate enforcement', () => {
      // Civic-critical: workflow gates depend on role being passable.
      const cmd = cli.commands.find((c: any) => c.name === 'create');
      const raw = cmd.options.map((o: any) => o.rawName || o.name).join(' ');
      expect(raw).toMatch(/--role/);
    });

    it('should expose --template for non-default templates', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'create');
      const raw = cmd.options.map((o: any) => o.rawName || o.name).join(' ');
      expect(raw).toMatch(/--template/);
    });

    it('should expose --json and --silent output controls', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'create');
      const raw = cmd.options.map((o: any) => o.rawName || o.name).join(' ');
      expect(raw).toMatch(/--json/);
      expect(raw).toMatch(/--silent/);
    });
  });
});
