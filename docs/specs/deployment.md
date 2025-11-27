# CivicPress Spec: `deployment.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive deployment documentation
- infrastructure patterns
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
 'null' dependencies:
 - 'manifest.md: >=1.0.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

Deployment Architecture & Infrastructure Security

## Purpose

Define secure deployment patterns, infrastructure security, and comprehensive
testing strategies for CivicPress across local, demo, and production
environments. This spec establishes security-first deployment practices,
infrastructure hardening, and deployment validation frameworks.

---

## Scope & Responsibilities

Responsibilities:

- Define secure deployment strategies for CivicPress
- Document infrastructure security and hardening patterns
- Provide guidance for local, cloud, and offline deployments
- Ensure deployment security and reliability
- Establish deployment testing and validation frameworks
- Define infrastructure monitoring and alerting

Out of Scope:

- Application code deployment (handled by CI/CD)
- Third-party hosting provider documentation
- Network infrastructure design (handled by infrastructure team)

---

## Inputs & Outputs

| Input | Description |
| --------------------- | ------------------------------------- |
| Application code | Built and tested CivicPress artifacts |
| Configuration files | Environment-specific settings |
| SSL certificates | TLS certificates for HTTPS |
| Infrastructure config | Server and network configuration |
| Security policies | Access control and security rules |

| Output | Description |
| ------------------- | ---------------------------------- |
| Deployed services | Running CivicPress instances |
| Health checks | Service availability monitoring |
| Security monitoring | Threat detection and alerting |
| Backup systems | Data protection and recovery |
| Audit logs | Deployment and access audit trails |

---

## File/Folder Location

```
deployment/
├── config/
│ ├── nginx/
│ │ ├── app.conf # Public UI configuration
│ │ ├── api.conf # API backend configuration
│ │ ├── admin.conf # Admin panel configuration
│ │ └── ssl.conf # SSL/TLS configuration
│ ├── systemd/
│ │ ├── civicpress-ui.service
│ │ ├── civicpress-api.service
│ │ └── civicpress-admin.service
│ ├── docker/
│ │ ├── docker-compose.yml
│ │ └── Dockerfile
│ └── security/
│ ├── firewall.rules
│ ├── ssl-config.yml
│ └── monitoring.yml
├── scripts/
│ ├── deploy.sh # Deployment automation
│ ├── security-check.sh # Security validation
│ ├── backup.sh # Backup automation
│ └── monitoring.sh # Health monitoring
├── tests/
│ ├── deployment/
│ │ ├── security.test.ts
│ │ ├── performance.test.ts
│ │ └── integration.test.ts
│ └── infrastructure/
│ ├── ssl.test.ts
│ ├── firewall.test.ts
│ └── monitoring.test.ts
└── docs/
 ├── deployment-guide.md
 ├── security-checklist.md
 └── troubleshooting.md
```

---

## Local & Demo Setup (Ports)

For local or lightweight demos:

| Service | URL/Port | Description |
| ----------- | ----------------------- | ------------------------- |
| Public UI | `http://localhost:3000` | Nuxt civic portal |
| API Backend | `http://localhost:3030` | Express or Hono server |
| Admin UI | `http://localhost:3100` | Optional management layer |

Simple to run and debug 
No Docker or domain config required 
No route collision: different ports = different namespaces

---

## Production Setup (Subdomains + Reverse Proxy)

| Subdomain | Target Port |
| --------------- | ------------------ |
| `app.town.ca` | → `localhost:3000` |
| `api.town.ca` | → `localhost:3030` |
| `admin.town.ca` | → `localhost:3100` |

Use Nginx or Caddy to map subdomains to internal ports.

### Example Nginx Snippet

```nginx
server {
 listen 80;
 server_name api.town.ca;
 location / {
 proxy_pass http://localhost:3030;
 }
}
```

Proxies ensure that:

- You avoid naming collisions
- All services can share the same machine
- Public URLs remain clean and stable

---

## Security & Trust Considerations

### Infrastructure Security Architecture

#### Network Security

