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
import type { RealtimeConfig } from './types/realtime.types.js';
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
import {
  dispatchYjsBinaryFrame,
  setupYjsConnection,
} from './yjs-sync.js';

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
  // Connection-limit bookkeeping (realtime-001/002): written only by
  // handleConnectionWithHandler (register) + handleDisconnect (release).
  private connectionCounts: Map<string, number> = new Map(); // IP -> open count
  private userConnections: Map<string, Set<string>> = new Map(); // userId -> clientIds
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

      // Start snapshot interval
      if (this.realtimeConfig.snapshots.interval > 0) {
        this.snapshotInterval = setInterval(() => {
          this.createSnapshots();
        }, this.realtimeConfig.snapshots.interval * 1000);
      }

      // SnapshotManager owns its TTL-cleanup interval; server only start/stops.
      this.snapshotManager.startCleanup(
        () => this.roomManager?.getActiveRoomIds() ?? new Set<string>(),
        RealtimeServer.SNAPSHOT_CLEANUP_INTERVAL_MS
      );
    }

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

      // Log warning if using deprecated query string method
      if (tokenResult.method === 'query') {
        coreWarn(
          'WebSocket authentication using deprecated query string method',
          {
            operation: 'realtime:auth:deprecated',
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
        ws.close(4004, JSON.stringify({ code: 'ROOM_TYPE_NOT_REGISTERED', roomType: roomInfo.roomType }));
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
    const authUser = await this.authService.validateSession(token);
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
    const userId = String(authUser.id);

    // 2. Room-type authorization via the handler (room-specific access, e.g.
    //    record permissions); identity is already established above.
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

    // Ensure the authenticated identity is carried with the connection metadata
    // (the room participant record + downstream handlers rely on it).
    authResult.clientMetadata = {
      userId: authUser.id,
      username: authUser.username,
      role: authUser.role,
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

    if (!this.roomManager) {
      throw new Error('Room manager not initialized');
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
      yjsUpdateCleanup = await setupYjsConnection(ws, joinedRoom, clientId, () =>
        this.initializeRoom(joinedRoom, roomInfo.roomId)
      );
    }

    ws.on('message', async (data: Buffer) => {
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
      // Try to load from snapshot first
      if (this.snapshotManager) {
        const snapshot = await this.snapshotManager.loadSnapshot(room.roomId);
        if (snapshot) {
          this.snapshotManager.applySnapshot(room.getYjsDoc(), snapshot);
          coreInfo('Room initialized from snapshot', {
            operation: 'realtime:server:room:initialized',
            roomId: room.roomId,
            source: 'snapshot',
          });
          return;
        }
      }

      // Fallback to loading from record
      if (this.recordManager) {
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

  /** Create snapshot for a room. */
  private async createRoomSnapshot(room: YjsRoom): Promise<void> {
    if (!this.snapshotManager || !this.realtimeConfig) {
      return;
    }

    try {
      const state = room.getState();
      const snapshot = this.snapshotManager.createSnapshot(
        room.roomId,
        room.getYjsDoc(),
        state.version
      );

      await this.snapshotManager.saveSnapshot(snapshot);
      room.resetUpdateCount();

      // Emit hook event
      this.emitHook('realtime:snapshot:saved', {
        roomId: room.roomId,
        snapshotId: `${room.roomId}-${snapshot.version}`,
        timestamp: snapshot.timestamp,
      });
    } catch (error) {
      this.logError(error, 'REALTIME_SNAPSHOT_ERROR', {
        operation: 'realtime:server:snapshot:error',
        roomId: room.roomId,
      });
    }
  }

  /** Create snapshots for all rooms that need them. */
  private async createSnapshots(): Promise<void> {
    if (!this.snapshotManager || !this.roomManager || !this.realtimeConfig) {
      return;
    }

    const rooms = this.roomManager.getAllRooms();
    const maxUpdates = this.realtimeConfig.snapshots.max_updates;
    const intervalSeconds = this.realtimeConfig.snapshots.interval;

    for (const room of rooms) {
      if (room instanceof YjsRoom) {
        if (room.needsSnapshot(maxUpdates, intervalSeconds)) {
          await this.createRoomSnapshot(room);
        }
      }
    }
  }

  /** Get health status and metrics. */
  getHealthStatus(): {
    status: 'healthy' | 'unhealthy';
    server: {
      listening: boolean;
      port: number | null;
      host: string | null;
    };
    connections: {
      total: number;
      perUser: number;
      perIP: number;
    };
    rooms: {
      total: number;
      maxRooms: number;
    };
    memory?: {
      heapUsed: number;
      heapTotal: number;
      external: number;
    };
    rateLimiting: {
      activeClients: number;
      messagesPerSecond: number;
    };
  } {
    const address = this.server?.address();
    const port =
      typeof address === 'object' && address
        ? address.port
        : this.realtimeConfig?.port || null;
    const host =
      typeof address === 'object' && address
        ? address.address
        : this.realtimeConfig?.host || null;

    // Calculate unique IPs and users
    const uniqueIPs = this.connectionCounts.size;
    const uniqueUsers = this.userConnections.size;

    // Get room count
    const roomCount = this.roomManager?.getRoomCount() || 0;
    const maxRooms = this.realtimeConfig?.rooms.max_rooms || 100;

    // Get memory usage if available
    let memory:
      | { heapUsed: number; heapTotal: number; external: number }
      | undefined;
    if (typeof process.memoryUsage === 'function') {
      const mem = process.memoryUsage();
      memory = {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external || 0,
      };
    }

    // Determine overall status
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

    // Stop snapshot intervals (periodic snapshot + manager-owned TTL cleanup).
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
    this.snapshotManager?.stopCleanup();

    // Create final snapshots for all rooms
    if (this.roomManager) {
      const rooms = this.roomManager.getAllRooms();
      for (const room of rooms) {
        if (room instanceof YjsRoom) {
          await this.createRoomSnapshot(room);
        }
      }
    }

    // Close all connections
    for (const ws of this.connections.values()) {
      ws.close();
    }
    this.connections.clear();
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
   * Trigger a snapshot for a specific record
   *
   * This is called by the API when collaborative editing autosave triggers.
   * Creates a snapshot of the current Yjs document state and saves it.
   *
   * @param recordId The record ID to snapshot
   * @returns Snapshot metadata or null if room doesn't exist
   */
  async triggerRecordSnapshot(
    recordId: string
  ): Promise<{ roomId: string; version: number; timestamp: number } | null> {
    if (!this.roomManager || !this.snapshotManager) {
      coreWarn(
        'Cannot trigger snapshot: room manager or snapshot manager not initialized',
        {
          operation: 'realtime:snapshot:trigger:error',
          recordId,
        }
      );
      return null;
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
      return null;
    }

    try {
      const state = room.getState();
      const snapshot = this.snapshotManager.createSnapshot(
        room.roomId,
        room.getYjsDoc(),
        state.version
      );

      await this.snapshotManager.saveSnapshot(snapshot);
      room.resetUpdateCount();

      coreInfo('Record snapshot triggered via API', {
        operation: 'realtime:snapshot:triggered',
        recordId,
        roomId: room.roomId,
        version: state.version,
      });

      // Emit hook event
      this.emitHook('realtime:snapshot:saved', {
        roomId: room.roomId,
        recordId,
        version: state.version,
        timestamp: snapshot.timestamp,
        triggeredBy: 'api',
      });

      return {
        roomId: room.roomId,
        version: state.version,
        timestamp: snapshot.timestamp,
      };
    } catch (error) {
      this.logError(
        error,
        'REALTIME_SNAPSHOT_TRIGGER_ERROR',
        { operation: 'realtime:snapshot:trigger:error', recordId },
        { recordId, roomId: room.roomId }
      );
      throw error;
    }
  }
}
