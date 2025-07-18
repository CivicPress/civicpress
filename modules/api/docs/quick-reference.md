# API Response System - Quick Reference

## Import Statements

```typescript
import {
  sendSuccess,
  handleApiError,
  handleValidationError,
  logApiRequest
} from '../utils/api-logger';
```

## Basic Route Template

```typescript
router.get('/endpoint', async (req, res) => {
  logApiRequest(req, { operation: 'operation_name' });

  try {
    // Your business logic here
    const result = await service.operation();

    sendSuccess(result, req, res, { operation: 'operation_name' });
  } catch (error) {
    handleApiError('operation_name', error, req, res, 'Default error message');
  }
});
```

## Common Patterns

### 1. List Resources

```typescript
router.get('/records', async (req, res) => {
  logApiRequest(req, { operation: 'list_records' });

  try {
    const records = await recordsService.listRecords(req.query);

    sendSuccess(
      { records, total: records.length },
      req,
      res,
      {
        operation: 'list_records',
        meta: { total: records.length }
      }
    );
  } catch (error) {
    handleApiError('list_records', error, req, res, 'Failed to list records');
  }
});
```

### 2. Get Single Resource

```typescript
router.get('/records/:id', async (req, res) => {
  logApiRequest(req, { operation: 'get_record' });

  try {
    const record = await recordsService.getRecord(req.params.id);

    if (!record) {
      const error = new Error('Record not found');
      (error as any).statusCode = 404;
      (error as any).code = 'RECORD_NOT_FOUND';
      throw error;
    }

    sendSuccess(record, req, res, { operation: 'get_record' });
  } catch (error) {
    handleApiError('get_record', error, req, res, 'Failed to get record');
  }
});
```

### 3. Create Resource

```typescript
router.post('/records', async (req, res) => {
  logApiRequest(req, { operation: 'create_record' });

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return handleValidationError('create_record', errors.array(), req, res);
  }

  try {
    const record = await recordsService.createRecord(req.body);

    sendSuccess(
      record,
      req,
      res,
      {
        operation: 'create_record',
        statusCode: 201,
        message: 'Record created successfully'
      }
    );
  } catch (error) {
    handleApiError('create_record', error, req, res, 'Failed to create record');
  }
});
```

### 4. Update Resource

```typescript
router.put('/records/:id', async (req, res) => {
  logApiRequest(req, { operation: 'update_record' });

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return handleValidationError('update_record', errors.array(), req, res);
  }

  try {
    const record = await recordsService.updateRecord(req.params.id, req.body);

    if (!record) {
      const error = new Error('Record not found');
      (error as any).statusCode = 404;
      (error as any).code = 'RECORD_NOT_FOUND';
      throw error;
    }

    sendSuccess(record, req, res, { operation: 'update_record' });
  } catch (error) {
    handleApiError('update_record', error, req, res, 'Failed to update record');
  }
});
```

### 5. Delete Resource

```typescript
router.delete('/records/:id', async (req, res) => {
  logApiRequest(req, { operation: 'delete_record' });

  try {
    const result = await recordsService.deleteRecord(req.params.id);

    if (!result) {
      const error = new Error('Record not found');
      (error as any).statusCode = 404;
      (error as any).code = 'RECORD_NOT_FOUND';
      throw error;
    }

    sendSuccess(
      { message: 'Record deleted successfully' },
      req,
      res,
      { operation: 'delete_record' }
    );
  } catch (error) {
    handleApiError('delete_record', error, req, res, 'Failed to delete record');
  }
});
```

## Error Handling

### Common Error Types

```typescript
// Not Found
const error = new Error('Resource not found');
(error as any).statusCode = 404;
(error as any).code = 'RESOURCE_NOT_FOUND';

// Validation Error
const error = new Error('Invalid input data');
(error as any).statusCode = 400;
(error as any).code = 'VALIDATION_ERROR';

// Permission Error
const error = new Error('Insufficient permissions');
(error as any).statusCode = 403;
(error as any).code = 'INSUFFICIENT_PERMISSIONS';

// Server Error
const error = new Error('Internal server error');
(error as any).statusCode = 500;
(error as any).code = 'INTERNAL_ERROR';
```

### Error Codes Reference

| Code                       | Status | Description             |
| -------------------------- | ------ | ----------------------- |
| `VALIDATION_ERROR`         | 400    | Invalid request data    |
| `UNAUTHORIZED`             | 401    | Authentication required |
| `INSUFFICIENT_PERMISSIONS` | 403    | Permission denied       |
| `RESOURCE_NOT_FOUND`       | 404    | Resource not found      |
| `CONFLICT`                 | 409    | Resource conflict       |
| `INTERNAL_ERROR`           | 500    | Server error            |

## Response Options

### sendSuccess Options

```typescript
sendSuccess(data, req, res, {
  operation: 'operation_name',     // Required: for logging
  statusCode: 200,                 // Optional: default 200
  message: 'Success message',      // Optional: success message
  meta: {                          // Optional: metadata
    total: 100,
    page: 1,
    limit: 10
  }
});
```

### handleApiError Options

```typescript
handleApiError(
  'operation_name',                // Required: operation name
  error,                          // Required: error object
  req,                           // Required: request object
  res,                           // Required: response object
  'Default error message'         // Optional: fallback message
);
```

## Testing Examples

### Test Success Response

```typescript
const response = await request(app)
  .get('/api/records')
  .set('Authorization', `Bearer ${token}`);

expect(response.status).toBe(200);
expect(response.body.success).toBe(true);
expect(response.body.data).toBeDefined();
expect(response.body.data.records).toBeInstanceOf(Array);
```

### Test Error Response

```typescript
const response = await request(app)
  .get('/api/records/nonexistent')
  .set('Authorization', `Bearer ${token}`);

expect(response.status).toBe(404);
expect(response.body.success).toBe(false);
expect(response.body.error.code).toBe('RECORD_NOT_FOUND');
expect(response.body.error.message).toBeDefined();
```

### Test Validation Error

```typescript
const response = await request(app)
  .post('/api/records')
  .send({}) // Missing required fields
  .set('Authorization', `Bearer ${token}`);

expect(response.status).toBe(400);
expect(response.body.success).toBe(false);
expect(response.body.error.message).toContain('Invalid request data');
```

## Logging Context

### Request Context

```typescript
logApiRequest(req, {
  operation: 'list_records',
  filters: { type: 'bylaw', status: 'active' },
  userId: req.user?.id,
  userRole: req.user?.role
});
```

### Error Context

```typescript
try {
  // ... operation
} catch (error) {
  handleApiError('operation_name', error, req, res, 'Default message');
  // Automatically logs:
  // - Error details with stack trace
  // - Request context
  // - User information
  // - Operation name
}
```

## Migration Checklist

When migrating existing routes:

- [ ] Replace `res.json()` with `sendSuccess()`
- [ ] Replace `res.status().json()` with `handleApiError()`
- [ ] Add `logApiRequest()` at route start
- [ ] Wrap async operations in try-catch
- [ ] Use proper error codes and status codes
- [ ] Update tests to expect new response format
- [ ] Remove direct `console.log` statements

## Common Mistakes

❌ **Don't do this:**

```typescript
res.json({ data: result });
res.status(400).json({ error: 'Invalid input' });
console.log('Error:', error);
```

✅ **Do this instead:**

```typescript
sendSuccess(result, req, res, { operation: 'operation_name' });
handleApiError('operation_name', error, req, res);
logApiRequest(req, { operation: 'operation_name' });
```
