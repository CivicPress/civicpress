/**
 * BroadcastBox Phase 5 — R1/R2: live device WebSocket → session.manifest.
 *
 * Proves the device-room WS transport works against a REAL in-process realtime
 * server + the mounted broadcast-box module (no hardware):
 *   - R1: the bootstrap bridges the realtime server into the container, so the
 *     DeviceRoomHandler is registered (hasHandler('device')).
 *   - R2: a freshly-onboarded device (enroll → register → token) opens a real
 *     WebSocket to /realtime/devices/:uuid, sends a `session.manifest` with
 *     mixed-visibility segments, and the server persists capture.segments onto
 *     the CivicPress session record.
 *
 * This is the transport the in-camera-exclusion chain (4a–4d) rides on.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import WebSocket from 'ws';

import { CivicPress } from '@civicpress/core';
import { CentralConfigManager } from '../../core/dist/config/central-config.js';
import {
  RecordSchemaBuilder,
  setModuleResolver,
} from '../../core/dist/records/record-schema-builder.js';
import { ModuleResolver } from '../../core/dist/modules/module-resolver.js';
import { startInProcessRealtime } from '../../modules/api/src/realtime-bootstrap.js';
import { startInProcessBroadcastBox } from '../../modules/api/src/broadcast-box-bootstrap.js';

const SYSTEM_USER = { id: 1, username: 'system', role: 'admin' };
const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
} as any;

function frontmatter(md: string): Record<string, any> {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error('no frontmatter found');
  return yaml.load(m[1]) as Record<string, any>;
}

// A free-ish port for the realtime WS server (range avoids common collisions).
function pickPort(): number {
  return 3100 + Math.floor(Date.now() % 800);
}

describe('device WebSocket → session.manifest (real realtime + mounted module)', () => {
  let testDir: string;
  let dataDir: string;
  let civic: any;
  let recordManager: any;
  let realtime: { server: any; started: boolean } | null = null;
  let bbMount: { started: boolean; stop: () => void } | null = null;
  let ws: WebSocket | null = null;
  const port = pickPort();

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-ws-e2e-'));
    dataDir = path.join(testDir, 'data');
    const systemDataDir = path.join(testDir, '.system-data'); // = dirname(dataDir)/.system-data
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(path.join(dataDir, '.civic'), { recursive: true });
    await fs.mkdir(path.join(dataDir, 'records'), { recursive: true });
    await fs.mkdir(systemDataDir, { recursive: true });
    execSync('git init', { cwd: dataDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: dataDir, stdio: 'ignore' });
    execSync('git config user.email "t@e.com"', {
      cwd: dataDir,
      stdio: 'ignore',
    });

    // realtime.yml so the WS server binds a known, non-colliding loopback port.
    await fs.writeFile(
      path.join(systemDataDir, 'realtime.yml'),
      yaml.dump({
        realtime: { enabled: true, port, host: '127.0.0.1', path: '/realtime' },
      })
    );

    civic = new CivicPress({
      dataDir,
      database: {
        type: 'sqlite',
        sqlite: { file: path.join(systemDataDir, 'test.db') },
      },
    });
    await civic.initialize();
    recordManager = civic.getRecordManager();

    setModuleResolver(new ModuleResolver(path.join(process.cwd(), 'modules')));
    vi.spyOn(CentralConfigManager, 'getModules').mockReturnValue([
      'broadcast-box',
    ]);
    RecordSchemaBuilder.clearCache();
  });

  afterEach(async () => {
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    try {
      bbMount?.stop();
    } catch {
      /* ignore */
    }
    try {
      await realtime?.server?.shutdown();
    } catch {
      /* ignore */
    }
    ws = null;
    bbMount = null;
    realtime = null;
    vi.restoreAllMocks();
    RecordSchemaBuilder.clearCache();
    try {
      await civic?.shutdown();
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 150));
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  async function seedSessionRecord(): Promise<string> {
    await recordManager.createRecord(
      {
        title: 'Regular Council Meeting',
        type: 'session',
        content: '# Meeting',
        status: 'published',
        metadata: {},
      },
      SYSTEM_USER
    );
    const { records } = await recordManager.listRecords({ type: 'session' });
    return records[0].id;
  }

  async function readCapture(id: string): Promise<any> {
    const rec = await recordManager.getRecord(id);
    const md = readFileSync(path.join(dataDir, rec.path), 'utf-8');
    return frontmatter(md).capture;
  }

  it('bridges realtime so DeviceRoomHandler is registered, and a live device manifest persists capture.segments', async () => {
    // Start the real in-process realtime WS server.
    realtime = await startInProcessRealtime(civic, silentLogger, true);
    expect(realtime.started).toBe(true);

    // Mount broadcast-box WITH the realtime server → the device-room handler wires.
    const express = (await import('express')).default;
    const app = express();
    app.use(express.json());
    bbMount = await startInProcessBroadcastBox(civic, app, silentLogger, {
      enabled: true,
      realtimeServer: realtime.server,
    });
    expect(bbMount.started).toBe(true);

    // R1: the device room type is registered on the realtime handler registry.
    expect(realtime.server.getHandlerRegistry().hasHandler('device')).toBe(
      true
    );

    // Onboard a device: enroll → register → token (the real BB-HW-013 flow).
    const container = civic.getContainer();
    const deviceManager = container.resolve('broadcastBoxDeviceManager');
    const deviceAuth = container.resolve('broadcastBoxDeviceAuth');

    const enrollment = await deviceManager.enrollDevice({
      name: 'Council Chamber Camera',
    });
    const device = await deviceManager.registerDevice({
      deviceUuid: enrollment.deviceUuid,
      enrollmentCode: enrollment.enrollmentCode,
      name: 'Council Chamber Camera',
    });
    const { token } = await deviceAuth.generateToken({
      deviceId: device.id,
      deviceUuid: device.deviceUuid,
      organizationId: device.organizationId,
    });

    const id = await seedSessionRecord();

    // R2: connect a real WebSocket as the device and send session.manifest.
    ws = new WebSocket(
      `ws://127.0.0.1:${port}/realtime/devices/${device.deviceUuid}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Wait for the server's connection.ack — it is sent only AFTER onConnect +
    // room setup, i.e. once the message handler is wired. Sending the manifest
    // before then would race that setup and be dropped.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('no connection.ack in time')),
        5000
      );
      ws!.on('message', (d) => {
        const msg = JSON.parse(d.toString());
        if (msg.type === 'control' && msg.event === 'connection.ack') {
          clearTimeout(timer);
          resolve();
        }
      });
      ws!.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      ws!.on('close', (code) => {
        clearTimeout(timer);
        reject(new Error(`WS closed before ack (code ${code})`));
      });
    });

    ws.send(
      JSON.stringify({
        type: 'session.manifest',
        id: 'm-1',
        timestamp: '2026-06-26T19:00:00.000Z',
        payload: {
          session_id: id,
          capture: {
            device: device.id,
            av_file: 'av-uuid-1',
            duration_s: 15,
            segments: [
              { start: 0, end: 5, visibility: 'public' },
              { start: 5, end: 10, visibility: 'in_camera' },
              { start: 10, end: 15, visibility: 'public' },
            ],
          },
        },
      })
    );

    // Poll the record until the manifest write lands.
    const deadline = Date.now() + 4000;
    let capture: any = null;
    while (Date.now() < deadline) {
      const c = await readCapture(id);
      if (c?.segments) {
        capture = c;
        break;
      }
      await new Promise((r) => setTimeout(r, 75));
    }

    expect(capture).not.toBeNull();
    expect(capture.av_file).toBe('av-uuid-1');
    expect(capture.segments).toHaveLength(3);
    expect(capture.segments[1]).toMatchObject({ visibility: 'in_camera' });
  }, 20000);
});
