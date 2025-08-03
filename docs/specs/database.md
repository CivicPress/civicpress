# 🗃️ CivicPress Spec: `database.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null breaking_changes: [] additions:

- comprehensive database documentation
- data modeling
- security considerations fixes: [] migration_guide: null compatibility:
  min_civicpress: 1.0.0 max_civicpress: 'null' dependencies:
  - 'storage.md: >=1.0.0' authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Database Layer & Data Management

## 🎯 Purpose

Introduce an optional database layer to enable persistent, queryable, structured
data support beyond Git.  
Used for performance, flexibility, and real-time features while maintaining data
integrity, security, and compliance with civic governance requirements.

This spec defines secure database architecture, data modeling, and comprehensive
testing strategies for civic data management.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Store user accounts, sessions, and roles
- Store feedback, votes, logs, notifications
- Power search, dashboards, and filters
- Optional integration with indexing, CLI, and workflows
- Ensure data integrity and consistency
- Provide comprehensive audit logging
- Implement secure data access patterns

❌ Out of Scope:

- Replacing civic records as Markdown (Git still source of truth)
- Complex analytics (separate pipeline)
- Data warehousing or business intelligence

---

## 🔗 Inputs & Outputs

| Input               | Description                 |
| ------------------- | --------------------------- |
| Git Markdown files  | Synced into DB (optional)   |
| API POST requests   | Writes into DB tables       |
| CLI commands        | May query DB if available   |
| User authentication | Session and role data       |
| Audit events        | System and user action logs |

| Output          | Description                           |
| --------------- | ------------------------------------- |
| Structured data | Queryable civic information           |
| Audit trails    | Immutable action records              |
| User sessions   | Authentication and authorization data |
| Search results  | Indexed civic record queries          |
| Backup files    | Encrypted database backups            |

---

## 📂 File/Folder Location

```
core/db/
├── index.ts              # Database connection and initialization
├── schema/
│   ├── users.ts          # User account schema
│   ├── sessions.ts       # Session management schema
│   ├── votes.ts          # Voting schema
│   ├── feedback.ts       # Feedback schema
│   ├── audit_logs.ts     # Audit trail schema
│   └── notifications.ts  # Notification schema
├── migrations/
│   ├── 001_initial.ts    # Initial schema migration
│   ├── 002_users.ts      # User table migration
│   └── 003_audit.ts      # Audit logging migration
├── queries/
│   ├── users.ts          # User-related queries
│   ├── votes.ts          # Voting queries
│   └── audit.ts          # Audit query helpers
├── security/
│   ├── encryption.ts     # Data encryption utilities
│   ├── access-control.ts # Database access control
│   └── audit.ts          # Audit logging
├── tests/
│   ├── integration/      # Database integration tests
│   ├── security/         # Security testing
│   └── performance/      # Performance testing
└── config/
    └── database.yml      # Database configuration
```

---

## 🏗️ Tech Considerations

- Recommended: PostgreSQL (open source, civic-safe)
- Others: SQLite (local), MySQL (legacy), Redis (cache only)
- ORM: Drizzle, Prisma, or Knex (TBD)
- Lives under `core/db/`

## 📝 Example Database Configuration

```yaml
# .civic/database.yml
database:
  type: 'postgresql' # postgresql, sqlite, mysql
  host: 'localhost'
  port: 5432
  name: 'civicpress_richmond'
  user: 'civicpress'
  password: '${DB_PASSWORD}'

  # For SQLite (local development)
  # type: "sqlite"
  # path: ".civic/civicpress.db"

  # For MySQL
  # type: "mysql"
  # host: "localhost"
  # port: 3306
  # name: "civicpress"
  # user: "civicpress"
  # password: "${DB_PASSWORD}"

connection:
  pool:
    min: 2
    max: 10
    acquire_timeout: 30000
    idle_timeout: 30000

  ssl: false # true for production

  migrations:
    auto_run: true
    directory: 'core/db/migrations'

tables:
  users:
    description: 'User accounts and authentication'
    indexes: ['email', 'username', 'provider']

  sessions:
    description: 'User sessions and tokens'
    indexes: ['user_id', 'expires_at']

  votes:
    description: 'Vote records and metadata'
    indexes: ['record_id', 'user_id', 'created_at']

  feedback:
    description: 'Public feedback and comments'
    indexes: ['record_id', 'user_id', 'status']

  audit_logs:
    description: 'System audit trail'
    indexes: ['user_id', 'action', 'timestamp']

  notifications:
    description: 'User notifications and alerts'
    indexes: ['user_id', 'type', 'read_at']

backup:
  enabled: true
  schedule: 'daily'
  retention: '30 days'
  include_schema: true
```

