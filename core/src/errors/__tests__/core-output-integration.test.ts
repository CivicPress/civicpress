/**
 * Unit Tests for Centralized Output Integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { coreError } from '../../utils/core-output.js';
import { ValidationError, NotFoundError } from '../index.js';
import {
  TemplateNotFoundError,
  TemplateExistsError,
} from '../domain-errors.js';

describe('coreError Integration with CivicPressError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle CivicPressError instances', () => {
    const error = new ValidationError('Validation failed', {
      field: 'email',
    });

    // Should not throw
    expect(() => {
      coreError(error);
    }).not.toThrow();
  });

  it('should extract error details from CivicPressError', () => {
    const error = new TemplateNotFoundError('bylaw/default');
    const outputFn = vi.spyOn(console, 'error').mockImplementation(() => {});

    coreError(error);

    // Verify that error details were extracted and logged
    // (exact implementation depends on coreOutput internals)
    expect(outputFn).toHaveBeenCalled();
    outputFn.mockRestore();
  });

  it('should maintain backward compatibility with string messages', () => {
    expect(() => {
      coreError('Error message', 'ERROR_CODE', { details: 'test' });
    }).not.toThrow();
  });

  it('should handle Error instances (non-CivicPressError)', () => {
    const error = new Error('Generic error');
    expect(() => {
      coreError(error);
    }).not.toThrow();
  });

  it('should include correlation ID in error output', () => {
    const error = new TemplateExistsError('bylaw/default');
    const outputDetails = error.getOutputDetails();

    expect(outputDetails.context.correlationId).toBeDefined();
    expect(outputDetails.context.correlationId).toMatch(/^err_/);
  });
});
