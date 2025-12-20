/**
 * Domain-Specific Errors
 *
 * Errors specific to CivicPress domains (records, templates, geography, etc.)
 * These extend the base error classes to provide domain-specific context.
 */

import {
  CivicPressError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from './index.js';

/**
 * Record Domain Errors
 */

export class RecordNotFoundError extends NotFoundError {
  override code = 'RECORD_NOT_FOUND';

  constructor(recordId: string) {
    super(`Record '${recordId}' not found`, recordId);
  }
}

export class RecordValidationError extends ValidationError {
  override code = 'RECORD_VALIDATION_ERROR';

  constructor(message: string, details: any) {
    super(message, details);
  }
}

export class RecordConflictError extends ConflictError {
  override code = 'RECORD_CONFLICT';

  constructor(message: string, recordId?: string) {
    super(message, recordId);
  }
}

/**
 * Template Domain Errors
 */

export class TemplateNotFoundError extends NotFoundError {
  override code = 'TEMPLATE_NOT_FOUND';

  constructor(templateId: string) {
    super(`Template '${templateId}' not found`, templateId);
  }
}

export class TemplateExistsError extends ConflictError {
  override code = 'TEMPLATE_EXISTS';

  constructor(templateId: string) {
    super(`Template '${templateId}' already exists`, templateId);
  }
}

export class TemplateValidationError extends ValidationError {
  override code = 'TEMPLATE_VALIDATION_ERROR';

  constructor(message: string, details: any) {
    super(message, details);
  }
}

export class TemplateInvalidError extends ValidationError {
  override code = 'TEMPLATE_INVALID';

  constructor(message: string, details?: any) {
    super(message, details);
  }
}

export class TemplateSystemError extends ForbiddenError {
  override code = 'TEMPLATE_SYSTEM_ERROR';

  constructor(templateId: string) {
    super(
      `Template '${templateId}' is a system template and cannot be modified`,
      templateId
    );
  }
}

/**
 * Geography Domain Errors
 */

export class GeographyNotFoundError extends NotFoundError {
  override code = 'GEOGRAPHY_NOT_FOUND';

  constructor(geographyId: string) {
    super(`Geography '${geographyId}' not found`, geographyId);
  }
}

export class GeographyValidationError extends ValidationError {
  override code = 'GEOGRAPHY_VALIDATION_ERROR';

  constructor(message: string, validationResult?: any) {
    super(message, validationResult);
  }
}

/**
 * Authentication Domain Errors
 */

export class AuthenticationFailedError extends UnauthorizedError {
  override code = 'AUTHENTICATION_FAILED';

  constructor(message: string = 'Authentication failed', username?: string) {
    super(message);
    if (username) {
      this.context = { username };
    }
  }
}

export class AuthorizationFailedError extends ForbiddenError {
  override code = 'AUTHORIZATION_FAILED';

  constructor(
    message: string = 'Insufficient permissions',
    resource?: string,
    requiredPermission?: string
  ) {
    super(message, resource);
    if (requiredPermission) {
      this.context = {
        ...this.context,
        requiredPermission,
      };
    }
  }
}

export class SessionExpiredError extends UnauthorizedError {
  override code = 'SESSION_EXPIRED';

  constructor(message: string = 'Session has expired') {
    super(message);
  }
}

/**
 * Git Domain Errors
 */

export class GitError extends CivicPressError {
  code = 'GIT_ERROR';
  statusCode = 500;

  constructor(message: string, operation?: string, details?: any) {
    super(message, {
      operation,
      ...(details && { details }),
    });
  }
}

export class GitConflictError extends ConflictError {
  override code = 'GIT_CONFLICT';

  constructor(message: string, filePath?: string) {
    super(message);
    if (filePath) {
      this.context = {
        ...this.context,
        filePath,
      };
    }
  }
}

/**
 * Workflow Domain Errors
 */

export class WorkflowError extends CivicPressError {
  code = 'WORKFLOW_ERROR';
  statusCode = 400;

  constructor(message: string, workflowId?: string, details?: any) {
    super(message, {
      ...(workflowId && { workflowId }),
      ...(details && { details }),
    });
  }
}

export class WorkflowTransitionError extends ValidationError {
  override code = 'WORKFLOW_TRANSITION_ERROR';

  constructor(message: string, currentStatus?: string, targetStatus?: string) {
    super(message, {
      currentStatus,
      targetStatus,
    });
  }
}
