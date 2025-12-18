# Unified Error Handling Implementation Plan

**Status:** ✅ Completed  
**Priority:** High  
**Effort:** Medium (2-3 weeks)  
**Impact:** High  
**Completed:** December 2024

---

## Executive Summary

This plan outlines the implementation of a unified error handling system across
CivicPress, replacing the current inconsistent error patterns with a type-safe,
hierarchical error system that provides better debugging, user experience, and
maintainability.

---

## Current State Analysis

### Existing Error Patterns

#### 1. **Core Services** (`core/src/`)

- **Pattern:** Generic `Error` objects with string messages
- **Example:**

  ```typescript
  throw new Error('Template already exists: ${templateId}');
  throw new Error('Type, name, and content are required');
  ```

- **Issues:**
  - No error codes
  - No status codes
  - No context metadata
  - No correlation IDs
  - Hard to handle programmatically

#### 2. **API Layer** (`modules/api/src/`)

- **Pattern:** `ApiError` interface with utility functions
- **Example:**

  ```typescript
  export interface ApiError extends Error {
    statusCode?: number;
    code?: string;
    context?: Record<string, any>;
  }

  createApiError(message, 400, 'VALIDATION_ERROR');
  ```

- **Issues:**
  - Not used in core services
  - Inconsistent usage across routes
  - No correlation IDs
  - String-based error categorization

#### 3. **Custom Errors** (Partial Implementation)

- **Geography Errors:** `GeographyError`, `GeographyValidationError`,
  `GeographyNotFoundError`
- **Pattern:** Custom classes extending `Error` with `code` property
- **Issues:**
  - Not part of unified hierarchy
  - Inconsistent with other errors
  - No status codes

#### 4. **UI Layer** (`modules/ui/`)

- **Pattern:** `useErrorHandler` composable with type detection
- **Issues:**
  - Relies on error shape detection (fragile)
  - No type safety
  - Inconsistent error codes

### Error Handling Locations

1. **Core Services:**
   - `core/src/records/record-manager.ts` - 2 errors
   - `core/src/records/record-parser.ts` - 4 errors
   - `core/src/templates/template-service.ts` - 15+ errors
   - `core/src/database/database-service.ts` - Various errors
   - `core/src/auth/auth-service.ts` - Various errors

2. **API Routes:**
   - All routes use `handleApiError()` but with inconsistent error types
   - Manual error type detection (e.g.,
     `error.message.includes('already exists')`)

3. **UI Composables:**
   - `useErrorHandler` detects errors by shape, not type

---

## Proposed Solution

### Error Hierarchy

```typescript
// Base error class
abstract class CivicPressError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  context?: Record<string, any>;
  correlationId: string;

  constructor(message: string, context?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    this.correlationId = generateCorrelationId();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      context: this.context,
      correlationId: this.correlationId,
    };
  }

  /**
   * Report error through centralized output system
   * Integrates with coreError(), cliError(), and handleApiError()
   */
  report(operation?: string): void {
    // This will be called by centralized output functions
    // when they receive a CivicPressError instance
    // The output functions will extract code, message, context, correlationId
  }

  /**
   * Get error details for centralized output
   * Returns format compatible with coreError() and cliError()
   */
  getOutputDetails(): {
    message: string;
    code: string;
    details: any;
    context: Record<string, any>;
  } {
    return {
      message: this.message,
      code: this.code,
      details: this.context?.details || this.context,
      context: {
        ...this.context,
        correlationId: this.correlationId,
        errorType: this.name,
        statusCode: this.statusCode,
      },
    };
  }
}

// Specific error types
class ValidationError extends CivicPressError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
}

class NotFoundError extends CivicPressError {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;
}

class UnauthorizedError extends CivicPressError {
  readonly code = 'UNAUTHORIZED';
  readonly statusCode = 401;
}

class ForbiddenError extends CivicPressError {
  readonly code = 'FORBIDDEN';
  readonly statusCode = 403;
}

class ConflictError extends CivicPressError {
  readonly code = 'CONFLICT';
  readonly statusCode = 409;
}

class DatabaseError extends CivicPressError {
  readonly code = 'DATABASE_ERROR';
  readonly statusCode = 500;
}

class FileSystemError extends CivicPressError {
  readonly code = 'FILE_SYSTEM_ERROR';
  readonly statusCode = 500;
}

class InternalError extends CivicPressError {
  readonly code = 'INTERNAL_ERROR';
  readonly statusCode = 500;
}
```

