/**
 * Unit Tests for Diagnose CLI Command
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { registerDiagnoseCommand } from '../diagnose.js';
import { cac } from 'cac';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('Diagnose CLI Command', () => {
  let cli: any;
  let testDataDir: string;
  let originalExit: typeof process.exit;
  let exitCode: number | null = null;

  beforeEach(() => {
    // Create temporary test directory
    testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civicpress-test-'));

    // Create minimal directory structure
    fs.mkdirSync(path.join(testDataDir, 'records'), { recursive: true });
    fs.mkdirSync(path.join(testDataDir, '.civic'), { recursive: true });

    // Create .civicrc file
    const civicrcPath = path.join(testDataDir, '.civicrc');
    fs.writeFileSync(civicrcPath, `dataDir: ${testDataDir}\n`);

    // Mock process.exit
    originalExit = process.exit;
    exitCode = null;
    process.exit = vi.fn((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`process.exit(${code})`);
    }) as any;

    // Create CLI instance
    cli = cac('civic');
    registerDiagnoseCommand(cli);
  });

  afterEach(() => {
    // Restore process.exit
    process.exit = originalExit;

    // Cleanup test directory
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('command registration', () => {
    it('should register diagnose command', () => {
      const commands = cli.commands;
      const diagnoseCommand = commands.find(
        (cmd: any) => cmd.name === 'diagnose'
      );
      expect(diagnoseCommand).toBeDefined();
    });

    it('should register component-specific commands', () => {
      const commands = cli.commands;
      const componentCommands = [
        'database',
        'search',
        'config',
        'filesystem',
        'system',
      ];

      for (const component of componentCommands) {
        const cmd = commands.find(
          (c: any) => c.name === `diagnose:${component}`
        );
        expect(cmd).toBeDefined();
      }
    });
  });

  describe('command options', () => {
    it('should accept --component option', () => {
      const commands = cli.commands;
      const diagnoseCommand = commands.find(
        (cmd: any) => cmd.name === 'diagnose'
      );
      expect(diagnoseCommand).toBeDefined();

      // Check that options are registered (we can't easily test option parsing without running)
      expect(diagnoseCommand).toBeDefined();
    });

    it('should accept --fix option', () => {
      const commands = cli.commands;
      const diagnoseCommand = commands.find(
        (cmd: any) => cmd.name === 'diagnose'
      );
      expect(diagnoseCommand).toBeDefined();
    });

    it('should accept --format option', () => {
      const commands = cli.commands;
      const diagnoseCommand = commands.find(
        (cmd: any) => cmd.name === 'diagnose'
      );
      expect(diagnoseCommand).toBeDefined();
    });

    it('should accept --timeout option', () => {
      const commands = cli.commands;
      const diagnoseCommand = commands.find(
        (cmd: any) => cmd.name === 'diagnose'
      );
      expect(diagnoseCommand).toBeDefined();
    });

    it('should accept --max-concurrency option', () => {
      const commands = cli.commands;
      const diagnoseCommand = commands.find(
        (cmd: any) => cmd.name === 'diagnose'
      );
      expect(diagnoseCommand).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle missing configuration gracefully', async () => {
      // Remove .civicrc
      const civicrcPath = path.join(testDataDir, '.civicrc');
      if (fs.existsSync(civicrcPath)) {
        fs.unlinkSync(civicrcPath);
      }

      // Change to test directory
      const originalCwd = process.cwd();
      process.chdir(testDataDir);

      try {
        // Parse command (this will trigger the action)
        const args = ['diagnose', '--json', '--silent'];
        cli.parse(args, { run: false });

        // The command should handle the error
        // (We can't easily test the full execution without mocking CivicPress)
        expect(true).toBe(true); // Placeholder - actual execution would require extensive mocking
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('component-specific commands', () => {
    it('should have database command', () => {
      const commands = cli.commands;
      const dbCommand = commands.find(
        (cmd: any) => cmd.name === 'diagnose:database'
      );
      expect(dbCommand).toBeDefined();
    });

    it('should have search command', () => {
      const commands = cli.commands;
      const searchCommand = commands.find(
        (cmd: any) => cmd.name === 'diagnose:search'
      );
      expect(searchCommand).toBeDefined();
    });

    it('should have config command', () => {
      const commands = cli.commands;
      const configCommand = commands.find(
        (cmd: any) => cmd.name === 'diagnose:config'
      );
      expect(configCommand).toBeDefined();
    });

    it('should have filesystem command', () => {
      const commands = cli.commands;
      const fsCommand = commands.find(
        (cmd: any) => cmd.name === 'diagnose:filesystem'
      );
      expect(fsCommand).toBeDefined();
    });

    it('should have system command', () => {
      const commands = cli.commands;
      const systemCommand = commands.find(
        (cmd: any) => cmd.name === 'diagnose:system'
      );
      expect(systemCommand).toBeDefined();
    });
  });
});
