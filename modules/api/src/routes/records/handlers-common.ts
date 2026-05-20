import { Logger } from '@civicpress/core';
import { AuditLogger } from '@civicpress/core';

export const logger = new Logger();
export const audit = new AuditLogger();

// Custom validation error handler for records API
export function handleRecordsValidationError(
  operation: string,
  errors: any[],
  req: any,
  res: any
): void {
  logger.warn(`${operation} validation failed`, {
    operation,
    validationErrors: errors,
    requestId: (req as any).requestId,
    userId: (req as any).user?.id,
    userRole: (req as any).user?.role,
  });

  res.status(400).json({
    success: false,
    error: {
      message: 'Invalid record data',
      details: errors,
    },
  });
}
