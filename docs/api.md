# CivicPress API Documentation

## Overview

The CivicPress API provides a RESTful interface for managing civic governance
records, workflows, and system administration. The API is built with Express.js
and supports OAuth authentication.

**Base URL**: `http://localhost:3000` (development)

## Authentication

The API uses OAuth-based authentication with JWT tokens. Most endpoints require
authentication via the `Authorization` header.

### Authentication Flow

1. **Get OAuth Token**: Obtain an OAuth token from a supported provider (GitHub)
2. **Login**: POST to `/auth/login` with the token
3. **Use Bearer Token**: Include the returned token in
   `Authorization: Bearer <token>` header

## Endpoints

### Authentication

#### POST /auth/login

Authenticate with an OAuth provider token.

**Request Body:**

```json
{
  "token": "github_oauth_token",
  "provider": "github"
}
```

**Response:**

```json
{
  "success": true,
  "session": {
    "token": "jwt_token_here",
    "user": {
      "id": "user_id",
      "username": "username",
      "role": "council",
      "email": "user@example.com",
      "name": "User Name",
      "avatar_url": "https://..."
    },
    "expiresAt": "2024-01-01T12:00:00Z"
  }
}
```

#### GET /auth/providers

Get available OAuth providers.

**Response:**

```json
{
  "success": true,
  "providers": ["github"]
}
```

#### GET /auth/me

Get current authenticated user information.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "user": {
    "id": "user_id",
    "username": "username",
    "role": "council",
    "email": "user@example.com",
    "name": "User Name",
    "avatar_url": "https://...",
    "permissions": []
  }
}
```

#### POST /auth/logout

Logout (stateless - client should delete token).

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Records

#### GET /api/records

List all records with optional filtering.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**

- `type` (optional): Filter by record type (`bylaw`, `policy`, `proposal`,
  `resolution`)
- `status` (optional): Filter by status (`draft`, `proposed`, `reviewed`,
  `approved`, `archived`)
- `limit` (optional): Number of records to return (default: 10)
- `offset` (optional): Number of records to skip (default: 0)

**Response:**

```json
{
  "records": [
    {
      "id": "article-001",
      "title": "Article 001 - Animal Control",
      "type": "bylaw",
      "status": "active",
      "content": "All dogs must be leashed in public parks...",
      "metadata": {
        "author": "City Council",
        "created": "2024-01-01T00:00:00Z",
        "updated": "2024-01-01T00:00:00Z",
        "version": "1.0.0"
      },
      "path": "records/bylaw/article-001---animal-control.md"
    }
  ],
  "total": 41,
  "page": 1,
  "limit": 10
}
```

#### GET /api/records/:id

Get a specific record by ID.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "id": "article-001",
  "title": "Article 001 - Animal Control",
  "type": "bylaw",
  "status": "active",
  "content": "All dogs must be leashed in public parks...",
  "metadata": {
    "author": "City Council",
    "created": "2024-01-01T00:00:00Z",
    "updated": "2024-01-01T00:00:00Z",
    "version": "1.0.0"
  },
  "path": "records/bylaw/article-001---animal-control.md"
}
```

#### POST /api/records

Create a new record.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "title": "New Bylaw",
  "type": "bylaw",
  "content": "Content of the new bylaw...",
  "role": "council",
  "metadata": {
    "author": "City Council",
    "version": "1.0.0"
  }
}
```

**Response:** `201 Created`

```json
{
  "id": "new-record-id",
  "title": "New Bylaw",
  "type": "bylaw",
  "status": "draft",
  "content": "Content of the new bylaw...",
  "metadata": {
    "author": "City Council",
    "created": "2024-01-01T00:00:00Z",
    "version": "1.0.0"
  },
  "path": "records/bylaw/new-bylaw.md"
}
```

#### PUT /api/records/:id

Update an existing record.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "title": "Updated Bylaw Title",
  "content": "Updated content...",
  "status": "proposed",
  "metadata": {
    "updated": "2024-01-01T00:00:00Z"
  }
}
```

**Response:**

```json
{
  "id": "article-001",
  "title": "Updated Bylaw Title",
  "type": "bylaw",
  "status": "proposed",
  "content": "Updated content...",
  "metadata": {
    "author": "City Council",
    "created": "2024-01-01T00:00:00Z",
    "updated": "2024-01-01T00:00:00Z",
    "version": "1.0.0"
  },
  "path": "records/bylaw/article-001---animal-control.md"
}
```

#### DELETE /api/records/:id

Archive a record (moves to archive, doesn't delete).

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "message": "Record article-001 archived successfully",
  "archivedAt": "2024-01-01T00:00:00Z",
  "archiveLocation": "archive/bylaw/article-001.md",
  "note": "Record has been moved to archive and is no longer active"
}
```

### Search

#### GET /api/search

Search records (placeholder implementation).

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**

- `q` (optional): Search query

**Response:**

```json
{
  "results": [],
  "total": 0,
  "query": "search term"
}
```

### Export/Import

#### GET /api/export

Export data (placeholder implementation).

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "message": "Export functionality",
  "formats": ["json", "csv", "markdown"]
}
```

