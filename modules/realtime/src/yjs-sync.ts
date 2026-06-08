/**
 * Generic Yjs wire-protocol helpers (broker side)
 *
 * These functions implement the y-websocket binary protocol (SYNC + AWARENESS)
 * generically against a room's Y.Doc. They are intentionally ROOM-TYPE-AGNOSTIC:
 * nothing in this file references `record`, `device`, or any concrete room type.
 *
 * The broker (RealtimeServer) calls these from its generic connection flow so
 * that EVERY Yjs room gets sync + awareness, regardless of which RoomTypeHandler
 * owns the room. Room-specific behaviour (snapshots, Markdown writeback, ...)
 * stays in the handler lifecycle hooks; the wire protocol lives here.
 *
 * Background: in broadcast-box this logic lived inside `handleUserConnection`,
 * which was the only path that spoke the Yjs wire protocol. W1's handler-only
 * routing removed that path, leaving the generic `handleConnectionWithHandler`
 * with no sync engine. This module re-homes the generic sync into the broker.
 */

import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { coreWarn } from '@civicpress/core';
import type { YjsRoom } from './rooms/yjs-room.js';

// y-websocket top-level message types (the first varUint of every binary frame).
export const YJS_MSG_SYNC = 0;
export const YJS_MSG_AWARENESS = 1;

const WS_OPEN = 1; // WebSocket.OPEN

/**
 * One server-side Awareness instance per room Y.Doc.
 *
 * Keyed by the doc so the lifetime is tied to the room: when the room (and its
 * doc) is destroyed, the entry becomes unreachable and is garbage-collected.
 * The Awareness instance self-reaps stale client entries via its built-in
 * outdated-timeout, so disconnect handling does not need to track per-client
 * awareness ids.
 */
const roomAwareness = new WeakMap<Y.Doc, awarenessProtocol.Awareness>();

/**
 * Get (or lazily create) the server-side Awareness for a room's Y.Doc.
 */
export function getRoomAwareness(
  yjsDoc: Y.Doc
): awarenessProtocol.Awareness {
  let awareness = roomAwareness.get(yjsDoc);
  if (!awareness) {
    awareness = new awarenessProtocol.Awareness(yjsDoc);
    // The server is a relay; it never sets a local awareness state of its own.
    awareness.setLocalState(null);
    roomAwareness.set(yjsDoc, awareness);
  }
  return awareness;
}

/**
 * Read the top-level y-websocket message type from a binary frame without
 * consuming the payload (callers re-decode from the start).
 *
 * Returns `null` for empty/malformed frames.
 */
export function readMessageType(data: Uint8Array): number | null {
  if (data.length === 0) {
    return null;
  }
  try {
    const decoder = decoding.createDecoder(data);
    return decoding.readVarUint(decoder);
  } catch {
    return null;
  }
}

/**
 * Send the initial SYNC handshake to a newly-connected client:
 * SYNC step 1 (server state vector) followed by SYNC step 2 (server state).
 *
 * The client replies to step 1 with its own step 2, and applies our step 2 to
 * converge. This matches the client-server flow documented by y-protocols.
 */
export function sendInitialSync(ws: WebSocket, yjsDoc: Y.Doc): void {
  // SYNC step 1
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, YJS_MSG_SYNC);
    syncProtocol.writeSyncStep1(encoder, yjsDoc);
    ws.send(encoding.toUint8Array(encoder));
  }
  // SYNC step 2 (current document state)
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, YJS_MSG_SYNC);
    syncProtocol.writeSyncStep2(encoder, yjsDoc);
    ws.send(encoding.toUint8Array(encoder));
  }
}

/**
 * Send the current awareness states of a room to a newly-connected client so
 * it sees existing participants immediately (spec §5.x: "awareness: room
 * participants" sent from server on connect). No-op when no states exist yet.
 */
export function sendInitialAwareness(ws: WebSocket, yjsDoc: Y.Doc): void {
  const awareness = getRoomAwareness(yjsDoc);
  const states = awareness.getStates();
  if (states.size === 0) {
    return;
  }
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, YJS_MSG_AWARENESS);
  // The awareness payload is written as a var-length byte array so clients read
  // it back with decoding.readVarUint8Array — matching client-authored frames.
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(
      awareness,
      Array.from(states.keys())
    )
  );
  ws.send(encoding.toUint8Array(encoder));
}

/**
 * Handle an incoming SYNC binary frame.
 *
 * Decodes the sync sub-message and either:
 *  - replies with SYNC step 2 (when the client sent SYNC step 1), or
 *  - applies the incoming update to the room via `room.applyUpdate(...)` (when
 *    the client sent SYNC step 2 or an update), routing through the room so the
 *    room's bookkeeping/validation runs and so the doc 'update' event fires with
 *    `clientId` as origin (the fan-out below uses that to avoid echoing).
 *
 * This is the documented decomposition of `syncProtocol.readSyncMessage` — it
 * uses y-protocols' own sub-message constants and step-1 reader; it does not
 * re-implement the wire format.
 *
 * @param data the full binary frame (including the YJS_MSG_SYNC type byte)
 */
