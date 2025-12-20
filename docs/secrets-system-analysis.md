# Secrets System Analysis & Proposal

**Date**: 2025-12-19  
**Status**: Analysis Complete - Ready for Implementation  
**Scope**: Authentication, Session, Token, and Request-Signing Security

---

## Executive Summary

CivicPress currently uses **ad-hoc cryptographic operations** without a
centralized secrets management system. This analysis identifies all
secret-dependent operations and proposes a minimal, modern secrets architecture
similar to WordPress salts but explicitly designed for CivicPress's local-first,
auditable philosophy.

**Key Finding**: No centralized secrets system exists. All token generation uses
`crypto.randomBytes()` directly, and JWT secret has a weak default that warns
but doesn't enforce production requirements.

---

## 1. Current State Analysis

### 1.1 Session Handling

**Location**: `core/src/auth/auth-service.ts`

**Current Implementation**:

- Session tokens generated via `crypto.randomBytes(32).toString('hex')` (64-char
  hex)
- Tokens hashed with SHA-256 before storage:
  `crypto.createHash('sha256').update(token).digest('hex')`
- No signing or HMAC - tokens are validated by database lookup only
- Sessions stored in database with `token_hash`, `user_id`, `expires_at`

**Secret Dependency**: **NONE** - Currently uses pure randomness, no secret
signing

**Security Assessment**:

- ✅ Secure token generation (cryptographically random)
- ⚠️ No token signing/verification - tokens validated only by database lookup
- ⚠️ If database is compromised, all session hashes can be brute-forced (SHA-256
  is fast)

**Recommendation**: Add HMAC signing to session tokens using derived secret key

---

### 1.2 Token Generation

#### Session Tokens

- **Location**: `auth-service.ts:215` - `generateSecureToken()`
- **Method**: `crypto.randomBytes(32).toString('hex')`
- **Usage**: Session creation
- **Secret Dependency**: None

#### API Keys

- **Location**: `auth-service.ts:146` - `createApiKey()`
- **Method**: Same `generateSecureToken()` → SHA-256 hash
- **Usage**: Long-lived API authentication
- **Secret Dependency**: None

#### Email Verification Tokens

- **Location**: `core/src/auth/email-validation-service.ts:229`
- **Method**: `crypto.randomBytes(32).toString('hex')`
- **Usage**: Email verification, email change confirmation
- **Secret Dependency**: None
- **Note**: Stored in database, validated by lookup

#### Password Reset Tokens

- **Status**: **NOT YET IMPLEMENTED** (planned feature)
- **Expected Location**: `auth-service.ts` or separate service
- **Secret Dependency**: Should use signed tokens

---

### 1.3 JWT Configuration

**Location**: `core/src/auth/auth-config.ts:104-106`

**Current Implementation**:

```typescript
jwt: {
  secret: process.env.JWT_SECRET || 'default-jwt-secret-change-in-production',
  expiresIn: '24h',
}
```

**Issues Identified**:

1. ⚠️ Weak default secret that's hardcoded
2. ⚠️ Warning logged but no enforcement in production
3. ⚠️ JWT not actually used in current implementation (auth uses session tokens,
   not JWT)
4. ⚠️ Secret from environment variable OR default - no validation

**Usage**: **Currently unused** - JWT configuration exists but sessions use
database-backed tokens, not JWT

**Recommendation**: Either remove unused JWT config OR implement JWT properly
with secret derivation

---

### 1.4 CSRF Protection

**Status**: **NOT IMPLEMENTED**

**Analysis**:

- No CSRF middleware found
- No CSRF token generation
- No cookie-based CSRF protection
- API uses Bearer tokens (less vulnerable to CSRF, but not immune)

**Recommendation**: Implement CSRF protection for state-changing operations
using derived secret

---

### 1.5 Webhook Signatures

**Location**: `core/src/notifications/notification-security.ts:170`

**Current Implementation**:

```typescript
validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // In production, implement proper HMAC validation
  // For now, just return true
  return true;
}
```

**Status**: **STUBBED - NOT IMPLEMENTED**

**Recommendation**: Implement HMAC-SHA256 webhook signature validation using
derived secret

---

### 1.6 Cookie Handling

**Status**: **NOT FOUND**

**Analysis**:

- No cookie-parser middleware in API
- No cookie-based session storage
- Sessions use Bearer tokens in Authorization header
- UI uses i18n cookie (`i18n_redirected`) but no session cookies

**Note**: No cookie signing currently needed, but if cookies are added for CSRF
or session storage, they'll need signing.

---

## 2. Secrets Usage Matrix

