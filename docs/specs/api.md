# 🔌 CivicPress Spec: `api.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive API documentation
- security considerations
- testing patterns compatibility: min_civicpress: 1.0.0 max_civicpress: 'null'
  dependencies:
  - 'auth.md: >=1.2.0'
  - 'permissions.md: >=1.1.0' authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

`api` — CivicPress Backend API Service

## 🎯 Purpose

Provide a standalone, framework-agnostic API layer for reading, writing, and
orchestrating civic records through clean, stateless, role-aware REST endpoints.

This API serves as the secure gateway between civic data and all client
applications, ensuring proper authentication, authorization, and data integrity
across all civic operations.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Expose civic records, indexes, and metadata via REST/JSON
- Accept actions from UI or CLI (e.g. submit feedback, propose edits)
- Trigger workflows via `hooks.md`
- Delegate to CLI (`civic`) where needed
- Enforce security policies and access controls
- Provide comprehensive audit logging
- Handle rate limiting and DDoS protection

❌ Not responsible for:

- UI rendering
- Storing data outside Git
- Replacing the CivicPress CLI
- Business logic implementation (handled by modules)

---

## 🔗 Inputs & Outputs

| Input                 | Description                        |
| --------------------- | ---------------------------------- |
| HTTP requests         | REST API calls with authentication |
| Authentication tokens | GitHub tokens, JWT, signed URLs    |
| Civic records         | Markdown files, YAML configs       |
| User permissions      | Role-based access control data     |
| Audit events          | User actions, system events        |

| Output            | Description                            |
| ----------------- | -------------------------------------- |
| JSON responses    | Civic data, metadata, status info      |
| HTTP status codes | Success, error, and redirect responses |
| Audit logs        | Immutable action records               |
| Webhooks          | Event notifications to subscribers     |
| Error messages    | Structured error responses             |

---

## 📂 File/Folder Location

```
api/
├── server.ts              # API entrypoint
├── routes/
│   ├── index.ts           # Main route handlers
│   ├── feedback.ts        # Feedback endpoints
│   ├── bylaws.ts          # Bylaw management
│   ├── auth.ts            # Authentication
│   └── webhooks.ts        # Webhook handlers
├── middleware/
│   ├── auth.ts            # Authentication middleware
│   ├── rate-limit.ts      # Rate limiting
│   ├── cors.ts            # CORS configuration
│   └── audit.ts           # Audit logging
├── lib/
│   ├── civic-cli.ts       # CLI integration
│   ├── permissions.ts     # Permission checking
│   └── validation.ts      # Request validation
├── tests/
│   ├── integration/       # API integration tests
│   ├── security/          # Security testing
│   └── performance/       # Load testing
└── .env                   # Environment configuration
```

---

## 🏗️ Architecture

CivicPress API is a **separate stateless REST API** that:

- Reads records from local Git repo (`records/`)
- Reads config from `.civic/` folder
- Invokes `civic` CLI for write actions
- May serve `.md` and `.yml` files as JSON

📡 **Stateless Design**:

- No session storage
- Every request includes full context (auth, payload, intent)
- Ideal for Git-based workflows and CDN caching

🧱 **Backend stack (TypeScript/JavaScript only)**:

- **Express** or **Fastify** — battle-tested, modular Node.js servers
- **Hono** — ultra-light, edge-compatible TS framework
- **Bun** (optional) — fast runtime for local APIs or workers
- **Node.js CLI adapters** — shell out to `civic` or call internal modules

---

## 📡 Example Endpoints

| Method | Endpoint           | Description                | Auth Required |
| ------ | ------------------ | -------------------------- | ------------- |
| GET    | `/index`           | Returns parsed `index.yml` | No            |
| GET    | `/bylaws/:slug`    | Returns bylaw as JSON      | No            |
| POST   | `/feedback`        | Submits new comment        | Yes           |
| POST   | `/approve/:slug`   | Approves a civic record    | Yes           |
| GET    | `/search?q=permit` | Searches titles/tags       | No            |
| POST   | `/hook/:name`      | Triggers workflow hook     | Yes           |
| GET    | `/audit/:record`   | Returns audit trail        | Yes           |

---

## 🔐 Security & Trust Considerations

### API Security Architecture

#### Authentication & Authorization

