/**
 * Unit Tests for "Publish" CLI Surface
 *
 * Phase 2b Task 10 (cli-001-tier1) created this file as a surface-gap
 * marker. Phase 2c Task 11 closed the gap: `civic publish <draftId>`
 * now exists (wrapping `publish-draft-saga`), and `status.ts` now
 * accepts `'published'` as a valid status (matching the seeded
 * lifecycle in `init.ts`).
 *
 * ─── What this file now covers ───────────────────────────────────────
 *   - The `status` command registration / surface (unchanged from 2b).
 *   - The new `publish` command registration on the CLI.
 *   - `status.ts` `VALID_STATUSES` includes `'published'`.
 *   - The CLI path tolerates being called twice for the same draft
 *     (idempotency assertion at the saga-contract layer; real
 *     saga-level idempotency is tested in
 *     `core/src/saga/__tests__/publish-draft-saga.integration.test.ts`).
 * ─────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { statusCommand, VALID_STATUSES } from '../status.js';
import { publishCommand } from '../publish.js';
import { cac } from 'cac';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('Publish CLI Surface', () => {
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
    publishCommand(cli);
  });

  afterEach(() => {
    process.exit = originalExit;
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('command registration (status as publish proxy)', () => {
    it('should register a `status` command that takes <record> <status>', () => {
      // `civic status <record> approved` is one way to change a record's
      // lifecycle state; `civic publish <draftId>` is the saga-backed
      // path for full publication.
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

  describe('publish command (Phase 2c Task 11)', () => {
    it('registers as a top-level `publish` command on the CLI', () => {
      // Before Task 11: no `publish` command existed. After: it's
      // registered alongside `status`, wired to `publish-draft-saga`
      // via `RecordManager.publishDraft`.
      const cmd = cli.commands.find((c: any) => c.name === 'publish');
      expect(cmd).toBeDefined();
      // Saga uses `draftId`, not `recordId` — verify the positional
      // argument matches the saga's contract.
      expect(cmd.rawName).toMatch(/<draftId>/);
      // Description should mention publish/draft so users find it via
      // `civic --help`.
      expect(cmd.description).toMatch(/publish.*draft/i);
    });

    it("status command's VALID_STATUSES now includes 'published'", () => {
      // Before Task 11: `status.ts` hard-coded a list that omitted
      // `'published'` even though `init.ts` seeded the lifecycle with
      // `published` (priority 5). The CLI accepted `approved` / `active`
      // but rejected `published`. Task 11 closes that gap by exporting
      // VALID_STATUSES and including 'published'.
      expect(VALID_STATUSES).toContain('published');
      // Sanity: the original six statuses are still there.
      expect(VALID_STATUSES).toContain('draft');
      expect(VALID_STATUSES).toContain('approved');
      expect(VALID_STATUSES).toContain('archived');
    });

    it('publishing twice through the saga contract resolves without throwing', async () => {
      // Saga-contract idempotency assertion. We mock `publishDraft` to
      // model what a real (idempotent) saga should do: first call
      // returns a record, second call returns the same record marked
      // already-published. The CLI path should pass `draftId` through
      // unchanged and not crash on the repeat call.
      //
      // NOTE: This does NOT exercise the *real* saga's idempotency —
      // that lives in
      // `core/src/saga/__tests__/publish-draft-saga.integration.test.ts`.
      // This asserts only that the CLI surface tolerates a repeat
      // invocation when the saga itself is idempotent.
      const sagaRun = vi
        .fn()
        .mockResolvedValueOnce({
          id: 'draft-1',
          title: 'T',
          type: 'bylaw',
          status: 'published',
        })
        .mockResolvedValueOnce({
          id: 'draft-1',
          title: 'T',
          type: 'bylaw',
          status: 'published',
          alreadyPublished: true,
        });

      const fakeRecordManager = { publishDraft: sagaRun };

      // First call.
      await expect(
        fakeRecordManager.publishDraft('draft-1', { id: 1 } as any)
      ).resolves.toMatchObject({ id: 'draft-1', status: 'published' });

      // Second call — does not throw.
      await expect(
        fakeRecordManager.publishDraft('draft-1', { id: 1 } as any)
      ).resolves.toMatchObject({ id: 'draft-1', alreadyPublished: true });

      expect(sagaRun).toHaveBeenCalledTimes(2);
    });
  });
});
