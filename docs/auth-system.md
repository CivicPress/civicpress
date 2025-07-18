# 🔐 CivicPress Authentication System

> **Note:**
>
> **Simulated account authentication is only available in development mode.**
>
> - The `/api/auth/simulated` endpoint and the `civic auth:simulated` CLI
>   command are **strictly disabled in production**
>   (`NODE_ENV === 'production'`).
> - In production, these will return a clear error and cannot be used for
>   authentication.

The CivicPress authentication system provides secure, role-based access control
with support for multiple authentication providers including GitHub OAuth and
simulated accounts for development.

## 🎯 Features

### Core Functionality

- **GitHub OAuth Integration**: Authenticate users via GitHub OAuth tokens
- **Simulated Accounts**: Development/testing accounts with configurable roles
- **Role-Based Access Control**: Granular permissions based on user roles
- **Session Management**: JWT-based stateless sessions
- **API Key Support**: Long-lived API keys for automated access
- **Audit Logging**: Comprehensive authentication event tracking

### Supported Authentication Methods

1. **GitHub OAuth** (Production)
2. **Simulated Accounts** (Development/Testing)
3. **API Keys** (Automated access)

## 🔧 CLI Commands

### GitHub OAuth Authentication

```bash
# Authenticate with GitHub token
civic auth:login --token <github_token>

# Validate GitHub token
civic auth:validate --token <github_token>

# Interactive login (prompts for token)
civic auth:login
```

### Simulated Authentication (Development)

```bash
# Create simulated user with default role (public)
civic auth:simulated --username testuser

# Create simulated user with specific role
civic auth:simulated --username clerk --role clerk

# Create simulated admin user
civic auth:simulated --username admin --role admin

# JSON output for automation
civic auth:simulated --username testuser --role council --json
```

### API Key Management

```bash
# Create API key
civic auth:key:create --name "My API Key"

# List API keys
civic auth:key:list

# Delete API key
civic auth:key:delete --id <key_id>
```

## 🌐 API Endpoints

### Authentication Endpoints

#### POST /api/auth/login

Authenticate with OAuth provider token.

**Request:**

```json
{
  "token": "github_oauth_token",
  "provider": "github"
}
```

**Response:**

```json
{
  "success": true,
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
```

#### POST /api/auth/simulated

Authenticate with simulated account (development only).

**Request:**

```json
{
  "username": "testuser",
  "role": "council"
}
```

**Response:**

```json
{
  "success": true,
  "session": {
    "token": "jwt_token_here",
    "user": {
      "id": "user_id",
      "username": "testuser",
      "role": "council",
      "email": "testuser@simulated.local",
      "name": "testuser",
      "avatar_url": "https://..."
    },
    "expiresAt": "2024-01-01T12:00:00Z"
  }
}
```

#### GET /api/auth/providers

Get available OAuth providers.

**Response:**

```json
{
  "success": true,
  "providers": ["github"]
}
```

#### GET /api/auth/me

Get current authenticated user information.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
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
```

## 👥 User Roles & Permissions

### Available Roles

| Role      | Description        | Permissions                   |
| --------- | ------------------ | ----------------------------- |
| `admin`   | Full system access | All permissions               |
| `clerk`   | Municipal clerk    | Create, edit, view records    |
| `council` | Council member     | Approve, edit, view records   |
| `public`  | Public citizen     | View published records only   |
| `citizen` | Registered citizen | View records, submit feedback |

### Permission System

Permissions are granular and role-based:

- **`records:create`**: Create new civic records
- **`records:edit`**: Edit existing records
- **`records:view`**: View records
- **`records:delete`**: Archive/delete records
- **`system:admin`**: Administrative access
- **`workflows:execute`**: Execute workflows

## 🔧 Configuration

### GitHub OAuth Setup

1. **Create GitHub OAuth App**:
   - Go to GitHub Settings > Developer settings > OAuth Apps
   - Create new OAuth app
   - Set callback URL to your CivicPress instance

2. **Environment Variables**:

   ```bash
   export GITHUB_CLIENT_ID=your_client_id
   export GITHUB_CLIENT_SECRET=your_client_secret
   ```

3. **Role Mapping**: Configure role mapping in `.civic/roles.yml`:
   ```yaml
   roles:
     admin:
       github_users:
         - "your-github-username"
     clerk:
       github_users:
         - "clerk-username"
   ```

### Simulated Accounts

For development and testing, you can create simulated accounts:

```bash
# Create test users with different roles
civic auth:simulated --username admin --role admin
civic auth:simulated --username clerk --role clerk
civic auth:simulated --username citizen --role citizen
```

## 🧪 Testing

### Test Authentication Flow

```bash
# 1. Create simulated user
civic auth:simulated --username testuser --role council

