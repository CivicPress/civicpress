# Secrets Management Guide

**Last Updated**: 2025-12-19  
**Status**: Production Ready

---

## Overview

CivicPress uses a centralized secrets management system for all cryptographic
operations including session tokens, API keys, email verification tokens, CSRF
protection, and webhook signatures. All secrets are derived from a single root
secret using HKDF-SHA256 (HMAC-based Key Derivation Function).

## Architecture

### Single Root Secret

CivicPress uses **one root secret** (`CIVICPRESS_SECRET`) from which all
cryptographic keys are derived:

- **Session signing keys** - For session token HMAC signatures
- **API key signing keys** - For API key HMAC signatures
- **Token signing keys** - For email verification and password reset tokens
- **CSRF signing keys** - For CSRF protection tokens
- **Webhook signing keys** - For webhook signature validation
- **JWT secrets** - For JSON Web Token signing (if used)

### Key Derivation

All keys are derived using **HKDF-SHA256** with scoped context strings. This
ensures:

- ✅ Keys are cryptographically independent
- ✅ Compromise of one key doesn't affect others
- ✅ Consistent key generation from the same root secret
- ✅ No key storage - keys are derived on-demand

## Secret Storage

### Environment Variable (Recommended for Production)

Set the `CIVICPRESS_SECRET` environment variable before starting CivicPress:

```bash
export CIVICPRESS_SECRET="your-64-character-hex-secret-here-at-least-32-bytes"
```

**Requirements**:

- Must be at least 64 hex characters (32 bytes)
- Must be a valid hexadecimal string
- Should be cryptographically random

**Generating a Secret**:

```bash
# Generate a 64-byte (512-bit) secret (128 hex characters)
openssl rand -hex 64

# Or generate a 32-byte (256-bit) secret (minimum, 64 hex characters)
openssl rand -hex 32
```

### File Storage (Development & Auto-Generation)

If `CIVICPRESS_SECRET` is not set, CivicPress will auto-generate a secret and
save it to:

```
.system-data/secrets.yml
```

**File Format**:

```yaml
secret: "a1b2c3d4e5f6..." # Hex-encoded secret
created: "2025-12-19T10:30:00.000Z" # ISO 8601 timestamp
warning: "DO NOT COMMIT THIS FILE - It contains sensitive secrets"
```

**Important Notes**:

- ✅ This file is **automatically gitignored** (`.system-data/` is in
  `.gitignore`)
- ⚠️ **DO NOT COMMIT** this file to version control
- ⚠️ The auto-generated secret is **for development only**
- ⚠️ For production, always use the `CIVICPRESS_SECRET` environment variable

### Security Considerations

1. **File Permissions**: The secrets file is created with `0600` permissions
   (read/write for owner only)
2. **Git Ignore**: `.system-data/` is automatically ignored by Git
3. **Environment Variables**: Prefer environment variables for production
   deployments
4. **Secret Strength**: Use at least 32 bytes (64 hex characters) for production
   secrets

## Setting the Secret

### Development

For local development, you can let CivicPress auto-generate a secret:

```bash
cd /path/to/civicpress
pnpm run dev
# Secret will be auto-generated and saved to .system-data/secrets.yml
```

### Production (Environment Variable)

**Docker**:

```yaml
# docker-compose.yml
services:
  civicpress:
    environment:
      - CIVICPRESS_SECRET=${CIVICPRESS_SECRET}
```

**Systemd Service**:

```ini
# /etc/systemd/system/civicpress.service
[Service]
Environment="CIVICPRESS_SECRET=your-secret-here"
```

**Kubernetes**:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: civicpress-secret
data:
  CIVICPRESS_SECRET: <base64-encoded-secret>

---
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: civicpress
        envFrom:
        - secretRef:
            name: civicpress-secret
```

**Shell Script**:

```bash
#!/bin/bash
export CIVICPRESS_SECRET="$(openssl rand -hex 64)"
# Start CivicPress
node dist/index.js
```

## Secret Rotation

### When to Rotate

Rotate the secret if:

- 🔒 Secret may have been compromised
- 🔒 Regular security rotation (e.g., annually)
- 🔒 Moving between environments

### Impact of Rotation

**What Breaks**:

- ❌ All existing **session tokens** become invalid (users must re-authenticate)
- ❌ All existing **API keys** become invalid (must be regenerated)
- ❌ All pending **email verification tokens** become invalid
- ❌ All pending **password reset tokens** become invalid
- ❌ All **CSRF tokens** become invalid
- ❌ All **webhook signatures** will fail validation

**What Continues to Work**:

- ✅ User accounts and passwords
- ✅ Database data
- ✅ Civic records and content
- ✅ Configuration files

### Rotation Procedure

### Step 1: Generate New Secret

```bash
# Generate new secret
NEW_SECRET=$(openssl rand -hex 64)
echo "New secret: $NEW_SECRET"
```

### Step 2: Update Environment Variable

```bash
# Stop CivicPress
systemctl stop civicpress

