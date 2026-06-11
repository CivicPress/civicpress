/**
 * Shared realtime integration-test harness.
 *
 * Boots a REAL in-memory `RealtimeServer` (over a real `ws` listener on an
 * ephemeral port) and drives it with thin Node-side y-protocols clients — no
 * browser. Built by reusing the patterns the realtime module already ships in
 * `modules/realtime/src/__tests__/test-utils.ts` +
 * `modules/realtime/src/__tests__/realtime.integration.test.ts`, but exposed as
 * a reusable harness so cross-cutting exit-criterion tests (master-plan §5) can
 * assert multi-client + grace-period behaviour from `tests/`.
 *
 * What it provides:
 *   - createTestRealtimeServer({ graceMs }) — a RealtimeServer wired with an
 *     in-memory draft store + filesystem snapshot storage + a real
 *     RecordRoomHandler, so the grace-period finalize path (snapshot → Markdown
 *     writeback) actually runs. `graceMs` flows into the room manager's grace
 *     window (spec §6.3).
 *   - createSimulatedYClient({ ctx, userId, recordId }) — a y-websocket-style
 *     client speaking the y-protocols SYNC wire format over a real WS, exposing
 *     insertText/appendText/getText/flushUpdates/waitForSync/waitForUpdates/
 *     disconnect.
 *
 * Auth: the server's extractToken() reads the `Authorization: Bearer <token>`
 * header first (auth.ts), so the client passes its identity as a bearer token
 * the harness's mock authService decodes back into an AuthUser keyed on userId.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { WebSocket } from 'ws';
import * as yaml from 'yaml';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import type {
  AuthService,
  AuthUser,
  CivicPressConfig,
  DatabaseService,
  DraftRow,
  HookSystem,
  Logger as CoreLogger,
  RecordManager,
} from '@civicpress/core';
import { Logger } from '@civicpress/core';
import { RealtimeConfigManager } from '../../modules/realtime/src/realtime-config-manager.js';
import { RealtimeServer } from '../../modules/realtime/src/realtime-server.js';
import { RoomManager } from '../../modules/realtime/src/rooms/room-manager.js';
import { RecordRoomHandler } from '../../modules/realtime/src/rooms/record-room-handler.js';

const YJS_MSG_SYNC = 0;

/** Bearer-token prefix the mock auth decodes into an identity. */
const TOKEN_PREFIX = 'test-token:';

/** Minimal in-memory draft store satisfying RecordRoomHandler's persistence. */
interface InMemoryDraftStore {
  getDraft(id: string): Promise<DraftRow | null>;
  createDraft(data: {
    id: string;
    title: string;
    type: string;
    status?: string;
    workflow_state?: string;
    markdown_body?: string | null;
    metadata?: string | null;
    author: string;
    created_by: string;
  }): Promise<void>;
  updateDraft(
    id: string,
    updates: {
      title?: string;
      type?: string;
      markdown_body?: string;
      metadata?: string;
    }
  ): Promise<void>;
}

export interface TestRealtimeCtx {
  server: RealtimeServer;
  port: number;
  graceMs: number;
  /** Mint the bearer token the mock auth decodes into `userId`. */
  makeToken(userId: string): string;
  /** Sleep `ms` (grace-window timing helper). */
  tick(ms: number): Promise<void>;
  /** Poll `pred` until true (convergence/eventual-consistency assertions). */
  waitUntil(pred: () => boolean, message: string, timeoutMs?: number): Promise<void>;
  /** Is a room currently in memory? */
  hasRoom(roomId: string): boolean;
  /** The live room instance (identity assertions), or null. */
  getRoom(roomId: string): unknown;
  /** Resolve once a room has been evicted (finalized) from memory. */
  waitForRoomEviction(roomId: string, timeoutMs?: number): Promise<void>;
  /** Read back a draft written by the snapshot writeback. */
  getDraft(recordId: string): Promise<DraftRow | null>;
  /** Shut down the server and clean up the temp dir + sockets. */
  close(): Promise<void>;
}

export interface CreateTestRealtimeServerOptions {
  /** Grace window (ms) before a clientless room is finalized. Default 500. */
  graceMs?: number;
}

/**
 * Boot a RealtimeServer for integration tests, wired so the grace-period
 * finalize path actually snapshots + writes a draft back.
 */
