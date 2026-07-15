/**
 * Realtime Module Entry Point
 *
 * Main exports for the realtime module
 */

export { RealtimeServer } from './realtime-server.js';
export { RoomManager } from './rooms/room-manager.js';
export type { Room, RoomFactory } from './rooms/room-manager.js';
export { YjsRoom } from './rooms/yjs-room.js';
export { RealtimeConfigManager } from './realtime-config-manager.js';
export {
  registerRealtimeServices,
  createRealtimeServer,
} from './realtime-services.js';
export type { RealtimeServerDeps } from './realtime-services.js';
export { PresenceManager } from './presence/presence-manager.js';
export { AwarenessManager } from './presence/awareness.js';
export {
  SnapshotManager,
  SnapshotHookBus,
  SNAPSHOT_FORMAT_V1,
  MAX_SNAPSHOT_BYTES,
  SNAPSHOT_TTL_MS,
} from './persistence/snapshots.js';
export type {
  SnapshotRow,
  PersistRequest,
  CleanupOptions,
  SnapshotHookEvents,
} from './persistence/snapshots.js';
export {
  DatabaseSnapshotStorage,
  FilesystemSnapshotStorage,
} from './persistence/storage.js';
export type { SnapshotStorage } from './persistence/storage.js';
export {
  DefaultHandlerRegistry,
  createHandlerRegistry,
} from './handler-registry.js';

// Export types
export type {
  RealtimeConfig,
  RoomConfig,
  ClientConnection,
  RoomState,
  SnapshotMetadata,
  PresenceData,
} from './types/realtime.types.js';

// Export handler registry types
export type {
  RoomTypeHandler,
  HandlerRegistry,
  ConnectionContext,
  MessageContext,
  DisconnectContext,
  AuthResult,
  RoomReference,
  ClientData,
  HandlerRegistryOptions,
} from './types/handler-registry.types.js';

// Export health status type
import type { RealtimeServer } from './realtime-server.js';
export type RealtimeHealthStatus = ReturnType<
  RealtimeServer['getHealthStatus']
>;

export type {
  RealtimeMessage,
  SyncMessage,
  PresenceMessage,
  ControlMessage,
  PingMessage,
  PongMessage,
} from './types/messages.js';

export { MessageType, PresenceEvent, ControlEvent } from './types/messages.js';

// Export errors
export {
  RealtimeError,
  RoomNotFoundError,
  ConnectionLimitExceededError,
  InvalidYjsUpdateError,
  AuthenticationFailedError,
  PermissionDeniedError,
} from './errors/realtime-errors.js';
