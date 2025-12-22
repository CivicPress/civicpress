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
import type { RealtimeConfig } from './types/realtime.types.js';
import { RealtimeConfigManager } from './realtime-config-manager.js';
import { RoomManager } from './rooms/room-manager.js';
import {
  authenticateConnection,
  extractToken,
  parseRoomId,
  type AuthenticatedConnection,
} from './auth.js';
import {
  AuthenticationFailedError,
  ConnectionLimitExceededError,
} from './errors/realtime-errors.js';
import type { RealtimeMessage } from './types/messages.js';
import { MessageType, PresenceEvent } from './types/messages.js';
import { PresenceManager } from './presence/presence-manager.js';
import { SnapshotManager } from './persistence/snapshots.js';
import {
  DatabaseSnapshotStorage,
  FilesystemSnapshotStorage,
} from './persistence/storage.js';
import { YjsRoom } from './rooms/yjs-room.js';

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
  private presenceManager: PresenceManager;
  private snapshotManager: SnapshotManager | null = null;
  private connections: Map<string, WebSocket> = new Map();
  private connectionCounts: Map<string, number> = new Map(); // IP -> count
  private userConnections: Map<number, Set<string>> = new Map(); // userId -> clientIds
  private clientToUser: Map<string, { userId: number; username: string }> =
    new Map();
  private realtimeConfig: RealtimeConfig | null = null;
  private initialized: boolean = false;
  private snapshotInterval: NodeJS.Timeout | null = null;

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
    this.presenceManager = new PresenceManager(logger);
  }

  /**
   * Set record manager (called after DI container initialization)
   */
  setRecordManager(recordManager: RecordManager): void {
    this.recordManager = recordManager;
  }

  /**
   * Set database service (for snapshot storage)
   */
  setDatabaseService(databaseService: DatabaseService): void {
    this.databaseService = databaseService;
  }

  /**
   * Set room manager (called by DI container)
   */
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

    this.logger.info('Initializing realtime server...', {
      operation: 'realtime:server:initialize',
    });

    // Load configuration
    try {
      this.realtimeConfig = await this.configManager.loadConfig();
      this.configManager.validateConfig(this.realtimeConfig);
    } catch (error) {
      // Use default config if file doesn't exist
      this.realtimeConfig = this.configManager.getDefaultConfig();
      this.logger.warn('Using default realtime configuration', {
        operation: 'realtime:server:initialize',
      });
    }

    // Check if enabled
    if (!this.realtimeConfig.enabled) {
      this.logger.info('Realtime server disabled in configuration', {
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
    }

    // Start WebSocket server
    await this.startServer();

    this.initialized = true;
    this.logger.info('Realtime server initialized', {
      operation: 'realtime:server:initialized',
      port: this.realtimeConfig.port,
      path: this.realtimeConfig.path,
    });
  }

  /**
   * Start WebSocket server
   */
  private async startServer(): Promise<void> {
    if (!this.realtimeConfig) {
      throw new Error('Configuration not loaded');
    }

    this.logger.info('Starting WebSocket server...', {
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
            this.logger.warn('WebSocket connection rejected: invalid path', {
              operation: 'realtime:server:verifyClient',
              url,
              expectedPath: path,
            });
          }
          return isValid;
        },
      });
    } catch (error) {
      this.logger.error('Failed to create WebSocket server', {
        operation: 'realtime:server:create:error',
        error: error instanceof Error ? error.message : String(error),
        port: this.realtimeConfig.port,
        host: this.realtimeConfig.host,
      });
      throw error;
    }

    this.server.on('connection', (ws: WebSocket, req) => {
      // Convert IncomingMessage to our expected format
      const reqData = {
        url: req.url,
        socket: req.socket
          ? { remoteAddress: req.socket.remoteAddress }
          : undefined,
        headers: req.headers as Record<string, string>,
      };
      this.handleConnection(ws, reqData);
    });

    this.server.on('error', (error: Error) => {
      this.logger.error('WebSocket server error', {
        operation: 'realtime:server:error',
        error: error instanceof Error ? error.message : String(error),
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
      this.logger.info('WebSocket server listening', {
        operation: 'realtime:server:listening',
        port: actualPort,
        host:
          typeof address === 'object' && address
            ? address.address
            : this.realtimeConfig.host,
        path: this.realtimeConfig.path,
      });
    });

    this.logger.info('WebSocket server started', {
      operation: 'realtime:server:started',
      port: this.realtimeConfig.port,
      path: this.realtimeConfig.path,
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(
    ws: WebSocket,
    req: {
      url?: string;
      socket?: { remoteAddress?: string };
      headers?: Record<string, string>;
    }
  ): Promise<void> {
    const clientId = this.generateClientId();
    const clientIp = req.socket?.remoteAddress || 'unknown';

    this.logger.info('WebSocket connection attempt', {
      operation: 'realtime:server:connection:attempt',
      clientId,
      url: req.url,
      ip: clientIp,
    });

    try {
      // Check connection limits
      await this.checkConnectionLimits(clientIp, null);

      // Extract token and room info
      const url = req.url || '';
      const token = extractToken(url, req.headers);
      if (!token) {
        this.sendError(ws, new AuthenticationFailedError());
        ws.close();
        return;
      }

      // Parse room ID
      const roomInfo = parseRoomId(url);
      if (!roomInfo) {
        this.sendError(ws, new Error('Invalid room URL format'));
        ws.close();
        return;
      }

      // Authenticate
      if (!this.recordManager) {
        this.sendError(ws, new Error('Record manager not initialized'));
        ws.close();
        return;
      }

      const auth = await authenticateConnection(
        token,
        roomInfo.roomId,
        this.authService,
        this.recordManager,
        this.logger
      );

      // Track connection
      this.connections.set(clientId, ws);
      this.trackConnection(clientIp, auth.user.id, clientId);

      // Get or create room
      if (!this.roomManager) {
        throw new Error('Room manager not initialized');
      }

      const fullRoomId = `${roomInfo.roomType}:${roomInfo.roomId}`;
      const room = this.roomManager.getOrCreateRoom(
        fullRoomId,
        roomInfo.roomType,
        {}
      ) as YjsRoom;

      // Initialize room if needed (load from record or snapshot)
      const roomState = room.getState();
      if (!roomState.yjsState || roomState.yjsState.length === 0) {
        await this.initializeRoom(room, roomInfo.roomId);
      }

      // Set record manager in room if it's a YjsRoom
      if (this.recordManager && 'setRecordManager' in room) {
        (room as YjsRoom).setRecordManager(this.recordManager);
      }

      // Add presence
      const presence = this.presenceManager.addPresence(
        auth.user.id.toString(),
        auth.user.username || auth.user.name || 'Unknown'
      );

      // Add client to room
      const clientConnection = {
        id: clientId,
        userId: auth.user.id.toString(),
        username: auth.user.username || auth.user.name || 'Unknown',
        role: auth.user.role,
        roomId: fullRoomId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
        permissions: auth.permissions,
      };
      room.addClient(clientId, clientConnection);

      // Track client to user mapping
      this.clientToUser.set(clientId, {
        userId: auth.user.id,
        username: auth.user.username || auth.user.name || 'Unknown',
      });

      // Send room state
      this.sendRoomState(ws, room);

      // Send presence joined message
      this.broadcastToRoom(
        room,
        this.presenceManager.createPresenceMessage(
          PresenceEvent.JOINED,
          auth.user.id.toString(),
          presence.username,
          presence.color
        ),
        clientId
      );

      // Setup message handlers
      this.setupMessageHandlers(ws, clientId, room, auth);

      // Setup disconnect handler
      ws.on('close', () => {
        this.handleDisconnect(clientId, room);
      });

      // Emit hook event
      this.emitHook('realtime:client:connected', {
        clientId,
        userId: auth.user.id,
        roomId: `${roomInfo.roomType}:${roomInfo.roomId}`,
        timestamp: Date.now(),
      });

      this.logger.info('Client connected', {
        operation: 'realtime:server:client:connected',
        clientId,
        userId: auth.user.id,
        roomId: `${roomInfo.roomType}:${roomInfo.roomId}`,
      });
    } catch (error) {
      this.logger.error('Connection handling failed', {
        operation: 'realtime:server:connection:error',
        clientId,
        error: error instanceof Error ? error.message : String(error),
      });

      const errorToSend =
        error instanceof Error ? error : new Error('Connection failed');
      this.sendError(ws, errorToSend);

      ws.close();
    }
  }

  /**
   * Setup message handlers for WebSocket
   */
  private setupMessageHandlers(
    ws: WebSocket,
    clientId: string,
    room: any,
    auth: AuthenticatedConnection
  ): void {
    ws.on('message', async (data: Buffer) => {
      try {
        const message: RealtimeMessage = JSON.parse(data.toString());

        // Handle ping/pong
        if (message.type === MessageType.PING) {
          this.sendPong(ws);
          return;
        }

        // Handle sync messages (yjs updates)
        if (message.type === MessageType.SYNC && message.update) {
          // Apply yjs update to room
          const update = Buffer.from(message.update, 'base64');
          if (room instanceof YjsRoom) {
            room.applyUpdate(update, clientId);

            // Broadcast to other clients
            this.broadcastToRoom(
              room,
              {
                type: MessageType.SYNC,
                update: message.update,
                version: room.getState().version,
                from: auth.user.id.toString(),
              },
              clientId
            );
          }
        }

        // Handle presence messages (cursor updates)
        if (
          message.type === MessageType.PRESENCE &&
          message.event === PresenceEvent.CURSOR
        ) {
          const userInfo = this.clientToUser.get(clientId);
          if (userInfo && message.cursor) {
            this.presenceManager.updateCursor(
              userInfo.userId.toString(),
              message.cursor.position,
              message.cursor.selection
            );

            // Broadcast to other clients
            this.broadcastToRoom(room, message, clientId);
          }
        }

        // Handle awareness messages
        if (
          message.type === MessageType.PRESENCE &&
          message.event === PresenceEvent.AWARENESS
        ) {
          // Broadcast awareness updates
          this.broadcastToRoom(room, message, clientId);
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error('Message handling failed', {
          operation: 'realtime:server:message:error',
          clientId,
          error: errorMessage,
        });
      }
    });
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(clientId: string, room: any): void {
    // Get user info before cleanup
    const userInfo = this.clientToUser.get(clientId);
    const userId = userInfo?.userId.toString() || 'unknown';

    // Remove presence
    if (userInfo) {
      this.presenceManager.removePresence(userId);
    }

    // Broadcast presence left message
    if (userInfo) {
      this.broadcastToRoom(
        room,
        {
          type: MessageType.PRESENCE,
          event: PresenceEvent.LEFT,
          user: {
            id: userId,
            name: userInfo.username,
          },
        },
        clientId
      );
    }

    // Remove client from room
    room.removeClient(clientId);

    // Remove connection tracking
    this.connections.delete(clientId);
    this.clientToUser.delete(clientId);

    // Cleanup connection counts
    // TODO: Track IP and user for cleanup

    // Check if room should be destroyed
    if (room.getClientCount() === 0) {
      // Save final snapshot before cleanup (non-blocking)
      if (this.snapshotManager && room instanceof YjsRoom) {
        this.createRoomSnapshot(room).catch((error) => {
          // Log as warning instead of error - snapshot failures shouldn't block disconnection
          this.logger.warn('Failed to create final snapshot on disconnect', {
            operation: 'realtime:server:disconnect:snapshot:error',
            roomId: room.roomId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }

    // Emit hook event
    this.emitHook('realtime:client:disconnected', {
      clientId,
      userId: userInfo?.userId,
      roomId: room.roomId,
      timestamp: Date.now(),
    });

    this.logger.info('Client disconnected', {
      operation: 'realtime:server:client:disconnected',
      clientId,
      userId: userInfo?.userId,
    });
  }

  /**
   * Check connection limits
   */
  private async checkConnectionLimits(
    ip: string,
    userId: number | null
  ): Promise<void> {
    if (!this.realtimeConfig) {
      return;
    }

    // Check IP limit
    const ipCount = this.connectionCounts.get(ip) || 0;
    if (ipCount >= this.realtimeConfig.rate_limiting.connections_per_ip) {
      throw new ConnectionLimitExceededError(
        this.realtimeConfig.rate_limiting.connections_per_ip,
        { limitType: 'ip', ip }
      );
    }

    // Check user limit
    if (userId !== null) {
      const userConnections = this.userConnections.get(userId) || new Set();
      if (
        userConnections.size >=
        this.realtimeConfig.rate_limiting.connections_per_user
      ) {
        throw new ConnectionLimitExceededError(
          this.realtimeConfig.rate_limiting.connections_per_user,
          { limitType: 'user', userId }
        );
      }
    }
  }

  /**
   * Track connection
   */
  private trackConnection(ip: string, userId: number, clientId: string): void {
    // Track IP
    const ipCount = this.connectionCounts.get(ip) || 0;
    this.connectionCounts.set(ip, ipCount + 1);

    // Track user
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(clientId);
  }

  /**
   * Send room state to client
   */
  private sendRoomState(ws: WebSocket, room: any): void {
    const state = room.getState();
    const message = {
      type: MessageType.CONTROL,
      event: 'room_state',
      room: {
        id: state.roomId,
        participants: state.participants.map((p: any) => ({
          id: p.userId,
          name: p.username,
          color: '#3b82f6', // TODO: Generate color
        })),
        yjsState: state.yjsState
          ? Buffer.from(state.yjsState).toString('base64')
          : undefined,
        version: state.version,
      },
    };

    ws.send(JSON.stringify(message));
  }

  /**
   * Send error to client
   */
  private sendError(ws: WebSocket, error: Error): void {
    const message = {
      type: MessageType.CONTROL,
      event: 'error',
      error: {
        code: (error as any).code || 'UNKNOWN_ERROR',
        message: error.message,
      },
    };

    ws.send(JSON.stringify(message));
  }

  /**
   * Send pong response
   */
  private sendPong(ws: WebSocket): void {
    const message = {
      type: MessageType.PONG,
      timestamp: Date.now(),
    };

    ws.send(JSON.stringify(message));
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Emit hook event
   */
  emitHook(event: string, data: any): void {
    this.hookSystem.emit(event, data).catch((error) => {
      this.logger.error('Hook emission failed', {
        operation: 'realtime:server:hook:error',
        event,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Initialize room with content (from record or snapshot)
   */
  private async initializeRoom(room: YjsRoom, recordId: string): Promise<void> {
    try {
      // Try to load from snapshot first
      if (this.snapshotManager) {
        const snapshot = await this.snapshotManager.loadSnapshot(room.roomId);
        if (snapshot) {
          this.snapshotManager.applySnapshot(room.getYjsDoc(), snapshot);
          this.logger.info('Room initialized from snapshot', {
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
        this.logger.info('Room initialized from record', {
          operation: 'realtime:server:room:initialized',
          roomId: room.roomId,
          source: 'record',
        });
      }
    } catch (error) {
      this.logger.error('Failed to initialize room', {
        operation: 'realtime:server:room:initialize:error',
        roomId: room.roomId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with empty document
    }
  }

  /**
   * Broadcast message to all clients in room
   */
  private broadcastToRoom(
    room: any,
    message: any,
    excludeClientId?: string
  ): void {
    const state = room.getState();
    for (const participant of state.participants) {
      const ws = this.connections.get(participant.id);
      if (ws && ws.readyState === 1 && participant.id !== excludeClientId) {
        // WebSocket.OPEN = 1
        try {
          ws.send(JSON.stringify(message));
        } catch (error) {
          this.logger.error('Failed to send message to client', {
            operation: 'realtime:server:broadcast:error',
            clientId: participant.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * Ensure snapshot table exists in database
   */
  private async ensureSnapshotTable(): Promise<void> {
    if (!this.databaseService) {
      return;
    }

    try {
      // Check if table exists by trying to query it
      await this.databaseService.query(
        'SELECT 1 FROM realtime_snapshots LIMIT 1'
      );
    } catch (error: any) {
      // Table doesn't exist, create it
      if (
        error?.message?.includes('no such table') ||
        error?.message?.includes('does not exist')
      ) {
        this.logger.info('Creating realtime_snapshots table...', {
          operation: 'realtime:server:migration',
        });

        try {
          await this.databaseService.query(`
            CREATE TABLE IF NOT EXISTS realtime_snapshots (
              id TEXT PRIMARY KEY,
              room_id TEXT NOT NULL,
              snapshot_data BLOB NOT NULL,
              version INTEGER NOT NULL,
              created_at INTEGER NOT NULL
            )
          `);

          await this.databaseService.query(`
            CREATE INDEX IF NOT EXISTS idx_realtime_snapshots_room_id 
            ON realtime_snapshots(room_id)
          `);

          await this.databaseService.query(`
            CREATE INDEX IF NOT EXISTS idx_realtime_snapshots_created_at 
            ON realtime_snapshots(created_at)
          `);

          this.logger.info('realtime_snapshots table created', {
            operation: 'realtime:server:migration',
          });
        } catch (createError: any) {
          this.logger.warn(
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
        this.logger.warn('Error checking realtime_snapshots table', {
          operation: 'realtime:server:migration:check:error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Create snapshot for a room
   */
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
      this.logger.error('Failed to create room snapshot', {
        operation: 'realtime:server:snapshot:error',
        roomId: room.roomId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Create snapshots for all rooms that need them
   */
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

  /**
   * Shutdown the realtime server
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down realtime server...', {
      operation: 'realtime:server:shutdown',
    });

    // Stop snapshot interval
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }

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
    for (const [clientId, ws] of this.connections.entries()) {
      ws.close();
    }
    this.connections.clear();

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
    this.logger.info('Realtime server shut down', {
      operation: 'realtime:server:shutdown:complete',
    });
  }

  /**
   * Get room manager (for DI container access)
   */
  getRoomManager(): RoomManager | null {
    return this.roomManager;
  }
}
