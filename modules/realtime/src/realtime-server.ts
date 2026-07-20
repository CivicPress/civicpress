/**
 * Realtime WebSocket Server
 *
 * Main WebSocket server for realtime collaborative editing
 */

import { WebSocketServer, WebSocket } from 'ws';
import type {
  Logger,
  HookSystem,
  AuthService,
  RecordManager,
  DatabaseService,
} from '@civicpress/core';
import type { CivicPressConfig } from '@civicpress/core';
import {
  coreError,
  coreInfo,
  coreWarn,
  coreSuccess,
  coreDebug,
  isCivicPressError,
} from '@civicpress/core';
import type {
  RealtimeConfig,
  RealtimeHealthStatus,
} from './types/realtime.types.js';
import { RealtimeConfigManager } from './realtime-config-manager.js';
import { RoomManager, type Room } from './rooms/room-manager.js';
import { extractToken, parseRoomId } from './auth.js';
import { AuthenticationFailedError } from './errors/realtime-errors.js';
import { MessageType } from './types/messages.js';
import type {
  HandlerRegistry,
  RoomTypeHandler,
  ConnectionContext,
  MessageContext,
  DisconnectContext,
  AuthResult,
  RoomReference,
  RoomState as HandlerRoomState,
  ClientData,
} from './types/handler-registry.types.js';
import { createHandlerRegistry } from './handler-registry.js';
import { SnapshotManager } from './persistence/snapshots.js';
import {
  DatabaseSnapshotStorage,
  FilesystemSnapshotStorage,
} from './persistence/storage.js';
import { YjsRoom } from './rooms/yjs-room.js';
import { dispatchYjsBinaryFrame, setupYjsConnection } from './yjs-sync.js';
import * as Y from 'yjs';

/**
 * Hook name announcing that a user's server-side sessions were revoked
 * (logout-everywhere, password change — `AuthService.deleteUserSessions`).
 *
 * WHY the realtime server cares: WebSocket authentication is a CONNECT-TIME
 * check only — `validateSession` runs once during the upgrade and nothing
 * re-validates on subsequent frames. So a session revoked server-side leaves any
 * ALREADY-ESTABLISHED socket for that user fully live (still reading the room,
 * still writing edits) until it happens to reconnect. Subscribing to this hook
 * is the defense-in-depth that closes that window.
 *
 * STATUS (2026-07-20): nothing in core EMITS this yet. `SessionOps
 * .deleteUserSessions` (core/src/auth/auth-service/session-ops.ts) deletes the
 * rows and returns, and `AuthService` holds no HookSystem at all — so the
 * subscriber below is dormant until core adds the emission. It is wired now
 * (rather than after) because the in-process host can already drive the same
 * teardown directly via `revokeUserConnections()`, which needs no core change.
 */
export const SESSION_REVOKED_HOOK = 'auth:sessions:revoked';

/** Payload contract for {@link SESSION_REVOKED_HOOK}. */
export interface SessionRevokedPayload {
  /** User whose sessions were revoked (numeric id, or its string form). */
  userId: number | string;
  /** Optional cause, surfaced to the client in the close frame. */
  reason?: string;
}

/** The handler shape `HookSystem.registerHook` accepts (core exports no alias). */
type CoreHookHandler = Parameters<HookSystem['registerHook']>[1];

/**
 * Narrow an untyped hook payload to {@link SessionRevokedPayload}.
 *
 * HookSystem payloads are `unknown` by design and the bus is shared with every
 * other module, so a malformed/foreign payload must be IGNORED — never coerced
 * into a truthy key (`String(undefined)` would be a live map key) and never
 * thrown back into the bus.
 */
function readSessionRevokedPayload(
  data: unknown
): { userId: string; reason?: string } | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const { userId, reason } = data as { userId?: unknown; reason?: unknown };
  if (typeof userId !== 'string' && typeof userId !== 'number') {
    return null;
  }
  const key = String(userId);
  if (key.length === 0) {
    return null;
  }
  return { userId: key, reason: typeof reason === 'string' ? reason : undefined };
}

/** The connection identity used for limits, per-user tracking, and metadata. */
interface ConnectionIdentity {
  /** Stable id for metadata (numeric user id, or the device id string). */
  id: number | string;
  /** Key for the per-user connection set (namespaced for devices). */
  userId: string;
  username: string;
  role: string;
}

/**
 * Resolve the connection identity from the server-side user session (when
 * present) or the handler's onConnect result (device, else user). Returns null
 * when a handler-authenticated room produced neither — a misconfiguration.
 */
function resolveConnectionIdentity(
  authUser: { id: number; username: string; role: string } | null,
  authResult: AuthResult
): ConnectionIdentity | null {
  if (authUser) {
    return {
      id: authUser.id,
      userId: String(authUser.id),
      username: authUser.username,
      role: authUser.role,
    };
  }
  if (authResult.deviceAuth) {
    const d = authResult.deviceAuth;
    // Namespace the per-user key so a device can't collide with user id N.
    return {
      id: d.deviceId,
      userId: `device:${d.deviceId}`,
      username: `device:${d.deviceUuid}`,
      role: 'device',
    };
  }
  if (authResult.userAuth) {
    const u = authResult.userAuth;
    return {
      id: u.userId,
      userId: String(u.userId),
      username: u.username,
      role: u.role,
    };
  }
  return null;
}

export class RealtimeServer {
  private logger: Logger;
  private hookSystem: HookSystem;
  private authService: AuthService;
  private recordManager: RecordManager | null = null;
  private databaseService: DatabaseService | null = null;
  private configManager: RealtimeConfigManager;
  private config: CivicPressConfig;
  private server: WebSocketServer | null = null;
  private roomManager: RoomManager | null = null;
  private snapshotManager: SnapshotManager | null = null;
  private connections: Map<string, WebSocket> = new Map();
  // clientId → device identity, populated when a connection authenticates as a
  // device (authResult.deviceAuth). Device rooms read this (DeviceRoom.sendToDevice)
  // to resolve a device's live socket for OUTBOUND commands — without it the
  // server receives device frames but can never deliver commands back.
  private clientToDevice: Map<
    string,
    { deviceId: string; deviceUuid: string; organizationId: string }
  > = new Map();
  // Connection-limit bookkeeping (realtime-001/002): written only by
  // handleConnectionWithHandler (register) + handleDisconnect (release).
  private connectionCounts: Map<string, number> = new Map(); // IP -> open count
  private userConnections: Map<string, Set<string>> = new Map(); // userId -> clientIds
  // clientId -> that connection's canonical teardown closure (the SAME one its
  // socket 'close' listener runs). Lets an OUT-OF-BAND event — session
  // revocation — run the single disconnect path immediately instead of waiting
  // for the close handshake to round-trip. Written next to the 'close' wiring,
  // erased in handleDisconnect (the write/erase pairing, as with the count maps).
  private clientDisconnectors: Map<string, () => void> = new Map();
  // Bound session-revocation subscriber; non-null only while subscribed, so
  // shutdown() can detach it from the (process-wide) core hook bus.
  private sessionRevokedListener: CoreHookHandler | null = null;
  private realtimeConfig: RealtimeConfig | null = null;
  private initialized: boolean = false;
  private snapshotInterval: NodeJS.Timeout | null = null;
  private static readonly SNAPSHOT_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h TTL sweep
  // Message rate limiting: clientId -> { count: number, resetTime: number }
  private messageRateLimits: Map<
    string,
    { count: number; resetTime: number; warned: boolean }
  > = new Map();
  // Handler registry for room type handlers
  private handlerRegistry: HandlerRegistry;

