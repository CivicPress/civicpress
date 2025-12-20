# Secrets System Implementation Plan

**Date**: 2025-12-19  
**Status**: Ready for Implementation  
**Based on**: `docs/secrets-system-analysis.md`  
**Estimated Effort**: 8-12 hours

---

## Overview

This document provides a complete, step-by-step implementation plan for
introducing a centralized secrets management system to CivicPress. The plan is
organized into phases with specific tasks, file changes, and testing
requirements.

---

## Implementation Phases

### Phase 1: Core Secrets Infrastructure (2-3 hours)

### Phase 2: Token Signing Implementation (2-3 hours)

### Phase 3: CSRF Protection (1-2 hours)

### Phase 4: Webhook Signatures (1 hour)

### Phase 5: Documentation & Cleanup (1-2 hours)

---

## Phase 1: Core Secrets Infrastructure

### Goal

Create the centralized secrets manager with HKDF key derivation and secret
storage.

### Tasks

#### Task 1.1: Create Secrets Manager Module

**File**: `core/src/security/secrets.ts` (NEW)

**Implementation Details**:

```typescript
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';

const logger = new Logger();

/**
 * Secrets Manager - Centralized secret management with HKDF key derivation
 *
 * Derives scoped keys from a single root secret using HKDF-SHA256.
 * Supports secret storage in environment variable or .system-data/secrets.yml
 */
export class SecretsManager {
  private static instance: SecretsManager;
  private rootSecret: string | null = null;
  private derivedKeys: Map<string, Buffer> = new Map();
  private secretsFilePath: string;

  private constructor(dataDir: string) {
    this.secretsFilePath = path.join(dataDir, '.system-data', 'secrets.yml');
  }

  static getInstance(dataDir: string): SecretsManager {
    if (!SecretsManager.instance) {
      SecretsManager.instance = new SecretsManager(dataDir);
    }
    return SecretsManager.instance;
  }

  /**
   * Initialize secrets manager
   * Loads secret from environment, file, or generates new one
   */
  async initialize(): Promise<void> {
    // Try environment variable first
    if (process.env.CIVICPRESS_SECRET) {
      this.rootSecret = process.env.CIVICPRESS_SECRET;
      if (!this.validateSecret(this.rootSecret)) {
        throw new Error(
          'CIVICPRESS_SECRET must be at least 64 hex characters (32 bytes)'
        );
      }
      logger.info('Loaded secret from CIVICPRESS_SECRET environment variable');
      return;
    }

    // Try loading from file
    try {
      const secretData = await this.loadSecretFromFile();
      if (secretData) {
        this.rootSecret = secretData.secret;
        logger.info('Loaded secret from file');
        return;
      }
    } catch (error) {
      // File doesn't exist or can't be read - will generate new one
    }

    // Generate new secret (development only)
    await this.generateAndSaveSecret();
  }

  /**
   * Derive a scoped key using HKDF-SHA256
   */
  deriveKey(scope: string, info?: string): Buffer {
    if (!this.rootSecret) {
      throw new Error('Secrets manager not initialized');
    }

    // Check cache
    const cacheKey = `${scope}:${info || 'default'}`;
    if (this.derivedKeys.has(cacheKey)) {
      return this.derivedKeys.get(cacheKey)!;
    }

    // Derive using HKDF
    const salt = Buffer.from('civicpress-secrets-v1', 'utf-8');
    const infoBuffer = Buffer.from(`${scope}:${info || 'default'}`, 'utf-8');

    const derivedKey = crypto.hkdfSync(
      'sha256',
      Buffer.from(this.rootSecret, 'hex'),
      salt,
      infoBuffer,
      32 // 32 bytes = 256 bits
    );

    this.derivedKeys.set(cacheKey, derivedKey);
    return derivedKey;
  }

  /**
   * Get session signing key
   */
  getSessionSigningKey(): Buffer {
    return this.deriveKey('session', 'signing');
  }

  /**
   * Get API key signing key
   */
  getApiKeySigningKey(): Buffer {
    return this.deriveKey('api_key', 'signing');
  }

  /**
   * Get token signing key (for email verification, password reset)
   */
  getTokenSigningKey(): Buffer {
    return this.deriveKey('token', 'signing');
  }

  /**
   * Get CSRF signing key
   */
  getCsrfSigningKey(): Buffer {
    return this.deriveKey('csrf', 'signing');
  }

  /**
   * Get webhook signing key
   */
  getWebhookSigningKey(): Buffer {
    return this.deriveKey('webhook', 'signing');
  }

  /**
   * Get JWT secret (as string for JWT libraries)
   */
  getJwtSecret(): string {
    return this.deriveKey('jwt', 'secret').toString('hex');
  }

  /**
   * Generate HMAC signature for data
   */
  sign(data: string, key: Buffer): string {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(data);
    return hmac.digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  verify(data: string, signature: string, key: Buffer): boolean {
    const expectedSignature = this.sign(data, key);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Load secret from file
   */
  private async loadSecretFromFile(): Promise<{ secret: string; created: string } | null> {
    try {
      const content = await fs.readFile(this.secretsFilePath, 'utf-8');
      const yaml = await import('js-yaml');
      const data = yaml.load(content) as any;

      if (data?.secret && this.validateSecret(data.secret)) {
        return {
          secret: data.secret,
          created: data.created || new Date().toISOString(),
        };
      }
    } catch (error) {
      // File doesn't exist or is invalid
    }
    return null;
  }

  /**
   * Generate and save new secret
   */
  private async generateAndSaveSecret(): Promise<void> {
    // Generate 64 bytes (512 bits) of random data
    const secretBytes = crypto.randomBytes(64);
    this.rootSecret = secretBytes.toString('hex');

    // Save to file
    try {
      const secretsDir = path.dirname(this.secretsFilePath);
      await fs.mkdir(secretsDir, { recursive: true });

      const yaml = await import('js-yaml');
      const secretData = {
        secret: this.rootSecret,
        created: new Date().toISOString(),
        warning: 'DO NOT COMMIT THIS FILE - It contains sensitive secrets',
      };

      await fs.writeFile(
        this.secretsFilePath,
        yaml.dump(secretData),
        { mode: 0o600 } // Read/write for owner only
      );

      logger.warn(
        `Generated new secret and saved to ${this.secretsFilePath}`
      );
      logger.warn(
        '⚠️  WARNING: For production deployments, set CIVICPRESS_SECRET environment variable'
      );
      logger.warn(
        '⚠️  Rotating this secret will invalidate all sessions and tokens'
      );
    } catch (error) {
      logger.error('Failed to save secret to file:', error);
      throw new Error('Failed to initialize secrets manager');
    }
  }

  /**
   * Validate secret strength
   */
  private validateSecret(secret: string): boolean {
    // Must be hex-encoded, at least 64 characters (32 bytes)
    if (!/^[0-9a-fA-F]{64,}$/.test(secret)) {
      return false;
    }
    return true;
  }

  /**
   * Clear cached derived keys (useful for testing)
   */
  clearCache(): void {
    this.derivedKeys.clear();
  }
}
```