```yaml
# deployment/config/security/firewall.rules
network_security:
 external_access:
 - port: 80
 protocol: tcp
 source: 0.0.0.0/0
 description: "HTTP traffic"
 - port: 443
 protocol: tcp
 source: 0.0.0.0/0
 description: "HTTPS traffic"
 - port: 22
 protocol: tcp
 source: "10.0.0.0/8"
 description: "SSH access (restricted)"

 internal_access:
 - port: 3000
 protocol: tcp
 source: "127.0.0.1"
 description: "UI service (localhost only)"
 - port: 3030
 protocol: tcp
 source: "127.0.0.1"
 description: "API service (localhost only)"
 - port: 3100
 protocol: tcp
 source: "10.0.0.0/8"
 description: "Admin service (internal network)"

 security_groups:
 - name: "civicpress-web"
 rules:
 - "allow http from internet"
 - "allow https from internet"
 - "deny all other traffic"

 - name: "civicpress-admin"
 rules:
 - "allow ssh from trusted ips"
 - "allow admin ui from internal network"
 - "deny all other traffic"
```

#### SSL/TLS Configuration

```nginx
# deployment/config/nginx/ssl.conf
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_stapling on;
ssl_stapling_verify on;

# Security headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options DENY always;
add_header X-Content-Type-Options nosniff always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
```

#### Service Isolation

```yaml
# deployment/config/docker/docker-compose.yml
version: '3.8'

services:
 civicpress-ui:
 build: ./ui
 ports:
 - "3000:3000"
 networks:
 - civicpress-public
 environment:
 - NODE_ENV=production
 - CIVICPRESS_API_URL=https://api.town.ca
 security_opt:
 - no-new-privileges:true
 read_only: true
 tmpfs:
 - /tmp
 - /var/cache/nginx

 civicpress-api:
 build: ./api
 ports:
 - "3030:3030"
 networks:
 - civicpress-internal
 environment:
 - NODE_ENV=production
 - DB_CONNECTION_STRING=${DB_CONNECTION_STRING}
 security_opt:
 - no-new-privileges:true
 read_only: true
 tmpfs:
 - /tmp

 civicpress-admin:
 build: ./admin
 ports:
 - "3100:3100"
 networks:
 - civicpress-admin
 environment:
 - NODE_ENV=production
 - ADMIN_SECRET=${ADMIN_SECRET}
 security_opt:
 - no-new-privileges:true
 read_only: true
 tmpfs:
 - /tmp

networks:
 civicpress-public:
 driver: bridge
 civicpress-internal:
 driver: bridge
 internal: true
 civicpress-admin:
 driver: bridge
 internal: true
```

### Deployment Security

#### Access Control

```typescript
// deployment/scripts/security-check.ts
interface SecurityCheck {
 checkSSLCertificates(): Promise<SSLValidationResult>;
 checkFirewallRules(): Promise<FirewallValidationResult>;
 checkServiceIsolation(): Promise<IsolationValidationResult>;
 checkAccessControls(): Promise<AccessValidationResult>;
}

class DeploymentSecurityChecker implements SecurityCheck {
 async checkSSLCertificates(): Promise<SSLValidationResult> {
 const domains = ['app.town.ca', 'api.town.ca', 'admin.town.ca'];
 const results: SSLValidationResult[] = [];

 for (const domain of domains) {
 const cert = await this.getSSLCertificate(domain);
 results.push({
 domain,
 valid: cert.valid,
 expiresIn: cert.expiresIn,
 issuer: cert.issuer,
 signatureAlgorithm: cert.signatureAlgorithm,
 vulnerabilities: cert.vulnerabilities,
 });
 }

 return results;
 }

 async checkFirewallRules(): Promise<FirewallValidationResult> {
 const requiredRules = [
 { port: 80, protocol: 'tcp', source: '0.0.0.0/0' },
 { port: 443, protocol: 'tcp', source: '0.0.0.0/0' },
 { port: 22, protocol: 'tcp', source: '10.0.0.0/8' },
 ];

 const activeRules = await this.getActiveFirewallRules();
 const missingRules = requiredRules.filter(rule =>
 !activeRules.some(active =>
 active.port === rule.port &&
 active.protocol === rule.protocol
 )
 );

 return {
 valid: missingRules.length === 0,
 missingRules,
 activeRules,
 };
 }

 async checkServiceIsolation(): Promise<IsolationValidationResult> {
 const services = ['civicpress-ui', 'civicpress-api', 'civicpress-admin'];
 const results: ServiceIsolationResult[] = [];

 for (const service of services) {
 const networkAccess = await this.checkServiceNetworkAccess(service);
 const fileSystemAccess = await this.checkServiceFileSystemAccess(service);
 const processIsolation = await this.checkProcessIsolation(service);

 results.push({
 service,
 networkAccess,
 fileSystemAccess,
 processIsolation,
 isolated: networkAccess.isolated && fileSystemAccess.isolated && processIsolation.isolated,
 });
 }

 return {
 valid: results.every(r => r.isolated),
 serviceResults: results,
 };
 }
}
```

