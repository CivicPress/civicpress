# ADR-004: Unified Error Handling

**Status**: Accepted  
**Date**: 2025-01-30  
**Deciders**: Architecture Team  
**Tags**: architecture, error-handling, consistency, debugging

---

## Context

CivicPress had inconsistent error handling across layers:

1. **API Layer**: Generic error responses, no correlation IDs
2. **CLI Layer**: Different error formats, inconsistent logging
3. **Core Layer**: Mixed error types (Error, custom errors, strings)
4. **UI Layer**: No correlation ID support for debugging

### Problems

- **Inconsistent error responses** - Different formats across API/CLI/Core
- **No correlation IDs** - Can't trace errors across distributed operations
- **Type-unsafe error handling** - TypeScript can't catch error handling
  mistakes
- **Poor debugging experience** - Hard to track errors through system
- **No structured error context** - Missing context for error recovery

---

## Decision

We will implement a **Unified Error Handling System** with:

1. **Error Hierarchy** - Type-safe error classes extending `CivicPressError`
2. **Correlation IDs** - Automatic correlation ID generation for error tracing
3. **Domain-Specific Errors** - Errors for each domain (Records, Templates,
   Geography, etc.)
4. **Structured Context** - Error context included in all error responses
5. **Layer Integration** - Consistent error handling across API, CLI, and Core

### Implementation

```typescript
// Error hierarchy
abstract class CivicPressError extends Error {
  abstract code: string;
  abstract statusCode: number;
  context?: Record<string, any>;
  correlationId?: string;
}

// Domain-specific errors
class ValidationError extends CivicPressError {
  code = 'VALIDATION_ERROR';
  statusCode = 400;
}

// Usage
throw new ValidationError('Invalid record data', { field: 'title' });

// Error handling
if (error instanceof CivicPressError) {
  res.status(error.statusCode).json({
    error: {
      code: error.code,
      message: error.message,
      context: error.context,
      correlationId: error.correlationId,
    },
  });
}
```

---

## Consequences

### Positive

✅ **Consistent error responses** - Same format across API, CLI, Core  
✅ **Better debugging** - Correlation IDs enable distributed tracing  
✅ **Type safety** - TypeScript ensures correct error types  
✅ **Clear recovery paths** - Structured errors provide clear recovery
strategies  
✅ **User experience** - Meaningful error messages for users  
✅ **Observability** - Better error tracking and monitoring

### Negative

⚠️ **Migration effort** - Had to migrate existing error handling  
⚠️ **Learning curve** - Developers need to use new error types  
⚠️ **Additional abstraction** - One more layer to understand

### Neutral

- All existing error handling migrated successfully
- Backward compatible (can still throw generic Error)
- Can be extended with new error types easily

---

## Implementation Details

### Error Hierarchy

```
CivicPressError (base class)
├── ValidationError (400)
├── NotFoundError (404)
├── DatabaseError (500)
├── StorageError (500)
├── RecordError
│   ├── RecordNotFoundError
│   ├── RecordValidationError
│   └── RecordConflictError
├── TemplateError
│   ├── TemplateNotFoundError
│   └── TemplateValidationError
└── GeographyError
    ├── GeographyNotFoundError
    └── GeographyValidationError
```

### Correlation IDs

- **Automatic Generation**: Generated when error is created
- **Distributed Tracing**: Track errors across API, CLI, Core layers
- **Logging Integration**: Correlation IDs included in all log entries
- **User Visibility**: Correlation IDs shown in error responses (for support)

### Layer Integration

- **API Layer**: `handleApiError()` middleware automatically handles
  `CivicPressError`
- **CLI Layer**: `cliError()` function formats errors with correlation IDs
- **Core Layer**: `coreError()` function for core error logging
- **UI Layer**: `useErrorHandler` composable displays errors with correlation
  IDs

---

## Alternatives Considered

### 1. Keep Existing Error Handling

**Approach**: Leave error handling as-is, just document patterns

**Rejected because**:

- Inconsistent error formats make debugging hard
- No way to trace errors across distributed operations
- Poor user experience with generic error messages
- Type-unsafe error handling

### 2. Use Third-Party Error Library

**Approach**: Use existing error handling library

**Rejected because**:

- Adds external dependency
- May not fit our needs
- Less control over implementation
- Want to keep dependencies minimal

### 3. Simple Error Wrapper

**Approach**: Simple wrapper around Error class

**Rejected because**:

- Doesn't provide type safety
- No correlation ID support
- Doesn't solve consistency issues
- Not enough structure

---

## References

- Error Handling Guide: `docs/error-handling.md`
- Implementation: `core/src/errors/`
- API Integration: `modules/api/src/middleware/error-handler.ts`
- CLI Integration: `cli/src/utils/output.ts`
- UI Integration: `modules/ui/app/composables/useErrorHandler.ts`

---

## Notes

- All services migrated to use new error types
- Comprehensive test coverage (1,167+ tests passing)
- Correlation IDs enable distributed tracing
- Better debugging experience for developers
- Improved user experience with meaningful error messages
