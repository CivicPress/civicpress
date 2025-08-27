import { Request, Response } from 'express';
import { Logger } from '@civicpress/core';

const logger = new Logger();

export interface StorageSuccessResponse {
  success: boolean;
  data: any;
  message?: string;
  timestamp: string;
}

export interface StorageErrorResponse {
  success: boolean;
  error: {
    message: string;
    code: string;
    details?: any;
  };
  timestamp: string;
}

/**
 * Handle successful storage operations
 */
export const handleStorageSuccess = (
  operation: string,
  data: any,
  req: Request,
  res: Response,
  message?: string
): Response => {
  const response: StorageSuccessResponse = {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
  };

  logger.info(`Storage operation '${operation}' completed successfully`, {
    operation,
    user: (req as any).user?.id,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  return res.status(200).json(response);
};

/**
 * Handle storage operation errors
 */
export const handleStorageError = (
  operation: string,
  error: Error,
  req: Request,
  res: Response,
  statusCode: number = 500
): Response => {
  const errorCode = getStorageErrorCode(error);

  const response: StorageErrorResponse = {
    success: false,
    error: {
      message: error.message || 'Storage operation failed',
      code: errorCode,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    },
    timestamp: new Date().toISOString(),
  };

  logger.error(`Storage operation '${operation}' failed`, {
    operation,
    error: error.message,
    code: errorCode,
    user: (req as any).user?.id,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    stack: error.stack,
  });

  return res.status(statusCode).json(response);
};

/**
 * Handle storage validation errors
 */
export const handleStorageValidationError = (
  operation: string,
  errors: any[],
  req: Request,
  res: Response
): Response => {
  const response: StorageErrorResponse = {
    success: false,
    error: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors.map((err) => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value,
      })),
    },
    timestamp: new Date().toISOString(),
  };

  logger.warn(`Storage operation '${operation}' validation failed`, {
    operation,
    errors: errors.length,
    user: (req as any).user?.id,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  return res.status(400).json(response);
};

/**
 * Get appropriate error code for storage operations
 */
const getStorageErrorCode = (error: Error): string => {
  const message = error.message.toLowerCase();

  if (message.includes('not found')) return 'FILE_NOT_FOUND';
  if (message.includes('permission') || message.includes('access'))
    return 'ACCESS_DENIED';
  if (message.includes('size') || message.includes('limit'))
    return 'FILE_TOO_LARGE';
  if (message.includes('type') || message.includes('format'))
    return 'INVALID_FILE_TYPE';
  if (message.includes('quota') || message.includes('space'))
    return 'STORAGE_QUOTA_EXCEEDED';
  if (message.includes('network') || message.includes('connection'))
    return 'NETWORK_ERROR';
  if (message.includes('timeout')) return 'OPERATION_TIMEOUT';

  return 'STORAGE_ERROR';
};

/**
 * Handle file not found errors
 */
export const handleFileNotFound = (
  operation: string,
  filePath: string,
  req: Request,
  res: Response
): Response => {
  const error = new Error(`File not found: ${filePath}`);
  return handleStorageError(operation, error, req, res, 404);
};

/**
 * Handle access denied errors
 */
export const handleAccessDenied = (
  operation: string,
  resource: string,
  req: Request,
  res: Response
): Response => {
  const error = new Error(`Access denied to resource: ${resource}`);
  return handleStorageError(operation, error, req, res, 403);
};

/**
 * Handle file size limit errors
 */
export const handleFileTooLarge = (
  operation: string,
  fileSize: number,
  maxSize: number,
  req: Request,
  res: Response
): Response => {
  const error = new Error(
    `File size ${fileSize} bytes exceeds limit of ${maxSize} bytes`
  );
  return handleStorageError(operation, error, req, res, 413);
};

/**
 * Handle invalid file type errors
 */
export const handleInvalidFileType = (
  operation: string,
  fileType: string,
  allowedTypes: string[],
  req: Request,
  res: Response
): Response => {
  const error = new Error(
    `File type '${fileType}' not allowed. Allowed types: ${allowedTypes.join(', ')}`
  );
  return handleStorageError(operation, error, req, res, 400);
};
