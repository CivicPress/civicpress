/**
 * Event Handlers
 *
 * Handles events sent from Broadcast Box devices to CivicPress
 */

import type { Logger } from '@civicpress/core';
import { coreInfo, coreWarn, coreError } from '@civicpress/core';
import type { EventMessage } from '../types/index.js';
import type { DeviceConnectionTracker } from '../services/device-connection-tracker.js';
import type { DeviceManager } from '../services/device-manager.js';
import { DeviceEventModel } from '../models/device-event.js';
import { v4 as uuidv4 } from 'uuid';

export interface EventHandlerContext {
  deviceId: string;
  clientId: string;
  connectionTracker: DeviceConnectionTracker;
  deviceManager: DeviceManager;
  deviceEventModel: DeviceEventModel;
  logger: Logger;
}

export type EventHandler = (
  event: EventMessage,
  context: EventHandlerContext
) => Promise<void>;

export class EventHandlerRegistry {
  private handlers: Map<string, EventHandler> = new Map();

  constructor(private logger: Logger) {}

  /**
   * Register an event handler
   */
  registerHandler(eventType: string, handler: EventHandler): void {
    this.handlers.set(eventType, handler);
    coreInfo('Event handler registered', {
      operation: 'broadcast-box:event:registered',
      eventType,
    });
  }

