# CivicPress API Documentation

## Overview

The CivicPress API provides a RESTful interface for managing civic governance
records, workflows, and system administration. The API is built with Express.js
and supports multiple authentication methods.

**Base URL**: `http://localhost:3000` (development)

## Authentication

The API uses Bearer token authentication. Most endpoints require authentication
via the `Authorization` header.

### Authentication Methods

1. **GitHub OAuth** (Production)
2. **Username/Password** (Traditional)
3. **Simulated Accounts** (Development only)

### Authentication Flow

1. **Authenticate**: POST to `/auth/login` or `/auth/password` with credentials
2. **Get Token**: Receive JWT token in response
3. **Use Bearer Token**: Include token in `Authorization: Bearer <token>` header

## Endpoints

### Authentication

#### POST /auth/login

Authenticate with OAuth provider token.

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
  "data": {
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
}
```

#### POST /auth/password

Authenticate with username and password.

**Request Body:**

```json
{
  "username": "your_username",
  "password": "your_password"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
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
}
```

#### POST /auth/simulated

Authenticate with simulated account (development only).

**Request Body:**

```json
{
  "username": "testuser",
  "role": "council"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "session": {
      "token": "jwt_token_here",
      "user": {
        "id": "user_id",
        "username": "testuser",
        "role": "council",
        "email": "testuser@simulated.local",
        "name": "testuser",
        "avatar_url": "https://..."
      },
      "expiresAt": "2024-01-01T12:00:00Z"
    }
  }
}
```

#### GET /auth/providers

Get available OAuth providers.

**Response:**

```json
{
  "success": true,
  "data": {
    "providers": ["github"]
  }
}
```

#### GET /auth/me

Get current authenticated user information.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "username": "username",
      "role": "council",
      "email": "user@example.com",
      "name": "User Name",
      "avatar_url": "https://...",
      "permissions": ["records:create", "records:edit", "records:view"]
    }
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
  "data": {
    "message": "Logged out successfully"
  }
}
```

### Records

#### GET /api/records

List records with filtering and pagination.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**

- `type` (optional): Filter by record type (bylaw, policy, resolution, etc.)
- `status` (optional): Filter by status (draft, proposed, approved, archived)
- `limit` (optional): Number of records per page (default: 10, max: 100)
- `offset` (optional): Number of records to skip (default: 0)

**Response:**

```json
{
  "success": true,
  "data": {
    "records": [
      {
        "id": "noise-restrictions",
        "title": "Règlement sur les restrictions de bruit",
        "type": "bylaw",
        "status": "draft",
        "content": "# Règlement sur les restrictions de bruit\n\n...",
        "metadata": {
          "author": "admin",
          "created": "2025-07-18T20:50:14.489Z",
          "updated": "2025-07-23T21:15:08.491Z",
          "tags": ["noise", "nighttime", "curfew", "bruit", "nuit"]
        },
        "path": "records/bylaw/noise-restrictions.md",
        "author": "admin",
        "created_at": "2025-07-18 20:50:14",
        "updated_at": "2025-07-23 21:15:08"
      }
    ],
    "total": 1,
    "limit": 10,
    "offset": 0
  }
}
```

#### GET /api/records/:id

Get a specific record by ID.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "data": {
    "record": {
      "id": "noise-restrictions",
      "title": "Règlement sur les restrictions de bruit",
      "type": "bylaw",
      "status": "draft",
      "content": "# Règlement sur les restrictions de bruit\n\n...",
      "metadata": {
        "author": "admin",
        "created": "2025-07-18T20:50:14.489Z",
        "updated": "2025-07-23T21:15:08.491Z",
        "tags": ["noise", "nighttime", "curfew", "bruit", "nuit"]
      },
      "path": "records/bylaw/noise-restrictions.md",
      "author": "admin",
      "created_at": "2025-07-18 20:50:14",
      "updated_at": "2025-07-23 21:15:08"
    }
  }
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
  "content": "# New Bylaw\n\nThis is a new bylaw...",
  "status": "draft",
  "metadata": {
    "author": "City Council",
    "tags": ["test", "example"]
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "record": {
      "id": "new-bylaw",
      "title": "New Bylaw",
      "type": "bylaw",
      "status": "draft",
      "content": "# New Bylaw\n\nThis is a new bylaw...",
      "metadata": {
        "author": "City Council",
        "created": "2025-07-23T21:15:08.491Z",
        "tags": ["test", "example"]
      },
      "path": "records/bylaw/new-bylaw.md"
    }
  }
}
```

#### PUT /api/records/:id

Update an existing record.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "title": "Updated Bylaw",
  "content": "# Updated Bylaw\n\nThis is an updated bylaw...",
  "status": "proposed",
  "metadata": {
    "author": "City Council",
    "tags": ["updated", "example"]
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "record": {
      "id": "new-bylaw",
      "title": "Updated Bylaw",
      "type": "bylaw",
      "status": "proposed",
      "content": "# Updated Bylaw\n\nThis is an updated bylaw...",
      "metadata": {
        "author": "City Council",
        "updated": "2025-07-23T21:15:08.491Z",
        "tags": ["updated", "example"]
      },
      "path": "records/bylaw/new-bylaw.md"
    }
  }
}
```

#### DELETE /api/records/:id