---

## 🔐 Security & Trust Considerations

### Database Security Architecture

#### Encryption at Rest and in Transit

```typescript
// core/db/security/encryption.ts
import { createCipher, createDecipher, randomBytes } from 'crypto';

interface EncryptionConfig {
  algorithm: 'aes-256-gcm';
  keyLength: 32;
  ivLength: 16;
  tagLength: 16;
}

class DatabaseEncryption {
  private readonly config: EncryptionConfig = {
    algorithm: 'aes-256-gcm',
    keyLength: 32,
    ivLength: 16,
    tagLength: 16,
  };

  async encryptSensitiveData(data: string): Promise<string> {
    const key = Buffer.from(process.env.DB_ENCRYPTION_KEY!, 'hex');
    const iv = randomBytes(this.config.ivLength);

    const cipher = createCipher(this.config.algorithm, key);
    cipher.setAAD(Buffer.from('civicpress', 'utf8'));

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  }

  async decryptSensitiveData(encryptedData: string): Promise<string> {
    const [ivHex, tagHex, encrypted] = encryptedData.split(':');
    const key = Buffer.from(process.env.DB_ENCRYPTION_KEY!, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = createDecipher(this.config.algorithm, key);
    decipher.setAuthTag(tag);
    decipher.setAAD(Buffer.from('civicpress', 'utf8'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
```

#### Row-Level Security (RLS)

```sql
-- core/db/migrations/004_row_level_security.sql
-- Enable RLS on sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY users_own_data ON users
  FOR ALL USING (id = current_user_id());

-- Sessions are user-scoped
CREATE POLICY sessions_own_data ON sessions
  FOR ALL USING (user_id = current_user_id());

-- Audit logs are read-only for users, full access for admins
CREATE POLICY audit_logs_read_only ON audit_logs
  FOR SELECT USING (
    current_user_role() IN ('admin', 'clerk') OR
    user_id = current_user_id()
  );
```

#### Database Access Control

```typescript
// core/db/security/access-control.ts
interface DatabaseUser {
  id: string;
  role: 'admin' | 'clerk' | 'contributor' | 'citizen';
  permissions: string[];
}

class DatabaseAccessControl {
  private readonly rolePermissions = {
    admin: ['read:all', 'write:all', 'delete:all', 'audit:all'],
    clerk: ['read:all', 'write:records', 'read:audit'],
    contributor: ['read:public', 'write:feedback', 'read:own'],
    citizen: ['read:public', 'write:feedback', 'read:own'],
  };

  async checkPermission(user: DatabaseUser, action: string, resource: string): Promise<boolean> {
    const userPermissions = this.rolePermissions[user.role] || [];

    // Check specific permission
    if (userPermissions.includes(`${action}:${resource}`)) {
      return true;
    }

    // Check wildcard permissions
    if (userPermissions.includes(`${action}:all`)) {
      return true;
    }

    return false;
  }

  async enforceRowLevelSecurity(query: string, user: DatabaseUser): Promise<string> {
    // Add RLS conditions to queries
    if (user.role === 'admin') {
      return query; // No restrictions for admins
    }

    // Add user-specific conditions
    return query.replace(
      'WHERE',
      `WHERE (user_id = '${user.id}' OR is_public = true) AND`
    );
  }
}
```

### Data Privacy & Compliance

#### GDPR Compliance

