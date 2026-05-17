# API Documentation

## Overview

The CivicPress API provides RESTful endpoints for managing civic records, users,
and system configuration. The API uses JWT-based authentication and follows
standard HTTP status codes.

## Authentication

### JWT Token Flow

1. **Login**: POST `/api/v1/auth/password` or `/api/v1/auth/login` with
   credentials
2. **Get Token**: Receive JWT token in response
3. **Use Bearer Token**: Include token in `Authorization: Bearer <token>` header

### Public vs Protected Endpoints

#### **Public Endpoints** (No Authentication Required)

These endpoints are accessible without authentication:

- `GET /api/v1/health` - Health check
- `GET /api/v1/health/detailed` - Detailed health info
- `GET /api/v1/info` - System/organization info (partial)
- `GET /api/v1/status` - Get system status
- `GET /api/v1/status/git` - Get Git repository status
- `GET /api/v1/status/records` - Get records statistics
- `GET /api/v1/system/record-types` - Get available record types
- `GET /api/v1/system/record-statuses` - Get available record statuses
- `GET /api/v1/config/attachment-types` - Get attachment type categories
- `GET /api/v1/config/link-categories` - Get link categories
- `POST /api/v1/config/:type/validate` - Validate configuration
- `GET /api/v1/records` - List records (read-only)
- `GET /api/v1/records/:id` - Get specific record (read-only)
- `GET /api/v1/search` - Search records (read-only)
- `GET /api/v1/geography` - List geography files
- `GET /api/v1/geography/:id` - Get geography file
- `GET /api/v1/geography/presets` - List geography presets
- `POST /api/v1/geography/validate` - Validate geography content
- `GET /api/v1/auth/csrf-token` - Get CSRF token
- `GET /api/v1/auth/providers` - List OAuth providers
- `POST /api/v1/users/register` - Public user registration
- `GET /api/v1/docs` - Swagger UI
- `GET /api/v1/docs/api-docs.json` - OpenAPI schema JSON

#### **Protected Endpoints** (Authentication Required)

These endpoints require valid authentication and appropriate permissions:

- **User Management**: All `/api/v1/users/*` endpoints (admin only)
- **Record Management**: POST, PUT, DELETE on `/api/v1/records/*`
  (permission-based)
- **Authentication**: `/auth/*` endpoints for login/logout
- **System Operations**: Export, import, hooks, etc. (role-based)

#### **Permission-Based Access**

Protected endpoints use role-based permissions:

- **Admin**: Full access to all endpoints
- **Council**: Can create, edit, and approve records
- **Clerk**: Can create and edit records
- **Public**: Can only view published records

## Endpoints

### Authentication Endpoints

All auth endpoints are mounted at `/api/v1/auth`.

#### GET /api/v1/auth/csrf-token

Get a CSRF token for form submissions (public endpoint).

#### POST /api/v1/auth/login

Authenticate with an OAuth provider token.

**Request Body:**

```json
{
  "provider": "github|google|microsoft",
  "token": "string"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "name": "Administrator",
      "role": "admin",
      "avatar_url": null
    },
    "expiresAt": "2025-07-31T21:33:40.000Z"
  }
}
```

#### POST /api/v1/auth/password

Authenticate with username and password.

**Request Body:**

```json
{
  "username": "string",
  "password": "string"
}
```

**Response:** Same format as `/api/v1/auth/login`.

#### GET /api/v1/auth/providers

List available OAuth providers (public endpoint).

**Response:**

```json
{
  "success": true,
  "data": {
    "providers": ["github", "google", "microsoft"]
  }
}
```

#### GET /api/v1/auth/me

