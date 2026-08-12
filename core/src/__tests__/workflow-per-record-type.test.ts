/**
 * Per-record-type workflows — `recordTypes.<type>.transitions` / `.roles`.
 *
 * `docs/specs/workflows.md` documents "Department-Specific Workflows" so a
 * bylaw and a policy can have different lifecycles. Only per-type `statuses`
 * was ever read: `validateTransition` and `getAvailableTransitions` took no
 * record type and judged every record against the GLOBAL graph, so an instance
 * configuring per-type transitions exactly as documented had that
 * configuration silently ignored.
 *
 * These drive the config manager against real YAML on disk, because the bug
 * was in how configuration is read, and a stubbed config would assert on the
 * wrong thing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { WorkflowConfigManager } from '../config/workflow-config.js';

describe('WorkflowConfigManager — per-record-type workflows', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wf-per-type-'));
    mkdirSync(join(dir, '.civic'), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function manager(config: unknown): WorkflowConfigManager {
    writeFileSync(join(dir, '.civic', 'workflows.yml'), yaml.dump(config));
    return new WorkflowConfigManager(dir);
  }

  /** The spec's own "Department-Specific Workflows" shape. */
  const DEPARTMENTAL = {
    statuses: ['draft', 'proposed', 'reviewed', 'approved', 'archived'],
    transitions: {
      draft: ['proposed'],
      proposed: ['reviewed', 'archived'],
      reviewed: ['approved', 'archived'],
      approved: ['archived'],
      archived: [],
    },
    roles: {
      clerk: {
        can_transition: { draft: ['proposed'], proposed: ['reviewed'] },
      },
      council: {
        can_transition: { reviewed: ['approved'], any: ['archived'] },
      },
    },
    recordTypes: {
      policy: {
        statuses: ['draft', 'approved', 'archived'],
        transitions: {
          draft: ['approved'],
          approved: ['archived'],
          archived: [],
        },
      },
    },
  };

  describe('transitions', () => {
    it("honours a type's own graph — the short policy lifecycle", async () => {
      // Under the global graph draft→approved is illegal (it must pass through
      // proposed and reviewed). The policy type says otherwise, and the policy
      // type is what governs a policy.
      const mgr = manager(DEPARTMENTAL);

      const check = await mgr.validateTransition(
        'draft',
        'approved',
        undefined,
        'policy'
      );

      expect(check.valid).toBe(true);
    });

    it('replaces the global graph rather than adding to it', async () => {
      // draft→proposed is legal globally but absent from the policy lifecycle,
      // so it must be rejected FOR A POLICY. This is the half of the fix that
      // tightens behaviour rather than loosening it.
      const mgr = manager(DEPARTMENTAL);

      const check = await mgr.validateTransition(
        'draft',
        'proposed',
        undefined,
        'policy'
      );

      expect(check.valid).toBe(false);
    });

    it('leaves a type with no declared workflow on the global graph', async () => {
      const mgr = manager(DEPARTMENTAL);

      expect(
        (await mgr.validateTransition('draft', 'proposed', undefined, 'bylaw'))
          .valid
      ).toBe(true);
      expect(
        (await mgr.validateTransition('draft', 'approved', undefined, 'bylaw'))
          .valid
      ).toBe(false);
    });

    it('keeps the global answer when no record type is given', async () => {
      // Every pre-existing caller omits the argument; none of them may change
      // behaviour.
      const mgr = manager(DEPARTMENTAL);

      expect((await mgr.validateTransition('draft', 'proposed')).valid).toBe(
        true
      );
      expect((await mgr.validateTransition('draft', 'approved')).valid).toBe(
        false
      );
    });
  });

  describe('getAvailableTransitions', () => {
    it('offers the type’s own targets', async () => {
      const mgr = manager(DEPARTMENTAL);

      expect(
        await mgr.getAvailableTransitions('draft', undefined, 'policy')
      ).toEqual(['approved']);
      expect(
        await mgr.getAvailableTransitions('draft', undefined, 'bylaw')
      ).toEqual(['proposed']);
      expect(await mgr.getAvailableTransitions('draft')).toEqual(['proposed']);
    });

    it('still intersects with the role’s rights', async () => {
      const mgr = manager({
        ...DEPARTMENTAL,
        recordTypes: {
          policy: {
            transitions: { draft: ['proposed', 'approved'] },
          },
        },
      });

      // The policy graph offers both, but a clerk may only reach 'proposed'.
      expect(
        await mgr.getAvailableTransitions('draft', 'clerk', 'policy')
      ).toEqual(['proposed']);
    });
  });

  describe('per-type roles', () => {
    const WITH_TYPE_ROLES = {
      statuses: ['draft', 'issued'],
      transitions: { draft: [], issued: [] },
      roles: {
        clerk: { can_transition: { draft: ['issued'] } },
      },
      recordTypes: {
        permit: {
          transitions: { draft: ['issued'], issued: [] },
          roles: {
            inspector: { can_transition: { draft: ['issued'] } },
          },
        },
      },
    };

    it('uses the type’s own roles when it declares them', async () => {
      const mgr = manager(WITH_TYPE_ROLES);

      expect(
        (await mgr.validateTransition('draft', 'issued', 'inspector', 'permit'))
          .valid
      ).toBe(true);
    });

    it('replaces the global roles, so a global-only role loses its rights there', async () => {
      const mgr = manager(WITH_TYPE_ROLES);

      const check = await mgr.validateTransition(
        'draft',
        'issued',
        'clerk',
        'permit'
      );

      expect(check.valid).toBe(false);
      expect(check.reason).toContain('clerk');
    });
  });

  /**
   * The security half. `assertStatusWritableByRole` returns EARLY — skipping
   * the transition check entirely — for any status `getControlledStatuses`
   * does not report. A status reachable only through a per-type graph was
   * therefore writable by any role with no transition check at all.
   */
  describe('getControlledStatuses', () => {
    it('includes statuses reachable only through a per-type graph', async () => {
      const mgr = manager({
        statuses: ['draft', 'proposed', 'issued'],
        transitions: { draft: ['proposed'], proposed: [] },
        recordTypes: {
          permit: { transitions: { draft: ['issued'], issued: [] } },
        },
      });

      const controlled = await mgr.getControlledStatuses();

      expect(controlled.has('issued')).toBe(true);
      expect(controlled.has('proposed')).toBe(true);
    });

    it('still excludes statuses that are no graph’s destination', async () => {
      // `published` is set by the publish flow and gated there, not by the
      // editorial transition graph (FA-API-008).
      const mgr = manager({
        statuses: ['draft', 'proposed', 'published'],
        transitions: { draft: ['proposed'], proposed: [] },
        recordTypes: {
          permit: { transitions: { draft: ['issued'], issued: [] } },
        },
      });

      const controlled = await mgr.getControlledStatuses();

      expect(controlled.has('published')).toBe(false);
      expect(controlled.has('draft')).toBe(false);
    });
  });

  describe('config shapes', () => {
    it('reads the metadata-wrapped { value: [...] } form per type', async () => {
      // Config that has been through the editor comes back wrapped; the
      // per-type path must understand it too, or it silently sees no
      // transitions at all.
      const mgr = manager({
        statuses: ['draft', 'approved'],
        transitions: { draft: { value: ['proposed'] } },
        recordTypes: {
          policy: { transitions: { draft: { value: ['approved'] } } },
        },
      });

      expect(
        await mgr.getAvailableTransitions('draft', undefined, 'policy')
      ).toEqual(['approved']);
      expect((await mgr.getControlledStatuses()).has('approved')).toBe(true);
    });
  });
});
