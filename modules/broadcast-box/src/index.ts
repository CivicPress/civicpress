/**
 * CivicPress Broadcast Box Module
 *
 * Remote control and monitoring of Broadcast Box devices for civic session recording
 */

export * from './broadcast-box-services.js';
export * from './types/index.js';
export * from './models/index.js';
export * from './services/device-manager.js';
export * from './services/device-auth.js';
export * from './services/device-connection-tracker.js';
export * from './api/index.js';
export * from './websocket/index.js';

// Explicitly export the registration function for dynamic imports
export { registerBroadcastBoxServices } from './broadcast-box-services.js';
export { registerBroadcastBoxRoutes } from './api/index.js';
