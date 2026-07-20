/**
 * Realtime Module Test Utilities
 *
 * Provides helper functions for creating test environments and mock services
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { WebSocket } from 'ws';
import * as yaml from 'yaml';
import type { CivicPressConfig, AuthUser } from '@civicpress/core';
import {
  Logger,
  ServiceContainer,
  HookSystem,
  AuthService,
  RecordManager,
  DatabaseService,
} from '@civicpress/core';
import { RealtimeConfigManager } from '../realtime-config-manager.js';
import { RealtimeServer } from '../realtime-server.js';
import { RoomManager } from '../rooms/room-manager.js';
import { RecordRoomHandler } from '../rooms/record-room-handler.js';

export interface TestEnvironment {
  testDir: string;
  config: CivicPressConfig;
  container: ServiceContainer;
  logger: Logger;
  hookSystem: HookSystem;
  authService: AuthService;
  recordManager: RecordManager;
  databaseService: DatabaseService;
  configManager: RealtimeConfigManager;
  realtimeServer: RealtimeServer;
  roomManager: RoomManager;
}

/**
 * Create a test environment for realtime module tests
 */
export async function createTestEnvironment(): Promise<TestEnvironment> {
  const testDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'civicpress-realtime-test-')
  );

  // Create directory structure
  await fs.mkdir(path.join(testDir, '.system-data'), { recursive: true });
  await fs.mkdir(path.join(testDir, '.civic'), { recursive: true });
  await fs.mkdir(path.join(testDir, 'records'), { recursive: true });

  // Initialize Git repository
  execSync('git init', { cwd: testDir, stdio: 'ignore' });
  execSync('git config user.name "Test User"', {
    cwd: testDir,
    stdio: 'ignore',
  });
  execSync('git config user.email "test@example.com"', {
    cwd: testDir,
    stdio: 'ignore',
  });

  const config: CivicPressConfig = {
    dataDir: testDir,
    database: {
      type: 'sqlite',
      sqlite: {
        file: path.join(testDir, '.system-data', 'test.db'),
      },
    },
    logger: {
      quiet: true, // Quiet logger for tests
    },
  };

  // Create container and services (simplified for testing)
  const container = new ServiceContainer();
  const logger = new Logger({ quiet: true });
  const hookSystem = new HookSystem(testDir);

  // Register basic services
  container.registerInstance('config', config);
  container.registerInstance('logger', logger);
  container.registerInstance('hooks', hookSystem);

  // Create config manager
  const configManager = new RealtimeConfigManager(
    path.join(testDir, '.system-data')
  );

  // Create realtime server (will need mocks for auth and record manager)
  const realtimeServer = new RealtimeServer(
    logger,
    hookSystem,
    {} as AuthService, // Mock - will be replaced in actual tests
    configManager,
    config
  );

  // Create room manager
  const roomManager = new RoomManager(logger as unknown as Logger, realtimeServer);
  realtimeServer.setRoomManager(roomManager);

  return {
    testDir,
    config,
    container,
    logger,
    hookSystem,
    authService: {} as AuthService, // Mock
    recordManager: {} as RecordManager, // Mock
    databaseService: {} as DatabaseService, // Mock
    configManager,
    realtimeServer,
    roomManager,
  };
}

/**
 * Cleanup test environment
 */
