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

  // The OUTBOUND seam: an operator start_session must actually reach the device
  // over the wire. This is the path the unit tests never exercised — the realtime
  // server had no clientToDevice map, so DeviceRoom.sendToDevice silently failed
  // ("Failed to send command") and only a live run caught it.
  it('delivers an operator start_session to the connected device + creates the broadcast_sessions row', async () => {
    realtime = await startInProcessRealtime(civic, silentLogger, true);
    const express = (await import('express')).default;
    const app = express();
    app.use(express.json());
    bbMount = await startInProcessBroadcastBox(civic, app, silentLogger, {
      enabled: true,
      realtimeServer: realtime.server,
    });

    const container = civic.getContainer();
    const deviceManager = container.resolve('broadcastBoxDeviceManager');
    const deviceAuth = container.resolve('broadcastBoxDeviceAuth');
    const sessionController: any = container.resolve(
      'broadcastBoxSessionController'
    );

    const enrollment = await deviceManager.enrollDevice({ name: 'Cam' });
    const device = await deviceManager.registerDevice({
      deviceUuid: enrollment.deviceUuid,
      enrollmentCode: enrollment.enrollmentCode,
      name: 'Cam',
    });
    const { token } = await deviceAuth.generateToken({
      deviceId: device.id,
      deviceUuid: device.deviceUuid,
      organizationId: device.organizationId,
    });
    const recordId = await seedSessionRecord();

    // Connect as the device; collect every inbound frame.
    const inbound: any[] = [];
    ws = new WebSocket(
      `ws://127.0.0.1:${port}/realtime/devices/${device.deviceUuid}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    ws.on('message', (d) => inbound.push(JSON.parse(d.toString())));
    ws.on('error', () => {});

    const waitFor = async (
      pred: (m: any) => boolean,
      ms: number,
      what: string
    ): Promise<any> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        const m = inbound.find(pred);
        if (m) return m;
        await new Promise((r) => setTimeout(r, 40));
      }
      throw new Error(`timed out waiting for ${what}`);
    };

    // onConnect registers the connection (→ device activated + isConnected), which
    // startSession requires; the ack confirms it ran.
    await waitFor(
      (m) => m.type === 'control' && m.event === 'connection.ack',
      5000,
      'connection.ack'
    );

    // Operator starts the session via the real SessionController path.
    const session = await sessionController.startSession({
      deviceId: device.id,
      civicpressSessionId: recordId,
    });

    // The device must RECEIVE the start_session command over the wire.
    const cmd = await waitFor(
      (m) => m.action === 'start_session',
      4000,
      'start_session command at the device'
    );
    expect(cmd.type).toBe('command');
    expect(cmd.payload.sessionId).toBe(session.id);
    expect(cmd.payload.civicpressSessionId).toBe(recordId);

    // And the broadcast_sessions row links recording → device → record (so an
    // upload can resolve ownership; nothing had to seed it by hand).
    const row = await sessionController.sessionModel.getById(session.id);
    expect(row).toBeTruthy();
    expect(row.deviceId).toBe(device.id);
    expect(row.civicpressSessionId).toBe(recordId);
  }, 20000);

  // Create-on-demand + the Meeting model: quick-start drafts a session record
  // (linked to a `meeting`), starts it, and the meeting can list its recordings.
  it('quick-start drafts a session under a meeting, starts it, and lists it by meeting', async () => {
    realtime = await startInProcessRealtime(civic, silentLogger, true);
    const express = (await import('express')).default;
    const app = express();
    app.use(express.json());
    bbMount = await startInProcessBroadcastBox(civic, app, silentLogger, {
      enabled: true,
      realtimeServer: realtime.server,
    });

    const container = civic.getContainer();
    const deviceManager = container.resolve('broadcastBoxDeviceManager');
    const deviceAuth = container.resolve('broadcastBoxDeviceAuth');
    const sessionController: any = container.resolve(
      'broadcastBoxSessionController'
    );

    // A `meeting` record (the new core type) that will own the recording.
    const meeting = await recordManager.createRecord(
      { title: 'June Council Meeting', type: 'meeting', content: '# Agenda', status: 'published', metadata: {} },
      SYSTEM_USER
    );
    expect(meeting.id).toBeTruthy();

    const enrollment = await deviceManager.enrollDevice({ name: 'Cam' });
    const device = await deviceManager.registerDevice({
      deviceUuid: enrollment.deviceUuid,
      enrollmentCode: enrollment.enrollmentCode,
      name: 'Cam',
    });
    const { token } = await deviceAuth.generateToken({
      deviceId: device.id,
      deviceUuid: device.deviceUuid,
      organizationId: device.organizationId,
    });

    const inbound: any[] = [];
    ws = new WebSocket(
      `ws://127.0.0.1:${port}/realtime/devices/${device.deviceUuid}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    ws.on('message', (d) => inbound.push(JSON.parse(d.toString())));
    ws.on('error', () => {});
    const waitFor = async (pred: (m: any) => boolean, ms: number, what: string) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        const m = inbound.find(pred);
        if (m) return m;
        await new Promise((r) => setTimeout(r, 40));
      }
      throw new Error(`timed out waiting for ${what}`);
    };
    await waitFor(
      (m) => m.type === 'control' && m.event === 'connection.ack',
      5000,
      'connection.ack'
    );

    // Create-on-demand: no pre-existing session record; draft one + start.
    const { session, civicpressSessionId } =
      await sessionController.quickStartSession({
        deviceId: device.id,
        title: 'Live recording',
        meetingId: meeting.id,
      });

    // The device received start_session for the auto-created record.
    const cmd = await waitFor(
      (m) => m.action === 'start_session',
      4000,
      'start_session command'
    );
    expect(cmd.payload.civicpressSessionId).toBe(civicpressSessionId);
    expect(cmd.payload.sessionId).toBe(session.id);

    // The auto-created session record is a DRAFT (status), linked to the meeting.
    const rec: any = await recordManager.getRecord(civicpressSessionId);
    expect(rec).toBeTruthy();
    expect(rec.status).toBe('draft');
    expect(
      (rec.linkedRecords || []).some(
        (l: any) => l.id === meeting.id && l.type === 'meeting'
      )
    ).toBe(true);

    // And the meeting lists its recording.
    const recordings = await sessionController.getSessionsForMeeting(meeting.id);
    expect(recordings.map((s: any) => s.id)).toContain(session.id);
  }, 20000);
});
