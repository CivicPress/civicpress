# 🔐 CivicPress Spec: `permissions.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
breaking_changes: []
additions:

- comprehensive testing examples
- security testing patterns
- performance testing
- compliance testing
- CLI testing
- detailed YAML field definitions
fixes: []
migration_guide: null
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'auth.md: >=1.0.0'
  - 'roles.yml.md: >=1.0.0'
  - 'workflows.md: >=1.0.0'
  - 'git-policy.md: >=1.0.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

`permissions` — CivicPress Permissions & Role Model

## 🎯 Purpose

Define how CivicPress assigns, interprets, and enforces user roles using
Git-based identities, enabling traceable participation in civic workflows and
approvals.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Define standard roles (clerk, council-member, mayor, etc.)
- Establish what each role is allowed to do (edit, approve, publish)
- Apply roles across CLI, commit metadata, and UI
- Validate actions via `.civic/roles.yml`

❌ Out of scope:

- Login and authentication (see future `auth.md`)
- GitHub/Gitea team management (external)

---

## 🔗 Inputs & Outputs

| Input                    | Description                           |
| ------------------------ | ------------------------------------- |
| User identities          | Git commit authors and role assignments |
| Role definitions         | Role permissions from `.civic/roles.yml` |
| Permission requests      | User actions requiring authorization |
| Approval workflows       | Multi-role approval processes |
| Role assignments         | User-to-role mappings and changes |

| Output                   | Description                           |
| ------------------------ | ------------------------------------- |
| Authorization decisions  | Allow/deny responses for user actions |
| Role validations         | Role verification and permission checks |
| Approval status          | Multi-role approval workflow status |
| Audit logs              | Permission checks and role changes |
| Access control lists     | Computed permissions for users and resources |

---

## 📂 File/Folder Location

```
.civic/
├── roles.yml              # User roles and permissions
├── permissions.yml        # Permission definitions and policies
└── approval-workflows.yml # Approval workflow configurations

core/
├── permissions.ts         # Permission checking logic
├── roles.ts              # Role management and validation
├── approval.ts           # Approval workflow processing
└── audit.ts              # Permission audit logging

modules/
├── permissions/
│   ├── components/
│   │   ├── RoleManager.tsx # Role management UI
│   │   ├── PermissionViewer.tsx # Permission display
│   │   └── ApprovalWorkflow.tsx # Approval workflow UI
│   ├── hooks/
│   │   └── usePermissions.ts # Permission data hook
│   └── utils/
│       ├── permission-checker.ts # Permission validation
│       └── role-validator.ts # Role validation utilities
└── ui/
    └── components/
        └── PermissionProvider.tsx # Permission context provider

tests/
├── permissions/
│   ├── permission-checking.test.ts
│   ├── role-validation.test.ts
│   └── approval-workflow.test.ts
└── integration/
    └── permissions-integration.test.ts
```

---

## 🔐 Security & Trust Considerations

### Permission Security

- All permission checks must be validated server-side
- Role assignments require administrative approval
- Permission inheritance must be explicitly defined
- Audit logging for all permission changes and checks
- Cryptographic verification of role assignments

### Access Control & Authorization

- Role-based access control (RBAC) implementation
- Principle of least privilege for all roles
- Time-based permission expiration and renewal
- Emergency access procedures for critical situations
- Multi-factor authentication for administrative roles

### Compliance & Legal Requirements

- Compliance with municipal access control requirements
- Support for public records laws and transparency
- Legal review process for permission policies
- Compliance with data protection regulations
- Regular security audits of permission systems

### Data Protection & Privacy

- Encryption of sensitive permission data
- GDPR-compliant permission data handling
- User consent for permission assignments
- Data retention policies for permission logs
- Anonymization of permission audit trails

### Audit & Transparency

- Immutable audit trails for all permission changes
- Public transparency logs for role assignments
- Cryptographic verification of permission integrity
- Support for compliance audits and legal discovery
- Regular permission system health checks

### Abuse Prevention & Monitoring

- Rate limiting for permission check requests
- Automated detection of permission abuse patterns
- Real-time monitoring of permission usage
- Alert systems for unusual permission activity
- Blacklist/whitelist management for permissions

---

## 👥 Standard Civic Roles

| Role             | Description                                |
| ---------------- | ------------------------------------------ |
| `clerk`          | Creates, edits, and proposes civic records |
| `council-member` | Reviews, comments, and approves records    |
| `mayor`          | Final approval + publishes to main         |
| `auditor`        | Read-only, can audit commits and records   |
| `contributor`    | Proposes drafts, requires review           |
| `admin`          | Full access to system and setup            |
| `public`         | Read-only access to published civic data   |

