/**
 * Presence Manager
 *
 * Manages user presence tracking (join/leave, cursor positions, selections)
 */

import type { Logger } from '@civicpress/core';
import { coreInfo } from '@civicpress/core';
import type { PresenceData } from '../types/realtime.types.js';
import { MessageType, PresenceEvent } from '../types/messages.js';

export interface PresenceState {
  userId: string;
  username: string;
  color: string;
  cursor?: {
    position: number;
    selection?: {
      start: number;
      end: number;
    };
  };
  idle?: boolean;
  lastActivity: number;
}

export class PresenceManager {
  private presence: Map<string, PresenceState> = new Map(); // userId -> state
  private logger: Logger;
  private colorPalette: string[] = [
    '#3b82f6', // blue
    '#ef4444', // red
    '#10b981', // green
    '#f59e0b', // amber
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
  ];
  private colorIndex: number = 0;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Add user presence
   */
  addPresence(userId: string, username: string): PresenceData {
    const color = this.getColorForUser(userId);
    const state: PresenceState = {
      userId,
      username,
      color,
      lastActivity: Date.now(),
    };

    this.presence.set(userId, state);

    coreInfo('User presence added', {
      operation: 'realtime:presence:added',
      userId,
      username,
    });

    return {
      userId,
      username,
      color,
    };
  }

  /**
   * Remove user presence
   */
  removePresence(userId: string): void {
    this.presence.delete(userId);

    coreInfo('User presence removed', {
      operation: 'realtime:presence:removed',
      userId,
    });
  }

  /**
   * Update cursor position
   */
  updateCursor(
    userId: string,
    position: number,
    selection?: { start: number; end: number }
  ): void {
    const state = this.presence.get(userId);
    if (!state) {
      return;
    }

    state.cursor = { position, selection };
    state.lastActivity = Date.now();

    this.presence.set(userId, state);
  }

  /**
   * Update idle status
   */
  updateIdle(userId: string, idle: boolean): void {
    const state = this.presence.get(userId);
    if (!state) {
      return;
    }

    state.idle = idle;
    state.lastActivity = Date.now();

    this.presence.set(userId, state);
  }

  /**
   * Get presence data for user
   */
  getPresence(userId: string): PresenceData | null {
    const state = this.presence.get(userId);
    if (!state) {
      return null;
    }

    return {
      userId: state.userId,
      username: state.username,
      color: state.color,
      cursor: state.cursor,
      idle: state.idle,
    };
  }

  /**
   * Get all presence data
   */
  getAllPresence(): PresenceData[] {
    return Array.from(this.presence.values()).map((state) => ({
      userId: state.userId,
      username: state.username,
      color: state.color,
      cursor: state.cursor,
      idle: state.idle,
    }));
  }

  /**
   * Cleanup idle users (older than threshold)
   */
  cleanupIdle(thresholdSeconds: number = 300): void {
    const now = Date.now();
    const threshold = thresholdSeconds * 1000;

    for (const [userId, state] of this.presence.entries()) {
      if (now - state.lastActivity > threshold) {
        this.presence.delete(userId);
        coreInfo('Removed idle user presence', {
          operation: 'realtime:presence:cleanup',
          userId,
        });
      }
    }
  }

  /**
   * Get color for user (consistent assignment)
   */
  private getColorForUser(userId: string): string {
    // Use hash of userId to get consistent color
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % this.colorPalette.length;
    return this.colorPalette[index];
  }

  /**
   * Create presence message
   */
  createPresenceMessage(
    event: PresenceEvent,
    userId: string,
    username: string,
    color: string,
    cursor?: { position: number; selection?: { start: number; end: number } }
  ) {
    return {
      type: MessageType.PRESENCE,
      event,
      user: {
        id: userId,
        name: username,
        color,
      },
      cursor,
    };
  }
}