**Dependencies**:

- `js-yaml` (already in codebase)
- Node.js `crypto` module

**Testing Requirements**:

- Test key derivation produces consistent results
- Test secret loading from environment variable
- Test secret loading from file
- Test secret generation and file creation
- Test signature generation and verification
- Test validation rejects weak secrets

---

#### Task 1.2: Integrate Secrets Manager into CivicPress Core

**File**: `core/src/civic-core.ts`

**Changes**:

1. Import `SecretsManager`
2. Initialize in `initialize()` method before auth service
3. Store instance for access by services

**Code Changes**:

```typescript
// Add import
import { SecretsManager } from './security/secrets.js';

// In CivicPress class
private secretsManager: SecretsManager | null = null;

// In initialize() method, before auth service initialization:
async initialize(): Promise<void> {
  // ... existing initialization ...

  // Initialize secrets manager (must be first)
  this.secretsManager = SecretsManager.getInstance(this.config.dataDir);
  await this.secretsManager.initialize();

  // ... continue with existing initialization ...
}

// Add getter method
getSecretsManager(): SecretsManager {
  if (!this.secretsManager) {
    throw new Error('Secrets manager not initialized');
  }
  return this.secretsManager;
}
```

**Dependencies**: Task 1.1 complete

**Testing Requirements**:

- Secrets manager initialized on CivicPress startup
- Secrets manager accessible via getter
- Initialization fails gracefully if secret is invalid

---

#### Task 1.3: Update .gitignore

**File**: `.gitignore`

**Changes**:

```gitignore
# Add to existing .system-data/ section:
.system-data/
.system-data/secrets.yml
```

**Dependencies**: None

**Testing Requirements**:

- Verify `.system-data/secrets.yml` is ignored by git

---

#### Task 1.4: Create Secrets Utility Module (Optional Helper)

**File**: `core/src/utils/crypto-utils.ts` (NEW - optional)

**Purpose**: Helper utilities for common crypto operations

**Implementation**:

```typescript
import * as crypto from 'crypto';

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Create signed token: token + signature
 */
export function createSignedToken(
  token: string,
  signingKey: Buffer,
  secretsManager: { sign: (data: string, key: Buffer) => string }
): string {
  const signature = secretsManager.sign(token, signingKey);
  return `${token}.${signature}`;
}

/**
 * Verify and extract token from signed token
 */
export function verifySignedToken(
  signedToken: string,
  signingKey: Buffer,
  secretsManager: {
    verify: (data: string, signature: string, key: Buffer) => boolean;
  }
): string | null {
  const parts = signedToken.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [token, signature] = parts;
  if (secretsManager.verify(token, signature, signingKey)) {
    return token;
  }

  return null;
}
```