#### Monitoring & Alerting

```yaml
# deployment/config/security/monitoring.yml
monitoring:
 health_checks:
 - name: "ui-health"
 url: "https://app.town.ca/health"
 interval: "30s"
 timeout: "10s"
 expected_status: 200

 - name: "api-health"
 url: "https://api.town.ca/health"
 interval: "30s"
 timeout: "10s"
 expected_status: 200

 - name: "admin-health"
 url: "https://admin.town.ca/health"
 interval: "30s"
 timeout: "10s"
 expected_status: 200

 security_monitoring:
 - name: "ssl-certificate-expiry"
 check: "ssl_cert_expiry"
 threshold: "30 days"
 alert: "critical"

 - name: "failed-login-attempts"
 check: "auth_failed_logins"
 threshold: "10 per minute"
 alert: "warning"

 - name: "suspicious-requests"
 check: "suspicious_http_requests"
 threshold: "100 per minute"
 alert: "critical"

 performance_monitoring:
 - name: "response-time"
 metric: "http_response_time"
 threshold: "2 seconds"
 alert: "warning"

 - name: "error-rate"
 metric: "http_error_rate"
 threshold: "5%"
 alert: "critical"
```

### Compliance & Governance

#### Data Sovereignty

```yaml
# deployment/config/compliance/data-sovereignty.yml
data_sovereignty:
 storage_location: "local"
 backup_location: "local"
 encryption_at_rest: true
 encryption_in_transit: true

 data_retention:
 civic_records: "permanent"
 user_sessions: "30 days"
 audit_logs: "7 years"
 backup_files: "90 days"

 access_logging:
 enabled: true
 retention: "1 year"
 encryption: true
```

#### Audit Requirements

```typescript
// deployment/scripts/audit-logger.ts
interface DeploymentAuditEvent {
 timestamp: Date;
 user: string;
 action: 'deploy' | 'rollback' | 'config_change' | 'security_update';
 service: string;
 details: any;
 ip_address: string;
 user_agent: string;
}

class DeploymentAuditLogger {
 async logDeploymentEvent(event: DeploymentAuditEvent): Promise<void> {
 const auditEntry = {
 ...event,
 hash: this.generateAuditHash(event),
 verified: true,
 };

 await this.storeAuditEntry(auditEntry);
 await this.notifySecurityTeam(event);
 }

 private generateAuditHash(event: DeploymentAuditEvent): string {
 const data = `${event.timestamp}:${event.user}:${event.action}:${event.service}`;
 return createHash('sha256').update(data).digest('hex');
 }
}
```

---

## Testing & Validation

### Deployment Testing Framework

#### Infrastructure Testing

