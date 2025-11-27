# Manual Testing Guide - Security System

## Overview

This guide provides comprehensive manual testing scenarios for CivicPress's
security system. Use this guide to verify that all security features work
correctly across the API, UI, and CLI interfaces.

## Prerequisites

### Environment Setup

1. **Start the development environment:**

   ```bash
# Terminal 1: Start API server
   cd modules/api && pnpm run dev

# Terminal 2: Start UI server
   cd modules/ui && pnpm run dev
   ```

2. **Build CLI (if testing CLI commands):**

   ```bash
   cd cli && pnpm run build
   ```

3. **Initialize test data:**

   ```bash
   civic init --demo-data
   ```

### Test User Accounts

Create these test accounts for comprehensive testing:

```bash
# Password-authenticated admin user
civic users:create --username testadmin --email admin@test.com --password admin123 --role admin --name "Test Admin"

# Password-authenticated regular user
civic users:create --username testuser --email user@test.com --password user123 --role public --name "Test User"

# GitHub user (simulated) - create via API or database
```

## Test Scenarios

### 1. Password Management Tests

#### 1.1 Password Change (Self-Service)

**UI Testing:**

1. Login as `testuser` (<user@test.com> / user123)
2. Navigate to Settings → Profile
3. Locate "Security Settings" section
4. Click "Change Password"
5. Enter current password: `user123`
6. Enter new password: `newpass123`
7. Confirm password change
8. **Expected**: Success message, password updated
9. Logout and login with new password
10. **Expected**: Login successful with new password

**API Testing:**

```bash
# Get user token
curl -X POST http://localhost:3000/api/auth/simulated \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "role": "public"}'

# Change password
curl -X POST http://localhost:3000/api/v1/users/2/change-password \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword": "user123", "newPassword": "newpass456"}'
```

**CLI Testing:**

```bash
# Interactive mode
civic users:change-password testuser --token <token>

# Non-interactive mode
civic users:change-password testuser --token <token> --current-password "user123" --new-password "newpass789"
```

#### 1.2 Admin Password Setting

**UI Testing:**

1. Login as `testadmin`
2. Navigate to Users management
3. Select `testuser`
4. Click "Set Password"
5. Enter new password: `adminset123`
6. **Expected**: Success message
7. Verify user can login with new password

**CLI Testing:**

```bash
civic users:set-password testuser --token <admin-token> --password "adminset456"
```

#### 1.3 External Auth Protection

**Setup GitHub User:**

```bash
# Create via database or API simulation
# This user should have auth_provider = 'github'
```

**UI Testing:**

1. View GitHub user profile in admin panel
2. **Expected**: Password fields are hidden
3. **Expected**: Warning message about external authentication
4. **Expected**: "Managed by GitHub" indicator

**API Testing:**

```bash
# Try to set password for GitHub user
curl -X POST http://localhost:3000/api/v1/users/<github-user-id>/set-password \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"password": "shouldfail123"}'

# Expected: 403 Forbidden with external auth message
```

**CLI Testing:**

```bash
civic users:set-password githubuser --token <admin-token> --password "shouldfail"
# Expected: Error about external authentication
```

### 2. Email Validation Tests

#### 2.1 Email Change Request

**UI Testing:**

1. Login as `testuser`
2. Navigate to Settings → Profile → Security Settings
3. Click "Change Email Address"
4. Enter new email: `newemail@test.com`
5. Submit request
6. **Expected**: Success message about verification email
7. Check that pending email is shown in UI

**API Testing:**

```bash
curl -X POST http://localhost:3000/api/v1/users/2/request-email-change \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "newemail@test.com"}'
```

#### 2.2 Email Format Validation

**UI Testing:**

1. Try to change email to invalid formats:
   - `invalid-email`
   - `@example.com`
   - `user@`
   - `user space@example.com`
2. **Expected**: Each should show validation error

**API Testing:**

```bash
# Test invalid email formats
curl -X POST http://localhost:3000/api/v1/users/2/request-email-change \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "invalid-email"}'

# Expected: 400 Bad Request with validation error
```

#### 2.3 Email Uniqueness Validation

**UI Testing:**

1. Try to change email to existing email: `admin@test.com`
2. **Expected**: Error message about email already in use

**API Testing:**

```bash
curl -X POST http://localhost:3000/api/v1/users/2/request-email-change \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@test.com"}'

# Expected: 400 Bad Request with uniqueness error
```

#### 2.4 Email Verification Workflow

**Setup:**

1. Request email change via UI or API
2. Get verification token from database:

   ```sql
   SELECT pending_email_token FROM users WHERE username = 'testuser';
   ```

**API Testing:**

```bash
# Verify email change
curl -X POST http://localhost:3000/api/v1/users/verify-email-change \
  -H "Content-Type: application/json" \
  -d '{"token": "<verification-token>"}'

# Expected: Success message, email updated
```

**CLI Testing:**

```bash
civic users:verify-email "<verification-token>"
# Expected: Success message
```

#### 2.5 Cancel Email Change

**UI Testing:**

1. Request email change
2. Navigate to Security Settings
3. Click "Cancel Email Change"
4. **Expected**: Pending email cleared, success message

**CLI Testing:**

```bash
civic users:cancel-email-change testuser --token <token>
```

### 3. Security Information Tests

#### 3.1 View Security Info

**UI Testing:**

1. Login as different user types
2. Check Security Settings section shows:
   - Authentication provider (password/github/google)
   - Email verification status
   - Password management capability
   - Pending email changes

**API Testing:**

```bash
# View own security info
curl -X GET http://localhost:3000/api/v1/users/2/security-info \
  -H "Authorization: Bearer <token>"

# Expected: Complete security information object
```

