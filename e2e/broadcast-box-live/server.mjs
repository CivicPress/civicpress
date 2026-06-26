/**
 * Hardware-free live e2e — standalone CivicPress server.
 *
 * Boots a REAL CivicPress API (HTTP :3000 + in-process realtime WS :3001) with
 * the broadcast-box module mounted and the transcription worker running, against
 * a fresh throwaway data dir. A real device PROCESS (the Python broadcast-box
 * app with synthetic capture) then enrolls + connects over the real wire, and a
 * tiny localhost /control/* surface drives it.
 *
 * The /control surface stands in for an authenticated operator UI: start/stop go
 * through the REAL SessionController.startSession/stopSession (which create the
 * broadcast_sessions row + deliver the command to the device), and set_visibility
 * through the REAL DeviceCommandService — only the user-JWT wrapper is skipped.
 *
 * Run:  node_modules/.bin/tsx e2e/broadcast-box-live/server.mjs
 * See   e2e/broadcast-box-live/README.md  for the full recipe.
 */
import express from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';

import { CivicPress } from '../../core/dist/index.js';
import { CentralConfigManager } from '../../core/dist/config/central-config.js';
import {
  RecordSchemaBuilder,
  setModuleResolver,
} from '../../core/dist/records/record-schema-builder.js';
import { ModuleResolver } from '../../core/dist/modules/module-resolver.js';
import { startInProcessRealtime } from '../../modules/api/src/realtime-bootstrap.js';
import { startInProcessBroadcastBox } from '../../modules/api/src/broadcast-box-bootstrap.js';
import { startInProcessTranscription } from '../../modules/api/src/transcription-bootstrap.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const E2E_DIR = process.env.E2E_DIR || path.join(ROOT, '.e2e-live');
const dataDir = path.join(E2E_DIR, 'data');
const systemDataDir = path.join(E2E_DIR, '.system-data');
const BOOTSTRAP_JSON = path.join(E2E_DIR, 'bootstrap.json');
const HTTP_PORT = Number(process.env.E2E_HTTP_PORT || 3000);
const RT_PORT = Number(process.env.E2E_RT_PORT || 3001);
// whisper.cpp (language=en for the JFK sample clip; prod default is fr-CA).
const WHISPER_BIN = process.env.WHISPER_CPP_BIN || '/home/claude/whisper.cpp/build/bin/whisper-cli';
const WHISPER_MODEL = process.env.WHISPER_CPP_MODEL || '/home/claude/whisper.cpp/models/ggml-base.bin';

const log = (...a) => console.log(new Date().toISOString(), ...a);
const logger = { info: log, warn: log, error: log, debug: () => {} };
const SYSTEM_USER = { id: 1, username: 'system', role: 'admin' };

// ── fresh throwaway data dir ────────────────────────────────────────────────
fs.rmSync(E2E_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(dataDir, '.civic'), { recursive: true });
fs.mkdirSync(path.join(dataDir, 'records'), { recursive: true });
fs.mkdirSync(systemDataDir, { recursive: true });
execSync('git init -q && git config user.name T && git config user.email t@e.com', {
  cwd: dataDir,
  shell: '/bin/bash',
});
fs.writeFileSync(
  path.join(systemDataDir, 'realtime.yml'),
  yaml.dump({
    realtime: { enabled: true, port: RT_PORT, host: '127.0.0.1', path: '/realtime' },
  })
);
fs.writeFileSync(
  path.join(dataDir, '.civic', 'config.yml'),
  yaml.dump({
    modules: ['broadcast-box'],
    default_role: 'clerk',
    record_types_config: {
      session: { label: 'Session', description: 'Meeting sessions', source: 'core', priority: 1 },
    },
  })
);

// ── core init + module gating ───────────────────────────────────────────────
const civic = new CivicPress({
  dataDir,
  database: { type: 'sqlite', sqlite: { file: path.join(systemDataDir, 'civic.db') } },
});
await civic.initialize();
const recordManager = civic.getRecordManager();
const container = civic.getContainer();

