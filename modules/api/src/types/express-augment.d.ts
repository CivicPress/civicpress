/**
 * Global Express.Request augmentation.
 *
 * Phase 2d W3-T2: replaces the prior `AuthenticatedRequest` interface and
 * the ~254 `(req as any).<X>` access patterns scattered across route
 * handlers + middleware. Fields are appended verbatim to the global
 * `Express.Request` so any route handler typed `req: Request` (or any
 * `RequestHandler`) sees them without per-handler intersection types.
 *
 * Each field is optional because middleware sets them at different times:
 *  - `user` / `civicPress`         — set by `middleware/auth.ts`
 *  - `requestId`                   — set by `middleware/error-handler.ts`
 *  - `requestContext` / `context`  — set by `middleware/logging.ts`
 *
 * The shape of each field exactly matches the runtime assignment in those
 * middlewares; downstream handlers should still null-check before access.
 */

import type {
  AuthUser,
  CivicPress,
  DatabaseService,
} from '@civicpress/core';

declare global {
  namespace Express {
    interface Request {
      /** Authenticated user, set by `authMiddleware` after token resolution. */
      user?: AuthUser;

      /** CivicPress instance, set by `authMiddleware` (and by the API app
       *  wrapper before unauth'd routes when applicable). May be `null` while
       *  the app is still initializing — the wrapper assigns `this.civicPress`
       *  which itself starts as `null` until startup completes. */
      civicPress?: CivicPress | null;

      /** Per-request UUID, set by the error-handler request-tagging middleware. */
      requestId?: string;

      /** Logging-context bag set by `requestContextMiddleware`. */
      requestContext?: {
        timestamp: string;
        userAgent?: string;
        ip?: string;
        referer?: string;
        origin?: string;
      };

      /** Database/CivicPress context bag set by `createDatabaseContextMiddleware`
       *  for routes that need direct DB access without going through CivicPress. */
      context?: {
        databaseService?: DatabaseService;
        civicPress?: CivicPress;
        dataDir?: string;
      };
    }
  }
}

// Required so TypeScript treats this as a module (otherwise `declare global`
// would attempt to populate this file's own scope instead of the ambient one).
export {};
