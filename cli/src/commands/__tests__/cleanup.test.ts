/**
 * Unit tests for the `cleanup` CLI command.
 *
 * Two concerns:
 *  1. Registration surface — the destructive `cleanup` command must keep its
 *     --force / --yes-i-know / --json / --silent options. The FA-CLI-002
 *     double-flag guard depends on --yes-i-know existing, so a dropped option is
 *     a safety regression.
 *  2. Target resolution — `resolveCleanupTargets()` must derive WHAT to delete
 *     from core's config authority (CentralConfigManager), not from the CLI's
 *     own install location, so a relocated dataDir is respected and the command
 *     never wipes a hardcoded repo path. Driving the full action (confirmation,
 *     rmSync, recreate) is left to integration coverage, matching the convention
 *     these command tests follow (action execution is deferred, not unit-run).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cac } from 'cac';
import { CentralConfigManager } from '@civicpress/core';
import {
  cleanupCommand,
  resolveCleanupTargets,
  isForceAcknowledged,
} from '../cleanup.js';

describe('Cleanup CLI Command', () => {
  describe('command registration', () => {
    let cli: any;
    let originalExit: typeof process.exit;

    beforeEach(() => {
      originalExit = process.exit;
      process.exit = vi.fn((code?: number) => {
        throw new Error(`process.exit(${code})`);
      }) as any;
      cli = cac('civic');
      cleanupCommand(cli);
    });

    afterEach(() => {
      // Registration must not trigger process.exit.
      expect(process.exit).not.toHaveBeenCalled();
      process.exit = originalExit;
    });

    it('registers the cleanup command', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'cleanup');
      expect(cmd).toBeDefined();
    });

    it('keeps the FA-CLI-002 guard flags and output flags', () => {
      const cmd = cli.commands.find((c: any) => c.name === 'cleanup');
      const raw = cmd.options.map((o: any) => o.rawName || o.name).join(' ');
      expect(raw).toContain('--force');
      expect(raw).toContain('--yes-i-know');
      expect(raw).toContain('--json');
      expect(raw).toContain('--silent');
    });
  });

  describe('isForceAcknowledged (FA-CLI-002 --yes-i-know guard)', () => {
    it('accepts the key cac actually produces for --yes-i-know', () => {
      // Regression: cac parses `--yes-i-know` to the camelized key `yesI-know`,
      // so the old `options.yesIKnow` check was always false and `--force`
      // refused every non-interactive run.
      expect(isForceAcknowledged({ force: true, 'yesI-know': true })).toBe(
        true
      );
    });

    it('is false when only --force is supplied (no acknowledgement)', () => {
      expect(isForceAcknowledged({ force: true })).toBe(false);
      expect(isForceAcknowledged({})).toBe(false);
    });

    it('also accepts the kebab and conventional-camel spellings', () => {
      expect(isForceAcknowledged({ 'yes-i-know': true })).toBe(true);
      expect(isForceAcknowledged({ yesIKnow: true })).toBe(true);
    });
  });

  describe('resolveCleanupTargets', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('derives every target from core, honoring a relocated dataDir', () => {
      vi.spyOn(CentralConfigManager, 'getProjectRoot').mockReturnValue(
        '/srv/civic'
      );
      vi.spyOn(CentralConfigManager, 'getDataDir').mockReturnValue(
        '/mnt/records'
      );
      vi.spyOn(CentralConfigManager, 'getSystemDataDir').mockReturnValue(
        '/srv/civic/.system-data'
      );

      const t = resolveCleanupTargets();

      expect(t.projectRoot).toBe('/srv/civic');
      expect(t.dataDir).toBe('/mnt/records'); // relocated dataDir, not <root>/data
      expect(t.systemDataDir).toBe('/srv/civic/.system-data');
      expect(t.civicrcPath).toBe('/srv/civic/.civicrc');
      // Removal list is exactly the three core-resolved locations, in order.
      expect(t.pathsToRemove).toEqual([
        '/mnt/records',
        '/srv/civic/.system-data',
        '/srv/civic/.civicrc',
      ]);
    });

    it('targets the whole system-data dir, never the bare civic.db file', () => {
      vi.spyOn(CentralConfigManager, 'getProjectRoot').mockReturnValue('/p');
      vi.spyOn(CentralConfigManager, 'getDataDir').mockReturnValue('/p/data');
      vi.spyOn(CentralConfigManager, 'getSystemDataDir').mockReturnValue(
        '/p/.system-data'
      );

      const t = resolveCleanupTargets();

      // The system-data DIRECTORY is removed (secret + storage creds go too) —
      // the old hardcoded list deleted only '.system-data/civic.db' and left the
      // crypto material behind.
      expect(t.pathsToRemove).toContain('/p/.system-data');
      expect(t.pathsToRemove).not.toContain('/p/.system-data/civic.db');
    });

    it('falls back to project-root-relative paths when core cannot resolve', () => {
      vi.spyOn(CentralConfigManager, 'getProjectRoot').mockReturnValue('/proj');
      vi.spyOn(CentralConfigManager, 'getDataDir').mockImplementation(() => {
        throw new Error('dataDir is not configured');
      });
      vi.spyOn(CentralConfigManager, 'getSystemDataDir').mockImplementation(
        () => {
          throw new Error('no config');
        }
      );

      const t = resolveCleanupTargets();

      expect(t.dataDir).toBe('/proj/data');
      expect(t.systemDataDir).toBe('/proj/.system-data');
      expect(t.civicrcPath).toBe('/proj/.civicrc');
    });
  });
});
