# CivicPress Backup Strategy

## Architecture Overview

CivicPress uses a **separated backup strategy** to ensure security and
transparency:

- **Public Data**: `data/` folder → Git repository (public access)
- **Private Data**: `.system-data/` folder → IT-managed backups (private)
- **Storage Assets**: Managed via storage providers. Local assets are exported
  with backups; remote cloud objects (S3/Azure) stay in place and rely on cloud
  durability/backups.

## Directory Structure

```
civicpress/
├── .civicrc                    # System configuration
├── .system-data/               # 🔒 PRIVATE - IT managed
│   ├── civic.db               # Live database (never in Git)
│   ├── logs/                  # System logs
│   └── backups/               # IT-managed backups
└── data/                      # 🌐 PUBLIC - Git repository
    ├── .civic/                # Public configuration
    │   ├── org-config.yml     # Public org config
    │   ├── workflows.yml      # Public workflows
    │   └── templates/         # Public templates
    └── records/               # Public civic records
        ├── bylaw/            # Public legal documents
        └── policy/           # Public policies
```

## Backup Workflows

### **Public Data Backup (Git Repository + Local Storage Assets)**

```bash
# Backup public data to Git
civic backup --public-only --commit --push

# This backs up:
# data/records/ (all civic records)
# data/.civic/ (public configuration)
# data/templates/ (public templates)
# storage/ manifests + exported local assets (optional flag)
# .system-data/ (never included)
```

### **Private Data Backup (IT Managed)**

```bash
# Backup private system data
civic backup --system-data --encrypt --local

# This backs up:
# .system-data/civic.db (encrypted)
# .system-data/logs/ (encrypted)
# .system-data/backups/ (encrypted)
# data/ (handled separately)
```

## Fresh Install Process

### **Complete Setup Workflow**

```bash
# 1. Fresh CivicPress installation
civic init --name "New Town" --city "Springfield"

# 2. Clone public data from template city (example)
git clone https://github.com/springfield/public-civic-data.git data/

# 3. Verify public data integrity
civic validate --public-data

# 4. Start with fresh database
civic start

# Result:
# Complete public data from template city
# Fresh local database for operations
# No sensitive data exposure
```

### **Demo & Template Bundles**

- Create rich demo datasets (e.g. Springfield, VA or Richmond, QC) by standing up a clean instance,
  loading records/files like an editor, then running `civic backup create` to
  export `data/` **with git history** plus storage assets and metadata.
- Host bundles in a dedicated repo so teams can clone the full history or
  download a tagged archive.
- `civic init` reuses the restore workflow to apply any bundle the operator
  selects. If offline, CivicPress ships a **minimal built-in sample set** so the
  experience still works without a network connection.

### **Template City Benefits**

- **Standardized Workflows**: Pre-configured civic processes
- **Best Practices**: Proven templates and configurations
- **Rapid Deployment**: Quick setup for new municipalities
- **Consistency**: Standardized civic record formats

## Security Considerations

### **Public Data (data/)**

- ✅ **Transparency**: All civic records publicly accessible
- ✅ **Audit Trail**: Complete Git history of changes
- ✅ **Compliance**: Meets public records requirements
- ✅ **Collaboration**: Multiple people can contribute

### **Private Data (.system-data/)**

- 🔒 **Access Control**: IT professionals only
- 🔒 **Encryption**: All backups encrypted
- 🔒 **Audit Logging**: Complete access tracking
- 🔒 **Compliance**: Meets data protection requirements

## Implementation Commands

### **Backup Commands**

```bash
# Create full backup (data + local storage)
civic backup create --output exports/backups

# Create backup without storage assets
civic backup create --skip-storage

# Restore from backup directory or archive
civic backup restore exports/backups/2025-11-07T15-01-30Z --overwrite
```

### **Restore Commands**

```bash
# Restore public data from Git
git pull origin main

# Restore private data from backup
civic restore --system-data --from-backup

# Verify system integrity
civic validate --full
```

### **Validation Commands**

```bash
# Validate public data
civic validate --public-data

# Validate private data
civic validate --system-data

# Validate complete system
civic validate --full
```

## Benefits of This Approach

### ** Security**

- **Clear Separation**: Public vs private data clearly defined
- **No Cross-Contamination**: Sensitive data never in public repos
- **Access Control**: IT professionals manage private data
- **Encryption**: Private data always encrypted

### ** Transparency**

- **Public Access**: All civic records publicly available
- **Git History**: Complete audit trail of changes
- **Compliance**: Meets public records requirements
- **Collaboration**: Multiple stakeholders can contribute

### ** Scalability**

- **Template Cities**: Reuse proven configurations
- **Rapid Deployment**: Quick setup for new municipalities
- **Standardization**: Consistent civic processes
- **Best Practices**: Shared knowledge and experience

### ** Disaster Recovery**

- **Git Backup**: Public data in version control
- **Encrypted Backup**: Private data securely backed up
- **Easy Restore**: Simple recovery procedures (both operational restores and
  demo bundle installs use the same tooling)
- **Integrity Checks**: Validation of restored data

## Related Documentation

- [Database Security](./specs/database.md)
- [Backup Specifications](./specs/backup.md)
- [Security Architecture](./specs/security.md)
- [Deployment Guide](./bootstrap-guide.md)
