/**
 * Broadcast Box API Routes
 *
 * Exports API router registration function
 */

import type { Logger } from '@civicpress/core';
import type { DeviceManager } from '../services/device-manager.js';
import type { DeviceAuthService } from '../services/device-auth.js';
import type { DeviceConnectionTracker } from '../services/device-connection-tracker.js';
import type { SessionController } from '../services/session-controller.js';
import type { UploadProcessor } from '../services/upload-processor.js';
import { createDevicesRouter } from './devices.js';
import { createSessionsRouter } from './sessions.js';
import { createUploadsRouter } from './uploads.js';

/**
 * Register broadcast-box API routes
 *
 * This function should be called from the API module to register
 * broadcast-box routes. The auth middleware should be applied by the
 * calling code (API module).
 *
 * @param app - Express application
 * @param deviceManager - DeviceManager service instance
 * @param deviceAuth - DeviceAuthService instance
 * @param logger - Logger instance
 * @param authMiddleware - Optional auth middleware function
 */
export function registerBroadcastBoxRoutes(
  app: any,
  deviceManager: DeviceManager,
  deviceAuth: DeviceAuthService,
  logger: Logger,
  authMiddleware?: any,
  connectionTracker?: DeviceConnectionTracker,
  sessionController?: SessionController,
  uploadProcessor?: UploadProcessor
): void {
  const devicesRouter = createDevicesRouter(
    deviceManager,
    deviceAuth,
    logger,
    connectionTracker
  );

  // Apply auth middleware if provided
  if (authMiddleware) {
    app.use('/api/v1/broadcast-box/devices', authMiddleware, devicesRouter);
  } else {
    app.use('/api/v1/broadcast-box/devices', devicesRouter);
  }

  // Register sessions router if sessionController is provided
  if (sessionController) {
    const sessionsRouter = createSessionsRouter(sessionController, logger);

    if (authMiddleware) {
      app.use('/api/v1/broadcast-box/sessions', authMiddleware, sessionsRouter);
    } else {
      app.use('/api/v1/broadcast-box/sessions', sessionsRouter);
    }
  }

  // Register uploads router if uploadProcessor is provided
  if (uploadProcessor) {
    const uploadsRouter = createUploadsRouter(uploadProcessor, logger);

    if (authMiddleware) {
      app.use('/api/v1/broadcast-box/uploads', authMiddleware, uploadsRouter);
    } else {
      app.use('/api/v1/broadcast-box/uploads', uploadsRouter);
    }
  }
}
