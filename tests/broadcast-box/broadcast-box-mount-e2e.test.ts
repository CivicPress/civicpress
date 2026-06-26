/**
 * BroadcastBox Phase 5 — 4b: mount the broadcast-box module into a running API.
 *
 * Proves the module is no longer dead-exported: startInProcessBroadcastBox runs
 * its container-based registration hooks (DI services + SQL migrations) against
 * a REAL CivicPress, mounts the device/session routers onto an Express app, and
 * the public device-registration endpoint is reachable and validating.
 *
 * Storage is intentionally absent here, so the uploads router is omitted
 * gracefully (resolveOptional) — the device path is what 4b wires; the full
 * upload→capture→worker chain lands in 4c/4d.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import express from 'express';
import request from 'supertest';

import { CivicPress } from '@civicpress/core';
import { CentralConfigManager } from '../../core/dist/config/central-config.js';
import { startInProcessBroadcastBox } from '../../modules/api/src/broadcast-box-bootstrap.js';

const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
} as any;

describe('broadcast-box in-process mount (real CivicPress)', () => {
  let testDir: string;
  let civic: any;
  let mount: { started: boolean; stop: () => void } | null = null;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-mount-e2e-'));
    await fs.mkdir(path.join(testDir, '.system-data'), { recursive: true });
    await fs.mkdir(path.join(testDir, '.civic'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'records'), { recursive: true });
    execSync('git init', { cwd: testDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: testDir, stdio: 'ignore' });
    execSync('git config user.email "t@e.com"', {
      cwd: testDir,
      stdio: 'ignore',
    });

    civic = new CivicPress({
      dataDir: testDir,
      database: {
        type: 'sqlite',
        sqlite: { file: path.join(testDir, '.system-data', 'test.db') },
      },
    });
    await civic.initialize();

    // The mount gate reads the config `modules:` list.
    vi.spyOn(CentralConfigManager, 'getModules').mockReturnValue([
      'broadcast-box',
    ]);
  });

  afterEach(async () => {
    try {
      mount?.stop();
    } catch {
      /* ignore */
    }
    mount = null;
    vi.restoreAllMocks();
    try {
      await civic?.shutdown();
    } catch {
      /* ignore */
    }
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('mounts services + device routes; the public registration endpoint validates', async () => {
    const app = express();
    app.use(express.json());

    mount = await startInProcessBroadcastBox(civic, app, silentLogger, {
      enabled: true,
    });
    expect(mount.started).toBe(true);

    // The device self-registration endpoint is public (no token) and validates
    // its body — an empty body is rejected with 400, proving the router + its
    // validation chain are wired onto the app.
    const res = await request(app)
      .post('/api/v1/broadcast-box/devices')
      .send({})
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('does not mount when broadcast-box is absent from config modules:', async () => {
    vi.spyOn(CentralConfigManager, 'getModules').mockReturnValue([]);
    const app = express();
    app.use(express.json());

    mount = await startInProcessBroadcastBox(civic, app, silentLogger, {
      enabled: true,
    });
    expect(mount.started).toBe(false);

    // No router mounted → the path 404s.
    const res = await request(app)
      .post('/api/v1/broadcast-box/devices')
      .send({});
    expect(res.status).toBe(404);
  });
});
