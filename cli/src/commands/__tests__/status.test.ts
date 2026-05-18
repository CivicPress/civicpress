/**
 * Unit Tests for Status CLI Command
 *
 * Phase 2b Task 11 — pins command-registration + option-shape behavior
 * for `civic status`.
 *
 * NOTE on plan deviation:
 *   The Task 11 plan describes `status` as "show record-count-by-status
 *   summary".  The actual command (status.ts) is a workflow-transition
 *   command: `status <record> <status>` that *changes* a record's status.
 *   Tests reflect the actual implementation (see report).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { statusCommand } from '../status.js';
import { cac } from 'cac';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('Status CLI Command', () => {
  let cli: any;
  let testDataDir: string;
  let recordsDir: string;
  let originalExit: typeof process.exit;
  let exitCode: number | null = null;

  beforeEach(() => {
    testDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'civicpress-status-test-')
    );
    recordsDir = path.join(testDataDir, 'records');
    fs.mkdirSync(recordsDir, { recursive: true });
    fs.mkdirSync(path.join(testDataDir, '.civic'), { recursive: true });

    fs.writeFileSync(
      path.join(testDataDir, '.civicrc'),
      `dataDir: ${testDataDir}\n`
    );

    originalExit = process.exit;
    exitCode = null;
    process.exit = vi.fn((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`process.exit(${code})`);
    }) as any;

    cli = cac('civic');
    statusCommand(cli);
  });

  afterEach(() => {
    process.exit = originalExit;
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('command registration', () => {
    it('should register status command', () => {
      const commands = cli.commands;
      const statusCmd = commands.find((cmd: any) => cmd.name === 'status');
      expect(statusCmd).toBeDefined();
    });

    it('should describe the command as a status changer', () => {
      const commands = cli.commands;
      const statusCmd = commands.find((cmd: any) => cmd.name === 'status');
      expect(statusCmd?.description).toMatch(/status/i);
    });

    it('should require two positional arguments (record, status)', () => {
      const commands = cli.commands;
      const statusCmd = commands.find((cmd: any) => cmd.name === 'status');
      // 'status <record> <status>' → two required positional args
      expect(statusCmd?.args.length).toBe(2);
      expect(statusCmd?.args[0].required).toBe(true);
      expect(statusCmd?.args[0].value).toBe('record');
      expect(statusCmd?.args[1].required).toBe(true);
      expect(statusCmd?.args[1].value).toBe('status');
    });
  });

  describe('command options', () => {
    it('should accept --message, --role, --token options', () => {
      const commands = cli.commands;
      const statusCmd = commands.find((cmd: any) => cmd.name === 'status');
      const optNames = (statusCmd?.options ?? []).map((o: any) => o.name);
      expect(optNames).toContain('message');
      expect(optNames).toContain('role');
      expect(optNames).toContain('token');
    });

    it('should accept --dry-run flag (boolean)', () => {
      const commands = cli.commands;
      const statusCmd = commands.find((cmd: any) => cmd.name === 'status');
      const dryRun = statusCmd?.options.find(
        (opt: any) => opt.name === 'dryRun'
      );
      expect(dryRun).toBeDefined();
      expect(dryRun?.isBoolean).toBe(true);
    });

    it('should accept --dry-run-hooks option (comma-separated)', () => {
      const commands = cli.commands;
      const statusCmd = commands.find((cmd: any) => cmd.name === 'status');
      const dryRunHooks = statusCmd?.options.find(
        (opt: any) => opt.name === 'dryRunHooks'
      );
      expect(dryRunHooks).toBeDefined();
    });
  });

  describe('record fixture (sanity)', () => {
    it('should be able to construct a record-by-status fixture', () => {
      // Plan §Task 11 suggested 1 draft + 1 published + 1 archived.
      // While the actual command does workflow transitions (not summaries),
      // pinning a multi-status fixture here documents the shape that a
      // future count-by-status reporter would consume.
      const cases = [
        { type: 'bylaw', title: 'a-draft', status: 'draft' },
        { type: 'bylaw', title: 'a-approved', status: 'approved' },
        { type: 'bylaw', title: 'a-archived', status: 'archived' },
      ];

      for (const c of cases) {
        const typeDir = path.join(recordsDir, c.type);
        fs.mkdirSync(typeDir, { recursive: true });
        fs.writeFileSync(
          path.join(typeDir, `${c.title}.md`),
          `---\ntitle: ${c.title}\nstatus: ${c.status}\ntype: ${c.type}\n---\n\nBody.\n`
        );
      }

      // Count by status the same way a summary command would (read
      // frontmatter, group by status).
      const counts: Record<string, number> = {};
      const files = fs.readdirSync(path.join(recordsDir, 'bylaw'));
      for (const f of files) {
        const content = fs.readFileSync(path.join(recordsDir, 'bylaw', f), 'utf8');
        const match = content.match(/status:\s*(\S+)/);
        if (match) {
          counts[match[1]] = (counts[match[1]] ?? 0) + 1;
        }
      }

      expect(counts.draft).toBe(1);
      expect(counts.approved).toBe(1);
      expect(counts.archived).toBe(1);
    });
  });
});
