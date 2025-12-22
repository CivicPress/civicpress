/**
 * yjs Room Implementation
 *
 * Manages a yjs document room for collaborative editing
 */

import type { Logger, RecordManager, RecordData } from '@civicpress/core';
import type { RealtimeServer } from '../realtime-server.js';
import type {
  RoomConfig,
  RoomState,
  ClientConnection,
} from '../types/realtime.types.js';
import type { Room } from './room-manager.js';
import * as Y from 'yjs';
import { InvalidYjsUpdateError } from '../errors/realtime-errors.js';

export class YjsRoom implements Room {
  public readonly roomId: string;
  public readonly roomType: string;
  private clients: Map<string, ClientConnection> = new Map();
  private yjsDoc: Y.Doc;
  private yjsText: Y.Text;
  private logger: Logger;
  private server: RealtimeServer;
  private recordManager: RecordManager | null = null;
  private version: number = 0;
  private createdAt: number;
  private lastActivity: number;
  private initialized: boolean = false;
  private updateCount: number = 0;

  constructor(
    roomId: string,
    config: RoomConfig,
    logger: Logger,
    server: RealtimeServer
  ) {
    this.roomId = roomId;
    this.roomType = config.roomType;
    this.logger = logger;
    this.server = server;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();

    // Initialize yjs document
    this.yjsDoc = new Y.Doc();

    // Create yjs text type for document content
    this.yjsText = this.yjsDoc.getText('content');

    // Listen for yjs updates
    this.yjsDoc.on('update', (update: Uint8Array, origin: any) => {
      this.handleYjsUpdate(update, origin);
    });

    this.logger.info('YjsRoom created', {
      operation: 'realtime:yjs-room:created',
      roomId,
    });
  }

  /**
   * Set record manager (for loading initial content)
   */
  setRecordManager(recordManager: RecordManager): void {
    this.recordManager = recordManager;
  }

  /**
   * Initialize room with record content
   */
  async initialize(recordId?: string): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Extract record ID from room ID (format: record:<recordId>)
      const actualRecordId = recordId || this.roomId.replace('record:', '');

      if (this.recordManager) {
        // Load record from API/Manager
        const record = await this.recordManager.getRecord(actualRecordId);
        if (record && record.content) {
          // Convert Markdown to yjs
          this.loadFromMarkdown(record.content);
          this.logger.info('YjsRoom initialized with record content', {
            operation: 'realtime:yjs-room:initialized',
            roomId: this.roomId,
            recordId: actualRecordId,
          });
        } else {
          // Empty document
          this.logger.info('YjsRoom initialized with empty document', {
            operation: 'realtime:yjs-room:initialized',
            roomId: this.roomId,
          });
        }
      } else {
        // No record manager - start with empty document
        this.logger.warn('YjsRoom initialized without record manager', {
          operation: 'realtime:yjs-room:initialized',
          roomId: this.roomId,
        });
      }

      this.initialized = true;
    } catch (error) {
      this.logger.error('Failed to initialize YjsRoom', {
        operation: 'realtime:yjs-room:initialize:error',
        roomId: this.roomId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with empty document
      this.initialized = true;
    }
  }

  /**
   * Load content from Markdown into yjs
   */
  private loadFromMarkdown(markdown: string): void {
    // Clear existing content
    this.yjsText.delete(0, this.yjsText.length);

    // Insert markdown content
    this.yjsText.insert(0, markdown);

    this.version++;
    this.lastActivity = Date.now();
  }

  /**
   * Convert yjs document to Markdown
   */
  toMarkdown(): string {
    return this.yjsText.toString();
  }

  /**
   * Add client to room
   */
  addClient(clientId: string, connection: ClientConnection): void {
    this.clients.set(clientId, connection);
    this.lastActivity = Date.now();

    this.logger.info('Client added to room', {
      operation: 'realtime:room:client:added',
      roomId: this.roomId,
      clientId,
      userId: connection.userId,
    });
  }

  /**
   * Remove client from room
   */
  removeClient(clientId: string): void {
    this.clients.delete(clientId);
    this.lastActivity = Date.now();

    this.logger.info('Client removed from room', {
      operation: 'realtime:room:client:removed',
      roomId: this.roomId,
      clientId,
    });
  }

  /**
   * Broadcast message to all clients in room
   */
  broadcast(message: any, excludeClientId?: string): void {
    // Broadcasting is handled by the server
    // This method is called by the server to notify the room
    this.lastActivity = Date.now();
  }

  /**
   * Get current room state
   */
  getState(): RoomState {
    return {
      roomId: this.roomId,
      roomType: this.roomType,
      participants: Array.from(this.clients.values()),
      yjsState: Y.encodeStateAsUpdate(this.yjsDoc),
      version: this.version,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
    };
  }

  /**
   * Handle yjs update
   */
  private handleYjsUpdate(update: Uint8Array, origin: any): void {
    // Don't broadcast updates that originated from this server (already applied)
    if (origin && origin !== 'server') {
      this.version++;
      this.updateCount++;
      this.lastActivity = Date.now();

      // Broadcast to other clients (handled by server)
      // The server will encode the update and send it
    }
  }

  /**
   * Apply yjs update from client
   */
  applyUpdate(update: Uint8Array, clientId?: string): void {
    try {
      // Validate update format
      if (!(update instanceof Uint8Array)) {
        throw new InvalidYjsUpdateError('Update must be Uint8Array');
      }

      // Apply update with origin to prevent echo
      Y.applyUpdate(this.yjsDoc, update, clientId || 'unknown');
      this.version++;
      this.updateCount++;
      this.lastActivity = Date.now();

      this.logger.debug('Yjs update applied', {
        operation: 'realtime:yjs-room:update:applied',
        roomId: this.roomId,
        clientId,
        version: this.version,
      });
    } catch (error) {
      this.logger.error('Failed to apply yjs update', {
        operation: 'realtime:yjs-room:update:error',
        roomId: this.roomId,
        clientId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InvalidYjsUpdateError(
        error instanceof Error ? error.message : 'Unknown error',
        { roomId: this.roomId, clientId }
      );
    }
  }

  /**
   * Get yjs document
   */
  getYjsDoc(): Y.Doc {
    return this.yjsDoc;
  }

  /**
   * Get yjs text content
   */
  getYjsText(): Y.Text {
    return this.yjsText;
  }

  /**
   * Get client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get update count
   */
  getUpdateCount(): number {
    return this.updateCount;
  }

  /**
   * Check if room needs snapshot
   */
  needsSnapshot(maxUpdates: number, intervalSeconds: number): boolean {
    if (this.updateCount === 0) {
      return false;
    }

    const timeSinceLastSnapshot = (Date.now() - this.lastActivity) / 1000;
    return (
      this.updateCount >= maxUpdates || timeSinceLastSnapshot >= intervalSeconds
    );
  }

  /**
   * Reset update count (after snapshot)
   */
  resetUpdateCount(): void {
    this.updateCount = 0;
  }

  /**
   * Destroy room
   */
  async destroy(): Promise<void> {
    // Cleanup yjs document
    this.yjsDoc.destroy();

    // Clear clients
    this.clients.clear();

    this.logger.info('YjsRoom destroyed', {
      operation: 'realtime:yjs-room:destroyed',
      roomId: this.roomId,
    });
  }
}