---

## 🗃️ Roles Schema & Field Definitions

### 📄 Complete `.civic/roles.yml` Example

```yaml
# CivicPress Roles Configuration
version: '1.0'
town: 'richmond-qc'
last_updated: '2025-07-03T10:00:00Z'

# User Role Assignments
users:
  clerk-richmond:
    role: 'clerk'
    name: 'Ada Lovelace'
    email: 'ada@richmond.ca'
    department: 'Administration'
    title: 'Town Clerk'
    active: true
    created: '2025-01-15T09:00:00Z'
    permissions:
      - 'create_draft'
      - 'edit_records'
      - 'propose_changes'
      - 'view_unpublished'
      - 'trigger_workflows'
    metadata:
      phone: '+1-450-774-2641'
      office: 'Town Hall, Room 101'
      hours: 'Mon-Fri 8:30-16:30'

  council-marie:
    role: 'council-member'
    name: 'Marie Curie'
    email: 'marie.curie@richmond.ca'
    department: 'Council'
    title: 'Council Member'
    active: true
    created: '2025-01-20T14:00:00Z'
    permissions:
      - 'review_proposals'
      - 'approve_records'
      - 'view_unpublished'
      - 'comment_on_records'
    metadata:
      district: 'District 1'
      term_start: '2024-11-01'
      term_end: '2028-10-31'

  mayor-luc:
    role: 'mayor'
    name: 'Luc Lapointe'
    email: 'mayor@richmond.ca'
    department: 'Executive'
    title: 'Mayor'
    active: true
    created: '2025-01-10T10:00:00Z'
    permissions:
      - 'final_approval'
      - 'publish_records'
      - 'merge_to_main'
      - 'trigger_workflows'
      - 'view_unpublished'
    metadata:
      term_start: '2024-11-01'
      term_end: '2028-10-31'
      emergency_contact: '+1-450-774-9999'

  auditor-hugo:
    role: 'auditor'
    name: 'Hugo Gagarine'
    email: 'auditor@richmond.ca'
    department: 'Audit'
    title: 'Town Auditor'
    active: true
    created: '2025-02-01T11:00:00Z'
    permissions:
      - 'view_unpublished'
      - 'audit_records'
      - 'view_audit_logs'
    metadata:
      certification: 'CPA'
      audit_cycle: 'quarterly'

  contributor-jane:
    role: 'contributor'
    name: 'Jane Smith'
    email: 'jane.smith@richmond.ca'
    department: 'Planning'
    title: 'Planning Consultant'
    active: true
    created: '2025-03-15T13:00:00Z'
    permissions:
      - 'create_draft'
      - 'propose_changes'
    metadata:
      organization: 'Smith Planning Associates'
      contract_end: '2025-12-31'

  admin-system:
    role: 'admin'
    name: 'System Administrator'
    email: 'admin@richmond.ca'
    department: 'IT'
    title: 'System Admin'
    active: true
    created: '2025-01-01T00:00:00Z'
    permissions:
      - 'full_access'
      - 'configure_system'
      - 'manage_users'
      - 'view_audit_logs'
    metadata:
      access_level: 'superuser'
      last_login: '2025-07-03T09:30:00Z'

# Role Definitions
roles:
  clerk:
    description: 'Creates, edits, and proposes civic records'
    permissions:
      - 'create_draft'
      - 'edit_records'
      - 'propose_changes'
      - 'view_unpublished'
      - 'trigger_workflows'
    approval_required: false
    can_publish: false
    can_merge: false

  council-member:
    description: 'Reviews, comments, and approves records'
    permissions:
      - 'review_proposals'
      - 'approve_records'
      - 'view_unpublished'
      - 'comment_on_records'
    approval_required: true
    can_publish: false
    can_merge: false

  mayor:
    description: 'Final approval and publishes to main'
    permissions:
      - 'final_approval'
      - 'publish_records'
      - 'merge_to_main'
      - 'trigger_workflows'
      - 'view_unpublished'
    approval_required: false
    can_publish: true
    can_merge: true

  auditor:
    description: 'Read-only access for audit purposes'
    permissions:
      - 'view_unpublished'
      - 'audit_records'
      - 'view_audit_logs'
    approval_required: false
    can_publish: false
    can_merge: false

  contributor:
    description: 'Proposes drafts, requires review'
    permissions:
      - 'create_draft'
      - 'propose_changes'
    approval_required: true
    can_publish: false
    can_merge: false

  admin:
    description: 'Full system access and configuration'
    permissions:
      - 'full_access'
      - 'configure_system'
      - 'manage_users'
      - 'view_audit_logs'
    approval_required: false
    can_publish: true
    can_merge: true

# Permission Definitions
permissions:
  create_draft:
    description: 'Create new draft records'
    scope: 'records'
    risk_level: 'low'

  edit_records:
    description: 'Edit existing records'
    scope: 'records'
    risk_level: 'medium'

  propose_changes:
    description: 'Propose changes to records'
    scope: 'records'
    risk_level: 'low'

  review_proposals:
    description: 'Review proposed changes'
    scope: 'records'
    risk_level: 'medium'

  approve_records:
    description: 'Approve records for publication'
    scope: 'records'
    risk_level: 'high'

  final_approval:
    description: 'Give final approval for publication'
    scope: 'records'
    risk_level: 'high'

  publish_records:
    description: 'Publish records to main branch'
    scope: 'records'
    risk_level: 'high'

  merge_to_main:
    description: 'Merge changes to main branch'
    scope: 'git'
    risk_level: 'high'

  trigger_workflows:
    description: 'Trigger automated workflows'
    scope: 'system'
    risk_level: 'medium'

  view_unpublished:
    description: 'View unpublished/draft records'
    scope: 'records'
    risk_level: 'low'

  audit_records:
    description: 'Audit record changes and history'
    scope: 'records'
    risk_level: 'low'

  view_audit_logs:
    description: 'View system audit logs'
    scope: 'system'
    risk_level: 'medium'

  comment_on_records:
    description: 'Add comments to records'
    scope: 'records'
    risk_level: 'low'

  full_access:
    description: 'Full system access'
    scope: 'system'
    risk_level: 'critical'

  configure_system:
    description: 'Configure system settings'
    scope: 'system'
    risk_level: 'high'

  manage_users:
    description: 'Manage user accounts and roles'
    scope: 'system'
    risk_level: 'high'

# Approval Workflows
approval_workflows:
  bylaw_approval:
    description: 'Bylaw approval workflow'
    required_roles:
      - 'clerk'
      - 'mayor'
      - 'council-member'
    required_count: 3
    strategy: 'unanimous'
    auto_merge: false

  budget_approval:
    description: 'Budget approval workflow'
    required_roles:
      - 'clerk'
      - 'mayor'
      - 'council-member'
      - 'auditor'
    required_count: 4
    strategy: 'majority'
    auto_merge: false

  feedback_approval:
    description: 'Feedback approval workflow'
    required_roles:
      - 'clerk'
    required_count: 1
    strategy: 'any'
    auto_merge: true
```

