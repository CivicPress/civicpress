/**
 * FA-API-008 — getControlledStatuses returns exactly the transition-graph
 * destinations, so `published` (a legal status set by the publish flow, not a
 * transition target) is NOT gated by the editorial transition rules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { WorkflowConfigManager } from '../config/workflow-config.js';

describe('WorkflowConfigManager.getControlledStatuses (FA-API-008)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wf-controlled-'));
    mkdirSync(join(dir, '.civic'), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeWorkflow(config: unknown) {
    writeFileSync(join(dir, '.civic', 'workflows.yml'), yaml.dump(config));
  }

  it('collects every transition destination and excludes non-target statuses', async () => {
    writeWorkflow({
      statuses: ['draft', 'proposed', 'reviewed', 'approved', 'archived', 'published'],
      transitions: {
        draft: ['proposed'],
        proposed: ['reviewed', 'archived'],
        reviewed: ['approved', 'archived'],
        approved: ['archived'],
        archived: [],
      },
    });
    const mgr = new WorkflowConfigManager(dir);
    const controlled = await mgr.getControlledStatuses();

    for (const s of ['proposed', 'reviewed', 'approved', 'archived']) {
      expect(controlled.has(s)).toBe(true);
    }
    // Neither the initial status (never a destination here) nor the
    // publish-flow legal status is controlled.
    expect(controlled.has('draft')).toBe(false);
    expect(controlled.has('published')).toBe(false);
  });

  it('handles the metadata {value: [...]} transition format', async () => {
    writeWorkflow({
      statuses: { value: ['draft', 'proposed'] },
      transitions: {
        draft: { value: ['proposed'] },
      },
    });
    const mgr = new WorkflowConfigManager(dir);
    const controlled = await mgr.getControlledStatuses();
    expect(controlled.has('proposed')).toBe(true);
    expect(controlled.has('draft')).toBe(false);
  });
});