Get the currently authenticated user.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "name": "Administrator",
      "role": "admin",
      "avatar_url": null
    }
  }
}
```

#### POST /api/v1/auth/logout

Logout (stateless, invalidates token).

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

#### POST /api/v1/auth/simulated

Create a simulated user session (development/test only, disabled in production).

#### POST /api/v1/users/register

Register a new user account (public endpoint).

**Request Body:**

```json
{
  "username": "string (required)",
  "email": "string (required)",
  "password": "string (required)",
  "name": "string (optional)"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 2,
      "username": "newuser",
      "email": "newuser@example.com",
      "name": "New User",
      "role": "public",
      "avatar_url": null,
      "created_at": "2025-07-30T21:33:40.000Z"
    },
    "message": "User registered successfully"
  }
}
```

### Records

#### GET /api/v1/records

List all records (public endpoint).

**Query Parameters:**

- `type` (optional): Filter by record type
- `status` (optional): Filter by record status
- `limit` (optional): Number of records per page (default: 10, max: 100)
- `offset` (optional): Number of records to skip (default: 0)

**Response:**

```json
{
  "success": true,
  "data": {
    "records": [
      {
        "id": 1,
        "title": "Noise Restrictions Ordinance",
        "type": "bylaw",
        "status": "approved",
        "content": "# Règlement sur les restrictions de bruit\n\n...",
        "metadata": {
          "author": "admin",
          "created": "2025-07-18T20:50:14.489Z",
          "updated": "2025-07-23T21:15:08.491Z",
          "tags": ["noise", "nighttime", "curfew"]
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

#### GET /api/v1/records/:id

Get a specific record by ID (public endpoint).

**Response:**

```json
{
  "success": true,
  "data": {
    "record": {
      "id": 1,
      "title": "Noise Restrictions Ordinance",
      "type": "bylaw",
      "status": "approved",
      "content": "# Règlement sur les restrictions de bruit\n\n...",
      "metadata": {
        "author": "admin",
        "created": "2025-07-18T20:50:14.489Z",
        "updated": "2025-07-23T21:15:08.491Z",
        "tags": ["noise", "nighttime", "curfew"]
      },
      "path": "records/bylaw/noise-restrictions.md",
      "author": "admin",
      "created_at": "2025-07-18 20:50:14",
      "updated_at": "2025-07-23 21:15:08",
      "commit_ref": null,
      "commit_signature": null
    }
  }
}
```

#### POST /api/v1/records

Create a new record (requires authentication).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "title": "string (required)",
  "type": "string (required)",
  "content": "string (required)",
  "status": "string (optional, default: draft)"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "record": {
      "id": 2,
      "title": "New Policy Document",
      "type": "policy",
      "status": "draft",
      "content": "# New Policy\n\n...",
      "metadata": {
        "author": "admin",
        "created": "2025-07-30T21:33:40.000Z",
        "updated": "2025-07-30T21:33:40.000Z",
        "tags": []
      },
      "path": "records/policy/new-policy-document.md",
      "author": "admin",
      "created_at": "2025-07-30 21:33:40",
      "updated_at": "2025-07-30 21:33:40",
      "commit_ref": null,
      "commit_signature": null
    },
    "message": "Record created successfully"
  }
}
```

#### PUT /api/v1/records/:id

Update an existing record (requires authentication).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "title": "string (optional)",
  "content": "string (optional)",
  "status": "string (optional)"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "record": {
      "id": 1,
      "title": "Updated Noise Restrictions Ordinance",
      "type": "bylaw",
      "status": "approved",
      "content": "# Updated Règlement sur les restrictions de bruit\n\n...",
      "metadata": {
        "author": "admin",
        "created": "2025-07-18T20:50:14.489Z",
        "updated": "2025-07-30T21:35:20.000Z",
        "tags": ["noise", "nighttime", "curfew", "updated"]
      },
      "path": "records/bylaw/noise-restrictions.md",
      "author": "admin",
      "created_at": "2025-07-18 20:50:14",
      "updated_at": "2025-07-30 21:35:20",
      "commit_ref": null,
      "commit_signature": null
    },
    "message": "Record updated successfully"
  }
}
```

#### DELETE /api/v1/records/:id

Delete a record (requires authentication).

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "Record deleted successfully",
    "deletedAt": "2025-07-30T21:35:20.000Z"
  }
}
```

#### GET /api/v1/records/summary

Get aggregate record counts by type and status (optional auth).

#### GET /api/v1/records/drafts

List draft records (requires `records:view` permission).

#### GET /api/v1/records/:id/raw

Get raw markdown content of a record (optional auth).

#### GET /api/v1/records/:id/frontmatter

Get parsed frontmatter YAML of a record (optional auth).

#### POST /api/v1/records/:id/status

Change a record's status (requires `records:edit` permission).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "status": "string (required)"
}
```

#### GET /api/v1/records/:id/transitions

Get allowed status transitions for a record (requires authentication).

#### PUT /api/v1/records/:id/draft

Save a draft version of a record (requires `records:edit` permission).

#### DELETE /api/v1/records/:id/draft

Delete a draft version (requires `records:edit` permission).

#### POST /api/v1/records/:id/publish

Publish a draft record (requires `records:edit` permission).

#### POST /api/v1/records/:id/lock

Acquire an edit lock on a record (requires `records:edit` permission).

#### DELETE /api/v1/records/:id/lock

Release an edit lock (requires `records:edit` permission).

#### GET /api/v1/records/:id/lock

Get the lock status of a record (requires `records:edit` permission).

### Validation

CivicPress provides comprehensive validation endpoints for records using JSON
Schema validation. All validation endpoints require authentication.

#### POST /api/v1/validation/record

Validate a single record by ID.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "recordId": "record-1234567890",
  "type": "bylaw"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "recordId": "record-1234567890",
    "isValid": true,
    "issues": [],
    "metadata": {
      "title": "Noise Restrictions Bylaw",
      "type": "bylaw",
      "status": "published",
      "author": "mctremblay",
      "created": "2025-01-15T10:00:00Z",
      "updated": "2025-02-01T14:30:00Z",
      "schemaValid": true,
      "schemaErrors": 0,
      "schemaWarnings": 0
    }
  }
}
```

**Error Response (Invalid Record):**

```json
{
  "success": true,
  "data": {
    "recordId": "record-1234567890",
    "isValid": false,
    "issues": [
      {
        "severity": "error",
        "code": "MISSING_REQUIRED_FIELD",
        "message": "Missing required field: author",
        "field": "author",
        "suggestion": "Add the \"author\" field to the frontmatter"
      },
      {
        "severity": "warning",
        "code": "INVALID_FORMAT",
        "message": "Field \"created\" must be a valid date-time",
        "field": "created",
        "suggestion": "Use ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ"
      }
    ],
    "metadata": {
      "schemaValid": false,
      "schemaErrors": 1,
      "schemaWarnings": 1
    }
  }
}
```

#### POST /api/v1/validation/bulk

Validate multiple records at once.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "recordIds": ["record-1", "record-2", "record-3"],
  "types": ["bylaw", "policy", "bylaw"],
  "includeContent": false
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "recordId": "record-1",
        "isValid": true,
        "issues": []
      },
      {
        "recordId": "record-2",
        "isValid": false,
        "issues": [
          {
            "severity": "error",
            "code": "MISSING_REQUIRED_FIELD",
            "message": "Missing required field: title",
            "field": "title"
          }
        ]
      }
    ],
    "summary": {
      "totalRecords": 3,
      "validCount": 2,
      "invalidCount": 1,
      "bySeverity": {
        "error": 1,
        "warning": 0,
        "info": 0
      }
    }
  }
}
```

