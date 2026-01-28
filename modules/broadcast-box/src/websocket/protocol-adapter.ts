/**
 * Protocol Adapter
 *
 * Translates between protocol format (nested payload.event_type/event_data)
 * and current implementation format (flat event field)
 */

import type {
  EventMessage,
  CommandMessage,
  AckMessage,
} from '../types/index.js';

/**
 * Convert protocol format event to current format
 * Protocol: { type: "event", payload: { event_type: "...", event_data: {...} } }
 * Current: { type: "event", event: "...", payload: {...} }
 */
export function adaptProtocolEventToCurrent(message: any): EventMessage | null {
  if (message.type !== 'event') {
    return null;
  }

  // Check if it's already in current format
  if (message.event) {
    return message as EventMessage;
  }

  // Check if it's in protocol format
  if (message.payload?.event_type && message.payload?.event_data) {
    return {
      type: 'event',
      id: message.id || message.payload.id,
      timestamp: message.timestamp || message.payload.timestamp,
      event: message.payload.event_type,
      payload: {
        ...message.payload.event_data,
        // Preserve any top-level fields
        eventType: message.payload.event_type,
        eventData: message.payload.event_data,
      },
    };
  }

  // Unknown format
  return null;
}

/**
 * Convert current format event to protocol format
 * Current: { type: "event", event: "...", payload: {...} }
 * Protocol: { type: "event", payload: { event_type: "...", event_data: {...} } }
 */
export function adaptCurrentEventToProtocol(message: EventMessage): any {
  return {
    type: 'event',
    id: message.id,
    timestamp: message.timestamp,
    payload: {
      event_type: message.event,
      event_data: message.payload,
    },
  };
}

/**
 * Convert protocol format command to current format
 * Protocol: { type: "command", payload: { action: "...", ... } }
 * Current: { type: "command", action: "...", payload: {...} }
 */
export function adaptProtocolCommandToCurrent(
  message: any
): CommandMessage | null {
  if (message.type !== 'command') {
    return null;
  }

  // Check if it's already in current format
  if (message.action) {
    return message as CommandMessage;
  }

  // Check if it's in protocol format
  if (message.payload?.action) {
    const { action, ...payload } = message.payload;
    return {
      type: 'command',
      id: message.id || message.payload.id,
      timestamp: message.timestamp || message.payload.timestamp,
      action,
      payload,
    };
  }

  // Unknown format
  return null;
}

/**
 * Convert current format command to protocol format
 * Current: { type: "command", action: "...", payload: {...} }
 * Protocol: { type: "command", payload: { action: "...", ... } }
 */
export function adaptCurrentCommandToProtocol(message: CommandMessage): any {
  return {
    type: 'command',
    id: message.id,
    timestamp: message.timestamp,
    payload: {
      action: message.action,
      ...message.payload,
    },
  };
}

/**
 * Convert protocol format ack to current format
 * Protocol: { type: "ack", payload: { command_id: "...", success: true, ... } }
 * Current: { type: "ack", commandId: "...", success: true, ... }
 */
export function adaptProtocolAckToCurrent(message: any): AckMessage | null {
  if (message.type !== 'ack') {
    return null;
  }

  // Check if it's already in current format
  if (message.commandId) {
    return message as AckMessage;
  }

  // Check if it's in protocol format
  if (message.payload?.command_id || message.payload?.commandId) {
    return {
      type: 'ack',
      id: message.id || message.payload.id,
      timestamp: message.timestamp || message.payload.timestamp,
      commandId: message.payload.command_id || message.payload.commandId,
      success: message.payload.success,
      error: message.payload.error,
      errorCode: message.payload.error_code || message.payload.errorCode,
      errorType: message.payload.error_type || message.payload.errorType,
      errorDetails:
        message.payload.error_details || message.payload.errorDetails,
      payload: message.payload.result || message.payload.payload,
    };
  }

  // Unknown format
  return null;
}

/**
 * Convert current format ack to protocol format
 * Current: { type: "ack", commandId: "...", success: true, ... }
 * Protocol: { type: "ack", payload: { command_id: "...", success: true, ... } }
 */
export function adaptCurrentAckToProtocol(message: AckMessage): any {
  return {
    type: 'ack',
    id: message.id,
    timestamp: message.timestamp,
    payload: {
      command_id: message.commandId,
      success: message.success,
      error: message.error,
      error_code: message.errorCode,
      error_type: message.errorType,
      error_details: message.errorDetails,
      result: message.payload,
    },
  };
}
