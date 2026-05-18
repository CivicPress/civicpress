/**
 * Unit Tests for Validate CLI Command
 *
 * Phase 2b Task 10 (cli-001-tier1).
 *
 * Pattern follows `diagnose.test.ts`: in-process import + cac() instance
 * + registration-surface assertions. The validate command is the
 * civic-trust gate for record schema correctness — its options must be
 * the audit-stable surface (--all, --fix, --strict, --format).
 *
 * Note the export shape difference: validate uses
 * `registerValidateCommand` (named export, function declaration, `export
 * function …`), while init/create/list use arrow-function const
 * exports. Both take a CAC instance.
 *
 * Action-handler-level tests (e.g. "validate flags a record with a
 * missing required field") would require populating a fixture data
 * directory with a real record + template; that's a Phase 2d
 * integration concern.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { registerValidateCommand } from '../validate.js';
import { cac } from 'cac';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('Validate CLI Command', () => {
  let cli: any;
  let testDataDir: string;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    testDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'civicpress-validate-test-')
    );

    originalExit = process.exit;
    process.exit = vi.fn((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as any;

    cli = cac('civic');
    registerValidateCommand(cli);
  });

  afterEach(() => {
    process.exit = originalExit;
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('command registration', () => {
    it('should register the validate command with optional [record] arg', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'validate');
      expect(cmd).toBeDefined();
      // Optional positional: `civic validate` (alone) prints help;
      // `civic validate <ref>` validates one; `civic validate --all`
      // validates all.
      expect(cmd.rawName).toMatch(/\[record\]/);
      expect(cmd.description).toMatch(/validate records/i);
    });

    it('should register exactly one validate command', () => {
      const matches = cli.commands.filter((c: any) => c.name === 'validate');
      expect(matches).toHaveLength(1);
    });
  });

  describe('command options', () => {
    it('should expose --all / -a for full-corpus validation', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'validate');
      const raw = cmd.options.map((o: any) => o.rawName || o.name).join(' ');
      expect(raw).toMatch(/--all/);
    });

    it('should expose --fix / -f for autofix', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'validate');
      const raw = cmd.options.map((o: any) => o.rawName || o.name).join(' ');
      expect(raw).toMatch(/--fix/);
    });

    it('should expose --strict / -s (warnings become errors)', () => {
      // Civic-trust: strict mode is the audit-grade run.
      const cmd = cli.commands.find((c: any) => c.name === 'validate');
      const raw = cmd.options.map((o: any) => o.rawName || o.name).join(' ');
      expect(raw).toMatch(/--strict/);
    });

    it('should expose --format option with a default', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'validate');
      const formatOption = cmd.options.find((o: any) => {
        const raw = (o.rawName || o.name) as string;
        return raw.includes('--format');
      });
      expect(formatOption).toBeDefined();
      // cac's `.option(... , { default: 'human' })` exposes the default
      // on the option config.
      const def = (formatOption as any).config?.default ?? (formatOption as any).default;
      expect(def).toBe('human');
    });
  });

  describe('exported helper surface', () => {
    it('should re-export the internal validators (for integration use)', async () => {
      const mod = await import('../validate.js');
      // These are re-exported at the bottom of validate.ts for
      // integration-test use. If they disappear, downstream tests
      // (Phase 2d) break silently — so we pin them here.
      expect(typeof mod.validateRecord).toBe('function');
      expect(typeof mod.validateAllRecords).toBe('function');
      expect(typeof mod.validateSingleRecord).toBe('function');
    });
  });
});