#### GET /api/v1/validation/record/:recordId

Get validation results for a specific record.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**

- `type` - Record type (optional, helps locate the record faster)

**Response:** Same format as `POST /api/v1/validation/record`

#### GET /api/v1/validation/status

Get validation status across all records.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**

- `type` - Filter by record type (optional)
- `severity` - Filter by severity: `error`, `warning`, or `info` (optional)
- `limit` - Maximum number of issues to return (optional, default: 50, max: 100)

**Response:**

```json
{
  "success": true,
  "data": {
    "issues": [
      {
        "severity": "error",
        "code": "MISSING_REQUIRED_FIELD",
        "message": "Missing required field: author",
        "field": "author",
        "recordId": "record-123",
        "recordType": "bylaw",
        "file": "records/bylaw/record-123.md"
      }
    ],
    "summary": {
      "totalIssues": 5,
      "bySeverity": {
        "error": 3,
        "warning": 2,
        "info": 0
      },
      "byType": {
        "bylaw": 2,
        "policy": 3
      }
    }
  }
}
```

**Validation Features:**

- **Schema Validation**: Validates frontmatter against JSON Schema (base +
  type + module + plugin schemas)
- **Business Rule Validation**: Validates relationships, compliance fields, and
  business logic
- **Clear Error Messages**: Field-level errors with suggestions for fixing
- **Metadata Extraction**: Returns parsed record metadata if validation succeeds
- **Bulk Operations**: Validate multiple records efficiently

### Search

#### GET /api/v1/search

Search records with full-text search capabilities.

**Query Parameters:**

- `q` (required): Search query
- `type` (optional): Filter by record type
- `status` (optional): Filter by record status
- `limit` (optional): Number of results per page (default: 10, max: 100)
- `offset` (optional): Number of results to skip (default: 0)

**Response:**

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": 1,
        "title": "Règlement sur les restrictions de bruit",
        "type": "bylaw",
        "status": "draft",
        "content": "# Règlement sur les restrictions de bruit\n\n...",
        "score": 0.85,
        "highlights": {
          "title": ["<mark>Règlement</mark> sur les restrictions de bruit"],
          "content": ["...<mark>règlement</mark> sur le bruit..."]
        }
      }
    ],
    "total": 1,
    "limit": 10,
    "offset": 0
  }
}
```

#### GET /api/v1/search/suggestions

Get search suggestions for autocomplete (optional auth).

**Query Parameters:**

- `q` (required): Partial search query

### User Management

#### GET /api/v1/users

List all users (admin only).

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**

- `limit` (optional): Number of users per page (default: 10, max: 100)
- `offset` (optional): Number of users to skip (default: 0)

**Response:**

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": 1,
        "username": "admin",
        "email": "admin@example.com",
        "name": "Administrator",
        "role": "admin",
        "avatar_url": null,
        "created_at": "2025-07-30T21:33:40.000Z",
        "updated_at": "2025-07-30T21:33:40.000Z"
      }
    ],
    "total": 1,
    "limit": 10,
    "offset": 0
  }
}
```

