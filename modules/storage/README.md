# CivicPress Storage Module

A comprehensive UUID-based file and media storage solution for CivicPress,
supporting multiple storage backends with database tracking, configurable
folders, access control, and file validation.

## Purpose

The Storage Module provides secure, UUID-tracked file storage for:

- **File attachments** linked to civic records
- **Meeting recordings** (video/audio files)
- **Document attachments** (PDFs, images)
- **Public assets** (logos, images)
- **Private documents** (permits, applications)

## Architecture

### **Core Components**

- **CloudUuidStorageService**: Main UUID-based file operations with database
  tracking
- **UuidStorageService**: Base UUID storage service
- **StorageConfigManager**: Configuration management and validation
- **CredentialManager**: Secure credential management for cloud providers
- **Type Definitions**: Comprehensive TypeScript interfaces

### **Storage Backends**

- **Local Storage**: File system-based storage (implemented)
- **S3 Compatible**: AWS S3 and S3-compatible storage (implemented)
- **Azure Blob**: Microsoft Azure Blob storage (implemented)
- **Google Cloud Storage**: GCS support (planned)
- **IPFS**: Distributed storage (planned)

## Configuration

### **Storage Configuration File**

Located at `.system-data/storage.yml`:

```yaml
backend:
  type: 'local'
  path: 'storage'

folders:
  public:
    path: 'public'
    access: 'public'
    allowed_types: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'txt', 'md']
    max_size: '10MB'
    description: 'Public files accessible to everyone'

  sessions:
    path: 'sessions'
    access: 'public'
    allowed_types: ['mp4', 'webm', 'mp3', 'wav', 'pdf', 'md']
    max_size: '100MB'
    description: 'Meeting recordings and session materials'

  permits:
    path: 'permits'
    access: 'authenticated'
    allowed_types: ['pdf', 'jpg', 'jpeg', 'png']
    max_size: '5MB'
    description: 'Permit applications and documents'

  private:
    path: 'private'
    access: 'private'
    allowed_types: ['pdf', 'doc', 'docx', 'xls', 'xlsx']
    max_size: '25MB'
    description: 'Private documents for authorized users only'

metadata:
  auto_generate_thumbnails: true
  store_exif: false
  compress_images: true
  backup_included: true
```

### **Access Levels**

- **`public`**: Accessible to everyone, no authentication required
- **`authenticated`**: Requires valid user session
- **`private`**: Restricted to specific user roles/permissions

## Usage

### **Basic Setup**

```typescript
import { CloudUuidStorageService, StorageConfigManager } from '@civicpress/storage';

// Load configuration
const configManager = new StorageConfigManager('.system-data');
const config = await configManager.loadConfig();

// Initialize UUID storage service
const storageService = new CloudUuidStorageService(config, '.system-data');
await storageService.initialize();
```

### **File Operations**

```typescript
// Upload file
const uploadResult = await storageService.uploadFile(
  'sessions',           // folder name
  multerFile,           // file from multer
  'user-123'            // user ID for audit
);

if (uploadResult.success) {
  console.log('File uploaded:', uploadResult.file.name);
  console.log('File path:', uploadResult.path);
  console.log('File URL:', uploadResult.url);
} else {
  console.error('Upload failed:', uploadResult.error);
}

// List files
const files = await storageService.listFiles('sessions');
files.forEach(file => {
  console.log(`${file.name} (${file.size} bytes)`);
});

// Delete file
const deleted = await storageService.deleteFile('/path/to/file.mp4', 'user-123');
```

### **Configuration Management**

```typescript
// Add new folder
const newFolder = {
  path: 'newsletters',
  access: 'public',
  allowed_types: ['pdf', 'html'],
  max_size: '2MB',
  description: 'Monthly newsletters'
};

await configManager.addFolder('newsletters', newFolder);

// Update folder settings
await configManager.updateFolder('sessions', {
  max_size: '200MB',
  description: 'Updated session storage'
});

// Reset to defaults
await configManager.resetToDefaults();
```

## Security Features

### **File Validation**

- **Type checking**: Whitelist of allowed file extensions
- **Size limits**: Configurable maximum file sizes per folder
- **Security scanning**: Detection of potentially dangerous file types
- **Virus scanning**: Future integration planned

### **Access Control**

- **Folder-level permissions**: Different access levels per folder
- **User authentication**: Integration with CivicPress auth system
- **Audit logging**: Complete record of all file operations
- **Rate limiting**: Prevention of abuse and DoS attacks

### **Data Protection**

- **Encryption**: Future support for encrypted storage
- **Backup integration**: Automatic inclusion in system backups
- **Retention policies**: Configurable file lifecycle management

## API Integration

### **REST Endpoints** (Planned)

```
POST   /api/v1/storage/upload/:folder    # Upload file
GET    /api/v1/storage/files/:folder     # List files
GET    /api/v1/storage/download/:file    # Download file
DELETE /api/v1/storage/files/:file       # Delete file
GET    /api/v1/storage/config            # Get configuration
PUT    /api/v1/storage/config            # Update configuration
```

### **CLI Commands** (Planned)

```bash
civic storage:upload <folder> <file>     # Upload file
civic storage:list <folder>              # List files
civic storage:delete <file>              # Delete file
civic storage:config                     # Show configuration
civic storage:config:set <key> <value>   # Update configuration
```

## Testing

Run the test suite:

```bash
# Run all tests
pnpm run test:run

# Run tests in watch mode
pnpm run test

# Run tests with UI
pnpm run test:ui
```

### Test Coverage

- Configuration management
- File operations
- Access control
- Error handling
- Validation logic

## Development

### **Build**

```bash
pnpm run build
```

### **Development Mode**

```bash
pnpm run dev
```

### **Clean Build**

```bash
pnpm run clean && pnpm run build
```

## Integration Points

### **Core Platform**

- **Record Manager**: File attachments for civic records
- **Workflow Engine**: File processing workflows
- **Hook System**: File operation events
- **Audit System**: File access logging

### **UI Module**

- **File Upload**: Drag & drop file uploads
- **File Browser**: Navigate storage folders
- **Media Player**: Video/audio playback
- **File Manager**: Administrative file operations

### **Other Modules**

- **Public Sessions**: Meeting recordings and materials
- **Legal Register**: Document attachments
- **Feedback System**: File uploads from citizens

## Roadmap

### Phase 1: Core Storage (Complete)

- [x] Local file system storage
- [x] Configurable folder structure
- [x] File validation and security
- [x] Basic CRUD operations

### Phase 2: Advanced Features (In Progress)

- [ ] Cloud storage backends (S3, MinIO)
- [ ] File compression and optimization
- [ ] Thumbnail generation
- [ ] Advanced search and indexing

### Phase 3: Enterprise Features (Planned)

- [ ] File encryption at rest
- [ ] Advanced retention policies
- [ ] CDN integration
- [ ] Multi-region replication

## Contributing

1. **Fork the repository**
2. **Create a feature branch**
3. **Make your changes**
4. **Add tests for new functionality**
5. **Ensure all tests pass**
6. **Submit a pull request**

## License

MIT License - see [LICENSE](../../LICENSE) for details.

---

**Storage Module Status**: Core Implementation Complete. Next Phase: API
endpoints and UI integration
