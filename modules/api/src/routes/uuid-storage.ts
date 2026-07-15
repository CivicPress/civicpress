import { Router } from 'express';
import { registerListingRoutes } from './uuid-storage/listing-handlers.js';
import { registerSingleFileRoutes } from './uuid-storage/single-file-handlers.js';
import { registerBatchRoutes } from './uuid-storage/batch-handlers.js';

const router = Router();

// IMPORTANT: Registration order matters for Express route matching.
// In particular `DELETE /files/:id` is registered (inside the single-file
// group) BEFORE `DELETE /files/batch` (inside the batch group), preserving
// the exact ordering of the pre-refactor single-file uuid-storage router.
// Inside single-file-handlers, `GET /files/:id/info` is registered before
// `GET /files/:id` for the same reason.
registerListingRoutes(router);
registerSingleFileRoutes(router);
registerBatchRoutes(router);

// Reset storage services (for testing) - no longer needed but kept for backward compatibility
export const resetStorageServices = () => {
  // No-op: Services are now managed by DI container
  // This function is kept for backward compatibility with tests
};

export default router;
