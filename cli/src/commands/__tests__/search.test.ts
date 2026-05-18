/**
 * Unit Tests for Search CLI Command
 *
 * Phase 2b Task 11 — pins command-registration + option-shape behavior
 * for `civic search`.  The full action path depends on @civicpress/core's
 * `loadConfig`; covered separately in CLI E2E.
 *
 * Plan note: "create 3 records, search for one, assert match".  search.ts
 * keeps the matching logic in non-exported helpers (`searchInText`,
 * `matchesPattern`, `parseRecordMetadata`), so we exercise the
 * search-fixture shape directly here — the same shape the command reads.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { registerSearchCommand } from '../search.js';
import { cac } from 'cac';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('Search CLI Command', () => {
  let cli: any;
  let testDataDir: string;
  let recordsDir: string;
  let originalExit: typeof process.exit;
  let exitCode: number | null = null;

  beforeEach(() => {
    testDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'civicpress-search-test-')
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
    registerSearchCommand(cli);
  });

  afterEach(() => {
    process.exit = originalExit;
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('command registration', () => {
    it('should register search command', () => {
      const commands = cli.commands;
      const searchCmd = commands.find((cmd: any) => cmd.name === 'search');
      expect(searchCmd).toBeDefined();
    });

    it('should describe the command', () => {
      const commands = cli.commands;
      const searchCmd = commands.find((cmd: any) => cmd.name === 'search');
      expect(searchCmd?.description).toMatch(/search/i);
    });

    it('should accept an optional query argument', () => {
      const commands = cli.commands;
      const searchCmd = commands.find((cmd: any) => cmd.name === 'search');
      // 'search [query]' → one optional positional arg
      expect(searchCmd?.args.length).toBe(1);
      expect(searchCmd?.args[0].required).toBe(false);
      expect(searchCmd?.args[0].value).toBe('query');
    });
  });

  describe('command options', () => {
    it('should accept --content, --title, --status, --type filters', () => {
      const commands = cli.commands;
      const searchCmd = commands.find((cmd: any) => cmd.name === 'search');
      const optNames = (searchCmd?.options ?? []).map((o: any) => o.name);
      expect(optNames).toContain('content');
      expect(optNames).toContain('title');
      expect(optNames).toContain('status');
      expect(optNames).toContain('type');
    });

    it('should accept --case-sensitive and --regex flags', () => {
      const commands = cli.commands;
      const searchCmd = commands.find((cmd: any) => cmd.name === 'search');
      const optNames = (searchCmd?.options ?? []).map((o: any) => o.name);
      expect(optNames).toContain('caseSensitive');
      expect(optNames).toContain('regex');
    });

    it('should default --limit to 50 and --format to table', () => {
      const commands = cli.commands;
      const searchCmd = commands.find((cmd: any) => cmd.name === 'search');
      const limitOpt = searchCmd?.options.find(
        (opt: any) => opt.name === 'limit'
      );
      const formatOpt = searchCmd?.options.find(
        (opt: any) => opt.name === 'format'
      );
      expect(limitOpt?.config?.default).toBe(50);
      expect(formatOpt?.config?.default).toBe('table');
    });
  });

  describe('search fixture (sanity)', () => {
    it('should be able to read records fixture used by the command', () => {
      // Mirror what search.ts reads via glob('**/*.md', cwd: recordsDir):
      // 3 records under different types, with frontmatter the search
      // helpers parse.
      const types = ['bylaw', 'resolution', 'policy'];
      const titles = ['noise-ordinance', 'budget-2026', 'transparency'];

      for (let i = 0; i < types.length; i++) {
        const typeDir = path.join(recordsDir, types[i]);
        fs.mkdirSync(typeDir, { recursive: true });
        const content =
          `---\n` +
          `title: ${titles[i]}\n` +
          `status: draft\n` +
          `type: ${types[i]}\n` +
          `---\n\n` +
          `# ${titles[i]}\n\nBody text mentioning ${titles[i]} once.\n`;
        fs.writeFileSync(path.join(typeDir, `${titles[i]}.md`), content);
      }

      // Sanity: glob would pick up all three.
      const found = fs
        .readdirSync(recordsDir, { recursive: true })
        .filter((f: any) => String(f).endsWith('.md'));
      expect(found.length).toBe(3);

      // Sanity: each file's frontmatter is parseable in the same way
      // search.ts does it (it uses a hand-rolled regex parser).
      const sample = fs.readFileSync(
        path.join(recordsDir, 'bylaw', 'noise-ordinance.md'),
        'utf8'
      );
      const frontmatter = sample.match(/^---\n([\s\S]*?)\n---/);
      expect(frontmatter).not.toBeNull();
      expect(frontmatter![1]).toContain('title: noise-ordinance');
    });
  });
});