#### GET /api/v1/users/:id

Get a specific user by ID (admin only).

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "name": "Administrator",
      "role": "admin",
      "avatar_url": null,
      "created_at": "2025-07-30T21:33:40.000Z",
      "updated_at": "2025-07-30T21:33:40.000Z"
    }
  }
}
```

#### POST /api/v1/users

Create a new user (admin only).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "username": "string (required)",
  "email": "string (required)",
  "password": "string (required)",
  "name": "string (optional)",
  "role": "string (required)"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 2,
      "username": "clerk",
      "email": "clerk@example.com",
      "name": "City Clerk",
      "role": "clerk",
      "avatar_url": null,
      "created_at": "2025-07-30T21:33:40.000Z",
      "updated_at": "2025-07-30T21:33:40.000Z"
    },
    "message": "User created successfully"
  }
}
```

#### PUT /api/v1/users/:id

Update an existing user (admin only).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "username": "string (optional)",
  "email": "string (optional)",
  "name": "string (optional)",
  "role": "string (optional)",
  "password": "string (optional)"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 2,
      "username": "clerk_updated",
      "email": "clerk@example.com",
      "name": "Senior City Clerk",
      "role": "clerk",
      "avatar_url": null,
      "created_at": "2025-07-30T21:33:40.000Z",
      "updated_at": "2025-07-30T21:35:20.000Z"
    },
    "message": "User updated successfully"
  }
}
```

#### DELETE /api/v1/users/:id

Delete a user (admin only).

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "User deleted successfully",
    "deletedAt": "2025-07-30T21:35:20.000Z"
  }
}
```

### User Security Management

#### POST /api/v1/users/:id/change-password

Change user password (self-service or admin).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "currentPassword": "string (required)",
  "newPassword": "string (required)"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Error Responses:**

- `400 Bad Request`: Invalid password format or incorrect current password
- `403 Forbidden`: User authenticated via external provider (GitHub, Google,
  etc.)
- `401 Unauthorized`: Missing or invalid authentication

#### POST /api/v1/users/:id/set-password

Set user password (admin only).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "password": "string (required)"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Password set successfully"
}
```

**Error Responses:**

- `403 Forbidden`: User authenticated via external provider or insufficient
  admin privileges
- `404 Not Found`: User not found

#### POST /api/v1/users/:id/request-email-change

Request email address change (self-service or admin).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "email": "string (required)"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Email change requested successfully",
  "requiresVerification": true
}
```

**Error Responses:**

- `400 Bad Request`: Invalid email format or email already in use
- `403 Forbidden`: Insufficient permissions (can only change own email unless
  admin)

#### POST /api/v1/users/verify-email-change

Complete email verification (no authentication required).

**Request Body:**

```json
{
  "token": "string (required)"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Email address verified successfully"
}
```

**Error Responses:**

- `400 Bad Request`: Invalid or expired verification token

#### POST /api/v1/users/:id/cancel-email-change

Cancel pending email change (self-service or admin).

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "message": "Email change cancelled successfully"
}
```

#### POST /api/v1/users/:id/send-email-verification

Send an email verification message (requires authentication).

**Headers:** `Authorization: Bearer <token>`

#### POST /api/v1/users/verify-current-email

Verify current email address with token (public endpoint, no authentication).

**Request Body:**

```json
{
  "token": "string (required)"
}
```

#### GET /api/v1/users/:id/security-info

Get user security information (self-service or admin).

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "data": {
    "userId": 1,
    "username": "user123",
    "email": "user@example.com",
    "authProvider": "password",
    "emailVerified": true,
    "canSetPassword": true,
    "isExternalAuth": false,
    "pendingEmailChange": {
      "email": null,
      "expiresAt": null
    }
  }
}
```

**Response for External Auth User:**

```json
{
  "success": true,
  "data": {
    "userId": 2,
    "username": "githubuser",
    "email": "user@github.com",
    "authProvider": "github",
    "emailVerified": true,
    "canSetPassword": false,
    "isExternalAuth": true,
    "pendingEmailChange": {
      "email": null,
      "expiresAt": null
    }
  }
}
```

### Configuration

Configuration endpoints manage system settings. Three endpoints are public; the
rest require authentication with the `config:manage` permission.

#### GET /api/v1/config/attachment-types

Get attachment type categories for file attachments (public endpoint).

#### GET /api/v1/config/link-categories

Get link categories for record linking (public endpoint).

#### POST /api/v1/config/:type/validate

Validate a configuration without saving (public endpoint).

#### GET /api/v1/config/list

List all available configuration files (requires `config:manage`).

#### GET /api/v1/config/metadata/:type

Get configuration metadata/schema for a config type (requires `config:manage`).