export async function createTestRealtimeServer(
  options: CreateTestRealtimeServerOptions = {}
): Promise<TestRealtimeCtx> {
  const graceMs = options.graceMs ?? 500;

  const testDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'civicpress-realtime-harness-')
  );
  await fs.mkdir(path.join(testDir, '.system-data'), { recursive: true });

  const port = 32000 + Math.floor(Math.random() * 3000);

  // Filesystem snapshot storage keeps the harness free of a real DB while still
  // exercising a real SnapshotManager: finalize persists the Yjs binary and a
  // fresh connect rehydrates from it (spec §6.3 cold-start within TTL).
  const realtimeConfig = {
    realtime: {
      enabled: true,
      port,
      host: '127.0.0.1',
      path: '/realtime',
      rooms: {
        max_rooms: 1000,
        cleanup_timeout: 3600,
        grace_period_ms: graceMs,
      },
      snapshots: {
        enabled: true,
        interval: 0, // No periodic snapshots — grace finalize is the trigger.
        max_updates: 100,
        storage: 'filesystem',
      },
      rate_limiting: {
        messages_per_second: 1000,
        connections_per_ip: 100,
        connections_per_user: 100,
      },
    },
  };
  await fs.writeFile(
    path.join(testDir, '.system-data', 'realtime.yml'),
    yaml.stringify(realtimeConfig),
    'utf8'
  );

  const logger = new Logger({ quiet: true });
  const hookSystem = {
    emit: async () => undefined,
    on: () => undefined,
    off: () => undefined,
  } as unknown as HookSystem;

  const config: CivicPressConfig = {
    dataDir: testDir,
    database: {
      type: 'sqlite',
      sqlite: { file: path.join(testDir, '.system-data', 'test.db') },
    },
    logger: { quiet: true },
  };

  // Auth: decode the bearer token into the requested identity; permissive perms.
  const authService = {
    validateSession: async (token: string): Promise<AuthUser | null> => {
      if (!token.startsWith(TOKEN_PREFIX)) {
        return null;
      }
      const userId = token.slice(TOKEN_PREFIX.length);
      if (!userId) {
        return null;
      }
      return {
        id: userId as unknown as number,
        username: userId,
        role: 'admin',
        email: `${userId}@test.local`,
        name: userId,
      };
    },
    userCan: async () => true,
  } as unknown as AuthService;

  // Any record id resolves to a minimal published record so the record-room
  // path + permission check succeed and the draft create-path can seed title/type.
  const recordManager = {
    getRecord: async (recordId: string) => ({
      id: recordId,
      title: `Record ${recordId}`,
      type: 'bylaw',
      content: '',
      status: 'published',
    }),
  } as unknown as RecordManager;

  // Snapshot storage uses the filesystem branch, so the DatabaseService is only
  // a structural placeholder (no draft path goes through it here).
  const databaseService = {
    query: async () => [],
    execute: async () => undefined,
  } as unknown as DatabaseService;

  // In-memory draft store — the snapshot writeback target the test inspects.
  const draftRows = new Map<string, DraftRow>();
  const draftStore: InMemoryDraftStore = {
    getDraft: async (id) => draftRows.get(id) ?? null,
    createDraft: async (data) => {
      draftRows.set(data.id, {
        id: data.id,
        title: data.title,
        type: data.type,
        status: data.status,
        workflow_state: data.workflow_state,
        markdown_body: data.markdown_body ?? undefined,
        metadata: data.metadata ?? undefined,
        author: data.author,
        created_by: data.created_by,
      });
    },
    updateDraft: async (id, updates) => {
      const existing = draftRows.get(id);
      if (!existing) {
        return;
      }
      draftRows.set(id, { ...existing, ...updates });
    },
  };

  const configManager = new RealtimeConfigManager(
    path.join(testDir, '.system-data')
  );

  const server = new RealtimeServer(
    logger,
    hookSystem,
    authService,
    configManager,
    config
  );
  server.setRecordManager(recordManager);
  server.setDatabaseService(databaseService);

  const roomManager = new RoomManager(logger as unknown as CoreLogger, server);
  server.setRoomManager(roomManager);

  // Real RecordRoomHandler wired so finalize → snapshot → Markdown draft works.
  // getSnapshotManager is a provider because the SnapshotManager is constructed
  // lazily inside server.initialize().
  server.registerRoomTypeHandler(
    new RecordRoomHandler({
      draftPersistence: draftStore,
      recordSource: recordManager,
      getSnapshotManager: () => server.getSnapshotManager(),
    })
  );

  await server.initialize();

  // Wait until the underlying ws server is actually listening.
  await waitFor(
    () => server.getHealthStatus().server.listening,
    5000,
    'Test realtime server failed to start within 5s'
  );

  const openClients = new Set<SimulatedYClient>();
  const ctx: TestRealtimeCtx = {
    server,
    port,
    graceMs,
    makeToken: (userId: string) => `${TOKEN_PREFIX}${userId}`,
    tick: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    waitUntil: (pred, message, timeoutMs = 5000) =>
      waitFor(pred, timeoutMs, message),
    hasRoom: (roomId: string) => roomManager.getRoom(roomId) !== null,
    getRoom: (roomId: string) => roomManager.getRoom(roomId),
    waitForRoomEviction: (roomId: string, timeoutMs = graceMs + 2000) =>
      waitFor(
        () => roomManager.getRoom(roomId) === null,
        timeoutMs,
        `room ${roomId} was not evicted within ${timeoutMs}ms`
      ),
    getDraft: (recordId: string) => draftStore.getDraft(recordId),
    close: async () => {
      for (const c of openClients) {
        c.disconnect();
      }
      openClients.clear();
      try {
        await server.shutdown();
      } catch {
        // ignore
      }
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };

  // Register clients with the ctx so close() tears them down. Stored on the ctx
  // via a non-enumerable back-reference the client factory reads.
  (ctx as TestRealtimeCtxInternal).__openClients = openClients;

  return ctx;
}

