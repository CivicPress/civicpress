/**
 * Unit Tests for Error Hierarchy
 */

import { describe, it, expect } from 'vitest';
import {
  CivicPressError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  DatabaseError,
  FileSystemError,
  InternalError,
} from '../index.js';

describe('CivicPressError', () => {
  it('should create error with correlation ID', () => {
    class TestError extends CivicPressError {
      code = 'TEST_ERROR';
      statusCode = 500;
    }

    const error = new TestError('Test message');
    expect(error.correlationId).toBeDefined();
    expect(error.correlationId).toMatch(/^err_/);
    expect(error.message).toBe('Test message');
    expect(error.name).toBe('TestError');
  });

  it('should include context in error', () => {
    class TestError extends CivicPressError {
      code = 'TEST_ERROR';
      statusCode = 500;
    }

    const error = new TestError('Test message', { key: 'value' });
    expect(error.context).toEqual({ key: 'value' });
  });

  it('should serialize to JSON', () => {
    class TestError extends CivicPressError {
      code = 'TEST_ERROR';
      statusCode = 500;
    }

    const error = new TestError('Test message', { key: 'value' });
    const json = error.toJSON();

    expect(json).toMatchObject({
      name: 'TestError',
      code: 'TEST_ERROR',
      message: 'Test message',
      statusCode: 500,
      context: { key: 'value' },
      correlationId: expect.any(String),
    });
  });

  it('should provide output details for centralized output', () => {
    class TestError extends CivicPressError {
      code = 'TEST_ERROR';
      statusCode = 500;
    }

    const error = new TestError('Test message', { key: 'value' });
    const details = error.getOutputDetails();

    expect(details).toMatchObject({
      message: 'Test message',
      code: 'TEST_ERROR',
      details: { key: 'value' },
      context: {
        key: 'value',
        correlationId: expect.any(String),
        errorType: 'TestError',
        statusCode: 500,
      },
    });
  });
});

describe('ValidationError', () => {
  it('should have correct code and status code', () => {
    const error = new ValidationError('Validation failed');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
  });

  it('should include details in context', () => {
    const error = new ValidationError('Validation failed', {
      field: 'email',
      reason: 'invalid format',
    });
    expect(error.context?.details).toEqual({
      field: 'email',
      reason: 'invalid format',
    });
  });
});

describe('NotFoundError', () => {
  it('should have correct code and status code', () => {
    const error = new NotFoundError('Resource not found');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.statusCode).toBe(404);
  });

  it('should include resourceId in context', () => {
    const error = new NotFoundError('Resource not found', 'resource-123');
    expect(error.context?.resourceId).toBe('resource-123');
  });
});

describe('UnauthorizedError', () => {
  it('should have correct code and status code', () => {
    const error = new UnauthorizedError();
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.statusCode).toBe(401);
  });

  it('should use default message', () => {
    const error = new UnauthorizedError();
    expect(error.message).toBe('Authentication required');
  });
});

describe('ForbiddenError', () => {
  it('should have correct code and status code', () => {
    const error = new ForbiddenError();
    expect(error.code).toBe('FORBIDDEN');
    expect(error.statusCode).toBe(403);
  });

  it('should include resource in context', () => {
    const error = new ForbiddenError('Access denied', 'record-123');
    expect(error.context?.resource).toBe('record-123');
  });
});

describe('ConflictError', () => {
  it('should have correct code and status code', () => {
    const error = new ConflictError('Resource conflict');
    expect(error.code).toBe('CONFLICT');
    expect(error.statusCode).toBe(409);
  });

  it('should include resourceId in context', () => {
    const error = new ConflictError('Resource conflict', 'resource-123');
    expect(error.context?.resourceId).toBe('resource-123');
  });
});

describe('DatabaseError', () => {
  it('should have correct code and status code', () => {
    const error = new DatabaseError('Database operation failed');
    expect(error.code).toBe('DATABASE_ERROR');
    expect(error.statusCode).toBe(500);
  });

  it('should include operation in context', () => {
    const error = new DatabaseError('Database operation failed', 'SELECT');
    expect(error.context?.operation).toBe('SELECT');
  });
});

describe('FileSystemError', () => {
  it('should have correct code and status code', () => {
    const error = new FileSystemError('File operation failed');
    expect(error.code).toBe('FILE_SYSTEM_ERROR');
    expect(error.statusCode).toBe(500);
  });

  it('should include path and operation in context', () => {
    const error = new FileSystemError(
      'File operation failed',
      '/path/to/file',
      'read'
    );
    expect(error.context?.path).toBe('/path/to/file');
    expect(error.context?.operation).toBe('read');
  });
});

describe('InternalError', () => {
  it('should have correct code and status code', () => {
    const error = new InternalError('Internal error occurred');
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.statusCode).toBe(500);
  });

  it('should include context', () => {
    const error = new InternalError('Internal error', { component: 'test' });
    expect(error.context?.component).toBe('test');
  });
});
