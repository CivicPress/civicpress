/**
 * Per-route authorization for broadcast-box operator routes.
 *
 * Authentication (a valid user token -> req.user) is applied at the router mount
 * by the API module's authMiddleware. This adds AUTHORIZATION: the user's role
 * must grant `permission` (checked via the core role system, `userCan`). It is
 * defence-in-depth — returns 401 if a route is somehow reached without an
 * authenticated user, and 403 if the user's role lacks the permission. The
 * broadcast-box permissions are defined + granted in the core role config
 * (`core/src/auth/role-manager/default-config.ts`).
 */

import { userCan } from '@civicpress/core';
import type { Logger } from '@civicpress/core';
import type { Request, Response, NextFunction } from 'express';

interface AuthedRequest extends Request {
  user?: { id: number; username: string; role: string };
}

export function requirePermission(permission: string, logger?: Logger) {
  return async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required', code: 'UNAUTHENTICATED' },
      });
      return;
    }

    let allowed = false;
    try {
      // userCan resolves the user's role -> permissions (incl. inherited) and
      // checks membership; cast is safe — authMiddleware sets {id,username,role}.
      allowed = await userCan(user as any, permission);
    } catch (e) {
      logger?.error('Broadcast-box permission check failed', {
        operation: 'broadcast-box:authz',
        permission,
        error: e instanceof Error ? e.message : String(e),
      });
      allowed = false;
    }

    if (!allowed) {
      res.status(403).json({
        success: false,
        error: {
          message: `Missing permission: ${permission}`,
          code: 'FORBIDDEN',
        },
      });
      return;
    }

    next();
  };
}