| Operation                 | Current Method         | Secret Needed? | Priority                         |
| ------------------------- | ---------------------- | -------------- | -------------------------------- |
| Session Token Generation  | `crypto.randomBytes()` | ❌ No          | Low (add signing)                |
| Session Token Validation  | Database lookup        | ❌ No          | **High** (add HMAC verification) |
| API Key Generation        | `crypto.randomBytes()` | ❌ No          | Medium (add signing)             |
| API Key Validation        | Database lookup        | ❌ No          | Medium (add HMAC verification)   |
| Email Verification Tokens | `crypto.randomBytes()` | ❌ No          | Medium (add signing)             |
| Password Reset Tokens     | Not implemented        | ✅ Yes         | **High** (requires signing)      |
| JWT Secret                | Environment variable   | ✅ Yes         | Low (unused currently)           |
| CSRF Tokens               | Not implemented        | ✅ Yes         | **High** (security requirement)  |
| Webhook Signatures        | Stubbed                | ✅ Yes         | Medium (future feature)          |
| Cookie Signing            | Not applicable         | N/A            | Low (if cookies added)           |

---

## 3. Security Gaps Identified

### Critical Issues

1. **No Token Signing**: All tokens are random values validated by database
   lookup
   - **Risk**: If database is compromised, tokens can be brute-forced or replay
     attacks possible
   - **Fix**: HMAC-sign all tokens with derived secret

2. **Weak JWT Default Secret**: Hardcoded default secret exists
   - **Risk**: If JWT is enabled without environment variable, uses weak secret
   - **Fix**: Require explicit secret or auto-generate with warning

3. **No CSRF Protection**: State-changing operations vulnerable to CSRF
   - **Risk**: Malicious sites can trigger actions on behalf of authenticated
     users
   - **Fix**: Implement CSRF tokens with derived secret

### Medium Priority Issues

4. **Webhook Signature Validation Stubbed**: Always returns true
   - **Risk**: Webhooks can be spoofed
   - **Fix**: Implement HMAC validation

5. **No Secret Rotation Strategy**: No mechanism to rotate secrets
   - **Risk**: Compromised secrets require manual intervention
   - **Fix**: Document rotation procedure, consider versioning

---

## 4. Proposed Architecture

### 4.1 Design Principles

1. **One Root Secret**: `CIVICPRESS_SECRET` environment variable
2. **HKDF Key Derivation**: Derive scoped keys from root secret using
   HKDF-SHA256
3. **Local-First**: Secrets live in environment or `.system-data/secrets.yml`
   (gitignored)
4. **Safe Defaults**: Auto-generate secret on first run with clear warnings
5. **Explicit Scoping**: Each use case gets its own derived key
6. **Auditable**: All secret usage is explicit and traceable

### 4.2 Key Derivation Scopes

From single `CIVICPRESS_SECRET`, derive:

1. **`session_signing`**: HMAC key for session token signing
2. **`api_key_signing`**: HMAC key for API key signing
3. **`token_signing`**: HMAC key for email verification, password reset tokens
4. **`csrf_signing`**: HMAC key for CSRF token generation/validation
5. **`webhook_signing`**: HMAC key for webhook signature validation
6. **`jwt_secret`**: JWT secret (if JWT is implemented)
7. **`cookie_signing`**: HMAC key for cookie signing (future)

### 4.3 Module Structure

**New File**: `core/src/security/secrets.ts`

```typescript
export class SecretsManager {
  // Singleton pattern
  private static instance: SecretsManager;

  // Root secret (from env or file)
  private rootSecret: string;

  // Derived keys cache
  private derivedKeys: Map<string, Buffer> = new Map();

  // HKDF derivation function
  deriveKey(scope: string): Buffer;

  // Scoped key getters
  getSessionSigningKey(): Buffer;
  getApiKeySigningKey(): Buffer;
  getTokenSigningKey(): Buffer;
  getCsrfSigningKey(): Buffer;
  getWebhookSigningKey(): Buffer;
  getJwtSecret(): string;

  // Secret initialization (auto-generate if needed)
  initialize(dataDir: string): void;

  // Validation
  validateSecret(secret: string): boolean;
}
```

### 4.4 Secret Storage Options

**Priority 1**: Environment Variable

```bash
export CIVICPRESS_SECRET="your-64-char-hex-secret-here"
```

**Priority 2**: `.system-data/secrets.yml` (gitignored, auto-created)

```yaml
# Auto-generated on first run - DO NOT COMMIT
secret: "generated-64-char-hex-secret"
created: "2025-12-19T..."
```

**Fallback**: Auto-generate with warning (development only)

---

## 5. Implementation Plan

### Phase 1: Core Secrets Module

1. Create `core/src/security/secrets.ts`
2. Implement `SecretsManager` class
3. Add HKDF key derivation (use Node.js `crypto.hkdf()`)
4. Add secret loading from environment or file
5. Add auto-generation with warnings

### Phase 2: Token Signing

1. Update `auth-service.ts`:
   - Sign session tokens with HMAC before hashing
   - Verify HMAC on session validation
   - Sign API keys with HMAC
