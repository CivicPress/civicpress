/**
 * Unit Tests for API Response Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  extractErrorMessage,
  extractCorrelationId,
  extractErrorCode,
  validateApiResponse,
  safeExtractData,
  isValidApiResponse,
} from '../api-response';

describe('extractErrorMessage', () => {
  it('should extract message from response.error', () => {
    const response = {
      error: {
        message: 'Test error message',
      },
    };
    expect(extractErrorMessage(response)).toBe('Test error message');
  });

  it('should extract message from response.data.error', () => {
    const response = {
      data: {
        error: {
          message: 'Nested error message',
        },
      },
    };
    expect(extractErrorMessage(response)).toBe('Nested error message');
  });

  it('should extract message from response.message', () => {
    const response = {
      message: 'Direct message',
    };
    expect(extractErrorMessage(response)).toBe('Direct message');
  });

  it('should return default message when no error found', () => {
    const response = {};
    expect(extractErrorMessage(response, 'Default')).toBe('Default');
  });

  it('should handle null/undefined responses', () => {
    expect(extractErrorMessage(null, 'Default')).toBe('Default');
    expect(extractErrorMessage(undefined, 'Default')).toBe('Default');
  });
});

describe('extractCorrelationId', () => {
  it('should extract correlation ID from response.error', () => {
    const response = {
      error: {
        correlationId: 'err_12345',
      },
    };
    expect(extractCorrelationId(response)).toBe('err_12345');
  });

  it('should extract correlation ID from response.data.error', () => {
    const response = {
      data: {
        error: {
          correlationId: 'err_45678',
        },
      },
    };
    expect(extractCorrelationId(response)).toBe('err_45678');
  });

  it('should extract correlation ID from response.correlationId', () => {
    const response = {
      correlationId: 'err_99999',
    };
    expect(extractCorrelationId(response)).toBe('err_99999');
  });

  it('should return undefined when no correlation ID found', () => {
    const response = {};
    expect(extractCorrelationId(response)).toBeUndefined();
  });

  it('should handle null/undefined responses', () => {
    expect(extractCorrelationId(null)).toBeUndefined();
    expect(extractCorrelationId(undefined)).toBeUndefined();
  });
});

describe('extractErrorCode', () => {
  it('should extract error code from response.error', () => {
    const response = {
      error: {
        code: 'VALIDATION_ERROR',
      },
    };
    expect(extractErrorCode(response)).toBe('VALIDATION_ERROR');
  });

  it('should extract error code from response.data.error', () => {
    const response = {
      data: {
        error: {
          code: 'NOT_FOUND',
        },
      },
    };
    expect(extractErrorCode(response)).toBe('NOT_FOUND');
  });

  it('should extract error code from response.code', () => {
    const response = {
      code: 'INTERNAL_ERROR',
    };
    expect(extractErrorCode(response)).toBe('INTERNAL_ERROR');
  });

  it('should return undefined when no error code found', () => {
    const response = {};
    expect(extractErrorCode(response)).toBeUndefined();
  });

  it('should handle null/undefined responses', () => {
    expect(extractErrorCode(null)).toBeUndefined();
    expect(extractErrorCode(undefined)).toBeUndefined();
  });
});

describe('validateApiResponse', () => {
  it('should validate successful response', () => {
    const response = {
      success: true,
      data: { id: 1, name: 'Test' },
    };
    const result = validateApiResponse(response);
    expect(result).toEqual({ id: 1, name: 'Test' });
  });

  it('should validate response with required fields', () => {
    const response = {
      success: true,
      data: { id: 1, name: 'Test', email: 'test@example.com' },
    };
    const result = validateApiResponse(response, ['id', 'name']);
    expect(result).toEqual({ id: 1, name: 'Test', email: 'test@example.com' });
  });

  it('should throw error for missing required fields', () => {
    const response = {
      success: true,
      data: { id: 1 },
    };
    expect(() => validateApiResponse(response, ['id', 'name'])).toThrow(
      'Missing required field: name'
    );
  });

  it('should throw error for error response', () => {
    const response = {
      error: {
        message: 'API error',
      },
    };
    expect(() => validateApiResponse(response)).toThrow('API error');
  });

  it('should throw error for invalid response format', () => {
    const response = {
      data: { id: 1 },
    };
    expect(() => validateApiResponse(response)).toThrow(
      'Invalid API response format'
    );
  });
});

describe('safeExtractData', () => {
  it('should extract data from valid response', () => {
    const response = {
      success: true,
      data: { id: 1 },
    };
    const result = safeExtractData(response, { id: 0 });
    expect(result).toEqual({ id: 1 });
  });

  it('should return default value for invalid response', () => {
    const response = {
      invalid: true,
    };
    const defaultValue = { id: 0 };
    const result = safeExtractData(response, defaultValue);
    expect(result).toEqual(defaultValue);
  });
});

describe('isValidApiResponse', () => {
  it('should return true for valid response', () => {
    const response = {
      success: true,
      data: {},
    };
    expect(isValidApiResponse(response)).toBe(true);
  });

  it('should return true for error response', () => {
    const response = {
      success: false,
      error: { message: 'Error' },
    };
    expect(isValidApiResponse(response)).toBe(true);
  });

  it('should return false for invalid response', () => {
    const response = {
      data: {},
    };
    expect(isValidApiResponse(response)).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(isValidApiResponse(null)).toBe(false);
    expect(isValidApiResponse(undefined)).toBe(false);
  });
});