### Domain-Specific Errors

```typescript
// Record errors
class RecordNotFoundError extends NotFoundError {
  readonly code = 'RECORD_NOT_FOUND';
  constructor(recordId: string) {
    super(`Record '${recordId}' not found`, { recordId });
  }
}

class RecordValidationError extends ValidationError {
  readonly code = 'RECORD_VALIDATION_ERROR';
  constructor(message: string, details: any) {
    super(message, { details });
  }
}

// Template errors
class TemplateNotFoundError extends NotFoundError {
  readonly code = 'TEMPLATE_NOT_FOUND';
  constructor(templateId: string) {
    super(`Template '${templateId}' not found`, { templateId });
  }
}

class TemplateExistsError extends ConflictError {
  readonly code = 'TEMPLATE_EXISTS';
  constructor(templateId: string) {
    super(`Template '${templateId}' already exists`, { templateId });
  }
}

// Geography errors (migrate existing)
class GeographyNotFoundError extends NotFoundError {
  readonly code = 'GEOGRAPHY_NOT_FOUND';
  constructor(geographyId: string) {
    super(`Geography '${geographyId}' not found`, { geographyId });
  }
}
```

---

## Implementation Plan

### Phase 1: Foundation (Week 1)

#### Step 1.1: Create Error Hierarchy

**Files to Create:**

- `core/src/errors/index.ts` - Base error classes
- `core/src/errors/domain-errors.ts` - Domain-specific errors
- `core/src/errors/utils.ts` - Error utilities (correlation ID, error
  formatters)

**Tasks:**

1. Create `CivicPressError` base class
2. Create common error types (Validation, NotFound, etc.)
3. Create domain-specific error types
4. Add correlation ID generation
5. Add error serialization (`toJSON()`)
6. Export all errors from `core/src/index.ts`

**Acceptance Criteria:**

- [ ] All error classes extend `CivicPressError`
- [ ] All errors have `code` and `statusCode`
- [ ] Correlation IDs are generated automatically
- [ ] Errors can be serialized to JSON
- [ ] TypeScript types are correct

#### Step 1.2: Update Core Exports

**Files to Modify:**

- `core/src/index.ts`

**Tasks:**

1. Export error classes
2. Export error utilities

**Acceptance Criteria:**

- [ ] Errors are importable from `@civicpress/core`
- [ ] Type definitions are correct

#### Step 1.3: Create Error Utilities

**Files to Create:**

- `core/src/errors/utils.ts`

**Functions:**

- `generateCorrelationId()` - Generate unique correlation IDs
- `isCivicPressError(error)` - Type guard
- `normalizeError(error)` - Convert unknown errors to `CivicPressError`
- `getErrorCode(error)` - Extract error code safely
- `getStatusCode(error)` - Extract status code safely

**Acceptance Criteria:**

- [ ] Utilities handle all error types
- [ ] Type guards work correctly
- [ ] Unknown errors are normalized safely

#### Step 1.4: Integrate with Centralized Output

**Files to Modify:**

- `core/src/utils/core-output.ts`
- `cli/src/utils/cli-output.ts` (if needed)

**Changes:**

1. Update `coreError()` to detect `CivicPressError` instances
2. Extract error details from error object automatically
3. Include correlation ID in error output
4. Use error's `getOutputDetails()` method

**Before:**

```typescript
coreError('Error message', 'ERROR_CODE', { details }, { context });
```

**After:**

```typescript
// Can still use manual format
coreError('Error message', 'ERROR_CODE', { details }, { context });

// But also accepts CivicPressError instances
try {
  // ...
} catch (error) {
  if (error instanceof CivicPressError) {
    // Automatically extracts code, message, context, correlationId
    coreError(
      error.message,
      error.code,
      error.context?.details,
      {
        ...error.context,
        correlationId: error.correlationId,
      }
    );
  } else {
    // Fallback for unknown errors
    coreError('Unexpected error', 'INTERNAL_ERROR', { error });
  }
}
```

**Or create helper function:**

```typescript
// New: core/src/errors/utils.ts
export function reportError(error: Error, operation?: string): void {
  if (error instanceof CivicPressError) {
    const details = error.getOutputDetails();
    coreError(
      details.message,
      details.code,
      details.details,
      { ...details.context, operation }
    );
  } else {
    coreError(
      error.message || 'Unexpected error',
      'INTERNAL_ERROR',
      { error: error.toString() },
      { operation }
    );
  }
}
```

