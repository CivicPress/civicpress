# API Changelog

## [1.2.0] - 2024-01-XX

### Added

- **Status API**: Comprehensive system monitoring and health endpoints
  - `GET /api/status` - System status with Git, records, and configuration info
  - `GET /api/status/git` - Detailed Git status with pending changes
  - `GET /api/status/records` - Record statistics by type and status
- **Validation API**: Record validation and quality checking
  - `POST /api/validation/record` - Validate single record with detailed issues
  - `POST /api/validation/bulk` - Bulk validation with summaries
  - `GET /api/validation/status` - System-wide validation status
  - `GET /api/validation/record/:recordId` - Validate specific record by ID
- **Validation Features**:
  - Frontmatter YAML validation
  - Required fields checking (title, type)
  - Status and type validation
  - Content analysis (length, TODO markers, template variables)
  - Issue categorization (error, warning, info)
  - Metadata extraction and validation

### Technical Details

#### Status API Response Format

```json
{
  "success": true,
  "data": {
    "system": {
      "status": "healthy",
      "uptime": 1234.56,
      "memory": { ... },
      "nodeVersion": "18.17.0",
      "platform": "darwin",
      "environment": "development"
    },
    "git": {
      "status": "clean|dirty",
      "modified": [...],
      "created": [...],
      "deleted": [...],
      "recentCommits": [...]
    },
    "records": {
      "totalRecords": 101,
      "byType": { "bylaw": 57, "policy": 25, ... },
      "byStatus": { "active": 7, "draft": 25, ... },
      "archive": { ... }
    },
    "configuration": {
      "exists": true,
      "files": [...],
      "workflows": { ... },
      "templates": { ... },
      "hooks": { ... }
    },
    "summary": {
      "totalRecords": 101,
      "pendingChanges": 0,
      "systemHealth": "healthy"
    }
  }
}
```

#### Validation API Response Format

```json
{
  "success": true,
  "data": {
    "recordId": "example-record",
    "isValid": true,
    "issues": [
      {
        "severity": "warning",
        "code": "TEMPLATE_VARIABLES",
        "message": "Record contains template variables",
        "field": "content"
      }
    ],
    "metadata": {
      "title": "Example Record",
      "type": "bylaw",
      "status": "draft",
      "author": "clerk",
      "created": "2024-01-01",
      "updated": "2024-01-01"
    }
  }
}
```

#### Validation Issue Types

- `MISSING_FRONTMATTER` - No YAML frontmatter found
- `MISSING_TITLE` - Record missing title field
- `MISSING_TYPE` - Record missing type field
- `MISSING_STATUS` - Record missing status (warning)
- `INVALID_STATUS` - Non-standard status value
- `INVALID_TYPE` - Non-standard type value
- `INVALID_YAML` - Malformed YAML frontmatter
- `SHORT_CONTENT` - Very short content (warning)
- `TODO_FOUND` - Contains TODO/FIXME markers (info)
- `TEMPLATE_VARIABLES` - Contains unresolved template variables (warning)
- `RECORD_NOT_FOUND` - Record file not found
- `READ_ERROR` - Failed to read record file

### Files Added

- `src/routes/status.ts` - Status API endpoints
- `src/routes/validation.ts` - Validation API endpoints
- `docs/status-api.md` - Status API documentation
- `docs/validation-api.md` - Validation API documentation

### Files Modified

- `src/index.ts` - Added status and validation routers
- `docs/README.md` - Updated endpoint list
- `docs/CHANGELOG.md` - Added version 1.2.0 entry

## [1.1.0] - 2024-01-XX

### Added

- **Centralized Response System**: Implemented standardized response, error
  handling, and logging across all API routes
- **Response Utilities**: Added `sendSuccess()`, `handleApiError()`,
  `handleValidationError()`, and `logApiRequest()` utilities
- **TypeScript Interfaces**: Added `SuccessResponse<T>` and `ErrorResponse`
  interfaces for type safety
- **Comprehensive Documentation**: Added detailed documentation for the
  centralized response system

### Changed

- **All Route Files**: Refactored to use centralized response utilities instead
  of direct `res.json()` calls
- **Error Handling**: Standardized error responses with consistent format and
  logging
- **Logging**: Implemented automatic request/response logging with context
  information
- **Response Format**: All responses now follow standardized success/error
  format

### Removed

- **Direct Response Calls**: Removed all direct `res.json()`, `res.send()`, and
  `res.status()` calls from routes
- **Manual Error Handling**: Removed manual error response formatting
- **Console Logging**: Removed direct `console.log` statements in favor of
  structured logging

### Technical Details

#### New Response Format

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

#### Files Modified

**Core Utilities:**

- `src/utils/api-logger.ts` - Added response utilities and interfaces

**Route Files Refactored:**

- `src/routes/auth.ts` - Authentication endpoints
- `src/routes/health.ts` - Health check endpoints
- `src/routes/records.ts` - Record management
- `src/routes/indexing.ts` - Indexing operations
- `src/routes/search.ts` - Search functionality
- `src/routes/export.ts` - Data export
- `src/routes/import.ts` - Data import
- `src/routes/hooks.ts` - Webhook management
- `src/routes/templates.ts` - Template management
- `src/routes/workflows.ts` - Workflow management
- `src/routes/docs.ts` - API documentation

**Documentation Added:**

- `docs/centralized-response-system.md` - Complete system guide
- `docs/quick-reference.md` - Developer quick reference
- `docs/README.md` - Updated main documentation

#### Migration Impact

**For API Consumers:**

- All responses now include `success` boolean field
- Error responses have consistent structure
- Response data is wrapped in `data` field
- Metadata available in `meta` field

**For Developers:**

- Use `sendSuccess()` instead of `res.json()`
- Use `handleApiError()` instead of manual error handling
- Add `logApiRequest()` at route start
- Follow standardized error codes

#### Error Codes

| Code                       | Status | Description             |
| -------------------------- | ------ | ----------------------- |
| `VALIDATION_ERROR`         | 400    | Invalid request data    |
| `UNAUTHORIZED`             | 401    | Authentication required |
| `INSUFFICIENT_PERMISSIONS` | 403    | Permission denied       |
| `RESOURCE_NOT_FOUND`       | 404    | Resource not found      |
| `CONFLICT`                 | 409    | Resource conflict       |
| `INTERNAL_ERROR`           | 500    | Server error            |

### Breaking Changes

**Response Format Changes:**

- All success responses now include `success: true` field
- Response data is wrapped in `data` field
- Error responses have consistent structure with `success: false`

**Example Migration:**

```typescript
// Before
res.json({ records: [] });

// After
sendSuccess({ records: [] }, req, res, { operation: 'list_records' });
```

### Testing

- All existing tests updated to expect new response format
- New tests added for response utilities
- Error handling tests updated for standardized format

### Documentation

- Complete system documentation added
- Quick reference guide for developers
- Migration guide for existing code
- Best practices and examples

## [1.0.0] - 2024-01-XX

### Initial Release

- Basic API endpoints
- OAuth authentication
- Record management
- Indexing functionality
- Health checks