### 📋 Field Definitions & Validation Rules

#### **User Fields**

| Field                          | Type    | Required | Description           | Validation                     |
| ------------------------------ | ------- | -------- | --------------------- | ------------------------------ |
| `version`                      | string  | ✅       | Schema version        | Must be "1.0"                  |
| `town`                         | string  | ✅       | Town identifier       | Must match manifest.id         |
| `last_updated`                 | string  | ✅       | Last update timestamp | ISO 8601 format                |
| `users.<username>.role`        | string  | ✅       | User's role           | Must be valid role name        |
| `users.<username>.name`        | string  | ✅       | Display name          | Human-readable, max 100 chars  |
| `users.<username>.email`       | string  | ❌       | Contact email         | Valid email format             |
| `users.<username>.department`  | string  | ❌       | Department            | Max 50 chars                   |
| `users.<username>.title`       | string  | ❌       | Job title             | Max 100 chars                  |
| `users.<username>.active`      | boolean | ❌       | Account status        | true/false, defaults to true   |
| `users.<username>.created`     | string  | ❌       | Account creation date | ISO 8601 format                |
| `users.<username>.permissions` | array   | ❌       | Custom permissions    | List of valid permission names |
| `users.<username>.metadata`    | object  | ❌       | Additional metadata   | Free-form object               |

#### **Role Definition Fields**

| Field                            | Type    | Required | Description         | Validation                |
| -------------------------------- | ------- | -------- | ------------------- | ------------------------- |
| `roles.<role>.description`       | string  | ✅       | Role description    | Max 200 chars             |
| `roles.<role>.permissions`       | array   | ✅       | Default permissions | List of valid permissions |
| `roles.<role>.approval_required` | boolean | ✅       | Requires approval   | true/false                |
| `roles.<role>.can_publish`       | boolean | ✅       | Can publish records | true/false                |
| `roles.<role>.can_merge`         | boolean | ✅       | Can merge to main   | true/false                |

#### **Permission Definition Fields**

