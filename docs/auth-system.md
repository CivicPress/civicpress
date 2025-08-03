# CivicPress Authentication System

The CivicPress authentication system provides secure, role-based access control
with support for multiple authentication methods.

## Overview

CivicPress supports three authentication methods:

1. **GitHub OAuth** (Production) - Authenticate with GitHub Personal Access
   Tokens
2. **Username/Password** (Traditional) - Local user accounts with password
   authentication
3. **Simulated Accounts** (Development only) - Quick setup for development and
   testing

## Authentication Methods

### GitHub OAuth (Production)

**Getting a GitHub Token:**

1. Go to GitHub Settings > Developer settings > Personal access tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo`, `read:user`, `user:email`
4. Copy the generated token

**Using GitHub OAuth:**

```bash
# CLI Authentication
civic auth:login --token <github_token>

# API Authentication
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"token": "your_github_token", "provider": "github"}'
```

### Username/Password (Traditional)

For traditional username/password authentication:

```bash
# CLI Authentication
civic auth:password --username <username> --password <password>

# API Authentication
curl -X POST http://localhost:3000/auth/password \
  -H "Content-Type: application/json" \
  -d '{"username": "user", "password": "password"}'
```

### Simulated Accounts (Development Only)

**Important**: Simulated authentication is **strictly disabled in production**
(`NODE_ENV === 'production'`).

```bash
# CLI Authentication
civic auth:simulated --username admin --role admin

# API Authentication
curl -X POST http://localhost:3000/auth/simulated \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "role": "admin"}'
```

## User Roles & Permissions

### Available Roles

| Role      | Description        | Permissions                 |
| --------- | ------------------ | --------------------------- |
| `admin`   | Full system access | All permissions             |
| `clerk`   | Municipal clerk    | Create, edit, view records  |
| `council` | Council member     | Approve, edit, view records |
| `public`  | Public citizen     | View published records only |

### Permission System

Permissions are granular and role-based:

- **`records:create`** - Create new civic records
- **`records:edit`** - Edit existing records
- **`records:view`** - View records
- **`records:delete`** - Archive/delete records
- **`system:admin`** - Administrative access
- **`workflows:execute`** - Execute workflows

## API Authentication

### Authentication Flow

1. **Authenticate**: POST to `/auth/login`, `/auth/password`, or
   `/auth/simulated`
2. **Get Token**: Receive JWT token in response
3. **Use Bearer Token**: Include token in `Authorization: Bearer <token>` header

### API Endpoints

#### POST /auth/login

Authenticate with OAuth provider token.

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"token": "github_oauth_token", "provider": "github"}'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "session": {
      "token": "jwt_token_here",
      "user": {
        "id": "user_id",
        "username": "username",
        "role": "council",
        "email": "user@example.com",
        "name": "User Name",
        "avatar_url": "https://..."
      },
      "expiresAt": "2024-01-01T12:00:00Z"
    }
  }
}
```

#### POST /auth/password

Authenticate with username and password.

```bash
curl -X POST http://localhost:3000/auth/password \
  -H "Content-Type: application/json" \
  -d '{"username": "user", "password": "password"}'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "session": {
      "token": "jwt_token_here",
      "user": {
        "id": "user_id",
        "username": "username",
        "role": "council",
        "email": "user@example.com",
        "name": "User Name",
        "avatar_url": "https://..."
      },
      "expiresAt": "2024-01-01T12:00:00Z"
    }
  }
}
```

#### POST /auth/simulated

Authenticate with simulated account (development only).

```bash
curl -X POST http://localhost:3000/auth/simulated \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "role": "admin"}'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "session": {
      "token": "jwt_token_here",
      "user": {
        "id": "user_id",
        "username": "admin",
        "role": "admin",
        "email": "admin@simulated.local",
        "name": "admin",
        "avatar_url": "https://..."
      },
      "expiresAt": "2024-01-01T12:00:00Z"
    }
  }
}
```

#### GET /auth/providers

Get available OAuth providers.