#### GET /api/v1/config/raw/:type

Get raw YAML content of a configuration (requires `config:manage`).

#### PUT /api/v1/config/raw/:type

Save raw YAML content (requires `config:manage`).

#### GET /api/v1/config/status

Get status of all configurations (user/default/missing) (requires
`config:manage`).

#### GET /api/v1/config/:type

Load a configuration by type. Valid types: `org-config`, `roles`, `workflows`,
`hooks`, `notifications` (requires `config:manage`).

**Note:** `GET /api/v1/config/roles` is **not** a public endpoint. It requires
authentication and the `config:manage` permission.

**Response:**

```json
{
  "success": true,
  "data": {
    "roles": [
      {
        "key": "admin",
        "name": "Administrator",
        "description": "Full system access and user management",
        "permissions": ["*"],
        "color": "red",
        "icon": "shield"
      },
      {
        "key": "council",
        "name": "Council Member",
        "description": "Can create, edit, and approve records",
        "permissions": ["records:*", "workflows:*"],
        "color": "blue",
        "icon": "users"
      },
      {
        "key": "clerk",
        "name": "City Clerk",
        "description": "Can create and edit records",
        "permissions": ["records:create", "records:edit", "records:view"],
        "color": "green",
        "icon": "file-text"
      },
      {
        "key": "public",
        "name": "Public",
        "description": "Can view published records",
        "permissions": ["records:view"],
        "color": "gray",
        "icon": "eye"
      }
    ]
  }
}
```

#### PUT /api/v1/config/:type

Save a configuration (requires `config:manage`).

#### POST /api/v1/config/:type/reset

Reset a configuration to defaults (requires `config:manage`).

#### GET /api/v1/config/validate/all

Validate all configurations and return combined results (requires
`config:manage`).

### System

#### GET /api/v1/system/record-types

Get available record types (public endpoint).

**Response:**

```json
{
  "success": true,
  "data": {
    "recordTypes": [
      {
        "key": "bylaw",
        "label": "Bylaw",
        "description": "Municipal bylaws and regulations",
        "icon": "gavel",
        "color": "blue"
      },
      {
        "key": "policy",
        "label": "Policy",
        "description": "Administrative policies and procedures",
        "icon": "file-text",
        "color": "green"
      },
      {
        "key": "resolution",
        "label": "Resolution",
        "description": "Council resolutions and decisions",
        "icon": "check-circle",
        "color": "purple"
      }
    ]
  }
}
```

#### GET /api/v1/system/record-statuses

Get available record statuses (public endpoint).

**Response:**

```json
{
  "success": true,
  "data": {
    "statuses": [
      {
        "key": "draft",
        "label": "Draft",
        "description": "Initial draft stage",
        "color": "gray",
        "icon": "edit"
      },
      {
        "key": "proposed",
        "label": "Proposed",
        "description": "Under review and discussion",
        "color": "yellow",
        "icon": "clock"
      },
      {
        "key": "approved",
        "label": "Approved",
        "description": "Officially approved and active",
        "color": "green",
        "icon": "check-circle"
      },
      {
        "key": "archived",
        "label": "Archived",
        "description": "No longer active",
        "color": "gray",
        "icon": "archive"
      }
    ]
  }
}
```

### Status

#### GET /api/v1/status

