/**
 * Unit Tests for History CLI Command
 *
 * Phase 2b Task 11 — pins command-registration + basic option-shape
 * behavior for `civic history`. Full action coverage requires GitEngine
 * + loadConfig integration; covered separately in CLI E2E.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { historyCommand } from '../history.js';
import { cac } from 'cac';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

describe('History CLI Command', () => {
  let cli: any;
  let testDataDir: string;
  let originalExit: typeof process.exit;
  let originalCwd: string;
  let _exitCode: number | null = null;

  beforeEach(() => {
    // Create temporary test directory with a real git repo (history.ts
    // calls GitEngine under the hood, which expects a real git repo).
    testDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'civicpress-history-test-')
    );

    fs.mkdirSync(path.join(testDataDir, 'records'), { recursive: true });
    fs.mkdirSync(path.join(testDataDir, '.civic'), { recursive: true });

    // Create .civicrc file
    const civicrcPath = path.join(testDataDir, '.civicrc');
    fs.writeFileSync(civicrcPath, `dataDir: ${testDataDir}\n`);

    // Mock process.exit
    originalExit = process.exit;
    _exitCode = null;
    process.exit = vi.fn((code?: number) => {
      _exitCode = code ?? 0;
      throw new Error(`process.exit(${code})`);
    }) as any;

    originalCwd = process.cwd();

    // Create CLI instance and register
    cli = cac('civic');
    historyCommand(cli);
  });

  afterEach(() => {
    process.exit = originalExit;

    try {
      process.chdir(originalCwd);
    } catch {
      // ignore
    }

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('command registration', () => {
    it('should register history command', () => {
      const commands = cli.commands;
      const historyCmd = commands.find((cmd: any) => cmd.name === 'history');
      expect(historyCmd).toBeDefined();
    });

    it('should describe the command', () => {
      const commands = cli.commands;
      const historyCmd = commands.find((cmd: any) => cmd.name === 'history');
      expect(historyCmd?.description).toMatch(/history/i);
    });

    it('should accept an optional record argument', () => {
      const commands = cli.commands;
      const historyCmd = commands.find((cmd: any) => cmd.name === 'history');
      // 'history [record]' → one optional positional arg
      expect(historyCmd?.args.length).toBe(1);
      expect(historyCmd?.args[0].required).toBe(false);
      expect(historyCmd?.args[0].value).toBe('record');
    });
  });

  describe('command options', () => {
    it('should accept --limit option with default 10', () => {
      const commands = cli.commands;
      const historyCmd = commands.find((cmd: any) => cmd.name === 'history');
      const limitOpt = historyCmd?.options.find(
        (opt: any) => opt.name === 'limit'
      );
      expect(limitOpt).toBeDefined();
      expect(limitOpt?.config?.default).toBe('10');
    });

    it('should accept --format option', () => {
      const commands = cli.commands;
      const historyCmd = commands.find((cmd: any) => cmd.name === 'history');
      const formatOpt = historyCmd?.options.find(
        (opt: any) => opt.name === 'format'
      );
      expect(formatOpt).toBeDefined();
    });
  });

  describe('git fixture setup (sanity)', () => {
    it('should initialize a real git repo for use as fixture', () => {
      // Sanity-check the test fixture itself: real-action tests will rely
      // on this same setup.  Pinning it here documents the expected shape
      // (plan §Task 11: "use a real temp git repo").
      execSync('git init --quiet', { cwd: testDataDir, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', {
        cwd: testDataDir,
        stdio: 'pipe',
      });
      execSync('git config user.name "Test User"', {
        cwd: testDataDir,
        stdio: 'pipe',
      });
      execSync('git commit --allow-empty -m "initial commit" --quiet', {
        cwd: testDataDir,
        stdio: 'pipe',
      });

      expect(fs.existsSync(path.join(testDataDir, '.git'))).toBe(true);

      // Verify we can read history out via plain git (proves the fixture
      // is in a state GitEngine can consume).
      const log = execSync('git log --oneline', {
        cwd: testDataDir,
        encoding: 'utf8',
      });
      expect(log).toContain('initial commit');
    });
  });
});