  /**
   * Handle event message
   */
  async handleEvent(
    event: EventMessage,
    context: EventHandlerContext
  ): Promise<void> {
    const handler = this.handlers.get(event.event);

    if (!handler) {
      coreWarn('Unknown event type', {
        operation: 'broadcast-box:event:unknown',
        eventType: event.event,
        deviceId: context.deviceId,
      });
      return;
    }

    try {
      await handler(event, context);
    } catch (error) {
      coreError(
        'Event handler error',
        'broadcast-box:event:error',
        error instanceof Error ? error.message : String(error),
        {
          operation: 'broadcast-box:event:error',
          eventType: event.event,
          deviceId: context.deviceId,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Get registered handlers
   */
  getRegisteredHandlers(): string[] {
    return Array.from(this.handlers.keys());
  }
}

/**
 * Create default event handlers
 */
export function createDefaultEventHandlers(
  logger: Logger
): EventHandlerRegistry {
  const registry = new EventHandlerRegistry(logger);

  // Register device.connected handler
  registry.registerHandler('device.connected', async (event, context) => {
    const { deviceId, version, capabilities } = event.payload;

    // Check if device needs activation (enrolled but not active)
    // Note: Activation is also handled in DeviceConnectionTracker.registerConnection,
    // but we check here as well for redundancy
    try {
      const device = await context.deviceManager.getDevice(context.deviceId);
      if (device && device.status === 'enrolled') {
        await context.deviceManager.activateDevice(context.deviceId);
        coreInfo('Device activated via device.connected event', {
          operation: 'broadcast-box:event:device-activated',
          deviceId: context.deviceId,
        });
      }
    } catch (error) {
      // Log but don't fail the event processing
      coreWarn('Failed to activate device in device.connected handler', {
        operation: 'broadcast-box:event:activation-error',
        deviceId: context.deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Log device connection event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'device.connected',
      eventData: {
        version,
        capabilities,
        connectedAt: new Date().toISOString(),
      },
    });

    coreInfo('Device connected event processed', {
      operation: 'broadcast-box:event:device-connected',
      deviceId: context.deviceId,
      version,
    });
  });

  // Register session.started handler
  registry.registerHandler('session.started', async (event, context) => {
    const { sessionId, state, startedAt } = event.payload;

    // Update device state
    context.connectionTracker.updateDeviceState(context.deviceId, {
      status: 'recording',
      activeSessionId: sessionId,
    });

    // Log event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'session.started',
      eventData: {
        sessionId,
        state,
        startedAt,
      },
    });

    coreInfo('Session started event processed', {
      operation: 'broadcast-box:event:session-started',
      deviceId: context.deviceId,
      sessionId,
    });
  });

  // Register session.stopped handler
  registry.registerHandler('session.stopped', async (event, context) => {
    const { sessionId, state, stoppedAt } = event.payload;

    // Update device state
    context.connectionTracker.updateDeviceState(context.deviceId, {
      status: 'encoding',
      activeSessionId: sessionId,
    });

    // Log event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'session.stopped',
      eventData: {
        sessionId,
        state,
        stoppedAt,
      },
    });

    coreInfo('Session stopped event processed', {
      operation: 'broadcast-box:event:session-stopped',
      deviceId: context.deviceId,
      sessionId,
    });
  });

  // Register session.complete handler
  registry.registerHandler('session.complete', async (event, context) => {
    const {
      sessionId,
      filePath,
      fileSize,
      durationSeconds,
      hash,
      completedAt,
    } = event.payload;

    // Update device state to idle
    context.connectionTracker.updateDeviceState(context.deviceId, {
      status: 'idle',
      activeSessionId: undefined,
    });

    // Log event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'session.complete',
      eventData: {
        sessionId,
        filePath,
        fileSize,
        durationSeconds,
        hash,
        completedAt,
      },
    });

    coreInfo('Session complete event processed', {
      operation: 'broadcast-box:event:session-complete',
      deviceId: context.deviceId,
      sessionId,
    });
  });

  // Register session.failed handler
  registry.registerHandler('session.failed', async (event, context) => {
    const { sessionId, error } = event.payload;

    // Update device state to idle
    context.connectionTracker.updateDeviceState(context.deviceId, {
      status: 'idle',
      activeSessionId: undefined,
    });

    // Log event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'session.failed',
      eventData: {
        sessionId,
        error,
      },
    });

    coreWarn('Session failed event processed', {
      operation: 'broadcast-box:event:session-failed',
      deviceId: context.deviceId,
      sessionId,
      error,
    });
  });

  // Register health.update handler
  registry.registerHandler('health.update', async (event, context) => {
    const { health } = event.payload;

    // Log health update event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'health.update',
      eventData: {
        health,
        updatedAt: new Date().toISOString(),
      },
    });

    coreInfo('Health update event processed', {
      operation: 'broadcast-box:event:health-update',
      deviceId: context.deviceId,
      healthScore: health?.score,
    });
  });

  // Register upload.progress handler
  registry.registerHandler('upload.progress', async (event, context) => {
    const { sessionId, progress } = event.payload;

    // Update device state to uploading
    context.connectionTracker.updateDeviceState(context.deviceId, {
      status: 'uploading',
      activeSessionId: sessionId,
    });

    // Log event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'upload.progress',
      eventData: {
        sessionId,
        progress,
      },
    });
  });

  // Register upload.complete handler
  registry.registerHandler('upload.complete', async (event, context) => {
    const { sessionId, uploadedAt, durationSeconds } = event.payload;

    // Update device state to idle
    context.connectionTracker.updateDeviceState(context.deviceId, {
      status: 'idle',
      activeSessionId: undefined,
    });

    // Log event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'upload.complete',
      eventData: {
        sessionId,
        uploadedAt,
        durationSeconds,
      },
    });

    coreInfo('Upload complete event processed', {
      operation: 'broadcast-box:event:upload-complete',
      deviceId: context.deviceId,
      sessionId,
    });
  });

  // Register device.error handler
  registry.registerHandler('device.error', async (event, context) => {
    const { severity, error } = event.payload;

    // Log error event
    await context.deviceEventModel.create({
      id: uuidv4(),
      deviceId: context.deviceId,
      eventType: 'device.error',
      eventData: {
        severity,
        error,
        occurredAt: new Date().toISOString(),
      },
    });

    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as any).code
        : undefined;
    const errorMessage =
      typeof error === 'object' && error !== null && 'message' in error
        ? (error as any).message
        : typeof error === 'string'
          ? error
          : String(error);

    if (severity === 'critical' || severity === 'error') {
      coreError(
        'Device error event processed',
        'broadcast-box:event:device-error',
        errorMessage,
        {
          operation: 'broadcast-box:event:device-error',
          deviceId: context.deviceId,
          severity,
          errorCode,
          errorMessage,
        }
      );
    } else {
      coreWarn('Device warning event processed', {
        operation: 'broadcast-box:event:device-warning',
        deviceId: context.deviceId,
        severity,
        errorCode,
        errorMessage,
      });
    }
  });

  return registry;
}