  constructor(
    logger: Logger,
    hookSystem: HookSystem,
    authService: AuthService,
    configManager: RealtimeConfigManager,
    config: CivicPressConfig
  ) {
    this.logger = logger;
    this.hookSystem = hookSystem;
    this.authService = authService;
    this.configManager = configManager;
    this.config = config;
    this.handlerRegistry = createHandlerRegistry();
  }

  /** Set record manager (called after DI container initialization). */
  setRecordManager(recordManager: RecordManager): void {
    this.recordManager = recordManager;
  }

  /** Set database service (for snapshot storage). */
  setDatabaseService(databaseService: DatabaseService): void {
    this.databaseService = databaseService;
  }

  /** Set room manager (called by DI container). */
  setRoomManager(roomManager: RoomManager): void {
    this.roomManager = roomManager;
  }

  /**
   * Initialize the realtime server
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    coreInfo('Initializing realtime server...', {
      operation: 'realtime:server:initialize',
    });

    // Load configuration
    try {
      this.realtimeConfig = await this.configManager.loadConfig();
      this.configManager.validateConfig(this.realtimeConfig);
    } catch {
      // Use default config if file doesn't exist
      this.realtimeConfig = this.configManager.getDefaultConfig();
      coreWarn('Using default realtime configuration', {
        operation: 'realtime:server:initialize',
      });
    }

    // Check if enabled
    if (!this.realtimeConfig.enabled) {
      coreInfo('Realtime server disabled in configuration', {
        operation: 'realtime:server:initialize',
      });
      return;
    }

    // Room manager will be set by DI container via setRoomManager()
    // If not set, create it directly (fallback)
    if (!this.roomManager) {
      this.roomManager = new RoomManager(this.logger, this);
    }

    // Grace window (spec §6.3): keep a clientless room in memory this long
    // before finalizing, so a reconnect within the window recovers edits.
    this.roomManager.setGracePeriodMs(
      this.realtimeConfig.rooms.grace_period_ms
    );

    // Initialize snapshot manager
    if (this.realtimeConfig.snapshots.enabled) {
      // Ensure database table exists if using database storage
      if (
        this.realtimeConfig.snapshots.storage === 'database' &&
        this.databaseService
      ) {
        await this.ensureSnapshotTable();
      }

      const snapshotStorage =
        this.realtimeConfig.snapshots.storage === 'database' &&
        this.databaseService
          ? new DatabaseSnapshotStorage(this.databaseService, this.logger)
          : new FilesystemSnapshotStorage(
              this.config.dataDir || '.system-data',
              this.logger
            );

      this.snapshotManager = new SnapshotManager(this.logger, snapshotStorage);

      // Periodic snapshot trigger (spec §6.2): every `interval` seconds (default
      // 60s) drive the HANDLER snapshot path — binary + collaborative Markdown
      // draft (W5-T11) — the same path grace-finalize, the API trigger, and the
      // shutdown final pass use. The legacy binary-only createRoomSnapshot path
      // and the SnapshotManager.createSnapshot/saveSnapshot/loadSnapshot/
      // applySnapshot methods it used were removed as dead code (Phase 3 followup).
      if (this.realtimeConfig.snapshots.interval > 0) {
        this.snapshotInterval = setInterval(() => {
          void this.runPeriodicSnapshots();
        }, this.realtimeConfig.snapshots.interval * 1000);
        if (typeof this.snapshotInterval.unref === 'function') {
          this.snapshotInterval.unref();
        }
      }

      // SnapshotManager owns its TTL-cleanup interval; server only start/stops.
      this.snapshotManager.startCleanup(
        () => this.roomManager?.getActiveRoomIds() ?? new Set<string>(),
        RealtimeServer.SNAPSHOT_CLEANUP_INTERVAL_MS
      );
    }

    // Defense-in-depth (Tier-A skeptic deferral, 2026-07-16): WS auth is a
    // connect-time check, so sockets established BEFORE a revocation would stay
    // live until they reconnect. Subscribe before the server accepts anything.
    this.subscribeSessionRevocation();

    // Start WebSocket server
    await this.startServer();

    this.initialized = true;
    coreSuccess(
      {
        port: this.realtimeConfig.port,
        path: this.realtimeConfig.path,
      },
      'Realtime server initialized',
      {
        operation: 'realtime:server:initialized',
        port: this.realtimeConfig.port,
        path: this.realtimeConfig.path,
      }
    );
  }

  /**
   * Subscribe to {@link SESSION_REVOKED_HOOK} on the core hook bus. Idempotent.
   *
   * Capability-checked rather than assumed: some hosts (and the standalone
   * runner) inject an emit-only hook stub, and an absent `registerHook` must
   * degrade to a loud warning — not crash server startup. The degradation is
   * logged because it silently disables a security control.
   */
  private subscribeSessionRevocation(): void {
    if (this.sessionRevokedListener) {
      return;
    }
    if (typeof this.hookSystem?.registerHook !== 'function') {
      coreWarn(
        'Hook bus cannot register listeners; session-revocation teardown is OFF',
        {
          operation: 'realtime:server:session-revoked:unavailable',
          hook: SESSION_REVOKED_HOOK,
        }
      );
      return;
    }

    const listener: CoreHookHandler = (data) => {
      const payload = readSessionRevokedPayload(data);
      if (!payload) {
        coreWarn('Ignoring malformed session-revocation event', {
          operation: 'realtime:server:session-revoked:malformed',
          hook: SESSION_REVOKED_HOOK,
        });
        return;
      }
      this.revokeUserConnections(payload.userId, payload.reason);
    };

    this.hookSystem.registerHook(SESSION_REVOKED_HOOK, listener);
    this.sessionRevokedListener = listener;
  }

  /** Detach the session-revocation subscriber (idempotent). */
  private unsubscribeSessionRevocation(): void {
    if (!this.sessionRevokedListener) {
      return;
    }
    if (typeof this.hookSystem?.removeHook === 'function') {
      this.hookSystem.removeHook(
        SESSION_REVOKED_HOOK,
        this.sessionRevokedListener
      );
    }
    this.sessionRevokedListener = null;
  }

