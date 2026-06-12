/**
 * Handler Registry Implementation
 *
 * Manages room type handlers for the realtime server, allowing external modules
 * to register custom handling logic for specific room types.
 */

import { coreInfo, coreWarn, coreDebug } from '@civicpress/core';
import type {
  HandlerRegistry,
  RoomTypeHandler,
  HandlerRegistryOptions,
} from './types/handler-registry.types.js';

/**
 * Default implementation of HandlerRegistry
 *
 * Provides a registry for room type handlers that can be used by the
 * RealtimeServer to delegate room-specific logic to external modules.
 */
export class DefaultHandlerRegistry implements HandlerRegistry {
  private handlers: Map<string, RoomTypeHandler> = new Map();

  constructor(private options: HandlerRegistryOptions = {}) {}

  /**
   * Register a handler for a room type
   */
  registerRoomTypeHandler(handler: RoomTypeHandler): void {
    if (!handler.roomType) {
      throw new Error('RoomTypeHandler must specify a roomType');
    }

    const existing = this.handlers.get(handler.roomType);
    if (existing) {
      coreWarn('Replacing existing handler for room type', {
        operation: 'realtime:handler-registry:replace',
        roomType: handler.roomType,
      });
    }

    this.handlers.set(handler.roomType, handler);

    coreInfo('Room type handler registered', {
      operation: 'realtime:handler-registry:register',
      roomType: handler.roomType,
      hasOnConnect: !!handler.onConnect,
      hasOnMessage: !!handler.onMessage,
      hasOnDisconnect: !!handler.onDisconnect,
      hasOnPostConnect: !!handler.onPostConnect,
    });
  }

  /**
   * Get the handler for a room type
   */
  getHandler(roomType: string): RoomTypeHandler | undefined {
    return this.handlers.get(roomType);
  }

  /**
   * Check if a handler is registered for a room type
   */
  hasHandler(roomType: string): boolean {
    return this.handlers.has(roomType);
  }

  /**
   * Get all registered room types
   */
  getRegisteredRoomTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Unregister a handler for a room type
   */
  unregisterRoomTypeHandler(roomType: string): boolean {
    const removed = this.handlers.delete(roomType);

    if (removed) {
      coreInfo('Room type handler unregistered', {
        operation: 'realtime:handler-registry:unregister',
        roomType,
      });
    } else {
      coreDebug('Attempted to unregister non-existent handler', {
        operation: 'realtime:handler-registry:unregister:not-found',
        roomType,
      });
    }

    return removed;
  }
}

/**
 * Create a handler registry instance
 */
export function createHandlerRegistry(
  options: HandlerRegistryOptions = {}
): HandlerRegistry {
  return new DefaultHandlerRegistry(options);
}
