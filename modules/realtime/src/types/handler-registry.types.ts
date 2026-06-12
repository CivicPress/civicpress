/**
 * Handler Registry Types
 *
 * Defines interfaces for room type handlers that allow external modules
 * (like Broadcast Box) to register custom room handling logic without
 * coupling them directly to the realtime server.
 */

import type { WebSocket } from 'ws';

/**
 * Result of authentication attempt
 */
export interface AuthResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  /**
   * For device connections: device authentication result
   */
  deviceAuth?: {
    deviceId: string;
    deviceUuid: string;
    organizationId: string;
  };
  /**
   * For user connections: user authentication result
   */
  userAuth?: {
    userId: number;
    username: string;
    role: string;
    permissions: {
      canView: boolean;
      canEdit: boolean;
    };
  };
  /**
   * Client metadata to be stored with the connection
   */
  clientMetadata?: Record<string, unknown>;
}

/**
 * Context provided to onConnect handler
 */
export interface ConnectionContext {
  /**
   * WebSocket connection
   */
  ws: WebSocket;
  /**
   * Unique client ID for this connection
   */
  clientId: string;
  /**
   * Client IP address
   */
  clientIp: string;
  /**
   * Authentication token
   */
  token: string;
  /**
   * Room ID (without type prefix)
   */
  roomId: string;
  /**
   * Full room ID (with type prefix, e.g., "device:uuid-1234")
   */
  fullRoomId: string;
  /**
   * Request URL
   */
  url: string;
  /**
   * Request headers
   */
  headers?: Record<string, string>;
  /**
   * WebSocket subprotocols
   */
  protocols?: string[];
}

/**
 * Context provided to onMessage handler
 */
export interface MessageContext {
  /**
   * WebSocket connection
   */
  ws: WebSocket;
  /**
   * Unique client ID
   */
  clientId: string;
  /**
   * Parsed message data
   */
  message: unknown;
  /**
   * Raw message buffer
   */
  rawData: Buffer;
  /**
   * Room the message was received in
   */
  room: RoomReference;
  /**
   * Authentication result from onConnect
   */
  auth: AuthResult;
  /**
   * Send a message to a specific client
   */
  sendToClient: (targetClientId: string, message: unknown) => void;
  /**
   * Broadcast a message to all clients in the room except the sender
   */
  broadcastToRoom: (message: unknown, excludeClientId?: string) => void;
  /**
   * Send an error message to the client
   */
  sendError: (error: Error) => void;
}

/**
 * Context provided to onDisconnect handler
 */
export interface DisconnectContext {
  /**
   * Unique client ID
   */
  clientId: string;
  /**
   * Room the client was in
   */
  room: RoomReference;
  /**
   * Authentication result from onConnect
   */
  auth: AuthResult;
}

/**
 * Reference to a room - allows handlers to interact with room state
 */
export interface RoomReference {
  /**
   * Full room ID (e.g., "device:uuid-1234")
   */
  roomId: string;
  /**
   * Room type (e.g., "device", "records")
   */
  roomType: string;
  /**
   * Get current room state
   */
  getState(): RoomState;
  /**
   * Add a client to the room
   */
  addClient(clientId: string, clientData: ClientData): void;
  /**
   * Remove a client from the room
   */
  removeClient(clientId: string): void;
  /**
   * Update room activity timestamp
   */
  updateActivity(): void;
}

/**
 * Basic room state
 *
 * Note: This is a simplified version of the room state.
 * The actual room state may have additional properties.
 */
export interface RoomState {
  roomId: string;
  roomType: string;
  participants: Array<Record<string, unknown> & { id: string }>;
  createdAt: number;
  lastActivity: number;
  version?: number;
  yjsState?: Uint8Array;
}

/**
 * Client data stored with the connection
 */
export interface ClientData {
  id: string;
  roomId: string;
  connectedAt: number;
  lastActivity: number;
  [key: string]: unknown;
}

/**
 * Handler for a specific room type
 *
 * Implement this interface to handle connections to a custom room type.
 * For example, Broadcast Box implements this for "device" rooms.
 */
export interface RoomTypeHandler {
  /**
   * Room type this handler manages (e.g., "device", "records")
   */
  roomType: string;

  /**
   * Called when a client attempts to connect to this room type.
   * Should authenticate and authorize the connection.
   *
   * @param context Connection context
   * @returns Authentication result
   * @throws Error if authentication fails (will be sent to client)
   */
  onConnect?: (context: ConnectionContext) => Promise<AuthResult>;

  /**
   * Called when a message is received from a client in this room type.
   *
   * @param context Message context
   */
  onMessage?: (context: MessageContext) => Promise<void>;

  /**
   * Called when a client disconnects from this room type.
   *
   * @param context Disconnect context
   */
  onDisconnect?: (context: DisconnectContext) => void;

  /**
   * Called after successful connection to perform post-connect setup.
   * This is called after the client has been added to the room.
   *
   * @param context Connection context with additional auth info
   * @param auth Authentication result from onConnect
   */
  onPostConnect?: (
    context: ConnectionContext,
    auth: AuthResult
  ) => Promise<void>;
}

/**
 * Registry for room type handlers
 *
 * Used by RealtimeServer to delegate room-specific logic to external modules.
 */
export interface HandlerRegistry {
  /**
   * Register a handler for a room type.
   * If a handler already exists for this room type, it will be replaced.
   *
   * @param handler Handler to register
   */
  registerRoomTypeHandler(handler: RoomTypeHandler): void;

  /**
   * Get the handler for a room type.
   *
   * @param roomType Room type to get handler for
   * @returns Handler if registered, undefined otherwise
   */
  getHandler(roomType: string): RoomTypeHandler | undefined;

  /**
   * Check if a handler is registered for a room type.
   *
   * @param roomType Room type to check
   * @returns true if handler is registered
   */
  hasHandler(roomType: string): boolean;

  /**
   * Get all registered room types.
   *
   * @returns Array of room type names
   */
  getRegisteredRoomTypes(): string[];

  /**
   * Unregister a handler for a room type.
   *
   * @param roomType Room type to unregister
   * @returns true if handler was removed, false if not found
   */
  unregisterRoomTypeHandler(roomType: string): boolean;
}

/**
 * Options for creating the handler registry
 */
export interface HandlerRegistryOptions {
  /**
   * Logger instance
   */
  logger?: {
    info: (message: string, context?: Record<string, unknown>) => void;
    warn: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, context?: Record<string, unknown>) => void;
    debug: (message: string, context?: Record<string, unknown>) => void;
  };
}