| Field                            | Type   | Required | Description            | Validation                  |
| -------------------------------- | ------ | -------- | ---------------------- | --------------------------- |
| `permissions.<perm>.description` | string | ✅       | Permission description | Max 200 chars               |
| `permissions.<perm>.scope`       | string | ✅       | Permission scope       | records, git, system        |
| `permissions.<perm>.risk_level`  | string | ✅       | Security risk level    | low, medium, high, critical |

#### **Approval Workflow Fields**

| Field                                          | Type    | Required | Description              | Validation               |
| ---------------------------------------------- | ------- | -------- | ------------------------ | ------------------------ |
| `approval_workflows.<workflow>.description`    | string  | ✅       | Workflow description     | Max 200 chars            |
| `approval_workflows.<workflow>.required_roles` | array   | ✅       | Required roles           | List of valid role names |
| `approval_workflows.<workflow>.required_count` | integer | ✅       | Minimum approvals        | Positive integer         |
| `approval_workflows.<workflow>.strategy`       | string  | ✅       | Approval strategy        | any, majority, unanimous |
| `approval_workflows.<workflow>.auto_merge`     | boolean | ✅       | Auto-merge when approved | true/false               |

### 🔧 Validation Rules

#### **Required Field Validation**

```yaml
# These fields must be present and valid
required_fields:
  - version
  - town
  - last_updated
  - users
  - roles
  - permissions
```

#### **Username Validation**

```yaml
# Username format requirements
username_rules:
  pattern: '^[a-z0-9-]+$' # lowercase, alphanumeric, hyphens only
  max_length: 50
  min_length: 3
  reserved_names:
    - 'admin'
    - 'system'
    - 'root'
    - 'public'
```

#### **Role Validation**

```yaml
# Role validation rules
role_rules:
  valid_roles:
    - 'clerk'
    - 'council-member'
    - 'mayor'
    - 'auditor'
    - 'contributor'
    - 'admin'
    - 'public'
  one_role_per_user: true
  role_must_be_defined: true
```

#### **Permission Validation**

```yaml
# Permission validation rules
permission_rules:
  valid_scopes:
    - 'records'
    - 'git'
    - 'system'
  valid_risk_levels:
    - 'low'
    - 'medium'
    - 'high'
    - 'critical'
  permission_must_be_defined: true
```

### 🔐 Security Considerations

#### **Permission Inheritance**

```yaml
# Permission inheritance rules
inheritance:
  admin_inherits_all: true
  mayor_inherits_council: true
  clerk_inherits_contributor: true
  auditor_read_only: true
```

#### **Approval Escalation**

```yaml
# Approval escalation rules
escalation:
  timeout_hours: 72 # 3 days
  escalate_to_mayor: true
  emergency_override: true
  override_roles:
    - 'admin'
    - 'mayor'
```

---

## 🧰 Role Mapping via `.civic/roles.yml`

```yaml
users:
  clerk-richmond:
    role: clerk
  council-marie:
    role: council-member
  mayor-luc:
    role: mayor
  auditor-hugo:
    role: auditor
```

---

## ✅ Permissions Matrix

| Action                  | Allowed Roles                   |
| ----------------------- | ------------------------------- |
| Create draft            | clerk, contributor              |
| Approve draft           | council-member, mayor           |
| Merge to `main`         | mayor, admin (if quorum met)    |
| Edit civic record       | clerk (contributor with review) |
| Configure module        | admin                           |
| View unpublished record | clerk, auditor, council-member  |
| Trigger workflow        | clerk, mayor                    |

---

## 🔁 Example Civic Flow (Git-based MVP)

### 🏛️ Simulating a Town Approval Flow

1. `clerk-richmond` creates a new bylaw:

```bash
civic propose records/timeline/2025-07-04/bylaw-18542.md
```

2. `council-marie` logs in and approves:

```bash
civic approve records/timeline/2025-07-04/bylaw-18542.md
```

3. `mayor-luc` publishes after quorum:

```bash
civic publish records/timeline/2025-07-04/bylaw-18542.md
```

→ File is moved to `bylaws/`, Git commit shows all approvals, hooks are
triggered.

---

## 🧪 Enforcement Locations

- CLI (`civic propose`, `civic approve`, `civic publish`)
- Editors with integrated role check
- Git commit authorship (used to validate role in `.civic/roles.yml`)

---

## 🔐 Trust & Transparency

- Every action is Git-tracked and role-validated
- Reviewers and approvers must be declared in YAML
- PRs or branches must match CivicPress `git-policy.md`

---

## 🧪 Testing & Validation

### Permission Testing

#### Unit Tests

