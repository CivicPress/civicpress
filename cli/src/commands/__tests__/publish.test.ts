/**
 * Unit Tests for "Publish" CLI Surface
 *
 * Phase 2b Task 10 (cli-001-tier1).
 *
 * ─── Surface gap ─────────────────────────────────────────────────────
 * There is NO standalone `civic publish` command in `cli/src/commands/`.
 * Publishing a draft to a published record is the responsibility of
 * `status.ts` (the `civic status <record> <new-status>` command).
 *
 * Additionally there is an inconsistency between layers:
 *   - `init.ts` seeds `record_statuses_config` with a "published"
 *     status (priority 5) as a *configurable* lifecycle state.
 *   - `status.ts` hard-codes `validStatuses = ['draft', 'proposed',
 *     'approved', 'active', 'archived', 'rejected']` — note: no
 *     'published' entry.
 *   - `core/src/saga/publish-draft-saga.ts` is the structural truth
 *     for publishing, but is not currently wired through any CLI
 *     entry point.
 *
 * Per Task 10 process guidance ("If a test reveals a real bug, DO NOT
 * fix it — note in report and `.skip` with TODO"), this file exercises
 * what *does* exist (the `status` command's published-like transition
 * via `approved` / `active`) and `.skip`s the assertions that would
 * require the actual `publish` surface to exist.
 * ─────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { statusCommand } from '../status.js';
import { cac } from 'cac';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('Publish CLI Surface (via status command)', () => {
  let cli: any;
  let testDataDir: string;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    testDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'civicpress-publish-test-')
    );

    originalExit = process.exit;
    process.exit = vi.fn((code?: number) => {
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

  describe('command registration (status as publish proxy)', () => {
    it('should register a `status` command that takes <record> <status>', () => {
      // `civic status <record> approved` is the closest thing to
      // `civic publish` today.
      const cmd = cli.commands.find((c: any) => c.name === 'status');
      expect(cmd).toBeDefined();
      expect(cmd.rawName).toMatch(/<record>/);
      expect(cmd.rawName).toMatch(/<status>/);
    });

    it('should expose --message / -m for status-change rationale', () => {
      // Civic-trust: state transitions must carry a rationale.
      const cmd = cli.commands.find((c: any) => c.name === 'status');
      const raw = cmd.options.map((o: any) => o.rawName || o.name).join(' ');
      expect(raw).toMatch(/--message/);
    });

    it('should expose --role for workflow-gate enforcement on transition', () => {
      // Civic-critical: only certain roles can move a record to
      // approved/active states.
      const cmd = cli.commands.find((c: any) => c.name === 'status');
      const raw = cmd.options.map((o: any) => o.rawName || o.name).join(' ');
      expect(raw).toMatch(/--role/);
    });

    it('should expose --dry-run for safe preview', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'status');
      const raw = cmd.options.map((o: any) => o.rawName || o.name).join(' ');
      expect(raw).toMatch(/--dry-run/);
    });
  });

  describe('surface gaps (skipped until publish.ts ships)', () => {
    // TODO(cli-001-tier1 follow-up / Phase 2d): introduce a real
    // `publish.ts` command (or a `records publish <id>` subcommand)
    // backed by `publish-draft-saga`. Until then these stay skipped.

    it.skip('TODO: should register a top-level `publish` command', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'publish');
      expect(cmd).toBeDefined();
    });

    it.skip('TODO: status command should accept "published" as a valid status', () => {
      // status.ts hard-codes validStatuses without `published`, but
      // init.ts seeds `published` as a configured lifecycle state.
      // The CLI accepts `approved` / `active` but never `published`.
      // This is a real inconsistency. Track under cli-001-tier1.
      expect(true).toBe(false);
    });

    it.skip('TODO: publishing should be idempotent (publish twice → single marker)', () => {
      // Requires the publish surface to exist before idempotency can
      // be exercised. Saga-level idempotency is tested in
      // `core/src/saga/__tests__/publish-draft-saga.integration.test.ts`
      // but the CLI path is not.
      expect(true).toBe(false);
    });
  });
});