**Dependencies**: Task 1.1 complete

**Testing Requirements**:

- Test token generation
- Test signed token creation and verification
- Test invalid signatures are rejected

---

### Phase 1 Deliverables

- ✅ `core/src/security/secrets.ts` - Secrets manager module
- ✅ `core/src/utils/crypto-utils.ts` - Crypto utilities (optional)
- ✅ Integration into `core/src/civic-core.ts`
- ✅ `.gitignore` updated
- ✅ Unit tests for secrets manager
- ✅ Integration tests for CivicPress initialization

---

## Phase 2: Token Signing Implementation

### Goal

Update all token generation to use HMAC signing with derived keys.

### Tasks

#### Task 2.1: Update Session Token Generation & Validation

**File**: `core/src/auth/auth-service.ts`

**Changes Required**:

1. **Inject SecretsManager**:

```typescript
// In AuthService constructor or initialization
private secretsManager?: SecretsManager;

// Initialize in constructor or separate method
initializeSecrets(secretsManager: SecretsManager): void {
  this.secretsManager = secretsManager;
}
```

2. **Update `createSession()` method**:

```typescript
async createSession(
  userId: number,
  expiresInHours: number = 24
): Promise<{ token: string; session: Session }> {
  // Generate random token
  const token = this.generateSecureToken();

  // Sign token if secrets manager available
  let finalToken = token;
  if (this.secretsManager) {
    const signingKey = this.secretsManager.getSessionSigningKey();
    const signature = this.secretsManager.sign(token, signingKey);
    finalToken = `${token}.${signature}`;
  }

  // Hash for database storage (always use raw token for hashing)
  const tokenHash = this.hashToken(token);

  // ... rest of existing code ...

  return { token: finalToken, session };
}
```

3. **Update `validateSession()` method**:

```typescript
async validateSession(token: string): Promise<AuthUser | null> {
  try {
    let tokenToHash = token;

    // If token is signed, verify and extract raw token
    if (this.secretsManager && token.includes('.')) {
      const parts = token.split('.');
      if (parts.length === 2) {
        const [rawToken, signature] = parts;
        const signingKey = this.secretsManager.getSessionSigningKey();

        if (this.secretsManager.verify(rawToken, signature, signingKey)) {
          tokenToHash = rawToken;
        } else {
          // Invalid signature
          return null;
        }
      }
    }

    // Hash and lookup in database (using raw token)
    const tokenHash = this.hashToken(tokenToHash);
    const session = await this.db.getSessionByToken(tokenHash);

    // ... rest of existing validation ...
  } catch (error) {
    logger.error('Session validation failed:', error);
    return null;
  }
}
```

**Backward Compatibility**:

- Old unsigned tokens continue to work (for migration period)
- New tokens are signed
- Can add flag later to enforce signed tokens only

**Dependencies**: Phase 1 complete

**Testing Requirements**:

- New sessions get signed tokens
- Signed tokens validate correctly
- Unsigned tokens still work (backward compatibility)
- Invalid signatures are rejected
- Token format: `{hex64}.{hex64}`

---

#### Task 2.2: Update API Key Generation & Validation

**File**: `core/src/auth/auth-service.ts`

**Changes Required**:

1. **Update `createApiKey()` method**:

```typescript
async createApiKey(
  userId: number,
  name: string,
  expiresAt?: Date
): Promise<{ key: string; apiKey: ApiKey }> {
  // Generate random key
  const key = this.generateSecureToken();

  // Sign key if secrets manager available
  let finalKey = key;
  if (this.secretsManager) {
    const signingKey = this.secretsManager.getApiKeySigningKey();
    const signature = this.secretsManager.sign(key, signingKey);
    finalKey = `${key}.${signature}`;
  }

  // Hash for database storage (always use raw key)
  const keyHash = this.hashToken(key);

  // ... rest of existing code ...

  return { key: finalKey, apiKey };
}
```

2. **Update `validateApiKey()` method**:

```typescript
async validateApiKey(key: string): Promise<AuthUser | null> {
  try {
    let keyToHash = key;

    // If key is signed, verify and extract raw key
    if (this.secretsManager && key.includes('.')) {
      const parts = key.split('.');
      if (parts.length === 2) {
        const [rawKey, signature] = parts;
        const signingKey = this.secretsManager.getApiKeySigningKey();

        if (this.secretsManager.verify(rawKey, signature, signingKey)) {
          keyToHash = rawKey;
        } else {
          // Invalid signature
          return null;
        }
      }
    }

    // Hash and lookup in database
    const keyHash = this.hashToken(keyToHash);
    const apiKey = await this.db.getApiKeyByHash(keyHash);

    // ... rest of existing validation ...
  } catch (error) {
    logger.error('API key validation failed:', error);
    return null;
  }
}
```

