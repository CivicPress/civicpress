# CivicPress API Documentation

## Overview

The CivicPress API provides a RESTful interface for managing civic records,
workflows, and governance processes. The API uses a centralized response system
for consistent error handling, logging, and response formatting.

## Quick Start

### Installation

```bash
cd modules/api
pnpm install
pnpm run build
```

### Development

```bash
pnpm run dev
```

The API will be available at `http://localhost:3000`.

## API Response System

The API uses a centralized response system that ensures:

- **Consistent Response Format**: All responses follow a standardized structure
- **Centralized Error Handling**: Uniform error responses with proper logging
- **Request/Response Logging**: Automatic logging with context information
- **Type Safety**: TypeScript interfaces for all response types

### Basic Usage

```typescript
import { sendSuccess, handleApiError, logApiRequest } from '../utils/api-logger';

router.get('/records', async (req, res) => {
  logApiRequest(req, { operation: 'list_records' });

  try {
    const records = await recordsService.listRecords();
    sendSuccess(records, req, res, { operation: 'list_records' });
  } catch (error) {
    handleApiError('list_records', error, req, res, 'Failed to list records');
  }
});
```

### Response Format

**Success Response:**

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message",
  "meta": { ... }
}
```

**Error Response:**

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "details": "Additional details"
  }
}
```

## Documentation

- [Centralized Response System](./centralized-response-system.md) - Complete
  guide to the response system
- [Quick Reference](./quick-reference.md) - Developer quick reference
- [Error Handling](./error-handling.md) - Error handling patterns
- [API Standards](./api-standards.md) - API design standards
- [History API](./history-api.md) - Git commit history endpoints

## Available Endpoints

### Authentication

- `POST /api/auth/login` - Authenticate with OAuth
- `GET /api/auth/providers` - Get available OAuth providers
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/logout` - Logout

### Records

- `GET /api/records` - List records
- `GET /api/records/:id` - Get specific record
- `POST /api/records` - Create record
- `PUT /api/records/:id` - Update record
- `DELETE /api/records/:id` - Delete record

### Status & System Information

- `GET /api/status` - Get comprehensive system status
- `GET /api/status/git` - Get detailed Git status
- `GET /api/status/records` - Get record statistics

### Validation

- `POST /api/validation/record` - Validate a single record
- `POST /api/validation/bulk` - Validate multiple records
- `GET /api/validation/status` - Get validation status and issues
- `GET /api/validation/record/:recordId` - Validate specific record by ID

### Diff & Comparison

- `GET /api/diff/:recordId` - Compare record versions between commits
- `GET /api/diff/:recordId/history` - Get commit history for a record
- `POST /api/diff/bulk` - Bulk diff operations on multiple records
- `GET /api/diff/commits/:commit1/:commit2` - Compare all records between
  commits

### Indexing

- `POST /api/indexing/generate` - Generate indexes
- `GET /api/indexing/status` - Get indexing status
- `POST /api/indexing/sync` - Sync records to database
- `GET /api/indexing/search` - Search records

### Health

- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health information
- `POST /health/test-error` - Test error logging

### Other Endpoints

- `GET /api/search` - Search functionality
- `GET /api/export` - Export data
- `POST /api/import` - Import data
- `GET /api/hooks` - List webhooks
- `GET /api/templates` - List templates
- `GET /api/workflows` - List workflows
- `GET /api/history` - Get Git commit history
- `GET /api/history/:record` - Get history for specific record
- `GET /docs` - API documentation

## Authentication

The API uses OAuth-based authentication with support for multiple providers:

- GitHub OAuth
- Google OAuth (planned)
- Microsoft OAuth (planned)

### Authentication Flow

1. Client obtains OAuth token from provider
2. Client sends token to `/api/auth/login`
3. API validates token and returns session
4. Client includes session token in `Authorization` header

### Authorization

The API uses role-based access control:

- **Public**: Read-only access to published records
- **Citizen**: Can create and edit records
- **Council**: Can approve and manage records
- **Admin**: Full system access

## Error Codes

| Code                       | Status | Description             |
| -------------------------- | ------ | ----------------------- |
| `VALIDATION_ERROR`         | 400    | Invalid request data    |
| `UNAUTHORIZED`             | 401    | Authentication required |
| `INSUFFICIENT_PERMISSIONS` | 403    | Permission denied       |
| `RESOURCE_NOT_FOUND`       | 404    | Resource not found      |
| `CONFLICT`                 | 409    | Resource conflict       |
| `INTERNAL_ERROR`           | 500    | Server error            |

## Testing

### Run Tests

```bash
pnpm run test:run
```

### Test Structure

Tests are organized by endpoint:

```
tests/api/
├── auth.test.ts
├── records.test.ts
├── indexing.test.ts
├── health.test.ts
└── ...
```

### Test Examples

```typescript
// Test success response
const response = await request(app)
  .get('/api/records')
  .set('Authorization', `Bearer ${token}`);

expect(response.status).toBe(200);
expect(response.body.success).toBe(true);
expect(response.body.data).toBeDefined();

// Test error response
const response = await request(app)
  .get('/api/records/nonexistent')
  .set('Authorization', `Bearer ${token}`);

expect(response.status).toBe(404);
expect(response.body.success).toBe(false);
expect(response.body.error.code).toBe('RECORD_NOT_FOUND');
```

## Configuration

### Environment Variables

```bash
# API Configuration
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=sqlite:./data/civicpress.db

# Authentication
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Logging
LOG_LEVEL=info
```

### Logging

The API uses structured logging with the following levels:

- `error` - Error conditions
- `warn` - Warning conditions
- `info` - General information
- `debug` - Debug information

Logs include:

- Request ID for tracing
- User information
- Operation context
- Performance metrics

## Development

### Adding New Endpoints

1. Create route file in `src/routes/`
2. Use centralized response utilities
3. Add proper error handling
4. Write tests
5. Update documentation

### Example Route

```typescript
import { Router } from 'express';
import { sendSuccess, handleApiError, logApiRequest } from '../utils/api-logger';

export const exampleRouter = Router();

exampleRouter.get('/', async (req, res) => {
  logApiRequest(req, { operation: 'example_operation' });

  try {
    const result = await service.operation();
    sendSuccess(result, req, res, { operation: 'example_operation' });
  } catch (error) {
    handleApiError('example_operation', error, req, res, 'Operation failed');
  }
});
```

## Contributing

1. Follow the centralized response system
2. Use proper error codes and status codes
3. Add comprehensive logging
4. Write tests for all endpoints
5. Update documentation

## Related Documentation

- [Core Module](../core/README.md) - Core functionality
- [CLI Module](../cli/README.md) - Command-line interface
- [Project Overview](../../README.md) - Overall project documentation
