# 🗄️ CivicPress Spec: `storage.md`

---

version: 2.0.0 status: stable created: '2025-07-03' updated: '2025-09-03'
deprecated: false sunset_date: null additions:

- comprehensive storage documentation
- UUID-based file management system
- multi-provider backend support
- file attachment system integration
- data management
- security considerations compatibility: min_civicpress: 2.0.0 max_civicpress:
  'null' dependencies: [] authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Civic Storage Layer

## 🎯 Purpose

Define how CivicPress handles **non-Markdown content**, such as audio/video
files, PDFs, scanned permits, meeting recordings, and attachments.  
Ensure files are stored predictably, retrievably, and securely — whether
local-first or backed by remote object storage.

**Version 2.0** introduces UUID-based file management, multi-provider backend
support, and seamless integration with the file attachment system for linking
files to civic records.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Store and serve non-Markdown files (media, attachments)
- Maintain consistent file paths across modules
- Support static/public + authenticated/private access
- Allow local disk or S3-style backends
- Expose storage location to API/UI
- **UUID-based file tracking** for unique identification
- **Multi-provider backend support** (local, S3, Azure)
- **File attachment integration** for linking files to records
- **Database metadata tracking** for file information

❌ Out of Scope:

- CDN replication
- Media transcoding (handled externally)
- Sensitive personal data storage (unless encrypted)

---

## 🔗 Inputs & Outputs

| Source             | Output                                    | UUID Reference                         |
| ------------------ | ----------------------------------------- | -------------------------------------- |
| Uploaded video     | `/storage/public-sessions/2025-06-12.mp4` | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| Scanned permit PDF | `/storage/permits/2025/perm-1189.pdf`     | `b2c3d4e5-f6g7-8901-bcde-f23456789012` |
| Audio feedback     | `/storage/feedback/audio123.ogg`          | `c3d4e5f6-g7h8-9012-cdef-345678901234` |

---

## 📂 File/Folder Location

```
/storage/               # Public or private non-md assets
.civic/storage.yml      # Backend config (e.g. type, credentials)
.system-data/           # Private system data including file metadata
├── files.db           # SQLite database for file metadata tracking
└── storage-cache/     # Cached file information
```

## 📝 Example Storage Configuration

```yaml
# .civic/storage.yml
backend:
  type: 'local' # local, s3, minio, ipfs
  path: '/storage'

# For S3/MinIO backends
# backend:
#   type: "s3"
#   endpoint: "https://s3.amazonaws.com"
#   bucket: "civicpress-richmond"
#   region: "us-east-1"
#   credentials:
#     access_key: "${AWS_ACCESS_KEY}"
#     secret_key: "${AWS_SECRET_KEY}"

folders:
  public:
    path: '/storage/public'
    access: 'public'
    allowed_types: ['jpg', 'png', 'pdf', 'mp4', 'mp3']
    max_size: '10MB'

  private:
    path: '/storage/private'
    access: 'authenticated'
    allowed_types: ['pdf', 'doc', 'xlsx']
    max_size: '25MB'

  sessions:
    path: '/storage/sessions'
    access: 'public'
    allowed_types: ['mp4', 'webm', 'mp3']
    max_size: '100MB'

  permits:
    path: '/storage/permits'
    access: 'authenticated'
    allowed_types: ['pdf', 'jpg', 'png']
    max_size: '5MB'

metadata:
  auto_generate_thumbnails: true
  store_exif: false
  compress_images: true
  backup_included: true
```

---

## 💾 Backup Consideration

All media and attachments stored in `storage/` should be included in any
CivicPress backup or export process. This ensures full continuity and
traceability during restore or migration.

Future versions may define `.civic/backup.yml` for more advanced control.

---

## 🔐 Security & Trust Considerations

- Access control must be enforced by API layer
- Folder-level visibility should match record permissions
- File metadata (`.meta.yml`) may store roles, license, tags
- Links to storage should not be hardcoded in civic records — use variables

**Encryption & Privacy:**

- Sensitive files (e.g. permits, legal docs) should be encrypted at rest and in
  transit (future: S3, MinIO, or local encryption)
- Store encryption keys securely and rotate regularly
- Do not store unencrypted personal data unless required by law

**Access Control:**

- Only authorized users/roles may upload, download, or delete files in private
  folders
- Public folders should be read-only for unauthenticated users
- Log all access to private or sensitive files for audit

**Compliance:**

- Ensure storage practices comply with local privacy and data protection laws
  (e.g. GDPR, municipal regulations)
- Redact or restrict access to files containing PII or confidential information
- Document storage structure and access policies for auditability

**Best Practices:**

- Regularly review and clean up orphaned or outdated files
- Include storage in backup and disaster recovery plans
- Monitor storage usage and alert on quota or access anomalies

---

## 🧪 Testing & Validation

- Upload and retrieve sample media from UI/API
- Confirm file presence via `civic storage ls`
- Validate access control against roles
- Simulate offline/local-only fallback

---

## ✅ Current Implementation Status

### **Completed Features (Version 2.0)**

- ✅ **UUID-based file management** - Unique identifiers for all files
- ✅ **Multi-provider backends** - Local, S3, Azure Blob storage support
- ✅ **File attachment system** - Link files to civic records
- ✅ **Database metadata tracking** - Complete file information in SQLite
- ✅ **Enhanced UI components** - FileBrowser, FileUpload, MediaPlayer
- ✅ **API endpoints** - `/api/v1/storage/files/*` UUID-based operations
- ✅ **Secure downloads** - Authenticated file access with proper headers
- ✅ **Configuration management** - Dynamic storage configuration

### **API Endpoints**

```http
# Upload file
POST /api/v1/storage/upload/:folder
Content-Type: multipart/form-data

# Get file by UUID
GET /api/v1/storage/files/:id
Authorization: Bearer <token>

# List files in folder
GET /api/v1/storage/folders/:folder/files
Authorization: Bearer <token>

# Get file metadata
GET /api/v1/storage/files/:id/info
Authorization: Bearer <token>

# Delete file
DELETE /api/v1/storage/files/:id
Authorization: Bearer <token>
```

## 🛠️ Future Enhancements

- Support encrypted attachments
- Auto-cleanup orphaned files
- Support file deduplication
- Advanced file versioning
- Content-based file search
- Automatic thumbnail generation

---

## 📅 History

- Drafted: 2025-07-04
