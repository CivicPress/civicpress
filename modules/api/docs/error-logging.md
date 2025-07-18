# API Error Logging System

## Overview

The CivicPress API includes a comprehensive error logging system that provides
structured logging for all API operations, requests, responses, and errors. This
system helps with debugging, monitoring, and maintaining the API.

## Components

### 1. Enhanced Error Handler (`middleware/error-handler.ts`)

The enhanced error handler provides:

- **Request Context Extraction**: Captures request ID, user info, IP, user
  agent, etc.
- **Error Categorization**: Automatically categorizes errors by type and
  severity
- **Structured Logging**: Logs errors with full context and stack traces
- **Error Response Standardization**: Provides consistent error responses
- **Utility Functions**: Helper functions for creating specific error types

#### Error Categories

- `validation`: Input validation errors (low severity)
- `authentication`: Authentication failures (medium severity)
- `authorization`: Authorization/permission errors (medium severity)
- `not_found`: Resource not found errors (low severity)
- `file_system`: File system errors (medium severity)
- `database`: Database connection/query errors (high severity)
- `system`: System-level errors (high severity)
- `unknown`: Unclassified errors (medium severity)

#### Severity Levels

- `low`: Non-critical errors that don't affect system operation
- `medium`: Errors that may affect functionality but not system stability
- `high`: Errors that could affect system stability
- `critical`: Errors that require immediate attention

### 2. API Logger (`utils/api-logger.ts`)

A singleton logger class that provides:

- **Request/Response Logging**: Automatic logging of all API requests and
  responses
- **Success Logging**: Logs successful operations with context
- **Error Logging**: Comprehensive error logging with full context
- **Validation Logging**: Logs validation errors with details
- **Performance Logging**: Tracks operation duration and performance metrics
- **Auth Event Logging**: Logs authentication and authorization events
- **Database Operation Logging**: Logs database operations (extensible)

#### Usage Examples

```typescript
import { apiLogger, logApiSuccess, handleApiError } from '../utils/api-logger';

// Log successful operation
apiLogger.logSuccess('List Records', req, { totalRecords: 25 });

// Handle errors
handleApiError('Create Record', error, req, res, 'Failed to create record');

// Log warnings
apiLogger.logWarning('Rate limit exceeded', req, { limit: 100 });
```

### 3. Logging Middleware (`middleware/logging.ts`)

Automatic middleware for comprehensive logging:

- **API Logging Middleware**: Logs all requests and responses with performance
  metrics
- **Auth Logging Middleware**: Logs authentication events
- **Performance Monitoring**: Tracks slow requests (>500ms)
- **Request Context**: Adds additional context to requests
- **Error Logging**: Enhanced error logging with context

## Log Format

All logs follow a structured JSON format:

```json
{
  "level": "INFO|WARN|ERROR",
  "message": "Operation description",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "requestId": "req_1704110400000_abc123",
  "userId": "user123",
  "userRole": "admin",
  "method": "GET",
  "path": "/api/records",
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "context": {
    "operation": "List Records",
    "totalRecords": 25,
    "duration": 150
  }
}
```

## Error Response Format

Standardized error responses include:

```json
{
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE",
    "details": "Additional error details (development only)"
  },
  "requestId": "req_1704110400000_abc123",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "path": "/api/records",
  "method": "GET"
}
```

## Configuration

### Environment Variables

- `NODE_ENV`: Controls error detail exposure (development vs production)
- `LOG_LEVEL`: Sets logging verbosity (ERROR, WARN, INFO, DEBUG, VERBOSE)
- `LOG_FORMAT`: Sets log format (json, text)

### Log Levels

- `SILENT`: No logging
- `ERROR`: Only errors
- `WARN`: Warnings and errors
- `INFO`: Info, warnings, and errors (default)
- `DEBUG`: Debug info and above
- `VERBOSE`: All log messages

## Usage in Routes

### Basic Error Handling

```typescript
import { handleApiError, logApiSuccess } from '../utils/api-logger';

router.get('/records', async (req, res) => {
  try {
    const records = await recordsService.listRecords();

    logApiSuccess('List Records', req, { totalRecords: records.length });
    res.json(records);
  } catch (error) {
    handleApiError('List Records', error, req, res, 'Failed to list records');
  }
});
```

### Validation Error Handling

```typescript
import { handleValidationError } from '../utils/api-logger';

router.post('/records', async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return handleValidationError('Create Record', errors.array(), req, res);
  }

  // ... rest of handler
});
```

### Custom Error Creation

```typescript
import { createApiError } from '../middleware/error-handler';

// Create specific error types
const notFoundError = createNotFoundError('Record not found');
const authError = createAuthError('Invalid credentials');
const validationError = createValidationError('Invalid input', { field: 'title' });
```

## Performance Monitoring

The system automatically tracks:

- **Request Duration**: All requests are timed
- **Slow Requests**: Requests >500ms are flagged
- **Performance Logs**: Detailed performance metrics for slow operations
- **Response Size**: Content length tracking

## Security Considerations

- **Sensitive Data**: Passwords and tokens are never logged
- **Production Safety**: Stack traces only shown in development
- **Request IDs**: All requests get unique IDs for tracing
- **IP Logging**: Client IPs are logged for security monitoring

## Monitoring and Alerting

### Log Analysis

The structured logs can be analyzed for:

- **Error Rates**: Track error frequency by type
- **Performance Issues**: Identify slow operations
- **Security Events**: Monitor authentication failures
- **Usage Patterns**: Track API usage

### Recommended Alerts

- High error rate (>5% of requests)
- Critical errors (system-level failures)
- Slow requests (>2 seconds)
- Authentication failures
- Database connection errors

## Best Practices

1. **Always Use Structured Logging**: Use the provided logging utilities
2. **Include Context**: Add relevant context to all log messages
3. **Handle Errors Gracefully**: Use the error handling utilities
4. **Monitor Performance**: Watch for slow operations
5. **Security First**: Never log sensitive information
6. **Request Tracing**: Use request IDs for debugging
7. **Consistent Error Codes**: Use standardized error codes

## Troubleshooting

### Common Issues

1. **Missing Request IDs**: Ensure requestIdMiddleware is applied
2. **Incomplete Logs**: Check that all middleware is properly configured
3. **Performance Issues**: Monitor slow request logs
4. **Error Context**: Verify error categorization is working

### Debug Mode

Enable debug logging by setting:

```bash
export LOG_LEVEL=DEBUG
export NODE_ENV=development
```

This will provide detailed logging for troubleshooting.