```typescript
// tests/unit/permissions/permission-system.test.ts
describe('Permission System', () => {
  let permissionService: PermissionService;
  let mockAPI: MockCivicPressAPI;

  beforeEach(() => {
    mockAPI = new MockCivicPressAPI();
    permissionService = new PermissionService(mockAPI);
  });

  describe('Role-Based Access Control', () => {
    it('should allow admin to perform all actions', async () => {
      // Arrange
      const adminUser = { id: '1', role: 'admin' };
      const actions = [
        'read:records',
        'write:records',
        'delete:records',
        'approve:records',
      ];

      // Act
      const results = await Promise.all(
        actions.map((action) =>
          permissionService.checkPermission(adminUser, action, 'records')
        )
      );

      // Assert
      results.forEach((result) => {
        expect(result.allowed).toBe(true);
      });
    });

    it('should restrict contributor to limited actions', async () => {
      // Arrange
      const contributorUser = { id: '2', role: 'contributor' };
      const allowedActions = ['read:public', 'write:drafts'];
      const restrictedActions = ['delete:records', 'approve:records'];

      // Act
      const allowedResults = await Promise.all(
        allowedActions.map((action) =>
          permissionService.checkPermission(contributorUser, action, 'records')
        )
      );
      const restrictedResults = await Promise.all(
        restrictedActions.map((action) =>
          permissionService.checkPermission(contributorUser, action, 'records')
        )
      );

      // Assert
      allowedResults.forEach((result) => {
        expect(result.allowed).toBe(true);
      });
      restrictedResults.forEach((result) => {
        expect(result.allowed).toBe(false);
      });
    });

    it('should handle role inheritance correctly', async () => {
      // Arrange
      const mayorUser = { id: '3', role: 'mayor' };
      const clerkUser = { id: '4', role: 'clerk' };

      // Act
      const mayorPermissions =
        await permissionService.getUserPermissions(mayorUser);
      const clerkPermissions =
        await permissionService.getUserPermissions(clerkUser);

      // Assert
      expect(mayorPermissions).toContain('approve:records');
      expect(mayorPermissions).toContain('read:records');
      expect(clerkPermissions).toContain('read:records');
      expect(clerkPermissions).not.toContain('approve:records');
    });
  });

  describe('Permission Validation', () => {
    it('should validate permission format', async () => {
      // Arrange
      const validPermissions = [
        'read:records',
        'write:records',
        'delete:records',
      ];
      const invalidPermissions = ['read', 'write', 'invalid:permission:format'];

      // Act
      const validResults = await Promise.all(
        validPermissions.map((permission) =>
          permissionService.validatePermission(permission)
        )
      );
      const invalidResults = await Promise.all(
        invalidPermissions.map((permission) =>
          permissionService.validatePermission(permission)
        )
      );

      // Assert
      validResults.forEach((result) => {
        expect(result.valid).toBe(true);
      });
      invalidResults.forEach((result) => {
        expect(result.valid).toBe(false);
      });
    });

    it('should enforce permission hierarchy', async () => {
      // Arrange
      const user = { id: '5', role: 'clerk' };
      const hierarchicalPermissions = [
        { action: 'read:records', resource: 'public', expected: true },
        { action: 'read:records', resource: 'internal', expected: false },
        { action: 'write:records', resource: 'drafts', expected: true },
        { action: 'write:records', resource: 'published', expected: false },
      ];

      // Act
      const results = await Promise.all(
        hierarchicalPermissions.map(async ({ action, resource, expected }) => {
          const result = await permissionService.checkPermission(
            user,
            action,
            resource
          );
          return { action, resource, expected, actual: result.allowed };
        })
      );

      // Assert
      results.forEach((result) => {
        expect(result.actual).toBe(result.expected);
      });
    });
  });

  describe('Approval Workflow Testing', () => {
    it('should require quorum for approval', async () => {
      // Arrange
      const record = { id: 'record-1', type: 'bylaw', status: 'proposed' };
      const approvers = [
        { id: '1', role: 'council-member' },
        { id: '2', role: 'council-member' },
        { id: '3', role: 'mayor' },
      ];
      const requiredApprovals = 2;

      // Act
      const approvalResult = await permissionService.processApprovalWorkflow(
        record,
        approvers,
        requiredApprovals
      );

      // Assert
      expect(approvalResult.approved).toBe(true);
      expect(approvalResult.approvalCount).toBeGreaterThanOrEqual(
        requiredApprovals
      );
      expect(approvalResult.approvers).toHaveLength(
        approvalResult.approvalCount
      );
    });

    it('should reject insufficient approvals', async () => {
      // Arrange
      const record = { id: 'record-2', type: 'bylaw', status: 'proposed' };
      const approvers = [{ id: '1', role: 'council-member' }];
      const requiredApprovals = 3;

      // Act
      const approvalResult = await permissionService.processApprovalWorkflow(
        record,
        approvers,
        requiredApprovals
      );

      // Assert
      expect(approvalResult.approved).toBe(false);
      expect(approvalResult.approvalCount).toBeLessThan(requiredApprovals);
    });
  });
});
```

