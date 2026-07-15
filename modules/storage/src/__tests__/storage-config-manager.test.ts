/**
 * StorageConfigManager — FA-BB-002 / FA-STOR-002 confidential-folder invariant.
 *
 * `recordings_raw` holds raw, unredacted closed-session A/V and is the private
 * half of the fail-closed recording model. Because `mergeWithDefaults` lets a
 * persisted storage.yml value beat the code default at load time, a config
 * mutation must never be able to weaken its access level to something servable.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { StorageConfigManager } from '../storage-config-manager.js';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('StorageConfigManager — confidential folder invariant', () => {
  let dir: string;
  let mgr: StorageConfigManager;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-cfg-'));
    mgr = new StorageConfigManager(dir);
  });

  afterEach(async () => {
    await fs.remove(dir);
  });

  it('defaults: recordings_raw is private and recordings is public', () => {
    const cfg = mgr.getDefaultConfig();
    expect(cfg.folders.recordings_raw?.access).toBe('private');
    expect(cfg.folders.recordings?.access).toBe('public');
    expect(cfg.folders.recordings_raw?.allowed_types).toContain('mp4');
  });

  it('saveConfig rejects a config that makes recordings_raw non-private', async () => {
    const cfg = clone(mgr.getDefaultConfig());
    cfg.folders.recordings_raw.access = 'public';
    await expect(mgr.saveConfig(cfg)).rejects.toThrow(/recordings_raw/);
  });

  it('updateFolder cannot re-open recordings_raw to public', async () => {
    await mgr.saveConfig(clone(mgr.getDefaultConfig())); // seed a valid storage.yml
    await expect(
      mgr.updateFolder('recordings_raw', { access: 'public' })
    ).rejects.toThrow(/recordings_raw/);
  });

  it('removeFolder refuses to delete recordings_raw (system folder)', async () => {
    await mgr.saveConfig(clone(mgr.getDefaultConfig()));
    await expect(mgr.removeFolder('recordings_raw')).rejects.toThrow(
      /system folder/
    );
  });

  it('a valid default config still saves (invariant is not over-broad)', async () => {
    await expect(
      mgr.saveConfig(clone(mgr.getDefaultConfig()))
    ).resolves.toBeUndefined();
  });
});