interface TestRealtimeCtxInternal extends TestRealtimeCtx {
  __openClients: Set<SimulatedYClient>;
}

export interface CreateSimulatedYClientOptions {
  ctx: TestRealtimeCtx;
  userId: string;
  recordId: string;
}

export interface SimulatedYClient {
  /** Replace the document text with `text` (clears any existing text first). */
  insertText(text: string): void;
  /** Append `text` to the end of the document text. */
  appendText(text: string): void;
  /** Current document text. */
  getText(): string;
  /** Resolve after pending local edits have been flushed to + applied by the server. */
  flushUpdates(): Promise<void>;
  /** Resolve once the initial server→client sync handshake has completed. */
  waitForSync(timeoutMs?: number): Promise<void>;
  /** Resolve once `n` remote updates have been applied since the last call/baseline. */
  waitForUpdates(n: number, timeoutMs?: number): Promise<void>;
  /** Abruptly drop the connection (simulates a network drop). */
  disconnect(): void;
}

/**
 * A thin y-protocols client over a real WS connection.
 *
 * Sync model (mirrors a y-websocket provider): on every SYNC frame we hand the
 * decoder to syncProtocol.readSyncMessage against our local doc, which uniformly
 * handles step1 (writes a step2 reply), step2 + update (applies the payload). If
 * a reply was produced we send it back. Local doc updates (origin = this client)
 * are encoded as SYNC update frames and sent to the server, which relays them to
 * the other clients. The shared content is a single `paragraph` XmlElement in the
 * `default` XmlFragment — the TipTap/y-prosemirror shape the server serializes to
 * Markdown at snapshot time (see modules/realtime yjs-room.test.ts).
 */
