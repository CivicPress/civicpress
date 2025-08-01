# User Registration

## Overview

CivicPress provides a comprehensive user registration and authentication system
that supports both public registration and administrative user management. The
system uses JWT-based authentication with role-based access control.

## Public User Registration

### Registration Flow

1. **User visits registration page** (`/auth/register`)
2. **Fills out registration form** with username, email, password
3. **System validates input** and creates user account
4. **User receives confirmation** and can log in immediately
5. **Default role assignment** (typically "public" for basic access)

### Registration Form

The registration form includes:

- **Username**: Required, must be unique
- **Email**: Required, must be valid format and unique
- **Password**: Required, minimum security requirements
- **Full Name**: Optional, defaults to username if not provided

### Security Features

- **Password Hashing**: Passwords are securely hashed using bcrypt
- **Input Validation**: Client and server-side validation
- **Rate Limiting**: Prevents abuse of registration endpoint
- **Email Verification**: Optional email verification (future feature)

### API Endpoint

#### POST /auth/register

Register a new user account (public endpoint).

**Request Body:**

```json
{
  "username": "string (required)",
  "email": "string (required)",
  "password": "string (required)",
  "name": "string (optional)"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 2,
      "username": "newuser",
      "email": "newuser@example.com",
      "name": "New User",
      "role": "public",
      "avatar_url": null,
      "created_at": "2025-07-30T21:33:40.000Z"
    },
    "message": "User registered successfully"
  }
}
```

## Admin User Management

### Overview

The CivicPress platform includes a comprehensive user management interface for
administrators. This system allows admins to create, edit, and delete user
accounts with role-based access control.

### Features

#### ✅ **Complete User Management**

- **User Creation**: Create new users with username, email, password, and role
  assignment
- **User Editing**: Update user information including role changes and password
  updates
- **User Deletion**: Remove users with confirmation dialogs
- **Role Management**: Dynamic role assignment from platform configuration
- **Password Features**: Generate strong passwords, show/hide password
  visibility

#### ✅ **Modern UI Experience**

- **Settings Integration**: Accessible via Settings → Users in the user menu
- **Consistent Design**: Uses `UDashboardPanel` structure with proper navigation
- **Form Validation**: Inline validation errors with API interaction toasts
- **Reusable Components**: `UserForm` component for create/edit operations
- **Responsive Design**: Mobile-friendly layout with proper spacing

#### ✅ **Security Features**

- **Admin-Only Access**: User management restricted to admin role
- **Role-Based Permissions**: Dynamic permissions from platform configuration
- **Password Security**: Strong password requirements and secure handling
- **Self-Delete Prevention**: Users cannot delete their own accounts
- **Confirmation Dialogs**: Modal confirmations for destructive actions

### UI Navigation

#### **Settings Menu Integration**

User management is accessible through the user menu in the top-right corner:

1. **User Menu** → **Settings** → **Users**
2. **Admin-Only**: Only visible to users with admin role
3. **Consistent Navigation**: Uses established UI patterns

#### **Page Structure**

- **User List** (`/settings/users`): Displays all users with role badges and
  actions
- **User Edit** (`/settings/users/[id]`): Edit existing user information
- **User Create** (`/settings/users/new`): Create new user accounts
- **Profile Integration**: Edit profile button links to user management for
  admins

### API Endpoints

#### **User Management Endpoints**

All user management endpoints require admin authentication:

- `GET /api/users` - List all users
- `GET /api/users/:id` - Get specific user
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

#### **Configuration Endpoints**

Public endpoints for UI configuration:

- `GET /api/config/roles` - Get available roles (public)
- `GET /api/config/record-types` - Get record types (public)
- `GET /api/config/record-statuses` - Get record statuses (public)

### Role System

#### **Dynamic Role Configuration**

Roles are defined in `data/.civic/roles.yml` and include:

- **Admin**: Full system access and user management
- **Council**: Can create, edit, and approve records
- **Clerk**: Can create and edit records
- **Public**: Can view published records

#### **Role Features**

- **Display Names**: Human-readable role names
- **Descriptions**: Detailed role descriptions
- **Colors**: Visual color coding for roles
- **Icons**: Role-specific icons
- **Permissions**: Granular permission system

### Form Features

#### **UserForm Component**

Reusable component for user creation and editing:

- **Dynamic Labels**: Adjusts based on create/edit mode
- **Role Selection**: Dropdown with all available roles
- **Password Management**: Generate strong passwords, show/hide visibility
- **Validation**: Inline validation with API error handling
- **Delete Confirmation**: Modal confirmation for user deletion

#### **Form Fields**

All fields use `UFormField` component with rich metadata:

- **Username**: Required, unique validation
- **Email**: Required, format validation
- **Full Name**: Optional, falls back to username
- **Role**: Required, dropdown with role descriptions
- **Password**: Required for new users, optional for updates
- **Confirm Password**: Password confirmation validation

### Error Handling

#### **Validation Strategy**

- **Inline Errors**: Form validation errors displayed with fields
- **API Toasts**: Success/error messages for API interactions
- **Comprehensive States**: Loading, error, and success states
- **User Feedback**: Clear messaging for all user actions

#### **Security Considerations**

- **Permission Checks**: Admin-only access enforcement
- **Input Validation**: Client and server-side validation
- **Error Sanitization**: Secure error messages without information disclosure
- **Session Management**: Proper authentication and authorization

### Examples

#### **Creating a New User**

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "clerk",
    "email": "clerk@city.gov",
    "password": "SecurePass123!",
    "name": "City Clerk",
    "role": "clerk"
  }'
```

#### **Updating User Role**

```bash
curl -X PUT http://localhost:3000/api/users/2 \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "council",
    "name": "Senior City Clerk"
  }'
