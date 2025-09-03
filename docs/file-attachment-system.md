# 📎 CivicPress File Attachment System

**Version**: 1.0.0  
**Status**: ✅ Production Ready  
**Last Updated**: September 2025

## 📋 Overview

The CivicPress File Attachment System allows users to link existing files from
the storage system to any record type. This creates a powerful association
between civic documents and their supporting materials while maintaining
security and organization.

## 🎯 Key Features

### ✅ **Complete Implementation**

- **Record Integration**: Link files to any record type (bylaws, policies,
  resolutions, etc.)
- **File Selection**: Intuitive UI for browsing and selecting existing files
- **Categorization**: Organize attachments by type (Reference, Financial, Legal,
  etc.)
- **Secure Access**: Authenticated downloads with proper error handling
- **Database Persistence**: Files stored in both database and markdown
  frontmatter
- **Configuration**: Customizable attachment types via YAML configuration

### 🔧 **Technical Architecture**

- **Database Schema**: New `attached_files` JSON column with automatic migration
- **API Endpoints**: REST endpoints with validation for file operations
- **UI Components**: Vue.js components for file browser and attachment display
- **TypeScript**: Full type safety for attachment data structures
- **Authentication**: Secure file access with JWT token validation

## 🏗️ Architecture

### Database Schema

```sql
-- New column added to records table
ALTER TABLE records ADD COLUMN attached_files TEXT;
```

The `attached_files` column stores JSON data with the following structure:

```json
[
  {
    "id": "d4a71bf5-db44-4a50-9adf-de226e2c000e",
    "path": "public/agenda-2025-09-02.d4a71bf5-db44-4a50-9adf-de226e2c000e.txt",
    "original_name": "agenda-2025-09-02.txt",
    "description": "Meeting agenda for September 2nd",
    "category": {
      "label": "Reference",
      "value": "reference",
      "description": "Reference documents and materials"
    }
  }
]
```

### API Endpoints

#### Update Record with Attachments

```http
PUT /api/v1/records/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "Sample Bylaw",
  "content": "...",
  "attachedFiles": [
    {
      "id": "file-uuid",
      "path": "storage/path",
      "original_name": "document.pdf",
      "description": "Supporting document",
      "category": "reference"
    }
  ]
}
```

#### Get Record with Attachments

```http
GET /api/v1/records/:id
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "record": {
      "id": "record-id",
      "title": "Sample Bylaw",
      "attachedFiles": [...]
    }
  }
}
```

#### Download Attached File

```http
GET /api/v1/storage/files/:id
Authorization: Bearer <token>

Response: Binary file data with proper headers
```

## 🎨 UI Components

### FileBrowserPopover

Located: `modules/ui/app/components/storage/FileBrowserPopover.vue`

A Vue component that provides an intuitive interface for browsing and selecting
files from the storage system.

**Features:**

- File listing with pagination
- Search functionality
- File type filtering
- Preview capabilities
- Selection with metadata input

**Usage:**

```vue
<FileBrowserPopover
  v-model:open="showFileBrowser"
  @file-selected="handleFileSelection"
  :attachment-types="attachmentTypes"
/>
```

### Attachment Display

Integrated into record view pages to display linked files with:

- File name and description
- Category badges
- Download buttons with authentication
- Edit/remove functionality

## ⚙️ Configuration

### Attachment Types

File: `core/src/defaults/attachment-types.yml`

```yaml
_metadata:
  name: 'File Attachment Types'
  description: 'Configure types and categories for file attachments'
  version: '1.0.0'
  editable: true

types:
  reference:
    label:
      value: 'Reference'
      type: 'string'
      description: 'Display label for reference documents'
      required: true
    description:
      value: 'Reference documents and materials'
      type: 'textarea'
      description: 'Description of this attachment type'
      required: true

  financial:
    label:
      value: 'Financial'
      type: 'string'
      description: 'Display label for financial documents'
      required: true
    description:
      value: 'Budget reports, financial statements, invoices'
      type: 'textarea'
      description: 'Description of this attachment type'
      required: true

  legal:
    label:
      value: 'Legal'
      type: 'string'
      description: 'Display label for legal documents'
      required: true
    description:
      value: 'Legal opinions, contracts, agreements'
      type: 'textarea'
      description: 'Description of this attachment type'
      required: true
```

### Configuration API

Access attachment types via the configuration API:

```http
GET /api/v1/config/attachment-types
Authorization: Bearer <token>
```

## 🔐 Security

### Authentication

All file operations require authentication:

- JWT token validation for API requests
- Role-based access control for file access
- Secure download endpoints with proper headers

### Data Validation