```typescript
// deployment/tests/infrastructure/deployment-security.test.ts
describe('Deployment Security', () => {
 let securityChecker: DeploymentSecurityChecker;
 let infrastructureTester: InfrastructureTester;

 beforeEach(() => {
 securityChecker = new DeploymentSecurityChecker();
 infrastructureTester = new InfrastructureTester();
 });

 describe('SSL/TLS Configuration', () => {
 it('should have valid SSL certificates for all domains', async () => {
 // Arrange
 const domains = ['app.town.ca', 'api.town.ca', 'admin.town.ca'];

 // Act
 const results = await Promise.all(
 domains.map(domain => securityChecker.checkSSLCertificates())
 );

 // Assert
 results.forEach(result => {
 expect(result.valid).toBe(true);
 expect(result.expiresIn).toBeGreaterThan(30); // 30+ days
 expect(result.vulnerabilities).toHaveLength(0);
 });
 });

 it('should use secure TLS configuration', async () => {
 // Arrange
 const testUrls = [
 'https://app.town.ca',
 'https://api.town.ca',
 'https://admin.town.ca',
 ];

 // Act
 const results = await Promise.all(
 testUrls.map(url => infrastructureTester.testTLSConfiguration(url))
 );

 // Assert
 results.forEach(result => {
 expect(result.tlsVersion).toBe('1.3');
 expect(result.cipherStrength).toBeGreaterThanOrEqual(256);
 expect(result.weakCiphers).toHaveLength(0);
 });
 });
 });

 describe('Network Security', () => {
 it('should have proper firewall rules', async () => {
 // Act
 const result = await securityChecker.checkFirewallRules();

 // Assert
 expect(result.valid).toBe(true);
 expect(result.missingRules).toHaveLength(0);
 });

 it('should block unauthorized access attempts', async () => {
 // Arrange
 const unauthorizedPorts = [21, 23, 25, 110, 143, 993, 995];

 // Act
 const results = await Promise.all(
 unauthorizedPorts.map(port =>
 infrastructureTester.testPortAccessibility(port)
 )
 );

 // Assert
 results.forEach(result => {
 expect(result.accessible).toBe(false);
 });
 });
 });

 describe('Service Isolation', () => {
 it('should isolate services properly', async () => {
 // Act
 const result = await securityChecker.checkServiceIsolation();

 // Assert
 expect(result.valid).toBe(true);
 result.serviceResults.forEach(service => {
 expect(service.isolated).toBe(true);
 expect(service.networkAccess.isolated).toBe(true);
 expect(service.fileSystemAccess.isolated).toBe(true);
 });
 });
 });
});
```

#### Performance Testing

```typescript
// deployment/tests/performance/deployment-performance.test.ts
describe('Deployment Performance', () => {
 let performanceTester: DeploymentPerformanceTester;

 beforeEach(() => {
 performanceTester = new DeploymentPerformanceTester();
 });

 describe('Load Testing', () => {
 it('should handle concurrent user load', async () => {
 // Arrange
 const concurrentUsers = 100;
 const testDuration = 300; // 5 minutes

 // Act
 const result = await performanceTester.testConcurrentLoad({
 users: concurrentUsers,
 duration: testDuration,
 rampUp: 60, // 1 minute ramp-up
 });

 // Assert
 expect(result.averageResponseTime).toBeLessThan(2000); // < 2 seconds
 expect(result.errorRate).toBeLessThan(0.05); // < 5%
 expect(result.throughput).toBeGreaterThan(50); // > 50 req/sec
 });

 it('should handle database load under stress', async () => {
 // Arrange
 const databaseLoad = {
 concurrentQueries: 50,
 queryComplexity: 'high',
 duration: 600, // 10 minutes
 };

 // Act
 const result = await performanceTester.testDatabaseLoad(databaseLoad);

 // Assert
 expect(result.averageQueryTime).toBeLessThan(1000); // < 1 second
 expect(result.connectionPoolUsage).toBeLessThan(0.8); // < 80%
 expect(result.deadlocks).toBe(0);
 });
 });

 describe('Failover Testing', () => {
 it('should handle service failures gracefully', async () => {
 // Arrange
 const services = ['civicpress-ui', 'civicpress-api', 'civicpress-admin'];

 // Act & Assert
 for (const service of services) {
 const result = await performanceTester.testServiceFailover(service);

 expect(result.failoverTime).toBeLessThan(30); // < 30 seconds
 expect(result.dataLoss).toBe(0);
 expect(result.serviceRecovery).toBe(true);
 }
 });
 });
});
```

