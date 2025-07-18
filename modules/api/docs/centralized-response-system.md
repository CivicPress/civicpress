# Centralized Response System

## Overview

The CivicPress API uses a centralized system for handling responses, errors, and
logging to ensure consistency, maintainability, and observability across all
endpoints.

## Architecture

### Core Components

1. **Response Utilities** (`api-logger.ts`)
2. **Standardized Response Interfaces**
3. **Centralized Error Handling**
4. **Request/Response Logging**

## Response Utilities

### `sendSuccess<T>(data, req, res, options)`

Sends a standardized success response with automatic logging.

```typescript
import { sendSuccess } from '../utils/api-logger';

// Basic usage
sendSuccess({ records: [] }, req, res, { operation: 'list_records' });

// With custom status code and message
sendSuccess(
  { record },
  req,
  res,
  {
    operation: 'create_record',
    statusCode: 201,
    message: 'Record created successfully'
  }
);

// With metadata
sendSuccess(
  { records, total: 100 },
  req,
  res,
  {
    operation: 'list_records',
    meta: {
      total: 100,
      page: 1,
      limit: 10
    }
  }
);
```

### `handleApiError(operation, error, req, res, defaultMessage?)`

Handles errors with standardized logging and response formatting.

```typescript
import { handleApiError } from '../utils/api-logger';

// Basic error handling
try {
  const record = await recordsService.getRecord(id);
  if (!record) {
    const error = new Error('Record not found');
    (error as any).statusCode = 404;
    (error as any).code = 'RECORD_NOT_FOUND';
    throw error;
  }
  sendSuccess(record, req, res, { operation: 'get_record' });
} catch (error) {
  handleApiError('get_record', error, req, res, 'Failed to retrieve record');
}
```

### `handleValidationError(operation, errors, req, res)`

Handles validation errors with standardized formatting.

```typescript
import { handleValidationError } from '../utils/api-logger';

const errors = validationResult(req);
if (!errors.isEmpty()) {
  return handleValidationError('create_record', errors.array(), req, res);
}
```

### `logApiRequest(req, context?)`

Logs API requests with context information.

```typescript
import { logApiRequest } from '../utils/api-logger';

router.get('/records', (req, res) => {
  logApiRequest(req, { operation: 'list_records' });
  // ... route logic
});
```

## Response Formats

### Success Response

All successful responses follow this structure:

```json
{
  "success": true,
  "data": {
    // Response data
  },
  "message": "Optional success message",
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 10
  }
}
```

### Error Response

All error responses follow this structure:

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "details": "Additional error details"
  }
}
```

## TypeScript Interfaces

### `SuccessResponse<T>`

```typescript
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    [key: string]: any;
  };
}
```

### `ErrorResponse`

```typescript
export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: any;
  };
}
```

## Error Handling Patterns

### 1. Validation Errors

```typescript
const errors = validationResult(req);
if (!errors.isEmpty()) {
  return handleValidationError('operation_name', errors.array(), req, res);
}
```

### 2. Not Found Errors

```typescript
if (!record) {
  const error = new Error('Record not found');
  (error as any).statusCode = 404;
  (error as any).code = 'RECORD_NOT_FOUND';
  throw error;
}
```

### 3. Permission Errors

```typescript
if (!hasPermission) {
  const error = new Error('Insufficient permissions');
  (error as any).statusCode = 403;
  (error as any).code = 'INSUFFICIENT_PERMISSIONS';
  throw error;
}
```

### 4. Service Errors

```typescript
try {
  const result = await service.operation();
  sendSuccess(result, req, res, { operation: 'operation_name' });
} catch (error) {
  handleApiError('operation_name', error, req, res, 'Operation failed');
}
```

## Logging

### Request Logging

Every route automatically logs:

- Request method and path
- User information (if authenticated)
- Request ID for tracing
- Custom context

### Response Logging

Success responses log:

- Operation name
- Response data type
- Request context

Error responses log:

- Error details with stack trace
- Request context
- Error categorization

### Performance Logging

The system automatically logs:

- Request duration
- Database operation timing
- Memory usage

## Migration Guide

### Before (Old Pattern)

```typescript
router.get('/records', async (req, res) => {
  try {
    const records = await getRecords();
    res.json({
      success: true,
      records,
      total: records.length
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to get records',
        details: error.message
      }
    });
  }
});
```

### After (New Pattern)

```typescript
router.get('/records', async (req, res) => {
  logApiRequest(req, { operation: 'list_records' });

  try {
    const records = await getRecords();
    sendSuccess(
      { records, total: records.length },
      req,
      res,
      { operation: 'list_records' }
    );
  } catch (error) {
    handleApiError('list_records', error, req, res, 'Failed to get records');
  }
});
```

## Best Practices

### 1. Always Use Centralized Utilities

❌ **Don't:**

```typescript
res.json({ data: result });
res.status(400).json({ error: { message: 'Invalid input' } });
console.log('Error:', error);
```

✅ **Do:**

```typescript
sendSuccess(result, req, res, { operation: 'operation_name' });
handleApiError('operation_name', error, req, res);
logApiRequest(req, { operation: 'operation_name' });
```

### 2. Provide Meaningful Operation Names

```typescript
// Good
sendSuccess(data, req, res, { operation: 'create_user_record' });

