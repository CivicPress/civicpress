import type { Request, Response } from 'express';
import { Logger } from '@civicpress/core';
import { AuditLogger } from '@civicpress/core';

export const logger = new Logger();
export const audit = new AuditLogger();

// Custom validation error handler for records API
export function handleRecordsValidationError(
  operation: string,
  errors: unknown[],
  req: Request,
  res: Response
): void {
  logger.warn(`${operation} validation failed`, {
    operation,
    validationErrors: errors,
    requestId: req.requestId,
    userId: req.user?.id,
    userRole: req.user?.role,
  });

  res.status(400).json({
    success: false,
    error: {
      message: 'Invalid record data',
      details: errors,
    },
  });
}
