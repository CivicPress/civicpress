#!/usr/bin/env node
/**
 * Operator smoke test for the CivicPress realtime server.
 *
 * The realtime server speaks BINARY y-protocols (Yjs CRDT over WebSocket), NOT
 * JSON. This script performs a real SYNC step-1 / step-2 handshake against a
 * record room so an operator can answer:
 *   - "Is the realtime server actually up and listening on its port?"
 *   - "Are we routing through the right reverse-proxy vhost / WS upgrade path?"
 *   - "Does auth + the binary protocol round-trip end to end?"
 *
 * It is a connectivity probe, not a load test. It connects, exchanges one sync
 * pass, and disconnects.
 *
 * Usage:
 *   WS_URL=wss://your.host \
 *     TOKEN=<session-token> \
 *     RECORD_ID=<existing-record-id> \
 *     node modules/realtime/test-websocket.mjs
 *
 * Defaults: WS_URL=ws://localhost:3001, RECORD_ID=smoke-test.
 * TOKEN is required (the server rejects unauthenticated connections).
 *
 * Auth: the token is sent as the `auth.<token>` WebSocket subprotocol, which is
 * what the server's extractToken() reads (modules/realtime/src/auth.ts). A
 * Node.js client could instead use an `Authorization: Bearer <token>` header;
 * the subprotocol form is used here so the script also documents the
 * browser-compatible path.
 *
 * Imports (yjs / y-protocols / lib0 / ws) are all @civicpress/realtime runtime
 * dependencies, so this script resolves when run from the module workspace.
 */
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync.js';
import * as encoding from 'lib0/encoding.js';
import * as decoding from 'lib0/decoding.js';

// Yjs message-type tags on the wire — these MUST match the server's
// YJS_MSG_SYNC / YJS_MSG_AWARENESS (modules/realtime/src/yjs-sync.ts).
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const WS_URL = process.env.WS_URL ?? 'ws://localhost:3001';
const TOKEN = process.env.TOKEN;
const RECORD_ID = process.env.RECORD_ID ?? 'smoke-test';

if (!TOKEN) {
  console.error(
    'TOKEN env var required (the realtime server rejects unauthenticated connections)'
  );
  process.exit(1);
}

const yDoc = new Y.Doc();
const url = `${WS_URL}/realtime/records/${RECORD_ID}`;
// Token is carried in the `auth.<token>` subprotocol — see extractToken().
const ws = new WebSocket(url, [`auth.${TOKEN}`]);

ws.binaryType = 'arraybuffer';

ws.on('open', () => {
  console.log(`[ok] connected to ${url}`);
  // Send SYNC step 1 — advertise our (empty) state vector so the server replies
  // with everything it has for this room.
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(enc, yDoc);
  ws.send(encoding.toUint8Array(enc));
  console.log('[->] sent SYNC step 1');
});

ws.on('message', (data) => {
  const buf = new Uint8Array(data);
  const dec = decoding.createDecoder(buf);
  const messageType = decoding.readVarUint(dec);
  if (messageType === MESSAGE_SYNC) {
    // Let y-protocols process the sync reply; it may produce a follow-up
    // message (e.g. our SYNC step 2) which we send back.
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    syncProtocol.readSyncMessage(dec, enc, yDoc, ws);
    if (encoding.length(enc) > 1) {
      ws.send(encoding.toUint8Array(enc));
    }
    console.log(
      '[<-] received SYNC message; local doc state size:',
      Y.encodeStateAsUpdate(yDoc).byteLength,
      'bytes'
    );
  } else if (messageType === MESSAGE_AWARENESS) {
    console.log('[<-] received AWARENESS (presence) message (skipped)');
  } else {
    console.log('[<-] received unknown message type:', messageType);
  }
});

ws.on('close', (code, reason) => {
  const reasonText = reason && reason.length ? reason.toString() : 'none';
  console.log(`[ok] closed: code=${code} reason=${reasonText}`);
  // 1000 = normal closure. Any 4xxx code is a server rejection — see the
  // "Close codes" table in modules/realtime/TESTING.md.
  process.exit(code === 1000 ? 0 : 1);
});

ws.on('error', (err) => {
  console.error('[fail] WebSocket error:', err.message);
  if (err.message.includes('ECONNREFUSED')) {
    console.error(
      '       Is the realtime server running and listening on its port?'
    );
  }
  process.exit(1);
});

// Give the handshake a few seconds, then close cleanly.
setTimeout(() => {
  console.log('[ok] smoke test complete');
  ws.close(1000);
}, 3000);
