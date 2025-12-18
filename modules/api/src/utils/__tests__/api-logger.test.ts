/**
 * Unit Tests for API Logger Error Handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { ApiLogger } from '../api-logger.js';
import {
  ValidationError,
  NotFoundError,
  TemplateNotFoundError,
  RecordValidationError,
} from '@civicpress/core';

describe('ApiLogger - Error Handling', () => {
  let apiLogger: ApiLogger;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    apiLogger = ApiLogger.getInstance();
    mockRequest = {
      method: 'GET',
      path: '/api/v1/test',
      ip: '127.0.0.1',
      get: vi.fn(),
      connection: {
        remoteAddress: '127.0.0.1',
      } as any,
    } as Partial<Request>;

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      statusCode: 200,
    } as Partial<Response>;
  });

  describe('logError', () => {
    it('should log CivicPressError with correlation ID', () => {
      const error = new ValidationError('Test error', { field: 'test' });
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      apiLogger.logError('test_operation', error, mockRequest as Request);

      expect(consoleSpy).toHaveBeenCalled();
      // Note: Actual logging implementation may vary, this tests the function doesn't throw
      consoleSpy.mockRestore();
    });

    it('should log generic Error without correlation ID', () => {
      const error = new Error('Generic error');
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      apiLogger.logError('test_operation', error, mockRequest as Request);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response from CivicPressError', () => {
      const error = new TemplateNotFoundError('bylaw/default');
      const response = apiLogger.createErrorResponse(
        error,
        mockRequest as Request,
        'Default message'
      );

      expect(response.statusCode).toBe(404);
      expect(response.success).toBe(false);
      expect(response.error).toMatchObject({
        message: "Template 'bylaw/default' not found",
        code: 'TEMPLATE_NOT_FOUND',
        correlationId: error.correlationId,
      });
    });

    it('should create error response from Error with statusCode', () => {
      const error = new Error('Test error') as any;
      error.statusCode = 400;
      error.code = 'TEST_ERROR';

      const response = apiLogger.createErrorResponse(
        error,
        mockRequest as Request,
        'Default message'
      );

      expect(response.statusCode).toBe(400);
      expect(response.success).toBe(false);
      expect(response.error).toMatchObject({
        message: 'Test error',
        code: 'TEST_ERROR',
      });
    });

    it('should create default error response for unknown errors', () => {
      const error = 'String error';
      const response = apiLogger.createErrorResponse(
        error,
        mockRequest as Request,
        'Default message'
      );

      expect(response.statusCode).toBe(500);
      expect(response.success).toBe(false);
      expect(response.error.message).toBe('Default message');
    });

    it('should include error details in response', () => {
      const error = new RecordValidationError('Validation failed', {
        field: 'title',
        reason: 'required',
      });
      const response = apiLogger.createErrorResponse(
        error,
        mockRequest as Request,
        'Default message'
      );

      expect(response.error.details).toBeDefined();
    });
  });

  describe('handleError', () => {
    it('should handle CivicPressError and send response', () => {
      const error = new NotFoundError('Resource not found');
      apiLogger.handleError(
        'test_operation',
        error,
        mockRequest as Request,
        mockResponse as Response,
        'Default message'
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Resource not found',
            code: 'NOT_FOUND',
            correlationId: error.correlationId,
          }),
        })
      );
    });

    it('should use default message for unknown errors', () => {
      const error = 'String error';
      apiLogger.handleError(
        'test_operation',
        error,
        mockRequest as Request,
        mockResponse as Response,
        'Default message'
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Default message',
          }),
        })
      );
    });
  });
});