#### Security Testing

```typescript
// deployment/tests/security/deployment-security.test.ts
describe('Deployment Security Testing', () => {
 let securityTester: DeploymentSecurityTester;

 beforeEach(() => {
 securityTester = new DeploymentSecurityTester();
 });

 describe('Penetration Testing', () => {
 it('should resist common attack vectors', async () => {
 // Arrange
 const attackVectors = [
 'sql_injection',
 'xss_attack',
 'csrf_attack',
 'directory_traversal',
 'command_injection',
 ];

 // Act
 const results = await Promise.all(
 attackVectors.map(vector =>
 securityTester.testAttackVector(vector)
 )
 );

 // Assert
 results.forEach(result => {
 expect(result.vulnerable).toBe(false);
 expect(result.blocked).toBe(true);
 });
 });

 it('should validate SSL certificate security', async () => {
 // Act
 const result = await securityTester.testSSLSecurity();

 // Assert
 expect(result.validCertificate).toBe(true);
 expect(result.strongCiphers).toBe(true);
 expect(result.noWeakProtocols).toBe(true);
 expect(result.ocspStapling).toBe(true);
 });
 });

 describe('Access Control Testing', () => {
 it('should enforce proper access controls', async () => {
 // Arrange
 const accessTests = [
 { role: 'anonymous', resource: 'admin', expected: false },
 { role: 'user', resource: 'admin', expected: false },
 { role: 'admin', resource: 'admin', expected: true },
 ];

 // Act
 const results = await Promise.all(
 accessTests.map(test =>
 securityTester.testAccessControl(test.role, test.resource)
 )
 );

 // Assert
 results.forEach((result, index) => {
 expect(result.allowed).toBe(accessTests[index].expected);
 });
 });
 });
});
```

---

## HTTPS & Security

- Add HTTPS using Let's Encrypt (Certbot)
- Restrict `admin.` subdomain by IP or GitHub login
- Add `health.` checks for uptime monitoring

---

## ️ CLI Integration

- `civic index` can be called by `cron` or webhook
- `civic serve` may offer static fallback or preview mode
- All services can run under `systemd`, `pm2`, or `forever`

---

## ️ Future Enhancements

- Federation-ready multi-tenant proxy
- System-wide `civicctl` deployment CLI
- Webhooks from GitHub → `api.town.ca/hook/publish`
- SSO proxy with Civic ID or OpenID
- **Automated security scanning** and vulnerability assessment
- **Infrastructure as Code** with Terraform/CloudFormation
- **Blue-green deployment** strategies
- **Multi-region deployment** for high availability

---

## Routing Guarantees

Using distinct ports for each service ensures complete separation with no route
collisions:

- `localhost:3000/bylaws/curfew` (UI)
- `localhost:3030/bylaws/curfew` (API)
- `localhost:3100/bylaws/curfew` (Admin)

Each runs on its own TCP socket. Even with identical routes, the port makes each
service independent and safe.

This pattern scales well to local, demo, and production deployments, and is
ideal for subdomain proxying.

---

## CivicPress Deployment Philosophy (Final)

### Subdomain-based Services (Preferred)

CivicPress recommends deploying services via subdomains for modularity,
isolation, and scale:

| Service | Subdomain | Description |
| ----------- | --------------- | -------------------------------- |
| Public UI | `app.town.ca` | Civic portal and records viewer |
| API Backend | `api.town.ca` | REST API for actions and queries |
| Admin Panel | `admin.town.ca` | Optional management interface |

This strategy:

- Prevents all route collisions
- Enables per-service autoscaling
- Feels natural for public infrastructure (`api.city.ca`, `admin.city.ca`)
- Supports independent security policies per service
- Enables granular monitoring and alerting

---

## Related Specs

- [`security.md`](./security.md) — Security architecture and threat modeling
- [`database.md`](./database.md) — Database deployment and security
- [`api.md`](./api.md) — API deployment and security
- [`testing-framework.md`](./testing-framework.md) — Testing standards and
 patterns

---

## History

- Drafted: 2025-07-03
- Last updated: 2025-07-15
