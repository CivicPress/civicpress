/**
 * Unit Tests for Domain-Specific Errors
 */

import { describe, it, expect } from 'vitest';
import {
  RecordNotFoundError,
  RecordValidationError,
  RecordConflictError,
  TemplateNotFoundError,
  TemplateExistsError,
  TemplateValidationError,
  TemplateInvalidError,
  TemplateSystemError,
  GeographyNotFoundError,
  GeographyValidationError,
  AuthenticationFailedError,
  AuthorizationFailedError,
  SessionExpiredError,
  GitError,
  GitConflictError,
  WorkflowError,
  WorkflowTransitionError,
} from '../domain-errors.js';

describe('Record Domain Errors', () => {
  it('should create RecordNotFoundError', () => {
    const error = new RecordNotFoundError('record-123');
    expect(error.code).toBe('RECORD_NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe("Record 'record-123' not found");
    expect(error.context?.resourceId).toBe('record-123');
  });

  it('should create RecordValidationError', () => {
    const details = { field: 'title', reason: 'required' };
    const error = new RecordValidationError('Validation failed', details);
    expect(error.code).toBe('RECORD_VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.context?.details).toEqual(details);
  });

  it('should create RecordConflictError', () => {
    const error = new RecordConflictError('Record conflict', 'record-123');
    expect(error.code).toBe('RECORD_CONFLICT');
    expect(error.statusCode).toBe(409);
    expect(error.context?.resourceId).toBe('record-123');
  });
});

describe('Template Domain Errors', () => {
  it('should create TemplateNotFoundError', () => {
    const error = new TemplateNotFoundError('bylaw/default');
    expect(error.code).toBe('TEMPLATE_NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe("Template 'bylaw/default' not found");
    expect(error.context?.resourceId).toBe('bylaw/default');
  });

  it('should create TemplateExistsError', () => {
    const error = new TemplateExistsError('bylaw/default');
    expect(error.code).toBe('TEMPLATE_EXISTS');
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe("Template 'bylaw/default' already exists");
    expect(error.context?.resourceId).toBe('bylaw/default');
  });

  it('should create TemplateValidationError', () => {
    const details = { field: 'content', reason: 'missing' };
    const error = new TemplateValidationError('Validation failed', details);
    expect(error.code).toBe('TEMPLATE_VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.context?.details).toEqual(details);
  });

  it('should create TemplateInvalidError', () => {
    const error = new TemplateInvalidError('Invalid template structure');
    expect(error.code).toBe('TEMPLATE_INVALID');
    expect(error.statusCode).toBe(400);
  });

  it('should create TemplateSystemError', () => {
    const error = new TemplateSystemError('bylaw/default');
    expect(error.code).toBe('TEMPLATE_SYSTEM_ERROR');
    expect(error.statusCode).toBe(403);
    expect(error.context?.resource).toBe('bylaw/default');
  });
});

describe('Geography Domain Errors', () => {
  it('should create GeographyNotFoundError', () => {
    const error = new GeographyNotFoundError('geo-123');
    expect(error.code).toBe('GEOGRAPHY_NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe("Geography 'geo-123' not found");
    expect(error.context?.resourceId).toBe('geo-123');
  });

  it('should create GeographyValidationError', () => {
    const validationResult = { valid: false, errors: ['Invalid format'] };
    const error = new GeographyValidationError(
      'Validation failed',
      validationResult
    );
    expect(error.code).toBe('GEOGRAPHY_VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.context?.details).toEqual(validationResult);
  });
});

describe('Authentication Domain Errors', () => {
  it('should create AuthenticationFailedError', () => {
    const error = new AuthenticationFailedError('Invalid credentials', 'user1');
    expect(error.code).toBe('AUTHENTICATION_FAILED');
    expect(error.statusCode).toBe(401);
    expect(error.context?.username).toBe('user1');
  });

  it('should create AuthorizationFailedError', () => {
    const error = new AuthorizationFailedError(
      'Access denied',
      'record-123',
      'records:edit'
    );
    expect(error.code).toBe('AUTHORIZATION_FAILED');
    expect(error.statusCode).toBe(403);
    expect(error.context?.resource).toBe('record-123');
    expect(error.context?.requiredPermission).toBe('records:edit');
  });

  it('should create SessionExpiredError', () => {
    const error = new SessionExpiredError();
    expect(error.code).toBe('SESSION_EXPIRED');
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Session has expired');
  });
});

describe('Git Domain Errors', () => {
  it('should create GitError', () => {
    const error = new GitError('Git operation failed', 'commit', {
      details: 'merge conflict',
    });
    expect(error.code).toBe('GIT_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.context?.operation).toBe('commit');
    expect(error.context?.details).toEqual({ details: 'merge conflict' });
  });

  it('should create GitConflictError', () => {
    const error = new GitConflictError('Merge conflict', 'file.md');
    expect(error.code).toBe('GIT_CONFLICT');
    expect(error.statusCode).toBe(409);
    expect(error.context?.filePath).toBe('file.md');
  });
});

describe('Workflow Domain Errors', () => {
  it('should create WorkflowError', () => {
    const error = new WorkflowError('Workflow failed', 'workflow-123', {
      step: 'approval',
    });
    expect(error.code).toBe('WORKFLOW_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.context?.workflowId).toBe('workflow-123');
    expect(error.context?.details).toEqual({ step: 'approval' });
  });

  it('should create WorkflowTransitionError', () => {
    const error = new WorkflowTransitionError(
      'Invalid transition',
      'draft',
      'published'
    );
    expect(error.code).toBe('WORKFLOW_TRANSITION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.context?.details).toEqual({
      currentStatus: 'draft',
      targetStatus: 'published',
    });
  });
});
