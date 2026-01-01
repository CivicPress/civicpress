/**
 * WebSocket Protocol Handler
 *
 * Handles parsing and validation of command/event messages
 */

import type { Logger } from '@civicpress/core';
import { coreWarn, coreError } from '@civicpress/core';
import type {
  BaseMessage,
  CommandMessage,
  EventMessage,
  AckMessage,
} from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

export interface ParsedMessage {
  type: 'command' | 'event' | 'ack' | 'heartbeat';
  message: CommandMessage | EventMessage | AckMessage | BaseMessage;
  isValid: boolean;
  error?: string;
}

export class ProtocolHandler {
  constructor(private logger: Logger) {}

  /**
   * Parse incoming WebSocket message
   */
  parseMessage(data: string | Buffer): ParsedMessage | null {
    try {
      const message =
        typeof data === 'string'
          ? JSON.parse(data)
          : JSON.parse(data.toString());

      // Validate base message structure
      if (!message.type || !message.id || !message.timestamp) {
        return {
          type: 'command', // Default
          message: message as BaseMessage,
          isValid: false,
          error: 'Missing required fields: type, id, or timestamp',
        };
      }

      // Validate timestamp format (ISO 8601)
      const timestamp = new Date(message.timestamp);
      if (isNaN(timestamp.getTime())) {
        return {
          type: message.type,
          message: message as BaseMessage,
          isValid: false,
          error: 'Invalid timestamp format',
        };
      }

      // Route by message type
      switch (message.type) {
        case 'command':
          return this.parseCommand(message);
        case 'event':
          return this.parseEvent(message);
        case 'ack':
          return this.parseAck(message);
        case 'heartbeat':
          return {
            type: 'heartbeat',
            message: message as BaseMessage,
            isValid: true,
          };
        default:
          return {
            type: message.type,
            message: message as BaseMessage,
            isValid: false,
            error: `Unknown message type: ${message.type}`,
          };
      }
    } catch (error) {
      coreError(
        'Failed to parse WebSocket message',
        'broadcast-box:protocol:parse-error',
        error instanceof Error ? error.message : String(error),
        {
          operation: 'broadcast-box:protocol:parse-error',
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return null;
    }
  }

  /**
   * Parse command message
   */
  private parseCommand(message: any): ParsedMessage {
    if (!message.action) {
      return {
        type: 'command',
        message: message as CommandMessage,
        isValid: false,
        error: 'Command message missing action field',
      };
    }

    return {
      type: 'command',
      message: message as CommandMessage,
      isValid: true,
    };
  }

  /**
   * Parse event message
   */
  private parseEvent(message: any): ParsedMessage {
    if (!message.event) {
      return {
        type: 'event',
        message: message as EventMessage,
        isValid: false,
        error: 'Event message missing event field',
      };
    }

    return {
      type: 'event',
      message: message as EventMessage,
      isValid: true,
    };
  }

  /**
   * Parse acknowledgment message
   */
  private parseAck(message: any): ParsedMessage {
    if (!message.commandId) {
      return {
        type: 'ack',
        message: message as AckMessage,
        isValid: false,
        error: 'Ack message missing commandId field',
      };
    }

    return {
      type: 'ack',
      message: message as AckMessage,
      isValid: true,
    };
  }

  /**
   * Create command message
   */
  createCommand(
    action: string,
    payload: any,
    commandId?: string
  ): CommandMessage {
    return {
      type: 'command',
      id: commandId || uuidv4(),
      timestamp: new Date().toISOString(),
      action,
      payload,
    };
  }

  /**
   * Create event message
   */
  createEvent(event: string, payload: any, eventId?: string): EventMessage {
    return {
      type: 'event',
      id: eventId || uuidv4(),
      timestamp: new Date().toISOString(),
      event,
      payload,
    };
  }

  /**
   * Create acknowledgment message
   */
  createAck(
    commandId: string,
    success: boolean,
    error?: string,
    payload?: any
  ): AckMessage {
    return {
      type: 'ack',
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      commandId,
      success,
      error,
      payload,
    };
  }

  /**
   * Create heartbeat message
   */
  createHeartbeat(): BaseMessage {
    return {
      type: 'heartbeat',
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Validate message structure
   */
  validateMessage(message: BaseMessage): { valid: boolean; error?: string } {
    if (!message.type) {
      return { valid: false, error: 'Message type is required' };
    }

    if (!message.id) {
      return { valid: false, error: 'Message ID is required' };
    }

    if (!message.timestamp) {
      return { valid: false, error: 'Message timestamp is required' };
    }

    // Validate timestamp
    const timestamp = new Date(message.timestamp);
    if (isNaN(timestamp.getTime())) {
      return { valid: false, error: 'Invalid timestamp format' };
    }

    return { valid: true };
  }
}
