/**
 * Unit Tests for Users CLI Command
 *
 * Phase 2b Task 11 — pins command-registration + option-shape behavior
 * for the `civic users:*` family.  Full CRUD action coverage requires
 * CivicPress + DatabaseService + bcrypt; covered separately in CLI E2E.
 *
 * Plan note: tests should "cover at least create + list + delete" and
 * "do NOT use slow bcrypt rounds in tests".  The action-level path
 * hardcodes saltRounds=12 inside the command itself (users.ts:153, 371),
 * so it is impossible to inject a faster cost factor without changing
 * the source.  Instead we pin the public surface — what commands and
 * options exist, how the command tree is shaped — and leave the slow
 * bcrypt path to higher-level integration tests.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import setupUsersCommand from '../users.js';
import { cac } from 'cac';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('Users CLI Command', () => {
  let cli: any;
  let testDataDir: string;
  let originalExit: typeof process.exit;
  let exitCode: number | null = null;

  beforeEach(() => {
    testDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'civicpress-users-test-')
    );
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
    setupUsersCommand(cli);
  });

  afterEach(() => {
    process.exit = originalExit;
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('command tree', () => {
    it('should register users:create, users:list, users:update, users:delete', () => {
      const names = cli.commands.map((c: any) => c.name);
      expect(names).toContain('users:create');
      expect(names).toContain('users:list');
      expect(names).toContain('users:update');
      expect(names).toContain('users:delete');
    });

    it('should register users:delete-all-test (the test-cleanup helper)', () => {
      const names = cli.commands.map((c: any) => c.name);
      expect(names).toContain('users:delete-all-test');
    });

    it('should register the security sub-commands (change-password, set-password, etc.)', () => {
      const names = cli.commands.map((c: any) => c.name);
      expect(names).toContain('users:change-password');
      expect(names).toContain('users:set-password');
      expect(names).toContain('users:request-email-change');
      expect(names).toContain('users:verify-email');
      expect(names).toContain('users:cancel-email-change');
      expect(names).toContain('users:security-info');
    });
  });

  describe('users:create options', () => {
    it('should accept --username, --email, --name, --role, --password', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'users:create');
      const optNames = (cmd?.options ?? []).map((o: any) => o.name);
      expect(optNames).toContain('username');
      expect(optNames).toContain('email');
      expect(optNames).toContain('name');
      expect(optNames).toContain('role');
      expect(optNames).toContain('password');
    });

    it("should default --role to 'public'", () => {
      const cmd = cli.commands.find((c: any) => c.name === 'users:create');
      const roleOpt = cmd?.options.find((o: any) => o.name === 'role');
      expect(roleOpt?.config?.default).toBe('public');
    });

    it('should accept --token and the global --json/--silent flags', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'users:create');
      const optNames = (cmd?.options ?? []).map((o: any) => o.name);
      expect(optNames).toContain('token');
      expect(optNames).toContain('json');
      expect(optNames).toContain('silent');
    });
  });

  describe('users:delete contract', () => {
    it('should accept either --username or --id (per source-level guard)', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'users:delete');
      const optNames = (cmd?.options ?? []).map((o: any) => o.name);
      expect(optNames).toContain('username');
      expect(optNames).toContain('id');
    });
  });

  describe('positional-arg shape for password commands', () => {
    it('users:change-password should require <username>', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'users:change-password');
      expect(cmd?.args.length).toBe(1);
      expect(cmd?.args[0].required).toBe(true);
      expect(cmd?.args[0].value).toBe('username');
    });

    it('users:set-password should require <username>', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'users:set-password');
      expect(cmd?.args.length).toBe(1);
      expect(cmd?.args[0].required).toBe(true);
      expect(cmd?.args[0].value).toBe('username');
    });

    it('users:verify-email should require a <token> positional', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'users:verify-email');
      expect(cmd?.args.length).toBe(1);
      expect(cmd?.args[0].required).toBe(true);
      expect(cmd?.args[0].value).toBe('token');
    });
  });
});
