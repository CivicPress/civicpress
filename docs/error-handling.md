# Error Handling Guide

CivicPress implements a comprehensive unified error handling system that
provides consistent user experience, better debugging capabilities, and
maintainable code across all layers of the application.

## Overview

The unified error handling system consists of:

- **Error Hierarchy**: Type-safe error classes with correlation IDs
- **Core Services**: Consistent error types across all core services
- **API Layer**: Automatic error recognition and structured responses
- **UI Layer**: Enhanced error handling with correlation ID support
- **Centralized Output**: Integration with core output functions

## Architecture

### Error Hierarchy

All errors in CivicPress extend from `CivicPressError`, which provides:

- **Error Codes**: Machine-readable error identifiers
- **Status Codes**: HTTP status codes for API responses
- **Correlation IDs**: Unique identifiers for error tracing
- **Context**: Additional metadata for debugging
- **Type Safety**: TypeScript type checking

```typescript
// Base error classes
abstract class CivicPressError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  context?: Record<string, any>;
  correlationId: string;

  getOutputDetails(): {
    message: string;
    code: string;
    details: any;
    context: Record<string, any>;
  }
}
```

### Error Categories

#### Base Errors

- `ValidationError` (400) - Input validation failures
- `NotFoundError` (404) - Resource not found
- `UnauthorizedError` (401) - Authentication required
- `ForbiddenError` (403) - Permission denied
- `ConflictError` (409) - Resource conflicts
- `DatabaseError` (500) - Database operation failures
- `FileSystemError` (500) - File system operation failures
- `InternalError` (500) - Internal server errors

#### Domain-Specific Errors

- **Records**: `RecordNotFoundError`, `RecordValidationError`,
  `RecordConflictError`
- **Templates**: `TemplateNotFoundError`, `TemplateExistsError`,
  `TemplateValidationError`, `TemplateSystemError`
- **Geography**: `GeographyNotFoundError`, `GeographyValidationError`
- **Authentication**: `AuthenticationFailedError`, `AuthorizationFailedError`,
  `SessionExpiredError`
- **Git**: `GitError`, `GitConflictError`
- **Workflow**: `WorkflowError`, `WorkflowTransitionError`

## Quick Start

### Core Services

```typescript
import { TemplateNotFoundError, ValidationError } from '@civicpress/core';

// Throw domain-specific errors
if (!template) {
  throw new TemplateNotFoundError('bylaw/default', {
    operation: 'loadTemplate'
  });
}

// Throw validation errors
if (!isValid(data)) {
  throw new ValidationError('Invalid input', {
    field: 'title',
    value: data.title
  });
}
```

### API Layer

The API layer automatically recognizes `CivicPressError` instances and formats
responses:

```typescript
// Errors are automatically handled by the error handler middleware
try {
  const template = await templateService.getTemplate(id);
  sendSuccess(template, req, res);
} catch (error) {
  // Error handler automatically:
  // - Extracts correlation ID
  // - Formats error response
  // - Logs with context
  handleApiError('get_template', error, req, res);
}
```

### UI Layer

```typescript
import { useErrorHandler } from '~/composables/useErrorHandler';

const { handleError } = useErrorHandler();

try {
  const result = await $civicApi('/api/v1/templates/bylaw/default');
} catch (error) {
  // Automatically extracts correlation ID and error code
  // Shows toast notification with correlation ID in dev mode
  handleError(error, {
    title: 'Failed to Load Template',
    showToast: true
  });
}
```

## Error Response Format

### API Error Response

```json
{
  "success": false,
  "error": {
    "message": "Template 'bylaw/default' not found",
    "code": "TEMPLATE_NOT_FOUND",
    "correlationId": "err_abc123_def456",
    "details": {
      "templateId": "bylaw/default",
      "operation": "loadTemplate"
    }
  },
  "requestId": "req_1234567890_xyz",
  "timestamp": "2024-12-18T12:00:00.000Z",
  "path": "/api/v1/templates/bylaw/default",
  "method": "GET"
}
```

### Development vs Production

In **development mode**, error responses include:

- Full error messages
- Stack traces
- Error details/context
- Correlation IDs

In **production mode**, error responses include:

- Generic error messages (for 500 errors)
- Correlation IDs (for tracing)
- No stack traces
- No sensitive context

## Correlation IDs

Every error includes a unique correlation ID for tracing:

- **Format**: `err_<uuid>` (e.g., `err_abc123_def456`)
- **Purpose**: Track errors across logs, API responses, and UI
- **Visibility**: Shown in development mode toast notifications
- **Usage**: Include in bug reports for faster debugging

## Error Utilities

### Type Guards

```typescript
import { isCivicPressError } from '@civicpress/core';

if (isCivicPressError(error)) {
  console.log('Error code:', error.code);
  console.log('Correlation ID:', error.correlationId);
}
```

### Error Extraction

```typescript
import {
  getErrorCode,
  getStatusCode,
  getCorrelationId
} from '@civicpress/core';

const code = getErrorCode(error); // Works with any error type
const status = getStatusCode(error);
const correlationId = getCorrelationId(error);
```

### Error Normalization

```typescript
import { normalizeError } from '@civicpress/core';

// Convert any error to CivicPressError
const civicError = normalizeError(unknownError, 'Default message', {
  operation: 'myOperation'
});
```

