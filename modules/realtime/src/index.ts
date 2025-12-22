/**
 * Realtime Module Entry Point
 *
 * Main exports for the realtime module
 */

export { RealtimeServer } from './realtime-server.js';
export { RoomManager } from './rooms/room-manager.js';
export { YjsRoom } from './rooms/yjs-room.js';
export { RealtimeConfigManager } from './realtime-config-manager.js';
export { registerRealtimeServices } from './realtime-services.js';
export { PresenceManager } from './presence/presence-manager.js';
export { AwarenessManager } from './presence/awareness.js';
export { SnapshotManager } from './persistence/snapshots.js';
export {
  DatabaseSnapshotStorage,
  FilesystemSnapshotStorage,
} from './persistence/storage.js';

// Export types
export type {
  RealtimeConfig,
  RoomConfig,
  ClientConnection,
  RoomState,
  SnapshotMetadata,
  PresenceData,
} from './types/realtime.types.js';

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