**CLI Testing:**

```bash
# Human-readable format
civic users:security-info testuser --token <token>

# JSON format
civic users:security-info testuser --token <token> --json
```

#### 3.2 Permission Checks

**UI Testing:**

1. Login as regular user
2. Try to view another user's security info
3. **Expected**: Access denied or redirect

**API Testing:**

```bash
# Try to view other user's security info
curl -X GET http://localhost:3000/api/v1/users/1/security-info \
  -H "Authorization: Bearer <regular-user-token>"

# Expected: 403 Forbidden
```

### 4. Authentication Provider Tests

#### 4.1 Password User Behavior

**Verify:**

- ✅ Can set/change passwords
- ✅ Password fields visible in UI
- ✅ Security info shows `auth_provider: "password"`
- ✅ `canSetPassword: true`
- ✅ `isExternalAuth: false`

#### 4.2 GitHub User Behavior

**Verify:**

- ✅ Cannot set/change passwords
- ✅ Password fields hidden in UI
- ✅ External auth warning displayed
- ✅ Security info shows `auth_provider: "github"`
- ✅ `canSetPassword: false`
- ✅ `isExternalAuth: true`

### 5. Error Handling Tests

#### 5.1 Authentication Errors

**Test missing authentication:**

```bash
curl -X POST http://localhost:3000/api/v1/users/2/change-password \
  -H "Content-Type: application/json" \
  -d '{"currentPassword": "test", "newPassword": "test123"}'

# Expected: 401 Unauthorized
```

#### 5.2 Permission Errors

**Test insufficient permissions:**

```bash
# Regular user tries to set another user's password
curl -X POST http://localhost:3000/api/v1/users/1/set-password \
  -H "Authorization: Bearer <regular-user-token>" \
  -H "Content-Type: application/json" \
  -d '{"password": "newpass123"}'

# Expected: 403 Forbidden
```

#### 5.3 Validation Errors

**Test invalid input:**

```bash
# Password too short
curl -X POST http://localhost:3000/api/v1/users/2/change-password \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword": "user123", "newPassword": "123"}'

# Expected: 400 Bad Request with validation error
```

### 6. Cross-Interface Consistency Tests

#### 6.1 Password Change Consistency

1. Change password via UI
2. Verify change via API
3. Verify change via CLI
4. **Expected**: All interfaces show consistent state

#### 6.2 Email Change Consistency

1. Request email change via CLI
2. Check status via UI
3. Complete via API
4. **Expected**: All interfaces show updated email

### 7. Edge Case Tests

#### 7.1 Token Expiration

1. Request email change
2. Wait for token to expire (or manually expire in database)
3. Try to verify with expired token
4. **Expected**: Error about invalid/expired token

#### 7.2 Concurrent Operations

1. Request email change
2. While pending, request another email change
3. **Expected**: Previous request should be replaced

#### 7.3 Invalid User IDs

**API Testing:**

```bash
curl -X GET http://localhost:3000/api/v1/users/99999/security-info \
  -H "Authorization: Bearer <admin-token>"

# Expected: 404 Not Found
```

## Test Checklist

### Security Guards

- [ ] External auth users cannot set passwords (UI)
- [ ] External auth users cannot set passwords (API)
- [ ] External auth users cannot set passwords (CLI)
- [ ] Password users can set passwords normally
- [ ] Admin cannot override external auth restrictions

### Email Validation

- [ ] Valid email formats accepted
- [ ] Invalid email formats rejected
- [ ] Duplicate emails rejected
- [ ] Email change workflow works end-to-end
- [ ] Token expiration handled correctly

### Permission Enforcement

- [ ] Self-service operations work (own account)
- [ ] Admin operations work (any account)
- [ ] Regular users cannot access other accounts
- [ ] Unauthenticated requests rejected

### UI Behavior

- [ ] External auth users see appropriate UI
- [ ] Password users see full functionality
- [ ] Error messages are clear and helpful
- [ ] Success messages confirm operations

### API Responses

- [ ] Correct HTTP status codes
- [ ] Proper error messages
- [ ] Consistent response format
- [ ] Security headers included

### CLI Functionality

- [ ] Interactive prompts work
- [ ] Non-interactive mode works
- [ ] JSON output mode works
- [ ] Silent mode works
- [ ] Help text is accurate

## Troubleshooting

### Common Issues

**Password change not working:**

1. Check user's `auth_provider` in database
2. Verify current password is correct
3. Check password complexity requirements

**Email verification not working:**

1. Check token hasn't expired
2. Verify token format is correct
3. Check email service configuration

**Permission denied errors:**

1. Verify authentication token is valid
2. Check user role and permissions
3. Confirm user ID matches token

### Debug Commands

```bash
# Check user details in database
civic users:security-info <username> --token <admin-token> --json

# View system logs
tail -f logs/civicpress.log

# Check API responses
curl -v <api-endpoint>
```

## Security Verification

After completing all tests, verify:

1. **No security bypasses**: External auth users cannot set passwords through
   any interface
2. **Data integrity**: Email addresses remain unique and properly validated
3. **Permission enforcement**: Users can only access appropriate resources
4. **Audit trail**: Security operations are properly logged
5. **Error handling**: Security violations produce appropriate error messages

## Reporting Issues

When reporting security issues:

1. **Interface**: Which interface (UI/API/CLI) has the issue
2. **User type**: What type of user account was used
3. **Steps**: Exact steps to reproduce
4. **Expected**: What should have happened
5. **Actual**: What actually happened
6. **Logs**: Relevant log entries or error messages

---

**Security Note**: This testing should be performed in a development environment
only. Never test security features against production systems.
