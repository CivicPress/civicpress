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

For a complete example of all available environment variables, see
[`storage-credentials.example`](../storage-credentials.example). Copy the
relevant variables to your `.env.local` file.

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
  health_check_interval: 60000  # 1 minute
  health_check_timeout: 5000    # 5 seconds
  retry_attempts: 3
  retry_initial_delay: 1000     # 1 second
  retry_max_delay: 30000        # 30 seconds
  retry_backoff_multiplier: 2
  max_concurrent_uploads: 5
  max_concurrent_downloads: 10
  max_concurrent_deletes: 10
  circuit_breaker_enabled: true
  circuit_breaker_failure_threshold: 5
  circuit_breaker_timeout: 60000  # 1 minute
  timeout_upload: 300000          # 5 minutes
  timeout_download: 600000        # 10 minutes
  timeout_delete: 30000           # 30 seconds
  timeout_list: 30000             # 30 seconds
  metrics_enabled: true
  quota_enabled: true
  quota_global_limit: 10737418240  # 10 GB
  quota_folders:
    public:
      limit: 5368709120  # 5 GB
      limitFormatted: "5 GB"
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

## Enhanced Features (December 2025)

### Performance Optimizations

1. **Metadata Caching** - List operations cached using UnifiedCacheManager
   (10-100x faster)
2. **Batch Operations** - Upload/delete multiple files concurrently with
   progress tracking
3. **Streaming** - Large files streamed for upload/download without loading into
   memory
4. **Concurrency Limits** - Configurable limits for uploads, downloads, and
   deletes

### Reliability Features

1. **Retry with Exponential Backoff** - Automatic retry for transient failures
2. **Automatic Failover** - Seamless switching between storage providers on
   failure
3. **Circuit Breaker** - Prevents cascading failures by blocking requests to
   failing providers
4. **Health Checks** - Periodic monitoring of provider health status
5. **Timeout Handling** - Configurable timeouts for all operations

### Observability & Management

1. **Metrics Collection** - Comprehensive metrics for operations, latency, and
   errors
2. **Usage Reporting** - Storage usage by folder and provider with caching
3. **Quota Enforcement** - Global and per-folder storage quotas
4. **Orphaned File Cleanup** - Identify and clean up files without database
   records
5. **Lifecycle Management** - Automated retention, archival, and deletion
   policies

### Error Handling

1. **Structured Errors** - All errors extend CivicPressError with correlation
   IDs
2. **Partial Failure Handling** - Batch operations report partial successes with
   error summaries

## API Endpoints (Enhanced)

### Batch Operations

#### Batch Upload

```http
POST /api/v1/storage/files/batch
Content-Type: multipart/form-data

form-data:
  files: [multiple files]
  folder: "public"
  uploaded_by: "user-id"
```

**Response:**

```json
{
  "successful": [...],
  "failed": [...],
  "total": 10,
  "successfulCount": 8,
  "failedCount": 2,
  "errorSummary": {
    "byType": { "STORAGE_QUOTA_EXCEEDED": 2 },
    "byError": [{ "error": "Quota exceeded", "count": 2 }],
    "totalErrors": 2
  }
}
```

#### Batch Delete

```http
DELETE /api/v1/storage/files/batch
Content-Type: application/json

{
  "fileIds": ["uuid1", "uuid2", "uuid3"],
  "userId": "user-id"
}
```

### Health & Metrics

#### Health Check

```http
GET /api/v1/storage/health
```

**Response:**

```json
{
  "providers": {
    "local": { "healthy": true, "latency": 15 },
    "s3": { "healthy": true, "latency": 120 }
  }
}
```

#### Metrics

```http
GET /api/v1/storage/metrics
```

**Response:**

```json
{
  "uploads": { "total": 1000, "successful": 995, "failed": 5 },
  "downloads": { "total": 5000, "successful": 4998, "failed": 2 },
  "latency": { "upload": [100, 150, 200], "download": [50, 75, 100] },
  "errors": { "byType": {...}, "byProvider": {...} }
}
```

#### Usage Report

```http
GET /api/v1/storage/usage
```

**Response:**

```json
{
  "total": { "files": 1000, "size": 1073741824, "sizeFormatted": "1 GB" },
  "byFolder": {
    "public": { "files": 500, "size": 536870912, "sizeFormatted": "512 MB" }
  },
  "byProvider": {
    "local": { "files": 1000, "size": 1073741824, "sizeFormatted": "1 GB" }
  }
}
```

## Performance Considerations

1. **Database Indexing** - UUID and folder columns indexed
2. **Metadata Caching** - File lists cached using UnifiedCacheManager (10-100x
   faster)
3. **Streaming** - Large files streamed for efficiency (no memory limits)
4. **Batch Operations** - Concurrent processing for 5-10x faster throughput
5. **Concurrency Limits** - Prevents resource exhaustion
6. **CDN Ready** - Compatible with CloudFront, Azure CDN

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
