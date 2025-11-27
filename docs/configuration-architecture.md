# Configuration Architecture

## Overview

CivicPress uses a layered configuration system that separates public platform
configuration from private system data, ensuring security while maintaining
version control and collaboration capabilities.

## Folder Structure

### `data/.civic/` - Public Platform Configuration

**Purpose**: Single source of truth for all non-sensitive platform
configuration  
**Git Status**: Committed to repository  
**Usage**: Active runtime configuration

#### Contents

- `org-config.yml` - Organization branding, contact information, and public
  details
- `hooks.yml` - Event-driven workflow automation rules
- `notifications.yml` - Email, SMS, and webhook notification settings
- `roles.yml` - User permissions and access control rules
- `workflows.yml` - Record statuses and approval workflows
- `templates/` - Content templates for different record types

#### Example: `org-config.yml`

```yaml
# Organization Configuration
name: CivicPress
city: Springfield
state: Virginia
country: Canada
timezone: America/Montreal
website: https://civicpress.org
description: A modern civic technology platform
# ... more configuration
```

### `core/src/defaults/` - Default Template Files

**Purpose**: Template files that are NEVER used directly by the running system  
**Git Status**: Committed to repository  
**Usage**: Reference templates for initialization and reset

#### Contents

- Default configuration templates
- Bootstrap files for new projects
- Reference implementations

#### Usage Scenarios

1. **Project Initialization**: `civic init` copies these to `data/.civic/`
2. **Feature Updates**: New features update these templates
3. **Reset to Defaults**: Users can restore default configurations
4. **Development Reference**: Developers see expected structure

### `.system-data/` - Private System Data

**Purpose**: Sensitive system data and operational configuration  
**Git Status**: Never committed (in .gitignore)  
**Usage**: Local system operation only

#### Contents

- `civic.db` - SQLite database files
- User sessions and authentication tokens
- Sensitive operational configurations
- Internal system settings
- Temporary files and caches

## Configuration Lifecycle

### 1. Project Initialization

```
civic init
├── Create data/.civic/ directory
├── Copy core/src/defaults/* → data/.civic/
├── Initialize database in .system-data/
└── Set up initial configuration
```

### 2. Runtime Operation

```
Running System
├── Read configuration from data/.civic/
├── Store data in .system-data/
├── Never access core/src/defaults/
└── Validate configuration on load
```

### 3. Configuration Updates

```
User modifies configuration
├── Validate changes
├── Save to data/.civic/
├── Apply changes immediately
└── Log changes for audit
```

### 4. Reset to Defaults

```
User resets configuration
├── Backup current config
├── Copy from core/src/defaults/
├── Overwrite data/.civic/
└── Restart affected services
```

## Security Considerations

### Public Configuration (`data/.civic/`)

- ✅ **Safe to commit**: No sensitive information
- ✅ **Collaborative**: Team members can modify
- ✅ **Version controlled**: Changes are tracked
- ⚠ **Public exposure**: Visible in repository

### Private Data (`.system-data/`)

- ❌ **Never commit**: Contains sensitive information
- ❌ **Local only**: Not shared between environments
- ✅ **Secure**: Protected from unauthorized access
- ✅ **Isolated**: Separate from public configuration

## Best Practices

### For Developers

1. **Always read from `data/.civic/`** during runtime
2. **Never reference `core/src/defaults/`** directly
3. **Update defaults** when adding new configuration options
4. **Validate configuration** before applying changes

### For Users

1. **Modify configuration** through the web UI or CLI
2. **Version control** your `data/.civic/` folder
3. **Backup configuration** before major changes
4. **Test changes** in development before production

### For Administrators

1. **Review configuration changes** before deployment
2. **Monitor configuration** for security implications
3. **Backup configuration** regularly
4. **Document customizations** for team members

## Migration Guide

### Moving from `.system-data/.civic/` to `data/.civic/`

If you have configuration files in the wrong location:

1. **Create the correct directory**:

   ```bash
   mkdir -p data/.civic
   ```

2. **Move configuration files**:

   ```bash
   mv .system-data/.civic/* data/.civic/
   ```

3. **Update .gitignore**:

   ```gitignore
# Remove data/.civic/ from .gitignore if present
# Ensure .system-data/ is in .gitignore
   .system-data/
   ```

4. **Commit the changes**:
   ```bash
   git add data/.civic/
   git commit -m "Move configuration to correct location"
   ```

## Troubleshooting

### Common Issues

**Configuration not loading**

- Check if files exist in `data/.civic/`
- Verify file permissions
- Check for syntax errors in YAML files

**Changes not persisting**

- Ensure `data/.civic/` is not in `.gitignore`
- Check file write permissions
- Verify the configuration service is reading from correct location

**Default values not available**

- Run `civic init` to copy default templates
- Check if `core/src/defaults/` contains expected files
- Verify default copying logic in initialization

### Validation Commands

```bash
# Validate configuration structure
civic config:validate

# Check configuration status
civic config:status

# List all configuration files
civic config:list

# Show specific configuration
civic config:show organization
```

## Future Considerations

### Planned Enhancements

1. **Configuration schemas** for validation
2. **Configuration migration** tools
3. **Environment-specific** configuration
4. **Configuration templates** for different use cases
5. **Configuration backup** and restore functionality

### Extension Points

1. **Plugin configuration** integration
2. **External configuration** sources
3. **Configuration encryption** for sensitive fields
4. **Configuration monitoring** and alerting
5. **Configuration analytics** and usage tracking