- File ID validation against storage system
- Attachment type validation against configuration
- JSON schema validation for attachment data
- XSS protection for user-provided descriptions

### Error Handling

- Graceful handling of missing files
- Proper error messages for authentication failures
- Client-side error handling with user feedback
- Server-side logging for security events

## 💻 Development

### Core Services

#### RecordManager

Location: `core/src/records/record-manager.ts`

Handles serialization and deserialization of attachment data:

```typescript
// Serialize attachments for database storage
const attachedFilesJson = record.attachedFiles ?
  JSON.stringify(record.attachedFiles) : null;

// Deserialize attachments from database
record.attachedFiles = row.attached_files ?
  JSON.parse(row.attached_files) : [];
```

#### Configuration Service

Location: `core/src/config/configuration-service.ts`

Manages attachment type configuration:

```typescript
export function getAttachmentTypes(): AttachmentTypes {
  return loadConfiguration('attachment-types');
}
```

### API Routes

Location: `modules/api/src/routes/records.ts`

Validation and processing for attachment data:

```typescript
// Validation middleware
body('attachedFiles').optional().isArray(),

// Route handler processes attachedFiles
const { attachedFiles, ...otherData } = req.body;
await recordsService.updateRecord(id, {
  ...otherData,
  attachedFiles
});
```

### UI Composables

Location: `modules/ui/app/composables/useAttachmentTypes.ts`

Provides attachment type data to Vue components:

```typescript
export const useAttachmentTypes = () => {
  const { $civicApi } = useNuxtApp();

  return $civicApi('/api/v1/config/attachment-types');
};
```

## 🧪 Testing

### Test Coverage

- **Unit Tests**: Core attachment logic and validation
- **Integration Tests**: API endpoints with file operations
- **UI Tests**: Component functionality and user interactions
- **End-to-End Tests**: Complete attachment workflow

### Test Files

- `tests/api/records.test.ts` - API endpoint testing
- `tests/core/record-manager.test.ts` - Core logic testing
- `tests/ui/file-attachments.test.ts` - UI component testing

### Manual Testing

1. **File Selection**: Browse files in FileBrowserPopover
2. **Attachment Creation**: Link files to records with categories
3. **Data Persistence**: Verify attachments saved to database
4. **File Display**: View attachments in record detail pages
5. **Secure Download**: Test authenticated file downloads
6. **Error Handling**: Test various error scenarios

## 📈 Usage Examples

### Basic Attachment Workflow

1. **Create/Edit Record**: Open record form
2. **Link Files**: Click "Link Files" button
3. **Browse Storage**: Select files from FileBrowserPopover
4. **Add Metadata**: Set category and description
5. **Save Record**: Attachments stored with record
6. **View Attachments**: See linked files in record view
7. **Download Files**: Secure download with authentication

### API Integration

```javascript
// Update record with attachments
const response = await fetch('/api/v1/records/123', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    title: 'Updated Record',
    attachedFiles: [
      {
        id: 'file-uuid',
        original_name: 'document.pdf',
        description: 'Important document',
        category: 'legal'
      }
    ]
  })
});
```

### Configuration Management

```javascript
// Get attachment types
const types = await $civicApi('/api/v1/config/attachment-types');

// Use in UI
const categoryOptions = Object.entries(types.data.types).map(
  ([key, config]) => ({
    value: key,
    label: config.label.value,
    description: config.description.value
  })
);
```

## 🚀 Future Enhancements

### Planned Features

- **Bulk Attachment**: Select multiple files at once
- **Drag & Drop**: Drag files directly onto records
- **File Previews**: In-browser preview for common formats
- **Version Tracking**: Track attachment changes over time
- **Advanced Search**: Search by attachment content
- **Automatic Categorization**: AI-powered category suggestions

### Technical Improvements

- **Caching**: Cache attachment metadata for performance
- **Compression**: Optimize attachment data storage
- **Indexing**: Full-text search of attachment content
- **Webhooks**: Notify external systems of attachment changes

## 📚 Related Documentation

- [UUID Storage System](uuid-storage-system.md)
- [Configuration Architecture](configuration-architecture.md)
- [API Documentation](api.md)
- [Storage Specification](specs/storage.md)
- [Database Schema](specs/database.md)

## 🤝 Contributing

### Adding New Features

1. Update database schema if needed
2. Extend API endpoints with validation
3. Create/update UI components
4. Add comprehensive tests
5. Update documentation

### Code Standards

- Follow existing TypeScript patterns
- Add proper error handling
- Include comprehensive tests
- Update configuration schemas
- Maintain backward compatibility

---

**The File Attachment System is production-ready and provides a complete
solution for linking files to civic records with security, organization, and
ease of use.**
