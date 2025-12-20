/**
 * Unit Tests for API Error Handler Middleware
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { errorHandler, categorizeError } from '../error-handler.js';
import {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  InternalError,
  TemplateNotFoundError,
  RecordValidationError,
} from '@civicpress/core';

describe('categorizeError', () => {
  it('should categorize ValidationError correctly', () => {
    const error = new ValidationError('Test validation error');
    const result = categorizeError(error);
    expect(result.category).toBe('validation');
    expect(result.severity).toBe('low');
    expect(result.actionable).toBe(true);
  });

  it('should categorize NotFoundError correctly', () => {
    const error = new NotFoundError('Resource not found');
    const result = categorizeError(error);
    expect(result.category).toBe('not_found');
    expect(result.severity).toBe('low');
    expect(result.actionable).toBe(true);
  });

  it('should categorize UnauthorizedError correctly', () => {
    const error = new UnauthorizedError('Unauthorized');
    const result = categorizeError(error);
    expect(result.category).toBe('authentication');
    expect(result.severity).toBe('medium');
    expect(result.actionable).toBe(true);
  });

  it('should categorize ForbiddenError correctly', () => {
    const error = new ForbiddenError('Forbidden');
    const result = categorizeError(error);
    expect(result.category).toBe('authorization');
    expect(result.severity).toBe('medium');
    expect(result.actionable).toBe(true);
  });

  it('should categorize ConflictError correctly', () => {
    const error = new ConflictError('Conflict');
    const result = categorizeError(error);
    expect(result.category).toBe('conflict');
    expect(result.severity).toBe('medium');
    expect(result.actionable).toBe(true);
  });

  it('should categorize domain-specific errors correctly', () => {
    const error = new TemplateNotFoundError('bylaw/default');
    const result = categorizeError(error);
    expect(result.category).toBe('not_found');
    expect(result.severity).toBe('low');
    expect(result.actionable).toBe(true);
  });

  it('should categorize InternalError with 500 status as system error', () => {
    const error = new InternalError('Internal error');
    const result = categorizeError(error);
    expect(result.category).toBe('system');
    expect(result.severity).toBe('high');
    expect(result.actionable).toBe(false);
  });

  it('should fallback to name-based categorization for non-CivicPressError', () => {
    const error = new Error('Generic error') as any;
    error.name = 'ValidationError';
    const result = categorizeError(error);
    expect(result.category).toBe('validation');
  });
});

describe('errorHandler', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: any;

  beforeEach(() => {
    mockRequest = {
      ip: '127.0.0.1',
      method: 'GET',
      path: '/api/v1/test',
      query: {},
      get: vi.fn((header: string) => {
        if (header === 'User-Agent') return 'test-agent';
        if (header === 'Authorization') return 'Bearer token';
        return undefined;
      }),
      connection: {
        remoteAddress: '127.0.0.1',
      } as any,
    } as Partial<Request>;

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
    } as Partial<Response>;

    mockNext = vi.fn();
  });

  it('should handle CivicPressError with correlation ID', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development'; // Ensure we get the actual error message
      const error = new ValidationError('Test error', { field: 'test' });
      errorHandler(
        error as any,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      const callArgs = (mockResponse.json as any).mock.calls[0][0];
      expect(callArgs.success).toBe(false);
      expect(callArgs.error.message).toBe('Test error');
      expect(callArgs.error.code).toBe('VALIDATION_ERROR');
      expect(callArgs.error.correlationId).toBe(error.correlationId);
      expect(callArgs.requestId).toBeDefined();
      expect(callArgs.path).toBe('/api/v1/test');
      expect(callArgs.method).toBe('GET');
      expect(callArgs.timestamp).toBeDefined();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('should handle NotFoundError correctly', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development'; // Ensure we get the actual error message
      const error = new NotFoundError('Resource not found');
      errorHandler(
        error as any,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      const callArgs = (mockResponse.json as any).mock.calls[0][0];
      expect(callArgs.success).toBe(false);
      expect(callArgs.error.message).toBe('Resource not found');
      expect(callArgs.error.code).toBe('NOT_FOUND');
      expect(callArgs.error.correlationId).toBe(error.correlationId);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('should handle domain-specific errors correctly', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development'; // Ensure we get the actual error message
      const error = new TemplateNotFoundError('bylaw/default');
      errorHandler(
        error as any,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      const callArgs = (mockResponse.json as any).mock.calls[0][0];
      expect(callArgs.success).toBe(false);
      expect(callArgs.error.message).toBe("Template 'bylaw/default' not found");
      expect(callArgs.error.code).toBe('TEMPLATE_NOT_FOUND');
      expect(callArgs.error.correlationId).toBe(error.correlationId);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('should handle ApiError (legacy) correctly', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development'; // Ensure we get the actual error message
      const error = {
        name: 'ApiError',
        message: 'Legacy error',
        statusCode: 400,
        code: 'LEGACY_ERROR',
        context: { test: true },
      } as any;

      errorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      const callArgs = (mockResponse.json as any).mock.calls[0][0];
      expect(callArgs.success).toBe(false);
      expect(callArgs.error.message).toBe('Legacy error');
      expect(callArgs.error.code).toBe('LEGACY_ERROR');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('should include error details in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';

      const error = new ValidationError('Test error', { field: 'test' });
      errorHandler(
        error as any,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const callArgs = (mockResponse.json as any).mock.calls[0][0];
      expect(callArgs.error.stack).toBeDefined();
      // The error context is passed as the details property
      // ValidationError wraps context in a 'details' property
      expect(callArgs.error.details).toBeDefined();
      expect(callArgs.error.details.details).toBeDefined();
      expect(callArgs.error.details.details.field).toBe('test');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('should not include error details in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';

      const error = new InternalError('Internal error');
      errorHandler(
        error as any,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const callArgs = (mockResponse.json as any).mock.calls[0][0];
      expect(callArgs.error.stack).toBeUndefined();
      expect(callArgs.error.message).toBe('Internal Server Error');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('should include request context in error response', () => {
    const error = new ValidationError('Test error');
    errorHandler(
      error as any,
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: expect.any(String),
        timestamp: expect.any(String),
        path: '/api/v1/test',
        method: 'GET',
      })
    );
  });
});