  /**
   * Close every live socket belonging to `userId` (session revocation).
   *
   * A WebSocket is authenticated ONCE, during the upgrade; no later frame is
   * re-checked. So when the sessions behind those sockets are revoked, closing
   * them is the only thing that actually ends the user's access — hence this
   * out-of-band kill switch, reachable from the core hook (see
   * {@link SESSION_REVOKED_HOOK}) or called directly by an in-process host.
   *
   * Order matters: the canonical teardown runs FIRST, before the close frame.
   * `ws.close()` only starts a handshake — the `ws` library will wait for the
   * peer's reply (≈30s) before destroying the socket, and a client that simply
   * never replies could keep pushing Yjs updates into the room for that whole
   * window. Running the disconnect path up front drops the connection out of
   * `connections`, which the message handler's liveness gate treats as dead.
   *
   * Matching is on the per-user tracking key — `String(user.id)` for
   * session-authenticated users. Device connections are keyed `device:<id>`, so
   * a USER session revocation can never collaterally kill a device.
   *
   * @returns how many connections were closed.
   */
  revokeUserConnections(userId: number | string, reason?: string): number {
    const userKey = String(userId);
    // Snapshot first: the teardown below mutates this very set (and deletes the
    // map entry once it empties), so iterating it live would skip clients.
    const clientIds = Array.from(this.userConnections.get(userKey) ?? []);
    let closed = 0;

    for (const clientId of clientIds) {
      const ws = this.connections.get(clientId);
      this.clientDisconnectors.get(clientId)?.();
      if (!ws) {
        continue;
      }
      try {
        if (ws.readyState === WebSocket.OPEN) {
          // Tell the client WHY, so the UI can prompt a re-login instead of
          // silently retrying into a rejected reconnect loop.
          ws.send(
            JSON.stringify({
              type: MessageType.CONTROL,
              event: 'session.revoked',
              reason: reason ?? 'session_revoked',
            })
          );
        }
      } catch {
        // Best-effort notice; the close below is what enforces the revocation.
      }
      this.closeWithCode(
        ws,
        4001,
        'SESSION_REVOKED',
        reason ? { reason } : {}
      );
      closed++;
    }

    if (closed > 0) {
      coreWarn('Closed realtime connections for a revoked session', {
        operation: 'realtime:server:session-revoked',
        userId: userKey,
        connectionsClosed: closed,
        reason,
      });
    }
    return closed;
  }

  /** Start WebSocket server. */
  private async startServer(): Promise<void> {
    if (!this.realtimeConfig) {
      throw new Error('Configuration not loaded');
    }

    coreInfo('Starting WebSocket server...', {
      operation: 'realtime:server:start',
      port: this.realtimeConfig.port,
      host: this.realtimeConfig.host,
      path: this.realtimeConfig.path,
    });

    try {
      // Note: We don't use the 'path' option here because ws library requires exact match
      // Instead, we handle path routing in handleConnection() via parseRoomId()
      this.server = new WebSocketServer({
        port: this.realtimeConfig.port,
        host: this.realtimeConfig.host,
        // Cap per-message size — the ws default (~100 MiB) is a one-message
        // memory-DoS surface. 10 MiB comfortably covers Yjs document
        // updates while bounding the damage.
        maxPayload: 10 * 1024 * 1024,
        // Use verifyClient to ensure path starts with /realtime
        verifyClient: (info: {
          origin: string;
          secure: boolean;
          req: { url?: string };
        }): boolean => {
          const url = info.req.url || '';
          const path = this.realtimeConfig!.path;
          const isValid = url.startsWith(path);
          if (!isValid) {
            coreWarn('WebSocket connection rejected: invalid path', {
              operation: 'realtime:server:verifyClient',
              url,
              expectedPath: path,
            });
          }
          return isValid;
        },
      });
    } catch (error) {
      this.logError(
        error,
        'REALTIME_SERVER_CREATE_ERROR',
        { operation: 'realtime:server:create:error' },
        { port: this.realtimeConfig.port, host: this.realtimeConfig.host }
      );
      throw error;
    }

    this.server.on('connection', (ws: WebSocket, req) => {
      // Convert IncomingMessage to our expected format
      // Extract subprotocols from the request (for browser clients)
      // The 'sec-websocket-protocol' header contains comma-separated protocols
      const protocols = req.headers['sec-websocket-protocol']
        ? req.headers['sec-websocket-protocol'].split(',').map((p) => p.trim())
        : undefined;

      const reqData = {
        url: req.url,
        socket: req.socket
          ? { remoteAddress: req.socket.remoteAddress }
          : undefined,
        headers: req.headers as Record<string, string>,
        protocols,
      };
      this.handleConnection(ws, reqData);
    });

    this.server.on('error', (error: Error) => {
      this.logError(error, 'REALTIME_SERVER_ERROR', {
        operation: 'realtime:server:error',
      });
    });

    // Verify server is actually listening
    this.server.on('listening', () => {
      if (!this.realtimeConfig) {
        return;
      }
      const address = this.server?.address();
      const actualPort =
        typeof address === 'object' && address
          ? address.port
          : this.realtimeConfig.port;
      coreInfo('WebSocket server listening', {
        operation: 'realtime:server:listening',
        port: actualPort,
        host:
          typeof address === 'object' && address
            ? address.address
            : this.realtimeConfig.host,
        path: this.realtimeConfig.path,
      });
    });

    coreSuccess(
      {
        port: this.realtimeConfig.port,
        path: this.realtimeConfig.path,
      },
      'WebSocket server started',
      {
        operation: 'realtime:server:started',
        port: this.realtimeConfig.port,
        path: this.realtimeConfig.path,
      }
    );
  }

  /** Handle new WebSocket connection. */
  private async handleConnection(
    ws: WebSocket,
    req: {
      url?: string;
      socket?: { remoteAddress?: string };
      headers?: Record<string, string>;
      protocols?: string[];
    }
  ): Promise<void> {
    const clientId = this.generateClientId();
    const clientIp = req.socket?.remoteAddress || 'unknown';

    coreDebug('WebSocket connection attempt', {
      operation: 'realtime:server:connection:attempt',
      clientId,
      url: req.url,
      ip: clientIp,
    });

    try {
      // Connection limits are enforced post-auth in handleConnectionWithHandler
      // (spec §6.4 — realtime-001), not here, so userId is known when checked.

      // Extract token and room info
      const url = req.url || '';
      const tokenResult = extractToken(url, req.headers, req.protocols);

      // FA-BB-010: query-string tokens are no longer accepted (they leak
      // into proxy/access logs). Tell the operator why the client fails.
      if (tokenResult.rejectedQueryToken) {
        coreWarn(
          'WebSocket connection sent a query-string token — rejected',
          {
            operation: 'realtime:auth:query-token-rejected',
            clientId,
            ip: clientIp,
            recommendation:
              'Use Authorization header (Node.js) or subprotocol (browser) instead',
          }
        );
      }

      if (!tokenResult.token) {
        coreWarn('WebSocket connection rejected: no token provided', {
          operation: 'realtime:server:connection:no-token',
          clientId,
          url: req.url,
          ip: clientIp,
        });
        this.sendError(ws, new AuthenticationFailedError());
        ws.close();
        return;
      }

      const token = tokenResult.token;

      // Parse room ID
      const roomInfo = parseRoomId(url);
      if (!roomInfo) {
        coreWarn('Invalid room URL format', {
          operation: 'realtime:server:connection:invalid-url',
          clientId,
          url,
        });
        this.sendError(ws, new Error('Invalid room URL format'));
        ws.close();
        return;
      }

      const fullRoomId = `${roomInfo.roomType}:${roomInfo.roomId}`;

      coreInfo('Routing WebSocket connection', {
        operation: 'realtime:server:connection:routing',
        clientId,
        roomType: roomInfo.roomType,
        roomId: roomInfo.roomId,
        fullRoomId,
      });

      // Route to the registered handler for this room type
      const customHandler = this.handlerRegistry.getHandler(roomInfo.roomType);
      if (!customHandler) {
        coreWarn('No handler registered for room type', {
          operation: 'realtime:connection:no-handler',
          roomType: roomInfo.roomType,
        });
        ws.close(
          4004,
          JSON.stringify({
            code: 'ROOM_TYPE_NOT_REGISTERED',
            roomType: roomInfo.roomType,
          })
        );
        return;
      }
      await this.handleConnectionWithHandler(
        ws,
        clientId,
        clientIp,
        token,
        roomInfo,
        fullRoomId,
        req,
        customHandler
      );
    } catch (error) {
      this.logError(error, 'REALTIME_CONNECTION_ERROR', {
        operation: 'realtime:server:connection:error',
        clientId,
      });

      const errorToSend =
        error instanceof Error ? error : new Error('Connection failed');
      this.sendError(ws, errorToSend);

      ws.close();
    }
  }

