/**
 * Room Manager
 *
 * Manages WebSocket rooms for collaborative editing
 */

import type { Logger } from '@civicpress/core';
import type { RealtimeServer } from '../realtime-server.js';
import type { RoomConfig, RoomState } from '../types/realtime.types.js';
import { RoomNotFoundError } from '../errors/realtime-errors.js';
import { YjsRoom } from './yjs-room.js';

export interface RoomFactory {
  createRoom(roomId: string, config: RoomConfig): Room;
  supportsRoomType(roomType: string): boolean;
}

export interface Room {
  roomId: string;
  roomType: string;
  addClient(clientId: string, connection: any): void;
  removeClient(clientId: string): void;
  broadcast(message: any, excludeClientId?: string): void;
  getState(): RoomState;
  destroy(): Promise<void>;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private factories: Map<string, RoomFactory> = new Map();
  private logger: Logger;
  private server: RealtimeServer;

  constructor(logger: Logger, server: RealtimeServer) {
    this.logger = logger;
    this.server = server;
    this.registerDefaultRoomTypes();
  }

  /**
   * Register default room types
   */
  private registerDefaultRoomTypes(): void {
    // Factory for record rooms (supports both 'record' and 'records')
    const recordRoomFactory: RoomFactory = {
      createRoom: (roomId: string, config: RoomConfig) => {
        return new YjsRoom(roomId, config, this.logger, this.server);
      },
      supportsRoomType: (roomType: string) =>
        roomType === 'record' || roomType === 'records',
    };

    // Register both 'record' (singular) and 'records' (plural) room types
    // This allows URLs like /realtime/records/:recordId to work
    this.registerRoomType('record', recordRoomFactory);
    this.registerRoomType('records', recordRoomFactory);
  }

  /**
   * Register a new room type factory
   */
  registerRoomType(type: string, factory: RoomFactory): void {
    this.factories.set(type, factory);
    this.logger.info(`Registered room type: ${type}`, {
      operation: 'realtime:room:register',
    });
  }

  /**
   * Get or create a room
   */
  getOrCreateRoom(
    roomId: string,
    roomType: string,
    config?: Partial<RoomConfig>
  ): Room {
    // Check if room exists
    const existingRoom = this.rooms.get(roomId);
    if (existingRoom) {
      return existingRoom;
    }

    // Find factory for room type
    const factory = this.factories.get(roomType);
    if (!factory) {
      throw new RoomNotFoundError(roomId, { roomType });
    }

    // Create new room
    const roomConfig: RoomConfig = {
      roomId,
      roomType,
      ...config,
    };

    const room = factory.createRoom(roomId, roomConfig);
    this.rooms.set(roomId, room);

    this.logger.info('Room created', {
      operation: 'realtime:room:created',
      roomId,
      roomType,
    });

    // Emit hook event
    this.server.emitHook('realtime:room:created', {
      roomId,
      roomType,
      timestamp: Date.now(),
    });

    return room;
  }

  /**
   * Get existing room
   */
  getRoom(roomId: string): Room | null {
    return this.rooms.get(roomId) || null;
  }

  /**
   * Remove a room
   */
  async removeRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    await room.destroy();
    this.rooms.delete(roomId);

    this.logger.info('Room destroyed', {
      operation: 'realtime:room:destroyed',
      roomId,
    });

    // Emit hook event
    this.server.emitHook('realtime:room:destroyed', {
      roomId,
      timestamp: Date.now(),
    });
  }

  /**
   * Cleanup empty rooms
   */
  async cleanupEmptyRooms(): Promise<void> {
    const roomsToRemove: string[] = [];

    for (const [roomId, room] of this.rooms.entries()) {
      const state = room.getState();
      if (state.participants.length === 0) {
        roomsToRemove.push(roomId);
      }
    }

    for (const roomId of roomsToRemove) {
      await this.removeRoom(roomId);
    }

    if (roomsToRemove.length > 0) {
      this.logger.info(`Cleaned up ${roomsToRemove.length} empty rooms`, {
        operation: 'realtime:room:cleanup',
      });
    }
  }

  /**
   * Get all rooms
   */
  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Get room count
   */
  getRoomCount(): number {
    return this.rooms.size;
  }
}