```

#### **Getting Available Roles**

```bash
curl -X GET http://localhost:3000/api/config/roles
```

### CLI Integration

The CivicPress CLI also supports user management:

```bash
# List all users
civic users list

# Create a new user
civic users create --username clerk --email clerk@city.gov --role clerk

# Update user role
civic users update 2 --role council

# Delete user
civic users delete 2
```

## UI Registration Page

### Location

The registration page is located at `/auth/register` and provides a clean,
modern interface for user registration.

### Features

- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Real-time Validation**: Immediate feedback on form inputs
- **Password Strength Indicator**: Visual feedback on password security
- **Accessibility**: Proper ARIA labels and keyboard navigation
- **Error Handling**: Clear error messages and recovery suggestions

### Form Validation

The registration form includes comprehensive validation:

- **Username**: 3-20 characters, alphanumeric and underscores only
- **Email**: Valid email format, must be unique
- **Password**: Minimum 8 characters, includes complexity requirements
- **Name**: Optional, 1-50 characters

### Success Flow

After successful registration:

1. **User sees success message** with confirmation
2. **Automatic redirect** to login page
3. **User can immediately log in** with new credentials
4. **Welcome email** sent (future feature)

## Authentication

### Login Process

1. **User enters credentials** on login page
2. **System validates** username/password combination
3. **JWT token generated** and returned to client
4. **Token stored** in browser localStorage
5. **User redirected** to dashboard or intended page

### Session Management

- **JWT Tokens**: Stateless authentication using JSON Web Tokens
- **Token Expiration**: Configurable expiration time (default: 24 hours)
- **Automatic Refresh**: Tokens can be refreshed before expiration
- **Secure Storage**: Tokens stored in localStorage with proper security

### Logout Process

1. **User clicks logout** in UI
2. **Token invalidated** on server (optional)
3. **Local storage cleared** of authentication data
4. **User redirected** to login page

## Security Considerations

### Password Security

- **Strong Hashing**: Passwords hashed using bcrypt with salt
- **Complexity Requirements**: Minimum 8 characters with mixed case and symbols
- **Rate Limiting**: Prevents brute force attacks
- **Account Lockout**: Temporary lockout after failed attempts

### Data Protection

- **HTTPS Required**: All authentication traffic encrypted
- **Input Sanitization**: All user inputs validated and sanitized
- **SQL Injection Prevention**: Parameterized queries used throughout
- **XSS Protection**: Output encoding and CSP headers

### Privacy

- **Minimal Data Collection**: Only necessary user information collected
- **Data Retention**: Clear policies on data retention and deletion
- **User Consent**: Clear privacy policy and terms of service
- **GDPR Compliance**: Right to access, rectification, and deletion

## Configuration

### Environment Variables

```bash
# Authentication
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=24h
BYPASS_AUTH=false

# Registration
ALLOW_PUBLIC_REGISTRATION=true
REQUIRE_EMAIL_VERIFICATION=false
MIN_PASSWORD_LENGTH=8

# Rate Limiting
REGISTRATION_RATE_LIMIT=10
LOGIN_RATE_LIMIT=100
```

### Role Configuration

Roles are configured in `data/.civic/roles.yml`:

```yaml
roles:
  admin:
    name: Administrator
    description: Full system access and user management
    permissions: ["*"]
    color: red
    icon: shield

  council:
    name: Council Member
    description: Can create, edit, and approve records
    permissions: ["records:*", "workflows:*"]
    color: blue
    icon: users

  clerk:
    name: City Clerk
    description: Can create and edit records
    permissions: ["records:create", "records:edit", "records:view"]
    color: green
    icon: file-text

  public:
    name: Public
    description: Can view published records
    permissions: ["records:view"]
    color: gray
    icon: eye
```

## Testing

### Manual Testing

1. **Registration Flow**:
   - Visit `/auth/register`
   - Fill out form with valid data
   - Verify successful registration
   - Test with invalid data

2. **Login Flow**:
   - Visit `/auth/login`
   - Enter credentials
   - Verify successful login
   - Test with invalid credentials

3. **Admin Management**:
   - Login as admin
   - Navigate to Settings → Users
   - Test user creation, editing, deletion
   - Verify role assignment

### Automated Testing

```bash
# Run authentication tests
pnpm run test:run -- --grep "auth"

# Run user management tests
pnpm run test:run -- --grep "users"

# Run registration tests
pnpm run test:run -- --grep "register"
```

## Troubleshooting

### Common Issues

1. **Registration Fails**:
   - Check server logs for validation errors
   - Verify database connection
   - Check email uniqueness constraints

2. **Login Issues**:
   - Verify JWT secret configuration
   - Check token expiration settings
   - Validate password hashing

3. **Admin Access Denied**:
   - Verify user has admin role
   - Check role configuration file
   - Validate permission system

### Debug Mode

Enable debug logging for authentication issues:

```bash
DEBUG=auth:* pnpm run dev
```

## Future Enhancements

### Planned Features

- **Email Verification**: Required email verification before account activation
- **Password Reset**: Self-service password reset via email
- **Two-Factor Authentication**: TOTP-based 2FA support
- **Social Login**: OAuth integration with Google, GitHub, etc.
- **Audit Logging**: Comprehensive audit trail for user actions
- **Bulk Operations**: Import/export user data
- **Advanced Roles**: Hierarchical role system with inheritance

### API Enhancements

- **GraphQL Support**: GraphQL API for complex queries
- **Webhook Integration**: Real-time notifications for user events
- **Rate Limiting**: Advanced rate limiting with Redis
- **Caching**: Redis-based caching for improved performance