export async function cleanupTestEnvironment(
  env: TestEnvironment
): Promise<void> {
  try {
    await fs.rm(env.testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create a mock AuthService for testing
 */
export function createMockAuthService(): Partial<AuthService> {
  return {
    validateSession: async (token: string) => {
      if (token === 'valid-token') {
        return {
          id: 1,
          username: 'testuser',
          role: 'admin',
          email: 'test@example.com',
          name: 'Test User',
        };
      }
      return null;
    },
    userCan: async (user: AuthUser) => {
      // Admin users can do everything
      if (user.role === 'admin') {
        return true;
      }
      return false;
    },
  };
}

/**
 * Create a mock RecordManager for testing
 */
export function createMockRecordManager(): Partial<RecordManager> {
  const mockRecords = new Map<string, unknown>();

  const mock: Partial<RecordManager> & {
    _addTestRecord?: (recordId: string, record: unknown) => void;
  } = {
    getRecord: async (recordId: string) => {
      return (mockRecords.get(recordId) ?? null) as Awaited<
        ReturnType<RecordManager['getRecord']>
      >;
    },
  };

  // Add test helper method (not part of interface)
  mock._addTestRecord = (recordId: string, record: unknown) => {
    mockRecords.set(recordId, record);
  };

  return mock;
}

// ---------------------------------------------------------------------------
// createTestServer harness (connection-limit + lifecycle tests)
//
// W1 made connection routing handler-only: a connection to a room type with no
// registered handler is closed with 4004 ROOM_TYPE_NOT_REGISTERED before any
// further logic runs. This harness therefore ALWAYS registers a RecordRoomHandler
// for the `records` room type so `records:*` connections actually open.
//
// Generic authentication runs server-side (validateSession) before the handler,
// so the mock authService here decodes the token minted by makeToken() into an
// AuthUser whose identity is the caller-supplied userId. That is what the
// connection-limit accessors (getUserConnections) key on.
// ---------------------------------------------------------------------------

const TOKEN_PREFIX = 'test-token:';

export interface ConnectionLimits {
  connectionsPerIp?: number;
  connectionsPerUser?: number;
  messagesPerSecond?: number;
}

export interface CreateTestServerOptions {
  connectionLimits?: ConnectionLimits;
  /**
   * Turn on DB-backed snapshots against a REAL in-memory SQLite
   * DatabaseService. The default harness DB is a stub that answers every query
   * with `[]`, which is fine for connection-lifecycle tests but useless to the
   * persistence/recovery tests — those corrupt real rows and read them back.
   */
  snapshots?: boolean;
  /** Markdown the harness RecordManager returns for every record id. */
  recordContent?: string;
}

export interface ClosedSocketInfo {
  /** WebSocket.CLOSED readyState (always reached by the time this resolves). */
  readyState: number;
  closeCode: number;
  closeReason: string;
}

export interface TestServerCtx {
  server: RealtimeServer;
  port: number;
  /** The loopback IP the server sees for local test connections. */
  localIp: string;
  /**
   * Real SQLite DatabaseService backing snapshots — non-null only when the
   * harness was created with `{ snapshots: true }`.
   */
  db: DatabaseService | null;
  /** Emit on the harness hook bus, driving the server's OWN subscribers. */
  emitHook(name: string, data: unknown): Promise<void>;
  /** Mint a token that the harness auth decodes into the given identity. */
  makeToken(identity: { userId: string | number }): string;
  /** Open a connection and resolve once it is OPEN. */
  connect(args: { token: string; roomId: string }): Promise<WebSocket>;
  /**
   * Open a connection expecting it to be REJECTED (closed before/instead of
   * staying open). Resolves with the close code + reason once closed.
   */
  connectExpectingClose(args: {
    token: string;
    roomId: string;
  }): Promise<ClosedSocketInfo>;
  /** Resolve once the given socket has fully closed. */
  waitForDisconnect(ws: WebSocket): Promise<void>;
  /** Close the server and all sockets. */
  close(): Promise<void>;
}

/**
 * Create a running RealtimeServer wired for connection-lifecycle tests.
 */
export async function createTestServer(
  options: CreateTestServerOptions = {}
): Promise<TestServerCtx> {
  const limits = options.connectionLimits ?? {};

  const testDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'civicpress-realtime-limits-')
  );
  await fs.mkdir(path.join(testDir, '.system-data'), { recursive: true });

  const port = 30000 + Math.floor(Math.random() * 2000);

  const realtimeConfig = {
    realtime: {
      enabled: true,
      port,
      host: '127.0.0.1',
      path: '/realtime',
      rooms: {
        max_rooms: 1000,
        cleanup_timeout: 3600,
      },
      // Snapshots off by default: the connection-lifecycle tests exercise the
      // socket lifecycle, not persistence, and a record-less in-memory doc is
      // sufficient. `interval: 0` disables the periodic snapshot timer even when
      // they ARE on, so persistence tests assert against explicit writes only.
      snapshots: {
        enabled: options.snapshots === true,
        interval: 0,
        max_updates: 100,
        storage: 'database',
      },
      rate_limiting: {
        messages_per_second: limits.messagesPerSecond ?? 1000,
        connections_per_ip: limits.connectionsPerIp ?? 100,
        connections_per_user: limits.connectionsPerUser ?? 100,
      },
    },
  };
  await fs.writeFile(
    path.join(testDir, '.system-data', 'realtime.yml'),
    yaml.stringify(realtimeConfig),
    'utf8'
  );

  const logger = new Logger({ quiet: true });
  // A minimal but FAITHFUL hook bus. It used to be emit-only, which was enough
  // while the server merely published lifecycle hooks — but the server now also
  // SUBSCRIBES (session revocation), and an emit-only stub would silently
  // disable that path instead of exercising it.
  const hookListeners = new Map<string, Array<(data: unknown) => void>>();
  const hookSystem = {
    emit: async (name: string, data: unknown) => {
      for (const listener of [...(hookListeners.get(name) ?? [])]) {
        listener(data);
      }
    },
    registerHook: (name: string, handler: (data: unknown) => void) => {
      const listeners = hookListeners.get(name) ?? [];
      listeners.push(handler);
      hookListeners.set(name, listeners);
    },
    removeHook: (name: string, handler: (data: unknown) => void) => {
      const listeners = hookListeners.get(name) ?? [];
      const index = listeners.indexOf(handler);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    },
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

  // Auth: validateSession decodes the test token into the requested identity.
  // userCan is permissive (admin) — permission semantics are exercised by the
  // record-room tests, not the connection-limit harness.
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
        // The server keys per-user tracking on String(user.id); using the raw
        // userId string keeps the test assertions (get('user-a')) direct.
        id: userId as unknown as number,
        username: userId,
        role: 'admin',
        email: `${userId}@test.local`,
        name: userId,
      };
    },
    userCan: async () => true,
  } as unknown as AuthService;

  // RecordManager: any record id resolves to a minimal published record so the
  // record-room path (and its permission check) succeeds. `content` is the
  // Markdown the room falls back to when there is no usable snapshot.
  const recordManager = {
    getRecord: async (recordId: string) => ({
      id: recordId,
      title: `Record ${recordId}`,
      type: 'bylaw',
      content: options.recordContent ?? '# Test\n',
      status: 'published',
    }),
  } as unknown as RecordManager;

  // Real SQLite only when snapshots are requested — otherwise a stub, so the
  // lifecycle tests keep paying nothing for a DB they never read.
  let db: DatabaseService | null = null;
  if (options.snapshots) {
    db = new DatabaseService({ type: 'sqlite', sqlite: { file: ':memory:' } });
    // Connect the adapter directly: only the realtime_snapshots table matters,
    // and the server's ensureSnapshotTable() creates it — no need for the whole
    // core schema DatabaseService.initialize() would build.
    await db.getAdapter().connect();
  }
  const databaseService =
    db ??
    ({
      query: async () => [],
      execute: async () => undefined,
    } as unknown as DatabaseService);

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

  const roomManager = new RoomManager(
    logger as unknown as Logger,
    server
  );
  server.setRoomManager(roomManager);

  // CRITICAL: register the records room handler, otherwise every records:*
  // connection is closed with 4004 before auth/limits ever run.
  server.registerRoomTypeHandler(new RecordRoomHandler());

  await server.initialize();

  // Wait until the underlying ws server is actually listening.
  await new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const tick = setInterval(() => {
      if (server.getHealthStatus().server.listening) {
        clearInterval(tick);
        resolve();
      } else if (Date.now() - started > 5000) {
        clearInterval(tick);
        reject(new Error('Test server failed to start within 5s'));
      }
    }, 25);
  });

  const openSockets = new Set<WebSocket>();

  const makeToken = (identity: { userId: string | number }): string =>
    `${TOKEN_PREFIX}${identity.userId}`;

  const wsUrlForUrl = (roomId: string): string => {
    const [roomType, ...rest] = roomId.split(':');
    const id = rest.join(':');
    return `ws://127.0.0.1:${port}/realtime/${roomType}/${id}`;
  };

  // Discover the exact remote-address string the server records for a local
  // connection (may be '127.0.0.1' or '::ffff:127.0.0.1' depending on stack),
  // so per-IP assertions key on the real value rather than a guess.
  const localIp = await (async (): Promise<string> => {
    const probe = new WebSocket(wsUrlForUrl('records:__ip_probe__'), {
      headers: { Authorization: `Bearer ${TOKEN_PREFIX}__probe__` },
    });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error('ip-probe connect timed out')),
        4000
      );
      probe.on('open', () => {
        clearTimeout(t);
        resolve();
      });
      probe.on('error', (e) => {
        clearTimeout(t);
        reject(e);
      });
    });
    const counts = server.getConnectionCounts();
    const ip = Array.from(counts.keys())[0] ?? '127.0.0.1';
    await new Promise<void>((resolve) => {
      probe.once('close', () => resolve());
      probe.close();
    });
    // Give the close handler a tick to decrement before the suite proceeds.
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    return ip;
  })();

  // roomId is "<roomType>:<id>" (e.g. "records:r1"); the URL path uses the
  // roomType segment followed by the id.
  const wsUrl = wsUrlForUrl;

  const connect = (args: {
    token: string;
    roomId: string;
  }): Promise<WebSocket> => {
    return new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(wsUrl(args.roomId), {
        headers: { Authorization: `Bearer ${args.token}` },
      });
      openSockets.add(ws);
      const timer = setTimeout(() => {
        reject(new Error(`connect() timed out for ${args.roomId}`));
        try {
          ws.close();
        } catch {
          // ignore
        }
      }, 4000);
      ws.on('open', () => {
        clearTimeout(timer);
        resolve(ws);
      });
      ws.on('close', () => {
        openSockets.delete(ws);
        clearTimeout(timer);
        reject(
          new Error(
            `connect() expected open but socket closed for ${args.roomId}`
          )
        );
      });
      ws.on('error', () => {
        // close handler reports the rejection; ignore the error event itself.
      });
    });
  };

  const connectExpectingClose = (args: {
    token: string;
    roomId: string;
  }): Promise<ClosedSocketInfo> => {
    return new Promise<ClosedSocketInfo>((resolve, reject) => {
      const ws = new WebSocket(wsUrl(args.roomId), {
        headers: { Authorization: `Bearer ${args.token}` },
      });
      openSockets.add(ws);
      const timer = setTimeout(() => {
        reject(
          new Error(`connectExpectingClose() timed out for ${args.roomId}`)
        );
        try {
          ws.close();
        } catch {
          // ignore
        }
      }, 4000);
      ws.on('close', (code: number, reason: Buffer) => {
        openSockets.delete(ws);
        clearTimeout(timer);
        resolve({
          readyState: ws.readyState,
          closeCode: code,
          closeReason: reason.toString(),
        });
      });
      ws.on('error', () => {
        // A rejected connection may surface an error before close; the close
        // handler is authoritative, so swallow the error event.
      });
    });
  };

  const waitForClientClose = (ws: WebSocket): Promise<void> =>
    new Promise<void>((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      const done = (): void => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, 4000);
      ws.once('close', done);
    });

  // Resolve once the SERVER has finished processing the disconnect, not merely
  // when the client socket closed. The client 'close' event can fire a tick
  // before the server's own socket 'close' handler runs handleDisconnect, so
  // we wait for the client close and then poll the server's live connection
  // map until it stabilises at the number of still-open client sockets.
  const waitForDisconnect = async (ws: WebSocket): Promise<void> => {
    await waitForClientClose(ws);
    const deadline = Date.now() + 4000;
    while (server.getConnections().size > openSockets.size) {
      if (Date.now() > deadline) {
        break;
      }
      await new Promise<void>((r) => setTimeout(r, 10));
    }
  };

  const close = async (): Promise<void> => {
    for (const ws of openSockets) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    openSockets.clear();
    try {
      await server.shutdown();
    } catch {
      // ignore
    }
    try {
      await db?.getAdapter().close();
    } catch {
      // ignore
    }
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  const emitHook = async (name: string, data: unknown): Promise<void> => {
    await hookSystem.emit(name, data);
  };

  return {
    server,
    port,
    localIp,
    db,
    emitHook,
    makeToken,
    connect,
    connectExpectingClose,
    waitForDisconnect,
    close,
  };
}