```typescript
// core/db/security/privacy.ts
interface PrivacyConfig {
  dataRetentionDays: {
    sessions: 30;
    auditLogs: 365;
    feedback: 2555; // 7 years
    votes: 2555;
  };
  anonymizationFields: string[];
}

class DataPrivacyManager {
  async anonymizeUserData(userId: string): Promise<void> {
    // Anonymize user data for GDPR compliance
    await this.db.users.update({
      where: { id: userId },
      data: {
        email: `user_${userId}@anonymized.local`,
        username: `user_${userId}`,
        name: 'Anonymized User',
        personal_data_anonymized: true,
        anonymized_at: new Date(),
      },
    });
  }

  async deleteUserData(userId: string): Promise<void> {
    // Implement right to be forgotten
    await this.db.transaction(async (tx) => {
      await tx.sessions.deleteMany({ where: { user_id: userId } });
      await tx.feedback.deleteMany({ where: { user_id: userId } });
      await tx.votes.deleteMany({ where: { user_id: userId } });
      await tx.users.delete({ where: { id: userId } });
    });
  }

  async exportUserData(userId: string): Promise<any> {
    // Implement data portability
    const userData = await this.db.users.findUnique({
      where: { id: userId },
      include: {
        sessions: true,
        feedback: true,
        votes: true,
      },
    });

    return {
      exported_at: new Date(),
      user_data: userData,
    };
  }
}
```

### Audit Logging & Monitoring

```typescript
// core/db/security/audit.ts
interface AuditEvent {
  timestamp: Date;
  user_id: string;
  action: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  table_name: string;
  record_id?: string;
  old_values?: any;
  new_values?: any;
  ip_address: string;
  user_agent: string;
}

class DatabaseAuditLogger {
  async logDatabaseEvent(event: AuditEvent): Promise<void> {
    // Log to audit table
    await this.db.audit_logs.create({
      data: {
        timestamp: event.timestamp,
        user_id: event.user_id,
        action: event.action,
        table_name: event.table_name,
        record_id: event.record_id,
        old_values: event.old_values ? JSON.stringify(event.old_values) : null,
        new_values: event.new_values ? JSON.stringify(event.new_values) : null,
        ip_address: event.ip_address,
        user_agent: event.user_agent,
        hash: this.generateAuditHash(event), // Immutable audit trail
      },
    });
  }

  private generateAuditHash(event: AuditEvent): string {
    const data = `${event.timestamp}:${event.user_id}:${event.action}:${event.table_name}`;
    return createHash('sha256').update(data).digest('hex');
  }
}
```

---

## 🧪 Testing & Validation

### Database Testing Framework

#### Integration Testing

```typescript
// core/db/tests/integration/database.test.ts
import { createTestDatabase } from '../test-utils';
import { DatabaseManager } from '../../index';

describe('Database Integration', () => {
  let db: DatabaseManager;
  let testUtils: TestUtils;

  beforeEach(async () => {
    testUtils = new TestUtils();
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await testUtils.cleanup();
    await db.close();
  });

  describe('User Management', () => {
    it('should create and retrieve users securely', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        username: 'testuser',
        role: 'citizen' as const,
      };

      // Act
      const user = await db.users.create({
        data: userData,
      });

      const retrievedUser = await db.users.findUnique({
        where: { id: user.id },
      });

      // Assert
      expect(retrievedUser).toBeDefined();
      expect(retrievedUser.email).toBe(userData.email);
      expect(retrievedUser.password_hash).toBeDefined();
      expect(retrievedUser.password_hash).not.toBe(userData.password);
    });

    it('should enforce row-level security', async () => {
      // Arrange
      const user1 = await db.users.create({
        data: { email: 'user1@example.com', role: 'citizen' },
      });
      const user2 = await db.users.create({
        data: { email: 'user2@example.com', role: 'citizen' },
      });

      // Act & Assert
      const user1Data = await db.users.findMany({
        where: { id: user1.id },
        context: { currentUser: user1 },
      });
      expect(user1Data).toHaveLength(1);

      const user2Data = await db.users.findMany({
        where: { id: user2.id },
        context: { currentUser: user1 },
      });
      expect(user2Data).toHaveLength(0); // RLS should block access
    });
  });
});
```

#### Security Testing