```typescript
// api/middleware/auth.ts
interface AuthContext {
  user: {
    id: string;
    username: string;
    role: 'mayor' | 'clerk' | 'contributor' | 'citizen';
    permissions: string[];
  };
  token: {
    type: 'github' | 'jwt' | 'signed-url';
    expires: Date;
    scopes: string[];
  };
}

class APIAuthMiddleware {
  async authenticate(req: Request): Promise<AuthContext> {
    // GitHub token validation
    if (req.headers.authorization?.startsWith('Bearer ghp_')) {
      return this.validateGitHubToken(req.headers.authorization);
    }

    // JWT token validation
    if (req.headers.authorization?.startsWith('Bearer eyJ')) {
      return this.validateJWTToken(req.headers.authorization);
    }

    // Signed URL validation
    if (req.query.sig) {
      return this.validateSignedURL(req.url, req.query.sig as string);
    }

    throw new UnauthorizedError('No valid authentication provided');
  }
}
```

#### Rate Limiting & DDoS Protection

```typescript
// api/middleware/rate-limit.ts
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  keyGenerator: (req: Request) => string;
}

const rateLimitConfig: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // per IP
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    // Rate limit by IP and user ID if authenticated
    const userKey = req.user?.id || 'anonymous';
    return `${req.ip}:${userKey}`;
  }
};
```

#### Input Validation & Sanitization

```typescript
// api/lib/validation.ts
import { z } from 'zod';

const FeedbackSchema = z.object({
  recordSlug: z.string().min(1).max(100),
  content: z.string().min(1).max(10000),
  type: z.enum(['comment', 'suggestion', 'objection']),
  metadata: z.object({
    userAgent: z.string().optional(),
    ipAddress: z.string().ip().optional(),
  }).optional(),
});

const ApprovalSchema = z.object({
  recordSlug: z.string().min(1).max(100),
  reason: z.string().min(1).max(500),
  signature: z.string().min(1), // Digital signature
});
```

### Security Headers & CORS

```typescript
// api/middleware/security.ts
const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'",
};

const corsConfig = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};
```

### Audit Logging & Compliance

```typescript
// api/middleware/audit.ts
interface AuditEvent {
  timestamp: Date;
  userId: string;
  action: string;
  resource: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  metadata: Record<string, any>;
}

class AuditLogger {
  async logEvent(event: AuditEvent): Promise<void> {
    const auditEntry = {
      ...event,
      hash: this.generateHash(event), // Immutable audit trail
    };

    // Write to audit log
    await this.writeToAuditLog(auditEntry);

    // Send to monitoring system
    await this.sendToMonitoring(auditEntry);
  }
}
```

---

## 🧪 Testing & Validation

### API Testing Framework

#### Integration Testing

