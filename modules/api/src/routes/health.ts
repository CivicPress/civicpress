import { Router, Request, Response } from 'express';
import { Logger } from '@civicpress/core';
import { HttpError } from '../utils/http-error.js';
import {
  sendSuccess,
  handleApiError,
  logApiRequest,
} from '../utils/api-logger.js';

const logger = new Logger();

export const healthRouter = Router();

// GET /health - Health check endpoint
healthRouter.get('/', (req: Request, res: Response) => {
  logApiRequest(req, { endpoint: 'health' });

  try {
    logger.info('Health check requested', {
      requestId: req.requestId,
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
      requestId: req.requestId,
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
      requestId: req.requestId,
      body: req.body,
    });

    // Simulate different types of errors based on request body
    const { errorType = 'generic' } = req.body;

    switch (errorType) {
      case 'validation':
        throw new HttpError(400, 'Validation error test', 'VALIDATION_ERROR');
      case 'not_found':
        throw new HttpError(404, 'Not found error test', 'NOT_FOUND_ERROR');
      case 'server_error':
        throw new HttpError(500, 'Server error test', 'TEST_ERROR');
      default:
        throw new HttpError(500, 'Generic error test', 'TEST_ERROR');
    }
  } catch (error) {
    handleApiError('Error Test', error, req, res);
  }
});