```typescript
// core/db/tests/security/database-security.test.ts
describe('Database Security', () => {
  let securityTestSuite: DatabaseSecurityTestSuite;

  beforeEach(() => {
    securityTestSuite = new DatabaseSecurityTestSuite();
  });

  describe('SQL Injection Prevention', () => {
    it('should prevent SQL injection attacks', async () => {
      // Arrange
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; INSERT INTO users VALUES ('hacker', 'admin'); --",
      ];

      // Act & Assert
      for (const input of maliciousInputs) {
        const result = await securityTestSuite.testSQLInjection(input);
        expect(result.passed).toBe(true);
        expect(result.vulnerabilities).toHaveLength(0);
      }
    });
  });

  describe('Data Encryption', () => {
    it('should encrypt sensitive data at rest', async () => {
      // Arrange
      const sensitiveData = {
        email: 'test@example.com',
        password: 'securepassword',
        personal_info: 'sensitive data',
      };

      // Act
      const result = await securityTestSuite.testDataEncryption(sensitiveData);

      // Assert
      expect(result.passed).toBe(true);
      expect(result.encryptionAlgorithm).toBe('AES-256-GCM');
      expect(result.keyRotation).toBe(true);
    });
  });

  describe('Access Control', () => {
    it('should enforce role-based access control', async () => {
      // Arrange
      const testCases = [
        { role: 'citizen', table: 'audit_logs', action: 'SELECT', expected: false },
        { role: 'clerk', table: 'audit_logs', action: 'SELECT', expected: true },
        { role: 'admin', table: 'audit_logs', action: 'DELETE', expected: true },
      ];

      // Act & Assert
      for (const testCase of testCases) {
        const result = await securityTestSuite.testAccessControl(testCase);
        expect(result.passed).toBe(testCase.expected);
      }
    });
  });
});
```

#### Performance Testing

```typescript
// core/db/tests/performance/database-performance.test.ts
describe('Database Performance', () => {
  it('should handle concurrent writes efficiently', async () => {
    // Arrange
    const concurrentWrites = 100;
    const writePromises = Array(concurrentWrites).fill(null).map((_, i) =>
      db.feedback.create({
        data: {
          record_id: 'test-record',
          user_id: `user-${i}`,
          content: `Feedback ${i}`,
          type: 'comment',
        },
      })
    );

    // Act
    const startTime = Date.now();
    const results = await Promise.all(writePromises);
    const endTime = Date.now();

    // Assert
    expect(results).toHaveLength(concurrentWrites);
    expect(endTime - startTime).toBeLessThan(5000); // < 5 seconds
  });

  it('should handle large dataset queries efficiently', async () => {
    // Arrange
    const largeDataset = Array(10000).fill(null).map((_, i) => ({
      record_id: 'test-record',
      user_id: `user-${i}`,
      content: `Feedback ${i}`,
      type: 'comment',
    }));

    await db.feedback.createMany({ data: largeDataset });

    // Act
    const startTime = Date.now();
    const results = await db.feedback.findMany({
      where: { record_id: 'test-record' },
    });
    const endTime = Date.now();

    // Assert
    expect(results).toHaveLength(10000);
    expect(endTime - startTime).toBeLessThan(1000); // < 1 second
  });
});
```

---

## 🛡️ Security & Trust

- Use role-restricted access control
- Encrypt passwords & sensitive info
- DB should never override Git records without review

**Data Retention & Privacy:**

- Define retention period for sensitive tables (e.g. sessions, audit_logs) and
  securely delete after expiry
- Anonymize or redact personal data in exports and public dashboards
- Allow users to request data export or deletion (subject to legal requirements)

**Encryption & Security:**

- Encrypt sensitive fields (passwords, tokens, PII) at rest and in transit
  (SSL/TLS)
- Store database credentials securely and rotate regularly
- Use strong, unique passwords for all database users

**Access Control:**

- Grant least-privilege access to application and admin users
- Log all schema changes, privilege escalations, and direct DB access for audit
- Restrict direct DB access to trusted network locations

**Compliance:**

- Ensure database practices comply with local privacy and data protection laws
  (e.g. GDPR, municipal regulations)
- Document data flows, retention, and access policies for auditability

**Best Practices:**

- Regularly back up the database and test restores
- Monitor for suspicious queries or failed login attempts
- Apply security patches and updates promptly

---

## 🛠️ Future Enhancements

- Audit logs as append-only table
- Workflow-triggered writes (e.g. webhook → DB)
- Sync module (Git ↔ DB reconciler)
- **Real-time replication** for high availability
- **Advanced backup strategies** with point-in-time recovery
- **Database monitoring** and alerting systems
- **Automated security scanning** for vulnerabilities

---

## 🔗 Related Specs

- [`storage.md`](./storage.md) — Data storage and file management
- [`security.md`](./security.md) — Security architecture and threat modeling
- [`auth.md`](./auth.md) — Authentication and user management
- [`testing-framework.md`](./testing-framework.md) — Testing standards and
  patterns

---

## 📅 History

- Drafted: 2025-07-04
- Enhanced: 2025-07-15 (added comprehensive security and testing sections)