Get system status (public endpoint).

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-07-30T21:35:20.000Z",
    "version": "1.0.0",
    "uptime": 3600,
    "services": {
      "database": "connected",
      "git": "connected",
      "indexing": "active"
    }
  }
}
```

#### GET /api/v1/status/git

Get Git repository status (public endpoint).

**Response:**

```json
{
  "success": true,
  "data": {
    "currentBranch": "main",
    "lastCommit": {
      "hash": "abc123...",
      "message": "Update user management interface",
      "author": "admin",
      "date": "2025-07-30T21:35:20.000Z"
    },
    "status": "clean",
    "ahead": 0,
    "behind": 0
  }
}
```

#### GET /api/v1/status/records

Get records statistics (public endpoint).

**Response:**

```json
{
  "success": true,
  "data": {
    "total": 15,
    "byType": {
      "bylaw": 8,
      "policy": 4,
      "resolution": 3
    },
    "byStatus": {
      "draft": 5,
      "proposed": 3,
      "approved": 6,
      "archived": 1
    },
    "lastUpdated": "2025-07-30T21:35:20.000Z"
  }
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": "username",
      "issue": "Username is required"
    }
  }
}
```

### Common Error Codes

- `AUTHENTICATION_ERROR`: Invalid or missing authentication
- `AUTHORIZATION_ERROR`: Insufficient permissions
- `VALIDATION_ERROR`: Invalid input data
- `NOT_FOUND`: Resource not found
- `INTERNAL_ERROR`: Server error

## Rate Limiting

The API does not currently enforce HTTP-level rate limiting. The WebSocket
realtime server enforces rate limiting (10 messages/sec per client, configurable
in `.system-data/realtime.yml`).

## Versioning

The API version is included in the response headers:

```
X-API-Version: 1.0.0
```

## Audit Trail

### Audit Trail Overview

The platform records key actions across API and CLI into a JSONL audit log
stored at `.system-data/activity.log` under the active `dataDir`.

- Sources: `api`, `cli`, `ui`, `system`
- Typical actions logged: config updates/resets/validations, user
  create/update/delete, record create/update/delete/status changes
- Each log line is a JSON object with stable fields for downstream processing

### Log Entry Format

```
{
  "id": "uuid",
  "timestamp": "2025-01-01T12:34:56.789Z",
  "source": "api|cli|ui|system",
  "actor": { "id": 1, "username": "admin", "role": "admin", "ip": "127.0.0.1" },
  "action": "config_put|config_reset|record_create|record_update|record_delete|status_change|user_create|user_update|user_delete|...",
  "target": { "type": "config|record|user|...", "id": "...", "name": "...", "path": "..." },
  "outcome": "success|failure|warning",
  "message": "optional short message",
  "metadata": { "any": "additional context" }
}
```

### Geography Endpoints

#### GET /api/v1/geography

List all geography files (public endpoint).

**Response:**

```json
{
  "success": true,
  "data": {
    "geography": [
      {
        "id": "geo-001",
        "name": "Residential Zones",
        "type": "geojson",
        "category": "zone",
        "description": "Residential zoning boundaries for the city",
        "srid": 4326,
        "bounds": {
          "minLon": -73.65,
          "minLat": 45.45,
          "maxLon": -73.52,
          "maxLat": 45.55
        },
        "metadata": {
          "source": "City Planning Department",
          "created": "2025-01-27T10:00:00.000Z",
          "updated": "2025-01-27T10:00:00.000Z",
          "version": "1.0",
          "accuracy": "high"
        },
        "file_path": "data/geography/zones/residential-zones-1763155301879.md",
        "created_at": "2025-01-27T10:00:00.000Z",
        "updated_at": "2025-01-27T10:00:00.000Z"
      }
    ]
  }
}
```

#### POST /api/v1/geography

Create a new geography file (admin only).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "name": "string (required)",
  "type": "geojson|kml|gpx|shapefile (required)",
  "category": "zone|boundary|district|facility|route (required)",
  "description": "string (required)",
  "content": "string (required)",
  "srid": "number (optional, default: 4326)",
  "metadata": {
    "source": "string (optional)",
    "version": "string (optional)",
    "accuracy": "string (optional)"
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "geography": {
      "id": "geo-002",
      "name": "Commercial Zones",
      "type": "geojson",
      "category": "zone",
      "description": "Commercial zoning boundaries",
      "srid": 4326,
      "bounds": {
        "minLon": -73.60,
        "minLat": 45.40,
        "maxLon": -73.50,
        "maxLat": 45.60
      },
      "metadata": {
        "source": "City Planning Department",
        "created": "2025-01-27T11:00:00.000Z",
        "updated": "2025-01-27T11:00:00.000Z",
        "version": "1.0",
        "accuracy": "high"
      },
      "file_path": "data/geography/zones/commercial-zones-1763155301880.md",
      "created_at": "2025-01-27T11:00:00.000Z",
      "updated_at": "2025-01-27T11:00:00.000Z"
    }
  }
}
```

#### GET /api/v1/geography/:id

Get a specific geography file (public endpoint).

**Response:**

```json
{
  "success": true,
  "data": {
    "geography": {
      "id": "geo-001",
      "name": "Residential Zones",
      "type": "geojson",
      "category": "zone",
      "description": "Residential zoning boundaries for the city",
      "srid": 4326,
      "bounds": {
        "minLon": -73.65,
        "minLat": 45.45,
        "maxLon": -73.52,
        "maxLat": 45.55
      },
      "metadata": {
        "source": "City Planning Department",
        "created": "2025-01-27T10:00:00.000Z",
        "updated": "2025-01-27T10:00:00.000Z",
        "version": "1.0",
        "accuracy": "high"
      },
      "file_path": "data/geography/geojson/zones/residential-zones.geojson",
      "content": "{\"type\":\"FeatureCollection\",\"features\":[...]}",
      "created_at": "2025-01-27T10:00:00.000Z",
      "updated_at": "2025-01-27T10:00:00.000Z"
    }
  }
}
```

#### PUT /api/v1/geography/:id

Update a geography file (admin only).