2. Update `email-validation-service.ts`:
   - Sign email verification tokens
   - Verify signatures on token validation
3. Implement password reset tokens with signing

### Phase 3: CSRF Protection

1. Create `core/src/security/csrf.ts`
2. Generate CSRF tokens using derived key
3. Add CSRF middleware to API
4. Add CSRF token to UI forms

### Phase 4: Webhook Signatures

1. Implement HMAC-SHA256 in `notification-security.ts`
2. Update webhook endpoints to validate signatures

### Phase 5: Cleanup & Documentation

1. Remove unused JWT config OR implement JWT properly
2. Update `.gitignore` to exclude `.system-data/secrets.yml`
3. Add documentation:
   - Where secrets live
   - How to rotate secrets
   - What breaks when rotated
   - Security considerations

---

## 6. Files to Modify

### New Files

- `core/src/security/secrets.ts` - Secrets manager
- `core/src/security/csrf.ts` - CSRF protection (optional, Phase 3)
- `.system-data/secrets.yml` - Secret storage (gitignored, auto-created)
- `docs/secrets-management.md` - Documentation

### Modified Files

- `core/src/auth/auth-service.ts` - Add token signing/verification
- `core/src/auth/email-validation-service.ts` - Add token signing
- `core/src/auth/auth-config.ts` - Remove or fix JWT secret handling
- `core/src/notifications/notification-security.ts` - Implement webhook
  signatures
- `.gitignore` - Ensure `.system-data/secrets.yml` is ignored
- `core/src/civic-core.ts` - Initialize secrets manager on startup
- `cli/src/commands/init.ts` - Generate secret during init if needed

---

## 7. Security Considerations

### Secret Rotation Impact

When `CIVICPRESS_SECRET` is rotated:

**Immediately Invalidated**:

- All active sessions (users must re-login)
- All API keys (must be regenerated)
- All pending email verification tokens
- All CSRF tokens
- All signed webhook requests

**Not Affected**:

- Password hashes (bcrypt, independent)
- Database content
- Git history
- Already-verified email addresses

**Recommendation**: Implement graceful rotation with overlap period or require
re-authentication

### Secret Strength

- **Minimum**: 32 bytes (256 bits) - cryptographically secure
- **Recommendation**: 64 bytes (512 bits) - future-proof
- **Format**: Hex-encoded random bytes
- **Generation**: `crypto.randomBytes(64).toString('hex')`

### Development vs Production

- **Development**: Auto-generate secret on first run, warn clearly
- **Production**: Require explicit `CIVICPRESS_SECRET` environment variable
- **Validation**: Reject weak secrets (< 32 bytes)

---

## 8. Migration Strategy

### For Existing Deployments

1. **No Breaking Changes Initially**: Old tokens continue to work (database
   lookup still valid)
2. **Gradual Migration**: New tokens get signed, old tokens validated via
   database
3. **Optional Enforcement**: Add flag to require signed tokens after migration
   period

### For New Deployments

1. Secret auto-generated on `civic init`
2. Secret stored in `.system-data/secrets.yml`
3. Clear warnings about setting persistent secret for production

---

## 9. Testing Considerations

1. **Unit Tests**: Test key derivation, signing, verification
2. **Integration Tests**: Test session creation/validation with secrets
3. **Migration Tests**: Test old tokens still work during transition
4. **Security Tests**: Ensure tokens without signature are rejected (when
   enforced)

---

## 10. Non-Goals (Out of Scope)

✅ **Not Implementing**:

- External secret managers (AWS Secrets Manager, HashiCorp Vault, etc.)
- Encryption-at-rest (unless already partially present)
- Authentication flow redesign (only secret management)
- Multi-tenant secret isolation (future consideration)

---

## 11. Open Questions

1. **JWT Usage**: Should we remove unused JWT config or implement JWT properly?
   - **Recommendation**: Remove unless JWT is planned soon

2. **Cookie Sessions**: Should we support cookie-based sessions in future?
   - **Recommendation**: Plan for it, but don't implement now

3. **Secret Versioning**: Should we support multiple secret versions during
   rotation?
   - **Recommendation**: Keep simple for v0.2 - require re-authentication

4. **UI Integration**: How should UI handle CSRF tokens?
   - **Recommendation**: Auto-inject via middleware, store in meta tag or cookie

---

## 12. Next Steps

1. ✅ **Analysis Complete** (this document)
2. ⏳ Review and approve architecture
3. ⏳ Implement Phase 1: Core secrets module
4. ⏳ Implement Phase 2: Token signing
5. ⏳ Test and validate
6. ⏳ Documentation

---

**Status**: Ready for implementation. All identified secret-dependent operations
have been catalogued, and a minimal, secure architecture has been proposed that
aligns with CivicPress's local-first philosophy.
