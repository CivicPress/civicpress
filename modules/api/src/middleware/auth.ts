import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    apiKey: string;
    permissions: string[];
  };
}

export function validateApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const apiKey =
    req.headers['x-api-key'] ||
    req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey) {
    res.status(401).json({
      error: {
        message: 'API key required',
        code: 'MISSING_API_KEY',
      },
    });
    return;
  }

  // TODO: Implement proper API key validation
  // For now, accept any non-empty key
  if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
    req.user = {
      apiKey: apiKey,
      permissions: ['read', 'write'], // Default permissions
    };
    next();
  } else {
    res.status(401).json({
      error: {
        message: 'Invalid API key',
        code: 'INVALID_API_KEY',
      },
    });
    return;
  }
}
