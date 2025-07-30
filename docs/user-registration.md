# User Registration System

## Overview

The CivicPress user registration system provides a complete user account
creation and authentication flow with secure password handling, comprehensive
validation, and a modern UI experience.

## Features

### ✅ **Complete Registration Flow**

- User registration with username, email, password, and optional full name
- Secure password hashing with bcrypt
- Username uniqueness validation
- Email format validation
- Password strength assessment with visual indicator
- Automatic username-as-name fallback when no full name provided

### ✅ **Modern UI Experience**

- Clean, accessible registration form
- Real-time validation feedback
- Password strength indicator with 5-level assessment
- Comprehensive error handling and user feedback
- Smooth success flow with form clearing and redirect

### ✅ **Security Features**

- Strong password requirements (8+ chars, uppercase, lowercase, numbers, special
  chars)
- Secure bcrypt password hashing with salt rounds
- Input validation on both client and server
- Secure error handling without information disclosure
- JWT token-based authentication

## API Endpoints

### POST /api/users/register

**Description**: Register a new user account

**Request Body**:

```json
{
  "username": "string (required)",
  "email": "string (required)",
  "password": "string (required)",
  "name": "string (optional)"
}
```

**Response (Success - 200)**:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "john_doe",
      "role": "public",
      "email": "john@example.com",
      "name": "John Doe",
      "avatar_url": null,
      "created_at": "2025-07-30T21:33:40.000Z"
    },
    "message": "User registered successfully. Please log in with your credentials."
  }
}
```

**Response (Error - 400/409)**:

```json
{
  "success": false,
  "error": {
    "message": "Username already exists",
    "code": "USERNAME_EXISTS"
  }
}
```

### POST /api/users/auth/password

**Description**: Authenticate user with username and password

**Request Body**:

```json
{
  "username": "string (required)",
  "password": "string (required)"
}
```

**Response (Success - 200)**:

```json
{
  "success": true,
  "data": {
    "session": {
      "token": "jwt_token_here",
      "user": {
        "id": 1,
        "username": "john_doe",
        "role": "public",
        "email": "john@example.com",
        "name": "John Doe",
        "avatar_url": null
      },
      "expiresAt": "2025-07-31T17:06:40.801Z"
    }
  }
}
```

## UI Registration Page

### Location

`modules/ui/app/pages/auth/register.vue`

### Features

#### **Form Fields**

- **Username**: Required, unique identifier
- **Email**: Required, validated format
- **Full Name**: Optional, falls back to username if not provided
- **Password**: Required, with strength assessment
- **Confirm Password**: Required, must match password

#### **Password Strength Indicator**

- **5-Level Assessment**: Very Weak → Weak → Fair → Good → Strong
- **Visual Feedback**: Color-coded progress bars
- **Requirements**: Length, uppercase, lowercase, numbers, special characters
- **Real-time Updates**: Updates as user types

#### **Validation**

- **Client-side**: Immediate feedback for better UX
- **Server-side**: Security and data integrity
- **Email Format**: Regex validation `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- **Password Matching**: Real-time confirmation validation

#### **Error Handling**

- **Field-specific Errors**: Displayed in form help text
- **API Errors**: Parsed and displayed in alerts
- **Network Errors**: User-friendly connection error messages
- **Validation Errors**: Clear, actionable feedback

#### **Success Flow**

- **Success Message**: Clear confirmation with next steps
- **Form Clearing**: Automatic reset of all fields
- **Redirect**: Smooth transition to login page
- **User Feedback**: Green alert with success icon

## Configuration

### Database Configuration

The registration system uses the database configuration from `.civicrc`:

```yaml
database:
  type: "sqlite"
  sqlite:
    file: ".system-data/civic.db"
```

**Important**: The `.civicrc` file must be in YAML format, not JSON. The
`CentralConfigManager` expects YAML parsing.

### API URL Configuration

The UI uses runtime configuration for API URLs:

```typescript
// In nuxt.config.ts
runtimeConfig: {
  public: {
    civicApiUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  },
}

// In components
const config = useRuntimeConfig()
const response = await $fetch(`${config.public.civicApiUrl}/api/users/register`, {
  method: 'POST',
  body: userData
})
```

## Security Features

### **Password Security**

- **Minimum Requirements**: 8 characters with uppercase, lowercase, numbers,
  special characters
- **Hashing**: bcrypt with 12 salt rounds
- **Validation**: Both client-side and server-side validation
- **Strength Assessment**: Visual indicator with real-time feedback

### **Input Validation**

