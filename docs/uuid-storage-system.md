# UUID Storage System

## Overview

CivicPress uses a UUID-based file storage system that provides secure,
multi-cloud file management with database tracking. This system replaces the
legacy path-based storage with a more secure and flexible approach.

## Architecture

### Core Components

1. **CloudUuidStorageService** - Multi-provider storage service supporting
   local, S3, and Azure
2. **Database Tracking** - UUID-based file metadata in `storage_files` table
3. **API Endpoints** - RESTful UUID-based file operations
4. **UI Components** - Enhanced file management interface

### Database Schema

```sql
CREATE TABLE storage_files (
  id TEXT PRIMARY KEY,              -- UUID
  original_name TEXT NOT NULL,      -- Original filename
  stored_filename TEXT NOT NULL,    -- UUID-prefixed filename
  folder TEXT NOT NULL,             -- Storage folder (public, sessions, etc.)
  relative_path TEXT NOT NULL,      -- folder/stored_filename
  provider_path TEXT NOT NULL,      -- Full path in storage provider
  size INTEGER NOT NULL,            -- File size in bytes
  mime_type TEXT NOT NULL,          -- MIME type
  description TEXT,                 -- Optional description
  uploaded_by TEXT,                 -- User who uploaded
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

### File Operations

#### Upload File

```http
POST /api/v1/storage/files
Content-Type: multipart/form-data

form-data:
  file: [binary file]
  folder: "public" | "sessions" | "permits" | "private"
  description: "Optional description"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "original_name": "document.pdf",
    "path": "public/document.123e4567-e89b-12d3-a456-426614174000.pdf",
    "size": 1024,
    "mime_type": "application/pdf",
    "url": "/api/v1/storage/files/123e4567-e89b-12d3-a456-426614174000",
    "created_at": "2025-01-30T17:30:00Z"
  }
}
```

#### Download File

```http
GET /api/v1/storage/files/{uuid}
Authorization: Bearer {token}
```

#### Get File Info

```http
GET /api/v1/storage/files/{uuid}/info
Authorization: Bearer {token}
```

#### Delete File

```http
DELETE /api/v1/storage/files/{uuid}
Authorization: Bearer {token}
```

#### List Files in Folder

```http
GET /api/v1/storage/folders/{folder}/files
Authorization: Bearer {token}
```

## Storage Providers

### Local Storage

- Default provider for development
- Files stored in `storage/` directory
- Preserves folder structure

### Amazon S3

- Production-ready cloud storage
- Supports all S3-compatible services
- Configurable bucket and region

### Azure Blob Storage

- Microsoft Azure integration
- Container-based organization
- Hot/Cool/Archive tiers supported

## Configuration

### Environment Variables (Preferred)

For a complete example of all available environment variables, see [`storage-credentials.example`](../storage-credentials.example). Copy the relevant variables to your `.env.local` file.

**Quick Reference:**

```bash
# S3 Configuration
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_REGION=us-west-2
S3_BUCKET=your-bucket-name

# Azure Configuration
AZURE_STORAGE_CONNECTION_STRING=your_connection_string
AZURE_STORAGE_ACCOUNT_NAME=your_account
AZURE_STORAGE_ACCOUNT_KEY=your_key
AZURE_CONTAINER_NAME=civicpress
```

### Configuration File (Fallback)

```yaml
# .system-data/storage.yml
providers:
  local:
    type: local
    path: storage
    enabled: true

  s3:
    type: s3
    enabled: true
    region: us-west-2
    bucket: your-bucket
    credentials:
      access_key_id: your_key
      secret_access_key: your_secret

  azure:
    type: azure
    enabled: true
    account_name: your_account
    container_name: storage
    credentials:
      connection_string: your_connection_string
      account_key: your_key

active_provider: local
failover_providers:
  - local

global:
  max_file_size: 100MB
  health_checks: true
  retry_attempts: 3
```

## Security Features

1. **UUID-based Access** - Files cannot be accessed by guessing paths
2. **Database Tracking** - All file operations are logged
3. **Role-based Permissions** - Fine-grained access control
4. **Original Name Preservation** - Secure storage with user-friendly display
5. **Provider Abstraction** - Consistent security across storage types

## Usage in Records

Geography attachments can reference files by UUID:

```yaml
geography:
  attachments:
    - id: "123e4567-e89b-12d3-a456-426614174000"  # UUID reference
      path: "public/map.geojson"                    # Display path
      role: "context"
      description: "Zoning map for area"
```

## UI Components

### FileBrowser

- Browse files by folder
- Search and filter capabilities
- Upload, download, delete operations
- Refresh functionality

### FileUpload

- Drag & drop interface
- Multi-file upload support
- Progress tracking
- Type validation

### MediaPlayer

- Preview images, PDFs, videos, audio
- Responsive design
- Fallback handling

## Migration from Legacy System

The legacy path-based storage system is deprecated. New files use the UUID
system automatically. Existing files can be migrated using:

```bash
# Future migration command (not yet implemented)
civic storage:migrate-to-uuid
```

## Performance Considerations

1. **Database Indexing** - UUID and folder columns indexed
2. **Caching** - File metadata cached in memory
3. **Streaming** - Large files streamed for efficiency
4. **CDN Ready** - Compatible with CloudFront, Azure CDN
5. **Multipart Uploads** - Large file support (planned)

## Testing

Create tests for the UUID storage system:

```typescript
// Test upload
const response = await request(app)
  .post('/api/v1/storage/files')
  .attach('file', 'test-file.pdf')
  .field('folder', 'public')
  .field('description', 'Test file');

expect(response.body.data.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

// Test download
const downloadResponse = await request(app)
  .get(`/api/v1/storage/files/${response.body.data.id}`)
  .set('Authorization', `Bearer ${token}`);

expect(downloadResponse.status).toBe(200);
```