**Dependencies**: Task 2.1 complete

**Testing Requirements**:

- New API keys get signed
- Signed API keys validate correctly
- Unsigned API keys still work (backward compatibility)
- Invalid signatures are rejected

---

#### Task 2.3: Update Email Verification Tokens

**File**: `core/src/auth/email-validation-service.ts`

**Changes Required**:

1. **Inject SecretsManager**:

```typescript
private secretsManager?: SecretsManager;

initializeSecrets(secretsManager: SecretsManager): void {
  this.secretsManager = secretsManager;
}
```

2. **Update `createVerificationToken()` method**:

```typescript
async createVerificationToken(
  userId: number,
  email: string,
  type: 'initial' | 'change'
): Promise<string> {
  try {
    // Generate random token
    const token = this.generateVerificationToken();

    // Sign token if secrets manager available
    let finalToken = token;
    if (this.secretsManager) {
      const signingKey = this.secretsManager.getTokenSigningKey();
      const signature = this.secretsManager.sign(token, signingKey);
      finalToken = `${token}.${signature}`;
    }

    // Store raw token in database (for verification)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.tokenExpiryHours);

    // Store raw token hash in database
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // ... rest of existing code, use tokenHash for storage ...

    return finalToken; // Return signed token to caller
  } catch (error) {
    // ... error handling ...
  }
}
```

3. **Update `verifyToken()` method**:

```typescript
async verifyToken(token: string): Promise<EmailVerificationToken | null> {
  try {
    let tokenToHash = token;

    // If token is signed, verify and extract raw token
    if (this.secretsManager && token.includes('.')) {
      const parts = token.split('.');
      if (parts.length === 2) {
        const [rawToken, signature] = parts;
        const signingKey = this.secretsManager.getTokenSigningKey();

        if (this.secretsManager.verify(rawToken, signature, signingKey)) {
          tokenToHash = rawToken;
        } else {
          // Invalid signature
          return null;
        }
      }
    }

    // Hash and lookup in database
    const tokenHash = crypto
      .createHash('sha256')
      .update(tokenToHash)
      .digest('hex');

    // ... rest of existing validation ...
  } catch (error) {
    // ... error handling ...
  }
}
```

**Dependencies**: Task 2.2 complete

**Testing Requirements**:

- Email verification tokens are signed
- Signed tokens validate correctly
- Unsigned tokens still work (backward compatibility)
- Invalid signatures are rejected

---

#### Task 2.4: Wire Secrets Manager into Auth Services

**File**: `core/src/civic-core-services.ts` or service registration

**Changes Required**:

Find where `AuthService` is instantiated and inject secrets manager:

```typescript
// In service registration or initialization
const authService = container.resolve<AuthService>('AuthService');
const secretsManager = container.resolve<SecretsManager>('SecretsManager');

// Initialize secrets in auth service
authService.initializeSecrets(secretsManager);

// Also initialize in email validation service
const emailValidationService = container.resolve<EmailValidationService>('EmailValidationService');
emailValidationService.initializeSecrets(secretsManager);
```

**Alternative**: Use DI container to inject dependencies automatically

**Dependencies**: All Phase 2 tasks

**Testing Requirements**:

- Secrets manager injected into all auth services
- Services can access signing keys
- Initialization order is correct

---

### Phase 2 Deliverables

- ✅ Session tokens signed and verified
- ✅ API keys signed and verified
- ✅ Email verification tokens signed and verified
- ✅ Backward compatibility maintained
- ✅ Integration tests for token signing
- ✅ Migration path for existing tokens

---

## Phase 3: CSRF Protection

### Goal

Implement CSRF token generation and validation for state-changing operations.

### Storage Strategy

CSRF tokens are stored in browser **localStorage** (not cookies) for better SPA
compatibility, following existing CivicPress patterns (`civic_auth_token`,
`civic_app_state`):

- **Storage Key**: `civic_csrf_token` (matches `civic_` prefix pattern)
- **Header Name**: `X-CSRF-Token`
- **Body Field**: `csrfToken` (alternative for form submissions)

### Tasks

#### Task 3.1: Create CSRF Protection Module

**File**: `core/src/security/csrf.ts` (NEW)

**Implementation**:

