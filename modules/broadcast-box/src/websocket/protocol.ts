/**
 * WebSocket Protocol Handler
 *
 * Handles parsing and validation of command/event messages
 */

import type { Logger } from '@civicpress/core';
import { coreError } from '@civicpress/core';
import type {
  BaseMessage,
  CommandMessage,
  EventMessage,
  AckMessage,
} from '../types/index.js';
import type { StructuredErrorDict } from '../types/errors.js';
import { v4 as uuidv4 } from 'uuid';
import { validateMessage as validateAgainstSchema } from '@civicpress/broadcast-protocol';

export interface ParsedMessage {
  // The canonical message `type` (command | event | ack | status | heartbeat |
  // preview.* | schedule.push | session.manifest | control). String-typed so
  // every catalog member flows through; consumers narrow as needed.
  type: string;
  message: CommandMessage | EventMessage | AckMessage | BaseMessage; // BaseMessage covers status messages
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

      // Authoritative validation against the canonical wire schema
      // (@civicpress/broadcast-protocol) — the same schema the device validates
      // against. Replaces the former hand-rolled per-type field checks.
      const { valid, errors } = validateAgainstSchema(message);
      if (!valid) {
        return {
          type: typeof message?.type === 'string' ? message.type : 'command',
          message: message as BaseMessage,
          isValid: false,
          error: errors.join('; ') || 'Schema validation failed',
        };
      }

      return {
        type: message.type as string,
        message: message as
          | CommandMessage
          | EventMessage
          | AckMessage
          | BaseMessage,
        isValid: true,
      };
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
   * Create acknowledgment message.
   * When success is false, pass either a string error or a structured error (code, message, type, details).
   */
  createAck(
    commandId: string,
    success: boolean,
    errorOrStructured?: string | StructuredErrorDict,
    payload?: any,
    errorCode?: string
  ): AckMessage {
    const isStructured =
      errorOrStructured &&
      typeof errorOrStructured === 'object' &&
      'code' in errorOrStructured;
    const errorMsg =
      typeof errorOrStructured === 'string'
        ? errorOrStructured
        : isStructured
          ? (errorOrStructured as StructuredErrorDict).message
          : undefined;
    const code =
      errorCode ??
      (isStructured
        ? (errorOrStructured as StructuredErrorDict).code
        : undefined);
    const errorType = isStructured
      ? (errorOrStructured as StructuredErrorDict).type
      : undefined;
    const errorDetails = isStructured
      ? (errorOrStructured as StructuredErrorDict).details
      : undefined;

    return {
      type: 'ack',
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      commandId,
      success,
      error: errorMsg,
      errorCode: code,
      errorType,
      errorDetails,
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
    const { valid, errors } = validateAgainstSchema(message);
    return valid ? { valid: true } : { valid: false, error: errors.join('; ') };
  }
}