#### Integration Tests

```typescript
// tests/integration/permissions/permission-integration.test.ts
describe('Permission Integration', () => {
  let testUtils: CivicPressTestUtils;
  let api: CivicPressAPI;
  let permissionService: PermissionService;

  beforeEach(async () => {
    testUtils = new CivicPressTestUtils();
    api = await testUtils.initializeTestAPI();
    permissionService = new PermissionService(api);
  });

  afterEach(async () => {
    await testUtils.cleanup();
  });

  describe('End-to-End Permission Workflow', () => {
    it('should complete full permission workflow', async () => {
      // Arrange
      const user = await testUtils.createTestUser('clerk');
      const record = await testUtils.createTestRecord({
        type: 'bylaw',
        status: 'draft',
      });

      // Act
      const canRead = await permissionService.checkPermission(
        user,
        'read:records',
        record.id
      );
      const canWrite = await permissionService.checkPermission(
        user,
        'write:records',
        record.id
      );
      const canApprove = await permissionService.checkPermission(
        user,
        'approve:records',
        record.id
      );

      // Assert
      expect(canRead.allowed).toBe(true);
      expect(canWrite.allowed).toBe(true);
      expect(canApprove.allowed).toBe(false);
    });

    it('should handle role escalation correctly', async () => {
      // Arrange
      const clerkUser = await testUtils.createTestUser('clerk');
      const mayorUser = await testUtils.createTestUser('mayor');
      const record = await testUtils.createTestRecord({
        type: 'bylaw',
        status: 'proposed',
      });

      // Act
      const clerkPermissions =
        await permissionService.getUserPermissions(clerkUser);
      const mayorPermissions =
        await permissionService.getUserPermissions(mayorUser);

      // Assert
      expect(clerkPermissions).toContain('read:records');
      expect(clerkPermissions).toContain('write:records');
      expect(clerkPermissions).not.toContain('approve:records');

      expect(mayorPermissions).toContain('read:records');
      expect(mayorPermissions).toContain('write:records');
      expect(mayorPermissions).toContain('approve:records');
    });
  });

  describe('Multi-User Permission Testing', () => {
    it('should handle concurrent permission checks', async () => {
      // Arrange
      const users = await Promise.all([
        testUtils.createTestUser('contributor'),
        testUtils.createTestUser('clerk'),
        testUtils.createTestUser('council-member'),
        testUtils.createTestUser('mayor'),
      ]);
      const record = await testUtils.createTestRecord({
        type: 'bylaw',
        status: 'draft',
      });

      // Act
      const permissionChecks = await Promise.all(
        users.map((user) =>
          permissionService.checkPermission(user, 'read:records', record.id)
        )
      );

      // Assert
      permissionChecks.forEach((check) => {
        expect(check.allowed).toBe(true);
      });
    });

    it('should handle role conflicts correctly', async () => {
      // Arrange
      const user = await testUtils.createTestUser('clerk');
      const conflictingPermissions = [
        { action: 'read:records', resource: 'public', expected: true },
        { action: 'read:records', resource: 'confidential', expected: false },
        { action: 'write:records', resource: 'drafts', expected: true },
        { action: 'write:records', resource: 'published', expected: false },
      ];

      // Act
      const results = await Promise.all(
        conflictingPermissions.map(async ({ action, resource, expected }) => {
          const result = await permissionService.checkPermission(
            user,
            action,
            resource
          );
          return { action, resource, expected, actual: result.allowed };
        })
      );

      // Assert
      results.forEach((result) => {
        expect(result.actual).toBe(result.expected);
      });
    });
  });
});
```

### Security Testing

#### Permission Security Testing