**Headers:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "name": "string (optional)",
  "category": "zone|boundary|district|facility|route (optional)",
  "description": "string (optional)",
  "content": "string (optional)",
  "metadata": {
    "source": "string (optional)",
    "version": "string (optional)",
    "accuracy": "string (optional)"
  }
}
```

#### DELETE /api/v1/geography/:id

Delete a geography file (admin only).

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "message": "Geography file deleted successfully"
}
```

#### POST /api/v1/geography/validate

Validate geography content without saving (public endpoint).

**Request Body:**

```json
{
  "content": "string (required)",
  "type": "geojson|kml|gpx|shapefile (required)"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "validation": {
      "valid": true,
      "errors": [],
      "warnings": [],
      "metadata": {
        "featureCount": 3,
        "bounds": {
          "minLon": -73.65,
          "minLat": 45.45,
          "maxLon": -73.52,
          "maxLat": 45.55
        },
        "srid": 4326,
        "geometryTypes": ["Polygon"]
      }
    }
  }
}
```

#### GET /api/v1/geography/:id/raw

Get raw geography content (GeoJSON, KML, etc.) for a specific file (public
endpoint).

#### GET /api/v1/geography/:id/linked-records

Get records linked to a geography file (requires authentication).

#### GET /api/v1/geography/presets

List available geography presets (public endpoint).

#### GET /api/v1/geography/presets/:key

Get a specific geography preset (public endpoint).

#### POST /api/v1/geography/presets/:key/apply

Apply a geography preset (public endpoint).

#### GET /api/v1/geography/search

Search geography files (public endpoint).

**Query Parameters:**

- `q` - Search query (optional)
- `category` - Filter by category (optional)
- `type` - Filter by file type (optional)
- `limit` - Number of results (optional, default: 20)
- `offset` - Offset for pagination (optional, default: 0)

**Response:**

```json
{
  "success": true,
  "data": {
    "geography": [
      {
        "id": "geo-001",
        "name": "Residential Zones",
        "type": "geojson",
        "category": "zone",
        "description": "Residential zoning boundaries for the city",
        "srid": 4326,
        "bounds": {
          "minLon": -73.65,
          "minLat": 45.45,
          "maxLon": -73.52,
          "maxLat": 45.55
        },
        "metadata": {
          "source": "City Planning Department",
          "created": "2025-01-27T10:00:00.000Z",
          "updated": "2025-01-27T10:00:00.000Z",
          "version": "1.0",
          "accuracy": "high"
        },
        "file_path": "data/geography/zones/residential-zones-1763155301879.md",
        "created_at": "2025-01-27T10:00:00.000Z",
        "updated_at": "2025-01-27T10:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 1,
      "limit": 20,
      "offset": 0
    }
  }
}
```

### Health

#### GET /api/v1/health