# Update environment variable
export CIVICPRESS_SECRET="$NEW_SECRET"

# Or update in your configuration management system
```

### Step 3: Restart CivicPress

```bash
# Start CivicPress with new secret
systemctl start civicpress
```

### Step 4: Notify Users

- Inform users they will need to log in again
- Notify API users they need to regenerate API keys
- Clear any cached CSRF tokens in the frontend

### Step 5: Cleanup (Optional)

After confirming everything works, you can optionally delete the old secrets
file:

```bash
# If using file-based storage, delete old file
rm .system-data/secrets.yml
```

### Backward Compatibility

CivicPress maintains **backward compatibility** with unsigned tokens during the
migration period:

- Old unsigned tokens continue to work (validated via database lookup)
- New tokens are automatically signed with the new secret
- Old tokens naturally expire and are replaced with new signed tokens

This allows for a **zero-downtime rotation** where users gradually
re-authenticate as their sessions expire.

## Troubleshooting

### Secret Not Found

**Error**: `Secrets manager not initialized`

**Cause**: `CIVICPRESS_SECRET` not set and `.system-data/secrets.yml` doesn't
exist or can't be read

**Solution**:

1. Check if `CIVICPRESS_SECRET` environment variable is set:
   `echo $CIVICPRESS_SECRET`
2. Check if `.system-data/secrets.yml` exists and is readable
3. Ensure `.system-data/` directory exists and is writable

### Invalid Secret Format

**Error**: `CIVICPRESS_SECRET must be at least 64 hex characters (32 bytes)`

**Cause**: Secret is too short or contains invalid characters

**Solution**:

1. Verify secret is at least 64 hex characters
2. Ensure secret contains only valid hex characters (`0-9`, `a-f`, `A-F`)
3. Regenerate secret: `openssl rand -hex 64`

### Secret File Permission Errors

**Error**: `Failed to save secret to file`

**Cause**: `.system-data/` directory is not writable or file permissions prevent
writing

**Solution**:

1. Ensure `.system-data/` directory exists: `mkdir -p .system-data`
2. Check directory permissions: `ls -ld .system-data`
3. Ensure directory is writable: `chmod 755 .system-data`

### Tokens Not Validating After Rotation

**Symptoms**: Users can't log in, API keys rejected, CSRF tokens invalid

**Cause**: Secret was rotated but tokens were generated with old secret

**Solution**:

1. Verify `CIVICPRESS_SECRET` is set correctly: `echo $CIVICPRESS_SECRET`
2. Restart CivicPress to ensure new secret is loaded
3. Clear any cached tokens (sessions, API keys, CSRF tokens)
4. Users must re-authenticate, API keys must be regenerated

### Development vs Production Secret

**Warning**:
`For production deployments, set CIVICPRESS_SECRET environment variable`

**Cause**: Using auto-generated secret file (development mode)

**Solution**:

- This is fine for development
- For production, set `CIVICPRESS_SECRET` environment variable
- The warning is informational - system will work with auto-generated secret

## Security Best Practices

1. **Never Commit Secrets**: Ensure `.system-data/` is in `.gitignore` (it
   should be by default)

2. **Use Environment Variables**: Prefer `CIVICPRESS_SECRET` environment
   variable over file storage for production

3. **Strong Secrets**: Use at least 32 bytes (64 hex characters) for production
   secrets

4. **Regular Rotation**: Rotate secrets periodically (e.g., annually) or after
   security incidents

5. **Access Control**: Limit access to secrets:
   - File-based: Ensure only CivicPress process can read
     `.system-data/secrets.yml`
   - Environment variable: Use secure secret management (Kubernetes Secrets, AWS
     Secrets Manager, etc.)

6. **Backup Considerations**: If backing up `.system-data/`, ensure backups are
   encrypted and access-controlled

7. **Monitoring**: Monitor for secret-related errors in logs

## API Reference

### SecretsManager

The `SecretsManager` class is available in the CivicPress core:

```typescript
import { SecretsManager } from '@civicpress/core';

// Get instance from CivicPress
const secretsManager = civicPress.getSecretsManager();

// Derive a scoped key
const key = secretsManager.deriveKey('session', 'signing');

// Get pre-configured keys
const sessionKey = secretsManager.getSessionSigningKey();
const apiKey = secretsManager.getApiKeySigningKey();
const csrfKey = secretsManager.getCsrfSigningKey();
const webhookKey = secretsManager.getWebhookSigningKey();

// Sign and verify data
const signature = secretsManager.sign('data', key);
const isValid = secretsManager.verify('data', signature, key);
```

## Related Documentation

- [Security System](./security-system.md) - Overall security architecture
- [Auth System](./auth-system.md) - Authentication and authorization

---

**Questions or Issues?**  
If you encounter issues with secrets management, check the troubleshooting
section above.