## UI Error Handling

### useErrorHandler Composable

The `useErrorHandler` composable provides specialized error handlers:

```typescript
const {
  handleError,           // Smart error routing
  handleApiError,        // General API errors
  handleNetworkError,    // Connection issues
  handleValidationError, // Form validation
  handleAuthError        // Authentication errors
} = useErrorHandler();
```

### Error Options

```typescript
interface ErrorOptions {
  title?: string;              // Toast title
  showToast?: boolean;         // Show toast notification
  logToConsole?: boolean;      // Log to console
  fallbackMessage?: string;    // Default message
  showCorrelationId?: boolean; // Show correlation ID (dev mode)
}
```

### Automatic Correlation ID Extraction

The UI automatically extracts correlation IDs from API error responses:

```typescript
// API returns error with correlationId
// UI automatically:
// - Extracts correlation ID
// - Includes in console logs
// - Shows in toast (dev mode)
handleError(error, { title: 'Error' });
```

## Best Practices

### 1. Use Specific Error Types

```typescript
// ✅ Good - Specific error type
throw new TemplateNotFoundError('bylaw/default');

// ❌ Bad - Generic error
throw new Error('Template not found');
```

### 2. Include Context

```typescript
// ✅ Good - Include helpful context
throw new ValidationError('Invalid template ID', {
  templateId: id,
  operation: 'createTemplate',
  attemptedValue: id
});

// ❌ Bad - No context
throw new ValidationError('Invalid template ID');
```

### 3. Let Errors Bubble Up

```typescript
// ✅ Good - Let error handler middleware catch it
async function getTemplate(id: string) {
  const template = await loadTemplate(id);
  if (!template) {
    throw new TemplateNotFoundError(id);
  }
  return template;
}

// ❌ Bad - Catching and re-throwing generically
try {
  return await loadTemplate(id);
} catch (error) {
  throw new Error('Failed to load template'); // Loses original error info
}
```

### 4. Use Correlation IDs for Debugging

```typescript
// In development, correlation IDs are shown in:
// - Console logs
// - Toast notifications
// - API error responses

// Use correlation ID to trace errors:
// 1. User reports error with correlation ID
// 2. Search logs for correlation ID
// 3. Find full error context and stack trace
```

## Migration Guide

### From Generic Errors

**Before:**

```typescript
throw new Error('Template not found');
```

**After:**

```typescript
throw new TemplateNotFoundError('bylaw/default');
```

### From String-Based Error Detection

**Before:**

```typescript
if (error.message.includes('not found')) {
  // Handle not found
}
```

**After:**

```typescript
import { isCivicPressError, NotFoundError } from '@civicpress/core';

if (isCivicPressError(error) && error instanceof NotFoundError) {
  // Handle not found
}
```

### From Manual Error Formatting

**Before:**

```typescript
res.status(404).json({
  error: { message: 'Not found' }
});
```

**After:**

```typescript
// Error handler automatically formats response
throw new NotFoundError('Resource not found');
```

## Error Code Reference

### Common Error Codes

- `VALIDATION_ERROR` - Input validation failed
- `NOT_FOUND` - Resource not found
- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Permission denied
- `CONFLICT` - Resource conflict
- `DATABASE_ERROR` - Database operation failed
- `FILE_SYSTEM_ERROR` - File system operation failed
- `INTERNAL_ERROR` - Internal server error

### Domain-Specific Codes

- `RECORD_NOT_FOUND`, `RECORD_VALIDATION_ERROR`, `RECORD_CONFLICT`
- `TEMPLATE_NOT_FOUND`, `TEMPLATE_EXISTS`, `TEMPLATE_VALIDATION_ERROR`,
  `TEMPLATE_SYSTEM_ERROR`
- `GEOGRAPHY_NOT_FOUND`, `GEOGRAPHY_VALIDATION_ERROR`
- `AUTHENTICATION_FAILED`, `AUTHORIZATION_FAILED`, `SESSION_EXPIRED`
- `GIT_ERROR`, `GIT_CONFLICT`
- `WORKFLOW_ERROR`, `WORKFLOW_TRANSITION_ERROR`

## Testing

### Testing Error Types

```typescript
import { TemplateNotFoundError } from '@civicpress/core';

it('should throw TemplateNotFoundError', async () => {
  await expect(service.getTemplate('invalid'))
    .rejects.toThrow(TemplateNotFoundError);

  try {
    await service.getTemplate('invalid');
  } catch (error) {
    expect(error).toBeInstanceOf(TemplateNotFoundError);
    expect(error.code).toBe('TEMPLATE_NOT_FOUND');
    expect(error.correlationId).toBeDefined();
  }
});
```

### Testing Error Responses

```typescript
const response = await request(app)
  .get('/api/v1/templates/invalid')
  .expect(404);

expect(response.body.success).toBe(false);
expect(response.body.error.code).toBe('TEMPLATE_NOT_FOUND');
expect(response.body.error.correlationId).toBeDefined();
```

## Related Documentation

- [API Integration Guide](./api-integration-guide.md) - API usage patterns
- [Development Patterns](./dev-pattern.md) - Overall development approach

---

**Last Updated**: December 2024  
**Status**: ✅ Active  
**Maintainer**: CivicPress Team