setModuleResolver(new ModuleResolver(path.join(ROOT, 'modules')));
CentralConfigManager.getModules = () => ['broadcast-box'];
RecordSchemaBuilder.clearCache();

// ── realtime (:3001) + broadcast-box mount + transcription worker ───────────
const realtime = await startInProcessRealtime(civic, logger, true);
log('realtime started:', realtime.started);

const app = express();
app.use(express.json());
const bb = await startInProcessBroadcastBox(civic, app, logger, {
  enabled: true,
  realtimeServer: realtime.server,
});
log('broadcast-box mounted:', bb.started);

const tr = await startInProcessTranscription(
  civic,
  {
    enabled: true,
    engine: 'whisper-cpp',
    language: 'en',
    poll_interval_ms: 3000,
    whisper_cpp: { binary: WHISPER_BIN, model: WHISPER_MODEL, threads: 4 },
  },
  logger
);
log('transcription worker started:', tr.started);

// ── seed a session record + enroll a device ─────────────────────────────────
await recordManager.createRecord(
  { title: 'Live E2E Council Meeting', type: 'session', content: '# Meeting', status: 'published', metadata: {} },
  SYSTEM_USER
);
const { records } = await recordManager.listRecords({ type: 'session' });
const recordId = records[0].id;

const deviceManager = container.resolve('broadcastBoxDeviceManager');
const deviceCommandService = container.resolve('broadcastBoxDeviceCommandService');
const sessionController = container.resolve('broadcastBoxSessionController');

const enrollment = await deviceManager.enrollDevice({ name: 'Live E2E Camera' });
log('enrolled device uuid:', enrollment.deviceUuid, 'code:', enrollment.enrollmentCode);

fs.writeFileSync(
  BOOTSTRAP_JSON,
  JSON.stringify(
    { recordId, deviceUuid: enrollment.deviceUuid, enrollmentCode: enrollment.enrollmentCode, dataDir },
    null,
    2
  )
);

// ── control surface for the driver ──────────────────────────────────────────
function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  return m ? yaml.load(m[1]) : {};
}
let currentSessionId = null;

app.post('/control/start', async (req, res) => {
  try {
    const { deviceUuid, recordId: rid } = req.body;
    const device = await deviceManager.getDeviceByUuid(deviceUuid);
    // The REAL operator path: creates the broadcast_sessions row + delivers
    // start_session to the device (server-generated session id).
    const session = await sessionController.startSession({
      deviceId: device.id,
      civicpressSessionId: rid,
    });
    currentSessionId = session.id;
    res.json({ ok: true, sessionId: session.id });
  } catch (e) {
    log('start error:', e?.message || e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post('/control/visibility', async (req, res) => {
  try {
    const { deviceUuid, visibility } = req.body;
    const ack = await deviceCommandService.executeCommand({
      deviceId: deviceUuid,
      action: 'set_visibility',
      payload: { visibility },
      source: { type: 'api', metadata: { via: 'e2e-control' } },
    });
    res.json({ ok: true, ack });
  } catch (e) {
    log('visibility error:', e?.message || e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post('/control/stop', async (req, res) => {
  try {
    if (!currentSessionId) throw new Error('no active session');
    await sessionController.stopSession(currentSessionId);
    res.json({ ok: true, sessionId: currentSessionId });
    currentSessionId = null;
  } catch (e) {
    log('stop error:', e?.message || e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get('/control/record/:id', async (req, res) => {
  try {
    const rec = await recordManager.getRecord(req.params.id);
    const md = fs.readFileSync(path.join(dataDir, rec.path), 'utf-8');
    res.json({ ok: true, path: rec.path, frontmatter: frontmatter(md) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get('/control/health', (_req, res) =>
  res.json({ ok: true, bb: bb.started, realtime: realtime.started, transcription: tr.started, recordId, deviceUuid: enrollment.deviceUuid })
);

app.listen(HTTP_PORT, () => log(`LIVE SERVER READY http://127.0.0.1:${HTTP_PORT} (realtime :${RT_PORT})`));