```bash
curl -X GET http://localhost:3000/auth/providers
```

**Response:**

```json
{
  "success": true,
  "data": {
    "providers": ["github"]
  }
}
```

#### GET /auth/me

Get current authenticated user information.

```bash
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer <token>"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "username": "username",
      "role": "council",
      "email": "user@example.com",
      "name": "User Name",
      "avatar_url": "https://...",
      "permissions": ["records:create", "records:edit", "records:view"]
    }
  }
}
```

#### POST /auth/logout

Logout (stateless - client should delete token).

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer <token>"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  }
}
```

## CLI Authentication

### Authentication Commands

#### `auth:simulated`

Create simulated user account (development only).

```bash
# Create admin user
civic auth:simulated --username admin --role admin

# Create clerk user
civic auth:simulated --username clerk --role clerk

# JSON output
civic auth:simulated --username test --role council --json
```

#### `auth:login`

Authenticate with GitHub OAuth.

```bash
# Authenticate with token
civic auth:login --token <github_token>

# Interactive login (prompts for token)
civic auth:login
```

#### `auth:password`

Authenticate with username/password.

```bash
# Authenticate with credentials
civic auth:password --username <username> --password <password>

# Interactive login (prompts for credentials)
civic auth:password
```

## Security Considerations

### Production Security

- **Simulated accounts are disabled in production**
- **GitHub OAuth is recommended for production**
- **JWT tokens have expiration times**
- **All authentication events are logged**

### Development Security

- **Simulated accounts are only available in development**
- **Use strong passwords for local accounts**
- **Keep GitHub tokens secure**
- **Regular token rotation recommended**

## Error Handling

### Common Authentication Errors

| Error Code                | Description                  | Solution                                |
| ------------------------- | ---------------------------- | --------------------------------------- |
| `MISSING_AUTH`            | No authorization header      | Include `Authorization: Bearer <token>` |
| `INVALID_TOKEN`           | Token is invalid or expired  | Re-authenticate to get new token        |
| `INVALID_ROLE`            | Role is not valid            | Use one of the supported roles          |
| `SIMULATED_AUTH_DISABLED` | Simulated auth in production | Use GitHub OAuth or username/password   |

### Error Response Format

```json
{
  "success": false,
  "error": {
    "message": "Authentication failed",
    "code": "INVALID_TOKEN",
    "details": {
      "reason": "Token expired"
    }
  }
}
```

## Examples

### Complete Authentication Flow

```bash
# 1. Authenticate with simulated account (development)
civic auth:simulated --username admin --role admin

# 2. Verify authentication
civic auth:me

# 3. Use authenticated session
civic list --json

# 4. Logout (optional - client should delete token)
civic auth:logout
```

### API Authentication Flow

```bash
# 1. Authenticate
curl -X POST http://localhost:3000/auth/simulated \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "role": "admin"}'

# 2. Extract token from response
TOKEN="jwt_token_from_response"

# 3. Use token for authenticated requests
curl -X GET http://localhost:3000/api/records \
  -H "Authorization: Bearer $TOKEN"
```

## Configuration

### Environment Variables

- `NODE_ENV` - Environment (development/production)
- `JWT_SECRET` - JWT signing secret
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret

### GitHub OAuth Setup

1. **Create GitHub OAuth App**:
   - Go to GitHub Settings > Developer settings > OAuth Apps
   - Create new OAuth app
   - Set callback URL to your CivicPress instance

2. **Environment Variables**:
   ```bash
   export GITHUB_CLIENT_ID="your_client_id"
   export GITHUB_CLIENT_SECRET="your_client_secret"
   export JWT_SECRET="your_jwt_secret"
   ```

## Troubleshooting

### Authentication Issues

```bash
# Check if user exists
civic auth:simulated --username admin --role admin

# Verify token
civic auth:me

# Debug permissions
civic debug permissions
```

### Production Issues

```bash
# Ensure simulated auth is disabled
export NODE_ENV=production

# Use GitHub OAuth instead
civic auth:login --token <github_token>
```
