/**
 * Broadcast Box WebSocket Handlers
 *
 * Main entry point for WebSocket message handling
 */

export { ProtocolHandler } from './protocol.js';
export type { ParsedMessage } from './protocol.js';
export {
  CommandHandlerRegistry,
  createDefaultCommandHandlers,
} from './command-handlers.js';
export type {
  CommandHandler,
  CommandHandlerContext,
} from './command-handlers.js';
export {
  EventHandlerRegistry,
  createDefaultEventHandlers,
} from './event-handlers.js';
export type { EventHandler, EventHandlerContext } from './event-handlers.js';
