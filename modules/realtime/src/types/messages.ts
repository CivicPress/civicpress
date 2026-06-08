/**
 * WebSocket Message Type Definitions
 *
 * Message types for realtime WebSocket communication
 */

export enum MessageType {
  SYNC = 'sync',
  PRESENCE = 'presence',
  CONTROL = 'control',
  PING = 'ping',
  PONG = 'pong',
}

export enum PresenceEvent {
  JOINED = 'joined',
  LEFT = 'left',
  CURSOR = 'cursor',
  AWARENESS = 'awareness',
}

export enum ControlEvent {
  ROOM_STATE = 'room_state',
  ERROR = 'error',
  NOTICE = 'notice',
}

export interface BaseMessage {
  type: MessageType;
  timestamp?: number;
  [key: string]: any;
}

export interface SyncMessage extends BaseMessage {
  type: MessageType.SYNC;
  update?: string; // base64-encoded yjs update
  version?: number;
  from?: string; // user-id
}

export interface PresenceMessage extends BaseMessage {
  type: MessageType.PRESENCE;
  event: PresenceEvent;
  user: {
    id: string;
    name?: string;
    color?: string;
  };
  cursor?: {
    position: number;
    selection?: {
      start: number;
      end: number;
    };
  };
  awareness?: string; // base64-encoded yjs awareness
}

export interface ControlMessage extends BaseMessage {
  type: MessageType.CONTROL;
  event: ControlEvent;
  room?: {
    id: string;
    participants: Array<{
      id: string;
      name: string;
      color: string;
    }>;
    yjsState?: string; // base64-encoded yjs state
    version: number;
  };
  error?: {
    code: string;
    message: string;
  };
  notice?: {
    level: 'info' | 'warning' | 'error';
    message: string;
  };
}

export interface PingMessage extends BaseMessage {
  type: MessageType.PING;
}

export interface PongMessage extends BaseMessage {
  type: MessageType.PONG;
  timestamp: number;
}

export type RealtimeMessage =
  | SyncMessage
  | PresenceMessage
  | ControlMessage
  | PingMessage
  | PongMessage;
