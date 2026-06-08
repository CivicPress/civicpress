/**
 * yjs Awareness Integration
 *
 * Integrates yjs awareness protocol for presence tracking
 */

import * as Y from 'yjs';
import type { PresenceData } from '../types/realtime.types.js';

export interface AwarenessState {
  user: {
    id: string;
    name: string;
    color: string;
  };
  cursor?: {
    position: number;
    selection?: {
      start: number;
      end: number;
    };
  };
  idle?: boolean;
}

export class AwarenessManager {
  private awareness: Y.Map<AwarenessState>;
  private clientId: number;

  constructor(yjsDoc: Y.Doc, clientId: number) {
    this.awareness = yjsDoc.getMap('awareness');
    this.clientId = clientId;
  }

  /**
   * Set local awareness state
   */
  setLocalState(state: AwarenessState): void {
    this.awareness.set(this.clientId.toString(), state);
  }

  /**
   * Get local awareness state
   */
  getLocalState(): AwarenessState | undefined {
    return this.awareness.get(this.clientId.toString());
  }

  /**
   * Get all awareness states
   */
  getAllStates(): Map<number, AwarenessState> {
    const states = new Map<number, AwarenessState>();
    this.awareness.forEach((state, clientId) => {
      states.set(Number(clientId), state);
    });
    return states;
  }

  /**
   * Remove local awareness state
   */
  removeLocalState(): void {
    this.awareness.delete(this.clientId.toString());
  }

  /**
   * Convert presence data to awareness state
   */
  static presenceToAwareness(presence: PresenceData): AwarenessState {
    return {
      user: {
        id: presence.userId,
        name: presence.username,
        color: presence.color,
      },
      cursor: presence.cursor,
      idle: presence.idle,
    };
  }

  /**
   * Convert awareness state to presence data
   */
  static awarenessToPresence(
    state: AwarenessState,
    userId: string
  ): PresenceData {
    return {
      userId,
      username: state.user.name,
      color: state.user.color,
      cursor: state.cursor,
      idle: state.idle,
    };
  }
}
