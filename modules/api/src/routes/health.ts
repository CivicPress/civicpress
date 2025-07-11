import { Router, Request, Response } from 'express';
import { Logger } from '@civicpress/core';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
} from '../utils/api-logger';

const logger = new Logger();

export const healthRouter = Router();

// GET /health - Health check endpoint
healthRouter.get('/', (req: Request, res: Response) => {
  logApiRequest(req, { endpoint: 'health' });

  try {
    logger.info('Health check requested', {
      requestId: (req as any).requestId,
      timestamp: new Date().toISOString(),
    });

    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
    };

    sendSuccess(healthStatus, req, res, { operation: 'Health Check' });
  } catch (error) {
    handleApiError('Health Check', error, req, res, 'Health check failed');
  }
});

// GET /health/detailed - Detailed health check
healthRouter.get('/detailed', (req: Request, res: Response) => {
  logApiRequest(req, { endpoint: 'health-detailed' });

  try {
    logger.info('Detailed health check requested', {
      requestId: (req as any).requestId,
    });

    const detailedHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
    };

    sendSuccess(detailedHealth, req, res, {
      operation: 'Detailed Health Check',
    });
  } catch (error) {
    handleApiError(
      'Detailed Health Check',
      error,
      req,
      res,
      'Detailed health check failed'
    );
  }
});

// POST /health/test-error - Test error logging
healthRouter.post('/test-error', (req: Request, res: Response) => {
  logApiRequest(req, { endpoint: 'health-test-error' });

  try {
    logger.info('Error test requested', {
      requestId: (req as any).requestId,
      body: req.body,
    });

    // Simulate different types of errors based on request body
    const { errorType = 'generic' } = req.body;

    switch (errorType) {
      case 'validation': {
        const validationError = new Error('Validation error test');
        (validationError as any).statusCode = 400;
        (validationError as any).code = 'VALIDATION_ERROR';
        throw validationError;
      }

      case 'not_found': {
        const notFoundError = new Error('Not found error test');
        (notFoundError as any).statusCode = 404;
        (notFoundError as any).code = 'NOT_FOUND_ERROR';
        throw notFoundError;
      }

      case 'server_error':
        throw new Error('Server error test');

      default:
        throw new Error('Generic error test');
    }
  } catch (error) {
    handleApiError('Error Test', error, req, res, 'Error test failed');
  }
});