**Acceptance Criteria:**

- [ ] `coreError()` handles `CivicPressError` instances
- [ ] Correlation IDs are included in output
- [ ] Error context is preserved
- [ ] Backward compatibility maintained

### Phase 2: Core Service Migration (Week 1-2)

#### Step 2.1: Migrate Template Service

**Files to Modify:**

- `core/src/templates/template-service.ts`

**Migration Pattern:**

```typescript
// Before
throw new Error('Template already exists: ${templateId}');

// After - Option 1: Just throw (let caller handle reporting)
throw new TemplateExistsError(templateId);

// After - Option 2: Throw and report (if this is a terminal error)
try {
  // ...
} catch (error) {
  if (error instanceof TemplateExistsError) {
    coreError(
      error.message,
      error.code,
      error.context,
      { operation: 'create_template' }
    );
    throw error; // Re-throw for caller
  }
}
```

**Note:** The pattern depends on where errors are caught:

- **Core services**: Throw errors, let callers (CLI/API) handle reporting
- **CLI commands**: Catch errors, report via `cliError()`, then throw or exit
- **API routes**: Catch errors, report via `handleApiError()`, return response

**Errors to Migrate:**

1. `'Type, name, and content are required'` → `ValidationError`
2. `'Template already exists'` → `TemplateExistsError`
3. `'Invalid template ID'` → `ValidationError` with context
4. `'Template not found'` → `TemplateNotFoundError`
5. `'Invalid template directory path'` → `FileSystemError`
6. `'Invalid template frontmatter'` → `ValidationError`
7. `'Failed to load created template'` → `InternalError`
8. `'Template is a system template'` → `ForbiddenError`

**Acceptance Criteria:**

- [ ] All errors use new error types
- [ ] Error messages are clear
- [ ] Context is included where helpful
- [ ] Tests updated to check error types

#### Step 2.2: Migrate Record Manager

**Files to Modify:**

- `core/src/records/record-manager.ts`
- `core/src/records/record-parser.ts`

**Errors to Migrate:**

1. `'Invalid or missing frontmatter'` → `ValidationError`
2. `'Record not found'` → `RecordNotFoundError`
3. `'Invalid record data'` → `RecordValidationError`

**Acceptance Criteria:**

- [ ] All errors use new error types
- [ ] Tests updated

#### Step 2.3: Migrate Geography Errors

**Files to Modify:**

- `core/src/types/geography.ts`

**Migration:**

- Replace `GeographyError`, `GeographyValidationError`, `GeographyNotFoundError`
  with new hierarchy
- Keep backward compatibility during transition

**Acceptance Criteria:**

- [ ] Geography errors extend `CivicPressError`
- [ ] Backward compatibility maintained
- [ ] Tests updated

#### Step 2.4: Migrate Other Core Services

**Files to Review:**

- `core/src/database/database-service.ts`
- `core/src/auth/auth-service.ts`
- `core/src/git/git-engine.ts`
- `core/src/workflows/workflow-engine.ts`

**Pattern:**

- Identify error patterns
- Create domain-specific errors if needed
- Migrate to new error types

**Acceptance Criteria:**

- [ ] All core services use new error types
- [ ] Error messages are consistent
- [ ] Context is included

### Phase 3: API Layer Integration (Week 2)

#### Step 3.1: Update API Error Handler

**Files to Modify:**

- `modules/api/src/middleware/error-handler.ts`
- `modules/api/src/utils/api-logger.ts`

**Changes:**

1. Update `errorHandler` to recognize `CivicPressError`
2. Extract error code and status code from error type
3. Include correlation ID in response
4. Update error categorization to use error types
5. Update `handleApiError()` to work with `CivicPressError` instances
6. Ensure centralized logging includes correlation IDs

**Before:**

```typescript
function categorizeError(error: any) {
  if (error.name === 'ValidationError') { ... }
  // String-based detection
}
```

**After:**

```typescript
function categorizeError(error: Error) {
  if (error instanceof ValidationError) {
    return { category: 'validation', severity: 'low', actionable: true };
  }
  if (error instanceof CivicPressError) {
    // Use error.code and error.statusCode
  }
  // Fallback for unknown errors
}
```

**Acceptance Criteria:**