Basic health check (public endpoint).

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "healthy"
  }
}
```

#### GET /api/v1/health/detailed

Detailed health information including service status (public endpoint).

#### POST /api/v1/health/test-error

Emit a test error for diagnostics (public endpoint).

### Info

#### GET /api/v1/info

Get system and organization info. Returns partial info for unauthenticated
users; full info for admins (public endpoint with optional auth).

### Templates

Template endpoints manage record templates. All require authentication.

#### GET /api/v1/templates

List templates (requires `templates:view`).

#### GET /api/v1/templates/:id

Get a specific template (requires `templates:view`).

#### POST /api/v1/templates

Create a new template (requires `templates:manage`).

#### PUT /api/v1/templates/:id

Update a template (requires `templates:manage`).

#### DELETE /api/v1/templates/:id

Delete a template (requires `templates:manage`).

#### POST /api/v1/templates/:id/preview

Preview a template with variable substitution (requires `templates:view`).

#### POST /api/v1/templates/:id/validate

Validate template structure and inheritance (requires `templates:view`).

### Workflows

Workflow endpoints manage record approval workflows. All require authentication.

#### GET /api/v1/workflows

List workflows (requires `workflows:view`).

#### GET /api/v1/workflows/:id

Get a workflow (requires `workflows:view`).

#### POST /api/v1/workflows

Create a workflow (requires `workflows:manage`).

#### PUT /api/v1/workflows/:id

Update a workflow (requires `workflows:manage`).

#### DELETE /api/v1/workflows/:id

Delete a workflow (requires `workflows:manage`).

### Hooks

Hook endpoints manage system event hooks. All require authentication.

#### GET /api/v1/hooks

List hooks (requires `hooks:view`).

#### GET /api/v1/hooks/:id

Get a hook (requires `hooks:view`).

#### POST /api/v1/hooks

Create a hook (requires `hooks:manage`).

#### PUT /api/v1/hooks/:id

Update a hook (requires `hooks:manage`).

#### DELETE /api/v1/hooks/:id

Delete a hook (requires `hooks:manage`).

### Export & Import

#### GET /api/v1/export

Export records data (requires `records:export`).

#### POST /api/v1/import

Import records data (requires `records:import`).

### Indexing

Indexing endpoints manage the full-text search index. All require
authentication.

#### POST /api/v1/indexing/generate

Generate or regenerate indexes (requires `records:import`).

#### GET /api/v1/indexing/status

Get indexing status (requires `records:view`).

#### POST /api/v1/indexing/sync

Sync file-based records to the database (requires `records:import`).

#### GET /api/v1/indexing/search

Search the index directly (requires `records:view`).

#### GET /api/v1/indexing/stats

Get indexing statistics (requires authentication).

#### GET /api/v1/indexing/validate

Validate index integrity (requires authentication).

### History

History endpoints provide Git-based version history. All require `records:view`.

#### GET /api/v1/history

Get Git commit history for all records.

#### GET /api/v1/history/:record

Get commit history for a specific record.

### Diff

Diff endpoints compare record versions. All require `records:view`.

#### GET /api/v1/diff/:recordId

Compare two versions of a record.

**Query Parameters:**

- `from` - Source commit hash or version
- `to` - Target commit hash or version

#### GET /api/v1/diff/:recordId/history

Get the commit history for a record (diff context).

#### GET /api/v1/diff/:recordId/commits

Get commits that modified a record.

#### GET /api/v1/diff/:recordId/versions

Get all versions of a record.

### Storage (UUID-based)

Storage endpoints manage file uploads with UUID tracking. Supports local, S3,
and Azure storage providers.

#### POST /api/v1/storage/files

Upload a file (requires `storage:upload`). Supports multipart form data.

#### GET /api/v1/storage/files/:id

Download a file by UUID (optional auth).

#### GET /api/v1/storage/files/:id/info

Get file metadata by UUID (optional auth).

#### PUT /api/v1/storage/files/:id

Update file metadata (requires `storage:manage`).

#### DELETE /api/v1/storage/files/:id

Delete a file by UUID (requires `storage:delete`).

#### POST /api/v1/storage/files/batch

Batch upload multiple files (requires `storage:upload`).

#### DELETE /api/v1/storage/files/batch

Batch delete multiple files (requires `storage:delete`).

#### GET /api/v1/storage/folders/:folder/files

List files in a storage folder (requires `storage:download`).

#### GET /api/v1/storage/config

Get storage configuration (requires `storage:manage`).

#### GET /api/v1/storage/health

Check storage provider health status.

#### GET /api/v1/storage/health/:provider

Check health for a specific storage provider.

#### GET /api/v1/storage/metrics

Get storage operation metrics (counts, latency, errors).

#### POST /api/v1/storage/metrics/reset

Reset storage metrics (admin only).

#### GET /api/v1/storage/usage

Get storage usage report (total, by folder, by provider).

#### GET /api/v1/storage/usage/:folder

Get storage usage for a specific folder.

#### GET /api/v1/storage/cleanup

Get orphaned file cleanup report (admin only).

#### POST /api/v1/storage/cleanup

Apply orphaned file cleanup (admin only).

### Cache

Cache endpoints provide visibility into the caching layer. All require
authentication.

#### GET /api/v1/cache/metrics

Get metrics for all caches.

#### GET /api/v1/cache/metrics/:name

Get metrics for a specific named cache.

#### GET /api/v1/cache/health

Get cache health status.

#### GET /api/v1/cache/list

List all registered caches.

### Diagnostics

Diagnostic endpoints run system health checks. All require admin authentication.

#### GET /api/v1/diagnose

Run all diagnostics.

#### GET /api/v1/diagnose/:component

Run diagnostics for a specific component.

#### POST /api/v1/diagnose/fix

Auto-fix detected issues.

### Notifications

#### POST /api/v1/notifications/test

Send a test notification (requires `system:admin`).

### Audit Endpoints

#### GET /api/v1/audit

List recent audit entries. Admin-only.

Headers: `Authorization: Bearer <token>`

Query Parameters:

- `limit` (optional, default: 100, max: 1000)
- `offset` (optional, default: 0)

Response:

```json
{
  "success": true,
  "data": {
    "entries": [ { "id": "...", "timestamp": "...", "source": "api", "action": "config_put", "outcome": "success" } ],
    "pagination": { "total": 123, "limit": 100, "offset": 0 }
  }
}
```

Permissions:

- Requires `system:admin` (enforced by route middleware)

### What Gets Logged (API)

- Configuration routes: raw PUT/save, reset, validate
- Users routes: create, update, delete
- Records routes: create, update, delete, status changes

Failures are also logged with `outcome: "failure"` and an error `message`.

## OpenAPI Documentation

An auto-generated OpenAPI specification is available at
`GET /api/v1/docs/api-docs.json`, with Swagger UI at `GET /api/v1/docs`.
