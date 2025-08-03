# 🗄️ CivicPress Spec: `storage.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive storage documentation
- data management
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
  'null' dependencies: [] authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
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

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Store and serve non-Markdown files (media, attachments)
- Maintain consistent file paths across modules
- Support static/public + authenticated/private access
- Allow local disk or S3-style backends
- Expose storage location to API/UI

❌ Out of Scope:

- CDN replication
- Media transcoding (handled externally)
- Sensitive personal data storage (unless encrypted)

---

## 🔗 Inputs & Outputs

| Source             | Output                                    |
| ------------------ | ----------------------------------------- |
| Uploaded video     | `/storage/public-sessions/2025-06-12.mp4` |
| Scanned permit PDF | `/storage/permits/2025/perm-1189.pdf`     |
| Audio feedback     | `/storage/feedback/audio123.ogg`          |

---

## 📂 File/Folder Location

```
/storage/               # Public or private non-md assets
.civic/storage.yml      # Backend config (e.g. type, credentials)
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

## 🛠️ Future Enhancements

- Support encrypted attachments
- Plug into IPFS, object storage (e.g. S3, MinIO)
- Auto-cleanup orphaned files
- UI-based storage manager for clerks
- Support file deduplication

---

## 📅 History

- Drafted: 2025-07-04