# 2. Use the returned token for API calls
curl -H "Authorization: Bearer <token>" \
     http://localhost:3000/api/auth/me

# 3. Test role-based access
curl -H "Authorization: Bearer <token>" \
     http://localhost:3000/api/records
```

### Test GitHub OAuth

```bash
# 1. Get GitHub token from GitHub
# 2. Authenticate
civic auth:login --token <github_token>

# 3. Verify authentication
civic auth:validate --token <github_token>
```

## 🔐 Security Considerations

### Token Security

- **JWT Tokens**: Stateless, signed tokens with expiration
- **Token Rotation**: Automatic token refresh
- **Secure Storage**: Tokens should be stored securely on client
- **HTTPS Only**: All authentication should use HTTPS in production

### Role-Based Security

- **Principle of Least Privilege**: Users get minimum required permissions
- **Role Validation**: All roles are validated against configuration
- **Permission Inheritance**: Roles inherit permissions from parent roles
- **Audit Logging**: All authentication events are logged

### Development Security

- **Simulated Accounts**: Only available in development mode
- **Test Data**: Use simulated accounts for testing, not production
- **Token Expiration**: Short expiration for development tokens
- **Local Development**: Simulated accounts work offline

## 🚀 Integration Examples

### JavaScript/Node.js

```javascript
// Authenticate with GitHub
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: githubToken,
    provider: 'github'
  })
});

const { session } = await response.json();

// Use token for API calls
const recordsResponse = await fetch('/api/records', {
  headers: {
    'Authorization': `Bearer ${session.token}`
  }
});
```

### Python

```python
import requests

# Authenticate with simulated account
response = requests.post('http://localhost:3000/api/auth/simulated', json={
    'username': 'testuser',
    'role': 'council'
})

session = response.json()['session']

# Use token for API calls
headers = {'Authorization': f"Bearer {session['token']}"}
records = requests.get('http://localhost:3000/api/records', headers=headers)
```

### Shell Script

```bash
#!/bin/bash

# Authenticate and get token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/simulated \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "role": "council"}' \
  | jq -r '.session.token')

# Use token for API calls
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/records
```

## 📊 Monitoring & Logging

### Authentication Events

All authentication events are logged with:

- **User ID**: Who performed the action
- **Action**: What action was performed
- **Timestamp**: When the action occurred
- **IP Address**: Where the action came from
- **Success/Failure**: Whether the action succeeded

### Audit Trail

Authentication events are stored in the database and can be queried:

```sql
-- View recent authentication events
SELECT * FROM auth_events
ORDER BY created_at DESC
LIMIT 10;

-- View failed authentication attempts
SELECT * FROM auth_events
WHERE action LIKE '%failed%'
ORDER BY created_at DESC;
```

## 🔄 Troubleshooting

### Common Issues

1. **Invalid Token**:

   ```bash
   # Check token format
   civic auth:validate --token <token>
   ```

2. **Role Not Found**:

   ```bash
   # List available roles
   civic auth:roles:list
   ```

3. **Permission Denied**:
   ```bash
   # Check user permissions
   civic auth:permissions --username <username>
   ```

### Debug Mode

Enable debug logging for authentication:

```bash
# Set debug environment variable
export CIVIC_DEBUG=auth

# Run commands with debug output
civic auth:login --token <token> --verbose
```

## 📚 Related Documentation

- [API Documentation](api.md)
- [Role Management](roles.md)
- [Permission System](permissions.md)
- [Security Guidelines](security.md)
