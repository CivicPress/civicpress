/**
 * Unit Tests for Error Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  isCivicPressError,
  getErrorCode,
  getStatusCode,
  getCorrelationId,
  normalizeError,
  reportError,
} from '../utils.js';
import {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  InternalError,
  CivicPressError,
} from '../index.js';

describe('isCivicPressError', () => {
  it('should return true for CivicPressError instances', () => {
    const error = new ValidationError('Test');
    expect(isCivicPressError(error)).toBe(true);
  });

  it('should return false for generic Error', () => {
    const error = new Error('Test');
    expect(isCivicPressError(error)).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isCivicPressError(null)).toBe(false);
    expect(isCivicPressError(undefined)).toBe(false);
    expect(isCivicPressError('string')).toBe(false);
    expect(isCivicPressError(123)).toBe(false);
  });
});

describe('getErrorCode', () => {
  it('should extract code from CivicPressError', () => {
    const error = new ValidationError('Test');
    expect(getErrorCode(error)).toBe('VALIDATION_ERROR');
  });

  it('should extract code from Error with code property', () => {
    const error = new Error('Test') as any;
    error.code = 'CUSTOM_ERROR';
    expect(getErrorCode(error)).toBe('CUSTOM_ERROR');
  });

  it('should return default code for unknown errors', () => {
    const error = new Error('Test');
    expect(getErrorCode(error)).toBe('INTERNAL_ERROR');
  });
});

describe('getStatusCode', () => {
  it('should extract status code from CivicPressError', () => {
    const error = new ValidationError('Test');
    expect(getStatusCode(error)).toBe(400);
  });

  it('should extract status code from Error with statusCode property', () => {
    const error = new Error('Test') as any;
    error.statusCode = 404;
    expect(getStatusCode(error)).toBe(404);
  });

  it('should return 500 for unknown errors', () => {
    const error = new Error('Test');
    expect(getStatusCode(error)).toBe(500);
  });
});

describe('getCorrelationId', () => {
  it('should extract correlation ID from CivicPressError', () => {
    const error = new ValidationError('Test');
    const correlationId = getCorrelationId(error);
    expect(correlationId).toBeDefined();
    expect(correlationId).toMatch(/^err_/);
  });

  it('should return undefined for non-CivicPressError', () => {
    const error = new Error('Test');
    expect(getCorrelationId(error)).toBeUndefined();
  });
});

describe('normalizeError', () => {
  it('should return CivicPressError as-is', () => {
    const error = new ValidationError('Test');
    const normalized = normalizeError(error);
    expect(normalized).toBe(error);
  });

  it('should normalize Error with statusCode 400 to ValidationError', () => {
    const error = new Error('Validation failed') as any;
    error.statusCode = 400;
    const normalized = normalizeError(error);
    expect(normalized).toBeInstanceOf(ValidationError);
    expect(normalized.statusCode).toBe(400);
  });

  it('should normalize Error with statusCode 404 to NotFoundError', () => {
    const error = new Error('Not found') as any;
    error.statusCode = 404;
    const normalized = normalizeError(error);
    expect(normalized).toBeInstanceOf(NotFoundError);
    expect(normalized.statusCode).toBe(404);
  });

  it('should normalize Error with statusCode 401 to UnauthorizedError', () => {
    const error = new Error('Unauthorized') as any;
    error.statusCode = 401;
    const normalized = normalizeError(error);
    expect(normalized).toBeInstanceOf(UnauthorizedError);
    expect(normalized.statusCode).toBe(401);
  });

  it('should normalize Error with statusCode 403 to ForbiddenError', () => {
    const error = new Error('Forbidden') as any;
    error.statusCode = 403;
    const normalized = normalizeError(error);
    expect(normalized).toBeInstanceOf(ForbiddenError);
    expect(normalized.statusCode).toBe(403);
  });

  it('should normalize Error with statusCode 409 to ConflictError', () => {
    const error = new Error('Conflict') as any;
    error.statusCode = 409;
    const normalized = normalizeError(error);
    expect(normalized).toBeInstanceOf(ConflictError);
    expect(normalized.statusCode).toBe(409);
  });

  it('should normalize unknown Error to InternalError', () => {
    const error = new Error('Unknown error');
    const normalized = normalizeError(error);
    expect(normalized).toBeInstanceOf(InternalError);
    expect(normalized.statusCode).toBe(500);
  });

  it('should normalize non-Error values to InternalError', () => {
    const normalized = normalizeError('string error');
    expect(normalized).toBeInstanceOf(InternalError);
    expect(normalized.message).toBe('An unexpected error occurred');
    expect(normalized.context?.originalError).toBe('string error');
  });

  it('should use custom default message', () => {
    const normalized = normalizeError(null, 'Custom message');
    expect(normalized.message).toBe('Custom message');
  });
});

describe('reportError', () => {
  it('should call output function with CivicPressError details', () => {
    const error = new ValidationError('Validation failed', {
      field: 'email',
    });
    const outputFn = vi.fn();

    reportError(error, outputFn, 'test-operation');

    expect(outputFn).toHaveBeenCalledWith(
      'Validation failed',
      'VALIDATION_ERROR',
      { field: 'email' },
      expect.objectContaining({
        correlationId: expect.any(String),
        errorType: 'ValidationError',
        statusCode: 400,
        operation: 'test-operation',
        details: { field: 'email' },
      })
    );
  });

  it('should normalize and report unknown errors', () => {
    const error = new Error('Unknown error');
    const outputFn = vi.fn();

    reportError(error, outputFn, 'test-operation');

    expect(outputFn).toHaveBeenCalled();
    const call = outputFn.mock.calls[0];
    expect(call[0]).toBe('Unknown error');
    expect(call[1]).toBe('INTERNAL_ERROR');
    expect(call[3]).toMatchObject({
      operation: 'test-operation',
      correlationId: expect.any(String),
    });
  });

  it('should work without operation parameter', () => {
    const error = new ValidationError('Test');
    const outputFn = vi.fn();

    reportError(error, outputFn);

    expect(outputFn).toHaveBeenCalled();
    const call = outputFn.mock.calls[0];
    expect(call[3]).not.toHaveProperty('operation');
  });
});