Archive/delete a record.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "Record archived successfully",
    "archivedAt": "2025-07-23T21:15:08.491Z",
    "archiveLocation": "archive/bylaw/new-bylaw.md"
  }
}
```

### Search

#### GET /api/search

Search records with full-text search capabilities.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**

- `q` (required): Search query
- `type` (optional): Filter by record type
- `status` (optional): Filter by status
- `limit` (optional): Number of results (default: 10, max: 100)
- `offset` (optional): Number of results to skip (default: 0)

**Response:**

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "noise-restrictions",
        "title": "Règlement sur les restrictions de bruit",
        "type": "bylaw",
        "status": "draft",
        "content": "# Règlement sur les restrictions de bruit\n\n...",
        "metadata": {
          "author": "admin",
          "created": "2025-07-18T20:50:14.489Z",
          "updated": "2025-07-23T21:15:08.491Z",
          "tags": ["noise", "nighttime", "curfew", "bruit", "nuit"]
        },
        "path": "records/bylaw/noise-restrictions.md",
        "author": "admin",
        "created_at": "2025-07-18 20:50:14",
        "updated_at": "2025-07-23 21:15:08"
      }
    ],
    "total": 1,
    "query": "bruit"
  }
}
```

### Configuration

#### GET /api/config/record-types

Get available record types.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "data": {
    "types": [
      {
        "value": "bylaw",
        "label": "Bylaw",
        "description": "Municipal bylaws and ordinances",
        "icon": "gavel"
      },
      {
        "value": "policy",
        "label": "Policy",
        "description": "Administrative policies",
        "icon": "document"
      },
      {
        "value": "resolution",
        "label": "Resolution",
        "description": "Council resolutions",
        "icon": "check-circle"
      }
    ]
  }
}
```

#### GET /api/config/record-statuses

Get available record statuses.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "data": {
    "statuses": [
      {
        "value": "draft",
        "label": "Draft",
        "description": "Initial state, editable",
        "color": "gray"
      },
      {
        "value": "proposed",
        "label": "Proposed",
        "description": "Submitted for review",
        "color": "blue"
      },
      {
        "value": "approved",
        "label": "Approved",
        "description": "Finalized and active",
        "color": "green"
      },
      {
        "value": "archived",
        "label": "Archived",
        "description": "No longer in effect",
        "color": "red"
      }
    ]
  }
}
```

### Status & Health

#### GET /health

Basic health check (no authentication required).

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-07-23T21:15:08.491Z",
    "version": "1.0.0"
  }
}
```

#### GET /info

Get system information.

**Headers:** `Authorization: Bearer <token>` (optional)

**Response:**

```json
{
  "success": true,
  "data": {
    "organization": {
      "name": "City of Springfield",
      "location": "Springfield, USA"
    },
    "user": {
      "id": "user_id",
      "username": "username",
      "role": "council"
    }
  }
}
```

#### GET /api/status

Get comprehensive system status.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "data": {
    "system": {
      "status": "healthy",
      "version": "1.0.0",
      "uptime": 3600
    },
    "git": {
      "status": "clean",
      "lastCommit": "abc123",
      "branch": "main"
    },
    "records": {
      "total": 15,
      "byType": {
        "bylaw": 8,
        "policy": 5,
        "resolution": 2
      },
      "byStatus": {
        "draft": 3,
        "proposed": 5,
        "approved": 7
      }
    }
  }
}
```

### Export & Import

#### GET /api/export

Export records in various formats.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**

- `format` (optional): Export format (json, csv, markdown)
- `type` (optional): Filter by record type
- `status` (optional): Filter by status

**Response:**

```json
{
  "success": true,
  "data": {
    "export": {
      "format": "json",
      "records": [...],
      "exportedAt": "2025-07-23T21:15:08.491Z"
    }
  }
}
```

#### POST /api/import

Import records from external sources.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "records": [
    {
      "title": "Imported Policy",
      "type": "policy",
      "content": "# Imported Policy\n\nContent...",
      "status": "draft"
    }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "imported": 1,
    "errors": [],
    "importedAt": "2025-07-23T21:15:08.491Z"
  }
}
```

## Error Handling

All API endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "details": {
      "field": "additional error details"
    }
  }
}
```

### Common Error Codes

| Code                       | Status | Description             |
| -------------------------- | ------ | ----------------------- |
| `VALIDATION_ERROR`         | 400    | Invalid request data    |
| `UNAUTHORIZED`             | 401    | Authentication required |
| `INSUFFICIENT_PERMISSIONS` | 403    | Permission denied       |
| `RESOURCE_NOT_FOUND`       | 404    | Resource not found      |
| `CONFLICT`                 | 409    | Resource conflict       |
| `INTERNAL_ERROR`           | 500    | Server error            |

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
# 1. Authenticate with simulated account (development)
curl -X POST http://localhost:3000/auth/simulated \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "role": "admin"}'

# 2. Use returned token for authenticated requests
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
    "status": "draft"
  }'
```

### Searching Records

```bash
curl -X GET "http://localhost:3000/api/search?q=policy&limit=5" \
  -H "Authorization: Bearer <token>"
```

### Getting Configuration

```bash
curl -X GET http://localhost:3000/api/config/record-types \
  -H "Authorization: Bearer <token>"
```