// Avoid
sendSuccess(data, req, res, { operation: 'api_call' });
```

### 3. Use Proper Error Codes

```typescript
const error = new Error('User not found');
(error as any).statusCode = 404;
(error as any).code = 'USER_NOT_FOUND';
throw error;
```

### 4. Include Context in Logging

```typescript
logApiRequest(req, {
  operation: 'list_records',
  filters: { type: 'bylaw', status: 'active' }
});
```

## Testing

### Testing Success Responses

```typescript
const response = await request(app)
  .get('/api/records')
  .set('Authorization', `Bearer ${token}`);

expect(response.status).toBe(200);
expect(response.body.success).toBe(true);
expect(response.body.data).toBeDefined();
```

### Testing Error Responses

```typescript
const response = await request(app)
  .get('/api/records/invalid-id')
  .set('Authorization', `Bearer ${token}`);

expect(response.status).toBe(404);
expect(response.body.success).toBe(false);
expect(response.body.error.code).toBe('RECORD_NOT_FOUND');
```

## Configuration

### Logging Levels

The system respects the core Logger configuration:

```typescript
// In your app initialization
const logger = new Logger({
  level: process.env.LOG_LEVEL || 'info',
  format: 'json'
});
```

### Custom Response Headers

Add custom headers to responses:

```typescript
sendSuccess(data, req, res, {
  operation: 'list_records',
  headers: {
    'X-Total-Count': '100',
    'X-Page-Size': '10'
  }
});
```

## Troubleshooting

### Common Issues

1. **Missing Operation Names**
   - Always provide operation names for better logging
   - Use descriptive, consistent naming

2. **Inconsistent Error Codes**
   - Use standardized error codes
   - Document all error codes in API documentation

3. **Missing Error Handling**
   - Always wrap async operations in try-catch
   - Use `handleApiError` for all error scenarios

### Debug Mode

Enable debug logging:

```typescript
// Set environment variable
LOG_LEVEL=debug

// Or in code
const logger = new Logger({ level: 'debug' });
```

## Future Enhancements

1. **Response Caching**
   - Add caching headers to responses
   - Implement ETag support

2. **Rate Limiting**
   - Add rate limiting headers
   - Implement request throttling

3. **API Versioning**
   - Add version headers
   - Support multiple API versions

4. **Metrics Collection**
   - Add performance metrics
   - Implement response time tracking

## Related Documentation

- [Error Handling Guide](./error-handling.md)
- [Logging Configuration](./logging.md)
- [API Response Standards](./api-standards.md)
- [Testing Guidelines](./testing.md)