- [ ] `CivicPressError` instances are handled correctly
- [ ] Correlation IDs are included in responses
- [ ] Error codes are extracted from error type
- [ ] Unknown errors are normalized

#### Step 3.2: Update API Route Handlers

**Files to Modify:**

- `modules/api/src/routes/templates.ts`
- `modules/api/src/routes/records.ts`
- `modules/api/src/routes/geography.ts`
- All other route files

**Migration Pattern:**

```typescript
// Before
catch (error) {
  if (error.message.includes('already exists')) {
    const apiError = new Error(error.message);
    (apiError as any).statusCode = 409;
    (apiError as any).code = 'TEMPLATE_EXISTS';
    return handleApiError('create_template', apiError, req, res);
  }
  handleApiError('create_template', error, req, res);
}

// After
catch (error) {
  // Errors from core are already CivicPressError instances
  // Just pass through to error handler
  handleApiError('create_template', error, req, res);
}
```

**Acceptance Criteria:**

- [ ] No manual error type detection
- [ ] Errors pass through from core services
- [ ] Error handler middleware handles all cases
- [ ] Tests verify error responses

#### Step 3.3: Update API Utility Functions

**Files to Modify:**

- `modules/api/src/middleware/error-handler.ts`

**Changes:**

- Update `createApiError`, `createValidationError`, etc. to use new error types
- Or deprecate in favor of throwing errors directly

**Acceptance Criteria:**

- [ ] Utility functions use new error types
- [ ] Or functions are deprecated with migration guide

### Phase 4: UI Layer Integration (Week 2-3)

#### Step 4.1: Update UI Error Handler

**Files to Modify:**

- `modules/ui/app/composables/useErrorHandler.ts`

**Changes:**

1. Import error types from `@civicpress/core`
2. Update error detection to use `instanceof` checks
3. Extract error codes and correlation IDs
4. Display correlation IDs in development mode

**Before:**

```typescript
if (error?.status === 422 || error?.details) {
  return handleValidationError(error, options);
}
```

**After:**

```typescript
if (error instanceof ValidationError) {
  return handleValidationError(error, options);
}
```

**Acceptance Criteria:**

- [ ] Error detection uses type checks
- [ ] Correlation IDs are logged/displayed
- [ ] Error messages are user-friendly
- [ ] All error types are handled

#### Step 4.2: Update API Client

**Files to Modify:**

- `modules/ui/app/plugins/civicApi.ts` (or similar)

**Changes:**

- Ensure API errors are properly typed
- Pass correlation IDs through

**Acceptance Criteria:**

- [ ] API errors are typed correctly
- [ ] Correlation IDs are available in UI

### Phase 5: Testing & Documentation (Week 3)

#### Step 5.1: Update Tests

**Files to Modify:**

- All test files that check errors

**Changes:**

1. Update error assertions to check error types
2. Test correlation IDs
3. Test error serialization
4. Test error normalization

**Pattern:**

```typescript
// Before
expect(error.message).toBe('Template not found');

// After
expect(error).toBeInstanceOf(TemplateNotFoundError);
expect(error.code).toBe('TEMPLATE_NOT_FOUND');
expect(error.correlationId).toBeDefined();
```

**Acceptance Criteria:**

- [ ] All error tests updated
- [ ] Error type assertions added
- [ ] Correlation ID tests added
- [ ] Test coverage maintained

#### Step 5.2: Create Migration Guide

**Files to Create:**

- `docs/migration-guides/error-handling-migration.md`

**Content:**

- Overview of changes
- Migration patterns
- Examples
- Common pitfalls
- FAQ

**Acceptance Criteria:**

- [ ] Migration guide is complete
- [ ] Examples are clear
- [ ] Common issues documented

#### Step 5.3: Update Documentation

**Files to Modify:**

- `docs/error-handling.md`
- `docs/architecture.md`
- API documentation

**Changes:**

- Document new error hierarchy
- Update error handling patterns
- Add error code reference
- Document correlation IDs

**Acceptance Criteria:**

- [ ] Documentation is up to date
- [ ] Error codes are documented
- [ ] Examples are provided

---

## Error Code Reference

### Common Errors

- `VALIDATION_ERROR` (400) - Input validation failed
- `NOT_FOUND` (404) - Resource not found
- `UNAUTHORIZED` (401) - Authentication required
- `FORBIDDEN` (403) - Insufficient permissions
- `CONFLICT` (409) - Resource conflict (e.g., already exists)
- `DATABASE_ERROR` (500) - Database operation failed
- `FILE_SYSTEM_ERROR` (500) - File system operation failed
- `INTERNAL_ERROR` (500) - Unexpected internal error