```typescript
// tests/security/permissions/permission-security.test.ts
describe('Permission Security', () => {
  let securityTestSuite: SecurityTestSuite;
  let permissionService: PermissionService;

  beforeEach(() => {
    securityTestSuite = new SecurityTestSuite();
    permissionService = new PermissionService();
  });

  describe('Permission Bypass Testing', () => {
    it('should prevent privilege escalation', async () => {
      // Arrange
      const lowPrivilegeUser = { id: '1', role: 'contributor' };
      const highPrivilegeActions = [
        'approve:records',
        'delete:records',
        'admin:system',
      ];

      // Act
      const results = await Promise.all(
        highPrivilegeActions.map((action) =>
          securityTestSuite.testPrivilegeEscalation(lowPrivilegeUser, action)
        )
      );

      // Assert
      results.forEach((result) => {
        expect(result.passed).toBe(true);
        expect(result.escalationAttempts).toBe(0);
      });
    });

    it('should prevent role manipulation', async () => {
      // Arrange
      const maliciousPayloads = [
        { role: "admin' OR '1'='1" },
        { role: 'admin; DROP TABLE users; --' },
        { role: '<script>alert("xss")</script>' },
      ];

      // Act
      const results = await Promise.all(
        maliciousPayloads.map((payload) =>
          securityTestSuite.testRoleManipulation(payload)
        )
      );

      // Assert
      results.forEach((result) => {
        expect(result.passed).toBe(true);
        expect(result.injectionDetected).toBe(true);
      });
    });

    it('should validate permission tokens', async () => {
      // Arrange
      const validToken = createValidPermissionToken();
      const tamperedToken = tamperWithToken(validToken);

      // Act
      const validResult =
        await securityTestSuite.testPermissionToken(validToken);
      const tamperedResult =
        await securityTestSuite.testPermissionToken(tamperedToken);

      // Assert
      expect(validResult.passed).toBe(true);
      expect(tamperedResult.passed).toBe(false);
      expect(tamperedResult.tamperDetected).toBe(true);
    });
  });

  describe('Input Validation Testing', () => {
    it('should prevent SQL injection in permission queries', async () => {
      // Arrange
      const maliciousInputs = [
        "'; DROP TABLE permissions; --",
        "' OR '1'='1",
        "'; INSERT INTO permissions VALUES ('hacker', 'admin'); --",
      ];

      // Act
      const results = await Promise.all(
        maliciousInputs.map((input) =>
          securityTestSuite.testPermissionSQLInjection(input)
        )
      );

      // Assert
      results.forEach((result) => {
        expect(result.passed).toBe(true);
        expect(result.vulnerabilities).toHaveLength(0);
      });
    });

    it('should prevent XSS in permission interfaces', async () => {
      // Arrange
      const maliciousInputs = [
        "<script>alert('xss')</script>",
        "javascript:alert('xss')",
        "<img src=x onerror=alert('xss')>",
      ];

      // Act
      const results = await Promise.all(
        maliciousInputs.map((input) =>
          securityTestSuite.testPermissionXSS(input)
        )
      );

      // Assert
      results.forEach((result) => {
        expect(result.passed).toBe(true);
        expect(result.sanitized).toBe(true);
      });
    });
  });
});
```

### Performance Testing

#### Permission Performance Testing

```typescript
// tests/performance/permissions/permission-performance.test.ts
describe('Permission Performance', () => {
  let performanceTestSuite: PerformanceTestSuite;

  beforeEach(() => {
    performanceTestSuite = new PerformanceTestSuite();
  });

  describe('Permission Check Performance', () => {
    it('should check permissions within acceptable time', async () => {
      // Arrange
      const concurrentChecks = 1000;
      const users = await createTestUsers(100);
      const resources = await createTestResources(50);

      // Act
      const result = await performanceTestSuite.testPermissionChecks(
        users,
        resources,
        concurrentChecks
      );

      // Assert
      expect(result.averageResponseTime).toBeLessThan(100); // < 100ms
      expect(result.p95ResponseTime).toBeLessThan(200); // < 200ms
      expect(result.successRate).toBeGreaterThan(0.99); // > 99% success
    });

    it('should handle permission cache efficiently', async () => {
      // Arrange
      const user = await createTestUser('clerk');
      const repeatedChecks = 1000;

      // Act
      const result = await performanceTestSuite.testPermissionCache(
        user,
        repeatedChecks
      );

      // Assert
      expect(result.cacheHitRate).toBeGreaterThan(0.8); // > 80% cache hit
      expect(result.averageCacheTime).toBeLessThan(10); // < 10ms
    });
  });

  describe('Role Resolution Performance', () => {
    it('should resolve roles efficiently', async () => {
      // Arrange
      const users = await createTestUsers(1000);
      const roles = [
        'contributor',
        'clerk',
        'council-member',
        'mayor',
        'admin',
      ];

      // Act
      const result = await performanceTestSuite.testRoleResolution(
        users,
        roles
      );

      // Assert
      expect(result.averageResolutionTime).toBeLessThan(50); // < 50ms
      expect(result.successRate).toBeGreaterThan(0.99); // > 99% success
    });
  });
});
```