  /**
   * Handle connection using a custom room type handler.
   *
   * Ordering follows spec §6.4 (realtime-001/002):
   *   1. Authenticate (generic, server-side) — establishes userId.
   *   2. Room-type authorization via handler.onConnect.
   *   3. Connection limits — keyed on the now-known userId.
   *   4. Register both per-IP and per-user counts.
   *   5. Wire the SINGLE canonical disconnect path.
   *   6. Room + Yjs wiring + message handling.
   *
   * Steps 1–3 never touch the count maps, so a rejected connection cannot leak.
   */
  private async handleConnectionWithHandler(
    ws: WebSocket,
    clientId: string,
    clientIp: string,
    token: string,
    roomInfo: { roomType: string; roomId: string },
    fullRoomId: string,
    req: {
      url?: string;
      socket?: { remoteAddress?: string };
      headers?: Record<string, string>;
      protocols?: string[];
    },
    handler: RoomTypeHandler
  ): Promise<void> {
    const connectionContext: ConnectionContext = {
      ws,
      clientId,
      clientIp,
      token,
      roomId: roomInfo.roomId,
      fullRoomId,
      url: req.url || '',
      headers: req.headers,
      protocols: req.protocols,
    };

    // 1. Authenticate FIRST (generic, server-side) — the authoritative identity
    //    for limits + per-user tracking. No counts touched here, so failed auth
    //    never leaks (realtime-001/002).
    //    EXCEPTION: handlers that authenticate the connection themselves (device
    //    rooms use device tokens, not user sessions) skip this — their onConnect
    //    is authoritative.
    let authUser: Awaited<ReturnType<AuthService['validateSession']>> = null;
    if (!handler.authenticatesConnection) {
      authUser = await this.authService.validateSession(token);
      if (!authUser) {
        coreWarn('WebSocket authentication failed: invalid session', {
          operation: 'realtime:server:auth:failed',
          clientId,
          roomType: roomInfo.roomType,
          ip: clientIp,
        });
        this.sendError(ws, new AuthenticationFailedError());
        this.closeWithCode(ws, 4001, 'AUTH_FAILED');
        return;
      }
    }

    // 2. Room-type authorization via the handler (room-specific access, e.g.
    //    record permissions); identity is already established above (or, for
    //    handler-authenticated rooms, established by onConnect below).
    let authResult: AuthResult;
    if (handler.onConnect) {
      try {
        authResult = await handler.onConnect(connectionContext);
      } catch (error) {
        this.logError(error, 'HANDLER_AUTH_ERROR', {
          operation: 'realtime:server:handler:auth:error',
          clientId,
          roomType: roomInfo.roomType,
        });
        this.sendError(
          ws,
          error instanceof Error ? error : new Error('Authentication failed')
        );
        this.closeWithCode(ws, 4003, 'PERMISSION_DENIED');
        return;
      }

      if (!authResult.success) {
        coreWarn('Handler authorization failed', {
          operation: 'realtime:server:handler:auth:failed',
          clientId,
          roomType: roomInfo.roomType,
          error: authResult.error,
          errorCode: authResult.errorCode,
        });
        this.sendError(
          ws,
          new AuthenticationFailedError({
            message: authResult.error || 'Authorization failed',
          })
        );
        this.closeWithCode(ws, 4003, 'PERMISSION_DENIED');
        return;
      }
    } else {
      // No onConnect handler, allow connection with empty auth
      authResult = { success: true };
    }

    // Establish the connection identity for limits + per-user tracking +
    // metadata: the user session if there was one, else the handler's auth
    // result (device or user). A handler-authenticated room that yields no
    // identity is a misconfiguration → reject rather than track an anon device.
    const identity = resolveConnectionIdentity(authUser, authResult);
    if (!identity) {
      coreWarn('WebSocket authentication failed: handler yielded no identity', {
        operation: 'realtime:server:auth:no-identity',
        clientId,
        roomType: roomInfo.roomType,
        ip: clientIp,
      });
      this.sendError(ws, new AuthenticationFailedError());
      this.closeWithCode(ws, 4001, 'AUTH_FAILED');
      return;
    }
    const userId = identity.userId;
    authResult.clientMetadata = {
      userId: identity.id,
      username: identity.username,
      role: identity.role,
      ...(authResult.clientMetadata || {}),
    };

    // 3. Connection limits — userId is known now (realtime-001). Still no count
    //    mutation: this is a pure read of the current maps.
    const limitCheck = this.checkConnectionLimits(clientIp, userId);
    if (!limitCheck.ok) {
      coreWarn('WebSocket connection rejected: connection limit exceeded', {
        operation: 'realtime:server:connection:limit',
        clientId,
        ip: clientIp,
        userId,
        reason: limitCheck.reason,
      });
      this.closeWithCode(ws, 4029, 'CONNECTION_LIMIT_EXCEEDED', {
        reason: limitCheck.reason,
      });
      return;
    }

    // 4. Register: increment per-IP count AND add to the per-user set. Both are
    //    released together in handleDisconnect (the write/erase pairing).
    this.connections.set(clientId, ws);
    this.connectionCounts.set(
      clientIp,
      (this.connectionCounts.get(clientIp) ?? 0) + 1
    );
    const userSet = this.userConnections.get(userId) ?? new Set<string>();
    userSet.add(clientId);
    this.userConnections.set(userId, userSet);

    // Device connections: index clientId → device identity so device rooms can
    // resolve THIS socket for outbound commands (DeviceRoom.sendToDevice).
    if (authResult.deviceAuth) {
      const d = authResult.deviceAuth as any;
      this.clientToDevice.set(clientId, {
        deviceId: String(d.deviceId),
        deviceUuid: d.deviceUuid,
        organizationId: d.organizationId ?? '',
      });
    }

    this.messageRateLimits.set(clientId, {
      count: 0,
      resetTime: Date.now() + 1000,
      warned: false,
    });

    // 5. Wire the SINGLE canonical disconnect path IMMEDIATELY, before any await
    //    below — the counts are registered, so the teardown listener must cover
    //    the WHOLE post-register window or a close mid-await leaks (realtime-002).
    //    These vars start unset and fill in as setup progresses; runDisconnect()
    //    reads them live and handleDisconnect tolerates partial setup (see doc).
    let room: Room | undefined;
    let roomReference: RoomReference | undefined;
    let yjsUpdateCleanup: (() => void) | null = null;
    let established = false;
    const runDisconnect = (): void => {
      this.handleDisconnect({
        ws,
        clientId,
        clientIp,
        userId,
        fullRoomId,
        roomType: roomInfo.roomType,
        room,
        roomReference,
        authResult,
        handler,
        yjsUpdateCleanup,
        established,
      });
      yjsUpdateCleanup = null;
    };
    ws.once('close', runDisconnect);
    // Also index it so an out-of-band kill (revokeUserConnections) can run the
    // SAME path without waiting for the close handshake. handleDisconnect is
    // idempotent, so the later 'close' is a no-op.
    this.clientDisconnectors.set(clientId, runDisconnect);

    if (!this.roomManager) {
      throw new Error('Room manager not initialized');
    }

    // Enforce rooms.max_rooms — previously only reported in health metrics
    // while room creation stayed unbounded (memory DoS via unique room ids).
    // Joining an EXISTING room is always allowed at the cap.
    const maxRooms = this.realtimeConfig?.rooms.max_rooms || 100;
    if (
      !this.roomManager.getRoom(fullRoomId) &&
      this.roomManager.getRoomCount() >= maxRooms
    ) {
      throw new Error(
        `Room limit reached (${maxRooms}); cannot create room ${fullRoomId}`
      );
    }

    room = this.roomManager.getOrCreateRoom(fullRoomId, roomInfo.roomType, {});
    // Non-undefined alias: closures below lose narrowing on the captured `room`.
    const joinedRoom = room;

    // Room reference for the handler. The room's RoomState (realtime.types) is
    // structurally assignable to the handler-facing RoomState — loose ClientData.
    roomReference = {
      roomId: fullRoomId,
      roomType: roomInfo.roomType,
      getState: (): HandlerRoomState => joinedRoom.getState(),
      addClient: (cid: string, clientData: ClientData) =>
        joinedRoom.addClient(cid, clientData),
      removeClient: (cid: string) => joinedRoom.removeClient(cid),
      updateActivity: () => {
        const maybeActivity = (joinedRoom as { updateActivity?: () => void })
          .updateActivity;
        if (typeof maybeActivity === 'function') {
          maybeActivity.call(joinedRoom);
        }
      },
    };

    joinedRoom.addClient(clientId, {
      id: clientId,
      roomId: fullRoomId,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      ...(authResult.clientMetadata || {}),
    });

    ws.send(
      JSON.stringify({
        type: 'control',
        event: 'connection.ack',
        roomId: fullRoomId,
        clientId,
      })
    );

    // Call post-connect handler if available (async — see step 5's race note).
    if (handler.onPostConnect) {
      try {
        await handler.onPostConnect(connectionContext, authResult);
      } catch (error) {
        coreWarn('Handler post-connect failed', {
          operation: 'realtime:server:handler:post-connect:error',
          clientId,
          roomType: roomInfo.roomType,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue anyway — post-connect is optional.
      }
    }

    // Generic Yjs wiring (hydrate + fan-out + initial handshake). Assigns the
    // outer `yjsUpdateCleanup` so the close handler can tear it down mid-setup.
    if (joinedRoom instanceof YjsRoom) {
      yjsUpdateCleanup = await setupYjsConnection(
        ws,
        joinedRoom,
        clientId,
        () => this.initializeRoom(joinedRoom, roomInfo.roomId)
      );
    }

    ws.on('message', async (data: Buffer) => {
      // Liveness gate. Presence in `connections` is what handleDisconnect
      // clears, and that can run BEFORE the socket finishes closing — notably on
      // session revocation, where the peer may sit on the close handshake (ws
      // waits ~30s before destroying the socket) and keep sending. Without this,
      // a revoked client's Yjs updates would still be applied to the room.
      if (!this.connections.has(clientId)) {
        return;
      }
      try {
        // Binary y-protocols frames are routed first; ping/control fall through.
        if (
          joinedRoom instanceof YjsRoom &&
          dispatchYjsBinaryFrame(
            ws,
            joinedRoom,
            data,
            clientId,
            () => this.enforceRateLimit(ws, clientId, roomInfo.roomType),
            (rawFrame, excludeId) =>
              this.broadcastToRoom(joinedRoom, rawFrame, excludeId)
          )
        ) {
          return;
        }

        const message = JSON.parse(data.toString());

        // Handle ping/pong (exempt from rate limiting)
        if (message.type === 'ping' || message.type === MessageType.PING) {
          this.sendPong(ws);
          return;
        }

        if (!this.enforceRateLimit(ws, clientId, roomInfo.roomType)) {
          return;
        }

        // Delegate to the room-type handler.
        if (handler.onMessage) {
          const messageContext: MessageContext = {
            ws,
            clientId,
            message,
            rawData: data,
            room: roomReference,
            auth: authResult,
            sendToClient: (targetClientId: string, msg: unknown) => {
              const targetWs = this.connections.get(targetClientId);
              if (targetWs && targetWs.readyState === 1) {
                targetWs.send(JSON.stringify(msg));
              }
            },
            broadcastToRoom: (msg: unknown, excludeClientId?: string) => {
              this.broadcastToRoom(joinedRoom, msg, excludeClientId);
            },
            sendError: (error: Error) => {
              this.sendError(ws, error);
            },
          };

          await handler.onMessage(messageContext);
        }
      } catch (error) {
        this.logError(error, 'HANDLER_MESSAGE_ERROR', {
          operation: 'realtime:server:handler:message:error',
          clientId,
          roomType: roomInfo.roomType,
        });
      }
    });

    // Setup complete: mark established so disconnect does full handler/room
    // teardown (the step-5 'close' listener reads `established` live). If the
    // socket already closed during setup, release now (idempotent) instead of
    // waiting on the async 'close'.
    established = true;
    if (ws.readyState !== WebSocket.OPEN) {
      runDisconnect();
      return;
    }

    this.emitHook('realtime:client:connected', {
      clientId,
      roomId: fullRoomId,
      roomType: roomInfo.roomType,
      timestamp: Date.now(),
    });

    coreInfo('Handler client connected', {
      operation: 'realtime:server:handler:client:connected',
      clientId,
      roomType: roomInfo.roomType,
    });
  }

  /**
   * Check connection limits for an authenticated connection. Pure read of the
   * count maps; `userId` is always known (caller authenticates first) so the
   * per-user branch is reachable (realtime-001). Returns a discriminated result
   * the caller maps to a 4029 close frame.
   */
  private checkConnectionLimits(
    ip: string,
    userId: string
  ): { ok: true } | { ok: false; reason: string } {
    const config = this.realtimeConfig;
    if (!config) {
      return { ok: true };
    }

    const ipCount = this.connectionCounts.get(ip) ?? 0;
    if (ipCount >= config.rate_limiting.connections_per_ip) {
      return {
        ok: false,
        reason: `per-ip connection limit reached (${config.rate_limiting.connections_per_ip})`,
      };
    }

    const userCount = this.userConnections.get(userId)?.size ?? 0;
    if (userCount >= config.rate_limiting.connections_per_user) {
      return {
        ok: false,
        reason: `per-user connection limit reached (${config.rate_limiting.connections_per_user})`,
      };
    }

    return { ok: true };
  }

  /**
   * The single canonical disconnect path for every connection: Yjs fan-out
   * removal, handler.onDisconnect, room/participant removal, rate-limit state,
   * and release of BOTH count maps (deleting each entry at zero). One path =>
   * the realtime-002 leak cannot recur.
   *
   * IDEMPOTENT + PARTIAL-SETUP-TOLERANT (close-during-setup race): the 'close'
   * listener is wired synchronously-adjacent to register, so this can fire before
   * setup completes, or twice. It ALWAYS releases the unconditionally-registered
   * state (counts + connections + rate-limit), guarded against double-decrement by
   * an early return once the connection leaves `connections` (the liveness gate);
   * room/handler/fan-out teardown is gated on actually reaching those stages.
   */
  private handleDisconnect(params: {
    ws: WebSocket;
    clientId: string;
    clientIp: string;
    userId: string;
    fullRoomId: string;
    roomType: string;
    room: Room | undefined;
    roomReference: RoomReference | undefined;
    authResult: AuthResult;
    handler: RoomTypeHandler;
    yjsUpdateCleanup: (() => void) | null;
    established: boolean;
  }): void {
    const {
      clientId,
      clientIp,
      userId,
      fullRoomId,
      roomType,
      room,
      roomReference,
      authResult,
      handler,
      yjsUpdateCleanup,
      established,
    } = params;

    // Idempotency gate: live == present in `connections`. A duplicate fire
    // (belt-and-suspenders after the listener already ran) returns before
    // touching any count, so a socket close can never decrement twice.
    if (!this.connections.has(clientId)) {
      return;
    }
    this.connections.delete(clientId);
    this.clientToDevice.delete(clientId);
    this.clientDisconnectors.delete(clientId);

    // Yjs fan-out teardown — null if the socket closed before fan-out was wired.
    if (yjsUpdateCleanup) {
      yjsUpdateCleanup();
    }

    // Handler teardown only for a fully established connection: one that closed
    // mid-setup never became usable, so it gets no paired onDisconnect.
    if (established && handler.onDisconnect && roomReference) {
      const disconnectContext: DisconnectContext = {
        clientId,
        room: roomReference,
        auth: authResult,
      };
      handler.onDisconnect(disconnectContext);
    }

    // Room bookkeeping — `room` is undefined if the socket closed before join.
    if (room) {
      room.removeClient(clientId);
      // Spec §6.3: last-client-leave starts the room's grace timer (finalize on
      // elapse; reconnect cancels). After removeClient so the count is accurate.
      this.roomManager?.handleRoomClientLeave(fullRoomId);
    }
    this.messageRateLimits.delete(clientId);

    // Release per-IP count; delete the key at zero.
    const ipCount = (this.connectionCounts.get(clientIp) ?? 1) - 1;
    if (ipCount <= 0) {
      this.connectionCounts.delete(clientIp);
    } else {
      this.connectionCounts.set(clientIp, ipCount);
    }

    // Release per-user set; delete the key when the user has no more connections.
    const userSet = this.userConnections.get(userId);
    if (userSet) {
      userSet.delete(clientId);
      if (userSet.size === 0) {
        this.userConnections.delete(userId);
      }
    }

    this.emitHook('realtime:client:disconnected', {
      clientId,
      roomId: fullRoomId,
      roomType,
      timestamp: Date.now(),
    });

    coreInfo('Handler client disconnected', {
      operation: 'realtime:server:handler:client:disconnected',
      clientId,
      roomType,
    });
  }

  /**
   * Close a connection with a numeric code and a JSON-encoded reason payload.
   * Failure to send the close frame is logged, never thrown.
   */
  private closeWithCode(
    ws: WebSocket,
    code: number,
    name: string,
    context: Record<string, unknown> = {}
  ): void {
    try {
      ws.close(code, JSON.stringify({ code: name, ...context }));
    } catch (error) {
      coreWarn('Failed to send close frame', {
        operation: 'realtime:server:close:error',
        code,
        name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** @internal Per-IP open-connection counts — connection-limit tests only. */
  getConnectionCounts(): ReadonlyMap<string, number> {
    return this.connectionCounts;
  }

  /** @internal Per-user clientId sets — connection-limit tests only. */
  getUserConnections(): ReadonlyMap<string, ReadonlySet<string>> {
    return this.userConnections;
  }

  /**
   * Check message rate limit for a client
   * Returns whether message is allowed and remaining count
   */
  private checkMessageRateLimit(clientId: string): {
    allowed: boolean;
    remaining: number;
    warning: boolean;
  } {
    if (!this.realtimeConfig) {
      return { allowed: true, remaining: Infinity, warning: false };
    }

    const limit = this.realtimeConfig.rate_limiting.messages_per_second;
    const now = Date.now();

    let rateLimit = this.messageRateLimits.get(clientId);

    // Initialize or reset if window expired
    if (!rateLimit || rateLimit.resetTime <= now) {
      rateLimit = {
        count: 0,
        resetTime: now + 1000, // 1 second window
        warned: false,
      };
      this.messageRateLimits.set(clientId, rateLimit);
    }

    const remaining = Math.max(0, limit - rateLimit.count);
    const allowed = remaining > 0;
    const warning = remaining <= Math.ceil(limit * 0.2); // Warn at 20% remaining

    if (allowed) {
      rateLimit.count++;
    }

    return { allowed, remaining, warning };
  }

  /**
   * Enforce the per-client message rate limit for one inbound message. Returns
   * true when allowed; otherwise sends an error, closes with 1008, returns
   * false. Shared by the binary y-protocols path and the JSON control path.
   */
  private enforceRateLimit(
    ws: WebSocket,
    clientId: string,
    roomType: string
  ): boolean {
    if (this.checkMessageRateLimit(clientId).allowed) {
      return true;
    }
    coreWarn('Message rate limit exceeded', {
      operation: 'realtime:server:rate_limit',
      clientId,
      roomType,
    });
    this.sendError(
      ws,
      new Error(
        `Rate limit exceeded: ${this.realtimeConfig?.rate_limiting.messages_per_second || 10} messages per second`
      )
    );
    ws.close(1008, 'Rate limit exceeded');
    return false;
  }

  /**
   * Normalize and log an error through coreError, coalescing the repeated
   * boilerplate. Non-Error throwables are wrapped; a CivicPressError keeps its
   * own structured code (pass `undefined`, coreError extracts it) while plain
   * Errors get `fallbackCode`. The error message is added to the details; any
   * `extraDetails` are merged in, and `opContext` is forwarded verbatim.
   */
  private logError(
    error: unknown,
    fallbackCode: string,
    opContext: Record<string, unknown>,
    extraDetails: Record<string, unknown> = {}
  ): void {
    const err = error instanceof Error ? error : new Error(String(error));
    coreError(
      err,
      isCivicPressError(err) ? undefined : fallbackCode,
      { error: err.message, ...extraDetails },
      opContext
    );
  }

  /** Send error to client. */
  private sendError(ws: WebSocket, error: Error): void {
    // Domain errors (CivicPressError subclasses) carry a structured `code`;
    // plain Errors do not. Read it structurally without widening to `any`.
    const maybeCode = (error as unknown as { code?: unknown }).code;
    const code = typeof maybeCode === 'string' ? maybeCode : 'UNKNOWN_ERROR';
    const message = {
      type: MessageType.CONTROL,
      event: 'error',
      error: {
        code,
        message: error.message,
      },
    };

    ws.send(JSON.stringify(message));
  }

  /** Send pong response. */
  private sendPong(ws: WebSocket): void {
    const message = {
      type: MessageType.PONG,
      timestamp: Date.now(),
    };

    ws.send(JSON.stringify(message));
  }

  /** Generate unique client ID. */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /** Emit hook event. */
  emitHook(event: string, data: unknown): void {
    this.hookSystem.emit(event, data).catch((error) => {
      this.logError(error, 'REALTIME_HOOK_ERROR', {
        operation: 'realtime:server:hook:error',
        event,
      });
    });
  }

  /** Initialize room with content (from record or snapshot). */
  private async initializeRoom(room: YjsRoom, recordId: string): Promise<void> {
    try {
      // Snapshot-FIRST (W4, spec §6.3): hydrate from the latest integrity-VERIFIED
      // snapshot. loadLatestVerified returns null on hash mismatch / too-new
      // format, so corruption transparently falls through to the Markdown seed.
      if (this.snapshotManager) {
        const row = await this.snapshotManager.loadLatestVerified(room.roomId);
        if (row) {
          Y.applyUpdate(room.getYjsDoc(), row.snapshot_data);
          coreInfo('Room initialized from snapshot', {
            operation: 'realtime:server:room:initialized',
            roomId: room.roomId,
            source: 'snapshot',
            version: row.version,
          });
          return;
        }
      }

      // Markdown-FALLBACK (spec §6.3 t=0): no snapshot — seed the Y.Doc from the
      // record's current Markdown (room.initialize → seedFromMarkdown) so the first
      // client starts from the record content and the writeback preserves it. The
      // room loads via its own RecordManager, so hand it the server's resolved one.
      if (this.recordManager) {
        room.setRecordManager(this.recordManager);
        await room.initialize(recordId);
        coreInfo('Room initialized from record', {
          operation: 'realtime:server:room:initialized',
          roomId: room.roomId,
          source: 'record',
        });
      }
    } catch (error) {
      this.logError(error, 'REALTIME_ROOM_INIT_ERROR', {
        operation: 'realtime:server:room:initialize:error',
        roomId: room.roomId,
      });
      // Continue with empty document
    }
  }

  /**
   * Broadcast a message to all clients in a room, except the sender.
   *
   * `Uint8Array` payloads are sent verbatim (binary y-protocols frames such as
   * awareness); any other value is JSON-encoded.
   */
  private broadcastToRoom(
    room: Room,
    message: unknown,
    excludeClientId?: string
  ): void {
    const payload =
      message instanceof Uint8Array ? message : JSON.stringify(message);
    const state = room.getState();
    for (const participant of state.participants) {
      const ws = this.connections.get(participant.id);
      if (
        ws &&
        ws.readyState === WebSocket.OPEN &&
        participant.id !== excludeClientId
      ) {
        try {
          ws.send(payload);
        } catch (error) {
          this.logError(error, 'REALTIME_SEND_ERROR', {
            operation: 'realtime:server:broadcast:error',
            clientId: participant.id,
          });
        }
      }
    }
  }

  /** Ensure snapshot table exists in database. */
  private async ensureSnapshotTable(): Promise<void> {
    if (!this.databaseService) {
      return;
    }

    try {
      // Check if table exists by trying to query it
      await this.databaseService.query(
        'SELECT 1 FROM realtime_snapshots LIMIT 1'
      );
    } catch (error) {
      // Table doesn't exist, create it
      const errorMessage = error instanceof Error ? error.message : '';
      if (
        errorMessage.includes('no such table') ||
        errorMessage.includes('does not exist')
      ) {
        coreInfo('Creating realtime_snapshots table...', {
          operation: 'realtime:server:migration',
        });

        try {
          // Runtime fallback mirroring persistence/migrations.sql (source of truth).
          await this.databaseService.query(`
            CREATE TABLE IF NOT EXISTS realtime_snapshots (
              id TEXT PRIMARY KEY, room_id TEXT NOT NULL,
              snapshot_data BLOB NOT NULL, version INTEGER NOT NULL,
              integrity_hash TEXT NOT NULL DEFAULT '',
              format_version INTEGER NOT NULL DEFAULT 1,
              byte_size INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
            )
          `);
          await this.databaseService.query(
            `CREATE INDEX IF NOT EXISTS idx_realtime_snapshots_room_id ON realtime_snapshots(room_id)`
          );
          await this.databaseService.query(
            `CREATE INDEX IF NOT EXISTS realtime_snapshots_created_at_idx ON realtime_snapshots(created_at)`
          );

          coreSuccess({}, 'realtime_snapshots table created', {
            operation: 'realtime:server:migration',
          });
        } catch (createError) {
          coreWarn(
            'Failed to create realtime_snapshots table, snapshots will be disabled',
            {
              operation: 'realtime:server:migration:error',
              error:
                createError instanceof Error
                  ? createError.message
                  : String(createError),
            }
          );
          // Disable snapshots if table creation fails
          if (this.realtimeConfig) {
            this.realtimeConfig.snapshots.enabled = false;
          }
        }
      } else {
        // Other error, log it but don't disable snapshots
        coreWarn('Error checking realtime_snapshots table', {
          operation: 'realtime:server:migration:check:error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Periodic snapshot pass (spec §6.2): run the room-type HANDLER snapshot
   * (binary + collaborative Markdown draft) for each live Yjs room with new Yjs
   * updates since its last snapshot. Rooms with no new updates are skipped
   * (no-diff = no write); per-room failures never stall the rest of the pass.
   */
  private async runPeriodicSnapshots(): Promise<void> {
    if (!this.roomManager) {
      return;
    }
    for (const room of this.roomManager.getAllRooms()) {
      // No-diff skip: nothing changed since the last snapshot reset the count.
      if (!(room instanceof YjsRoom) || room.getUpdateCount() === 0) {
        continue;
      }
      try {
        await this.runHandlerSnapshot(room);
      } catch (error) {
        coreWarn('Periodic snapshot failed for room; continuing', {
          operation: 'realtime:server:periodic-snapshot:error',
          roomId: room.roomId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /** Get health status and metrics. */
  getHealthStatus(): RealtimeHealthStatus {
    const address = this.server?.address();
    const addr = typeof address === 'object' && address ? address : null;
    const port = addr ? addr.port : this.realtimeConfig?.port || null;
    const host = addr ? addr.address : this.realtimeConfig?.host || null;

    const uniqueIPs = this.connectionCounts.size;
    const uniqueUsers = this.userConnections.size;
    const roomCount = this.roomManager?.getRoomCount() || 0;
    const maxRooms = this.realtimeConfig?.rooms.max_rooms || 100;

    let memory: RealtimeHealthStatus['memory'];
    if (typeof process.memoryUsage === 'function') {
      const mem = process.memoryUsage();
      memory = {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external || 0,
      };
    }

    const isListening = this.server !== null && this.initialized;
    const isHealthy =
      isListening &&
      roomCount < maxRooms &&
      this.connections.size <
        (this.realtimeConfig?.rate_limiting.connections_per_ip || 100) * 10; // Reasonable upper bound

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      server: {
        listening: isListening,
        port,
        host,
      },
      connections: {
        total: this.connections.size,
        perUser: uniqueUsers,
        perIP: uniqueIPs,
      },
      rooms: {
        total: roomCount,
        maxRooms,
      },
      memory,
      rateLimiting: {
        activeClients: this.messageRateLimits.size,
        messagesPerSecond:
          this.realtimeConfig?.rate_limiting.messages_per_second || 10,
      },
    };
  }

  /** Shutdown the realtime server. */
  async shutdown(): Promise<void> {
    coreInfo('Shutting down realtime server...', {
      operation: 'realtime:server:shutdown',
    });

    // Detach from the (process-wide) core hook bus first: a listener left behind
    // would keep this dead server — and every map it owns — reachable forever.
    this.unsubscribeSessionRevocation();

    // Stop snapshot intervals (periodic snapshot + manager-owned TTL cleanup).
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
    this.snapshotManager?.stopCleanup();
    // Cancel pending grace finalizers — shutdown does its own final snapshot
    // pass below, so an armed timer would double-snapshot / fire post-teardown.
    this.roomManager?.clearAllGraceTimers();

    // Final snapshot pass for all live rooms — via the HANDLER path (binary +
    // collaborative Markdown draft), the same path periodic/grace-finalize use, so
    // a shutdown mid-session also flushes the draft (not just the Yjs binary).
    if (this.roomManager) {
      for (const room of this.roomManager.getAllRooms()) {
        if (room instanceof YjsRoom) {
          await this.runHandlerSnapshot(room);
        }
      }
    }

    // Close all connections
    for (const ws of this.connections.values()) {
      ws.close();
    }
    this.connections.clear();
    this.clientDisconnectors.clear();
    this.messageRateLimits.clear();
    // Release connection-limit bookkeeping too, for symmetry with the maps
    // above (a fresh server must start with empty count state).
    this.connectionCounts.clear();
    this.userConnections.clear();

    // Cleanup rooms
    if (this.roomManager) {
      const rooms = this.roomManager.getAllRooms();
      for (const room of rooms) {
        await room.destroy();
      }
    }

    // Close server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => {
          resolve();
        });
      });
      this.server = null;
    }

    this.initialized = false;
    coreSuccess({}, 'Realtime server shut down', {
      operation: 'realtime:server:shutdown:complete',
    });
  }

  /** Get room manager (for DI container access). */
  getRoomManager(): RoomManager | null {
    return this.roomManager;
  }

  /**
   * Get the snapshot manager (created lazily in initialize()).
   *
   * Exposed so room-type handlers (e.g. RecordRoomHandler) registered at DI
   * time can reach it through a provider closure once it exists.
   */
  getSnapshotManager(): SnapshotManager | null {
    return this.snapshotManager;
  }

  /** Get handler registry for registering room type handlers. */
  getHandlerRegistry(): HandlerRegistry {
    return this.handlerRegistry;
  }

  /**
   * Register a room type handler
   *
   * This allows external modules to handle specific room types.
   * When a connection is made to a room of the registered type,
   * the handler's methods will be called instead of default handling.
   */
  registerRoomTypeHandler(handler: RoomTypeHandler): void {
    this.handlerRegistry.registerRoomTypeHandler(handler);
    coreInfo('Room type handler registered via RealtimeServer', {
      operation: 'realtime:server:handler:registered',
      roomType: handler.roomType,
    });
  }

  /** Get connection for a client ID (used by handlers for message routing). */
  getConnection(clientId: string): WebSocket | undefined {
    return this.connections.get(clientId);
  }

  /** Get all connections map (used by handlers for broadcasting). */
  getConnections(): Map<string, WebSocket> {
    return this.connections;
  }

  /**
   * Look up the room-type handler's `snapshot(room)` and run it; true if taken,
   * false if the handler has none. Shared by grace-finalize + API-trigger.
   */
  private async runHandlerSnapshot(room: YjsRoom): Promise<boolean> {
    const handler = this.handlerRegistry.getHandler(room.roomType) as
      | { snapshot?: (room: YjsRoom) => Promise<void> }
      | undefined;
    if (typeof handler?.snapshot !== 'function') {
      return false;
    }
    await handler.snapshot(room);
    return true;
  }

  /**
   * Finalize a room at the end of its grace window (spec §6.3): persist in-flight
   * Yjs state via the handler before RoomManager.finalizeRoom evicts it. No-op
   * for a non-Yjs room. Errors propagate (the caller evicts regardless).
   */
  async finalizeRoomSnapshot(room: Room): Promise<void> {
    if (room instanceof YjsRoom) {
      await this.runHandlerSnapshot(room);
    }
  }

  /**
   * Trigger a snapshot for a record (the in-process `POST /records/:id/snapshot`
   * seam). Delegates to the `records` handler, then reads the persisted version
   * back. Returns a no-op `{ false, null, ts }` when there is no active room /
   * snapshot-capable handler; otherwise reflects the latest persisted row for
   * `records:<id>` (false when snapshots are disabled / produced no row). `ts` is
   * ms epoch; handler errors rethrow.
   */
  async triggerRecordSnapshot(recordId: string): Promise<{
    snapshotCreated: boolean;
    version: number | null;
    timestamp: number;
  }> {
    const timestamp = Date.now();
    const noop = { snapshotCreated: false, version: null, timestamp };
    if (!this.roomManager) {
      coreWarn('Cannot trigger snapshot: room manager not initialized', {
        operation: 'realtime:snapshot:trigger:error',
        recordId,
      });
      return noop;
    }

    // Use canonical records: key (parseRoomId normalizes singular record → records)
    const roomKey = `records:${recordId}`;
    const foundRoom = this.roomManager.getRoom(roomKey);
    const room = foundRoom instanceof YjsRoom ? foundRoom : null;
    if (!room) {
      coreDebug('No active room found for record snapshot', {
        operation: 'realtime:snapshot:trigger:no-room',
        recordId,
        roomKey,
      });
      return noop;
    }

    try {
      if (!(await this.runHandlerSnapshot(room))) {
        coreWarn('No snapshot-capable handler for room type', {
          operation: 'realtime:snapshot:trigger:no-handler',
          recordId,
          roomType: room.roomType,
        });
        return noop;
      }
      // Read the persisted version back; null row → snapshots disabled / no row.
      const row = await this.snapshotManager?.loadLatest(roomKey);
      coreInfo('Record snapshot triggered via API', {
        operation: 'realtime:snapshot:triggered',
        recordId,
        roomId: room.getRoomId(),
        version: row?.version ?? null,
      });
      return {
        snapshotCreated: row != null,
        version: row?.version ?? null,
        timestamp,
      };
    } catch (error) {
      this.logError(
        error,
        'REALTIME_SNAPSHOT_TRIGGER_ERROR',
        { operation: 'realtime:snapshot:trigger:error', recordId },
        { recordId, roomId: room.getRoomId() }
      );
      throw error;
    }
  }
}