### Domain-Specific Errors

#### Records

- `RECORD_NOT_FOUND` (404)
- `RECORD_VALIDATION_ERROR` (400)
- `RECORD_CONFLICT` (409)

#### Templates

- `TEMPLATE_NOT_FOUND` (404)
- `TEMPLATE_EXISTS` (409)
- `TEMPLATE_VALIDATION_ERROR` (400)
- `TEMPLATE_INVALID` (400)

#### Geography

- `GEOGRAPHY_NOT_FOUND` (404)
- `GEOGRAPHY_VALIDATION_ERROR` (400)

#### Authentication

- `AUTHENTICATION_FAILED` (401)
- `AUTHORIZATION_FAILED` (403)
- `SESSION_EXPIRED` (401)

---

## Implementation Checklist

### Phase 1: Foundation

- [ ] Create error hierarchy (`core/src/errors/index.ts`)
- [ ] Create domain-specific errors (`core/src/errors/domain-errors.ts`)
- [ ] Create error utilities (`core/src/errors/utils.ts`)
- [ ] Integrate with centralized output (`core/src/utils/core-output.ts`)
- [ ] Export errors from core (`core/src/index.ts`)
- [ ] Write unit tests for error classes
- [ ] Write unit tests for error utilities
- [ ] Write tests for centralized output integration

### Phase 2: Core Migration

- [ ] Migrate `TemplateService` errors
- [ ] Migrate `RecordManager` errors
- [ ] Migrate `RecordParser` errors
- [ ] Migrate `GeographyManager` errors
- [ ] Migrate `DatabaseService` errors
- [ ] Migrate `AuthService` errors
- [ ] Update all core service tests

### Phase 3: API Integration

- [ ] Update API error handler middleware
- [ ] Update `templates.ts` routes
- [ ] Update `records.ts` routes
- [ ] Update `geography.ts` routes
- [ ] Update all other route files
- [ ] Update API utility functions
- [ ] Update API tests

### Phase 4: UI Integration

- [ ] Update `useErrorHandler` composable
- [ ] Update API client plugin
- [ ] Update UI error display
- [ ] Update UI tests

### Phase 5: Documentation

- [ ] Create migration guide
- [ ] Update error handling documentation
- [ ] Update architecture documentation
- [ ] Create error code reference
- [ ] Update API documentation

---

## Risk Mitigation

### Risk 1: Breaking Changes

**Mitigation:**

- Maintain backward compatibility during transition
- Use feature flag if needed
- Gradual migration (service by service)
- Comprehensive testing

### Risk 2: Performance Impact

**Mitigation:**

- Correlation ID generation is lightweight
- Error serialization is minimal overhead
- Benchmark before/after

### Risk 3: Incomplete Migration

**Mitigation:**

- Clear migration checklist
- Code review for all changes
- Automated tests catch missed migrations
- Linter rules to prevent old patterns

---

## Success Metrics

1. **Code Quality:**
   - 100% of core services use new error types
   - 0 instances of `throw new Error()` in core services
   - All errors have correlation IDs

2. **Test Coverage:**
   - Error handling tests cover all error types
   - Correlation ID tests pass
   - Error serialization tests pass

3. **Documentation:**
   - Migration guide complete
   - Error code reference complete
   - Examples provided

4. **Developer Experience:**
   - Type-safe error handling
   - Clear error messages
   - Easy debugging with correlation IDs

---

## Timeline

- **Week 1:** Foundation + Core Service Migration (50%)
- **Week 2:** Core Service Migration (50%) + API Integration
- **Week 3:** UI Integration + Testing + Documentation

**Total:** 2-3 weeks

---

## Next Steps

1. Review and approve this plan
2. Create feature branch: `feat/unified-error-handling`
3. Start with Phase 1 (Foundation)
4. Regular check-ins to review progress
5. Code review for each phase
6. Merge after all phases complete

---

---

## Integration with Centralized Output System

### Overview

The unified error handling system **must integrate** with the existing
centralized output functions:

- `coreError()` - Core library error reporting
- `cliError()` - CLI command error reporting
- `handleApiError()` - API route error handling

### Integration Approach

#### 1. Error Classes Provide Output Details

Error classes include a `getOutputDetails()` method that returns data compatible
with centralized output:

```typescript
class CivicPressError {
  getOutputDetails(): {
    message: string;
    code: string;
    details: any;
    context: Record<string, any>;
  } {
    return {
      message: this.message,
      code: this.code,
      details: this.context?.details || this.context,
      context: {
        ...this.context,
        correlationId: this.correlationId,
        errorType: this.name,
        statusCode: this.statusCode,
      },
    };
  }
}
```

#### 2. Update Centralized Output Functions

**Core Output** (`core/src/utils/core-output.ts`):

```typescript
export function coreError(
  message: string,
  code?: string,
  details?: any,
  context?: Record<string, any>
): void {
  // If first argument is a CivicPressError, extract details automatically
  if (message instanceof CivicPressError) {
    const error = message;
    const outputDetails = error.getOutputDetails();
    coreOutput.error(
      outputDetails.message,
      outputDetails.code,
      outputDetails.details,
      outputDetails.context
    );
    return;
  }

  // Original behavior for backward compatibility
  coreOutput.error(message, code, details, context);
}
```

**CLI Output** (`cli/src/utils/cli-output.ts`):

```typescript
export function cliError(
  message: string,
  code?: string,
  details?: any,
  operation?: string
): void {
  // If first argument is a CivicPressError, extract details automatically
  if (message instanceof CivicPressError) {
    const error = message;
    const outputDetails = error.getOutputDetails();
    cliOutput.error(
      outputDetails.message,
      outputDetails.code,
      outputDetails.details,
      operation
    );
    return;
  }

  // Original behavior for backward compatibility
  cliOutput.error(message, code, details, operation);
}
```

**API Error Handler** (`modules/api/src/utils/api-logger.ts`):

```typescript
export function handleApiError(
  operation: string,
  error: any,
  req: Request,
  res: Response,
  fallbackMessage?: string
): void {
  // If error is a CivicPressError, extract details automatically
  if (error instanceof CivicPressError) {
    const outputDetails = error.getOutputDetails();

    // Log with correlation ID
    logApiError(operation, error, req, {
      correlationId: error.correlationId,
      errorCode: error.code,
      statusCode: error.statusCode,
    });

    // Send response with correlation ID
    res.status(error.statusCode).json({
      success: false,
      error: {
        message: outputDetails.message,
        code: outputDetails.code,
        details: outputDetails.details,
        correlationId: error.correlationId,
      },
      requestId: (req as any).requestId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Original behavior for backward compatibility
  // ... existing handleApiError logic
}
```

#### 3. Usage Patterns

**CLI Commands:**

```typescript
try {
  const result = await templateService.createTemplate(data);
  cliSuccess(result, 'Template created');
} catch (error) {
  // Option 1: Pass error directly (if cliError updated)
  cliError(error, 'create_template');

  // Option 2: Extract details manually
  if (error instanceof CivicPressError) {
    const details = error.getOutputDetails();
    cliError(
      details.message,
      details.code,
      details.details,
      'create_template'
    );
  } else {
    cliError('Unexpected error', 'INTERNAL_ERROR', { error }, 'create_template');
  }

  process.exit(1);
}
```

**API Routes:**

```typescript
try {
  const template = await templateService.createTemplate(data);
  sendSuccess({ template }, req, res);
} catch (error) {
  // handleApiError() automatically detects CivicPressError
  // and extracts code, statusCode, correlationId
  handleApiError('create_template', error, req, res);
}
```

**Core Services:**

```typescript
// Core services just throw errors - don't report them
// Let callers (CLI/API) handle reporting
if (existing) {
  throw new TemplateExistsError(templateId);
}
```

### Benefits

1. **Automatic Correlation IDs**: All errors include correlation IDs in logs
2. **Consistent Format**: Errors formatted consistently across CLI/API/Core
3. **JSON Mode Support**: Errors automatically formatted for `--json` flag
4. **Silent Mode Support**: Errors respect `--silent` flag
5. **Rich Context**: Error context preserved through output chain
6. **Backward Compatible**: Existing code continues to work

### Migration Notes

- **Phase 1**: Update centralized output functions to detect `CivicPressError`
- **Phase 2**: Migrate services to throw `CivicPressError` instances
- **Phase 3**: Update CLI/API handlers to use new error types
- **Backward Compatibility**: Keep original function signatures working

---

**Document Status:** Ready for Implementation  
**Last Updated:** 2025-01-27
