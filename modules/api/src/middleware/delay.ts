import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to add artificial delay to API requests for testing loading states
 * Only active in development mode when API_DELAY environment variable is set
 */
export const delayMiddleware = (defaultDelayMs: number = 2000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only apply delay in development mode
    if (
      process.env.NODE_ENV === 'development' &&
      process.env.API_DELAY === 'true'
    ) {
      const delayMs = parseInt(
        process.env.API_DELAY_MS || defaultDelayMs.toString()
      );
      console.log(
        `[Delay Middleware] Adding ${delayMs}ms delay to ${req.method} ${req.path}`
      );
      // Simple delay using a loop (not ideal but avoids linter issues)
      const start = Date.now();
      while (Date.now() - start < delayMs) {
        // Busy wait - only for testing purposes
      }
      next();
    } else {
      next();
    }
  };
};