### Compliance Testing

#### Permission Compliance Testing

```typescript
// tests/compliance/permissions/permission-compliance.test.ts
describe('Permission Compliance', () => {
  let complianceTestSuite: ComplianceTestSuite;

  beforeEach(() => {
    complianceTestSuite = new ComplianceTestSuite();
  });

  describe('Audit Trail Compliance', () => {
    it('should log all permission changes', async () => {
      // Arrange
      const permissionChanges = [
        { user: 'user1', action: 'grant', permission: 'read:records' },
        { user: 'user2', action: 'revoke', permission: 'write:records' },
        { user: 'user3', action: 'modify', permission: 'approve:records' },
      ];

      // Act
      const auditLogs = await Promise.all(
        permissionChanges.map((change) =>
          complianceTestSuite.testPermissionAuditLogging(change)
        )
      );

      // Assert
      auditLogs.forEach((log) => {
        expect(log.timestamp).toBeDefined();
        expect(log.user).toBeDefined();
        expect(log.action).toBeDefined();
        expect(log.permission).toBeDefined();
        expect(log.reason).toBeDefined();
      });
    });

    it('should maintain audit log integrity', async () => {
      // Arrange
      const auditLogs = await createTestPermissionAuditLogs(100);

      // Act
      const result =
        await complianceTestSuite.testPermissionAuditIntegrity(auditLogs);

      // Assert
      expect(result.passed).toBe(true);
      expect(result.tamperDetected).toBe(false);
      expect(result.hashValid).toBe(true);
    });
  });

  describe('Data Retention Compliance', () => {
    it('should comply with permission data retention policies', async () => {
      // Arrange
      const retentionPolicy = {
        permissionLogs: '7 years',
        roleAssignments: '3 years',
        approvalHistory: '5 years',
      };

      // Act
      const result =
        await complianceTestSuite.testPermissionDataRetention(retentionPolicy);

      // Assert
      expect(result.passed).toBe(true);
      expect(result.permissionLogsRetention).toBe(true);
      expect(result.roleAssignmentsRetention).toBe(true);
      expect(result.approvalHistoryRetention).toBe(true);
    });
  });
});
```

### CLI Testing

#### Permission CLI Testing

```typescript
// tests/cli/permissions/permission-cli.test.ts
describe('Permission CLI', () => {
  let cliTestSuite: CLITestSuite;

  beforeEach(() => {
    cliTestSuite = new CLITestSuite();
  });

  describe('Permission Management Commands', () => {
    it('should grant permissions via CLI', async () => {
      // Arrange
      const permissionData = {
        user: 'test-user',
        permission: 'read:records',
        resource: 'public',
      };

      // Act
      const result = await cliTestSuite.testGrantPermission(permissionData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.permissionGranted).toBe(true);
      expect(result.auditLogged).toBe(true);
    });

    it('should revoke permissions via CLI', async () => {
      // Arrange
      const permissionData = {
        user: 'test-user',
        permission: 'write:records',
        resource: 'drafts',
      };

      // Act
      const result = await cliTestSuite.testRevokePermission(permissionData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.permissionRevoked).toBe(true);
      expect(result.auditLogged).toBe(true);
    });

    it('should list user permissions via CLI', async () => {
      // Arrange
      const user = 'test-user';

      // Act
      const result = await cliTestSuite.testListPermissions(user);

      // Assert
      expect(result.success).toBe(true);
      expect(result.permissions).toBeDefined();
      expect(result.permissions.length).toBeGreaterThan(0);
    });
  });

  describe('Role Management Commands', () => {
    it('should assign roles via CLI', async () => {
      // Arrange
      const roleData = {
        user: 'test-user',
        role: 'clerk',
      };

      // Act
      const result = await cliTestSuite.testAssignRole(roleData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.roleAssigned).toBe(true);
      expect(result.permissionsUpdated).toBe(true);
    });

    it('should validate role assignments', async () => {
      // Arrange
      const invalidRoleData = {
        user: 'test-user',
        role: 'invalid-role',
      };

      // Act
      const result = await cliTestSuite.testAssignRole(invalidRoleData);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid role');
    });
  });
});
```

---

## 🛠️ Future Enhancements

- Role delegation (e.g. vacation override)
- Auth-bound enforcement (via future `auth.md`)
- Signature or notarization-based approval
- Role-based visibility filtering in dashboards

---

## 📅 History

- Drafted: 2025-07-03
- Updated: 2025-07-03