export async function createSimulatedYClient(
  options: CreateSimulatedYClientOptions
): Promise<SimulatedYClient> {
  const { ctx, userId, recordId } = options;
  const token = ctx.makeToken(userId);

  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('default');

  // Ensure exactly one paragraph > text node exists locally. After the initial
  // sync these may already be present (created by an earlier client); getOrInit
  // resolves to the shared node either way.
  const getText = (): Y.XmlText => {
    let para = fragment.get(0) as Y.XmlElement | undefined;
    if (!(para instanceof Y.XmlElement)) {
      para = new Y.XmlElement('paragraph');
      fragment.insert(0, [para]);
    }
    let text = para.get(0) as Y.XmlText | undefined;
    if (!(text instanceof Y.XmlText)) {
      text = new Y.XmlText();
      para.insert(0, [text]);
    }
    return text;
  };

  let appliedRemoteUpdates = 0;
  let serverSyncFrames = 0;

  // A stable origin token for this client's local transactions, so the doc
  // 'update' handler can distinguish our own edits (forward) from relayed ones.
  const client = { userId, recordId };

  const ws = new WebSocket(
    `ws://127.0.0.1:${ctx.port}/realtime/records/${recordId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  ws.binaryType = 'arraybuffer';

  // Local updates → SYNC update frames to the server. The doc 'update' event
  // fires for BOTH local and remote-applied changes; only forward our own
  // (origin === client) so a relayed update isn't bounced straight back.
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === client && ws.readyState === WebSocket.OPEN) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, YJS_MSG_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      ws.send(encoding.toUint8Array(encoder));
    } else if (origin !== client) {
      appliedRemoteUpdates++;
    }
  });

  ws.on('message', (data: ArrayBuffer | Buffer) => {
    const frame =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (frame.length === 0) {
      return;
    }
    const decoder = decoding.createDecoder(frame);
    let messageType: number;
    try {
      messageType = decoding.readVarUint(decoder);
    } catch {
      return; // Not a binary y-protocols frame (e.g. JSON control) — ignore.
    }
    if (messageType !== YJS_MSG_SYNC) {
      return; // Awareness / control frames are not needed by these tests.
    }
    serverSyncFrames++;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, YJS_MSG_SYNC);
    // readSyncMessage applies step2/update to `doc` (origin = this transaction's
    // default, NOT `client`, so it counts as remote) and writes a step2 reply
    // into `encoder` when the frame was step1.
    syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
    // Only send a reply if readSyncMessage actually wrote one past the type byte.
    if (encoding.length(encoder) > 1 && ws.readyState === WebSocket.OPEN) {
      ws.send(encoding.toUint8Array(encoder));
    }
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`simulated client connect timed out (record ${recordId})`));
      try {
        ws.close();
      } catch {
        // ignore
      }
    }, 5000);
    ws.on('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.on('close', () => {
      clearTimeout(timer);
      // A close before open is a connect failure; after open it's a normal drop.
    });
    ws.on('error', () => {
      // The close handler reports connect failures; the error event is swallowed.
    });
  });

  const applyLocal = (mutate: (text: Y.XmlText) => void): void => {
    doc.transact(() => {
      mutate(getText());
    }, client);
  };

  const client_: SimulatedYClient = {
    insertText: (text: string) => {
      applyLocal((t) => {
        if (t.length > 0) {
          t.delete(0, t.length);
        }
        t.insert(0, text);
      });
    },
    appendText: (text: string) => {
      applyLocal((t) => {
        t.insert(t.length, text);
      });
    },
    getText: () => getText().toString(),
    flushUpdates: async () => {
      // Local update is sent synchronously in the 'update' handler above; give
      // the server a tick to apply + fan out to peers.
      await new Promise<void>((r) => setTimeout(r, 50));
    },
    waitForSync: async (timeoutMs = 5000) => {
      // The server sends SYNC step1 + step2 on connect; once we've processed at
      // least one SYNC frame the doc has the server's current state.
      await waitFor(
        () => serverSyncFrames >= 1,
        timeoutMs,
        `simulated client never synced (record ${recordId})`
      );
      // Settle any reply round-trip.
      await new Promise<void>((r) => setTimeout(r, 30));
    },
    waitForUpdates: async (n: number, timeoutMs = 5000) => {
      const target = appliedRemoteUpdates + n;
      await waitFor(
        () => appliedRemoteUpdates >= target,
        timeoutMs,
        `simulated client did not receive ${n} updates (record ${recordId})`
      );
    },
    disconnect: () => {
      try {
        ws.terminate();
      } catch {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    },
  };

  const openClients = (ctx as TestRealtimeCtxInternal).__openClients;
  if (openClients) {
    openClients.add(client_);
  }

  return client_;
}

/** Poll `pred` until true or `timeoutMs` elapses (then throw `message`). */
async function waitFor(
  pred: () => boolean,
  timeoutMs: number,
  message: string
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (pred()) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(message);
    }
    await new Promise<void>((r) => setTimeout(r, 10));
  }
}
