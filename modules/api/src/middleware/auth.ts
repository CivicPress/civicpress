import { Request, Response, NextFunction } from 'express';
import { CivicPress, AuthUser, Logger } from '@civicpress/core';

const logger = new Logger();

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  civicPress?: CivicPress;
}

export function authMiddleware(civicPress: CivicPress) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'No authorization header provided',
        });
      }

      const [scheme, token] = authHeader.split(' ');

      if (scheme.toLowerCase() !== 'bearer') {
        return res.status(401).json({
          error: 'Invalid authorization scheme',
          message: 'Use Bearer token authentication',
        });
      }

      if (!token) {
        return res.status(401).json({
          error: 'No token provided',
          message: 'Authorization token is required',
        });
      }

      // Try API key authentication first
      const authService = civicPress.getAuthService();
      let user = await authService.validateApiKey(token);

      // If API key fails, try session token
      if (!user) {
        user = await authService.validateSession(token);
      }

      if (!user) {
        return res.status(401).json({
          error: 'Invalid token',
          message: 'The provided token is invalid or expired',
        });
      }

      // Add user to request
      req.user = user;
      req.civicPress = civicPress;

      // Log authentication event
      await authService.logAuthEvent(
        user.id,
        'api_access',
        `Access to ${req.method} ${req.path}`,
        req.ip
      );

      next();
    } catch (error) {
      logger.error('Auth middleware error:', error);
      return res.status(500).json({
        error: 'Authentication error',
        message: 'Internal server error during authentication',
      });
    }
  };
}