```typescript
import * as crypto from 'crypto';
import { SecretsManager } from './secrets.js';

export interface CsrfToken {
  token: string;
  expiresAt: Date;
}

/**
 * CSRF Protection Service
 */
export class CsrfProtection {
  constructor(private secretsManager: SecretsManager) {}

  /**
   * Generate CSRF token
   */
  generateToken(): CsrfToken {
    // Generate random token
    const token = crypto.randomBytes(32).toString('hex');

    // Sign with CSRF key
    const signingKey = this.secretsManager.getCsrfSigningKey();
    const signature = this.secretsManager.sign(token, signingKey);
    const signedToken = `${token}.${signature}`;

    // Token expires in 1 hour
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    return {
      token: signedToken,
      expiresAt,
    };
  }

  /**
   * Validate CSRF token
   */
  validateToken(token: string): boolean {
    if (!token || !token.includes('.')) {
      return false;
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return false;
    }

    const [rawToken, signature] = parts;
    const signingKey = this.secretsManager.getCsrfSigningKey();

    return this.secretsManager.verify(rawToken, signature, signingKey);
  }

  /**
   * Generate token for API response (to be used in forms)
   */
  getTokenForResponse(): string {
    const csrfToken = this.generateToken();
    return csrfToken.token;
  }
}
```

**Dependencies**: Phase 1 complete

**Testing Requirements**:

- CSRF tokens are generated and signed
- Valid tokens verify correctly
- Invalid tokens are rejected
- Token format is correct

---

#### Task 3.2: Create CSRF Middleware

**File**: `modules/api/src/middleware/csrf.ts` (NEW)

**Implementation**:

```typescript
import { Request, Response, NextFunction } from 'express';
import { CivicPress } from '@civicpress/core';
import { CsrfProtection } from '@civicpress/core/security/csrf.js';

/**
 * CSRF Protection Middleware
 *
 * Skips CSRF check for:
 * - GET, HEAD, OPTIONS requests
 * - Requests with valid Bearer token (API clients)
 * - Requests with X-CSRF-Bypass header (internal services)
 */
export function csrfMiddleware(civicPress: CivicPress) {
  const secretsManager = civicPress.getSecretsManager();
  const csrfProtection = new CsrfProtection(secretsManager);

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip CSRF for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    // Skip CSRF for API clients (Bearer token auth)
    if (req.headers.authorization?.startsWith('Bearer ')) {
      return next();
    }

    // Skip CSRF for internal services
    if (req.headers['x-csrf-bypass'] === 'true') {
      return next();
    }

    // Require CSRF token
    // Check header first (preferred), then body (for form submissions)
    const token = req.headers['x-csrf-token'] || req.body?.csrfToken;

    if (!token) {
      return res.status(403).json({
        error: 'CSRF token required',
        code: 'CSRF_TOKEN_MISSING',
        message: 'Include X-CSRF-Token header or csrfToken in request body',
      });
    }

    if (!csrfProtection.validateToken(token as string)) {
      return res.status(403).json({
        error: 'Invalid CSRF token',
        code: 'CSRF_TOKEN_INVALID',
        message: 'Token may be expired or tampered with',
      });
    }

    next();
  };
}
```

**Dependencies**: Task 3.1 complete

**Testing Requirements**:

- GET/HEAD/OPTIONS requests bypass CSRF
- Bearer token requests bypass CSRF
- Other requests require valid CSRF token
- Invalid tokens are rejected
- Missing tokens are rejected

---

#### Task 3.3: Add CSRF Token Endpoint

**File**: `modules/api/src/routes/auth.ts` or new `routes/csrf.ts`

**Implementation**:

```typescript
// Add endpoint to get CSRF token
// This endpoint should be accessible without authentication for initial page load
router.get('/csrf-token', (req, res) => {
  const civicPress = (req as any).civicPress as CivicPress;
  const secretsManager = civicPress.getSecretsManager();
  const csrfProtection = new CsrfProtection(secretsManager);

  const token = csrfProtection.getTokenForResponse();

  sendSuccess({ token }, req, res, { operation: 'get_csrf_token' });
});
```

**Storage Strategy**:

- **Local Storage Key**: `civic_csrf_token` (matches existing `civic_` prefix
  pattern)
- **Header Name**: `X-CSRF-Token` (sent with requests)
- **Body Field**: `csrfToken` (alternative for form submissions)

**Frontend Usage** (to be implemented in UI module):

```typescript
// Fetch CSRF token on app initialization
const response = await fetch('/api/v1/auth/csrf-token');
const { data } = await response.json();
localStorage.setItem('civic_csrf_token', data.token);

// Include in API requests
fetch('/api/v1/records', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': localStorage.getItem('civic_csrf_token') || '',
  },
  body: JSON.stringify(payload),
});
```

**Dependencies**: Task 3.2 complete

**Testing Requirements**:

- Endpoint returns valid CSRF token
- Token can be used in subsequent requests
- Token format is correct
- Token stored in localStorage (frontend implementation)

---

#### Task 3.4: Apply CSRF Middleware to State-Changing Routes

**File**: `modules/api/src/index.ts`

**Changes**: Apply CSRF middleware to POST/PUT/DELETE routes that modify state:

```typescript
// Import middleware
import { csrfMiddleware } from './middleware/csrf.js';

// In setupRoutes() method:
// Apply CSRF to state-changing routes (after auth, before route handlers)
this.app.use('/api/v1/records', authMiddleware(this.civicPress));
this.app.use('/api/v1/records', csrfMiddleware(this.civicPress));
this.app.use('/api/v1/records', recordsRouter);

// Similar for other state-changing routes:
// - /api/v1/users (POST, PUT, DELETE)
// - /api/v1/auth/* (except login/password auth)
// - /api/v1/config (POST, PUT)
// etc.
```

**Dependencies**: Task 3.3 complete

**Testing Requirements**:

- State-changing routes require CSRF token
- Read-only routes don't require CSRF
- API clients (Bearer tokens) bypass CSRF

---

### Phase 3 Deliverables

- ✅ CSRF protection module
- ✅ CSRF middleware
- ✅ CSRF token endpoint (`GET /api/v1/auth/csrf-token`)
- ✅ Middleware applied to state-changing routes
- ✅ Tests for CSRF protection
- ✅ Frontend composable/utility for CSRF token management
- ✅ Documentation for frontend integration (localStorage usage)

#### Task 3.5: Frontend CSRF Token Management (UI Module)

**File**: `modules/ui/app/composables/useCsrf.ts` (NEW)

**Purpose**: Composable for managing CSRF tokens in the frontend

**Implementation**:

```typescript
export const useCsrf = () => {
  const config = useRuntimeConfig();
  const apiUrl = config.public.civicApiUrl;
  const STORAGE_KEY = 'civic_csrf_token';

  /**
   * Fetch and store CSRF token
   */
  const fetchCsrfToken = async (): Promise<string | null> => {
    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/csrf-token`);
      const { data } = await response.json();

      if (data?.token) {
        localStorage.setItem(STORAGE_KEY, data.token);
        return data.token;
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch CSRF token:', error);
      return null;
    }
  };

  /**
   * Get CSRF token from localStorage
   */
  const getCsrfToken = (): string | null => {
    if (process.client) {
      return localStorage.getItem(STORAGE_KEY);
    }
    return null;
  };

  /**
   * Clear CSRF token
   */
  const clearCsrfToken = (): void => {
    if (process.client) {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  /**
   * Ensure CSRF token is available (fetch if missing)
   */
  const ensureCsrfToken = async (): Promise<string | null> => {
    let token = getCsrfToken();
    if (!token) {
      token = await fetchCsrfToken();
    }
    return token;
  };

  return {
    fetchCsrfToken,
    getCsrfToken,
    clearCsrfToken,
    ensureCsrfToken,
    STORAGE_KEY, // Export for reference
  };
};
```

**Integration with API Client**:

Update API client to automatically include CSRF token in requests:

```typescript
// In modules/ui/app/composables/useApi.ts or similar
const { ensureCsrfToken } = useCsrf();

// In fetch wrapper:
const csrfToken = await ensureCsrfToken();
const headers = {
  'Content-Type': 'application/json',
  ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
  ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
};
```

**Dependencies**: Task 3.3 complete

**Testing Requirements**:

- CSRF token fetched on app initialization
- Token stored in localStorage with correct key
- Token included in API requests automatically
- Token refreshed when expired or missing

### Phase 3 Frontend Integration Notes

**Storage**: CSRF tokens stored in browser `localStorage` with key:
`civic_csrf_token` (matches existing `civic_` prefix pattern)

**Implementation Pattern**:

1. Fetch token on app initialization or before first state-changing request
2. Store in localStorage: `localStorage.setItem('civic_csrf_token', token)`
3. Include in request headers: `X-CSRF-Token: <token>`
4. Token expires after 1 hour, refresh as needed

**Rationale**: localStorage is preferred over cookies for SPAs:

- ✅ No CORS cookie issues
- ✅ Works consistently across domains
- ✅ Matches existing CivicPress patterns (`civic_auth_token`,
  `civic_app_state`)
- ✅ Client-side control (no automatic sending)

---

## Phase 4: Webhook Signatures

### Goal

Implement proper HMAC-SHA256 webhook signature validation.

### Tasks

#### Task 4.1: Implement Webhook Signature Validation

**File**: `core/src/notifications/notification-security.ts`

**Changes Required**:

Update `validateWebhookSignature()` method:

```typescript
import { SecretsManager } from '../../security/secrets.js';

// Update class to accept secrets manager
private secretsManager?: SecretsManager;

initializeSecrets(secretsManager: SecretsManager): void {
  this.secretsManager = secretsManager;
}

/**
 * Validate webhook signature using HMAC-SHA256
 */
validateWebhookSignature(
  payload: string,
  signature: string,
  secret?: string
): boolean {
  // If no secrets manager, fall back to provided secret
  if (!this.secretsManager) {
    if (!secret) {
      logger.warn('No secrets manager and no secret provided for webhook validation');
      return false;
    }
    // Use provided secret (for external webhooks)
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  // Use derived webhook key for internal webhooks
  const signingKey = this.secretsManager.getWebhookSigningKey();
  return this.secretsManager.verify(payload, signature, signingKey);
}
```

**Dependencies**: Phase 1 complete

**Testing Requirements**:

- Webhook signatures validate correctly
- Invalid signatures are rejected
- Works with provided secret (external webhooks)
- Works with derived key (internal webhooks)

---

### Phase 4 Deliverables

- ✅ Webhook signature validation implemented
- ✅ Supports both external and internal webhooks
- ✅ Tests for webhook validation

---

## Phase 5: Documentation & Cleanup

### Goal

Document the secrets system, update config templates, and clean up unused code.

### Tasks

#### Task 5.1: Create Secrets Management Documentation

**File**: `docs/secrets-management.md` (NEW)

**Content**:

1. Overview of secrets system
2. Where secrets are stored
3. How to set `CIVICPRESS_SECRET`
4. How to rotate secrets
5. What breaks when secrets are rotated
6. Security considerations
7. Troubleshooting

**Dependencies**: All phases complete

---

#### Task 5.2: Update Auth Config (Remove/Fix JWT)

**File**: `core/src/auth/auth-config.ts`

**Decision Required**: Remove JWT config OR implement JWT properly

**Option A - Remove JWT**:

```typescript
// Remove jwt from AuthConfig interface
// Remove jwt from default config
// Remove JWT secret validation
```

**Option B - Use Derived JWT Secret**:

```typescript
// Update to use SecretsManager
jwt: {
  secret: secretsManager?.getJwtSecret() || 'fallback',
  expiresIn: '24h',
}
```

**Recommendation**: Remove JWT config (unused, adds complexity)

**Dependencies**: All phases complete

**Testing Requirements**:

- Config loads without errors
- JWT-related warnings removed (if removed)

---

#### Task 5.3: Update .civicrc.example

**File**: `.civicrc.example`

**Changes**: Add comment about secrets:

```yaml
# Secrets are managed separately:
# - Set CIVICPRESS_SECRET environment variable, OR
# - Secret will be auto-generated in .system-data/secrets.yml
# See docs/secrets-management.md for details
```

**Dependencies**: Task 5.1 complete

---

#### Task 5.4: Update CLI Init Command

**File**: `cli/src/commands/init.ts`

**Changes**: Add warning about secret generation:

```typescript
// After secret is generated, warn user:
logger.warn(
  '⚠️  A secret has been generated for this deployment.'
);
logger.warn(
  '⚠️  For production, set CIVICPRESS_SECRET environment variable.'
);
logger.info(
  `Secret saved to: ${path.join(dataDir, '.system-data', 'secrets.yml')}`
);
```

**Dependencies**: Phase 1 complete

---

#### Task 5.5: Add Migration Guide

**File**: `docs/secrets-migration-guide.md` (NEW)

**Content**:

1. What changed
2. Impact on existing deployments
3. Migration steps
4. Testing after migration
5. Rollback procedure

**Dependencies**: All phases complete

---

### Phase 5 Deliverables

- ✅ Comprehensive documentation
- ✅ Config templates updated
- ✅ CLI warnings added
- ✅ Migration guide
- ✅ Unused code removed/fixed

---

## Testing Strategy

### Unit Tests

**Files to Test**:

- `core/src/security/secrets.ts`
- `core/src/utils/crypto-utils.ts`
- `core/src/security/csrf.ts`

**Test Coverage Requirements**:

- Key derivation produces consistent results
- Secret loading from all sources
- Signature generation and verification
- Token signing and validation
- CSRF token generation and validation
- Error handling

### Integration Tests

**Test Scenarios**:

1. **Session Creation & Validation**:
   - Create session → get signed token → validate token
   - Validate old unsigned token (backward compatibility)
   - Reject token with invalid signature

2. **API Key Creation & Validation**:
   - Create API key → get signed key → validate key
   - Validate old unsigned key (backward compatibility)
   - Reject key with invalid signature

3. **Email Verification**:
   - Create verification token → verify token
   - Validate old unsigned token (backward compatibility)
   - Reject token with invalid signature

4. **CSRF Protection**:
   - GET request bypasses CSRF
   - POST request requires CSRF token
   - Bearer token request bypasses CSRF
   - Invalid CSRF token rejected

5. **Webhook Signatures**:
   - Validate webhook with correct signature
   - Reject webhook with invalid signature

6. **Secret Rotation**:
   - New secret invalidates old signed tokens
   - Old unsigned tokens continue to work (during migration)

### End-to-End Tests

**Test Scenarios**:

1. Fresh installation → secret auto-generated → system works
2. Production deployment → secret from env → system works
3. Secret rotation → users must re-authenticate
4. All auth flows work with signed tokens

---

## Migration Strategy

### For Existing Deployments

**Step 1**: Deploy new code (backward compatible)

- Old unsigned tokens continue to work
- New tokens are signed
- No breaking changes

**Step 2**: Monitor and validate

- Verify new tokens are being generated
- Verify signed tokens work correctly
- Monitor for any issues

**Step 3**: (Optional) Enforce signed tokens

- Add flag to require signed tokens
- Gradually migrate users
- Force re-authentication for old tokens

### For New Deployments

**Step 1**: Run `civic init`

- Secret auto-generated
- Stored in `.system-data/secrets.yml`
- Warning displayed about production

**Step 2**: (Production) Set `CIVICPRESS_SECRET`

- Export environment variable
- Restart services
- Verify secret is used (check logs)

---

## Risk Mitigation

### Risks Identified

1. **Secret Loss**: If secret is lost, all signed tokens become invalid
   - **Mitigation**: Document backup procedure, warn about secret rotation

2. **Backward Compatibility**: Old tokens must continue to work
   - **Mitigation**: Support both signed and unsigned tokens initially

3. **Performance**: HMAC operations add overhead
   - **Mitigation**: Cache derived keys, use efficient crypto

4. **Testing Complexity**: Need to test both signed and unsigned tokens
   - **Mitigation**: Comprehensive test suite, gradual migration

5. **Secret Exposure**: Risk of committing secrets to Git
   - **Mitigation**: `.gitignore` updated, clear documentation

---

## Timeline Estimate

| Phase       | Tasks      | Estimated Hours |
| ----------- | ---------- | --------------- |
| Phase 1     | 4 tasks    | 2-3 hours       |
| Phase 2     | 4 tasks    | 2-3 hours       |
| Phase 3     | 4 tasks    | 1-2 hours       |
| Phase 4     | 1 task     | 1 hour          |
| Phase 5     | 5 tasks    | 1-2 hours       |
| **Testing** | All phases | 2-3 hours       |
| **Total**   |            | **8-12 hours**  |

---

## Dependencies & Prerequisites

### External Dependencies

- ✅ `js-yaml` (already in codebase)
- ✅ Node.js `crypto` module (built-in)

### Code Prerequisites

- ✅ DI container system (for service injection)
- ✅ Logger system (for warnings/errors)
- ✅ File system access (for secret storage)

### Knowledge Prerequisites

- HKDF key derivation
- HMAC signature generation
- CSRF protection patterns

---

## Success Criteria

### Functional Requirements

- ✅ All tokens are signed with HMAC
- ✅ Token signatures are verified on validation
- ✅ CSRF protection is implemented (localStorage-based)
- ✅ Webhook signatures are validated
- ✅ Backward compatibility maintained
- ✅ Secrets can be rotated

### CSRF Token Naming Convention

Following CivicPress localStorage naming patterns (see `civic_auth_token`,
`civic_app_state`):

- **Local Storage Key**: `civic_csrf_token`
  - Uses `civic_` prefix to match existing patterns (`civic_auth_token`,
    `civic_app_state`)
  - Stored in browser localStorage (not sessionStorage)
  - Persists across page reloads but should be refreshed periodically (1-hour
    expiration)

- **HTTP Header Name**: `X-CSRF-Token`
  - Standard header name for CSRF tokens
  - Sent with all state-changing requests (POST, PUT, DELETE)
  - Automatically included by frontend API client

- **Request Body Field**: `csrfToken` (optional fallback)
  - Alternative for form submissions that can't easily set headers
  - Less preferred than header approach
  - Middleware checks header first, then body

**Storage Location**: Browser localStorage (client-side only)

- ✅ Works with SPA architecture (Nuxt 4)
- ✅ No cookie-related CORS issues
- ✅ Matches existing CivicPress patterns (`civic_*` keys)
- ✅ Consistent with auth token storage approach
- ⚠️ Note: CSRF protection is less critical for API clients using Bearer tokens
  (which bypass CSRF)

### Non-Functional Requirements

- ✅ No breaking changes for existing deployments
- ✅ Clear documentation
- ✅ Comprehensive test coverage
- ✅ Performance impact is minimal
- ✅ Security is improved

---

## Next Steps

1. ✅ **Review this plan** with team
2. ⏳ **Approve architecture** decisions
3. ⏳ **Start Phase 1** implementation
4. ⏳ **Iterate** through phases
5. ⏳ **Test** thoroughly
6. ⏳ **Deploy** to development environment
7. ⏳ **Monitor** and validate
8. ⏳ **Document** learnings

---

**Status**: Ready for implementation. This plan provides complete, actionable
steps with code examples, testing requirements, and risk mitigation strategies.