```typescript
// api/tests/integration/api.test.ts
import { createTestServer } from '../test-utils';
import { CivicPressTestUtils } from '../test-utils/civicpress-test-utils';

describe('CivicPress API Integration', () => {
  let server: any;
  let testUtils: CivicPressTestUtils;

  beforeEach(async () => {
    testUtils = new CivicPressTestUtils();
    server = await createTestServer();
  });

  afterEach(async () => {
    await testUtils.cleanup();
    await server.close();
  });

  describe('Authentication Endpoints', () => {
    it('should authenticate valid GitHub token', async () => {
      // Arrange
      const validToken = 'ghp_valid_token';
      const expectedUser = {
        id: '123',
        username: 'test-user',
        role: 'contributor',
      };

      // Act
      const response = await server
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.user).toEqual(expectedUser);
    });

    it('should reject invalid tokens', async () => {
      // Arrange
      const invalidToken = 'invalid_token';

      // Act
      const response = await server
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${invalidToken}`);

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid authentication token');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Arrange
      const requests = Array(101).fill(null).map(() =>
        server.get('/api/bylaws').set('Authorization', 'Bearer valid_token')
      );

      // Act
      const responses = await Promise.all(requests);

      // Assert
      const successfulRequests = responses.filter(r => r.status === 200);
      const rateLimitedRequests = responses.filter(r => r.status === 429);

      expect(successfulRequests).toHaveLength(100);
      expect(rateLimitedRequests).toHaveLength(1);
    });
  });
});
```

#### Security Testing

```typescript
// api/tests/security/api-security.test.ts
describe('API Security Testing', () => {
  let securityTestSuite: SecurityTestSuite;

  beforeEach(() => {
    securityTestSuite = new SecurityTestSuite();
  });

  describe('Input Validation', () => {
    it('should prevent SQL injection in search', async () => {
      // Arrange
      const maliciousQueries = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; INSERT INTO records VALUES ('hacker'); --",
      ];

      // Act & Assert
      for (const query of maliciousQueries) {
        const response = await request(app)
          .get(`/api/search?q=${encodeURIComponent(query)}`);

        expect(response.status).not.toBe(500);
        expect(response.body.error).toBeDefined();
      }
    });

    it('should prevent XSS in feedback', async () => {
      // Arrange
      const maliciousContent = [
        "<script>alert('xss')</script>",
        "javascript:alert('xss')",
        "<img src=x onerror=alert('xss')>",
      ];

      // Act & Assert
      for (const content of maliciousContent) {
        const response = await request(app)
          .post('/api/feedback')
          .send({ content, recordSlug: 'test' });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid content');
      }
    });
  });

  describe('Authorization Testing', () => {
    it('should enforce role-based access control', async () => {
      // Arrange
      const testCases = [
        { role: 'citizen', endpoint: '/api/approve/test', expectedStatus: 403 },
        { role: 'clerk', endpoint: '/api/approve/test', expectedStatus: 200 },
        { role: 'mayor', endpoint: '/api/approve/test', expectedStatus: 200 },
      ];

      // Act & Assert
      for (const testCase of testCases) {
        const response = await request(app)
          .post(testCase.endpoint)
          .set('Authorization', `Bearer ${generateToken(testCase.role)}`);

        expect(response.status).toBe(testCase.expectedStatus);
      }
    });
  });
});
```

#### Performance Testing

```typescript
// api/tests/performance/api-performance.test.ts
describe('API Performance Testing', () => {
  it('should handle concurrent requests efficiently', async () => {
    // Arrange
    const concurrentRequests = 100;
    const requests = Array(concurrentRequests).fill(null).map(() =>
      request(app).get('/api/bylaws')
    );

    // Act
    const startTime = Date.now();
    const responses = await Promise.all(requests);
    const endTime = Date.now();

    // Assert
    const successfulRequests = responses.filter(r => r.status === 200);
    const averageResponseTime = (endTime - startTime) / concurrentRequests;

    expect(successfulRequests).toHaveLength(concurrentRequests);
    expect(averageResponseTime).toBeLessThan(100); // < 100ms average
  });

  it('should handle large payloads efficiently', async () => {
    // Arrange
    const largePayload = {
      content: 'x'.repeat(10000), // 10KB content
      metadata: { tags: Array(100).fill('tag') },
    };

    // Act
    const startTime = Date.now();
    const response = await request(app)
      .post('/api/feedback')
      .send(largePayload);
    const endTime = Date.now();

    // Assert
    expect(response.status).toBe(400); // Should reject oversized payload
    expect(endTime - startTime).toBeLessThan(1000); // < 1 second
  });
});
```

---

## 🔐 Permissions & Auth

- Role checked against `.civic/roles.yml`
- Supported auth:
  - GitHub bearer token (MVP)
  - Civic ID JWT (future)
  - Signed request URL (`/approve?sig=xyz`)

---

## 🛠️ CLI Integration

Write actions call CivicPress CLI:

```ts
execSync(`civic approve records/bylaws/curfew.md`);
```

Later: wrap core logic as JS/TS functions or modules.

---

## 🧠 Modular Placement

- May live in `core/api` workspace
- Not a civic module like `legal-register` or `public-sessions`
- This is core platform infrastructure

---

## 🧭 API Versioning Strategy

To ensure long-term stability and backward compatibility, all public-facing API
routes follow a strict versioning policy.

### ✳️ Example Route

```
GET /v1/bylaws/:slug
```

### ✅ Rules

- All major changes require a new version prefix (`/v2/`)
- Old versions remain accessible unless explicitly deprecated
- Breaking changes must be announced and time-buffered
- CLI and civic UI must target a specific API version

### 🧪 Version Format

- Semantic versions avoided in paths — prefer major versions only (`v1`, `v2`)
- Modules may expose their own sub-routes under version root
- Module registry (`manifest.md`) tracks compatibility

---

## 🛠️ Future Enhancements

- **GraphQL support** for complex queries and real-time subscriptions
- **WebSocket support** for real-time civic updates and notifications
- **API documentation** with OpenAPI/Swagger specifications
- **API analytics** and usage monitoring
- **Advanced caching** with Redis or CDN integration
- **Microservices architecture** for horizontal scaling

---

## 🔗 Related Specs

- [`auth.md`](./auth.md) — Authentication and identity management
- [`permissions.md`](./permissions.md) — Role-based access control
- [`security.md`](./security.md) — Security architecture and threat modeling
- [`testing-framework.md`](./testing-framework.md) — Testing standards and
  patterns

---

## 📅 History

- Drafted: 2025-07-03
- Updated: 2025-07-04 (added API versioning strategy)
- Enhanced: 2025-07-15 (added comprehensive security and testing sections)
