/**
 * Room Manager
 *
 * Manages WebSocket rooms for collaborative editing
 */

import type { Logger } from '@civicpress/core';
import { coreInfo, coreWarn } from '@civicpress/core';
import type { RealtimeServer } from '../realtime-server.js';
import type { RoomConfig, RoomState } from '../types/realtime.types.js';
import type { ClientData } from '../types/handler-registry.types.js';
import { RoomNotFoundError } from '../errors/realtime-errors.js';
import { YjsRoom } from './yjs-room.js';

export interface RoomFactory {
  createRoom(roomId: string, config: RoomConfig): Room;
  supportsRoomType(roomType: string): boolean;
}

export interface Room {
  roomId: string;
  roomType: string;
  addClient(clientId: string, connection: ClientData): void;
  removeClient(clientId: string): void;
  broadcast(message: unknown, excludeClientId?: string): void;
  getState(): RoomState;
  destroy(): Promise<void>;
}

/** Spec §6.3 default: keep a room in memory 5min after the last client leaves. */
const DEFAULT_GRACE_PERIOD_MS = 5 * 60 * 1000;

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private factories: Map<string, RoomFactory> = new Map();
  private logger: Logger;
  private server: RealtimeServer;

  // Grace-period bookkeeping (spec §6.3). When the last client leaves a room we
  // do NOT evict it immediately; instead we start a per-room timer. A reconnect
  // within the window cancels the timer (the in-memory Yjs state — and thus the
  // pending edits — is reused). If the window elapses the room is finalized:
  // its handler snapshots (Markdown writeback + binary persist), then the room
  // is removed from memory. `graceMs = 0` finalizes synchronously on last leave.
  private graceTimers: Map<string, NodeJS.Timeout> = new Map();
  private graceMs: number = DEFAULT_GRACE_PERIOD_MS;

  constructor(logger: Logger, server: RealtimeServer) {
    this.logger = logger;
    this.server = server;
    this.registerDefaultRoomTypes();
  }

  /**
   * Set the grace window (ms) before a clientless room is finalized. Called by
   * the server once config has loaded (spec default 5min; tests pass a small
   * value). A non-positive value finalizes immediately on last-client-leave.
   */
  setGracePeriodMs(graceMs: number): void {
    this.graceMs = graceMs;
  }

  /**
   * Register default room types
   */
  private registerDefaultRoomTypes(): void {
    // Factory for record rooms (canonical plural form only).
    // parseRoomId normalizes singular 'record' → 'records' at URL-parse time,
    // so no 'record' factory is needed here.
    const recordRoomFactory: RoomFactory = {
      createRoom: (roomId: string, config: RoomConfig) => {
        return new YjsRoom(roomId, config, this.logger, this.server);
      },
      supportsRoomType: (roomType: string) => roomType === 'records',
    };

    this.registerRoomType('records', recordRoomFactory);
  }

  /**
   * Register a new room type factory
   */
  registerRoomType(type: string, factory: RoomFactory): void {
    this.factories.set(type, factory);
    coreInfo(`Registered room type: ${type}`, {
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
    // Check if room exists. A reconnect to a room still in its grace window
    // cancels the pending finalize so the in-memory Yjs state (and the pending
    // edits) is reused rather than re-seeded from a snapshot (spec §6.3).
    const existingRoom = this.rooms.get(roomId);
    if (existingRoom) {
      this.cancelGraceTimer(roomId);
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

    coreInfo('Room created', {
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
   * Get total room count
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Record that a client left a room. When it was the LAST client, start (or
   * leave running) the grace timer; on elapse the room is finalized (handler
   * snapshot + eviction). Called by the server from its single disconnect path
   * AFTER the client has been removed from the room, so the participant count
   * read here is accurate.
   *
   * With `graceMs <= 0` the room is finalized immediately (no in-memory window).
   */
  handleRoomClientLeave(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    if (this.getRoomClientCount(room) > 0) {
      return; // Still occupied — no finalize.
    }
    if (this.graceTimers.has(roomId)) {
      return; // Timer already running from an earlier last-leave.
    }

    if (this.graceMs <= 0) {
      void this.finalizeRoom(roomId);
      return;
    }

    const timer = setTimeout(() => {
      this.graceTimers.delete(roomId);
      void this.finalizeRoom(roomId);
    }, this.graceMs);
    // Don't keep the event loop alive solely for a grace timer (process exit /
    // test teardown should not block on a pending finalize).
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    this.graceTimers.set(roomId, timer);

    coreInfo('Room grace timer started', {
      operation: 'realtime:room:grace:start',
      roomId,
      graceMs: this.graceMs,
    });
  }

  /**
   * Cancel a pending grace timer (reconnect within the window). Idempotent.
   */
  cancelGraceTimer(roomId: string): void {
    const timer = this.graceTimers.get(roomId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.graceTimers.delete(roomId);
    coreInfo('Room grace timer cancelled (reconnect within grace)', {
      operation: 'realtime:room:grace:cancel',
      roomId,
    });
  }

  /**
   * Finalize a clientless room: trigger its handler snapshot (Markdown
   * writeback + binary persist) then evict it from memory. Aborts if a client
   * reconnected between the timer firing and this running (the room is no longer
   * empty), so a late reconnect is never clobbered. Never throws.
   */
  async finalizeRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    // Re-check occupancy: a client may have joined after the timer fired but
    // before this async body ran. If so, abandon finalization.
    if (this.getRoomClientCount(room) > 0) {
      return;
    }

    try {
      await this.server.finalizeRoomSnapshot(room);
    } catch (error) {
      coreWarn('Room finalize snapshot failed; evicting room anyway', {
        operation: 'realtime:room:finalize:snapshot:error',
        roomId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Occupancy can change during the await above; re-check before eviction so a
    // reconnect that arrived mid-snapshot keeps its live room.
    const current = this.rooms.get(roomId);
    if (current && this.getRoomClientCount(current) === 0) {
      await this.removeRoom(roomId);
      coreInfo('Room finalized and evicted after grace period', {
        operation: 'realtime:room:finalize',
        roomId,
      });
    }
  }

  /** Current participant count for a room (room-type-agnostic). */
  private getRoomClientCount(room: Room): number {
    return room.getState().participants.length;
  }

  /** @internal Pending grace-timer count — tests/observability only. */
  getGraceTimerCount(): number {
    return this.graceTimers.size;
  }

  /**
   * Remove a room
   */
  async removeRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    // Any pending grace finalize for this room is now moot.
    this.cancelGraceTimer(roomId);

    await room.destroy();
    this.rooms.delete(roomId);

    coreInfo('Room destroyed', {
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
      coreInfo(`Cleaned up ${roomsToRemove.length} empty rooms`, {
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
   * Get the set of currently-active room IDs.
   *
   * Used by snapshot TTL cleanup to skip rows whose room is still in memory
   * (an active room's snapshot is load-bearing for grace-period reconnection).
   */
  getActiveRoomIds(): ReadonlySet<string> {
    return new Set(this.rooms.keys());
  }

  /**
   * Cancel every pending grace timer without finalizing. Called by the server on
   * shutdown, which performs its own final snapshot pass over all rooms — so
   * leaving timers armed would double-snapshot (and outlive the process).
   */
  clearAllGraceTimers(): void {
    for (const timer of this.graceTimers.values()) {
      clearTimeout(timer);
    }
    this.graceTimers.clear();
  }
}