export function handleSyncMessage(
  ws: WebSocket,
  room: YjsRoom,
  data: Uint8Array,
  clientId: string
): void {
  const decoder = decoding.createDecoder(data);
  // Consume the top-level message type (YJS_MSG_SYNC).
  decoding.readVarUint(decoder);

  const yjsDoc = room.getYjsDoc();
  const syncMessageType = decoding.readVarUint(decoder);

  switch (syncMessageType) {
    case syncProtocol.messageYjsSyncStep1: {
      // Client sent its state vector; reply with our full state (step 2).
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, YJS_MSG_SYNC);
      // readSyncStep1 reads the state vector from `decoder` and writes a
      // SYNC step 2 (including the step-2 sub-type) into `encoder`.
      syncProtocol.readSyncStep1(decoder, encoder, yjsDoc);
      ws.send(encoding.toUint8Array(encoder));
      break;
    }
    case syncProtocol.messageYjsSyncStep2:
    case syncProtocol.messageYjsUpdate: {
      // Both carry an encoded update payload; apply it through the room so the
      // room is the single live caller of applyUpdate(). The origin is the
      // sending clientId, which the doc-update fan-out uses to skip the sender.
      const update = decoding.readVarUint8Array(decoder);
      room.applyUpdate(update, clientId);
      break;
    }
    default:
      coreWarn('Unknown Yjs sync sub-message type', {
        operation: 'realtime:yjs-sync:unknown-sync-type',
        clientId,
        syncMessageType,
      });
  }
}

/**
 * Handle an incoming AWARENESS binary frame.
 *
 * Applies the update to the room's server-side Awareness (so the server tracks
 * the participant set and benefits from y-protocols' stale-entry reaping), then
 * relays the original frame to the other clients in the room. Relaying the raw
 * frame (rather than re-encoding) preserves the exact client-authored awareness
 * payload, matching the client-to-client awareness propagation model.
 *
 * @param data the full binary frame (including the YJS_MSG_AWARENESS type byte)
 * @param broadcastRaw sends a raw binary frame to every other client in the room
 */
export function handleAwarenessMessage(
  yjsDoc: Y.Doc,
  data: Uint8Array,
  clientId: string,
  broadcastRaw: (frame: Uint8Array, excludeClientId: string) => void
): void {
  const awareness = getRoomAwareness(yjsDoc);
  const decoder = decoding.createDecoder(data);
  // Consume the top-level message type (YJS_MSG_AWARENESS).
  decoding.readVarUint(decoder);
  const awarenessUpdate = decoding.readVarUint8Array(decoder);

  // Applying the update to the server-side Awareness is best-effort: it lets the
  // server track the participant set and benefit from y-protocols' stale-entry
  // reaping. A malformed or unrecognised payload must NOT abort the relay — the
  // server is fundamentally a relay, and client-to-client awareness propagation
  // is the contract. So we swallow application errors and always forward.
  try {
    // origin = clientId: identifies the source; never reaps the local (null) state.
    awarenessProtocol.applyAwarenessUpdate(awareness, awarenessUpdate, clientId);
  } catch (error) {
    coreWarn('Failed to apply awareness update; relaying anyway', {
      operation: 'realtime:yjs-sync:awareness-apply-failed',
      clientId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Relay the original frame to everyone else in the room.
  broadcastRaw(data, clientId);
}

/**
 * Register a per-connection fan-out of doc updates to this connection's socket.
 *
 * One handler is registered per connection on the shared room doc. For each
 * update, the handler forwards it to THIS socket only when the update did not
 * originate from THIS client (`origin !== clientId`). With one handler per
 * client, every client receives each update exactly once and the originator is
 * never echoed — without the duplicate-send that a per-connection
 * broadcast-to-everyone-else fan-out would cause.
 *
 * @returns a cleanup function that removes the listener (call on disconnect).
 */
export function setupUpdateFanout(
  ws: WebSocket,
  yjsDoc: Y.Doc,
  clientId: string
): () => void {
  const updateHandler = (update: Uint8Array, origin: unknown): void => {
    if (origin === clientId) {
      // Don't echo a client's own update back to it.
      return;
    }
    if (ws.readyState !== WS_OPEN) {
      return;
    }
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, YJS_MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    ws.send(encoding.toUint8Array(encoder));
  };

  yjsDoc.on('update', updateHandler);

  return () => {
    yjsDoc.off('update', updateHandler);
  };
}
