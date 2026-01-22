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
  DeviceConnectionMetadata,
} from './types/realtime.types.js';
import { RealtimeConfigManager } from './realtime-config-manager.js';
import { RoomManager } from './rooms/room-manager.js';
import {
  authenticateConnection,
  authenticateDeviceConnection,
  authenticateUserObservingDevice,
  extractToken,
  parseRoomId,
  type AuthenticatedConnection,
  type AuthenticatedDeviceConnection,
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
  // Device connection tracking (separate from user tracking)
  private deviceConnections: Map<string, Set<string>> = new Map(); // deviceId -> clientIds
  private clientToDevice: Map<
    string,
    { deviceId: string; deviceUuid: string; organizationId: string }
  > = new Map();
  // Device connection metadata for quality tracking and prioritization
  private deviceConnectionMetadata: Map<string, DeviceConnectionMetadata> =
    new Map(); // clientId -> metadata
  private realtimeConfig: RealtimeConfig | null = null;
  private initialized: boolean = false;
  private snapshotInterval: NodeJS.Timeout | null = null;
  private connectionCleanupInterval: NodeJS.Timeout | null = null;
  // Message rate limiting: clientId -> { count: number, resetTime: number }
  private messageRateLimits: Map<
    string,
    { count: number; resetTime: number; warned: boolean }
  > = new Map();
  // Optional device authentication dependencies (for Broadcast Box support)
  private deviceAuthService: any | null = null; // DeviceAuthService - avoiding circular dependency
  private deviceManager: any | null = null; // DeviceManager - avoiding circular dependency
  private deviceCommandService: any | null = null; // DeviceCommandService - avoiding circular dependency
  private deviceConnectionTracker: any | null = null; // DeviceConnectionTracker - avoiding circular dependency

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
   * Set device authentication dependencies (called by DI container)
   * These are optional and only needed if device rooms are used (e.g., Broadcast Box)
   */
  setDeviceAuthDependencies(deviceAuthService: any, deviceManager: any): void {
    this.deviceAuthService = deviceAuthService;
    this.deviceManager = deviceManager;
    coreInfo('Device authentication dependencies set for realtime server', {
      operation: 'realtime:server:device-auth:configured',
    });
  }

  /**
   * Set device command service (called by DI container)
   * This is optional and only needed if device command execution is used (e.g., Broadcast Box)
   */
  setDeviceCommandService(deviceCommandService: any): void {
    this.deviceCommandService = deviceCommandService;
    coreInfo('Device command service set for realtime server', {
      operation: 'realtime:server:device-command-service:configured',
    });
  }

  /**
   * Set device connection tracker (called by DI container)
   * This is optional and only needed if device connection tracking is used (e.g., Broadcast Box)
   */
  setDeviceConnectionTracker(connectionTracker: any): void {
    this.deviceConnectionTracker = connectionTracker;
    coreInfo('Device connection tracker set for realtime server', {
      operation: 'realtime:server:device-connection-tracker:configured',
    });
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
    } catch (error) {
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
    }

    // Start connection cleanup job (for stale device connections)
    if (
      this.realtimeConfig.connection_cleanup?.enabled &&
      this.realtimeConfig.connection_cleanup.check_interval > 0
    ) {
      const checkIntervalMs =
        this.realtimeConfig.connection_cleanup.check_interval * 1000;
      this.connectionCleanupInterval = setInterval(() => {
        this.checkStaleConnections();
      }, checkIntervalMs);

      coreInfo('Connection cleanup job started', {
        operation: 'realtime:server:connection-cleanup:started',
        checkIntervalSeconds:
          this.realtimeConfig.connection_cleanup.check_interval,
        staleThresholdSeconds:
          this.realtimeConfig.connection_cleanup.stale_threshold,
      });
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

  /**
   * Start WebSocket server
   */
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
      coreError(
        error instanceof Error ? error : new Error(String(error)),
        'REALTIME_SERVER_CREATE_ERROR',
        {
          error: error instanceof Error ? error.message : String(error),
          port: this.realtimeConfig.port,
          host: this.realtimeConfig.host,
        },
        {
          operation: 'realtime:server:create:error',
        }
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
      coreError(
        error instanceof Error ? error : new Error(String(error)),
        'REALTIME_SERVER_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:server:error',
        }
      );
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

  /**
   * Handle new WebSocket connection
   */
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
      // Check connection limits
      await this.checkConnectionLimits(clientIp, null);

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

      // Route to device or user authentication based on room type
      if (roomInfo.roomType === 'device') {
        // Try device authentication first (for Broadcast Box devices)
        // If that fails, try user authentication (for users observing device rooms)
        try {
          coreInfo('Attempting device authentication', {
            operation: 'realtime:server:connection:device-auth:attempt',
            clientId,
            deviceUuid: roomInfo.roomId,
          });
          await this.handleDeviceConnection(
            ws,
            clientId,
            clientIp,
            token,
            roomInfo.roomId,
            fullRoomId
          );
        } catch (deviceAuthError: any) {
          // If device authentication fails, try user authentication
          // This allows users to observe device rooms
          if (
            deviceAuthError?.code === 'AUTH_FAILED' ||
            deviceAuthError?.message?.includes('authentication') ||
            deviceAuthError?.message?.includes('not available')
          ) {
            coreInfo(
              'Device auth failed, trying user authentication for device observation',
              {
                operation:
                  'realtime:server:connection:user-device-auth:attempt',
                clientId,
                deviceUuid: roomInfo.roomId,
              }
            );
            await this.handleUserObservingDevice(
              ws,
              clientId,
              clientIp,
              token,
              roomInfo.roomId,
              fullRoomId
            );
          } else {
            // Re-throw if it's not an authentication error
            throw deviceAuthError;
          }
        }
      } else {
        // User authentication flow (for record rooms)
        coreDebug('Routing to user authentication', {
          operation: 'realtime:server:connection:user-auth',
          clientId,
          recordId: roomInfo.roomId,
        });
        await this.handleUserConnection(
          ws,
          clientId,
          clientIp,
          token,
          roomInfo,
          fullRoomId
        );
      }
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error) ? undefined : 'REALTIME_CONNECTION_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:server:connection:error',
          clientId,
        }
      );

      const errorToSend =
        error instanceof Error ? error : new Error('Connection failed');
      this.sendError(ws, errorToSend);

      ws.close();
    }
  }

  /**
   * Handle device WebSocket connection
   */
  private async handleDeviceConnection(
    ws: WebSocket,
    clientId: string,
    clientIp: string,
    token: string,
    deviceUuid: string,
    fullRoomId: string
  ): Promise<void> {
    // Verify device authentication dependencies are available
    if (!this.deviceAuthService || !this.deviceManager) {
      coreWarn(
        'Device connection attempted but device authentication not configured',
        {
          operation: 'realtime:server:device-connection:not-configured',
          clientId,
          deviceUuid,
          hasDeviceAuthService: !!this.deviceAuthService,
          hasDeviceManager: !!this.deviceManager,
        }
      );
      this.sendError(ws, new Error('Device authentication not available'));
      ws.close();
      return;
    }

    coreDebug('Processing device connection', {
      operation: 'realtime:server:device-connection:processing',
      clientId,
      deviceUuid,
      tokenLength: token.length,
      tokenPreview: token.substring(0, 20) + '...',
    });

    // Authenticate device
    const deviceAuth = await authenticateDeviceConnection(
      token,
      deviceUuid,
      this.deviceAuthService,
      this.deviceManager,
      this.logger
    );

    // Track connection
    this.connections.set(clientId, ws);
    this.trackDeviceConnection(clientIp, deviceAuth.deviceId, clientId);

    // Create connection metadata for quality tracking
    this.createDeviceConnectionMetadata(
      clientId,
      deviceAuth.deviceUuid,
      String(deviceAuth.deviceId)
    );

    // Log existing connections for the same device UUID (for observability)
    const existingConnections = this.getDeviceConnectionsMetadata(
      deviceAuth.deviceUuid
    );
    if (existingConnections.length > 1) {
      // New connection + existing ones
      coreWarn('Multiple connections detected for device', {
        operation: 'realtime:server:device-connection:duplicate-detected',
        deviceUuid: deviceAuth.deviceUuid,
        deviceId: deviceAuth.deviceId,
        totalConnections: existingConnections.length,
        newClientId: clientId,
        existingClientIds: existingConnections
          .filter((m) => m.clientId !== clientId)
          .map((m) => ({
            clientId: m.clientId,
            connectedAt: new Date(m.connectedAt).toISOString(),
            ageMinutes: Math.round((Date.now() - m.connectedAt) / 60000),
            messageCount: m.messageCount,
            score: m.connectionScore,
          })),
      });
    }

    // Register connection in DeviceConnectionTracker (if available)
    // This is used by DeviceCommandService to check if device is connected
    // Convert deviceId to string (connection tracker expects string)
    const deviceIdString = String(deviceAuth.deviceId);

    if (this.deviceConnectionTracker) {
      try {
        await this.deviceConnectionTracker.registerConnection(
          deviceIdString, // database ID as string
          clientId,
          'cloud' // TODO: determine endpoint type (cloud vs local)
        );
        coreInfo('Device connection registered in tracker', {
          operation: 'realtime:server:device-connection:tracker-registered',
          deviceId: deviceIdString,
          deviceUuid: deviceAuth.deviceUuid,
          clientId,
        });
      } catch (error) {
        coreWarn('Failed to register device connection in tracker', {
          operation: 'realtime:server:device-connection:tracker-error',
          deviceId: deviceIdString,
          deviceUuid: deviceAuth.deviceUuid,
          clientId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with connection even if tracker registration fails
      }
    } else {
      coreWarn(
        'Device connection tracker not available - connection not registered',
        {
          operation: 'realtime:server:device-connection:tracker-not-available',
          deviceId: deviceIdString,
          deviceUuid: deviceAuth.deviceUuid,
          clientId,
        }
      );
    }

    // Get or create room
    if (!this.roomManager) {
      throw new Error('Room manager not initialized');
    }

    const room = this.roomManager.getOrCreateRoom(fullRoomId, 'device', {});

    // Add client to room
    const clientConnection = {
      id: clientId,
      deviceId: deviceAuth.deviceId,
      deviceUuid: deviceAuth.deviceUuid,
      roomId: fullRoomId,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
    };
    room.addClient(clientId, clientConnection);

    // Track client to device mapping
    this.clientToDevice.set(clientId, {
      deviceId: deviceAuth.deviceId,
      deviceUuid: deviceAuth.deviceUuid,
      organizationId: deviceAuth.organizationId,
    });

    // Send connection acknowledgment (device rooms don't use presence/room state)
    ws.send(
      JSON.stringify({
        type: 'control',
        event: 'connection.ack',
        deviceId: deviceAuth.deviceId,
        roomId: fullRoomId,
      })
    );

    // Setup message handlers for device (simplified - no yjs, no presence)
    this.setupDeviceMessageHandlers(ws, clientId, room, deviceAuth);

    // Setup disconnect handler
    ws.on('close', () => {
      this.handleDeviceDisconnect(clientId, room);
    });

    // Broadcast device connection event to all clients in the room (including observers)
    this.broadcastToRoom(
      room,
      {
        type: 'control',
        event: 'device.connected',
        deviceId: deviceAuth.deviceId,
        deviceUuid: deviceAuth.deviceUuid,
        timestamp: Date.now(),
      },
      clientId // Exclude the device itself
    );

    // Emit hook event
    this.emitHook('realtime:device:connected', {
      clientId,
      deviceId: deviceAuth.deviceId,
      deviceUuid: deviceAuth.deviceUuid,
      roomId: fullRoomId,
      timestamp: Date.now(),
    });

    coreInfo('Device connected', {
      operation: 'realtime:server:device:connected',
      clientId,
      deviceId: deviceAuth.deviceId,
      deviceUuid: deviceAuth.deviceUuid,
      roomId: fullRoomId,
    });
  }

  /**
   * Handle user observing device room (read-only access)
   */
  private async handleUserObservingDevice(
    ws: WebSocket,
    clientId: string,
    clientIp: string,
    token: string,
    deviceUuid: string,
    fullRoomId: string
  ): Promise<void> {
    // Verify device manager is available
    if (!this.deviceManager) {
      this.sendError(ws, new Error('Device manager not initialized'));
      ws.close();
      return;
    }

    // Authenticate user
    const auth = await authenticateUserObservingDevice(
      token,
      deviceUuid,
      this.authService,
      this.deviceManager,
      this.logger
    );

    // Track connection
    this.connections.set(clientId, ws);
    this.trackConnection(clientIp, auth.user.id, clientId);

    // Get or create room
    if (!this.roomManager) {
      throw new Error('Room manager not initialized');
    }

    const room = this.roomManager.getOrCreateRoom(fullRoomId, 'device', {});

    // Add client to room as observer
    const clientConnection = {
      id: clientId,
      userId: auth.user.id.toString(),
      username: auth.user.username || auth.user.name || 'Unknown',
      role: auth.user.role,
      roomId: fullRoomId,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      permissions: auth.permissions,
      observer: true, // Mark as observer (read-only)
    };
    room.addClient(clientId, clientConnection);

    // Track client to user mapping
    this.clientToUser.set(clientId, {
      userId: auth.user.id,
      username: auth.user.username || auth.user.name || 'Unknown',
    });

    // Send connection acknowledgment
    ws.send(
      JSON.stringify({
        type: 'control',
        event: 'connection.ack',
        deviceUuid,
        roomId: fullRoomId,
        observer: true,
      })
    );

    // Check if device is currently connected and notify observer
    // deviceConnections is keyed by deviceId (database ID), not deviceUuid
    // Get the device to find its deviceId
    try {
      const device = await this.deviceManager.getDeviceByUuid(deviceUuid);
      if (device) {
        const deviceClients = this.deviceConnections.get(device.id.toString());
        if (deviceClients && deviceClients.size > 0) {
          // Device is connected, notify the observer
          ws.send(
            JSON.stringify({
              type: 'control',
              event: 'device.connected',
              deviceId: device.id,
              deviceUuid,
              timestamp: Date.now(),
            })
          );
        }
      }
    } catch (error) {
      // Device lookup failed - that's okay, just don't send initial status
      coreDebug('Could not check device connection status for observer', {
        operation: 'realtime:server:user-device:status-check',
        deviceUuid,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Setup message handlers (read-only, only receive messages)
    this.setupObserverMessageHandlers(ws, clientId, room, auth);

    // Setup disconnect handler
    ws.on('close', () => {
      this.handleDisconnect(clientId, room);
    });

    coreInfo('User observing device room connected', {
      operation: 'realtime:server:user-device:connected',
      clientId,
      userId: auth.user.id,
      deviceUuid,
      roomId: fullRoomId,
    });
  }

  /**
   * Setup message handlers for user observers (read-only)
   */
  private setupObserverMessageHandlers(
    ws: WebSocket,
    clientId: string,
    room: any,
    auth: AuthenticatedConnection
  ): void {
    ws.on('message', async (data: Buffer) => {
      try {
        const message: any = JSON.parse(data.toString());

        // Handle ping/pong (exempt from rate limiting)
        if (message.type === MessageType.PING) {
          this.sendPong(ws);
          return;
        }

        // Handle preview WebRTC messages - observers can send these to devices
        if (
          message.type === 'preview.answer' ||
          message.type === 'preview.ice_candidate'
        ) {
          const state = room.getState();

          if (message.type === 'preview.answer') {
            // Observing client → Device: Send answer only to device
            for (const participant of state.participants) {
              const participantWs = this.connections.get(participant.id);
              if (
                participantWs &&
                participantWs.readyState === 1 &&
                this.clientToDevice.has(participant.id)
              ) {
                try {
                  participantWs.send(JSON.stringify(message));
                  coreDebug(
                    'Preview answer forwarded to device (from observer)',
                    {
                      operation: 'realtime:server:preview:answer-forwarded',
                      fromClient: clientId,
                      toDevice: participant.id,
                    }
                  );
                } catch (error) {
                  coreWarn('Failed to send preview answer from observer', {
                    operation: 'realtime:server:preview:answer-error',
                    deviceId: participant.id,
                    error:
                      error instanceof Error ? error.message : String(error),
                  });
                }
                break; // Only one device per room
              }
            }
          } else if (message.type === 'preview.ice_candidate') {
            // Observing client → Device: Send ICE candidate to device
            for (const participant of state.participants) {
              const participantWs = this.connections.get(participant.id);
              if (
                participantWs &&
                participantWs.readyState === 1 &&
                this.clientToDevice.has(participant.id)
              ) {
                try {
                  participantWs.send(JSON.stringify(message));
                  coreDebug(
                    'Preview ICE candidate forwarded to device (from observer)',
                    {
                      operation: 'realtime:server:preview:ice-forwarded',
                      fromClient: clientId,
                      toDevice: participant.id,
                    }
                  );
                } catch (error) {
                  coreWarn(
                    'Failed to send preview ICE candidate from observer',
                    {
                      operation: 'realtime:server:preview:ice-error',
                      deviceId: participant.id,
                      error:
                        error instanceof Error ? error.message : String(error),
                    }
                  );
                }
                break; // Only one device per room
              }
            }
          }
          return; // Don't process further
        }

        // Observers are read-only for all other message types
        // No need to handle other message types
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        coreError(
          error instanceof Error && isCivicPressError(error)
            ? error
            : error instanceof Error
              ? error
              : new Error(errorMessage),
          isCivicPressError(error) ? undefined : 'REALTIME_MESSAGE_ERROR',
          { error: errorMessage },
          {
            operation: 'realtime:server:message:error:observer',
            clientId,
          }
        );
      }
    });
  }

  /**
   * Handle user WebSocket connection (existing flow)
   */
  private async handleUserConnection(
    ws: WebSocket,
    clientId: string,
    clientIp: string,
    token: string,
    roomInfo: { roomType: string; roomId: string },
    fullRoomId: string
  ): Promise<void> {
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

    coreInfo('Client connected', {
      operation: 'realtime:server:client:connected',
      clientId,
      userId: auth.user.id,
      roomId: `${roomInfo.roomType}:${roomInfo.roomId}`,
    });
  }

  /**
   * Setup message handlers for device WebSocket connections
   * Devices don't use yjs or presence, so this is simplified
   */
  private setupDeviceMessageHandlers(
    ws: WebSocket,
    clientId: string,
    room: any,
    deviceAuth: AuthenticatedDeviceConnection
  ): void {
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        // Handle ping/pong (exempt from rate limiting)
        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        // Update connection metadata when message is received (skip ping/pong)
        this.updateDeviceConnectionMetadataOnMessage(clientId);

        // Check message rate limit
        const rateLimitResult = this.checkMessageRateLimit(clientId);
        if (!rateLimitResult.allowed) {
          coreWarn('Message rate limit exceeded for device', {
            operation: 'realtime:server:rate_limit:device',
            clientId,
            deviceId: deviceAuth.deviceId,
            limit: this.realtimeConfig?.rate_limiting.messages_per_second || 10,
          });
          this.sendError(
            ws,
            new Error(
              `Rate limit exceeded: ${this.realtimeConfig?.rate_limiting.messages_per_second || 10} messages per second`
            )
          );
          ws.close(1008, 'Rate limit exceeded');
          return;
        }

        // Handle ack messages - route to DeviceCommandService before broadcasting
        // Check if message is an ACK by type OR by presence of commandId + success fields
        const isAckMessage =
          message.type === 'ack' ||
          (message.commandId &&
            (message.success !== undefined ||
              message.payload?.success !== undefined));

        if (isAckMessage && this.deviceCommandService) {
          try {
            // Device may send ack in different formats:
            // Format 1: { type: "ack", id: "...", commandId: "...", timestamp: "...", status: "success"|"error", payload: {...}, error: {...} }
            // Format 2: { type: "ack", payload: { commandId: "...", success: true, result: {...}, timestamp: ... } }
            // Format 3: { commandId: "...", success: true, result: {...} } (missing type field - handle gracefully)
            // We need to convert to: { type: "ack", commandId: "...", success: boolean, error: string, errorCode: string, payload: {...} }

            // Extract commandId from either top-level or payload
            const commandId =
              message.commandId ||
              message.payload?.commandId ||
              message.payload?.command_id;

            // Extract success from either status field, top-level success, or payload.success
            let success: boolean;
            if (message.status !== undefined) {
              success = message.status === 'success';
            } else if (message.success !== undefined) {
              // Top-level success field (device may send it this way)
              success = Boolean(message.success);
            } else if (message.payload?.success !== undefined) {
              success = message.payload.success;
            } else {
              // Default to true if not specified
              success = true;
            }

            // Extract payload/result
            // Handle both "result" and "payload" fields (device may use either)
            const payload =
              message.result ||
              message.payload?.result ||
              message.payload?.payload ||
              message.payload;

            let ackMessage: any = {
              type: 'ack',
              id: message.id || message.payload?.id,
              timestamp: message.timestamp || message.payload?.timestamp,
              commandId: commandId,
              success: success,
              // Extract error message and code
              error:
                message.error?.message ||
                message.error ||
                message.payload?.error,
              errorCode:
                message.error?.code ||
                message.errorCode ||
                message.payload?.errorCode ||
                message.payload?.error_code,
              payload: payload,
            };

            // Debug: log conversion
            coreInfo('Ack message converted', {
              operation: 'realtime:server:device:ack-converted',
              originalStatus: message.status,
              originalPayloadSuccess: message.payload?.success,
              convertedSuccess: ackMessage.success,
              commandId: ackMessage.commandId,
              commandIdSource: message.commandId
                ? 'top-level'
                : message.payload?.commandId
                  ? 'payload.commandId'
                  : message.payload?.command_id
                    ? 'payload.command_id'
                    : 'none',
              hasError: !!ackMessage.error,
              messageKeys: Object.keys(message),
              payloadKeys: message.payload ? Object.keys(message.payload) : [],
            });

            // DeviceCommandService will resolve pending command promises
            if (
              commandId &&
              typeof this.deviceCommandService.handleAckResponse === 'function'
            ) {
              this.deviceCommandService.handleAckResponse(ackMessage);
            } else if (!commandId) {
              coreWarn('Ack message missing commandId', {
                operation: 'realtime:server:device:ack-missing-command-id',
                message: JSON.stringify(message),
              });
            }

            // Process switch_source ACK response to update activeSources
            // Device sends: { result: { sources: [{ source_type: "video", source_id: 0, status: "switched" }, ...] } }
            if (
              ackMessage.success &&
              ackMessage.payload &&
              this.deviceManager
            ) {
              const result = ackMessage.payload.result || ackMessage.payload;
              const sources = result?.sources;

              if (Array.isArray(sources) && sources.length > 0) {
                try {
                  const device = await this.deviceManager.getDevice(
                    deviceAuth.deviceId
                  );
                  if (device && device.capabilities) {
                    // Build activeSources object from sources array
                    let activeVideo: any = null;
                    let activeAudio: any = null;

                    for (const source of sources) {
                      if (
                        source.source_type === 'video' &&
                        source.source_id !== undefined
                      ) {
                        // Find source object by ID
                        const sourceObj =
                          device.capabilities.videoSourceObjects?.find(
                            (s: any) => s.id === source.source_id
                          );
                        if (sourceObj) {
                          activeVideo = {
                            id: sourceObj.id,
                            identifier: sourceObj.identifier || sourceObj.name,
                            name: sourceObj.name || sourceObj.identifier,
                            path: sourceObj.path,
                            resolution: sourceObj.resolution,
                            framerate: sourceObj.framerate,
                            available: sourceObj.available !== false,
                          };
                        }
                      } else if (
                        source.source_type === 'audio' &&
                        source.source_id !== undefined
                      ) {
                        // Find source object by ID
                        const sourceObj =
                          device.capabilities.audioSourceObjects?.find(
                            (s: any) => s.id === source.source_id
                          );
                        if (sourceObj) {
                          activeAudio = {
                            id: sourceObj.id,
                            identifier: sourceObj.identifier || sourceObj.name,
                            name: sourceObj.name || sourceObj.identifier,
                            path: sourceObj.path,
                            available: sourceObj.available !== false,
                          };
                        }
                      }
                    }

                    // Update activeSources if we found any
                    if (activeVideo || activeAudio) {
                      await this.deviceManager.updateDevice(
                        deviceAuth.deviceId,
                        {
                          activeSources: {
                            video: activeVideo,
                            audio: activeAudio,
                          } as any,
                        }
                      );

                      coreInfo(
                        'Device active sources updated from switch_source ACK',
                        {
                          operation:
                            'realtime:server:device:switch-source-ack-active-sources-updated',
                          deviceId: deviceAuth.deviceId,
                          commandId: commandId,
                          hasVideoSource: !!activeVideo,
                          hasAudioSource: !!activeAudio,
                          videoSourceId: activeVideo?.id,
                          audioSourceId: activeAudio?.id,
                        }
                      );
                    }
                  }
                } catch (error) {
                  coreWarn(
                    'Failed to update active sources from switch_source ACK',
                    {
                      operation:
                        'realtime:server:device:switch-source-ack-error',
                      deviceId: deviceAuth.deviceId,
                      commandId: commandId,
                      error:
                        error instanceof Error ? error.message : String(error),
                    }
                  );
                }
              }
            }
          } catch (error) {
            coreWarn('Failed to handle ack response in DeviceCommandService', {
              operation: 'realtime:server:device:ack-handler-error',
              clientId,
              deviceId: deviceAuth.deviceId,
              error: error instanceof Error ? error.message : String(error),
            });
            // Continue with broadcast even if ack handling fails
          }
        }

        // Handle status messages - process through Broadcast Box event handlers before broadcasting
        // Status messages contain device health, capabilities, state, and session info
        if (
          message.type === 'status' &&
          message.payload &&
          this.deviceManager
        ) {
          try {
            // Process status message through Broadcast Box event handlers
            // This will update device capabilities, health, and state
            const payload = message.payload;

            // Update device capabilities if provided
            if (payload.capabilities && this.deviceManager) {
              try {
                const device = await this.deviceManager.getDevice(
                  deviceAuth.deviceId
                );
                if (device) {
                  const videoSources =
                    payload.capabilities.video_sources ||
                    payload.capabilities.videoSources ||
                    [];
                  const audioSources =
                    payload.capabilities.audio_sources ||
                    payload.capabilities.audioSources ||
                    [];
                  const pipSupported =
                    payload.capabilities.pip !== undefined
                      ? payload.capabilities.pip
                      : payload.capabilities.pipSupported !== undefined
                        ? payload.capabilities.pipSupported
                        : device.capabilities?.pipSupported;
                  const hardwareEncoding =
                    payload.capabilities.hardware_encoding !== undefined
                      ? payload.capabilities.hardware_encoding
                      : payload.capabilities.hardwareEncoding !== undefined
                        ? payload.capabilities.hardwareEncoding
                        : device.capabilities?.hardwareEncoding;

                  const updatedCapabilities = {
                    ...device.capabilities,
                    videoSources:
                      videoSources.length > 0
                        ? videoSources
                        : device.capabilities?.videoSources || [],
                    audioSources:
                      audioSources.length > 0
                        ? audioSources
                        : device.capabilities?.audioSources || [],
                    pipSupported:
                      pipSupported !== undefined
                        ? pipSupported
                        : device.capabilities?.pipSupported,
                    hardwareEncoding:
                      hardwareEncoding !== undefined
                        ? hardwareEncoding
                        : device.capabilities?.hardwareEncoding,
                    // Preserve existing source objects if they exist
                    videoSourceObjects:
                      device.capabilities?.videoSourceObjects || [],
                    audioSourceObjects:
                      device.capabilities?.audioSourceObjects || [],
                  };

                  // Validate and clean up device config if capabilities changed
                  let configUpdates: any = {};
                  const currentConfig = device.config || {};
                  const capabilitiesChanged =
                    JSON.stringify(updatedCapabilities) !==
                    JSON.stringify(device.capabilities);

                  // Only validate config if capabilities actually changed
                  if (capabilitiesChanged) {
                    // Check if defaultVideoSource is still valid
                    if (currentConfig.defaultVideoSource) {
                      const isValidVideoSource = videoSources.includes(
                        currentConfig.defaultVideoSource
                      );

                      if (!isValidVideoSource) {
                        configUpdates.defaultVideoSource = undefined;
                        coreWarn(
                          'Default video source no longer available, clearing from config',
                          {
                            operation:
                              'realtime:server:device:status-config-cleanup',
                            deviceId: deviceAuth.deviceId,
                            invalidSource: currentConfig.defaultVideoSource,
                            availableSources: videoSources,
                          }
                        );
                      }
                    }

                    // Check if defaultVideoSourceId is still valid
                    if (currentConfig.defaultVideoSourceId !== undefined) {
                      const videoSourceObjects =
                        device.capabilities?.videoSourceObjects || [];
                      const isValidVideoSourceId = videoSourceObjects.some(
                        (s: any) => s.id === currentConfig.defaultVideoSourceId
                      );

                      if (!isValidVideoSourceId) {
                        configUpdates.defaultVideoSourceId = undefined;
                        coreWarn(
                          'Default video source ID no longer available, clearing from config',
                          {
                            operation:
                              'realtime:server:device:status-config-cleanup',
                            deviceId: deviceAuth.deviceId,
                            invalidSourceId: currentConfig.defaultVideoSourceId,
                          }
                        );
                      }
                    }

                    // Check if defaultAudioSource is still valid
                    if (currentConfig.defaultAudioSource) {
                      const isValidAudioSource = audioSources.includes(
                        currentConfig.defaultAudioSource
                      );

                      if (!isValidAudioSource) {
                        configUpdates.defaultAudioSource = undefined;
                        coreWarn(
                          'Default audio source no longer available, clearing from config',
                          {
                            operation:
                              'realtime:server:device:status-config-cleanup',
                            deviceId: deviceAuth.deviceId,
                            invalidSource: currentConfig.defaultAudioSource,
                            availableSources: audioSources,
                          }
                        );
                      }
                    }

                    // Check if defaultAudioSourceId is still valid
                    if (currentConfig.defaultAudioSourceId !== undefined) {
                      const audioSourceObjects =
                        device.capabilities?.audioSourceObjects || [];
                      const isValidAudioSourceId = audioSourceObjects.some(
                        (s: any) => s.id === currentConfig.defaultAudioSourceId
                      );

                      if (!isValidAudioSourceId) {
                        configUpdates.defaultAudioSourceId = undefined;
                        coreWarn(
                          'Default audio source ID no longer available, clearing from config',
                          {
                            operation:
                              'realtime:server:device:status-config-cleanup',
                            deviceId: deviceAuth.deviceId,
                            invalidSourceId: currentConfig.defaultAudioSourceId,
                          }
                        );
                      }
                    }
                  }

                  // Update device if capabilities changed or config needs cleanup
                  const configNeedsCleanup =
                    Object.keys(configUpdates).length > 0;
                  const updateData: any = {};

                  if (capabilitiesChanged) {
                    updateData.capabilities = updatedCapabilities;
                  }

                  if (configNeedsCleanup) {
                    // Merge config updates (clearing invalid values)
                    updateData.config = {
                      ...currentConfig,
                      ...configUpdates,
                    };
                  }

                  if (capabilitiesChanged || configNeedsCleanup) {
                    await this.deviceManager.updateDevice(
                      deviceAuth.deviceId,
                      updateData
                    );

                    if (configNeedsCleanup) {
                      coreInfo(
                        'Device config cleaned up (invalid sources removed)',
                        {
                          operation:
                            'realtime:server:device:status-config-cleaned',
                          deviceId: deviceAuth.deviceId,
                          clearedFields: Object.keys(configUpdates),
                        }
                      );
                    }
                  }
                }
              } catch (error) {
                coreWarn('Failed to update device capabilities from status', {
                  operation: 'realtime:server:device:status-capabilities-error',
                  deviceId: deviceAuth.deviceId,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }

            // Update device capabilities from payload.sources if provided (device sends sources.video and sources.audio arrays)
            // This is the primary way devices send source information in status messages
            if (payload.sources && this.deviceManager) {
              try {
                const device = await this.deviceManager.getDevice(
                  deviceAuth.deviceId
                );
                if (device) {
                  // Extract source names from detailed source objects for backward compatibility
                  const videoSourceNames =
                    payload.sources.video?.map(
                      (s: any) =>
                        s.identifier || s.name || s.path || `Source ${s.id}`
                    ) || [];
                  const audioSourceNames =
                    payload.sources.audio?.map(
                      (s: any) => s.identifier || s.name || `Source ${s.id}`
                    ) || [];

                  const updatedCapabilities = {
                    ...device.capabilities,
                    videoSources:
                      videoSourceNames.length > 0
                        ? videoSourceNames
                        : device.capabilities?.videoSources || [],
                    audioSources:
                      audioSourceNames.length > 0
                        ? audioSourceNames
                        : device.capabilities?.audioSources || [],
                    videoSourceObjects:
                      payload.sources.video ||
                      device.capabilities?.videoSourceObjects ||
                      [],
                    audioSourceObjects:
                      payload.sources.audio ||
                      device.capabilities?.audioSourceObjects ||
                      [],
                  };

                  // Validate and clean up device config if capabilities changed
                  let configUpdates: any = {};
                  const currentConfig = device.config || {};
                  const capabilitiesChanged =
                    JSON.stringify(updatedCapabilities) !==
                    JSON.stringify(device.capabilities);

                  // Only validate config if capabilities actually changed
                  if (capabilitiesChanged) {
                    // Check if defaultVideoSource is still valid
                    if (currentConfig.defaultVideoSource) {
                      const isValidVideoSource =
                        videoSourceNames.includes(
                          currentConfig.defaultVideoSource
                        ) ||
                        payload.sources.video?.some(
                          (s: any) =>
                            s.identifier === currentConfig.defaultVideoSource ||
                            s.name === currentConfig.defaultVideoSource
                        );

                      if (!isValidVideoSource) {
                        configUpdates.defaultVideoSource = undefined;
                        coreWarn(
                          'Default video source no longer available, clearing from config',
                          {
                            operation:
                              'realtime:server:device:status-sources-config-cleanup',
                            deviceId: deviceAuth.deviceId,
                            invalidSource: currentConfig.defaultVideoSource,
                            availableSources: videoSourceNames,
                          }
                        );
                      }
                    }

                    // Check if defaultVideoSourceId is still valid
                    if (currentConfig.defaultVideoSourceId !== undefined) {
                      const isValidVideoSourceId = payload.sources.video?.some(
                        (s: any) => s.id === currentConfig.defaultVideoSourceId
                      );

                      if (!isValidVideoSourceId) {
                        configUpdates.defaultVideoSourceId = undefined;
                        coreWarn(
                          'Default video source ID no longer available, clearing from config',
                          {
                            operation:
                              'realtime:server:device:status-sources-config-cleanup',
                            deviceId: deviceAuth.deviceId,
                            invalidSourceId: currentConfig.defaultVideoSourceId,
                            availableSourceIds:
                              payload.sources.video?.map((s: any) => s.id) ||
                              [],
                          }
                        );
                      }
                    }

                    // Check if defaultAudioSource is still valid
                    if (currentConfig.defaultAudioSource) {
                      const isValidAudioSource =
                        audioSourceNames.includes(
                          currentConfig.defaultAudioSource
                        ) ||
                        payload.sources.audio?.some(
                          (s: any) =>
                            s.identifier === currentConfig.defaultAudioSource ||
                            s.name === currentConfig.defaultAudioSource
                        );

                      if (!isValidAudioSource) {
                        configUpdates.defaultAudioSource = undefined;
                        coreWarn(
                          'Default audio source no longer available, clearing from config',
                          {
                            operation:
                              'realtime:server:device:status-sources-config-cleanup',
                            deviceId: deviceAuth.deviceId,
                            invalidSource: currentConfig.defaultAudioSource,
                            availableSources: audioSourceNames,
                          }
                        );
                      }
                    }

                    // Check if defaultAudioSourceId is still valid
                    if (currentConfig.defaultAudioSourceId !== undefined) {
                      const isValidAudioSourceId = payload.sources.audio?.some(
                        (s: any) => s.id === currentConfig.defaultAudioSourceId
                      );

                      if (!isValidAudioSourceId) {
                        configUpdates.defaultAudioSourceId = undefined;
                        coreWarn(
                          'Default audio source ID no longer available, clearing from config',
                          {
                            operation:
                              'realtime:server:device:status-sources-config-cleanup',
                            deviceId: deviceAuth.deviceId,
                            invalidSourceId: currentConfig.defaultAudioSourceId,
                            availableSourceIds:
                              payload.sources.audio?.map((s: any) => s.id) ||
                              [],
                          }
                        );
                      }
                    }
                  }

                  // Update device if capabilities changed or config needs cleanup
                  const configNeedsCleanup =
                    Object.keys(configUpdates).length > 0;
                  const updateData: any = {};

                  if (capabilitiesChanged) {
                    updateData.capabilities = updatedCapabilities;
                  }

                  if (configNeedsCleanup) {
                    // Merge config updates (clearing invalid values)
                    updateData.config = {
                      ...currentConfig,
                      ...configUpdates,
                    };
                  }

                  if (capabilitiesChanged || configNeedsCleanup) {
                    await this.deviceManager.updateDevice(
                      deviceAuth.deviceId,
                      updateData
                    );

                    if (capabilitiesChanged) {
                      coreInfo(
                        'Device capabilities updated from status (sources)',
                        {
                          operation:
                            'realtime:server:device:status-sources-capabilities-updated',
                          deviceId: deviceAuth.deviceId,
                          videoSourcesCount: videoSourceNames.length,
                          audioSourcesCount: audioSourceNames.length,
                        }
                      );
                    }

                    if (configNeedsCleanup) {
                      coreInfo(
                        'Device config cleaned up (invalid sources removed)',
                        {
                          operation:
                            'realtime:server:device:status-sources-config-cleaned',
                          deviceId: deviceAuth.deviceId,
                          clearedFields: Object.keys(configUpdates),
                        }
                      );
                    }
                  }
                }
              } catch (error) {
                coreWarn(
                  'Failed to update device capabilities from status sources',
                  {
                    operation:
                      'realtime:server:device:status-sources-update-error',
                    deviceId: deviceAuth.deviceId,
                    error:
                      error instanceof Error ? error.message : String(error),
                  }
                );
              }
            }

            // Extract and store active sources from payload.active_sources, payload.active, or payload.sources.active
            // Device may send either format: active_sources (full objects), active (id + identifier only), or sources.active (nested in sources object)
            const activeSourcesPayload =
              payload.active_sources ||
              payload.active ||
              payload.sources?.active;
            if (activeSourcesPayload !== undefined && this.deviceManager) {
              try {
                const device = await this.deviceManager.getDevice(
                  deviceAuth.deviceId
                );
                if (device) {
                  // Helper to enrich source object from capabilities if it only has id/identifier
                  const enrichSource = (
                    source: any,
                    sourceObjects: any[] | undefined,
                    sourceType: 'video' | 'audio'
                  ): any => {
                    if (!source) return null;

                    // If source already has full info (name, path, etc.), use it as-is
                    if (source.name || source.path) {
                      return source;
                    }

                    // Otherwise, look up full source object from capabilities
                    if (source.id !== undefined && sourceObjects) {
                      const fullSource = sourceObjects.find(
                        (s: any) => s.id === source.id
                      );
                      if (fullSource) {
                        // Merge: use identifier from status if provided, otherwise from capabilities
                        return {
                          id: fullSource.id,
                          identifier:
                            source.identifier ||
                            fullSource.identifier ||
                            fullSource.name,
                          name:
                            fullSource.name ||
                            source.identifier ||
                            fullSource.identifier,
                          path: fullSource.path,
                          resolution: fullSource.resolution,
                          framerate: fullSource.framerate,
                          available: fullSource.available !== false,
                        };
                      }
                    }

                    // If we have identifier but no full object, try to find by identifier
                    if (source.identifier && sourceObjects) {
                      const fullSource = sourceObjects.find(
                        (s: any) =>
                          s.identifier === source.identifier ||
                          s.name === source.identifier
                      );
                      if (fullSource) {
                        return {
                          id: fullSource.id,
                          identifier:
                            fullSource.identifier || source.identifier,
                          name: fullSource.name || source.identifier,
                          path: fullSource.path,
                          resolution: fullSource.resolution,
                          framerate: fullSource.framerate,
                          available: fullSource.available !== false,
                        };
                      }
                    }

                    // If we can't enrich, return what we have (at least id and identifier)
                    return source;
                  };

                  const activeVideo = activeSourcesPayload.video
                    ? enrichSource(
                        activeSourcesPayload.video,
                        device.capabilities?.videoSourceObjects,
                        'video'
                      )
                    : null;

                  const activeAudio = activeSourcesPayload.audio
                    ? enrichSource(
                        activeSourcesPayload.audio,
                        device.capabilities?.audioSourceObjects,
                        'audio'
                      )
                    : null;

                  const activeSources = {
                    video: activeVideo,
                    audio: activeAudio,
                  };

                  await this.deviceManager.updateDevice(deviceAuth.deviceId, {
                    activeSources: activeSources as any,
                  });

                  coreInfo('Device active sources updated from status', {
                    operation:
                      'realtime:server:device:status-active-sources-updated',
                    deviceId: deviceAuth.deviceId,
                    hasVideoSource: !!activeSources.video,
                    hasAudioSource: !!activeSources.audio,
                    videoSourceId: activeSources.video?.id,
                    audioSourceId: activeSources.audio?.id,
                    videoSourceIdentifier: activeSources.video?.identifier,
                    audioSourceIdentifier: activeSources.audio?.identifier,
                  });
                }
              } catch (error) {
                coreWarn('Failed to update device active sources from status', {
                  operation:
                    'realtime:server:device:status-active-sources-update-error',
                  deviceId: deviceAuth.deviceId,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          } catch (error) {
            // Log but don't fail - status processing is optional
            coreWarn('Failed to process status message (non-critical)', {
              operation: 'realtime:server:device:status-handler-error',
              clientId,
              deviceId: deviceAuth.deviceId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Handle preview WebRTC messages with special routing
        if (
          message.type === 'preview.offer' ||
          message.type === 'preview.answer' ||
          message.type === 'preview.ice_candidate'
        ) {
          const isDevice = this.clientToDevice.has(clientId);
          const state = room.getState();

          if (message.type === 'preview.offer' && isDevice) {
            // Device → Observing clients: Send offer to all observing clients (users), not device
            for (const participant of state.participants) {
              if (participant.id === clientId) continue; // Skip device itself
              const ws = this.connections.get(participant.id);
              if (ws && ws.readyState === 1) {
                // Only send to user clients (not devices)
                if (!this.clientToDevice.has(participant.id)) {
                  try {
                    ws.send(JSON.stringify(message));
                    coreDebug('Preview offer forwarded to observing client', {
                      operation: 'realtime:server:preview:offer-forwarded',
                      fromDevice: clientId,
                      toClient: participant.id,
                    });
                  } catch (error) {
                    coreWarn('Failed to send preview offer', {
                      operation: 'realtime:server:preview:offer-error',
                      clientId: participant.id,
                      error:
                        error instanceof Error ? error.message : String(error),
                    });
                  }
                }
              }
            }
          } else if (message.type === 'preview.answer' && !isDevice) {
            // Observing client → Device: Send answer only to device
            coreInfo(
              '📤 Observer sending preview.answer, forwarding to device',
              {
                operation: 'realtime:server:preview:answer-to-device',
                fromObserver: clientId,
                answerSdpLength: message.payload?.sdp?.length || 0,
                participantsCount: state.participants.length,
              }
            );
            for (const participant of state.participants) {
              const ws = this.connections.get(participant.id);
              if (
                ws &&
                ws.readyState === 1 &&
                this.clientToDevice.has(participant.id)
              ) {
                try {
                  ws.send(JSON.stringify(message));
                  coreInfo(
                    '✅ preview.answer forwarded from observer to device',
                    {
                      operation: 'realtime:server:preview:answer-forwarded',
                      fromClient: clientId,
                      toDevice: participant.id,
                      answerSdpLength: message.payload?.sdp?.length || 0,
                    }
                  );
                } catch (error) {
                  coreWarn('❌ Failed to send preview answer to device', {
                    operation: 'realtime:server:preview:answer-error',
                    deviceId: participant.id,
                    error:
                      error instanceof Error ? error.message : String(error),
                  });
                }
                break; // Only one device per room
              }
            }
          } else if (message.type === 'preview.ice_candidate') {
            // Bidirectional: Route ICE candidates between device and the specific client
            if (isDevice) {
              // Device → Observing clients: Send to all observing clients
              coreInfo(
                '📥 Device sending ICE candidate, forwarding to observing clients',
                {
                  operation:
                    'realtime:server:preview:ice-candidate-from-device',
                  fromDevice: clientId,
                  candidate: message.payload?.candidate?.substring(0, 100),
                  participantsCount: state.participants.length,
                }
              );
              for (const participant of state.participants) {
                if (participant.id === clientId) continue;
                const ws = this.connections.get(participant.id);
                if (
                  ws &&
                  ws.readyState === 1 &&
                  !this.clientToDevice.has(participant.id)
                ) {
                  try {
                    ws.send(JSON.stringify(message));
                    coreInfo(
                      '✅ ICE candidate forwarded from device to observer',
                      {
                        operation:
                          'realtime:server:preview:ice-candidate-forwarded',
                        fromDevice: clientId,
                        toObserver: participant.id,
                      }
                    );
                  } catch (error) {
                    coreWarn('Failed to send ICE candidate to client', {
                      operation: 'realtime:server:preview:ice-candidate-error',
                      clientId: participant.id,
                      error:
                        error instanceof Error ? error.message : String(error),
                    });
                  }
                }
              }
            } else {
              // Observing client → Device: Send only to device
              for (const participant of state.participants) {
                const ws = this.connections.get(participant.id);
                if (
                  ws &&
                  ws.readyState === 1 &&
                  this.clientToDevice.has(participant.id)
                ) {
                  try {
                    ws.send(JSON.stringify(message));
                    coreDebug('ICE candidate forwarded to device', {
                      operation:
                        'realtime:server:preview:ice-candidate-forwarded',
                      fromClient: clientId,
                      toDevice: participant.id,
                    });
                  } catch (error) {
                    coreWarn('Failed to send ICE candidate to device', {
                      operation: 'realtime:server:preview:ice-candidate-error',
                      deviceId: participant.id,
                      error:
                        error instanceof Error ? error.message : String(error),
                    });
                  }
                  break; // Only one device per room
                }
              }
            }
          }
        } else {
          // Broadcast message to other clients in the room (including observers)
          this.broadcastToRoom(room, message, clientId);
        }

        // Update last activity
        const deviceInfo = this.clientToDevice.get(clientId);
        if (deviceInfo) {
          // Update room's last activity if room supports it
          if (typeof room.updateActivity === 'function') {
            room.updateActivity();
          }
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        coreError(
          error instanceof Error && isCivicPressError(error)
            ? error
            : error instanceof Error
              ? error
              : new Error(errorMessage),
          isCivicPressError(error) ? undefined : 'REALTIME_MESSAGE_ERROR',
          { error: errorMessage },
          {
            operation: 'realtime:server:message:error:device',
            clientId,
            deviceId: deviceAuth.deviceId,
          }
        );
      }
    });
  }

  /**
   * Handle device disconnect
   */
  private handleDeviceDisconnect(clientId: string, room: any): void {
    const deviceInfo = this.clientToDevice.get(clientId);

    // Unregister connection in DeviceConnectionTracker (if available)
    if (this.deviceConnectionTracker && deviceInfo) {
      try {
        // Convert deviceId to string (connection tracker expects string)
        const deviceIdString = String(deviceInfo.deviceId);
        this.deviceConnectionTracker.unregisterConnection(
          deviceIdString, // database ID as string
          clientId
        );
        coreDebug('Device connection unregistered from tracker', {
          operation: 'realtime:server:device-disconnect:tracker-unregistered',
          deviceId: deviceIdString,
          deviceUuid: deviceInfo.deviceUuid,
          clientId,
        });
      } catch (error) {
        coreWarn('Failed to unregister device connection from tracker', {
          operation: 'realtime:server:device-disconnect:tracker-error',
          deviceId: deviceInfo.deviceId,
          deviceUuid: deviceInfo.deviceUuid,
          clientId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with disconnection even if tracker unregistration fails
      }
    }

    // Remove client from room
    room.removeClient(clientId);

    // Remove connection tracking
    this.connections.delete(clientId);
    if (deviceInfo) {
      this.clientToDevice.delete(clientId);

      // Remove from device connections map
      const deviceClients = this.deviceConnections.get(deviceInfo.deviceId);
      if (deviceClients) {
        deviceClients.delete(clientId);
        if (deviceClients.size === 0) {
          this.deviceConnections.delete(deviceInfo.deviceId);
        }
      }

      // Remove connection metadata
      this.removeDeviceConnectionMetadata(clientId);
    }

    // Cleanup message rate limit tracking
    this.messageRateLimits.delete(clientId);

    // Broadcast device disconnection event to all clients in the room (including observers)
    if (deviceInfo) {
      this.broadcastToRoom(room, {
        type: 'control',
        event: 'device.disconnected',
        deviceId: deviceInfo.deviceId,
        deviceUuid: deviceInfo.deviceUuid,
        timestamp: Date.now(),
      });
    }

    // Emit hook event
    this.emitHook('realtime:device:disconnected', {
      clientId,
      deviceId: deviceInfo?.deviceId,
      deviceUuid: deviceInfo?.deviceUuid,
      roomId: room.roomId,
      timestamp: Date.now(),
    });

    coreInfo('Device disconnected', {
      operation: 'realtime:server:device:disconnected',
      clientId,
      deviceId: deviceInfo?.deviceId,
      deviceUuid: deviceInfo?.deviceUuid,
    });
  }

  /**
   * Track device connection (separate from user tracking)
   */
  private trackDeviceConnection(
    ip: string,
    deviceId: string,
    clientId: string
  ): void {
    // Track IP (shared with user connections)
    const ipCount = this.connectionCounts.get(ip) || 0;
    this.connectionCounts.set(ip, ipCount + 1);

    // Track device
    if (!this.deviceConnections.has(deviceId)) {
      this.deviceConnections.set(deviceId, new Set());
    }
    this.deviceConnections.get(deviceId)!.add(clientId);

    // Initialize message rate limit tracking
    this.messageRateLimits.set(clientId, {
      count: 0,
      resetTime: Date.now() + 1000, // 1 second window
      warned: false,
    });
  }

  /**
   * Create device connection metadata for quality tracking
   */
  private createDeviceConnectionMetadata(
    clientId: string,
    deviceUuid: string,
    deviceId: string
  ): DeviceConnectionMetadata {
    const now = Date.now();
    const metadata: DeviceConnectionMetadata = {
      clientId,
      deviceUuid,
      deviceId,
      connectedAt: now,
      lastMessageAt: now,
      lastMessageFromServer: 0,
      messageCount: 0,
      connectionScore: 1.0, // Initial score is perfect (brand new connection)
    };

    this.deviceConnectionMetadata.set(clientId, metadata);

    coreDebug('Device connection metadata created', {
      operation: 'realtime:server:device-connection-metadata:created',
      clientId,
      deviceUuid,
      deviceId,
    });

    return metadata;
  }

  /**
   * Update device connection metadata when message is received from device
   */
  private updateDeviceConnectionMetadataOnMessage(clientId: string): void {
    const metadata = this.deviceConnectionMetadata.get(clientId);
    if (!metadata) return;

    const now = Date.now();
    metadata.lastMessageAt = now;
    metadata.messageCount++;
    metadata.connectionScore = this.calculateConnectionScore(metadata);

    coreDebug('Device connection metadata updated on message', {
      operation:
        'realtime:server:device-connection-metadata:updated-on-message',
      clientId,
      messageCount: metadata.messageCount,
      connectionScore: metadata.connectionScore,
    });
  }

  /**
   * Update device connection metadata when message is sent to device
   */
  private updateDeviceConnectionMetadataOnSend(clientId: string): void {
    const metadata = this.deviceConnectionMetadata.get(clientId);
    if (!metadata) return;

    metadata.lastMessageFromServer = Date.now();

    coreDebug('Device connection metadata updated on send', {
      operation: 'realtime:server:device-connection-metadata:updated-on-send',
      clientId,
    });
  }

  /**
   * Calculate connection quality score
   * Higher score = better connection (more recent, more active)
   */
  private calculateConnectionScore(metadata: DeviceConnectionMetadata): number {
    const now = Date.now();
    const ageMs = now - metadata.connectedAt;
    const activityMs = now - metadata.lastMessageAt;

    // Recent connections score higher (decay over 10 minutes = 600000ms)
    const recencyScore = Math.max(0, 1 - ageMs / 600000);

    // Active connections score higher (decay over 5 minutes = 300000ms)
    const activityScore = Math.max(0, 1 - activityMs / 300000);

    // Connections with more messages score slightly higher (log scale, capped at 1.0)
    const volumeScore = Math.min(1, Math.log10(metadata.messageCount + 1) / 2);

    // Weighted combination: 40% recency, 40% activity, 20% volume
    return recencyScore * 0.4 + activityScore * 0.4 + volumeScore * 0.2;
  }

  /**
   * Get device connection metadata for a clientId
   */
  getDeviceConnectionMetadata(
    clientId: string
  ): DeviceConnectionMetadata | undefined {
    return this.deviceConnectionMetadata.get(clientId);
  }

  /**
   * Get all connection metadata for a device UUID
   */
  getDeviceConnectionsMetadata(deviceUuid: string): DeviceConnectionMetadata[] {
    const metadataList: DeviceConnectionMetadata[] = [];

    for (const metadata of this.deviceConnectionMetadata.values()) {
      if (metadata.deviceUuid === deviceUuid) {
        // Recalculate score before returning (to ensure it's up-to-date)
        metadata.connectionScore = this.calculateConnectionScore(metadata);
        metadataList.push(metadata);
      }
    }

    return metadataList;
  }

  /**
   * Remove device connection metadata on disconnect
   */
  private removeDeviceConnectionMetadata(clientId: string): void {
    const removed = this.deviceConnectionMetadata.delete(clientId);

    if (removed) {
      coreDebug('Device connection metadata removed', {
        operation: 'realtime:server:device-connection-metadata:removed',
        clientId,
      });
    }
  }

  /**
   * Check for and close stale device connections
   * A connection is considered stale if it has been inactive for longer than the threshold
   * and is still in OPEN state (hasn't closed naturally)
   */
  private checkStaleConnections(): void {
    if (!this.realtimeConfig?.connection_cleanup?.enabled) {
      return;
    }

    const now = Date.now();
    const staleThresholdMs =
      (this.realtimeConfig.connection_cleanup.stale_threshold || 600) * 1000;

    const staleConnections: Array<{
      clientId: string;
      deviceUuid: string;
      inactivityMinutes: number;
      metadata: DeviceConnectionMetadata;
    }> = [];

    // Check all device connection metadata for staleness
    for (const [
      clientId,
      metadata,
    ] of this.deviceConnectionMetadata.entries()) {
      const ws = this.connections.get(clientId);
      if (!ws || ws.readyState !== 1) {
        // Connection is not OPEN, skip (it will be cleaned up naturally)
        continue;
      }

      // Calculate inactivity: time since last message (from device or to device)
      const lastActivity = Math.max(
        metadata.lastMessageAt,
        metadata.lastMessageFromServer || 0
      );
      const inactivityMs = now - lastActivity;

      // Connection is stale if inactive for longer than threshold
      if (inactivityMs > staleThresholdMs) {
        staleConnections.push({
          clientId,
          deviceUuid: metadata.deviceUuid,
          inactivityMinutes: Math.round(inactivityMs / 60000),
          metadata,
        });
      }
    }

    // Close stale connections gracefully
    if (staleConnections.length > 0) {
      coreInfo('Closing stale connections', {
        operation: 'realtime:server:connection-cleanup:closing-stale',
        staleConnectionCount: staleConnections.length,
        staleThresholdMinutes: Math.round(staleThresholdMs / 60000),
      });

      for (const stale of staleConnections) {
        const ws = this.connections.get(stale.clientId);
        if (ws && ws.readyState === 1) {
          coreInfo('Closing stale connection', {
            operation: 'realtime:server:connection-cleanup:close-stale',
            clientId: stale.clientId,
            deviceUuid: stale.deviceUuid,
            inactivityMinutes: stale.inactivityMinutes,
            lastMessageAt: new Date(stale.metadata.lastMessageAt).toISOString(),
            lastMessageFromServer: stale.metadata.lastMessageFromServer
              ? new Date(stale.metadata.lastMessageFromServer).toISOString()
              : 'never',
            messageCount: stale.metadata.messageCount,
          });

          // Send close frame with reason
          // 1001 = going away (indicates connection is being closed due to inactivity)
          try {
            ws.close(1001, 'Connection inactive');
          } catch (error) {
            coreWarn('Failed to close stale connection', {
              operation: 'realtime:server:connection-cleanup:close-error',
              clientId: stale.clientId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          // Cleanup will happen in handleDeviceDisconnect() when close event fires
        }
      }
    } else {
      coreDebug('No stale connections found', {
        operation: 'realtime:server:connection-cleanup:check',
        totalDeviceConnections: this.deviceConnectionMetadata.size,
        staleThresholdMinutes: Math.round(staleThresholdMs / 60000),
      });
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

        // Handle ping/pong (exempt from rate limiting)
        if (message.type === MessageType.PING) {
          this.sendPong(ws);
          return;
        }

        // Check message rate limit for other message types
        const rateLimitResult = this.checkMessageRateLimit(clientId);
        if (!rateLimitResult.allowed) {
          coreWarn('Message rate limit exceeded', {
            operation: 'realtime:server:rate_limit',
            clientId,
            userId: auth.user.id,
            limit: this.realtimeConfig?.rate_limiting.messages_per_second || 10,
          });
          this.sendError(
            ws,
            new Error(
              `Rate limit exceeded: ${this.realtimeConfig?.rate_limiting.messages_per_second || 10} messages per second`
            )
          );
          // Close connection on violation
          ws.close(1008, 'Rate limit exceeded');
          return;
        }

        // Send warning if approaching limit (80% threshold)
        if (
          rateLimitResult.warning &&
          !this.messageRateLimits.get(clientId)?.warned
        ) {
          const limit =
            this.realtimeConfig?.rate_limiting.messages_per_second || 10;
          this.sendError(ws, {
            type: 'control',
            event: 'notice',
            notice: {
              level: 'warning',
              message: `Approaching rate limit: ${rateLimitResult.remaining} messages remaining per second`,
            },
          } as any);
          const rateLimit = this.messageRateLimits.get(clientId);
          if (rateLimit) {
            rateLimit.warned = true;
          }
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
        coreError(
          error instanceof Error && isCivicPressError(error)
            ? error
            : error instanceof Error
              ? error
              : new Error(errorMessage),
          isCivicPressError(error) ? undefined : 'REALTIME_MESSAGE_ERROR',
          { error: errorMessage },
          {
            operation: 'realtime:server:message:error',
            clientId,
          }
        );
      }
    });
  }

  /**
   * Handle user client disconnect (existing flow)
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

    // Cleanup message rate limit tracking
    this.messageRateLimits.delete(clientId);

    // Cleanup connection counts
    // TODO: Track IP and user for cleanup

    // Check if room should be destroyed
    if (room.getClientCount() === 0) {
      // Save final snapshot before cleanup (non-blocking)
      if (this.snapshotManager && room instanceof YjsRoom) {
        this.createRoomSnapshot(room).catch((error) => {
          // Log as warning instead of error - snapshot failures shouldn't block disconnection
          coreWarn('Failed to create final snapshot on disconnect', {
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

    coreInfo('Client disconnected', {
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

    // Initialize message rate limit tracking
    this.messageRateLimits.set(clientId, {
      count: 0,
      resetTime: Date.now() + 1000, // 1 second window
      warned: false,
    });
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
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error) ? undefined : 'REALTIME_HOOK_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:server:hook:error',
          event,
        }
      );
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
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error) ? undefined : 'REALTIME_ROOM_INIT_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:server:room:initialize:error',
          roomId: room.roomId,
        }
      );
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
          coreError(
            error instanceof Error ? error : new Error(String(error)),
            'REALTIME_SEND_ERROR',
            { error: error instanceof Error ? error.message : String(error) },
            {
              operation: 'realtime:server:broadcast:error',
              clientId: participant.id,
            }
          );
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
        coreInfo('Creating realtime_snapshots table...', {
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

          coreSuccess({}, 'realtime_snapshots table created', {
            operation: 'realtime:server:migration',
          });
        } catch (createError: any) {
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
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error) ? undefined : 'REALTIME_SNAPSHOT_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:server:snapshot:error',
          roomId: room.roomId,
        }
      );
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
   * Get health status and metrics
   */
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

  /**
   * Shutdown the realtime server
   */
  async shutdown(): Promise<void> {
    coreInfo('Shutting down realtime server...', {
      operation: 'realtime:server:shutdown',
    });

    // Stop snapshot interval
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }

    // Stop connection cleanup interval
    if (this.connectionCleanupInterval) {
      clearInterval(this.connectionCleanupInterval);
      this.connectionCleanupInterval = null;
      coreInfo('Connection cleanup job stopped', {
        operation: 'realtime:server:connection-cleanup:stopped',
      });
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
    this.messageRateLimits.clear();

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

  /**
   * Get room manager (for DI container access)
   */
  getRoomManager(): RoomManager | null {
    return this.roomManager;
  }
}
