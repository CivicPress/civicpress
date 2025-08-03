# 👥 CivicPress Spec: `users.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive user management documentation
- security considerations
- testing patterns compatibility: min_civicpress: 1.0.0 max_civicpress: 'null'
  dependencies:
  - 'auth.md: >=1.2.0'
  - 'permissions.md: >=1.1.0'
  - 'database.md: >=1.0.0' authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

User Accounts & Roles

## 🎯 Purpose

Define the structure, authentication methods, and permissions of CivicPress
users.  
Supports clerks, mayors, contributors, and citizens — with GitHub fallback as
MVP.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Define user schema (name, email, role, etc.)
- Allow login via GitHub or local credentials
- Provide per-user activity (votes, comments, approvals)
- Enable multi-role assignments (clerk + citizen, etc.)

❌ Out of Scope:

- Financial identity or national login integration
- Biometric login or 2FA (future)

---

## 🔗 Inputs & Outputs

| Input                   | Description                              |
| ----------------------- | ---------------------------------------- |
| User credentials        | GitHub OAuth tokens or local credentials |
| User profile data       | Name, email, roles, and preferences      |
| Authentication requests | Login and session management requests    |
| Role assignments        | User role and permission assignments     |
| Session data            | User session and activity tracking       |

| Output              | Description                         |
| ------------------- | ----------------------------------- |
| Authenticated users | Validated user accounts with roles  |
| User sessions       | Active user sessions and tokens     |
| Permission checks   | Role-based access control decisions |
| User activity logs  | Audit trails of user actions        |
| Profile data        | User information for UI display     |

---

## 👤 User Object

```json
{
  "id": "u-ada-lovelace",
  "username": "ada",
  "name": "Ada Lovelace",
  "email": "ada@richmond.qc",
  "avatar": "https://avatars.githubusercontent.com/u/1234",
  "roles": ["clerk", "councilor"],
  "provider": "github",
  "joined": "2025-06-30",
  "verified": true,
  "status": "active",
  "language": "en",
  "timezone": "America/Toronto",
  "sessions": [
    {
      "ip": "192.168.1.42",
      "device": "MacBook Air",
      "last_active": "2025-07-04T12:44:00Z"
    }
  ],
  "permissions": {
    "can_sign": true,
    "can_vote": true,
    "can_approve": true
  },
  "metadata": {
    "position": "Deputy Clerk",
    "division": "Planning"
  }
}
```

---

## 📂 File/Folder Location

```
core/users/
.civic/users.json         # Optional flatfile mode
.civic/users.yml          # User configuration
```

## 📝 Example User Configuration

```yaml
# .civic/users.yml
users:
  - id: 'u-ada-lovelace'
    username: 'ada'
    name: 'Ada Lovelace'
    email: 'ada@richmond.qc'
    roles: ['clerk', 'councilor']
    provider: 'github'
    verified: true
    status: 'active'
    language: 'en'
    timezone: 'America/Toronto'
    permissions:
      can_sign: true
      can_vote: true
      can_approve: true
    metadata:
      position: 'Deputy Clerk'
      division: 'Planning'

  - id: 'u-irene-curie'
    username: 'irene'
    name: 'Irène Joliot-Curie'
    email: 'irene@richmond.qc'
    roles: ['mayor']
    provider: 'github'
    verified: true
    status: 'active'
    language: 'fr'
    timezone: 'America/Toronto'
    permissions:
      can_sign: true
      can_vote: true
      can_approve: true
    metadata:
      position: 'Mayor'
      division: 'Executive'

# Role definitions
roles:
  clerk:
    description: 'Municipal clerk with administrative access'
    permissions: ['read', 'write', 'approve', 'sign']

  mayor:
    description: 'Elected mayor with executive authority'
    permissions: ['read', 'write', 'approve', 'sign', 'publish']

  councilor:
    description: 'Elected council member'
    permissions: ['read', 'write', 'vote', 'comment']

  citizen:
    description: 'Public citizen with basic access'
    permissions: ['read', 'comment', 'feedback']
```

---

## 🔐 Security & Trust Considerations

- Email must be verified or restricted by domain (e.g. `@town.ca`)
- Actions (votes, signatures) must be traceable to a user
- Role escalation requires review

**Data Retention & Privacy:**

- Store only necessary user data; avoid collecting sensitive PII unless required
- Define retention period for inactive/deleted users and securely delete after
  expiry
- Anonymize or redact user data in public logs and exports
- Allow users to request data export or deletion (subject to legal requirements)

**Access Control:**

- Only authorized roles (e.g. clerk, admin) may create, edit, or delete users
- Enforce least-privilege principle for user permissions
- Log all user management actions for audit

**Authentication & Security:**

- Use secure authentication providers (e.g. GitHub OAuth, SSO)
- Store credentials and tokens securely; never store plaintext passwords
- Support multi-factor authentication (future)
- Invalidate sessions on password or role changes

**Compliance:**

- Ensure user data handling complies with local privacy and data protection laws
  (e.g. GDPR, municipal regulations)
- Document user data flows and access policies for auditability

**Best Practices:**

- Regularly review user roles and permissions
- Monitor for suspicious login or privilege escalation attempts
- Provide clear user-facing privacy and security policies

---

## 🧪 Testing & Validation

- Create, delete, list, authenticate users
- Login flow (GitHub and fallback credentials)
- Role checks during CLI/API actions
- Session expiration and token validity

---

## 🛠️ Future Enhancements

- Municipal SSO or eID login
- User settings and notifications
- Delegation and impersonation for accessibility
- Session replay for audit

---

## 📅 History

- Drafted: 2025-07-04
