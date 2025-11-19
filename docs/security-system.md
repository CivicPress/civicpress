# CivicPress Security System

## Overview

CivicPress implements a comprehensive, multi-layered security system that
provides robust user authentication, authorization, and data protection. The
security system is designed to handle both traditional password-based
authentication and external OAuth providers while maintaining strict security
boundaries.

## Architecture

### Core Components

1. **AuthService** (`core/src/auth/auth-service.ts`)
   - Central authentication and authorization logic
   - User management and role-based access control
   - Security guard enforcement

2. **EmailValidationService** (`core/src/auth/email-validation-service.ts`)
   - Email format validation and uniqueness checking
   - Secure email change workflow with token-based verification
   - Automated cleanup of expired tokens

3. **RoleManager** (`core/src/auth/role-manager.ts`)
   - Permission-based authorization system
   - Role configuration and validation

4. **DatabaseService** (`core/src/database/database-service.ts`)
   - Secure user data persistence
   - Audit logging for security events

## Security Features

### 1. Multi-Provider Authentication

#### Password Authentication

- Traditional username/password authentication
- Secure password hashing using bcrypt
- Password complexity requirements (minimum 8 characters)

#### External OAuth Authentication

- Support for GitHub, Google, and other OAuth providers
- Automatic user provisioning and profile synchronization
- Secure token validation and user mapping

### 2. Security Guards and Rails

#### External Auth Protection

CivicPress automatically prevents users authenticated via external providers
from setting passwords:

```typescript
// Core security guard
if (!authService.canSetPassword(user)) {
  throw new Error('Users authenticated via external providers cannot set passwords');
}
```

**Enforcement Points:**

- ✅ **API Layer**: All password-related endpoints check authentication provider
- ✅ **UI Layer**: Password fields hidden for external auth users
- ✅ **CLI Layer**: Commands reject password operations for external auth users
- ✅ **Database Layer**: Direct updates prevented via security guards

#### Permission-Based Access Control

- **Self-service operations**: Users can manage their own profile and security
  settings
- **Admin operations**: Administrators can manage any user's settings (with
  security restrictions)
- **Role-based permissions**: Fine-grained control over user capabilities

### 3. Email Validation and Security

#### Email Format Validation

- RFC 5321 compliant email validation
- Maximum length restrictions (254 characters)
- Protection against malformed email addresses

#### Email Uniqueness Enforcement

- Database-level uniqueness constraints
- Application-level validation before changes
- Support for case-insensitive email matching

#### Secure Email Change Workflow

1. **Request**: User initiates email change
2. **Validation**: System validates new email format and uniqueness
3. **Token Generation**: Secure, time-limited verification token created
4. **Verification**: User clicks email link to complete change
5. **Completion**: Email updated and verification token cleared

```typescript
// Email change workflow
const result = await authService.requestEmailChange(userId, newEmail);
// User receives email with verification link
const completion = await authService.completeEmailChange(token);
```

### 4. Audit Logging

All security-related operations are automatically logged:

- User authentication attempts
- Password changes and security setting updates
- Email address changes and verifications
- Administrative actions on user accounts
- Failed authentication and authorization attempts

## API Security

### Authentication Requirements

All protected endpoints require valid authentication:

```http
Authorization: Bearer <jwt-token>
```

### Security Endpoints

#### Password Management

- `POST /api/v1/users/:id/change-password` - Change own password
- `POST /api/v1/users/:id/set-password` - Admin sets user password

#### Email Management

- `POST /api/v1/users/:id/request-email-change` - Request email change
- `POST /api/v1/users/verify-email-change` - Complete email verification
- `POST /api/v1/users/:id/cancel-email-change` - Cancel pending email change

#### Security Information

- `GET /api/v1/users/:id/security-info` - Get user security status

### Error Responses

Security violations return appropriate HTTP status codes:

- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Insufficient permissions or security guard violation
- `400 Bad Request` - Invalid input or security constraint violation

## UI Security Features

### Conditional Interfaces

The UI automatically adapts based on user authentication method:

#### Password-Authenticated Users

- Full password management interface
- Email change functionality
- Complete security settings panel

#### External Auth Users

- Read-only security information
- Clear indication of external authentication
- Guidance to manage settings via external provider

### Security Settings Component

The `SecuritySettings.vue` component provides a comprehensive interface for:

- **Security Overview**: Authentication provider, email verification status
- **Password Management**: Change password (if applicable)
- **Email Management**: Request/cancel email changes, verification status

## CLI Security Commands

### User Security Management

```bash
# Change user password
civic users:change-password <username> --current-password <current> --new-password <new>

# Admin set user password
civic users:set-password <username> --password <password>

# Request email change
civic users:request-email-change <username> --email <new-email>

# Verify email change
civic users:verify-email <token>

# Cancel email change
civic users:cancel-email-change <username>

# View security information
civic users:security-info <username>
```

### Security Guards in CLI

CLI commands automatically enforce the same security guards as the API:

```bash
$ civic users:set-password github-user --password newpass123
Error: User 'github-user' is authenticated via github
Password management is handled by the external provider
```

## Database Schema

### User Security Fields

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT,
  auth_provider TEXT DEFAULT 'password',
  email_verified BOOLEAN DEFAULT FALSE,
  pending_email TEXT,
  pending_email_token TEXT,
  pending_email_expires DATETIME,
  -- ... other fields
);
```

### Email Verification Table

```sql
CREATE TABLE email_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
```

## Security Configuration

### Email Validation Settings

- **Token Expiry**: 24 hours (configurable)
- **Token Length**: 32+ characters (cryptographically secure)
- **Cleanup Frequency**: Automated cleanup of expired tokens

### Password Requirements

- **Minimum Length**: 8 characters
- **Hashing**: bcrypt with 12 salt rounds
- **Storage**: Never store plaintext passwords

### OAuth Configuration

External OAuth providers are configured in the system configuration:

```yaml
oauth:
  github:
    enabled: true
    client_id: "your-github-client-id"
    client_secret: "your-github-client-secret"
  google:
    enabled: true
    client_id: "your-google-client-id"
    client_secret: "your-google-client-secret"
```

## Testing

### Security Test Coverage

The security system includes comprehensive test coverage:

- **Core Tests**: Email validation, security guards, authentication flows
- **API Tests**: Endpoint security, permission enforcement, error handling
- **CLI Tests**: Command security, interactive prompts, validation
- **UI Tests**: Component behavior, conditional rendering, user workflows

### Test Categories

1. **Authentication Tests**: Login, OAuth, token validation
2. **Authorization Tests**: Permission checking, role enforcement
3. **Security Guard Tests**: External auth protection, validation
4. **Email Validation Tests**: Format checking, uniqueness, workflow
5. **Error Handling Tests**: Edge cases, malformed inputs, security violations

## Best Practices

### For Developers

1. **Always use AuthService methods** for authentication operations
2. **Check security guards** before password-related operations
3. **Validate permissions** before allowing user modifications
4. **Log security events** for audit trails
5. **Test security scenarios** thoroughly

### For Administrators

1. **Regularly review audit logs** for suspicious activity
2. **Monitor email verification rates** and failed attempts
3. **Keep OAuth configurations** up to date
4. **Enforce strong password policies** for password users
5. **Regular security assessments** of user accounts

## Migration Guide

### From Previous Versions

If upgrading from a version without the security system:

1. **Database Migration**: Run automatic migrations to add security fields
2. **User Data**: Existing users will be migrated to `auth_provider: 'password'`
3. **Configuration**: Review and update OAuth provider settings
4. **Testing**: Verify all authentication flows work correctly

### Backward Compatibility

The security system maintains backward compatibility:

- Existing password users continue to work normally
- Legacy authentication methods are automatically upgraded
- API endpoints maintain existing behavior with added security

## Troubleshooting

### Common Issues

#### External Auth Users Can't Set Passwords

**Expected Behavior**: This is a security feature, not a bug. **Solution**:
Direct users to manage passwords via their external provider.

#### Email Verification Not Working

**Check**:

- Email service configuration
- Token expiration settings
- Network connectivity for email delivery

#### Permission Denied Errors

**Check**:

- User role assignments
- Permission configuration
- Authentication token validity

### Debug Information

Enable debug logging to troubleshoot security issues:

```bash
DEBUG=civicpress:security npm start
```

This will log detailed information about:

- Authentication attempts
- Permission checks
- Security guard enforcement
- Email validation steps

## Security Considerations

### Production Deployment

1. **HTTPS Required**: All authentication must use HTTPS in production
2. **Secure Cookies**: Configure secure session cookies
3. **Rate Limiting**: Implement rate limiting on authentication endpoints
4. **Token Security**: Use secure, random tokens for all operations
5. **Regular Updates**: Keep dependencies updated for security patches

### Data Protection

1. **Password Hashing**: Never store plaintext passwords
2. **Token Expiration**: All tokens have reasonable expiration times
3. **Audit Logging**: Maintain logs for security compliance
4. **Data Encryption**: Encrypt sensitive data at rest and in transit
5. **Access Controls**: Implement principle of least privilege

## Future Enhancements

### Planned Features

1. **Multi-Factor Authentication (MFA)**: Additional security layer
2. **Session Management**: Advanced session control and monitoring
3. **Security Policies**: Configurable password and security policies
4. **Advanced Audit**: Enhanced logging and reporting capabilities
5. **Single Sign-On (SSO)**: Enterprise SSO integration

### Extension Points

The security system is designed to be extensible:

- **Custom OAuth Providers**: Add support for additional providers
- **Authentication Plugins**: Extend authentication methods
- **Security Policies**: Implement custom security rules
- **Audit Handlers**: Custom audit log processing
- **Validation Rules**: Additional email and password validation

---

For technical support or security questions, please refer to the
[API documentation](./api.md) or
[contact the development team](mailto:security@civicpress.org).