- **Username**: Unique, required
- **Email**: Format validation, required
- **Password**: Strength requirements, required
- **Name**: Optional, falls back to username

### **Error Handling**

- **Secure Messages**: No information disclosure in error messages
- **Generic Responses**: Use generic messages for security-sensitive operations
- **Detailed Logging**: Log detailed errors for debugging
- **User-Friendly**: Show clear, actionable error messages

## Database Schema

### Users Table

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'public',
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  password_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Key Features

- **Auto-incrementing ID**: Primary key for user identification
- **Unique Username**: Enforced uniqueness constraint
- **Role-based Access**: Default 'public' role for new users
- **Password Hashing**: Secure bcrypt hashed passwords
- **Timestamps**: Automatic creation and update tracking

## Usage Examples

### **Register a New User (API)**

```bash
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "SecurePass123!",
    "name": "John Doe"
  }'
```

### **Register User Without Full Name (API)**

```bash
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "jane_smith",
    "email": "jane@example.com",
    "password": "SecurePass123!"
  }'
```

_Result: User created with `name: "jane_smith"` (username used as name)_

### **Authenticate User (API)**

```bash
curl -X POST http://localhost:3000/api/users/auth/password \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "SecurePass123!"
  }'
```

### **Access Registration Page (UI)**

Navigate to `http://localhost:3030/auth/register` to access the registration
form.

## Troubleshooting

### **Common Issues**

#### **"Route POST /users/register not found"**

- **Cause**: API proxy configuration issue
- **Solution**: Use direct API URL with runtime config
- **Code**: `$fetch(\`${config.public.civicApiUrl}/api/users/register\`)`

#### **Users Not Saved to Database**

- **Cause**: Wrong database path configuration
- **Solution**: Check `.civicrc` format (YAML) and database path
- **Verification**: `sqlite3 .system-data/civic.db "SELECT * FROM users;"`

#### **Configuration Not Loading**

- **Cause**: `.civicrc` in JSON format instead of YAML
- **Solution**: Convert to YAML format
- **Example**: Use `yaml.stringify()` instead of `JSON.stringify()`

#### **Authentication Errors**

- **Cause**: Route ordering in Express.js
- **Solution**: Ensure public routes registered before auth middleware
- **Order**: Public routes → Public middleware → Auth middleware → Protected
  routes

### **Debugging Steps**

1. **Check API Server**: `curl http://localhost:3000/health`
2. **Test Registration**:
   `curl -X POST http://localhost:3000/api/users/register ...`
3. **Verify Database**: `sqlite3 .system-data/civic.db "SELECT * FROM users;"`
4. **Check Configuration**: Verify `.civicrc` is in YAML format
5. **Monitor Logs**: Check API server logs for detailed error information

## Integration with Other Systems

### **Authentication System**

- **JWT Tokens**: Registration doesn't auto-login, redirects to login
- **Session Management**: Proper token handling and expiration
- **Role Assignment**: New users get 'public' role by default

### **Notification System**

- **Future Integration**: Email verification on registration
- **Password Reset**: Email-based password recovery
- **Security Alerts**: Notifications for account activities

### **Audit System**

- **User Creation**: Track all user registration events
- **Authentication**: Log login attempts and failures
- **Security Events**: Monitor suspicious account activities

## Future Enhancements

### **Planned Features**

1. **Email Verification**: Send verification emails on registration
2. **Password Reset**: Forgot password functionality
3. **Account Management**: User profile and settings pages
4. **Admin Dashboard**: User management interface
5. **Advanced Security**: 2FA, account lockout, security questions

### **Integration Opportunities**

1. **Notification System**: Email verification and security alerts
2. **Role Management**: Advanced role assignment and permissions
3. **Audit Trail**: Comprehensive user activity logging
4. **Federation**: Multi-node user synchronization

## Best Practices

### **Security**

- Always validate input on both client and server
- Use secure password hashing (bcrypt)
- Implement proper error handling without information disclosure
- Log security events for monitoring

### **User Experience**

- Provide immediate feedback for form validation
- Show clear, actionable error messages
- Implement smooth success flows
- Maintain form data for easy correction

### **Development**

- Test API endpoints independently
- Verify database persistence
- Monitor API logs for debugging
- Use proper configuration management

### **Configuration**

- Use YAML format for `.civicrc`
- Proper database path specification
- Runtime configuration for API URLs
- Secure storage of sensitive data

---

**Last Updated**: July 2025  
**Status**: ✅ Complete and Production Ready  
**Version**: 1.0.0
