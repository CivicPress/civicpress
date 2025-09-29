# API Documentation

## Overview

The CivicPress API provides RESTful endpoints for managing civic records, users,
and system configuration. The API uses JWT-based authentication and follows
standard HTTP status codes.

## Authentication

### JWT Token Flow

1. **Login**: POST `/auth/login` with credentials
2. **Get Token**: Receive JWT token in response
3. **Use Bearer Token**: Include token in `Authorization: Bearer <token>` header

### Public vs Protected Endpoints

#### **Public Endpoints** (No Authentication Required)

These endpoints are accessible without authentication and are used by the UI for
initial configuration:

- `GET /api/config/roles` - Get available user roles
- `GET /api/config/record-types` - Get available record types
- `GET /api/config/record-statuses` - Get available record statuses
- `GET /api/status` - Get system status
- `GET /api/status/git` - Get Git repository status
- `GET /api/status/records` - Get records statistics
- `GET /api/records` - List records (read-only)
- `GET /api/records/:id` - Get specific record (read-only)
- `GET /api/search` - Search records (read-only)

#### **Protected Endpoints** (Authentication Required)

These endpoints require valid authentication and appropriate permissions:

- **User Management**: All `/api/users/*` endpoints (admin only)
- **Record Management**: POST, PUT, DELETE on `/api/records/*`
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

#### POST /auth/login

Authenticate user and receive JWT token.

**Request Body:**

```json
{
  "username": "string",
  "password": "string"
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

#### POST /auth/register

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

#### POST /auth/logout

Logout and invalidate current session.

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

#### GET /api/records/:id

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
      "updated_at": "2025-07-23 21:15:08"
    }
  }
}
```

#### POST /api/records

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
      "updated_at": "2025-07-30 21:33:40"
    },
    "message": "Record created successfully"
  }
}
```

#### PUT /api/records/:id

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
      "updated_at": "2025-07-30 21:35:20"
    },
    "message": "Record updated successfully"
  }
}
```

#### DELETE /api/records/:id

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

### Search

#### GET /api/search

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

### User Management

#### GET /api/users

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

#### GET /api/users/:id

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

#### POST /api/users

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

#### PUT /api/users/:id

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

#### DELETE /api/users/:id

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

#### GET /api/config/roles

Get available user roles (public endpoint).

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

#### GET /api/config/record-types

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

#### GET /api/config/record-statuses

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

#### GET /api/status

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

#### GET /api/status/git

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

#### GET /api/status/records

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

API requests are rate-limited to prevent abuse:

- **Public endpoints**: 100 requests per minute
- **Protected endpoints**: 1000 requests per minute per user
- **Authentication endpoints**: 10 requests per minute per IP

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
        "file_path": "data/geography/geojson/zones/residential-zones.geojson",
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
      "file_path": "data/geography/geojson/zones/commercial-zones.geojson",
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
        "file_path": "data/geography/geojson/zones/residential-zones.geojson",
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

## SDKs and Libraries

Official SDKs are available for:

- **JavaScript/TypeScript**: `@civicpress/sdk`
- **Python**: `civicpress-python`
- **Ruby**: `civicpress-ruby`

## Support

For API support and questions:

- **Documentation**: [docs.civicpress.org](https://docs.civicpress.org)
- **Community**: [community.civicpress.org](https://community.civicpress.org)
- **Issues**:
  [github.com/civicpress/civicpress/issues](https://github.com/civicpress/civicpress/issues)
