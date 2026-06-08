/**
 * yjs Room Implementation
 *
 * Manages a yjs document room for collaborative editing
 */

import type { Logger, RecordManager } from '@civicpress/core';
import {
  coreInfo,
  coreWarn,
  coreError,
  coreDebug,
  isCivicPressError,
} from '@civicpress/core';
import type { RealtimeServer } from '../realtime-server.js';
import type { RoomConfig, RoomState } from '../types/realtime.types.js';
import type { ClientData } from '../types/handler-registry.types.js';
import type { Room } from './room-manager.js';
import * as Y from 'yjs';
import { InvalidYjsUpdateError } from '../errors/realtime-errors.js';

export class YjsRoom implements Room {
  public readonly roomId: string;
  public readonly roomType: string;
  private clients: Map<string, ClientData> = new Map();
  private yjsDoc: Y.Doc;
  private yjsFragment: Y.XmlFragment;
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

    // Create yjs XmlFragment for TipTap editor content
    // TipTap's Collaboration extension expects an XmlFragment, not Text
    this.yjsFragment = this.yjsDoc.getXmlFragment('content');

    // Listen for yjs updates
    this.yjsDoc.on('update', (update: Uint8Array, origin: unknown) => {
      this.handleYjsUpdate(update, origin);
    });

    coreInfo('YjsRoom created', {
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
          coreInfo('YjsRoom initialized with record content', {
            operation: 'realtime:yjs-room:initialized',
            roomId: this.roomId,
            recordId: actualRecordId,
          });
        } else {
          // Empty document
          coreInfo('YjsRoom initialized with empty document', {
            operation: 'realtime:yjs-room:initialized',
            roomId: this.roomId,
          });
        }
      } else {
        // No record manager - start with empty document
        coreWarn('YjsRoom initialized without record manager', {
          operation: 'realtime:yjs-room:initialized',
          roomId: this.roomId,
        });
      }

      this.initialized = true;
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error) ? undefined : 'REALTIME_YJS_ROOM_INIT_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:yjs-room:initialize:error',
          roomId: this.roomId,
        }
      );
      // Continue with empty document
      this.initialized = true;
    }
  }

  /**
   * Load content from Markdown into yjs XmlFragment
   * Note: For TipTap, content is typically loaded client-side via the editor.
   * This method stores the markdown as initial content that can be retrieved.
   * The TipTap editor will handle the actual XML structure.
   */
  private loadFromMarkdown(markdown: string): void {
    // For XmlFragment used by TipTap, we store the initial markdown
    // in a separate Text type that can be used for initialization
    const initialContent = this.yjsDoc.getText('initialMarkdown');
    initialContent.delete(0, initialContent.length);
    initialContent.insert(0, markdown);

    this.version++;
    this.lastActivity = Date.now();
  }

  /**
   * Convert yjs document to Markdown
   * Note: For TipTap XmlFragment, the actual content is in XML format.
   * This returns the initial markdown if set, or serializes the XML content.
   */
  toMarkdown(): string {
    // Check if we have initial markdown content
    const initialContent = this.yjsDoc.getText('initialMarkdown');
    if (initialContent.length > 0) {
      return initialContent.toString();
    }

    // For XmlFragment, convert to string representation
    // The actual markdown conversion should be done by TipTap on the client
    return this.yjsFragment.toString();
  }

  /**
   * Get initial markdown content (if set)
   */
  getInitialMarkdown(): string | null {
    const initialContent = this.yjsDoc.getText('initialMarkdown');
    return initialContent.length > 0 ? initialContent.toString() : null;
  }

  /**
   * Add client to room
   */
  addClient(clientId: string, connection: ClientData): void {
    this.clients.set(clientId, connection);
    this.lastActivity = Date.now();

    coreInfo('Client added to room', {
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

    coreInfo('Client removed from room', {
      operation: 'realtime:room:client:removed',
      roomId: this.roomId,
      clientId,
    });
  }

  /**
   * Broadcast message to all clients in room.
   *
   * Broadcasting is performed by the server; this hook only bumps the room's
   * activity timestamp. The arguments are part of the Room interface contract
   * but unused here.
   */
  broadcast(_message: unknown, _excludeClientId?: string): void {
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
  private handleYjsUpdate(_update: Uint8Array, origin: unknown): void {
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

      coreDebug('Yjs update applied', {
        operation: 'realtime:yjs-room:update:applied',
        roomId: this.roomId,
        clientId,
        version: this.version,
      });
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error) ? undefined : 'REALTIME_YJS_UPDATE_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:yjs-room:update:error',
          roomId: this.roomId,
          clientId,
        }
      );
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
   * Get yjs XmlFragment (for TipTap editor)
   */
  getYjsFragment(): Y.XmlFragment {
    return this.yjsFragment;
  }

  /**
   * Get yjs text content (deprecated, use getYjsFragment for TipTap)
   * @deprecated Use getYjsFragment() for TipTap compatibility
   */
  getYjsText(): Y.Text {
    return this.yjsDoc.getText('initialMarkdown');
  }

  /**
   * Get all clients
   */
  getClients(): Map<string, ClientData> {
    return this.clients;
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

    coreInfo('YjsRoom destroyed', {
      operation: 'realtime:yjs-room:destroyed',
      roomId: this.roomId,
    });
  }
}