#### POST /api/import

Import data (placeholder implementation).

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "message": "Import functionality",
  "formats": ["json", "csv", "markdown"]
}
```

### Hooks

#### GET /api/hooks

List all hooks.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "hooks": [],
  "total": 0
}
```

#### GET /api/hooks/:id

Get a specific hook.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "id": "hook-id",
  "name": "Sample Hook",
  "event": "record:created"
}
```

#### POST /api/hooks

Create a new hook.

**Headers:** `Authorization: Bearer <token>`

**Response:** `201 Created`

```json
{
  "message": "Hook created successfully"
}
```

#### PUT /api/hooks/:id

Update a hook.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "message": "Hook hook-id updated successfully"
}
```

#### DELETE /api/hooks/:id

Delete a hook.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "message": "Hook hook-id deleted successfully"
}
```

### Templates

#### GET /api/templates

List all templates.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "templates": [],
  "total": 0
}
```

#### GET /api/templates/:id

Get a specific template.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "id": "template-id",
  "name": "Sample Template",
  "content": "Template content here"
}
```

#### POST /api/templates

Create a new template.

**Headers:** `Authorization: Bearer <token>`

**Response:** `201 Created`

```json
{
  "message": "Template created successfully"
}
```

#### PUT /api/templates/:id

Update a template.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "message": "Template template-id updated successfully"
}
```

#### DELETE /api/templates/:id

Delete a template.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "message": "Template template-id deleted successfully"
}
```

### Workflows

#### GET /api/workflows

List all workflows.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "workflows": [],
  "total": 0
}
```

#### GET /api/workflows/:id

Get a specific workflow.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "id": "workflow-id",
  "name": "Sample Workflow",
  "status": "active"
}
```

#### POST /api/workflows

Create a new workflow.

**Headers:** `Authorization: Bearer <token>`

**Response:** `201 Created`

```json
{
  "message": "Workflow created successfully"
}
```

#### PUT /api/workflows/:id

Update a workflow.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "message": "Workflow workflow-id updated successfully"
}
```

#### DELETE /api/workflows/:id

Delete a workflow.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "message": "Workflow workflow-id deleted successfully"
}
```

### System

#### GET /health

Basic health check.

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "uptime": 12345.67,
  "version": "1.0.0",
  "environment": "development"
}
```

#### GET /health/detailed

Detailed health check with system information.

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "uptime": 12345.67,
  "version": "1.0.0",
  "environment": "development",
  "memory": {
    "used": 12345678,
    "total": 23456789,
    "external": 3456789
  },
  "platform": {
    "node": "v18.0.0",
    "arch": "x64",
    "platform": "darwin"
  }
}
```

#### GET /docs

API documentation (Swagger UI).

**Response:** HTML page with interactive API documentation.

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "details": "Additional error details"
  }
}
```

### Common HTTP Status Codes

- `200 OK`: Successful request
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Authentication required or failed
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

## Rate Limiting

Currently, no rate limiting is implemented. This may be added in future
versions.

## CORS

CORS is enabled with the following configuration:

- Origin: Configurable via `CORS_ORIGIN` environment variable (defaults to `*`)
- Credentials: `true`
- Methods: All standard HTTP methods
- Headers: Standard headers including `Authorization`

## Development

### Running the API Server

```bash
# From project root
pnpm run dev

# Or directly from API module
cd modules/api
pnpm run dev
```

### Environment Variables

- `PORT`: Server port (default: 3000)
- `CORS_ORIGIN`: CORS origin (default: `*`)
- `CIVIC_DATA_DIR`: Data directory path
- `NODE_ENV`: Environment (development/production)

### Testing

```bash
# Run all tests
pnpm run test:run

# Run API tests only
cd modules/api && pnpm test
```

## Examples

### Complete Authentication Flow

```bash
# 1. Get OAuth token from GitHub
# 2. Login with token
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"token": "github_oauth_token", "provider": "github"}'

# 3. Use returned token for authenticated requests
curl -X GET http://localhost:3000/api/records \
  -H "Authorization: Bearer <jwt_token>"
```

### Creating a Record

```bash
curl -X POST http://localhost:3000/api/records \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New Bylaw",
    "type": "bylaw",
    "content": "This is a new bylaw...",
    "metadata": {
      "author": "City Council",
      "version": "1.0.0"
    }
  }'
```

### Searching Records

```bash
curl -X GET "http://localhost:3000/api/records?type=bylaw&status=active&limit=5" \
  -H "Authorization: Bearer <token>"
```
