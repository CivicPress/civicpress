# Broadcast Box Device Enrollment Security Enhancement Plan

## Overview

This plan addresses critical security vulnerabilities in the device enrollment
and registration flow. The current implementation accepts any enrollment code
and doesn't validate or store enrollment credentials, making it vulnerable to
unauthorized device registration.

## Current Security Issues

1. **Enrollment codes are not validated** - Any code is accepted
2. **Enrollment codes are not stored** - No way to verify legitimate codes
3. **No expiration** - Codes remain valid indefinitely
4. **No single-use enforcement** - Same code could be reused
5. **No rate limiting** - Vulnerable to brute force attacks
6. **Weak code entropy** - 8-character codes are guessable

## Implementation Plan

### Phase 1: Database Schema

#### 1.1 Create Enrollment Codes Table

**File**:
`modules/broadcast-box/src/storage/migrations/002_enrollment_codes.sql`

```sql
CREATE TABLE IF NOT EXISTS broadcast_enrollment_codes (
  id TEXT PRIMARY KEY,
  device_uuid TEXT NOT NULL UNIQUE,
  enrollment_code TEXT NOT NULL,
  enrollment_code_hash TEXT NOT NULL,  -- Hashed version for storage
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT NULL,
  created_by_user_id INTEGER NULL,  -- Track who generated it
  ip_address TEXT NULL,  -- IP that generated it (for audit)
  registration_ip TEXT NULL,  -- IP that used it (for audit)

  -- Indexes
  INDEX idx_enrollment_code_hash ON broadcast_enrollment_codes(enrollment_code_hash),
  INDEX idx_device_uuid ON broadcast_enrollment_codes(device_uuid),
  INDEX idx_expires_at ON broadcast_enrollment_codes(expires_at),
  INDEX idx_used_at ON broadcast_enrollment_codes(used_at)
);
```

**Rationale**:

- Store enrollment codes with expiration
- Hash codes for security (don't store plaintext)
- Track usage and audit trail
- Link to device UUID for validation

#### 1.2 Update Migration System

**File**: `modules/broadcast-box/src/broadcast-box-services.ts`

- Add migration execution for `002_enrollment_codes.sql`
- Ensure migrations run in order
- Handle "already exists" errors gracefully

### Phase 2: Enrollment Code Management

#### 2.1 Create EnrollmentCodeModel

**File**: `modules/broadcast-box/src/models/enrollment-code-model.ts`

**Responsibilities**:

- CRUD operations for enrollment codes
- Hash enrollment codes (use bcrypt or similar)
- Validate code expiration
- Mark codes as used
- Query by code hash
- Query by device UUID

**Key Methods**:

```typescript
- create(enrollmentData): Promise<EnrollmentCode>
- findByCodeHash(codeHash): Promise<EnrollmentCode | null>
- findByDeviceUuid(deviceUuid): Promise<EnrollmentCode | null>
- markAsUsed(id, registrationIp): Promise<void>
- deleteExpired(): Promise<number>  // Cleanup job
- isExpired(enrollmentCode): boolean
- isUsed(enrollmentCode): boolean
```

#### 2.2 Update DeviceManager.enrollDevice()

**File**: `modules/broadcast-box/src/services/device-manager.ts`

**Changes**:

1. Generate device UUID and enrollment code (existing)
2. Hash the enrollment code (bcrypt with salt)
3. Store enrollment code in database with:
   - `device_uuid` (the generated UUID)
   - `enrollment_code_hash` (hashed code)
   - `created_at` (now)
   - `expires_at` (now + 15 minutes)
   - `created_by_user_id` (from request context, if available)
   - `ip_address` (from request, if available)
4. Return plaintext code to admin (only time it's visible)
5. Log enrollment creation

**Security**:

- Codes expire in 15 minutes (configurable)
- Codes are hashed before storage
- Plaintext code only returned once

### Phase 3: Enrollment Code Validation

#### 3.1 Update DeviceManager.registerDevice()

**File**: `modules/broadcast-box/src/services/device-manager.ts`

**Changes**:

1. Hash the provided enrollment code
2. Look up enrollment code by hash in database
3. Validate:
   - Code exists
   - Code is not expired (`expires_at > now`)
   - Code is not used (`used_at IS NULL`)
   - Device UUID matches (`device_uuid` matches provided UUID)
4. If valid:
   - Mark code as used (`used_at = now`, `registration_ip = req.ip`)
   - Proceed with device registration
5. If invalid:
   - Log failed attempt (for security monitoring)
   - Throw appropriate error

**Error Messages**:

- "Invalid enrollment code" (code not found or hash mismatch)
- "Enrollment code expired" (expired)
- "Enrollment code already used" (used)
- "Device UUID mismatch" (UUID doesn't match)

### Phase 4: Rate Limiting

#### 4.1 Create Rate Limiter Middleware

**File**: `modules/broadcast-box/src/middleware/rate-limiter.ts`

**Features**:

- Per-IP rate limiting for registration endpoint
- Per-enrollment-code rate limiting (prevent brute force on specific codes)
- Configurable limits:
  - Registration attempts: 5 per 15 minutes per IP
  - Per-code attempts: 3 per code per 15 minutes

**Implementation**:

- Use in-memory store (Map) for development
- Can be upgraded to Redis for production
- Return 429 (Too Many Requests) when limit exceeded
- Include `Retry-After` header

#### 4.2 Apply Rate Limiting

**File**: `modules/broadcast-box/src/api/index.ts`

- Apply rate limiter to public registration endpoint
- Log rate limit violations for security monitoring

### Phase 5: Enhanced Enrollment Code Generation

#### 5.1 Strengthen Code Generation

**File**: `modules/broadcast-box/src/services/device-manager.ts`

**Changes**:

- Increase length from 8 to 12 characters
- Use cryptographically secure random generator
- Exclude ambiguous characters (0, O, I, l, etc.)
- Add optional checksum (for typo detection)

**Format**: `XXXX-XXXX-XXXX` (12 chars, grouped for readability)

### Phase 6: Cleanup and Monitoring

#### 6.1 Expired Code Cleanup Job

**File**: `modules/broadcast-box/src/services/enrollment-cleanup.ts`

**Responsibilities**:

- Periodically delete expired enrollment codes
- Run every hour (configurable)
- Keep used codes for audit trail (don't delete)
- Log cleanup statistics

#### 6.2 Security Monitoring

**Enhancements**:

- Log all enrollment code validation attempts
- Log failed registration attempts with:
  - IP address
  - Timestamp
  - Reason (invalid code, expired, used, etc.)
- Alert on suspicious patterns:
  - Multiple failed attempts from same IP
  - Brute force patterns
  - Unusual registration times

### Phase 7: API Endpoint Updates

#### 7.1 Update Registration Endpoint

**File**: `modules/broadcast-box/src/api/index.ts` (public router)

**Changes**:

- Add rate limiting middleware
- Add IP address logging
- Improve error messages (don't leak code existence)
- Return generic "Invalid credentials" for security

#### 7.2 Update Enroll Endpoint

**File**: `modules/broadcast-box/src/api/devices.ts`

**Changes**:

- Store enrollment code in database
- Include expiration time in response
- Add audit logging (who created it, from where)

## Implementation Order

1. **Database Schema** (Phase 1)
   - Create migration file
   - Update migration system
   - Test migration

2. **Enrollment Code Model** (Phase 2.1)
   - Create model class
   - Implement CRUD operations
   - Add hashing logic
   - Unit tests

3. **Update Enrollment Flow** (Phase 2.2)
   - Modify `enrollDevice()` to store codes
   - Test enrollment creation
   - Verify codes are stored correctly

4. **Update Registration Flow** (Phase 3)
   - Modify `registerDevice()` to validate codes
   - Test validation logic
   - Test error cases

5. **Rate Limiting** (Phase 4)
   - Create rate limiter
   - Apply to registration endpoint
   - Test rate limiting

6. **Code Generation Enhancement** (Phase 5)
   - Update code generation
   - Test new format
   - Update UI if needed

7. **Cleanup and Monitoring** (Phase 6)
   - Create cleanup job
   - Add security logging
   - Test monitoring

## Security Considerations

### What We're NOT Implementing (For Now)

- **Multi-tenant isolation** - All devices go to 'default' organization
- **Admin user tracking** - `created_by_user_id` will be NULL initially
- **Advanced monitoring** - Basic logging only
- **Code revocation** - Codes can't be manually revoked (only expire)

### What We ARE Implementing

- ✅ Enrollment code storage and validation
- ✅ Code expiration (15 minutes)
- ✅ Single-use enforcement
- ✅ Rate limiting
- ✅ Code hashing
- ✅ Audit logging
- ✅ Stronger code generation

## Testing Strategy

### Unit Tests

1. **EnrollmentCodeModel Tests**:
   - Create enrollment code
   - Find by hash
   - Mark as used
   - Expiration checks
   - Cleanup expired codes

2. **DeviceManager Tests**:
   - Enrollment creates code in DB
   - Registration validates code
   - Registration rejects invalid codes
   - Registration rejects expired codes
   - Registration rejects used codes

3. **Rate Limiter Tests**:
   - Per-IP limiting
   - Per-code limiting
   - Reset after time window

### Integration Tests

1. **Full Enrollment → Registration Flow**:
   - Enroll device
   - Register with valid code
   - Verify code is marked as used
   - Attempt to reuse code (should fail)

2. **Security Scenarios**:
   - Invalid code rejection
   - Expired code rejection
   - Used code rejection
   - Rate limiting enforcement
   - UUID mismatch rejection

## Configuration

### Environment Variables

```env
# Enrollment code expiration (minutes)
BROADCAST_BOX_ENROLLMENT_EXPIRY_MINUTES=15

# Rate limiting
BROADCAST_BOX_REGISTRATION_RATE_LIMIT=5  # attempts per window
BROADCAST_BOX_REGISTRATION_RATE_WINDOW=15  # minutes

# Code generation
BROADCAST_BOX_ENROLLMENT_CODE_LENGTH=12
```

## Migration Path

1. **Backward Compatibility**:
   - Existing devices continue to work (they already have JWT tokens)
   - Only affects new enrollments

2. **Data Migration**:
   - No existing enrollment codes to migrate (they're not stored)
   - Clean start for new enrollments

3. **Rollout**:
   - Deploy code changes
   - Run database migration
   - Test with new device enrollment
   - Monitor for issues

## Success Criteria

- ✅ Enrollment codes are stored in database
- ✅ Registration validates enrollment codes
- ✅ Expired codes are rejected
- ✅ Used codes cannot be reused
- ✅ Rate limiting prevents brute force
- ✅ Codes expire after 15 minutes
- ✅ Security events are logged
- ✅ All tests pass

## Future Enhancements (Not in This Plan)

- Multi-tenant organization support
- Admin user tracking in enrollment
- Manual code revocation
- Code regeneration for existing enrollments
- Advanced security monitoring dashboard
- IP whitelisting for device registration
- Device fingerprinting
