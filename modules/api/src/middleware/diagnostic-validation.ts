/**
 * Diagnostic Input Validation Middleware
 *
 * Validates diagnostic request parameters.
 */

import { Request, Response, NextFunction } from 'express';
import { query, validationResult } from 'express-validator';

/**
 * Validate diagnostic query parameters
 */
export const validateDiagnosticParams = [
  query('component')
    .optional()
    .isIn(['database', 'search', 'config', 'filesystem', 'system'])
    .withMessage(
      'Component must be one of: database, search, config, filesystem, system'
    ),

  query('fix').optional().isBoolean().withMessage('Fix must be a boolean'),

  query('format')
    .optional()
    .isIn(['json', 'yaml'])
    .withMessage('Format must be json or yaml'),

  query('timeout')
    .optional()
    .isInt({ min: 1000, max: 300000 })
    .withMessage('Timeout must be between 1000 and 300000 milliseconds'),

  query('maxConcurrency')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Max concurrency must be between 1 and 10'),

  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        },
      });
    }
    next();
  },
];
